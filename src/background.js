importScripts('shared.js');

var helper = self.NMAlbumHelper;
var TARGET_ALBUM_URL = 'https://music.163.com/#/wiki/album?albumId=0';
var STORAGE_KEYS = {
  draft: 'nm_album_helper_draft',
  settings: 'nm_album_helper_settings',
  workflow: 'nm_album_helper_workflow'
};

function nowIso() {
  return new Date().toISOString();
}

function defaultSettings() {
  return {
    discogsToken: '',
    referenceUrl: '',
    referenceNotes: ''
  };
}

async function getStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function readState() {
  var area = await getStorageArea();
  var state = await area.get([STORAGE_KEYS.draft, STORAGE_KEYS.settings, STORAGE_KEYS.workflow]);
  return {
    draft: state[STORAGE_KEYS.draft] || null,
    settings: state[STORAGE_KEYS.settings] || defaultSettings(),
    workflow: state[STORAGE_KEYS.workflow] || null
  };
}

async function writeState(partial) {
  var area = await getStorageArea();
  await area.set(partial);
}

function sanitizeFilenamePart(value) {
  return helper.normalizeSpaces(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferImageExtension(url) {
  var match = String(url || '').match(/\.([a-z0-9]{2,5})(?:[\?#].*)?$/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

function buildCoverFilename(draft) {
  var artist = sanitizeFilenamePart(draft && draft.artist);
  var title = sanitizeFilenamePart(draft && draft.title);
  var stem = [artist, title].filter(Boolean).join(' - ') || 'discogs-cover';
  return stem + ' cover.' + inferImageExtension(draft && draft.coverImage);
}

async function downloadCoverImage(draft) {
  if (!draft || !draft.coverImage) {
    return null;
  }
  return chrome.downloads.download({
    url: draft.coverImage,
    filename: buildCoverFilename(draft),
    saveAs: false,
    conflictAction: 'uniquify'
  });
}

async function fetchDiscogsRelease(parsed, settings, referenceNotes, introText) {
  var url = helper.buildDiscogsApiUrl(parsed, settings.discogsToken || '');
  var response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error('Discogs 请求失败: ' + response.status + ' ' + response.statusText);
  }
  var payload = await response.json();
  if (parsed.type === 'master' && payload.main_release) {
    var releaseResponse = await fetch(
      helper.buildDiscogsApiUrl({ type: 'release', id: payload.main_release }, settings.discogsToken || ''),
      { headers: { Accept: 'application/json' } }
    );
    if (releaseResponse.ok) {
      payload = await releaseResponse.json();
    }
  }
  var draft = helper.normalizeDiscogsRelease(payload, {
    sourceType: parsed.type,
    id: parsed.id,
    sourceUrl: parsed.url,
    referenceUrl: settings.referenceUrl || '',
    referenceNotes: referenceNotes,
    introText: introText || ''
  });
  draft.sourceRequestedAt = nowIso();
  draft.sourceRequestUrl = url;
  draft.sourceNotice = 'This application uses the Discogs API but is not affiliated with or endorsed by Discogs.';
  return draft;
}

async function importDiscogsIntoDraft(message, existingState) {
  var parsed = helper.parseDiscogsInput(message.url || '');
  if (!parsed.ok) {
    return { ok: false, error: parsed.reason };
  }
  var state = existingState || (await readState());
  var settings = Object.assign({}, state.settings || defaultSettings(), message.settings || {});
  settings.referenceUrl = helper.normalizeSpaces(message.referenceUrl || settings.referenceUrl || '');
  settings.referenceNotes = helper.normalizeSpaces(message.referenceNotes || settings.referenceNotes || '');
  await writeState({ [STORAGE_KEYS.settings]: settings });
  var draft = await fetchDiscogsRelease(
    parsed,
    settings,
    message.referenceNotes || settings.referenceNotes || '',
    message.introText || ''
  );
  await writeState({ [STORAGE_KEYS.draft]: draft });
  return { ok: true, draft: draft, settings: settings };
}

async function importSourceDraftIntoState(message) {
  var normalized = helper.normalizeSourceDraft(message.draft || {}, {
    source: message.source || (message.draft && message.draft.source) || 'web',
    sourceType: message.sourceType || 'page',
    sourceUrl: message.sourceUrl || (message.draft && message.draft.sourceUrl) || '',
    referenceUrl: message.referenceUrl || (message.draft && message.draft.referenceUrl) || '',
    referenceNotes: message.referenceNotes || (message.draft && message.draft.referenceNotes) || ''
  });
  await writeState({ [STORAGE_KEYS.draft]: normalized });
  return { ok: true, draft: normalized };
}

async function startQuickUpload(message) {
  var state = await readState();
  var imported = await importDiscogsIntoDraft(message, state);
  if (!imported.ok) {
    return imported;
  }

  var warnings = [];
  var downloadId = null;
  try {
    downloadId = await downloadCoverImage(imported.draft);
  } catch (error) {
    warnings.push('封面下载失败: ' + (error && error.message ? error.message : String(error)));
  }

  var tab = await chrome.tabs.create({
    url: TARGET_ALBUM_URL,
    active: true
  });

  await writeState({
    [STORAGE_KEYS.workflow]: {
      kind: 'quick-upload',
      targetUrl: TARGET_ALBUM_URL,
      targetTabId: tab && typeof tab.id === 'number' ? tab.id : null,
      draftImportedAt: imported.draft.importedAt,
      createdAt: nowIso(),
      autoFillPending: true,
      sourceUrl: imported.draft.sourceUrl || ''
    }
  });

  return {
    ok: true,
    draft: imported.draft,
    settings: imported.settings,
    downloadId: downloadId,
    targetTabId: tab && typeof tab.id === 'number' ? tab.id : null,
    warnings: warnings
  };
}

async function startQuickUploadFromDraft(message) {
  var imported = await importSourceDraftIntoState(message);
  if (!imported.ok) {
    return imported;
  }

  var warnings = [];
  var downloadId = null;
  try {
    downloadId = await downloadCoverImage(imported.draft);
  } catch (error) {
    warnings.push('封面下载失败: ' + (error && error.message ? error.message : String(error)));
  }

  var tab = await chrome.tabs.create({
    url: TARGET_ALBUM_URL,
    active: true
  });

  await writeState({
    [STORAGE_KEYS.workflow]: {
      kind: 'quick-upload',
      targetUrl: TARGET_ALBUM_URL,
      targetTabId: tab && typeof tab.id === 'number' ? tab.id : null,
      draftImportedAt: imported.draft.importedAt,
      createdAt: nowIso(),
      autoFillPending: true,
      sourceUrl: imported.draft.sourceUrl || ''
    }
  });

  return {
    ok: true,
    draft: imported.draft,
    downloadId: downloadId,
    targetTabId: tab && typeof tab.id === 'number' ? tab.id : null,
    warnings: warnings
  };
}

async function getPageBootstrap(pageUrl, tabId) {
  var state = await readState();
  var workflow = state.workflow;
  var shouldAutoFill =
    !!workflow &&
    workflow.autoFillPending === true &&
    /music\.163\.com/i.test(String(pageUrl || '')) &&
    (!workflow.targetTabId || workflow.targetTabId === tabId);

  return {
    ok: true,
    draft: state.draft || null,
    autoFill: shouldAutoFill,
    workflow: workflow
  };
}

chrome.runtime.onInstalled.addListener(async function () {
  var state = await readState();
  if (!state.settings) {
    await writeState({
      [STORAGE_KEYS.settings]: defaultSettings()
    });
  }
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) {
    return false;
  }

  (async function () {
    if (message.type === 'NM_GET_STATE') {
      sendResponse(await readState());
      return;
    }

    if (message.type === 'NM_GET_PAGE_BOOTSTRAP') {
      sendResponse(await getPageBootstrap(message.url, sender && sender.tab ? sender.tab.id : null));
      return;
    }

    if (message.type === 'NM_MARK_AUTOFILL_DONE') {
      await writeState({ [STORAGE_KEYS.workflow]: null });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'NM_SAVE_SETTINGS') {
      var current = await readState();
      var settings = Object.assign({}, current.settings || defaultSettings(), message.settings || {});
      await writeState({ [STORAGE_KEYS.settings]: settings });
      sendResponse({ ok: true, settings: settings });
      return;
    }

    if (message.type === 'NM_SAVE_DRAFT') {
      var draft = Object.assign({}, message.draft || {});
      draft.updatedAt = nowIso();
      await writeState({ [STORAGE_KEYS.draft]: draft });
      sendResponse({ ok: true, draft: draft });
      return;
    }

    if (message.type === 'NM_CLEAR_DRAFT') {
      await writeState({
        [STORAGE_KEYS.draft]: null,
        [STORAGE_KEYS.workflow]: null
      });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'NM_IMPORT_DISCOGS') {
      sendResponse(await importDiscogsIntoDraft(message));
      return;
    }

    if (message.type === 'NM_IMPORT_DISCOGS_AND_OPEN') {
      sendResponse(await startQuickUpload(message));
      return;
    }

    if (message.type === 'NM_IMPORT_SOURCE_DRAFT_AND_OPEN') {
      sendResponse(await startQuickUploadFromDraft(message));
      return;
    }

    sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE' });
  })().catch(function (error) {
    sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
  });

  return true;
});

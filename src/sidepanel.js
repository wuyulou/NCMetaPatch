(function () {
  var TARGET_ALBUM_URL = 'https://music.163.com/#/wiki/album?albumId=0';
  var helper = window.NMAlbumHelper;
  var previewEl = document.getElementById('draft-preview');
  var summaryEl = document.getElementById('draft-summary');
  var logEl = document.getElementById('log');
  var openButton = document.getElementById('open-target-page');
  var fillButton = document.getElementById('fill-page');
  var copyButton = document.getElementById('copy-summary');
  var clearButton = document.getElementById('clear-draft');
  var scanButton = document.getElementById('scan-page');
  var currentDraft = null;

  function log(message, kind) {
    var line = document.createElement('div');
    line.className = kind ? 'nm-status-' + kind : '';
    line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
    logEl.prepend(line);
  }

  function isTargetPageUrl(url) {
    var value = String(url || '');
    if (!/music\.163\.com/i.test(value)) {
      return false;
    }
    return /\/#?\/?wiki\/album/i.test(value) || /#\/st\/wiki\/album/i.test(value) || /targetUrl=.*wiki%2Falbum/i.test(value);
  }

  async function getActiveTab() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function ensureContentScript(tab) {
    if (!tab || typeof tab.id !== 'number' || !isTargetPageUrl(tab.url)) {
      return false;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'NM_PING' });
      return true;
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/shared.js', 'src/content.js']
      });
      await delay(50);
      return true;
    }
  }

  async function sendPageMessage(message) {
    var tab = await getActiveTab();
    if (!tab || typeof tab.id !== 'number') {
      throw new Error('找不到当前页面标签。');
    }
    if (!isTargetPageUrl(tab.url)) {
      throw new Error('请先切换到网易云专辑补充页，再执行此操作。');
    }
    try {
      await ensureContentScript(tab);
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      var text = error && error.message ? error.message : String(error);
      if (/Receiving end does not exist|Could not establish connection/i.test(text)) {
        throw new Error('页面内容脚本还没准备好，请刷新网易云补充页后重试。');
      }
      throw error;
    }
  }

  function setSummary(draft) {
    currentDraft = draft || null;
    summaryEl.textContent = helper.serializeDraftSummary(draft);
    previewEl.innerHTML = helper.renderDraftPreviewHtml(draft);
  }

  async function refreshState() {
    var state = await chrome.runtime.sendMessage({ type: 'NM_GET_STATE' });
    if (state && state.draft) {
      setSummary(state.draft);
      log('已加载当前草稿。', 'ok');
      return;
    }
    if (!currentDraft) {
      setSummary(null);
    }
  }

  async function openTargetPage() {
    await chrome.tabs.create({
      url: TARGET_ALBUM_URL,
      active: true
    });
    log('已打开网易云专辑补充页。', 'ok');
  }

  async function fillCurrentPage() {
    if (!currentDraft) {
      throw new Error('请先从来源页面导入草稿。');
    }
    var response = await sendPageMessage({
      type: 'NM_FILL_DRAFT',
      draft: currentDraft
    });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || '填充失败');
    }
    log('已回填页面，命中字段: ' + ((response.filledRoles || []).join(', ') || '无'), 'ok');
  }

  async function scanPage() {
    var response = await sendPageMessage({ type: 'NM_SCAN_PAGE' });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || '扫描失败');
    }
    log('页面扫描完成，识别到 ' + response.controlCount + ' 个控件。', 'ok');
  }

  async function copySummary() {
    if (!currentDraft) {
      throw new Error('没有可复制的草稿。');
    }
    await navigator.clipboard.writeText(helper.serializeDraftSummary(currentDraft));
    log('草稿摘要已复制。', 'ok');
  }

  async function clearDraft() {
    await chrome.runtime.sendMessage({ type: 'NM_CLEAR_DRAFT' });
    currentDraft = null;
    setSummary(null);
    log('草稿已清空。', 'warn');
  }

  openButton.addEventListener('click', function () {
    openTargetPage().catch(function (error) {
      log(error && error.message ? error.message : String(error), 'error');
    });
  });

  fillButton.addEventListener('click', function () {
    fillCurrentPage().catch(function (error) {
      log(error && error.message ? error.message : String(error), 'error');
    });
  });

  copyButton.addEventListener('click', function () {
    copySummary().catch(function (error) {
      log(error && error.message ? error.message : String(error), 'error');
    });
  });

  clearButton.addEventListener('click', function () {
    clearDraft().catch(function (error) {
      log(error && error.message ? error.message : String(error), 'error');
    });
  });

  scanButton.addEventListener('click', function () {
    scanPage().catch(function (error) {
      log(error && error.message ? error.message : String(error), 'error');
    });
  });

  refreshState().catch(function (error) {
    log(error && error.message ? error.message : String(error), 'error');
  });
})();

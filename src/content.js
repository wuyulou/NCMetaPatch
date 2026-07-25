(function () {
  if (window.__NMAlbumHelperContentScriptLoaded) {
    return;
  }
  window.__NMAlbumHelperContentScriptLoaded = true;

  var helper = window.NMAlbumHelper;
  var root;
  var panelVisible = true;
  var lastScan = null;
  var autoFillTimer = null;
  var autoFillAttempts = 0;
  var panelState = { draft: null };

  function isTargetPage() {
    var href = location.href;
    return (
      location.hostname === 'music.163.com' &&
      (/\/\#?\/?wiki\/album/i.test(href) || /#\/st\/wiki\/album/i.test(href) || /targetUrl=.*wiki%2Falbum/i.test(href))
    );
  }

  function ensureRoot() {
    if (root) {
      return root;
    }
    root = document.getElementById('nm-album-helper-root');
    if (root) {
      return root;
    }

    root = document.createElement('div');
    root.id = 'nm-album-helper-root';
    root.innerHTML =
      '<button class="nm-fab" id="nm-toggle">网易云补充助手</button>' +
      '<div class="nm-panel" id="nm-panel" style="display:none;">' +
      '<h3>NCMetaPatch</h3>' +
      '<p id="nm-page-state">点击左下角按钮采集资料、下载封面并打开网易云补充页。</p>' +
      '<div class="nm-row">' +
      '<button class="primary" data-action="scan">扫描页面</button>' +
      '<button data-action="fill">填充草稿</button>' +
      '</div>' +
      '<div class="nm-mini" id="nm-mini"></div>' +
      '</div>';

    document.documentElement.appendChild(root);

    root.querySelector('#nm-toggle').addEventListener('click', function () {
      panelVisible = !panelVisible;
      renderPanel();
    });

    root.querySelector('#nm-panel').addEventListener('click', function (event) {
      var action = event.target && event.target.getAttribute('data-action');
      if (!action) {
        return;
      }
      event.preventDefault();
      if (action === 'scan') {
        scanPage(false);
      } else if (action === 'fill') {
        fillDraft(false);
      }
    });

    return root;
  }

  function renderPanel() {
    if (!root) {
      return;
    }
    root.querySelector('#nm-panel').style.display = panelVisible ? 'block' : 'none';
  }

  function getPageStateText(scan) {
    if (!isTargetPage()) {
      return '当前不是网易云专辑补充页。';
    }
    if (!scan) {
      return '助手已注入，尚未扫描表单。';
    }
    return (
      '识别到 ' +
      scan.controlCount +
      ' 个控件，来自 ' +
      scan.frameCount +
      ' 个 frame，匹配到 ' +
      scan.matchedRoles.length +
      ' 个字段。'
    );
  }

  function updateMiniText(scan) {
    if (!ensureRoot()) {
      return;
    }
    var extra = scan ? '\n\n页面控件: ' + scan.controlCount : '';
    ensureRoot().querySelector('#nm-mini').textContent = helper.serializeDraftSummary(panelState.draft) + extra;
  }

  function scanPage() {
    var controls = helper.scanControls(document);
    var frameUrls = [];
    controls.forEach(function (control) {
      if (control.frameUrl && frameUrls.indexOf(control.frameUrl) === -1) {
        frameUrls.push(control.frameUrl);
      }
    });

    var summary = {
      controlCount: controls.length,
      frameCount: frameUrls.length || 1,
      controls: controls,
      matchedRoles: helper.planAssignments(panelState.draft || {}, controls).map(function (item) {
        return item.role;
      })
    };

    lastScan = summary;
    ensureRoot().querySelector('#nm-page-state').textContent = getPageStateText(summary);
    updateMiniText(summary);
    return summary;
  }

  function markElement(meta, className, title) {
    if (!meta || !meta.element) {
      return;
    }
    meta.element.classList.add(className);
    if (title) {
      meta.element.setAttribute('title', title);
    }
  }

  function fillDraft(silent) {
    if (!panelState.draft) {
      return { ok: false, error: 'NO_DRAFT' };
    }

    var controls = (lastScan && lastScan.controls) || helper.scanControls(document);
    var result = helper.fillDraftIntoControls(panelState.draft, controls);
    var filledRoles = result.results.map(function (item) {
      return item.role;
    });

    result.assignments.forEach(function (assignment) {
      markElement(assignment.meta, 'nm-highlight-filled', '已填充');
    });

    if (!silent) {
      ensureRoot().querySelector('#nm-page-state').textContent = filledRoles.length
        ? '已填充字段: ' + filledRoles.join(', ')
        : '没有找到可填充字段，请先扫描页面。';
    }

    return {
      ok: true,
      filledRoles: filledRoles
    };
  }

  function syncDraftFromMessage(draft) {
    panelState.draft = draft || null;
    if (!ensureRoot()) {
      return;
    }
    ensureRoot().querySelector('#nm-page-state').textContent = getPageStateText(lastScan);
    updateMiniText(lastScan);
  }

  function scheduleAutoFill() {
    if (autoFillTimer) {
      clearTimeout(autoFillTimer);
    }
    autoFillAttempts = 0;

    function attempt() {
      autoFillAttempts += 1;
      var scan = scanPage(true);
      var response = fillDraft(true);

      if (response.ok && response.filledRoles && response.filledRoles.length) {
        ensureRoot().querySelector('#nm-page-state').textContent = '已自动填充字段: ' + response.filledRoles.join(', ');
        chrome.runtime.sendMessage({ type: 'NM_MARK_AUTOFILL_DONE' }).catch(function () {});
        autoFillTimer = null;
        return;
      }

      if (autoFillAttempts < 12 && scan.controlCount < 3) {
        autoFillTimer = setTimeout(attempt, 500);
        return;
      }

      if (autoFillAttempts < 12 && (!response.filledRoles || !response.filledRoles.length)) {
        autoFillTimer = setTimeout(attempt, 500);
        return;
      }

      ensureRoot().querySelector('#nm-page-state').textContent = '自动填充未命中字字段，请手动点击“扫描页面”后再试。';
      autoFillTimer = null;
    }

    autoFillTimer = setTimeout(attempt, 300);
  }

  function bootstrapFromBackground() {
    chrome.runtime
      .sendMessage({
        type: 'NM_GET_PAGE_BOOTSTRAP',
        url: location.href
      })
      .then(function (response) {
        if (!response || !response.ok) {
          return;
        }
        if (response.draft) {
          syncDraftFromMessage(response.draft);
        }
        if (response.autoFill && response.draft) {
          scheduleAutoFill();
        }
      })
      .catch(function () {});
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === 'NM_PING') {
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'NM_FILL_DRAFT') {
      syncDraftFromMessage(message.draft);
      try {
        sendResponse(fillDraft(false));
      } catch (error) {
        sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
      }
      return true;
    }

    if (message.type === 'NM_SCAN_PAGE') {
      try {
        var scan = scanPage(false);
        sendResponse({
          ok: true,
          controlCount: scan.controlCount,
          matchedRoles: scan.matchedRoles
        });
      } catch (error2) {
        sendResponse({ ok: false, error: error2 && error2.message ? error2.message : String(error2) });
      }
      return true;
    }

    if (message.type === 'NM_SET_DRAFT') {
      syncDraftFromMessage(message.draft);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  function observeLocation() {
    var lastHref = location.href;

    function tick() {
      if (location.href !== lastHref) {
        lastHref = location.href;
        if (!isTargetPage()) {
          return;
        }
        ensureRoot();
        scanPage(true);
        bootstrapFromBackground();
      }
    }

    window.addEventListener('hashchange', tick);
    window.addEventListener('popstate', tick);

    var observer = new MutationObserver(function () {
      tick();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    if (!isTargetPage()) {
      return;
    }
    ensureRoot();
    renderPanel();
    scanPage(true);
    bootstrapFromBackground();
    observeLocation();
  }

  init();
})();

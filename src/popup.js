(function () {
  var statusEl = document.getElementById('popup-status');
  var openButton = document.getElementById('open-sidepanel');
  var refreshButton = document.getElementById('refresh-status');

  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = 'nm-status' + (kind ? ' nm-status-' + kind : '');
  }

  async function loadState() {
    var state = await chrome.runtime.sendMessage({ type: 'NM_GET_STATE' });
    if (state && state.draft) {
      setStatus('当前草稿: ' + (state.draft.title || '未命名') + ' / ' + (state.draft.artist || '未知艺人'), 'ok');
    } else {
      setStatus('当前没有保存的草稿。', 'warn');
    }
  }

  openButton.addEventListener('click', async function () {
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      var tabId = tabs[0] && tabs[0].id;
      if (typeof tabId === 'number') {
        await chrome.sidePanel.open({ tabId: tabId });
        setStatus('侧边栏已打开。', 'ok');
      } else {
        setStatus('无法识别当前标签页。', 'error');
      }
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), 'error');
    }
  });

  refreshButton.addEventListener('click', function () {
    loadState().catch(function (error) {
      setStatus(error && error.message ? error.message : String(error), 'error');
    });
  });

  loadState().catch(function (error) {
    setStatus(error && error.message ? error.message : String(error), 'error');
  });
})();

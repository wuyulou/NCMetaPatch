(function () {
  if (window.__NMAlbumHelperDiscogsScriptLoaded) {
    return;
  }
  window.__NMAlbumHelperDiscogsScriptLoaded = true;

  function isDiscogsReleasePage() {
    return location.hostname.indexOf('discogs.com') !== -1 && /\/(release|master)\//i.test(location.href);
  }

  function ensureRoot() {
    var root = document.getElementById('nm-discogs-helper-root');
    if (root) {
      return root;
    }
    root = document.createElement('div');
    root.id = 'nm-discogs-helper-root';
    root.innerHTML =
      '<button id="nm-discogs-quick-upload" class="nm-discogs-quick-upload">补充到网易云</button>' +
      '<div id="nm-discogs-quick-status" class="nm-discogs-quick-status"></div>';
    document.documentElement.appendChild(root);
    return root;
  }

  function setStatus(message, kind) {
    var root = ensureRoot();
    var status = root.querySelector('#nm-discogs-quick-status');
    var button = root.querySelector('#nm-discogs-quick-upload');
    status.textContent = message || '';
    status.className = 'nm-discogs-quick-status' + (kind ? ' ' + kind : '');
    if (message) {
      button.setAttribute('title', message);
    } else {
      button.removeAttribute('title');
    }
  }

  function setBusy(busy) {
    var button = ensureRoot().querySelector('#nm-discogs-quick-upload');
    button.disabled = !!busy;
    button.textContent = busy ? '处理中...' : '补充到网易云';
  }

  function bindUpload() {
    ensureRoot().querySelector('#nm-discogs-quick-upload').addEventListener('click', function () {
      setBusy(true);
      setStatus('正在采集当前 Discogs 专辑，稍后会自动跳转到网易云补充页。', 'ok');
      chrome.runtime
        .sendMessage({
          type: 'NM_IMPORT_DISCOGS_AND_OPEN',
          url: location.href
        })
        .then(function (response) {
          if (!response || !response.ok) {
            throw new Error((response && response.error) || '快速补充失败');
          }
          var suffix = response.downloadId ? '封面已开始下载。' : '未检测到可下载封面。';
          setStatus('已导入并跳转。' + suffix, 'ok');
          if (response.warnings && response.warnings.length) {
            setStatus('已导入并跳转。' + response.warnings.join(' '), 'warn');
          }
        })
        .catch(function (error) {
          setStatus(error && error.message ? error.message : String(error), 'error');
        })
        .finally(function () {
          setBusy(false);
        });
    });
  }

  function init() {
    if (!isDiscogsReleasePage()) {
      return;
    }
    ensureRoot();
    bindUpload();
  }

  init();
})();

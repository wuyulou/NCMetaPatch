(function () {
  if (window.__NMAlbumHelperSourceScriptLoaded) {
    return;
  }
  window.__NMAlbumHelperSourceScriptLoaded = true;

  var helper = window.NMAlbumHelper;

  function getSourceKind() {
    var host = location.hostname.toLowerCase();
    if (host.indexOf('discogs.com') !== -1 && /\/(release|master)\//i.test(location.href)) {
      return 'discogs';
    }
    if (host.indexOf('bandcamp.com') !== -1) {
      return 'bandcamp';
    }
    if (host.indexOf('rateyourmusic.com') !== -1 && /\/release\//i.test(location.href)) {
      return 'rym';
    }
    return '';
  }

  function ensureRoot() {
    var root = document.getElementById('nm-discogs-helper-root');
    if (root) {
      return root;
    }
    root = document.createElement('div');
    root.id = 'nm-discogs-helper-root';
    var iconUrl = chrome.runtime.getURL('assets/icons/icon-32.png');
    root.innerHTML =
      '<button id="nm-discogs-quick-upload" class="nm-discogs-quick-upload">' +
      '<img class="nm-discogs-quick-logo" src="' + iconUrl + '" alt="" />' +
      '<span class="nm-discogs-quick-label">补充到网易云</span>' +
      '</button>' +
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
    var label = button.querySelector('.nm-discogs-quick-label');
    button.disabled = !!busy;
    label.textContent = busy ? '处理中...' : '补充到网易云';
  }

  function textContent(selector) {
    var node = document.querySelector(selector);
    return helper.normalizeSpaces(node && node.textContent);
  }

  function metaContent(selector) {
    var node = document.querySelector(selector);
    return helper.normalizeSpaces(node && node.getAttribute('content'));
  }

  function parseJsonLd() {
    var scripts = Array.prototype.slice.call(document.querySelectorAll('script[type="application/ld+json"]'));
    var items = [];
    scripts.forEach(function (script) {
      var raw = helper.normalizeSpaces(script.textContent);
      if (!raw) {
        return;
      }
      try {
        var parsed = JSON.parse(script.textContent);
        if (Array.isArray(parsed)) {
          items = items.concat(parsed);
        } else {
          items.push(parsed);
        }
      } catch (error) {
        // Ignore malformed JSON-LD blocks.
      }
    });
    return items;
  }

  function findMusicAlbumObject(items) {
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var type = item && item['@type'];
      var list = Array.isArray(type) ? type : [type];
      if (list.some(function (entry) { return /MusicAlbum|MusicRelease|Album/i.test(String(entry || '')); })) {
        return item;
      }
      if (item && item['@graph']) {
        var nested = findMusicAlbumObject(item['@graph']);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  }

  function collectArtistNames(value) {
    var raw = Array.isArray(value) ? value : [value];
    return raw
      .map(function (entry) {
        if (!entry) return '';
        if (typeof entry === 'string') return helper.cleanArtistName(entry);
        return helper.cleanArtistName(entry.name || entry['@name'] || entry.title || '');
      })
      .filter(Boolean);
  }

  function textBetweenMarkers(rawText, startPattern, endPattern) {
    var source = String(rawText || '');
    if (!source) {
      return '';
    }
    var match = source.match(new RegExp(startPattern.source + '([\\s\\S]*?)' + endPattern.source, 'i'));
    return helper.normalizeSpaces(match && match[1]);
  }

  function collectDiscogsSupplementText() {
    var main = document.querySelector('#page_content, main, #content, .body');
    var rawText = (main && main.innerText) || document.body.innerText || '';
    var betweenText = textBetweenMarkers(rawText, /Companies,\s*etc\.?/i, /Barcode and Other Identifiers/i);
    if (betweenText) {
      return 'Companies, etc. ' + betweenText;
    }

    var headingCandidates = Array.prototype.slice.call(
      document.querySelectorAll('h1, h2, h3, h4, h5, .heading, .section-heading, .head')
    );
    var companiesHeading = headingCandidates.find(function (node) {
      return /Companies,\s*etc\.?/i.test(helper.normalizeSpaces(node.textContent));
    });
    if (!companiesHeading) {
      return '';
    }
    var pieces = [];
    var node = companiesHeading;
    while (node && node.nextElementSibling) {
      node = node.nextElementSibling;
      var text = helper.normalizeSpaces(node.innerText || node.textContent);
      if (!text) {
        continue;
      }
      if (/Barcode and Other Identifiers/i.test(text)) {
        break;
      }
      pieces.push(text);
    }
    var sectionText = helper.uniqueList(pieces).join('\n');
    return sectionText ? 'Companies, etc. ' + sectionText : '';
  }

  function collectBandcampInfoText() {
    var infoNodes = Array.prototype.slice.call(
      document.querySelectorAll('.tralbumData, .tralbumData.tralbum-credits, .tralbum-about, #bio-text')
    );
    var combined = helper.uniqueList(
      infoNodes
        .map(function (node) {
          return helper.normalizeSpaces(node && node.textContent);
        })
        .filter(Boolean)
    ).join('\n');
    if (!combined) {
      return '';
    }
    var stopMatch = combined.match(/([\s\S]*?all rights reserved)/i);
    return helper.normalizeSpaces(stopMatch ? stopMatch[1] : combined);
  }

  function scrapeBandcampDraft() {
    var jsonLd = findMusicAlbumObject(parseJsonLd()) || {};
    var title =
      helper.normalizeSpaces(jsonLd.name) ||
      textContent('#name-section .trackTitle') ||
      metaContent('meta[property="og:title"]');
    var artists =
      collectArtistNames(jsonLd.byArtist) ||
      [];
    if (!artists.length) {
      var bandcampArtist = textContent('#name-section span[itemprop="byArtist"] a') || textContent('#name-section .artist a');
      if (bandcampArtist) {
        artists = [helper.cleanArtistName(bandcampArtist)];
      }
    }
    var bodyReleaseMatch = document.body && document.body.innerText
      ? document.body.innerText.match(/released\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)
      : null;
    var releaseDate =
      helper.normalizeSpaces(jsonLd.datePublished) ||
      helper.normalizeSpaces(textContent('.tralbumData.tralbum-credits')) ||
      helper.normalizeSpaces(bodyReleaseMatch && bodyReleaseMatch[1]);
    var trackNodes = Array.prototype.slice.call(document.querySelectorAll('.track_list .track_row_view'));
    var tracklist = trackNodes.map(function (node, index) {
      return {
        position: String(index + 1),
        title: helper.normalizeSpaces(
          (node.querySelector('.track-title') && node.querySelector('.track-title').textContent) ||
          (node.querySelector('.title') && node.querySelector('.title').textContent)
        ),
        duration: helper.normalizeSpaces(
          (node.querySelector('.time') && node.querySelector('.time').textContent) || ''
        )
      };
    }).filter(function (track) {
      return track.title;
    });
    if (!tracklist.length && Array.isArray(jsonLd.track)) {
      tracklist = jsonLd.track.map(function (track, index) {
        return {
          position: String(index + 1),
          title: helper.normalizeSpaces(track && track.name),
          duration: ''
        };
      }).filter(function (track) {
        return track.title;
      });
    }

    var descriptionText =
      textContent('.tralbum-about') ||
      textContent('#bio-text') ||
      metaContent('meta[property="og:description"]');
    var infoText = collectBandcampInfoText();
    var introText = [descriptionText, infoText]
      .map(helper.normalizeSpaces)
      .filter(Boolean)
      .join('\n\n');

    return {
      source: 'bandcamp',
      sourceUrl: location.href,
      title: title,
      artists: artists,
      releaseDate: typeof releaseDate === 'string' ? releaseDate : '',
      tracklist: tracklist,
      coverImage: metaContent('meta[property="og:image"]'),
      introText: introText,
      label: 'Self-Released',
      sourceLabel: title
    };
  }

  function scrapeRymDraft() {
    var jsonLd = findMusicAlbumObject(parseJsonLd()) || {};
    var ogTitle = metaContent('meta[property="og:title"]');
    var pageTitle = helper.normalizeSpaces(document.title).replace(/\s*-\s*Rate Your Music.*$/i, '');
    var title = helper.normalizeSpaces(jsonLd.name);
    var artists = collectArtistNames(jsonLd.byArtist);

    if ((!title || !artists.length) && ogTitle) {
      var byMatch = ogTitle.match(/^(.*?)\s+by\s+(.*)$/i);
      if (byMatch) {
        title = title || helper.normalizeSpaces(byMatch[1]);
        if (!artists.length) {
          artists = [helper.cleanArtistName(byMatch[2])];
        }
      } else if (ogTitle.indexOf(' - ') !== -1) {
        var parts = ogTitle.split(' - ');
        if (parts.length >= 2) {
          artists = artists.length ? artists : [helper.cleanArtistName(parts[0])];
          title = title || helper.normalizeSpaces(parts.slice(1).join(' - '));
        }
      }
    }

    if (!title) {
      var heading = textContent('h1');
      if (heading && pageTitle && pageTitle.indexOf(heading) === -1) {
        title = heading;
      } else {
        title = pageTitle;
      }
    }

    var bodyText = helper.normalizeSpaces(document.body && document.body.innerText);
    var releaseDate =
      helper.normalizeSpaces(jsonLd.datePublished) ||
      (bodyText.match(/released?\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{4})/i) || [])[1] ||
      '';
    var tracklist = [];
    var trackRows = Array.prototype.slice.call(document.querySelectorAll('[data-track-number], .tracklist li, .tracklist .track'));
    trackRows.forEach(function (node, index) {
      var titleText = helper.normalizeSpaces(node.textContent);
      if (titleText) {
        tracklist.push({
          position: String(index + 1),
          title: titleText.replace(/^\d+\.?\s*/, ''),
          duration: ''
        });
      }
    });
    if (!tracklist.length && Array.isArray(jsonLd.track)) {
      tracklist = jsonLd.track.map(function (track, index) {
        return {
          position: String(index + 1),
          title: helper.normalizeSpaces(track && track.name),
          duration: ''
        };
      }).filter(function (track) {
        return track.title;
      });
    }

    return {
      source: 'rym',
      sourceUrl: location.href,
      referenceUrl: location.href,
      title: title,
      artists: artists,
      releaseDate: releaseDate,
      tracklist: tracklist,
      coverImage: metaContent('meta[property="og:image"]'),
      introText: metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]'),
      sourceLabel: title
    };
  }

  function sendUpload() {
    var source = getSourceKind();
    if (source === 'discogs') {
      return chrome.runtime.sendMessage({
        type: 'NM_IMPORT_DISCOGS_AND_OPEN',
        url: location.href,
        introText: collectDiscogsSupplementText()
      });
    }

    var draft = source === 'bandcamp' ? scrapeBandcampDraft() : scrapeRymDraft();
    return chrome.runtime.sendMessage({
      type: 'NM_IMPORT_SOURCE_DRAFT_AND_OPEN',
      source: source,
      sourceUrl: location.href,
      draft: draft
    });
  }

  function bindUpload() {
    ensureRoot().querySelector('#nm-discogs-quick-upload').addEventListener('click', function () {
      var source = getSourceKind();
      setBusy(true);
      setStatus('正在采集当前 ' + source.toUpperCase() + ' 专辑，稍后会自动跳转到网易云补充页。', 'ok');
      sendUpload()
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
    if (!getSourceKind()) {
      return;
    }
    ensureRoot();
    bindUpload();
  }

  init();
})();

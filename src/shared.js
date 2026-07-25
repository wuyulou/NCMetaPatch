(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.NMAlbumHelper = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var DISCogs_RELEASE_RE = /discogs\.com\/(?:release|master)\/(\d+)/i;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeSpaces(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function uniqueList(list) {
    var seen = Object.create(null);
    return list.filter(function (item) {
      var key = String(item);
      if (seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function toArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function pad2(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) {
      return '';
    }
    return String(num).padStart(2, '0');
  }

  function extractFirstUrl(text) {
    var value = normalizeSpaces(text);
    var match = value.match(/https?:\/\/[^\s"'<>）)]+/i);
    return match ? match[0] : '';
  }

  function extractUrls(text) {
    var value = normalizeSpaces(text);
    var matches = value.match(/https?:\/\/[^\s"'<>）)]+/ig);
    return matches ? uniqueList(matches) : [];
  }

  function stripSiteSuffix(value) {
    return normalizeSpaces(value)
      .replace(/\s*-\s*RYM\/Sonemic\s*$/i, '')
      .replace(/\s*-\s*Rate Your Music\s*$/i, '')
      .trim();
  }

  function cleanArtistName(value) {
    return stripSiteSuffix(value)
      .replace(/\s*[\(（]\d+[\)）]\s*$/g, '')
      .trim();
  }

  function cleanTitleText(value) {
    return stripSiteSuffix(value);
  }

  function sourceLabelText(source) {
    var value = normalizeSpaces(source).toLowerCase();
    if (!value) return 'Source';
    if (value === 'rym') return 'RYM';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function isValidDateParts(year, month, day) {
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return false;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return false;
    }
    var date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  function buildDateResult(year, month, day, precision) {
    if (!year) {
      return null;
    }
    var safeMonth = month || 1;
    var safeDay = day || 1;
    return {
      year: year,
      month: safeMonth,
      day: safeDay,
      precision: precision || (day ? 'day' : month ? 'month' : 'year'),
      monthLabel: safeMonth + '月',
      dayLabel: String(safeDay),
      display: year + '年' + safeMonth + '月' + safeDay + '日',
      iso: year + '-' + pad2(safeMonth) + '-' + pad2(safeDay)
    };
  }

  function monthNameToNumber(value) {
    var months = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12
    };
    var normalized = String(value || '').toLowerCase();
    if (months[normalized]) {
      return months[normalized];
    }
    var key = Object.keys(months).find(function (month) {
      return month.indexOf(normalized) === 0;
    });
    return key ? months[key] : 0;
  }

  function inferReleaseTypeFromText(value, sourceUrl) {
    var text = normalizeSpaces(value).toLowerCase();
    var url = normalizeSpaces(sourceUrl).toLowerCase();
    if (/\bep\b/.test(text)) {
      return 'EP';
    }
    if (/\bsingle\b/.test(text) || /\/track\//.test(url)) {
      return '单曲';
    }
    if (/\bcompilation\b|\bcollection\b|\bgreatest hits\b|\bbest of\b|\banthology\b|精选|合集|合辑/.test(text)) {
      return '合辑';
    }
    if (/\blive\b|现场/.test(text)) {
      return '现场';
    }
    if (/\balbum\b|专辑|\/album\//.test(text) || /an album by/i.test(String(value || ''))) {
      return '专辑';
    }
    return '';
  }

  function inferLabelFromText(value) {
    var text = normalizeSpaces(value);
    if (!text) {
      return '';
    }
    if (/self[-\s]?released/i.test(text)) {
      return 'Self-Released';
    }
    var patterns = [
      /\bReleased\s+.+?\s+on\s+([^.;,(]+?)(?:\s*\(|;|\.|,|$)/i,
      /\bon\s+([^.;,(]+?)(?:\s*\(|;|\.|,|$)/i,
      /\bby\s+([^.;,(]+?)(?:\s*\(|;|\.|,|$)/i
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      var match = text.match(patterns[i]);
      if (match && match[1]) {
        var label = cleanTitleText(match[1]);
        if (label && !/album by|released/i.test(label.toLowerCase())) {
          return label;
        }
      }
    }
    return '';
  }

  function parseFlexibleDate(value) {
    var text = normalizeSpaces(value);
    if (!text) {
      return null;
    }

    var specificPatterns = [
      /(\d{4})\s*[-\/\.年]\s*(\d{1,2})\s*[-\/\.月]\s*(\d{1,2})(?:日|号)?/,
      /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})(?:日|号)?/,
      /(\d{4})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{1,2})/,
      /(\d{4})\s*年\s*(\d{1,2})\s*[-\/\.]\s*(\d{1,2})/
    ];
    for (var i = 0; i < specificPatterns.length; i += 1) {
      var match = text.match(specificPatterns[i]);
      if (!match) {
        continue;
      }
      var year = Number(match[1]);
      var month = Number(match[2]);
      var day = Number(match[3]);
      if (isValidDateParts(year, month, day)) {
        return buildDateResult(year, month, day, 'day');
      }
    }

    var englishDayMatch = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/);
    if (englishDayMatch) {
      var englishMonth = monthNameToNumber(englishDayMatch[1]);
      var englishDay = Number(englishDayMatch[2]);
      var englishYear = Number(englishDayMatch[3]);
      if (isValidDateParts(englishYear, englishMonth, englishDay)) {
        return buildDateResult(englishYear, englishMonth, englishDay, 'day');
      }
    }

    var englishDayMonthYearMatch = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
    if (englishDayMonthYearMatch) {
      var dayFirstDay = Number(englishDayMonthYearMatch[1]);
      var dayFirstMonth = monthNameToNumber(englishDayMonthYearMatch[2]);
      var dayFirstYear = Number(englishDayMonthYearMatch[3]);
      if (isValidDateParts(dayFirstYear, dayFirstMonth, dayFirstDay)) {
        return buildDateResult(dayFirstYear, dayFirstMonth, dayFirstDay, 'day');
      }
    }

    var englishMonthMatch = text.match(/\b([A-Za-z]+)\s+(\d{4})\b/);
    if (englishMonthMatch) {
      var monthOnly = monthNameToNumber(englishMonthMatch[1]);
      var monthOnlyYear = Number(englishMonthMatch[2]);
      if (monthOnly && monthOnlyYear) {
        return buildDateResult(monthOnlyYear, monthOnly, 1, 'month');
      }
    }

    var monthPatterns = [
      /(\d{4})\s*[-\/\.年]\s*(\d{1,2})(?:月)?/,
      /(\d{4})\s*年\s*(\d{1,2})\s*月/
    ];
    for (var j = 0; j < monthPatterns.length; j += 1) {
      var monthMatch = text.match(monthPatterns[j]);
      if (!monthMatch) {
        continue;
      }
      var monthYear = Number(monthMatch[1]);
      var monthValue = Number(monthMatch[2]);
      if (monthYear && monthValue >= 1 && monthValue <= 12) {
        return buildDateResult(monthYear, monthValue, 1, 'month');
      }
    }

    var yearMatches = text.match(/\b(\d{4})\b/g);
    if (yearMatches && yearMatches.length === 1 && !/[-~–—至到]/.test(text)) {
      var yearOnly = Number(yearMatches[0]);
      if (yearOnly) {
        return buildDateResult(yearOnly, 1, 1, 'year');
      }
    }

    return null;
  }

  function chooseBetterDate(current, candidate) {
    if (!candidate) {
      return current;
    }
    if (!current) {
      return candidate;
    }
    var precisionOrder = { year: 1, month: 2, day: 3 };
    var currentScore = precisionOrder[current.precision] || 0;
    var candidateScore = precisionOrder[candidate.precision] || 0;
    if (candidateScore > currentScore) {
      return candidate;
    }
    return current;
  }

  function deriveReleaseDate(payload, options) {
    options = options || {};
    var sources = [
      options.referenceNotes,
      options.releaseDate,
      options.introText,
      payload && payload.notes,
      payload && payload.released_formatted,
      payload && payload.released,
      payload && payload.year
    ];
    var best = null;
    sources.forEach(function (source) {
      best = chooseBetterDate(best, parseFlexibleDate(source));
    });
    return best;
  }

  function formatReleaseType(formats) {
    var text = toArray(formats)
      .map(function (format) {
        return normalizeSpaces(
          [format && format.name]
            .concat(toArray(format && format.descriptions))
            .filter(Boolean)
            .join(' ')
        );
      })
      .join(' ')
      .toLowerCase();

    if (!text) {
      return '';
    }
    if (/\balbum\b/.test(text)) {
      return '专辑';
    }
    if (/\bep\b/.test(text)) {
      return 'EP';
    }
    if (/\bsingle\b/.test(text)) {
      return '单曲';
    }
    if (/compilation/.test(text)) {
      return '合辑';
    }
    if (/mixtape/.test(text)) {
      return '混音带';
    }
    if (/live/.test(text)) {
      return '现场';
    }
    return normalizeSpaces(toArray(formats)[0] && toArray(formats)[0].name);
  }

  function normalizeReferenceUrl(value) {
    return extractFirstUrl(value);
  }

  function parseDiscogsInput(input) {
    var value = normalizeSpaces(input);
    if (!value) {
      return { ok: false, reason: 'EMPTY_INPUT' };
    }

    var urlMatch = value.match(DISCogs_RELEASE_RE);
    if (!urlMatch) {
      var idMatch = value.match(/^\d+$/);
      if (!idMatch) {
        return { ok: false, reason: 'UNSUPPORTED_URL_OR_ID' };
      }
      return {
        ok: true,
        type: 'release',
        id: Number(value),
        url: 'https://www.discogs.com/release/' + value
      };
    }

    return {
      ok: true,
      type: /\/master\//i.test(value) ? 'master' : 'release',
      id: Number(urlMatch[1]),
      url: value
    };
  }

  function buildDiscogsApiUrl(parsed, token) {
    var base = parsed.type === 'master' ? 'https://api.discogs.com/masters/' : 'https://api.discogs.com/releases/';
    var url = base + parsed.id;
    if (token) {
      url += '?token=' + encodeURIComponent(token);
    }
    return url;
  }

  function joinNonEmpty(parts, separator) {
    return uniqueList(
      parts
        .map(function (item) {
          return normalizeSpaces(item);
        })
        .filter(Boolean)
    ).join(separator || ' · ');
  }

  function formatFormatSummary(formats) {
    return toArray(formats)
      .map(function (format) {
        var pieces = [];
        if (format.qty) {
          pieces.push(format.qty + '×');
        }
        pieces = pieces.concat(toArray(format.descriptions || []).map(normalizeSpaces).filter(Boolean));
        if (format.name) {
          pieces.push(normalizeSpaces(format.name));
        }
        return pieces.join(' ');
      })
      .filter(Boolean)
      .join(' / ');
  }

  function collectIdentifierValues(identifiers, predicate) {
    return toArray(identifiers)
      .filter(predicate)
      .map(function (item) {
        return normalizeSpaces(item.value);
      })
      .filter(Boolean);
  }

  function formatTracklist(tracklist) {
    return toArray(tracklist)
      .map(function (track, index) {
        var position = normalizeSpaces(track.position) || String(index + 1);
        var title = normalizeSpaces(track.title);
        var duration = normalizeSpaces(track.duration);
        var pieces = [position + '. ' + title];
        if (duration) {
          pieces.push('[' + duration + ']');
        }
        return pieces.join(' ');
      })
      .filter(Boolean)
      .join('\n');
  }

  function normalizeDiscogsRelease(payload, options) {
    options = options || {};
    var artists = toArray(payload.artists)
      .map(function (artist) {
        return cleanArtistName(artist && (artist.name || artist.anv || artist.resource_url));
      })
      .filter(Boolean);
    var labels = toArray(payload.labels)
      .map(function (label) {
        return normalizeSpaces(label && label.name);
      })
      .filter(Boolean);
    var catnos = toArray(payload.labels)
      .map(function (label) {
        return normalizeSpaces(label && label.catno);
      })
      .filter(Boolean);

    var sourceUrl = normalizeSpaces(payload.uri || payload.resource_url || options.sourceUrl || '');
    var referenceUrl = normalizeReferenceUrl(options.referenceUrl || options.referenceNotes || '');
    var releaseDate = deriveReleaseDate(payload, options);
    var identifiers = toArray(payload.identifiers);
    var barcodes = collectIdentifierValues(identifiers, function (item) {
      return /barcode|upc|ean/i.test(String(item.type || ''));
    });
    var matrices = collectIdentifierValues(identifiers, function (item) {
      return /matrix|runout/i.test(String(item.type || ''));
    });
    var formats = formatFormatSummary(payload.formats);
    var releaseType = formatReleaseType(payload.formats);
    var tracklist = toArray(payload.tracklist).map(function (track) {
      return {
        position: normalizeSpaces(track.position),
        title: normalizeSpaces(track.title),
        duration: normalizeSpaces(track.duration),
        type_: normalizeSpaces(track.type_),
        artists: toArray(track.artists)
          .map(function (artist) {
            return cleanArtistName(artist && (artist.name || artist.anv));
          })
          .filter(Boolean)
      };
    });
    var coverImage = '';
    var images = toArray(payload.images);
    if (images.length) {
      var preferred = images.find(function (image) {
        return image && image.type === 'primary';
      }) || images[0];
      coverImage = normalizeSpaces(preferred && (preferred.uri || preferred.uri150 || preferred.resource_url));
    }

    var sourceLinks = [];
    if (sourceUrl) {
      sourceLinks.push(sourceUrl);
    }
    if (referenceUrl) {
      sourceLinks.push(referenceUrl);
    }
    var introText = normalizeSpaces(options.introText || payload.notes || options.referenceNotes || '');
    var normalizedLabel = joinNonEmpty(labels, ' / ') || inferLabelFromText(introText) || 'Self-Released';
    var normalizedReleaseType = releaseType || inferReleaseTypeFromText(introText, sourceUrl);
    var sourceTextParts = [];
    if (sourceUrl) {
      sourceTextParts.push('Discogs: ' + sourceUrl);
    }
    if (referenceUrl) {
      sourceTextParts.push('RYM: ' + referenceUrl);
    }
    var sourceText = sourceTextParts.join('\n');

    return {
      source: 'discogs',
      sourceType: options.sourceType || 'release',
      sourceUrl: sourceUrl,
      referenceUrl: referenceUrl,
      sourceLinks: uniqueList(sourceLinks),
      sourceText: sourceText,
      sourceLabel: cleanTitleText(payload.title || ''),
      discogsId: payload.id || options.id || null,
      title: cleanTitleText(payload.title || ''),
      subtitle: normalizeSpaces(options.subtitle || ''),
      artist: joinNonEmpty(artists, ' / '),
      artists: artists,
      released: releaseDate && releaseDate.iso ? releaseDate.iso : normalizeSpaces(payload.released_formatted || payload.released || ''),
      releaseDateIso: releaseDate && releaseDate.iso ? releaseDate.iso : '',
      releaseDateYear: releaseDate && releaseDate.year ? String(releaseDate.year) : '',
      releaseDateMonth: releaseDate && releaseDate.month ? String(releaseDate.month) : '',
      releaseDateMonthLabel: releaseDate && releaseDate.monthLabel ? releaseDate.monthLabel : '',
      releaseDateDay: releaseDate && releaseDate.day ? String(releaseDate.day) : '',
      releaseDateDisplay: releaseDate && releaseDate.iso ? releaseDate.iso : normalizeSpaces(payload.released_formatted || payload.released || ''),
      releaseTypeZh: normalizedReleaseType,
      country: normalizeSpaces(payload.country || ''),
      label: normalizedLabel,
      catalogNumber: joinNonEmpty(catnos, ' / '),
      format: formats,
      formatSummary: formats,
      genres: uniqueList(toArray(payload.genres).map(normalizeSpaces).filter(Boolean)),
      styles: uniqueList(toArray(payload.styles).map(normalizeSpaces).filter(Boolean)),
      barcode: joinNonEmpty(barcodes, ' / '),
      matrix: joinNonEmpty(matrices, ' / '),
      notes: introText,
      introText: introText,
      tracklist: tracklist,
      tracklistText: formatTracklist(tracklist),
      coverImage: coverImage,
      referenceNotes: normalizeSpaces(options.referenceNotes || ''),
      importedAt: new Date().toISOString()
    };
  }

  function normalizeSourceDraft(input, options) {
    options = options || {};
    input = input || {};

    var source = normalizeSpaces(options.source || input.source || 'web').toLowerCase();
    var noteText = normalizeSpaces(input.introText || input.notes || options.referenceNotes || '');
    var inferredReleaseType = inferReleaseTypeFromText(
      [input.releaseTypeZh, input.releaseType, noteText, input.title, input.subtitle].filter(Boolean).join(' '),
      options.sourceUrl || input.sourceUrl || input.url || ''
    );
    var inferredLabel = inferLabelFromText(noteText);
    var artists = uniqueList(
      toArray(input.artists || input.artist)
        .map(cleanArtistName)
        .filter(Boolean)
    );
    var releaseDate = deriveReleaseDate(
      {
        notes: input.notes || input.introText || '',
        released_formatted: input.releaseDate || input.released || '',
        released: input.releaseDate || input.released || ''
      },
      {
        referenceNotes: options.referenceNotes || input.referenceNotes || '',
        releaseDate: input.releaseDate || input.released || '',
        introText: input.notes || input.introText || ''
      }
    );
    var tracklist = toArray(input.tracklist).map(function (track, index) {
      if (typeof track === 'string') {
        return {
          position: String(index + 1),
          title: normalizeSpaces(track),
          duration: '',
          type_: '',
          artists: []
        };
      }
      return {
        position: normalizeSpaces(track && track.position) || String(index + 1),
        title: normalizeSpaces(track && track.title),
        duration: normalizeSpaces(track && track.duration),
        type_: normalizeSpaces(track && track.type_),
        artists: uniqueList(
          toArray(track && (track.artists || track.artist))
            .map(cleanArtistName)
            .filter(Boolean)
        )
      };
    }).filter(function (track) {
      return track.title;
    });

    var sourceUrl = normalizeSpaces(options.sourceUrl || input.sourceUrl || input.url || '');
    var referenceUrl = normalizeReferenceUrl(options.referenceUrl || input.referenceUrl || '');
    var sourceTextParts = [];
    if (sourceUrl) {
      sourceTextParts.push(sourceLabelText(source) + ': ' + sourceUrl);
    }
    if (referenceUrl && referenceUrl !== sourceUrl) {
      sourceTextParts.push('Reference: ' + referenceUrl);
    }

    return {
      source: source || 'web',
      sourceType: options.sourceType || 'page',
      sourceUrl: sourceUrl,
      referenceUrl: referenceUrl,
      sourceLinks: uniqueList([sourceUrl, referenceUrl].filter(Boolean)),
      sourceText: sourceTextParts.join('\n'),
      sourceLabel: cleanTitleText(input.sourceLabel || input.title || ''),
      discogsId: null,
      title: cleanTitleText(input.title || ''),
      subtitle: normalizeSpaces(input.subtitle || ''),
      artist: joinNonEmpty(artists, ' / '),
      artists: artists,
      released: releaseDate && releaseDate.iso ? releaseDate.iso : normalizeSpaces(input.releaseDate || input.released || ''),
      releaseDateIso: releaseDate && releaseDate.iso ? releaseDate.iso : '',
      releaseDateYear: releaseDate && releaseDate.year ? String(releaseDate.year) : '',
      releaseDateMonth: releaseDate && releaseDate.month ? String(releaseDate.month) : '',
      releaseDateMonthLabel: releaseDate && releaseDate.monthLabel ? releaseDate.monthLabel : '',
      releaseDateDay: releaseDate && releaseDate.day ? String(releaseDate.day) : '',
      releaseDateDisplay: releaseDate && releaseDate.iso ? releaseDate.iso : normalizeSpaces(input.releaseDate || input.released || ''),
      releaseTypeZh: normalizeSpaces(input.releaseTypeZh || input.releaseType || inferredReleaseType || ''),
      country: normalizeSpaces(input.country || ''),
      label: normalizeSpaces(input.label || inferredLabel || 'Self-Released'),
      catalogNumber: normalizeSpaces(input.catalogNumber || ''),
      format: normalizeSpaces(input.format || ''),
      formatSummary: normalizeSpaces(input.formatSummary || input.format || ''),
      genres: uniqueList(toArray(input.genres).map(normalizeSpaces).filter(Boolean)),
      styles: uniqueList(toArray(input.styles).map(normalizeSpaces).filter(Boolean)),
      barcode: normalizeSpaces(input.barcode || ''),
      matrix: normalizeSpaces(input.matrix || ''),
      notes: noteText,
      introText: noteText,
      tracklist: tracklist,
      tracklistText: formatTracklist(tracklist),
      coverImage: normalizeSpaces(input.coverImage || input.image || ''),
      referenceNotes: normalizeSpaces(options.referenceNotes || input.referenceNotes || ''),
      importedAt: new Date().toISOString()
    };
  }

  var FIELD_RULES = {
    title: {
      positive: ['专辑名', '专辑标题', 'album title', 'release title', 'album', '标题', '名称'],
      negative: ['副标题', 'subtitle', 'sub title']
    },
    subtitle: {
      positive: ['副标题', 'subtitle', 'sub title']
    },
    artist: {
      positive: ['艺人', 'artist', 'artists', '演出者', '歌手', '演唱者', '作者']
    },
    label: {
      positive: ['厂牌', '发行公司', '唱片公司', 'label', 'record label', 'record company', 'publisher', '出版厂牌']
    },
    intro: {
      positive: ['专辑介绍', '介绍', '简介', '内容简介', 'album intro', 'description'],
      negative: ['补充备注', '补充说明', '备注', '说明', '曲目', 'tracklist', 'track list', 'tracks', 'source']
    },
    supplementNote: {
      positive: ['补充备注', '补充说明', '备注', '说明', 'notes', 'note', 'additional notes']
    },
    source: {
      positive: ['资料来源', '来源', 'source', 'reference', '参考链接', '参考信息']
    },
    releasedDate: {
      positive: ['发行时间', '发行日期', 'release date', 'released', '日期']
    },
    releasedYear: {
      positive: ['年份', 'year', '发行年']
    },
    releasedMonth: {
      positive: ['月份', 'month', '发行月']
    },
    releasedDay: {
      positive: ['日期', '日', 'day', '发行日']
    },
    releaseType: {
      positive: ['类型', '专辑类型', 'album type', 'type']
    },
    format: {
      positive: ['格式', '介质', 'format', 'media', '版本']
    },
    country: {
      positive: ['国家', 'country', '地区', '发行国家']
    },
    catalogNumber: {
      positive: ['catalog number', 'cat no', 'catno', 'catalogue number', 'catalog number(s)', '编号', '目录号', 'catalog']
    },
    genres: {
      positive: ['genre', 'genres', '流派', '风格类型']
    },
    styles: {
      positive: ['style', 'styles', '风格']
    },
    barcode: {
      positive: ['barcode', 'upc', 'ean', '条码', '条形码']
    },
    matrix: {
      positive: ['matrix', 'runout', 'matrix/runout', '矩阵', '母盘']
    },
    tracklist: {
      positive: ['tracklist', 'track list', 'tracks', '曲目', '曲目列表', '歌单', '歌曲列表'],
      negative: ['介绍', '简介', '备注', '来源']
    }
  };

  function collectTextFragments(meta) {
    return [
      meta.labelText,
      meta.placeholder,
      meta.name,
      meta.id,
      meta.ariaLabel,
      meta.title,
      meta.sectionTitle,
      meta.rowText
    ]
      .map(normalizeSpaces)
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();
  }

  function collectDirectTextFragments(meta) {
    return [
      meta.labelText,
      meta.placeholder,
      meta.name,
      meta.id,
      meta.ariaLabel,
      meta.title
    ]
      .map(normalizeSpaces)
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();
  }

  function scoreMatch(text, aliases) {
    var score = 0;
    var normalized = String(text || '').toLowerCase();
    aliases.forEach(function (alias) {
      var aliasValue = String(alias).toLowerCase();
      if (!aliasValue) {
        return;
      }
      if (normalized === aliasValue) {
        score += 6;
      } else if (normalized.indexOf(aliasValue) !== -1) {
        score += 3;
      } else {
        var tokens = aliasValue.split(/\s+/).filter(Boolean);
        var tokenHits = tokens.filter(function (token) {
          return normalized.indexOf(token) !== -1;
        }).length;
        score += tokenHits;
      }
    });
    return score;
  }

  function containsAny(text, tokens) {
    var normalized = String(text || '').toLowerCase();
    return tokens.some(function (token) {
      return normalized.indexOf(String(token).toLowerCase()) !== -1;
    });
  }

  function exactOrContains(text, token) {
    var normalized = String(text || '').toLowerCase();
    var needle = String(token || '').toLowerCase();
    if (!needle) return false;
    return normalized === needle || normalized.indexOf(needle) !== -1;
  }

  function scoreRole(meta, role) {
    var rule = FIELD_RULES[role];
    if (!rule) {
      return 0;
    }
    var text = collectTextFragments(meta);
    var directText = collectDirectTextFragments(meta);
    var score = 0;

    var negativeText = role === 'intro' || role === 'tracklist' ? directText : text;
    if (rule.negative && containsAny(negativeText, rule.negative)) {
      return -100;
    }

    if (rule.positive) {
      rule.positive.forEach(function (token) {
        var searchText = role === 'tracklist' ? directText : text;
        if (exactOrContains(searchText, token)) {
          score += String(token).length > 6 ? 4 : 3;
        } else {
          var tokenParts = String(token).toLowerCase().split(/\s+/).filter(Boolean);
          if (tokenParts.length > 1) {
            var hits = tokenParts.filter(function (part) {
              return searchText.indexOf(part) !== -1;
            }).length;
            score += hits;
          }
        }
      });
    }

    if (meta.labelText && rule.positive && containsAny(meta.labelText, rule.positive)) {
      score += 3;
    }
    if (meta.placeholder && rule.positive && containsAny(meta.placeholder, rule.positive)) {
      score += 2;
    }
    if (meta.name && rule.positive && containsAny(meta.name, rule.positive)) {
      score += 2;
    }
    if (meta.id && rule.positive && containsAny(meta.id, rule.positive)) {
      score += 2;
    }

    if (role === 'title' && containsAny(text, FIELD_RULES.subtitle.positive)) {
      score -= 8;
    }
    if (role === 'releaseType' && meta.tagName === 'SELECT') {
      score += 2;
    }
    if ((role === 'releasedYear' || role === 'releasedMonth' || role === 'releasedDay') && meta.tagName === 'SELECT') {
      score += 1;
    }
    if (role === 'intro' && meta.tagName === 'TEXTAREA') {
      score += 1;
    }
    if (role === 'tracklist' && meta.tagName === 'TEXTAREA') {
      score -= 1;
    }
    if (role === 'source' && meta.tagName === 'TEXTAREA') {
      score += 1;
    }

    return score;
  }

  function inferFieldRole(meta) {
    var bestRole = null;
    var bestScore = 0;
    Object.keys(FIELD_RULES).forEach(function (role) {
      var score = scoreRole(meta, role);
      if (role === 'genres' || role === 'styles') {
        if (meta.tagName === 'SELECT') {
          score += 2;
        }
      }
      if (role === 'releasedDate' && meta.type === 'date') {
        score += 3;
      }
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    });
    return {
      role: bestRole,
      score: bestScore,
      text: collectTextFragments(meta)
    };
  }

  function isDocumentNode(node) {
    return !!node && typeof node.querySelectorAll === 'function' && !!node.defaultView;
  }

  function isWindowNode(node) {
    return !!node && !!node.document && !!node.location;
  }

  function collectControlsFromDocument(doc, results, visited) {
    if (!doc || visited.has(doc)) {
      return;
    }
    visited.add(doc);

    var elements = Array.prototype.slice.call(
      doc.querySelectorAll('input, textarea, select, [contenteditable="true"]')
    );
    var frameUrl = '';
    try {
      frameUrl = normalizeSpaces(doc.location && doc.location.href);
    } catch (e) {
      frameUrl = '';
    }

    elements.forEach(function (el) {
      var labelText = '';
      if (el.labels && el.labels.length) {
        labelText = Array.prototype.map.call(el.labels, function (label) {
          return normalizeSpaces(label.textContent);
        }).join(' ');
      }
      if (!labelText) {
        var parentLabel = el.closest && el.closest('label');
        if (parentLabel) {
          labelText = normalizeSpaces(parentLabel.textContent);
        }
      }
      var row = el.closest ? el.closest('tr, li, .track-row, .form-row, .nm-row') : null;
      var rowText = row ? normalizeSpaces(row.textContent) : '';
      var section = el.closest ? el.closest('section, fieldset, .section, .group, .panel') : null;
      var sectionTitle = '';
      if (section) {
        var heading = section.querySelector('h1, h2, h3, h4, .title, .section-title, legend');
        if (heading) {
          sectionTitle = normalizeSpaces(heading.textContent);
        }
      }
      var meta = {
        element: el,
        tagName: (el.tagName || '').toUpperCase(),
        type: normalizeSpaces(el.type),
        name: normalizeSpaces(el.name),
        id: normalizeSpaces(el.id),
        placeholder: normalizeSpaces(el.placeholder),
        title: normalizeSpaces(el.title),
        ariaLabel: normalizeSpaces(el.getAttribute && el.getAttribute('aria-label')),
        labelText: labelText,
        rowText: rowText,
        sectionTitle: sectionTitle,
        value: normalizeSpaces(el.value),
        checked: !!el.checked,
        multiple: !!el.multiple,
        disabled: !!el.disabled,
        readOnly: !!el.readOnly,
        frameUrl: frameUrl
      };
      results.push(meta);
    });

    var frames = Array.prototype.slice.call(doc.querySelectorAll('iframe'));
    frames.forEach(function (frame) {
      try {
        var frameDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (frameDoc) {
          collectControlsFromDocument(frameDoc, results, visited);
        }
      } catch (e) {
        // Ignore cross-origin or not-yet-loaded frames.
      }
    });
  }

  function scanControls(root) {
    var results = [];
    var visited = typeof WeakSet !== 'undefined' ? new WeakSet() : new Set();
    if (isWindowNode(root)) {
      collectControlsFromDocument(root.document, results, visited);
      return results;
    }
    if (isDocumentNode(root)) {
      collectControlsFromDocument(root, results, visited);
      return results;
    }
    if (root && typeof root.querySelectorAll === 'function') {
      Array.prototype.slice
        .call(root.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
        .forEach(function (el) {
          results.push({
            element: el,
            tagName: (el.tagName || '').toUpperCase(),
            type: normalizeSpaces(el.type),
            name: normalizeSpaces(el.name),
            id: normalizeSpaces(el.id),
            placeholder: normalizeSpaces(el.placeholder),
            title: normalizeSpaces(el.title),
            ariaLabel: normalizeSpaces(el.getAttribute && el.getAttribute('aria-label')),
            labelText: '',
            rowText: '',
            sectionTitle: '',
            value: normalizeSpaces(el.value),
            checked: !!el.checked,
            multiple: !!el.multiple,
            disabled: !!el.disabled,
            readOnly: !!el.readOnly,
            frameUrl: ''
          });
        });
    }
    return results;
  }

  function isTrackControl(meta) {
    return /track|曲目|歌名|title|duration|时长|position|编号/.test(
      collectTextFragments(meta)
    );
  }

  function planAssignments(draft, controls) {
    var roles = [
      'title',
      'subtitle',
      'artist',
      'label',
      'releaseType',
      'format',
      'releasedYear',
      'releasedMonth',
      'releasedDay',
      'releasedDate',
      'country',
      'catalogNumber',
      'genres',
      'styles',
      'barcode',
      'matrix',
      'intro',
      'supplementNote',
      'source',
      'tracklist'
    ];
    var controlMatches = controls.map(function (meta) {
      return {
        meta: meta,
        inference: inferFieldRole(meta)
      };
    });
    var assignments = [];
    var used = new Set();

    roles.forEach(function (role) {
      var best = null;
      var bestScore = 0;
      controlMatches.forEach(function (item) {
        if (used.has(item.meta)) {
          return;
        }
        var score = item.inference.role === role ? item.inference.score : 0;
        if (!score) {
          return;
        }
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      });
      if (best) {
        used.add(best.meta);
        assignments.push({
          role: role,
          meta: best.meta,
          score: bestScore
        });
      }
    });

    return assignments;
  }

  function serializeDraftSummary(draft) {
    if (!draft) {
      return '没有可用草稿。';
    }
    var parts = [];
    parts.push('标题: ' + (draft.title || '未命名'));
    if (draft.subtitle) parts.push('副标题: ' + draft.subtitle);
    if (draft.artist) parts.push('艺人: ' + draft.artist);
    if (draft.releaseDateDisplay) parts.push('发行日期: ' + draft.releaseDateDisplay);
    if (draft.releaseTypeZh) parts.push('类型: ' + draft.releaseTypeZh);
    if (draft.label) parts.push('厂牌: ' + draft.label);
    if (draft.catalogNumber) parts.push('Catalog No.: ' + draft.catalogNumber);
    if (draft.formatSummary) parts.push('格式: ' + draft.formatSummary);
    if (draft.barcode) parts.push('条码: ' + draft.barcode);
    if (draft.tracklist && draft.tracklist.length) {
      parts.push('曲目数: ' + draft.tracklist.length);
    }
    if (draft.referenceNotes) {
      parts.push('补充备注: ' + draft.referenceNotes);
    }
    if (draft.sourceUrl) {
      parts.push('来源: ' + draft.sourceUrl);
    }
    if (draft.referenceUrl) {
      parts.push('RYM 链接: ' + draft.referenceUrl);
    }
    if (draft.introText) {
      parts.push('补充备注: ' + draft.introText);
    }
    return parts.join('\n');
  }

  function renderDraftPreviewHtml(draft) {
    if (!draft) {
      return '<div class="nm-muted">还没有导入资料。</div>';
    }
    var fields = [
      ['专辑名', draft.title],
      ['副标题', draft.subtitle],
      ['艺人', draft.artist],
      ['发行日期', draft.releaseDateDisplay],
      ['类型', draft.releaseTypeZh],
      ['国家', draft.country],
      ['厂牌', draft.label],
      ['Catalog No.', draft.catalogNumber],
      ['格式', draft.formatSummary],
      ['Genre', toArray(draft.genres).join(' / ')],
      ['Style', toArray(draft.styles).join(' / ')],
      ['条码', draft.barcode],
      ['Matrix', draft.matrix]
    ];
    var html = fields
      .filter(function (pair) {
        return normalizeSpaces(pair[1]);
      })
      .map(function (pair) {
        return '<div class="nm-kv"><strong>' + escapeHtml(pair[0]) + '</strong>' + escapeHtml(pair[1]) + '</div>';
      })
      .join('');
    if (draft.tracklistText) {
      html +=
        '<div class="nm-kv"><strong>曲目</strong><pre style="white-space:pre-wrap;margin:0;">' +
        escapeHtml(draft.tracklistText) +
        '</pre></div>';
    }
    if (draft.sourceUrl) {
      html +=
        '<div class="nm-kv"><strong>来源</strong><a href="' +
        escapeHtml(draft.sourceUrl) +
        '" target="_blank" rel="noreferrer noopener">' +
        escapeHtml(draft.sourceUrl) +
        '</a></div>';
    }
    if (draft.referenceUrl) {
      html +=
        '<div class="nm-kv"><strong>RYM</strong><a href="' +
        escapeHtml(draft.referenceUrl) +
        '" target="_blank" rel="noreferrer noopener">' +
        escapeHtml(draft.referenceUrl) +
        '</a></div>';
    }
    if (draft.sourceText) {
      html += '<div class="nm-kv"><strong>资料来源文本</strong><pre style="white-space:pre-wrap;margin:0;">' + escapeHtml(draft.sourceText) + '</pre></div>';
    }
    if (draft.introText) {
      html += '<div class="nm-kv"><strong>补充备注</strong><pre style="white-space:pre-wrap;margin:0;">' + escapeHtml(draft.introText) + '</pre></div>';
    }
    if (draft.referenceNotes) {
      html += '<div class="nm-kv"><strong>RYM 参考</strong>' + escapeHtml(draft.referenceNotes) + '</div>';
    }
    return html || '<div class="nm-muted">没有可预览字段。</div>';
  }

  function setNativeValue(element, value) {
    var descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function dispatchEnterKey(element) {
    var hasKeyboardEvent = typeof KeyboardEvent === 'function';
    var EventCtor = hasKeyboardEvent ? KeyboardEvent : Event;
    var options = { bubbles: true };
    if (hasKeyboardEvent) {
      options.key = 'Enter';
      options.code = 'Enter';
      options.keyCode = 13;
      options.which = 13;
    }
    element.dispatchEvent(new EventCtor('keydown', options));
    element.dispatchEvent(new EventCtor('keypress', options));
    element.dispatchEvent(new EventCtor('keyup', options));
  }

  function setDateInputValue(element, value) {
    if (element && typeof element.focus === 'function') {
      element.focus();
    }
    if (element && typeof element.click === 'function') {
      element.click();
    }
    setNativeValue(element, value);
    dispatchEnterKey(element);
  }

  function setSelectValue(element, values) {
    var desired = toArray(values).map(normalizeSpaces).filter(Boolean);
    var hasMatches = [];
    Array.prototype.forEach.call(element.options || [], function (option) {
      var hit = desired.some(function (value) {
        return normalizeSpaces(option.value).toLowerCase() === value.toLowerCase() ||
          normalizeSpaces(option.textContent).toLowerCase().indexOf(value.toLowerCase()) !== -1;
      });
      option.selected = hit;
      if (hit) hasMatches.push(option.value);
    });
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return hasMatches;
  }

  function fillTracklistText(target, draft) {
    if (!target) return false;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      setNativeValue(target, draft.tracklistText || '');
      return true;
    }
    if (target.isContentEditable) {
      target.innerText = draft.tracklistText || '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function getDraftValueForRole(draft, role) {
    if (!draft) {
      return '';
    }
    if (role === 'artist') {
      return '';
    }
    if (role === 'releasedDate') {
      return draft.releaseDateIso || draft.released || draft.releaseDateDisplay || '';
    }
    if (role === 'intro') {
      return draft.introText || draft.notes || '';
    }
    if (role === 'supplementNote') {
      return '';
    }
    if (role === 'releasedYear') {
      return draft.releaseDateYear || '';
    }
    if (role === 'releasedMonth') {
      return [draft.releaseDateMonth, draft.releaseDateMonthLabel];
    }
    if (role === 'releasedDay') {
      return [draft.releaseDateDay, String(Number(draft.releaseDateDay || 1)).padStart(2, '0')];
    }
    if (role === 'tracklist') {
      return draft.tracklistText || '';
    }
    var mapping = {
      title: draft.title,
      subtitle: draft.subtitle,
      artist: draft.artist,
      label: draft.label,
      releaseType: draft.releaseTypeZh,
      format: draft.formatSummary,
      country: draft.country,
      catalogNumber: draft.catalogNumber,
      genres: draft.genres,
      styles: draft.styles,
      barcode: draft.barcode,
      matrix: draft.matrix,
      source: draft.sourceText
    };
    return mapping[role] != null ? mapping[role] : '';
  }

  function fillDraftIntoControls(draft, controls) {
    var assignments = planAssignments(draft, controls);
    var results = [];
    assignments.forEach(function (assignment) {
      var value = getDraftValueForRole(draft, assignment.role);
      if (value == null || value === '') {
        return;
      }
      var el = assignment.meta.element;
      if (assignment.role === 'tracklist') {
        if (fillTracklistText(el, draft)) {
          results.push({ role: assignment.role, filled: true });
        }
        return;
      }
      if (el.tagName === 'SELECT') {
        results.push({ role: assignment.role, filled: setSelectValue(el, value) });
        return;
      }
      if (Array.isArray(value)) {
        value = value.join(' / ');
      }
      if (typeof value !== 'string') {
        value = String(value);
      }
      if (assignment.role === 'releasedDate') {
        setDateInputValue(el, value);
      } else {
        setNativeValue(el, value);
      }
      results.push({ role: assignment.role, filled: true });
    });
    return {
      assignments: assignments,
      results: results
    };
  }

  function detectConflicts(draft, controls) {
    var conflicts = [];
    controls.forEach(function (meta) {
      if (!meta.value) {
        return;
      }
      var inferred = inferFieldRole(meta);
      var expected = inferred.role ? getDraftValueForRole(draft, inferred.role) : null;
      if (expected == null || expected === '') {
        return;
      }
      var expectedText = Array.isArray(expected) ? expected.join(' / ') : String(expected);
      var currentText = String(meta.value);
      if (normalizeSpaces(expectedText).toLowerCase() !== normalizeSpaces(currentText).toLowerCase()) {
        conflicts.push({
          role: inferred.role,
          current: currentText,
          expected: expectedText,
          meta: meta
        });
      }
    });
    return conflicts;
  }

  return {
    escapeHtml: escapeHtml,
    normalizeSpaces: normalizeSpaces,
    cleanArtistName: cleanArtistName,
    uniqueList: uniqueList,
    parseDiscogsInput: parseDiscogsInput,
    buildDiscogsApiUrl: buildDiscogsApiUrl,
    normalizeDiscogsRelease: normalizeDiscogsRelease,
    normalizeSourceDraft: normalizeSourceDraft,
    formatTracklist: formatTracklist,
    scanControls: scanControls,
    inferFieldRole: inferFieldRole,
    planAssignments: planAssignments,
    fillDraftIntoControls: fillDraftIntoControls,
    detectConflicts: detectConflicts,
    serializeDraftSummary: serializeDraftSummary,
    renderDraftPreviewHtml: renderDraftPreviewHtml,
    setNativeValue: setNativeValue,
    setSelectValue: setSelectValue,
    fillTracklistText: fillTracklistText,
    isTrackControl: isTrackControl
  };
});

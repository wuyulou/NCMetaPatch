const test = require('node:test');
const assert = require('node:assert/strict');
const helper = require('../src/shared.js');

function makeElement(config) {
  return Object.assign(
    {
      tagName: 'INPUT',
      type: 'text',
      name: '',
      id: '',
      placeholder: '',
      title: '',
      value: '',
      checked: false,
      multiple: false,
      disabled: false,
      readOnly: false,
      labels: [],
      getAttribute() {
        return '';
      },
      closest() {
        return null;
      }
    },
    config
  );
}

class MockControl {
  constructor(tagName, meta) {
    this.tagName = tagName;
    this.type = meta.type || 'text';
    this.name = meta.name || '';
    this.id = meta.id || '';
    this.placeholder = meta.placeholder || '';
    this.title = meta.title || '';
    this.labels = meta.labels || [];
    this.value = meta.value || '';
    this.checked = !!meta.checked;
    this.multiple = !!meta.multiple;
    this.disabled = !!meta.disabled;
    this.readOnly = !!meta.readOnly;
    this.options = meta.options || [];
    this._events = [];
  }

  getAttribute() {
    return '';
  }

  closest() {
    return null;
  }

  focus() {
    this._events.push('focus');
  }

  click() {
    this._events.push('click');
  }

  dispatchEvent(event) {
    this._events.push(event.type);
    return true;
  }

  get value() {
    return this._value || '';
  }

  set value(next) {
    this._value = next;
  }
}

test('parseDiscogsInput parses release and master urls', () => {
  const release = helper.parseDiscogsInput('https://www.discogs.com/release/1234567-Artist-Album');
  assert.equal(release.ok, true);
  assert.equal(release.type, 'release');
  assert.equal(release.id, 1234567);

  const master = helper.parseDiscogsInput('https://www.discogs.com/master/7654321-Artist-Album');
  assert.equal(master.ok, true);
  assert.equal(master.type, 'master');
  assert.equal(master.id, 7654321);
});

test('normalizeDiscogsRelease merges date parts and source urls', () => {
  const draft = helper.normalizeDiscogsRelease(
    {
      id: 99,
      title: 'Example Album',
      uri: 'https://www.discogs.com/release/99-Example-Album',
      artists: [{ name: 'Mike (23)' }, { name: 'Guest Artist（12）' }],
      labels: [{ name: 'Example Label', catno: 'EX-01' }],
      released_formatted: '2003-2004',
      country: 'China',
      formats: [{ qty: '1', descriptions: ['Album'], name: 'Vinyl' }],
      genres: ['Rock'],
      styles: ['Indie Rock'],
      identifiers: [
        { type: 'Barcode', value: '1234567890123' },
        { type: 'Matrix / Runout', value: 'MTR-01' }
      ],
      notes: 'Discogs intro text',
      images: [{ type: 'primary', uri: 'https://img.example/cover.jpg' }],
      tracklist: [
        { position: 'A1', title: 'Song 1', duration: '3:20' },
        { position: 'A2', title: 'Song 2', duration: '4:10' }
      ]
    },
    {
      sourceType: 'release',
      sourceUrl: 'https://www.discogs.com/release/99-Example-Album',
      referenceUrl: 'https://rateyourmusic.com/release/album/example/example-album/',
      referenceNotes: '发行时间 2026-07-24'
    }
  );

  assert.equal(draft.title, 'Example Album');
  assert.equal(draft.artist, 'Mike / Guest Artist');
  assert.deepEqual(draft.artists, ['Mike', 'Guest Artist']);
  assert.equal(draft.label, 'Example Label');
  assert.equal(draft.catalogNumber, 'EX-01');
  assert.equal(draft.barcode, '1234567890123');
  assert.equal(draft.matrix, 'MTR-01');
  assert.equal(draft.releaseTypeZh, '专辑');
  assert.equal(draft.releaseDateIso, '2026-07-24');
  assert.equal(draft.released, '2026-07-24');
  assert.equal(draft.releaseDateDisplay, '2026-07-24');
  assert.equal(draft.releaseDateYear, '2026');
  assert.equal(draft.releaseDateMonth, '7');
  assert.equal(draft.releaseDateDay, '24');
  assert.match(draft.tracklistText, /A1\. Song 1/);
  assert.equal(draft.coverImage, 'https://img.example/cover.jpg');
  assert.deepEqual(draft.genres, ['Rock']);
  assert.deepEqual(draft.styles, ['Indie Rock']);
  assert.match(draft.sourceText, /Discogs:/);
  assert.match(draft.sourceText, /RYM:/);
  assert.match(draft.introText, /Discogs intro text/);
});

test('field matching keeps intro, supplement note, tracklist and date separate', () => {
  const controls = [
    makeElement({
      name: 'album_title',
      id: 'albumTitle',
      placeholder: '专辑名',
      labelText: '专辑名',
      value: ''
    }),
    makeElement({
      name: 'subtitle',
      id: 'subtitle',
      placeholder: '副标题',
      labelText: '副标题',
      value: ''
    }),
    makeElement({
      name: 'record_company',
      id: 'recordCompany',
      placeholder: '发行公司',
      labelText: '发行公司',
      value: ''
    }),
    makeElement({
      tagName: 'TEXTAREA',
      name: 'intro',
      id: 'intro',
      placeholder: '专辑介绍',
      labelText: '专辑介绍',
      value: ''
    }),
    makeElement({
      tagName: 'TEXTAREA',
      name: 'supplement_note',
      id: 'supplementNote',
      placeholder: '补充备注',
      labelText: '补充备注',
      value: ''
    }),
    makeElement({
      tagName: 'TEXTAREA',
      name: 'source',
      id: 'source',
      placeholder: '资料来源',
      labelText: '资料来源',
      value: ''
    }),
    makeElement({
      tagName: 'TEXTAREA',
      name: 'tracklist',
      id: 'tracklist',
      placeholder: '曲目列表',
      labelText: '曲目列表',
      rowText: '专辑介绍 曲目',
      value: ''
    }),
    makeElement({
      tagName: 'INPUT',
      type: 'date',
      name: 'releasedDate',
      id: 'releasedDate',
      placeholder: '发行日期',
      labelText: '发行日期',
      value: ''
    }),
    makeElement({
      tagName: 'INPUT',
      type: 'text',
      name: 'year',
      id: 'releaseYear',
      placeholder: '年份',
      labelText: '年份',
      value: ''
    }),
    makeElement({
      tagName: 'INPUT',
      type: 'text',
      name: 'month',
      id: 'releaseMonth',
      placeholder: '月份',
      labelText: '月份',
      value: ''
    }),
    makeElement({
      tagName: 'INPUT',
      type: 'text',
      name: 'day',
      id: 'releaseDay',
      placeholder: '日期',
      labelText: '日期',
      value: ''
    })
  ];

  const assignments = helper.planAssignments(
    {
      title: 'Example Album',
      subtitle: 'Bonus Disc',
      label: 'Example Label',
      introText: 'This is intro text.',
      sourceText: 'Discogs: https://www.discogs.com/release/99-Example-Album\nRYM: https://rateyourmusic.com/release/album/example/example-album/',
      releaseDateYear: '2026',
      releaseDateMonth: '7',
      releaseDateMonthLabel: '7月',
      releaseDateDay: '24',
      releaseDateDisplay: '2026-07-24',
      releaseDateIso: '2026-07-24'
    },
    controls
  );

  assert.deepEqual(
    assignments.map((item) => item.role),
    ['title', 'subtitle', 'label', 'releasedYear', 'releasedMonth', 'releasedDay', 'releasedDate', 'intro', 'supplementNote', 'source', 'tracklist']
  );
  assert.equal(assignments.find((item) => item.role === 'intro').meta.id, 'intro');
  assert.equal(assignments.find((item) => item.role === 'tracklist').meta.id, 'tracklist');
});

test('fillDraftIntoControls fills intro with note text, skips supplement note, and uses ISO release date', () => {
  const artist = new MockControl('INPUT', {
    name: 'artist',
    id: 'artist',
    placeholder: '艺人',
    labelText: '艺人',
    value: ''
  });
  const intro = new MockControl('TEXTAREA', {
    name: 'intro',
    id: 'intro',
    placeholder: '专辑介绍',
    labelText: '专辑介绍',
    value: 'old intro text'
  });
  const note = new MockControl('TEXTAREA', {
    name: 'supplement_note',
    id: 'supplementNote',
    placeholder: '补充备注',
    labelText: '补充备注',
    value: ''
  });
  const source = new MockControl('TEXTAREA', {
    name: 'source',
    id: 'source',
    placeholder: '资料来源',
    labelText: '资料来源',
    value: ''
  });
  const tracklist = new MockControl('TEXTAREA', {
    name: 'tracklist',
    id: 'tracklist',
    placeholder: '曲目列表',
    labelText: '曲目列表',
    value: ''
  });
  const releasedDate = new MockControl('INPUT', {
    type: 'date',
    name: 'releasedDate',
    id: 'releasedDate',
    placeholder: '发行日期',
    labelText: '发行日期',
    value: ''
  });

  const controls = [artist, intro, note, source, tracklist, releasedDate].map((element) => ({
    element,
    tagName: element.tagName,
    type: element.type,
    name: element.name,
    id: element.id,
    placeholder: element.placeholder,
    title: element.title,
    ariaLabel: '',
    labelText: element.labels[0] ? element.labels[0].textContent : element.placeholder,
    rowText: '',
    sectionTitle: '',
    value: element.value,
    checked: false,
    multiple: false,
    disabled: false,
    readOnly: false,
    frameUrl: ''
  }));

  const result = helper.fillDraftIntoControls(
    {
      artist: 'Should Not Fill',
      introText: 'Supplement note content',
      sourceText: 'Discogs: https://www.discogs.com/release/99-Example-Album\nRYM: https://rateyourmusic.com/release/album/example/example-album/',
      releaseDateIso: '2026-07-24',
      releaseDateDisplay: '2026-07-24',
      tracklistText: 'A1. Song 1'
    },
    controls
  );

  assert.equal(artist.value, '');
  assert.equal(intro.value, 'Supplement note content');
  assert.equal(note.value, '');
  assert.match(source.value, /Discogs:/);
  assert.equal(tracklist.value, 'A1. Song 1');
  assert.equal(releasedDate.value, '2026-07-24');
  assert.equal(result.results.some((item) => item.role === 'artist' && item.filled), false);
  assert.equal(result.results.some((item) => item.role === 'intro' && item.filled), true);
  assert.equal(result.results.some((item) => item.role === 'tracklist' && item.filled), true);
  assert.equal(result.results.some((item) => item.role === 'supplementNote' && item.filled), false);
  assert.deepEqual(releasedDate._events.slice(0, 5), ['focus', 'click', 'input', 'change', 'keydown']);
  assert.equal(releasedDate._events.includes('keyup'), true);
});

test('scanControls reads label text from DOM-like elements', () => {
  const root = {
    querySelectorAll() {
      return [
        makeElement({
          name: 'title',
          id: 'title',
          placeholder: '专辑名',
          value: 'Example Album',
          labels: [{ textContent: '专辑名' }]
        }),
        makeElement({
          name: 'artist',
          id: 'artist',
          placeholder: '艺人',
          value: 'Example Artist',
          labels: [{ textContent: '艺人' }]
        })
      ];
    }
  };

  const controls = helper.scanControls(root);
  const roles = helper.planAssignments(
    { title: 'Example Album', artist: 'Example Artist' },
    controls
  ).map((item) => item.role);

  assert.deepEqual(roles, ['title', 'artist']);
});

test('scanControls traverses same-origin iframes', () => {
  const frameDoc = {
    defaultView: {},
    location: { href: 'https://music.163.com/wiki/album?albumId=0#/st/wiki/album' },
    querySelectorAll(selector) {
      if (selector === 'iframe') return [];
      return [
        makeElement({
          name: 'album_title',
          id: 'albumTitle',
          placeholder: '专辑名',
          value: 'Example Album',
          labels: [{ textContent: '专辑名' }]
        })
      ];
    }
  };

  const iframe = {
    contentDocument: frameDoc,
    contentWindow: { document: frameDoc }
  };

  const rootDoc = {
    defaultView: {},
    location: { href: 'https://music.163.com/#/wiki/album?albumId=0' },
    querySelectorAll(selector) {
      if (selector === 'iframe') return [iframe];
      return [];
    }
  };

  const controls = helper.scanControls(rootDoc);
  assert.equal(controls.length, 1);
  assert.match(controls[0].frameUrl, /wiki\/album/);
  assert.equal(helper.inferFieldRole(controls[0]).role, 'title');
});

test('serializeDraftSummary and preview html include source and tracklist', () => {
  const text = helper.serializeDraftSummary({
    title: 'Example Album',
    artist: 'Example Artist',
    sourceUrl: 'https://www.discogs.com/release/99-Example-Album',
    referenceUrl: 'https://rateyourmusic.com/release/album/example/example-album/',
    introText: 'Intro text',
    releaseDateDisplay: '2026-07-24',
    tracklist: [{}, {}]
  });

  assert.match(text, /Example Album/);
  assert.match(text, /曲目数: 2/);
  assert.match(text, /补充备注/);

  const html = helper.renderDraftPreviewHtml({
    title: 'Example Album',
    artist: 'Example Artist',
    tracklistText: 'A1. Song 1',
    sourceUrl: 'https://www.discogs.com/release/99-Example-Album',
    referenceUrl: 'https://rateyourmusic.com/release/album/example/example-album/',
    sourceText: 'Discogs: https://www.discogs.com/release/99-Example-Album\nRYM: https://rateyourmusic.com/release/album/example/example-album/',
    introText: 'Intro text'
  });

  assert.match(html, /Example Album/);
  assert.match(html, /Song 1/);
  assert.match(html, /discogs\.com\/release\/99-Example-Album/);
  assert.match(html, /rateyourmusic\.com/);
});

test('cleanArtistName strips Discogs disambiguation suffixes', () => {
  assert.equal(helper.cleanArtistName('Mike (23)'), 'Mike');
  assert.equal(helper.cleanArtistName('Guest Artist（12）'), 'Guest Artist');
  assert.equal(helper.cleanArtistName('Xiu Xiu - RYM/Sonemic'), 'Xiu Xiu');
  assert.equal(helper.cleanArtistName('Plain Name'), 'Plain Name');
});

test('normalizeSourceDraft normalizes bandcamp and rym style drafts', () => {
  const draft = helper.normalizeSourceDraft({
    source: 'bandcamp',
    sourceUrl: 'https://artist.bandcamp.com/album/example-album',
    title: 'Example Album',
    artists: ['Mike (23)', 'Guest Artist（12）'],
    releaseDate: 'April 12, 2005',
    tracklist: [
      { title: 'Song A', duration: '3:20' },
      'Song B'
    ],
    coverImage: 'https://f4.bcbits.com/img/a000000000_10.jpg',
    introText: 'Bandcamp description'
  });

  assert.equal(draft.source, 'bandcamp');
  assert.equal(draft.artist, 'Mike / Guest Artist');
  assert.deepEqual(draft.artists, ['Mike', 'Guest Artist']);
  assert.equal(draft.releaseDateIso, '2005-04-12');
  assert.equal(draft.releaseDateDisplay, '2005-04-12');
  assert.equal(draft.label, 'Self-Released');
  assert.equal(draft.releaseTypeZh, '专辑');
  assert.match(draft.tracklistText, /1\. Song A/);
  assert.match(draft.tracklistText, /2\. Song B/);
});

test('normalizeSourceDraft infers label and release type from RYM notes', () => {
  const draft = helper.normalizeSourceDraft({
    source: 'rym',
    sourceUrl: 'https://rateyourmusic.com/release/album/xiu-xiu/dear-god-i-hate-myself/',
    title: 'Dear God, I Hate Myself',
    artists: ['Xiu Xiu - RYM/Sonemic'],
    introText: 'Dear God, I Hate Myself, an Album by Xiu Xiu. Released 23 February 2010 on Kill Rock Stars (catalog no. KRS503; CD). Genres: Glitch Pop, Art Pop.'
  });

  assert.equal(draft.artist, 'Xiu Xiu');
  assert.equal(draft.releaseDateIso, '2010-02-23');
  assert.equal(draft.label, 'Kill Rock Stars');
  assert.equal(draft.releaseTypeZh, '专辑');
});

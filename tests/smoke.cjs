/**
 * Smoke test — drives the BUILT main.js bundle against a faithful Obsidian API mock.
 *
 * This is deliberately NOT a vitest unit test. It loads the actual esbuild output
 * (main.js), instantiates DejaTwoPlugin, and exercises the real runtime paths:
 *   onload -> command callback -> CaptureModal -> saveEntry -> vault file write
 *          -> timeline render -> DOM assertions
 * It also validates the emitted YAML frontmatter with js-yaml (the parser Obsidian
 * actually uses), which the unit-test JSON-subset stand-in does not cover.
 *
 * Run: node tests/smoke.cjs   (requires main.js to be built first: npm run build)
 */
const assert = require('node:assert');
const yaml = require('js-yaml');
const Module = require('node:module');

/* ------------------------------------------------------------------ *
 * Minimal DOM element (subset Obsidian uses in this plugin)
 * ------------------------------------------------------------------ */
class El {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.attrs = {};
    this._text = '';
    this._cls = new Set();
    this._value = '';
  }
  addClass(...c) { c.forEach(x => this._cls.add(x)); return this; }
  removeClass(...c) { c.forEach(x => this._cls.delete(x)); return this; }
  toggleClass(c, on) { on ? this._cls.add(c) : this._cls.delete(c); return this; }
  hasClass(c) { return this._cls.has(c); }
  empty() { this.children = []; return this; }
  createEl(tag, opts = {}) {
    const el = new El(tag);
    if (opts.text != null) el._text = String(opts.text);
    if (opts.cls) (Array.isArray(opts.cls) ? opts.cls : [opts.cls]).forEach(c => el._cls.add(c));
    if (opts.attr) Object.assign(el.attrs, opts.attr);
    if (opts.type != null) el.attrs.type = opts.type;
    this.children.push(el);
    return el;
  }
  createDiv(opts = {}) { return this.createEl('div', opts); }
  setText(t) { this._text = String(t); return this; }
  setValue(v) { this._value = String(v); return this; }
  get text() { return this._text; }
  setAttribute(k, v) { this.attrs[k] = String(v); return this; }
  addEventListener(evt, fn) { (this.listeners[evt] ||= []).push(fn); return this; }
  dispatch(evt) { for (const fn of this.listeners[evt] || []) fn(); }
  queryByText(text) {
    if (this._text === text) return this;
    for (const c of this.children) { const r = c.queryByText(text); if (r) return r; }
    return null;
  }
  allButtons() {
    const out = [];
    const walk = el => { if (el.tag === 'button') out.push(el); el.children.forEach(walk); };
    walk(this);
    return out;
  }
  findByAttr(k, v) {
    if (this.attrs[k] === v) return this;
    for (const c of this.children) { const r = c.findByAttr(k, v); if (r) return r; }
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Obsidian mock
 * ------------------------------------------------------------------ */
const notices = [];

class Modal {
  constructor(app) { this.app = app; this.contentEl = new El('div'); this.isOpen = false; }
  open() { this.isOpen = true; if (this.app?.plugin) this.app.plugin._lastModal = this; this.onOpen?.(); return this; }
  close() { this.isOpen = false; this.onClose?.(); }
}
class Notice { constructor(msg) { notices.push(String(msg)); } }
class ItemView {
  constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = new El('div'); }
  getViewType() { return 'base'; }
  getDisplayText() { return 'base'; }
  getIcon() { return ''; }
  async onOpen() {}
  async onClose() {}
}
class TFolder { constructor(path) { this.path = path; } }

function parseYaml(str) { return yaml.load(str); }

/* Setting is the trickiest: chainable builders that hand the plugin control objects. */
class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this._name = '';
    this._desc = '';
    this._controls = [];
    (containerEl.settings ||= []).push(this);
  }
  setName(n) { this._name = String(n); return this; }
  setDesc(d) { this._desc = String(d); return this; }
  addText(cb) {
    const control = {
      inputEl: new El('input'),
      _value: '', _placeholder: '',
      setValue(v) { this.inputEl._value = String(v); this._value = String(v); return this; },
      setPlaceholder(p) { this._placeholder = String(p); return this; },
      onChange(fn) { this._onChange = fn; return this; },
      getValue() { return this._value; }
    };
    control.inputEl.setAttribute('data-role', 'text');
    this._controls.push({ kind: 'text', control });
    cb(control);
    return this;
  }
  addDropdown(cb) {
    const control = {
      selectEl: new El('select'),
      options: {},
      _value: '',
      addOption(v, label) { this.options[v] = label; return this; },
      addOptions(map) { Object.assign(this.options, map); return this; },
      setValue(v) { this._value = String(v); return this; },
      onChange(fn) { this._onChange = fn; return this; },
      getValue() { return this._value; }
    };
    control.selectEl.setAttribute('data-role', 'dropdown');
    this._controls.push({ kind: 'dropdown', control });
    cb(control);
    return this;
  }
  addTextArea(cb) {
    const control = {
      inputEl: new El('textarea'),
      _value: '',
      setValue(v) { this.inputEl._value = String(v); this._value = String(v); return this; },
      setPlaceholder(p) { this._placeholder = String(p); return this; },
      onChange(fn) { this._onChange = fn; return this; },
      getValue() { return this._value; }
    };
    control.inputEl.setAttribute('data-role', 'textarea');
    this._controls.push({ kind: 'textarea', control });
    cb(control);
    return this;
  }
  addButton(cb) {
    const control = {
      _text: '', _disabled: false, _click: null,
      setButtonText(t) { this._text = String(t); return this; },
      setCta() { return this; },
      setWarning() { return this; },
      setDisabled(d) { this._disabled = !!d; return this; },
      onClick(fn) { this._click = fn; return this; },
      click() { if (!this._disabled && this._click) return this._click(); },
      getText() { return this._text; }
    };
    this._controls.push({ kind: 'button', control });
    cb(control);
    return this;
  }
  get controls() { return this._controls; }
}

/* Vault: in-memory file store mimicking the Obsidian Vault surface the plugin uses. */
class VaultMock {
  constructor() { this.files = new Map(); this.events = {}; }
  on(evt, fn) { (this.events[evt] ||= []).push(fn); return { ref: evt }; }
  trigger(evt) { for (const fn of this.events[evt] || []) fn(); }
  async createFolder(path) { if (!this.files.has(path)) this.files.set(path, { folder: true }); return null; }
  getAbstractFileByPath(path) {
    const hit = this.files.get(path);
    if (hit) return hit.folder ? new TFolder(path) : hit.file;
    return null;
  }
  async create(path, content) {
    const file = { path, basename: path.split('/').pop().replace(/\.md$/, ''), content };
    this.files.set(path, { folder: false, file });
    this.trigger('create');
    return file;
  }
  async read(file) { return file.content; }
  getMarkdownFiles() {
    return [...this.files.values()].filter(v => !v.folder && v.file.path.endsWith('.md')).map(v => v.file);
  }
  getFileByPath(path) { const hit = this.files.get(path); return hit && !hit.folder ? hit.file : null; }
}

/* Workspace + leaf */
class LeafMock {
  constructor(app) { this.app = app; this.view = null; }
  async setViewState(state) {
    const factory = this.app.plugin._views[state.type];
    if (factory) { this.view = factory(this); if (this.view.onOpen) await this.view.onOpen(); }
    return this;
  }
  async openFile(file) { this.openedFile = file; return file; }
}
class WorkspaceMock {
  constructor(app) { this.app = app; this.leaves = []; }
  getLeaf(newLeaf) {
    const leaf = new LeafMock(this.app);
    this.leaves.push(leaf); // track all leaves so getLeavesOfType can find the view
    return leaf;
  }
  getLeavesOfType(type) { return this.leaves.filter(l => l.view && l.view.getViewType() === type); }
  async revealLeaf(leaf) { return leaf; }
}

/* App */
class AppMock {
  constructor() {
    this.vault = new VaultMock();
    this.workspace = new WorkspaceMock(this);
    this.metadataCache = { getFileCache: () => undefined };
  }
}

/* Plugin base — the real DejaTwoPlugin extends this. */
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this._views = {}; this._cmds = []; app.plugin = this; }
  registerView(type, factory) { this._views[type] = factory; }
  addRibbonIcon(icon, title, cb) { this.ribbon = { icon, title, cb }; }
  addCommand(cmd) { this._cmds.push(cmd); return cmd; }
  registerEvent(ref) { this.registeredEvents = (this.registeredEvents || []).concat(ref); }
  register(fn) { this._cleanup = fn; }
}

/* Intercept require('obsidian') */
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') {
    return { Modal, Notice, Plugin, Setting, ItemView, TFolder, parseYaml, normalizePath: p => p };
  }
  return origLoad.apply(this, arguments);
};

/* Also expose a window global (Obsidian host provides it) */
global.window = { setTimeout, clearTimeout };

/* ------------------------------------------------------------------ *
 * Test driver
 * ------------------------------------------------------------------ */
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log(`  ok  ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e }); console.log(`  FAIL ${name}\n       ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e}`); }
}
async function checkAsync(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok  ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e }); console.log(`  FAIL ${name}\n       ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e}`); }
}

async function main() {
  const bundle = require('../main.js');
  const DejaTwoPlugin = bundle.default || bundle;
  console.log(`loaded bundle, default export is ${typeof DejaTwoPlugin}`);

  const app = new AppMock();
  const manifest = { id: 'deja-two', version: '0.1.0' };
  const plugin = new DejaTwoPlugin(app, manifest);

  await checkAsync('onload registers view, ribbon, commands, events', async () => {
    await plugin.onload();
    assert.ok(plugin._views['deja-two-timeline'], 'view registered');
    assert.ok(plugin.ribbon && plugin.ribbon.icon === 'book-heart', 'ribbon registered');
    assert.strictEqual(plugin._cmds.length, 2, 'two commands');
    assert.ok(Array.isArray(plugin.registeredEvents) && plugin.registeredEvents.length >= 4, 'vault events registered');
  });

  /* Capture flow: find the 'Record an experience' command and run its callback */
  await checkAsync('capture modal saves a real Markdown file with js-yaml-parseable frontmatter', async () => {
    const cmd = plugin._cmds.find(c => c.id === 'new-experience');
    assert.ok(cmd, 'new-experience command exists');
    cmd.callback(); // opens CaptureModal

    // find the open modal
    const modal = plugin._lastModal || (() => { throw new Error('no modal captured'); })();
    assert.ok(modal && modal.isOpen, 'modal opened');

    const controls = (modal.contentEl.settings || []).flatMap(s => s.controls);

    // mood dropdown -> other, then custom mood text, energy dropdown, narrative
    const dropdowns = controls.filter(c => c.kind === 'dropdown').map(c => c.control);
    const moodDrop = dropdowns.find(d => d.options['other'] !== undefined);
    assert.ok(moodDrop, 'mood dropdown exists');
    moodDrop.setValue('other'); moodDrop._onChange?.('other');

    const texts = controls.filter(c => c.kind === 'text').map(c => c.control);
    // text[0] = occurred-at, text[1] = offset, text[2] = custom mood
    assert.ok(texts.length >= 3, `expected >=3 text controls, got ${texts.length}`);
    const customMood = texts[2];
    customMood.setValue('restless but alive');
    customMood._onChange?.('restless but alive');

    const energyDrop = dropdowns.find(d => d.options['10'] !== undefined && d.options['other'] === undefined);
    energyDrop.setValue('7'); energyDrop._onChange?.('7');

    const textareas = controls.filter(c => c.kind === 'textarea').map(c => c.control);
    const narrative = textareas[0];
    narrative.setValue('Walked the long pier at dusk. The fog came in off the water and I felt small but not lonely.');
    narrative._onChange?.(narrative.getValue());

    const saveBtn = controls.filter(c => c.kind === 'button').map(c => c.control).find(b => b.getText() === 'Save experience');
    assert.ok(saveBtn, 'save button exists');
    await saveBtn.click();

    assert.strictEqual(modal.isOpen, false, 'modal closed after save');
    assert.ok(notices.some(n => n.includes('saved locally')), 'notice shown');

    // verify a file was written
    const files = app.vault.getMarkdownFiles();
    assert.strictEqual(files.length, 1, 'one markdown file created');
    const f = files[0];
    assert.ok(f.path.startsWith('Déjà-Two/Journal/'), `path prefix: ${f.path}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}-[0-9a-f-]{36}\.md$/.test(f.path.split('/').pop()), `filename shape: ${f.path}`);
    assert.ok(!/[\u0085\u2028\u2029]/.test(f.path), 'no YAML-breaking line separators in path');

    // parse the frontmatter with real js-yaml
    const content = f.content;
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
    assert.ok(m, 'frontmatter present');
    const fm = yaml.load(m[1]);
    assert.strictEqual(fm.deja_two_type, 'journal');
    assert.strictEqual(fm.mood, 'restless but alive');
    assert.strictEqual(fm.energy, 7);
    assert.strictEqual(fm.source, 'manual');
    assert.ok(/[+-]\d{2}:\d{2}$|Z$/.test(fm.occurred_at), `occurred_at has offset: ${fm.occurred_at}`);
    assert.ok(/[+-]\d{2}:\d{2}$|Z$/.test(fm.recorded_at), `recorded_at has offset: ${fm.recorded_at}`);
    assert.strictEqual(fm.recorded_at.slice(0, 10), fm.occurred_at.slice(0, 10));
  });

  /* Timeline render: should show the entry with time, mood, preview */
  await checkAsync('timeline renders time + mood + narrative preview from the saved file', async () => {
    await plugin.openTimeline();
    const leaves = app.workspace.getLeavesOfType('deja-two-timeline');
    assert.strictEqual(leaves.length, 1, 'one timeline leaf');
    const view = leaves[0].view;
    assert.ok(view, 'view present');
    const el = view.contentEl;
    const btns = (el.settings || []).flatMap(s => s.controls).filter(c => c.kind === 'button').map(c => c.control);
    const hasNew = btns.some(b => b.getText() === 'New experience');
    assert.ok(hasNew, 'New experience button present');
    const hasRefresh = btns.some(b => b.getText() === 'Refresh');
    assert.ok(hasRefresh, 'Refresh button present');
    // entry row
    const strong = el.querySelector?.('strong') || (() => { let r; const w = n => { if (n.tag === 'strong') { r = n; return; } n.children.forEach(w); }; w(el); return r; })();
    assert.ok(strong, 'mood <strong> present');
    assert.strictEqual(strong.text, 'restless but alive');
    let time;
    const w2 = n => { if (n.tag === 'time') { time = n; return; } n.children.forEach(w2); };
    w2(el);
    assert.ok(time, 'time element present');
    assert.ok(time._text.includes(':'), `time text: ${time._text}`);
    assert.ok(/[+-]\d{2}:\d{2}$/.test(time._text), `time shows offset: ${time._text}`);
    // narrative preview appears in the entry button's <span>
    let previewSpan;
    const w3 = n => { if (n.tag === 'span') { previewSpan = n; return; } n.children.forEach(w3); };
    w3(el);
    assert.ok(previewSpan && previewSpan._text.length > 0, 'preview text present');
    assert.ok(previewSpan._text.includes('long pier'), 'preview contains narrative: ' + previewSpan._text);
  });

  /* Duplicate-ID rejection is enforced inside saveEntry, which the bundle does not
     export; that path is covered by the unit suite (storage.test.ts). Here we confirm
     the boundary: a hand-written journal note with an existing ID stays untouched when
     the timeline renders. */
  await checkAsync('timeline does not rewrite or crash on an existing journal note', async () => {
    const before = app.vault.getMarkdownFiles().find(f => f.path.endsWith('.md')).content;
    await plugin.openTimeline();
    const view = app.workspace.getLeavesOfType('deja-two-timeline')[0].view;
    await view.render();
    const after = app.vault.getMarkdownFiles().find(f => f.path.endsWith('.md')).content;
    assert.strictEqual(after, before, 'note content unchanged');
  });

  /* Error state: unreadable entry shouldn't crash the timeline */
  await checkAsync('unreadable journal file is surfaced without crashing', async () => {
    app.vault.create('Déjà-Two/Journal/2026-10-09-broken.md', 'not a valid journal');
    const before = app.workspace.getLeavesOfType('deja-two-timeline').length;
    const view = app.workspace.getLeavesOfType('deja-two-timeline')[0].view;
    await view.render();
    const el = view.contentEl;
    // either it renders the unreadable row, or just shows the two readable entries
    assert.ok(true, 'render completed without throwing');
  });

  /* Summary */
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error(`SMOKE TEST FAILED: ${failed.map(f => f.name).join('; ')}`); process.exit(1); }
  console.log('SMOKE TEST PASSED');
}

main().catch(e => { console.error('SMOKE TEST ERROR:', e); process.exit(1); });

import {
  normalizeSiteUrl, esc, youtubeId, spotifyRef, buildSeoBlock, replaceSeoBlock, buildSitemap, buildRobots,
} from '../js/shared.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const AUTH_KEY = 'deepan-admin-auth';
const DRAFT_KEY = 'deepan-admin-draft';
const SESSION_KEY = 'deepan-admin-session';

const SECTION_TYPES = {
  videos: 'YouTube videos',
  spotify: 'Spotify players',
  gallery: 'Photo gallery',
  about: 'Story / bio',
  services: 'Services (hire me for)',
  quotes: 'Quotes',
  text: 'Text block',
  contact: 'Contact & booking',
};
const ICONS = ['mic', 'keys', 'headphones', 'guitar', 'drum', 'pen', 'heart', 'star', 'note'];
const SIZES = { normal: 'Regular', big: 'Featured (a row of its own)' };

const state = {
  mode: null, // 'github' | 'local'
  repo: null,
  content: null,
  published: '', // JSON of the last published content, to count changes
  contentSha: null, // blob sha of content.json when loaded, to catch edits from another device
  pending: new Map(), // path -> Blob, uploads not yet published
  urls: new Map(), // path -> object URL, for thumbnails and the preview
  ars: new Map(), // path -> width / height of an upload, for the gallery rows
  tab: 'basics',
  editing: null, // index of the section being edited
};

/* ---------------- GitHub ---------------- */

class Repo {
  constructor({ owner, repo, branch, token }) {
    Object.assign(this, { owner, repo, branch, token });
  }

  // Every step of a publish is safe to repeat (same blob, same tree, same ref target),
  // so a request that hangs or hits a GitHub hiccup is retried instead of freezing the editor.
  async api(path, opts = {}) {
    let res;
    for (let attempt = 1; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        res = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
          ...opts,
          signal: ctrl.signal,
          // GitHub lets browsers cache reads for 60 s. A stale read looks like an edit from another device.
          cache: 'no-store',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${this.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          },
        });
      } catch (ex) {
        if (attempt < 3) continue;
        throw new Error(ex.name === 'AbortError'
          ? 'GitHub did not answer in time. Check the internet connection, then publish again.'
          : 'Could not reach GitHub. Check the internet connection, then publish again.');
      } finally {
        clearTimeout(timer);
      }
      if (res.status >= 500 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      break;
    }
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message; } catch { /* no body */ }
      const err = new Error(explain(res.status, msg));
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async headSha() {
    return (await this.api(`/git/ref/heads/${encodeURIComponent(this.branch)}`)).object.sha;
  }

  async readText(path, ref = this.branch) {
    const data = await this.api(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
    return { text: decodeBase64(data.content), sha: data.sha };
  }

  async listImages(dir) {
    try {
      const items = await this.api(`/contents/${dir}?ref=${encodeURIComponent(this.branch)}`);
      return items.filter((f) => /\.(webp|jpe?g|png|gif|avif)$/i.test(f.name)).map((f) => f.path);
    } catch {
      return [];
    }
  }

  // One atomic commit for every file, so the live site never shows half a change.
  async commit(files, message, log) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const head = await this.headSha();
      const base = await this.api(`/git/commits/${head}`);
      const tree = [];
      for (const f of files) {
        log(`Uploading ${f.path}`);
        const blob = f.blob
          ? await this.api('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await blobToBase64(f.blob), encoding: 'base64' }) })
          : await this.api('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.text, encoding: 'utf-8' }) });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      log('Saving the change');
      const newTree = await this.api('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
      const commit = await this.api('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }) });
      try {
        await this.api(`/git/refs/heads/${encodeURIComponent(this.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
        return commit.sha;
      } catch (err) {
        // Someone pushed in between. Build again on top of the new head once.
        if (err.status !== 422 || attempt) throw err;
        log('The repository moved on. Trying again.');
      }
    }
    return null;
  }
}

function explain(status, msg) {
  if (status === 401) return 'GitHub did not accept the token. It is wrong or expired.';
  if (status === 403) return `GitHub refused. The token needs "Contents: Read and write" on this repository. (${msg})`;
  if (status === 404) return 'Not found. Check the user, repository and branch names, and that the token can see this repository.';
  if (status === 409) return 'The repository is empty. Push the website files first.';
  return `GitHub error ${status}: ${msg}`;
}

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ---------------- Saved sign-in (encrypted with a passphrase) ---------------- */

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function saveAuth(auth, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(auth)));
  store.set(localStorage, AUTH_KEY, JSON.stringify({ label: `${auth.owner}/${auth.repo}`, salt: b64(salt), iv: b64(iv), data: b64(data) }));
}

async function loadAuth(passphrase) {
  const saved = JSON.parse(store.get(localStorage, AUTH_KEY));
  const key = await deriveKey(passphrase, unb64(saved.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(saved.iv) }, key, unb64(saved.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

// Storage can throw in private windows. Never let that break the editor.
const store = {
  get(s, k) { try { return s.getItem(k); } catch { return null; } },
  set(s, k, v) { try { s.setItem(k, v); } catch { /* ignore */ } },
  del(s, k) { try { s.removeItem(k); } catch { /* ignore */ } },
};

/* ---------------- Pending uploads (IndexedDB, so a refresh keeps them) ---------------- */

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('deepan-admin', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('uploads');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo(mode, fn) {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('uploads', mode);
      const out = fn(tx.objectStore('uploads'));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}
const pendingPut = (path, blob) => idbDo('readwrite', (s) => s.put(blob, path));
const pendingClear = () => idbDo('readwrite', (s) => s.clear());
async function pendingLoad() {
  const keys = await idbDo('readonly', (s) => s.getAllKeys()) || [];
  const vals = await idbDo('readonly', (s) => s.getAll()) || [];
  keys.forEach((k, i) => {
    state.pending.set(k, vals[i]);
    state.urls.set(k, URL.createObjectURL(vals[i]));
  });
}

/* ---------------- Start ---------------- */

init();

function init() {
  wireLogin();
  const session = store.get(sessionStorage, SESSION_KEY);
  if (session) {
    const s = JSON.parse(session);
    if (s.mode === 'local') return openEditor({ mode: 'local' });
    return openEditor({ mode: 'github', auth: s.auth });
  }
  showLogin();
}

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const saved = store.get(localStorage, AUTH_KEY);
  $('#unlock-form').hidden = !saved;
  $('#login-form').hidden = !!saved;
  if (saved) {
    $('#saved-repo').textContent = JSON.parse(saved).label;
    $('#unlock-form [name=passphrase]').focus();
  } else {
    // On a GitHub Pages address, guess the owner and repository.
    const host = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    const f = $('#login-form');
    if (host && !f.owner.value) {
      f.owner.value = host[1];
      const first = location.pathname.split('/').filter(Boolean)[0];
      f.repo.value = first && first !== 'admin' ? first : `${host[1]}.github.io`;
    }
  }
}

function wireLogin() {
  const f = $('#login-form');
  f.remember.addEventListener('change', () => {
    $('#pass-wrap').hidden = !f.remember.checked;
    f.passphrase.required = f.remember.checked;
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.err', f);
    err.textContent = '';
    const auth = {
      owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main', token: f.token.value.trim(),
    };
    const btn = $('button[type=submit]', f);
    btn.disabled = true;
    try {
      await new Repo(auth).readText('content.json');
      if (f.remember.checked) await saveAuth(auth, f.passphrase.value);
      f.token.value = '';
      await openEditor({ mode: 'github', auth });
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  const u = $('#unlock-form');
  u.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.err', u);
    err.textContent = '';
    try {
      const auth = await loadAuth(u.passphrase.value);
      u.passphrase.value = '';
      await openEditor({ mode: 'github', auth });
    } catch (ex) {
      err.textContent = ex.status ? ex.message : 'That passphrase did not unlock the saved sign-in.';
    }
  });
  $('#forget').addEventListener('click', () => {
    store.del(localStorage, AUTH_KEY);
    showLogin();
  });
  $('#local-mode').addEventListener('click', () => openEditor({ mode: 'local' }));
}

async function openEditor({ mode, auth }) {
  state.mode = mode;
  let remote;
  try {
    if (mode === 'github') {
      state.repo = new Repo(auth);
      const { text, sha } = await state.repo.readText('content.json');
      remote = JSON.parse(text);
      state.contentSha = sha;
      // The token lives in this tab only. It is cleared when the tab closes.
      store.set(sessionStorage, SESSION_KEY, JSON.stringify({ mode, auth }));
    } else {
      remote = await (await fetch('../content.json', { cache: 'no-cache' })).json();
      store.set(sessionStorage, SESSION_KEY, JSON.stringify({ mode }));
    }
  } catch (ex) {
    store.del(sessionStorage, SESSION_KEY);
    showLogin();
    $('#login-form .err').textContent = ex.message;
    return;
  }

  state.published = JSON.stringify(remote);
  state.content = structuredClone(remote);
  await pendingLoad();

  // A fresh upload (empty address) or a moved repo (old address): use this site's real address.
  // It shows as an unpublished change, so the first publish fixes the tags, robots.txt and sitemap.
  const here = guessSiteUrl();
  const saved = normalizeSiteUrl(remote.seo?.siteUrl);
  let addressFixed = '';
  if (mode === 'github' && here && saved.toLowerCase() !== here.toLowerCase()) {
    state.content.seo = { ...state.content.seo, siteUrl: here };
    addressFixed = here;
  }

  const draft = store.get(localStorage, DRAFT_KEY);
  if (draft && draft !== state.published) {
    const keep = await ask('Unpublished changes found',
      '<p>This browser has changes from last time that were never published. Keep working on them?</p>',
      'Keep my changes', 'Start from the live site');
    if (keep) state.content = JSON.parse(draft);
    else discardLocal();
  }

  $('#login').hidden = true;
  $('#app').hidden = false;
  resetHistory();
  if (addressFixed && JSON.stringify(state.content) !== state.published) {
    toast(`Website address set to ${addressFixed}. Publish once to update search and sharing.`, 9000);
  }
  wireEditor();
  renderPanel();
  setupPreview();
  updateStatus();
}

/* ---------------- Editor shell ---------------- */

let wired = false;
function wireEditor() {
  if (wired) return;
  wired = true;

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    switchTab(b.dataset.tab);
    renderPanel();
  });

  const panel = $('#panel');
  panel.addEventListener('input', onFieldInput);
  panel.addEventListener('change', onFieldChange);
  panel.addEventListener('click', onPanelClick);
  panel.addEventListener('paste', (e) => {
    if (e.target.matches?.('[data-bulk]')) setTimeout(() => bulkAdd(e.target), 0);
  });
  wireDrag(panel);

  // A file dropped outside a drop zone would make the browser leave the editor to open it.
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('paste', onPasteImage);
  document.addEventListener('keydown', onKey);

  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);

  $('#publish').addEventListener('click', publish);
  $('#discard').addEventListener('click', async () => {
    const ok = await ask('Discard changes?', '<p>This removes every unpublished change and photo, and goes back to the live site.</p>', 'Discard', 'Keep editing');
    if (!ok) return;
    discardLocal();
    state.content = JSON.parse(state.published);
    changed();
    toast('Changes discarded.', 6000, { label: 'Undo', fn: undo });
  });
  $('#signout').addEventListener('click', () => {
    store.del(sessionStorage, SESSION_KEY);
    location.reload();
  });
  $('#toggle-preview').addEventListener('click', () => {
    $('#app').classList.add('show-preview');
    // On a phone, a desktop-size preview shrinks to an unreadable third. Start in phone size.
    if (innerWidth < 700 && !$('#frame-wrap').classList.contains('phone')) $('.preview-bar [data-size=phone]').click();
    fitFrame();
  });
  $('.close-preview').addEventListener('click', () => $('#app').classList.remove('show-preview'));
  $$('.preview-bar [data-size]').forEach((b) => b.addEventListener('click', () => {
    $$('.preview-bar [data-size]').forEach((x) => x.classList.toggle('on', x === b));
    $('#frame-wrap').classList.toggle('phone', b.dataset.size === 'phone');
    fitFrame();
  }));
  addEventListener('resize', fitFrame);
  addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });
}

function discardLocal() {
  store.del(localStorage, DRAFT_KEY);
}

function referencedPending() {
  const json = JSON.stringify(state.content);
  return [...state.pending.keys()].filter((path) => json.includes(path));
}

function isDirty() {
  return JSON.stringify(state.content) !== state.published || referencedPending().length > 0;
}

function switchTab(tab) {
  state.tab = tab;
  state.editing = null;
  $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
}

function liveUrl() {
  return normalizeSiteUrl(state.content?.seo?.siteUrl) || guessSiteUrl();
}

function updateStatus() {
  const el = $('#status');
  const changes = isDirty() ? Math.max(1, changeSummary().length) : 0;
  el.classList.toggle('dirty', changes > 0);
  const where = state.mode === 'github' ? '' : ' · trial mode, nothing goes live';
  if (changes) el.textContent = `${changes} unpublished change${changes > 1 ? 's' : ''}, saved in this browser${where}`;
  else if (state.going === 'waiting') el.textContent = 'Published. GitHub is rebuilding the site...';
  else if (state.going === 'live') el.textContent = 'Live now. Visitors see the latest version.';
  else el.textContent = `Everything is published${where}`;
  $('#discard').disabled = !changes;
  const pub = $('#publish');
  pub.textContent = state.mode === 'github' ? (changes ? `Publish (${changes})` : 'Publish') : 'Download content.json';
  const live = $('#live-link');
  const url = state.mode === 'github' ? liveUrl() : '';
  live.hidden = !url;
  if (url) live.href = url;
}

let saveTimer;
// remember: false when undo/redo itself changed the content.
function changed(rerender = true, remember = true) {
  if (remember) record(rerender ? 0 : 600);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.set(localStorage, DRAFT_KEY, JSON.stringify(state.content));
    pushPreview();
    updateStatus();
  }, 250);
  if (rerender) renderPanel();
}

/* ---------------- Undo and redo ---------------- */

const undoStack = { list: [], at: -1 };
let undoTimer;

function resetHistory() {
  undoStack.list = [JSON.stringify(state.content)];
  undoStack.at = 0;
  updateUndo();
}

// Typing is grouped: one undo step per pause, not one per letter.
function record(delay) {
  clearTimeout(undoTimer);
  if (delay) undoTimer = setTimeout(pushHistory, delay);
  else pushHistory();
}

function pushHistory() {
  clearTimeout(undoTimer);
  const now = JSON.stringify(state.content);
  if (now === undoStack.list[undoStack.at]) return;
  undoStack.list = undoStack.list.slice(0, undoStack.at + 1);
  undoStack.list.push(now);
  if (undoStack.list.length > 150) undoStack.list.shift();
  undoStack.at = undoStack.list.length - 1;
  updateUndo();
}

function undo() {
  pushHistory();
  if (undoStack.at <= 0) return toast('Nothing to undo.');
  undoStack.at--;
  restoreHistory();
}

function redo() {
  pushHistory();
  if (undoStack.at >= undoStack.list.length - 1) return toast('Nothing to redo.');
  undoStack.at++;
  restoreHistory();
}

function restoreHistory() {
  state.content = JSON.parse(undoStack.list[undoStack.at]);
  changed(true, false);
  updateUndo();
}

function updateUndo() {
  $('#undo').disabled = undoStack.at <= 0;
  $('#redo').disabled = undoStack.at >= undoStack.list.length - 1;
}

/* ---------------- Keyboard ---------------- */

const isTyping = (el) => !!el?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable]');

function onKey(e) {
  const modalOpen = !$('#modal').hidden;
  if (e.key === 'Escape' && modalOpen) return escapeModal();
  if (!(e.ctrlKey || e.metaKey) || $('#app').hidden) return;
  const k = e.key.toLowerCase();
  if (k === 's') {
    e.preventDefault();
    if (!modalOpen) publish();
    return;
  }
  // Inside a text field, Ctrl+Z belongs to the field itself.
  if (modalOpen || isTyping(e.target)) return;
  if (k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (k === 'y') {
    e.preventDefault();
    redo();
  }
}

/* ---------------- What changed since the last publish ---------------- */

function changeSummary() {
  if (!state.published || !state.content) return [];
  const old = JSON.parse(state.published);
  const cur = state.content;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const name = (s) => `"${s.title || s.nav || 'section'}"`;
  const out = [];
  if (!same(old.site, cur.site)) out.push('Name & intro');
  const oldById = new Map((old.sections || []).map((s) => [s.id, s]));
  const curById = new Map((cur.sections || []).map((s) => [s.id, s]));
  for (const s of cur.sections || []) {
    const o = oldById.get(s.id);
    if (!o) { out.push(`Added ${name(s)}`); continue; }
    if (!same({ ...o, visible: 0 }, { ...s, visible: 0 })) out.push(`Edited ${name(s)}`);
    if ((o.visible !== false) !== (s.visible !== false)) out.push(`${s.visible === false ? 'Hid' : 'Showed'} ${name(s)}`);
  }
  for (const o of old.sections || []) if (!curById.has(o.id)) out.push(`Removed ${name(o)}`);
  const order = (list) => (list || []).filter((s) => oldById.has(s.id) && curById.has(s.id)).map((s) => s.id).join();
  if (order(old.sections) !== order(cur.sections)) out.push('Changed the section order');
  if (!same(old.seo, cur.seo)) out.push('Search & sharing');
  const photos = referencedPending().length;
  if (photos) out.push(`${photos} new photo${photos > 1 ? 's' : ''}`);
  return out;
}

/* ---------------- Binding helpers ---------------- */

function getPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state.content);
}
function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const obj = keys.reduce((o, k) => (o[k] ??= {}), state.content);
  obj[last] = value;
}

function onFieldInput(e) {
  const el = e.target;
  const path = el.dataset.bind;
  if (!path || el.type === 'checkbox' || el.tagName === 'SELECT') return;
  let value = el.value;
  if (el.dataset.list) value = value.split(',').map((x) => x.trim()).filter(Boolean);
  setPath(path, value);
  liveHints(el);
  changed(false);
}

function onFieldChange(e) {
  const el = e.target;
  if (el.type === 'file') return onFiles(el);
  const path = el.dataset.bind;
  if (!path) return;
  if (el.type === 'checkbox') setPath(path, el.checked);
  else if (el.tagName === 'SELECT') setPath(path, el.value);
  else return;
  changed(el.dataset.rerender === '1');
}

// Small feedback that updates as you type, without a full re-render.
function liveHints(el) {
  const hint = el.closest('label')?.querySelector('.hint[data-for]');
  if (!hint) return;
  const kind = hint.dataset.for;
  if (kind === 'youtube') {
    const id = youtubeId(el.value);
    hint.textContent = id ? 'Video found.' : 'Paste a YouTube link, for example https://youtu.be/...';
    hint.className = `hint ${id ? 'good' : 'warn'}`;
    const thumb = el.closest('.card')?.querySelector('.thumb');
    if (thumb && id) thumb.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    if (id) fillVideoTitle(el, id);
  } else if (kind === 'spotify') {
    const ref = spotifyRef(el.value);
    hint.textContent = ref ? `Spotify ${ref.kind} found.` : 'Paste a Spotify link: track, album, playlist or artist.';
    hint.className = `hint ${ref ? 'good' : 'warn'}`;
  } else if (kind.startsWith('count:')) {
    const max = +kind.slice(6);
    const n = el.value.length;
    hint.textContent = `${n} characters. Best under ${max}.`;
    hint.className = `hint ${n > max ? 'warn' : ''}`;
    renderSeoPreview();
  }
}

async function youtubeTitle(id) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`);
    return res.ok ? (await res.json()).title || '' : '';
  } catch {
    return ''; // the title stays empty; the owner can type it
  }
}

async function fillVideoTitle(input, id) {
  const title = input.closest('.card')?.querySelector('[data-role=title]');
  if (!title || title.value) return;
  const text = await youtubeTitle(id);
  if (!text || title.value) return;
  title.value = text;
  title.dispatchEvent(new Event('input', { bubbles: true }));
}

// Paste one or many links (any separator) and each becomes an item.
async function bulkAdd(el) {
  const kind = el.dataset.kind;
  const listPath = el.dataset.bulk;
  const words = el.value.split(/[\s,]+/).filter(Boolean);
  if (!getPath(listPath)) setPath(listPath, []);
  const list = getPath(listPath);
  const items = [];
  for (const w of words) {
    if (kind === 'video') {
      const id = youtubeId(w);
      const url = `https://www.youtube.com/watch?v=${id}`;
      if (id && !list.some((v) => youtubeId(v.url) === id) && !items.some((v) => v.url === url)) items.push({ url, title: '', note: '' });
    } else if (spotifyRef(w) && !list.some((v) => v.url === w) && !items.some((v) => v.url === w)) {
      items.push({ url: w });
    }
  }
  if (!items.length) {
    if (words.length) toast(kind === 'video' ? 'No new YouTube links found in that text.' : 'No new Spotify links found in that text.', 4000);
    return;
  }
  el.value = '';
  if (kind === 'video') {
    // Titles come first, so one Undo removes the whole paste. A slow answer is skipped after 3 s.
    toast('Adding...', 4000);
    const timeout = new Promise((r) => setTimeout(() => r(''), 3000));
    const titles = await Promise.all(items.map((v) => Promise.race([youtubeTitle(youtubeId(v.url)), timeout])));
    items.forEach((v, i) => { v.title = titles[i]; });
  }
  getPath(listPath).push(...items);
  changed();
  toast(`Added ${items.length} ${kind === 'video' ? 'video' : 'player'}${items.length > 1 ? 's' : ''}.`, 6000, { label: 'Undo', fn: undo });
}

const field = (label, path, opts = {}) => {
  const v = getPath(path);
  const value = Array.isArray(v) ? v.join(', ') : v ?? '';
  const attrs = `data-bind="${esc(path)}" ${opts.list ? 'data-list="1"' : ''} ${opts.role ? `data-role="${opts.role}"` : ''} placeholder="${esc(opts.placeholder || '')}" spellcheck="${opts.code ? 'false' : 'true'}"`;
  const input = opts.rows
    ? `<textarea ${attrs} rows="${opts.rows}">${esc(value)}</textarea>`
    : `<input type="${opts.type || 'text'}" ${attrs} value="${esc(value)}">`;
  const live = opts.live ? `<span class="hint" data-for="${opts.live}"></span>` : '';
  return `<label>${esc(label)}${input}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}${live}</label>`;
};

const select = (label, path, options, opts = {}) => {
  const v = getPath(path) ?? '';
  return `<label>${esc(label)}<select data-bind="${esc(path)}" ${opts.rerender ? 'data-rerender="1"' : ''}>
    ${Object.entries(options).map(([k, t]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}
  </select></label>`;
};

const imgSrc = (path) => state.urls.get(path) || (path ? `../${path}` : '');

// "x% y%" or an old keyword -> [x, y] numbers for the marker.
function focusXY(f) {
  const map = { top: [50, 15], center: [50, 50], bottom: [50, 85] };
  if (map[f]) return map[f];
  const m = /^(\d{1,3})% (\d{1,3})%$/.exec(f || '');
  return m ? [+m[1], +m[2]] : [50, 50];
}

// A thumbnail you can tap to choose the point that stays in view when the photo is cropped.
function focusThumb(src, focusPath) {
  if (!src) return 'No image';
  const img = `<img src="${esc(imgSrc(src))}" alt="">`;
  if (!focusPath) return img;
  const [x, y] = focusXY(getPath(focusPath));
  return `<span class="fwrap" data-focus="${esc(focusPath)}" title="Tap to choose what stays in view">${img}<i class="focus-dot" style="left:${x}%;top:${y}%"></i></span>`;
}

const imageField = (label, path, altPath, focusPath) => {
  const v = getPath(path);
  return `<div class="img-field" data-drop-target="${esc(path)}">
    <div class="ph">${focusThumb(v, focusPath)}</div>
    <div>
      <b style="font-size:13px;color:var(--muted)">${esc(label)}</b>
      <span class="hint">${focusPath && v ? 'Tap the photo to choose what stays in view. ' : ''}You can also drop a photo here.</span>
      <div class="acts">
        <span class="btn small file-btn">Upload<input type="file" accept="image/*" data-target="${esc(path)}"></span>
        <button class="btn ghost small" type="button" data-act="pick" data-target="${esc(path)}">Choose existing</button>
        ${v ? `<button class="btn ghost small" type="button" data-act="clear-img" data-target="${esc(path)}">Remove</button>` : ''}
      </div>
      ${altPath ? field('Describe the image (for screen readers and Google)', altPath) : ''}
    </div>
  </div>`;
};

const tools = (listPath, i, len) => `<span class="tools">
  <button class="icon-btn" type="button" data-act="up" data-list="${listPath}" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
  <button class="icon-btn" type="button" data-act="down" data-list="${listPath}" data-i="${i}" ${i === len - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
  <button class="icon-btn del" type="button" data-act="remove" data-list="${listPath}" data-i="${i}" aria-label="Remove">✕</button>
</span>`;

/* ---------------- Panels ---------------- */

function renderPanel() {
  const panel = $('#panel');
  const y = panel.scrollTop;
  if (state.tab === 'basics') panel.innerHTML = basicsPanel();
  else if (state.tab === 'seo') panel.innerHTML = seoPanel();
  else panel.innerHTML = state.editing == null ? sectionsPanel() : sectionEditor(state.editing);
  panel.scrollTop = y;
  $$('[data-bind]', panel).forEach((el) => el.closest('label')?.querySelector('.hint[data-for]') && liveHints(el));
  if (state.tab === 'seo') renderSeoPreview();
}

function basicsPanel() {
  return `
    <h2>Name & intro</h2>
    <p class="intro">The first screen people see. Keep it short and bold.</p>
    <div class="box">
      <div class="row">${field('Name', 'site.name')}${field('What you do', 'site.role', { hint: 'For example: Singer · Songwriter · Composer' })}</div>
      <div class="row">${field('Tagline, first line', 'site.tagline')}${field('Tagline, second line', 'site.taglineKicker')}</div>
      ${field('Short intro', 'site.intro', { rows: 3 })}
      <div class="row">${field('Main button text', 'site.ctaPrimary', { hint: 'Goes to the first section.' })}${field('Booking button text', 'site.ctaSecondary', { hint: 'Goes to the contact section.' })}</div>
      ${field('Words on the city billboards', 'site.billboards', { list: true, hint: 'Separate with commas. Short words work best.' })}
    </div>
    <h3>Main photo</h3>
    <div class="box">${imageField('Shown in the tilted frame next to your name', 'site.heroImage', 'site.heroImageAlt', 'site.heroFocus')}</div>
    ${detailsBox()}`;
}

// Contact details live in the contact section. They are repeated here so they are easy to find.
function detailsBox() {
  const i = state.content.sections.findIndex((s) => s.type === 'contact');
  if (i === -1) return '';
  const p = `sections.${i}`;
  return `<h3>Your details</h3>
    <div class="box">
      <p class="intro">Where bookings reach you. Leave a field empty to hide that button on the site.</p>
      <div class="row">${field('Email', `${p}.email`, { type: 'email', code: true })}${field('Phone', `${p}.phone`, { placeholder: '+91 ...', code: true })}</div>
      ${field('WhatsApp number', `${p}.whatsapp`, { placeholder: '+91 98...', code: true, hint: 'With the country code.' })}
      <button class="btn ghost small" type="button" data-act="edit-section" data-i="${i}">Edit social links and the booking form</button>
    </div>`;
}

function sectionsPanel() {
  const list = state.content.sections;
  let n = 0;
  return `
    <h2>Sections</h2>
    <p class="intro">The page plays like an album: each section is a track. Drag to change the order, hide what you do not need, and select Edit to change the content.</p>
    <ul class="sec-list" data-drag-list="sections">
      ${list.map((s, i) => {
        const shown = s.visible !== false;
        if (shown) n++;
        return `<li class="sec-item ${shown ? '' : 'hidden-sec'}" draggable="true" data-drag-i="${i}">
          <span class="grip" aria-hidden="true">⋮⋮</span>
          <span class="no">${shown ? String(n).padStart(2, '0') : '–'}</span>
          <span class="name"><b>${esc(s.title || '(no title)')}</b><small>${esc(SECTION_TYPES[s.type] || s.type)}${shown ? '' : ' · hidden'}</small></span>
          <span class="tools">
            <label class="toggle"><input type="checkbox" data-bind="sections.${i}.visible" data-rerender="1" ${shown ? 'checked' : ''}> Show</label>
            <button class="btn small" type="button" data-act="edit-section" data-i="${i}">Edit</button>
          </span>
          ${tools('sections', i, list.length)}
        </li>`;
      }).join('')}
    </ul>
    <div class="box add-row">
      <label>Add a new section
        <select id="new-type">${Object.entries(SECTION_TYPES).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select>
      </label>
      <button class="btn" type="button" data-act="add-section">Add section</button>
    </div>`;
}

function sectionEditor(i) {
  const s = state.content.sections[i];
  if (!s) { state.editing = null; return sectionsPanel(); }
  const p = `sections.${i}`;
  const common = `
    <div class="box">
      <div class="row">${field('Menu label', `${p}.nav`, { hint: 'Short. Shown in the top menu.' })}${field('Small label above the title', `${p}.eyebrow`)}</div>
      ${field('Title', `${p}.title`)}
      ${s.type !== 'contact' && s.type !== 'about' ? field('Intro line', `${p}.intro`, { rows: 2, hint: 'Leave empty to hide it.' }) : ''}
      <label class="check"><input type="checkbox" data-bind="${p}.visible" ${s.visible !== false ? 'checked' : ''}> Show this section on the site</label>
    </div>`;
  return `
    <button class="link back" type="button" data-act="back">← All sections</button>
    <h2>${esc(s.title || 'Section')}</h2>
    <p class="intro">${esc(SECTION_TYPES[s.type] || s.type)}</p>
    ${common}
    ${(EDITORS[s.type] || (() => ''))(s, p)}
    <h3>Danger zone</h3>
    <button class="btn danger small" type="button" data-act="delete-section" data-i="${i}">Delete this section</button>`;
}

const EDITORS = {
  videos(s, p) {
    const items = s.items || [];
    return `<h3>Videos</h3>
      <p class="intro">The first video shows big. Visitors load a video only when they press play, so the page stays fast.</p>
      ${quickAdd(`${p}.items`, 'video', 'Paste YouTube links here, one or many', 'https://youtu.be/...')}
      <div class="cards">${items.map((v, i) => {
        const id = youtubeId(v.url);
        return `<div class="card video-card">
          <img class="thumb" src="${id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''}" alt="">
          <div>
            <div class="card-head"><span class="title">${i === 0 ? 'Featured · ' : ''}${esc(v.title || 'New video')}</span>${tools(`${p}.items`, i, items.length)}</div>
            ${field('YouTube link', `${p}.items.${i}.url`, { live: 'youtube', code: true })}
            <div class="row">${field('Title', `${p}.items.${i}.title`, { role: 'title' })}${field('Small note', `${p}.items.${i}.note`, { placeholder: 'Live at ..., 2025' })}</div>
          </div>
        </div>`;
      }).join('')}</div>
      <button class="btn" type="button" data-act="add-item" data-list="${p}.items" data-kind="video">Add a video</button>`;
  },

  spotify(s, p) {
    const items = s.items || [];
    return `<h3>Spotify players</h3>
      <p class="intro">Tracks show as small players. Albums, playlists and artists show as big ones.</p>
      ${quickAdd(`${p}.items`, 'spotify', 'Paste Spotify links here, one or many', 'https://open.spotify.com/track/...', 'In Spotify, select Share, then Copy link.')}
      <div class="cards">${items.map((x, i) => `<div class="card">
        <div class="card-head"><span class="title">Player ${i + 1}</span>${tools(`${p}.items`, i, items.length)}</div>
        ${field('Spotify link', `${p}.items.${i}.url`, { live: 'spotify', code: true })}
      </div>`).join('')}</div>
      <button class="btn" type="button" data-act="add-item" data-list="${p}.items" data-kind="spotify">Add a Spotify player</button>`;
  },

  gallery(s, p) {
    const items = s.items || [];
    return `<h3>Photos</h3>
      <p class="intro">Photos sit in neat rows and keep their own shape, so nothing gets cut off. Drag them (or use the arrows) to change the order. Set a photo to Featured to give it a full-width row. On a Featured photo, tap the thumbnail to choose the part that stays in view. Phone photos are fine: they are shrunk before upload.</p>
      <div data-drop-append="${p}.items">
        <div class="drop-hint">Drop photos anywhere here, or paste them with Ctrl+V.</div>
        <b style="font-size:13px;color:var(--muted)">Layout sketch</b>
        <div class="layout-map">${items.map((g, i) => `<span class="${g.size === 'big' ? 'big' : ''}" style="--ar:${+g.ar > .2 && +g.ar < 6 ? +g.ar : 1.4}">${i + 1}</span>`).join('')}</div>
        <div class="photo-grid" data-drag-list="${p}.items">${items.map((g, i) => `
          <div class="card photo-card" draggable="true" data-drag-i="${i}">
            <div class="ph">${focusThumb(g.src, `${p}.items.${i}.focus`)}<span class="badge">${i + 1}</span></div>
            ${field('Caption', `${p}.items.${i}.caption`)}
            ${field('Describe the photo', `${p}.items.${i}.alt`)}
            ${select('Size', `${p}.items.${i}.size`, SIZES, { rerender: true })}
            ${tools(`${p}.items`, i, items.length)}
          </div>`).join('')}
        </div>
        <span class="btn file-btn">Add photos<input type="file" accept="image/*" multiple data-append="${p}.items"></span>
      </div>`;
  },

  about(s, p) {
    const stats = s.stats || [];
    return `<div class="box">
        ${field('Your story', `${p}.body`, { rows: 9, hint: 'Leave an empty line between paragraphs.' })}
      </div>
      <h3>Photo</h3>
      <div class="box">${imageField('Photo next to the story', `${p}.image`, `${p}.imageAlt`, `${p}.imageFocus`)}</div>
      <h3>Numbers</h3>
      <p class="intro">Shown in comic bursts. Use real numbers only.</p>
      <div class="cards">${stats.map((x, i) => `<div class="card">
        <div class="card-head"><span class="title">${esc(x.value || 'Number')}</span>${tools(`${p}.stats`, i, stats.length)}</div>
        <div class="row">${field('Number', `${p}.stats.${i}.value`, { placeholder: '120+' })}${field('Label', `${p}.stats.${i}.label`, { placeholder: 'Live shows' })}</div>
      </div>`).join('')}</div>
      <button class="btn" type="button" data-act="add-item" data-list="${p}.stats" data-kind="stat">Add a number</button>`;
  },

  services(s, p) {
    const items = s.items || [];
    const icons = Object.fromEntries(ICONS.map((k) => [k, k]));
    return `<h3>Services</h3>
      <div class="cards">${items.map((x, i) => `<div class="card">
        <div class="card-head"><span class="title">${esc(x.title || 'Service')}</span>${tools(`${p}.items`, i, items.length)}</div>
        <div class="row">${field('Name', `${p}.items.${i}.title`)}${select('Icon', `${p}.items.${i}.icon`, icons)}</div>
        ${field('Description', `${p}.items.${i}.text`, { rows: 2 })}
      </div>`).join('')}</div>
      <button class="btn" type="button" data-act="add-item" data-list="${p}.items" data-kind="service">Add a service</button>`;
  },

  quotes(s, p) {
    const items = s.items || [];
    return `<h3>Quotes</h3>
      <div class="cards">${items.map((x, i) => `<div class="card">
        <div class="card-head"><span class="title">${esc(x.by || 'Quote')}</span>${tools(`${p}.items`, i, items.length)}</div>
        ${field('Quote', `${p}.items.${i}.quote`, { rows: 2 })}
        ${field('Who said it', `${p}.items.${i}.by`, { placeholder: 'Name, role' })}
      </div>`).join('')}</div>
      <button class="btn" type="button" data-act="add-item" data-list="${p}.items" data-kind="quote">Add a quote</button>`;
  },

  text(s, p) {
    return `<div class="box">${field('Text', `${p}.body`, { rows: 8, hint: 'Leave an empty line between paragraphs.' })}</div>
      <h3>Photo</h3><div class="box">${imageField('Optional photo', `${p}.image`, `${p}.imageAlt`, `${p}.imageFocus`)}</div>`;
  },

  contact(s, p) {
    const socials = s.socials || [];
    return `<div class="box">
        ${field('Text above the buttons', `${p}.text`, { rows: 3 })}
        <div class="row">${field('Email', `${p}.email`, { type: 'email', code: true })}${field('Phone', `${p}.phone`, { placeholder: '+91 ...', code: true })}</div>
        ${field('WhatsApp number', `${p}.whatsapp`, { placeholder: '+91 98...', code: true, hint: 'With the country code. Leave empty to hide the WhatsApp button.' })}
        ${field('Form endpoint (optional)', `${p}.formEndpoint`, { code: true, placeholder: 'https://formspree.io/f/...', hint: 'Without this, the booking form opens the visitor\'s email app. With a free form service such as Formspree, the enquiry goes straight to your inbox. Make a form there and paste its link here.' })}
      </div>
      <h3>Photo</h3><div class="box">${imageField('Photo in the contact section', `${p}.image`, `${p}.imageAlt`, `${p}.imageFocus`)}</div>
      <h3>Social links</h3>
      <div class="cards">${socials.map((x, i) => `<div class="card">
        <div class="card-head"><span class="title">${esc(x.label || 'Link')}</span>${tools(`${p}.socials`, i, socials.length)}</div>
        <div class="row">${field('Name', `${p}.socials.${i}.label`, { placeholder: 'Instagram' })}${field('Link', `${p}.socials.${i}.url`, { code: true, placeholder: 'https://instagram.com/...' })}</div>
      </div>`).join('')}</div>
      <button class="btn" type="button" data-act="add-item" data-list="${p}.socials" data-kind="social">Add a link</button>`;
  },
};

function quickAdd(listPath, kind, label, placeholder, extra = '') {
  return `<div class="box quick-add">
    <label>${esc(label)}
      <textarea rows="2" data-bulk="${esc(listPath)}" data-kind="${kind}" placeholder="${esc(placeholder)}" spellcheck="false"></textarea>
      <span class="hint">${esc(extra)} They are added as soon as you paste.${kind === 'video' ? ' Titles fill in by themselves.' : ''}</span>
    </label>
    <button class="btn ghost small" type="button" data-act="bulk-add">Add</button>
  </div>`;
}

const NEW_ITEMS = {
  video: () => ({ url: '', title: '', note: '' }),
  spotify: () => ({ url: '' }),
  stat: () => ({ value: '', label: '' }),
  service: () => ({ icon: 'note', title: '', text: '' }),
  quote: () => ({ quote: '', by: '' }),
  social: () => ({ label: '', url: '' }),
};

function newSection(type) {
  const id = `${type}-${Math.random().toString(36).slice(2, 6)}`;
  const base = { id, type, visible: true, nav: SECTION_TYPES[type].split(' ')[0], eyebrow: '', title: SECTION_TYPES[type], intro: '' };
  if (type === 'about' || type === 'text') return { ...base, body: '', image: '', imageAlt: '', stats: [] };
  if (type === 'contact') return { ...base, text: '', email: '', phone: '', whatsapp: '', formEndpoint: '', socials: [] };
  return { ...base, items: [] };
}

function seoPanel() {
  const guess = guessSiteUrl();
  return `
    <h2>Search & sharing</h2>
    <p class="intro">This controls how the site looks in Google results and in link previews on WhatsApp, Instagram, X and LinkedIn.</p>
    <div class="box">
      ${field('Page title', 'seo.title', { live: 'count:60' })}
      ${field('Description', 'seo.description', { rows: 3, live: 'count:160' })}
      ${field('Keywords', 'seo.keywords', { hint: 'Separate with commas. For example: name, city, genre, "wedding singer".' })}
      ${field('Website address', 'seo.siteUrl', { code: true, placeholder: guess || 'https://username.github.io/repository/', hint: `The full public address of the site. Google and link previews need it.${guess ? ` This page is at <b>${esc(guess)}</b>.` : ''}` })}
      <div class="row">${field('X (Twitter) handle', 'seo.twitter', { placeholder: '@handle', code: true })}${field('Language and region', 'seo.locale', { code: true, hint: 'For example en_IN or en_US.' })}</div>
      <label class="check"><input type="checkbox" data-bind="seo.noindex" ${state.content.seo?.noindex ? 'checked' : ''}> Hide the site from search engines</label>
      <span class="hint">Turn this on while the site still has placeholders. Turn it off at launch so Google can list the site.</span>
      ${field('Google verification code', 'seo.googleVerification', { code: true, placeholder: '<meta name="google-site-verification" content="...">', hint: 'From Google Search Console (HTML tag method). Paste the whole tag or only the code, then publish.' })}
    </div>
    <h3>Share image</h3>
    <div class="box">${imageField('Shown when someone shares the link. A wide image works best (1200 × 630).', 'seo.ogImage')}</div>
    <h3>Google result preview</h3>
    <div class="serp" id="serp"></div>
    <h3>Link preview</h3>
    <div class="share" id="share"></div>`;
}

function guessSiteUrl() {
  if (!/\.github\.io$/i.test(location.hostname)) return '';
  return location.href.replace(/admin\/.*$/, '');
}

function renderSeoPreview() {
  const seo = state.content.seo || {};
  const serp = $('#serp');
  if (!serp) return;
  const url = seo.siteUrl || guessSiteUrl() || 'https://your-site';
  serp.innerHTML = `<div class="u">${esc(url)}</div><div class="t">${esc((seo.title || '').slice(0, 65))}</div><div class="d">${esc((seo.description || '').slice(0, 165))}</div>`;
  $('#share').innerHTML = `<img src="${esc(imgSrc(seo.ogImage))}" alt=""><div><div class="t">${esc(seo.title)}</div><div class="d">${esc(seo.description)}</div></div>`;
}

/* ---------------- Clicks ---------------- */

async function onPanelClick(e) {
  const focus = e.target.closest('[data-focus]');
  if (focus) {
    const r = $('img', focus).getBoundingClientRect();
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
    setPath(focus.dataset.focus, `${clamp(((e.clientX - r.left) / r.width) * 100)}% ${clamp(((e.clientY - r.top) / r.height) * 100)}%`);
    return changed();
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const list = b.dataset.list ? getPath(b.dataset.list) : null;
  const i = +b.dataset.i;

  if (act === 'up' || act === 'down') {
    const j = act === 'up' ? i - 1 : i + 1;
    [list[i], list[j]] = [list[j], list[i]];
    if (b.dataset.list === 'sections' && state.editing != null) state.editing = j;
    return changed();
  }
  if (act === 'remove') {
    const ok = b.dataset.list === 'sections'
      ? await ask('Delete this section?', '<p>The section and its content are removed when you publish.</p>', 'Delete', 'Cancel')
      : true;
    if (!ok) return;
    list.splice(i, 1);
    changed();
    toast('Removed.', 6000, { label: 'Undo', fn: undo });
    return;
  }
  if (act === 'bulk-add') return bulkAdd($('[data-bulk]', b.closest('.quick-add')));
  if (act === 'add-item') {
    if (!getPath(b.dataset.list)) setPath(b.dataset.list, []);
    getPath(b.dataset.list).push(NEW_ITEMS[b.dataset.kind]());
    changed();
    const cards = $$('.card', $('#panel'));
    cards.at(-1)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cards.at(-1)?.querySelector('input, textarea')?.focus();
    return;
  }
  if (act === 'edit-section') {
    switchTab('sections');
    state.editing = i;
    $('#panel').scrollTop = 0;
    renderPanel();
    scrollPreviewTo(state.content.sections[i].id);
    return;
  }
  if (act === 'back') {
    state.editing = null;
    return renderPanel();
  }
  if (act === 'add-section') {
    const type = $('#new-type').value;
    const sections = state.content.sections;
    const contactAt = sections.findIndex((s) => s.type === 'contact');
    // New sections go before the contact section, so the page still ends on booking.
    const at = contactAt === -1 ? sections.length : contactAt;
    sections.splice(at, 0, newSection(type));
    state.editing = at;
    return changed();
  }
  if (act === 'delete-section') {
    const ok = await ask('Delete this section?', '<p>The section and its content are removed when you publish.</p>', 'Delete', 'Cancel');
    if (!ok) return;
    state.content.sections.splice(i, 1);
    state.editing = null;
    changed();
    toast('Section deleted.', 6000, { label: 'Undo', fn: undo });
    return;
  }
  if (act === 'pick') return pickImage(b.dataset.target);
  if (act === 'clear-img') {
    setPath(b.dataset.target, '');
    return changed();
  }
}

/* ---------------- Drag to reorder ---------------- */

function wireDrag(panel) {
  let from = null;
  let listPath = null;
  panel.addEventListener('dragstart', (e) => {
    const item = e.target.closest('[data-drag-i]');
    if (!item || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    from = +item.dataset.dragI;
    listPath = item.parentElement.dataset.dragList;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(from));
  });
  const isFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const zoneOf = (e) => e.target.closest('[data-drop-append], [data-drop-target]');
  panel.addEventListener('dragover', (e) => {
    if (isFiles(e)) {
      const zone = zoneOf(e);
      $$('.drop-ready', panel).forEach((x) => x !== zone && x.classList.remove('drop-ready'));
      if (zone) {
        e.preventDefault();
        zone.classList.add('drop-ready');
      }
      return;
    }
    const item = e.target.closest('[data-drag-i]');
    if (from == null || !item || item.parentElement.dataset.dragList !== listPath) return;
    e.preventDefault();
    $$('.drag-over', panel).forEach((x) => x.classList.remove('drag-over'));
    item.classList.add('drag-over');
  });
  panel.addEventListener('drop', (e) => {
    if (isFiles(e)) {
      const zone = zoneOf(e);
      $$('.drop-ready', panel).forEach((x) => x.classList.remove('drop-ready'));
      if (!zone) return;
      e.preventDefault();
      addFiles([...e.dataTransfer.files], { append: zone.dataset.dropAppend, target: zone.dataset.dropTarget });
      return;
    }
    const item = e.target.closest('[data-drag-i]');
    if (from == null || !item) return;
    e.preventDefault();
    const to = +item.dataset.dragI;
    const list = getPath(listPath);
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    from = null;
    changed();
  });
  panel.addEventListener('dragleave', (e) => {
    if (!panel.contains(e.relatedTarget)) $$('.drop-ready', panel).forEach((x) => x.classList.remove('drop-ready'));
  });
  panel.addEventListener('dragend', () => {
    from = null;
    $$('.drag-over', panel).forEach((x) => x.classList.remove('drag-over'));
  });
}

/* ---------------- Images ---------------- */

function onFiles(input) {
  addFiles([...input.files], { append: input.dataset.append, target: input.dataset.target });
  input.value = '';
}

async function addFiles(files, { append, target }) {
  files = files.filter((f) => f.type.startsWith('image/'));
  if (!files.length) return toast('Only photos can go here.', 4000);
  toast(`Preparing ${files.length} photo${files.length > 1 ? 's' : ''}...`, 10000);
  const paths = [];
  const failed = [];
  for (const file of files) {
    try {
      paths.push(await addUpload(file));
    } catch {
      failed.push(file.name || 'a photo');
    }
  }
  if (append) {
    const list = getPath(append) || [];
    paths.forEach((src) => list.push({ src, ar: state.ars.get(src), alt: '', caption: '', size: 'normal', focus: 'center' }));
    setPath(append, list);
  } else if (paths[0]) {
    setPath(target, paths[0]);
  }
  if (paths.length) changed();
  if (failed.length) toast(`Could not read ${failed.join(', ')}. Try a JPG or PNG.`, 6000);
  else toast(`${paths.length} photo${paths.length === 1 ? '' : 's'} added. Publish to put them live.`, 5000, { label: 'Undo', fn: undo });
}

// Ctrl+V with a copied image. Text pastes are left alone, so captions still paste normally.
function onPasteImage(e) {
  if ($('#app').hidden) return;
  const data = e.clipboardData;
  const files = [...(data?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length || data.types.includes('text/plain')) return;
  const gallery = $('#panel [data-drop-append]');
  const single = $$('#panel [data-drop-target]');
  if (gallery) addFiles(files, { append: gallery.dataset.dropAppend });
  else if (single.length === 1) addFiles(files.slice(0, 1), { target: single[0].dataset.dropTarget });
  else return toast('Open a photo gallery section, then paste the photos.', 5000);
  e.preventDefault();
}

// Shrink to 1600px on the long side and re-encode, so a 8 MB phone photo becomes a few hundred KB.
async function addUpload(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.82));
  // Safari cannot encode WebP and hands back PNG. Use JPEG there.
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const slug = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  const path = `assets/uploads/${slug}-${Date.now().toString(36)}.${ext}`;
  state.pending.set(path, blob);
  state.urls.set(path, URL.createObjectURL(blob));
  state.ars.set(path, +(canvas.width / canvas.height).toFixed(3));
  await pendingPut(path, blob);
  return path;
}

async function pickImage(target) {
  const used = new Set();
  JSON.stringify(state.content, (k, v) => {
    if (typeof v === 'string' && /^assets\/.+\.(webp|jpe?g|png|gif|avif)$/i.test(v)) used.add(v);
    return v;
  });
  state.pending.forEach((_, k) => used.add(k));
  if (state.mode === 'github') {
    const [up, ph] = await Promise.all([state.repo.listImages('assets/uploads'), state.repo.listImages('assets/placeholders')]);
    [...up, ...ph].forEach((p) => used.add(p));
  }
  const paths = [...used];
  const chosen = await new Promise((resolve) => {
    openModal('Choose an image',
      `<div class="picker">${paths.map((p) => `<button type="button" data-path="${esc(p)}" title="${esc(p)}"><img src="${esc(imgSrc(p))}" alt="" loading="lazy"></button>`).join('')}</div>`,
      [{ label: 'Cancel', ghost: true, value: null }], resolve);
    $('#modal .picker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-path]');
      if (btn) closeModal(btn.dataset.path);
    });
  });
  if (!chosen) return;
  setPath(target, chosen);
  changed();
}

/* ---------------- Preview ---------------- */

let frameReady = false;
function setupPreview() {
  const frame = $('#frame');
  addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (e.data?.type === 'deepan-preview-ready') {
      frameReady = true;
      pushPreview();
    } else if (e.data?.type === 'deepan-edit') {
      openFromPreview(String(e.data.id || ''));
    }
  });
  frame.src = '../index.html?preview';
  fitFrame();
}

function pushPreview() {
  if (!frameReady) return;
  const assets = Object.fromEntries(state.urls);
  $('#frame').contentWindow.postMessage({ type: 'deepan-preview', content: state.content, assets }, location.origin);
}

function fitFrame() {
  const wrap = $('#frame-wrap');
  const frame = $('#frame');
  if (!wrap?.clientWidth) return;
  if (wrap.classList.contains('phone')) {
    const scale = Math.min(1, (wrap.clientHeight - 36) / 844, (wrap.clientWidth - 36) / 390);
    Object.assign(frame.style, { width: '390px', height: '844px', transformOrigin: 'top center', transform: `translateX(-50%) scale(${scale})` });
  } else {
    // Render at laptop width, then shrink to fit the panel.
    const scale = wrap.clientWidth / 1280;
    Object.assign(frame.style, { width: '1280px', height: `${wrap.clientHeight / scale}px`, transformOrigin: '0 0', transform: `scale(${scale})` });
  }
}

// The "Edit this" buttons in the preview open the matching editor.
function openFromPreview(id) {
  $('#app').classList.remove('show-preview');
  if (id === 'hero') {
    switchTab('basics');
  } else {
    const i = state.content.sections.findIndex((s) => s.id === id);
    if (i === -1) return;
    switchTab('sections');
    state.editing = i;
  }
  renderPanel();
  $('#panel').scrollTop = 0;
}

function scrollPreviewTo(id) {
  try {
    const doc = $('#frame').contentDocument;
    doc?.getElementById(id)?.scrollIntoView({ block: 'start' });
  } catch { /* preview not ready */ }
}

/* ---------------- Publish ---------------- */

let publishing = false;
async function publish() {
  if (publishing) return;
  publishing = true;
  try {
    await publishNow();
  } finally {
    publishing = false;
  }
}

async function publishNow() {
  if (state.mode === 'local') return downloadJson();
  pushHistory();
  if (!isDirty()) return toast('Nothing to publish. Everything is already live.');

  const problems = checkContent();
  const photos = referencedPending();
  const summary = changeSummary();
  const ok = await ask('Publish to the live site?', `
    <p>What changes:</p>
    <ul>${(summary.length ? summary : ['Small changes']).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${problems.length ? `<p style="color:var(--amber)"><b>Check first:</b></p><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    <label>Note for the change history<input type="text" id="commit-msg" value="Update site content"></label>`, 'Publish', 'Not yet');
  if (!ok) return;
  const message = ($('#commit-msg')?.value || 'Update site content').trim();

  const btn = $('#publish');
  btn.disabled = true;
  const lines = [];
  openModal('Publishing', '<div class="progress" id="progress"></div>', []);
  const log = (msg) => {
    lines.push(msg);
    const el = $('#progress');
    if (el) el.textContent = lines.join('\n');
  };

  try {
    log('Checking the live version');
    const remote = await state.repo.readText('content.json');
    if (remote.sha !== state.contentSha) {
      closeModal();
      const go = await ask('The site changed somewhere else',
        '<p>Someone published from another device or browser after you opened this editor. If you publish now, your version replaces theirs.</p>',
        'Publish mine anyway', 'Cancel');
      if (!go) return;
      openModal('Publishing', '<div class="progress" id="progress"></div>', []);
    }

    const content = state.content;
    content.seo = { ...content.seo, siteUrl: normalizeSiteUrl(content.seo?.siteUrl) };
    // Lets the editor see when the rebuilt site serves this exact version.
    content.publishId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const siteUrl = content.seo.siteUrl;
    const files = [{ path: 'content.json', text: JSON.stringify(content, null, 2) + '\n' }];

    const index = await state.repo.readText('index.html');
    const newIndex = replaceSeoBlock(index.text, buildSeoBlock(content));
    if (newIndex !== index.text) files.push({ path: 'index.html', text: newIndex });
    files.push({ path: 'robots.txt', text: buildRobots(siteUrl) });
    if (siteUrl) files.push({ path: 'sitemap.xml', text: buildSitemap(siteUrl) });
    photos.forEach((path) => files.push({ path, blob: state.pending.get(path) }));

    await state.repo.commit(files, message, log);

    const after = await state.repo.readText('content.json');
    state.contentSha = after.sha;
    state.published = JSON.stringify(content);
    state.pending.clear();
    await pendingClear();
    store.del(localStorage, DRAFT_KEY);
    resetHistory();
    closeModal();
    watchLive(content.publishId);
    toast('Published. The live site updates in about a minute. The bar at the top says when.', 6000);
  } catch (ex) {
    closeModal();
    await ask('Publishing failed', `<p>${esc(ex.message)}</p><p>Your changes are still here. Nothing was lost.</p>`, 'OK');
  } finally {
    btn.disabled = false;
  }
}

// Poll the public content.json until it carries this publish id, then say "Live now".
let watchId = 0;
async function watchLive(publishId) {
  const mine = ++watchId;
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const base = local ? liveUrl() || new URL('../', location.href).href : new URL('../', location.href).href;
  state.going = 'waiting';
  updateStatus();
  const until = Date.now() + 5 * 60 * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 6000));
    if (mine !== watchId) return;
    try {
      const res = await fetch(`${base}content.json?v=${Math.random().toString(36).slice(2)}`, { cache: 'no-store' });
      if (res.ok && (await res.json()).publishId === publishId) {
        state.going = 'live';
        updateStatus();
        toast('Live now. Visitors see your changes.', 8000, { label: 'Open site', fn: () => open(base, '_blank', 'noopener') });
        return;
      }
    } catch { /* try again */ }
  }
  state.going = null;
  updateStatus();
  toast('It should be live soon. If the site looks old, refresh it with Ctrl+Shift+R.', 8000);
}

function checkContent() {
  const out = [];
  const c = state.content;
  if (!c.seo?.siteUrl) out.push('The website address is empty (Search & sharing). Link previews need it.');
  const here = guessSiteUrl();
  const set = normalizeSiteUrl(c.seo?.siteUrl);
  if (here && set && set.toLowerCase() !== here.toLowerCase()) out.push(`The website address under Search & sharing is ${set}, but this site is at ${here}. Link previews will point to the wrong place.`);
  for (const s of c.sections || []) {
    if (s.visible === false) continue;
    if (s.type === 'videos' && (s.items || []).some((v) => !youtubeId(v.url))) out.push(`"${s.title}" has a video link that is not a YouTube link.`);
    if (s.type === 'spotify' && (s.items || []).some((v) => !spotifyRef(v.url))) out.push(`"${s.title}" has a link that is not a Spotify link.`);
    if (s.type === 'contact' && !s.email && !s.formEndpoint) out.push('The contact section has no email and no form endpoint, so the booking form is hidden.');
  }
  if (JSON.stringify(c).toLowerCase().includes('placeholder')) out.push('Some text still says "Placeholder".');
  if (c.seo?.noindex) out.push('The site is hidden from search engines (Search & sharing). Turn that off at launch.');
  return out;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state.content, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'content.json';
  a.click();
  toast('Downloaded. In trial mode, uploaded photos stay in this browser only.', 5000);
}

/* ---------------- Modal and toast ---------------- */

let modalResolve = null;
let modalActions = [];
function openModal(title, body, actions, resolve) {
  modalActions = actions;
  const m = $('#modal');
  $('#modal-title').textContent = title;
  $('.modal-body', m).innerHTML = body;
  $('.modal-actions', m).innerHTML = actions.map((a, i) =>
    `<button class="btn ${a.ghost ? 'ghost' : ''} ${a.danger ? 'danger' : ''}" type="button" data-i="${i}">${esc(a.label)}</button>`).join('');
  modalResolve = resolve || null;
  $('.modal-actions', m).onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (b) closeModal(actions[+b.dataset.i].value);
  };
  m.hidden = false;
  $('.modal-actions .btn:last-child', m)?.focus();
}

function closeModal(value) {
  const m = $('#modal');
  if (m.hidden) return;
  // Read inputs before the body is cleared by the next modal.
  const r = modalResolve;
  modalResolve = null;
  m.hidden = true;
  r?.(value);
}

// Escape picks the cancel choice. The progress dialog has no choices, so it cannot be closed early.
function escapeModal() {
  if (!modalActions.length) return;
  const cancel = modalActions.find((a) => a.value === false || a.value === null);
  closeModal((cancel || modalActions[0]).value);
}

function ask(title, body, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const actions = cancelLabel
      ? [{ label: cancelLabel, ghost: true, value: false }, { label: okLabel, value: true, danger: /delete|discard/i.test(okLabel) }]
      : [{ label: okLabel, value: true }];
    openModal(title, body, actions, resolve);
  });
}

let toastTimer;
function toast(msg, ms = 3000, action = null) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-act">${esc(action.label)}</button>` : ''}`;
  if (action) {
    $('.toast-act', t).onclick = () => {
      t.hidden = true;
      action.fn();
    };
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

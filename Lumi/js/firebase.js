/* =============================================================
   Lumi ↔ Firebase
   - Firebase Authentication  → accounts (email + password)
   - Cloud Firestore          → dreams, journal, memories, goals…
   - Photos & videos          → Firestore (free plan) or Firebase Storage (Blaze)
   If Firebase is not set up, Lumi works in "offline mode"
   (data saved on this device only).
   ============================================================= */
"use strict";
const FBX = { online: false, ready: false, auth: null, db: null, st: null, useStorage: false, uid: null,
  timer: null, busy: false, again: false, warned: false, lastName: '', last: {}, lastRest: '', imgRef: {}, fileURL: {} };
const uploadedURL = {};
const COLS = { dreams: 'id', entries: 'id', memories: 'id', goals: 'id', letters: 'id', events: 'id', customDest: 'k' };
const LOCAL_ONLY = ['pin', 'bio', 'user', 'loggedIn'];
const CHUNK = 700 * 1024, MAX_FS_FILE = 60 * 1024 * 1024, BIG_IMG = 40 * 1024;

/* ---------- helpers ---------- */
const uref = (...p) => FB.doc(FBX.db, 'users', FBX.uid, ...p);
const ucol = (...p) => FB.collection(FBX.db, 'users', FBX.uid, ...p);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const safeId = (v, i) => String(v == null || v === '' ? 'i' + i : v).replace(/[\/\s]/g, '_').slice(0, 120);
function strHash(s) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36) + s.length.toString(36); }
/* Firestore can't store arrays inside arrays → wrap them */
function enc(v) { if (Array.isArray(v)) return v.map(x => Array.isArray(x) ? { _arr: enc(x) } : enc(x)); if (v && typeof v === 'object') { const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = enc(v[k]); return o; } return v; }
function dec(v) { if (Array.isArray(v)) return v.map(dec); if (v && typeof v === 'object') { if ('_arr' in v && Object.keys(v).length === 1) return dec(v._arr); const o = {}; for (const k in v) o[k] = dec(v[k]); return o; } return v; }
function niceError(e) {
  const c = (e && e.code) || '', m = {
    'auth/email-already-in-use': 'This email already has an account. Please log in.', 'auth/invalid-email': 'Please enter a valid email.',
    'auth/weak-password': 'Password must be at least 8 characters.', 'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.', 'auth/user-not-found': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many tries. Please wait a moment and try again.', 'auth/network-request-failed': 'No internet connection.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in your Firebase console (Authentication → Sign-in method).',
    'auth/requires-recent-login': 'Please log in again first.', 'auth/invalid-api-key': 'The Firebase apiKey in js/firebase-config.js is wrong.',
    'permission-denied': 'Firestore said "permission denied". Did you publish the security rules (firestore.rules)?',
    'storage/unauthorized': 'Storage said "unauthorized". Did you publish storage.rules?', 'unavailable': 'No internet connection.' }[c];
  return m || (e && e.message ? e.message.replace(/^Firebase: /, '').replace(/\s*\(.*\)\.?$/, '') : 'Something went wrong.');
}
function blobToDataURL(b) { return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
function dataURLToBlob(u) { const [h, d] = u.split(','); const bin = atob(d); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: h.slice(5).split(';')[0] }); }

/* ---------- files (photos/videos) ---------- */
async function putFile(blob, name) {
  const id = newId();
  if (FBX.useStorage) {
    const ext = ((blob.type || '').split('/')[1] || 'bin').replace('quicktime', 'mov').replace('jpeg', 'jpg');
    const r = FB.ref(FBX.st, `users/${FBX.uid}/${id}.${ext}`);
    await new Promise((res, rej) => FB.uploadBytesResumable(r, blob, { contentType: blob.type }).on('state_changed', null, rej, res));
    return await FB.getDownloadURL(r);
  }
  if (blob.size > MAX_FS_FILE) throw new Error('File is too big (max 60 MB on the free plan).');
  const buf = new Uint8Array(await blob.arrayBuffer()); const n = Math.max(1, Math.ceil(buf.length / CHUNK));
  for (let i = 0; i < n; i += 8) {
    const b = FB.writeBatch(FBX.db);
    for (let j = i; j < Math.min(n, i + 8); j++) b.set(uref('files', id, 'chunks', String(j).padStart(4, '0')), { d: FB.Bytes.fromUint8Array(buf.subarray(j * CHUNK, (j + 1) * CHUNK)) });
    await b.commit();
  }
  await FB.setDoc(uref('files', id), { type: blob.type || '', size: blob.size, chunks: n, name: name || '', created: FB.serverTimestamp() });
  return 'fs:' + id;
}
async function getFileBlob(ref) {
  const id = ref.slice(3); const meta = await FB.getDoc(uref('files', id)); if (!meta.exists()) return null;
  const snap = await FB.getDocs(ucol('files', id, 'chunks'));
  const parts = snap.docs.sort((a, b) => a.id.localeCompare(b.id)).map(d => d.data().d.toUint8Array());
  return new Blob(parts, { type: meta.data().type });
}
async function fileObjectURL(ref) { if (FBX.fileURL[ref]) return FBX.fileURL[ref]; const b = await getFileBlob(ref); return b ? (FBX.fileURL[ref] = URL.createObjectURL(b)) : null; }

/* Big inline images (covers, journal photos…) are moved out of the documents. */
async function packImages(st) {
  const jobs = [];
  (function walk(o) { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string' && v.length > BIG_IMG && v.startsWith('data:image/')) jobs.push([o, k, v]); else if (v && typeof v === 'object') walk(v); } })(st);
  for (const [o, k, v] of jobs) {
    const h = strHash(v);
    if (!FBX.imgRef[h]) FBX.imgRef[h] = await putFile(dataURLToBlob(v), 'image');
    o[k] = FBX.imgRef[h];
  }
}
async function unpackImages(st) {
  const jobs = [];
  (function walk(o) { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string' && v.startsWith('fs:') && k !== 'url') jobs.push([o, k, v]); else if (v && typeof v === 'object') walk(v); } })(st);
  const cache = {};
  await Promise.all(jobs.map(async ([o, k, v]) => {
    try { if (!cache[v]) cache[v] = getFileBlob(v).then(b => b ? blobToDataURL(b) : null); const d = await cache[v];
      if (d) { o[k] = d; FBX.imgRef[strHash(d)] = v; } else o[k] = null; } catch (e) { o[k] = null; }
  }));
}

/* ---------- load the user's data ---------- */
async function loadCloudState() {
  const s = {}; const rest = await FB.getDoc(uref('state', 'main'));
  if (rest.exists()) { try { Object.assign(s, JSON.parse(rest.data().json || '{}')); } catch (e) {} }
  FBX.last = {};
  await Promise.all(Object.keys(COLS).map(async c => {
    const snap = await FB.getDocs(ucol(c)); FBX.last[c] = {};
    const rows = snap.docs.map(d => ({ id: d.id, v: d.data() })).sort((a, b) => (a.v._i ?? 0) - (b.v._i ?? 0));
    s[c] = rows.map(r => { const v = dec(r.v); delete v._i; return v; });
  }));
  await unpackImages(s);
  return s;
}
function applyCloudState(user, state) {
  const prev = load();
  S = deepMerge(defaults(), state || {});
  if (prev.user && prev.user.email === user.email) { S.pin = prev.pin; S.bio = prev.bio; }
  S.user = { id: user.uid, name: user.displayName || (state.profile && state.profile.name) || user.email.split('@')[0], email: user.email, created: user.metadata && user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : new Date().toISOString(), pass: '' };
  S.loggedIn = true; FBX.lastName = S.user.name; saveLocal(); try { loadCustomDest(); } catch (e) {}
}

/* ---------- save: local copy + sync to Firestore ---------- */
const saveLocal = save;
save = function () { saveLocal(); if (FBX.online && FBX.ready && FBX.uid && S.loggedIn && S.user) scheduleSync(); };
function scheduleSync() { clearTimeout(FBX.timer); FBX.timer = setTimeout(doSync, 1500); }
async function doSync() {
  if (!FBX.online || !FBX.ready || !FBX.uid || !S.loggedIn) return;
  if (FBX.busy) { FBX.again = true; return; }
  FBX.busy = true;
  try {
    const st = JSON.parse(JSON.stringify(S)); LOCAL_ONLY.forEach(k => delete st[k]);
    await packImages(st);
    const ops = [];
    for (const [c, key] of Object.entries(COLS)) {
      const now = {}; (Array.isArray(st[c]) ? st[c] : []).forEach((it, i) => { const id = safeId(it[key], i); const v = enc(Object.assign({}, it, { _i: i })); now[id] = [JSON.stringify(v), v]; });
      const was = FBX.last[c] || {};
      for (const id in now) if (was[id] !== now[id][0]) { if (now[id][0].length > 1000000) { toast('⚠️ One item is too big to save online.'); continue; } ops.push(['set', uref(c, id), now[id][1], c, id, now[id][0]]); }
      for (const id in was) if (!now[id]) ops.push(['del', uref(c, id), null, c, id]);
      delete st[c];
    }
    const rest = JSON.stringify(st), cmp = restKey(st);
    /* "usage" (time spent in the app) changes every few seconds → upload it at most every 5 minutes */
    if (cmp !== FBX.lastRestKey || (rest !== FBX.lastRest && Date.now() - (FBX.lastRestAt || 0) > 300000)) ops.push(['set', uref('state', 'main'), { json: rest, updated: FB.serverTimestamp() }, '_rest']);
    if (S.user.name && S.user.name !== FBX.lastName) { await FB.updateProfile(FBX.auth.currentUser, { displayName: S.user.name }).catch(() => {});
      ops.push(['set', uref(), { name: S.user.name, email: S.user.email }, '_user']); }
    for (let i = 0; i < ops.length; i += 400) {
      const b = FB.writeBatch(FBX.db); const part = ops.slice(i, i + 400);
      part.forEach(o => o[0] === 'set' ? b.set(o[1], o[2]) : b.delete(o[1])); await b.commit();
      part.forEach(o => { if (o[3] === '_rest') { FBX.lastRest = rest; FBX.lastRestKey = cmp; FBX.lastRestAt = Date.now(); } else if (o[3] === '_user') FBX.lastName = S.user.name;
        else { FBX.last[o[3]] = FBX.last[o[3]] || {}; if (o[0] === 'set') FBX.last[o[3]][o[4]] = o[5]; else delete FBX.last[o[3]][o[4]]; } });
    }
    setSyncBadge('saved'); FBX.warned = false;
  } catch (e) {
    console.error(e); setSyncBadge('error'); if (!FBX.warned) { FBX.warned = true; toast('⚠️ Could not save online: ' + esc(niceError(e))); }
  } finally { FBX.busy = false; if (FBX.again) { FBX.again = false; scheduleSync(); } }
}
/* remember what is already in the cloud, so only changes are uploaded */
function markSynced() {
  const st = JSON.parse(JSON.stringify(S)); LOCAL_ONLY.forEach(k => delete st[k]);
  (function walk(o) { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string' && v.length > BIG_IMG && v.startsWith('data:image/')) { const r = FBX.imgRef[strHash(v)]; if (r) o[k] = r; } else if (v && typeof v === 'object') walk(v); } })(st);
  for (const [c, key] of Object.entries(COLS)) { FBX.last[c] = {}; (Array.isArray(st[c]) ? st[c] : []).forEach((it, i) => { FBX.last[c][safeId(it[key], i)] = JSON.stringify(enc(Object.assign({}, it, { _i: i }))); }); delete st[c]; }
  FBX.lastRest = JSON.stringify(st); FBX.lastRestKey = restKey(st); FBX.lastRestAt = Date.now();
}
function restKey(st) { const c = Object.assign({}, st); delete c.usage; return JSON.stringify(c); }
function setSyncBadge(state) { const b = document.getElementById('syncBadge'); if (!b) return;
  b.textContent = state === 'saved' ? '☁️ Saved' : '⚠️ Not saved'; b.style.color = state === 'error' ? 'var(--bad)' : ''; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && FBX.timer) { clearTimeout(FBX.timer); doSync(); } });

/* ---------- sign up / log in ---------- */
const _showAuthF = showAuth;
showAuth = function (mode) {
  _showAuthF(mode); if (!FBX.online) return;
  const su = mode === 'signup'; const f = $('#authF');
  f.insertAdjacentHTML('beforeend', `${su ? '' : '<div class="center" style="margin-top:10px"><a href="#" id="fbForgot" class="tiny" style="color:inherit;opacity:.85">Forgot password?</a></div>'}<div class="tiny muted center" style="margin-top:8px">🔥 Your account is saved in Firebase</div>`);
  const fg = $('#fbForgot'); if (fg) fg.onclick = async ev => { ev.preventDefault(); const email = $('#aEmail').value.trim();
    if (!email) return ($('#aErr').textContent = 'Type your email first, then tap "Forgot password?".');
    try { await FB.sendPasswordResetEmail(FBX.auth, email); toast('📧 Password reset link sent to ' + esc(email)); } catch (x) { $('#aErr').textContent = niceError(x); } };
  f.onsubmit = async e => { e.preventDefault();
    const err = m => { $('#aErr').textContent = m; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); };
    const email = $('#aEmail').value.trim().toLowerCase(), pass = $('#aPass').value; const btn = f.querySelector('button.btn');
    try {
      btn.disabled = true; FBX.ready = false;
      if (su) { const name = $('#aName').value.trim();
        if (!name) return err('Please enter your name.'); if (pass.length < 8) return err('Password must be at least 8 characters.'); if (pass !== $('#aPass2').value) return err("Passwords don't match.");
        const cred = await FB.createUserWithEmailAndPassword(FBX.auth, email, pass); FBX.uid = cred.user.uid;
        await FB.updateProfile(cred.user, { displayName: name });
        await FB.setDoc(uref(), { name, email, created: FB.serverTimestamp() });
        S = defaults(); S.user = { id: cred.user.uid, name, email, created: new Date().toISOString(), pass: '' }; S.loggedIn = true;
        FBX.last = {}; FBX.lastRest = ''; FBX.lastName = name; FBX.imgRef = {}; FBX.ready = true; saveLocal(); doSync(); showLoading(() => { unlocked = true; enterApp(); }, 1200);
      } else {
        const cred = await FB.signInWithEmailAndPassword(FBX.auth, email, pass); FBX.uid = cred.user.uid; FBX.imgRef = {};
        applyCloudState(cred.user, await loadCloudState()); markSynced(); FBX.ready = true; showLoading(() => { unlocked = true; enterApp(); }, 1200);
      }
    } catch (x) { if (!/^auth\//.test((x && x.code) || '')) console.error(x); err(niceError(x)); } finally { btn.disabled = false; }
  };
};
logout = function () {
  confirmBox('Log out of Lumi?', async () => {
    clearTimeout(FBX.timer);
    if (FBX.online && FBX.uid) { try { await doSync(); } catch (e) {} try { await FB.signOut(FBX.auth); } catch (e) {} }
    const pin = S.pin, bio = S.bio, email = S.user && S.user.email;
    if (FBX.online) { S = defaults(); S.user = email ? { email, name: '' } : null; S.pin = pin; S.bio = bio; FBX.uid = null; FBX.ready = false; }
    S.loggedIn = false; saveLocal(); unlocked = false; sessionSec = 0; page = 'home'; try { speechSynthesis.cancel(); } catch (e) {}
    const f = $('#fab'); if (f) f.remove(); showWelcome();
  }, { ok: 'Log out' });
};
async function reauth(pass) { const u = FBX.auth.currentUser; await FB.reauthenticateWithCredential(u, FB.EmailAuthProvider.credential(u.email, pass)); }
const _changePwF = changePw;
changePw = function () {
  if (!FBX.online) return _changePwF();
  modal(`<h2>🔑 Change password<span class="sp"></span><button class="iconbtn" onclick="closeModal()">✕</button></h2><input class="f" type="password" id="op" placeholder="Current password"><input class="f" type="password" id="np" style="margin-top:8px" placeholder="New password (8+ characters)"><input class="f" type="password" id="np2" style="margin-top:8px" placeholder="Re-enter new password"><button class="btn block" style="margin-top:12px" id="cpG">Save</button>`);
  $('#cpG').onclick = async () => { const n = $('#np').value; if (n.length < 8) return toast('Use at least 8 characters.'); if (n !== $('#np2').value) return toast("Passwords don't match.");
    try { await reauth($('#op').value); await FB.updatePassword(FBX.auth.currentUser, n); closeModal(); toast('🔑 Password changed!'); } catch (e) { toast(esc(niceError(e))); } };
};
async function deleteCloudData() {
  const delCol = async (...p) => { const snap = await FB.getDocs(ucol(...p)); for (let i = 0; i < snap.docs.length; i += 400) { const b = FB.writeBatch(FBX.db); snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); } return snap; };
  for (const c of Object.keys(COLS)) await delCol(c);
  const files = await FB.getDocs(ucol('files')); for (const f of files.docs) { await delCol('files', f.id, 'chunks'); await FB.deleteDoc(f.ref); }
  await FB.deleteDoc(uref('state', 'main')).catch(() => {}); await FB.deleteDoc(uref()).catch(() => {});
  if (FBX.st) { try { const l = await FB.listAll(FB.ref(FBX.st, 'users/' + FBX.uid)); await Promise.all(l.items.map(i => FB.deleteObject(i))); } catch (e) {} }
}
const _rsF = render_settings;
render_settings = function () {
  _rsF();
  const first = document.querySelector('#main .card');
  if (first) first.insertAdjacentHTML('beforebegin', `<div class="card" style="display:flex;align-items:center;gap:10px"><span style="font-size:1.6em">${FBX.online ? '🔥' : '📴'}</span><div style="flex:1"><b class="small">${FBX.online ? 'Connected to Firebase' : 'Offline mode'}</b><div class="tiny muted">${FBX.online ? 'Your data is saved in the cloud and works on any device you log in to.' : (FBX.why || 'Data is saved on this device only.')}</div></div>${FBX.online ? '<span class="chip" id="syncBadge">☁️ Saved</span>' : ''}</div>`);
  if (!FBX.online) return;
  const del = [...document.querySelectorAll('#main button')].find(b => b.textContent.trim() === 'Delete' && /Delete ALL data/.test(b.getAttribute('onclick') || ''));
  if (del) { del.removeAttribute('onclick'); del.onclick = () => {
    modal(`<h2>🗑️ Delete account<span class="sp"></span><button class="iconbtn" onclick="closeModal()">✕</button></h2><p class="small muted">This deletes your account and ALL your data from Firebase. It can't be undone.</p><input class="f" type="password" id="dpw" placeholder="Type your password to confirm"><button class="btn danger block" style="margin-top:12px" id="dGo">Delete everything</button>`);
    $('#dGo').onclick = async () => { const b = $('#dGo'); b.disabled = true; b.textContent = 'Deleting…';
      try { await reauth($('#dpw').value); clearTimeout(FBX.timer); FBX.ready = false; await deleteCloudData(); await FB.deleteUser(FBX.auth.currentUser); }
      catch (e) { b.disabled = false; b.textContent = 'Delete everything'; FBX.ready = true; return toast(esc(niceError(e))); }
      closeModal(); try { localStorage.removeItem(KEY); } catch (e) {} FBX.uid = null; S = defaults(); saveLocal(); unlocked = false; const f = $('#fab'); if (f) f.remove(); toast('Account deleted.'); showWelcome(); };
  }; }
};

/* ---------- memory photos & videos ---------- */
const _putMediaF = putMedia;
putMedia = async function (id, blob) {
  await _putMediaF(id, blob).catch(() => {});
  if (!FBX.online || !FBX.uid) return;
  try { toast('☁️ Uploading ' + (blob.type.startsWith('video') ? 'video' : 'photo') + '…'); uploadedURL[id] = await putFile(blob, blob.name || ''); }
  catch (e) { toast('⚠️ Upload failed: ' + esc(niceError(e))); }
};
const _mediaURLF = mediaURL;
mediaURL = async function (x) {
  const u = x.url || uploadedURL[x.id];
  if (u && u.startsWith('fs:')) { try { const local = await _mediaURLF(x); if (local) return local; } catch (e) {} return fileObjectURL(u); }
  if (u) return u; return _mediaURLF(x);
};
const _getMediaF = getMedia;
getMedia = async function (id) { try { return await _getMediaF(id); } catch (e) { return null; } };


/* =============================================================
   🤖 LUMI AI — real AI answers with Gemini (Firebase AI Logic)
   If AI is off or fails (no internet, not set up, quota), Lumi
   falls back to the simple built-in replies, so chat never breaks.
   ============================================================= */
const LUMI_AI = { ai: null, ready: false, models: [], failNote: false };
function setupLumiAI(app) {
  if (typeof FIREBASE_USE_AI !== 'undefined' && !FIREBASE_USE_AI) return;
  try {
    const key = typeof FIREBASE_RECAPTCHA_SITE_KEY !== 'undefined' ? FIREBASE_RECAPTCHA_SITE_KEY : '';
    if (key) {
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      FB.initializeAppCheck(app, { provider: new FB.ReCaptchaEnterpriseProvider(key), isTokenAutoRefreshEnabled: true });
    }
    LUMI_AI.ai = FB.getAI(app, { backend: new FB.GoogleAIBackend() });
    const first = typeof LUMI_AI_MODEL !== 'undefined' && LUMI_AI_MODEL ? LUMI_AI_MODEL : 'gemini-flash-latest';
    LUMI_AI.models = [...new Set([first, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])];
    LUMI_AI.ready = true;
  } catch (e) { console.warn('Lumi AI is off:', e); LUMI_AI.ready = false; }
}
/* What Lumi knows about this user (the "KAALAMAN" part of the prompt) */
function lumiKnowledge() {
  const L = [], d = new Date(), fmt = x => { try { return new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } };
  const st = { not: 'Not started', plan: 'Planning', prog: 'In progress', done: 'Completed' };
  L.push(`Petsa at oras ngayon: ${d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.`);
  L.push(`Pangalan ng user: ${(S.user && S.user.name) || 'Friend'}.`);
  L.push('Ang Lumi ay isang Bucket List & Dream Journal web app: My Bucket List (dreams na may cover, target date, category, priority, status at progress), Journal (mood, kuwento, litrato, lugar), Memory Collection (litrato at video ng natupad na pangarap), Dream Places, Future Letters, Goals, Challenges, Analytics, Life Timeline, Legacy & Family, Notifications, Themes at Settings (PIN lock).');
  const ds = (S.dreams || []).slice(-25);
  L.push(ds.length ? 'Mga pangarap ng user (bucket list):\n' + ds.map(x => `- "${x.title}" | ${x.cat || ''} | ${st[x.status] || x.status} | ${x.progress || 0}%` + (x.target ? ` | target: ${x.target}` : '') + (x.location ? ` | lugar: ${x.location}` : '') + (x.fav ? ' | favorite' : '') + (x.completedAt ? ` | natapos: ${fmt(x.completedAt)}` : '')).join('\n') : 'Wala pang pangarap sa bucket list ang user.');
  const es = (S.entries || []).slice(-6);
  if (es.length) L.push('Mga huling journal entry:\n' + es.map(e => `- ${fmt(e.date)} | mood: ${e.mood} | "${String(e.text || '').slice(0, 160)}"`).join('\n'));
  const ms = (S.memories || []).slice(-8);
  if (ms.length) L.push('Mga memory sa Memory Collection:\n' + ms.map(m => `- "${m.cap || 'Untitled'}"` + (m.location ? ` sa ${m.location}` : '') + (m.date ? ` (${m.date})` : '') + ((m.media || []).length ? ` | ${(m.media || []).length} photo/video` : '')).join('\n'));
  const gs = (S.goals || []).slice(0, 10);
  if (gs.length) L.push('Mga goal:\n' + gs.map(g => `- ${g.t} (${g.done ? 'done' : 'not yet'})`).join('\n'));
  const ls = (S.letters || []);
  if (ls.length) L.push(`May ${ls.length} future letter ang user (huwag ibunyag ang laman ng mga naka-lock).`);
  return L.join('\n\n');
}
function lumiHistory() {
  const msgs = (S.chat || []).slice(-21, -1);       // the conversation before the newest message
  const out = [];
  msgs.forEach(m => { const role = m.me ? 'user' : 'model'; const text = String(m.t || '').slice(0, 2000); if (!text) return;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].parts[0].text += '\n' + text; else out.push({ role, parts: [{ text }] }); });
  while (out.length && out[0].role !== 'user') out.shift();   // must start with the user
  return out;
}
function lumiLang(t) { try { return detectLang(t); } catch (e) { return 'en'; } }
async function lumiAsk(t) {
  /* keep the safe, fixed crisis answer with hotlines */
  try { if (AI_RULES[0].re.test(t) || (typeof CRISIS_ML !== 'undefined' && CRISIS_ML.test(t))) return aiReply(t); } catch (e) {}
  if (!LUMI_AI.ready || !navigator.onLine) return aiReply(t);
  const sys = (typeof LUMI_SYSTEM_PROMPT !== 'undefined' ? LUMI_SYSTEM_PROMPT : 'You are Lumi AI, a kind and helpful assistant.') + '\n\nKAALAMAN (impormasyon tungkol sa user at sa Lumi app. Gamitin ito kapag may kaugnayan sa tanong; huwag itong ilista nang buo kung hindi tinatanong.)\n' + lumiKnowledge();
  let lastErr;
  for (const name of LUMI_AI.models) {
    try {
      const model = FB.getGenerativeModel(LUMI_AI.ai, { model: name, systemInstruction: sys, generationConfig: { temperature: 0.7, maxOutputTokens: 1200 } });
      const chat = model.startChat({ history: lumiHistory() });
      const res = await Promise.race([chat.sendMessage(t), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000))]);
      const text = (res && res.response && res.response.text && res.response.text()) || '';
      if (text.trim()) { LUMI_AI.models = [name, ...LUMI_AI.models.filter(x => x !== name)]; return { text: text.trim(), lang: lumiLang(t), ai: true }; }
      lastErr = new Error('empty answer');
    } catch (e) {
      lastErr = e; const msg = String((e && e.message) || e);
      if (/not found|404|is not supported|unknown model|no longer available/i.test(msg)) continue;   // try the next model
      break;
    }
  }
  console.warn('Lumi AI fallback:', lastErr);
  if (!LUMI_AI.failNote) { LUMI_AI.failNote = true; const m = String((lastErr && lastErr.message) || '');
    toast(/app.?check|appcheck|attestation|401|403|permission|api key|not been used|disabled/i.test(m) ? '🤖 Lumi AI is not set up yet in Firebase (AI Logic / App Check). Using simple replies for now.' : /quota|429|rate/i.test(m) ? '🤖 Lumi AI is busy right now. Using simple replies for a moment.' : '🤖 Lumi AI could not connect. Using simple replies for now.', 5000); }
  return aiReply(t);
}
/* chat on the AI page */
const _sendChatFB = sendChat;
sendChat = function (preset) {
  if (!LUMI_AI.ready) return _sendChatFB(preset);
  const inp = document.getElementById('chatIn'); const t = (preset || (inp ? inp.value : '')).trim(); if (!t) return;
  if (document.getElementById('typ')) { toast('💬 Lumi is still replying…', 1500); return; }
  if (chatDup(t)) { if (inp) inp.value = ''; return; }
  if (inp) inp.value = ''; S.chat.push({ me: true, t }); S.aiCount++; save();
  const cb = document.getElementById('chatbox');
  if (cb) { cb.insertAdjacentHTML('beforeend', `<div class="bubble me">${esc(t)}</div><div class="bubble ai typing" id="typ"><span></span><span></span><span></span></div>`); cb.scrollTop = cb.scrollHeight; }
  lumiAsk(t).then(r => {
    S.chat.push({ me: false, t: r.text }); if (S.chat.length > 200) S.chat = S.chat.slice(-200); save(); try { checkBadges(); } catch (e) {}
    if (page === 'ai' && aiTab === 'chat') { render(); if (S.settings.voice) speak(r.text, r.lang); } else { const ty = document.getElementById('typ'); if (ty) ty.remove(); }
  });
};
/* floating chat window */
const _cwSendFB = cwSend;
cwSend = function (preset) {
  if (!LUMI_AI.ready) return _cwSendFB(preset);
  const i = document.getElementById('cwI'); const t = (preset || (i ? i.value : '')).trim(); if (!t) return;
  if (document.getElementById('cwTyp')) { toast('💬 Lumi is still replying…', 1500); return; }
  if (chatDup(t)) { if (i) i.value = ''; return; }
  if (i) i.value = ''; S.chat.push({ me: true, t }); S.aiCount++; save();
  const m = document.getElementById('cwM');
  if (m) { m.insertAdjacentHTML('beforeend', `<div class="bubble me">${esc(t)}</div><div class="bubble ai typing" id="cwTyp"><span></span><span></span><span></span></div>`); m.scrollTop = m.scrollHeight; }
  lumiAsk(t).then(r => {
    S.chat.push({ me: false, t: r.text }); if (S.chat.length > 200) S.chat = S.chat.slice(-200);
    if (!chatOpen) { S.aiUnread = (S.aiUnread || 0) + 1; try { peek(r.text); } catch (e) {} }
    save(); try { checkBadges(); updateHeadBadge(); } catch (e) {}
    const w = document.getElementById('cwM'); if (w) { const ty = document.getElementById('cwTyp'); if (ty) ty.remove(); w.insertAdjacentHTML('beforeend', `<div class="bubble ai">${fmtAI(r.text)}</div>`); w.scrollTop = w.scrollHeight; }
    if (S.settings.voice && chatOpen) speak(r.text, r.lang);
    if (page === 'ai' && aiTab === 'chat') render();
  });
};

/* ---------- start ---------- */
(async function bootWithFirebase() {
  applyTheme();
  const go = () => showLoading(() => { if (S.user && S.loggedIn) { if (S.pin) showLock(); else enterApp(); } else showWelcome(); }, 1700);
  const cfg = typeof FIREBASE_CONFIG !== 'undefined' ? FIREBASE_CONFIG : null;
  if (typeof FB === 'undefined' || !cfg || !cfg.apiKey || /PASTE/i.test(cfg.apiKey)) { FBX.why = 'Firebase is not set up yet. Paste your config in js/firebase-config.js.'; return go(); }
  try {
    const app = FB.initializeApp(cfg); FBX.auth = FB.getAuth(app);
    FBX.db = FB.initializeFirestore(app, { localCache: FB.memoryLocalCache(), ignoreUndefinedProperties: true });
    FBX.useStorage = typeof FIREBASE_USE_STORAGE !== 'undefined' && FIREBASE_USE_STORAGE && !!cfg.storageBucket;
    if (FBX.useStorage) FBX.st = FB.getStorage(app);
    if (typeof FIREBASE_EMULATOR !== 'undefined' && FIREBASE_EMULATOR) {
      FB.connectAuthEmulator(FBX.auth, 'http://127.0.0.1:9099', { disableWarnings: true }); FB.connectFirestoreEmulator(FBX.db, '127.0.0.1', 8080);
      if (FBX.st) FB.connectStorageEmulator(FBX.st, '127.0.0.1', 9199);
    }
    FBX.online = true;
    setupLumiAI(app);
    const user = await new Promise(res => { const un = FB.onAuthStateChanged(FBX.auth, u => { un(); res(u); }); });
    if (user) { FBX.uid = user.uid;
      try { applyCloudState(user, await loadCloudState()); markSynced(); FBX.ready = true; }
      catch (e) { console.error(e); toast('⚠️ Could not load your data: ' + esc(niceError(e))); }
    } else if (S.loggedIn) { S.loggedIn = false; saveLocal(); }
  } catch (e) { console.error(e); FBX.online = false; FBX.why = 'Could not start Firebase: ' + niceError(e); }
  go();
})();

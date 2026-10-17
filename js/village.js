// ═══════════════════════════════════════════
// js/village.js（ES module）
// 村莊（公開版）：用 Gmail 登入，建立村莊或用邀請連結加入朋友的村莊。村莊成員共用玩家名單，
// 主持完可以把這場存進村莊，遊玩數據頁顯示這個村莊自己的排行榜、勝率、獎項與場次紀錄。
// 這個檔案只負責跟 Firebase（登入、Firestore）溝通，畫面在 js/village-ui.js。
//
// 資料放在 Firestore（跟連線房間同一個專案，規則見 firestore.rules）：
//   villages/{vid}            村莊：name、ownerUid、ownerName、inviteCode、roster（玩家名單）、createdAt
//   villages/{vid}/members/{uid}  成員：uid、name、role（owner 村長／member 成員）、joinedAt、code
//   villages/{vid}/games/{gid}    存進村莊的場次：跟遊玩數據的場次格式一樣，另外記 recordedBy／recordedByName
//   invites/{code}            邀請碼 → 哪個村莊（vid、name）；知道邀請碼才查得到
//   users/{uid}               我加入了哪些村莊（villages 陣列）
// 權限：所有成員都可以存場次、改玩家名單；刪除場次、刪除村莊只有村長可以；只有成員讀得到村莊資料。
// ═══════════════════════════════════════════
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const enabled = typeof jgEditionHas === 'function' && jgEditionHas('village') && window.jgFirebaseApp;
const CURRENT_KEY = 'jgVillageCurrent';

// 畫面讀的狀態（js/village-ui.js）。ready：登入狀態確認了沒；user：{uid, name, email}；
// villages：我加入的村莊 [{id, name, role}]；current：目前選的村莊（含 roster、inviteCode）；
// members：目前村莊的成員；games：目前村莊的場次（已轉成遊玩數據的格式）。
const state = window.jgVillageState = { enabled: !!enabled, ready: false, user: null, villages: [], current: null, members: [], games: [], gamesLoaded: false, error: null };
function changed(){ if (typeof window.jgVillageOnChange === 'function') { try { window.jgVillageOnChange(); } catch (e) { console.error(e); } } }

let auth = null, db = null;
let unsubVillage = null, unsubGames = null, unsubMembers = null;

function randomId(len){
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const arr = new Uint32Array(len);
  (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(arr) : arr.forEach((_, i) => arr[i] = Math.floor(Math.random() * 1e9));
  arr.forEach(n => { s += chars[n % chars.length]; });
  return s;
}
function displayNameOf(u){ return (u.displayName || (u.email || '').split('@')[0] || '玩家').slice(0, 30); }
function stopSubs(){
  [unsubVillage, unsubGames, unsubMembers].forEach(f => { if (f) try { f(); } catch (e) {} });
  unsubVillage = unsubGames = unsubMembers = null;
}

// 從 Firestore 讀回來的文字一律清一次：名字、板子不能有 HTML 會用到的符號；紀錄裡的 < 換掉
// （紀錄本來就會用到 > 當行首符號，留著不影響）。村莊資料是其他成員寫的，避免被插入網頁語法。
function cleanName(s){ return String(s == null ? '' : s).replace(/[<>&"'`\\]/g, '').trim().slice(0, 30); }
function cleanText(s, max){ return String(s == null ? '' : s).replace(/</g, '‹').slice(0, max || 30000); }
function toGame(id, d){
  return {
    _docId: id,
    id: cleanName(d.id) || id,
    date: cleanName(d.date),
    time: cleanName(d.time),
    board: cleanName(d.board),
    resultText: cleanName(d.resultText),
    winner: ['good', 'evil', 'third'].includes(d.winner) ? d.winner : 'evil',
    players: (Array.isArray(d.players) ? d.players : []).slice(0, 20).map(p => {
      const o = { num: Number(p.num) || 0, name: cleanName(p.name), role: cleanName(p.role) };
      if (p.third) o.third = true;
      return o;
    }),
    log: cleanText(d.log),
    recordedByName: cleanName(d.recordedByName)
  };
}

async function loadMyVillages(){
  const u = state.user;
  const snap = await getDoc(doc(db, 'users', u.uid));
  const ids = (snap.exists() && Array.isArray(snap.data().villages)) ? snap.data().villages : [];
  const list = [];
  for (const vid of ids) {
    try {
      const v = await getDoc(doc(db, 'villages', vid));
      if (!v.exists()) continue;
      const m = await getDoc(doc(db, 'villages', vid, 'members', u.uid));
      if (!m.exists()) continue;
      list.push({ id: vid, name: cleanName(v.data().name), role: m.data().role === 'owner' ? 'owner' : 'member' });
    } catch (e) {
      // 被移出村莊、或村莊已經刪掉：讀不到就略過
    }
  }
  // 讀不到的村莊順手從我的清單拿掉
  const okIds = list.map(v => v.id);
  const stale = ids.filter(id => !okIds.includes(id));
  if (stale.length) { try { await setDoc(doc(db, 'users', u.uid), { villages: arrayRemove(...stale) }, { merge: true }); } catch (e) {} }
  state.villages = list;
}

function selectVillage(vid){
  stopSubs();
  state.current = null; state.members = []; state.games = []; state.gamesLoaded = false;
  const v = state.villages.find(x => x.id === vid) || state.villages[0];
  if (!v) { changed(); return; }
  try { localStorage.setItem(CURRENT_KEY, v.id); } catch (e) {}
  state.current = { id: v.id, name: v.name, role: v.role, roster: [], inviteCode: '', ownerUid: '' };
  unsubVillage = onSnapshot(doc(db, 'villages', v.id), snap => {
    if (!snap.exists()) { refresh(); return; }
    const d = snap.data();
    if (!state.current || state.current.id !== v.id) return;
    state.current.name = cleanName(d.name);
    state.current.ownerUid = d.ownerUid;
    state.current.inviteCode = cleanName(d.inviteCode);
    state.current.roster = (Array.isArray(d.roster) ? d.roster : []).map(cleanName).filter(Boolean);
    changed();
  }, err => { state.error = String(err && err.message || err); changed(); });
  unsubGames = onSnapshot(collection(db, 'villages', v.id, 'games'), snap => {
    if (!state.current || state.current.id !== v.id) return;
    const games = [];
    snap.forEach(g => games.push(toGame(g.id, g.data())));
    state.games = games; state.gamesLoaded = true;
    changed();
  }, err => { state.error = String(err && err.message || err); changed(); });
  unsubMembers = onSnapshot(collection(db, 'villages', v.id, 'members'), snap => {
    if (!state.current || state.current.id !== v.id) return;
    const ms = [];
    snap.forEach(m => { const d = m.data(); ms.push({ uid: m.id, name: cleanName(d.name), role: d.role === 'owner' ? 'owner' : 'member' }); });
    state.members = ms;
    changed();
  }, () => {});
  changed();
}

async function refresh(preferId){
  try {
    await loadMyVillages();
    let want = preferId;
    if (!want) { try { want = localStorage.getItem(CURRENT_KEY); } catch (e) {} }
    selectVillage(want);
  } catch (e) {
    state.error = String(e && e.message || e);
    changed();
  }
}

// ── 給畫面呼叫的動作 ──
const api = {
  async signIn(){
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      // 跳出視窗被擋：改用整頁跳轉登入
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        await signInWithRedirect(auth, provider);
        return;
      }
      if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
      throw e;
    }
  },
  async signOut(){ stopSubs(); await signOut(auth); },
  async createVillage(name){
    const u = state.user; if (!u) throw new Error('請先登入');
    name = cleanName(name); if (!name) throw new Error('請輸入村莊名稱');
    const vid = randomId(16), code = randomId(10);
    await setDoc(doc(db, 'villages', vid), { name, ownerUid: u.uid, ownerName: u.name, inviteCode: code, roster: [], createdAt: serverTimestamp() });
    await setDoc(doc(db, 'villages', vid, 'members', u.uid), { uid: u.uid, name: u.name, role: 'owner', joinedAt: serverTimestamp(), code });
    await setDoc(doc(db, 'invites', code), { vid, name });
    await setDoc(doc(db, 'users', u.uid), { villages: arrayUnion(vid) }, { merge: true });
    await refresh(vid);
    return vid;
  },
  // 用邀請碼查村莊名稱（加入前先給使用者確認）
  async lookupInvite(code){
    code = cleanName(code);
    if (!code) return null;
    const s = await getDoc(doc(db, 'invites', code));
    if (!s.exists()) return null;
    const d = s.data();
    return { code, vid: d.vid, name: cleanName(d.name), already: state.villages.some(v => v.id === d.vid) };
  },
  async joinVillage(code){
    const u = state.user; if (!u) throw new Error('請先登入');
    const inv = await api.lookupInvite(code);
    if (!inv) throw new Error('邀請連結無效，請跟村長要一條新的');
    if (!inv.already) {
      await setDoc(doc(db, 'villages', inv.vid, 'members', u.uid), { uid: u.uid, name: u.name, role: 'member', joinedAt: serverTimestamp(), code: inv.code });
      await setDoc(doc(db, 'users', u.uid), { villages: arrayUnion(inv.vid) }, { merge: true });
    }
    await refresh(inv.vid);
    return inv;
  },
  switchVillage(vid){ selectVillage(vid); },
  async addRosterName(name){
    const c = state.current; name = cleanName(name);
    if (!c || !name || c.roster.includes(name)) return;
    c.roster.push(name); // 畫面先更新，不用等網路
    await updateDoc(doc(db, 'villages', c.id), { roster: arrayUnion(name) });
  },
  async saveGame(record){
    const c = state.current, u = state.user;
    if (!c || !u) throw new Error('請先登入並加入村莊');
    const gid = record.id + '_' + randomId(6);
    const data = {
      id: String(record.id), date: String(record.date), time: String(record.time || ''), board: String(record.board),
      resultText: String(record.resultText), winner: record.winner,
      players: record.players.map(p => { const o = { num: p.num, name: p.name || '', role: p.role || '' }; if (p.third) o.third = true; return o; }),
      log: String(record.log || ''), recordedBy: u.uid, recordedByName: u.name, createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'villages', c.id, 'games', gid), data);
    return gid;
  },
  async deleteGame(docId){
    const c = state.current; if (!c || c.role !== 'owner') throw new Error('只有村長可以刪除紀錄');
    await deleteDoc(doc(db, 'villages', c.id, 'games', docId));
  },
  async leaveVillage(){
    const c = state.current, u = state.user; if (!c || !u) return;
    if (c.role === 'owner') throw new Error('村長不能離開自己的村莊，可以改成刪除村莊');
    await deleteDoc(doc(db, 'villages', c.id, 'members', u.uid));
    await setDoc(doc(db, 'users', u.uid), { villages: arrayRemove(c.id) }, { merge: true });
    try { localStorage.removeItem(CURRENT_KEY); } catch (e) {}
    await refresh();
  },
  // 刪除村莊：場次、成員、邀請碼、村莊本身全部刪掉（只有村長可以）。
  async deleteVillage(){
    const c = state.current, u = state.user; if (!c || !u || c.role !== 'owner') throw new Error('只有村長可以刪除村莊');
    const vid = c.id, code = c.inviteCode;
    stopSubs();
    const games = await getDocs(collection(db, 'villages', vid, 'games'));
    for (const g of games.docs) await deleteDoc(doc(db, 'villages', vid, 'games', g.id));
    const members = await getDocs(collection(db, 'villages', vid, 'members'));
    for (const m of members.docs) { if (m.id !== u.uid) await deleteDoc(doc(db, 'villages', vid, 'members', m.id)); }
    if (code) { try { await deleteDoc(doc(db, 'invites', code)); } catch (e) {} }
    await deleteDoc(doc(db, 'villages', vid, 'members', u.uid)).catch(() => {});
    await deleteDoc(doc(db, 'villages', vid));
    await setDoc(doc(db, 'users', u.uid), { villages: arrayRemove(vid) }, { merge: true });
    try { localStorage.removeItem(CURRENT_KEY); } catch (e) {}
    await refresh();
  }
};

if (enabled) {
  window.jgVillageApi = api;
  auth = getAuth(window.jgFirebaseApp);
  db = getFirestore(window.jgFirebaseApp);
  getRedirectResult(auth).catch(e => { state.error = String(e && e.message || e); changed(); });
  onAuthStateChanged(auth, async user => {
    const google = user && (user.providerData || []).some(p => p.providerId === 'google.com');
    if (!google) {
      stopSubs();
      Object.assign(state, { ready: true, user: null, villages: [], current: null, members: [], games: [], gamesLoaded: false });
      changed();
      return;
    }
    state.user = { uid: user.uid, name: displayNameOf(user), email: user.email || '' };
    state.ready = true;
    changed();
    await refresh();
  });
}

// js/room/cleanup.js：超過一天的連線房間連同子集合整個刪掉。
// 用記憶體裡的假 Firestore（路徑字串 → 資料）單獨載入這個檔案測試。
const fs = require('fs');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;
let store = {};      // 'rooms/A' → {createdAt: Date}, 'rooms/A/players/u1' → {...}
let denyDelete = false;
const deleted = [];

function makeEnv() {
  const g = {
    window: null,
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } },
    console: { log() {}, warn() {} },
    jgRoomCode: null,
    jgRoomWaitAuth: async () => 'me',
    doc: (db, ...segs) => ({ path: segs.join('/') }),
    collection: (db, ...segs) => ({ path: segs.join('/') }),
    where: (field, op, val) => ({ field, op, val }),
    limit: (n) => ({ limit: n }),
    query: (coll, ...cs) => ({ path: coll.path, cs }),
    getDocs: async (q) => {
      const prefix = q.path + '/';
      let ids = Object.keys(store).filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'));
      const cs = q.cs || [];
      const w = cs.find(c => c.field);
      if (w) ids = ids.filter(k => store[k][w.field] && store[k][w.field] < w.val);
      const lim = cs.find(c => c.limit);
      if (lim) ids = ids.slice(0, lim.limit);
      return { docs: ids.map(k => ({ id: k.slice(prefix.length), ref: { path: k }, data: () => store[k] })) };
    },
    deleteDoc: async (ref) => {
      if (denyDelete) throw new Error('permission-denied');
      deleted.push(ref.path);
      delete store[ref.path];
    },
  };
  g.window = g;
  g.window.jgFirebaseDb = {};
  return g;
}

async function run() {
  const results = [];
  const check = (name, actual, expected) => results.push({ name, ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'room', 'cleanup.js'), 'utf8');
  const env = makeEnv();
  const names = Object.keys(env);
  new Function(...names, src).apply(null, names.map(n => env[n]));
  const cleanup = env.window.jgRoomCleanupExpired;

  const now = Date.now();
  store = {
    'rooms/OLD1': { createdAt: new Date(now - 2 * DAY) },
    'rooms/OLD1/players/u1': { seatNum: 1 },
    'rooms/OLD1/players/u2': { seatNum: 2 },
    'rooms/OLD1/secrets/u1': { role: 'wolf' },
    'rooms/OLD1/votes/u1_1': { round: 1 },
    'rooms/OLD1/chat/m1': { text: 'hi' },
    'rooms/OLD1/mechwolfChecks/u1_1': {},
    'rooms/NEW1': { createdAt: new Date(now - 2 * 60 * 60 * 1000) },
    'rooms/NEW1/players/u9': { seatNum: 1 },
  };
  const n = await cleanup(true);
  check('清掉一間超過一天的房間', n, 1);
  check('舊房間的文件全部刪光', Object.keys(store).filter(k => k.startsWith('rooms/OLD1')), []);
  check('新房間（兩小時前開的）不動', Object.keys(store).filter(k => k.startsWith('rooms/NEW1')).length, 2);
  check('房間文件最後才刪', deleted[deleted.length - 1], 'rooms/OLD1');
  check('players 在其他子集合之後才刪', deleted.indexOf('rooms/OLD1/players/u1') > deleted.indexOf('rooms/OLD1/chat/m1'), true);

  // 節流：剛清過就不會再查一次
  store['rooms/OLD2'] = { createdAt: new Date(now - 3 * DAY) };
  env.localStorage.setItem('jgRoomCleanupAt', String(Date.now()));
  check('6 小時內不重複清理', await cleanup(false), 0);
  check('節流時舊房間還在', !!store['rooms/OLD2'], true);
  env.localStorage.setItem('jgRoomCleanupAt', String(Date.now() - 7 * 60 * 60 * 1000));
  check('超過 6 小時就會再清', await cleanup(false), 1);

  // 規則還沒更新（刪除被拒絕）：安靜放棄、不丟錯誤
  store['rooms/OLD3'] = { createdAt: new Date(now - 3 * DAY) };
  store['rooms/OLD3/players/u1'] = {};
  denyDelete = true;
  let threw = false, r;
  try { r = await cleanup(true); } catch (e) { threw = true; }
  check('刪除被拒絕時不丟錯誤', threw, false);
  check('刪除被拒絕時回傳 0', r, 0);
  denyDelete = false;

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r => !r.ok);
  if (anyFail) { console.error('過期房間清理測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項過期房間清理測試通過`);
  process.exit(0);
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });

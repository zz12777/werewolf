// 連線房間（js/room.js）的夜晚步驟順序、魔術師換流、夢魘恐懼判斷、幸運兒技能判斷——
// 這些都是純邏輯（不需要真的連 Firestore）。room.js 本身是 ES module，這個沙盒環境的
// jsdom 完全不會執行它，沒辦法像其他檔案那樣直接用 jsdom 載入整頁測試，所以這裡改用
// 「把檔案讀進來、動態拿掉 import/動態 import、補幾個 stub 全域變數」的方式，在一般的
// Node CommonJS context 裡單獨測試這些純邏輯函式。Firestore 讀寫（setDoc/getDoc/...）
// 相關的 async 流程仍然完全沒辦法在這裡測到，需要實機連線測試才能驗證。
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadRoomLogic() {
  let src = fs.readFileSync(path.join(__dirname, '..', 'js', 'room.js'), 'utf8');
  src = src.replace(/import\s*{[\s\S]*?}\s*from\s*"https:\/\/www\.gstatic\.com\/firebasejs\/10\.13\.0\/firebase-firestore\.js";/, '');
  src = src.replace(/await import\("https:\/\/www\.gstatic\.com\/firebasejs\/10\.13\.0\/firebase-firestore\.js"\)/g, '({getDocs: async()=>({docs:[]})})');
  const prelude = 'const WOLF_ROLES=["wolf","wolfking","whitewolf","wolfbeauty","evilknight","gargoyle","bloodmoon","mechanicalwolf","nightmare","wolfbrother_e","wolfbrother_y","wolfshaman","mask","bigbadwolf","bigmechwolf","smallmechwolf","biggreywolf","trickster"];\n'
    + '// 這幾個 Firestore 函式在純邏輯測試裡用假的（讀 global.__mockDocs 這份記憶體資料），\n'
    + '// 讓 jgRoomCheckShootEligible 這種會呼叫 getDoc(doc(...)) 的函式也能在這裡單獨測試。\n'
    + 'function doc(db, ...segs){ return segs.join("/"); }\n'
    + 'async function getDoc(ref){ const d=(global.__mockDocs||{})[ref]; return { exists:()=>d!==undefined, data:()=>d }; }\n'
    + 'async function setDoc(ref, data, opts){ global.__mockDocs=global.__mockDocs||{}; global.__mockDocs[ref]=opts&&opts.merge?Object.assign({},global.__mockDocs[ref]||{},data):data; }\n'
    + 'function collection(){ return "collection"; }\n'
    + 'function arrayUnion(v){ return v; }\n';
  const exportsFooter = '\nfunction __setComp(c){ jgRoomComp=c; }\n'
    + 'function __setPlayers(p){ jgRoomLatestPlayers=p; }\n'
    + 'function __setRoomDoc(d){ jgRoomLatestRoomDoc=d; }\n'
    + 'function __setRoomCode(c){ jgRoomCode=c; }\n'
    + 'function __setVotes(v){ jgRoomLatestVotes=v; }\n'
    + 'module.exports={jgRoomNextNightStep,jgRoomStepPresent,jgRoomEffectiveTarget,jgRoomAmIFeared,'
    + 'jgRoomActiveLuckyOne,jgRoomMyActiveLuckyOneSkill,jgRoomNextCheckStep,jgRoomCheckShootEligible,'
    + 'jgRoomComputeVoteTally,jgRoomCheckAndSetPendingBadge,'
    + '__setComp,__setPlayers,__setRoomDoc,__setRoomCode,__setVotes};';
  const wrapped = prelude + src + exportsFooter;
  const tmpPath = path.join(require('os').tmpdir(), 'jg_room_logic_' + Date.now() + '.js');
  fs.writeFileSync(tmpPath, wrapped);
  global.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => {} }, querySelectorAll: () => [] };
  global.window = global;
  global.window.jgFirebaseDb = {};
  const mod = require(tmpPath);
  fs.unlinkSync(tmpPath);
  return mod;
}

// 專門給上帝視角文字紀錄用的 loader：collection()/getDocs() 改成依「集合路徑」回傳
// global.__mockCollections 裡對應的假資料（secrets／votes／nightLog／dayLog），這樣才能
// 端對端測試 jgRoomRenderGodView 組出來的文字到底對不對，而不是只測個別的小工具函式。
function loadRoomLogicForGodView() {
  let src = fs.readFileSync(path.join(__dirname, '..', 'js', 'room.js'), 'utf8');
  src = src.replace(/import\s*{[\s\S]*?}\s*from\s*"https:\/\/www\.gstatic\.com\/firebasejs\/10\.13\.0\/firebase-firestore\.js";/, '');
  src = src.replace(/await import\("https:\/\/www\.gstatic\.com\/firebasejs\/10\.13\.0\/firebase-firestore\.js"\)/g, '({getDocs: __mockGetDocs})');
  const prelude = 'const WOLF_ROLES=["wolf","wolfking","whitewolf","wolfbeauty","evilknight","gargoyle","bloodmoon","mechanicalwolf","nightmare","wolfbrother_e","wolfbrother_y","wolfshaman","mask","bigbadwolf","bigmechwolf","smallmechwolf","biggreywolf","trickster"];\n'
    + 'function doc(db, ...segs){ return segs.join("/"); }\n'
    + 'async function getDoc(ref){ const d=(global.__mockDocs||{})[ref]; return { exists:()=>d!==undefined, data:()=>d }; }\n'
    + 'async function setDoc(ref, data, opts){ global.__mockDocs=global.__mockDocs||{}; global.__mockDocs[ref]=opts&&opts.merge?Object.assign({},global.__mockDocs[ref]||{},data):data; }\n'
    + 'function collection(db, ...segs){ return segs.join("/"); }\n'
    + 'function arrayUnion(v){ return v; }\n'
    + 'async function __mockGetDocs(collRef){ return { docs: (global.__mockCollections||{})[collRef]||[] }; }\n';
  const exportsFooter = '\nfunction __setComp(c){ jgRoomComp=c; }\n'
    + 'function __setPlayers(p){ jgRoomLatestPlayers=p; }\n'
    + 'function __setRoomDoc(d){ jgRoomLatestRoomDoc=d; }\n'
    + 'function __setRoomCode(c){ jgRoomCode=c; }\n'
    + 'module.exports={jgRoomRenderGodView,jgRoomMechWolfViewHtml,jgRoomMechWolfKillEligible,__setComp,__setPlayers,__setRoomDoc,__setRoomCode};';
  const wrapped = prelude + src + exportsFooter;
  const tmpPath = path.join(require('os').tmpdir(), 'jg_room_logic_gv_' + Date.now() + '.js');
  fs.writeFileSync(tmpPath, wrapped);
  const fakeRoot = { innerHTML: '' };
  global.document = {
    getElementById: (id) => (id==='jg-room-content'?fakeRoot:null),
    createElement: () => ({}), head: { appendChild: () => {} }, querySelectorAll: () => []
  };
  global.window = global;
  global.window.jgFirebaseDb = {};
  const mod = require(tmpPath);
  fs.unlinkSync(tmpPath);
  return { mod, fakeRoot };
}

function nightOrder(m, comp, night) {
  m.__setComp(comp);
  const seq = [];
  let step = null;
  for (let i = 0; i < 10; i++) {
    step = m.jgRoomNextNightStep(step, night);
    seq.push(step);
    if (step === 'wolf') break;
  }
  return seq.join('→');
}

function run() {
  const m = loadRoomLogic();
  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  };

  // ── 夜晚步驟順序：每個板子在第一夜／第二夜該出現的步驟 ──
  check('全部角色都有(第1夜)',
    nightOrder(m, { cupid: 1, nightmare: 1, magician: 1, guard: 1, dreamcatcher: 1, wolfbrother_e: 1, wolfbrother_y: 1, mechanicalwolf: 1, wolf: 2 }, 1),
    'cupid→nightmare→magician→guard→dreamcatcher→wolfbrother→mechwolf→wolf');
  check('全部角色都有(第2夜，邱比特應該消失)',
    nightOrder(m, { cupid: 1, nightmare: 1, magician: 1, guard: 1, dreamcatcher: 1, wolfbrother_e: 1, wolfbrother_y: 1, mechanicalwolf: 1, wolf: 2 }, 2),
    'nightmare→magician→guard→dreamcatcher→wolfbrother→mechwolf→wolf');
  check('攝夢人夢魘板', nightOrder(m, { nightmare: 1, dreamcatcher: 1, wolf: 2 }, 1), 'nightmare→dreamcatcher→wolf');
  check('魔術師板', nightOrder(m, { magician: 1, wolf: 2 }, 1), 'magician→wolf');
  check('機械狼通靈師板', nightOrder(m, { mechanicalwolf: 1, medium: 1, wolf: 0 }, 1), 'mechwolf→wolf');
  check('邱比特板(第1夜)', nightOrder(m, { cupid: 1, wolf: 2 }, 1), 'cupid→wolf');
  check('邱比特板(第2夜，不應再出現)', nightOrder(m, { cupid: 1, wolf: 2 }, 2), 'wolf');
  check('黑市商人+狼兄狼弟板(第1夜)', nightOrder(m, { blackmarket: 1, wolfbrother_e: 1, wolfbrother_y: 1, wolf: 1 }, 1), 'wolfbrother→wolf');
  check('黑市商人+狼兄狼弟板(第2夜)', nightOrder(m, { blackmarket: 1, wolfbrother_e: 1, wolfbrother_y: 1, wolf: 1 }, 2), 'wolfbrother→wolf');
  check('都沒有特殊角色', nightOrder(m, { wolf: 2 }, 1), 'wolf');

  // ── 魔術師換流對稱性 ──
  const rd = { magicianSwapNight: 2, magicianSwapAUid: 'uidA', magicianSwapBUid: 'uidB' };
  check('換流 A→B', m.jgRoomEffectiveTarget(rd, 2, 'uidA'), 'uidB');
  check('換流 B→A', m.jgRoomEffectiveTarget(rd, 2, 'uidB'), 'uidA');
  check('換流 不相關的人不受影響', m.jgRoomEffectiveTarget(rd, 2, 'uidC'), 'uidC');
  check('換流 換到別的夜晚不生效', m.jgRoomEffectiveTarget(rd, 3, 'uidA'), 'uidA');

  // ── 夢魘恐懼判斷 ──
  global.window.jgFirebaseUid = 'uidX';
  check('恐懼判斷(是)', m.jgRoomAmIFeared({ nightmareFearedNight: 1, nightmareFearedUid: 'uidX' }, 1), true);
  check('恐懼判斷(夜晚不對)', m.jgRoomAmIFeared({ nightmareFearedNight: 1, nightmareFearedUid: 'uidX' }, 2), false);

  // ── 幸運兒技能判斷（黑市商人交易來的） ──
  m.__setPlayers([
    { uid: 'p1', luckyOneSkill: 'seer', luckyOneGrantedNight: 1, alive: true },
    { uid: 'p2', luckyOneSkill: 'witch', luckyOneGrantedNight: 2, alive: true },
    { uid: 'p3', luckyOneSkill: 'witch', luckyOneGrantedNight: 1, alive: true, luckyOneWitchUsed: true },
  ]);
  check('幸運兒技能取得當晚還不能用', m.jgRoomActiveLuckyOne('seer', 1), undefined);
  check('幸運兒技能下一晚起可以用', (m.jgRoomActiveLuckyOne('seer', 2) || {}).uid, 'p1');
  check('已用過的女巫技能不會再被找到', m.jgRoomActiveLuckyOne('witch', 1), undefined);
  global.window.jgFirebaseUid = 'p1';
  check('我自己持有的幸運兒技能', m.jgRoomMyActiveLuckyOneSkill(2), 'seer');

  // ── 查驗步驟：沒有真預言家，只有幸運兒查驗技能時，也要正確排進 seer 步驟 ──
  m.__setComp({});
  m.__setPlayers([{ uid: 'p1', luckyOneSkill: 'seer', luckyOneGrantedNight: 1, alive: true }]);
  m.__setRoomDoc({ night: 2 });
  check('沒有真預言家但有幸運兒查驗技能', m.jgRoomNextCheckStep(), 'seer');
  m.__setRoomDoc({ night: 1 });
  check('幸運兒技能授予當晚查驗步驟不會出現', m.jgRoomNextCheckStep(), null);
  m.__setComp({ medium: 1 });
  check('沒有預言家/幸運兒查驗，但有通靈師', m.jgRoomNextCheckStep(), 'medium');

  // ── 計票（jgRoomComputeVoteTally）：唯一最高票、平票、警長加權 ──
  m.__setPlayers([
    { uid: 'u1', seatNum: 1, name: 'A' },
    { uid: 'u2', seatNum: 2, name: 'B' },
    { uid: 'u3', seatNum: 3, name: 'C' },
    { uid: 'u4', seatNum: 4, name: 'D' },
  ]);
  m.__setVotes([
    { uid: 'u1', round: 1, targetUid: 'u3', targetSeatNum: 3 },
    { uid: 'u2', round: 1, targetUid: 'u3', targetSeatNum: 3 },
    { uid: 'u4', round: 1, targetUid: 'u1', targetSeatNum: 1 },
  ]);
  {
    const { entries, top } = m.jgRoomComputeVoteTally(1, null);
    check('計票(無加權)：3號最高票', top.length === 1 && Number(top[0].seat) === 3 && top[0].weight === 2, true);
  }
  m.__setVotes([
    { uid: 'u1', round: 2, targetUid: 'u3', targetSeatNum: 3 },
    { uid: 'u2', round: 2, targetUid: 'u1', targetSeatNum: 1 },
  ]);
  {
    // u1 是警長，u1 投給 3號，這票算 1.5 票 → 3號(1.5) 應該贏過 1號(1，來自 u2 這票)
    const weightFn = (uid) => (uid === 'u1' ? 1.5 : 1);
    const { entries, top } = m.jgRoomComputeVoteTally(2, weightFn);
    check('計票(警長1.5倍)：警長那票加權後贏過票數相同但沒警長的一方', top.length === 1 && Number(top[0].seat) === 3 && top[0].weight === 1.5, true);
  }
  m.__setVotes([
    { uid: 'u1', round: 3, targetUid: 'u3', targetSeatNum: 3 },
    { uid: 'u2', round: 3, targetUid: 'u4', targetSeatNum: 4 },
  ]);
  {
    const { entries, top } = m.jgRoomComputeVoteTally(3, null);
    check('計票：平票時 top 有兩筆', top.length, 2);
  }
  m.__setVotes([]);
  {
    const { entries, top } = m.jgRoomComputeVoteTally(4, null);
    check('計票：沒有人投票時 top 是空陣列', top.length, 0);
  }

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r => !r.ok);
  if (anyFail) {
    console.error('有測試失敗！');
    process.exit(1);
  }
  console.log(`全部 ${results.length} 項純邏輯測試通過`);
}

async function runBadgeTest(){
  const m = loadRoomLogic();
  const results=[];
  const check=(name, actual, expected)=>{
    const ok = JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };
  m.__setRoomCode('ROOM1');
  m.__setPlayers([
    { uid:'sheriffUid', seatNum:1, name:'A' },
    { uid:'p2', seatNum:2, name:'B' },
  ]);

  // 情境1：現在沒有警長（sheriffWinnerSeatNum 是 null）→ 不用管警徽
  global.__mockDocs = { 'rooms/ROOM1': { sheriffWinnerSeatNum: null } };
  check('沒有警長時不用觸發警徽流程', await m.jgRoomCheckAndSetPendingBadge(), false);

  // 情境2：警長還活著 → 不用管
  global.__mockDocs = {
    'rooms/ROOM1': { sheriffWinnerSeatNum: 1 },
    'rooms/ROOM1/players/sheriffUid': { alive: true },
  };
  check('警長還活著時不用觸發警徽流程', await m.jgRoomCheckAndSetPendingBadge(), false);

  // 情境3：警長死了、還沒處理過 → 應該觸發，並且把 pendingBadgeUid 寫回房間文件
  global.__mockDocs = {
    'rooms/ROOM1': { sheriffWinnerSeatNum: 1 },
    'rooms/ROOM1/players/sheriffUid': { alive: false },
  };
  const triggered = await m.jgRoomCheckAndSetPendingBadge();
  check('警長剛死、還沒處理過警徽 → 觸發警徽流程', triggered, true);
  check('觸發後 pendingBadgeUid 正確寫入房間文件', global.__mockDocs['rooms/ROOM1'].pendingBadgeUid, 'sheriffUid');

  // 情境4：這個人的警徽已經處理過了（sheriffBadgeHandledUids 裡有他）→ 不該再觸發一次
  global.__mockDocs = {
    'rooms/ROOM1': { sheriffWinnerSeatNum: 1, sheriffBadgeHandledUids: ['sheriffUid'] },
    'rooms/ROOM1/players/sheriffUid': { alive: false },
  };
  check('這個人的警徽已經處理過，不該重複觸發', await m.jgRoomCheckAndSetPendingBadge(), false);

  // 情境5：pendingBadgeUid 已經設定好、正在等他決定 → 回傳 true（讓呼叫端知道要卡住），
  // 但不應該又重新設定一次（idempotent）
  global.__mockDocs = {
    'rooms/ROOM1': { sheriffWinnerSeatNum: 1, pendingBadgeUid: 'sheriffUid' },
    'rooms/ROOM1/players/sheriffUid': { alive: false },
  };
  check('已經在等警徽決定時，回傳 true 但不重複設定', await m.jgRoomCheckAndSetPendingBadge(), true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r => !r.ok);
  if (anyFail) {
    console.error('警徽傳遞測試有失敗！');
    process.exit(1);
  }
  console.log(`全部 ${results.length} 項警徽傳遞測試通過`);
}

async function runAsync() {
  const m = loadRoomLogic();
  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  };
  m.__setRoomCode('ROOM1');
  global.__mockDocs = {
    'rooms/ROOM1/secrets/hunterUid': { role: 'hunter' },
    'rooms/ROOM1/secrets/wolfkingUid': { role: 'wolfking' },
    'rooms/ROOM1/secrets/villagerUid': { role: 'villager' },
    'rooms/ROOM1/players/luckyHunterUid': { luckyOneSkill: 'hunter', luckyOneGrantedNight: 1 },
    'rooms/ROOM1/players/luckyHunterTooEarlyUid': { luckyOneSkill: 'hunter', luckyOneGrantedNight: 2 },
  };
  check('獵人死於狼刀 → 有夜槍資格', await m.jgRoomCheckShootEligible('hunterUid', 2), true);
  check('黑狼王死於狼刀 → 有夜槍資格', await m.jgRoomCheckShootEligible('wolfkingUid', 2), true);
  check('平民死於狼刀 → 沒有夜槍資格', await m.jgRoomCheckShootEligible('villagerUid', 2), false);
  check('幸運兒獵槍(前一晚取得) → 有夜槍資格', await m.jgRoomCheckShootEligible('luckyHunterUid', 2), true);
  check('幸運兒獵槍(當晚才取得，還不能用) → 沒有夜槍資格', await m.jgRoomCheckShootEligible('luckyHunterTooEarlyUid', 2), false);
  check('沒有 uid → 沒有夜槍資格', await m.jgRoomCheckShootEligible(null, 2), false);
  // 白天投票放逐（dayVote=true）：獵槍比查驗/毒藥早一拍能用——當晚取得，當天白天就能用
  check('幸運兒獵槍(白天投票，當晚才取得也能用) → 有資格', await m.jgRoomCheckShootEligible('luckyHunterTooEarlyUid', 2, true), true);
  check('幸運兒獵槍(白天投票，前一晚取得) → 有資格', await m.jgRoomCheckShootEligible('luckyHunterUid', 2, true), true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r => !r.ok);
  if (anyFail) {
    console.error('有測試失敗！（夜槍資格判斷）');
    process.exit(1);
  }
  console.log(`全部 ${results.length} 項夜槍資格測試通過`);
}

// 這四個測試函式都是 async、而且共用同一份 global.__mockDocs／__mockCollections 來模擬
// Firestore 資料，一定要照順序一個一個等完再跑下一個，不然「同時」執行會互相覆蓋對方剛
// setup 好的假資料，測試結果會亂掉（這是這次新增警徽測試時才發現的坑，之前 run()/runAsync()
// 兩個一起 fire-and-forget 沒踩到雷純粹是運氣好、剛好没有真的同時跑到互相干擾的那一段）。
(async () => {
  run();
  await runAsync();
  await runGodViewTest();
  await runBadgeTest();
  await runMechWolfNight1Test();
})();

async function runMechWolfNight1Test(){
  const { mod } = loadRoomLogicForGodView();
  const results=[];
  const check=(name, cond)=>{ results.push({name, ok:!!cond}); };

  mod.__setRoomCode('ROOM1');
  mod.__setComp({ mechanicalwolf:1, wolf:1 });
  mod.__setPlayers([
    { uid:'mwUid', seatNum:1, name:'機械狼', alive:true, mechWolfLearnedRole:'wolf' },
    { uid:'otherWolfUid', seatNum:2, name:'真狼', alive:true },
    { uid:'p3', seatNum:3, name:'丙', alive:true },
  ]);
  global.window.jgFirebaseUid='mwUid';
  // 板子裡還有一個活著的真狼隊友，機械狼不該有資格接管出刀（用來排除接管出刀分支的干擾，
  // 單純測試「學到的技能第一晚不該出現」這件事本身）。
  global.__mockCollections = {
    'rooms/ROOM1/secrets': [
      { id:'mwUid', data:()=>({role:'mechanicalwolf'}) },
      { id:'otherWolfUid', data:()=>({role:'wolf'}) },
    ],
  };

  mod.__setRoomDoc({ night:1 });
  const r1 = await mod.jgRoomMechWolfViewHtml(1);
  check('第一夜學到狼人技能：不該出現「發動額外一刀」的技能按鈕區塊', !r1.html.includes('發動額外一刀'));
  check('第一夜：有提示技能要等下一晚才能用', r1.html.includes('技能要等下一晚才能開始使用'));
  check('第一夜：有「確認，沒有其他行動」按鈕可以往下一步', r1.html.includes('jgRoomMechWolfSkillSkip'));

  mod.__setRoomDoc({ night:2 });
  const r2 = await mod.jgRoomMechWolfViewHtml(2);
  check('第二夜起：學到狼人的技能（發動額外一刀）應該要出現', r2.html.includes('發動額外一刀'));

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('機械狼第一夜技能限制測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項機械狼第一夜技能限制測試通過`);
}

async function runGodViewTest(){
  const { mod, fakeRoot } = loadRoomLogicForGodView();
  const results=[];
  const check=(name, cond)=>{ results.push({name, ok:!!cond}); };

  mod.__setRoomCode('ROOM1');
  mod.__setPlayers([
    { uid:'p1', seatNum:1, name:'Alice', alive:true },
    { uid:'p2', seatNum:2, name:'Bob', alive:true },
    { uid:'p3', seatNum:3, name:'Carol', alive:false },
    { uid:'p4', seatNum:4, name:'Dave', alive:true },
  ]);
  mod.__setRoomDoc({
    night:2,
    sheriffEverCandidates:['p1','p4'],
    sheriffCandidates:['p1','p4'],
    sheriffSpeechStart:1, sheriffSpeechDir:'順',
    sheriffWinnerSeatNum:1,
    votingRoundLog:[
      {round:1, type:'sheriff', script:'請投票'},
      {round:2, type:'day', script:'請投票，準備放逐一位玩家'},
    ],
  });
  global.__mockCollections = {
    'rooms/ROOM1/secrets': [
      { id:'p1', data:()=>({role:'seer'}) },
      { id:'p2', data:()=>({role:'wolf'}) },
      { id:'p3', data:()=>({role:'villager'}) },
      { id:'p4', data:()=>({role:'witch'}) },
    ],
    'rooms/ROOM1/votes': [
      { id:'p2_1', data:()=>({round:1, voterUid:'p2', targetSeatNum:1}) },
      { id:'p4_1', data:()=>({round:1, voterUid:'p4', targetSeatNum:1}) },
      { id:'p1_2', data:()=>({round:2, voterUid:'p1', targetSeatNum:3}) },
      { id:'p2_2', data:()=>({round:2, voterUid:'p2', targetSeatNum:3}) },
      { id:'p4_2', data:()=>({round:2, voterUid:'p4', targetSeatNum:3}) },
    ],
    'rooms/ROOM1/nightLog': [
      { id:'1', data:()=>({lines:['守 1','刀 3','驗 2(狼)']}) },
    ],
    'rooms/ROOM1/dayLog': [
      { id:'1', data:()=>({deathLine:'3號死亡'}) },
    ],
  };

  await mod.jgRoomRenderGodView();
  const html=fakeRoot.innerHTML;
  check('包含玩家狀態格子(1號)', html.includes('1號')&&html.includes('Alice'));
  check('包含已出局標記', html.includes('（已出局）'));
  check('包含夜晚1st標頭', html.includes('**夜晚1st'));
  check('包含夜晚行動內容(守 1)', html.includes('--守 1'));
  check('包含刀的紀錄(刀 3)', html.includes('--刀 3'));
  check('包含警長競選標頭', html.includes('**警長競選'));
  check('包含候選人清單', html.includes('候選人：1、4號'));
  check('包含警長票數與當選標記', html.includes('警長票1：2,4')&&html.includes('當選警長'));
  check('包含白天1st標頭', html.includes('**白天1st'));
  check('包含死訊', html.includes('3號死亡'));
  check('包含放逐投票結果', html.includes('票3：1,2,4')&&html.includes('3號出局'));

  console.log(JSON.stringify(results, null, 2));
  const anyFail=results.some(r=>!r.ok);
  if(anyFail){ console.error('上帝視角文字紀錄測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項上帝視角文字紀錄測試通過`);
}

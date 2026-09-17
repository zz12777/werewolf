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
  global.document = { getElementById: () => null, createElement: () => ({ style:{}, appendChild(){}, remove(){} }), head: { appendChild: () => {} }, body: { appendChild(){}, }, querySelectorAll: () => [] };
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
    + 'const RNAME={wolf:"狼人",wolfking:"黑狼王",whitewolf:"白狼王",wolfbeauty:"狼美人",evilknight:"惡靈騎士",gargoyle:"石像鬼",bloodmoon:"血月使者",mechanicalwolf:"機械狼",nightmare:"夢魘",wolfbrother_e:"狼兄",wolfbrother_y:"狼弟",wolfshaman:"狼巫",mask:"假面",bigbadwolf:"大野狼",bigmechwolf:"大機械狼",smallmechwolf:"小機械狼",biggreywolf:"大灰狼",trickster:"詭術師",villager:"平民",hybrid:"混血兒",cupid:"邱比特",thief:"盜賊",fool:"傻瓜",seer:"預言家",witch:"女巫",hunter:"獵人",guard:"守衛",dreamcatcher:"攝夢人",knight:"騎士",magician:"魔術師",trickmage:"魔術師",demonhunter:"獵魔人",gravkeeper:"守墓人",medium:"通靈師",blackmarket:"黑市商人",purewhitemaiden:"純白之女",dancer:"舞者",littlegirl:"小女孩",diviner:"占卜師",zombie:"殭屍",sequenceprince:"定序王子",sheriff:"警長",luckyone:"幸運兒"};\n'
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
    + 'function __setRoomTotal(t){ jgRoomTotal=t; }\n'
    + 'module.exports={jgRoomRenderGodView,jgRoomMechWolfViewHtml,jgRoomMechWolfKillEligible,jgRoomMechWolfLearn,'
    + 'jgRoomWolfViewHtml,jgRoomWolfPropose,jgRoomWitchSave,jgRoomWitchPoison,jgRoomWitchSkip,jgRoomSeerCheck,'
    + 'jgRoomMediumCheck,jgRoomResolveNightDeaths,jgRoomCaptureDeathLine,jgRoomHostSpinSpeechOrder,'
    + '__setComp,__setPlayers,__setRoomDoc,__setRoomCode,__setRoomTotal};';
  const wrapped = prelude + src + exportsFooter;
  const tmpPath = path.join(require('os').tmpdir(), 'jg_room_logic_gv_' + Date.now() + '.js');
  fs.writeFileSync(tmpPath, wrapped);
  const fakeRoot = { innerHTML: '' };
  global.document = {
    getElementById: (id) => (id==='jg-room-content'?fakeRoot:null),
    createElement: () => ({ style:{}, appendChild(){}, remove(){} }), head: { appendChild: () => {} }, body: { appendChild(){} }, querySelectorAll: () => []
  };
  global.window = global;
  global.window.jgFirebaseDb = {};
  global.window.confirm = global.confirm = () => true; // 測試環境沒有真的視窗，confirm 一律當使用者按了確定
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
  await runMechWolfSoloTakeoverTest();
  await runSoloWolfAutoFinalizeTest();
  await runNightChainTest();
  await runSpeechOrderTest();
  await runDeadWolfNotBlockingTest();
  await runMechWolfThenWolfChainTest();
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

// 機械狼獨自帶刀（板子上只有機械狼、沒有其他真正的狼隊友）：學完身分之後，如果剛好符合
// 「其餘狼隊友都死光/根本沒有其他狼隊友」這個接管出刀的條件，不能無條件跳去 'wolf' 那一步
// ——'wolf' 步驟的畫面是排除機械狼的，board 上又沒有別的狼人會看到那個畫面，會整場卡住。
// 這裡驗證：學完之後 currentStep 應該還留在 'mechwolf'，讓同一個畫面接著顯示接管出刀的
// 選人介面，不是空白卡住。
async function runMechWolfSoloTakeoverTest(){
  const { mod } = loadRoomLogicForGodView();
  const results=[];
  const check=(name, cond)=>{ results.push({name, ok:!!cond}); };

  mod.__setRoomCode('ROOM2');
  mod.__setComp({ mechanicalwolf:1, medium:1 }); // 機械狼+通靈師板：板子裡根本沒有配置一般狼人
  mod.__setPlayers([
    { uid:'mwUid', seatNum:1, name:'機械狼', alive:true },
    { uid:'p2', seatNum:2, name:'乙', alive:true },
    { uid:'p3', seatNum:3, name:'丙', alive:true },
  ]);
  global.window.jgFirebaseUid='mwUid';
  global.__mockCollections={
    'rooms/ROOM2/secrets':[
      { id:'mwUid', data:()=>({role:'mechanicalwolf'}) },
      { id:'p2', data:()=>({role:'villager'}) },
      { id:'p3', data:()=>({role:'medium'}) },
    ],
  };
  global.__mockDocs={
    'rooms/ROOM2':{ night:1, currentStep:'mechwolf' },
  };
  mod.__setRoomDoc({ night:1, currentStep:'mechwolf' });

  await mod.jgRoomMechWolfLearn('p2', 2, 1);

  const roomAfter=global.__mockDocs['rooms/ROOM2']||{};
  check('板子上沒有其他狼人時，學完身分後 currentStep 應該還留在 mechwolf（不能跳去 wolf）',
    roomAfter.currentStep==='mechwolf'||roomAfter.currentStep===undefined);
  check('學到的身分有正確記錄成平民（p2 是 villager）', (global.__mockDocs['rooms/ROOM2/players/mwUid']||{}).mechWolfLearnedRole==='villager');

  // 同一個畫面接著渲染，應該要能看到「今晚由你出刀」的接管出刀選人畫面
  mod.__setPlayers([
    { uid:'mwUid', seatNum:1, name:'機械狼', alive:true, mechWolfLearnedRole:'villager' },
    { uid:'p2', seatNum:2, name:'乙', alive:true },
    { uid:'p3', seatNum:3, name:'丙', alive:true },
  ]);
  mod.__setRoomDoc(roomAfter);
  const r=await mod.jgRoomMechWolfViewHtml(1);
  check('學完之後同一夜、同一個畫面應該要出現「今晚由你出刀」的接管出刀選項', r.html.includes('今晚由你出刀'));

  console.log(JSON.stringify(results, null, 2));
  const anyFail=results.some(r=>!r.ok);
  if(anyFail){ console.error('機械狼獨自帶刀測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項機械狼獨自帶刀測試通過`);
}

// 機械狼板、板子上還有一隻一般狼人（不是機械狼自己）：狼人選完刀口之後，因為狼隊裡只有
// 他一個人（機械狼不算，機械狼是分開睜眼的），照理說他自己按確認提議的當下就已經是
// 「全員（1人）到齊」，應該要自動往下一步走（有女巫的話進女巫回合），不需要等任何人。
// 這裡端對端模擬「提議 → 觸發重新渲染時的自動全員到齊檢查」，確認真的會往下一步，不會卡住。
async function runSoloWolfAutoFinalizeTest(){
  const { mod } = loadRoomLogicForGodView();
  const results=[];
  const check=(name, cond)=>{ results.push({name, ok:!!cond}); };

  mod.__setRoomCode('ROOM3');
  mod.__setComp({ wolf:1, mechanicalwolf:1, medium:1, witch:1 });
  mod.__setPlayers([
    { uid:'wolfUid', seatNum:1, name:'狼人', alive:true },
    { uid:'mwUid', seatNum:2, name:'機械狼', alive:true },
    { uid:'medUid', seatNum:3, name:'通靈師', alive:true },
    { uid:'witchUid', seatNum:4, name:'女巫', alive:true },
  ]);
  global.window.jgFirebaseUid='wolfUid';
  global.__mockCollections={
    'rooms/ROOM3/secrets':[
      { id:'wolfUid', data:()=>({role:'wolf'}) },
      { id:'mwUid', data:()=>({role:'mechanicalwolf'}) },
      { id:'medUid', data:()=>({role:'medium'}) },
      { id:'witchUid', data:()=>({role:'witch'}) },
    ],
  };
  global.__mockDocs={ 'rooms/ROOM3':{ night:1, currentStep:'wolf' } };
  mod.__setRoomDoc({ night:1, currentStep:'wolf' });

  // 狼人（board 上唯一一個真正跟狼隊一起睜眼的人，機械狼不算）提議殺 3 號
  await mod.jgRoomWolfPropose('medUid', 3, 1);
  const afterPropose=global.__mockDocs['rooms/ROOM3']||{};
  check('提議之後，自己已經自動算進確認名單裡（1人）', (afterPropose.wolfKillConfirmedBy||[]).length===1);

  // 重新整理自己的畫面（這一步本身就會觸發「全員到齊了嗎」的檢查）
  mod.__setRoomDoc(Object.assign({}, afterPropose));
  await mod.jgRoomWolfViewHtml(1);

  const afterFinalize=global.__mockDocs['rooms/ROOM3']||{};
  check('只有一個狼隊成員時，提議完不用等任何人確認，應該自動往下一步（板子有女巫，接女巫回合）',
    afterFinalize.currentStep==='witch');

  console.log(JSON.stringify(results, null, 2));
  const anyFail=results.some(r=>!r.ok);
  if(anyFail){ console.error('單一狼人自動全員到齊測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項單一狼人自動全員到齊測試通過`);
}

// 端對端驗證：女巫救人/下毒是否真的影響死亡結算、通靈師查驗是否真的顯示正確身分、
// 死訊文字是否正確反映（平安夜 vs 有人死亡）。用實際呼叫這幾個函式的方式測，不是只看
// 程式碼猜。
async function runNightChainTest(){
  const results=[];
  const check=(name, actual, expected)=>{
    const ok=JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  // ── 情境1：女巫救人，被救的人應該活下來、死訊顯示平安夜 ──
  {
    const { mod } = loadRoomLogicForGodView();
    mod.__setRoomCode('ROOMW1');
    mod.__setComp({ wolf:1, witch:1, medium:1 });
    mod.__setPlayers([
      { uid:'wolfUid', seatNum:1, name:'狼人', alive:true },
      { uid:'witchUid', seatNum:2, name:'女巫', alive:true },
      { uid:'medUid', seatNum:3, name:'通靈師', alive:true },
      { uid:'targetUid', seatNum:4, name:'丁', alive:true },
    ]);
    global.window.jgFirebaseUid='witchUid';
    global.__mockCollections={
      'rooms/ROOMW1/secrets':[
        { id:'wolfUid', data:()=>({role:'wolf'}) },
        { id:'witchUid', data:()=>({role:'witch'}) },
        { id:'medUid', data:()=>({role:'medium'}) },
        { id:'targetUid', data:()=>({role:'villager'}) },
      ],
    };
    global.__mockDocs={
      'rooms/ROOMW1':{ night:1, wolfKillNight:1, wolfKillTargetUid:'targetUid', wolfKillTargetSeatNum:4 },
    };
    mod.__setRoomDoc(global.__mockDocs['rooms/ROOMW1']);
    await mod.jgRoomWitchSave(4, 1);
    const targetAlive=global.__mockDocs['rooms/ROOMW1/players/targetUid'];
    check('女巫救人：被救的目標沒有被寫入 alive:false（活下來）', !targetAlive||targetAlive.alive!==false, true);
    await mod.jgRoomCaptureDeathLine(1);
    const dayLog=global.__mockDocs['rooms/ROOMW1/dayLog/1']||{};
    check('女巫救人成功：死訊正確顯示平安夜', dayLog.deathLine, '平安夜');
  }

  // ── 情境2：女巫下毒，中毒的人應該死亡、死訊顯示正確號碼 ──
  {
    const { mod } = loadRoomLogicForGodView();
    mod.__setRoomCode('ROOMW2');
    mod.__setComp({ wolf:1, witch:1, medium:1 });
    mod.__setPlayers([
      { uid:'wolfUid', seatNum:1, name:'狼人', alive:true },
      { uid:'witchUid', seatNum:2, name:'女巫', alive:true },
      { uid:'medUid', seatNum:3, name:'通靈師', alive:true },
      { uid:'poisonedUid', seatNum:5, name:'戊', alive:true },
    ]);
    global.window.jgFirebaseUid='witchUid';
    global.__mockCollections={
      'rooms/ROOMW2/secrets':[
        { id:'wolfUid', data:()=>({role:'wolf'}) },
        { id:'witchUid', data:()=>({role:'witch'}) },
        { id:'medUid', data:()=>({role:'medium'}) },
        { id:'poisonedUid', data:()=>({role:'villager'}) },
      ],
    };
    global.__mockDocs={
      'rooms/ROOMW2':{ night:1, wolfKillNight:1, wolfKillTargetUid:null, wolfKillTargetSeatNum:null },
    };
    mod.__setRoomDoc(global.__mockDocs['rooms/ROOMW2']);
    await mod.jgRoomWitchPoison('poisonedUid', 5, 1);
    const poisonedAfter=global.__mockDocs['rooms/ROOMW2/players/poisonedUid']||{};
    check('女巫下毒：中毒的目標被正確標記死亡', poisonedAfter.alive, false);
    await mod.jgRoomCaptureDeathLine(1);
    const dayLog=global.__mockDocs['rooms/ROOMW2/dayLog/1']||{};
    check('下毒成功：死訊正確顯示中毒者的座位號碼', dayLog.deathLine, '5號死亡');
  }

  // ── 情境3：通靈師查驗，應該顯示對方真實身分的中文名稱 ──
  {
    const { mod } = loadRoomLogicForGodView();
    mod.__setRoomCode('ROOMM1');
    mod.__setComp({ wolf:1, medium:1 });
    mod.__setPlayers([
      { uid:'wolfUid', seatNum:1, name:'狼人', alive:true },
      { uid:'medUid', seatNum:3, name:'通靈師', alive:true },
    ]);
    global.window.jgFirebaseUid='medUid';
    global.__mockCollections={
      'rooms/ROOMM1/secrets':[
        { id:'wolfUid', data:()=>({role:'wolf'}) },
        { id:'medUid', data:()=>({role:'medium'}) },
      ],
    };
    global.__mockDocs={
      'rooms/ROOMM1':{ night:1 },
      // jgRoomMediumCheck 是用單筆 getDoc 查對方的 secrets（不是用 getDocs 查整個集合），
      // 要另外補一份 __mockDocs 的對應項目，跟上面 __mockCollections 那份（給
      // jgRoomGetWolfUids 這種查整個集合的函式用）不是同一份資料來源。
      'rooms/ROOMM1/secrets/wolfUid':{ role:'wolf' },
    };
    mod.__setRoomDoc(global.__mockDocs['rooms/ROOMM1']);
    await mod.jgRoomMediumCheck('wolfUid', 1, 1);
    const checkDoc=global.__mockDocs['rooms/ROOMM1/mediumChecks/medUid']||{};
    check('通靈師查驗：正確顯示對方真實身分「狼人」', checkDoc.roleName, '狼人');
  }

  console.log(JSON.stringify(results, null, 2));
  const anyFail=results.some(r=>!r.ok);
  if(anyFail){ console.error('女巫/通靈師/死訊鏈路測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項女巫/通靈師/死訊鏈路測試通過`);
}

// 白天發言順序抽籤：有人死亡時要固定從「死者下一位活人」（照已經定好的方向）開始，
// 不能隨機抽起點；平安夜才隨機抽起點；方向（順/逆）整局只會決定一次，決定過的話後面
// 幾天都要沿用同一個方向，不能每次抽籤都重新決定方向。
async function runSpeechOrderTest(){
  const { mod } = loadRoomLogicForGodView();
  const results=[];
  const check=(name, actual, expected)=>{
    const ok=JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  mod.__setRoomCode('ROOMS1');
  mod.__setRoomTotal(6);
  // 6人局：3號死亡，2號已經死了（3號其實也還活著沒關係，這裡只是要測試「死者下一位活人」
  // 這個規則本身，不用真的先跑一次夜晚流程），方向固定給「順」，預期從4號開始（3號的下一位、
  // 順時針方向、而且活著）。
  mod.__setPlayers([
    { uid:'p1', seatNum:1, name:'甲', alive:true },
    { uid:'p2', seatNum:2, name:'乙', alive:false },
    { uid:'p3', seatNum:3, name:'丙', alive:false },
    { uid:'p4', seatNum:4, name:'丁', alive:true },
    { uid:'p5', seatNum:5, name:'戊', alive:true },
    { uid:'p6', seatNum:6, name:'己', alive:true },
  ]);
  global.__mockDocs={
    'rooms/ROOMS1':{ night:1, daySpeechDir:'順' },
    'rooms/ROOMS1/dayLog/1':{ deathLine:'3號死亡' },
  };
  mod.__setRoomDoc(global.__mockDocs['rooms/ROOMS1']);
  await mod.jgRoomHostSpinSpeechOrder();
  const r1=global.__mockDocs['rooms/ROOMS1']||{};
  check('有人死亡：起點固定是死者的下一位活人（3號死亡、順時針→4號）', r1.daySpeechStart, 4);
  check('方向已經定過了，抽籤不會改變方向', r1.daySpeechDir, '順');

  // 平安夜：沒有死訊，起點應該是隨機抽出的一個「活人」座位（不驗證確切數字，只驗證
  // 抽到的一定是活人、而且方向沿用之前定好的「順」不會被改掉）。
  mod.__setRoomDoc({ night:2, daySpeechDir:'順' });
  global.__mockDocs={
    'rooms/ROOMS1':{ night:2, daySpeechDir:'順' },
    'rooms/ROOMS1/dayLog/2':{ deathLine:'平安夜' },
  };
  await mod.jgRoomHostSpinSpeechOrder();
  const r2=global.__mockDocs['rooms/ROOMS1']||{};
  check('平安夜：抽到的起點是活人座位', [1,4,5,6].includes(r2.daySpeechStart), true);
  check('平安夜：方向依然沒有被改掉', r2.daySpeechDir, '順');

  console.log(JSON.stringify(results, null, 2));
  const anyFail=results.some(r=>!r.ok);
  if(anyFail){ console.error('發言順序抽籤測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項發言順序抽籤測試通過`);
}

// 抓到的真正 bug：jgRoomGetWolfUids() 原本沒有濾掉已經死掉的狼隊友，導致「全員到齊了嗎」
// 的判斷把死人也算進分母，狼隊只要死過一個人，活著的狼永遠湊不滿人數、整場卡死。這裡驗證
// 死掉的狼隊友不會被算進「需要確認的人數」裡。
async function runDeadWolfNotBlockingTest(){
  const { mod } = loadRoomLogicForGodView();
  const results=[];
  const check=(name, actual, expected)=>{
    const ok=JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  mod.__setRoomCode('ROOMD1');
  mod.__setComp({ wolf:2, medium:1 });
  mod.__setPlayers([
    { uid:'wolfAlive', seatNum:1, name:'活狼', alive:true },
    { uid:'wolfDead', seatNum:2, name:'死狼', alive:false }, // 已經死掉的狼隊友
    { uid:'medUid', seatNum:3, name:'通靈師', alive:true },
    { uid:'targetUid', seatNum:4, name:'丁', alive:true },
  ]);
  global.window.jgFirebaseUid='wolfAlive';
  global.__mockCollections={
    'rooms/ROOMD1/secrets':[
      { id:'wolfAlive', data:()=>({role:'wolf'}) },
      { id:'wolfDead', data:()=>({role:'wolf'}) },
      { id:'medUid', data:()=>({role:'medium'}) },
      { id:'targetUid', data:()=>({role:'villager'}) },
    ],
  };
  global.__mockDocs={ 'rooms/ROOMD1':{ night:2, currentStep:'wolf' } };
  mod.__setRoomDoc(global.__mockDocs['rooms/ROOMD1']);

  await mod.jgRoomWolfPropose('targetUid', 4, 2);
  const after=global.__mockDocs['rooms/ROOMD1']||{};
  check('狼隊有一人已經死亡：唯一活著的狼提議之後，不用等死人確認，應該自動往下一步',
    after.currentStep, 'medium');

  console.log(JSON.stringify(results, null, 2));
  const anyFail=results.some(r=>!r.ok);
  if(anyFail){ console.error('死掉的狼隊友不該卡流程測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項死掉的狼隊友不該卡流程測試通過`);
}

// 完全比照使用者回報的確切場景：2狼2神2民，「狼」是一隻一般狼人＋一隻機械狼（不是機械狼
// 自己單獨、也不是狼隊死過人），從機械狼學習開始，完整模擬到狼人提議殺人為止，確認整條
// 鏈路（機械狼學習→接棒給狼人→狼人提議→自動結算→進女巫回合）每一步都正確銜接，不是只
// 孤立測試「狼人提議」這一步本身。
async function runMechWolfThenWolfChainTest(){
  const { mod } = loadRoomLogicForGodView();
  const results=[];
  const check=(name, actual, expected)=>{
    const ok=JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  mod.__setRoomCode('ROOMC1');
  mod.__setComp({ wolf:1, mechanicalwolf:1, seer:1, witch:1, villager:2 });
  mod.__setPlayers([
    { uid:'wolfUid', seatNum:1, name:'小狼', alive:true },
    { uid:'mwUid', seatNum:2, name:'機械狼', alive:true },
    { uid:'seerUid', seatNum:3, name:'預言家', alive:true },
    { uid:'witchUid', seatNum:4, name:'女巫', alive:true },
    { uid:'v1Uid', seatNum:5, name:'民甲', alive:true },
    { uid:'v2Uid', seatNum:6, name:'民乙', alive:true },
  ]);
  global.window.confirm = global.window.confirm || (()=>true);
  global.__mockCollections={
    'rooms/ROOMC1/secrets':[
      { id:'wolfUid', data:()=>({role:'wolf'}) },
      { id:'mwUid', data:()=>({role:'mechanicalwolf'}) },
      { id:'seerUid', data:()=>({role:'seer'}) },
      { id:'witchUid', data:()=>({role:'witch'}) },
      { id:'v1Uid', data:()=>({role:'villager'}) },
      { id:'v2Uid', data:()=>({role:'villager'}) },
    ],
  };
  global.__mockDocs={ 'rooms/ROOMC1':{ night:1, currentStep:'mechwolf' } };
  mod.__setRoomDoc(global.__mockDocs['rooms/ROOMC1']);

  // 第一步：機械狼學習（學民甲的平民身分），因為小狼還活著，機械狼不該接管出刀，
  // 應該直接把流程交給 'wolf' 步驟。
  global.window.jgFirebaseUid='mwUid';
  await mod.jgRoomMechWolfLearn('v1Uid', 5, 1);
  let roomState=global.__mockDocs['rooms/ROOMC1']||{};
  check('機械狼學習完、小狼還活著：應該交棒到 wolf 步驟', roomState.currentStep, 'wolf');

  // 第二步：小狼（board上唯一真正跟狼隊一起睜眼的人）提議殺 5 號民甲。
  global.window.jgFirebaseUid='wolfUid';
  mod.__setRoomDoc(roomState);
  await mod.jgRoomWolfPropose('v1Uid', 5, 1);
  roomState=global.__mockDocs['rooms/ROOMC1']||{};
  check('小狼提議完（唯一的真狼，機械狼不算）：應該自動結算、進入女巫回合', roomState.currentStep, 'witch');
  check('狼刀目標正確記錄成5號', roomState.wolfKillTargetSeatNum, 5);

  console.log(JSON.stringify(results, null, 2));
  const anyFail=results.some(r=>!r.ok);
  if(anyFail){ console.error('機械狼接棒狼人完整鏈路測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項機械狼接棒狼人完整鏈路測試通過`);
}

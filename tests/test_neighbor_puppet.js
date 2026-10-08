const { JSDOM } = require('jsdom');
const path = require('path');

// 唯鄰是從板：狼人第一晚開刀前選相鄰玩家當傀儡，傀儡被查驗為查殺、預言家查驗相反、
// 女巫／獵人／守衛技能失效。
async function newGame(window, seatRoleMap){
  const comp = {};
  Object.values(seatRoleMap).forEach(r=>{ comp[r]=(comp[r]||0)+1; });
  window.__seatRoleMap = seatRoleMap; window.__comp = comp;
  window.eval("jgBoardPreset='neighbor_puppet'");
  window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, 12)');
}
function setVal(window, id, v){
  const el = window.document.getElementById(id);
  if(!el) throw new Error('找不到欄位 '+id);
  el.value = String(v);
}

async function run(){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'file://' + path.join(__dirname, '..') + '/'
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200));
  window.Element.prototype.scrollTo = window.Element.prototype.scrollTo || function(){};
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function(){};
  window.HTMLElement.prototype.scrollTo = window.HTMLElement.prototype.scrollTo || function(){};
  const alerts = [];
  window.alert = msg=>alerts.push(String(msg));
  window.confirm = ()=>true;

  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: actual===expected, actual, expected});

  // 狼人 1、2、3 號；平民 4～8；預言家 9、女巫 10、獵人 11、守衛 12。
  const seats = {1:'wolf',2:'wolf',3:'wolf',4:'villager',5:'villager',6:'villager',7:'villager',8:'villager',9:'seer',10:'witch',11:'hunter',12:'guard'};

  // ── 情境 1：傀儡選到不相鄰的人會被擋下 ──
  await newGame(window, seats);
  check('開局後唯鄰是從模式開啟', window.eval('jgPuppetMode'), true);
  check('相鄰候選（圓桌頭尾相連）', window.eval('jgPuppetCandidateNums([1,2,3]).join(",")'), '4,12');
  window.eval("jgGoStep('wolf-wake')");
  check('狼人睜眼第一晚有傀儡欄位', !!window.document.getElementById('jg-puppet-pick'), true);
  setVal(window, 'jg-puppet-pick', 6);
  setVal(window, 'jg-wolf-rec', 5);
  alerts.length = 0;
  window.eval('jgSaveWolf()');
  check('選不相鄰的 6 號會跳出警告', alerts.length>0 && alerts[0].includes('不能當傀儡'), true);
  check('選錯時不會標記傀儡', window.eval('!!jgPuppetPlayer()'), false);

  // ── 情境 2：守衛 12 號當傀儡，守護失效 ──
  setVal(window, 'jg-puppet-pick', 12);
  setVal(window, 'jg-wolf-rec', 5);
  window.eval('jgSaveWolf()');
  check('12 號被標記成傀儡', window.eval('jgPuppetPlayer() && jgPuppetPlayer().num'), 12);
  check('傀儡被預言家查驗為查殺', window.eval('jgSeerAppearsWolf(jgFind(12))'), true);
  check('預言家本人不是傀儡時，查好人仍是好人', window.eval('jgSeerResultIsWolf(jgFind(5))'), false);
  window.eval("jgGoStep('guard-wake')");
  setVal(window, 'jg-guard-rec', 5);
  window.eval('jgSaveGuard()');
  check('傀儡守衛的守護不生效', window.eval('jgRecord.guardTarget'), null);
  check('傀儡守衛選的人有記下來', window.eval('jgRecord._puppetGuardVoid'), '5');

  // ── 情境 3：預言家當傀儡，查驗結果相反；獵人當傀儡不能開槍 ──
  await newGame(window, {1:'villager',2:'seer',3:'wolf',4:'wolf',5:'hunter',6:'wolf',7:'villager',8:'villager',9:'villager',10:'villager',11:'witch',12:'guard'});
  window.eval("jgGoStep('wolf-wake')");
  setVal(window, 'jg-puppet-pick', 2);
  setVal(window, 'jg-wolf-rec', 8);
  window.eval('jgSaveWolf()');
  check('預言家 2 號是傀儡', window.eval('jgFind(2).puppet'), true);
  check('傀儡預言家查狼變好人', window.eval('jgSeerResultIsWolf(jgFind(3))'), false);
  check('傀儡預言家查好人變狼', window.eval('jgSeerResultIsWolf(jgFind(7))'), true);
  window.eval('jgFind(5).puppet=true; jgFind(2).puppet=false;');
  check('傀儡獵人沒有開槍資格', window.eval('jgHunterCapableTag("hunter",5)'), null);
  window.eval('jgFind(5).puppet=false;');
  check('一般獵人仍有開槍資格', window.eval('jgHunterCapableTag("hunter",5)'), 'hunter');

  // ── 情境 4：女巫當傀儡，解藥／毒藥用掉但不生效 ──
  await newGame(window, seats);
  window.eval('jgFind(10).puppet=true; jgRecord.wolfKill="5"; jgRecord.wolfKillRaw="5";');
  window.eval("jgGoStep('witch-wake')");
  window.eval('jgWitchSaveBtn(true)');
  window.eval('jgSaveWitch()');
  check('傀儡女巫的解藥不生效', window.eval('jgRecord.witchSave'), null);
  check('傀儡女巫的解藥仍算用掉', window.eval('jgWitchSaveUsed'), true);
  check('文字紀錄註記傀儡失效', window.eval('jgFormatNightLog().some(l=>l.includes("救 5(傀儡失效)"))'), true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('唯鄰是從測試有失敗！'); process.exit(1); }
  console.log('全部 '+results.length+' 項唯鄰是從測試通過');
  process.exit(0);
}

run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

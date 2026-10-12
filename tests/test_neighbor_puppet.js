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
  const pupBtn = n=>window.document.querySelector('#jg-puppet-pick-grid button[data-num="'+n+'"]');
  check('不相鄰的 6 號按鈕變灰不能點', pupBtn(6).disabled, true);
  check('狼人 1 號按鈕變灰不能點', pupBtn(1).disabled, true);
  check('相鄰的 4 號、12 號可以點', !pupBtn(4).disabled && !pupBtn(12).disabled, true);

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

  // ── 情境 2b：照實際順序，守衛先睜眼守 5 號，狼人之後才選守衛當傀儡、刀 5 號 → 守護作廢，5 號死 ──
  await newGame(window, seats);
  window.eval("jgGoStep('guard-wake')");
  setVal(window, 'jg-guard-rec', 5);
  window.eval('jgSaveGuard()');
  check('守衛先睜眼時還不是傀儡：守護先記下', String(window.eval('jgRecord.guardTarget')), '5');
  window.eval("jgGoStep('wolf-wake')");
  setVal(window, 'jg-puppet-pick', 12);
  setVal(window, 'jg-wolf-rec', 5);
  window.eval('jgSaveWolf()');
  check('狼人選守衛當傀儡後：今晚的守護作廢', window.eval('jgRecord.guardTarget'), null);
  check('作廢的守護有記下來（文字紀錄用）', window.eval('jgRecord._puppetGuardVoid'), '5');

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

  // ── 情境 5：第一夜狼人號碼還沒記錄時，傀儡按鈕全灰，選完狼人號碼才開放相鄰的人 ──
  await newGame(window, seats);
  window.eval("jgMechAssignDone=false; [1,2,3,9].forEach(n=>{ jgFind(n).role=null; });");
  window.eval("jgGoStep('wolf-wake')");
  check('還沒選狼人號碼時，傀儡按鈕全部不能點', [...window.document.querySelectorAll('#jg-puppet-pick-grid button')].every(b=>b.disabled), true);
  window.eval("jgNumGridPick('jg-wolf-who-0',5,'jgWolfIdOnChange'); jgNumGridPick('jg-wolf-who-1',6,'jgWolfIdOnChange'); jgNumGridPick('jg-wolf-who-2',7,'jgWolfIdOnChange');");
  const pupOn = [...window.document.querySelectorAll('#jg-puppet-pick-grid button')].filter(b=>!b.disabled).map(b=>b.getAttribute('data-num')).join(',');
  check('選了狼人 5、6、7 號後只開放 4、8 號', pupOn, '4,8');
  window.eval("jgNumGridPick('jg-puppet-pick',8)");
  window.eval("jgNumGridPick('jg-wolf-who-2',10,'jgWolfIdOnChange')");
  check('狼人改號後原本選的傀儡已經不能選，自動清掉', window.document.getElementById('jg-puppet-pick').value, '');

  // ── 情境 6：第一夜預言家剛點選號碼（身分還沒存進去）就是傀儡，查驗結果也要相反 ──
  await newGame(window, seats);
  window.eval("jgMechAssignDone=false; jgFind(9).role=null; jgFind(9).puppet=true;");
  window.eval("jgGoStep('seer-wake')");
  window.eval("jgNumGridPick('jg-seer-who',9,'jgSeerWhoOnChange'); jgNumGridPick('jg-seer-target-input',1,'jgUpdateSeerResult');");
  check('第一夜傀儡預言家查狼人顯示好人', window.document.getElementById('jg-seer-result-box').textContent.includes('好人'), true);
  window.eval("jgNumGridPick('jg-seer-target-input',5,'jgUpdateSeerResult');");
  check('第一夜傀儡預言家查好人顯示狼人', window.document.getElementById('jg-seer-result-box').textContent.includes('狼人'), true);
  check('查驗結果下方不再出現給法官的註記', window.document.getElementById('jg-seer-result-box').textContent.includes('傀儡'), false);

  // ── 情境 7：傀儡獵人被投票出局，不跳視窗，直接宣布淘汰進遺言 ──
  await newGame(window, seats);
  window.eval('jgFind(11).puppet=true;');
  window.eval("jgGoStep('hunter-wake')");
  check('獵人睜眼畫面不顯示給法官的註記', window.document.getElementById('jg-content').textContent.includes('給法官的註記'), false);
  alerts.length = 0;
  window.eval('var __h=jgFind(11); jgFinishVoteOut(__h, "hunter");');
  check('傀儡獵人出局不跳視窗', alerts.length, 0);
  check('直接進入遺言並宣布淘汰', window.document.getElementById('jg-content').textContent.includes('11號淘汰，發表遺言。'), true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('唯鄰是從測試有失敗！'); process.exit(1); }
  console.log('全部 '+results.length+' 項唯鄰是從測試通過');
  process.exit(0);
}

run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

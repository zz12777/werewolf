const { JSDOM } = require('jsdom');
const path = require('path');

// 這次修正的核心規則：攝夢人的規則寫的是「若攝夢人在夜裡死亡，夢遊者才會一同死去」——
// 白天投票出局（不管是直接出局、還是出局後觸發的開槍/連鎖開槍，例如黑狼王被投票出局後
// 開槍帶走攝夢人）都不算夜裡死亡，不該觸發這條陪葬規則。這裡直接測 jgCascadeDreamcatcherDeath
// 這個函式本身，涵蓋「白天死亡不陪葬」跟「夜裡死亡照樣陪葬」兩種情境，確保修正是正確的、
// 也沒有把原本正常的夜晚流程改壞。
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

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  // 6人局：黑狼王、攝夢人、預言家、女巫、平民x2
  const seatRoleMap = {1:'wolfking',2:'dreamcatcher',3:'seer',4:'witch',5:'villager',6:'villager'};
  const comp = {wolfking:1, dreamcatcher:1, seer:1, witch:1, villager:2};
  window.__seatRoleMap = seatRoleMap; window.__comp = comp; window.__total = 6;
  window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, window.__total)');

  // ── 情境1：白天死亡（黑狼王被投票出局後開槍帶走攝夢人）——夢遊對象不該陪葬 ──
  window.eval(`
    jgRecord.dreamcatcherTarget = '5'; // 攝夢人昨晚夢遊5號
  `);
  const dayResult = window.eval(`jgCascadeDreamcatcherDeath('dreamcatcher', true, false)`);
  const p5AliveAfterDay = window.eval(`jgFind('5').alive`);
  check('白天死亡（isNightDeath=false）：函式回傳值應該是 null（沒有觸發陪葬）', dayResult, null);
  check('白天死亡：夢遊對象（5號）應該還活著，不該被陪葬', p5AliveAfterDay, true);

  // ── 情境2：夜裡死亡——夢遊對象該陪葬（確認修正沒有把原本的夜晚規則改壞）──
  window.eval(`
    jgRecord.dreamcatcherTarget = '6'; // 攝夢人夢遊6號
  `);
  const nightResult = window.eval(`jgCascadeDreamcatcherDeath('dreamcatcher', true, true)`);
  const p6AliveAfterNight = window.eval(`jgFind('6').alive`);
  check('夜裡死亡（isNightDeath=true）：函式應該回傳夢遊對象的號碼（6）', nightResult, 6);
  check('夜裡死亡：夢遊對象（6號）應該被陪葬、變成死亡', p6AliveAfterNight, false);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('攝夢人白天/夜晚死亡規則測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項攝夢人白天/夜晚死亡規則測試通過`);
}

async function runIntegrationTest(){
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

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  // 完整走一次「黑狼王被投票出局後開槍帶走攝夢人」的真實呼叫路徑（jgSaveWolfKingShot），
  // 不是只測拆出來的獨立函式——確保 _voteOutNum／shooter 這些串接條件真的接得起來。
  const seatRoleMap = {1:'wolfking',2:'dreamcatcher',3:'seer',4:'witch',5:'villager',6:'villager'};
  const comp = {wolfking:1, dreamcatcher:1, seer:1, witch:1, villager:2};
  window.__seatRoleMap = seatRoleMap; window.__comp = comp; window.__total = 6;
  window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, window.__total)');

  window.eval(`
    jgRecord.dreamcatcherTarget = '5'; // 攝夢人昨晚夢遊5號，今天黑狼王被投票出局
    jgRecord._voteOutNum = '1'; // 1號（黑狼王）今天被投票出局
    var recEl = document.createElement('input');
    recEl.id = 'jg-wolfking-shot-rec';
    recEl.value = '2'; // 黑狼王選擇開槍帶走 2號（攝夢人）
    document.body.appendChild(recEl);
  `);
  window.eval(`jgSaveWolfKingShot()`);
  const p2Alive = window.eval(`jgFind('2').alive`); // 攝夢人本人（被槍打死，理所當然死亡）
  const p5Alive = window.eval(`jgFind('5').alive`); // 攝夢人昨晚的夢遊對象，不該陪葬

  check('黑狼王被投票出局後開槍帶走攝夢人：攝夢人本人確實死亡（槍本身的效果）', p2Alive, false);
  check('黑狼王被投票出局後開槍帶走攝夢人：昨晚的夢遊對象（5號）不該跟著陪葬（這次修的重點）', p5Alive, true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('黑狼王白天開槍帶走攝夢人整合測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項黑狼王白天開槍帶走攝夢人整合測試通過`);
}

async function runHunterIntegrationTest(){
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

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  // 獵人被投票出局後開槍帶走攝夢人——真正被白天投票流程觸發的是 jgSaveHunter（雖然放在
  // night.js 這個檔案裡，但那才是白天投票流程實際呼叫的函式；jgSaveDawnHunterShot 放在
  // day.js，卻才是真正夜裡死亡觸發的那一個——這次順便把這個檔名跟情境對不上號的地方
  // 搞清楚，兩邊都各自修正對了）。
  const seatRoleMap = {1:'hunter',2:'dreamcatcher',3:'seer',4:'witch',5:'villager',6:'villager'};
  const comp = {hunter:1, dreamcatcher:1, seer:1, witch:1, villager:2};
  window.__seatRoleMap = seatRoleMap; window.__comp = comp; window.__total = 6;
  window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, window.__total)');

  window.eval(`
    jgRecord.dreamcatcherTarget = '5'; // 攝夢人昨晚夢遊5號，今天獵人被投票出局
    var recEl = document.createElement('input');
    recEl.id = 'jg-hunter-shot-rec';
    recEl.value = '2'; // 獵人選擇開槍帶走 2號（攝夢人）
    document.body.appendChild(recEl);
  `);
  window.eval(`jgSaveHunter()`);
  const p2Alive = window.eval(`jgFind('2').alive`);
  const p5Alive = window.eval(`jgFind('5').alive`);

  check('獵人被投票出局後開槍帶走攝夢人：攝夢人本人確實死亡（槍本身的效果）', p2Alive, false);
  check('獵人被投票出局後開槍帶走攝夢人：昨晚的夢遊對象（5號）不該跟著陪葬', p5Alive, true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('獵人白天開槍帶走攝夢人整合測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項獵人白天開槍帶走攝夢人整合測試通過`);
}

async function runDawnNightShotTest(){
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

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  // 反例對照組：獵人真的在夜裡被狼刀殺死、天亮才揭曉開槍（jgSaveDawnHunterShot，
  // 真正夜裡觸發的那一個），這種情況攝夢人陪葬規則應該照常套用——確認這次修正沒有
  // 把原本正常的夜晚流程改壞。
  const seatRoleMap = {1:'wolf',2:'hunter',3:'dreamcatcher',4:'witch',5:'villager',6:'villager'};
  const comp = {wolf:1, hunter:1, dreamcatcher:1, witch:1, villager:2};
  window.__seatRoleMap = seatRoleMap; window.__comp = comp; window.__total = 6;
  window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, window.__total)');

  window.eval(`
    jgRecord.wolfKill = '3'; // 攝夢人（3號）今晚被狼刀殺死
    jgRecord.dreamcatcherTarget = '6'; // 攝夢人昨晚夢遊6號
    var recEl = document.createElement('input');
    recEl.id = 'jg-hunter-dawn-shot';
    recEl.value = ''; // 攝夢人本身不是獵人資格者，這裡的輸入框不影響攝夢人本人的死亡結算
  `);
  // 攝夢人被狼刀殺死，本身不會開槍（沒有獵人資格），這裡直接測攝夢人死亡本身的連鎖：
  // 用跟本機法官助手一致的方式，直接呼叫 jgApplyDeath + jgCascadeDreamcatcherDeath 確認
  // 夜裡死亡的攝夢人真的會讓夢遊對象陪葬（isNightDeath=true 這條路徑要維持原本行為）。
  window.eval(`
    var dcP = jgFind('3');
    var wasRole = dcP.role;
    var trulyDied = jgApplyDeath(dcP);
    window.__cascadeResult = jgCascadeDreamcatcherDeath(wasRole, trulyDied, true);
  `);
  const cascadeResult = window.eval('window.__cascadeResult');
  const p6Alive = window.eval(`jgFind('6').alive`);
  check('夜裡死亡（真實夜殺情境）：陪葬規則應該正常觸發，回傳夢遊對象號碼', cascadeResult, 6);
  check('夜裡死亡：夢遊對象（6號）應該被陪葬', p6Alive, false);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('夜晚死亡陪葬規則對照組測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項夜晚死亡陪葬規則對照組測試通過`);
}

Promise.resolve().then(run).then(runIntegrationTest).then(runHunterIntegrationTest).then(runDawnNightShotTest).catch(e=>{ console.error('FATAL', e); process.exit(1); });

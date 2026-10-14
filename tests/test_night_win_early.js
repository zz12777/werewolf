const { JSDOM } = require('jsdom');
const path = require('path');

// 白天結束、準備進入黑夜時，「狼人不管刀誰都會贏」就直接判定狼人獲勝（jgWolfGuaranteedNightWin）。
async function run(){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'file://' + path.join(__dirname, '..') + '/'
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100)); // 機器忙時等到網頁真的載完（最多再 15 秒）
  window.Element.prototype.scrollTo = window.Element.prototype.scrollTo || function(){};
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function(){};
  window.HTMLElement.prototype.scrollTo = window.HTMLElement.prototype.scrollTo || function(){};
  window.alert = ()=>{};
  window.confirm = ()=>true;
  window.fetch = ()=>Promise.resolve({ok:false, text:()=>Promise.resolve(''), json:()=>Promise.resolve({})});
  const ev = code=>window.eval(code);
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  const newGame = (seats, preset)=>{
    const comp={}; Object.values(seats).forEach(r=>{ comp[r]=(comp[r]||0)+1; });
    window.__s=seats; window.__c=comp;
    ev("jgBoardPreset='"+(preset||'custom')+"'; jgApplyDealtRoles(window.__s, window.__c, "+Object.keys(seats).length+");");
    ev("jgNight=2; jgRecord._exileVoteHeld=true;");
  };
  const kill = nums=>ev('['+nums.join(',')+'].forEach(n=>jgFind(n).alive=false)');

  // 攝夢人夢魘板：剩一狼、一獵人、兩民，白天投出一個民 → 一狼一神一民進入黑夜
  const dcBoard = {1:'wolf',2:'nightmare',3:'dreamcatcher',4:'hunter',5:'villager',6:'villager',7:'wolf',8:'villager'};
  newGame(dcBoard, 'dreamcatcher_nightmare');
  kill([2,3,7,8]);
  check('剩一狼一獵人兩民：還不能判定', ev('jgWolfGuaranteedNightWin()'), null);
  kill([5]);
  const w=ev('jgWolfGuaranteedNightWin()');
  check('投出一民後剩一狼一神一民：狼人怎麼刀都贏', w&&w.winner, 'wolf');
  ev("jgGoStep('next-night')");
  check('進入黑夜前直接顯示狼人獲勝', ev('jgLastWinResult&&jgLastWinResult.winner'), 'wolf');

  // 攝夢人還活著：夢遊者免疫狼刀，不能提前判定
  newGame(dcBoard, 'dreamcatcher_nightmare');
  kill([2,7,8,5,6]);
  check('攝夢人還活著（1 狼、攝夢人、獵人）：不能提前判定', ev('jgWolfGuaranteedNightWin()'), null);

  // 守衛還活著：不能提前判定
  const basic = {1:'wolf',2:'wolf',3:'guard',4:'hunter',5:'villager',6:'villager',7:'seer',8:'villager'};
  newGame(basic);
  kill([2,6,7,8]);
  check('守衛還活著：不能提前判定', ev('jgWolfGuaranteedNightWin()'), null);

  // 女巫還有藥：不能提前判定；藥都用完：可以
  const wb = {1:'wolf',2:'wolf',3:'witch',4:'hunter',5:'villager',6:'villager',7:'seer',8:'villager'};
  newGame(wb);
  kill([2,6,7,8]);
  check('女巫還有藥：不能提前判定', ev('jgWolfGuaranteedNightWin()'), null);
  ev('jgWitchSaveUsed=true; jgWitchPoisonUsed=true;');
  const w2=ev('jgWolfGuaranteedNightWin()');
  check('女巫藥都用完（剩狼、女巫、獵人、民）：還有兩神一民，刀民就屠民，刀神還剩一神一民，不一定贏', w2, null);
  kill([4]);
  const w3=ev('jgWolfGuaranteedNightWin()');
  check('剩狼、沒藥的女巫、一民：怎麼刀都贏', w3&&w3.winner, 'wolf');

  // 女巫只剩毒藥：狼刀在先，一狼一女巫一民進入黑夜，怎麼刀都贏
  newGame(wb);
  kill([2,4,6,7,8]);
  ev('jgWitchSaveUsed=true; jgWitchPoisonUsed=false;');
  const w5=ev('jgWolfGuaranteedNightWin()');
  check('一狼、只剩毒藥的女巫、一民：狼刀在先，直接判定狼人獲勝', w5&&w5.winner, 'wolf');
  ev('jgWitchSaveUsed=false;');
  check('女巫還有解藥：不能提前判定', ev('jgWolfGuaranteedNightWin()'), null);

  // 天亮結算的狼刀在先：狼刀屠民，同一晚女巫毒死最後一隻狼，仍然判定狼人獲勝
  newGame(wb);
  kill([2,4,6,7,8]);
  ev("jgSheriffEnabled=false; jgNight=3; jgCurrentStep='night-start'; jgRecord={wolfKill:'5',wolfKillRaw:'5',guardTarget:null,witchSave:null,witchPoison:'1',witchPoisonRaw:'1',seerChecked:null}; jgLastWinResult=null; jgGoStep('dawn');");
  check('狼刀屠民＋女巫毒死最後一狼：狼刀在先，狼人獲勝', ev('jgLastWinResult&&jgLastWinResult.winner'), 'wolf');
  // 對照：狼刀沒有達成勝利條件時，女巫毒死最後一隻狼就是好人獲勝
  newGame(wb);
  kill([2,4,6,7]);
  ev("jgSheriffEnabled=false; jgNight=3; jgCurrentStep='night-start'; jgRecord={wolfKill:'5',wolfKillRaw:'5',guardTarget:null,witchSave:null,witchPoison:'1',witchPoisonRaw:'1',seerChecked:null}; jgLastWinResult=null; jgGoStep('dawn');");
  check('狼刀沒達成勝利條件、女巫毒死最後一狼：好人獲勝', ev('jgLastWinResult&&jgLastWinResult.winner'), 'good');

  // 白貓還活著（被刀會翻牌不會死）：不能提前判定
  const cat = {1:'wolf',2:'wolf',3:'wolfbeauty',4:'whitecat',5:'villager',6:'villager',7:'bear',8:'villager'};
  newGame(cat, 'animal_dream');
  kill([2,3,6,8]);
  check('白貓還活著：不能提前判定', ev('jgWolfGuaranteedNightWin()'), null);

  // 兩狼對三好人、沒有翻盤角色：刀任何人都變成人數打平 → 狼贏
  const maj = {1:'wolf',2:'wolf',3:'seer',4:'hunter',5:'villager',6:'villager',7:'villager',8:'villager'};
  newGame(maj);
  kill([5,7]);
  // 活著：狼1、狼2、預言家、獵人、民6、民8 → 2 狼 4 好，刀一人變 2 對 3，不會贏
  check('2 狼對 4 好人：不能提前判定', ev('jgWolfGuaranteedNightWin()'), null);
  kill([8]);
  const w4=ev('jgWolfGuaranteedNightWin()');
  check('2 狼對 3 好人（沒有翻盤角色）：刀誰都打平，狼人獲勝', w4&&w4.winner, 'wolf');

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('進入黑夜前提前判定測試有失敗！'); process.exit(1); }
  console.log('全部 '+results.length+' 項進入黑夜前提前判定測試通過');
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

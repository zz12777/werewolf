const { JSDOM } = require('jsdom');
const path = require('path');

// 愛神板：愛神每晚最先睜眼連一對情侶 → 情侶睜眼 → 狼人……；情侶殉情；情侶只到下一晚開始前；
// 愛神出局後不再有情侶；情侶一好一狼也不是第三方。
async function run(){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'file://' + path.join(__dirname, '..') + '/'
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100)); // 機器忙時等到網頁真的載完（最多再 15 秒）
  window.Element.prototype.scrollTo = window.Element.prototype.scrollTo || function(){};
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function(){};
  window.HTMLElement.prototype.scrollTo = window.HTMLElement.prototype.scrollTo || function(){};
  const alerts=[]; window.alert = m=>alerts.push(String(m)); window.confirm = ()=>true;
  window.fetch = ()=>Promise.resolve({ok:false, text:()=>Promise.resolve(''), json:()=>Promise.resolve({})});
  const ev = code=>window.eval(code);
  const setVal = (id, v)=>{ const el=window.document.getElementById(id); if(!el) throw new Error('找不到欄位 '+id); el.value=String(v); };
  const text = ()=>window.document.getElementById('t-judge').textContent;
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  ev("jgBoardPreset='eros_board'; jgApplyPresetDefaults(12);");
  const sortObj=o=>Object.keys(o).sort().map(k=>k+':'+o[k]).join(',');
  check('12 人預設配置', sortObj(JSON.parse(ev('JSON.stringify(getPickComp(jgRolePick))'))), sortObj({wolf:3,wolfking:1,villager:4,seer:1,witch:1,hunter:1,eros:1}));
  check('愛神算神職', ev("GOD_ROLES.includes('eros')"), true);
  check('角色與規則有愛神卡片', !!window.document.getElementById('role-eros'), true);
  check('角色與規則有愛神板子', !!window.document.querySelector('[data-ov="board-eros"]'), true);

  // 黑狼王 1、狼 2～4；預 5、巫 6、獵 7、愛神 8、民 9～12
  const seats={1:'wolfking',2:'wolf',3:'wolf',4:'wolf',5:'seer',6:'witch',7:'hunter',8:'eros',9:'villager',10:'villager',11:'villager',12:'villager'};
  const newGame=()=>{
    const comp={}; Object.values(seats).forEach(r=>{ comp[r]=(comp[r]||0)+1; });
    window.__s=seats; window.__c=comp;
    ev("jgBoardPreset='eros_board'; document.getElementById('jg-sheriff-enabled').checked=false; jgApplyDealtRoles(window.__s, window.__c, 12);");
  };
  newGame();
  ev("jgGoStep('night-start')");
  check('第一夜最先睜眼是愛神', ev('jgNightStartNext()'), 'eros-wake');
  ev("jgGoStep('eros-wake')");
  check('愛神口白', text().includes('愛神請睜眼'), true);
  setVal('jg-eros-target1', 2); setVal('jg-eros-target2', 9);
  ev('jgSaveEros()');
  check('連完情侶', ev('jgLovers'), ['2','9']);
  check('接著情侶睜眼', ev('jgCurrentStep'), 'eros-lovers-wake');
  check('情侶睜眼口白', text().includes('情侶請睜眼'), true);
  ev('jgSaveErosLoversWake()');
  check('情侶之後輪到狼人', ev('jgCurrentStep'), 'wolf-wake');
  check('文字紀錄記下愛神連線', ev('jgFormatNightLog()').some(l=>l==='愛 2-9'), true);

  // 整晚順序：狼人 → 女巫 → 預言家 → 獵人 → 狼王
  check('女巫、預言家之後輪到獵人', ev("jgNextGodStep(null)"), 'hunter-wake');
  check('獵人之後輪到狼王', ev("jgNextGodStep('hunter-wake')"), 'wolfking-wake');
  check('狼王之後天亮', ev("jgNextGodStep('wolfking-wake')"), 'dawn');
  // 情侶的另一半今晚被刀：狼王（情侶 1、9 的情況）手勢比倒讚
  ev("jgLovers=['1','9']; jgRecord.wolfKill='9';");
  check('情侶另一半今晚被刀，狼王比倒讚', ev("jgBuildHunterStatusHtml(jgFind(1))").includes('👎'), true);
  ev("jgLovers=['2','9']; jgRecord.wolfKill=null;");
  // 狼刀 9（情侶之一）→ 天亮 2 號殉情
  setVal('jg-wolf-rec', 9);
  ev('jgSaveWolf()');
  ev("jgRecord.witchStepDone=true; jgGoStep('dawn')");
  check('狼刀情侶，另一位殉情', [ev('jgFind(9).alive'), ev('jgFind(2).alive')], [false, false]);

  // 一好一狼的情侶不是第三方
  check('情侶一好一狼不算第三方', ev('jgLoverThirdPartyMembers()'), []);

  // 第二夜：上一晚的情侶失效，愛神重新連
  ev("jgNight=2; jgGoStep('night-start')");
  check('新的一晚開始時情侶清掉', ev('jgLovers'), null);
  check('第二夜一樣最先睜眼', ev('jgNightStartNext()'), 'eros-wake');
  ev("jgGoStep('eros-wake')");
  setVal('jg-eros-target1', 8); setVal('jg-eros-target2', 8);
  ev('jgSaveEros()');
  check('不能連同一個人兩次', alerts.some(a=>a.includes('不同')), true);
  setVal('jg-eros-target2', 10);
  ev('jgSaveEros()');
  check('可以連自己', ev('jgLovers'), ['8','10']);

  // 愛神夜裡出局：當晚情侶隔天白天有效，下一晚起沒有情侶
  ev("jgFind(8).alive=false; jgFind(8).diedNight=2;");
  check('愛神死後隔天白天情侶仍有效', ev('jgLovers'), ['8','10']);
  ev("jgNight=3; jgGoStep('night-start')");
  ev("jgGoStep(jgNightStartNext())");
  check('愛神出局後一樣走流程', ev('jgCurrentStep'), 'eros-wake');
  check('愛神出局提示', text().includes('愛神已出局'), true);
  check('愛神出局後沒有選號碼欄位', !!window.document.getElementById('jg-eros-target1'), false);
  ev('jgSaveEros()');
  check('愛神出局後不再有情侶', ev('jgLovers'), null);
  check('情侶睜眼畫面照樣當掩護', text().includes('今晚沒有情侶'), true);

  // 進入黑夜前必勝判斷：愛神還活著（今晚會連情侶）就不提前判
  newGame();
  ev("[2,3,4,5,6,9,10,11].forEach(n=>{ jgFind(n).alive=false; });"); // 剩 黑狼王1、獵7、愛神8、民12
  ev("[7].forEach(n=>{ jgFind(n).alive=false; });"); // 剩 狼1、愛神8、民12
  check('愛神活著不提前判狼勝', ev('jgWolfGuaranteedNightWin()'), null);

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('愛神測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項愛神測試通過`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

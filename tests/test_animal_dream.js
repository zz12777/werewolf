const { JSDOM } = require('jsdom');
const path = require('path');

// 動物夢境板：子狐／熊／河豚／白貓（羊駝＝平民）。
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
  window.fetch = ()=>Promise.resolve({ok:false, text:()=>Promise.resolve(''), json:()=>Promise.resolve({})});
  const ev = code=>window.eval(code);
  const setVal = (id, v)=>{ const el=window.document.getElementById(id); if(!el) throw new Error('找不到欄位 '+id); el.value=String(v); };

  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  // ── 選板子：預設配置 ──
  ev("jgBoardPreset='animal_dream'; jgApplyPresetDefaults(12);");
  check('12 人預設配置', ev('JSON.stringify(getPickComp(jgRolePick))'), JSON.stringify({wolf:3, wolfbeauty:1, villager:4, bear:1, foxcub:1, pufferfish:1, whitecat:1}));
  ev('jgApplyPresetDefaults(10);');
  check('10 人預設拿掉白貓與一隻小狼', ev('JSON.stringify(getPickComp(jgRolePick))'), JSON.stringify({wolf:2, wolfbeauty:1, villager:4, bear:1, foxcub:1, pufferfish:1}));

  // 狼 1～3、狼美人 4、羊駝 5～8、熊 9、子狐 10、河豚 11、白貓 12
  const seats = {1:'wolf',2:'wolf',3:'wolf',4:'wolfbeauty',5:'villager',6:'villager',7:'villager',8:'villager',9:'bear',10:'foxcub',11:'pufferfish',12:'whitecat'};
  const newGame = ()=>{
    const comp={}; Object.values(seats).forEach(r=>{ comp[r]=(comp[r]||0)+1; });
    window.__s=seats; window.__c=comp;
    ev("jgBoardPreset='animal_dream'; jgApplyDealtRoles(window.__s, window.__c, 12);");
  };
  newGame();
  check('動物夢境判定成立', ev('jgIsAnimalDream()'), true);
  check('平民顯示為羊駝', ev('jgRoleDisplayName(jgFind(5))'), '羊駝');
  check('遊戲標題', ev('jgAutoGameTitle()'), '動物夢境');

  // ── 第一夜順序：子狐 → 狼人 → 熊 → 河豚 → 白貓 ──
  check('第一夜第一個睜眼是子狐', ev('jgNightStartNext()'), 'foxcub-wake');
  check('子狐之後輪到狼人', ev('jgAfterFoxcubStep()'), 'wolf-wake');
  check('第一夜狼人之後不叫狼美人', ev('jgNextWolfStep()'), 'witch-wake');
  check('神職鏈第一個是熊', ev('jgNextGodStep(null)'), 'bear-wake');
  check('熊之後是河豚', ev("jgNextGodStep('bear-wake')"), 'pufferfish-wake');
  check('河豚之後是白貓', ev("jgNextGodStep('pufferfish-wake')"), 'whitecat-wake');
  check('白貓之後天亮', ev("jgNextGodStep('whitecat-wake')"), 'dawn');
  ev("jgGoStep('wolf-wake')");
  check('第一夜狼人畫面沒有刀人欄位', !!window.document.getElementById('jg-wolf-rec'), false);
  ev('jgSaveWolf()');
  check('第一夜不殺人', ev('jgRecord.wolfKill'), null);

  // ── 熊咆哮 ──
  check('熊兩旁 8、10 都是好人：不咆哮', ev('jgBearGrowlInfo().growl'), false);
  ev('jgFind(8).alive=false; jgFind(7).alive=false; jgFind(6).alive=false; jgFind(5).alive=false;');
  check('跳過死人找到 4 號狼美人：咆哮', ev('jgBearGrowlInfo().left.num'), 4);
  check('有狼就咆哮', ev('jgBearGrowlInfo().growl'), true);

  // ── 第二夜：子狐魅惑狼人，當晚狼人不能殺人；魅惑狼美人，狼美人不能魅惑 ──
  newGame();
  ev('jgNight=2;');
  ev("jgGoStep('foxcub-wake')");
  setVal('jg-foxcub-charm', 2);
  ev('jgSaveFoxcub()');
  check('子狐魅惑到狼：今晚狼人不能殺人', ev('jgRecord.foxcubBlocksWolf'), true);
  check('子狐技能用掉了', ev('jgFind(10).foxcubUsed'), true);
  ev("jgGoStep('wolf-wake')");
  setVal('jg-wolf-rec', 6);
  ev('jgSaveWolf()');
  check('被魅惑當晚狼刀無效', ev('jgRecord.wolfKill'), null);
  ev("jgRecord.foxcubCharm='4';");
  check('魅惑到狼美人：狼美人當晚被擋', ev('jgFoxcubCharmed(jgFind(4))'), true);

  // ── 白貓：被殺翻牌免死，當天放逐階段結束後才死 ──
  newGame();
  ev("jgNight=2; jgCurrentStep='dawn';");
  check('白貓被殺回傳沒有真的死', ev('jgApplyDeath(jgFind(12))'), false);
  check('白貓翻牌', ev('jgFind(12).whitecatFlipped'), true);
  check('白貓還活著', ev('jgFind(12).alive'), true);
  check('翻牌後再被殺仍免疫', ev('jgApplyDeath(jgFind(12))'), false);
  ev("jgRecord._exileVoteHeld=true; jgGoStep('next-night');");
  check('放逐階段結束後白貓死亡', ev('jgFind(12).alive'), false);

  // ── 河豚：有人投給河豚，翻牌炸死投他的人（最高票出局的人照常出局）──
  newGame();
  ev("jgNight=2; jgVotePkRound=false; jgVotePkCandidates=[]; jgAbstainVoters={}; jgDayVoteOutResolvedOnce=true;");
  ev("jgGoStep('vote');");
  ev("jgVoteTally={11:{1:true,2:true}, 5:{3:true,4:true,6:true,7:true,8:true,9:true,10:true,12:true}};");
  ev("jgSaveVoteInner();");
  check('有人投河豚會先問河豚', ev('jgCurrentStep'), 'pufferfish-choice');
  check('炸的名單是 1、2', ev('jgRecord._pufferPending.voters'), [1,2]);
  ev('jgPufferfishDecide(true)');
  check('1 號被炸死', ev('jgFind(1).alive'), false);
  check('2 號被炸死', ev('jgFind(2).alive'), false);
  check('5 號照常被放逐', ev('jgFind(5).alive'), false);
  check('河豚技能用掉', ev('jgFind(11).pufferUsed'), true);
  check('文字紀錄有河豚翻牌', ev('(jgDayLog[2]||[]).some(l=>l.includes("河豚11翻牌炸1,2"))'), true);

  // 唯一投給河豚的人就是最高票出局的人：河豚不能翻牌
  newGame();
  ev("jgNight=2; jgVotePkRound=false; jgVotePkCandidates=[]; jgAbstainVoters={}; jgDayVoteOutResolvedOnce=true;");
  ev("jgGoStep('vote');");
  ev("jgVoteTally={11:{5:true}, 5:{1:true,2:true,3:true}};");
  ev("jgSaveVoteInner();");
  check('唯一投河豚的人被放逐：不問河豚', ev('jgCurrentStep')!=='pufferfish-choice', true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('動物夢境測試有失敗！'); process.exit(1); }
  console.log('全部 '+results.length+' 項動物夢境測試通過');
  process.exit(0);
}

run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

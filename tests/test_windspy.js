const { JSDOM } = require('jsdom');
const path = require('path');

// 風聲諜影板：覺醒石像鬼第一晚轉化狼隊隔壁的好人、專屬夜間順序、轉化者入隊、熊／預言家／
// 通靈師判定、機械狼學到熊／攝夢人、屠神勝負。
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
  window.HTMLMediaElement.prototype.play = function(){ window.__played=(window.__played||0)+1; return Promise.resolve(); };
  const alerts = [];
  window.alert = msg=>alerts.push(String(msg));
  window.confirm = ()=>true;
  window.fetch = ()=>Promise.resolve({ok:false, text:()=>Promise.resolve(''), json:()=>Promise.resolve({})});
  const ev = code=>window.eval(code);
  const setVal = (id, v)=>{ const el=window.document.getElementById(id); if(!el) throw new Error('找不到欄位 '+id); el.value=String(v); };
  const content = ()=>window.document.getElementById('jg-content').textContent;

  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  // ── 選板子：預設配置 ──
  ev("jgBoardPreset='windspy'; jgApplyPresetDefaults(12);");
  check('12 人預設配置', ev('JSON.stringify(getPickComp(jgRolePick))'), JSON.stringify({awgargoyle:2, mechanicalwolf:1, seer:1, medium:1, bear:1, witch:1, hunter:1, pufferfish:1, dreamcatcher:1, whitecat:1, hybrid:1}));
  ev('jgApplyPresetDefaults(10);');
  check('10 人預設拿掉機械狼與混血兒', ev('JSON.stringify(getPickComp(jgRolePick))'), JSON.stringify({awgargoyle:2, seer:1, medium:1, bear:1, witch:1, hunter:1, pufferfish:1, dreamcatcher:1, whitecat:1}));
  ev("jgBoardPreset='windspy'; jgApplyPresetDefaults(11);");
  check('其他人數也同時保留預言家和通靈師', [ev('jgRolePick.seer'), ev('jgRolePick.medium')], [1, 1]);
  check('選角畫面預言家、通靈師都在，不出現互斥提示', [ev("renderPresetPicker(); document.getElementById('jg-preset-picker').textContent.includes('不會重複出現預言家')")], [false]);
  check('自訂角色不開放覺醒石像鬼', ev("jgBoardPreset='custom'; jgSetBoardPreset('custom'); document.getElementById('jg-role-picker').textContent.includes('覺醒石像鬼')"), false);

  // 覺醒石像鬼 1、7；預言家 2、通靈師 3、熊 4、女巫 5、獵人 6、河豚 8、攝夢人 9、白貓 10、機械狼 11、混血兒 12
  const seats = {1:'awgargoyle',2:'seer',3:'medium',4:'bear',5:'witch',6:'hunter',7:'awgargoyle',8:'pufferfish',9:'dreamcatcher',10:'whitecat',11:'mechanicalwolf',12:'hybrid'};
  const newGame = ()=>{
    const comp={}; Object.values(seats).forEach(r=>{ comp[r]=(comp[r]||0)+1; });
    window.__s=seats; window.__c=comp;
    ev("jgBoardPreset='windspy'; jgApplyDealtRoles(window.__s, window.__c, 12);");
  };
  newGame();
  check('風聲諜影模式開啟', ev('jgIsWindspy()'), true);
  check('第一晚睜眼順序', ev('jgWindspySeq().join(",")'), 'hybrid-wake,mechanicalwolf-wake,dreamcatcher-wake,wolf-wake,awgargoyle-convert-a,awgargoyle-convert-b,witch-wake,seer-wake,hunter-wake,bear-wake,pufferfish-wake,whitecat-wake,medium-wake,windspy-mech-tell,windspy-convert-notify');
  check('天黑後第一個是混血兒', ev('jgNightStartNext()'), 'hybrid-wake');

  // 每個第一晚步驟都能正常顯示
  const n1 = ev('jgWindspySeq()');
  const broken = [];
  for(const st of n1){
    try{ ev("jgCurrentStep='night-start'; jgGoStep('"+st+"')"); if(ev('jgCurrentStep')!==st) broken.push(st+'→'+ev('jgCurrentStep')); }
    catch(e){ broken.push(st+':'+e.message); }
  }
  check('第一晚每個步驟都能正常顯示', broken, []);

  // 狼人存檔後照風聲諜影的順序走到覺醒石像鬼 A
  ev("jgCurrentStep='wolf-wake'; jgGoStep('witch-wake')");
  check('狼人之後是覺醒石像鬼 A 轉化', ev('jgCurrentStep'), 'awgargoyle-convert-a');
  const enabled = ()=>[...window.document.querySelectorAll('#jg-awg-convert-grid button')].filter(b=>!b.disabled).map(b=>b.getAttribute('data-num')).join(',');
  check('只能轉化狼隊隔壁：2、6、8、12', enabled(), '2,6,8,12');
  alerts.length=0;
  setVal('jg-awg-convert', 4);
  ev("jgSaveAwgConvert('A')");
  check('選不相鄰的 4 號會被擋下', alerts.length>0 && alerts[0].includes('不能轉化'), true);
  setVal('jg-awg-convert', 2);
  ev("jgSaveAwgConvert('A')");
  check('2 號預言家成為轉化者 A', ev('jgFind(2).converted'), 'A');
  check('存檔後輪到覺醒石像鬼 B', ev('jgCurrentStep'), 'awgargoyle-convert-b');
  check('B 不能再選 2 號', enabled(), '6,8,12');
  setVal('jg-awg-convert', 12);
  ev("jgSaveAwgConvert('B')");
  check('轉化混血兒失敗', ev('!!jgFind(12).converted'), false);
  check('混血兒知道自己有被轉化', ev('!!jgFind(12).hybridConvertKnown'), true);
  check('B 之後輪到女巫', ev('jgCurrentStep'), 'witch-wake');
  check('文字紀錄記下轉化', ev('jgFormatNightLog().filter(l=>l.indexOf("轉化")===0).join("|")'), '轉化A 2|轉化B 12(失敗)');
  ev("jgCurrentStep='night-start'; jgGoStep('windspy-convert-notify')");
  check('告知轉化者畫面列出 2 號', content().includes('轉化者 A：2號'), true);

  // 轉化到機械狼失敗
  newGame();
  ev("jgCurrentStep='wolf-wake'; jgGoStep('witch-wake')");
  ev("jgFind(11).role='mechanicalwolf';");
  // 把機械狼搬到 8 號旁邊測試：直接設定 8 號是機械狼
  ev("jgFind(8).role='mechanicalwolf'; jgFind(11).role='pufferfish';");
  setVal('jg-awg-convert', 8);
  ev("jgSaveAwgConvert('A')");
  check('轉化機械狼失敗、機械狼不知道', [ev('!!jgFind(8).converted'), ev('jgFind(8).convertFailedBy')], [false, 'A']);
  newGame();

  // ── 查驗 ──
  ev("jgFind(2).converted='A';");
  check('轉化者被預言家查驗為狼人', ev('jgSeerResultIsWolf(jgFind(2))'), true);
  ev("jgCurrentStep='night-start'; jgGoStep('medium-wake')");
  setVal('jg-medium-check', 2);
  ev('jgMediumCheck()');
  check('通靈師看到原本身分加註轉化者', window.document.getElementById('jg-medium-result').textContent.includes('預言家（轉化者）'), true);

  // ── 熊 ──
  check('熊 4 號左右 3、5 都是好人：不咆哮', ev('jgBearGrowlInfo().growl'), false);
  ev('jgFind(3).alive=false;');
  check('3 號死了改看 2 號轉化者：咆哮', ev('jgBearGrowlInfo().growl'), true);
  ev('jgFind(3).alive=true;');
  check('沒學習的機械狼算狼', ev('jgBearCountsAsWolf(jgFind(11))'), true);
  ev("jgMechWolfLearned='seer'; jgMechWolfLearnedNight=1;");
  check('學到預言家的機械狼不算狼', ev('jgBearCountsAsWolf(jgFind(11))'), false);
  ev("jgMechWolfLearned='awgargoyle';");
  check('學到覺醒石像鬼的機械狼算狼', ev('jgBearCountsAsWolf(jgFind(11))'), true);
  ev("jgMechWolfLearned='bear'; jgNight=2; jgFind(4).alive=false; jgFind(10).converted='B';");
  check('機械狼學到熊：真熊死了也照樣咆哮（11 號旁邊是 10 號轉化者）', ev('jgBearGrowlInfo().growl'), true);
  ev("jgFind(4).alive=true; delete jgFind(10).converted; jgMechWolfLearned=null; jgMechWolfLearnedNight=null; jgNight=1;");

  // ── 入隊與勝負 ──
  ev("jgFind(1).alive=false; jgFind(7).alive=false;");
  check('狼人全滅但轉化者、機械狼都還在：卡刀', ev('jgWindspyJoiner()'), null);
  check('狼隊還在，不分勝負', ev('jgCheckWin()'), null);
  ev("jgFind(11).alive=false;");
  check('只剩轉化者 A：可以入隊', ev('jgWindspyJoiner().num'), 2);
  ev("jgNight=2; jgCurrentStep='night-start'; jgGoStep('convert-a-wake')");
  check('轉化者 A 比讚並可以選刀口', [content().includes('👍'), !!window.document.getElementById('jg-convert-kill')], [true, true]);
  setVal('jg-convert-kill', 5);
  ev("jgSaveConvertWake('A')");
  check('轉化者的刀口記成狼刀', ev('jgRecord.wolfKill'), '5');
  check('轉化者 A 之後輪到轉化者 B', ev('jgCurrentStep'), 'convert-b-wake');
  check('沒有轉化者 B 時照樣喊、比倒讚', content().includes('👎'), true);
  ev("[3,4,5,6,8,9,10].forEach(n=>jgFind(n).alive=false);");
  const w1 = ev('jgCheckWin()');
  check('神職全滅（只剩轉化者和混血兒）：狼人獲勝', w1&&w1.winner, 'wolf');
  ev("[3,4,5,6,8,9,10].forEach(n=>jgFind(n).alive=true); jgFind(2).alive=false;");
  const w2 = ev('jgCheckWin()');
  check('狼隊全滅：好人獲勝', w2&&w2.winner, 'good');
  newGame();

  // ── 機械狼學到攝夢人 ──
  ev("jgMechWolfLearned='dreamcatcher'; jgMechWolfLearnedNight=1; jgNight=3; jgFind(9).windspyPrevDreams=['5']; jgRecord.dreamcatcherTarget='6'; jgRecord.mechDreamTarget='5';");
  ev('jgWindspyResolveDreams()');
  check('前一晚被真攝夢人夢遊、今晚被機械狼夢遊：出局', ev('jgRecord.mechDreamKillTarget'), '5');
  check('上一晚的夢遊名單更新', ev('jgFind(9).windspyPrevDreams.join(",")'), '6,5');
  ev("jgFind(9).windspyPrevDreams=['5']; jgRecord.dreamcatcherTarget='5'; jgRecord.mechDreamTarget='5';");
  ev('jgWindspyResolveDreams()');
  check('兩個攝夢人同一晚攝夢同一人：不會夢遊出局', [ev('jgRecord.dreamcatcherKillTarget'), ev('jgRecord.mechDreamKillTarget')], [null, null]);

  // ── 第二晚順序與機械狼入隊手勢 ──
  newGame();
  ev('jgNight=2;');
  check('第二晚之後睜眼順序', ev('jgWindspySeq().join(",")'), 'dreamcatcher-wake,mechanicalwolf-wake,convert-a-wake,convert-b-wake,wolf-wake,witch-wake,seer-wake,medium-wake,hunter-wake');
  ev("jgCurrentStep='night-start'; jgGoStep('mechanicalwolf-wake')");
  check('機械狼喊入隊手勢', content().includes('今晚的入隊手勢為'), true);
  ev("jgCurrentStep='seer-wake'; jgGoStep('hunter-wake')");
  check('預言家之後照順序是通靈師', ev('jgCurrentStep'), 'medium-wake');
  ev("jgCurrentStep='hunter-wake'; jgGoStep('knight-wake')");
  check('獵人之後天亮', ev('jgCurrentStep'), 'dawn');

  // ── 實際按存檔一路走完第一晚、第二晚 ──
  newGame();
  alerts.length=0;
  ev("jgGoStep('night-start'); jgGoStep(jgNightStartNext());");
  const trail=[];
  const act = {
    'hybrid-wake':()=>{ setVal('jg-hybrid-target', 5); ev('jgSaveHybrid()'); },
    'mechanicalwolf-wake':()=>{ const el=window.document.getElementById('jg-mechwolf-learn'); if(el) el.value='4'; ev('jgSaveMechanicalWolf()'); },
    'dreamcatcher-wake':()=>{ setVal('jg-dc-target', 3); ev('jgSaveDreamcatcher()'); },
    'wolf-wake':()=>{ setVal('jg-wolf-rec', 6); ev('jgSaveWolf()'); },
    'awgargoyle-convert-a':()=>{ setVal('jg-awg-convert', 2); ev("jgSaveAwgConvert('A')"); },
    'awgargoyle-convert-b':()=>{ setVal('jg-awg-convert', 8); ev("jgSaveAwgConvert('B')"); },
    'witch-wake':()=>{ ev('jgSaveWitch()'); },
    'seer-wake':()=>{ setVal('jg-seer-target-input', 1); ev('jgSaveSeer()'); },
    'hunter-wake':()=>{ ev('jgSaveHunterNight()'); },
    'bear-wake':()=>{ ev("jgSaveAnimalGodId('bear')"); },
    'pufferfish-wake':()=>{ ev("jgSaveAnimalGodId('pufferfish')"); },
    'whitecat-wake':()=>{ ev("jgSaveAnimalGodId('whitecat')"); },
    'medium-wake':()=>{ setVal('jg-medium-check', 11); ev('jgSaveMedium()'); },
    'windspy-mech-tell':()=>{ ev("jgGoStep('dawn')"); },
    'windspy-convert-notify':()=>{ ev("jgGoStep('dawn')"); },
    'convert-a-wake':()=>{ ev("jgSaveConvertWake('A')"); },
    'convert-b-wake':()=>{ ev("jgSaveConvertWake('B')"); },
  };
  for(let i=0;i<20;i++){
    const st=ev('jgCurrentStep');
    trail.push(st);
    if(!act[st]) break;
    try{ act[st](); }catch(e){ trail.push('ERR '+e.message); break; }
  }
  check('第一晚照實際存檔走完並天亮', trail.join(','), 'hybrid-wake,mechanicalwolf-wake,dreamcatcher-wake,wolf-wake,awgargoyle-convert-a,awgargoyle-convert-b,witch-wake,seer-wake,hunter-wake,bear-wake,pufferfish-wake,whitecat-wake,medium-wake,windspy-mech-tell,windspy-convert-notify,dawn');
  check('沒有跳出任何警告', alerts.filter(a=>a).length, 0);
  check('機械狼學到熊', ev('jgMechWolfLearned'), 'bear');
  check('轉化者 A 2 號、B 8 號', [ev('jgFind(2).converted'), ev('jgFind(8).converted')], ['A','B']);
  check('6 號獵人被刀死', ev('jgFind(6).alive'), false);
  check('天亮畫面公布死訊與熊', [content().includes('昨晚 6號死亡'), content().includes('熊沒有咆哮')], [true, true]);

  ev("jgNight=2; jgGoStep('night-start'); jgGoStep(jgNightStartNext());");
  act['dreamcatcher-wake']=()=>{ setVal('jg-dc-target', 4); ev('jgSaveDreamcatcher()'); };
  act['wolf-wake']=()=>{ setVal('jg-wolf-rec', 9); ev('jgSaveWolf()'); };
  act['seer-wake']=()=>{ setVal('jg-seer-target-input', 8); ev('jgSaveSeer()'); };
  act['medium-wake']=()=>{ setVal('jg-medium-check', 2); ev('jgSaveMedium()'); };
  const trail2=[];
  for(let i=0;i<20;i++){
    const st=ev('jgCurrentStep');
    trail2.push(st);
    if(!act[st]) break;
    try{ act[st](); }catch(e){ trail2.push('ERR '+e.message); break; }
  }
  check('第二晚照實際存檔走完並天亮', trail2.join(','), 'dreamcatcher-wake,mechanicalwolf-wake,convert-a-wake,convert-b-wake,wolf-wake,witch-wake,seer-wake,medium-wake,hunter-wake,dawn');
  check('第二晚沒有跳出任何警告', alerts.length, 0);
  check('9 號攝夢人被刀死', ev('jgFind(9).alive'), false);
  check('攝夢人夜裡出局，夢遊的 4 號一併出局', ev('jgFind(4).alive'), false);

  // ── 白貓：被狼刀翻牌免死，天亮公布，放逐階段結束才死 ──
  newGame();
  alerts.length=0;
  ev("jgNight=2; jgSheriffEnabled=false; jgGoStep('night-start'); jgRecord.wolfKill='10'; jgRecord.wolfKillRaw='10'; jgCurrentStep='night-start'; jgGoStep('dawn');");
  check('白貓被刀翻牌還活著', [ev('jgFind(10).alive'), ev('jgFind(10).whitecatFlipped')], [true, true]);
  check('天亮宣布白貓翻牌', content().includes('10號 是白貓，翻牌免疫本次死亡'), true);
  check('天亮是平安夜（白貓沒死）', content().includes('昨晚是平安夜'), true);
  ev("jgRecord._exileVoteHeld=true; jgGoStep('next-night');");
  check('放逐階段結束後白貓死亡', ev('jgFind(10).alive'), false);

  // 被投票出局：翻牌免死
  newGame();
  alerts.length=0;
  ev("jgNight=2; jgFinishVoteOut(jgFind(10),'whitecat');");
  check('白貓被投票出局翻牌免死', [ev('jgFind(10).alive'), alerts.some(a=>a.includes('10號 是白貓，翻牌'))], [true, true]);

  // Tip：狼人砍了最後一神白貓（翻牌），好人白天推了最後一狼 → 好人獲勝
  newGame();
  ev("[2,3,4,5,6,8,9].forEach(n=>jgFind(n).alive=false); jgFind(7).alive=false; jgFind(11).alive=false;");
  ev("jgCurrentStep='dawn'; jgApplyDeath(jgFind(10));");
  check('最後一神白貓翻牌：狼人還沒獲勝', ev('jgCheckWin()'), null);
  ev("jgFinishVoteOut(jgFind(1),'awgargoyle');");
  check('白天推了最後一狼：好人獲勝', ev('jgLastWinResult&&jgLastWinResult.winner'), 'good');

  // ── 機械狼學到白貓：學習的下一晚起，被殺也會翻牌免死 ──
  newGame();
  alerts.length=0;
  ev("jgMechWolfLearned='whitecat'; jgMechWolfLearnedNight=1; jgNight=1;");
  check('學到白貓當天還沒生效', ev('jgIsWhitecatLike(jgFind(11))'), false);
  ev("jgNight=2; jgCurrentStep='dawn';");
  check('第二晚起被殺翻牌免死', [ev('jgApplyDeath(jgFind(11))'), ev('jgFind(11).alive'), ev('jgFind(11).whitecatFlipped')], [false, true, true]);
  ev("jgFind(1).alive=false; jgFind(7).alive=false; jgCurrentStep='night-start'; jgGoStep('mechanicalwolf-wake');");
  check('翻牌後的機械狼還活著，狼人全滅時照樣入隊帶刀', [content().includes('今晚的入隊手勢為（👍 讚）'), !!window.document.getElementById('jg-mechwolf-kill')], [true, true]);
  ev("jgFind(1).alive=true; jgFind(7).alive=true;");
  ev("jgRecord._exileVoteHeld=true; jgGoStep('next-night');");
  check('機械狼（學到白貓）放逐階段結束後死亡，口白只說白貓', [ev('jgFind(11).alive'), alerts.some(a=>a.includes('11號 白貓死亡')), alerts.some(a=>a.includes('「11號 機械狼'))], [false, true, false]);

  // ── 機械狼學到河豚：投票畫面多一顆翻牌按鈕 ──
  newGame();
  alerts.length=0;
  ev("jgMechWolfLearned='pufferfish'; jgMechWolfLearnedNight=1; jgNight=2; jgVotePkRound=false; jgVotePkCandidates=[]; jgAbstainVoters={}; jgDayVoteOutResolvedOnce=true;");
  ev("jgGoStep('vote');");
  ev("jgVoteTally={11:{2:true,3:true}, 5:{4:true,6:true,8:true,9:true}};");
  check('投票畫面有真河豚和機械狼兩顆翻牌按鈕', [!!window.document.getElementById('jg-puffer-btn'), !!window.document.getElementById('jg-puffer-btn-11')], [true, true]);
  ev('jgPufferfishFlipBtn(11)');
  check('機械狼翻牌炸死投他的 2、3 號', [ev('jgFind(2).alive'), ev('jgFind(3).alive')], [false, false]);
  check('口白只說河豚，不說出機械狼', window.document.getElementById('jg-puffer-status').textContent.includes('11號 河豚翻牌，2號 3號 淘汰。'), true);
  check('文字紀錄寫出真實身分', ev('(jgDayLog[2]||[]).concat(jgRecord._voteFrozen&&jgRecord._voteFrozen.pufferLog?[jgRecord._voteFrozen.pufferLog]:[]).some(l=>l.includes("機械狼（學到河豚）11翻牌炸"))'), true);
  check('機械狼的河豚技能用掉，真河豚沒用掉', [ev('jgFind(11).pufferUsed'), ev('!!jgFind(8).pufferUsed')], [true, false]);

  // ── 熊叫音效 ──
  check('有熊叫音效播放函式', ev('typeof jgBearAudioPlay'), 'function');

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('風聲諜影測試有失敗！'); process.exit(1); }
  console.log('全部 '+results.length+' 項風聲諜影測試通過');
  process.exit(0);
}

run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

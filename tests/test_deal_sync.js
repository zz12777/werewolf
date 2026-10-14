const { JSDOM } = require('jsdom');
const path = require('path');

// 發牌房 ↔ 法官助手同步（js/deal-sync.js）：名單、警長競選資訊、手機退水、幸運兒／情侶私人提醒、口白。
// 房間那一端（Firestore）用假的函式接住，只檢查法官助手送出去的內容。
async function run(){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'file://' + path.join(__dirname, '..') + '/'
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100)); // 機器忙時等到網頁真的載完（最多再 15 秒）
  window.Element.prototype.scrollTo = window.Element.prototype.scrollTo || function(){};
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function(){};
  window.HTMLElement.prototype.scrollTo = window.HTMLElement.prototype.scrollTo || function(){};
  window.alert = ()=>{}; window.confirm = ()=>true;
  window.fetch = ()=>Promise.resolve({ok:false, text:()=>Promise.resolve(''), json:()=>Promise.resolve({})});
  const ev = code=>window.eval(code);
  const setVal = (id, v)=>{ const el=window.document.getElementById(id); if(!el) throw new Error('找不到欄位 '+id); el.value=String(v); };
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  // 假的房間端：記下最後一次同步的公開資訊、送出的私人提醒
  ev(`window.__published=null; window.__private=[];
    window.jgRoomDealLinkActive=function(code){ return code==='ROOM1'; };
    window.jgRoomDealPublish=function(info){ window.__published=JSON.parse(JSON.stringify(info)); };
    window.jgRoomDealSendPrivate=function(num, notice){ window.__private.push({num:Number(num), key:notice.key, main:notice.main}); };`);
  const pub = ()=>ev('window.__published');

  // 8 人：狼 1、4；預言家 2；女巫 3；獵人 5；邱比特 6；平民 7、8
  const seats = {1:'wolf',2:'seer',3:'witch',4:'wolf',5:'hunter',6:'cupid',7:'villager',8:'villager'};
  const comp = {}; Object.values(seats).forEach(r=>{ comp[r]=(comp[r]||0)+1; });
  window.__s=seats; window.__c=comp;
  ev("jgPlayerNames={1:'王小明',2:'陳大文',3:'林美麗',4:'張志豪',5:'李佳穎',6:'黃俊傑',7:'吳淑芬',8:'劉建國'};");
  ev("document.getElementById('jg-sheriff-enabled').checked=true; jgBoardPreset='custom'; window.jgDealLinkedCode='ROOM1'; jgApplyDealtRoles(window.__s, window.__c, 8);");
  check('開局就同步名單', (pub()&&pub().players||[]).map(p=>p.name).join(','), '王小明,陳大文,林美麗,張志豪,李佳穎,黃俊傑,吳淑芬,劉建國');

  // 邱比特連 2、7：兩位情侶各自收到提醒，口白提醒白天看畫面
  ev("jgGoStep('cupid-wake')");
  setVal('jg-cupid-target1', 2); setVal('jg-cupid-target2', 7);
  ev('jgSaveCupid()');
  check('情侶私人提醒只送給 2、7 號', ev('window.__private.filter(x=>x.key==="lovers").map(x=>x.num).sort()'), [2,7]);
  check('情侶提醒內容', ev('window.__private.find(x=>x.key==="lovers").main'), '2號、7號是情侶');
  check('情侶睜眼口白多一句看畫面', window.document.getElementById('t-judge').textContent.includes('確認自己是否為情侶之一'), true);

  // 天亮：警長競選
  ev("jgGoStep('dawn')");
  ev('jgToggleSheriffCandidate(3); jgToggleSheriffCandidate(5); jgToggleSheriffCandidate(8);');
  check('點上警號碼就同步（登記中）', [pub().sheriff.candidates, pub().sheriff.confirmed], [[3,5,8], false]);
  ev("jgSaveSheriffCandidates(); jgGoStep('sheriff-speech-order'); jgSheriffSpeakStart=5; jgSheriffSpeakDir='順'; jgConfirmSheriffSpeechOrder();");
  check('發言順序同步', pub().sheriff.order, [5,8,3]);
  check('政見發表時可以退水', pub().sheriff.canWithdraw, true);
  check('警長競選畫面不唸提醒', window.document.getElementById('t-judge').textContent.includes('確認自己是否為情侶之一'), false);
  check('公布昨晚結果時唸提醒（情侶）', ev("jgDealDayReminderHtml()").includes('情侶之一'), true);

  // 法官助手按退水不再跳確認視窗
  ev("window.confirm=()=>false; jgSheriffWithdraw(3); window.confirm=()=>true;");
  check('法官助手按退水不用確認就退', ev('jgSheriffWithdrawn.includes(3)'), true);
  ev("jgSheriffCandidates.push(3); jgSheriffWithdrawn=jgSheriffWithdrawn.filter(x=>x!==3); jgSheriffLogLines=jgSheriffLogLines.filter(l=>l!=='退水：3號'); jgRenderSheriffSpeech(); jgDealSync();");
  // 8 號從手機退水
  check('手機退水被接受', ev('jgDealRemoteWithdraw(8)'), true);
  check('法官端候選人少了 8 號', ev('jgSheriffCandidates.slice().sort()'), [3,5]);
  check('退水寫進文字紀錄', ev("jgSheriffLogLines.includes('退水：8號')"), true);
  check('退水同步給大家', pub().sheriff.withdrawn, [8]);
  check('發言順序保留退水的人（畫刪除線用）', pub().sheriff.order, [5,8,3]);
  check('不是候選人不能退水', ev('jgDealRemoteWithdraw(7)'), false);
  // 進投票之後不能退水
  ev("jgGoStep('sheriff-vote')");
  check('投票階段不能退水', [pub().sheriff.canWithdraw, ev('jgDealRemoteWithdraw(3)')], [false, false]);

  // 投票：票型與當選警長
  ev("jgSheriffVoteTally={3:{1:true,2:true,4:true},5:{6:true}}; jgSaveSheriffVoteInner();");
  check('警長票型同步（照文字紀錄寫法）', pub().sheriff.votes.slice(0,2), ['警長票3：1、2、4','警長票5：6']);
  check('當選警長同步', pub().sheriff.elected, 3);
  check('發牌房開局不送即時票型', ev('(function(){ let sent=false; const f=window.fetch; window.fetch=()=>{ sent=true; return Promise.resolve({}); }; jgLiveSyncPush(); window.fetch=f; return sent; })()'), false);
  // 白天投票票型
  ev("jgDayLog[1]=['票4：1,2,3','票7：5'];");
  ev('jgDealSync()');
  check('白天票型同步', pub().dayVotes, [{day:1, lines:['票4：1、2、3','票7：5']}]);
  // 遊戲結束：全體身分
  ev("jgFind(4).alive=false; jgShowWin({winner:'good',msg:'x',icon:''});");
  check('遊戲結束同步全體身分', pub().gameOver&&pub().gameOver.roster.map(r=>[r.num,r.role,r.alive]).slice(0,4), [[1,'狼人',true],[2,'預言家',true],[3,'女巫',true],[4,'狼人',false]]);
  ev("jgGoStep('discuss')");
  check('回到遊戲流程就收回全體身分', pub().gameOver, null);

  // 本機開局：不再同步
  ev('window.__published=null; jgStart();');
  check('本機開局不同步', ev('jgDealLinked()'), false);

  // 黑市商人：交易成功只送給幸運兒，口白改成請大家白天看畫面
  const seats2 = {1:'wolf',2:'blackmarket',3:'seer',4:'wolf',5:'villager',6:'villager',7:'villager'};
  const comp2 = {}; Object.values(seats2).forEach(r=>{ comp2[r]=(comp2[r]||0)+1; });
  window.__s=seats2; window.__c=comp2;
  ev("window.__private=[]; window.jgDealLinkedCode='ROOM1'; jgApplyDealtRoles(window.__s, window.__c, 7);");
  ev("jgGoStep('blackmarket-wake')");
  setVal('jg-bm-target', 5); setVal('jg-bm-skill', 'seer');
  ev('jgSaveBlackMarket()');
  check('幸運兒私人提醒只送給 5 號', ev('window.__private.map(x=>[x.num,x.key,x.main])'), [[5,'luckyone','你獲得的是預言家查驗']]);
  const t = window.document.getElementById('t-judge').textContent;
  check('幸運兒口白：請大家白天看畫面', t.includes('確認自己是否為幸運兒'), true);
  check('發牌房不用拍肩膀', t.includes('輕拍'), false);
  ev("jgGoStep('dawn')");
  check('第一天先競選警長：競選畫面不唸', window.document.getElementById('t-judge').textContent.includes('確認自己是否為幸運兒'), false);
  ev("jgSheriffEnabled=false; jgGoStep('dawn')");
  check('公布昨晚結果時唸', window.document.getElementById('t-judge').textContent.includes('確認自己是否為幸運兒'), true);
  // 交易到狼（失敗）也照樣唸，不洩漏結果
  ev("window.__private=[]; window.jgDealLinkedCode='ROOM1'; jgApplyDealtRoles(window.__s, window.__c, 7); jgGoStep('blackmarket-wake')");
  setVal('jg-bm-target', 4); setVal('jg-bm-skill', 'seer');
  ev('jgSaveBlackMarket()');
  check('交易失敗沒有私人提醒', ev('window.__private.length'), 0);
  check('交易失敗口白一樣', window.document.getElementById('t-judge').textContent.includes('確認自己是否為幸運兒'), true);

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('發牌房同步測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項發牌房同步測試通過`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

const { JSDOM } = require('jsdom');
const path = require('path');

// 村莊（公開版，js/village-ui.js）的畫面邏輯：用假的 jgVillageState／jgVillageApi 模擬登入狀態，
// 不連真的 Firebase（js/village.js 是 module，jsdom 不會執行）。
async function load(query){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'file://' + path.join(__dirname, '..') + '/index.html' + (query||'')
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100));
  window.alert = ()=>{}; window.confirm = ()=>true;
  window.scrollTo = ()=>{}; window.Element.prototype.scrollIntoView = function(){}; window.Element.prototype.scrollTo = function(){};
  return window;
}
async function run(){
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});
  const w = await load('?edition=public');
  const d = w.document;
  const panel = ()=>d.getElementById('village-panel').textContent;
  const calls = [];
  w.eval(`window.jgVillageApi={
    signIn:async()=>{ __calls.push('signIn'); },
    signOut:async()=>{ __calls.push('signOut'); },
    createVillage:async(n)=>{ __calls.push('create:'+n); },
    lookupInvite:async(c)=>({code:c, vid:'v2', name:'朋友村', already:false}),
    joinVillage:async(c)=>{ __calls.push('join:'+c); },
    switchVillage:(v)=>{ __calls.push('switch:'+v); },
    addRosterName:async(n)=>{ __calls.push('roster:'+n); jgVillageState.current.roster.push(n); },
    saveGame:async(r)=>{ __calls.push('save'); window.__saved=r; return 'g1'; },
    deleteGame:async(id)=>{ __calls.push('delete:'+id); },
    leaveVillage:async()=>{}, deleteVillage:async()=>{ __calls.push('deleteVillage'); }
  };`);
  w.__calls = calls;
  const setState = st=>{ w.jgVillageState = st; w.jgVillageOnChange(); };

  setState({enabled:true, ready:true, user:null, villages:[], current:null, members:[], games:[]});
  check('沒登入：顯示用 Google 登入', panel().includes('用 Google 登入'), true);
  check('沒登入：遊玩數據是範例資料', w.eval('GAMES.length===JG_DEMO_GAMES.length'), true);
  w.eval('jgVillageSignIn()'); await new Promise(r=>setTimeout(r, 20));
  check('按登入會呼叫登入', calls.includes('signIn'), true);

  setState({enabled:true, ready:true, user:{uid:'u1', name:'阿明', email:'a@gmail.com'}, villages:[], current:null, members:[], games:[]});
  check('登入但沒有村莊：可以建立村莊', panel().includes('建立村莊')&&!!d.getElementById('village-new-name'), true);
  d.getElementById('village-new-name').value='週五狼人殺';
  w.eval('jgVillageCreate()'); await new Promise(r=>setTimeout(r, 20));
  check('建立村莊會帶村莊名稱', calls.includes('create:週五狼人殺'), true);

  // 在村莊裡（村長），有兩場紀錄
  const game = (id, names, winner)=>({_docId:id, id, date:'2026-10-17', time:'20:00', board:'預女獵守', resultText:winner==='good'?'好人陣營獲勝':'邪惡陣營獲勝', winner,
    players:names.map((n,i)=>({num:i+1, name:n, role:i<2?'狼人':'平民'})), log:'**夜晚1st\n--刀 3', recordedByName:'阿明'});
  setState({enabled:true, ready:true, user:{uid:'u1', name:'阿明', email:'a@gmail.com'},
    villages:[{id:'v1', name:'週五狼人殺', role:'owner'}],
    current:{id:'v1', name:'週五狼人殺', role:'owner', roster:['小王','小李'], inviteCode:'abc123', ownerUid:'u1'},
    members:[{uid:'u1', name:'阿明', role:'owner'}, {uid:'u2', name:'阿華', role:'member'}],
    games:[game('g1',['小王','小李','小張','',''],'good'), game('g2',['小李','小王','小張','小陳',''],'evil')], gamesLoaded:true});
  check('在村莊裡：顯示村莊名稱與成員數', panel().includes('週五狼人殺')&&panel().includes('成員 2 人'), true);
  check('在村莊裡：遊玩數據改成村莊的場次', w.eval('GAMES.map(g=>g.id).join()'), 'g1,g2');
  check('在村莊裡：不顯示範例資料說明', d.querySelector('.pd-demo-banner').style.display, 'none');
  check('排行榜不算沒填名字的座位', w.eval("Object.keys(pdPlayerGameCounts()).sort().join()"), ['小張','小李','小王','小陳'].sort().join());
  check('邀請連結帶邀請碼並用外部瀏覽器開啟', w.eval("jgVillageInviteLink('abc123')").includes('join=abc123')&&w.eval("jgVillageInviteLink('abc123')").includes('openExternalBrowser=1'), true);
  w.eval('jgVillageToggleInvite()');
  check('邀請朋友：顯示邀請連結', d.querySelector('#village-panel input[readonly]').value.includes('join=abc123'), true);
  check('村長看得到刪除村莊', panel().includes('刪除村莊'), true);
  check('村長在場次紀錄看得到刪除按鈕', !!d.querySelector('#game-list [onclick*="jgVillageDeleteGame"]'), true);

  // 玩家名單用村莊共用的名單
  check('名單用村莊共用的名單', w.eval('jgGetNamePool().join()'), '小王,小李');
  w.eval("jgAddNameToPool('小美')"); await new Promise(r=>setTimeout(r, 20));
  check('新名字加進村莊名單', calls.includes('roster:小美'), true);
  check('名單依村莊場數排序（常客在前）', w.eval('jgRosterNameGroups().regular.slice(0,2).sort().join()'), ['小李','小王'].sort().join());

  // 存到村莊：結束畫面的按鈕
  check('結束畫面有「存到村莊」按鈕', w.eval('jgVillageSaveButtonHtml()').includes('存到村莊「週五狼人殺」'), true);
  w.eval(`jgLastWinResult={winner:'good'}; pdBuildGameRecord=()=>({id:'1017_1', date:'2026-10-17', time:'21:00', board:'預女獵守', resultText:'好人陣營獲勝', winner:'good', players:[{num:1,name:'小王',role:'狼人'},{num:2,name:'',role:'平民'}], log:'LOG-A'});`);
  w.eval('jgVillageSaveCurrentGame()'); await new Promise(r=>setTimeout(r, 30));
  check('按存到村莊會存這場', calls.filter(c=>c==='save').length, 1);
  w.eval('jgVillageSaveCurrentGame()'); await new Promise(r=>setTimeout(r, 30));
  check('同一場不會存兩次', calls.filter(c=>c==='save').length, 1);
  w.eval('window.jgTourPractice=true');
  check('導覽時沒有存到村莊按鈕', w.eval('jgVillageSaveButtonHtml()'), '');
  w.eval('window.jgTourPractice=false');

  // 一般成員：沒有刪除按鈕
  w.jgVillageState.current.role='member'; w.jgVillageState.villages[0].role='member';
  w.jgVillageGamesKey=''; w.eval("jgVillageGamesKey=''; jgVillageOnChange()");
  check('一般成員看不到刪除場次', !!d.querySelector('#game-list [onclick*="jgVillageDeleteGame"]'), false);
  check('一般成員可以離開村莊', panel().includes('離開村莊')&&!panel().includes('刪除村莊'), true);

  // 從別的村莊的邀請連結進來
  w.eval("jgVillagePendingInvite='zz99'; jgVillageInviteInfo=null; jgVillageOnChange()");
  await new Promise(r=>setTimeout(r, 30));
  check('邀請：登入後顯示要加入的村莊', panel().includes('加入「朋友村」'), true);
  w.eval('jgVillageJoin()'); await new Promise(r=>setTimeout(r, 30));
  check('按加入村莊會用邀請碼加入', calls.includes('join:zz99'), true);

  // 從村莊裡登出：回到範例資料
  setState({enabled:true, ready:true, user:null, villages:[], current:null, members:[], games:[]});
  check('登出後遊玩數據回到範例資料', w.eval('GAMES.length===JG_DEMO_GAMES.length'), true);
  check('登出後名單回到這台裝置的名單', w.eval('jgVillageRoster()'), null);

  // 名字裡有 HTML 符號也不會變成網頁語法
  check('村莊名稱會跳脫 HTML', w.eval("jgVillageEsc('<b>x</b>')"), '&lt;b&gt;x&lt;/b&gt;');
  w.close();

  const w2 = await load('');
  check('自己人版沒有存到村莊按鈕', w2.eval('jgVillageSaveButtonHtml()'), '');
  check('自己人版名單不受村莊影響', w2.eval('jgVillageRoster()'), null);
  w2.close();

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('村莊測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項村莊測試通過`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

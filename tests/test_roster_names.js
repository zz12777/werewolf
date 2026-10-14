const { JSDOM } = require('jsdom');
const path = require('path');

// 法官助手「設定玩家名單」：名字依遊玩場數排序，只有達到排行榜門檻的放在上面，其餘收進「更多名字」；
// 已填進其他座位的名字不顯示；下面的輸入框同時是搜尋。
async function run(){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'file://' + path.join(__dirname, '..') + '/'
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100)); // 機器忙時等到網頁真的載完（最多再 15 秒）
  window.alert = ()=>{}; window.confirm = ()=>true;
  const ev = code=>window.eval(code);
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  // 換成固定的 20 場假資料：門檻 2 場。甲 5 場、乙 3 場、丙 2 場、丁 1 場。
  ev(`GAMES.length=0;
    const mk=(names)=>({id:'x',date:'2026-01-01',board:'b',winner:'good',players:names.map((n,i)=>({num:i+1,name:n,role:'民'}))});
    for(let i=0;i<20;i++){
      const names=[]; if(i<5) names.push('甲'); if(i<3) names.push('乙'); if(i<2) names.push('丙'); if(i<1) names.push('丁');
      GAMES.push(mk(names));
    }
    try{ localStorage.clear(); }catch(e){}
    jgNamePoolCache=['戊','丁']; jgNameHiddenCache=[];`);
  const g = ev('JSON.stringify(jgRosterNameGroups())'); const groups = JSON.parse(g);
  check('門檻是總場次的 1/10', ev('pdRankThresholdGames()'), 2);
  check('達門檻的依場數由高到低', groups.regular, ['甲','乙','丙']);
  check('沒達門檻的收進更多名字（也依場數排）', groups.more, ['丁','戊']);

  ev("document.getElementById('jg-count').value=6; jgOpenRosterSetup();");
  const shown = ()=>[...window.document.querySelectorAll('#jg-roster-pool .rname-pool-btn')].map(b=>b.textContent.replace(/\d+$/,''));
  check('預設只顯示常客', shown(), ['甲','乙','丙']);
  ev('jgRosterToggleMore()');
  check('點開更多名字', shown(), ['甲','乙','丙','丁','戊']);
  ev('jgRosterToggleMore()');
  ev("jgRosterAssignName('甲')");
  check('填進座位的名字從清單拿掉', shown(), ['乙','丙']);
  check('自動跳到下一個空位', ev('jgRosterActiveSlot'), 2);
  ev("jgRosterSearchInput('丁')");
  check('搜尋會連更多名字一起找', shown(), ['丁']);
  ev("document.getElementById('jg-roster-manual-input').value='丁'; jgRosterAssignManual();");
  check('搜尋到一個就直接填入', ev('jgPlayerNames[2]'), '丁');
  check('填完清掉搜尋字', ev('jgRosterSearch'), '');
  ev("document.getElementById('jg-roster-manual-input').value='新朋友'; jgRosterAssignManual();");
  check('沒有符合就新增新名字', ev('jgPlayerNames[3]'), '新朋友');
  ev("jgRosterToggleEdit(); jgRemoveNameFromPool('乙'); jgRosterToggleEdit();");
  check('編輯名單移除後不再出現（即使遊玩紀錄裡有）', ev('JSON.stringify(jgRosterNameGroups().regular)'), JSON.stringify(['甲','丙']));
  check('平常名字上沒有移除用的叉叉', !!window.document.querySelector('#jg-roster-pool .rname-pool-x'), false);

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('選名單測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項選名單測試通過`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

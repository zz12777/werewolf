const { JSDOM } = require('jsdom');
const path = require('path');

// 版本切換（js/edition.js）：預設自己人版；網址 ?edition=public 或部署設定可以切成公開版。
async function load(query){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'file://' + path.join(__dirname, '..') + '/index.html' + (query||'')
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100));
  return window;
}
async function run(){
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  const w1 = await load('');
  check('預設是自己人版', w1.eval('JG_EDITION'), 'team');
  check('自己人版頁尾沒有標示', w1.document.querySelector('.site-footer span').textContent.includes('公開版'), false);
  check('自己人版功能全開', w1.eval("jgEditionHas('anything')"), true);
  check('部署設定 public → 公開版', w1.eval("jgDetectEdition('', 'public')"), 'public');
  check('網址參數優先於部署設定', w1.eval("jgDetectEdition('?edition=team', 'public')"), 'team');
  check('不認得的值當成自己人版', w1.eval("jgDetectEdition('?edition=xyz', 'abc')"), 'team');
  w1.close();

  const w2 = await load('?edition=public');
  check('網址 ?edition=public 切成公開版', w2.eval('jgIsPublicEdition()'), true);
  check('html 標上版本', w2.document.documentElement.getAttribute('data-edition'), 'public');
  check('公開版頁尾標示公開版', w2.document.querySelector('.site-footer span').textContent.includes('公開版'), true);
  const d2 = w2.document;
  const hidden = sel=>{ const el=d2.querySelector(sel); return !!el&&el.hasAttribute('data-feature-off'); };
  check('公開版一打開是首頁', d2.getElementById('t-home').classList.contains('on'), true);
  check('首頁有 5 張翻卡', d2.querySelectorAll('#home-cards .home-card').length, 5);
  check('公開版藏起攻略參考', hidden('.nav-btn[data-tab="t-guide"]')&&hidden('#t-guide'), true);
  check('公開版遊玩數據分頁打開、不在村莊時標示範例資料', !hidden('.nav-btn[data-tab="t-data"]')&&!hidden('#t-data')&&!hidden('.pd-demo-banner')&&d2.querySelector('.pd-demo-banner').textContent.includes('範例資料'), true);
  check('公開版遊玩數據有村莊區塊', !hidden('#village-panel'), true);
  check('公開版遊玩數據用範例資料', w2.eval('GAMES.length===JG_DEMO_GAMES.length&&GAMES.length>0'), true);
  check('範例資料的名字不會出現在玩家名單選項', w2.eval('jgRosterNameGroups().regular.concat(jgRosterNameGroups().more).some(n=>JG_DEMO_GAMES.some(g=>g.players.some(p=>p.name===n)))'), false);
  check('公開版藏起連線房間', hidden('.nav-btn[data-tab="t-room"]')&&hidden('#t-room'), true);
  check('公開版藏起建立連線房間／手機發牌按鈕', hidden('[onclick="jgRoomCreateFromSetup()"]')||hidden('div[data-feature="room"]'), true);
  check('公開版藏起即時票型', hidden('[data-feature="liveVotes"]'), true);
  check('公開版角色與規則沒有 MVP 選擇機制', hidden('[data-ov="mvp-mechanism"]')||d2.querySelector('[data-ov="mvp-mechanism"]').closest('.rcol').hasAttribute('data-feature-off'), true);
  const desc = ()=>d2.getElementById('jg-comp-desc').textContent;
  check('人數剛好：一行寫完各陣營人數', desc(), '共 6 人（狼人 2、神職 2、平民 2）');
  w2.eval('jgRolePick.villager+=1; jgUpdateComp()');
  check('人數超過', desc(), '共 7 人（狼人 2、神職 2、平民 3） ⚠️ 超過 6 人');
  w2.eval('jgRolePick.villager-=2; jgUpdateComp()');
  check('人數未滿', desc(), '共 5 人（狼人 2、神職 2、平民 1） ⚠️ 未滿 6 人');
  w2.eval('jgRolePick.villager+=1; jgUpdateComp()');
  check('選角區不再重複顯示「目前：x/y 人」', d2.getElementById('jg-role-picker').textContent.includes('目前：'), false);
  check('公開版藏起雙身分', hidden('.btn2[data-feature="dualMode"]'), true);
  check('角色與規則、法官の助手還在', !hidden('.nav-btn[data-tab="t-rules"]')&&!hidden('.nav-btn[data-tab="t-judge"]'), true);
  check('公開版沒有自己人的設定', w2.eval('JSON.stringify(JG_TEAM_CONFIG)'), '{}');
  check('公開版沒有內建人名', w2.eval('JG_NAME_PRESET.length'), 0);
  check('公開版沒有送出密碼', w2.eval('PD_SUBMIT_PASSWORD'), '');
  check('公開版沒有即時票型網址', w2.eval('JG_LIVE_SYNC_URL'), '');
  const opts = [...d2.querySelectorAll('#jg-board-preset option')];
  check('自訂角色改叫預女獵守', opts[0].textContent, '預女獵守（基本板）');
  const OPEN=['custom','evilknight_guard','wolfbeauty_knight','mechwolf_medium','dreamcatcher_nightmare','blackmarket_wolfbrothers','gargoyle_gravkeeper','bloodmoon_demonhunter','magician_wolfking','cupid_board','zombie_board'];
  check('公開版只列出開放的 11 個板子（照順序）', opts.map(o=>o.value), OPEN);
  check('公開版改用自己畫的選板子選單', d2.getElementById('jg-board-preset').style.display==='none'&&!!d2.getElementById('jg-board-picker'), true);
  w2.eval('jgBoardPickerToggle()');
  const items = [...d2.querySelectorAll('#jg-board-picker .jg-bp-item')];
  check('選單列出全部開放板子、沒有上鎖的板子', items.length===OPEN.length&&!d2.querySelector('#jg-board-picker .jg-bp-lock'), true);
  items.find(i=>i.textContent==='狼美人＋騎士'||i.textContent==='狼美人+騎士').click();
  check('點板子會切換', w2.eval('jgBoardPreset'), 'wolfbeauty_knight');
  check('選完選單收起來', d2.querySelectorAll('#jg-board-picker .jg-bp-item').length, 0);
  w2.eval("jgSetBoardPreset('zombie_board')");
  check('殭屍板可以選', w2.eval('jgBoardPreset'), 'zombie_board');
  w2.eval("jgSetBoardPreset('custom')");
  w2.eval("jgSetBoardPreset('windspy')");
  check('沒開放的板子選不到', w2.eval('jgBoardPreset'), 'custom');
  const boardIntros = [...d2.querySelectorAll('#sec-boards .rcol')].filter(c=>!c.hasAttribute('data-feature-off')).map(c=>c.querySelector('.rcol-name').textContent);
  check('角色與規則只介紹開放的 10 個板子', boardIntros.length, 10);
  check('角色與規則沒有沒開放的板子', boardIntros.some(n=>/風聲諜影|動物夢境|愛神|詭術|唯鄰|假面|大野狼|雙機械|大灰狼|狼巫|混血兒/.test(n)), false);
  const roleCards = [...d2.querySelectorAll('#t-rules .rcol[id^="role-"]')].map(c=>c.id.slice(5));
  check('角色與規則只有開放板子用得到的角色', roleCards.every(id=>w2.eval("jgRoleAvailable('"+id+"')")), true);
  check('角色與規則有新開放板子的角色', ['blackmarket','gargoyle','gravkeeper','bloodmoon','demonhunter','magician','cupid','zombie','luckyone'].every(id=>roleCards.includes(id)), true);
  check('角色與規則沒有沒開放的角色', ['bear','eros','trickster','hybrid','thief','fool','awgargoyle','whitewolf'].some(id=>roleCards.includes(id)), false);
  check('沒開放角色的查看連結都拿掉', [...d2.querySelectorAll('#t-rules .role-link')].every(l=>{ const m=(l.getAttribute('onclick')||'').match(/jumpToRole\('([a-z_0-9]+)'\)/); return !m||w2.eval("jgRoleAvailable('"+m[1]+"')"); }), true);
  const picks = ()=>[...d2.querySelectorAll('#jg-role-picker .rp-nm')].map(e=>e.textContent);
  check('基本板只有基本角色（含黑狼王）', picks(), ['狼人','黑狼王','預言家','女巫','獵人','守衛']);
  check('基本板不顯示預言家／通靈師重複提示', d2.getElementById('jg-role-picker').textContent.includes('不會重複出現'), false);
  w2.eval("jgSetBoardPreset('evilknight_guard')");
  check('免費板子可以切換', w2.eval('jgBoardPreset'), 'evilknight_guard');
  const presetGods = [...d2.querySelectorAll('#jg-preset-picker .rp-nm')].map(e=>e.textContent);
  check('免費板子不能加選混血兒／盜賊／殭屍', presetGods.some(n=>['混血兒','盜賊','殭屍','魔術師'].includes(n)), false);
  check('免費板子沒有白狼王、有黑狼王', !presetGods.includes('白狼王')&&presetGods.includes('黑狼王'), true);
  await new Promise(r=>setTimeout(r, 50));
  check('角色與規則頁沒有白狼王', d2.getElementById('t-rules').textContent.includes('白狼王'), false);
  check('角色與規則頁沒有白狼王卡片', !!d2.getElementById('role-whitewolf'), false);
  w2.eval("switchTab('t-judge')");
  check('切分頁後首頁收起來', d2.getElementById('t-home').classList.contains('on'), false);
  check('對應分頁按鈕變 active', d2.querySelector('.nav-btn[data-tab="t-judge"]').classList.contains('active'), true);
  w2.eval("jgShowJudgeEndModal('好人')");
  check('公開版遊戲結束不跳法官辛苦了視窗', !!d2.getElementById('jg-judge-end-modal'), false);
  check('首頁有法官助手導覽按鈕', !!d2.querySelector('#t-home .home-tour-btn'), true);
  check('公開版警長競選沒有音檔按鈕', w2.eval("(function(){ const old=jgShowPg; let html=''; jgShowPg=(h)=>{html=h;}; try{ jgSheriffEnabled=true; jgRenderSheriffCandidates&&jgRenderSheriffCandidates(); }catch(e){} jgShowPg=old; return html.includes('現在開始競選警長')&&html.includes('display:none;gap:6px'); })()"), true);
  check('公開版不連 Firebase', w2.eval('window.jgFirebaseReady===undefined'), true);
  w2.close();

  const w3 = await load('');
  check('自己人版沒有首頁', w3.document.getElementById('t-home').hasAttribute('data-feature-off'), true);
  check('自己人版一打開是法官の助手', w3.document.getElementById('t-judge').classList.contains('on'), true);
  check('自己人版保留內建名單', w3.eval('JG_NAME_PRESET.length>0'), true);
  check('自己人版保留全部板子', [...w3.document.querySelectorAll('#jg-board-preset option')].some(o=>o.disabled), false);
  check('自己人版角色與規則有白狼王', !!w3.document.getElementById('role-whitewolf'), true);
  check('自己人版還是原本的選板子下拉選單', w3.document.getElementById('jg-board-preset').style.display!=='none'&&!w3.document.getElementById('jg-board-picker'), true);
  check('自己人版沒有村莊區塊', w3.document.getElementById('village-panel').hasAttribute('data-feature-off'), true);
  check('自己人版遊玩數據沒有範例說明', w3.document.querySelector('.pd-demo-banner').hasAttribute('data-feature-off'), true);
  check('自己人版保留連線房間', w3.document.getElementById('t-room').hasAttribute('data-feature-off'), false);
  w3.close();

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('版本切換測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項版本切換測試通過`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

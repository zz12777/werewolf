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
  check('公開版藏起遊玩數據', hidden('.nav-btn[data-tab="t-data"]')&&hidden('#t-data'), true);
  check('公開版藏起連線房間', hidden('.nav-btn[data-tab="t-room"]')&&hidden('#t-room'), true);
  check('公開版藏起建立連線房間／手機發牌按鈕', hidden('[onclick="jgRoomCreateFromSetup()"]')||hidden('div[data-feature="room"]'), true);
  check('公開版藏起即時票型', hidden('[data-feature="liveVotes"]'), true);
  check('公開版藏起雙身分', hidden('.btn2[data-feature="dualMode"]'), true);
  check('角色與規則、法官の助手還在', !hidden('.nav-btn[data-tab="t-rules"]')&&!hidden('.nav-btn[data-tab="t-judge"]'), true);
  check('公開版沒有自己人的設定', w2.eval('JSON.stringify(JG_TEAM_CONFIG)'), '{}');
  check('公開版沒有內建人名', w2.eval('JG_NAME_PRESET.length'), 0);
  check('公開版沒有送出密碼', w2.eval('PD_SUBMIT_PASSWORD'), '');
  check('公開版沒有即時票型網址', w2.eval('JG_LIVE_SYNC_URL'), '');
  const opts = [...d2.querySelectorAll('#jg-board-preset option')];
  check('自訂角色改叫預女獵守', opts[0].textContent, '預女獵守（基本板）');
  check('免費板子可以選', opts.filter(o=>!o.disabled).map(o=>o.value), ['custom','evilknight_guard','wolfbeauty_knight','mechwolf_medium','dreamcatcher_nightmare']);
  check('其他板子標付費方案且不能選', opts.filter(o=>o.disabled).every(o=>o.textContent.includes('付費方案')), true);
  w2.eval("jgSetBoardPreset('zombie_board')");
  check('選不到付費板子', w2.eval('jgBoardPreset'), 'custom');
  const picks = ()=>[...d2.querySelectorAll('#jg-role-picker .rp-nm')].map(e=>e.textContent);
  check('基本板只有基本角色', picks(), ['狼人','預言家','女巫','獵人','守衛']);
  w2.eval("jgSetBoardPreset('evilknight_guard')");
  check('免費板子可以切換', w2.eval('jgBoardPreset'), 'evilknight_guard');
  const presetGods = [...d2.querySelectorAll('#jg-preset-picker .rp-nm')].map(e=>e.textContent);
  check('免費板子不能加選混血兒／盜賊／殭屍', presetGods.some(n=>['混血兒','盜賊','殭屍','魔術師'].includes(n)), false);
  w2.eval("switchTab('t-judge')");
  check('切分頁後首頁收起來', d2.getElementById('t-home').classList.contains('on'), false);
  check('對應分頁按鈕變 active', d2.querySelector('.nav-btn[data-tab="t-judge"]').classList.contains('active'), true);
  check('公開版不連 Firebase', w2.eval('window.jgFirebaseReady===undefined'), true);
  w2.close();

  const w3 = await load('');
  check('自己人版沒有首頁', w3.document.getElementById('t-home').hasAttribute('data-feature-off'), true);
  check('自己人版一打開是法官の助手', w3.document.getElementById('t-judge').classList.contains('on'), true);
  check('自己人版保留內建名單', w3.eval('JG_NAME_PRESET.length>0'), true);
  check('自己人版保留全部板子', [...w3.document.querySelectorAll('#jg-board-preset option')].some(o=>o.disabled), false);
  check('自己人版保留連線房間', w3.document.getElementById('t-room').hasAttribute('data-feature-off'), false);
  w3.close();

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('版本切換測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項版本切換測試通過`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });

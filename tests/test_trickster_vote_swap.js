const { JSDOM } = require('jsdom');
const path = require('path');

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
  window.alert = ()=>{};
  window.fetch = window.fetch || (()=>Promise.resolve({ok:false, json:async()=>({})}));

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  };

  const comp = { trickster:1, seer:1, witch:1, trickmage:1, sequenceprince:1, wolf:1, villager:2 };
  const seatRoleMap = {};
  const pool = [];
  Object.entries(comp).forEach(([r,n])=>{ for(let i=0;i<n;i++) pool.push(r); });
  pool.forEach((r,i)=>{ seatRoleMap[i+1]=r; });
  window.__seatRoleMap = seatRoleMap; window.__comp = comp; window.__total = 8;
  window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, window.__total)');

  const seatA = pool.indexOf('villager') + 1;      // 詭術師換票的號碼 A（會被投票的目標之一）
  const seatB = pool.lastIndexOf('villager') + 1;   // 詭術師換票的號碼 B
  window.__seatA = seatA; window.__seatB = seatB;

  // 模擬詭術師這一晚換了 A、B 兩個號碼（隔天白天投給 A 或 B 的票，實際上算給對方）
  window.eval(`
    jgNight = 2;
    jgRecord = jgRecord || {};
    jgRecord.tricksterSwapVoteA = String(window.__seatA);
    jgRecord.tricksterSwapVoteB = String(window.__seatB);
    jgVoteTally = {};
    jgAbstainVoters = {};
    jgVotePkRound = false; jgVotePkCandidates = [];
  `);

  // 找幾個活著、不是 A/B 本人的投票者，全部點「投給 A」的按鈕（jgToggleVote 就是按鈕的
  // onclick 呼叫的函式，這裡直接呼叫等同於實際點擊）。
  const voterCountRaw = window.eval(`
    (function(){
      const voters = jgAlive().map(p=>p.num).filter(n=>n!==window.__seatA&&n!==window.__seatB);
      voters.forEach(v=>{ jgToggleVote(window.__seatA, v); });
      return voters.length;
    })()
  `);
  check('點擊「投給A」的按鈕沒有丟出例外、正常執行完畢', typeof voterCountRaw, 'number');

  const tallyKeysAfterClicks = window.eval('Object.keys(jgVoteTally)');
  check('點擊「投給A」實際上全部被重新導向記到B（詭術師換票生效，不是登記在A）',
    tallyKeysAfterClicks, [String(seatB)]);
  const noneRecordedUnderA = window.eval(`!jgVoteTally[window.__seatA] || Object.keys(jgVoteTally[window.__seatA]||{}).length===0`);
  check('A本身完全沒有票被登記（全部被導到B去了）', noneRecordedUnderA, true);

  // 確認投票結果：應該正確算出 B 出局（不是 A），且流程正常往下走（不會卡住、不會丟例外）
  window.eval(`
    jgSequencePrinceUsed = false;
    jgDayVoteOutResolvedOnce = false;
    jgSaveVoteInner();
  `);
  const stepAfter = window.eval('jgCurrentStep');
  const pendingOutNum = window.eval('jgRecord._pendingVoteOutNum');
  check('投票結算：卡在定序王子選擇畫面（板上還有王子沒用過技能）', stepAfter, 'sequenceprince-choice');
  check('投票結算：真正出局的號碼是換票後的B，不是原本點擊的A', pendingOutNum, seatB);

  // 王子選擇不翻牌，確認出局——最終死亡的應該是 B
  window.eval('jgConfirmVoteOutResult()');
  const bAlive = window.eval(`jgFind(window.__seatB).alive`);
  const aAlive = window.eval(`jgFind(window.__seatA).alive`);
  check('最終結算：B（換票後真正被投的對象）死亡', bAlive, false);
  check('最終結算：A（原本被點擊、但票被換走的號碼）沒有因為這次投票死亡', aAlive, true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r => !r.ok);
  process.exit(anyFail ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });

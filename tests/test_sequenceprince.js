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
  window.alert = ()=>{}; // 測試環境沒有真的視窗，alert 彈窗改成沒動作，避免卡住
  window.fetch = window.fetch || (()=>Promise.resolve({ok:false, json:async()=>({})})); // jsdom 沒有 fetch，雲端同步/讀取相關呼叫改成假的直接失敗

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  };

  // 詭術之境板（trickery_realm）：trickster/seer/witch/trickmage/sequenceprince + 補滿到 8 人
  const comp = { trickster:1, seer:1, witch:1, trickmage:1, sequenceprince:1, wolf:1, villager:2 };
  const seatRoleMap = {};
  const pool = [];
  Object.entries(comp).forEach(([r,n])=>{ for(let i=0;i<n;i++) pool.push(r); });
  pool.forEach((r,i)=>{ seatRoleMap[i+1]=r; });
  window.__seatRoleMap = seatRoleMap; window.__comp = comp; window.__total = 8;
  window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, window.__total)');

  const princeNum = pool.indexOf('sequenceprince') + 1;
  const targetNum = pool.indexOf('villager') + 1; // 隨便挑一個會被投票出局的目標（不是王子自己）

  // 模擬：王子活著、還沒用過技能，全部人都投給 targetNum，觸發唯一最高票
  window.__princeNum = princeNum;
  window.__targetNum = targetNum;
  window.eval(`
    jgNight = 1;
    jgSequencePrinceUsed = false;
    jgDayVoteOutResolvedOnce = false;
    jgVoteTally = {};
    jgAbstainVoters = {};
    jgPlayers.forEach(p => { if (p.num !== window.__targetNum) { jgVoteTally[window.__targetNum] = jgVoteTally[window.__targetNum] || {}; jgVoteTally[window.__targetNum][p.num] = true; } });
    jgSaveVoteInner();
  `);

  const stepAfterVote = window.eval('jgCurrentStep');
  const targetAliveAfterVote = window.eval(`jgFind(window.__targetNum).alive`);
  const pendingNum = window.eval('jgRecord._pendingVoteOutNum');
  check('投票出爐、王子活著又沒用過技能：先卡在選擇畫面，不是直接結算', stepAfterVote, 'sequenceprince-choice');
  check('選擇畫面出現之前，目標玩家還沒有真的死亡', targetAliveAfterVote, true);
  check('待結算的出局號碼有正確記住', pendingNum, targetNum);

  // 翻牌：票數應該清空、技能標記已使用、目標仍然存活、進入王子發言步驟
  window.eval('jgSequencePrinceFlip()');
  const usedAfterFlip = window.eval('jgSequencePrinceUsed');
  const tallyAfterFlip = window.eval('Object.keys(jgVoteTally).length');
  const stepAfterFlip = window.eval('jgCurrentStep');
  const targetAliveAfterFlip = window.eval(`jgFind(window.__targetNum).alive`);
  check('翻牌後：技能標記為已使用', usedAfterFlip, true);
  check('翻牌後：票數清空，準備重新投票', tallyAfterFlip, 0);
  check('翻牌後：進入王子發言步驟', stepAfterFlip, 'sequenceprince-speech');
  check('翻牌後：原本的出局目標仍然存活（出局作廢）', targetAliveAfterFlip, true);

  // 重新投票，這次不該再問王子（同一天已經問過/用過一次）——直接投同一個目標出局
  window.eval(`
    jgVoteTally = {};
    jgAbstainVoters = {};
    jgPlayers.forEach(p => { if (p.num !== window.__targetNum) { jgVoteTally[window.__targetNum] = jgVoteTally[window.__targetNum] || {}; jgVoteTally[window.__targetNum][p.num] = true; } });
    jgSaveVoteInner();
  `);
  const stepAfterRevote = window.eval('jgCurrentStep');
  const targetAliveAfterRevote = window.eval(`jgFind(window.__targetNum).alive`);
  check('重新投票：同一天不會再問第二次王子翻牌，直接結算死亡', stepAfterRevote !== 'sequenceprince-choice', true);
  check('重新投票：這次目標真的死亡了', targetAliveAfterRevote, false);

  // 不翻牌（按「確認出局」）：重新做一次全新場景測試，這次選擇不翻牌，應該直接照原本
  // 流程結算死亡（跟沒有定序王子時的行為一致），驗證 jgConfirmVoteOutResult() 這條路徑
  // 也是正確接回 jgFinishVoteOut()，不是只有「翻牌」那條路徑測得到。
  window.eval('jgSequencePrinceUsed = false; jgDayVoteOutResolvedOnce = false;');
  const targetNum2 = pool.indexOf('wolf') + 1;
  window.__targetNum2 = targetNum2;
  window.eval(`
    jgVoteTally = {};
    jgAbstainVoters = {};
    jgPlayers.forEach(p => { if (p.num !== window.__targetNum2) { jgVoteTally[window.__targetNum2] = jgVoteTally[window.__targetNum2] || {}; jgVoteTally[window.__targetNum2][p.num] = true; } });
    jgSaveVoteInner();
  `);
  const stepBeforeDecline = window.eval('jgCurrentStep');
  check('第二個場景：投票出爐一樣先卡在選擇畫面', stepBeforeDecline, 'sequenceprince-choice');
  window.eval('jgConfirmVoteOutResult()');
  const usedAfterDecline = window.eval('jgSequencePrinceUsed');
  const target2Alive = window.eval(`jgFind(window.__targetNum2).alive`);
  check('不翻牌：技能仍然是未使用狀態', usedAfterDecline, false);
  check('不翻牌：目標正常結算死亡', target2Alive, false);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r => !r.ok);
  process.exit(anyFail ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });

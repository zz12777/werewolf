// ═══════════════════════════════════════════
// js/deal-sync.js
// 法官助手 ↔ 發牌房的同步：用「使用手機發牌」開局時，法官在法官助手上的操作會即時同步到
// 玩家手機（js/room/deal.js 負責畫面）：
//   ・公開資訊：號碼與姓名名單、警長競選（上警號碼、退水、警上發言順序、警長）
//   ・玩家從手機按「退水」：法官這邊自動退水（jgDealRemoteWithdraw）
//   ・私人提醒：黑市商人交易成功的幸運兒、邱比特連的情侶，只有本人手機看得到
// 不是發牌房開局（本機主持、連線房間全自動）時這裡什麼都不做。
// ═══════════════════════════════════════════

// 法官助手現在主持的是不是發牌房（房主還在那個房間裡、而且是用那個房間發的牌）。
function jgDealLinked(){
  return !!(window.jgDealLinkedCode&&typeof window.jgRoomDealLinkActive==='function'&&window.jgRoomDealLinkActive(window.jgDealLinkedCode));
}

// 現在可不可以退水：政見發表階段（非 PK），或雙爆吞警徽隔天續選的退水階段。
function jgDealCanWithdrawNow(){
  if(!jgSheriffEnabled||jgSheriffElectionDone||jgSheriffPkRound) return false;
  if(jgCurrentStep==='sheriff-speech') return true;
  if((jgCurrentStep==='dawn'||jgCurrentStep==='sheriff-day2-resume')&&jgSheriffPostponedToDay2&&jgSheriffDay2CandidatesAsked) return true;
  return false;
}

function jgDealSheriffInfo(){
  if(!jgSheriffEnabled) return null;
  const cands=jgSheriffCandidates.slice().map(Number).sort((a,b)=>a-b);
  const withdrawn=jgSheriffWithdrawn.slice().map(Number);
  const confirmed=jgNight===1?jgSheriffCandidatesAsked:true;
  const orderDone=jgSheriffLogLines.some(l=>l.startsWith('發言順序：'));
  let order=null;
  if(jgSheriffPkRound&&jgSheriffPkOrder.length) order=jgSheriffPkOrder.slice();
  else if(orderDone&&jgSheriffSpeakStart!=null) order=jgOrderFromStart(cands.concat(withdrawn.filter(n=>!cands.includes(n))), jgSheriffSpeakStart, jgSheriffSpeakDir);
  let none=null;
  if(jgSheriffElectionDone&&!jgSheriff){
    if(jgSheriffElectedNum) none='警徽已流失';
    else if(jgSheriffCampaignHappened||jgSheriffSelfDestruct) none='本局無警長';
    else none='沒有人上警，本局無警長';
  }
  // 票型：照文字紀錄的寫法（警長票X：投給X的人），PK 前面加一行分隔。
  const votes=[];
  let pkMarked=false;
  jgSheriffLogLines.forEach(l=>{
    let m;
    if((m=l.match(/^(PK)?警長票(\d+)：(.+)$/))){
      if(m[1]&&!pkMarked){ votes.push('－ PK －'); pkMarked=true; }
      votes.push('警長票'+m[2]+'：'+m[3].replace(/,/g,'、'));
    } else if((m=l.match(/^(PK)?棄票：(.+)$/))) votes.push('棄票：'+m[2].replace(/,/g,'、'));
    else if(/^平票：/.test(l)) votes.push(l.replace(/（PK 發言順序：.*）$/,''));
    else if(/^PK 後再度平票|^全數 0 票/.test(l)) votes.push(l);
  });
  const elected=jgSheriffElectedNum?Number(jgSheriffElectedNum):null;
  const holder=jgSheriffElectionDone&&jgSheriff?Number(jgSheriff):null;
  return { candidates:cands, withdrawn, confirmed:!!confirmed, order, start:jgSheriffSpeakStart, dir:jgSheriffSpeakDir,
    pk:!!jgSheriffPkRound, votes, elected, holder, none, canWithdraw:jgDealCanWithdrawNow() };
}
// 每天白天的放逐投票票型（公開版，跟即時票型同一份過濾規則）。
function jgDealDayVotes(){
  return Object.keys(jgDayLog).map(Number).sort((a,b)=>a-b).map(n=>{
    const text=jgPublicRedact(jgFormatDayVoteBlock(n));
    return text?{day:n, lines:text.split('\n').filter(Boolean).map(l=>l.replace(/,/g,'、'))}:null;
  }).filter(Boolean);
}
// 遊戲結束時給玩家手機看的「全體身分」（跟法官結束畫面同一份：號碼、名字、身分、死亡）。
let jgDealGameOver=null;
function jgDealMarkGameOver(){
  jgDealGameOver={ roster: jgPlayers.map(p=>{
    const role=p.role||'villager';
    return { num:p.num, name:p.name, alive:!!p.alive, role:jgRoleDisplayName(p), badge:(typeof BADGE!=='undefined'&&BADGE[role])||'' };
  }) };
  jgDealSync();
}
function jgDealClearGameOver(){ jgDealGameOver=null; }
function jgDealBuildPublicInfo(){
  return {
    players: jgPlayers.map(p=>({num:p.num, name:p.name})),
    sheriff: jgDealSheriffInfo(),
    dayVotes: jgDealDayVotes(),
    gameOver: jgDealGameOver
  };
}
// 把目前的公開資訊同步到發牌房（內容沒變就不會真的寫入，見 jgRoomDealPublish）。
function jgDealSync(){
  if(!jgDealLinked()) return;
  try{ window.jgRoomDealPublish(jgDealBuildPublicInfo()); }catch(e){ console.warn(e); }
}
// 私人提醒：只有那個座位的玩家手機會跳出來。
function jgDealSendPrivate(num, notice){
  if(!jgDealLinked()||typeof window.jgRoomDealSendPrivate!=='function') return;
  window.jgRoomDealSendPrivate(num, notice);
}

// 法官畫面上的短暫提示（不擋操作）。
function jgJudgeToast(text){
  let box=document.getElementById('jg-judge-toast');
  if(!box){
    box=document.createElement('div');
    box.id='jg-judge-toast';
    box.style.cssText='position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:9997;background:var(--text,#111);color:var(--bg,#fff);padding:10px 20px;border-radius:12px;font-size:16px;font-weight:800;box-shadow:0 4px 16px rgba(0,0,0,0.25);pointer-events:none;';
    document.body.appendChild(box);
  }
  box.textContent=text;
  box.style.display='block';
  clearTimeout(window.__jgJudgeToastTimer);
  window.__jgJudgeToastTimer=setTimeout(()=>{ box.style.display='none'; }, 4000);
}

// 玩家從手機按「退水」：跟法官自己按退水一樣處理（不用再確認一次），畫面跟著更新。
window.jgDealRemoteWithdraw=function(n){
  n=Number(n);
  if(!jgDealCanWithdrawNow()||!jgSheriffCandidates.map(Number).includes(n)) return false;
  jgSheriffCandidates=jgSheriffCandidates.filter(x=>Number(x)!==n);
  jgSheriffWithdrawn.push(n);
  jgSheriffLogLines.push('退水：'+n+'號');
  jgJudgeToast(n+'號 從手機退水');
  if(jgSheriffHandleWithdrawResolution()){ jgDealSync(); return true; }
  if(jgCurrentStep==='sheriff-speech') jgRenderSheriffSpeech();
  else jgRenderSheriffDay2Resume();
  jgDealSync();
  return true;
};

// 發牌房的天亮口白：交易／連情侶的那一晚，公布昨晚結果時提醒大家看自己的手機（不管交易
// 成不成功都唸，才不會洩漏結果）。第一天有警長競選的話，公布昨晚結果是在競選結束之後。
function jgDealDayReminderHtml(){
  if(!jgDealLinked()) return '';
  const lines=[];
  if(jgBlackMarketTradeNight!=null&&jgBlackMarketTradeNight===jgNight)
    lines.push('請各位玩家確認自己的畫面，確認自己是否為幸運兒，以及獲得的技能是什麼。');
  if(jgNight===1&&jgCupidChosen)
    lines.push('請各位玩家確認自己的畫面，確認自己是否為情侶之一，以及你的 Partner 是誰。');
  return lines.map(t=>'<div class="speech" style="font-size:16px;">「<em>'+t+'</em>」</div>').join('');
}
// 黑市商人交易成功：幸運兒手機跳出「你是幸運兒，你獲得的是 XXX」。
function jgDealNotifyLuckyOne(num, skill){
  const label={seer:'預言家查驗',witch:'女巫毒藥',hunter:'獵人獵槍'}[skill]||skill;
  const note=skill==='hunter'
    ?'被動技能：之後被淘汰時可以開槍帶人（被毒死不能開槍）。'
    :'從下一晚起，法官說「幸運兒請睜眼」時睜眼使用技能（整局限一次）。';
  jgDealSendPrivate(num, {key:'luckyone', title:'你是幸運兒', main:'你獲得的是'+label, note});
}
// 邱比特連好情侶：兩位情侶的手機各自跳出「X號、Y號是情侶」。
function jgDealNotifyLovers(a, b){
  const pa=jgFind(a), pb=jgFind(b);
  const label=p=>p?(p.num+'號'+(p.name&&p.name!==p.num+'號'?' '+p.name:'')):'';
  const main=a+'號、'+b+'號是情侶';
  jgDealSendPrivate(a, {key:'lovers', title:'你是情侶', main, note:'你的 Partner 是 '+label(pb)+'。情侶其中一人死亡，另一人會跟著殉情。'});
  jgDealSendPrivate(b, {key:'lovers', title:'你是情侶', main, note:'你的 Partner 是 '+label(pa)+'。情侶其中一人死亡，另一人會跟著殉情。'});
}

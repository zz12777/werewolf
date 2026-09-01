// ═══════════════════════════════════════════
// js/night.js
// 夜晚各角色睜眼／技能結算邏輯
// ═══════════════════════════════════════════

function jgMechWolfHunterActive(){
  return jgMechWolfLearned==='hunter'&&jgMechWolfLearnedNight!==null;
}
// 學到「黑狼王」：跟學到「狼人」一樣有一次性額外一刀，額外還多了「被刀／被票出局可以帶人（被毒則不行）」
function jgMechWolfWolfkingActive(){
  return jgMechWolfLearned==='wolfking'&&jgMechWolfLearnedNight!==null;
}
// 學到「狼人」或「黑狼王」都給予同一種「額外一刀」能力（次晚起限一次）
function jgMechWolfHasBonusKill(){
  return jgMechWolfLearned==='wolf'||jgMechWolfLearned==='wolfking';
}
// Whether a specific player currently holds hunter-style shoot-on-death ability:
// the real hunter, the mechanical wolf (if it learned 獵人 and that's active), or the
// black-market luckyone (if their gift is 獵人 and it hasn't been used yet).
// ── 雙身分模式：統一的「死亡」處理 ──
// 單身分模式下就是單純的 p.alive=false。雙身分模式下，如果玩家還有第二張未生效的牌，
// 第一張「陣亡」時玩家並不真的離場：改成翻開第二張牌繼續玩（p.alive 保持 true），只有
// 第二張牌也陣亡時才算真正淘汰。回傳 true 代表這次是「真正淘汰」，false 代表只是換牌。
function jgBuildHunterStatusHtml(p){
  if(!p) return '';
  if(p.diedByCascade){
    // 情侶殉情死亡：殉情不會觸發任何技能（即使殉情者是獵人），要照 THIEF_BURIED_STEP_INFO
    // 同一套精神走完流程，但手勢要誠實顯示「倒讚」，不能套用一般「已出局」預設的比讚。
    return '<div class="info-warn">已因情侶殉情出局，技能不會發動，仍需走完流程避免洩露身分</div>'
      +'<div class="speech">「<em>你的技能使用狀況是 👎</em>」</div>';
  }
  // 被夢魘恐懼：本回合技能被封印，開槍手勢要比倒讚——但這個封印只影響「這一晚」的死亡
  // 結算（例如今晚被狼刀擊殺就不能開槍），不影響之後白天被票出局時的開槍資格，那是完全
  // 獨立的死法，不會被這一晚的恐懼延續過去。
  if(jgFeared(p)){
    return '<div class="info-warn">已被夢魘恐懼，本回合技能被封印</div>'
      +'<div class="speech">「<em>你的技能使用狀況是 👎</em>」</div>';
  }
  // 攝夢人已經在稍早的睜眼順序連續兩晚夢遊同一人（此時已經知道結果，即使實際死亡要等到
  // 天亮才套用）：技能一樣被封印，不能開槍，手勢要比倒讚。
  if(jgRecord&&jgRecord.dreamcatcherKillTarget&&p.num.toString()===jgRecord.dreamcatcherKillTarget.toString()){
    return '<div class="info-warn">被攝夢人連續兩晚夢遊致死，技能被封印</div>'
      +'<div class="speech">「<em>你的技能使用狀況是 👎</em>」</div>';
  }
  const gsKill=jgRecord.guardTarget&&jgRecord.wolfKill&&(jgRecord.guardTarget.toString()===jgRecord.wolfKill.toString());
  const mgsKill=jgRecord.mechWolfGuardTarget&&jgRecord.wolfKill&&(jgRecord.mechWolfGuardTarget.toString()===jgRecord.wolfKill.toString());
  const wsKill=jgRecord.witchSave;
  const pnum=p.num;
  const byWolf=jgRecord.wolfKill&&(pnum.toString()===jgRecord.wolfKill.toString())&&!gsKill&&!mgsKill&&!wsKill;
  // 不管是被真女巫毒還是機械狼學到的女巫毒藥毒，技能使用狀況都算比倒讚
  const byPoison=
    (jgRecord.witchPoison&&pnum.toString()===jgRecord.witchPoison.toString())||
    (jgRecord.mechWolfPoison&&pnum.toString()===jgRecord.mechWolfPoison.toString());
  const alreadyDead=!p.alive&&!byWolf&&!byPoison;
  if(alreadyDead){
    return '<div class="info-warn">已出局，仍需走完流程避免洩露身分</div>'
      +'<div class="speech">「<em>你的技能使用狀況是 👍</em>」</div>';
  } else if(byPoison){
    return '<div class="speech">「<em>你的技能使用狀況是 👎</em>」</div>';
  } else if(byWolf){
    // Wolf-killed: skill intact (not poisoned), activates at dawn — show 👍
    return '<div class="speech">「<em>你的技能使用狀況是 👍</em>」</div>'
      +'<div class="info-warn" style="font-size:13px;padding:10px 14px;">天亮將啟動角色技能</div>';
  }
  return '<div class="speech">「<em>你的技能使用狀況是 👍</em>」</div>';
}
// 第一晚獵人號碼還沒點選時，jgPlayers 裡還找不到這個角色，jgBuildHunterStatusHtml(undefined)
// 只會回傳空字串；點選號碼的當下即時用這個號碼組出「你的技能使用狀況是」台詞，讓法官第一晚
// 指定完獵人身分後也能立刻看到比讚／比倒讚的提示，不用等到之後夜晚才顯示。
function jgHunterIdCheck(whoId, val){
  jgSoloIdFearCheck(whoId, val);
  const statusEl=document.getElementById('jg-hunter-status-live');
  if(!statusEl) return;
  if(!val){ statusEl.innerHTML=''; return; }
  const fakeP={num:parseInt(val), alive:true};
  statusEl.innerHTML=jgBuildHunterStatusHtml(fakeP);
}
// 機械狼「已學得獵人」的技能使用狀況（比讚／比倒讚）已經併在機械狼自己的睜眼畫面裡處理
// （見 mechanicalwolf-wake 的 learnHtml），獵人自己的步驟結束後直接往下走即可。
function jgAfterHunterStep(){
  return jgNextGodStep('hunter-wake');
}

let jgNightmareForceMode='force';
let jgNightmareModeManual=false;
function jgSetNightmareForceMode(mode){
  jgNightmareForceMode=mode;
  jgNightmareModeManual=true;
  jgRenderNightmareModeUI();
}
function jgRenderNightmareModeUI(){
  const row=document.getElementById('jg-nightmare-mode-row');
  if(!row) return;
  const hasNightmare=(jgRolePick.nightmare||0)>0;
  row.style.display=hasNightmare?'':'none';
  if(!hasNightmare) return;
  if(!jgNightmareModeManual){
    const n=parseInt(document.getElementById('jg-count')?.value)||jgTotal||6;
    jgNightmareForceMode = n>=12 ? 'optional' : 'force';
  }
  const forceBtn=document.getElementById('jg-nightmare-mode-force');
  const optBtn=document.getElementById('jg-nightmare-mode-optional');
  if(forceBtn) forceBtn.classList.toggle('active', jgNightmareForceMode==='force');
  if(optBtn) optBtn.classList.toggle('active', jgNightmareForceMode==='optional');
  const desc=document.getElementById('jg-nightmare-mode-desc');
  if(desc) desc.textContent = jgNightmareForceMode==='force'
    ? '每晚必須恐懼一人，不能留空跳過。'
    : '可以留空跳過，今晚選擇不恐懼任何人也合法（12人以上局預設採用這個模式）。';
}

// 傻瓜規則切換（要追刀／不需追刀）：只有這場板子有選傻瓜時才顯示這個切換鈕；
// 選擇會存進 jgFoolChaseMode，實際規則差異見 jgAllGodsForWin() 與投票出局判定那裡的判斷。
function jgSetFoolChaseMode(mode){
  jgFoolChaseMode=mode;
  jgRenderFoolModeUI();
}
function jgRenderFoolModeUI(){
  const row=document.getElementById('jg-fool-mode-row');
  if(!row) return;
  const hasFool=(jgRolePick.fool||0)>0;
  row.style.display=hasFool?'':'none';
  if(!hasFool) return;
  const chaseBtn=document.getElementById('jg-fool-mode-chase');
  const nochaseBtn=document.getElementById('jg-fool-mode-nochase');
  if(chaseBtn) chaseBtn.classList.toggle('active', jgFoolChaseMode==='chase');
  if(nochaseBtn) nochaseBtn.classList.toggle('active', jgFoolChaseMode==='nochase');
  const desc=document.getElementById('jg-fool-mode-desc');
  if(desc) desc.textContent = jgFoolChaseMode==='chase'
    ? '傻瓜被放逐後可翻牌免死、留場發言但不能再投票；狼隊「屠神」時必須在夜裡額外補刀殺死傻瓜才算數。'
    : '傻瓜被放逐時直接出局，沒有翻牌留場的機制；狼隊「屠神」不需要另外刀死傻瓜。';
}

// ── 玩家名單設定：讓法官在開局前先指定每個號碼是誰 ──
function jgNoSelfCutNums(){
  return jgPlayers.filter(p=>p.alive&&(p.role==='evilknight'||p.role==='wolfbeauty'||p.role==='nightmare')).map(p=>p.num);
}
// 警上競選期間（天亮公布死訊之前），夜間死亡還沒真的套用到玩家身上，資料上暫時仍顯示存活——
// 但這種人等一下天亮就會被公布死亡，自爆選人時要先排除，避免選到一個其實已經死亡的狼。
// 這裡只覆蓋最常見的幾種死法（狼刀沒被守衛/女巫救下、女巫毒沒被機械守衛擋下、機械狼學到的
// 毒／狼刀、狼弟覺醒刀），惡靈騎士／夢中目標免疫等特殊情況本來就不在自爆候選名單裡，不影響判斷。
function jgNoSelfCutRoleLabel(){
  const labels=[];
  if(jgPlayers.some(p=>p.alive&&p.role==='evilknight')) labels.push('惡靈騎士');
  if(jgPlayers.some(p=>p.alive&&p.role==='wolfbeauty')) labels.push('狼美人');
  if(jgPlayers.some(p=>p.alive&&p.role==='nightmare')) labels.push('夢魘');
  return labels.join('／');
}
// 統一的「不能自刀」提醒文字，帶刀選人（狼人／機械狼／石像鬼）三處畫面共用，
// 避免各自維護一份重複邏輯、提醒文字不一致。
function jgNoSelfCutNoticeHtml(){
  return jgNoSelfCutNums().length>0
    ?'<div class="info" style="font-size:11px;margin-bottom:4px;">灰色號碼為不能自刀的隊友（'+jgNoSelfCutRoleLabel()+'），無法選取</div>'
    :'';
}

// 「狼人睜眼」是首夜唯一一個把「填身分號碼」跟「選殺人對象」放在同一個畫面的地方：
// 惡靈騎士／狼美人的號碼在這個畫面填寫時還沒送出存檔（p.role 還沒真的寫進 jgPlayers），
// 所以光用 jgNoSelfCutNums() 抓不到剛剛選的號碼。這裡額外把畫面上還沒存檔的惡靈騎士／
// 狼美人號碼欄位也一併算進「不能自刀」清單，並在法官填號碼的當下即時刷新下面的殺人名單
// 跟提醒文字，不用等存檔重整才生效。
function jgWolfWakeSelfCutInfo(){
  const numSet=new Set(jgNoSelfCutNums());
  const labelSet=new Set(jgNoSelfCutRoleLabel()?jgNoSelfCutRoleLabel().split('／').filter(Boolean):[]);
  const LABEL_MAP={evilknight:'惡靈騎士',wolfbeauty:'狼美人'};
  let i=0;
  while(true){
    const el=document.getElementById('jg-wolf-who-'+i);
    if(!el) break;
    const role=el.getAttribute('data-role');
    if((role==='evilknight'||role==='wolfbeauty')&&el.value){
      numSet.add(parseInt(el.value,10));
      labelSet.add(LABEL_MAP[role]);
    }
    i++;
  }
  return {nums:[...numSet], label:[...labelSet].join('／')};
}
function jgWolfWakeSelfCutNoticeHtml(info){
  info=info||jgWolfWakeSelfCutInfo();
  return info.nums.length>0
    ?'<div class="info" style="font-size:11px;margin-bottom:4px;">灰色號碼為不能自刀的隊友（'+info.label+'），無法選取</div>'
    :'';
}
function jgWolfWakeRefreshSelfCut(){
  const info=jgWolfWakeSelfCutInfo();
  const notice=document.getElementById('jg-wolf-selfcut-notice');
  if(notice) notice.innerHTML=jgWolfWakeSelfCutNoticeHtml(info);
  const wrap=document.getElementById('jg-wolf-rec-wrap');
  if(wrap){
    const curInput=document.getElementById('jg-wolf-rec');
    const curVal=curInput?curInput.value:'';
    const exclSet=new Set(info.nums.map(String));
    // 如果剛選的殺人對象，因為身分欄位剛填好而變成不能自刀的隊友，直接清空，避免殘留一個不合法的選擇
    const clearedVal=(curVal&&exclSet.has(curVal.toString()))?'':curVal;
    wrap.innerHTML=jgNumSelectHtml('jg-wolf-rec', clearedVal, null, null, info.nums);
  }
}

// Single-select tap grid: clicking a number toggles it on (green) and clears any other
// selection in the same grid; clicking the already-selected number clears it.
function jgWolfIdOnChange(changedId, changedVal){
  // Collect every wolf-identity slot on this page (jg-wolf-who-N plus the gargoyle slot)
  const slotIds=[];
  let i=0;
  while(true){
    const elId='jg-wolf-who-'+i;
    if(!document.getElementById(elId)) break;
    slotIds.push(elId);
    i++;
  }
  if(document.getElementById('jg-gargoyle-who-wolf')) slotIds.push('jg-gargoyle-who-wolf');

  // Clear the same number from any OTHER slot that already held it
  if(changedVal){
    slotIds.forEach(elId=>{
      if(elId===changedId) return;
      const el=document.getElementById(elId);
      if(el&&el.value===changedVal){
        el.value='';
        const grid=document.getElementById(elId+'-grid');
        if(grid) grid.querySelectorAll('button').forEach(b=>{ b.style.background=''; b.style.color=''; b.style.borderColor=''; });
      }
    });
  }

  jgWolfIdFearCheck();
  jgWolfWakeRefreshSelfCut();
}

function jgWolfIdFearCheck(){
  if(!jgRecord.nightmareTarget) return;
  const target=jgRecord.nightmareTarget.toString();
  let matched=false;
  let i=0;
  while(true){
    const el=document.getElementById('jg-wolf-who-'+i);
    if(!el) break;
    if(el.value&&el.value.toString()===target){ matched=true; break; }
    i++;
  }
  if(!matched){
    const gg=document.getElementById('jg-gargoyle-who-wolf');
    if(gg&&gg.value&&gg.value.toString()===target) matched=true;
  }
  jgRecord.nightmareBlocksWolf=matched;
  const blockedMsg=document.getElementById('jg-wolf-blocked-msg');
  const killSection=document.getElementById('jg-wolf-kill-section');
  if(blockedMsg) blockedMsg.style.display=matched?'':'none';
  if(killSection) killSection.style.display=matched?'none':'';
}

// Night 1: as a solo role's identity is tapped in on the merged ID+action page (before
// the whole page is submitted and the role is permanently saved), live-check whether the
// chosen number matches tonight's nightmare target — if so, hide that role's skill section
// and show the "you are feared" note immediately, without waiting for a page reload.
// Naming convention: whoId 'jg-guard-who' → action wrap 'jg-guard-action', note 'jg-guard-feared-note'.
function jgSoloIdFearCheck(whoId, val){
  const prefix=whoId.replace('-who','');
  const feared=!!(val && jgRecord && jgRecord.nightmareTarget && val.toString()===jgRecord.nightmareTarget.toString());
  const wrap=document.getElementById(prefix+'-action');
  const note=document.getElementById(prefix+'-feared-note');
  if(wrap) wrap.style.display=feared?'none':'';
  if(note) note.style.display=feared?'':'none';
}

// Night-1 witch id picker: reuses the fear check above, and additionally live-hides the
// self-save buttons (and clears any save already toggled) the moment the judge picks a
// witch number that matches tonight's wolf-kill target —女巫不能自救.
function jgWitchIdCheck(whoId, val){
  jgSoloIdFearCheck(whoId, val);
  const killed=jgRecord&&jgRecord.wolfKill;
  const selfKilled=!!(val && killed && val.toString()===killed.toString());
  const saveWrap=document.getElementById('jg-witch-save-wrap');
  const note=document.getElementById('jg-witch-selfkill-note');
  if(saveWrap) saveWrap.style.display=selfKilled?'none':'';
  if(note) note.style.display=selfKilled?'':'none';
  if(selfKilled&&jgRecord) jgRecord.witchSave=null;
}

const THIEF_BURIED_STEP_INFO={
  cupid:          {step:'cupid-wake',          next:()=>jgAfterNightmareStep()},
  nightmare:      {step:'nightmare-wake',      next:()=>jgAfterNightmareStep()},
  magician:       {step:'magician-wake',       next:()=>jgAfterMagicianStep()},
  guard:          {step:'guard-wake',          next:()=>jgAfterGuardStep()},
  dreamcatcher:   {step:'dreamcatcher-wake',   next:()=>jgAfterDreamcatcherStep()},
  hybrid:         {step:'hybrid-wake',         next:()=>jgAfterHybridStep()},
  gravkeeper:     {step:'gravkeeper-wake',     next:()=>jgAfterGravkeeperStep()},
  gargoyle:       {step:'gargoyle-wake',       next:()=>jgAfterGargoyleStep()},
  mechanicalwolf: {step:'mechanicalwolf-wake', next:()=>jgAfterMechWolfStep()},
  wolfbeauty:     {step:'wolfbeauty-wake',     next:()=>jgNextWolfStep()},
  whitewolf:      {step:'whitewolf-wake',      next:()=>jgNextAfterSubWolf('whitewolf-wake')},
  evilknight:     {step:'evilknight-wake',     next:()=>jgNextAfterSubWolf('evilknight-wake')},
  blackmarket:    {step:'blackmarket-wake',    next:()=>'witch-wake'},
  witch:          {step:'witch-wake',          next:()=>'seer-wake'},
  seer:           {step:'seer-wake',           next:()=>jgNextGodStep(null)},
  medium:         {step:'medium-wake',         next:()=>jgNextGodStep('medium-wake')},
  hunter:         {step:'hunter-wake',         next:()=>jgNextGodStep('hunter-wake')},
  knight:         {step:'knight-wake',         next:()=>jgNextGodStep('knight-wake')},
  demonhunter:    {step:'demonhunter-wake',    next:()=>jgNextGodStep('demonhunter-wake')},
  fool:           {step:'fool-wake',           next:()=>jgNextGodStep('fool-wake')},
};

// 盜賊「埋掉」的身分被代喊時，要講的台詞——跟該角色「本人已死亡、但仍要照常走完流程」時
// 講的台詞完全一致（法官口白必須跟「這個身分還有人、只是已經死了」聽起來一模一樣，玩家才
// 分辨不出「今晚這句話是講給死人聽」還是「這個身分打從一開始就沒人拿到」）。
// open：睜眼時講的話（有些角色的睜眼／提問是同一句，就直接寫在一起）。
// extra：睜眼與閉眼之間，額外要照講的提問句（例如女巫要問解藥、也要問毒藥）。
const THIEF_BURIED_SCRIPT={
  cupid:          {icon:'💘', open:'邱比特請睜眼。今晚要指定哪兩位玩家成為情侶？'},
  nightmare:      {icon:'😈', open:'夢魘請睜眼，今晚要恐懼的對象是？'},
  magician:       {icon:'🎩', open:'魔術師請睜眼，今晚要交換哪兩個號碼？'},
  guard:          {icon:'🛡️', open:'守衛請睜眼。', extra:['請選擇你要守護的對象。']},
  dreamcatcher:   {icon:'🌙', open:'攝夢人請睜眼，今晚夢遊的對象是？'},
  hybrid:         {icon:'🧬', open:'混血兒請睜眼，今晚要選擇支持的對象是？'},
  gravkeeper:     {icon:'⚰️', open:'守墓人請睜眼。'},
  gargoyle:       {icon:'🗿', open:'石像鬼請睜眼，今晚要查驗的對象是？'},
  mechanicalwolf: {icon:'🤖', open:'機械狼請睜眼。'},
  wolfbeauty:     {icon:'💋', open:'狼美人請睜眼。', extra:['今晚要魅惑的對象是？']},
  whitewolf:      {icon:'🤍', open:'白狼王請睜眼。'},
  evilknight:     {icon:'🖤', open:'惡靈騎士請睜眼。'},
  blackmarket:    {icon:'💰', open:'黑市商人請睜眼，今晚要交易嗎？'},
  witch:          {icon:'🧪', open:'女巫請睜眼。', extra:['他被殺了，你要使用解藥嗎？','你要使用毒藥嗎？你要毒誰呢？']},
  seer:           {icon:'🔮', open:'預言家請睜眼，今晚要查驗的對象是？'},
  medium:         {icon:'👁️', open:'通靈師請睜眼，今晚要查驗的對象是？'},
  hunter:         {icon:'🔫', open:'獵人請睜眼。', extra:['你的技能使用狀況是 👍']},
  knight:         {icon:'⚔️', open:'騎士請睜眼。'},
  demonhunter:    {icon:'🗡️', open:'獵魔人請睜眼。', extra:['今晚要狩獵的人是？']},
  fool:           {icon:'🃏', open:'傻瓜請睜眼。'},
};


function jgSaveHunterNight(){
  const isFirst=jgNight===1;
  if(isFirst){
    if(!jgRequireFirstId('jg-hunter-who','獵人')) return;
    const whoNum=parseInt((document.getElementById('jg-hunter-who')||{}).value||'0');
    const name=(document.getElementById('jg-hunter-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'hunter')) return;
      jgPlayers.forEach(p=>{ if(p.role==='hunter') p.role=null; });
      const p=jgByNum(whoNum);
      if(p){p.role='hunter';if(name)p.name=name;}
    }
  }
  const shotVal=(document.getElementById('jg-hunter-night-shot')||{}).value?.trim()||'';
  if(shotVal) jgRecord.hunterNightShot=shotVal;
  jgRenderRoster();
  jgGoStep(jgAfterHunterStep());
}

function jgIdFieldHtml(rn, existingP, whoId, nameId, onChangeFn){
  if(jgNight!==1) return '';
  // 身分已在開局前完整記錄（機械狼／黑市商人板的 mech-assign，或雙身分板的 dual-assign），
  // 不管這個角色現在是否有人持有（雙身分板可能還沒翻到卡2），都不需要再問「幾號是這個身分」。
  if(jgMechAssignDone) return '';
  const ev=existingP?existingP.num:'';
  return '<div style="margin-bottom:8px;" id="'+whoId+'-wrap">'
    +'<label style="margin-top:0;"><strong>'+rn+'</strong>號碼</label>'
    +jgNumSelectHtml(whoId, ev, onChangeFn||'jgSoloIdFearCheck')
    +'</div><div class="divider"></div>';
}

function jgGodIdHtml(roleId,existingP){
  if(jgNight!==1) return '';
  const RZHMAP={seer:'預言家',witch:'女巫',hunter:'獵人',guard:'守衛',dreamcatcher:'攝夢人',knight:'騎士',magician:'魔術師',demonhunter:'獵魔人',gravkeeper:'守墓人',medium:'通靈師',blackmarket:'黑市商人',hybrid:'混血兒',cupid:'邱比特',thief:'盜賊',fool:'傻瓜',purewhitemaiden:'純白之女',dancer:'舞者',mask:'假面',littlegirl:'小女孩',bigmechwolf:'大機械狼',smallmechwolf:'小機械狼'};
  const rn=RZHMAP[roleId]||roleId;
  return jgIdFieldHtml(rn, existingP, 'jg-god-who-'+roleId, 'jg-god-name-'+roleId);
}

// 第一晚指定身分號碼時的共用檢查：畫面上有顯示「請選擇號碼」欄位、但法官沒有點選就要按下一步時，
// 跳出提醒並擋下，不能讓流程在身分還沒記錄的情況下繼續往後跑。
function jgRequireFirstId(elId, label){
  if(jgNight!==1) return true;
  const el=document.getElementById(elId);
  if(!el) return true; // 這個欄位沒有顯示（例如身分已經在開局前記錄過），不需要檢查
  const v=parseInt(el.value||'0');
  if(!v){
    alert('請先選擇「'+label+'」的號碼，再繼續下一步！');
    return false;
  }
  return true;
}

function jgSaveGodId(roleId){
  if(jgNight!==1) return true;
  const RZHMAP2={seer:'預言家',witch:'女巫',hunter:'獵人',guard:'守衛',dreamcatcher:'攝夢人',knight:'騎士',magician:'魔術師',demonhunter:'獵魔人',gravkeeper:'守墓人',medium:'通靈師',blackmarket:'黑市商人',hybrid:'混血兒',cupid:'邱比特',thief:'盜賊',fool:'傻瓜',purewhitemaiden:'純白之女',dancer:'舞者',mask:'假面',littlegirl:'小女孩',bigmechwolf:'大機械狼',smallmechwolf:'小機械狼'};
  if(!jgRequireFirstId('jg-god-who-'+roleId, RZHMAP2[roleId]||roleId)) return false;
  const whoNum=parseInt((document.getElementById('jg-god-who-'+roleId)||{}).value||'0');
  const name=(document.getElementById('jg-god-name-'+roleId)||{}).value?.trim()||'';
  if(whoNum){
    if(!jgConflictCheck(whoNum,roleId)) return false;
    jgPlayers.forEach(p=>{ if(p.role===roleId) p.role=null; });
    const p=jgByNum(whoNum); if(p){p.role=roleId;if(name)p.name=name;}
  }
  jgRenderRoster();
  return true;
}

// Generic: save identity and go to next god step
function jgSaveSimpleGod(roleId, currentStep){
  if(!jgSaveGodId(roleId)) return;
  jgGoStep(jgNextGodStep(currentStep));
}

// 守墓人現在排在狼人睜眼之前（見 jgAfterWolfBrotherStep），不再屬於 GOD_CHAIN，
// 所以不能沿用 jgSaveSimpleGod 裡呼叫 jgNextGodStep 的那條舊鏈，改成走 jgAfterGravkeeperStep。
function jgSaveGravkeeper(){
  if(!jgSaveGodId('gravkeeper')) return;
  jgGoStep(jgAfterGravkeeperStep());
}

// Dreamcatcher consecutive check
function jgDreamcatcherCheck(){
  const val=(document.getElementById('jg-dc-target')||{}).value?.trim()||'';
  const warn=document.getElementById('jg-dc-warn');
  if(!warn) return;
  const dcP=jgPlayers.find(p=>p.role==='dreamcatcher');
  if(val&&dcP&&val===dcP.num.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:12px;margin-top:4px;">⚠️ 攝夢人不能夢遊自己！</div>';
  } else if(val&&jgLastDreamcatcherTarget&&val===jgLastDreamcatcherTarget.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:12px;margin-top:4px;">⚠️ 連續兩晚攝夢同一人，該玩家將死亡！</div>';
  } else {
    warn.innerHTML='';
  }
}

function jgWolfBeautyCheck(){
  const val=(document.getElementById('jg-wolfbeauty-charm')||{}).value?.trim()||'';
  const warn=document.getElementById('jg-wolfbeauty-warn');
  if(!warn) return;
  const wbP=jgPlayers.find(p=>p.role==='wolfbeauty');
  if(val&&wbP&&val===wbP.num.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:12px;margin-top:4px;">⚠️ 狼美人不能魅惑自己！</div>';
  } else if(val&&jgLastWolfBeautyCharm&&val===jgLastWolfBeautyCharm.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:12px;margin-top:4px;">⚠️ 狼美人不能連續兩晚魅惑同一人！</div>';
  } else {
    warn.innerHTML='';
  }
}

function jgSaveDreamcatcher(){
  if(!jgSaveGodId('dreamcatcher')) return;
  const dcPfinal=jgPlayers.find(p=>p.role==='dreamcatcher');
  const dcFearedFinal=jgFeared(dcPfinal);
  const val=dcFearedFinal?null:((document.getElementById('jg-dc-target')||{}).value?.trim()||null);
  const dcDead=dcPfinal&&!dcPfinal.alive;
  if(!dcDead&&!dcFearedFinal){
    if(!val){
      alert('⚠️ 攝夢人每晚必須夢遊一人，請選擇號碼！');
      return;
    }
    if(dcPfinal&&val===dcPfinal.num.toString()){
      alert('⚠️ 攝夢人不能夢遊自己，請重新選擇！');
      return;
    }
  }
  // Consecutive: mark target for death
  if(val&&jgLastDreamcatcherTarget&&val===jgLastDreamcatcherTarget.toString()){
    jgRecord.dreamcatcherKillTarget=val;
  } else {
    jgRecord.dreamcatcherKillTarget=null;
  }
  // First-ever time this specific person is dreamed: immune to all night damage tonight
  if(val){
    jgRecord.dreamcatcherImmune=jgDreamcatcherEverTargeted[val]?null:val;
    jgDreamcatcherEverTargeted[val]=true;
  } else {
    jgRecord.dreamcatcherImmune=null;
  }
  jgLastDreamcatcherTarget=val||null;
  jgRecord.dreamcatcherTarget=val;
  jgGoStep(jgAfterDreamcatcherStep());
}

// Magician swap check
function jgSaveMagician(){
  if(!jgSaveGodId('magician')) return;
  const mgPfinal=jgPlayers.find(p=>p.role==='magician');
  const mgFearedFinal=jgFeared(mgPfinal);
  const a=mgFearedFinal?'':((document.getElementById('jg-mg-a')||{}).value?.trim()||'');
  const b=mgFearedFinal?'':((document.getElementById('jg-mg-b')||{}).value?.trim()||'');
  jgRecord.magicianA=a||null;
  jgRecord.magicianB=b||null;
  if(a&&b){
    // Validate: each number can only be swapped once total
    const blocked=jgMagicianSwapped.filter(n=>n===a||n===b);
    if(blocked.length>0){
      alert('⚠️ 號碼 '+blocked.join('、')+' 已被交換過，無法再次使用！');
      return;
    }
    jgMagicianSwapped.push(a,b);
    // Apply swap effect: actions targeting A this night go to B and vice versa
    // We note this in jgRecord for dawn processing
    jgRecord.magicianSwapA=a;
    jgRecord.magicianSwapB=b;
  } else {
    jgRecord.magicianSwapA=null;
    jgRecord.magicianSwapB=null;
  }
  jgGoStep(jgAfterMagicianStep());
}

function jgSaveDemonhunter(){
  if(!jgSaveGodId('demonhunter')) return;
  if(jgNight>=2){
    const dhPfinal=jgPlayers.find(p=>p.role==='demonhunter');
    const val=jgFeared(dhPfinal)?null:((document.getElementById('jg-dh-target')||{}).value?.trim()||null);
    jgRecord.demonhunterTarget=val;
    if(jgTryEarlyEnd()) return;
  }
  jgGoStep(jgNextGodStep('demonhunter-wake'));
}

// 狼巫查驗：身分已經在「狼人睜眼」步驟跟其餘狼隊一起記錄過了（見 jgSaveWolf 的 wolfRoles
// 清單），這裡不用再問一次號碼，直接找到目前是狼巫的玩家。查驗每晚都會做（第一晚也會問，
// 只是沒有致死效果），但第二晚起若查到純白之女，純白之女立即死亡——這個死亡不可被守衛／
// 女巫阻擋，實際套用死亡在天亮結算時處理（見 steps.js 的 dawn 區塊），這裡只負責記錄查驗
// 結果跟致死目標。
function jgSaveWolfshamanCheck(){
  const wsP=jgPlayers.find(p=>p.role==='wolfshaman');
  const rawVal=jgFeared(wsP)?null:((document.getElementById('jg-wolfshaman-target')||{}).value?.trim()||null);
  const val=rawVal?jgMagicSwapNum(rawVal):null;
  jgRecord.wolfshamanCheckedRaw=rawVal;
  jgRecord.wolfshamanChecked=val;
  jgRecord.wolfshamanKillTarget=null;
  if(val&&jgNight>=2){
    const t=jgFind(val);
    if(t&&t.alive&&t.role==='purewhitemaiden') jgRecord.wolfshamanKillTarget=val;
  }
  if(jgIsFirstNight()){
    jgGoStep(jgNextGodStep('wolfshaman-check'));
  } else {
    if(jgTryEarlyEnd()) return;
    jgGoStep(jgAfterWolfshamanStep());
  }
}

// 純白之女查驗：跟預言家一樣是神職，第一晚需要指定號碼（jgSaveGodId 統一處理）。每晚都排在
// 女巫之後同一個位置（不像狼巫，第一晚跟其餘夜晚位置不同），查驗結果每晚都會顯示，第二晚起
// 若查到狼人陣營（含所有狼隊角色），該名狼人立即死亡——同樣不可被守衛／女巫阻擋，實際套用
// 在天亮結算時處理，這裡只負責記錄查驗結果跟致死目標。
function jgSavePurewhitemaiden(){
  if(!jgSaveGodId('purewhitemaiden')) return;
  const pwP=jgPlayers.find(p=>p.role==='purewhitemaiden');
  const rawVal=jgFeared(pwP)?null:((document.getElementById('jg-purewhitemaiden-target')||{}).value?.trim()||null);
  const val=rawVal?jgMagicSwapNum(rawVal):null;
  jgRecord.purewhitemaidenCheckedRaw=rawVal;
  jgRecord.purewhitemaidenChecked=val;
  jgRecord.purewhitemaidenKillTarget=null;
  if(val&&jgNight>=2){
    const t=jgFind(val);
    if(t&&t.alive&&WOLF_ROLES.includes(t.role)) jgRecord.purewhitemaidenKillTarget=val;
  }
  if(jgTryEarlyEnd()) return;
  jgGoStep('seer-wake');
}

function jgMechWolfGuardCheckRepeat(){
  const el=document.getElementById('jg-mechwolf-guard');
  const warn=document.getElementById('jg-mechwolf-guard-repeat-warn');
  if(!el||!warn) return;
  const val=el.value.trim();
  if(val&&jgLastMechWolfGuardTarget&&val===jgLastMechWolfGuardTarget.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:13px;margin-top:4px;">⚠️ 機械守衛不能連續兩晚守同一人！</div>';
  } else {
    warn.innerHTML='';
  }
}

function jgGuardCheckRepeat(){
  const el=document.getElementById('jg-guard-rec');
  const warn=document.getElementById('jg-guard-repeat-warn');
  if(!el||!warn) return;
  const val=el.value.trim();
  if(val&&jgLastGuardTarget&&val===jgLastGuardTarget.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:13px;margin-top:4px;">⚠️ 守衛不能連續兩晚守同一人！</div>';
  } else {
    warn.innerHTML='';
  }
}

function jgSaveGuard(){
  const isFirst=jgNight===1;
  if(isFirst){
    if(!jgRequireFirstId('jg-guard-who','守衛')) return;
    const whoNum=parseInt((document.getElementById('jg-guard-who')||{}).value||'0');
    const name=(document.getElementById('jg-guard-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'guard')) return;
      jgPlayers.forEach(p=>{ if(p.role==='guard') p.role=null; });
      const p=jgByNum(whoNum);
      if(p){p.role='guard';if(name)p.name=name;}
    }
  }
  const guardPfinal=jgPlayers.find(p=>p.role==='guard');
  const tv=jgFeared(guardPfinal)?'':((document.getElementById('jg-guard-rec')||{}).value?.trim()||'');
  // Consecutive guard check
  if(tv&&jgLastGuardTarget&&tv===jgLastGuardTarget.toString()){
    alert('⚠️ 守衛不能連續兩晚守同一人，請重新選擇！');
    return;
  }
  jgLastGuardTarget=tv||null;
  jgRecord.guardTargetRaw=tv||null;
  jgRecord.guardTarget=tv?jgMagicSwapNum(tv):null;
  jgRenderRoster();
  jgGoStep(jgAfterGuardStep());
}

// 混血兒：只在第一夜執行一次，選定支持對象後就不再有任何夜間動作
function jgSaveHybrid(){
  if(!jgSaveGodId('hybrid')) return;
  const hyP=jgPlayers.find(p=>p.role==='hybrid');
  const val=(document.getElementById('jg-hybrid-target')||{}).value?.trim()||'';
  if(hyP&&val&&val===hyP.num.toString()){
    alert('⚠️ 混血兒不能支持自己，請重新選擇！');
    return;
  }
  jgHybridTarget=val||null;
  jgHybridChosen=true;
  jgGoStep(jgAfterHybridStep());
}

// 盜賊：整局第一個睜眼（比邱比特還早）。開局前先用「候選轉盤」秘密抽出兩張候選身分，
// 法官照抽到的結果去實際牌堆裡把那兩張牌拿起來，其餘正常發給大家；到了盜賊睜眼步驟，
// 直接把這兩個已經決定好的候選秀給盜賊看，盜賊選一個成為最終真正的身分（若候選中有狼人
// 則強制選狼），另一張則被埋掉。

// 依照目前板子設定（jgComp）組出「一張一張攤開的候選卡池」：每個角色依板子上選了幾個，
// 就在池子裡放幾張同名的卡（例如板子選了 3 個「狼人」，池子裡就有 3 張「狼人」卡可能被抽到），
// 這樣抽到的機率才會符合實際牌堆的張數比例。「盜賊」自己不會放進池子——那張牌固定要發給
// 場上某一位玩家，不會变成候選。
function jgThiefBuildCardPool(){
  const pool=[];
  Object.entries(jgComp).forEach(([roleId,cnt])=>{
    if(roleId==='thief') return;
    for(let i=0;i<(cnt||0);i++) pool.push(roleId);
  });
  return pool;
}

// 轉盤抽取：從卡池隨機抽出兩張不同的候選牌，並保證不會兩張都是狼人陣營（現實中的牌堆
// 本來就只會有一張多的狼人牌可能落入候選池，不會兩張都是）。抽完直接存進
// jgThiefWheelCand1／2，並重新渲染畫面顯示結果（結果只有看著這支手機的法官看得到）。
function jgThiefSpinWheel(){
  const pool=jgThiefBuildCardPool();
  if(pool.length<2){
    alert('⚠️ 目前板子選的角色數量不足，無法抽出兩張候選身分，請先確認角色是否選滿。');
    return;
  }
  const idx1=Math.floor(Math.random()*pool.length);
  const card1=pool[idx1];
  let remaining=pool.slice();
  remaining.splice(idx1,1);
  if(WOLF_ROLES.includes(card1)){
    remaining=remaining.filter(r=>!WOLF_ROLES.includes(r));
    if(remaining.length===0){
      alert('⚠️ 板子上除了剛抽到的這張狼人身分外，沒有其他非狼人身分可以當第二張候選，請調整板子後再試一次。');
      return;
    }
  }
  const idx2=Math.floor(Math.random()*remaining.length);
  const card2=remaining[idx2];
  jgThiefWheelCand1=card1;
  jgThiefWheelCand2=card2;
  jgRecord._thiefWheelManualMode=false;
  jgGoStep('thief-wheel');
}

// 盜賊候選轉盤畫面裡的「手動指定候選／改用轉盤抽取」切換（發牌之前就可以決定要不要手動指定）。
function jgThiefWheelUseManual(){
  jgRecord._thiefWheelManualMode=true;
  jgGoStep('thief-wheel');
}
function jgThiefWheelUseSpin(){
  jgRecord._thiefWheelManualMode=false;
  jgGoStep('thief-wheel');
}

// 手動指定候選下拉選單變動時，重新檢查「兩個不能一樣」「不能兩個都是狼人」，並同步寫回
// jgThiefWheelCand1／2（跟轉盤抽到的結果共用同一組變數，後面流程不用分辨是怎麼決定的）。
function jgThiefWheelManualUpdate(){
  const warn=document.getElementById('jg-thief-wheel-manual-warn');
  const v1=(document.getElementById('jg-thief-wheel-cand1')||{}).value||'';
  const v2=(document.getElementById('jg-thief-wheel-cand2')||{}).value||'';
  jgThiefWheelCand1=v1||null;
  jgThiefWheelCand2=v2||null;
  if(!warn) return;
  if(!v1||!v2){ warn.innerHTML=''; return; }
  if(v1===v2){ warn.innerHTML='<div class="info-danger">⚠️ 兩個候選身分不能相同，請重新選擇。</div>'; return; }
  if(WOLF_ROLES.includes(v1)&&WOLF_ROLES.includes(v2)){ warn.innerHTML='<div class="info-danger">⚠️ 兩張候選不能都是狼人陣營，請重新選擇。</div>'; return; }
  warn.innerHTML='';
}

// 確認轉盤結果、正式進入下一步（盜賊睜眼會直接使用這兩個候選，不用再手動輸入一次）。
function jgThiefConfirmWheel(){
  if(!jgThiefWheelCand1||!jgThiefWheelCand2){
    alert('⚠️ 請先決定兩個候選身分，才能確認。');
    return;
  }
  if(jgThiefWheelCand1===jgThiefWheelCand2){
    alert('⚠️ 兩個候選身分不能相同，請重新選擇。');
    return;
  }
  if(WOLF_ROLES.includes(jgThiefWheelCand1)&&WOLF_ROLES.includes(jgThiefWheelCand2)){
    alert('⚠️ 兩張候選不能都是狼人陣營，請重新選擇。');
    return;
  }
  jgThiefWheelDone=true;
  // 候選確定後，接著才是正常的「發牌・確認身分」步驟（法官已經把候選的兩張牌拿起來了，
  // 剩下的牌現在才正常發給大家）；發完牌、大家閉眼之後，才會經由 jgProceedToNight()
  // 進入第一夜（此時 jgThiefWheelDone 已是 true，jgNightStartNext 會直接跳到「盜賊睜眼」）。
  jgGoStep('deal');
}

// 盜賊睜眼畫面裡的「改成手動指定候選／改用轉盤結果」切換：兩個都只是換畫面顯示方式，
// 實際存進 jgRecord._thiefCand1／2 的值會在 jgRenderStep 重新渲染時同步更新。
function jgThiefUseManualMode(){
  jgRecord._thiefManualMode=true;
  jgGoStep('thief-wake');
}
function jgThiefUseWheelResult(){
  jgRecord._thiefManualMode=false;
  jgGoStep('thief-wake');
}

// 盜賊睜眼畫面上的「大字報顯示給盜賊看」：把目前決定好的兩個候選身分，用左右兩張「卡牌」
// 呈現（① / ② + 大 emoji + 角色名稱），直接把手機拿給盜賊看。盜賊自己點選其中一張卡牌即可
// 選定——被點到的那張會放大、移到正中間，另一張淡出消失；接著出現「重新選」（回到兩張並列）
// 與「確定」（送出這次選擇）兩顆按鈕。若候選裡有狼人陣營角色，規則上必須選狼，這裡就直接把
// 另一張卡「灰階鎖住」不能點，並顯示提示文字，避免誤選。
let jgThiefBigCardPicked=null; // 目前這次大字報session裡，玩家點了哪一張候選（1或2），null＝都還沒點

function jgThiefShowBigCard(){
  const c1=jgRecord._thiefCand1, c2=jgRecord._thiefCand2;
  if(!c1||!c2){ alert('⚠️ 尚未決定兩個候選身分，無法顯示大字報。'); return; }
  jgThiefBigCardPicked=null;
  jgThiefRenderBigCard();
}

// 卡牌本身的 HTML（含 id，方便之後只更新 class/style 做動畫，不用整個重新渲染整份 innerHTML，
// 不然瀏覽器沒有「舊狀態→新狀態」可以動畫，直接就是最終結果，感覺不到過渡效果）。
function jgThiefCardBoxHtml(idx, roleId, disabled){
  const r=ALL_ROLES[roleId]||{icon:'🎴',name:jgFullRoleName(roleId)};
  return '<div id="jg-thiefcard-'+idx+'" class="jg-thief-card'+(disabled?' jtc-disabled':'')+'" '
    +(disabled?'':'onclick="jgThiefCardTap('+idx+')"')+'>'
    +'<div class="jg-tc-num">'+(idx===1?'①':'②')+'</div>'
    +'<div class="jg-tc-icon">'+r.icon+'</div>'
    +'<div class="jg-tc-name">'+r.name+'</div>'
    +'</div>';
}

function jgThiefRenderBigCard(){
  const c1=jgRecord._thiefCand1, c2=jgRecord._thiefCand2;
  let modal=document.getElementById('jg-bigcard-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='jg-bigcard-modal';
    modal.style.cssText='position:fixed;inset:0;background:#0a0a0a;color:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center;overflow-y:auto;';
    document.body.appendChild(modal);
  }
  const w1=WOLF_ROLES.includes(c1), w2=WOLF_ROLES.includes(c2);
  const forcedIdx=w1?1:(w2?2:0); // 若候選中有狼，強制只能選那一張
  modal.innerHTML='<div class="jg-thief-cards-wrap">'
    +jgThiefCardBoxHtml(1,c1,forcedIdx===2)
    +jgThiefCardBoxHtml(2,c2,forcedIdx===1)
    +'</div>'
    +'<div id="jg-thief-bigcard-bottom" class="jg-thief-bigcard-bottom"></div>';
  jgThiefBigCardSync(forcedIdx);
}

// 把目前的「選定狀態」套用到已經存在的卡牌 DOM 上（只改 class，不整個重繪，動畫才會生效），
// 並更新下方的提示文字／按鈕。
function jgThiefBigCardSync(forcedIdx){
  const c1=jgRecord._thiefCand1, c2=jgRecord._thiefCand2;
  const picked=jgThiefBigCardPicked;
  [1,2].forEach(idx=>{
    const el=document.getElementById('jg-thiefcard-'+idx);
    if(!el) return;
    el.classList.remove('picked','faded');
    if(picked===idx) el.classList.add('picked');
    else if(picked) el.classList.add('faded');
  });
  const bottom=document.getElementById('jg-thief-bigcard-bottom');
  if(!bottom) return;
  if(picked){
    const roleId=picked===1?c1:c2;
    const r=ALL_ROLES[roleId]||{icon:'🎴',name:jgFullRoleName(roleId)};
    bottom.innerHTML='<div class="jtc-picked-label">已選定：'+r.name+'</div>'
      +'<div class="jtc-btn-row">'
      +'<button onclick="jgThiefCardReset()">🔄 重新選</button>'
      +'<button class="primary" onclick="jgThiefCardConfirm(\''+roleId+'\')">✅ 確定</button>'
      +'</div>';
  } else if(forcedIdx){
    bottom.innerHTML='<div class="jtc-forced-warn">⚠️ 候選中有狼人陣營，必須選擇狼人</div>';
  } else {
    bottom.innerHTML='';
  }
}

function jgThiefCardTap(idx){
  jgThiefBigCardPicked=idx;
  const c1=jgRecord._thiefCand1, c2=jgRecord._thiefCand2;
  const forcedIdx=WOLF_ROLES.includes(c1)?1:(WOLF_ROLES.includes(c2)?2:0);
  jgThiefBigCardSync(forcedIdx);
}
function jgThiefCardReset(){
  jgThiefBigCardPicked=null;
  const c1=jgRecord._thiefCand1, c2=jgRecord._thiefCand2;
  const forcedIdx=WOLF_ROLES.includes(c1)?1:(WOLF_ROLES.includes(c2)?2:0);
  jgThiefBigCardSync(forcedIdx);
}
// 按下「確定」：關掉大字報，直接沿用跟法官端按鈕相同的 jgSaveThief() 邏輯送出最終選擇
// （前提是盜賊的號碼已經在畫面上填好，這點跟原本法官自己點按鈕的流程一致，沒有改變）。
function jgThiefCardConfirm(roleId){
  const modal=document.getElementById('jg-bigcard-modal');
  if(modal) modal.remove();
  jgSaveThief(roleId);
}

// 產生候選身分下拉選單的選項（依陣營分組），排除「盜賊」自己（不會選到自己）。
function jgThiefRoleOptionsHtml(selectedVal){
  // 只列出「這場板子實際有選的角色」（jgComp 裡數量 >0 的），不然像圖片回報的那樣，
  // 選單裡會出現整套系統支援的所有角色（包含這場根本沒選的），法官可能誤加成本場沒有
  // 的身分。已經選定、正要顯示在選單裡的值（selectedVal）例外保留，避免切換模式時突然消失。
  const inComp=r=>(jgComp[r]||0)>0||r===selectedVal;
  const groups=[
    {label:'狼人陣營', roles:WOLF_ROLES.filter(inComp)},
    {label:'神職', roles:GOD_ROLES.filter(inComp)},
    {label:'特殊身分', roles:SPECIAL_ROLES.filter(r=>r!=='thief').filter(inComp)},
    {label:'平民陣營', roles:['villager'].filter(inComp)},
  ];
  let html='<option value="">請選擇…</option>';
  groups.forEach(g=>{
    const opts=g.roles.filter(r=>ALL_ROLES[r]).map(r=>`<option value="${r}"${selectedVal===r?' selected':''}>${ALL_ROLES[r].name}</option>`).join('');
    if(opts) html+=`<optgroup label="${g.label}">${opts}</optgroup>`;
  });
  return html;
}

// 候選下拉選單變動時（手動模式），或畫面剛渲染完（轉盤模式，候選已經固定），重新計算
// 「是否強制選狼」，並畫出讓法官點選盜賊最終選了哪一張的按鈕。
function jgThiefUpdateChoiceUI(){
  const area=document.getElementById('jg-thief-choice-area');
  if(!area) return;
  const el1=document.getElementById('jg-thief-cand1');
  const el2=document.getElementById('jg-thief-cand2');
  // 手動模式下畫面上有下拉選單，讀取當下選的值；轉盤模式沒有下拉選單，候選已經由
  // 渲染畫面時直接寫進 jgRecord._thiefCand1／2，這裡就沿用那個值即可。
  const v1=el1?(el1.value||''):(jgRecord._thiefCand1||'');
  const v2=el2?(el2.value||''):(jgRecord._thiefCand2||'');
  jgRecord._thiefCand1=v1;
  jgRecord._thiefCand2=v2;
  if(!v1||!v2){ area.innerHTML=''; return; }
  if(v1===v2){
    area.innerHTML='<div class="info-danger">⚠️ 兩個候選身分不能相同，請重新選擇。</div>';
    return;
  }
  const w1=WOLF_ROLES.includes(v1), w2=WOLF_ROLES.includes(v2);
  if(w1&&w2){
    area.innerHTML='<div class="info-danger">⚠️ 兩張候選都是狼人陣營，正常設置下不會發生這種情況，請重新確認實際準備的牌。</div>';
    return;
  }
  if(w1||w2){
    const forcedRole=w1?v1:v2;
    area.innerHTML='<div class="info-danger" style="margin-bottom:8px;">⚠️ 候選中有狼人陣營角色，盜賊必須選擇「'+ALL_ROLES[forcedRole].name+'」。</div>'
      +'<button class="primary" onclick="jgSaveThief(\''+forcedRole+'\')">確認盜賊選了「'+ALL_ROLES[forcedRole].name+'」（強制）→</button>';
    return;
  }
  area.innerHTML='<div style="display:flex;gap:10px;">'
    +'<button class="primary" style="flex:1;" onclick="jgSaveThief(\''+v1+'\')">盜賊選了「'+ALL_ROLES[v1].name+'」</button>'
    +'<button class="primary" style="flex:1;" onclick="jgSaveThief(\''+v2+'\')">盜賊選了「'+ALL_ROLES[v2].name+'」</button>'
    +'</div>';
}

// 盜賊正式選定 chosenRole：把盜賊玩家的身分直接改成 chosenRole。這個身分原本就已經算在
// jgComp（n+2 張候選卡池）的數量裡了，所以不需要、也不能再把 jgComp[chosenRole] 加 1，
// 否則會讓全場該身分的總數比板子設定的多一個（例如板子設 3 狼，盜賊被迫變狼後卻變成
// 4 狼）。另一張候選則記為「被埋掉」的身分，整局都不會有人是這個身分。
function jgSaveThief(chosenRole){
  if(!jgSaveGodId('thief')) return;
  const tfP=jgPlayers.find(p=>p.role==='thief');
  if(!tfP){
    alert('⚠️ 請先選擇盜賊的號碼，再繼續下一步！');
    return;
  }
  const v1=jgRecord._thiefCand1, v2=jgRecord._thiefCand2;
  const buried=(chosenRole===v1)?v2:v1;
  const existingHolder=jgPlayers.find(p=>p.role===chosenRole&&p.num!==tfP.num);
  if(existingHolder){
    const ok=confirm('⚠️ '+existingHolder.num+'號目前已經是「'+ALL_ROLES[chosenRole].name+'」，選擇後盜賊會跟他變成一樣的身分（重複），正常設置下不該發生。確定要繼續嗎？');
    if(!ok) return;
  }
  tfP.role=chosenRole;
  // 注意：這裡「不」把 jgComp[chosenRole] 加 1。盜賊選中的這個身分本來就已經算在
  // 原本的板子配置（n+2 張候選卡池）裡面了（例如板子選了 3 隻狼，這 3 隻狼裡就已經
  // 包含了「可能被抽去當盜賊候選、最後由盜賊變成狼」這一張），所以盜賊變狼之後，
  // 全場實際的狼人總數還是原本設定的數字，不會因為盜賊變狼而多一隻出來
  // （例如板子設定 3 狼，盜賊被迫變狼後，全場依然只有 3 隻狼，狼人睜眼時也只會列出
  // 3 個狼人身分的號碼欄位，不會變成 4 個）。
  jgThiefFinalNum=tfP.num;
  jgThiefFinalRole=chosenRole;
  jgThiefBuriedRole=buried;
  jgThiefChosen=true;
  jgRecord._thiefCand1=null;
  jgRecord._thiefCand2=null;
  jgRenderRoster();
  jgGoStep('thief-reveal');
}

// 邱比特：整局唯一一次行動，第一夜最先睜眼，指定兩名玩家（可包含自己）成為情侶。
// 指定完成後接著走 'lovers-wake'，讓這兩位情侶睜眼互相確認彼此身份，之後才照正常順序
// （夢魘→…）繼續走這一夜剩下的流程。
function jgSaveCupid(){
  if(!jgSaveGodId('cupid')) return;
  const v1=(document.getElementById('jg-cupid-target1')||{}).value?.trim()||'';
  const v2=(document.getElementById('jg-cupid-target2')||{}).value?.trim()||'';
  if(!v1||!v2){
    alert('⚠️ 請選擇兩位玩家作為情侶（可以包含邱比特自己）！');
    return;
  }
  if(v1===v2){
    alert('⚠️ 請選擇兩位「不同」的玩家作為情侶！');
    return;
  }
  jgLovers=[v1,v2];
  jgCupidChosen=true;
  jgGoStep('lovers-wake');
}

// 情侶配對後的第二步：兩位情侶（不含邱比特）一起睜眼，互相確認對方是誰——但不知道誰是
// 邱比特、也不知道對方的陣營（好人／狼人）。這只是一句口白提示，法官按下一步後即回到
// 正常的夜晚睜眼順序（jgNightStartNext 這次會因為 jgCupidChosen 已是 true 而跳過邱比特）。
function jgSaveLoversWake(){
  jgGoStep(jgNightStartNext());
}

// 兩名情侶目前分別是「人」還是「狼」陣營，用來判斷這對情侶＋邱比特要如何影響勝負：
// 'good'＝人人鏈（都不是狼）、'wolf'＝狼狼鏈（都是狼）、'third'＝人狼鏈（一人一狼，獨立第三方）。
// 情侶其中一人已找不到玩家資料（理論上不該發生）時回傳 null，視同沒有配對。
function jgSaveWolfBrotherIntro(){
  if(!jgRequireFirstId('jg-wbe-who','狼兄')) return;
  if(!jgRequireFirstId('jg-wby-who','狼弟')) return;
  const eNum=parseInt((document.getElementById('jg-wbe-who')||{}).value||'0');
  const eName=(document.getElementById('jg-wbe-name')||{}).value?.trim()||'';
  const yNum=parseInt((document.getElementById('jg-wby-who')||{}).value||'0');
  const yName=(document.getElementById('jg-wby-name')||{}).value?.trim()||'';
  if(eNum){
    if(!jgConflictCheck(eNum,'wolfbrother_e')) return;
    jgPlayers.forEach(p=>{ if(p.role==='wolfbrother_e') p.role=null; });
    const p=jgByNum(eNum); if(p){p.role='wolfbrother_e';if(eName)p.name=eName;}
  }
  if(yNum){
    if(!jgConflictCheck(yNum,'wolfbrother_y')) return;
    jgPlayers.forEach(p=>{ if(p.role==='wolfbrother_y') p.role=null; });
    const p=jgByNum(yNum); if(p){p.role='wolfbrother_y';if(yName)p.name=yName;}
  }
  jgWolfBrotherIdDone=true;
  jgRenderRoster();
  jgGoStep(jgAfterWolfBrotherStep());
}

function jgSaveWolfBrotherAwaken(){
  const val=(document.getElementById('jg-wby-awaken-rec')||{}).value?.trim()||'';
  if(!val){
    alert('⚠️ 狼弟覺醒刀必須殺一人，不可空刀，請輸入號碼！');
    return;
  }
  jgRecord.wolfBrotherAwakenKill=val;
  jgWolfBrotherAwakened=true;
  jgWolfBrotherAwakenedNight=jgNight;
  // 覺醒當晚若其餘狼隊成員已全滅，畫面上會多一個「帶刀殺人對象」的欄位（跟復仇刀分開算，
  // 今晚可以兩刀都出）；這裡一併存起來，跟一般「帶刀」的存法共用同一套欄位，讓稍後的
  // 「狼人睜眼」畫面自動帶出、鎖定這個選擇（見 jgSaveWolfBrotherKillGesture 的說明）。
  const packKillEl=document.getElementById('jg-wby-pack-kill');
  if(packKillEl){
    const pkv=(packKillEl.value||'').trim();
    jgRecord.wolfBrotherKillTarget=pkv||null;
    if(pkv) jgRecord.wolfKill=pkv;
  }
  if(jgTryEarlyEnd()) return;
  jgGoStep(jgAfterWolfBrotherStep());
}

// 狼弟已加入狼窩、其餘狼隊成員全滅時的「帶刀」手勢：帶的就是原本狼人睜眼要選的正常狼刀，
// 只是提前換狼弟自己選。法官可以直接在這一步替狼弟選殺人對象，也可以留空、把選人留到
// 晚一點的「狼人睜眼」步驟再做——這裡一併存進 jgRecord.wolfKill，讓後續死亡結算沿用
// 同一套邏輯；狼人睜眼步驟看到 jgRecord.wolfKill 已經有值時，號碼格會直接預先選好、
// 顯示成綠色（法官仍可以改選，只是不用重選一次）。
function jgSaveWolfBrotherKillGesture(){
  const kv=(document.getElementById('jg-wby-kill')||{}).value?.trim()||'';
  jgRecord.wolfBrotherKillTarget=kv||null;
  if(kv) jgRecord.wolfKill=kv;
  jgRenderRoster();
  if(jgTryEarlyEnd()) return;
  jgGoStep(jgAfterWolfBrotherStep());
}


function jgSaveWolfBeautyNight(){
  const isFirst=jgNight===1;
  if(isFirst){
    if(!jgRequireFirstId('jg-wolfbeauty-who','狼美人')) return;
    const whoNum=parseInt((document.getElementById('jg-wolfbeauty-who')||{}).value||'0');
    const name=(document.getElementById('jg-wolfbeauty-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'wolfbeauty')) return;
      jgPlayers.forEach(p=>{ if(p.role==='wolfbeauty') p.role=null; });
      const p=jgByNum(whoNum); if(p){p.role='wolfbeauty';if(name)p.name=name;}
    }
    jgRenderRoster();
  }
  const wbPfinal=jgPlayers.find(p=>p.role==='wolfbeauty');
  const wbDead=wbPfinal&&!wbPfinal.alive;
  const wbFeared=jgFeared(wbPfinal);
  const newCharm=wbFeared?null:((document.getElementById('jg-wolfbeauty-charm')||{}).value?.trim()||null);
  if(!wbDead&&!wbFeared){
    if(!newCharm){
      alert('⚠️ 狼美人每晚必須魅惑一人，請選擇號碼！');
      return;
    }
    if(wbPfinal&&newCharm===wbPfinal.num.toString()){
      alert('⚠️ 狼美人不能魅惑自己，請重新選擇！');
      return;
    }
  }
  if(newCharm&&jgLastWolfBeautyCharm&&newCharm===jgLastWolfBeautyCharm.toString()){
    alert('⚠️ 狼美人不能連續兩晚魅惑同一人！');return;
  }
  jgLastWolfBeautyCharm=newCharm||null;
  jgRecord.wolfbeautyCharm=newCharm;
  jgGoStep(jgNextAfterSubWolf('wolfbeauty-wake'));
}

function jgSaveSubWolf(stepId){
  // Generic save for whitewolf and evilknight (first-night ID only)
  const roleMap={'whitewolf-wake':'whitewolf','evilknight-wake':'evilknight'};
  const roleId=roleMap[stepId];
  const isFirst=jgNight===1;
  if(isFirst&&roleId){
    const sfx=roleId.replace('wolf','').replace('knight','');
    const prefix=roleId==='whitewolf'?'whitewolf':roleId==='evilknight'?'evilknight':roleId;
    const roleLabel={whitewolf:'白狼王',evilknight:'惡靈騎士'}[roleId]||roleId;
    if(!jgRequireFirstId('jg-'+prefix+'-who', roleLabel)) return;
    const whoNum=parseInt((document.getElementById('jg-'+prefix+'-who')||{}).value||'0');
    const name=(document.getElementById('jg-'+prefix+'-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,roleId)) return;
      jgPlayers.forEach(p=>{ if(p.role===roleId) p.role=null; });
      const p=jgByNum(whoNum); if(p){p.role=roleId;if(name)p.name=name;}
    }
    jgRenderRoster();
  }
  jgGoStep(jgNextAfterSubWolf(stepId));
}

// ── 假面舞會板：舞者／假面 ──
// 點按舞池候選人號碼：多或少都不行，正好3人才能送出——已滿3人時，再點沒被選過的號碼不會加進去
// （要先取消一個才能換人），點已選的號碼則直接取消勾選。
function jgToggleDancerPool(n){
  const picked=jgRecord.dancerPoolPick||(jgRecord.dancerPoolPick=[]);
  const i=picked.indexOf(n);
  if(i>=0){ picked.splice(i,1); }
  else { if(picked.length>=3) return; picked.push(n); }
  jgRenderStep(jgCurrentStep);
}
// ── 大野狼+小女孩板：小女孩 ──
// 小女孩每晚都跟狼人一起睜眼參與討論，但她自己的身分記錄（號碼）獨立在這個步驟完成，
// 不影響「狼人（大野狼）+小女孩」那個共用畫面的殺人流程。
function jgSaveLittlegirl(){
  if(!jgSaveGodId('littlegirl')) return;
  jgGoStep(jgAfterLittlegirlStep());
}
// ── 大野狼+小女孩板：大野狼 ──
// 「四隻狼是否全部存活」不排除大野狼自己——board設計上就是「狼人×3＋大野狼＝四隻狼」，
// 只要其中任何一隻死了，這個額外技能就整個失效，不能發動。這一刀是跟主要狼刀「分開」的
// 額外一刀，兩個目標可能不同，天亮結算時分開處理（見 steps.js 的 dawn 區塊）。
function jgSaveBigBadWolf(){
  const bbP=jgPlayers.find(p=>p.role==='bigbadwolf');
  jgRecord.bigbadwolfBonusKillTarget=null;
  if(bbP&&bbP.alive){
    const allFourAlive=jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)).every(p=>p.alive);
    if(allFourAlive){
      const kv=(document.getElementById('jg-bigbadwolf-kill')||{}).value?.trim()||'';
      if(kv){ jgRecord.bigbadwolfBonusKillTarget=jgMagicSwapNum(kv); }
    }
  }
  jgGoStep(jgAfterBigBadWolfStep());
}
function jgAfterBigBadWolfStep(){
  return jgPurewhitemaidenPending()?'purewhitemaiden-wake':'seer-wake';
}
// ── 雙機械狼板：大／小機械狼共用的存檔函式（用 roleId 參數分辨是哪一隻） ──
function jgSaveMechWolf2(roleId){
  if(!jgSaveGodId(roleId)) return;
  const st=jgMechWolf2State[roleId];
  const selfP=jgPlayers.find(p=>p.role===roleId);
  if(jgFeared(selfP)||(roleId==='smallmechwolf'&&st.rejoinedPack)){
    jgGoStep(jgMechWolf2NextStep(roleId));
    return;
  }
  if(selfP&&selfP.alive){
    // 重選只能從第二晚開始（跟畫面渲染那邊的判斷一致，見 jgRenderMechWolf2Step 的註解）。
    const isLearnedOtherMech=st.learned==='bigmechwolf'||st.learned==='smallmechwolf';
    const canRepick=!st.learned||(isLearnedOtherMech&&jgNight>st.learnedNight);
    if(canRepick){
      const lv=(document.getElementById('jg-'+roleId+'-learn')||{}).value?.trim()||'';
      if(lv){
        const t=jgFind(lv);
        if(t){ st.learned=t.role||'villager'; st.learnedNight=jgNight; st.learnTargetNum=t.num; }
      }
    } else if(jgNight>st.learnedNight){
      // 已經學到明確身分、且過了學到的那一晚（技能才會生效）：處理女巫毒藥／守衛保護的
      // 使用（各自整局限一次、成功擋下一次傷害後守衛技能就報銷，判定留到天亮結算）。
      if(st.learned==='witch'&&!st.poisonUsed){
        const pv=(document.getElementById('jg-'+roleId+'-poison')||{}).value?.trim()||'';
        if(pv){
          jgRecord['mechwolf2Poison_'+roleId]=jgMagicSwapNum(pv);
          st.poisonUsed=true;
        }
      }
      if(st.learned==='guard'&&!st.guardUsed){
        const gv=(document.getElementById('jg-'+roleId+'-guard')||{}).value?.trim()||'';
        if(gv&&st.lastGuardTarget&&gv===st.lastGuardTarget.toString()){
          alert('⚠️ 不能連續兩晚守護同一人，請重新選擇！');
          return;
        }
        if(gv){
          st.lastGuardTarget=gv;
          jgRecord['mechwolf2Guard_'+roleId]=gv;
        }
      }
    }
    const eligible=jgNight>=2&&jgMechWolf2KillEligible(roleId);
    if(eligible){
      const isFirstKillNight=st.killTurnFirstNight===null;
      if(isFirstKillNight) st.killTurnFirstNight=jgNight;
      const doubleKill=isFirstKillNight&&st.learned==='wolf';
      const k1=(document.getElementById('jg-'+roleId+'-kill1')||{}).value?.trim()||'';
      jgRecord['mechwolf2Kill_'+roleId+'_1']=k1?jgMagicSwapNum(k1):null;
      if(doubleKill){
        const k2=(document.getElementById('jg-'+roleId+'-kill2')||{}).value?.trim()||'';
        jgRecord['mechwolf2Kill_'+roleId+'_2']=k2?jgMagicSwapNum(k2):null;
      } else {
        jgRecord['mechwolf2Kill_'+roleId+'_2']=null;
      }
    }
  }
  // 規則8：兩隻機械狼都學到狼人 -> 小機械狼「下一晚」直接回歸主狼群（不用等輪到自己），
  // 回歸當晚狼隊刀無敵（可破守衛的盾，見 jgAfterGargoyleStep 的觸發點跟 dawn 結算）。
  const bigSt=jgMechWolf2State.bigmechwolf, smallSt=jgMechWolf2State.smallmechwolf;
  if(bigSt.learned==='wolf'&&smallSt.learned==='wolf'&&!smallSt.rejoinedPack&&!smallSt._pendingRejoinNight){
    smallSt._pendingRejoinNight=jgNight+1;
  }
  jgRenderRoster();
  jgGoStep(jgMechWolf2NextStep(roleId));
}
function jgMechWolf2NextStep(roleId){
  return roleId==='bigmechwolf'?jgAfterBigMechWolfStep():jgAfterSmallMechWolfStep();
}
// 雙機械狼板：學習對象查看即時結果 + 大字報，跟單一機械狼共用同一套做法（見 jgMechWolfLearnCheck）。
// jgNumGridPick 會把「欄位id、選到的值」當參數傳進來，這裡直接從 id 判斷是大機還是小機，
// 不用另外包兩個同名不同 roleId 的 wrapper 函式。
// 雙機械狼板：把角色代碼轉成「查驗/大字報用」的顯示身分——目標剛好是另一隻機械狼時，
// 一律顯示成通用「機械狼」，不指名是大是小。這裡不能直接呼叫 jgCheckDisplayRole，因為
// 那個函式的語意是「這個角色被查驗時要顯示成什麼」，用在機械狼身上會變成「顯示牠自己
// 學到的技能」，跟這裡要的「這個目標本身是不是機械狼」語意不同。
function jgMechWolf2RawRoleDisplay(role){
  return (role==='bigmechwolf'||role==='smallmechwolf')?'mechanicalwolf':(role||'villager');
}
// 直接吃玩家號碼顯示大字報（學習選人當下、還沒存檔完成前的即時查看用）
function jgMechWolf2ShowBigCardRaw(num){
  const t=jgFind(num);
  if(!t){ jgShowBigCard('找不到玩家'); return; }
  jgShowBigCard(t.num+'號', jgFullRoleName(jgMechWolf2RawRoleDisplay(t.role)));
}
// 雙機械狼板：學到通靈師之後，每晚查驗一名玩家——跟單一機械狼的 jgMechWolfMediumCheckLive
// 做法一致，一樣用 (id,val) 判斷是大機還是小機。
function jgMechWolf2MediumCheckLive(id, val){
  const roleId=id.includes('smallmechwolf')?'smallmechwolf':'bigmechwolf';
  const box=document.getElementById('jg-'+roleId+'-medium-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const label=jgFullRoleName(jgCheckDisplayRole(found.role||'villager'));
  const mwLabel=roleId==='bigmechwolf'?'大機械狼':'小機械狼';
  box.innerHTML='<div class="info-success" style="font-size:16px;font-weight:800;text-align:center;padding:10px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgMechWolf2ShowBigCardRaw('+found.num+')" style="margin-top:6px;width:100%;">📋 大字報顯示給'+mwLabel+'看</button>';
}
// 雙機械狼板：已經學到明確身分（不是另一台機械狼）、且過了學到的那一晚，可以使用技能——
// 跟單一機械狼的 jgMechWolfSkillUseHtml 是同一套邏輯，只是要照 roleId 分開讀寫欄位／狀態。
function jgMechWolf2SkillUseHtml(roleId){
  const st=jgMechWolf2State[roleId];
  const learned=st.learned;
  if(learned==='medium'){
    const cv=jgRecord['mechwolf2Check_'+roleId]||'';
    return '<label>查驗對象號碼</label>'
      +jgNumSelectHtml('jg-'+roleId+'-medium-check', cv, 'jgMechWolf2MediumCheckLive')
      +'<div id="jg-'+roleId+'-medium-result"></div>';
  }
  if(learned==='witch'){
    if(st.poisonUsed) return '<div class="info" style="font-size:12px;">（法官搖頭）技能已使用完畢。</div>';
    return '<label>今晚要毒的對象號碼（整局限一次，留空=不毒）</label>'+jgNumSelectHtml('jg-'+roleId+'-poison', '');
  }
  if(learned==='guard'){
    if(st.guardUsed) return '<div class="info" style="font-size:12px;">（法官搖頭）技能已使用完畢。</div>';
    const guardExclude=st.lastGuardTarget?[parseInt(st.lastGuardTarget)]:[];
    return '<label>今晚要守護的對象（不能連續兩晚守同一人，留空=空守）</label>'
      +jgNumSelectHtml('jg-'+roleId+'-guard', '', null, null, guardExclude, '不能連續兩晚守護同一人');
  }
  return '<div class="info" style="font-size:12px;">已學得「'+jgFullRoleName(learned)+'」，此技能請法官依角色規則自行主持（若無主動夜間技能可略過）</div>';
}
function jgMechWolf2LearnCheck(id, val){
  const roleId=id.includes('smallmechwolf')?'smallmechwolf':'bigmechwolf';
  const box=document.getElementById('jg-'+roleId+'-learn-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const label=jgFullRoleName(jgMechWolf2RawRoleDisplay(found.role));
  const mwLabel=roleId==='bigmechwolf'?'大機械狼':'小機械狼';
  box.innerHTML='<div class="info-success" style="font-size:16px;font-weight:800;text-align:center;padding:10px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgMechWolf2ShowBigCardRaw('+found.num+')" style="margin-top:6px;width:100%;">📋 大字報顯示給'+mwLabel+'看</button>';
}
function jgSaveDancer(){
  if(!jgSaveGodId('dancer')) return;
  const dnP=jgPlayers.find(p=>p.role==='dancer');
  jgRecord.dancerPool=null;
  jgRecord.dancerSelfIn=false;
  if(jgNight>=2 && dnP && dnP.alive){
    const eligible=jgPlayers.filter(p=>p.alive&&!jgDancerEverDanced.has(p.num)).map(p=>p.num);
    if(eligible.length>=3){
      const picked=jgRecord.dancerPoolPick||[];
      if(picked.length!==3){ alert('⚠️ 請點選滿3位玩家才能繼續！'); return; }
      const set=new Set(picked);
      for(const v of set){
        if(!eligible.includes(v)){ alert('⚠️ '+v+'號 不符合共舞資格（已死亡或已經共舞過），請重新選擇！'); return; }
      }
      jgRecord.dancerPool=[...set];
      jgRecord.dancerSelfIn=set.has(dnP.num);
      set.forEach(n=>jgDancerEverDanced.add(n));
    }
  }
  jgRecord.dancerPoolPick=[];
  jgGoStep(jgAfterDancerStep());
}
// 即時顯示「這個號碼今晚在不在舞池中」——假面睜眼時舞者已經選完池了，可以直接查
function jgMaskCheckLive(){
  const val=(document.getElementById('jg-mask-check')||{}).value?.trim()||'';
  const box=document.getElementById('jg-mask-check-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const inPool=!!(jgRecord.dancerPool&&jgRecord.dancerPool.map(String).includes(val.toString()));
  box.innerHTML='<div class="'+(inPool?'info-success':'info')+'" style="font-size:14px;padding:8px 12px;margin-top:4px;">'+val+'號 '+(inPool?'👍 比讚——在舞池中':'👎 比倒讚——不在舞池中')+'</div>';
}
function jgSaveMask(){
  if(!jgSaveGodId('mask')) return;
  const mkP=jgPlayers.find(p=>p.role==='mask');
  jgRecord.maskKillTarget=null;
  jgRecord.maskCheckTarget=null;
  jgRecord.maskGrantTarget=null;
  if(jgNight>=2 && mkP && mkP.alive){
    // 1) 帶刀：其餘正牌狼人（不含假面自己）全滅時才會顯示這個欄位，用法跟石像鬼的
    // 「隊友全滅後可以自己帶刀」完全一樣——直接覆蓋 jgRecord.wolfKill，照一般狼刀規則
    // 結算（可被守衛／女巫解藥阻擋）。這裡用 jgMaskCanKill(mkP)——跟假面陣營歸屬是分開的
    // 兩件事：陣營歸屬固定就是狼隊（見 jgIsWolfPackMember），這裡只判斷「其餘正牌狼是不是
    // 全滅、假面能不能開始自己動手殺人」。
    const allWolvesDead=jgMaskCanKill(mkP);
    if(allWolvesDead){
      const kv=(document.getElementById('jg-mask-kill')||{}).value?.trim()||'';
      jgRecord.maskKillTarget=kv||null;
      jgRecord.wolfKill=jgMagicSwapNum(kv||null);
    }
    // 2) 查驗是否在舞池：純資訊性，不能連續兩晚查同一人
    const cv=(document.getElementById('jg-mask-check')||{}).value?.trim()||'';
    if(cv){ jgRecord.maskCheckTarget=cv; jgLastMaskCheckTarget=cv; }
    // 3) 給予面具：改變該玩家「今晚」在舞池陣營判定中的陣營，不能連續兩晚給同一人
    const gv=(document.getElementById('jg-mask-grant')||{}).value?.trim()||'';
    if(gv){ jgRecord.maskGrantTarget=gv; jgLastMaskGrantTarget=gv; }
  }
  jgGoStep(jgAfterMaskStep());
}

function jgGargoyleCheck(){
  const val=(document.getElementById('jg-gargoyle-check')||{}).value?.trim()||'';
  const box=document.getElementById('jg-gargoyle-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const r=found.role||'villager';
  const safeVal=val.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  box.innerHTML='<div class="info-success" style="font-size:18px;font-weight:800;text-align:center;padding:14px;">'+found.num+'號 → '+jgFullRoleName(jgCheckDisplayRole(r))+'</div>'
    +'<button onclick="jgBigCardFor(\''+safeVal+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示給石像鬼看</button>';
}

function jgSaveGargoyleNight(){
  const isFirst=jgNight===1;
  if(isFirst){
    if(!jgRequireFirstId('jg-gargoyle-who','石像鬼')) return;
    const whoNum=parseInt((document.getElementById('jg-gargoyle-who')||{}).value||'0');
    const name=(document.getElementById('jg-gargoyle-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'gargoyle')) return;
      jgPlayers.forEach(p=>{ if(p.role==='gargoyle') p.role=null; });
      const p=jgByNum(whoNum); if(p){p.role='gargoyle';if(name)p.name=name;}
    }
    jgRenderRoster();
  }
  const ggPfinal=jgPlayers.find(p=>p.role==='gargoyle');
  const ggFeared=jgFeared(ggPfinal);
  jgRecord.gargoyleCheck=ggFeared?null:((document.getElementById('jg-gargoyle-check')||{}).value?.trim()||null);
  const allDead=jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)&&p.role!=='gargoyle'&&!p.alive).length===
    jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)&&p.role!=='gargoyle').length;
  if(allDead&&!ggFeared){
    const kv=(document.getElementById('jg-gargoyle-kill')||{}).value?.trim()||'';
    jgRecord.gargoyleKillTarget=kv||null;
    jgRecord.wolfKill=jgMagicSwapNum(kv||null);
  }
  jgGoStep(jgAfterGargoyleStep());
}

function jgSaveMechanicalWolf(){
  const isFirst=jgNight===1;
  if(isFirst&&!jgMechAssignDone){
    if(!jgRequireFirstId('jg-mechwolf-who','機械狼')) return;
    const whoNum=parseInt((document.getElementById('jg-mechwolf-who')||{}).value||'0');
    const name=(document.getElementById('jg-mechwolf-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'mechanicalwolf')) return;
      jgPlayers.forEach(p=>{ if(p.role==='mechanicalwolf') p.role=null; });
      const p=jgByNum(whoNum); if(p){p.role='mechanicalwolf';if(name)p.name=name;}
    }
    jgRenderRoster();
  }
  const mwPfinal=jgPlayers.find(p=>p.role==='mechanicalwolf');
  if(jgFeared(mwPfinal)){
    jgRecord.mechwolfLearnTarget=null;
    jgGoStep(jgAfterMechWolfStep());
    return;
  }
  const canUseSkill=!!jgMechWolfLearned&&jgMechWolfLearnedNight!==null&&jgNight>jgMechWolfLearnedNight;
  if(!jgMechWolfLearned){
    const lv=(document.getElementById('jg-mechwolf-learn')||{}).value?.trim()||'';
    jgRecord.mechwolfLearnTarget=lv||null;
    if(lv){
      const t=jgFind(lv);
      if(t){ jgMechWolfLearned=t.role||'villager'; jgMechWolfLearnedNight=jgNight; }
    }
  } else if(canUseSkill){
    if(jgMechWolfLearned==='witch'&&!jgMechWolfPoisonUsed){
      const pv=(document.getElementById('jg-mechwolf-poison')||{}).value?.trim()||'';
      jgRecord.mechWolfPoison=pv||null;
      if(pv) jgMechWolfPoisonUsed=true;
    } else if(jgMechWolfLearned==='guard'&&!jgMechWolfGuardUsed){
      const gv=(document.getElementById('jg-mechwolf-guard')||{}).value?.trim()||'';
      if(gv&&jgLastMechWolfGuardTarget&&gv===jgLastMechWolfGuardTarget.toString()){
        alert('⚠️ 機械守衛不能連續兩晚守同一人，請重新選擇！');
        return;
      }
      jgLastMechWolfGuardTarget=gv||null;
      jgRecord.mechWolfGuardTarget=gv||null;
    } else if(jgMechWolfLearned==='medium'){
      jgRecord.mechWolfMediumCheck=(document.getElementById('jg-mechwolf-medium-check')||{}).value?.trim()||null;
    } else if(jgMechWolfHasBonusKill()&&!jgMechWolfBonusKillUsed){
      const bv=(document.getElementById('jg-mechwolf-bonuskill')||{}).value?.trim()||'';
      jgRecord.mechWolfBonusKillTarget=bv||null;
      if(bv) jgMechWolfBonusKillUsed=true;
    }
  }
  // Kill gesture (night 2+, only when the rest of the wolf pack is already dead)
  if(jgNight>=2){
    const otherWolvesAlive=jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&p.role!=='mechanicalwolf'&&p.alive);
    if(!otherWolvesAlive){
      const kv=(document.getElementById('jg-mechwolf-kill')||{}).value?.trim()||'';
      jgRecord.mechWolfKillTarget=kv||null;
      jgRecord.wolfKill=kv||null;
    }
  }
  jgRenderRoster();
  if(jgTryEarlyEnd()) return;
  jgGoStep(jgAfterMechWolfStep());
}

// Where to go after the mechanical wolf's step: if it just took over the kill (pack-less
// night), the now-empty 狼人睜眼 step is skipped entirely and we jump to whatever comes
// after the wolf pack normally (狼美人／預言家...); otherwise proceed to 狼人睜眼 as usual.
function jgAfterMechWolfStep(){
  const otherWolvesAlive=jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&p.role!=='mechanicalwolf'&&p.alive);
  if(jgNight>=2&&!otherWolvesAlive){
    return jgNextWolfStep();
  }
  return 'wolf-wake';
}

// Feature: overwrite/conflict detection when assigning a first-night identity.
// If the target number already holds a DIFFERENT confirmed role, ask the judge whether
// to overwrite it, and if so, let the judge relocate the bumped identity to a new number.
// Returns true if it's OK to proceed with the assignment, false if the judge cancelled.
function jgMechWolfLearnCheck(){
  const val=(document.getElementById('jg-mechwolf-learn')||{}).value?.trim()||'';
  const box=document.getElementById('jg-mechwolf-learn-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const label=jgFullRoleName(found.role||'villager');
  const safeVal=val.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  box.innerHTML='<div class="info-success" style="font-size:16px;font-weight:800;text-align:center;padding:10px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgBigCardFor(\''+safeVal+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示給機械狼看</button>';
}

// Builds the "use skill" inputs shown on night 2+ once the mechanical wolf has learned
// a skill that is usable tonight. Only 通靈師／女巫／守衛 get dedicated inputs (per spec);
// any other learned role just gets a note since it has no equivalent active night skill here.
function jgMechWolfSkillUseHtml(){
  const learned=jgMechWolfLearned;
  if(learned==='medium'){
    const cv=jgRecord.mechWolfMediumCheck||'';
    return '<label>查驗對象號碼</label>'
      +jgNumSelectHtml('jg-mechwolf-medium-check', cv, 'jgMechWolfMediumCheckLive')
      +'<div id="jg-mechwolf-medium-result"></div>';
  }
  if(learned==='witch'){
    if(jgMechWolfPoisonUsed){
      return '<div class="info" style="font-size:12px;">（法官搖頭）技能已使用完畢。</div>';
    }
    const pv=jgRecord.mechWolfPoison||'';
    return '<label>今晚要毒的對象號碼（整局限一次，留空=不毒）</label>'
      +jgNumSelectHtml('jg-mechwolf-poison', pv);
  }
  if(learned==='guard'){
    if(jgMechWolfGuardUsed){
      return '<div class="info" style="font-size:12px;">（法官搖頭）技能已使用完畢。</div>';
    }
    const gv=jgRecord.mechWolfGuardTarget||'';
    return '<label>今晚要守護的對象（留空=空守）</label>'
      +jgNumSelectHtml('jg-mechwolf-guard', gv, 'jgMechWolfGuardCheckRepeat')+'<div id="jg-mechwolf-guard-repeat-warn"></div>';
  }
  if(learned==='wolf'||learned==='wolfking'){
    if(jgMechWolfBonusKillUsed){
      return '<div class="info" style="font-size:12px;">（法官搖頭）技能已使用完畢。</div>';
    }
    const kv=jgRecord.mechWolfBonusKillTarget||'';
    return '<label>今晚要殺的對象號碼（僅可使用一次，留空=本晚不使用）</label>'
      +jgNumSelectHtml('jg-mechwolf-bonuskill', kv);
  }
  if(learned==='hunter'){
    // 這個分支理論上不會被呼叫到了——機械狼睜眼畫面現在會直接用 jgBuildHunterStatusHtml
    // 顯示比讚／倒讚手勢，不再繞來這裡；留著只是保底防呆。
    return '<div class="info" style="font-size:12px;">已學得「獵人」，技能使用狀況（比讚／比倒讚）將直接顯示於本畫面。</div>';
  }
  return '<div class="info" style="font-size:12px;">已學得「'+jgFullRoleName(learned)+'」，此技能請法官依角色規則自行主持（若無主動夜間技能可略過）</div>';
}

// Live-check display for the mechanical wolf's learned 通靈師 (medium) skill — purely
// informational for the judge, same style as the real medium's check.
function jgMechWolf2MediumCheckLive(id, val){
  const roleId=id.includes('smallmechwolf')?'smallmechwolf':'bigmechwolf';
  const box=document.getElementById('jg-'+roleId+'-medium-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const label=jgFullRoleName(jgCheckDisplayRole(found.role||'villager'));
  const mwLabel=roleId==='bigmechwolf'?'大機械狼':'小機械狼';
  box.innerHTML='<div class="info-success" style="font-size:16px;font-weight:800;text-align:center;padding:10px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgBigCardFor(\''+val+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示給'+mwLabel+'看</button>';
}
// 雙機械狼板：學到技能之後、真正輪到可以使用那一晚（jgNight>learnedNight）要顯示的操作介面——
// 跟單一機械狼的 jgMechWolfSkillUseHtml 是同一套邏輯，只是要多帶 roleId 參數分辨是哪一隻。
// 獵人不會走到這裡（獵人是被動技能，見 jgRenderMechWolf2Step 直接用 jgBuildHunterStatusHtml）。
function jgMechWolf2SkillUseHtml(roleId){
  const st=jgMechWolf2State[roleId];
  const learned=st.learned;
  if(learned==='medium'){
    const cv=jgRecord['mechwolf2MediumCheck_'+roleId]||'';
    return '<label>查驗對象號碼</label>'
      +jgNumSelectHtml('jg-'+roleId+'-medium-check', cv, 'jgMechWolf2MediumCheckLive')
      +'<div id="jg-'+roleId+'-medium-result"></div>';
  }
  if(learned==='witch'){
    if(st.poisonUsed) return '<div class="info" style="font-size:12px;">（法官搖頭）技能已使用完畢。</div>';
    const pv=jgRecord['mechwolf2Poison_'+roleId]||'';
    return '<label>今晚要毒的對象號碼（整局限一次，留空=不毒）</label>'+jgNumSelectHtml('jg-'+roleId+'-poison', pv);
  }
  if(learned==='guard'){
    if(st.guardUsed) return '<div class="info" style="font-size:12px;">（法官搖頭）技能已使用完畢。</div>';
    const guardExclude=st.lastGuardTarget?[parseInt(st.lastGuardTarget)]:[];
    const gv=jgRecord['mechwolf2Guard_'+roleId]||'';
    return '<label>今晚要守護的對象（不能連續兩晚守同一人，留空=空守）</label>'
      +jgNumSelectHtml('jg-'+roleId+'-guard', gv, null, null, guardExclude, '不能連續兩晚守護同一人');
  }
  return '<div class="info" style="font-size:12px;">已學得「'+jgFullRoleName(learned)+'」，此技能請法官依角色規則自行主持（若無主動夜間技能可略過）</div>';
}
function jgMechWolfMediumCheckLive(){
  const val=(document.getElementById('jg-mechwolf-medium-check')||{}).value?.trim()||'';
  const box=document.getElementById('jg-mechwolf-medium-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const r=found.role||'villager';
  const label=jgFullRoleName(jgCheckDisplayRole(r));
  const safeVal=val.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  box.innerHTML='<div class="info-success" style="font-size:16px;font-weight:800;text-align:center;padding:10px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgBigCardFor(\''+safeVal+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示給機械狼看</button>';
}

// 狼巫／純白之女查驗真實身份的大字報顯示，跟通靈師（jgMediumCheck）同一套做法：
// 先在畫面上顯示查到的結果，再讓法官視需要點按鈕用大字報的方式呈現給查驗者本人看
// （保護隱私，不用直接口頭講出來讓其他人聽到）。
function jgWolfshamanCheckLive(){
  const val=(document.getElementById('jg-wolfshaman-target')||{}).value?.trim()||'';
  const box=document.getElementById('jg-wolfshaman-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const label=jgFullRoleName(jgCheckDisplayRole(found.role||'villager'));
  const safeVal=val.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  box.innerHTML='<div class="info-success" style="font-size:18px;font-weight:800;text-align:center;padding:14px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgBigCardFor(\''+safeVal+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示給狼巫看</button>';
}
function jgPurewhitemaidenCheckLive(){
  const val=(document.getElementById('jg-purewhitemaiden-target')||{}).value?.trim()||'';
  const box=document.getElementById('jg-purewhitemaiden-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const label=jgFullRoleName(jgCheckDisplayRole(found.role||'villager'));
  const safeVal=val.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  box.innerHTML='<div class="info-success" style="font-size:18px;font-weight:800;text-align:center;padding:14px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgBigCardFor(\''+safeVal+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示給純白之女看</button>';
}
function jgMediumCheck(){
  const val=(document.getElementById('jg-medium-check')||{}).value?.trim()||'';
  const box=document.getElementById('jg-medium-result');
  if(!box) return;
  if(!val){box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const r=found.role||'villager';
  const label=jgFullRoleName(jgCheckDisplayRole(r));
  const safeVal=val.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  box.innerHTML='<div class="info-success" style="font-size:18px;font-weight:800;text-align:center;padding:14px;">'+found.num+'號 → '+label+'</div>'
    +'<button onclick="jgBigCardFor(\''+safeVal+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示給通靈師看</button>';
}

function jgSaveMedium(){
  if(!jgSaveGodId('medium')) return;
  const mdPfinal=jgPlayers.find(p=>p.role==='medium');
  jgRecord.mediumCheck=jgFeared(mdPfinal)?null:((document.getElementById('jg-medium-check')||{}).value?.trim()||null);
  jgGoStep(jgNextGodStep('medium-wake'));
}

function jgSaveBlackMarket(){
  if(!jgSaveGodId('blackmarket')) return;
  const tv=(document.getElementById('jg-bm-target')||{}).value?.trim()||'';
  const skill=(document.getElementById('jg-bm-skill')||{}).value||'seer';
  jgRecord.blackmarketTarget=tv||null;
  jgRecord.blackmarketSkill=skill;
  if(tv){
    jgBlackMarketUsed=true;
    jgBlackMarketTradeNight=jgNight;
    const t=jgFind(tv);
    if(t){
      if(WOLF_ROLES.includes(t.role)){
        jgRecord.blackmarketFail=true;
        const bmP=jgPlayers.find(p=>p.role==='blackmarket');
        jgRecord._blackmarketDealerNum=bmP?bmP.num:null;
      } else {
        // 獵人獵槍是被動技能（被票出局／被刀時才觸發），拿到當下就要立刻生效，
        // 不能像查驗／毒藥那樣延後到下一晚才能用——否則交易當天若馬上被投票出局，
        // 幸運兒會因為 startNight 還沒到而無法開槍。查驗／毒藥則維持原本「下一晚才能用」的設計。
        jgLuckyOne={num:t.num, gift:skill, startNight:(skill==='hunter'?jgNight:jgNight+1), used:false};
        jgRecord.blackmarketSuccess=true;
      }
    }
  }
  if(tv){ jgGoStep('luckyone-walk'); return; }
  jgGoStep('witch-wake');
}

function jgSaveLuckyoneNight(){
  const ly=jgLuckyOne;
  if(ly&&(ly.gift==='seer'||ly.gift==='witch')){
    const lp=jgByNum(ly.num);
    const dead=lp&&!lp.alive;
    const feared=jgFeared(lp);
    if(!dead&&!feared&&!ly.used){
      if(ly.gift==='seer'){
        const v=(document.getElementById('jg-luckyone-seer-target')||{}).value?.trim()||'';
        jgRecord.luckyoneCheck=v||null;
        if(v) ly.used=true;
      } else {
        const v=(document.getElementById('jg-luckyone-poison')||{}).value?.trim()||'';
        jgRecord.luckyonePoison=v||null;
        if(v) ly.used=true;
      }
    }
  }
  jgGoStep('dawn');
}

function jgSeerAppearsWolf(p){
  if(!p) return false;
  if(p.role==='wolfbrother_y'&&!jgWolfBrotherAwakened) return false;
  return WOLF_ROLES.includes(p.role);
}

function jgUpdateLuckyoneSeerResult(){
  const val=(document.getElementById('jg-luckyone-seer-target')||{}).value?.trim()||'';
  const box=document.getElementById('jg-luckyone-seer-result');
  if(!val){if(box)box.innerHTML='';return;}
  const found=jgFind(val);
  if(!found){if(box)box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const isWolf=jgSeerAppearsWolf(found);
  const dn=found.name&&found.name!==found.num+'號'?found.name:'';
  if(box) box.innerHTML='<div class="'+(isWolf?'info-danger':'info-success')+'" style="font-size:18px;font-weight:800;text-align:center;padding:14px;">'+found.num+'號'+(dn?' '+dn:'')+' → '+(isWolf?'狼人 👎':'好人 👍')+'</div>';
}

function jgSaveWolf(){
  const isFirst=jgNight===1;
  const wolfIdFieldsPresent=!!document.getElementById('jg-wolf-who-0');
  if(isFirst&&!jgMechAssignDone&&wolfIdFieldsPresent){
    // 先檢查每個狼隊身分欄位是否都已選號碼，沒選完不能繼續下一步
    let i0=0;
    while(true){
      const whoEl=document.getElementById('jg-wolf-who-'+i0);
      if(!whoEl) break;
      const roleId0=whoEl.getAttribute('data-role')||'wolf';
      const RNAME_CHK={wolf:'狼人',wolfking:'黑狼王',whitewolf:'白狼王',wolfbeauty:'狼美人',evilknight:'惡靈騎士',bloodmoon:'血月使者',wolfshaman:'狼巫'};
      if(!jgRequireFirstId('jg-wolf-who-'+i0, RNAME_CHK[roleId0]||'狼人')) return;
      i0++;
    }
    if(!jgRequireFirstId('jg-gargoyle-who-wolf','石像鬼')) return;
    // Clear only the wolf-team roles assigned via this step (gargoyle/mechanicalwolf/nightmare/wolfbrother/假面
    // 都是在自己獨立的步驟裡記錄身分，不會出現在這個畫面的欄位裡，清除時要排除，不然假面剛在自己
    // 畫面記錄好的身分，會被這裡清空、卻沒有對應欄位能重新指定回去，導致假面的身分整個消失）
    WOLF_ROLES.filter(r=>r!=='gargoyle'&&r!=='mechanicalwolf'&&r!=='nightmare'&&r!=='wolfbrother_e'&&r!=='wolfbrother_y'&&r!=='mask').forEach(r=>jgPlayers.forEach(p=>{ if(p.role===r) p.role=null; }));
    // Iterate through all wolf-type inputs (they have data-role set in the HTML)
    let i=0;
    while(true){
      const whoEl=document.getElementById('jg-wolf-who-'+i);
      if(!whoEl) break;
      const whoNum=parseInt(whoEl.value||'0');
      const name=(document.getElementById('jg-wolf-name-'+i)||{}).value?.trim()||'';
      const roleId=whoEl.getAttribute('data-role')||'wolf';
      if(whoNum){
        if(!jgConflictCheck(whoNum,roleId)) return;
        const p=jgByNum(whoNum);
        if(p){p.role=roleId;if(name)p.name=name;}
      }
      i++;
    }
    // 石像鬼「不與狼隊見面」，身分已在 mech-assign 或自己的 gargoyle-wake 步驟記錄，
    // 不再跟狼人擠在同一個畫面裡（見上方 wolf-wake 的畫面已移除石像鬼欄位）。
    jgRenderRoster();
  }
  { const wolfKillRawVal=(document.getElementById('jg-wolf-rec')||{}).value?.trim()||null;
    jgRecord.wolfKillRaw=wolfKillRawVal;
    jgRecord.wolfKill=jgMagicSwapNum(wolfKillRawVal); }
  // 大野狼+小女孩板：狼隊指認小女孩的猜測號碼（只在第二夜起、板子有小女孩時才會有這個欄位）。
  // 猜對猜錯的實際判定跟死亡結算留到天亮處理（見 steps.js 的 dawn 區塊），這裡只負責記錄猜測值。
  { const identifyRawVal=(document.getElementById('jg-wolf-identify-rec')||{}).value?.trim()||null;
    jgRecord.wolfIdentifyGuessRaw=identifyRawVal;
    jgRecord.wolfIdentifyGuess=identifyRawVal?jgMagicSwapNum(identifyRawVal):null; }
  if(jgRecord.nightmareBlocksWolf) jgRecord.wolfKill=null;
  // Bloodmoon seal: skip all god steps this night
  if(jgRecord.bloodmoonSealNight){
    jgRecord.bloodmoonSealNight=false; // clear after use
    jgGoStep('dawn');
    return;
  }
  if(jgTryEarlyEnd()) return;
  jgGoStep(jgNextWolfStep());
}

function jgUpdateSeerResult(){
  const val=(document.getElementById('jg-seer-target-input')||{}).value?.trim()||'';
  const box=document.getElementById('jg-seer-result-box');
  if(!val){if(box)box.innerHTML='';return;}
  const actualVal=jgMagicSwapNum(val);
  const found=jgFind(actualVal);
  if(!found){if(box)box.innerHTML='<div class="info-warn">找不到此號碼</div>';return;}
  const isWolf=jgSeerAppearsWolf(found);
  const dn=found.name&&found.name!==found.num+'號'?found.name:'';
  const swapNote=actualVal!==val?'<div style="font-size:11px;color:var(--text2);margin-top:4px;">（魔術師換牌，實際查驗 '+found.num+'號，法官心裡有數即可，不用告知玩家原因）</div>':'';
  if(box) box.innerHTML='<div class="'+(isWolf?'info-danger':'info-success')+'" style="font-size:20px;font-weight:800;text-align:center;padding:18px;">'+found.num+'號'+(dn?' '+dn:'')+' → '+(isWolf?'狼人 👎':'好人 👍')+'</div>'+swapNote;
}

function jgSaveSeer(){
  const isFirst=jgNight===1;
  if(isFirst){
    if(!jgRequireFirstId('jg-seer-who','預言家')) return;
    const whoNum=parseInt((document.getElementById('jg-seer-who')||{}).value||'0');
    const name=(document.getElementById('jg-seer-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'seer')) return;
      jgPlayers.forEach(p=>{ if(p.role==='seer') p.role=null; });
      const p=jgByNum(whoNum);
      if(p){p.role='seer';if(name)p.name=name;}
    }
    jgRenderRoster();
  }
  const seerPfinal=jgPlayers.find(p=>p.role==='seer');
  { const seerRawVal=(document.getElementById('jg-seer-target-input')||{}).value?.trim()||null;
    jgRecord.seerCheckedRaw=jgFeared(seerPfinal)?null:seerRawVal;
    jgRecord.seerChecked=jgFeared(seerPfinal)?null:jgMagicSwapNum(seerRawVal); }
  if(jgRecord.seerChecked){
    const t=jgFind(jgRecord.seerChecked);
    if(t&&t.role==='evilknight'&&t.alive&&!jgEvilKnightRevengeUsed){
      jgRecord.evilknightRevengeSeer=true;
      jgEvilKnightRevengeUsed=true; // 整局限一次，且女巫先於預言家發動，這裡先標記可確保「先發動者為主」
    }
  }
  jgGoStep(jgNextGodStep(null));
}

// Called when witch save dropdown changes — lock poison if saved
function jgWitchSaveChange(){
  const sel=document.getElementById('jg-witch-save-sel');
  const pw=document.getElementById('jg-witch-poison-wrap');
  const ps=document.getElementById('jg-poison-speech');
  if(!sel||!pw) return;
  if(sel.value==='yes'){
    pw.innerHTML=`<div class="speech" style="margin-top:10px;"><em>「你要使用毒藥嗎？你要毒誰呢？」</em><br>（一邊說一邊搖頭——救了就不能毒）</div>
      <div class="info" style="color:var(--text2);font-size:13px;">已使用解藥，本晚不能同時使用毒藥</div>`;
  } else {
    pw.innerHTML=`<div class="speech" style="margin-top:10px;" id="jg-poison-speech">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」<br>（比讚=不毒，比倒讚=要毒）</div>
      <label>毒殺的對象（留空=不毒）</label>
      <input type="text" id="jg-witch-poison-rec" placeholder="留空=不使用"/>`;
  }
}

// Returns first pending sub-wolf step, or 'witch-wake'
function jgNextWolfStep(){
  if(jgNight===1){
    if(jgComp.wolfbeauty>0||jgThiefBuriedActiveTonight('wolfbeauty')) return 'wolfbeauty-wake';
  } else {
    if(jgHasRoleAny(['wolfbeauty'])||jgThiefBuriedActiveTonight('wolfbeauty')) return 'wolfbeauty-wake';
  }
  return jgPostWolfStep();
}
function jgThiefBuriedActiveTonight(roleId){
  if(!jgThiefChosen||jgThiefBuriedRole!==roleId) return false;
  const nightOneOnly=['cupid','hybrid','knight','fool'];
  if(nightOneOnly.includes(roleId)) return jgNight===1;
  return true;
}

function jgNightStartNext(){
  // 盜賊候選轉盤：整局最開頭、只有法官看得到的一步。系統從板子角色池裡秘密抽出兩張候選
  // 身分牌（不會抽到盜賊自己、也不會兩張都是狼人），法官照抽到的結果去實際牌堆裡把這兩張
  // 牌拿起來，其餘的牌正常發給大家；確認後才進入「盜賊睜眼」，直接把這兩個抽到的候選秀給
  // 盜賊看，不用再重新手動輸入一次。
  if(jgNight===1 && jgComp.thief>0 && !jgThiefWheelDone){
    return 'thief-wheel';
  }
  // 盜賊是整局第一個睜眼的角色（比邱比特還早，僅第一夜、僅一次）：盜賊選完最終身分後，
  // 才輪到邱比特、夢魘等所有人依序睜眼——這樣如果盜賊選成邱比特／狼人等身分，後面該角色
  // 對應的步驟才能正確接上（jgSaveThief 已經把最終身分寫回 jgPlayers 與 jgComp 了）。
  if(jgNight===1 && jgComp.thief>0 && !jgThiefChosen){
    return 'thief-wake';
  }
  // 邱比特永遠是整局第二個睜眼的角色（僅第一夜、僅一次，僅次於盜賊）：必須在夢魘等所有人之前就
  // 決定好情侶配對，之後才輪到其他神職／狼隊依序睜眼。
  if((jgNight===1 && jgComp.cupid>0 && !jgCupidChosen) || jgThiefBuriedActiveTonight('cupid')){
    return 'cupid-wake';
  }
  // 假面舞會板：舞者 → 假面，排在整個晚上最前面（比夢魘還早）——這個板子本身不會跟夢魘/
  // 魔術師/守衛/攝夢人等板子混用，這裡直接插在最前面即可，不影響其他板子原本的順序。
  const hasDancer=(jgNight===1?(jgComp.dancer>0):jgHasRoleAny(['dancer']))||jgThiefBuriedActiveTonight('dancer');
  if(hasDancer) return 'dancer-wake';
  return jgAfterDancerStep();
}
// 舞者結束後的下一步：假面（若板子有）→ 原本的夢魘開頭
function jgAfterDancerStep(){
  const hasMask=(jgNight===1?(jgComp.mask>0):jgHasRoleAny(['mask']))||jgThiefBuriedActiveTonight('mask');
  if(hasMask) return 'mask-wake';
  return jgAfterMaskStep();
}
// 假面結束後的下一步：接回原本 jgNightStartNext 尾端「夢魘」那一段
function jgAfterMaskStep(){
  const hasNightmare = (jgNight===1 ? (jgComp.nightmare>0) : jgHasRoleAny(['nightmare'])) || jgThiefBuriedActiveTonight('nightmare');
  if(hasNightmare) return 'nightmare-wake';
  return jgAfterNightmareStep();
}
// Where to go once nightmare is done (or skipped because there's no nightmare)
function jgAfterNightmareStep(){
  const hasMagician = (jgNight===1 ? (jgComp.magician>0) : jgHasRoleAny(['magician'])) || jgThiefBuriedActiveTonight('magician');
  if(hasMagician) return 'magician-wake';
  return jgAfterMagicianStep();
}
// Where to go once magician is done (or skipped because there's no magician)
function jgAfterMagicianStep(){
  const hasGuard = (jgNight===1 ? (jgComp.guard>0) : jgHasRoleAny(['guard'])) || jgThiefBuriedActiveTonight('guard');
  if(hasGuard) return 'guard-wake';
  return jgAfterGuardStep();
}
// Where to go once the guard step is done (or skipped because there's no guard).
// 攝夢人現在排在守衛之後、狼之前睜眼（見使用者需求：夢魘→守衛→攝夢人→狼→女巫→預言家）。
// 小女孩排在守衛之後、攝夢人之前（大野狼+小女孩板：守衛→小女孩→狼人+小女孩→女巫→大野狼→獵人）。
function jgAfterGuardStep(){
  const hasLittlegirl = (jgNight===1 ? (jgComp.littlegirl>0) : jgHasRoleAny(['littlegirl'])) || jgThiefBuriedActiveTonight('littlegirl');
  if(hasLittlegirl) return 'littlegirl-wake';
  return jgAfterLittlegirlStep();
}
// 小女孩結束後的下一步：接回原本 jgAfterGuardStep 尾端「攝夢人」那一段
function jgAfterLittlegirlStep(){
  const hasDreamcatcher = (jgNight===1 ? (jgComp.dreamcatcher>0) : jgHasRoleAny(['dreamcatcher'])) || jgThiefBuriedActiveTonight('dreamcatcher');
  if(hasDreamcatcher) return 'dreamcatcher-wake';
  return jgAfterDreamcatcherStep();
}
// Where to go once the dreamcatcher step is done (or skipped because there's no dreamcatcher)
function jgAfterDreamcatcherStep(){
  if((jgNight===1 && jgComp.hybrid>0 && !jgHybridChosen) || jgThiefBuriedActiveTonight('hybrid')){
    return 'hybrid-wake';
  }
  return jgAfterHybridStep();
}
// Where to go once the (one-time, night-1-only) hybrid step is done or skipped
function jgAfterHybridStep(){
  if(jgNight===1 && ((jgComp.wolfbrother_e>0)||(jgComp.wolfbrother_y>0)) && !jgWolfBrotherIdDone){
    return 'wolfbrother-wake';
  }
  if(jgNight>=2){
    const wbE=jgPlayers.find(p=>p.role==='wolfbrother_e');
    const wbY=jgPlayers.find(p=>p.role==='wolfbrother_y');
    if(wbE&&wbY) return 'wolfbrother-status';
  }
  return jgAfterWolfBrotherStep();
}
// Where to go once wolf-brother steps are done (or skipped): 機械狼 wakes before the main
// wolf pack every night (including night 1 — its identity is already known via mech-assign,
// so it no longer needs to wait until last), so it can decide learning/skill use/kill-takeover
// before the pack's own kill decision.
// 石像鬼守墓人板要求的順序：守墓人(第二晚起) → 石像鬼 → 機械狼／狼人 → ……
// 守墓人排最先是因為它查的是「前一天白天」的結果，跟今晚任何人的行動無關；
// 石像鬼排在狼人之前是因為它「不與狼隊見面」，必須自己先獨立睜眼查驗（且隊友全滅後要在
// 自己的畫面裡選今晚帶刀對象），而不是像過去那樣跟狼人擠在同一個「狼人睜眼」畫面裡。
function jgAfterWolfBrotherStep(){
  const hasGravkeeper = (jgNight===1 ? (jgComp.gravkeeper>0&&!jgMechAssignDone) : jgHasRoleAny(['gravkeeper'])) || jgThiefBuriedActiveTonight('gravkeeper');
  if(hasGravkeeper) return 'gravkeeper-wake';
  return jgAfterGravkeeperStep();
}
// Where to go once gravkeeper is done (or skipped: night 1, or no gravkeeper on the board)
function jgAfterGravkeeperStep(){
  // 狼隊即使已經死絕，法官每晚還是要照常喊「狼人請睜眼…請閉眼」（維持固定的喊話節奏，
  // 不會因為某個角色沒人activated就跳過，否則玩家會從「今晚沒喊到狼」推理出狼已經死光了）。
  // 所以這裡不整段跳過，仍然照原本board組成走到石像鬼／機械狼／狼人畫面；
  // 只是在畫面裡（見 jgRenderStep 的 wolf-wake／gargoyle-wake／mechanicalwolf-wake 分支）
  // 用 jgAnyWolfAlive() 判斷要不要顯示「選擇殺人對象」的按鈕與名單。
  const hasGargoyle = (jgNight===1 ? (jgComp.gargoyle>0) : jgHasRoleAny(['gargoyle'])) || jgThiefBuriedActiveTonight('gargoyle');
  if(hasGargoyle) return 'gargoyle-wake';
  return jgAfterGargoyleStep();
}
// 雙機械狼板：判斷「現在輪到誰帶刀」——優先順序是「一般狼人（小狼）→ 大機械狼 → 小機械狼」。
// 板子上如果根本沒有配置一般狼人，視為「小狼已經全滅」，大機械狼從第二晚起就直接遞補。
function jgMechWolf2KillEligible(roleId){
  const allSmallWolvesDead=jgPlayers.filter(p=>p.role==='wolf').every(p=>!p.alive);
  if(roleId==='bigmechwolf') return allSmallWolvesDead;
  if(roleId==='smallmechwolf'){
    const bigP=jgPlayers.find(p=>p.role==='bigmechwolf');
    const bigDead=!bigP||!bigP.alive;
    return allSmallWolvesDead&&bigDead;
  }
  return false;
}
// 場上是否還有任何活著的狼隊成員（一般狼人、黑狼王、白狼王、狼美人、惡靈騎士、石像鬼、
// 血月使者、機械狼、夢魘、狼兄狼弟——只要 WOLF_ROLES 裡任何一個角色還活著就算）。
function jgAfterGargoyleStep(){
  const ggAllDead=jgNight>=2&&jgHasRoleAny(['gargoyle'])&&
    jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)&&p.role!=='gargoyle'&&!p.alive).length===
    jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)&&p.role!=='gargoyle').length;
  if(ggAllDead) return jgNextWolfStep();
  // 規則8觸發點：小機械狼上一晚被標記「下一晚回歸主狼群」，這一晚開始生效——順便標記
  // 「這一晚狼隊刀無敵（可破守衛的盾）」，天亮結算時會用到（見 steps.js dawn 區塊）。
  const smallSt2=jgMechWolf2State.smallmechwolf;
  if(smallSt2._pendingRejoinNight===jgNight){
    smallSt2.rejoinedPack=true;
    smallSt2._pendingRejoinNight=null;
    jgRecord._mechwolf2InvincibleKnifeNight=true;
  }
  // 雙機械狼板：大機械狼、小機械狼各自獨立睜眼，排在石像鬼之後、原本單一機械狼之前
  // （沿用「不與狼隊見面的特殊狼角色都排在狼人睜眼之前」這個既有慣例）。
  const hasBigMechWolf=(jgNight===1?(jgComp.bigmechwolf>0):jgHasRoleAny(['bigmechwolf']))||jgThiefBuriedActiveTonight('bigmechwolf');
  if(hasBigMechWolf) return 'bigmechwolf-wake';
  return jgAfterBigMechWolfStep();
}
function jgAfterBigMechWolfStep(){
  const hasSmallMechWolf=(jgNight===1?(jgComp.smallmechwolf>0):jgHasRoleAny(['smallmechwolf']))||jgThiefBuriedActiveTonight('smallmechwolf');
  if(hasSmallMechWolf) return 'smallmechwolf-wake';
  return jgAfterSmallMechWolfStep();
}
function jgAfterSmallMechWolfStep(){
  const hasMechWolf = (jgNight===1 ? (jgComp.mechanicalwolf>0) : jgHasRoleAny(['mechanicalwolf'])) || jgThiefBuriedActiveTonight('mechanicalwolf');
  if(hasMechWolf) return 'mechanicalwolf-wake';
  return 'wolf-wake';
}
// True if 狼兄 has died and 狼弟 (still alive) hasn't had their one-time awakening kill yet.
function jgWolfBrotherAwakenPending(){
  const elder=jgPlayers.find(p=>p.role==='wolfbrother_e');
  const younger=jgPlayers.find(p=>p.role==='wolfbrother_y');
  if(!elder||!younger) return false;
  if(elder.alive) return false;
  if(!younger.alive) return false;
  return !jgWolfBrotherAwakened;
}

function jgNightmareCheckRepeat(){
  const val=(document.getElementById('jg-nightmare-target')||{}).value?.trim()||'';
  const warn=document.getElementById('jg-nightmare-warn');
  if(!warn) return;
  const nmP=jgPlayers.find(p=>p.role==='nightmare');
  if(val&&jgLastNightmareTarget&&val===jgLastNightmareTarget.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:12px;margin-top:4px;">⚠️ 夢魘不能連續兩晚恐懼同一人！</div>';
  } else if(val&&nmP&&val===nmP.num.toString()){
    warn.innerHTML='<div class="info-danger" style="font-size:12px;margin-top:4px;">⚠️ 夢魘不能恐懼自己！</div>';
  } else {
    warn.innerHTML='';
  }
}

function jgSaveNightmare(){
  const isFirst=jgNight===1;
  if(isFirst){
    if(!jgRequireFirstId('jg-nightmare-who','夢魘')) return;
    const whoNum=parseInt((document.getElementById('jg-nightmare-who')||{}).value||'0');
    const name=(document.getElementById('jg-nightmare-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'nightmare')) return;
      jgPlayers.forEach(p=>{ if(p.role==='nightmare') p.role=null; });
      const p=jgByNum(whoNum); if(p){p.role='nightmare';if(name)p.name=name;}
    }
    jgRenderRoster();
  }
  const val=(document.getElementById('jg-nightmare-target')||{}).value?.trim()||'';
  const nmP2=jgPlayers.find(p=>p.role==='nightmare');
  const nmDead=nmP2&&!nmP2.alive;
  if(!nmDead){
    if(!val&&jgNightmareForceMode!=='optional'){
      alert('⚠️ 夢魘每晚必須恐懼一人，請輸入號碼！');
      return;
    }
    if(nmP2&&val===nmP2.num.toString()){
      alert('⚠️ 夢魘不能恐懼自己，請重新選擇！');
      return;
    }
    if(val&&jgLastNightmareTarget&&val===jgLastNightmareTarget.toString()){
      alert('⚠️ 夢魘不能連續兩晚恐懼同一人，請重新選擇！');
      return;
    }
  }
  jgLastNightmareTarget=val||null;
  jgRecord.nightmareTarget=val||null;
  // If the feared player is on the wolf team (and isn't the nightmare itself), wolves can't kill tonight
  if(val){
    const t=jgFind(val);
    jgRecord.nightmareBlocksWolf=!!(t&&WOLF_ROLES.includes(t.role)&&t.role!=='nightmare');
  } else {
    jgRecord.nightmareBlocksWolf=false;
  }
  jgRenderRoster();
  jgGoStep(jgAfterNightmareStep());
}

function jgNextAfterSubWolf(currentStep){
  const chain=[
    ['wolfbeauty-wake','wolfbeauty'],
  ];
  let found=false;
  for(const [step,role] of chain){
    if(found){
      const hasIt=jgNight===1?(jgComp[role]>0):jgHasRoleAny([role]);
      if(hasIt) return step;
    }
    if(step===currentStep) found=true;
  }
  return jgPostWolfStep();
}

// Full night order is: 夢魘 → 魔術師 → 守衛 → 攝夢人 → 混血兒(僅第1夜) → 狼兄狼弟 → 機械狼 → 狼(+狼美人)
// → 黑市商人 → 女巫 → 預言家 → 通靈師 → 石像鬼 → 獵人 → 騎士 → 獵魔人 → 守墓人 → 天亮。
// (守衛已移到夜晚最開始睜眼；攝夢人已移到守衛之後、狼之前——見 jgAfterGuardStep / jgAfterDreamcatcherStep；
//  機械狼已移到狼人睜眼之前——見 jgAfterWolfBrotherStep；女巫已移到預言家之前——見 jgNextAfterSubWolf / jgSaveWitch / jgSaveSeer；
//  黑市商人已移到狼人（含狼美人）睜眼之後、女巫之前——見 jgBlackMarketPending / jgNextWolfStep / jgNextAfterSubWolf)
// 石像鬼、守墓人已經移出這條鏈，改到狼人睜眼之前（見 jgAfterWolfBrotherStep／
// jgAfterGravkeeperStep／jgAfterGargoyleStep）；GOD_CHAIN 現在只涵蓋「女巫→預言家」
// 之後、天亮之前的神職鏈：通靈師 → 獵人 → 騎士 → 獵魔人。
const GOD_CHAIN=[
  {step:'medium-wake',      role:'medium',       check:(n,c)=>(n===1?(c.medium>0):jgHasRoleAny(['medium']))||jgThiefBuriedActiveTonight('medium')},
  {step:'hunter-wake',      role:'hunter',       check:(n,c)=>(n===1?(c.hunter>0):jgHasRoleAny(['hunter']))||jgMechWolfHunterActive()||jgThiefBuriedActiveTonight('hunter')},
  {step:'knight-wake',      role:'knight',       check:(n,c)=>(n===1&&c.knight>0)||jgThiefBuriedActiveTonight('knight')},
  {step:'demonhunter-wake', role:'demonhunter',  check:(n,c)=>(n===1?(c.demonhunter>0):jgHasRoleAny(['demonhunter']))||jgThiefBuriedActiveTonight('demonhunter')},
  {step:'fool-wake',        role:'fool',         check:(n,c)=>(n===1&&c.fool>0)||jgThiefBuriedActiveTonight('fool')},
  // 狼巫第一晚排在整條神職鏈最後（其餘夜晚改成緊接狼刀決定之後，見 jgPostWolfStep／
  // jgWolfshamanPending，這裡的 check 只在第一晚生效）
  {step:'wolfshaman-check', role:'wolfshaman',   check:(n,c)=>jgIsFirstNight()&&((n===1?(c.wolfshaman>0):jgHasRoleAny(['wolfshaman']))||jgThiefBuriedActiveTonight('wolfshaman'))},
];
// 黑市商人已移到狼人（含狼美人）睜眼之後、女巫之前——見 jgBlackMarketPending / jgNextWolfStep / jgNextAfterSubWolf
function jgBlackMarketPending(){
  return !jgBlackMarketUsed && ((jgNight===1?(jgComp.blackmarket>0):jgHasRoleAny(['blackmarket']))||jgThiefBuriedActiveTonight('blackmarket'));
}
// 幸運兒（黑市商人交易產生）有自己獨立的睜眼步驟，避免跟真預言家／真女巫同一個
// 「睜眼」時間點共用畫面而讓彼此知道對方是誰。只有查驗／毒藥技能需要每晚睜眼；
// 獵人技能是被動的（死亡時才觸發），不需要睜眼。
// 睜眼順序：交易發生的當晚，幸運兒緊接在黑市商人之後睜眼（見 jgSaveBlackMarket 的
// 'luckyone-walk' 步驟，屬於交易當下的掩護動作）；從下一晚起，幸運兒改成整晚
// 最後一個睜眼（緊接在天亮之前），見 jgNextGodStep 尾端插入的 jgLuckyOneWakeIsLast()。
function jgLuckyOneWakePending(){
  // 幸運兒睜眼是掩護動作：只要黑市商人已經交易過（不管成功失敗、不管幸運兒拿到哪種技能），
  // 之後每一晚都要照樣走一次「幸運兒請睜眼／請閉眼」的儀式，外觀完全一致；如果只有拿到
  // 查驗／毒藥才出現這個畫面，拿到獵人獵槍（被動技能，平常晚上不用做事）或交易失敗就整晚
  // 跳過，等於是靠「這幾晚是不是每晚都被叫起來」洩露幸運兒到底拿到哪個技能、甚至洩露
  // 交易到底有沒有成功。
  return !!jgBlackMarketUsed;
}
// 從交易的下一晚起（jgNight > 交易當晚），幸運兒的睜眼步驟改成整晚最後一個，
// 由 jgNextGodStep() 在整條神職鏈都跑完、準備天亮之前插入。
function jgLuckyOneWakeIsLast(){
  return jgLuckyOneWakePending() && jgBlackMarketTradeNight!=null && jgNight>jgBlackMarketTradeNight;
}
// 狼人（含狼美人等）睜眼結束後的下一步：黑市商人 → 女巫，依序檢查誰該登場
// （幸運兒交易當晚由 jgSaveBlackMarket→luckyone-walk 處理；交易後續夜晚已移到
//  jgNextGodStep 尾端，不再從這裡進場）
// 狼巫從第二晚起緊接在狼刀決定之後獨自查驗（第一晚仍照第一晚專屬順序，排在整條神職鏈
// 最後——見 GOD_CHAIN 最後一項），所以這裡只在「不是第一晚」時才插進來。
function jgWolfshamanPending(){
  return !jgIsFirstNight() && (jgHasRoleAny(['wolfshaman'])||jgThiefBuriedActiveTonight('wolfshaman'));
}
// 大野狼每晚都排在女巫之後（不管其他狼是不是全滅，都要走這個步驟維持節奏——只是「能不能
// 真的多殺一人」要看場上四隻狼是否全部存活，這個判斷在畫面渲染跟 jgSaveBigBadWolf 裡各自
// 處理，這裡只負責「板子上有沒有大野狼」）。
function jgBigBadWolfPending(){
  return (jgIsFirstNight()?(jgComp.bigbadwolf>0):jgHasRoleAny(['bigbadwolf']))||jgThiefBuriedActiveTonight('bigbadwolf');
}
// 純白之女每晚都排在女巫之後、（如果板子有）獵人（神職鏈）之前查驗——不管第幾晚，位置都一樣，
// 不像狼巫那樣第一晚跟其餘夜晚位置不同。用板子設定（jgComp）判斷第一晚（此時角色可能還沒
// 指定給玩家），其餘夜晚才能直接看場上實際角色。
function jgPurewhitemaidenPending(){
  return (jgIsFirstNight()?(jgComp.purewhitemaiden>0):jgHasRoleAny(['purewhitemaiden']))||jgThiefBuriedActiveTonight('purewhitemaiden');
}
function jgPostWolfStep(){
  if(jgWolfshamanPending()) return 'wolfshaman-check';
  if(jgBlackMarketPending()) return 'blackmarket-wake';
  return 'witch-wake';
}
// 狼巫查驗結束後（第二晚起才會走到這裡）的下一步，跟原本 jgPostWolfStep 扣掉狼巫那一段
// 邏輯一致：黑市商人 → 女巫。
function jgAfterWolfshamanStep(){
  if(jgBlackMarketPending()) return 'blackmarket-wake';
  return 'witch-wake';
}

function jgNextGodStep(afterStep){
  let found=!afterStep; // if no afterStep, start from beginning
  for(const g of GOD_CHAIN){
    if(found && g.check(jgNight,jgComp)) return g.step;
    if(g.step===afterStep) found=true;
  }
  // 幸運兒第二晚起（交易的下一晚起）改成整晚最後一個睜眼，插在神職鏈跑完、天亮之前
  if(jgLuckyOneWakeIsLast()) return 'luckyone-wake';
  return 'dawn';
}

function jgWitchSaveBtn(save){
  if(save){
    jgRecord.witchSave=true;
    const yes=document.getElementById('jg-btn-save-yes');
    const no=document.getElementById('jg-btn-save-no');
    if(yes){yes.className='primary';yes.disabled=false;}
    if(no){no.className='ghost';no.disabled=false;no.style.opacity='';}
    const st=document.getElementById('jg-witch-save-status');
    if(st) st.innerHTML='<div class="info-success" style="font-size:12px;margin-top:4px;">✓ 選擇救人（可按「不救」取消）</div>';
    const pw=document.getElementById('jg-witch-poison-wrap');
    if(pw) pw.innerHTML='<div class="info" style="color:var(--text2);font-size:13px;">已使用解藥，本晚不能同時使用毒藥</div>';
  } else {
    jgRecord.witchSave=null;
    const yes=document.getElementById('jg-btn-save-yes');
    if(yes){yes.className='success';yes.disabled=false;}
    const no=document.getElementById('jg-btn-save-no');
    if(no){no.className='danger';no.disabled=false;no.style.opacity='';}
    const st=document.getElementById('jg-witch-save-status');
    if(st) st.innerHTML='<div style="font-size:12px;color:#922418;margin-top:4px;">✗ 選擇不救（可按「救人」改變）</div>';
    // Restore poison input
    const pw=document.getElementById('jg-witch-poison-wrap');
    if(pw&&!jgWitchPoisonUsed) pw.innerHTML='<label>毒殺的對象（留空=不毒）</label>'
      +jgNumSelectHtml('jg-witch-poison-rec', jgRecord.witchPoison||'');
  }
}

function jgWitchWhoChange(){
  const whoEl=document.getElementById('jg-witch-who');
  const warn=document.getElementById('jg-witch-who-warn');
  if(!whoEl||!warn) return;
  const whoNum=parseInt(whoEl.value||'0');
  if(!whoNum){warn.innerHTML='';return;}
  const conflict=jgPlayers.find(p=>p.num===whoNum&&p.role&&p.role!=='witch');
  if(conflict){
    warn.innerHTML='<div class="info-danger" style="font-size:12px;margin-top:4px;">⚠️ '+whoNum+'號 已是「'+jgFullRoleName(conflict.role)+'」，確定要調整嗎？</div>';
    // Don't return — still update save wrap below
  } else {
    warn.innerHTML='';
  }
  const killed=jgRecord.wolfKill;
  if(!killed) return;
  const guardSaved=jgRecord.guardTarget&&(jgRecord.guardTarget.toString()===killed.toString());
  const wrap=document.getElementById('jg-witch-save-wrap');
  if(!wrap||jgWitchSaveUsed) return;
  const isSelf=whoNum.toString()===killed.toString();
  if(isSelf){
    wrap.innerHTML='<div class="btn2" style="margin-top:6px;"><button disabled style="opacity:0.3;">救人</button><button disabled style="opacity:0.3;">不救</button></div>'
      +'<div class="info-warn" style="margin-top:6px;">女巫自己被殺，不能自救（搖頭）</div>';
  } else if(!guardSaved){
    wrap.innerHTML='<div class="btn2" style="margin-top:6px;">'
      +'<button class="success" id="jg-btn-save-yes" onclick="jgWitchSaveBtn(true)">救人</button>'
      +'<button class="ghost" id="jg-btn-save-no" onclick="jgWitchSaveBtn(false)">不救</button>'
      +'</div><div id="jg-witch-save-status"></div>';
  }
}

function jgSaveWitch(){
  const isFirst=jgNight===1;
  if(isFirst){
    if(!jgRequireFirstId('jg-witch-who','女巫')) return;
    const whoNum=parseInt((document.getElementById('jg-witch-who')||{}).value||'0');
    const name=(document.getElementById('jg-witch-name')||{}).value?.trim()||'';
    if(whoNum){
      if(!jgConflictCheck(whoNum,'witch')) return;
      jgPlayers.forEach(p=>{ if(p.role==='witch') p.role=null; });
      const p=jgByNum(whoNum);
      if(p){p.role='witch';if(name)p.name=name;}
    }
    jgRenderRoster();
  }
  const witchPfinal=jgPlayers.find(p=>p.role==='witch');
  const witchFearedFinal=jgFeared(witchPfinal);
  if(witchFearedFinal){ jgRecord.witchSave=null; jgRecord.witchPoison=null; }
  // 女巫不能自救：這是最終防線，確保即使第一晚剛剛才選定女巫號碼（此時畫面上的救人/不救按鈕
  // 可能還來不及知道「被殺的就是女巫本人」而誤顯示），存檔當下一定會把自救結果強制清空。
  const selfKilledFinal=!!(witchPfinal&&jgRecord.wolfKill&&witchPfinal.num.toString()===jgRecord.wolfKill.toString());
  if(selfKilledFinal){ jgRecord.witchSave=null; }
  const usedSave=!witchFearedFinal&&!!jgRecord.witchSave;
  if(usedSave) jgWitchSaveUsed=true;
  if(!usedSave&&!witchFearedFinal){
    const pi=document.getElementById('jg-witch-poison-rec');
    if(pi&&pi.value.trim()){
      const poisonRawVal=pi.value.trim();
      const poisonTarget=jgMagicSwapNum(poisonRawVal);
      jgRecord.witchPoisonRaw=poisonRawVal;
      jgRecord.witchPoison=poisonTarget;
      jgWitchPoisonUsed=true;
      const pt=jgFind(poisonTarget);
      if(pt&&pt.role==='evilknight'&&pt.alive&&!jgEvilKnightRevengeUsed){
        jgRecord.evilknightRevengeWitch=true;
        jgEvilKnightRevengeUsed=true; // 整局限一次；若同一晚預言家已先發動，這裡會被上面的判斷擋掉
      }
    }
  }
  jgRecord.witchStepDone=true;
  if(jgTryEarlyEnd()) return;
  if(jgBigBadWolfPending()){ jgGoStep('bigbadwolf-wake'); return; }
  jgGoStep(jgPurewhitemaidenPending()?'purewhitemaiden-wake':'seer-wake');
}

function jgSaveBloodMoonLastNight(){
  const val=(document.getElementById('jg-bloodmoon-last-kill')||{}).value?.trim()||'';
  const bm=jgPlayers.find(p=>p.role==='bloodmoon');
  if(bm&&bm.alive) jgApplyDeath(bm);
  let killedNum=null;
  if(val){ const p=jgFind(val); if(p&&p.alive){jgApplyDeath(p); killedNum=p.num;} }
  jgPushDayLog('血月屠邊刀'+(killedNum||'x'));
  jgRenderRoster();
  // 血月使者是場上最後一隻狼，這一刀決定勝負：不能直接呼叫 jgCheckWin()——它一看到
  // 「場上已無存活的狼」就會先判定好人勝利，完全不管這一刀有沒有真的屠邊。必須先確認
  // 這一刀砍完之後，好人陣營是否已經被屠邊（神職或平民其中一邊死絕），達成才算狼人勝利；
  // 否則就算狼隊已經全滅，只要神職和平民都還至少各留一人存活，仍然是好人勝利。
  const win=jgCheckBloodMoonFinalWin();
  if(win){jgShowWin(win);return;}
  // Continue as normal night (no seal — bloodmoon already handled their kill)
  jgGoStep('next-night');
}

// 血月使者屠邊最後一擊專用的勝負判定——見 jgSaveBloodMoonLastNight 上方註解，
// 不能沿用一般的 jgCheckWin()（它的「狼隊全滅→好人勝利」規則會搶在屠邊判定之前生效）。
function jgSaveWolfBeautyCharmKill(){
  const target=jgRecord._wolfbeautyKillCharm?jgFind(jgRecord._wolfbeautyKillCharm):null;
  if(target&&target.alive){target.alive=false;}
  jgRenderRoster();
  const win=jgCheckWin(); if(win){jgShowWin(win);return;}
  jgGoStep('vote-last-words');
}

function jgSaveHunter(){
  // 若被票出的這個人，本身既是真獵人、又是黑市商人交易出來、拿到「獵人獵槍」的幸運兒，
  // 等於身上有兩把槍：兩個技能各自獨立開一槍，兩個都可以留空不開。
  const doubleGun=!!jgRecord._hunterDoubleGun;
  jgRecord._hunterDoubleGun=null;
  const val=(document.getElementById('jg-hunter-shot-rec')||{}).value?.trim()||'';
  const val2=doubleGun?((document.getElementById('jg-hunter-shot-rec2')||{}).value?.trim()||''):'';
  const chainQueue=[];
  const fireOneShot=(v, abbr)=>{
    if(!v) return;
    const p=jgFind(v);
    if(p&&p.alive){
      const wasRole=p.role;
      const trulyDied=jgApplyDeath(p);
      const wbCharmNum=jgCascadeWolfBeautyDeath(wasRole, trulyDied);
      jgCascadeDreamcatcherDeath(wasRole, trulyDied);
      { const loverDeadNum=jgCascadeLoverDeath(p.num, trulyDied);
        if(loverDeadNum){
          alert('💘 '+p.num+'號的情侶 '+loverDeadNum+'號 跟著殉情！（殉情不會觸發任何技能，即使殉情者是獵人／黑狼王等，也不能開槍帶人）\n\n法官口白：「'+p.num+'號、'+loverDeadNum+'號 淘汰。」');
        }
      }
      let wbNote='';
      if(wbCharmNum){
        wbNote='（'+v+'狼美，魅惑對象'+wbCharmNum+'一同出局）';
        alert('💋 '+v+'號是狼美人，魅惑對象一同殉情！\n\n法官口白：「'+v+'號、'+wbCharmNum+'號 淘汰。」');
      }
      jgAmendDayVoteLine(jgRecord._voteOutNum,abbr,v+wbNote);
      const chainTag=trulyDied?jgHunterCapableTag(wasRole,p.num):null;
      if(chainTag){ chainQueue.push({num:p.num, role:chainTag}); }
    }
  };
  fireOneShot(val,'獵');
  if(doubleGun){
    fireOneShot(val2,'幸獵');
    if(jgLuckyOne) jgLuckyOne.used=true;
  }
  jgRenderRoster();
  const w=jgCheckWin();if(w){jgShowWin(w);return;}
  if(chainQueue.length){
    const first=chainQueue.shift();
    jgRecord._mechHunterChainQueue=chainQueue;
    jgRecord._mechHunterChainNum=first.num;
    jgRecord._mechHunterChainRole=first.role;
    jgRecord._mechHunterChainNextStep='next-night';
    jgRecord._mechHunterChainOrigin='day';
    jgGoStep('mechhunter-chain-shot');
    return;
  }
  jgGoStep('next-night');
}

// Try to end the night early once the outcome is already mathematically determined,
// so the judge doesn't have to walk through every remaining night step for nothing.
// Only used from night 2 onward (night 1 is still establishing identities).
// Skipped whenever the witch is still alive with an unused antidote and could still
// save the wolf-kill victim — in that case we must continue to her step to find out.

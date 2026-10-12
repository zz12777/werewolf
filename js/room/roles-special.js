'use strict';
// ═══════════════════════════════════════════
// js/room/roles-special.js
// 連線房間：夢魘、魔術師、攝夢人、機械狼、邱比特、盜賊、狼兄狼弟、黑市商人、幸運兒、夜槍。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// 夢魘：全場最先睜眼，恐懼一名玩家（不能選自己），被恐懼的人整晚無法發動任何夜間技能；
// 如果恐懼到的人剛好是狼隊一員，狼隊當晚也不能殺人（見 jgRoomWolfViewHtml 開頭的判斷）。
// 不能連續兩晚恐懼同一人，這個限制存在夢魘自己的 players/{uid}.lastNightmareTargetUid 上，
// 不會因為換到下一夜就重置。夢魘自己的目標不會被魔術師的換流影響（魔術師排在夢魘之後
// 才睜眼，換流生效時夢魘已經選完了），所以這裡不用套用 jgRoomEffectiveTarget。
// ═══════════════════════════════════════════
async function jgRoomNightmareViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.nightmareFearedNight===night&&rd.nightmareFearedSeatNum!=null){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已選擇恐懼</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+rd.nightmareFearedSeatNum+'號</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const lastTarget=me?me.lastNightmareTargetUid:null;
  const lastTargetSeat=lastTarget?(jgRoomLatestPlayers.find(p=>p.uid===lastTarget)||{}).seatNum:null;
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要恐懼的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇恐懼對象</h1></div>'
    +(lastTarget?'<div class="info" style="font-size:12px;text-align:center;">不能連續兩晚恐懼同一人（'+lastTargetSeat+'號），上一晚的對象已排除</div>':'')
    +jgRoomNumGridHtml('jg-room-nightmare-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomNightmareActFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomNightmareActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-nightmare-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  if(p.uid===window.jgFirebaseUid){ alert('不能恐懼自己，請選別人'); return; }
  const me=jgRoomLatestPlayers.find(pp=>pp.uid===window.jgFirebaseUid);
  if(me&&me.lastNightmareTargetUid===p.uid){ alert('不能連續兩晚恐懼同一人，請選別人'); return; }
  window.jgRoomNightmareAct(p.uid, seatNum, night);
};
window.jgRoomNightmareAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  // secrets 全房可讀（見 jgRoomAssignRoles 的說明），夢魘自己的畫面可以直接查目標的真實
  // 身分，用來判斷這一刀是不是恐懼到狼隊自己人（會導致當晚狼隊無法殺人）。
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const isWolf=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role));
  await setDoc(doc(db,'rooms',jgRoomCode),{
    nightmareFearedNight:night, nightmareFearedUid:targetUid, nightmareFearedSeatNum:targetSeatNum,
    nightmareFearedIsWolf:isWolf
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastNightmareTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '恐 '+targetSeatNum);
  await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:jgRoomNextNightStep('nightmare', night) },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 魔術師：夢魘之後、守衛之前最早行動，可以選擇交換兩個玩家的號碼牌（也可以不換）。交換
// 之後，這兩個號碼「當晚」所有以號碼為目標的夜間技能，實際作用對象都會互相對調（見
// jgRoomEffectiveTarget，套用在守衛/狼隊/女巫毒藥/查驗類角色身上）。每個號碼整局最多只能
// 被交換過一次，用過的號碼記在魔術師自己的 players/{uid}.magicianUsedSeats 陣列上。
// 如果魔術師被夢魘恐懼，今晚就不能交換（不會顯示任何交換介面），直接跳過這一步。
// ═══════════════════════════════════════════
async function jgRoomMagicianViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  if(rd.magicianDoneNight===night){
    const summary=(rd.magicianSwapNight===night&&rd.magicianSwapASeatNum!=null)
      ?('交換了 '+rd.magicianSwapASeatNum+'號 與 '+rd.magicianSwapBSeatNum+'號')
      :'這晚沒有交換';
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+summary+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const usedSeats=(me&&me.magicianUsedSeats)||[];
  const pending=rd.magicianPendingNight===night?rd.magicianPendingUid:null;
  const pendingSeat=rd.magicianPendingNight===night?rd.magicianPendingSeatNum:null;
  if(pending){
    return {needsTimer:true, html:jgRoomTimerHtml(20,'要跟哪個號碼交換？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>已選 '+pendingSeat+'號，請選另一個要交換的號碼</h1></div>'
      +jgRoomNumGridHtml('jg-room-magician-pick2', null, [...usedSeats, pendingSeat])
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomMagicianConfirmSwapFromGrid('+night+')">確認</button></div>'
      +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMagicianModify()">重新選擇</button></div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'要交換哪兩個號碼？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇要交換的第一個號碼（可以不換）</h1></div>'
    +jgRoomNumGridHtml('jg-room-magician-pick1', null, usedSeats)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomMagicianPickFirstFromGrid('+night+')">確認</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMagicianSkip('+night+')">今晚不交換，跳過</button></div>'};
}
window.jgRoomMagicianPickFirstFromGrid=function(night){
  const hidden=document.getElementById('jg-room-magician-pick1');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMagicianPickFirst(p.uid, seatNum, night);
};
window.jgRoomMagicianPickFirst=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianPendingNight:night, magicianPendingUid:targetUid, magicianPendingSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMagicianModify=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianPendingNight:null, magicianPendingUid:null, magicianPendingSeatNum:null
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMagicianConfirmSwapFromGrid=function(night){
  const hidden=document.getElementById('jg-room-magician-pick2');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMagicianConfirmSwap(p.uid, seatNum, night);
};
window.jgRoomMagicianConfirmSwap=async function(targetUid, targetSeatNum, night){
  const rd=jgRoomLatestRoomDoc||{};
  const aUid=rd.magicianPendingUid, aSeat=rd.magicianPendingSeatNum;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianSwapNight:night, magicianSwapAUid:aUid, magicianSwapASeatNum:aSeat,
    magicianSwapBUid:targetUid, magicianSwapBSeatNum:targetSeatNum,
    magicianPendingNight:null, magicianPendingUid:null, magicianPendingSeatNum:null,
    magicianDoneNight:night
  },{ merge:true });
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const usedSeats=(me&&me.magicianUsedSeats)||[];
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{
    magicianUsedSeats:[...usedSeats, aSeat, targetSeatNum]
  },{ merge:true });
  await jgRoomAppendNightLog(night, '換 '+aSeat+'-'+targetSeatNum);
  await jgRoomAdvanceToWolfOrBeyond('magician', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMagicianSkip=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianSwapNight:null, magicianSwapAUid:null, magicianSwapASeatNum:null,
    magicianSwapBUid:null, magicianSwapBSeatNum:null, magicianDoneNight:night
  },{ merge:true });
  await jgRoomAppendNightLog(night, '換 x');
  await jgRoomAdvanceToWolfOrBeyond('magician', night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 攝夢人：排在守衛之後、機械狼／狼隊之前，每晚都必須選擇一名玩家（沒有「跳過」選項）
// 成為夢遊者。夢遊者這一晚免疫狼刀、女巫毒藥、機械狼學到的技能造成的死亡（見
// jgRoomResolveNightDeaths 開頭的 isDreaming 判斷）；但如果連續兩晚選了同一個人，這個人
// 會直接死於夢裡（不受任何保護影響，馬上結算，不用等狼隊/女巫）。攝夢人自己若在夜裡死亡，
// 夢遊者也會一併死去（同樣在 jgRoomResolveNightDeaths 處理）。可以選自己嗎？角色說明沒有
// 特別禁止，這裡不特別排除。
// ═══════════════════════════════════════════
async function jgRoomDreamcatcherViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  if(rd.dreamcatcherTargetNight===night&&rd.dreamcatcherTargetSeatNum!=null){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已選擇夢遊對象</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+rd.dreamcatcherTargetSeatNum+'號</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要夢到誰？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇今晚的夢遊對象（每晚必選）</h1></div>'
    +jgRoomNumGridHtml('jg-room-dreamcatcher-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomDreamcatcherActFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomDreamcatcherActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-dreamcatcher-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomDreamcatcherAct(p.uid, seatNum, night);
};
window.jgRoomDreamcatcherAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const lastTarget=me?me.lastDreamcatcherTargetUid:null;
  const diedInDream=(lastTarget===targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    dreamcatcherTargetNight:night, dreamcatcherTargetUid:diedInDream?null:targetUid,
    dreamcatcherTargetSeatNum:targetSeatNum, dreamcatcherOwnUid:window.jgFirebaseUid
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastDreamcatcherTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '夢 '+targetSeatNum+(diedInDream?'(連續兩晚致死)':''));
  if(diedInDream){
    // 連續兩晚選同一人：這個人直接死於夢裡，跟狼刀/女巫毒藥是分開結算的另一種死因，
    // 不受任何保護影響，馬上生效（不用等這一晚後面的狼隊/女巫回合）。上面那筆
    // dreamcatcherTargetUid 特意寫成 null，是為了避免 jgRoomResolveNightDeaths 的免疫
    // 判斷誤把這個人當成「今晚受保護的夢遊者」（他其實是死於夢裡，不是被保護）。
    await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{ alive:false, diedNight:night },{ merge:true });
    await jgRoomApplyCupidCascade();
  }
  await jgRoomAdvanceToWolfOrBeyond('dreamcatcher', night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 機械狼：不與狼隊見面，全程自己單獨睜眼，固定排在（真正的）狼隊出刀之前。
// 第一夜：選一名玩家「學習」對方的身分技能。
// 第二夜起：依照學到的身分，開放對應的一次性/每晚技能——
//   學到平民：沒有主動技能，直接跳過。
//   學到狼人/黑狼王：整局限一次的「額外一刀」，不可被守衛/解藥阻擋（見
//     jgRoomResolveNightDeaths 的 mechWolfBonusKillUid）。
//   學到女巫：整局限一次的毒藥（沒有解藥），一樣不可被守衛/解藥阻擋。
//   學到通靈師：每晚查驗一名玩家的具體身分（另存一份 mechwolfChecks，跟真正的通靈師分開）。
//   學到守衛：每晚可以額外守護一人，效果比照真守衛擋狼刀（跟真守衛各自獨立判斷）。
//   學到獵人：被淘汰時（不管是夜裡被刀死還是白天被投票出局）自動跳出開槍畫面，
//     可以選一人一起帶走——跟真正的獵人／黑狼王共用同一套 jgRoomCheckShootEligible／
//     jgRoomShootAct 判斷與結算，唯一差別只有文字紀錄的縮寫改標「機獵」方便跟真獵人區分。
// 除了以上技能之外，任何一晚只要「其餘真正跟狼隊一起睜眼的隊友全部死亡」
// （jgRoomMechWolfKillEligible()），機械狼就會在自己的畫面上多看到一個「今晚由你出刀」的
// 選人畫面，結果直接寫進 wolfKillTargetUid／wolfKillTargetSeatNum，跟一般狼刀走同一套
// 死亡結算/女巫救援流程。
// ═══════════════════════════════════════════
async function jgRoomMechWolfViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const learned=me?me.mechWolfLearnedRole:null;
  let html='';
  let doneAll=true; // 這一晚是不是已經沒有事情要做了（用來決定要不要顯示「繼續」）
  if(night===1&&!learned){
    if(rd.mechWolfLearnDoneNight===1){
      html+='<div class="nbanner" style="margin-top:20px;"><h1>已選擇學習對象</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>';
    } else {
      const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
      const dead=new Set(others.filter(p=>p.alive===false).map(p=>p.seatNum));
      return {needsTimer:true, html:jgRoomTimerHtml(20,'你要學習誰的身分？')
        +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇今晚要學習的對象</h1></div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-learn-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomMechWolfLearnFromGrid('+night+')">確認</button></div>'};
    }
  } else if(learned){
    const learnedName=(typeof RNAME!=='undefined'&&RNAME[learned])||learned;
    html+='<div class="nbanner" style="margin-top:20px;"><h1>你學到的身分：'+learnedName+'</h1></div>';
    // 技能要「次晚起」才能用（跟幸運兒拿到技能是同一個道理：學到的當晚，這個身分的能力
    // 還不算正式到位，第一晚只單純告知學到誰、直接給確認按鈕過這一步就好，不能馬上就對
    // 那個學到的技能發動一次）。night===1 的話，不管學到什麼，一律不顯示任何技能操作區塊，
    // 直接落到後面 doneAll 的「確認，沒有其他行動」分支。
    const skillDoneThisNight=rd.mechWolfSkillDoneNight===night;
    if(night===1){
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">技能要等下一晚才能開始使用，今晚先確認學到的身分就好</div>';
    } else if(skillDoneThisNight){
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">這一晚的技能已經行動過了</div>';
    } else if(learned==='witch'&&!(me&&me.mechWolfPoisonUsed)){
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">使用毒藥（整局限一次）</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-poison-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfPoisonFromGrid('+night+')">下毒</button></div>'
        +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMechWolfSkillSkip('+night+')">這晚不使用，跳過</button></div>';
    } else if((learned==='wolf'||learned==='wolfking')&&!(me&&me.mechWolfBonusKillUsed)){
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">發動額外一刀（整局限一次）</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-bonuskill-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfBonusKillFromGrid('+night+')">確認</button></div>'
        +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMechWolfSkillSkip('+night+')">這晚不使用，跳過</button></div>';
    } else if(learned==='medium'){
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">查驗身分（每晚可用）</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-medium-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfMediumCheckFromGrid('+night+')">確認</button></div>';
    } else if(learned==='guard'){
      doneAll=false;
      const lastTarget=me?me.mechWolfLastGuardTargetUid:null;
      const lastTargetSeat=lastTarget?(jgRoomLatestPlayers.find(p=>p.uid===lastTarget)||{}).seatNum:null;
      html+='<div class="section-title" style="margin-top:16px;">額外守護（每晚可用）</div>'
        +(lastTarget?'<div class="info" style="font-size:12px;text-align:center;">不能連續兩晚守護同一人（'+lastTargetSeat+'號），上一晚的對象已排除</div>':'')
        +jgRoomNumGridHtml('jg-room-mechwolf-guard-pick', null, lastTargetSeat?[lastTargetSeat]:[])
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfGuardFromGrid('+night+')">確認</button></div>';
    } else if(learned==='hunter'){
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">你學到了獵人：這是被動能力，不用主動使用——之後如果被淘汰（夜裡被刀死或白天被投票出局），會自動跳出開槍畫面讓你選要不要帶人。</div>';
    } else {
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">這個身分這一晚沒有可以使用的主動技能。</div>';
    }
  } else {
    html+='<div class="nbanner" style="margin-top:20px;"><h1>你目前沒有可用的主動技能</h1></div>';
  }
  const eligible=await jgRoomMechWolfKillEligible();
  if(eligible){
    if(rd.wolfKillNight===night&&rd.wolfKillTargetSeatNum!=null){
      html+='<div class="nbanner" style="margin-top:20px;"><h1>今晚由你出刀：已選 '+rd.wolfKillTargetSeatNum+'號</h1></div>';
    } else {
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">其餘狼隊已全滅，今晚由你出刀</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-kill-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfKillFromGrid('+night+')">確認</button></div>';
    }
  } else if(doneAll){
    // 這一晚沒有技能可用（或已經用過/沒有主動技能可用），也還沒輪到接管出刀：給一個確認
    // 按鈕讓他明確結束這一步（比起完全自動跳過，讓玩家自己按一下比較符合其餘步驟「需要
    // 互動才推進」的手感）。
    html+='<button class="primary" style="margin-top:14px;" onclick="jgRoomMechWolfSkillSkip('+night+')">確認</button>';
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'機械狼請睜眼')+html};
}
window.jgRoomMechWolfLearnFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-learn-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  if(p.uid===window.jgFirebaseUid){ alert('不能學習自己的身分，請選別人'); return; }
  window.jgRoomMechWolfLearn(p.uid, seatNum, night);
};
window.jgRoomMechWolfLearn=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  let role=secretSnap.exists()?secretSnap.data().role:'villager';
  // 學到另一隻機械狼、或狼隊裡不會給機械狼帶來主動技能的角色，一律歸類成「平民」（沒有
  // 主動技能）——跟本機法官助手 jgMechWolfLearn 系列的簡化規則一致，避免出現奇怪的組合。
  if(!['villager','wolf','wolfking','witch','medium','hunter','guard'].includes(role)) role='villager';
  await setDoc(doc(db,'rooms',jgRoomCode),{ mechWolfLearnDoneNight:1 },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{
    mechWolfLearnedRole:role, mechWolfLearnedFromSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomAppendNightLog(night, '機學 '+targetSeatNum);
  // 學到身分要用大字報清楚告知，格式比照本機法官助手：「X號」+ 學到的身分中文名稱，
  // 不能只是塞在頁面標題裡讓他自己瞄到——這是整局唯一一次告知的機會，漏看了會很麻煩。
  const roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  jgRoomShowBigCard(targetSeatNum+'號', '學到「'+roleName+'」');
  // 學完身分之後，如果剛好板子上（或其餘狼隊友都死光了）沒有其他真正的狼隊出刀，機械狼
  // 這時就要自己接管出刀——這種情況一定要「留在」mechwolf 這一步，讓同一個畫面接著顯示
  // 出刀選人（見 jgRoomMechWolfViewHtml 最後那段 eligible 判斷），不能直接跳去 'wolf' 那
  // 一步：'wolf' 步驟的畫面 dispatch 是特別排除機械狼的（機械狼平常不跟狼隊一起睜眼），
  // 如果這裡不管有沒有資格接管、無條件跳去 'wolf'，遇到「板子上只有機械狼、沒有其他狼人」
  // 這種情況就會沒有任何人看得到「wolf」這一步的畫面，整場卡住、誰都按不了下一步。
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfSkillSkip=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ mechWolfSkillDoneNight:night },{ merge:true });
  // 只有「真的學到某個有主動技能的身分、這一晚技能也已經開放使用（次晚起）、但選擇不用」
  // 才需要記一行 x——第一晚剛學到、技能還沒開放使用的那次「確認」不算「跳過技能」，不用
  // 記錄（避免文字紀錄第一晚出現一行看起來像是「有技能可用卻放棄」的誤導訊息）。
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const learned=me?me.mechWolfLearnedRole:null;
  const skipAbbr={witch:'機毒',wolf:'機刀',wolfking:'機刀',guard:'機守',medium:'機驗'}[learned];
  if(skipAbbr&&night>1) await jgRoomAppendNightLog(night, skipAbbr+' x');
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfPoisonFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-poison-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfPoison(p.uid, seatNum, night);
};
window.jgRoomMechWolfPoison=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    mechWolfPoisonUid:effective, mechWolfPoisonNight:night, mechWolfSkillDoneNight:night
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ mechWolfPoisonUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '機毒 '+targetSeatNum);
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfBonusKillFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-bonuskill-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfBonusKill(p.uid, seatNum, night);
};
window.jgRoomMechWolfBonusKill=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    mechWolfBonusKillUid:effective, mechWolfBonusKillNight:night, mechWolfSkillDoneNight:night
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ mechWolfBonusKillUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '機刀 '+targetSeatNum);
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfGuardFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-guard-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  const me=jgRoomLatestPlayers.find(pp=>pp.uid===window.jgFirebaseUid);
  if(me&&me.mechWolfLastGuardTargetUid===p.uid){ alert('不能連續兩晚守護同一人，請選別人'); return; }
  window.jgRoomMechWolfGuard(p.uid, seatNum, night);
};
window.jgRoomMechWolfGuard=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    mechWolfGuardUid:effective, mechWolfGuardNight:night, mechWolfSkillDoneNight:night
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ mechWolfLastGuardTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '機守 '+targetSeatNum);
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfMediumCheckFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-medium-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfMediumCheck(p.uid, seatNum, night);
};
window.jgRoomMechWolfMediumCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',effective));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  let resolvedRole=role;
  let roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  // 查到的對象剛好是另一隻機械狼：跟真通靈師（jgRoomMediumCheck）一樣要顯示對方「學到的
  // 身分」，不是直接顯示「機械狼」這個外殼身分，否則查驗結果毫無意義。
  if(role==='mechanicalwolf'){
    const mwSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',effective));
    const learned=mwSnap.exists()?mwSnap.data().mechWolfLearnedRole:null;
    resolvedRole=learned||role;
    roleName=learned?((typeof RNAME!=='undefined'&&RNAME[learned])||learned):'機械狼';
  }
  const roleAbbr=(typeof ROLE_ABBR!=='undefined'&&ROLE_ABBR[resolvedRole])||roleName;
  await setDoc(doc(db,'rooms',jgRoomCode,'mechwolfChecks',window.jgFirebaseUid+'_'+night),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, roleName:roleName
  });
  await setDoc(doc(db,'rooms',jgRoomCode),{ mechWolfSkillDoneNight:night },{ merge:true });
  await jgRoomAppendNightLog(night, '機驗 '+targetSeatNum+'('+roleAbbr+')');
  // 查驗結果一樣要用大字報清楚告知（比照真通靈師 jgRoomMediumCheck），原本這裡查完什麼都
  // 沒顯示，直接可能接著跳下一步，機械狼根本不知道查到了什麼。
  jgRoomShowBigCard(targetSeatNum+'號', roleName);
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
// 機械狼接管出刀：跟一般狼隊出刀共用同一組欄位（wolfKillTargetUid 等），不用另外走一次
// 團隊確認流程（機械狼是唯一決定的人，不用等其他人），直接呼叫 jgRoomAfterKillDecided()。
window.jgRoomMechWolfKillFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-kill-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfKill(p.uid, seatNum, night);
};
window.jgRoomMechWolfKill=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:night, wolfKillTargetUid:effective, wolfKillTargetSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomAfterKillDecided(night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 邱比特：整局最先睜眼，僅第一夜、僅一次，指定兩名玩家（可以鏈自己）成為情侶。配對結果
// 永久生效：兩人之後只要有一人以任何方式死亡（不管白天投票、夜晚狼刀/毒/夢死等），
// 活著的另一位就要立刻殉情（見 jgRoomApplyCupidCascade，掛在 jgRoomResolveNightDeaths
// 結尾跟攝夢人夢死結算之後）。配對完成後，兩位情侶各自的畫面會先看到一次「情侶互相確認」
// 的提示卡片，兩人都按下確認之後才會真正往下一步走（idempotent 寫法，仿照狼隊「全員確認」
// 那一套，避免兩人幾乎同時按下時互相漏算）。
// ═══════════════════════════════════════════
// ── 盜賊：整局唯一一次行動，比邱比特還早睜眼（配對／後面所有角色都要用「最終」身分，
//    盜賊要先選完）。畫面顯示 2 張候選身分卡，其中一張如果是狼人陣營，規則規定盜賊
//    必須選狼（另一張直接埋掉，不能反悔）；兩張都不是狼的話可以自由選其中一張。選完
//    之後直接把自己的 secrets 文件覆寫成選中的身分——不用等任何人核准，因為這本來就是
//    盜賊自己一個人的行動，不影響其他人；secrets 文件本來就允許任何登入者寫入（連線
//    房間安全規則本來就是這樣設計，見 firestore.rules 的 secrets 那一段）。──
function jgRoomThiefViewHtml(rd, night){
  const cand1=rd.thiefCand1, cand2=rd.thiefCand2;
  if(!cand1||!cand2){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>候選身分資料異常</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;">請聯絡房主確認房間設定，或用房主的強制跳過功能繼續。</div>'};
  }
  const name1=(typeof RNAME!=='undefined'&&RNAME[cand1])||cand1;
  const name2=(typeof RNAME!=='undefined'&&RNAME[cand2])||cand2;
  const wolf1=typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(cand1);
  const wolf2=typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(cand2);
  // 兩張都是狼、或都不是狼：自由選；只有一張是狼：規則規定必須選那張狼，另一張直接鎖住
  // 不能選（跟本機法官助手同一條規則）。
  const mustWolf=wolf1!==wolf2;
  const disabled1=mustWolf&&!wolf1;
  const disabled2=mustWolf&&!wolf2;
  return {needsTimer:true, html: jgRoomTimerHtml(30,'請選擇一個身分')
    +'<div class="nbanner" style="margin-top:20px;"><h1>盜賊請睜眼</h1></div>'
    +'<div class="speech" style="text-align:center;">「<em>這是你的兩個候選身分，請選一個，另一個會直接埋掉。</em>」</div>'
    +(mustWolf?'<div class="info-warn" style="text-align:center;margin-top:8px;">其中一個是狼人陣營，規則規定必須選狼，另一個不能選</div>':'')
    +'<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap;">'
    +'<button'+(disabled1?' disabled':'')+' onclick="jgRoomThiefChoose(\''+cand1+'\','+night+')" style="width:auto;min-width:140px;padding:16px;font-size:18px;font-weight:800;'+(disabled1?'opacity:0.35;':'')+'">'+name1+'</button>'
    +'<button'+(disabled2?' disabled':'')+' onclick="jgRoomThiefChoose(\''+cand2+'\','+night+')" style="width:auto;min-width:140px;padding:16px;font-size:18px;font-weight:800;'+(disabled2?'opacity:0.35;':'')+'">'+name2+'</button>'
    +'</div>'};
}
window.jgRoomThiefChoose=async function(chosenRole, night){
  if(!confirm('確定要選「'+((typeof RNAME!=='undefined'&&RNAME[chosenRole])||chosenRole)+'」嗎？選完不能反悔。')) return;
  const db=window.jgFirebaseDb;
  try{
    jgRoomSuppressAutoRender=true;
    try{
      await setDoc(doc(db,'rooms',jgRoomCode,'secrets',window.jgFirebaseUid),{ role:chosenRole },{ merge:true });
      jgMyRole=chosenRole; // 手動先更新自己這支手機的快取，不用等監聽器來回一趟才反應過來
      await setDoc(doc(db,'rooms',jgRoomCode),{ thiefResolved:true },{ merge:true });
      await jgRoomAppendNightLog(night, '盜賊選 '+((typeof RNAME!=='undefined'&&RNAME[chosenRole])||chosenRole));
      const nextStep=jgRoomNextNightStep('thief', night);
      await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:nextStep },{ merge:true });
    } finally { jgRoomSuppressAutoRender=false; }
    await jgRoomRefreshAndRenderCurrent();
  }catch(err){
    jgRoomSuppressAutoRender=false;
    alert('盜賊選擇身分時發生錯誤，請把這段文字截圖給法官：\n'+(err&&err.message?err.message:String(err)));
    console.error('jgRoomThiefChoose error', err);
  }
};

async function jgRoomCupidViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.cupidDoneNight===1&&rd.cupidRevealDone){
    return null; // 配對＋雙方確認都完成了，這一步真的沒事了，交給外層判斷是不是輪到我看情侶揭曉卡片
  }
  if(rd.cupidDoneNight===1){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已配對完成</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待兩位情侶互相確認身分</div>'};
  }
  const pendingUid=rd.cupidPendingUid;
  if(pendingUid){
    const pendingSeat=rd.cupidPendingSeatNum;
    return {needsTimer:true, html:jgRoomTimerHtml(20,'另一位情侶是誰？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>已選 '+pendingSeat+'號，請選另一位情侶</h1></div>'
      +jgRoomNumGridHtml('jg-room-cupid-pick2', null, [pendingSeat])
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomCupidConfirmPairFromGrid('+night+')">確認</button></div>'
      +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomCupidModify()">重新選擇</button></div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要指定哪兩位玩家成為情侶？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇第一位情侶（可以選自己）</h1></div>'
    +jgRoomNumGridHtml('jg-room-cupid-pick1', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomCupidPickFirstFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomCupidPickFirstFromGrid=function(night){
  const hidden=document.getElementById('jg-room-cupid-pick1');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomCupidPickFirst(p.uid, seatNum, night);
};
window.jgRoomCupidPickFirst=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    cupidPendingUid:targetUid, cupidPendingSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomCupidModify=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ cupidPendingUid:null, cupidPendingSeatNum:null },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomCupidConfirmPairFromGrid=function(night){
  const hidden=document.getElementById('jg-room-cupid-pick2');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomCupidConfirmPair(p.uid, seatNum, night);
};
window.jgRoomCupidConfirmPair=async function(targetUid, targetSeatNum, night){
  const rd=jgRoomLatestRoomDoc||{};
  const aUid=rd.cupidPendingUid, aSeat=rd.cupidPendingSeatNum;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    cupidLoverAUid:aUid, cupidLoverASeatNum:aSeat, cupidLoverBUid:targetUid, cupidLoverBSeatNum:targetSeatNum,
    cupidPendingUid:null, cupidPendingSeatNum:null, cupidDoneNight:1, cupidRevealAckUids:[]
  },{ merge:true });
  await jgRoomAppendNightLog(1, '邱 '+aSeat+'-'+targetSeatNum);
  await jgRoomRefreshAndRenderCurrent();
};
// 兩位情侶各自看到的「互相確認」卡片：只要我是配對到的其中一位、而且還沒按過確認，就會
// 看到這張卡片蓋住原本的夜晚畫面；雙方都按過確認之後，才真的往下一步走（用陣列＋
// arrayUnion 判斷「兩人是否都確認過」，避免兩人幾乎同時按下時互相漏算，跟狼隊「全員
// 確認」那套邏輯一致）。
function jgRoomCupidRevealHtml(rd, night){
  const a=rd.cupidLoverAUid, b=rd.cupidLoverBUid;
  if(!a||!b) return null;
  const myUid=window.jgFirebaseUid;
  if(myUid!==a&&myUid!==b) return null;
  const ackUids=rd.cupidRevealAckUids||[];
  if(ackUids.includes(myUid)) return null; // 我已經確認過了，不用再看這張卡片
  const partnerSeat=(myUid===a)?rd.cupidLoverBSeatNum:rd.cupidLoverASeatNum;
  return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>邱比特配對結果</h1>'
    +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">你的另一半是 '+partnerSeat+'號</p></div>'
    +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">你們其中一人以任何方式死亡，另一人都會立刻殉情陪葬。</div>'
    +'<button class="primary" style="margin-top:14px;" onclick="jgRoomCupidRevealAck('+night+')">我知道了</button>'};
}
window.jgRoomCupidRevealAck=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ cupidRevealAckUids: arrayUnion(window.jgFirebaseUid) },{ merge:true });
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const ackUids=fresh.cupidRevealAckUids||[];
  if(ackUids.includes(fresh.cupidLoverAUid)&&ackUids.includes(fresh.cupidLoverBUid)&&!fresh.cupidRevealDone){
    await setDoc(doc(db,'rooms',jgRoomCode),{ cupidRevealDone:true },{ merge:true });
    await jgRoomAdvanceToWolfOrBeyond('cupid', night);
  }
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 狼兄狼弟：第一夜兩人先互相確認身分（跟邱比特配對揭曉一樣，用雙方各自確認的卡片），
// 確認完狼兄才跟其餘狼人一同睜眼出刀（回到正常的 wolf 步驟），狼弟這時候還不進狼窩。
// 之後每一晚：狼兄若還活著，這一步只是單純帶過（狼弟這時完全沒有主動技能，直接自動往下
// 一步）；狼兄一旦陣亡，下一晚狼弟要單獨覺醒、被迫殺一人復仇（不可空刀，這一刀直接寫進
// wolfKillTargetUid，跟一般狼刀走同一套死亡結算），復仇完成之後狼弟才正式加入狼窩（見
// jgRoomGetWolfUids 的 wolfbrotherJoinedPack 判斷），從下一晚開始才會出現在正常的
// 狼隊出刀畫面裡，這個 wolfbrother 步驟之後就再也不會出現。
// ═══════════════════════════════════════════
async function jgRoomWolfbrotherIdentities(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const eDoc=secretsSnap.docs.find(d=>d.data().role==='wolfbrother_e');
  const yDoc=secretsSnap.docs.find(d=>d.data().role==='wolfbrother_y');
  return { elderUid: eDoc?eDoc.id:null, youngerUid: yDoc?yDoc.id:null };
}
async function jgRoomWolfbrotherViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const { elderUid, youngerUid }=await jgRoomWolfbrotherIdentities();
  if(!elderUid||!youngerUid){
    // 板子沒有配齊狼兄狼弟兩個角色（理論上不會發生，保險起見直接跳過）
    await jgRoomAdvanceToWolfOrBeyond('wolfbrother', night);
    return {needsTimer:false, html:''};
  }
  const elderSnap=await getDoc(doc(db2(),'rooms',jgRoomCode,'players',elderUid));
  const elderAlive=elderSnap.exists()?(elderSnap.data().alive!==false):true;
  if(night===1&&!rd.wolfbrotherIdRevealDone){
    // 第一夜互認：只有狼兄狼弟兩人看得到這張卡片，其他人一律看「夜晚進行中」。
    const myUid=window.jgFirebaseUid;
    if(myUid!==elderUid&&myUid!==youngerUid){
      return {needsTimer:false, html:'<div class="nbanner nbanner-night" style="margin-top:20px;"><h1>夜晚進行中</h1>'
        +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>'};
    }
    const ackUids=rd.wolfbrotherIdAckUids||[];
    if(ackUids.includes(myUid)){
      return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已確認身分</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
    }
    const myLabel=myUid===elderUid?'狼兄':'狼弟';
    const partnerSeat=jgRoomLatestPlayers.find(p=>p.uid===(myUid===elderUid?youngerUid:elderUid));
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>你是'+myLabel+'</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+(myLabel==='狼兄'?'狼弟':'狼兄')+'是 '+(partnerSeat?partnerSeat.seatNum:'?')+'號</p></div>'
      +'<button class="primary" style="margin-top:14px;" onclick="jgRoomWolfbrotherIdAck('+night+')">我知道了</button>'};
  }
  // 第二夜起：狼兄若已陣亡、狼弟還沒完成覺醒復仇，狼弟要被迫殺一人；其餘情況（狼兄還
  // 活著，或狼弟已經覺醒過、正式加入狼窩了）這一步都沒事可做，顯示確認按鈕直接跳過。
  if(night>=2&&!elderAlive){
    const youngerSnap=await getDoc(doc(db2(),'rooms',jgRoomCode,'players',youngerUid));
    const alreadyJoined=youngerSnap.exists()&&youngerSnap.data().wolfbrotherJoinedPack;
    if(!alreadyJoined){
      if(window.jgFirebaseUid!==youngerUid){
        return {needsTimer:false, html:'<div class="nbanner nbanner-night" style="margin-top:20px;"><h1>夜晚進行中</h1>'
          +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>'};
      }
      return {needsTimer:true, html:jgRoomTimerHtml(20,'狼兄已經陣亡，你要覺醒復仇殺誰？（不可空刀）')
        +'<div class="nbanner" style="margin-top:20px;"><h1>狼弟覺醒：必須殺一人復仇</h1></div>'
        +jgRoomNumGridHtml('jg-room-wolfbrother-revenge-pick', null, [(jgRoomLatestPlayers.find(p=>p.uid===youngerUid)||{}).seatNum])
        +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomWolfbrotherRevengeKillFromGrid('+night+')">確認</button></div>'};
    }
  }
  await jgRoomAdvanceToWolfOrBeyond('wolfbrother', night);
  return {needsTimer:false, html:''};
}
window.jgRoomWolfbrotherIdAck=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ wolfbrotherIdAckUids: arrayUnion(window.jgFirebaseUid) },{ merge:true });
  const { elderUid, youngerUid }=await jgRoomWolfbrotherIdentities();
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const ackUids=fresh.wolfbrotherIdAckUids||[];
  if(elderUid&&youngerUid&&ackUids.includes(elderUid)&&ackUids.includes(youngerUid)&&!fresh.wolfbrotherIdRevealDone){
    await setDoc(doc(db,'rooms',jgRoomCode),{ wolfbrotherIdRevealDone:true },{ merge:true });
    await jgRoomAdvanceToWolfOrBeyond('wolfbrother', night);
  }
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomWolfbrotherRevengeKillFromGrid=function(night){
  const hidden=document.getElementById('jg-room-wolfbrother-revenge-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomWolfbrotherRevengeKill(p.uid, seatNum, night);
};
window.jgRoomWolfbrotherRevengeKill=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ wolfbrotherJoinedPack:true },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:night, wolfKillTargetUid:effective, wolfKillTargetSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomAppendNightLog(night, '狼弟復仇刀 '+targetSeatNum);
  await jgRoomAfterKillDecided(night);
  await jgRoomRefreshAndRenderCurrent();
};
// 拿 Firestore db 實例的小工具，避免在同一段程式碼裡重複打 window.jgFirebaseDb。
function db2(){ return window.jgFirebaseDb; }

// ═══════════════════════════════════════════
// 黑市商人：狼隊出刀之後（避免跟狼刀同時進行時弄錯存活狀態）、女巫之前，整局限一次的
// 交易機會。選一名玩家＋選一項技能（預言家查驗／女巫毒藥／獵人獵槍）：對方是好人，交易
// 成功，對方變成「幸運兒」，從下一晚（查驗/毒藥）或下一個白天（獵槍）起可以使用；對方是
// 狼人，交易失敗，黑市商人自己死亡（結算在 jgRoomResolveNightDeaths，見 blackmarketFailUid）。
// 幸運兒的獵槍技能目前無法自動化（跟房間系統既有的「獵人開槍」限制一樣，請法官／房主用
// 本機工具手動處理），查驗／毒藥則會在之後對應的 seer／witch 步驟自動開放給幸運兒操作
// （見 jgRoomActiveLuckyOne／jgRoomMyActiveLuckyOneSkill）。
// ═══════════════════════════════════════════
async function jgRoomBlackmarketViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(me&&me.blackmarketUsed){
    await jgRoomAfterBlackmarketStep(night);
    return {needsTimer:false, html:''};
  }
  if(rd.blackmarketDoneNight===night){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const pendingUid=rd.blackmarketPendingUid;
  if(pendingUid){
    const pendingSeat=rd.blackmarketPendingSeatNum;
    return {needsTimer:true, html:jgRoomTimerHtml(20,'要給對方哪一項技能？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>已選 '+pendingSeat+'號，要給哪項技能？</h1></div>'
      +'<div style="text-align:center;margin-top:10px;">'
      +'<button onclick="jgRoomBlackmarketTrade(\'seer\','+night+')" style="margin:4px;">預言家查驗</button>'
      +'<button onclick="jgRoomBlackmarketTrade(\'witch\','+night+')" style="margin:4px;">女巫毒藥</button>'
      +'<button onclick="jgRoomBlackmarketTrade(\'hunter\','+night+')" style="margin:4px;">獵人獵槍</button>'
      +'</div>'
      +'<button style="margin-top:14px;" onclick="jgRoomBlackmarketModify()">重新選擇</button>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要交易嗎？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇交易對象（整局限一次）</h1></div>'
    +jgRoomNumGridHtml('jg-room-blackmarket-pick', null, [(jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid)||{}).seatNum])
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomBlackmarketPickTargetFromGrid('+night+')">確認</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomBlackmarketSkip('+night+')">今晚不交易，跳過</button></div>'};
}
window.jgRoomBlackmarketPickTargetFromGrid=function(night){
  const hidden=document.getElementById('jg-room-blackmarket-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomBlackmarketPickTarget(p.uid, seatNum, night);
};
window.jgRoomBlackmarketPickTarget=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    blackmarketPendingUid:targetUid, blackmarketPendingSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomBlackmarketModify=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ blackmarketPendingUid:null, blackmarketPendingSeatNum:null },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomBlackmarketSkip=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ blackmarketUsed:false },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode),{ blackmarketDoneNight:night },{ merge:true });
  await jgRoomAppendNightLog(night, '易 x');
  await jgRoomAfterBlackmarketStep(night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomBlackmarketTrade=async function(skill, night){
  const rd=jgRoomLatestRoomDoc||{};
  const targetUid=rd.blackmarketPendingUid, targetSeatNum=rd.blackmarketPendingSeatNum;
  const skillLabel=skill==='seer'?'預言家查驗':(skill==='witch'?'女巫毒藥':'獵人獵槍');
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const isWolf=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role));
  const skillAbbr={seer:'驗',witch:'毒',hunter:'獵'}[skill]||'';
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ blackmarketUsed:true },{ merge:true });
  if(isWolf){
    await setDoc(doc(db,'rooms',jgRoomCode),{
      blackmarketFailUid:window.jgFirebaseUid, blackmarketFailNight:night,
      blackmarketPendingUid:null, blackmarketPendingSeatNum:null, blackmarketDoneNight:night,
      blackmarketTradeNight:night
    },{ merge:true });
  } else {
    await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{
      luckyOneSkill:skill, luckyOneGrantedNight:night
    },{ merge:true });
    await setDoc(doc(db,'rooms',jgRoomCode),{
      blackmarketPendingUid:null, blackmarketPendingSeatNum:null, blackmarketDoneNight:night,
      blackmarketTradeNight:night
    },{ merge:true });
  }
  await jgRoomAppendNightLog(night, '易 '+targetSeatNum+(skillAbbr?'('+skillAbbr+')':''));
  await jgRoomAfterBlackmarketStep(night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 幸運兒（黑市商人交易來的）拿到「女巫毒藥」技能：只有毒藥、沒有解藥，整局限一次——跟
// jgRoomWitchViewHtml 幾乎一樣，但拿掉救人那一半，且直接沿用 jgRoomWitchFinish／
// witchActs（用自己的 uid 存，不會跟真正的女巫互相干擾）。
// ═══════════════════════════════════════════
async function jgRoomLuckyOneWitchViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const db=window.jgFirebaseDb;
  const actSnap=await getDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid));
  if(actSnap.exists()&&actSnap.data().night===night){
    const d=actSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+(d.poisonedSeatNum?('毒了 '+d.poisonedSeatNum+'號'):'這晚沒有使用毒藥')+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要使用毒藥嗎？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>你是幸運兒：使用毒藥（整局限一次）</h1></div>'
    +jgRoomNumGridHtml('jg-room-luckyonewitch-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomLuckyOneWitchPoisonFromGrid('+night+')">下毒</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomLuckyOneWitchSkip('+night+')">今晚不用，跳過</button></div>'};
}
window.jgRoomLuckyOneWitchPoisonFromGrid=function(night){
  const hidden=document.getElementById('jg-room-luckyonewitch-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomLuckyOneWitchPoison(p.uid, seatNum, night);
};
window.jgRoomLuckyOneWitchPoison=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchPoisonUid:effective, witchPoisonNight:night },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ luckyOneWitchUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '幸毒 '+targetSeatNum);
  await jgRoomWitchFinish(night, false, targetSeatNum);
};
window.jgRoomLuckyOneWitchSkip=async function(night){
  await jgRoomAppendNightLog(night, '幸毒 x');
  await jgRoomWitchFinish(night, false, null);
};

// ═══════════════════════════════════════════
// 夜槍：獵人、黑狼王、持有獵槍技能的幸運兒，被狼刀（含機械狼學到狼人/黑狼王的額外一刀）
// 淘汰時，可以開槍帶走一名玩家（留空不帶）——女巫毒殺、黑市商人交易失敗、攝夢人夢遊被動
// 連死、邱比特殉情這些死法都不算，見 jgRoomCheckShootEligible／jgRoomResolveNightDeaths
// 的說明。有資格的名單存在房間文件的 pendingShootUids（陣列，理論上大多數情況只有一人，
// 但同一晚機械狼額外一刀跟正常狼刀分別命中兩個都有開槍資格的人時，可能同時有兩人待決定），
// 每個人決定完（開槍或跳過）就從陣列移除，陣列清空後才會真的往下一步走。
// ═══════════════════════════════════════════
async function jgRoomShootViewHtml(night){
  const myUid=window.jgFirebaseUid;
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你被淘汰了，要開槍帶走一名玩家嗎？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>你被淘汰了，可以開槍帶走一人</h1></div>'
    +jgRoomNumGridHtml('jg-room-shoot-pick', null, [(jgRoomLatestPlayers.find(p=>p.uid===myUid)||{}).seatNum])
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomShootActFromGrid('+night+')">開槍</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomShootSkip('+night+')">不開槍</button></div>'};
}
window.jgRoomShootActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-shoot-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomShootAct(p.uid, seatNum, night);
};
window.jgRoomShootAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const mySeat=me?me.seatNum:'?';
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',window.jgFirebaseUid));
  const myRole=secretSnap.exists()?secretSnap.data().role:null;
  const meSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid));
  const meP=meSnap.exists()?meSnap.data():null;
  const isMechHunter=myRole==='mechanicalwolf'&&meP&&meP.mechWolfLearnedRole==='hunter';
  const abbr=myRole==='wolfking'?'王':(myRole==='hunter'?'獵':(isMechHunter?'機獵':'幸獵'));
  // 攝夢人的夢遊者一樣免疫夜槍（見 ALL_ROLES.dreamcatcher：「不會死於攝夢人以外的夜間
  // 技能(狼刀、巫毒、夜槍)」）——槍還是算開出去了（技能用掉），只是這一槍沒有打死人。
  const isDreaming=rd.dreamcatcherTargetNight===night&&rd.dreamcatcherTargetUid===targetUid;
  // 惡靈騎士免疫夜槍（白天開槍不受影響）。
  const ekImmune=rd.pendingShootContext==='night'&&(await jgRoomRoleOfUid(targetUid))==='evilknight';
  let note;
  if(ekImmune){
    note='（'+mySeat+abbr+'帶'+targetSeatNum+'，惡靈騎士免疫夜槍）';
  } else if(!isDreaming){
    // 夜槍（開槍的人自己是夜裡被狼刀/女巫毒死才觸發）要等天亮才能公布帶走的這個人；
    // 白天投票放逐後開槍則是當場公開，不用隱藏（見 jgRoomIsPubliclyDead 的說明）。
    await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{ alive:false, diedNight:rd.pendingShootContext==='night'?night:null },{ merge:true });
    await jgRoomApplyCupidCascade();
    note='（'+mySeat+abbr+'帶'+targetSeatNum+'）';
    // 被開槍帶走的是狼美人：魅惑對象殉情。
    const wbSeat=await jgRoomWolfbeautyCascade(targetUid, rd.pendingShootContext==='night'?night:null);
    if(wbSeat) note+='（狼美人殉情 '+wbSeat+'）';
  } else {
    note='（'+mySeat+abbr+'帶'+targetSeatNum+'，被夢遊免疫擋下）';
  }
  if(rd.pendingShootContext==='day') await jgRoomSetDayVoteShotNote(night, note);
  else await jgRoomAppendShotNoteToDayLog(night, note);
  await jgRoomShootResolve(night);
};
window.jgRoomShootSkip=async function(night){
  await jgRoomShootResolve(night);
};
async function jgRoomShootResolve(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ pendingShootUids: arrayRemove(window.jgFirebaseUid) },{ merge:true });
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  if(!(fresh.pendingShootUids||[]).length){
    // 夜裡被狼刀淘汰觸發的夜槍，決定完接回原本的夜晚流程（查驗類角色／警長競選，那條路徑
    // 已經內建警徽檢查了，見 jgRoomAdvanceToCheckOrSheriff）；白天被投票放逐觸發的槍，決定
    // 完除了要檢查警長是不是也被這一槍帶走（jgRoomCheckAndSetPendingBadge），沒有的話才
    // 真的進入下一夜。
    if(fresh.pendingShootContext==='day'){
      if(!(await jgRoomCheckAndSetPendingBadge())&&!(await jgRoomMaybeDeclareWin())){
        // 這一支手機就是白天投票放逐、決定完開槍與否的那位出局者本人（pendingShootUids
        // 只會包含他自己），直接用自己的座位號碼進遺言，理由跟 jgRoomResolveDayVote 那邊
        // 沒有開槍資格的分支一致。
        const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
        await jgRoomStartDayVoteLastWords(window.jgFirebaseUid, me?me.seatNum:null);
      }
    } else {
      await jgRoomAdvanceToCheckOrSheriff();
    }
  }
  // 用 jgRoomRenderCurrentPhase() 而不是直接呼叫 jgRoomRenderNightShell()：白天投票放逐
  // 觸發的槍，這個當下 phase 還是 'day-open'（見 jgRoomRenderDayOpen 開頭的槍決判斷），
  // 要交給總機判斷現在真正該顯示哪個畫面，不能寫死成夜晚畫面。
  jgRoomRenderCurrentPhase();
}

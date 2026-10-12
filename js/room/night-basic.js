'use strict';
// ═══════════════════════════════════════════
// js/room/night-basic.js
// 連線房間：夜晚共用小工具（選號格子、大字報、重新整理）、文字紀錄、守衛、女巫、狼隊出刀、大廳畫面。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// 夢魘／魔術師／攝夢人／機械狼——共用的小工具
// ═══════════════════════════════════════════
// 魔術師換流重新導向：如果這一晚魔術師交換了 A/B 兩個號碼，任何角色「原本想指定的目標
// uid」在真正生效（存進資料庫、影響死亡結算）之前，都要先經過這個函式轉換成「對方」的
// uid——跟本機法官助手 jgMagicSwapNum() 是同一套邏輯，只是這裡是用 uid 而不是座位號碼。
// 顯示給操作者自己看的「已選擇 X號」文字，要用他原本點的號碼（raw），不要用轉換後的結果
// ——他自己並不知道號碼被換過，只有天亮結算、跟魔術師板子介紹卡片會提到換流的存在。
// ── 圓點選號按鈕（比照本機法官助手 jgNumSelectHtml／jgNumGridPick 的視覺跟互動方式）：
//    點號碼只是「在這支手機上先選起來、變綠色」，不會馬上送出，要另外按「確認」才會真的
//    寫進資料庫——這樣使用者點錯可以自己改選，不用每點一次都跳出「確定嗎？」的對話框。
function jgRoomNumGridHtml(gridId, curSeatNum, extraDisabledSeats){
  const rd=jgRoomLatestRoomDoc||{};
  const alive=jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum);
  const extraDisabled=new Set(extraDisabledSeats||[]);
  let html='<input type="hidden" id="'+gridId+'" value="'+(curSeatNum||'')+'">'
    +'<div class="numgrid" id="'+gridId+'-grid" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px;">';
  alive.forEach(p=>{
    // 用 jgRoomIsPubliclyDead 而不是直接讀 p.alive：同一晚已經死於狼刀/女巫毒但死訊還沒
    // 公布的人，通靈師/預言家這類查驗角色還是要能選到，不能因為畫面提早知道「已死」而
    // 被畫叉選不到（那正是這一晚要查驗的重點，死訊本來就該等天亮才公布）。
    const dead=jgRoomIsPubliclyDead(p,rd)||extraDisabled.has(p.seatNum);
    const sel=curSeatNum===p.seatNum;
    html+='<button type="button" data-num="'+p.seatNum+'"'+(dead?' disabled':'')
      +' onclick="jgRoomNumGridPick(\''+gridId+'\','+p.seatNum+')"'
      +' style="width:auto;min-width:42px;height:42px;padding:0 8px;margin:0;border-radius:10px;font-size:14px;font-weight:700;'
      +(dead?'background:var(--bg4);color:var(--text3);text-decoration:line-through;':(sel?'background:var(--success,#2e7d32);color:#fff;border-color:transparent;':''))
      +'">'+p.seatNum+'</button>';
  });
  html+='</div>';
  return html;
}
window.jgRoomNumGridPick=function(gridId, seatNum){
  const hidden=document.getElementById(gridId);
  if(!hidden) return;
  const already=hidden.value&&parseInt(hidden.value)===seatNum;
  hidden.value=already?'':seatNum.toString();
  const grid=document.getElementById(gridId+'-grid');
  if(grid){
    grid.querySelectorAll('button').forEach(b=>{
      const isSel=!already&&b.getAttribute('data-num')===seatNum.toString();
      b.style.background=isSel?'var(--success,#2e7d32)':'';
      b.style.color=isSel?'#fff':'';
      b.style.borderColor=isSel?'transparent':'';
    });
  }
};

// ── 大字報（比照本機法官助手 jgShowBigCard，同樣是黑底滿版、超大字體）：機械狼學到身分
//    這種「一定要讓他看清楚、不會漏看」的重要訊息，用這個顯示會比塞在一般頁面裡的標題
//    醒目很多，手機上一眼就能看到「幾號、什麼身分」。──
function jgRoomShowBigCard(mainText, subText){
  let modal=document.getElementById('jg-room-bigcard-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='jg-room-bigcard-modal';
    modal.style.cssText='position:fixed;inset:0;background:#0a0a0a;color:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;overflow-y:auto;';
    document.body.appendChild(modal);
  }
  modal.innerHTML='<div style="font-size:14vw;font-weight:900;line-height:1.15;word-break:break-word;">'+mainText+'</div>'
    +(subText?'<div style="font-size:8vw;font-weight:800;margin-top:18px;color:#ffd166;">'+subText+'</div>':'')
    +'<button onclick="document.getElementById(\'jg-room-bigcard-modal\').remove()" style="width:auto;margin-top:48px;padding:14px 36px;font-size:18px;border-radius:12px;border:none;background:#fff;color:#111;font-weight:700;flex-shrink:0;">關閉</button>';
}

// ── 夜晚各種行動函式（提議/救人/查驗...）寫完資料庫之後，原本都是直接呼叫
//    jgRoomRenderNightShell() 重新渲染——但那個函式讀的是 jgRoomLatestRoomDoc 這份畫面
//    快取，快取要等即時監聽器（onSnapshot）收到剛剛那筆寫入才會更新。如果監聽器沒有
//    馬上跟上（例如瀏覽器剛跳出 confirm() 對話框、網路狀況不穩），畫面會停在寫入之前的
//    舊狀態，感覺就像卡住、要手動重新整理頁面才會恢復正常（這是這次抓到、確認過的真正
//    問題）。這裡統一改成「自己重新讀一次資料庫最新狀態、更新快取，再交給總機判斷現在
//    真正該顯示哪個畫面」，不要只憑空呼叫 jgRoomRenderNightShell()（那個假設現在還在
//    夜晚，但這個動作也可能剛好是這一夜最後一步、已經進入白天了，用 jgRoomRenderCurrentPhase()
//    才會正確判斷現在到底該顯示夜晚、白天、投票，還是警長競選畫面）。
async function jgRoomRefreshAndRenderCurrent(){
  const db=window.jgFirebaseDb;
  try{
    const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
    if(freshSnap.exists()) jgRoomLatestRoomDoc=freshSnap.data();
  }catch(e){
    // 這裡以前是完全吞掉錯誤（catch(e){}），任何讀取失敗（權限被擋、網路問題...）都會
    // 無聲無息地被蓋過去，接下來還是照樣用可能是舊的 jgRoomLatestRoomDoc 硬渲染下去——
    // 這個函式在整個房間系統裡被呼叫超過30次，幾乎每個動作按鈕的最後一步都會呼叫它，
    // 如果真正的問題出在這裡，先前完全看不出任何痕跡。這裡改成至少印到瀏覽器主控台，
        // 方便之後如果還有類似的「按了沒反應」的回報，可以請對方打開主控台看看有沒有這行。
    console.error('jgRoomRefreshAndRenderCurrent 讀取房間資料失敗', e);
  }
  await jgRoomRenderCurrentPhase();
}

function jgRoomEffectiveTarget(rd, night, uid){
  if(!uid) return uid;
  if(rd.magicianSwapNight===night&&rd.magicianSwapAUid&&rd.magicianSwapBUid){
    if(uid===rd.magicianSwapAUid) return rd.magicianSwapBUid;
    if(uid===rd.magicianSwapBUid) return rd.magicianSwapAUid;
  }
  return uid;
}
// 夢魘恐懼：查我自己（目前正在看這個畫面的人）今晚是不是被恐懼了，是的話這個角色今晚
// 完全無法行動（不會看到任何操作介面）。狼隊比較特別——恐懼到「任何一位狼隊友」時，
// 全隊當晚都不能殺人，所以狼隊出刀畫面另外用 rd.nightmareFearedIsWolf 判斷，不是用這個。
function jgRoomAmIFeared(rd, night){
  return !!(rd.nightmareFearedNight===night&&rd.nightmareFearedUid===window.jgFirebaseUid);
}
function jgRoomFearedNoticeHtml(){
  return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>你今晚被恐懼了</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">夢魘今晚恐懼了你，你這一晚無法發動任何技能，請安靜等待。</div>'};
}
// ═══════════════════════════════════════════
// 文字紀錄：格式比照本機法官助手的匯出格式（見 core.js 的 jgFormatNightLog／
// jgExportGameLog），每一晚的行動一發生就存一行進 rooms/{code}/nightLog/{night} 這份文件
// 的 lines 陣列（用 arrayUnion，不會覆蓋之前存的），這樣上帝視角才能捲動看到「歷史上每一
// 晚」發生了什麼，不會因為換到下一夜、房間文件裡那些會被覆寫的即時欄位（wolfKillTargetSeatNum
// 之類）被蓋掉就跟著不見。白天的死訊／警長競選／放逐投票 block 存在 rooms/{code}/dayLog/{night}，
// 讀取時再搭配 votingRoundLog／votes（已經是按輪次分開存的歷史資料，見放逐投票功能那次的
// 修正）組成完整的 block。行的縮寫盡量比照本機格式（恐/換/守/夢/機學/刀/易/救/毒/驗/通驗/
// 邱…），但這裡只實作房間系統目前真的有自動化的角色，本機法官助手支援、房間系統還沒做的
// 角色（狼美人魅惑、惡靈騎士夜間免疫、守墓人查驗…）不會出現在這份紀錄裡。
// ═══════════════════════════════════════════
async function jgRoomAppendNightLog(night, line){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'nightLog',String(night)),{ lines: arrayUnion(line) },{ merge:true });
}
async function jgRoomSetDayDeathLine(night, line){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)),{ deathLine: line },{ merge:true });
}
// 開槍帶人的結果——分兩種情境，用不同欄位存，因為代表的是不同事件：
// 「夜槍」（context='night'，獵人/黑狼王/幸運兒被狼刀淘汰後開的槍）要補在當晚死訊那一句
// 後面，所以先暫存進 shotNotes 陣列（arrayUnion，可能不只一槍，例如狼刀跟機械狼額外一刀
// 同晚分別命中兩個有資格開槍的人），等 jgRoomCaptureDeathLine 組死訊那一行的時候再讀出來
// 接在後面——槍一定比死訊早結算完（開槍畫面會卡住流程，一定要等槍決定完才會往下走進入
// jgRoomAdvanceToDayPhase／jgRoomCaptureDeathLine，見 jgRoomAdvanceToCheckOrSheriff 的
// pendingShootUids 判斷），所以這裡不用擔心寫入順序顛倒。
// 「白天槍」（context='day'，被放逐投票出局後開的槍）是當天發生的新事件，不是在講昨晚死訊，
// 所以另外存一個欄位 voteShotNote，白天投票 block 顯示的時候單獨列一行。
async function jgRoomAppendShotNoteToDayLog(night, note){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)),{ shotNotes: arrayUnion(note) },{ merge:true });
}
async function jgRoomSetDayVoteShotNote(night, note){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)),{ voteShotNote: note },{ merge:true });
}
// 邱比特／守衛／攝夢人／狼兄狼弟／機械狼結束後，接下來該往哪一步——用
// jgRoomNextNightStep() 從指定步驟之後開始找，避免各自硬寫下一步名稱、改順序時到處都要
// 跟著改。night 一定要傳進來，邱比特那個「只有第一夜出現」的判斷才會正確。
async function jgRoomAdvanceToWolfOrBeyond(fromStep, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:jgRoomNextNightStep(fromStep, night) },{ merge:true });
}

// ── 守衛：狼隊出刀之前先盲守（不知道狼隊會殺誰），保護對象免疫當晚狼刀——除非女巫也
//    同時救了同一個人（奶穿，還是會死）。不能連續兩晚守同一人，這個限制要跨夜記住，
//    存在守衛自己的 players/{uid}.lastGuardTargetUid 上，不會因為換到下一夜就重置。──
async function jgRoomGuardViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  if(rd.guardTargetNight===night&&rd.guardProtectedSeatNum!=null){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已選擇守護</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+rd.guardProtectedSeatNum+'號</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const lastTarget=me?me.lastGuardTargetUid:null;
  const lastTargetSeat=lastTarget?(jgRoomLatestPlayers.find(p=>p.uid===lastTarget)||{}).seatNum:null;
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要守護的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇守護對象</h1></div>'
    +(lastTarget?'<div class="info" style="font-size:12px;text-align:center;">不能連續兩晚守護同一人（'+lastTargetSeat+'號），上一晚守護的對象已排除</div>':'')
    +jgRoomNumGridHtml('jg-room-guard-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomGuardActFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomGuardActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-guard-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  const me=jgRoomLatestPlayers.find(pp=>pp.uid===window.jgFirebaseUid);
  if(me&&me.lastGuardTargetUid===p.uid){ alert('不能連續兩晚守護同一人，請選別人'); return; }
  window.jgRoomGuardAct(p.uid, seatNum, night);
};
window.jgRoomGuardAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    guardTargetNight:night, guardProtectedUid:effective, guardProtectedSeatNum:targetSeatNum
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastGuardTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '守 '+targetSeatNum);
  await jgRoomAdvanceToWolfOrBeyond('guard', night);
  await jgRoomRefreshAndRenderCurrent();
};

// ── 女巫：狼隊確認出刀之後才輪到女巫，她會看到狼隊今晚殺了誰，可以選擇用解藥救（自己
//    被殺不能自救）、用毒藥毒任何一人，或都不用；解藥/毒藥各自整局限一次，這個限制要
//    跨夜記住，存在女巫自己的 players/{uid}.witchSaveUsed／witchPoisonUsed 上。這一版
//    簡化成「一晚只能選一種行動」（救、毒、跳過三選一），不支援同一晚又救又毒。──
async function jgRoomWitchViewHtml(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  // 女巫已經出局：比照本機法官助手（steps.js witch-wake 的「若女巫已出局」分支）——仍然要
  // 走完整套流程避免洩露身分，但不能讓她知道今晚狼刀殺了誰、也不能透露解藥/毒藥還有沒有，
  // 兩個問題照樣問一次，直接給一顆「下一步」讓她（其實是不會真的動作）翻過這一步就好，不
  // 顯示任何「（法官搖頭）」之類會暗示存活狀態或藥剩餘量的提示。
  // 這裡要用 jgRoomIsPubliclyDead 而不是直接讀 deadMe.alive——如果這個角色是「這一晚」
  // 才被狼刀/女巫毒殺（死訊還沒公布），alive 已經被提早寫成 false 了，但依照規則，同一晚
  // 的夜間行動都算「同時發生」，這一晚才死的人這一晚自己的技能還是要能正常使用，只有
  // 「已經是前幾晚就死掉、死訊早就公布過」的人才要走這個「假裝還在走流程」的分支。
  const deadMe=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(deadMe&&jgRoomIsPubliclyDead(deadMe,rd)){
    const deadActSnap=await getDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid));
    if(deadActSnap.exists()&&deadActSnap.data().night===night){
      return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
    }
    return {needsTimer:true, html:jgRoomTimerHtml(20,'你要使用解藥或毒藥嗎？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>女巫請睜眼</h1></div>'
      +'<div class="speech" style="text-align:center;">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>'
      +'<div class="speech" style="text-align:center;margin-top:10px;">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」</div>'
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomWitchSkip('+night+')">下一步 →</button></div>'};
  }
  const actSnap=await getDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid));
  if(actSnap.exists()&&actSnap.data().night===night){
    const d=actSnap.data();
    const summary=d.saved?('救了 '+rd.wolfKillTargetSeatNum+'號'):(d.poisonedSeatNum?('毒了 '+d.poisonedSeatNum+'號'):'這晚沒有使用任何藥');
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+summary+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const saveUsed=!!(me&&me.witchSaveUsed);
  const poisonUsed=!!(me&&me.witchPoisonUsed);
  const wolfTargetUid=rd.wolfKillTargetUid;
  const wolfTargetSeatNum=rd.wolfKillTargetSeatNum;
  const canSaveThis=wolfTargetUid&&!saveUsed&&wolfTargetUid!==window.jgFirebaseUid;
  const targetP=wolfTargetUid?jgRoomLatestPlayers.find(p=>p.uid===wolfTargetUid):null;
  // 解藥一旦用完，之後每一晚都不能再讓女巫知道狼隊殺了誰（不管救不救得到都一樣）——參考
  // 本機法官助手 steps.js witch-wake 的 canShowKilled：第一夜一定會告知（那時不可能已經
  // 用完解藥），之後只要解藥還沒用過才會告知，解藥用完之後一律只講台詞、搖頭帶過，不
  // 透露今晚是否真的有人死、死了誰，避免女巫變相從「有沒有被告知死訊」反推誰被殺。
  const canShowKilled=night===1||!saveUsed;
  // 畫面樣式比照本機法官助手的女巫睜眼畫面：有人被殺時用醒目的紅色提示框顯示座位＋姓名，
  // 平安夜則只用一行淡淡的文字帶過（見 .killed-box／.killed-label／.killed-num／
  // .killed-name 這幾個既有的 CSS class，本機那邊本來就在用，這裡直接沿用同一套視覺）。
  let html=jgRoomTimerHtml(20,'你要使用解藥或毒藥嗎？');
  if(!canShowKilled){
    html+='<div class="nbanner" style="margin-top:20px;"><h1>女巫請睜眼</h1></div>'
      +'<div class="speech" style="text-align:center;">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:4px;">（法官搖頭）解藥用完</div>';
  } else if(wolfTargetSeatNum){
    html+='<div class="killed-box"><div class="killed-label">今晚被狼人殺死</div>'
      +'<div class="killed-num">'+wolfTargetSeatNum+'號</div>'
      +(targetP&&targetP.name?'<div class="killed-name">'+targetP.name+'</div>':'')+'</div>'
      +'<div class="speech" style="text-align:center;">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>';
  } else {
    html+='<div class="nbanner" style="margin-top:20px;"><h1>女巫請睜眼</h1></div>'
      +'<div class="speech" style="text-align:center;">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:4px;color:var(--text2);">（今晚無人死亡）</div>';
  }
  if(canShowKilled&&canSaveThis){
    html+='<div style="text-align:center;margin-top:10px;"><button class="primary" style="width:auto;display:inline-block;padding:10px 16px;" onclick="jgRoomWitchSave('+wolfTargetSeatNum+','+night+')">使用解藥救 '+wolfTargetSeatNum+'號</button></div>';
  } else if(canShowKilled&&wolfTargetUid&&wolfTargetUid===window.jgFirebaseUid){
    html+='<div class="info-warn" style="text-align:center;margin-top:10px;">被殺的是你自己，不能自救（搖頭）</div>';
  }
  html+='<div class="speech" style="text-align:center;margin-top:14px;">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」</div>';
  if(!poisonUsed){
    html+=jgRoomNumGridHtml('jg-room-witch-poison-pick', null)
      +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomWitchPoisonFromGrid('+night+')">下毒</button></div>';
  } else {
    html+='<div class="info" style="font-size:12px;text-align:center;margin-top:6px;">（法官搖頭）毒藥用完</div>';
  }
  html+='<div style="text-align:center;"><button style="margin-top:14px;" onclick="jgRoomWitchSkip('+night+')">都不用，跳過</button></div>';
  return {needsTimer:true, html:html};
}
window.jgRoomWitchSave=async function(targetSeatNum, night){
  const db=window.jgFirebaseDb;
  // 這裡以前是讀 jgRoomLatestRoomDoc（畫面快取）拿 wolfKillTargetUid，沒有用 targetSeatNum
  // 這個「使用者實際點的是哪個座位」來源核對——如果快取剛好跟畫面顯示時不一樣（例如即時
  // 監聽器在「畫面畫出來」跟「使用者按下按鈕」這兩個時間點之間收到了新資料），會變成
  // 「救的其實不是畫面上顯示、玩家點的那個人」，玩家看起來明明救了、實際上救的 uid 卻
  // 對不上，天亮死訊自然對不起來。改成重新讀一次資料庫最新狀態，並且拿使用者實際點的
  // 座位（targetSeatNum）去核對，確保存進去的 witchSavedUid 真的是玩家看到、點下去的
  // 那個人，不是憑空信任一份可能已經過期的快取。
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const targetP=jgRoomLatestPlayers.find(p=>p.seatNum===targetSeatNum);
  if(!targetP||fresh.wolfKillTargetUid!==targetP.uid){
    alert('目標已經改變（可能是頁面資料還沒同步完成），請重新整理頁面再試一次，避免救錯人。');
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchSavedUid: fresh.wolfKillTargetUid, witchSavedNight: night },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ witchSaveUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '救 '+targetSeatNum);
  await jgRoomAppendNightLog(night, '毒 x');
  await jgRoomWitchFinish(night, true, null);
};
window.jgRoomWitchPoisonFromGrid=function(night){
  const hidden=document.getElementById('jg-room-witch-poison-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomWitchPoison(p.uid, seatNum, night);
};
window.jgRoomWitchPoison=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchPoisonUid: effective, witchPoisonNight: night },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ witchPoisonUsed:true },{ merge:true });
  if(rd.wolfKillTargetSeatNum) await jgRoomAppendNightLog(night, '救 x');
  await jgRoomAppendNightLog(night, '毒 '+targetSeatNum);
  await jgRoomWitchFinish(night, false, targetSeatNum);
};
window.jgRoomWitchSkip=async function(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.wolfKillTargetSeatNum) await jgRoomAppendNightLog(night, '救 x');
  await jgRoomAppendNightLog(night, '毒 x');
  await jgRoomWitchFinish(night, false, null);
};
async function jgRoomWitchFinish(night, saved, poisonedSeatNum){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid),{
    night:night, saved:saved, poisonedSeatNum:poisonedSeatNum
  });
  await jgRoomResolveNightDeaths();
  await jgRoomAdvanceToCheckOrSheriff();
  await jgRoomRefreshAndRenderCurrent();
}


// 場上存活的狼隊 uid 清單（含自己）——用來算「全員確認」需要幾票。secrets 全房可讀，
// 房間人數又小，這裡直接整個抓下來、用 WOLF_ROLES 判斷即可，不用另外維護一份陣營索引。
// 夢魘、機械狼雖然也算在 WOLF_ROLES 陣營裡，但這兩個角色都「不與狼隊一同睜眼商議」——
// 夢魘有自己獨立的恐懼步驟（排在最前面），機械狼平常也是自己單獨睜眼（見 jgRoomMechWolfViewHtml，
// 只有其餘狼隊友全滅時才會由它自己的畫面接手出刀），這裡把這兩個角色從「狼隊出刀」名單裡
// 排除，避免他們被誤算進「狼隊出刀全員確認」的人數、或被叫去跟大家一起商議刀口。
async function jgRoomGetWolfUids(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  return secretsSnap.docs.filter(d=>{
    const role=d.data().role;
    if(typeof WOLF_ROLES==='undefined'||!WOLF_ROLES.includes(role)) return false;
    if(role==='nightmare'||role==='mechanicalwolf') return false;
    // 狼弟在正式覺醒、完成復仇刀之前都不算進狼隊出刀名單（見 ALL_ROLES.wolfbrother_y：
    // 「覺醒當晚仍不入狼窩」）——這裡用 wolfbrotherJoinedPack 這個旗標判斷，由狼弟完成
    // 復仇刀那一刻設定（見 window.jgRoomWolfbrotherRevengeKill）。
    if(role==='wolfbrother_y'){
      const p=jgRoomLatestPlayers.find(pp=>pp.uid===d.id);
      return !!(p&&p.wolfbrotherJoinedPack);
    }
    return true;
  // 只算「還活著」的狼隊友——這是這次抓到的真正 bug：之前這裡沒有濾掉死掉的狼隊友，
  // 「全員到齊了嗎」的人數（wolfCount）會把已經死掉、永遠不可能再按確認的隊友也算進去，
  // 狼隊只要死過一個人，活著的狼就算全部按了確認，人數也永遠湊不滿，直接卡死出不去。
  }).filter(d=>{
    const p=jgRoomLatestPlayers.find(pp=>pp.uid===d.id);
    return !p||p.alive!==false; // 找不到玩家資料時保守當作還活著，不要誤判卡住
  }).map(d=>d.id);
}
// 給 js/voice.js（語音通話）判斷「狼隊出刀商議時，這個人算不算聽得到聲音的見面狼」用——
// 這份名單跟上面 jgRoomGetWolfUids()（出刀確認投票用的名單）刻意不是同一份：使用者
// 明確指定語音上「聽得到」跟「參與出刀確認」是兩種不同的分類，例如夢魘不參與出刀確認
// 投票，但語音上要聽得到狼隊商議；狼弟在正式覺醒、加入狼隊之前完全不跟狼隊一起商議，
// 語音上永遠聽不到（不像出刀名單那樣覺醒後才加入）。目前 WOLF_ROLES 裡還有 mask／
// bigmechwolf／smallmechwolf／trickster 這幾個房間系統還沒實作、使用者也沒有指定的
// 角色，先保守歸類為「聽不到」，之後如果房間系統支援這些角色、使用者也確認了聽覺分類，
// 再加進來即可。
const JG_ROOM_VOICE_FACE_WOLF_ROLES=new Set([
  'wolf','wolfking','whitewolf','nightmare','wolfbrother_e',
  'bloodmoon','evilknight','wolfbeauty','wolfshaman','bigbadwolf'
]);
window.jgRoomGetFaceWolfUidsAsync=async function(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  return secretsSnap.docs.filter(d=>JG_ROOM_VOICE_FACE_WOLF_ROLES.has(d.data().role)).map(d=>d.id);
};
window.jgRoomIsNightWolfStepNow=function(){
  const rd=jgRoomLatestRoomDoc||{};
  return rd.phase==='night'&&rd.currentStep==='wolf';
};
// 機械狼獨自帶刀的條件：其餘「真正跟狼隊一起睜眼」的隊友（jgRoomGetWolfUids 排除掉機械狼
// 自己跟夢魘之後剩下的那些人）全部死亡——跟本機法官助手 jgMechWolf2KillEligible／
// jgAfterGargoyleStep 系列判斷同一套邏輯的房間版本。
async function jgRoomMechWolfKillEligible(){
  const otherWolfUids=(await jgRoomGetWolfUids());
  if(otherWolfUids.length===0) return true; // 板子裡根本沒有配置一般狼人，機械狼從一開始就是唯一的刀口來源
  return otherWolfUids.every(uid=>{
    const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid);
    return p&&p.alive===false;
  });
}
// 黑市商人是不是已經交易過（整局限一次）——查 secrets 找出誰是黑市商人，再讀他自己
// player 文件上的 blackmarketUsed 旗標。板子根本沒有黑市商人時回傳 true，讓呼叫端
// 直接把這一步當作「已經沒事可做」跳過。
async function jgRoomBlackmarketUsed(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const bmDoc=secretsSnap.docs.find(d=>d.data().role==='blackmarket');
  if(!bmDoc) return true;
  const p=jgRoomLatestPlayers.find(pp=>pp.uid===bmDoc.id);
  return !!(p&&p.blackmarketUsed);
}

// ── 狼隊出刀畫面：只有一隻見面狼時，選定並確認就是最終決定；不只一隻見面狼時，任何一位
//    先提議一個目標，其餘隊友的畫面會看到「已確認 X/Y 人」，各自按確認表態，全員確認完
//    才真的結算、往下一步（見下面 jgRoomWolfPropose／jgRoomWolfConfirm／jgRoomWolfFinalize
//    這一串）。──
let jgRoomWolfFinalizing=false; // 避免「全員到齊」的結算邏輯被同時觸發兩次（見下方註解）
// 「一次操作背後有好幾筆連續寫入」的函式（狼隊出刀是目前最明顯的例子）用這個旗標暫時
// 請即時監聽器不要跟著每一筆中間寫入重畫畫面（見 jgRoomEnterLobby 裡監聽器的說明），
// 等整串操作都做完再自己呼叫一次重新渲染。務必用 try/finally 包起來，確保不管中途有沒有
// 出錯，這個旗標最後都會被重設回 false，不會讓畫面從此卡死不再跟著監聽器更新。
let jgRoomSuppressAutoRender=false;
let jgRoomNightmareWolfSkipping=false; // 避免「夢魘恐懼到狼隊友、狼隊今晚不能殺人」的自動跳過邏輯被同時觸發兩次
async function jgRoomWolfViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  // 夢魘恐懼到狼隊某位隊友時，狼隊當晚不得殺人——不管是誰的畫面先渲染到，都會觸發這個
  // 自動跳過（idempotent：重複觸發也只是把同樣的值再寫一次，無害），不用等狼隊自己討論。
  if(rd.nightmareFearedNight===night&&rd.nightmareFearedIsWolf){
    if(!jgRoomNightmareWolfSkipping){
      jgRoomNightmareWolfSkipping=true;
      try{
        const db=window.jgFirebaseDb;
        await setDoc(doc(db,'rooms',jgRoomCode),{
          wolfKillNight:night, wolfKillTargetUid:null, wolfKillTargetSeatNum:null
        },{ merge:true });
        await jgRoomAfterKillDecided(night);
      } finally { jgRoomNightmareWolfSkipping=false; }
    }
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>狼隊今晚無法殺人</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">夢魘恐懼了狼隊的一位成員，今晚是平安夜，請安靜等待。</div>'};
  }
  // 唯鄰是從：第一夜狼隊要先選好傀儡，才能選今晚要殺的對象。
  if(night===1&&jgRoomIsPuppetBoard()&&!rd.puppetUid) return await jgRoomPuppetViewHtml(night);
  // 板子上不只一隻真正見面的狼時，回到「全員確認」流程：任何一位隊友先提議一個目標，
  // 其餘隊友的畫面會看到「今晚要殺X號、已確認Y/Z人」，各自按確認表態，全部確認完才會
  // 真的結算、往下一步——這是這次房主調整過 Firestore 安全規則之後，確認根本問題是
  // 規則擋住好幾個子集合的寫入（不是這裡的邏輯本身），才恢復的原始設計；只有一隻狼的
  // 情況還是提議完直接結算，不用等自己按第二次。
  if(rd.wolfKillNight===night&&rd.wolfKillTargetSeatNum!=null){
    const confirmedBy=rd.wolfKillConfirmedBy||[];
    const iConfirmed=confirmedBy.includes(window.jgFirebaseUid);
    const wolfUids=await jgRoomGetWolfUids();
    const hostOverrideHtml2=jgRoomIsHost
      ?'<div style="margin-top:16px;"><button style="font-size:12px;color:var(--text3);" onclick="jgRoomHostForceAdvanceWolf('+night+')">⚠️ 卡住了？房主強制往下一步</button></div>'
      :'';
    return {needsTimer:true, html: jgRoomTimerHtml(30,'今晚要殺的對象是？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>今晚要殺 '+rd.wolfKillTargetSeatNum+'號</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">已確認 '+confirmedBy.length+' / '+wolfUids.length+' 人</p></div>'
      +'<div style="text-align:center;margin-top:10px;">'
      +(iConfirmed?'<div class="info" style="font-size:12px;">你已經確認了，等待其他隊友</div>':'<button class="primary" onclick="jgRoomWolfConfirm()" style="width:auto;display:inline-block;padding:10px 20px;">確認</button>')
      +'<button onclick="jgRoomWolfModify()" style="margin-left:8px;width:auto;display:inline-block;padding:10px 20px;">修改</button>'
      +'</div>'+hostOverrideHtml2};
  }
  const hostOverrideHtml=jgRoomIsHost
    ?'<div style="text-align:center;margin-top:16px;"><button style="font-size:12px;color:var(--text3);" onclick="jgRoomHostForceAdvanceWolf('+night+')">⚠️ 卡住了？房主強制往下一步</button></div>'
    :'';
  return {needsTimer:true, html: jgRoomTimerHtml(30,'今晚要殺的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇今晚要殺的對象</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;">只有一隻狼的話，選定並確認後就是最終決定；不只一隻狼要全員確認才會真的定案</div>'
    +(rd.puppetUid&&jgRoomIsPuppetBoard()&&night===1?'<div class="info" style="font-size:12px;text-align:center;">傀儡：'+rd.puppetSeatNum+'號</div>':'')
    +jgRoomNumGridHtml('jg-room-wolf-pick', null, await jgRoomNoSelfKnifeSeats())
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomWolfProposeFromGrid('+night+')">確認</button></div>'
    +hostOverrideHtml};
}
// 讀圓點號碼格選到的座位，換算成 uid 之後照原本的提議流程送出（見 jgRoomWolfPropose）。
window.jgRoomWolfProposeFromGrid=function(night){
  const hidden=document.getElementById('jg-room-wolf-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomWolfPropose(p.uid, seatNum, night);
};
// 房主強制把卡住的狼隊出刀步驟往下推進——不管當下有沒有人選好目標，一律當成「今晚沒有
// 選定目標」直接往下一步走（平安夜），寧可讓法官事後用口頭方式確認實際結果，也不要讓
// 整場遊戲卡死在這裡出不去。
window.jgRoomHostForceAdvanceWolf=async function(night){
  if(!confirm('確定要強制跳過狼隊出刀嗎？這會把今晚視為「沒有選定目標」，直接往下一步。')) return;
  const db=window.jgFirebaseDb;
  // 按下確認鈕前，狼隊很可能已經在其他裝置上完成出刀、往下一步了——這顆按鈕最常見的
  // 誤觸情境正是「30秒倒數走完、畫面看起來像卡住了」，但其實狼隊剛好也是這時候才按下
  // 確認，出刀已經定案。這裡按下去之後先重讀一次最新資料庫狀態，如果已經不在 wolf 這一步
  // （代表狼刀其實已經結算過了），就什麼都不做，避免用「沒有選定目標」把已經定案的狼刀
  // 結果蓋成平安夜，導致女巫頁面明明顯示有殺到人、天亮卻播報平安夜的不一致。
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  if(fresh.currentStep!=='wolf'){ await jgRoomRefreshAndRenderCurrent(); return; }
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:night, wolfKillTargetUid:null, wolfKillTargetSeatNum:null
  },{ merge:true });
  await jgRoomAfterKillDecided(night);
  await jgRoomRefreshAndRenderCurrent();
};
// 提議一個目標：只有自己算進確認名單。如果狼隊只有自己一個人，這一寫完就已經是「全員
// 到齊」，直接結算、往下一步；不只一隻狼的話，其餘隊友的畫面會看到「已確認1/N人」，
// 各自按確認表態。整個函式包一層 try/catch，把任何失敗（例如 Firestore 權限被擋、網路
// 斷線）都用 alert 明確講出來，不要無聲無息地消失。
window.jgRoomWolfPropose=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  try{
    const preCheckSnap=await getDoc(doc(db,'rooms',jgRoomCode));
    const preCheck=preCheckSnap.data()||{};
    if(preCheck.currentStep!=='wolf'){
      jgRoomLatestRoomDoc=preCheck;
      await jgRoomRefreshAndRenderCurrent();
      return;
    }
    jgRoomSuppressAutoRender=true;
    try{
      const myConfirmedList=[window.jgFirebaseUid];
      await setDoc(doc(db,'rooms',jgRoomCode),{
        wolfKillNight:night, wolfKillTargetUid:effective, wolfKillTargetSeatNum:targetSeatNum,
        wolfKillProposedBy:window.jgFirebaseUid, wolfKillConfirmedBy:myConfirmedList
      },{ merge:true });
      const wolfUids=await jgRoomGetWolfUids();
      if(myConfirmedList.length>=wolfUids.length&&!jgRoomWolfFinalizing){
        jgRoomWolfFinalizing=true;
        try{ await jgRoomWolfFinalize(); } finally { jgRoomWolfFinalizing=false; }
      }
    } finally { jgRoomSuppressAutoRender=false; }
    await jgRoomRefreshAndRenderCurrent();
  }catch(err){
    jgRoomSuppressAutoRender=false;
    jgRoomWolfFinalizing=false;
    alert('狼隊出刀時發生錯誤，請把這段文字截圖給法官：\n'+(err&&err.message?err.message:String(err)));
    console.error('jgRoomWolfPropose error', err);
  }
};
window.jgRoomWolfModify=async function(){
  if(!confirm('確定要修改嗎？會清空所有人的確認。')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:null, wolfKillTargetUid:null, wolfKillTargetSeatNum:null,
    wolfKillProposedBy:null, wolfKillConfirmedBy:[]
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
// 用 arrayUnion 而不是「先讀陣列、自己加一個、再整份寫回去」，是為了避免兩位隊友幾乎
// 同時按確認時，其中一人的確認被另一人的寫入覆蓋掉、憑空少一票的競態問題。
window.jgRoomWolfConfirm=async function(){
  const db=window.jgFirebaseDb;
  try{
    jgRoomSuppressAutoRender=true;
    try{
      await setDoc(doc(db,'rooms',jgRoomCode),{
        wolfKillConfirmedBy: arrayUnion(window.jgFirebaseUid)
      },{ merge:true });
      const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
      const fresh=freshSnap.data()||{};
      const wolfUids=await jgRoomGetWolfUids();
      const confirmedBy=fresh.wolfKillConfirmedBy||[];
      if(confirmedBy.length>=wolfUids.length&&fresh.wolfKillTargetUid&&!jgRoomWolfFinalizing){
        jgRoomWolfFinalizing=true;
        try{ await jgRoomWolfFinalize(); } finally { jgRoomWolfFinalizing=false; }
      }
    } finally { jgRoomSuppressAutoRender=false; }
    await jgRoomRefreshAndRenderCurrent();
  }catch(err){
    jgRoomSuppressAutoRender=false;
    jgRoomWolfFinalizing=false;
    alert('確認出刀時發生錯誤，請把這段文字截圖給法官：\n'+(err&&err.message?err.message:String(err)));
    console.error('jgRoomWolfConfirm error', err);
  }
};
// 狼刀目標（不管是狼隊選出的、還是夢魘恐懼導致的平安夜、還是機械狼獨自接管出刀、還是
// 回合（見 ALL_ROLES.blackmarket：黑市商人可以在任一晚交易，這裡簡化成固定排在狼刀之後、
// 女巫之前，法官／房主如果想在更早的夜晚交易，一樣可以正常運作，只是畫面出現的時間點
// 固定，不像本機法官助手可以每晚都問）；沒有黑市商人（或已經用過）就接 jgRoomAfterBlackmarketStep。
async function jgRoomAfterKillDecided(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.data()||rd;
  // 狼刀決定的當下（不管是狼隊全員確認、夢魘恐懼導致的平安夜、機械狼接管出刀、還是狼弟
  // 復仇刀，都會走到這裡），把「刀」這一行記進文字紀錄——狼弟復仇刀那晚，狼弟自己的行動
  // 函式已經另外記了一行「狼弟復仇刀 X」，這裡的「刀」是跟本機法官助手一樣，兩行都會出現
  // （同一個目標，記錄角度不同：一個是「誰下的令」，一個是「狼隊今晚刀了誰」）。
  await jgRoomAppendNightLog(night, '刀 '+(fresh.wolfKillTargetSeatNum||'x'));
  // 狼美人：狼隊決定刀口之後，單獨睜眼魅惑一人（比照本機 jgNextWolfStep 的 wolfbeauty-wake）。
  if(jgRoomComp&&jgRoomComp.wolfbeauty>0){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'wolfbeauty' },{ merge:true });
    return;
  }
  await jgRoomAfterWolfbeautyStep(night);
}
// 狼美人魅惑完（或板子沒有狼美人）之後：黑市商人 → 女巫／直接結算。
async function jgRoomAfterWolfbeautyStep(night){
  const db=window.jgFirebaseDb;
  const bmPending=jgRoomComp&&jgRoomComp.blackmarket>0&&!(await jgRoomBlackmarketUsed());
  if(bmPending){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'blackmarket' },{ merge:true });
    return;
  }
  await jgRoomAfterBlackmarketStep(night);
}
// 黑市商人交易完（或板子沒有黑市商人／已經用過）之後的共用去向：有女巫、或有幸運兒目前
// 持有女巫類（毒藥）技能，就先進女巫回合（等他/她決定要不要救/毒再一起結算死亡），
// 否則直接結算死亡、往下一步（查驗類角色，或直接接警長競選）。
async function jgRoomAfterBlackmarketStep(night){
  const db=window.jgFirebaseDb;
  const hasWitch=(jgRoomComp&&jgRoomComp.witch>0)||!!jgRoomActiveLuckyOne('witch', night);
  // 血月使者自爆封印當晚所有神牌技能（見 jgRoomBloodmoonDetonateConfirm）：女巫這一步
  // 也要跳過，直接結算死亡（狼刀不受影響，正常結算）。
  if(hasWitch&&!jgRoomGodSkillsSealedThisNight(night)){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'witch' },{ merge:true });
  } else {
    await jgRoomResolveNightDeaths();
    await jgRoomAdvanceToCheckOrSheriff();
  }
}
// 死亡結算＋推進下一步：從「按下確認」的當下直接觸發。
async function jgRoomWolfFinalize(){
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  if(!fresh.wolfKillTargetUid) return;
  await jgRoomAfterKillDecided(fresh.night);
}

// ── 監聽「我自己」的身分（其他人的 secrets 文件，Firestore 安全規則會擋下，讀不到）──
// 除了畫面顯示，也把角色快取進 jgMyRole，讓夜晚畫面可以直接判斷「現在是不是輪到我」。
function jgRoomWatchMyRole(){
  const db=window.jgFirebaseDb;
  const uid=window.jgFirebaseUid;
  if(jgRoomUnsubMyRole) jgRoomUnsubMyRole();
  jgRoomUnsubMyRole=onSnapshot(doc(db,'rooms',jgRoomCode,'secrets',uid),(snap)=>{
    jgMyRole=snap.exists()?snap.data().role:null;
    const me=jgRoomLatestPlayers.find(p=>p.uid===uid);
    if(me) jgMySeatNum=me.seatNum;
    const box=document.getElementById('jg-room-my-role');
    if(box){
      box.innerHTML=jgMyRole
        ?'<div class="nbanner" style="margin-top:10px;"><div class="ntitle">你的身分：'+((typeof RNAME!=='undefined'&&RNAME[jgMyRole])||jgMyRole)+'</div></div>'
        :'';
    }
    jgRoomRenderCurrentPhase();
  });
}

// ── 畫面渲染 ──
function jgRoomCompSummaryHtml(){
  if(!jgRoomComp||!jgRoomTotal) return '';
  const parts=Object.entries(jgRoomComp).filter(([,v])=>v>0)
    .map(([k,v])=>((typeof RNAME!=='undefined'&&RNAME[k])||k)+'×'+v).join('、');
  return '<div class="info" style="font-size:12px;margin-top:6px;">本房固定板子：'+jgRoomTotal+' 人局，'+parts+'</div>';
}
function jgRoomRenderShell(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  // 身分分配完之後，房號就不重要了（房間不再開放新人加入），邀請連結沒有用處，藏起來。
  const roleAssigned=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.status==='role-assigned';
  root.innerHTML=`
    <div class="nbanner">
      
      <h1>房間 ${jgRoomCode}</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">把這個房號給朋友，請他們輸入加入</p>
    </div>
    ${roleAssigned?'':'<button onclick="jgRoomCopyInviteLink()" style="margin-top:8px;">複製邀請連結</button>'}
    ${jgRoomCompSummaryHtml()}
    <div id="jg-room-my-role"></div>
    <div class="section-title" style="margin-top:16px;">目前玩家</div>
    <div id="jg-room-player-list" class="card"></div>
    <div id="jg-room-host-controls" style="margin-top:14px;"></div>
    ${jgRoomIsHost?'<button class="ghost" style="margin-top:14px;color:var(--danger,#b91c1c);" onclick="jgRoomDissolve()">解散房間</button>':''}
  `;
  // 身分快取（jgMyRole）已經有的話，這裡先補畫一次，不用等下一次 snapshot 觸發才顯示
  const box=document.getElementById('jg-room-my-role');
  if(box&&jgMyRole){
    box.innerHTML='<div class="nbanner" style="margin-top:10px;"><div class="ntitle">你的身分：'+((typeof RNAME!=='undefined'&&RNAME[jgMyRole])||jgMyRole)+'</div></div>';
  }
}
function jgRoomRenderLobby(players){
  const listEl=document.getElementById('jg-room-player-list');
  if(listEl){
    listEl.innerHTML=players.map(p=>
      `<div class="row"><div class="av av-vil">${p.seatNum}</div><div class="nm">${p.name}</div>${p.uid===window.jgFirebaseUid?'<span class="badge bv">你</span>':''}</div>`
    ).join('')||'<div class="empty">還沒有人加入</div>';
  }
  const hostEl=document.getElementById('jg-room-host-controls');
  if(hostEl){
    const need=jgRoomTotal;
    const have=players.length;
    const ready=need&&have===need;
    const roleAssigned=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.status==='role-assigned';
    if(jgRoomIsHost){
      if(roleAssigned){
        hostEl.innerHTML='<button class="primary" onclick="jgRoomStartNight()">開始遊戲（進入第一夜）</button>';
      } else {
        hostEl.innerHTML=need
          ? '<button class="primary" '+(ready?'':'disabled')+' onclick="jgRoomAssignRoles()">'+(ready?'隨機分配身分':'隨機分配身分（目前 '+have+' / '+need+' 人）')+'</button>'
          : '<div class="info-warn" style="font-size:12px;">這個房間沒有記錄板子配置，請改用「建立連線房間」的方式重新建房。</div>';
      }
    } else {
      hostEl.innerHTML=roleAssigned
        ? '<div class="info" style="font-size:12px;text-align:center;">身分已分配，等待房主開始遊戲...</div>'
        : '<div class="info" style="font-size:12px;text-align:center;">目前 '+have+(need?' / '+need:'')+' 人，等待房主分配身分...</div>';
    }
  }
}

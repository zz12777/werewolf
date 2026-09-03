// ═══════════════════════════════════════════
// js/steps.js
// 主要畫面調度函式 jgRenderStep()——依目前步驟渲染對應畫面，涵蓋夜晚與白天所有步驟
// ═══════════════════════════════════════════

function jgRenderStep(step){
  // 盜賊「埋掉」的身分：整局都不會有真人持有這個身分，但法官每一夜仍然要照常喊
  // 「XX請睜眼…XX請閉眼」維持節奏（不然玩家會發現「今晚沒喊到XX」，反推出這個身分被盜賊
  // 候選時淘汰掉了，洩露資訊）。這裡用一個通用的「代喊」畫面取代該角色原本完整的睜眼流程：
  // 不用實際操作、也不會卡在「請選擇號碼」這種永遠填不了的欄位，按一下就正常接回原本
  // 夜晚該走的下一步。只有在真的「沒有任何一個玩家持有這個身分」時才會生效——如果盜賊
  // 選的是另一張、這個角色其實仍然存在，就完全不受影響，照原本畫面正常走。
  // 這個「代喊」畫面講的台詞，刻意跟「本人真的死掉、但仍要照常走完流程」時一模一樣
  // （例如女巫一樣要問「他被殺了，你要使用解藥嗎？」「你要使用毒藥嗎？你要毒誰呢？」），
  // 玩家才聽不出差別，也就猜不出這個身分到底是真的死了、還是一開始就被盜賊埋掉。
  if(jgThiefChosen && jgThiefBuriedRole && !jgPlayers.some(p=>p.role===jgThiefBuriedRole)){
    const info=THIEF_BURIED_STEP_INFO[jgThiefBuriedRole];
    if(info && info.step===step){
      const rn=jgFullRoleName(jgThiefBuriedRole);
      const sc=THIEF_BURIED_SCRIPT[jgThiefBuriedRole]||{icon:'👁️',open:rn+'請睜眼。'};
      const extraHtml=(sc.extra||[]).map(line=>'<div class="speech" style="margin-top:8px;">「<em>'+line+'</em>」</div>').join('');
      jgShowPg(`
        <h2>${rn}睜眼</h2>
        <div class="speech">「<em>${sc.open}</em>」</div>
        <div class="info-warn" style="margin-top:8px;">本局沒有人是${rn}（已在盜賊候選時被埋掉），視同已出局，仍需照常走完流程</div>
        ${extraHtml}
        <div class="speech" style="margin-top:12px;">「<em>${rn}請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep(THIEF_BURIED_STEP_INFO['${jgThiefBuriedRole}'].next())">已紀錄，下一步 →</button>
      `,sc.icon+' '+rn);
      return;
    }
  }
  const hasGuard = jgNight===1 ? (jgComp.guard>0) : jgHasRole('guard');
  const hasSeer  = jgNight===1 ? (jgComp.seer>0)  : jgHasRole('seer');
  const witchExists = jgPlayers.some(p=>p.role==='witch') || (jgNight===1&&jgComp.witch>0);
  const witchAlive = jgPlayers.some(p=>p.role==='witch'&&p.alive);

  if(step==='deal'){
    const needCardReminder = jgNight===1 && (jgComp.mechanicalwolf>0);
    const needDualReminder = jgNight===1 && jgDualIdentityMode;
    const needThiefReminder = jgNight===1 && jgComp.thief>0 && jgThiefWheelDone;
    jgShowPg(`
      <h2 style="margin-bottom:8px;">發牌・確認身分</h2>
      <div class="speech">1. 逐一發牌<br>2. 給玩家約 15 秒記住自己的身分。<br>3. 15 秒後，法官說「<em>天黑請閉眼</em>」</div>
      ${needCardReminder?'<div class="info-warn" style="margin-top:8px;">⚠️ 本局含機械狼：請提醒所有玩家先找好自己的牌，待會兒閉眼後，請依法官指示舉起牌讓法官記錄身分。</div>':''}
      ${needDualReminder?'<div class="info-warn" style="margin-top:8px;">⚠️ 本局為雙身分模式：每人有 2 張牌，請提醒玩家先找好兩張牌，待會兒閉眼後，請依法官指示舉起牌讓法官記錄身分。</div>':''}
      ${needThiefReminder?'<div class="info-warn" style="margin-top:8px;">⚠️ 本局含盜賊：請確認候選轉盤抽到的那兩張牌已經另外拿起來（不在這次發的牌裡），剩下的牌才發給大家。</div>':''}
      <button class="primary" style="margin-top:14px;" onclick="jgProceedToNight()">大家都閉眼了 →</button>
    `,'📋 發牌・確認身分');
  }
  else if(step==='mech-assign'){
    jgRenderMechAssign();
  }
  else if(step==='dual-assign'){
    jgRenderDualAssign();
  }
  else if(step==='night-start'){
    const isSealNight=!!(jgRecord&&jgRecord.bloodmoonSealNight); // save before reset
    jgRecord={wolfKill:null,guardTarget:null,witchSave:null,witchPoison:null,seerChecked:null,witchPoisoned:false,witchStepDone:false};
    if(isSealNight) jgRecord.bloodmoonSealNight=true; // carry into new record for wolf-wake to check
    const firstNight=jgIsFirstNight();
    jgShowPg(`
      <h2 style="margin-bottom:8px;">第 ${jgNight} 夜開始</h2>
      <div class="speech">「<em>天黑請閉眼。</em>」<br>確認所有玩家閉上眼睛</div>
      ${isSealNight?'<div class="info-danger" style="margin-top:4px;">⚠️ 血月封印：本夜神職技能全封，只有狼人殺人</div>':''}
      <button class="primary" style="margin-top:14px;" onclick="jgGoStep(jgNightStartNext())">所有人已閉眼 →</button>
    `,'🌙 天黑');
  }
  // ── 盜賊：整局第一個睜眼（比邱比特還早），法官現場輸入兩張候選身分，盜賊選一個 ──
  // ── 盜賊候選轉盤：整局最開頭、只有法官自己看得到的一步，發牌之前先秘密抽出兩張候選 ──
  else if(step==='thief-wheel'){
    const manualMode=!!jgRecord._thiefWheelManualMode;
    let bodyHtml;
    if(manualMode){
      const cand1=jgThiefWheelCand1||'';
      const cand2=jgThiefWheelCand2||'';
      bodyHtml='<div class="speech" style="margin-top:10px;">手動指定盜賊的兩張候選身分牌。</div>'
        +'<label style="margin-top:12px;">候選身分 A</label>'
        +'<select id="jg-thief-wheel-cand1" onchange="jgThiefWheelManualUpdate()">'+jgThiefRoleOptionsHtml(cand1)+'</select>'
        +'<label style="margin-top:12px;">候選身分 B</label>'
        +'<select id="jg-thief-wheel-cand2" onchange="jgThiefWheelManualUpdate()">'+jgThiefRoleOptionsHtml(cand2)+'</select>'
        +'<div id="jg-thief-wheel-manual-warn" style="margin-top:8px;"></div>'
        +'<div style="display:flex;gap:10px;margin-top:14px;">'
        +'<button style="flex:1;" onclick="jgThiefWheelUseSpin()">🎡 改用轉盤抽取</button>'
        +'<button class="primary" style="flex:1;" onclick="jgThiefConfirmWheel()">已發牌，確認 →</button>'
        +'</div>';
    } else {
      const c1=jgThiefWheelCand1, c2=jgThiefWheelCand2;
      const hasResult=!!(c1&&c2);
      bodyHtml='<div class="speech" style="margin-top:10px;">在正式發牌之前，先秘密抽出盜賊的兩張候選身分牌(請確認其他玩家看不到)。</div>'
        +(hasResult?(
          '<div class="nbanner" style="margin-top:14px;">'
          +'<div class="nicon">🎴</div>'
          +'<div class="ntitle" style="font-size:20px;">候選 A：'+jgFullRoleName(c1)+'</div>'
          +'<div class="ntitle" style="font-size:20px;margin-top:4px;">候選 B：'+jgFullRoleName(c2)+'</div>'
          +'</div>'
          +'<div class="info" style="font-size:12px;margin-top:8px;">請照這個結果去實際牌堆裡把這兩張牌拿起來（單獨保留給盜賊，不要洗進去），其餘的牌正常發給其他玩家。發完牌之後再點下方確認。</div>'
          +'<div style="display:flex;gap:10px;margin-top:14px;">'
          +'<button style="flex:1;" onclick="jgThiefSpinWheel()">🔄 重新抽一次</button>'
          +'<button class="primary" style="flex:1;" onclick="jgThiefConfirmWheel()">已發牌，確認 →</button>'
          +'</div>'
        ):(
          '<button class="primary" style="margin-top:14px;" onclick="jgThiefSpinWheel()">🎡 抽取候選身分</button>'
        ))
        +'<div style="margin-top:10px;"><button onclick="jgThiefWheelUseManual()">或者，手動指定兩個候選</button></div>';
    }
    jgShowPg(`
      <h2>🎡 盜賊候選轉盤</h2>
      ${bodyHtml}
    `,'🎡 盜賊');
    if(manualMode) jgThiefWheelManualUpdate();
  }
  else if(step==='thief-wake'){
    const tfP=jgPlayers.find(p=>p.role==='thief');
    const idHtml=jgGodIdHtml('thief',tfP);
    const hasWheelResult=!!(jgThiefWheelCand1&&jgThiefWheelCand2);
    const manualMode=jgRecord._thiefManualMode||!hasWheelResult;
    let candidateBlockHtml;
    if(manualMode){
      const cand1=jgRecord._thiefCand1||'';
      const cand2=jgRecord._thiefCand2||'';
      candidateBlockHtml='<label style="margin-top:12px;">候選身分 A（依現場準備的牌面選擇）</label>'
        +'<select id="jg-thief-cand1" onchange="jgThiefUpdateChoiceUI()">'+jgThiefRoleOptionsHtml(cand1)+'</select>'
        +'<label style="margin-top:12px;">候選身分 B</label>'
        +'<select id="jg-thief-cand2" onchange="jgThiefUpdateChoiceUI()">'+jgThiefRoleOptionsHtml(cand2)+'</select>'
        +'<button onclick="jgThiefShowBigCard()" style="margin-top:10px;width:100%;">📋 大字報顯示給盜賊看</button>'
        +(hasWheelResult?'<div style="margin-top:6px;"><button onclick="jgThiefUseWheelResult()">改用轉盤抽到的結果（'+jgFullRoleName(jgThiefWheelCand1)+' / '+jgFullRoleName(jgThiefWheelCand2)+'）</button></div>':'');
    } else {
      jgRecord._thiefCand1=jgThiefWheelCand1;
      jgRecord._thiefCand2=jgThiefWheelCand2;
      candidateBlockHtml='<div class="nbanner" style="margin:10px 0;">'
        +'<div class="nicon">🎴</div>'
        +'<div class="ntitle" style="font-size:20px;">候選 A：'+jgFullRoleName(jgThiefWheelCand1)+'</div>'
        +'<div class="ntitle" style="font-size:20px;margin-top:4px;">候選 B：'+jgFullRoleName(jgThiefWheelCand2)+'</div>'
        +'</div>'
        +'<button onclick="jgThiefShowBigCard()" style="margin-top:6px;width:100%;">📋 大字報顯示給盜賊看</button>'
        +'<div style="margin-top:6px;"><button onclick="jgThiefUseManualMode()">改成手動指定候選</button></div>';
    }
    jgShowPg(`
      <h2>🎴 盜賊睜眼</h2>
      <div class="speech">「<em>盜賊請睜眼。</em>」</div>
      ${idHtml}
      ${candidateBlockHtml}
      <div class="info" style="font-size:12px;margin-top:8px;">若其中一個是狼人陣營角色，盜賊必須選狼人。盜賊選完之後，另一個候選會直接被埋掉，整局都不會有人是那個身分。</div>
      <div id="jg-thief-choice-area" style="margin-top:12px;"></div>
    `,'🎴 盜賊');
    jgThiefUpdateChoiceUI();
  }
  // ── 邱比特：整局唯一一次行動，第一夜最先睜眼，指定兩名玩家（可含自己）成為情侶 ──
  else if(step==='cupid-wake'){
    const cpP=jgPlayers.find(p=>p.role==='cupid');
    const idHtml=jgGodIdHtml('cupid',cpP);
    const cur1=(jgLovers&&jgLovers[0])||'';
    const cur2=(jgLovers&&jgLovers[1])||'';
    jgShowPg(`
      <h2>💘 邱比特睜眼</h2>
      <div class="speech">「<em>邱比特請睜眼。今晚要指定哪兩位玩家成為情侶？</em>」</div>
      ${idHtml}
      <label style="margin-top:12px;">情侶 A（可以是邱比特自己）</label>
      ${jgNumSelectHtml('jg-cupid-target1', cur1)}
      <label style="margin-top:12px;">情侶 B</label>
      ${jgNumSelectHtml('jg-cupid-target2', cur2)}
      <div class="speech" style="margin-top:10px;">「<em>邱比特請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveCupid()">已紀錄，下一步 →</button>
    `,'💘 邱比特');
  }
  // ── 盜賊選完之後的大揭曉：最終身分＋被埋掉的身分，滿版大字呈現 ──
  else if(step==='thief-reveal'){
    const tfP=jgThiefFinalNum?jgFind(jgThiefFinalNum):null;
    const finalName=jgFullRoleName(jgThiefFinalRole||'');
    const buriedName=jgFullRoleName(jgThiefBuriedRole||'');
    jgShowPg(`
      <div class="nbanner">
        <div class="nicon">🎴</div>
        <div class="ntitle">${tfP?tfP.num+'號':''}盜賊　最終身分</div>
        <p class="sub" style="text-align:center;font-size:26px;font-weight:800;color:var(--thief);margin-top:6px;">${finalName}</p>
      </div>
      <div class="info" style="font-size:13px;text-align:center;">被埋掉的身分是：<strong>${buriedName}</strong></div>
      <div class="info-warn" style="font-size:13px;text-align:center;margin-top:8px;">📋 法官需走一圈給盜賊他所選的牌，並收回盜賊牌</div>
      <div class="speech" style="margin-top:14px;">「<em>盜賊請閉眼。</em>」</div>
      <button class="primary" onclick="jgGoStep(jgNightStartNext())">已紀錄，下一步 →</button>
    `,'🎴 盜賊');
  }
  // ── 邱比特指定完成後：情侶兩人一起睜眼互相確認彼此（不知道誰是邱比特、也不知道對方陣營）──
  else if(step==='lovers-wake'){
    const l1=jgLovers?jgFind(jgLovers[0]):null;
    const l2=jgLovers?jgFind(jgLovers[1]):null;
    const n1=l1?l1.num:(jgLovers?jgLovers[0]:'?');
    const n2=l2?l2.num:(jgLovers?jgLovers[1]:'?');
    jgShowPg(`
      <h2>💘 情侶確認彼此</h2>
      <div class="speech">「<em>被拍到的兩位為情侶，先不要睜眼。</em>」</div>
      <div class="info-warn" style="font-size:13px;">📋 法官需走一圈拍情侶（輕拍 ${n1}號、${n2}號 兩人示意），確認兩人都被拍到後再繼續</div>
      <div class="speech" style="margin-top:10px;">「<em>情侶請睜眼，互相確認彼此的身份，不能溝通，情侶請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveLoversWake()">兩人已閉眼，下一步 →</button>
    `,'💘 情侶');
  }
  else if(step==='dancer-wake'){
    const dnP=jgPlayers.find(p=>p.role==='dancer');
    const idHtml=jgGodIdHtml('dancer',dnP);
    const dead=dnP&&!dnP.alive;
    const eligibleNums=jgPlayers.filter(p=>p.alive&&!jgDancerEverDanced.has(p.num)).map(p=>p.num);
    const notEnough=eligibleNums.length<3;
    const picked=jgRecord.dancerPoolPick||[];
    const gridHtml=jgPlayers.filter(p=>eligibleNums.includes(p.num)).map(p=>{
      const sel=picked.includes(p.num);
      return '<button type="button" onclick="jgToggleDancerPool('+p.num+')" style="width:44px;height:44px;border-radius:50%;padding:0;font-size:14px;font-weight:700;'
        +(sel?'background:var(--accent);color:#fff;border-color:transparent;':'')+'">'+p.num+'</button>';
    }).join('');
    jgShowPg(`
      <h2>舞者睜眼</h2>
      <div class="speech">「<em>舞者請睜眼${jgNight<2?'':'，請選擇3名玩家共舞'}。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">舞者已出局，仍需走完流程</div>':''}
      ${(dead||jgNight<2)?'':(notEnough
        ?'<div class="info">今晚符合資格（存活且沒共舞過）的玩家不到3人，本回合自動跳過共舞。</div>'
        :`<label>點選3名玩家共舞（可以選自己；每位玩家整局只能共舞一次）</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">${gridHtml}</div>
          <div class="info" style="font-size:12px;margin-top:4px;">這3人若陣營相同，無事發生；若不同，人數較少的一方死亡。若選自己進入舞池，當晚舞池中所有人都免疫狼刀。</div>`)}
      <div class="speech" style="margin-top:10px;">「<em>舞者請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveDancer()">已紀錄，下一步 →</button>
    `,'💃 舞者');
  }
  else if(step==='mask-wake'){
    const mkP=jgPlayers.find(p=>p.role==='mask');
    const idHtml=jgGodIdHtml('mask',mkP);
    const dead=mkP&&!mkP.alive;
    // 假面陣營固定是狼隊（跟石像鬼一樣，只是不跟隊友見面）；這裡要的是另一件事：
    // 「其餘正牌狼是不是全滅、假面能不能開始自己動手殺人」，用 jgMaskCanKill 判斷。
    const allWolvesDead=jgMaskCanKill(mkP);
    const checkExclude=jgLastMaskCheckTarget?[parseInt(jgLastMaskCheckTarget)]:[];
    const grantExclude=jgLastMaskGrantTarget?[parseInt(jgLastMaskGrantTarget)]:[];
    jgShowPg(`
      <h2>假面睜眼</h2>
      <div class="speech">「<em>假面請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">假面已出局，仍需走完流程</div>':''}
      ${(dead||jgNight<2)?'':`
        <div class="divider"></div>
        <label style="font-weight:700;">① 今晚的帶刀手勢是？</label>
        ${allWolvesDead?`<div class="info-warn" style="margin:6px 0 8px;">🔪 比讚——其餘正牌狼人已全滅，假面可以殺人</div>
          <label>今晚要殺的對象（留空=不殺）</label>${jgNumSelectHtml('jg-mask-kill','')}`
          :'<div class="info" style="font-size:12px;margin:6px 0;">👎 比倒讚——正牌狼人尚未全滅，暫時不能殺人</div>'}
        <div class="divider"></div>
        <label style="font-weight:700;">② 今晚要查驗是否在舞池的號碼是？</label>
        ${jgNumSelectHtml('jg-mask-check','','jgMaskCheckLive',null,checkExclude,'不能連續兩晚查驗同一人')}
        <div id="jg-mask-check-result"></div>
        <div class="divider"></div>
        <label style="font-weight:700;">③ 要給予面具的對象是？</label>
        ${jgNumSelectHtml('jg-mask-grant','',null,null,grantExclude,'不能連續兩晚給予面具同一人')}
        <div class="info" style="font-size:12px;margin-top:4px;">被給予面具的玩家，「今晚」在舞池陣營判定中的陣營會被改變，用來干擾舞者共舞的死亡結果。（留空=不給；灰色=昨晚給過，不能連續兩晚給同一人）</div>
      `}
      <div class="speech" style="margin-top:10px;">「<em>假面請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveMask()">已紀錄，下一步 →</button>
    `,'🎭 假面');
  }
  else if(step==='bigbadwolf-wake'){
    const bbP=jgPlayers.find(p=>p.role==='bigbadwolf');
    if(!bbP){ jgGoStep(jgAfterBigBadWolfStep()); return; }
    const dead=!bbP.alive;
    const feared=jgFeared(bbP);
    const allFourAlive=jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)).every(p=>p.alive);
    jgShowPg(`
      <h2>大野狼睜眼</h2>
      <div class="speech">「<em>大野狼請睜眼。</em>」</div>
      ${dead?'<div class="info-warn">大野狼已出局，仍需走完流程</div>':''}
      <div id="jg-god-bigbadwolf-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${(dead||feared)?'':(allFourAlive
        ?`<div class="info-warn" style="margin-bottom:8px;">🔪 四隻狼全部存活，大野狼可以額外殺一人</div>
          <label>請選擇擊殺的目標（留空=不殺）</label>${jgNumSelectHtml('jg-bigbadwolf-kill','')}
          <div class="info" style="font-size:12px;margin-top:4px;">這一刀跟狼隊正常的狼刀是分開的，當晚可能造成兩人死亡。</div>`
        :'<div class="info" style="font-size:12px;">（已有隊友陣亡，大野狼額外技能失效，本回合不能殺人）</div>')}
      <div class="speech" style="margin-top:10px;">「<em>大野狼請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveBigBadWolf()">已紀錄，下一步 →</button>
    `,'🐺 大野狼');
  }
  else if(step==='bigmechwolf-wake'){
    jgRenderMechWolf2Step('bigmechwolf');
  }
  else if(step==='smallmechwolf-wake'){
    jgRenderMechWolf2Step('smallmechwolf');
  }
  else if(step==='nightmare-wake'){
    const isFirst=jgIsFirstNight();
    const nmP=jgPlayers.find(p=>p.role==='nightmare');
    const needId=isFirst&&!nmP;
    const dead=nmP&&!nmP.alive;
    const cur=jgRecord.nightmareTarget||'';
    jgShowPg(`
      <h2>夢魘睜眼</h2>
      <div class="speech">「<em>夢魘請睜眼${needId?'':'，今晚要恐懼的對象是？'}</em>」</div>
      ${needId?`<div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>夢魘</strong>號碼</label>${jgNumSelectHtml('jg-nightmare-who','')}</div><div class="divider"></div><div class="speech">「<em>今晚要恐懼的對象是？</em>」</div>`:''}
      ${dead?'<div class="info-warn">夢魘已出局，仍需走完流程</div>':''}
      ${dead?'':`<label>恐懼的對象（${jgNightmareForceMode==='optional'?'可留空跳過本晚，不能恐自己':'一定要恐，不能恐自己'}）</label>
      ${jgNumSelectHtml('jg-nightmare-target', cur, 'jgNightmareCheckRepeat')}
      <div id="jg-nightmare-warn"></div>`}
      <div class="speech" style="margin-top:10px;">「<em>夢魘請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveNightmare()">已紀錄，下一步 →</button>
    `,'😈 夢魘');
  }
  else if(step==='guard-wake'){
    const isFirst=jgIsFirstNight();
    const guardP=jgPlayers.find(p=>p.role==='guard');
    if(jgDualIdentityMode&&!guardP){
      jgShowPg(`
        <h2>守衛睜眼</h2>
        <div class="speech">「<em>守衛請睜眼。</em>」</div>
        <div class="info" style="font-size:12px;">（雙身分板：此身分目前無人持有，可能藏在尚未翻開的第二張牌中）</div>
        <div class="speech" style="margin-top:10px;">「<em>守衛請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep(jgAfterGuardStep())">下一步 →</button>
      `,'🛡️ 守衛');
      return;
    }
    const idHtml=jgIdFieldHtml('守衛', guardP, 'jg-guard-who', 'jg-guard-name');
    const dead=guardP&&!guardP.alive;
    const feared=jgFeared(guardP);
    const grecVal=jgRecord.guardTarget||'';
    jgShowPg(`
      <h2>守衛睜眼</h2>
      <div class="speech">「<em>守衛請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">守衛已出局，仍需走完流程</div>':''}
      <div class="speech">「<em>請選擇你要守護的對象。</em>」</div>
      <div id="jg-guard-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      <div id="jg-guard-action" style="${(dead||feared)?'display:none;':''}">
      <label>守衛今晚守護的對象(留空=不守)</label>
      ${jgNumSelectHtml('jg-guard-rec', grecVal, 'jgGuardCheckRepeat')}<div id="jg-guard-repeat-warn"></div>
      </div>
      <div class="speech" style="margin-top:12px;">「<em>守衛請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveGuard()">已紀錄，下一步 →</button>
    `,'🛡️ 守衛');
  }
  else if(step==='littlegirl-wake'){
    const lgP=jgPlayers.find(p=>p.role==='littlegirl');
    const idHtml=jgGodIdHtml('littlegirl',lgP);
    const dead=lgP&&!lgP.alive;
    jgShowPg(`
      <h2>小女孩睜眼</h2>
      <div class="speech">「<em>小女孩請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">小女孩已出局，仍需走完流程</div>':''}
      <div class="info" style="font-size:12px;">小女孩會跟狼人牌一起睜眼、參與擊殺對象討論，實際刀口選擇在下一步「狼人（大野狼）+小女孩」畫面進行，這裡只需要記錄身分。</div>
      <div class="speech" style="margin-top:10px;">「<em>小女孩請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveLittlegirl()">已紀錄，下一步 →</button>
    `,'👧 小女孩');
  }
  // ── 混血兒：只在第一夜出現一次，選擇支持對象 ──
  else if(step==='hybrid-wake'){
    const hyP=jgPlayers.find(p=>p.role==='hybrid');
    const idHtml=jgGodIdHtml('hybrid',hyP);
    const cur=jgHybridTarget||'';
    jgShowPg(`
      <h2>混血兒睜眼</h2>
      <div class="speech">「<em>混血兒請睜眼，今晚要選擇支持的對象是？</em>」</div>
      ${idHtml}
      <label>支持的對象（號碼，不能選自己；此後不再詢問，一路睡到天亮）</label>
      ${jgNumSelectHtml('jg-hybrid-target', cur)}
      <div id="jg-hybrid-warn"></div>
      <div class="info" style="font-size:12px;margin-top:6px;">混血兒不會被告知支持對象的陣營，勝利條件與支持對象相同，需自行從發言判斷局勢。此步驟僅第一夜出現一次。</div>
      <div class="speech" style="margin-top:10px;">「<em>混血兒請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveHybrid()">已紀錄，下一步 →</button>
    `,'🧬 混血兒');
  }
  // ── 狼兄狼弟：第一夜互相確認身份 ──
  else if(step==='wolfbrother-wake'){
    const eP=jgPlayers.find(p=>p.role==='wolfbrother_e');
    const yP=jgPlayers.find(p=>p.role==='wolfbrother_y');
    const ev=eP?eP.num:'';
    const yv=yP?yP.num:'';
    jgShowPg(`
      <h2>狼兄狼弟相認</h2>
      <div class="speech">「<em>狼兄、狼弟請睜眼，互相確認身份，狼弟請比小拇指。</em>」</div>
      <div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>狼兄</strong>號碼</label>
      ${jgNumSelectHtml('jg-wbe-who', ev)}</div>
      <div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>狼弟</strong>號碼</label>
      ${jgNumSelectHtml('jg-wby-who', yv)}</div>
      <div class="info" style="font-size:12px;">狼弟平時不進狼窩，不參與狼人商討殺人；狼兄陣亡前，預言家查驗狼弟顯示為好人。</div>
      <div class="speech" style="margin-top:10px;">「<em>狼兄狼弟請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveWolfBrotherIntro()">已紀錄，下一步 →</button>
    `,'👬 狼兄狼弟');
  }
  // ── 狼弟睜眼：第二晚起每晚獨立睜眼，法官每晚都要問兩個手勢──
  // ①「技能使用狀況」：復仇刀是一次性技能，只有狼兄剛陣亡的那一晚比讚，其餘每一晚
  // （不管覺醒前、還是覺醒後已用過）一律倒讚，避免洩露狼兄死活與技能剩餘狀況。
  // ②「今晚的帶刀手勢」：只有「已加入狼窩」且「其餘狼隊成員全滅」的晚上才比讚，
  // 代表狼弟今晚要自己帶刀殺人；其餘情況（尚未加入狼窩、或狼隊友還在）一律倒讚。
  else if(step==='wolfbrother-status'){
    const wbE=jgPlayers.find(p=>p.role==='wolfbrother_e');
    const wbY=jgPlayers.find(p=>p.role==='wolfbrother_y');
    const yLabel=wbY?(wbY.name&&wbY.name!==wbY.num+'號'?wbY.num+'號 '+wbY.name:wbY.num+'號'):'狼弟';
    const yDead=wbY&&!wbY.alive;
    const elderJustDied=jgWolfBrotherAwakenPending(); // 狼兄已死、狼弟尚存活、復仇刀尚未使用
    // 帶刀手勢只看「狼弟以外的狼隊成員是否都死光」，跟狼弟自己有沒有正式加入狼窩無關——
    // 就算是狼兄剛陣亡、狼弟才要覺醒的那一晚，只要其餘狼隊友（不含狼兄本人，他已經死了）
    // 也全部陣亡，帶刀手勢照樣比讚。
    const otherWolvesAliveWby=jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&p.role!=='wolfbrother_y'&&p.alive);
    const knifeGesture=otherWolvesAliveWby?'👎':'👍';
    if(yDead){
      jgShowPg(`
        <h2>狼弟睜眼</h2>
        <div class="speech">「<em>狼弟請睜眼。</em>」</div>
        <div class="info-warn">狼弟已出局，仍需走完流程避免洩露身分</div>
        <div class="speech">「<em>你的技能使用狀況是 👎</em>」</div>
        <div class="speech" style="margin-top:6px;">「<em>今晚的帶刀手勢是 👎</em>」</div>
        <div class="speech" style="margin-top:10px;">「<em>狼弟請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep(jgAfterWolfBrotherStep())">下一步 →</button>
      `,'👬 狼弟');
      return;
    }
    if(elderJustDied){
      const av=jgRecord.wolfBrotherAwakenKill||'';
      const wbyPackKv=jgRecord.wolfBrotherKillTarget||jgRecord.wolfKill||'';
      jgShowPg(`
        <h2>狼弟睜眼</h2>
        <div class="info-danger" style="font-size:14px;font-weight:700;padding:12px 14px;">狼兄已陣亡，${yLabel} 覺醒</div>
        <div class="speech">「<em>狼弟請睜眼，你的技能使用狀況是 👍</em>」</div>
        <div class="info" style="font-size:13px;">狼兄已死亡，狼弟有一刀復仇刀，不可空刀</div>
        <label>覺醒刀擊殺的對象（號碼，必填）</label>
        ${jgNumSelectHtml('jg-wby-awaken-rec', av)}
        <div class="divider" style="margin:12px 0;"></div>
        <div class="speech">「<em>今晚的帶刀手勢是 ${knifeGesture}</em>」</div>
        ${otherWolvesAliveWby?'<div class="info" style="font-size:12px;">（狼隊友還在，帶刀手勢比倒讚）</div>':`
        <div class="info" style="font-size:12px;">其餘狼隊成員已全滅，狼弟今晚可以直接帶正常狼刀（就是原本「狼人睜眼」要選的那一刀，不是額外多一刀），跟復仇刀是兩回事，兩者都可以生效（留空＝晚點在「狼人睜眼」步驟再選）</div>
        <label>帶刀殺人的對象</label>
        ${jgNoSelfCutNoticeHtml()}
        ${jgNumSelectHtml('jg-wby-pack-kill', wbyPackKv, null, null, jgNoSelfCutNums())}`}
        <div class="speech" style="margin-top:10px;">「<em>狼弟請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveWolfBrotherAwaken()">已紀錄，下一步 →</button>
      `,'😱 狼弟覺醒');
      return;
    }
    // Routine night: either 狼兄 still alive (pre-awaken, doesn't join the den) or the
    // one-time revenge kill has already been used (post-awaken, now joins the den at wolf-wake).
    const preAwaken=wbE&&wbE.alive&&!jgWolfBrotherAwakened;
    if(preAwaken){
      jgShowPg(`
        <h2>狼弟睜眼</h2>
        <div class="speech">「<em>狼弟請睜眼，你的技能使用狀況是 👎</em>」</div>
        <div class="speech" style="margin-top:6px;">「<em>今晚的帶刀手勢是 ${knifeGesture}</em>」</div>
        <div class="info" style="font-size:12px;">（狼兄尚存活，復仇刀尚不能使用）</div>
        <div class="speech" style="margin-top:10px;">「<em>狼弟請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep(jgAfterWolfBrotherStep())">下一步 →</button>
      `,'👬 狼弟');
      return;
    }
    // 已覺醒、已加入狼窩：狼弟平常跟其餘狼人一起在「狼人睜眼」步驟殺人；但如果此時其餘
    // 狼隊成員（黑狼王／白狼王／狼美人／惡靈騎士／血月使者／機械狼／石像鬼／夢魘…）都已
    // 死光，只剩狼弟一人，這晚就換狼弟自己「帶刀」——比讚，且可以當下直接選人殺（帶的就是
    // 正常狼刀，不是額外多一刀），也可以留到等一下「狼人睜眼」步驟再殺；當下選了的話，
    // 「狼人睜眼」步驟的號碼格會直接預先選好、顯示成綠色，法官仍可以改選，只是不用重選一次。
    if(otherWolvesAliveWby){
      jgShowPg(`
        <h2>狼弟睜眼</h2>
        <div class="speech">「<em>狼弟請睜眼，你的技能使用狀況是 👎</em>」</div>
        <div class="speech" style="margin-top:6px;">「<em>今晚的帶刀手勢是 👎</em>」</div>
        <div class="info" style="font-size:12px;">（復仇刀已使用過，整局限一次；狼隊友還在，稍後與其餘狼人一同睜眼殺人）</div>
        <div class="speech" style="margin-top:10px;">「<em>狼弟請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep(jgAfterWolfBrotherStep())">下一步 →</button>
      `,'👬 狼弟');
      return;
    }
    const wbyKv=jgRecord.wolfBrotherKillTarget||jgRecord.wolfKill||'';
    jgShowPg(`
      <h2>狼弟睜眼</h2>
      <div class="speech">「<em>狼弟請睜眼，你的技能使用狀況是 👎</em>」</div>
      <div class="speech" style="margin-top:6px;">「<em>今晚的帶刀手勢是 👍</em>」（其他狼隊友已全滅，狼弟可以帶刀殺人）</div>
      <div class="info" style="font-size:12px;">復仇刀已使用過（整局限一次）；帶刀手勢比讚，可以現在直接選殺人對象，或留空、等一下在「狼人睜眼」步驟再殺——兩者擇一，不會殺兩次。</div>
      <label>狼弟今晚要殺的對象（留空＝晚點在「狼人睜眼」步驟再殺）</label>
      ${jgNoSelfCutNoticeHtml()}
      ${jgNumSelectHtml('jg-wby-kill', wbyKv, null, null, jgNoSelfCutNums())}
      <div class="speech" style="margin-top:10px;">「<em>狼弟請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveWolfBrotherKillGesture()">已紀錄，下一步 →</button>
    `,'👬 狼弟');
  }
  else if(step==='wolf-wake'){
    const isFirst=jgIsFirstNight();
    const wolfCount=jgComp.wolf||2;
    const knownWolves=jgPlayers.filter(p=>p.role==='wolf');
    let wolfFieldsInner='';
    let allWolfIdsAssigned=true;
    if(isFirst){
      // Count wolf-team players (all wolf roles except gargoyle/mechanicalwolf/nightmare/wolfbrother/假面 who wake separately)
      const wolfRoles=Object.entries(jgComp).filter(([k])=>WOLF_ROLES.includes(k)&&k!=='gargoyle'&&k!=='mechanicalwolf'&&k!=='nightmare'&&k!=='wolfbrother_e'&&k!=='wolfbrother_y'&&k!=='mask'&&k!=='bigmechwolf'&&k!=='smallmechwolf');
      // 假面「不與狼隊見面」，身分已經在他自己的 mask-wake 畫面記錄過了，這裡不能再讓他的號碼
      // 出現在可選清單裡（不然法官可能誤選，等於洩露/搞混假面身分）。
      const maskP=jgPlayers.find(p=>p.role==='mask');
      const excludeMaskNum=maskP?[maskP.num]:[];
      let wiIdx=0;
      wolfRoles.forEach(([roleId,cnt])=>{
        const RNAME_L={wolf:'狼人',wolfking:'黑狼王',whitewolf:'白狼王',wolfbeauty:'狼美人',evilknight:'惡靈騎士',bloodmoon:'血月使者',wolfshaman:'狼巫'};
        const assignedCount=jgPlayers.filter(p=>p.role===roleId).length;
        if(assignedCount<cnt) allWolfIdsAssigned=false;
        for(let i=0;i<cnt;i++){
          const kw=jgPlayers.filter(p=>p.role===roleId)[i];
          wolfFieldsInner+='<div style="margin-bottom:8px;">'
            +'<label style="margin-top:0;"><strong>'+(RNAME_L[roleId]||'狼人')+(cnt>1?' '+(i+1):'')+'</strong>號碼</label>'
            +jgNumSelectHtml('jg-wolf-who-'+wiIdx, kw?kw.num:'', 'jgWolfIdOnChange', 'data-role="'+roleId+'"', excludeMaskNum, '假面不與狼隊見面，不可選取')
            +'</div>';
          wiIdx++;
        }
      });
      // 石像鬼「不與狼隊見面」，身分已經在 mech-assign（或自己獨立的 gargoyle-wake）記錄，
      // 不再跟其餘狼人擠在同一個畫面裡記名字，也不會跟狼人一起睜眼。假面同理。
    }
    const needId=isFirst&&!jgMechAssignDone&&!allWolfIdsAssigned;
    const killVal=jgRecord.wolfKill||'';
    // 「這一晚場上還有沒有活著的主狼群（不含石像鬼／機械狼／假面，他們各自有自己獨立的殺人畫面）」：
    // 沒有的話，法官照樣要喊「狼人請睜眼…請閉眼」維持節奏（不然玩家會從流程跳過推理出狼死光了），
    // 但不能顯示「選擇殺人對象」的按鈕與名單，因為根本沒有活人可以做這個決定。
    // 注意：夢魘不能排除在外——夢魘本身沒有像石像鬼那樣「隊友全滅後可以自己額外殺人」的獨立
    // 技能，牠平常只在自己的畫面選恐懼對象，實際的刀口仍然要靠「狼人睜眼」這個共用畫面決定；
    // 如果隊友都死光、只剩夢魘存活，這個共用畫面就是牠唯一能刀人的地方，不能因為牠「平常」
    // 不在這個畫面出手，就誤判成「狼隊已全滅、沒人能選」。
    // 假面則要排除在外：他「不入狼隊、不與狼人見面」，就算其餘正牌狼隊全滅後他能開始帶刀殺人，
    // 那也是靠他自己獨立的 mask-wake 畫面（見 jgSaveMask），不是這個共用的「狼人睜眼」畫面，
    // 不能因為假面還活著，就讓這個共用畫面誤判成「狼隊還有人在、可以選人」。
    // 注意：第一夜（isFirst）時，主狼群的號碼很可能「還沒」記錄進 jgPlayers（要等法官在這個畫面
    // 填完號碼、按下「已紀錄，下一步」才會真的寫進去），這時候直接看 jgPlayers 會誤判成「全滅」，
    // 導致殺人對象的欄位整個不見、法官連刀口都選不了（就算候選身分含盜賊變狼也一樣）。第一夜還
    // 沒有人真的死過，所以第一夜改成直接看板子設定（jgComp）裡有沒有配置主狼群角色即可。
    // 雙機械狼板：大／小機械狼平常不與狼隊見面，一律排除在共用畫面之外——除非小機械狼已經
    // 依規則8「回歸主狼群」，這時候他要算進來，才能在這個畫面選刀口。
    const _smallMechRejoined=jgMechWolf2State.smallmechwolf.rejoinedPack;
    const _excludedFromMainPack=(role)=>{
      if(role==='gargoyle'||role==='mechanicalwolf'||role==='mask'||role==='bigmechwolf') return true;
      if(role==='smallmechwolf') return !_smallMechRejoined;
      return false;
    };
    const mainPackAlive=isFirst
      ? Object.entries(jgComp).some(([k,v])=>WOLF_ROLES.includes(k)&&!_excludedFromMainPack(k)&&(v||0)>0)
      : jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&!_excludedFromMainPack(p.role)&&p.alive);
    const hasNightmareRole=jgNight===1?(jgComp.nightmare>0):jgHasRoleAny(['nightmare']);
    const hasMechWolfRole=jgNight===1?(jgComp.mechanicalwolf>0):jgHasRoleAny(['mechanicalwolf']);
    let compatNote='';
    if(hasNightmareRole&&!jgDualIdentityMode) compatNote+='<div class="info" style="font-size:12px;">（夢魘可睜眼）</div>';
    if(hasMechWolfRole) compatNote+='<div class="info" style="font-size:12px;">（機械狼不可睜眼）</div>';
    const wbE=jgPlayers.find(p=>p.role==='wolfbrother_e');
    const wbY=jgPlayers.find(p=>p.role==='wolfbrother_y');
    let wbNote='';
    if(wbE&&wbY){
      if(wbE.alive&&!jgWolfBrotherAwakened){
        wbNote='<div class="info" style="font-size:12px;">👬 狼弟（'+wbY.num+'號）平時不進狼窩，本回合請勿叫醒；狼兄（'+wbE.num+'號）與其餘狼人一同睜眼殺人。</div>';
      } else if(jgWolfBrotherAwakened&&jgWolfBrotherAwakenedNight===jgNight){
        // 覺醒當晚：狼弟已經在稍早的「狼弟覺醒」步驟單獨用復仇刀殺過一次人了。如果當時其餘狼隊
        // 成員也都已經死光，狼弟同時也是這晚唯一能出正常狼刀的人，所以他其實可以睜眼（其實這一步
        // 對他來說沒有實際意義，因為刀口已經在自己畫面選好了，這裡只是照常喊一次維持節奏）；
        // 如果狼隊友還在，狼弟這晚照舊不用叫醒，正常狼刀由其他狼隊友決定。
        const wbyOtherAlive=jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&p.role!=='wolfbrother_y'&&p.alive);
        wbNote=wbyOtherAlive
          ?'<div class="info" style="font-size:12px;">👬 狼弟（'+wbY.num+'號）今晚已在「狼弟覺醒」步驟單獨完成復仇刀，覺醒當晚仍不入狼窩，本回合請勿叫醒。</div>'
          :'<div class="info" style="font-size:12px;">👬 狼弟（'+wbY.num+'號）今晚已在「狼弟覺醒」步驟單獨完成復仇刀，因亦可帶正常狼刀，狼弟可睜眼。</div>';
      } else if(jgWolfBrotherAwakened){
        wbNote='<div class="info" style="font-size:12px;">👬 狼弟（'+wbY.num+'號）已覺醒，本回合與其餘狼人一同睜眼殺人。</div>';
      }
    }
    const wolfKillSectionHtml='<label>今晚獵殺的對象</label>'
      +'<div id="jg-wolf-selfcut-notice">'+jgWolfWakeSelfCutNoticeHtml()+'</div>'
      +'<div id="jg-wolf-rec-wrap">'+jgNumSelectHtml('jg-wolf-rec', killVal, null, null, jgWolfWakeSelfCutInfo().nums)+'</div>';
    // 大野狼+小女孩板：第二夜起，狼隊選完殺人對象後，多一次指認小女孩的機會（一局限一次
    // 「這一晚」用，指認成功小女孩代替死亡，失敗則無事發生、原本刀口照常結算）。
    const hasLittlegirlRole=jgNight===1?(jgComp.littlegirl>0):jgHasRoleAny(['littlegirl']);
    const identifySectionHtml=(hasLittlegirlRole&&jgNight>=2)
      ?'<div class="divider"></div><label>指認小女孩（留空=不指認；猜中：小女孩代替原本刀口死亡，守衛/女巫都無法阻止；猜錯：無事發生，原本刀口照常結算）</label>'
        +jgNumSelectHtml('jg-wolf-identify-rec', jgRecord.wolfIdentifyGuessRaw||'')
        +'<div class="info" style="font-size:12px;margin-top:4px;">「請指認小女孩，三秒後投票，三、二、一」</div>'
      :'';
    jgShowPg(`
      <h2>狼人睜眼</h2>
      <div class="speech">「<em>${hasLittlegirlRole?'狼人與小女孩':'狼人'}請睜眼。</em>」</div>
      ${needId?wolfFieldsInner+'<div class="divider" style="margin:12px 0 8px;"></div>':''}
      ${mainPackAlive?`<div class="speech">「<em>請選擇今晚要殺的對象。</em>」</div>
      ${compatNote}
      <div id="jg-wolf-blocked-msg" style="${jgRecord.nightmareBlocksWolf?'':'display:none;'}"><div class="info-danger">⚠️ 夢魘恐懼到狼隊友，狼人今晚不得殺人</div></div>
      ${wbNote}
      <div id="jg-wolf-kill-section" style="${jgRecord.nightmareBlocksWolf?'display:none;':''}">${wolfKillSectionHtml}${identifySectionHtml}</div>`
      :('<div class="info-warn">'+((jgComp.bigmechwolf>0||jgComp.smallmechwolf>0)?'小狼已全滅，仍須走完流程':'狼隊已全滅，今晚沒有人可以選擇殺人對象，仍需照常走完流程')+'</div>'
        +((jgComp.bigmechwolf>0||jgComp.smallmechwolf>0)?'<div class="speech" style="margin-top:8px;">「<em>今晚要殺的是？</em>」（小狼已全滅，這裡不用選，實際刀口由機械狼自己的畫面決定）</div>':''))}
      <div class="speech" style="margin-top:12px;">「<em>${hasLittlegirlRole?'狼人與小女孩':'狼人'}請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveWolf()">已紀錄，下一步 →</button>
    `,'🐺 狼人');
  }
  // ── 機械狼睜眼 ──
  else if(step==='mechanicalwolf-wake'){
    const isFirst=jgIsFirstNight();
    const mwP=jgPlayers.find(p=>p.role==='mechanicalwolf');
    const needId=isFirst&&!mwP&&!jgMechAssignDone;
    const idHtml=needId?`<div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>機械狼</strong>號碼</label>${jgNumSelectHtml('jg-mechwolf-who','','jgSoloIdFearCheck')}</div><div class="divider"></div>`:'';
    const dead=mwP&&!mwP.alive;
    const feared=jgFeared(mwP);
    const otherWolvesAlive=jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&p.role!=='mechanicalwolf'&&p.alive);
    const canUseSkill=!!jgMechWolfLearned&&jgMechWolfLearnedNight!==null&&jgNight>jgMechWolfLearnedNight;

    // Part 1: learn (if not learned yet) or use skill (if learned & usable tonight)
    let learnHtml='';
    if(feared){
      learnHtml='';
    } else if(!jgMechWolfLearned){
      if(dead){
        learnHtml='';
      } else {
        const lv=jgRecord.mechwolfLearnTarget||'';
        const mwSelfNums=mwP?[mwP.num]:[];
        learnHtml='<div class="speech">「<em>今晚要學習的對象是？</em>」</div>'
          +'<label>學習對象號碼（整局限一次，留空=本晚不學習，不能學自己）</label>'
          +jgNumSelectHtml('jg-mechwolf-learn', lv, 'jgMechWolfLearnCheck', null, mwSelfNums, '機械狼不能學習自己')
          +'<div id="jg-mechwolf-learn-result"></div>';
      }
    } else if(canUseSkill){
      // 已學得「獵人」：技能使用狀況（比讚／比倒讚）併在這裡直接顯示，不用再另外開一個
      // 獨立的機械狼睜眼畫面——即使機械狼已死，也要照樣走一次這句台詞，避免其他玩家從
      // 流程有沒有跑這一段猜出誰還活著。
      if(jgMechWolfLearned==='hunter'){
        learnHtml='<div class="speech">「<em>你要使用技能嗎？</em>」</div>'+jgBuildHunterStatusHtml(mwP);
      } else if(dead){
        learnHtml='<div class="speech">「<em>你要使用技能嗎？</em>」</div><div class="speech">「<em>你的技能使用狀況是 👍</em>」</div>';
      } else {
        learnHtml='<div class="speech">「<em>你要使用技能嗎？</em>」</div>'+jgMechWolfSkillUseHtml();
      }
    } else {
      learnHtml='<div class="info" style="font-size:12px;">已學得「'+jgFullRoleName(jgMechWolfLearned)+'」，次晚起可使用技能。</div>';
    }

    // Part 2: kill gesture (night 2+ only) — 即使機械狼已死，這句台詞照樣要問，
    // 只是死亡沒有實際帶刀選項，固定比倒讚略過即可。
    let killGestureHtml='';
    if(jgNight>=2&&!feared){
      if(dead){
        killGestureHtml='<div class="divider"></div>'
          +'<div class="speech">「<em>今晚的帶刀手勢是？（👎 倒讚）</em>」</div>';
      } else if(!otherWolvesAlive){
        const kv=jgRecord.mechWolfKillTarget||jgRecord.wolfKill||'';
        killGestureHtml='<div class="divider"></div>'
          +'<div class="speech">「<em>今晚的帶刀手勢是？（👍 讚）</em>」（其他狼隊友已全滅，機械狼可以殺人）</div>'
          +'<label>機械狼今晚要殺的對象</label>'
          +jgNoSelfCutNoticeHtml()
          +jgNumSelectHtml('jg-mechwolf-kill', kv, null, null, jgNoSelfCutNums());
      } else {
        killGestureHtml='<div class="divider"></div>'
          +'<div class="speech">「<em>今晚的帶刀手勢是？（👎 倒讚）</em>」（狼隊友尚存活，不能殺人）</div>';
      }
    }

    jgShowPg(`
      <h2>機械狼睜眼</h2>
      <div class="speech">「<em>機械狼請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">機械狼已出局，仍需走完流程</div>':''}
      <div id="jg-mechwolf-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      <div id="jg-mechwolf-action" style="${feared?'display:none;':''}">
      ${learnHtml}
      ${killGestureHtml}
      </div>
      <div class="speech" style="margin-top:10px;">「<em>機械狼請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveMechanicalWolf()">已紀錄，下一步 →</button>
    `,'🤖 機械狼');
    if(!jgMechWolfLearned&&jgRecord.mechwolfLearnTarget) setTimeout(jgMechWolfLearnCheck,50);
    if(canUseSkill&&jgMechWolfLearned==='medium'&&jgRecord.mechWolfMediumCheck) setTimeout(jgMechWolfMediumCheckLive,50);
  }
    // ── 狼美人睜眼 ──
  else if(step==='wolfbeauty-wake'){
    const isFirst=jgIsFirstNight();
    const wbP=jgPlayers.find(p=>p.role==='wolfbeauty');
    const needId=isFirst&&!wbP;
    const idHtml=needId?`<div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>狼美人</strong>號碼</label>${jgNumSelectHtml('jg-wolfbeauty-who','','jgSoloIdFearCheck')}</div><div class="divider"></div>`:'';
    const curCharm=jgRecord.wolfbeautyCharm||'';
    const dead=wbP&&!wbP.alive;
    const feared=jgFeared(wbP);
    const wbAlive=needId||(wbP&&wbP.alive);
    jgShowPg(`
      <h2>狼美人睜眼</h2>
      <div class="speech">「<em>狼美人請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">狼美人已出局，仍需走完流程</div>':''}
      <div class="speech">「<em>今晚要魅惑的對象是？</em>」</div>
      ${dead?'':`<div id="jg-wolfbeauty-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      <div id="jg-wolfbeauty-action" style="${feared?'display:none;':''}">
      <label>魅惑的對象（號碼，每晚必須魅惑一人，不能選自己）</label>
      ${jgNumSelectHtml('jg-wolfbeauty-charm', curCharm, 'jgWolfBeautyCheck', null, wbP?[wbP.num]:[])}
      <div id="jg-wolfbeauty-warn"></div>
      <div class="info" style="font-size:12px;margin-top:6px;">出局（被票、獵人射殺）或夜間被毒→魅惑對象殉情<br>不能連續兩晚魅惑同一人・不能自刀・不能魅惑自己</div>
      </div>`}
      <div class="speech" style="margin-top:10px;">「<em>狼美人請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveWolfBeautyNight()">已紀錄，下一步 →</button>
    `,'💋 狼美人');
    if(curCharm&&!dead&&!feared) setTimeout(jgWolfBeautyCheck,50);
  }
  // ── 白狼王睜眼（確認存在即可，自爆在白天發動）──
  else if(step==='whitewolf-wake'){
    const isFirst=jgIsFirstNight();
    const wwP=jgPlayers.find(p=>p.role==='whitewolf');
    const needId=isFirst&&!wwP;
    const idHtml=needId?`<div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>白狼王</strong>號碼</label>${jgNumSelectHtml('jg-whitewolf-who','')}</div><div class="divider"></div>`:'';
    const dead=wwP&&!wwP.alive;
    jgShowPg(`
      <h2>白狼王睜眼</h2>
      <div class="speech">「<em>白狼王請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">白狼王已出局，仍需走完流程</div>':''}
      <div class="info" style="font-size:13px;">白狼王可在白天宣告自爆，帶走場上一名玩家</div>
      <div class="speech" style="margin-top:10px;">「<em>白狼王請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveSubWolf('whitewolf-wake')">下一步 →</button>
    `,'🤍 白狼王');
  }
  // ── 惡靈騎士睜眼 ──
  else if(step==='evilknight-wake'){
    const isFirst=jgIsFirstNight();
    const ekP=jgPlayers.find(p=>p.role==='evilknight');
    const needId=isFirst&&!ekP;
    const idHtml=needId?`<div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>惡靈騎士</strong>號碼</label>${jgNumSelectHtml('jg-evilknight-who','')}</div><div class="divider"></div>`:'';
    const dead=ekP&&!ekP.alive;
    jgShowPg(`
      <h2>惡靈騎士睜眼</h2>
      <div class="speech">「<em>惡靈騎士請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">惡靈騎士已出局，仍需走完流程</div>':''}
      <div class="info" style="font-size:13px;">夜間免疫狼殺、女巫毒與夜槍。被預言家查驗或被女巫毒殺後，隔天會自動反傷（預言家／女巫死亡），系統會自動結算，不需法官手動處理</div>
      <div class="speech" style="margin-top:10px;">「<em>惡靈騎士請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveSubWolf('evilknight-wake')">下一步 →</button>
    `,'🖤 惡靈騎士');
  }
  // ── 石像鬼睜眼（單獨，在女巫後） ──
  else if(step==='gargoyle-wake'){
    const isFirst=jgIsFirstNight();
    const ggP=jgPlayers.find(p=>p.role==='gargoyle');
    const needId=isFirst&&!ggP;
    const idHtml=needId?`<div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>石像鬼</strong>號碼</label>${jgNumSelectHtml('jg-gargoyle-who','','jgSoloIdFearCheck')}</div><div class="divider"></div>`:'';
    const allDead=jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)&&p.role!=='gargoyle'&&!p.alive).length===
      jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)&&p.role!=='gargoyle').length;
    const gv=jgRecord.gargoyleCheck||'';
    const dead=ggP&&!ggP.alive;
    const feared=jgFeared(ggP);
    jgShowPg(`
      <h2>石像鬼睜眼</h2>
      <div class="speech">「<em>石像鬼請睜眼，今晚要查驗的對象是？</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">石像鬼已出局，仍需走完流程</div>':''}
      <div id="jg-gargoyle-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${dead?'':`<div id="jg-gargoyle-action" style="${feared?'display:none;':''}">
      <label>查驗對象號碼</label>
      ${jgNumSelectHtml('jg-gargoyle-check', gv, 'jgGargoyleCheck')}
      <div id="jg-gargoyle-result"></div>
      <div class="divider" style="margin:12px 0 8px;"></div>
      <div class="speech">「<em>今晚的帶刀手勢是？（${allDead?'👍 讚':'👎 倒讚'}）</em>」</div>
      ${allDead?'<label>石像鬼今晚要殺的對象（留空=不殺）</label>'+jgNoSelfCutNoticeHtml()+jgNumSelectHtml('jg-gargoyle-kill', jgRecord.gargoyleKillTarget||jgRecord.wolfKill||'', null, null, jgNoSelfCutNums()):''}</div>`}
      <div class="speech" style="margin-top:10px;">「<em>石像鬼請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveGargoyleNight()">已紀錄，下一步 →</button>
    `,'🗿 石像鬼');
    if(gv&&!dead&&!feared) setTimeout(jgGargoyleCheck,50);
  }
  // ── 通靈師睜眼 ──
  else if(step==='medium-wake'){
    const isFirst=jgIsFirstNight();
    const mdP=jgPlayers.find(p=>p.role==='medium');
    const idHtml=jgGodIdHtml('medium',mdP);
    const dead=mdP&&!mdP.alive;
    const feared=jgFeared(mdP);
    const gv=jgRecord.mediumCheck||'';
    jgShowPg(`
      <h2>通靈師睜眼</h2>
      <div class="speech">「<em>通靈師請睜眼，今晚要查驗的對象是？</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">通靈師已出局，仍需走完流程</div>':''}
      <div id="jg-god-medium-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${dead?'':`<div id="jg-god-medium-action" style="${feared?'display:none;':''}"><label>查驗對象號碼</label>
      ${jgNumSelectHtml('jg-medium-check', gv, 'jgMediumCheck')}
      <div id="jg-medium-result"></div></div>`}
      <div class="speech" style="margin-top:10px;">「<em>通靈師請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveMedium()">已紀錄，下一步 →</button>
    `,'👁️ 通靈師');
    if(gv&&!dead&&!feared) setTimeout(jgMediumCheck,50);
  }
  else if(step==='seer-wake'){
    const isFirst=jgIsFirstNight();
    const seerP=jgPlayers.find(p=>p.role==='seer');
    const seerAlive=seerP&&seerP.alive;
    const hasSeerRole=(jgNight===1&&jgComp.seer>0)||seerP;
    if(!hasSeerRole){ jgGoStep(jgNextGodStep(null)); return; }
    const idHtml=jgIdFieldHtml('預言家', seerP, 'jg-seer-who', 'jg-seer-name');
    const targetVal=jgRecord.seerChecked||'';
    if(!seerAlive&&seerP){
      // Dead seer: just run the script, no input
      jgShowPg(`
        <h2>預言家睜眼</h2>
        <div class="speech">「<em>預言家請睜眼，今晚要查驗的對象是？</em>」</div>
        <div class="info-warn">預言家已出局，仍需走完流程</div>
        <div class="speech">「<em>預言家請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveSeer()">下一步 →</button>
      `,'🔮 預言家');
      return;
    }
    if(jgDualIdentityMode&&!seerP){
      jgShowPg(`
        <h2>預言家睜眼</h2>
        <div class="speech">「<em>預言家請睜眼，今晚要查驗的對象是？</em>」</div>
        <div class="info" style="font-size:12px;">（雙身分板：此身分目前無人持有，可能藏在尚未翻開的第二張牌中）</div>
        <div class="speech">「<em>預言家請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveSeer()">下一步 →</button>
      `,'🔮 預言家');
      return;
    }
    if(jgFeared(seerP)){
      jgShowPg(`
        <h2>預言家睜眼</h2>
        <div class="speech">「<em>預言家請睜眼，今晚要查驗的對象是？</em>」</div>
        <div class="info-warn">（法官搖頭）你被恐懼了，無法使用技能</div>
        <div class="speech">「<em>預言家請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveSeer()">下一步 →</button>
      `,'🔮 預言家');
      return;
    }
    jgShowPg(`
      <h2>預言家睜眼</h2>
      <div class="speech">「<em>預言家請睜眼，今晚要查驗的對象是？</em>」</div>
      ${idHtml}
      <div id="jg-seer-feared-note" class="info-warn" style="display:none;">（法官搖頭）你被恐懼了，無法使用技能</div>
      <div id="jg-seer-action">
      <label>預言家查驗的對象</label>
      ${jgNumSelectHtml('jg-seer-target-input', targetVal, 'jgUpdateSeerResult')}
      <div id="jg-seer-result-box"></div>
      </div>
      <div class="speech" style="margin-top:10px;">「<em>預言家請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveSeer()">已查驗，下一步 →</button>
    `,'🔮 預言家');
    if(jgRecord.seerChecked) setTimeout(jgUpdateSeerResult,50);
  }
  else if(step==='witch-wake'){
    const isFirst=jgIsFirstNight();
    const killed=jgRecord.wolfKill;
    const canShowKilled=jgNight===1||!jgWitchSaveUsed;
    if(jgRecord._witchCanShowKilled===undefined) jgRecord._witchCanShowKilled=canShowKilled;
    const witchP=jgPlayers.find(p=>p.role==='witch');
    const witchAlive=witchP&&witchP.alive;
    const hasWitchRole=(jgNight===1&&jgComp.witch>0)||witchP;
    if(!hasWitchRole){ jgGoStep('seer-wake'); return; }

    const needId=isFirst&&!witchP&&!jgMechAssignDone;
    const idHtml=needId?`<div style="margin-bottom:8px;"><label style="margin-top:0;"><strong>女巫</strong>號碼</label>${jgNumSelectHtml('jg-witch-who','','jgWitchIdCheck')}</div><div class="divider"></div>`:'';

    if(jgDualIdentityMode&&!witchP){
      jgShowPg(`
        <h2>女巫睜眼</h2>
        <div class="speech">「<em>女巫請睜眼。</em>」</div>
        <div class="info" style="font-size:12px;">（雙身分板：此身分目前無人持有，可能藏在尚未翻開的第二張牌中）</div>
        <div class="speech" style="margin-top:8px;">「<em>你要使用解藥嗎？</em>」</div>
        <div class="speech" style="margin-top:8px;">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」</div>
        <div class="speech" style="margin-top:12px;">「<em>女巫請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveWitch()">下一步 →</button>
      `,'🧪 女巫');
      return;
    }

    // If witch is dead, only show judge script (no drug UI)
    if(!witchAlive&&witchP){
      jgShowPg(`
        <h2>女巫睜眼</h2>
        <div class="speech">「<em>女巫請睜眼。</em>」</div>
        <div class="info-warn">女巫已出局，仍需走完流程避免洩露身分</div>
        <div class="speech" style="margin-top:8px;">「<em>他被殺了，你要使用解藥嗎？</em>」</div>
        <div class="speech" style="margin-top:8px;">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」</div>
        <div class="speech" style="margin-top:12px;">「<em>女巫請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveWitch()">下一步 →</button>
      `,'🧪 女巫');
      return;
    }
    if(!needId&&jgFeared(witchP)){
      jgShowPg(`
        <h2>女巫睜眼</h2>
        <div class="speech">「<em>女巫請睜眼。</em>」</div>
        <div class="speech" style="margin-top:8px;">「<em>你要使用解藥嗎？</em>」</div>
        <div class="info-warn">${canShowKilled?'（法官搖頭）你被恐懼了，無法使用技能':'（法官搖頭）解藥用完'}</div>
        <div class="speech" style="margin-top:8px;">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」</div>
        <div class="info-warn">（法官搖頭）你被恐懼了，無法使用技能</div>
        <div class="speech" style="margin-top:12px;">「<em>女巫請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveWitch()">下一步 →</button>
      `,'🧪 女巫');
      return;
    }

    const selfKilled=witchP&&killed&&(witchP.num.toString()===killed.toString());

    // Killed display — the spoken question is asked every night regardless of outcome,
    // so the judge's behavior never leaks whether someone died or the antidote is gone.
    // Even if a guard (real or mech-learned) already protected this exact target, we still
    // show it as a normal kill and let the witch choose — if she also saves the same person,
    // that's a double-protection ("奶穿") and the person actually dies, revealed only at dawn
    // (see jgRenderStep('dawn')) with no forewarning here, to avoid confusing the judge.
    let killedHtml='';
    if(!canShowKilled){
      // 解藥已用完：不透露今晚是否真的有人死、死了誰，仍照樣詢問避免洩露資訊
      killedHtml='<div class="speech">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>'
        +'<div class="info-warn" style="font-size:12px;margin-top:4px;">（法官搖頭）解藥用完</div>';
    } else if(!killed){
      killedHtml='<div class="speech">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>'
        +'<div class="info" style="font-size:12px;margin-top:4px;color:var(--text2);">（今晚無人死亡）</div>';
    } else if(killed){
      const kp=jgFind(killed);
      const kname=kp&&kp.name!==kp.num+'號'?kp.name:'';
      killedHtml='<div class="killed-box"><div class="killed-label">今晚被狼人殺死</div>'
        +'<div class="killed-num">'+killed+'號</div>'
        +'<div class="killed-name">'+kname+'</div></div>'
        +'<div class="speech">「手比 '+killed+'號'+(kname?' '+kname:'')+'：<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>'
        +(selfKilled?'<div class="info-warn" style="margin-top:6px;">女巫自己被殺，不能自救（搖頭）</div>':'');
    }

    // Save section — buttons only (speech is already in killedHtml)
    let saveHtml='';
    if(selfKilled){
      // Witch killed herself — no self-save, no buttons shown
      saveHtml=''; // killedHtml speech already explains the situation
    } else if(!jgWitchSaveUsed&&canShowKilled&&killed){
      const saved=jgRecord.witchSave;
      saveHtml='<div class="btn2" style="margin-top:6px;">'
        +'<button class="'+(saved?'primary':'success')+'" id="jg-btn-save-yes" onclick="jgWitchSaveBtn(true)">救人</button>'
        +'<button class="ghost" id="jg-btn-save-no" onclick="jgWitchSaveBtn(false)">不救</button>'
        +'</div>'
        +'<div id="jg-witch-save-status">'+(saved?'<div class="info-success" style="font-size:12px;margin-top:4px;">✓ 選擇救人（可按「不救」取消）</div>':'')+'</div>';
    }
    // If save already used or no kill shown — no save UI needed (killedHtml explains)

    // Poison section — always show speech
    let poisonHtml='';
    const savedThisRound=jgRecord.witchSave;
    poisonHtml='<div class="speech" style="margin-top:10px;">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」</div>';
    if(jgWitchPoisonUsed){
      poisonHtml+='<div class="info" style="color:var(--text2);font-size:13px;">毒藥已用完</div>';
    } else if(savedThisRound){
      poisonHtml+='<div class="info" style="color:var(--text2);font-size:13px;">已使用解藥，本晚不能同時使用毒藥</div>';
    } else {
      const pv=jgRecord.witchPoison||'';
      poisonHtml+='<div id="jg-witch-poison-wrap">'
        +'<label>毒殺的對象</label>'
        +jgNumSelectHtml('jg-witch-poison-rec', pv)
        +'</div>';
    }

    jgShowPg(`
      <h2>女巫睜眼</h2>
      <div class="speech">「<em>女巫請睜眼。</em>」</div>
      ${idHtml}
      ${killedHtml}
      <div id="jg-witch-feared-note" class="info-warn" style="display:none;">（法官搖頭）你被恐懼了，無法使用技能</div>
      <div id="jg-witch-selfkill-note" class="info-warn" style="display:none;">女巫自己被殺，不能自救（搖頭）</div>
      <div id="jg-witch-action">
      <div id="jg-witch-save-wrap">${saveHtml}</div>
      ${poisonHtml}
      </div>
      <div class="speech" style="margin-top:12px;">「<em>女巫請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveWitch()">已紀錄，下一步 →</button>
    `,'🧪 女巫');
  }
  else if(step==='hunter-wake'){
    const isFirst=jgIsFirstNight();
    const hunterP=jgPlayers.find(p=>p.role==='hunter');
    const hunterExists=(jgNight===1&&jgComp.hunter>0)||hunterP;
    if(!hunterExists){ jgGoStep(jgAfterHunterStep()); return; }
    const idHtml=jgIdFieldHtml('獵人', hunterP, 'jg-hunter-who', 'jg-hunter-name', 'jgHunterIdCheck');
    const statusHtml=hunterP?jgBuildHunterStatusHtml(hunterP):'';
    jgShowPg(`
      <h2>獵人睜眼</h2>
      <div class="speech">「<em>獵人請睜眼。</em>」</div>
      ${idHtml}
      <div id="jg-hunter-status-live">${statusHtml}</div>
      <div class="speech" style="margin-top:12px;">「<em>獵人請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveHunterNight()">已紀錄，下一步 →</button>
    `,'🔫 獵人');
  }
  // 被夜槍／王槍／獵人開槍帶走的對象，如果本身也具備獵人開槍資格（真獵人／已學得獵人的
  // 機械狼／得到獵槍技能的幸運兒），依需求它自己也要能在同一時間點連鎖啟動一次技能、
  // 選擇要帶走的對象——不管觸發連鎖的是哪一種身分，都共用這一個畫面，只是標題/圖示不同。
  else if(step==='mechhunter-chain-shot'){
    const chainNum=jgRecord._mechHunterChainNum;
    const chainRole=jgRecord._mechHunterChainRole||'hunter';
    const CHAIN_LABEL={hunter:{title:'獵人',icon:'🔫'},wolfking:{title:'黑狼王',icon:'👑🔫'},mechanicalwolf:{title:'機械狼（已學得獵人）',icon:'🤖🔫'},luckyone:{title:'幸運兒（獵人技能）',icon:'🍀🔫'}};
    const cl=CHAIN_LABEL[chainRole]||CHAIN_LABEL.hunter;
    const chainP=chainNum?jgByNum(chainNum):null;
    const chainName=chainP&&chainP.name&&chainP.name!==chainP.num+'號'?chainP.num+'號 '+chainP.name:(chainNum?chainNum+'號':'');
    jgShowPg(`
      <h2>${cl.title}啟動技能</h2>
      <div class="info-warn" style="font-size:14px;">${chainName} 被開槍帶走，本身也具備開槍技能，可一併啟動！</div>
      <div class="speech">「<em>${chainName} 啟動角色技能，請選擇你要帶走的號碼。</em>」</div>
      ${jgNumSelectHtml('jg-mechhunter-chain-shot','')}
      <button class="primary" onclick="jgSaveMechHunterChainShot()" style="margin-top:10px;">確認 →</button>
    `,cl.icon+' '+cl.title);
  }
  else if(step==='dreamcatcher-wake'){
    const isFirst=jgIsFirstNight();
    const dcP=jgPlayers.find(p=>p.role==='dreamcatcher');
    if(jgDualIdentityMode&&!dcP){
      jgShowPg(`
        <h2>攝夢人睜眼</h2>
        <div class="speech">「<em>攝夢人請睜眼，今晚夢遊的對象是？</em>」</div>
        <div class="info" style="font-size:12px;">（雙身分板：此身分目前無人持有，可能藏在尚未翻開的第二張牌中）</div>
        <div class="speech" style="margin-top:10px;">「<em>攝夢人請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep(jgAfterDreamcatcherStep())">下一步 →</button>
      `,'🌙 攝夢人');
      return;
    }
    const idHtml=jgGodIdHtml('dreamcatcher',dcP);
    const cur=jgRecord.dreamcatcherTarget||'';
    const dead=dcP&&!dcP.alive;
    const feared=jgFeared(dcP);
    jgShowPg(`
      <h2>攝夢人睜眼</h2>
      <div class="speech">「<em>攝夢人請睜眼，今晚夢遊的對象是？</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">攝夢人已出局，仍需走完流程</div>':''}
      <div id="jg-god-dreamcatcher-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${dead?'':`<div id="jg-god-dreamcatcher-action" style="${feared?'display:none;':''}"><label>夢遊者號碼（一定要夢遊，不能選自己）</label>
      ${jgNumSelectHtml('jg-dc-target', cur, 'jgDreamcatcherCheck')}
      <div id="jg-dc-warn"></div>
      <div class="info" style="font-size:12px;margin-top:6px;">第一次夢遊某人，該人免疫當晚所有夜間傷害（含狼刀與女巫毒）。<br>若攝夢人死亡，該夢遊者同死。<br>若連續兩晚夢遊同一人，則夢遊者死亡。</div></div>`}
      <div class="speech" style="margin-top:10px;">「<em>攝夢人請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveDreamcatcher()">已紀錄，下一步 →</button>
    `,'🌙 攝夢人');
  }
  else if(step==='knight-wake'){
    const isFirst=jgIsFirstNight();
    const knP=jgPlayers.find(p=>p.role==='knight');
    let idHtml=jgGodIdHtml('knight',knP);
    const dead=knP&&!knP.alive;
    jgShowPg(`
      <h2>騎士睜眼</h2>
      ${dead?'<div class="info-warn">騎士已出局，仍需走完流程</div>':''}
      <div class="speech">「<em>騎士請睜眼。</em>」</div>
      ${idHtml}
      <div class="info" style="font-size:13px;">騎士技能在白天使用（投票前翻牌決鬥）。今晚無動作。</div>
      <div class="speech" style="margin-top:10px;">「<em>騎士請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveSimpleGod('knight','knight-wake')">下一步 →</button>
    `,'⚔️ 騎士');
  }
  else if(step==='fool-wake'){
    const isFirst=jgIsFirstNight();
    const flP=jgPlayers.find(p=>p.role==='fool');
    let idHtml=jgGodIdHtml('fool',flP);
    const dead=flP&&!flP.alive;
    jgShowPg(`
      <h2>傻瓜睜眼</h2>
      ${dead?'<div class="info-warn">傻瓜已出局，仍需走完流程</div>':''}
      <div class="speech">「<em>傻瓜請睜眼。</em>」</div>
      ${idHtml}
      <div class="info" style="font-size:13px;">僅第一晚睜眼供法官紀錄號碼，今晚無動作，之後每晚都不用再睜眼。</div>
      <div class="speech" style="margin-top:10px;">「<em>傻瓜請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveSimpleGod('fool','fool-wake')">下一步 →</button>
    `,'🃏 傻瓜');
  }
  else if(step==='magician-wake'){
    const isFirst=jgIsFirstNight();
    const mgP=jgPlayers.find(p=>p.role==='magician');
    if(jgDualIdentityMode&&!mgP){
      jgShowPg(`
        <h2>魔術師睜眼</h2>
        <div class="speech">「<em>魔術師請睜眼，今晚要交換哪兩個號碼？</em>」</div>
        <div class="info" style="font-size:12px;">（雙身分板：此身分目前無人持有，可能藏在尚未翻開的第二張牌中）</div>
        <div class="speech" style="margin-top:10px;">「<em>魔術師請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep(jgAfterMagicianStep())">下一步 →</button>
      `,'🎩 魔術師');
      return;
    }
    const idHtml=jgGodIdHtml('magician',mgP);
    const dead=mgP&&!mgP.alive;
    const feared=jgFeared(mgP);
    const usedSwaps=jgMagicianSwapped||[];
    const usedStr=usedSwaps.length>0?'已交換過的號碼：'+usedSwaps.join('、'):'（尚未有人被交換過）';
    jgShowPg(`
      <h2>魔術師睜眼</h2>
      <div class="speech">「<em>魔術師請睜眼，今晚要交換哪兩個號碼？</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">魔術師已出局，仍需走完流程</div>':''}
      <div id="jg-god-magician-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${dead?'':`<div id="jg-god-magician-action" style="${feared?'display:none;':''}"><div class="info" style="font-size:12px;">${usedStr}</div>
      <div style="margin-top:8px;"><label style="margin-top:0;">號碼 A</label>
        ${jgNumSelectHtml('jg-mg-a', jgRecord.magicianA||'', null, null, usedSwaps, '此號碼已交換過，整局不可再被交換')}</div>
      <div style="margin-top:8px;"><label style="margin-top:0;">號碼 B</label>
        ${jgNumSelectHtml('jg-mg-b', jgRecord.magicianB||'', null, null, usedSwaps, '此號碼已交換過，整局不可再被交換')}</div>
      <div id="jg-mg-warn"></div>
      <div class="info" style="font-size:12px;margin-top:6px;">今晚有效，每個號碼整局只能被交換一次。留空=不交換。</div></div>`}
      <div class="speech" style="margin-top:10px;">「<em>魔術師請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveMagician()">已紀錄，下一步 →</button>
    `,'🎩 魔術師');
  }
  else if(step==='demonhunter-wake'){
    const isFirst=jgIsFirstNight();
    const dhP=jgPlayers.find(p=>p.role==='demonhunter');
    const idHtml=jgGodIdHtml('demonhunter',dhP);
    const dead=dhP&&!dhP.alive;
    const feared=jgFeared(dhP);
    const cur=jgRecord.demonhunterTarget||'';
    jgShowPg(`
      <h2>獵魔人睜眼</h2>
      <div class="speech">「<em>獵魔人請睜眼。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">獵魔人已出局，仍需走完流程</div><div class="speech" style="margin-top:8px;">「<em>今晚要狩獵的人是？</em>」</div>':''}
      <div id="jg-god-demonhunter-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${dead?'':`<div id="jg-god-demonhunter-action" style="${feared?'display:none;':''}">${jgNight<2?'<div class="info">第一晚無法狩獵，只需確認身分。</div>'
        :'<label>今晚狩獵目標（留空=不狩獵）</label>'
         +jgNumSelectHtml('jg-dh-target', cur)
         +'<div class="info" style="font-size:12px;margin-top:4px;">若對方是狼→狼死；若對方是好人→獵魔人自己死。免疫女巫毒藥。</div>'}</div>`}
      <div class="speech" style="margin-top:10px;">「<em>獵魔人請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveDemonhunter()">已紀錄，下一步 →</button>
    `,'🗡️ 獵魔人');
  }
  else if(step==='purewhitemaiden-wake'){
    const pwP=jgPlayers.find(p=>p.role==='purewhitemaiden');
    const idHtml=jgGodIdHtml('purewhitemaiden',pwP);
    const dead=pwP&&!pwP.alive;
    const feared=jgFeared(pwP);
    const cur=jgRecord.purewhitemaidenChecked||'';
    jgShowPg(`
      <h2>純白之女睜眼</h2>
      <div class="speech">「<em>純白之女請睜眼，請選擇要查驗的玩家。</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">純白之女已出局，仍需走完流程</div>':''}
      <div id="jg-god-purewhitemaiden-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${dead?'':`<div id="jg-god-purewhitemaiden-action" style="${feared?'display:none;':''}">
        <label>今晚查驗的對象（留空=不查）</label>
        ${jgNumSelectHtml('jg-purewhitemaiden-target', cur, 'jgPurewhitemaidenCheckLive')}
        <div id="jg-purewhitemaiden-result"></div>
        <div class="info" style="font-size:12px;margin-top:4px;">${jgNight<2?'第一晚查驗只會讓純白之女知道真實身份，不會致死；從第二晚起，若查到狼人陣營，該名狼人立即死亡（守衛與女巫都無法保護）。':'若查到狼人陣營，該名狼人立即死亡（守衛與女巫都無法保護）。'}</div>
      </div>`}
      <div class="speech" style="margin-top:10px;">「<em>純白之女請閉眼。</em>」</div>
      <button class="primary" onclick="jgSavePurewhitemaiden()">已紀錄，下一步 →</button>
    `,'🕊️ 純白之女');
    if(cur&&!dead&&!feared) setTimeout(jgPurewhitemaidenCheckLive,50);
  }
  else if(step==='wolfshaman-check'){
    const wsP=jgPlayers.find(p=>p.role==='wolfshaman');
    if(!wsP){ jgGoStep(jgIsFirstNight()?jgNextGodStep('wolfshaman-check'):jgAfterWolfshamanStep()); return; }
    const dead=!wsP.alive;
    const feared=jgFeared(wsP);
    const cur=jgRecord.wolfshamanChecked||'';
    jgShowPg(`
      <h2>狼巫查驗</h2>
      <div class="speech">「<em>狼巫請睜眼，請選擇要查驗的玩家。</em>」</div>
      ${dead?'<div class="info-warn">狼巫已出局，仍需走完流程</div>':''}
      <div id="jg-god-wolfshaman-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
      ${dead?'':`<div id="jg-god-wolfshaman-action" style="${feared?'display:none;':''}">
        <label>今晚查驗的對象（留空=不查）</label>
        ${jgNumSelectHtml('jg-wolfshaman-target', cur, 'jgWolfshamanCheckLive')}
        <div id="jg-wolfshaman-result"></div>
        <div class="info" style="font-size:12px;margin-top:4px;">${jgNight<2?'第一晚查驗只會讓狼巫知道真實身份，不會致死；從第二晚起，若查到純白之女，純白之女立即死亡（守衛與女巫都無法保護）。':'若查到純白之女，純白之女立即死亡（守衛與女巫都無法保護）。'}</div>
      </div>`}
      <div class="speech" style="margin-top:10px;">「<em>狼巫請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveWolfshamanCheck()">已紀錄，下一步 →</button>
    `,'🔮 狼巫');
    if(cur&&!dead&&!feared) setTimeout(jgWolfshamanCheckLive,50);
  }
  else if(step==='gravkeeper-wake'){
    const isFirst=jgIsFirstNight();
    const gkP=jgPlayers.find(p=>p.role==='gravkeeper');
    let idHtml=jgGodIdHtml('gravkeeper',gkP);
    const dead=gkP&&!gkP.alive;
    // Find last daytime vote-out player
    const lastVoteOut=jgLastVoteOutPlayer;
    let revealHtml='';
    if(jgNight<2){
      revealHtml='<div class="info">第一晚無訊息，守墓人靜默。</div>';
    } else if(lastVoteOut){
      const lp=jgByNum(lastVoteOut);
      const isWolf2=lp&&WOLF_ROLES.includes(lp.role);
      const lname=lp?(lp.name&&lp.name!==lp.num+'號'?lp.num+'號 '+lp.name:lp.num+'號'):'未知';
      revealHtml='<div class="speech">「<em>白天出局的玩家陣營是？</em>」（法官對守墓人比出手勢：好人 👍 比讚／狼人 👎 倒讚）</div>'
        +'<div class="info-'+(isWolf2?'danger':'success')+'" style="font-size:16px;font-weight:800;text-align:center;padding:14px;">'
        +lname+' → '+(isWolf2?'狼人（法官倒讚 👎）':'好人（法官比讚 👍）')+'</div>';
    } else {
      revealHtml='<div class="info">前一白天無人被票出，守墓人無訊息。</div>';
    }
    jgShowPg(`
      <h2>守墓人睜眼</h2>
      ${dead?'<div class="info-warn">守墓人已出局，仍需走完流程</div>':''}
      <div class="speech">「<em>守墓人請睜眼。</em>」</div>
      ${idHtml}
      ${revealHtml}
      <div class="speech" style="margin-top:10px;">「<em>守墓人請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveGravkeeper()">下一步 →</button>
    `,'⚰️ 守墓人');
  }
  // ── 黑市商人睜眼 ──
  else if(step==='blackmarket-wake'){
    const bmP=jgPlayers.find(p=>p.role==='blackmarket');
    if(jgBlackMarketUsed){
      // 交易已完成：幸運兒的睜眼位置已移到整晚最後（見 jgNextGodStep 尾端插入），
      // 這裡不再插入 luckyone-wake，直接照原本狼隊之後的流程繼續走向女巫。
      jgGoStep('witch-wake');
      return;
    }
    const idHtml=jgGodIdHtml('blackmarket',bmP);
    const dead=bmP&&!bmP.alive;
    jgShowPg(`
      <h2>黑市商人睜眼</h2>
      <div class="speech">「<em>黑市商人請睜眼，今晚要交易嗎？</em>」</div>
      ${idHtml}
      ${dead?'<div class="info-warn">黑市商人已出局，仍需走完流程</div>':''}
      ${dead?'':`<div class="info" style="font-size:12px;">整局限一次交易。若對象是好人，成為「幸運兒」並獲得指定技能；若對象是狼人，交易失敗，商人將於次日死亡，該狼人不會知道自己曾被選中。</div>
      <label>交易對象號碼（留空=本晚不交易）</label>
      ${jgNumSelectHtml('jg-bm-target', jgRecord.blackmarketTarget||'', null, null, bmP?[bmP.num]:[], '黑市商人不能與自己交易，不可選取')}
      <label style="margin-top:8px;">給予的技能</label>
      <select id="jg-bm-skill">
        <option value="seer">預言家查驗</option>
        <option value="witch">女巫毒藥</option>
        <option value="hunter">獵人獵槍</option>
      </select>`}
      <div class="speech" style="margin-top:10px;">「<em>黑市商人請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveBlackMarket()">已紀錄，下一步 →</button>
    `,'💰 黑市商人');
  }
  // ── 幸運兒睜眼（獨立步驟，不跟真預言家／真女巫共用畫面，避免彼此知道對方是誰）──
  else if(step==='luckyone-wake'){
    const ly=jgLuckyOne;
    if(!ly||(ly.gift!=='seer'&&ly.gift!=='witch')){
      // 掩護畫面：沒有幸運兒、交易失敗，或幸運兒拿到的其實是獵人獵槍（被動技能，平常
      // 晚上不用做任何事）時，法官一樣要照樣走一次「幸運兒請睜眼／請閉眼」的儀式，
      // 外觀跟拿到查驗／毒藥的夜晚完全相同，玩家才聽不出這幾種狀況的差別，也才猜不出
      // 幸運兒到底拿到哪個技能、甚至猜不出交易到底有沒有成功。
      jgShowPg(`
        <h2>幸運兒睜眼</h2>
        <div class="speech">「<em>幸運兒請睜眼，你要使用技能嗎？</em>」</div>
        <div class="speech" style="margin-top:10px;">「<em>幸運兒請閉眼。</em>」</div>
        <button class="primary" onclick="jgGoStep('dawn')">已紀錄，下一步 →</button>
      `,'🍀 幸運兒');
      return;
    }
    const lp=jgByNum(ly.num);
    const dead=lp&&!lp.alive;
    const feared=jgFeared(lp);
    const skillDone=!!ly.used;
    const canAct=!dead&&!feared&&!skillDone;
    if(ly.gift==='seer'){
      const gv=jgRecord.luckyoneCheck||'';
      jgShowPg(`
        <h2>幸運兒睜眼</h2>
        <div class="speech">「<em>幸運兒請睜眼，你要使用技能嗎？</em>」</div>
        ${dead?'<div class="info-warn">幸運兒已出局，仍需走完流程</div>':''}
        <div id="jg-luckyone-feared-note" class="info-warn" style="${feared&&!dead?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
        ${skillDone&&!dead&&!feared?'<div class="info" style="font-size:12px;color:var(--text2);">查驗技能已使用過（整局限一次）</div>':''}
        ${canAct?`<div id="jg-luckyone-action"><label>查驗對象號碼（留空=不查）</label>${jgNumSelectHtml('jg-luckyone-seer-target', gv, 'jgUpdateLuckyoneSeerResult')}<div id="jg-luckyone-seer-result"></div></div>`:''}
        <div class="speech" style="margin-top:10px;">「<em>幸運兒請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveLuckyoneNight()">已紀錄，下一步 →</button>
      `,'🍀 幸運兒');
      if(gv&&canAct) setTimeout(jgUpdateLuckyoneSeerResult,50);
    } else {
      const pv=jgRecord.luckyonePoison||'';
      jgShowPg(`
        <h2>幸運兒睜眼</h2>
        <div class="speech">「<em>幸運兒請睜眼，你要使用技能嗎？</em>」</div>
        ${dead?'<div class="info-warn">幸運兒已出局，仍需走完流程</div>':''}
        <div id="jg-luckyone-feared-note2" class="info-warn" style="${feared&&!dead?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
        ${skillDone&&!dead&&!feared?'<div class="info" style="font-size:12px;color:var(--text2);">毒藥已使用過（整局限一次）</div>':''}
        ${canAct?`<label>毒殺對象（留空=不毒）</label>${jgNumSelectHtml('jg-luckyone-poison', pv)}`:''}
        <div class="speech" style="margin-top:10px;">「<em>幸運兒請閉眼。</em>」</div>
        <button class="primary" onclick="jgSaveLuckyoneNight()">已紀錄，下一步 →</button>
      `,'🍀 幸運兒');
    }
  }
  // ── 幸運兒走一圈（無論交易成功與否，法官都做同樣的動作與台詞，避免洩露交易結果） ──
  else if(step==='luckyone-walk'){
    const success=!!jgRecord.blackmarketSuccess;
    const ly=success?jgLuckyOne:null;
    const giftLabel=ly?({seer:'預言家查驗',witch:'女巫毒藥',hunter:'獵人獵槍'}[ly.gift]||''):'';
    jgShowPg(`
      <h2>幸運兒</h2>
      <div class="speech" style="margin-top:10px;">「<em>被拍到肩膀的人，等一下聽到『幸運兒請睜眼』時要睜眼。</em>」</div>
      <div class="info" style="font-size:13px;">${success?'法官起身，繞場走一圈，輕拍 '+ly.num+' 號玩家的肩膀':'法官起身，繞場走一圈，不用拍肩膀'}</div>
      <div class="speech" style="margin-top:10px;">「<em>幸運兒請睜眼。</em>」</div>
      ${success?'<button onclick="jgShowBigCard(\''+ly.num+'號\',\''+giftLabel+'\')" style="margin-top:6px;width:100%;">📋 大字報顯示技能給幸運兒看</button>':'<div class="info" style="font-size:12px;">（此為掩護動作，沒有人是幸運兒，直接進行下一步）</div>'}
      <div class="speech" style="margin-top:10px;">「<em>幸運兒請閉眼。</em>」</div>
      <button class="primary" onclick="jgGoStep('witch-wake')">下一步 →</button>
    `,'🍀 幸運兒');
  }
  else if(step==='dawn'){
    // 有開警長競選的話，天亮公布死訊之前，先讓警長競選這一輪完全跑完（候選人／發言／投票或
    // 自爆），死訊要等競選整個結束才公布——這樣候選人站起來的時候還不知道昨晚誰死了，
    // 跟真實遊戲流程一致。
    // 雙爆吞警徽規則的隔天（第二天）：不重新問一次候選人起立、也不重新發言——直接沿用第一天
    // 已經站起來、還活著、也還沒退水的那批候選人續選（只保留退水／自爆／投票），一樣要等這輪
    // 續選整個結束（第二次自爆，或投票分出結果）才公布昨晚（第二夜）的死訊。
    if(jgSheriffEnabled&&!jgSheriffElectionDone&&(
      (jgNight===1&&!jgSheriffCandidatesAsked) ||
      (jgBadgeMode==='double'&&jgSheriffPostponedToDay2&&jgNight===2&&!jgSheriffDay2CandidatesAsked)
    )){
      if(jgNight===1){ jgRenderSheriffCandidates(); }
      else { jgSheriffDay2CandidatesAsked=true; jgRenderSheriffDay2Resume(); }
      return;
    }
    // First night: seal remaining unassigned players as villagers
    if(jgNight===1){ jgSealVillagers(); jgRenderRoster(); }

    // 大野狼+小女孩板：狼隊指認小女孩的判定要搶在最前面處理——如果指認成功，小女孩會「代替」
    // 原本的狼刀死亡目標死亡，原本的目標完全沒事；所以要在計算 guardSaved／witchSaved 等一切
    // 狼刀相關邏輯之前，先把 jgRecord.wolfKill 清空，讓後面所有判斷都以「這一刀原本的目標沒事」
    // 為準。小女孩這個死法不可被守衛/女巫阻擋，另外用 _littlegirlSubstituteKill 標記，天亮結算
    // 時獨立處理，不走一般狼刀的守衛/女巫判斷（見下方「特殊致死」那一段）。
    const _lgP=jgPlayers.find(p=>p.role==='littlegirl');
    const _identifySuccess=!!(_lgP&&_lgP.alive&&jgRecord.wolfIdentifyGuess&&_lgP.num.toString()===jgRecord.wolfIdentifyGuess.toString());
    if(_identifySuccess){
      jgRecord._littlegirlSubstituteKill=_lgP.num;
      jgRecord.wolfKill=null;
    }
    jgRecord.wolfIdentifyGuess=null;

    const guardSaved=jgRecord.guardTarget&&jgRecord.wolfKill&&
      (jgRecord.guardTarget.toString()===jgRecord.wolfKill.toString());
    const witchSaved=jgRecord.witchSave;
    // 機械狼學到守衛：也能擋狼刀，且特別可以擋女巫毒、夜槍（一般守衛擋不了毒與夜槍）
    const mechWolfGuardSavesKill=jgRecord.mechWolfGuardTarget&&jgRecord.wolfKill&&
      (jgRecord.mechWolfGuardTarget.toString()===jgRecord.wolfKill.toString());
    const mechWolfGuardSavesPoison=jgRecord.mechWolfGuardTarget&&jgRecord.witchPoison&&
      (jgRecord.mechWolfGuardTarget.toString()===jgRecord.witchPoison.toString());
    // 機械守衛技能一旦成功接觸到（真的擋到）任一攻擊——無論最終是否因奶穿而死——即視為用畢，
    // 之後不能再使用（機械守衛只是空守、沒接觸到任何攻擊的夜晚不消耗）
    if(jgMechWolfLearned==='guard'&&!jgMechWolfGuardUsed&&(mechWolfGuardSavesKill||mechWolfGuardSavesPoison)){
      jgMechWolfGuardUsed=true;
    }
    // 雙機械狼板：學到守衛的機械狼，保護對象免疫「狼刀、巫毒、夜槍」等一切夜間傷害（包含
    // 兩隻機械狼各自的刀口、大小機械狼自己學到的女巫毒）。可能兩隻都學到守衛、各自守不同
    // 目標，所以用「有沒有任一隻守到這個號碼」來判斷，不是只看單一欄位。
    const _mechwolf2GuardTargets=['bigmechwolf','smallmechwolf'].map(r=>jgRecord['mechwolf2Guard_'+r]).filter(Boolean);
    const jgMechWolf2GuardProtects=(num)=>!!(num&&_mechwolf2GuardTargets.some(t=>t.toString()===num.toString()));
    let deads=[];
    // Wolf kill (blocked by guard or witch save?)
    // Evilknight is immune to wolf kill
    const _ekNum=jgPlayers.find(p=>p.role==='evilknight')?.num;
    const _wolfKillIsEK=_ekNum&&jgRecord.wolfKill&&(jgRecord.wolfKill.toString()===_ekNum.toString());
    // Dreamcatcher's first-time dream target is immune to all night damage tonight
    const _dcImmune=jgRecord.dreamcatcherImmune;
    const _wolfKillIsDCImmune=_dcImmune&&jgRecord.wolfKill&&(jgRecord.wolfKill.toString()===_dcImmune.toString());
    const _poisonIsDCImmune=_dcImmune&&jgRecord.witchPoison&&(jgRecord.witchPoison.toString()===_dcImmune.toString());
    // 假面舞會板：舞者若選自己進舞池，當晚舞池中所有玩家免疫狼刀（不影響舞池本身的陣營死亡判定，
    // 那是另一個獨立的死法，見下方 dancerPool 陣營結算）
    const _dancerImmunePool=(jgRecord.dancerSelfIn&&jgRecord.dancerPool)?jgRecord.dancerPool.map(String):[];
    const _wolfKillIsDancerImmune=!!(jgRecord.wolfKill&&_dancerImmunePool.includes(jgRecord.wolfKill.toString()));
    // 獵魔人免疫女巫毒藥
    const _poisonTargetP=jgRecord.witchPoison?jgFind(jgRecord.witchPoison):null;
    const _poisonIsDemonhunter=!!(_poisonTargetP&&_poisonTargetP.role==='demonhunter');
    // 任一種守衛（真守衛或機械狼學到的守衛）與女巫同守同救（同一目標）：奶穿，該玩家實際上死亡。
    // 兩種守衛同守同一人（沒有女巫介入）只是雙重保護，不會奶穿。這個判定只在天亮結算時發生，
    // 女巫睜眼與獵人等其他夜間角色都不會提前知道——牌面上跟一般狼刀致死看起來一樣。
    const guardedByAny=!!(guardSaved||mechWolfGuardSavesKill||jgMechWolf2GuardProtects(jgRecord.wolfKill));
    // 雙機械狼板規則8：小機械狼回歸主狼群當晚，狼隊的主要狼刀「無敵」，可以直接破守衛的盾
    // （這個旗標只在那一晚有效，見 jgAfterGargoyleStep 的觸發點）——注意只破守衛，不影響
    // 女巫解藥，女巫該不該救人仍然照原本邏輯判斷。
    const _wolfKillIsInvincible=!!jgRecord._mechwolf2InvincibleKnifeNight;
    const overheal=!!(jgRecord.wolfKill&&guardedByAny&&witchSaved&&!_wolfKillIsEK&&!_wolfKillIsDCImmune&&!_wolfKillIsDancerImmune);
    const wolfKillDies=!!(jgRecord.wolfKill&&!_wolfKillIsEK&&!_wolfKillIsDCImmune&&!_wolfKillIsDancerImmune&&
      (overheal||(_wolfKillIsInvincible?!witchSaved:(!guardedByAny&&!witchSaved))));
    if(wolfKillDies) deads.push(jgRecord.wolfKill);
    // Witch poison (guard cannot block this, but 機械狼學到守衛 specially can)
    // 假面／舞者免疫女巫的毒（規則明寫兩者都免疫）
    const _poisonTargetP2=jgRecord.witchPoison?jgFind(jgRecord.witchPoison):null;
    const _poisonIsMaskOrDancer=!!(_poisonTargetP2&&(_poisonTargetP2.role==='mask'||_poisonTargetP2.role==='dancer'));
    if(jgRecord.witchPoison&&!mechWolfGuardSavesPoison&&!jgMechWolf2GuardProtects(jgRecord.witchPoison)&&!_poisonIsDCImmune&&!_poisonIsDemonhunter&&!_poisonIsMaskOrDancer) deads.push(jgRecord.witchPoison);
    // Lucky-one witch-gift poison (guard cannot block this)
    if(jgRecord.luckyonePoison) deads.push(jgRecord.luckyonePoison);
    // Black market trade failure — dealer dies
    if(jgRecord.blackmarketFail&&jgRecord._blackmarketDealerNum) deads.push(jgRecord._blackmarketDealerNum);
    // 狼弟覺醒刀（不可被守衛/女巫解藥阻擋）
    if(jgRecord.wolfBrotherAwakenKill) deads.push(jgRecord.wolfBrotherAwakenKill);
    // 機械狼學到女巫的毒（不可被守衛阻擋）
    if(jgRecord.mechWolfPoison) deads.push(jgRecord.mechWolfPoison);
    // 機械狼學到狼人：一次性額外一刀（不可被守衛/女巫解藥阻擋）
    if(jgRecord.mechWolfBonusKillTarget) deads.push(jgRecord.mechWolfBonusKillTarget);
    // 雙機械狼板：先把這一晚兩隻機械狼各自的毒藥目標存成區域變數（在任何欄位被清空之前），
    // 讓「守衛技能有沒有接觸到攻擊」跟「毒有沒有命中」都用同一份資料，不會因為誰先清空
    // 欄位而讀到 null（這裡曾經因為順序寫反，導致守衛技能永遠判斷成「沒接觸到攻擊」）。
    const _mw2PoisonBig=jgRecord['mechwolf2Poison_bigmechwolf'];
    const _mw2PoisonSmall=jgRecord['mechwolf2Poison_smallmechwolf'];
    // 機械守衛技能一旦這一晚成功「接觸」到任一起攻擊（不管最後是否因奶穿而死），即視為
    // 用畢——用「保護對象這一晚有沒有被任何攻擊鎖定」判斷，不是只看最終死活。要搶在
    // 任何攻擊目標欄位被清空之前判斷。
    ['bigmechwolf','smallmechwolf'].forEach(r=>{
      const st=jgMechWolf2State[r];
      const gv=jgRecord['mechwolf2Guard_'+r];
      if(gv&&!st.guardUsed){
        const attacked=[jgRecord.wolfKill,jgRecord.witchPoison,
          jgRecord['mechwolf2Kill_bigmechwolf_1'],jgRecord['mechwolf2Kill_bigmechwolf_2'],
          jgRecord['mechwolf2Kill_smallmechwolf_1'],jgRecord['mechwolf2Kill_smallmechwolf_2'],
          _mw2PoisonBig,_mw2PoisonSmall,
          jgRecord.bigbadwolfBonusKillTarget].filter(Boolean).some(t=>t.toString()===gv.toString());
        if(attacked) st.guardUsed=true;
      }
      jgRecord['mechwolf2Guard_'+r]=null;
    });
    // 大／小機械狼各自學到女巫時下的毒（可被雙機械狼板的機械守衛擋下，跟一般女巫毒不同——
    // 這裡故意用 jgMechWolf2GuardProtects，不是不可擋）
    if(_mw2PoisonBig&&!jgMechWolf2GuardProtects(_mw2PoisonBig)) deads.push(_mw2PoisonBig);
    if(_mw2PoisonSmall&&!jgMechWolf2GuardProtects(_mw2PoisonSmall)) deads.push(_mw2PoisonSmall);
    jgRecord['mechwolf2Poison_bigmechwolf']=null;
    jgRecord['mechwolf2Poison_smallmechwolf']=null;
    deads=[...new Set(deads)];

    // Hunter night shot (only valid if hunter was actually killed by the wolf-kill path,
    // whether a normal unblocked kill or an overheal death — not if poisoned instead)
    if(jgRecord.hunterNightShot){
      const hunterP=jgPlayers.find(p=>p.role==='hunter');
      const hunterWolfKilled=hunterP&&jgRecord.wolfKill&&
        (hunterP.num.toString()===jgRecord.wolfKill.toString())&&wolfKillDies;
      if(hunterWolfKilled) deads.push(jgRecord.hunterNightShot);
    }
    deads=[...new Set(deads)];

    // Evilknight is immune to wolf kill and poison — remove from deads if present
    const ekP=jgPlayers.find(p=>p.role==='evilknight');
    if(ekP){
      deads=deads.filter(d=>d.toString()!==ekP.num.toString());
    }
    // 獵人／黑狼王被狼刀刀死時，本來設計是讓他先開槍反擊、看能不能翻盤，才判定勝負。
    // 但依法官需求調整：狼刀是「先」發生的動作，只要狼刀這一刀本身就已經讓好人陣營團滅
    // （屠邊或人數達標），勝負當下就定案，不必再等被刀死的獵人/黑狼王開槍——他的槍來得
    // 太晚，改變不了已經成立的結果。只有在狼刀本身還不足以決定勝負時，才會照常往下走到
    // 開槍畫面，讓那一槍有機會自己創造出新的勝負條件（例如打死最後一隻狼）。
    // 獵魔人夜擊：他一定睡在狼人之後，換句話說他這一擊「早就已經決定」了（只是還沒套用到
    // 場上人數），不是還沒發生的懸而未決動作。狼刀單純湊出「人數已達多數」這種統計上的
    // 提前判定（不是真的屠邊、平民或神職都還沒死絕），這只是「等一下投票大概率會贏」的捷徑，
    // 若獵魔人這一擊剛好砍在僅存的狼身上，會直接打破這個人數判斷，所以要先套用他的擊殺結果
    // 再判斷，不能搶在前面就用「還沒扣掉獵魔人這一刀」的數字判定勝負。
    // 但如果狼刀已經是「真的屠邊」（平民或神職死絕），這件事本身就已經成立、獨立於獵魔人的
    // 這一擊之外，不受影響，可以直接判定狼贏，不用等。
    const _pendingDhP=jgPlayers.find(p=>p.role==='demonhunter'&&p.alive);
    const _pendingDhTarget=(jgNight>=2&&jgRecord.demonhunterTarget)?jgFind(jgRecord.demonhunterTarget):null;
    const _pendingDemonhunterWolfKill=!!(_pendingDhP&&_pendingDhTarget&&_pendingDhTarget.alive&&WOLF_ROLES.includes(_pendingDhTarget.role));
    const _isMajorityReason=r=>!!(r&&r.winner==='wolf'&&typeof r.msg==='string'&&r.msg.indexOf('人數已達多數')>=0);
    if(!jgNightLog[jgNight]) jgNightLog[jgNight]=jgFormatNightLog();
    // Apply wolf-side deaths first (wolf kill, witch poison that kills good people)
    // Then check if wolf already won BEFORE applying good-side deaths (evilknight revenge etc.)
    // jgApplyDeath handles 雙身分模式 transparently: if this is a swap (not a true elimination),
    // the player keeps playing under their second card and must NOT be announced as dead.
    let trulyDiedNums=[];
    let swappedNums=[];
    deads.forEach(d=>{ const p=jgFind(d); if(p){ const trulyDied=jgApplyDeath(p); if(trulyDied){ p._diedThisDawn=true; trulyDiedNums.push(p.num); } else { swappedNums.push(p.num); } } });
    // 警上競選過程中若有狼人自爆（雙爆的第一爆、或最終真的流失警徽的一爆），他的死亡在進
    // 這個 dawn 步驟之前就已經用 jgApplyDeath 另外處理過了，不會出現在上面的 deads 清單裡；
    // 這裡把他併入遺言名單，讓自爆的人跟一般死亡玩家一樣可以發表遺言。注意：自爆是白天當場
    // 發生的事，不是「昨晚」發生的，所以號碼另外用 selfDestructDawnNum 記著，公告文字要跟
    // 「昨晚死亡／平安夜」分開講，不能把兩件事混在同一句「昨晚 X 死亡」裡面。
    let selfDestructDawnNum=null;
    if(jgRecord._selfDestructNum){
      const sdp=jgFind(jgRecord._selfDestructNum);
      if(sdp){ selfDestructDawnNum=sdp.num; if(!trulyDiedNums.includes(sdp.num)){ sdp._diedThisDawn=true; trulyDiedNums.push(sdp.num); } }
    }
    if(swappedNums.length&&jgNightLog[jgNight]) jgNightLog[jgNight].push('換牌 '+swappedNums.join(','));
    jgPlayers.forEach(p=>{ if(p._diedThisDawn&&!trulyDiedNums.includes(p.num)) delete p._diedThisDawn; });
    // Check wolf win BEFORE revenge deaths — wolves attacked first
    // （若這只是「人數已達多數」而獵魔人這一擊剛好砍在僅存的狼身上，先不要定案；
    // 除此之外，狼刀本身已經決定的勝負不再等被刀死的獵人/黑狼王開槍反擊）
    const wolfFirstWin=jgCheckWin();
    if(wolfFirstWin&&wolfFirstWin.winner==='wolf'&&
      !(_isMajorityReason(wolfFirstWin)&&_pendingDemonhunterWolfKill)){ jgRenderRoster(); jgShowWin(wolfFirstWin); return; }
    jgRecord.hunterNightShot=null;
    jgRecord.blackmarketFail=false;
    jgRecord.luckyonePoison=null;

    const pname=p=>p?p.num+'號':'';
    // 若有多人死亡，「死亡」二字只講一次就好（例：「昨晚 3號、7號、1號死亡。」），
    // 不用每個號碼後面都重複一次「死亡」。換牌（雙身分卡1陣亡但卡2還在）的公告文字不同，
    // 所以跟真正死亡的號碼分開兩組講，各自的字尾只出現一次。
    const jgBuildDawnMsg=(deadNames,swapNames)=>{
      const parts=[];
      if(deadNames.length) parts.push(deadNames.join('、')+'死亡');
      if(swapNames.length) parts.push(swapNames.join('、')+'死亡，請使用第二身分');
      return parts.length===0?'昨晚是平安夜。':'昨晚 '+parts.join('、')+'。';
    };
    let dawnMsg=''; // computed below, after revenge deaths are resolved
    // 自爆者的淘汰公告，跟「昨晚死亡／平安夜」是兩句獨立的話，畫面上會分開顯示
    const sdMsg=selfDestructDawnNum?(selfDestructDawnNum+'號淘汰，請發表遺言。'):'';

    // Evilknight revenge: seer or witch dies at dawn
    if(jgRecord.evilknightRevengeSeer){
      const sp=jgPlayers.find(p=>p.role==='seer'&&p.alive);
      if(sp){ const trulyDied=jgApplyDeath(sp); if(trulyDied){ sp._diedThisDawn=true; if(!trulyDiedNums.includes(sp.num))trulyDiedNums.push(sp.num); } else if(!swappedNums.includes(sp.num)){ swappedNums.push(sp.num); } }
      jgRecord.evilknightRevengeSeer=false;
    }
    if(jgRecord.evilknightRevengeWitch){
      const wp=jgPlayers.find(p=>p.role==='witch'&&p.alive);
      if(wp){ const trulyDied=jgApplyDeath(wp); if(trulyDied){ wp._diedThisDawn=true; if(!trulyDiedNums.includes(wp.num))trulyDiedNums.push(wp.num); } else if(!swappedNums.includes(wp.num)){ swappedNums.push(wp.num); } }
      jgRecord.evilknightRevengeWitch=false;
    }
    // 雙身分模式：卡1陣亡但還有卡2的玩家不是「真的死了」，要公告「X號死亡，請使用第二身分」
    // 並繼續遊戲；只有卡2也陣亡（或單身分模式）才是真正的「X號死亡」。完全沒有事發生才是平安夜。
    // 自爆者已經用 sdMsg 單獨公告過了，這裡的「昨晚」死訊要把他排除掉，避免同一個人被講兩次、
    // 又被誤講成「昨晚死亡」。
    const deadNames2=trulyDiedNums.filter(n=>n!==selfDestructDawnNum).map(n=>{ const p=jgFind(n); return p?p.num+'號':n+'號'; });
    const swapNames2=swappedNums.map(n=>{ const p=jgFind(n); return p?p.num+'號':n+'號'; });
    dawnMsg=jgBuildDawnMsg(deadNames2,swapNames2);
    jgLastNightPeaceful=(deadNames2.length===0&&swapNames2.length===0);
    jgRenderRoster();
    const dawnWin=jgCheckWin();
    if(dawnWin&&!(_isMajorityReason(dawnWin)&&_pendingDemonhunterWolfKill)){ jgShowWin(dawnWin); return; }

    // Demonhunter hunt at night
    if(jgNight>=2&&jgRecord.demonhunterTarget){
      const dhP=jgPlayers.find(p=>p.role==='demonhunter'&&p.alive);
      const target=jgFind(jgRecord.demonhunterTarget);
      if(dhP&&target&&target.alive){
        if(WOLF_ROLES.includes(target.role)){
          // Target is wolf: wolf dies
          target.alive=false;
          if(!deads.includes(target.num)) deads.push(target.num);
        } else {
          // Target is good: demonhunter dies
          dhP.alive=false;
          if(!deads.includes(dhP.num)) deads.push(dhP.num);
        }
      }
      jgRecord.demonhunterTarget=null;
    }
    // Dreamcatcher consecutive kill——封印判斷要「不管這個人現在是不是已經死了」都要標記
    // （理由同純白之女查殺那段的註解：同一晚可能同時被狼刀擊殺，_skillSealed 不能漏標）。
    if(jgRecord.dreamcatcherKillTarget){
      const dct=jgFind(jgRecord.dreamcatcherKillTarget);
      if(dct){
        dct._skillSealed=true;
        if(dct.alive){dct.alive=false;}
        if(!deads.includes(dct.num))deads.push(dct.num);
      }
      jgRecord.dreamcatcherKillTarget=null;
    }
    // Dreamcatcher: if dreamcatcher dies this dawn, their target also dies（同樣不能漏標 _skillSealed）
    if(jgRecord.dreamcatcherTarget){
      const dcP2=jgPlayers.find(p=>p.role==='dreamcatcher');
      if(dcP2&&!dcP2.alive){
        const dct2=jgFind(jgRecord.dreamcatcherTarget);
        if(dct2){
          dct2._skillSealed=true;
          if(dct2.alive){dct2.alive=false;}
          if(!deads.includes(dct2.num))deads.push(dct2.num);
        }
      }
    }
    // 狼巫、純白之女互相查殺到對方，且「剛好」兩人分別是各自陣營場上僅存的最後一人
    // （最後一狼、最後一神）：規則採「狼刀在先」——狼隊的擊殺視為先發生，所以狼巫這一查殺
    // 先生效（純白之女死亡）；純白之女的查殺因為「先發生」的狼刀已經讓她自己死了，這一下
    // 等於沒發動，直接取消，狼巫不會跟著陪葬。
    // 這個特判只在「雙方都是各自陣營最後一人」時才適用——如果互查當下狼隊或神職還有其他
    // 存活成員，就不算這個特殊情況，兩邊維持各自正常結算、同歸於盡（不套用狼刀在先）。
    const wolfshamanMutualKill=!!(jgRecord.wolfshamanKillTarget&&jgRecord.purewhitemaidenKillTarget);
    if(wolfshamanMutualKill){
      const wsP2=jgPlayers.find(p=>p.role==='wolfshaman');
      const pwP2=jgPlayers.find(p=>p.role==='purewhitemaiden');
      const isMutual=!!(wsP2&&pwP2
        &&jgRecord.wolfshamanKillTarget.toString()===pwP2.num.toString()
        &&jgRecord.purewhitemaidenKillTarget.toString()===wsP2.num.toString());
      const aliveWolves=jgPlayers.filter(p=>WOLF_ROLES.includes(p.role)&&p.alive);
      const aliveGods=jgPlayers.filter(p=>GOD_ROLES.includes(p.role)&&p.alive);
      const isLastWolfLastGod=isMutual
        &&aliveWolves.length===1&&aliveWolves[0].role==='wolfshaman'
        &&aliveGods.length===1&&aliveGods[0].role==='purewhitemaiden';
      if(isLastWolfLastGod) jgRecord.purewhitemaidenKillTarget=null; // 狼刀在先：純白之女的查殺取消，狼巫不死
    }
    // 狼巫查驗到純白之女：第二晚起才會有這個目標值（見 jgSaveWolfshamanCheck），
    // 守衛與女巫都無法保護，直接致死。
    if(jgRecord.wolfshamanKillTarget){
      const wst=jgFind(jgRecord.wolfshamanKillTarget);
      if(wst&&wst.alive){wst.alive=false;if(!deads.includes(wst.num))deads.push(wst.num);}
      jgRecord.wolfshamanKillTarget=null;
    }
    // 純白之女查驗到狼人陣營：第二晚起才會有這個目標值（見 jgSavePurewhitemaiden），
    // 守衛與女巫都無法保護，直接致死。互查對方的情況（狼刀在先）已經在上面處理過，
    // 這裡若 purewhitemaidenKillTarget 已被取消就不會再進來這個分支。
    // 這種死法不是被狼刀擊殺，獵人／黑狼王被查殺時技能一樣被封印，不能開槍——標記
    // _skillSealed，天亮判斷能不能開槍時會用到（見 jgHunterSkillSealed，跟攝夢人
    // 致死用的是同一套機制）。注意：封印要「不管這個人現在是不是已經死了」都要標記——
    // 如果這位獵人/黑狼王同一晚剛好也被狼刀擊殺（前面的狼刀結算已經先把他標成死亡），
    // 這裡如果還用「pwt.alive」當作條件，就會漏掉這個標記，導致他明明該被封印卻沒被封印。
    if(jgRecord.purewhitemaidenKillTarget){
      const pwt=jgFind(jgRecord.purewhitemaidenKillTarget);
      if(pwt){
        pwt._skillSealed=true;
        if(pwt.alive){pwt.alive=false;}
        if(!deads.includes(pwt.num))deads.push(pwt.num);
      }
      jgRecord.purewhitemaidenKillTarget=null;
    }
    // 大野狼+小女孩板：小女孩被成功指認、代替原本刀口死亡——不可被守衛／女巫阻擋，
    // 用法跟狼巫／純白之女的查殺一致（見上方 _identifySuccess 的判斷）。
    if(jgRecord._littlegirlSubstituteKill){
      const lgt=jgFind(jgRecord._littlegirlSubstituteKill);
      if(lgt&&lgt.alive){ lgt.alive=false; if(!deads.includes(lgt.num))deads.push(lgt.num); }
      jgRecord._littlegirlSubstituteKill=null;
    }
    // 大野狼+小女孩板：大野狼的額外一刀。這一刀是跟主要狼刀「分開」的獨立目標，只受守衛
    // 保護影響（守衛當晚選的號碼剛好跟這一刀的目標一樣才會被擋下）——女巫這時候早就結束
    // 回合了（大野狼排在女巫之後才睜眼），時序上根本沒有機會對這個目標用解藥，不用特別排除。
    if(jgRecord.bigbadwolfBonusKillTarget){
      const bbt=jgFind(jgRecord.bigbadwolfBonusKillTarget);
      const guardedThis=!!(jgRecord.guardTarget&&jgRecord.guardTarget.toString()===jgRecord.bigbadwolfBonusKillTarget.toString());
      const mechGuardedThis=!!(jgRecord.mechWolfGuardTarget&&jgRecord.mechWolfGuardTarget.toString()===jgRecord.bigbadwolfBonusKillTarget.toString());
      if(bbt&&bbt.alive&&!guardedThis&&!mechGuardedThis&&!jgMechWolf2GuardProtects(jgRecord.bigbadwolfBonusKillTarget)){ bbt.alive=false; if(!deads.includes(bbt.num))deads.push(bbt.num); }
      jgRecord.bigbadwolfBonusKillTarget=null;
    }
    // 雙機械狼板：大／小機械狼各自輪到帶刀時選的目標（可能是「一般帶刀」或「雙刀其中一刀」，
    // 見 jgSaveMechWolf2）。這是跟主要狼刀「分開」的獨立目標，只受一般守衛/機械守衛保護
    // 影響——女巫這時候早就結束回合了（機械狼排在女巫之後才睜眼），時序上根本碰不到這個
    // 目標，不用特別排除。真的死掉的號碼另外記一份到 _mechwolf2KillVictims，因為稍後
    // 判斷「這一晚被狼隊刀到的人能不能開槍」時，這些欄位已經被這裡清空、讀不到了。
    jgRecord._mechwolf2KillVictims=[];
    ['bigmechwolf','smallmechwolf'].forEach(roleId=>{
      [1,2].forEach(idx=>{
        const key='mechwolf2Kill_'+roleId+'_'+idx;
        const target=jgRecord[key];
        if(target){
          const t=jgFind(target);
          const guardedThis=!!(jgRecord.guardTarget&&jgRecord.guardTarget.toString()===target.toString());
          const mechGuardedThis=!!(jgRecord.mechWolfGuardTarget&&jgRecord.mechWolfGuardTarget.toString()===target.toString());
          if(t&&t.alive&&!guardedThis&&!mechGuardedThis&&!jgMechWolf2GuardProtects(target)){
            t.alive=false;
            if(!deads.includes(t.num))deads.push(t.num);
            jgRecord._mechwolf2KillVictims.push(t.num);
          }
          jgRecord[key]=null;
        }
      });
    });
    jgRecord._mechwolf2InvincibleKnifeNight=false;
    // 假面舞會板：舞池陣營判定。3人若陣營相同，無事發生；若不同，人數較少的一方死亡——
    // 陣營若被假面「給予面具」改變過，以改變後的陣營為準。這個死亡是舞池機制本身的判定，
    // 不是狼刀，不受守衛／女巫影響（規則沒有特別說可以擋，先當作不可擋，若之後要改成
    // 可被守衛/女巫擋下再回來調整這裡）。
    if(jgRecord.dancerPool&&jgRecord.dancerPool.length===3){
      const poolInfo=jgRecord.dancerPool.map(n=>{
        const p=jgFind(n);
        if(!p) return null;
        // 假面在舞池裡的陣營一律算狼隊（跟他自己知不知道誰是隊友無關，陣營歸屬永遠是狼——
        // 見 jgIsWolfPackMember），除非被假面自己給予面具改變，才會在這次判定裡翻成好人。
        let camp=jgIsWolfPackMember(p)?'wolf':'good';
        if(jgRecord.maskGrantTarget&&n.toString()===jgRecord.maskGrantTarget.toString()) camp=(camp==='wolf'?'good':'wolf');
        return {num:n, camp};
      }).filter(Boolean);
      if(poolInfo.length===3){
        const wolfCnt=poolInfo.filter(c=>c.camp==='wolf').length;
        if(wolfCnt!==0&&wolfCnt!==3){
          const minorityCamp=wolfCnt===1?'wolf':'good';
          poolInfo.filter(c=>c.camp===minorityCamp).forEach(m=>{
            const p=jgFind(m.num);
            if(p&&p.alive){p.alive=false;if(!deads.includes(p.num))deads.push(p.num);}
          });
        }
      }
      jgRecord.dancerPool=null;
    }
    // Wolfbeauty dies from poison at night → charm kill at dawn
    if(jgRecord.witchPoison&&jgRecord.wolfbeautyCharm){
      const wbP2=jgPlayers.find(p=>p.role==='wolfbeauty');
      if(wbP2&&wbP2.num.toString()===jgRecord.witchPoison.toString()){
        const ct=jgFind(jgRecord.wolfbeautyCharm);
        if(ct&&ct.alive){ct.alive=false;if(!deads.includes(ct.num))deads.push(ct.num);}
      }
    }
    // 邱比特情侶殉情：上面這一整晚（狼刀／女巫毒／狼弟覺醒刀／機械狼／獵魔人夜擊／攝夢人…）
    // 任何一種死法，只要讓情侶其中一人死亡，另一人都要立刻跟著殉情死亡（不論死因為何）。
    // 殉情死亡不會觸發任何技能——就算殉情者原本是獵人／黑狼王等具開槍資格的身分，也不能
    // 開槍帶人，這裡只是單純把號碼加進死亡清單，不做任何連鎖開槍判斷。
    let heartbreakDawnNum=null;
    if(jgLovers&&jgLovers.length===2){
      const lv1=jgFind(jgLovers[0]), lv2=jgFind(jgLovers[1]);
      if(lv1&&lv2){
        if(!lv1.alive&&lv2.alive){ lv2.alive=false; if(!deads.includes(lv2.num)) deads.push(lv2.num); heartbreakDawnNum=lv2.num; }
        else if(!lv2.alive&&lv1.alive){ lv1.alive=false; if(!deads.includes(lv1.num)) deads.push(lv1.num); heartbreakDawnNum=lv1.num; }
      }
    }
    // 上面幾個天亮連動死亡（獵魔人夜擊、攝夢人連續兩晚夢同一人致死、攝夢人陣亡連動夢遊對象死亡、
    // 狼美人中毒殉情）都是直接設定 alive=false、把號碼塞進 deads，而不是走 jgApplyDeath；
    // 這些號碼在上面組 dawnMsg／trulyDiedNums 的時候都還沒發生，所以要在這裡補回死亡清單，
    // 天亮公告才會把這些號碼跟原本的死訊一起唸出來，而不是悄悄死掉、玩家看不到。
    let lateDeadAdded=false;
    deads.forEach(d=>{
      const numStr=d.toString();
      const alreadyCounted=trulyDiedNums.some(n=>n.toString()===numStr)||swappedNums.some(n=>n.toString()===numStr);
      if(!alreadyCounted){
        const p=jgFind(d);
        if(p&&!p.alive){ p._diedThisDawn=true; trulyDiedNums.push(p.num); lateDeadAdded=true; }
      }
    });
    if(lateDeadAdded){
      const deadNames3=trulyDiedNums.filter(n=>n!==selfDestructDawnNum).map(n=>{ const p=jgFind(n); return p?p.num+'號':n+'號'; });
      const swapNames3=swappedNums.map(n=>{ const p=jgFind(n); return p?p.num+'號':n+'號'; });
      dawnMsg=jgBuildDawnMsg(deadNames3,swapNames3);
      jgLastNightPeaceful=(deadNames3.length===0&&swapNames3.length===0);
      jgRenderRoster();
      const lateWin=jgCheckWin();
      if(lateWin){ jgShowWin(lateWin); return; }
    }

    // Check if wolf-killed hunter can activate skill at dawn
    // Wolf king dawn activation (same as hunter when wolf-killed)
    const dawnWolfKingShoot=(()=>{
      const wkp=jgPlayers.find(p=>p.role==='wolfking')
        || (jgMechWolfWolfkingActive()?jgPlayers.find(p=>p.role==='mechanicalwolf'):null);
      if(!wkp||!jgRecord.wolfKill) return false;
      if(wkp.num.toString()!==jgRecord.wolfKill.toString()) return false;
      if(jgHunterSkillSealed(wkp)) return false; // 夢魘恐懼／攝夢人致死＝技能封印，即使同時也被狼刀擊殺也不能開槍
      const gs=jgRecord.guardTarget&&(jgRecord.guardTarget.toString()===jgRecord.wolfKill.toString());
      const mgs=jgRecord.mechWolfGuardTarget&&(jgRecord.mechWolfGuardTarget.toString()===jgRecord.wolfKill.toString());
      const ws=jgRecord.witchSave;
      const byPoison=jgRecord.witchPoison&&(wkp.num.toString()===jgRecord.witchPoison.toString());
      if(byPoison) return false;
      // 若因奶穿而死（守護＋女巫解藥同時命中同一人），死因仍成立，黑狼王一樣可以帶人
      const overhealHit=(gs||mgs)&&ws;
      return overhealHit||(!gs&&!mgs&&!ws);
    })();

    // 這一晚是否有人因為被狼隊刀死觸發開槍——不只看主要狼刀，雙機械狼板的機械狼自己
    // 帶的刀殺到的人一樣算數（見 jgDawnShootTargetNum，跟 jgSaveDawnHunterShot 共用同一個
    // 判斷，避免兩邊認定的開槍者兜不起來）。
    const _dawnShootTargetNum=jgDawnShootTargetNum();
    const dawnHunterShoot=!!(_dawnShootTargetNum&&(()=>{
      const victim=jgFind(_dawnShootTargetNum);
      return victim&&victim.role!=='wolfking'&&jgIsHunterCapable(victim)&&!jgHunterSkillSealed(victim);
    })());
    const dawnShoot=dawnHunterShoot||dawnWolfKingShoot;
    const dawnShootP=dawnShoot?jgFind(dawnHunterShoot?_dawnShootTargetNum:jgRecord.wolfKill):null;
    const dawnShootName=dawnShootP&&dawnShootP.name&&dawnShootP.name!==dawnShootP.num+'號'?dawnShootP.num+'號 '+dawnShootP.name:(dawnShootP?dawnShootP.num+'號':'');
    // 被狼刀殺死、夜間開槍的這位若本身既是真獵人、又是黑市商人交易出來、拿到「獵人獵槍」的
    // 幸運兒，等於身上有兩把槍，兩個技能各自獨立開一槍
    const dawnDoubleGun=!!(dawnShoot&&dawnShootP&&dawnShootP.role==='hunter'
      &&jgLuckyOne&&jgLuckyOne.gift==='hunter'&&!jgLuckyOne.used&&jgNight>=jgLuckyOne.startNight&&jgLuckyOne.num===dawnShootP.num);
    const hunterShotHtml=dawnShoot
      ?'<div class="divider"></div>'
        +'<div class="speech">「<em>'+dawnShootName+' 啟動角色技能，請選擇你要帶走的號碼。</em>」</div>'
        +(dawnDoubleGun?'<div class="info" style="font-size:12px;">'+dawnShootName+' 同時是獵人本身、也是黑市商人交易產生的幸運兒（拿到獵人獵槍），兩個技能各自獨立開一槍，可以分別選擇兩個要帶走的對象（都可留空）。</div>':'')
        +'<label>'+(dawnDoubleGun?'第一槍（獵人本身）・':'')+'帶走的玩家號碼（留空=不帶）</label>'
        +jgNumSelectHtml('jg-hunter-dawn-shot', '')
        +(dawnDoubleGun?'<label style="margin-top:8px;">第二槍（幸運兒・獵人獵槍）・帶走的玩家號碼（留空=不帶）</label>'+jgNumSelectHtml('jg-hunter-dawn-shot2', ''):'')
        +'<button class="danger" onclick="jgSaveDawnHunterShot()" style="margin-top:8px;">確認帶走 →</button>'
      :'';

    // 只有第一夜「真正淘汰」的人白天才有遺言；第二夜起夜間淘汰不再有遺言（只有被投票出去的人才有遺言）。
    // 但自爆是主動技能、不是夜間淘汰，不管第幾夜發生都要有遺言，所以額外放行。
    // 雙身分模式的「換牌」（卡1陣亡、卡2還在）則不受此限制——不管第幾夜，只要當晚有人換牌，
    // 白天都要先讓他發表（卡1的）遺言，之後才換上卡2、依序順/逆進行正常發言。
    const showTrueLastWords=(jgNight===1||!!jgRecord._selfDestructNum)&&trulyDiedNums.length>0&&!dawnHunterShoot;
    const showSwapLastWords=swappedNums.length>0&&!dawnHunterShoot;
    const showLastWords=showTrueLastWords||showSwapLastWords;
    let lwHtml='';
    if(showLastWords){
      // 遺言發言順序：真的淘汰（扣掉殉情者，殉情不留遺言）先講，換牌的人接著講；
      // 這批人一樣要有計時器，跟白天發言／警上發言／PK 發言用同一套元件。
      const lwOrder=[
        ...trulyDiedNums.filter(d=>heartbreakDawnNum===null||d.toString()!==heartbreakDawnNum.toString()),
        ...swappedNums
      ].map(Number);
      lwHtml='<div class="divider"></div>'
        +'<div style="font-size:13px;color:var(--text2);margin-bottom:8px;">發表遺言（依序進行）</div>'
        +jgSpeakTimerWidgetHtml(lwOrder, true);
      // 情侶殉情者不算「真正淘汰」發表遺言的對象——殉情不觸發任何技能，也不留遺言
      trulyDiedNums.filter(d=>heartbreakDawnNum===null||d.toString()!==heartbreakDawnNum.toString()).forEach(d=>{
        const p=jgFind(d);
        if(p) lwHtml+='<div class="info" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;padding:10px 14px;">'
          +'<span style="font-size:18px;">💬</span>'
          +'<span style="flex:1;">'+(p.name&&p.name!==p.num+'號'?p.num+'號 '+p.name:p.num+'號')+'</span>'
          +'</div>';
      });
      if(heartbreakDawnNum!==null&&trulyDiedNums.some(d=>d.toString()===heartbreakDawnNum.toString())){
        const hbP=jgFind(heartbreakDawnNum);
        if(hbP) lwHtml+='<div class="info" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;padding:10px 14px;opacity:.7;">'
          +'<span style="font-size:18px;">💘</span>'
          +'<span style="flex:1;">'+(hbP.name&&hbP.name!==hbP.num+'號'?hbP.num+'號 '+hbP.name:hbP.num+'號')+'（情侶殉情，不發表遺言）</span>'
          +'</div>';
      }
      swappedNums.forEach(d=>{
        const p=jgFind(d);
        if(p) lwHtml+='<div class="info" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;padding:10px 14px;">'
          +'<span style="font-size:18px;">💬</span>'
          +'<span style="flex:1;">'+(p.name&&p.name!==p.num+'號'?p.num+'號 '+p.name:p.num+'號')+'<span style="display:block;font-size:11px;color:var(--text2);margin-top:2px;">第一身分陣亡，發表遺言後換上第二張牌，繼續正常發言</span></span>'
          +'</div>';
      });
    }
    jgDawnDeaths[jgNight]={died:[...trulyDiedNums], swapped:[...swappedNums], notes:{}};
    // 若是走過警長競選流程才走到這裡（候選人真的有上警競選，而且競選已經「真正結束」——
    // 雙爆吞警徽規則下，第一爆只是保留警徽、延到隔天，還沒真正結束，不能算），改成先公布警長
    // 結果，再公布平安夜／死亡消息、遺言，最後（若當選了）讓警長當場決定警左警右，全部整合在
    // 同一個畫面，不用另外切換頁面。雙爆模式隔天續選（不論是第二次自爆流失警徽、投票選出
    // 警長、還是流局無警長）也會繞回這裡的死亡結算，一樣要等到 jgNight===2 這次才算數。
    const sheriffJustResolved=jgSheriffEnabled&&jgSheriffCampaignHappened&&jgSheriffElectionDone&&
      (jgNight===1||(jgBadgeMode==='double'&&jgSheriffPostponedToDay2&&jgNight===2));
    let sheriffBannerHtml='';
    if(sheriffJustResolved){
      if(jgSheriffSelfDestruct){
        sheriffBannerHtml='<div class="info-warn" style="font-size:16px;font-weight:700;padding:12px 14px;">💥 有候選人自爆吞警徽，本局沒有警長。</div>';
      } else if(jgSheriff){
        const sp=jgFind(jgSheriff);
        const spName=sp&&sp.name&&sp.name!==sp.num+'號'?sp.num+'號 '+sp.name:jgSheriff+'號';
        sheriffBannerHtml='<div class="speech" style="font-size:16px;">「<em>'+spName+' 當選警長！</em>」</div>';
      } else {
        sheriffBannerHtml='<div class="info-warn" style="font-size:15px;padding:12px 14px;">本局沒有警長。</div>';
      }
    }
    // 當選警長且還活著：由警長當場決定警左或警右開始發言，法官手動記錄本輪起始號碼與方向
    // （用專屬的輕量更新函式，不能直接重新整個 render 'dawn' 一次，否則死亡結算會被重跑一次）
    const sheriffP2=jgSheriff?jgFind(jgSheriff):null;
    const sheriffAlive2=sheriffJustResolved&&!!(sheriffP2&&sheriffP2.alive);
    let sheriffDirHtml='';
    if(sheriffAlive2){
      sheriffDirHtml='<div class="divider"></div>'
        +'<div class="speech" style="font-size:16px;">「<em>警長決定警左警右。</em>」</div>'
        +'<div class="info" style="font-size:13px;">法官手動選取本輪起始號碼與方向。</div>'
        +'<div id="jg-dawn-sheriff-dir-picker">'+jgDawnSheriffDirPickerHtml()+'</div>';
    }
    // 血月使者殘局提示（僅供參考，不會自動判定輸贏）：如果場上只剩「1血月＋1神＋1民」，
    // 且這位神職已經沒有任何主動能力可以反殺血月（獵魔人夜擊、女巫毒藥、騎士決鬥），那麼
    // 不管白天投不投得到血月，血月最後都穩贏（票走了還有屠邊最後一擊，沒票走就繼續刀）。
    // 但如果這位神職還有主動技能沒用，好人陣營仍有翻盤機會，不能直接判定，要正常走完流程。
    let bloodmoonEndgameHtml='';
    {
      const _beAlive=jgAlive();
      const _beWolves=_beAlive.filter(p=>jgIsWolfForWin(p));
      const _beGood=_beAlive.filter(p=>!jgIsWolfForWin(p));
      const _beAllGods=ACTIVE_SKILL_GODS;
      const _beGods=_beGood.filter(p=>_beAllGods.includes(p.role));
      const _beVils=_beGood.filter(p=>p.role==='villager'||p.role==='hybrid'||p.role==='cupid');
      if(_beWolves.length===1&&_beWolves[0].role==='bloodmoon'&&_beGods.length===1&&_beVils.length===1){
        const godRole=_beGods[0].role;
        // 這個殘局的白天投票只有三種結果，而且每一種都在「投票當下」或「當晚被血月封印」就
        // 已經決定勝負：推錯（推民）→ 屠民，投票當下直接狼贏；推對（推血月）→ 血月暫存活的
        // 被動技能本身就會封印當晚所有神職技能，獵魔人／女巫照樣動不了；推更錯（推神）→
        // 屠神，投票當下直接狼贏。三種結果裡沒有一種能讓獵魔人／女巫在「正常、沒被封印」的
        // 夜晚出手，所以他們在這個殘局其實跟預言家、守衛一樣是純被動、幫不上忙。
        // 只有騎士能在白天發言階段直接翻牌決鬥（不用等投票、也不會被封印），是唯一真正
        // 還有機會翻盤的神職。
        const stillThreat=godRole==='knight';
        bloodmoonEndgameHtml=stillThreat
          ?'<div class="info-warn" style="font-size:13px;padding:10px 14px;margin-top:8px;">⚠️ 場上剩血月＋1神（'+jgFullRoleName(godRole)+'）＋1民，但這位神職還有主動技能沒用，好人仍有機會反殺血月，請照正常流程繼續走。</div>'
          :'<div class="info-success" style="font-size:13px;padding:10px 14px;margin-top:8px;">✅ 場上剩血月＋1神（'+jgFullRoleName(godRole)+'，已無主動技能可以反殺血月）＋1民：不管白天投不投得到血月，血月最後都穩贏（票走了還有屠邊最後一擊，沒票走就繼續刀）。</div>'
            +'<button class="danger" style="margin-top:6px;" onclick="jgDeclareBloodmoonWin()">🌑 直接公布狼人獲勝，不用等流程走完 →</button>';
      }
    }
    jgShowPg(`
      <h2>天亮了！</h2>
      ${sheriffJustResolved?sheriffBannerHtml:'<div class="speech" style="font-size:16px;">「<em>天亮請睜眼。</em>」</div>'}
      ${sdMsg?'<div class="speech" style="font-size:16px;">「<em>'+sdMsg+'</em>」</div>':''}
      <div class="speech" style="font-size:16px;">「<em>${dawnMsg}</em>」</div>
      ${bloodmoonEndgameHtml}
      ${hunterShotHtml}
      ${lwHtml}
      ${sheriffDirHtml}
      ${dawnShoot?'':'<span id="jg-dawn-discuss-placeholder"></span>'}
    `,'☀️ 天亮');
    if(!dawnHunterShoot){
      const ph=document.getElementById('jg-dawn-discuss-placeholder');
      if(ph){
        const afterDawn=jgAfterDawn();
        const btn=document.createElement('button');
        btn.className='primary';
        btn.style.marginTop='12px';
        btn.style.width='100%';
        btn.textContent=(showLastWords?'遺言發表完，':'')+(afterDawn==='next-night'?'天黑 →':'開始發言 →');
        btn.onclick=()=>jgGoStep(afterDawn);
        ph.replaceWith(btn);
      }
    }
  }
  else if(step==='sheriff-dawn-placeholder'){
    jgShowPg(`
      <h2>天亮了！</h2>
      <div class="speech" style="font-size:16px;">「<em>天亮請睜眼。</em>」</div>
      <button class="primary" style="margin-top:14px;" onclick="jgGoStep('sheriff-speech-order')">開始警長競選 →</button>
    `,'☀️ 天亮');
  }
  else if(step==='sheriff-speech-order'){
    jgRenderSheriffSpeechOrder();
  }
  else if(step==='sheriff-speech'){
    jgRenderSheriffSpeech();
  }
  else if(step==='sheriff-day2-resume'){
    jgRenderSheriffDay2Resume();
  }
  else if(step==='sheriff-vote'){
    jgRenderSheriffVote();
  }
  else if(step==='sheriff-transfer'){
    jgRenderSheriffTransfer();
  }
  else if(step==='discuss'){
    const sheriffP=jgSheriff?jgFind(jgSheriff):null;
    const sheriffAlive=!!(sheriffP&&sheriffP.alive);
    if(sheriffAlive){
      const dm=jgDayMeta[jgNight]||{};
      if(dm.start&&dm.dir){
        // 方向已經決定過了（第一天警長公布結果時就定過，或剛剛點過警左／警右）：
        // 不管第幾天，都要直接顯示「計時器＋開始發言」畫面，不能再跳回去選方向一次。
        // （這裡以前只有 jgNight===1 才會走到這個分支，導致第二天以後警長選完警左/警右
        // 沒有計時器可用——這是這次要修的重點 bug。）
        const dirLabel2=dm.dir==='逆'?'逆時針':'順時針';
        jgShowPg(`
          <h2>發言討論</h2>
          ${jgSpeakTimerWidgetHtml(jgDaySpeechOrderList(jgNight))}
          ${jgNight===1?jgFirstDayCompCheckHtml():''}
          <div class="speech">「<em>從 ${dm.start} 號開始，${dirLabel2}依序發言。</em>」</div>
          ${jgDiscussExtraButtonsHtml()}
          ${jgHanTiaoInputHtml('jg-hantiao-discuss-input', jgHanTiaoDiscussNotes[jgNight], 'jgUpdateHanTiaoDiscuss')}
          <button class="primary" onclick="jgDiscussGoVote()" style="margin-top:8px;">發言結束，進入投票 →</button>
        `,'💬 發言');
        return;
      }
      // 有警長在場、方向還沒決定：每次發言前都由警長宣布警左／警右，法官只需點選警長左右兩邊的號碼，
      // 方向自動判定（不使用隨機轉盤——轉盤只在沒有警長、平安夜或需要方向時才使用）。
      const curStart=dm.start||null;
      jgShowPg(`
        <h2>發言討論</h2>
        ${jgNight===1?jgFirstDayCompCheckHtml():''}
        <div class="speech" style="font-size:16px;">「<em>警長決定警左警右。</em>」</div>
        <div class="info" style="font-size:13px;">🎖️ ${jgSheriff}號 警長在場，法官點選警長宣布的左／右邊號碼即可。</div>
        <label>警長選警左還是警右？（點選對應號碼，方向自動判定）</label>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:4px;">${jgSheriffLRButtonsHtml(curStart,'jgSetDiscussStart')}</div>
        ${jgDiscussExtraButtonsHtml()}
        ${jgHanTiaoInputHtml('jg-hantiao-discuss-input', jgHanTiaoDiscussNotes[jgNight], 'jgUpdateHanTiaoDiscuss')}
        <button class="primary" onclick="jgDiscussGoVote()" style="margin-top:8px;">發言結束，進入投票 →</button>
      `,'💬 發言');
      return;
    }
    // 今天的發言起點／方向如果已經決定過了（例如騎士決鬥猜錯、以死謝罪後回到討論階段），
    // 直接沿用同一個結果繼續發言，不用再轉一次轉盤——轉盤只在「今天」還沒決定過時才需要。
    const dmToday=jgDayMeta[jgNight];
    if(dmToday&&dmToday.start&&dmToday.dir){
      const dirLabel3=dmToday.dir==='逆'?'逆時針':'順時針';
      jgShowPg(`
        <h2>發言討論</h2>
        ${jgSpeakTimerWidgetHtml(jgDaySpeechOrderList(jgNight))}
        ${jgNight===1?jgFirstDayCompCheckHtml():''}
        <div class="speech">「<em>從 ${dmToday.start} 號開始，${dirLabel3}依序發言。</em>」</div>
        ${jgDiscussExtraButtonsHtml()}
        ${jgHanTiaoInputHtml('jg-hantiao-discuss-input', jgHanTiaoDiscussNotes[jgNight], 'jgUpdateHanTiaoDiscuss')}
        <button class="primary" onclick="jgDiscussGoVote()" style="margin-top:8px;">發言結束，進入投票 →</button>
      `,'💬 發言');
      return;
    }
    const needDirection=!jgLastNightPeaceful&&!jgSpeakDirection;
    const speakStart=(jgLastNightPeaceful||needDirection)?null:jgComputeSpeakStart();
    const speakStartLabel=speakStart?(jgSpeakDirection==='逆'?'從 '+speakStart+' 號開始，逆時針依序發言':'從 '+speakStart+' 號開始，順時針依序發言'):null;
    if(speakStart){
      jgDayMeta[jgNight]={start:speakStart, dir:jgSpeakDirection};
      // 這是這一天第一次真正確立發言順序的時刻（方向早已確定，只是今天要重新算起點）——
      // 強制清空計時器舊記錄，理由跟 jgSetDiscussStart／jgSpinWheel 一樣，避免計時器沿用
      // 前一晚殘留的狀態，導致畫面顯示的第一位跟這裡算出來的起點對不上。
      jgSpeakTimerOrderKey='';
    }
    jgShowPg(`
      <h2>發言討論</h2>
      ${speakStart?jgSpeakTimerWidgetHtml(jgDaySpeechOrderList(jgNight)):''}
      ${jgNight===1?jgFirstDayCompCheckHtml():''}
      <div class="speech">「<em>${jgLastNightPeaceful?'今晚是平安夜，抽籤決定發言順序。':(needDirection?'請轉動轉盤決定發言方向，從死亡玩家的下一位開始發言。':(speakStartLabel||'請抽取發言順序，依序發言。'))}</em>」</div>
      ${jgLastNightPeaceful?'<div class="info" id="jg-wheel-wrap"><button onclick="jgSpinWheel()">🎡 轉動轉盤</button><div id="jg-wheel-result"></div></div>':''}
      ${needDirection?'<div class="info" id="jg-wheel-wrap"><button onclick="jgSpinDirectionOnly()">🎡 轉動轉盤（決定順/逆）</button><div id="jg-wheel-result"></div></div>':''}
      ${jgDiscussExtraButtonsHtml()}
      ${jgHanTiaoInputHtml('jg-hantiao-discuss-input', jgHanTiaoDiscussNotes[jgNight], 'jgUpdateHanTiaoDiscuss')}
      <button class="primary" onclick="jgDiscussGoVote()" style="margin-top:8px;">發言結束，進入投票 →</button>
    `,'💬 發言');
  }
  else if(step==='vote'){
    jgVoteTally={};
    jgAbstainVoters={};
    const pk=jgVotePkRound;
    const pkCandLabel=pk?jgVotePkCandidates.slice().sort((a,b)=>a-b).join('、'):'';
    const pkOrderLabel=pk?(jgVotePkOrder&&jgVotePkOrder.length?jgVotePkOrder.join('→'):pkCandLabel):'';
    jgShowPg(`
      <h2>${pk?'投票放逐・PK':'投票放逐'}</h2>
      ${pk?jgSpeakTimerWidgetHtml(jgVotePkOrder, true):''}
      <div class="speech">「<em>${pk?'平票玩家請依序發言 PK：'+pkOrderLabel+'。PK 結束後，其餘玩家重新投票。':'準備投票選出要放逐的玩家，3、2、1'}</em>」</div>
      ${pk?'<div class="info-warn" style="font-size:12px;">PK 發言順序：'+pkOrderLabel+'（前一輪越晚發言者，PK 越早發言）。只有 '+pkCandLabel+' 號以外的玩家可以投票，票投給 '+pkCandLabel+' 號其中一人</div>'
        :''}
      ${jgSheriff&&jgFind(jgSheriff)&&jgFind(jgSheriff).alive?'<div style="font-size:12px;color:var(--text2);margin-top:4px;">🎖️ '+jgSheriff+'號 警長投票算 1.5 票</div>':''}
      <!-- 快速輸入投票已停用，改用下方「N號投給」逐一點選 -->
      <div id="jg-vote-tally"></div>
      <div id="jg-vote-tally-summary" style="margin-top:6px;"></div>
      <button class="danger" onclick="jgSaveVote()" style="margin-top:10px;">確認投票結果 →</button>
    `,'🗳 投票');
    jgRenderVoteTally();
  }
  else if(step==='wolfking-shot'){
    const wkp=jgPlayers.find(p=>p.role==='wolfking')
      || (jgMechWolfWolfkingActive()?jgPlayers.find(p=>p.role==='mechanicalwolf'):null);
    const wkname=wkp&&wkp.name!==wkp.num+'號'?wkp.num+'號 '+wkp.name:wkp?wkp.num+'號':'黑狼王';
    jgShowPg(`
      <h2>黑狼王開槍</h2>
      <div class="info-danger" style="font-size:15px;font-weight:700;padding:12px 14px;">${wkname} 被放逐，啟動角色技能</div>
      <div class="speech">「<em>${wkname} 啟動角色技能，請選擇你要帶走的號碼。</em>」</div>
      <label>帶走的玩家號碼（留空=不帶）</label>
      ${jgNumSelectHtml('jg-wolfking-shot-rec', '')}
      <button class="danger" onclick="jgSaveWolfKingShot()" style="margin-top:10px;">確認 →</button>
    `,'👑 黑狼王');
  }
  else if(step==='whitewolf-selfblow'){
    const wwp=jgPlayers.find(p=>p.role==='whitewolf');
    const wwname=wwp&&wwp.name!==wwp.num+'號'?wwp.num+'號 '+wwp.name:wwp?wwp.num+'號':'白狼王';
    jgShowPg(`
      <h2>白狼王自爆</h2>
      <div class="info-danger" style="font-size:15px;font-weight:700;padding:12px 14px;">${wwname} 宣告自爆！</div>
      <div class="speech">「<em>白狼王自爆，請選擇你要帶走的號碼。</em>」</div>
      <label>帶走的玩家號碼（留空=不帶）</label>
      ${jgNumSelectHtml('jg-whitewolf-blow-rec', '')}
      <button class="danger" onclick="jgSaveWhiteWolfBlow()" style="margin-top:10px;">確認自爆 →</button>
    `,'🤍 白狼王');
  }
  else if(step==='wolf-selfblow'){
    // 自刀自爆規則：狼人／黑狼王／血月使者／狼弟／狼巫可以自爆；惡靈騎士、石像鬼、狼美人、機械狼、夢魘、狼兄、假面都不能自爆
    const eligible=jgPlayers.filter(p=>p.alive&&(p.role==='wolf'||p.role==='wolfking'||p.role==='bloodmoon'||p.role==='wolfbrother_y'||p.role==='wolfshaman'||p.role==='bigbadwolf')).map(p=>p.num);
    const exclude=jgPlayers.filter(p=>!eligible.includes(p.num)).map(p=>p.num);
    const bmEligible=jgPlayers.find(p=>p.role==='bloodmoon'&&p.alive);
    jgShowPg(`
      <h2>狼人自爆</h2>
      <div class="speech">「<em>請選擇宣告自爆的玩家號碼。</em>」</div>
      <label>自爆的玩家號碼</label>
      <div class="info" style="font-size:12px;margin-bottom:6px;">
        <div>✅ 可以自爆：狼人／黑狼王／血月使者／狼弟／狼巫</div>
        <div style="margin-top:2px;">🚫 不能自爆：惡靈騎士、石像鬼、狼美人、機械狼、夢魘、狼兄、假面</div>
      </div>
      ${jgNumSelectHtml('jg-wolf-blow-rec', '', null, null, exclude, '這個角色不能自爆，不可選取', jgSelfBlowExcludeReason)}
      ${bmEligible?'<div class="info" style="font-size:12px;margin-top:4px;">⚠️ 選到'+bmEligible.num+'號血月使者會走血月專屬流程：封印當晚神職技能，只能在血月使者「自己發言的階段」宣告，不能搶在別人發言時自爆。</div>':''}
      <button class="danger" onclick="jgSaveWolfSelfBlow()" style="margin-top:10px;">確認自爆 →</button>
    `,'🐺 狼人自爆');
  }
  else if(step==='sheriff-selfdestruct-pick'){
    const isFirstBlow=jgBadgeMode==='double'&&!jgSheriffFirstBlowDone;
    // 自刀自爆規則：狼弟、狼巫可以自爆（含警上吞警徽），狼兄不行；其餘限制不變。
    // 不要求一定是本輪候選人（任何符合資格的狼都可以隨時自爆，不用等自己上警才行），
    // 也不排除「昨晚已經被下毒、天亮才會公布死亡」的號碼——公布之前這個人正常參與白天流程，
    // 本來就可以正常自爆，一樣算數。
    const eligible=jgPlayers.filter(p=>p.alive&&(p.role==='wolf'||p.role==='wolfking'||p.role==='whitewolf'||p.role==='bloodmoon'||p.role==='wolfbrother_y'||p.role==='wolfshaman'||p.role==='bigbadwolf')).map(p=>p.num);
    const exclude=jgPlayers.filter(p=>!eligible.includes(p.num)).map(p=>p.num);
    const sheriffBlowReason=(num)=>jgSelfBlowExcludeReason(num);
    jgShowPg(`
      <h2>狼人自爆（吞警徽）</h2>
      <div class="info" style="font-size:12px;">請選擇宣告自爆的玩家號碼</div>
      <label>自爆的玩家號碼（惡靈騎士、石像鬼、狼美人、機械狼、夢魘、狼兄、假面都不能自爆）</label>
      ${jgNumSelectHtml('jg-sheriff-blow-rec', '', null, null, exclude, '這個角色不能自爆，不可選取', sheriffBlowReason)}
      <div class="info" style="font-size:12px;margin-top:6px;">${isFirstBlow?'雙爆吞警徽規則：這是第一次自爆，警徽暫不流失，競選會延到隔天繼續。':'本局將不再有警長，該玩家會被淘汰。'}</div>
      <button class="danger" onclick="jgSaveSheriffSelfDestruct()" style="margin-top:10px;">確認自爆 →</button>
    `,'💥 自爆吞警徽');
  }
  // 白狼王在「警上吞警徽」情境下自爆：跟一般白天自爆一樣可以帶人，先選帶走的對象，
  // 選完才真正套用死亡、繼續走吞警徽的既有流程（單爆／雙爆規則不變）。
  else if(step==='sheriff-selfdestruct-whitewolf-bring'){
    const num=jgRecord._sheriffSelfDestructWhiteWolfNum;
    const wwp=jgFind(num);
    const wwname=wwp&&wwp.name!==wwp.num+'號'?wwp.num+'號 '+wwp.name:(wwp?wwp.num+'號':'白狼王');
    jgShowPg(`
      <h2>白狼王自爆（吞警徽）</h2>
      <div class="info-danger" style="font-size:15px;font-weight:700;padding:12px 14px;">${wwname} 宣告自爆！</div>
      <div class="speech">「<em>白狼王自爆，請選擇你要帶走的號碼。</em>」</div>
      <label>帶走的玩家號碼（留空=不帶）</label>
      ${jgNumSelectHtml('jg-sheriff-whitewolf-blow-rec', '')}
      <button class="danger" onclick="jgSaveSheriffSelfDestructWhiteWolfBring()" style="margin-top:10px;">確認自爆 →</button>
    `,'🤍 白狼王');
  }
  else if(step==='knight-duel'){
    const knP=jgPlayers.find(p=>p.role==='knight');
    const exclude=knP?[knP.num]:[];
    const knname=knP&&knP.name!==knP.num+'號'?knP.num+'號 '+knP.name:knP?knP.num+'號':'騎士';
    jgShowPg(`
      <h2>騎士決鬥</h2>
      <div class="info-danger" style="font-size:15px;font-weight:700;padding:12px 14px;">${knname} 翻牌宣告決鬥！</div>
      <div class="speech">「<em>騎士請選擇要決鬥的對象號碼。</em>」</div>
      <label>決鬥對象號碼</label>
      ${jgNumSelectHtml('jg-knight-duel-rec', '', null, null, exclude)}
      <div class="info" style="font-size:12px;margin-top:6px;">對方是狼→對方淘汰，直接進入黑夜；對方是好人→騎士淘汰（以死謝罪），繼續發言與投票。<br>若決鬥對象是黑狼王／狼美人／白狼王，因決鬥出局不會發動其技能（不能開槍帶人、不會有人殉情）。</div>
      <button class="danger" onclick="jgSaveKnightDuel()" style="margin-top:10px;">確認決鬥 →</button>
    `,'⚔️ 騎士');
  }
  else if(step==='wolfbeauty-charm-kill'){
    const wbp=jgPlayers.find(p=>p.role==='wolfbeauty');
    const victim=jgRecord._wolfbeautyKillCharm?jgFind(jgRecord._wolfbeautyKillCharm):null;
    const wbname=wbp&&wbp.name!==wbp.num+'號'?wbp.num+'號 '+wbp.name:wbp?wbp.num+'號':'狼美人';
    const vname=victim?(victim.name!==victim.num+'號'?victim.num+'號 '+victim.name:victim.num+'號'):'無';
    jgShowPg(`
      <h2>狼美人連帶死亡</h2>
      <div class="speech" style="font-size:16px;font-weight:800;">「<em>${wbname}、${vname} 淘汰。</em>」</div>
      <div class="info" style="font-size:12px;margin-top:6px;">注意：若因騎士決鬥出局，技能不應發動</div>
      <button class="danger" onclick="jgSaveWolfBeautyCharmKill()" style="margin-top:10px;">確認 →</button>
    `,'💋 狼美人');
  }
  else if(step==='bloodmoon-last-night'){
    const bmp=jgPlayers.find(p=>p.role==='bloodmoon');
    const bmname=bmp&&bmp.name!==bmp.num+'號'?bmp.num+'號 '+bmp.name:bmp?bmp.num+'號':'血月使者';
    // 若剩下的好人正好「一神一民」，血月今晚不管刀誰，都會湊成屠神或屠民，狼人穩贏——
    // 這一步只是在記錄他刀了誰、走完流程，勝負其實已經注定，先跟法官說清楚以免誤會成
    // 「還要看刀到誰才知道輸贏」。
    const _blmA=jgAlive();
    const _blmAg=_blmA.filter(p=>!jgIsWolfForWin(p));
    const _blmAllGods=ACTIVE_SKILL_GODS;
    const _blmGodCnt=_blmAg.filter(p=>_blmAllGods.includes(p.role)).length;
    const _blmVilCnt=_blmAg.filter(p=>p.role==='villager'||p.role==='hybrid'||p.role==='cupid').length;
    const _blmGuaranteed=_blmGodCnt===1&&_blmVilCnt===1;
    jgShowPg(`
      <h2>血月使者・最後一擊</h2>
      <div class="info-danger" style="font-size:15px;font-weight:700;padding:12px 14px;">${bmname} 為最後一個被放逐的狼人，暫時存活！</div>
      <div class="speech">「<em>血月使者暫時存活，今晚進入黑夜，可以再擊殺一名玩家。若達成屠邊條件，狼人勝利。</em>」</div>
      ${_blmGuaranteed?'<div class="info-success" style="font-size:13px;padding:10px 14px;">✅ 場上只剩一神一民，不管血月今晚刀誰，都會屠神或屠民，狼人這場已經穩贏——這一步只是記錄他刀了誰。</div>':''}
      <label>血月今晚擊殺的目標</label>
      ${jgNumSelectHtml('jg-bloodmoon-last-kill', '')}
      <button class="danger" onclick="jgSaveBloodMoonLastNight()" style="margin-top:10px;">確認擊殺 →</button>
    `,'🌑 血月使者');
  }
  else if(step==='bloodmoon-selfblow'){
    const bmp=jgPlayers.find(p=>p.role==='bloodmoon');
    const bmname=bmp&&bmp.name!==bmp.num+'號'?bmp.num+'號 '+bmp.name:bmp?bmp.num+'號':'血月使者';
    jgShowPg(`
      <h2>血月使者自爆</h2>
      <div class="speech" style="font-size:16px;font-weight:800;">「<em>${bmname} 淘汰，天黑請閉眼。</em>」</div>
      <div class="info-warn" style="font-size:13px;margin-top:8px;">本夜神職技能全部封印（法官不叫神職睜眼）</div>
      <button class="danger" onclick="jgSaveBloodMoonBlow()" style="margin-top:10px;">確認，天黑 →</button>
    `,'🌑 血月使者');
  }
  else if(step==='hunter-shot'){
    const hvp=jgRecord._voteOutNum?jgByNum(jgRecord._voteOutNum):jgPlayers.find(p=>p.role==='hunter');
    const hvname=hvp?hvp.num+'號':'獵人';
    const doubleGun=!!jgRecord._hunterDoubleGun;
    jgShowPg(`
      <h2>獵人開槍</h2>
      ${doubleGun?`
      <div class="info" style="font-size:12px;">${hvname} 同時是獵人本身、也是黑市商人交易產生的幸運兒（拿到獵人獵槍），兩個技能各自獨立開一槍，可以分別選擇兩個要帶走的對象（都可留空）。</div>
      <div class="speech">「<em>${hvname} 啟動角色技能，請選擇你要帶走的號碼。</em>」</div>
      <label>第一槍（獵人本身）・帶走的玩家號碼（留空=不帶）</label>
      ${jgNumSelectHtml('jg-hunter-shot-rec', '')}
      <label style="margin-top:10px;">第二槍（幸運兒・獵人獵槍）・帶走的玩家號碼（留空=不帶）</label>
      ${jgNumSelectHtml('jg-hunter-shot-rec2', '')}
      `:`
      <div class="speech">「<em>${hvname} 啟動角色技能，請選擇你要帶走的號碼。</em>」</div>
      <label>帶走的玩家號碼（留空=不帶）</label>
      ${jgNumSelectHtml('jg-hunter-shot-rec', '')}
      `}
      <button class="danger" onclick="jgSaveHunter()" style="margin-top:10px;">確認 →</button>
    `,'🔫 獵人');
  }
  else if(step==='luckyone-hunter-shot'){
    const lp=jgLuckyOne?jgByNum(jgLuckyOne.num):null;
    const lname=lp&&lp.name!==lp.num+'號'?lp.num+'號 '+lp.name:lp?lp.num+'號':'幸運兒';
    jgShowPg(`
      <h2>幸運兒開槍</h2>
      <div class="info-danger" style="font-size:15px;font-weight:700;padding:12px 14px;">${lname}（獲得獵人獵槍技能）被放逐，啟動技能</div>
      <div class="speech">「<em>${lname} 啟動角色技能，請選擇你要帶走的號碼（留空可不帶）。</em>」</div>
      <label>帶走的玩家號碼（留空=不帶）</label>
      ${jgNumSelectHtml('jg-luckyone-shot-rec', '')}
      <button class="danger" onclick="jgSaveLuckyoneHunterShot()" style="margin-top:10px;">確認 →</button>
    `,'🍀 幸運兒');
  }
  else if(step==='vote-last-words'){
    const p=jgRecord._voteOutNum?jgByNum(jgRecord._voteOutNum):null;
    const name=p?(p.name&&p.name!==p.num+'號'?p.num+'號 '+p.name:p.num+'號'):'被放逐玩家';
    const foolChecked=!!(p&&p.foolRevealed);
    jgShowPg(`
      <h2>遺言</h2>
      ${jgRecord._voteOutNum?jgSpeakTimerWidgetHtml([parseInt(jgRecord._voteOutNum)], true):''}
      <div class="info" style="display:flex;align-items:center;gap:10px;margin:10px 0;padding:10px 14px;">
        <span style="font-size:18px;">💬</span><span>${name} 發表遺言</span>
      </div>
      ${p&&p.role==='fool'?`<label style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg2);border-radius:var(--r-sm);margin-bottom:10px;cursor:pointer;">
        <input type="checkbox" ${foolChecked?'checked':''} onchange="jgToggleFoolReveal(this.checked)" style="width:18px;height:18px;">
        <span>已翻牌是傻瓜，可留在場上發言（依桌上實際情況勾選；不勾＝正常死亡）</span>
      </label>
      ${foolChecked?`<div class="info-success" style="font-size:12px;margin:-4px 0 10px;">${jgFoolChaseMode==='chase'?'已翻牌，本次放逐免死，之後只能發言、不能再投票——狼隊必須另外在夜晚淘汰他，屠神才算數。':'已翻牌，可留在場上發言、不能再投票——但這局判定上仍視同已淘汰，屠神／屠民不用再另外補刀。'}</div>`:''}`:''}
      <button class="primary" onclick="jgGoStep('next-night')">遺言結束，天黑 →</button>
    `,'💬 遺言');
  }
  else if(step==='next-night'){
    const res=jgCheckWin();
    if(res){jgShowWin(res);return;}
    jgNight++;
    // 注意：這裡不能重置 jgRecord！'night-start' 那一步會自己重置，並且需要讀取「重置前」的
    // jgRecord.bloodmoonSealNight 才能正確把血月封印狀態帶到下一夜。如果在這裡先重置一次，
    // night-start 讀到的就已經是空的，血月封印會失效。
    jgGoStep('night-start');
  }
}

// ── 雙機械狼板：大／小機械狼共用的睜眼畫面（用 roleId 參數分辨是哪一隻，避免寫兩份重複的畫面） ──
function jgRenderMechWolf2Step(roleId){
  const label=roleId==='bigmechwolf'?'大機械狼':'小機械狼';
  const otherRoleId=roleId==='bigmechwolf'?'smallmechwolf':'bigmechwolf';
  const otherLabel=roleId==='bigmechwolf'?'小機械狼':'大機械狼';
  const selfP=jgPlayers.find(p=>p.role===roleId);
  const st=jgMechWolf2State[roleId];
  const otherSt=jgMechWolf2State[otherRoleId];
  const otherP=jgPlayers.find(p=>p.role===otherRoleId);
  // 小機械狼已經回歸主狼群後（規則8：兩隻都學到狼人），這個獨立畫面不再需要選任何東西，
  // 實際刀口改在共用的「狼人睜眼」畫面決定，這裡只維持喊話節奏。
  // 小機械狼已經回歸主狼群後（規則8：兩隻都學到狼人），實際刀口改在共用的「狼人睜眼」
  // 畫面決定，這裡不用再選任何東西——但台詞還是要完整走一遍（睜眼/閉眼、帶刀手勢），
  // 不能只剩空殼，避免其他玩家從流程差異猜出小機械狼已經回歸。帶刀手勢固定比讚（因為
  // 他現在會參與狼隊共用的刀口決定），並提供大字報提醒他「待會要回歸狼隊」。
  if(roleId==='smallmechwolf'&&st.rejoinedPack){
    const bigP=jgPlayers.find(p=>p.role==='bigmechwolf');
    jgShowPg(`
      <h2>${label}睜眼</h2>
      <div class="speech">「<em>${label}請睜眼。</em>」</div>
      <div class="info" style="font-size:12px;">因大小機皆學到狼人，小機今晚回歸狼隊</div>
      <button onclick="jgShowBigCard('小機械狼','待會回歸狼隊（狼人睜眼時一起睜眼）')" style="margin-top:6px;width:100%;">📋 大字報顯示給小機械狼看</button>
      ${bigP?'<button onclick="jgMechWolf2ShowOtherBigCard(\'smallmechwolf\')" style="margin-top:6px;width:100%;">📋 給小機械狼看大機械狼是幾號與身分</button>':''}
      <div class="divider"></div>
      <div class="speech">「<em>你要使用技能嗎？</em>」</div>
      <div class="speech">「<em>今晚的帶刀手勢是？（👍 讚）</em>」</div>
      <div class="speech" style="margin-top:10px;">「<em>${label}請閉眼。</em>」</div>
      <button class="primary" onclick="jgSaveMechWolf2('${roleId}')">已紀錄，下一步 →</button>
    `,'🤖 '+label);
    return;
  }
  const idHtml=jgGodIdHtml(roleId,selfP);
  const dead=selfP&&!selfP.alive;
  const feared=jgFeared(selfP);
  const isLearnedOtherMech=st.learned==='bigmechwolf'||st.learned==='smallmechwolf';
  const canUseSkill=!!st.learned&&!isLearnedOtherMech&&st.learnedNight!==null&&jgNight>st.learnedNight;
  const eligible=jgNight>=2&&jgMechWolf2KillEligible(roleId);
  const isFirstKillNight=eligible&&st.killTurnFirstNight===null;
  const doubleKill=isFirstKillNight&&st.learned==='wolf';

  // Part 1：學習，或使用已學到的技能——跟單一機械狼（jgMechWolfSkillUseHtml 那一段）走
  // 完全一樣的結構，就算已出局也要照樣走一次台詞，不能只剩睜眼／閉眼，避免其他玩家從
  // 流程有沒有跑這一段猜出誰還活著。
  let learnHtml='';
  if(feared){
    learnHtml='';
  } else if(!st.learned||isLearnedOtherMech){
    // 「重新選人學習」（學到另一台機械狼的情況）要等過了「學到的那一晚」才出現，避免法官
    // 在同一晚按「上一步」回到這個畫面時，誤判成已經可以重選。
    const canRepickNow=!st.learned||jgNight>st.learnedNight;
    if(dead){
      learnHtml='';
    } else if(canRepickNow){
      const selfNums=selfP?[selfP.num]:[];
      learnHtml='<div class="speech">「<em>今晚要學習的對象是？</em>」</div>'
        +'<label>'+(st.learned?'重新選人學習':'學習對象號碼')+'（留空=本晚不學習，不能學自己）</label>'
        +jgNumSelectHtml('jg-'+roleId+'-learn','','jgMechWolf2LearnCheck',null,selfNums,'不能學習自己')
        +'<div id="jg-'+roleId+'-learn-result"></div>'
        +(st.learned?'':'<div class="info" style="font-size:12px;margin-top:4px;">通靈師查驗這個號碼時會顯示他學到的具體身分。若學到的是「另一隻機械狼」，之後的夜晚還能重新選人學習。</div>');
    }
  } else if(canUseSkill){
    if(st.learned==='hunter'){
      learnHtml='<div class="speech">「<em>你要使用技能嗎？</em>」</div>'+jgBuildHunterStatusHtml(selfP);
    } else if(dead){
      learnHtml='<div class="speech">「<em>你要使用技能嗎？</em>」</div>';
    } else {
      learnHtml='<div class="speech">「<em>你要使用技能嗎？</em>」</div>'+jgMechWolf2SkillUseHtml(roleId);
    }
  } else {
    learnHtml=st.learned?'<div class="info" style="font-size:12px;">已學得「'+jgFullRoleName(st.learned)+'」，次晚起可使用技能。</div>':'';
  }

  // 法官告知學到的身分＋號碼：這件事在「學到的當晚」選人的當下，就已經透過即時查驗結果＋
  // 大字報告知過了（見 jgMechWolf2LearnCheck），不需要在後面任何一晚再重複講一次。
  let informHtml='';

  // 告知另一隻機械狼的號碼與目前學到的身分：只在第二晚顯示一次（雙方各自看對方一次就好，
  // 不需要每晚重複出現），大字報格式是「X號 OO機械狼 學到 YY」。
  let otherInfoHtml='';
  if(!dead&&!feared&&jgNight===2){
    const otherLearnedDisplay=otherP?(!otherSt.learned?'尚未學到':((otherSt.learned==='bigmechwolf'||otherSt.learned==='smallmechwolf')?'機械狼':jgFullRoleName(otherSt.learned))):'（尚未記錄身分）';
    otherInfoHtml='<div class="info" style="font-size:12px;padding:8px 12px;">🤝 '+otherLabel+'是 <strong>'+(otherP?otherP.num+'號':'?')+'</strong>，目前學到的身分是：<strong>'+otherLearnedDisplay+'</strong>'
      +(otherP?' <button onclick="jgMechWolf2ShowOtherBigCard(\''+roleId+'\')" style="margin-top:6px;width:100%;">📋 給'+label+'看'+otherLabel+'是幾號與身分</button>':'')+'</div>';
  }

  // Part 2：帶刀手勢（第二晚起才有）——就算已出局，這句台詞也要照樣問一次，只是死亡沒有
  // 實際帶刀選項，固定比倒讚略過即可。文字盡量精簡，不重複講「輪到誰帶刀」這種畫面上
  // 已經看得出來的資訊。
  let killGestureHtml='';
  if(jgNight>=2&&!feared){
    if(dead){
      killGestureHtml='<div class="divider"></div><div class="speech">「<em>今晚的帶刀手勢是？（👎 倒讚）</em>」</div>';
    } else if(eligible){
      killGestureHtml='<div class="divider"></div>'
        +'<div class="speech">「<em>今晚的帶刀手勢是？（👍 讚）</em>」'+(doubleKill?'（學到狼人，本回合帶兩刀！）':'')+'</div>'
        +'<label>今晚要殺的對象'+(doubleKill?'（第一刀）':'')+'（留空=不殺）</label>'+jgNumSelectHtml('jg-'+roleId+'-kill1','');
      if(doubleKill){
        killGestureHtml+='<label style="margin-top:8px;">第二刀（留空=不殺）</label>'+jgNumSelectHtml('jg-'+roleId+'-kill2','');
      }
    } else {
      killGestureHtml='<div class="divider"></div><div class="speech">「<em>今晚的帶刀手勢是？（👎 倒讚）</em>」</div>';
    }
  }

  jgShowPg(`
    <h2>${label}睜眼</h2>
    <div class="speech">「<em>${label}請睜眼。</em>」</div>
    ${idHtml}
    ${dead?'<div class="info-warn">'+label+'已出局，仍需走完流程</div>':''}
    <div id="jg-god-${roleId}-feared-note" class="info-warn" style="${feared?'':'display:none;'}">（法官搖頭）你被恐懼了，無法使用技能</div>
    <div style="${feared?'display:none;':''}">
    ${informHtml}
    ${learnHtml}
    ${otherInfoHtml}
    ${killGestureHtml}
    </div>
    <div class="speech" style="margin-top:10px;">「<em>${label}請閉眼。</em>」</div>
    <button class="primary" onclick="jgSaveMechWolf2('${roleId}')">已紀錄，下一步 →</button>
  `,'🤖 '+label);
}

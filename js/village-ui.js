// ═══════════════════════════════════════════
// js/village-ui.js
// 村莊（公開版）的畫面：遊玩數據頁最上面的村莊區塊（登入、建立村莊、用邀請連結加入、邀請朋友、
// 切換村莊、成員、離開／刪除村莊），以及跟其他功能的銜接：
//   ・在村莊裡時，遊玩數據頁改顯示這個村莊的場次（GAMES），不在村莊時顯示範例資料
//   ・設定玩家名單的名字按鈕改用村莊共用的名單（見 js/core.js jgGetNamePool）
//   ・主持結束畫面的「存到村莊」（jgVillageSaveCurrentGame）
// 跟 Firebase 溝通的部分在 js/village.js（module），透過 window.jgVillageApi／jgVillageState。
// ═══════════════════════════════════════════

let jgVillagePendingInvite=null;   // 從邀請連結進來的邀請碼（登入後確認加入）
let jgVillageInviteInfo=null;      // 查到的邀請：{code, vid, name, already}
let jgVillageShowInvite=false;     // 邀請朋友的連結區塊有沒有打開
let jgVillageShowMembers=false;
let jgVillageShowPrivacy=false;
let jgVillageBusy=false;
let jgVillageSavedLog=null;        // 這一場已經存過（避免重複存）

function jgVillageOn(){ return typeof jgEditionHas==='function'&&jgEditionHas('village'); }
function jgVillageS(){ return window.jgVillageState||null; }
// 現在是不是在某個村莊裡（登入、而且選了村莊）
function jgVillageActive(){ const s=jgVillageS(); return !!(jgVillageOn()&&s&&s.user&&s.current); }
// 給 js/core.js 用：村莊共用的玩家名單（不在村莊時回傳 null，名單照舊存在這台裝置）
function jgVillageRoster(){ return jgVillageActive()?jgVillageS().current.roster:null; }
function jgVillageAddRosterName(name){
  if(!jgVillageActive()||!window.jgVillageApi) return;
  window.jgVillageApi.addRosterName(name).catch(e=>console.warn('村莊名單同步失敗', e));
}
function jgVillageEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Google 不允許在 LINE、Facebook 這類 App 內建的瀏覽器裡登入。
function jgVillageInAppBrowser(){
  const ua=navigator.userAgent||'';
  if(/\bLine\//i.test(ua)) return 'line';
  if(/FBAN|FBAV|Instagram|MicroMessenger/i.test(ua)) return 'other';
  return '';
}
function jgVillageInviteLink(code){
  return location.origin+location.pathname+'?join='+encodeURIComponent(code)+'&openExternalBrowser=1';
}

// ── 動作 ──
async function jgVillageRun(fn){
  if(jgVillageBusy) return;
  jgVillageBusy=true; jgVillageRender();
  try{ await fn(); }
  catch(e){ console.error(e); alert((e&&e.message)||String(e)); }
  jgVillageBusy=false; jgVillageRender();
}
function jgVillageSignIn(){
  const inApp=jgVillageInAppBrowser();
  if(inApp==='line'){
    // LINE 支援網址加 openExternalBrowser=1 直接用外部瀏覽器打開
    const u=new URL(location.href); u.searchParams.set('openExternalBrowser','1');
    if(jgVillagePendingInvite) u.searchParams.set('join', jgVillagePendingInvite);
    location.href=u.toString();
    return;
  }
  if(inApp){ alert('這個 App 內建的瀏覽器不能用 Google 登入。\n請按右上角選單，選「用瀏覽器開啟」（Chrome 或 Safari）後再登入。'); return; }
  if(!window.jgVillageApi){ alert('登入功能還在載入，請稍等一下再按一次。'); return; }
  jgVillageRun(()=>window.jgVillageApi.signIn());
}
function jgVillageSignOut(){ if(window.jgVillageApi) jgVillageRun(()=>window.jgVillageApi.signOut()); }
function jgVillageCreate(){
  const inp=document.getElementById('village-new-name');
  const name=(inp&&inp.value||'').trim();
  if(!name){ alert('請輸入村莊名稱'); return; }
  jgVillageRun(()=>window.jgVillageApi.createVillage(name));
}
function jgVillageJoin(){
  const code=jgVillageInviteInfo&&jgVillageInviteInfo.code;
  if(!code) return;
  jgVillageRun(async()=>{
    await window.jgVillageApi.joinVillage(code);
    jgVillagePendingInvite=null; jgVillageInviteInfo=null;
  });
}
function jgVillageCancelJoin(){ jgVillagePendingInvite=null; jgVillageInviteInfo=null; jgVillageRender(); }
function jgVillageSwitch(vid){ if(window.jgVillageApi) window.jgVillageApi.switchVillage(vid); }
function jgVillageToggleInvite(){ jgVillageShowInvite=!jgVillageShowInvite; jgVillageRender(); }
function jgVillageToggleMembers(){ jgVillageShowMembers=!jgVillageShowMembers; jgVillageRender(); }
function jgVillageTogglePrivacy(){ jgVillageShowPrivacy=!jgVillageShowPrivacy; jgVillageRender(); }
function jgVillageCopyInvite(){
  const s=jgVillageS(); if(!s||!s.current) return;
  const link=jgVillageInviteLink(s.current.inviteCode);
  const done=()=>{ if(typeof jgJudgeToast==='function') jgJudgeToast('已複製邀請連結'); };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, ()=>prompt('複製這條邀請連結：', link));
  else prompt('複製這條邀請連結：', link);
}
function jgVillageShareInvite(){
  const s=jgVillageS(); if(!s||!s.current) return;
  const link=jgVillageInviteLink(s.current.inviteCode);
  if(navigator.share) navigator.share({title:'加入「'+s.current.name+'」', text:'一起來狼人殺！點連結用 Gmail 登入就能加入「'+s.current.name+'」：', url:link}).catch(()=>{});
  else jgVillageCopyInvite();
}
function jgVillageLeave(){
  const s=jgVillageS(); if(!s||!s.current) return;
  if(!confirm('確定要離開「'+s.current.name+'」嗎？之後要再加入，請村長再傳邀請連結給你。')) return;
  jgVillageRun(()=>window.jgVillageApi.leaveVillage());
}
function jgVillageDelete(){
  const s=jgVillageS(); if(!s||!s.current) return;
  const name=s.current.name;
  const typed=prompt('刪除村莊會把「'+name+'」的所有場次紀錄、玩家名單、成員一起刪掉，不能復原。\n確定要刪除的話，請輸入村莊名稱：');
  if(typed===null) return;
  if(typed.trim()!==name){ alert('村莊名稱不對，沒有刪除。'); return; }
  jgVillageRun(()=>window.jgVillageApi.deleteVillage());
}
function jgVillageDeleteGame(docId){
  if(!confirm('確定要刪除這場紀錄嗎？刪除後排行榜會重新計算，不能復原。')) return;
  jgVillageRun(()=>window.jgVillageApi.deleteGame(docId));
}
// 主持結束畫面的「存到村莊」
function jgVillageSaveCurrentGame(){
  if(window.jgTourPractice){ alert('導覽的場次不會存進村莊。'); return; }
  if(typeof jgLastWinResult==='undefined'||!jgLastWinResult){ alert('這場還沒結束，沒有結果可以存。'); return; }
  const s=jgVillageS();
  if(!s||!s.user||!s.current){
    if(confirm('要先用 Gmail 登入、建立或加入村莊，才能把這場存起來。\n現在到「遊玩數據」頁登入嗎？（這場的結果會留著，登入完回到「法官の助手」再按一次「存到村莊」）')) switchTab('t-data');
    return;
  }
  const rec=pdBuildGameRecord();
  if(jgVillageSavedLog===rec.log){ alert('這場已經存到「'+s.current.name+'」了。'); return; }
  const unnamed=rec.players.filter(p=>!p.name).length;
  if(unnamed&&!confirm('有 '+unnamed+' 個座位沒有填名字，這些座位不會算進排行榜。\n確定要存到「'+s.current.name+'」嗎？')) return;
  jgVillageRun(async()=>{
    await window.jgVillageApi.saveGame(rec);
    jgVillageSavedLog=rec.log;
    if(typeof jgJudgeToast==='function') jgJudgeToast('已存到「'+s.current.name+'」');
    const btn=document.getElementById('jg-village-save-btn'); if(btn){ btn.textContent='已存到「'+s.current.name+'」'; btn.disabled=true; }
  });
}
// 主持結束畫面上的按鈕（js/core.js 呼叫）
function jgVillageSaveButtonHtml(){
  if(!jgVillageOn()||window.jgTourPractice) return '';
  const s=jgVillageS();
  const label=(s&&s.current)?'存到村莊「'+jgVillageEsc(s.current.name)+'」':'存到村莊';
  return '<button id="jg-village-save-btn" class="success" onclick="jgVillageSaveCurrentGame()" style="margin-top:8px;">'+(typeof jgIcon==='function'?jgIcon('folder')+' ':'')+label+'</button>';
}

// ── 遊玩數據頁：在村莊裡顯示村莊的場次，不在村莊時顯示範例資料 ──
let jgVillageGamesKey='';
function jgVillageSyncGames(){
  if(!jgVillageOn()||typeof GAMES==='undefined') return;
  const s=jgVillageS();
  const inVillage=!!(s&&s.user&&s.current);
  const src=inVillage?(s.games||[]):(typeof JG_DEMO_GAMES!=='undefined'?JG_DEMO_GAMES:[]);
  const key=(inVillage?'v:'+s.current.id:'demo')+':'+src.length+':'+src.map(g=>g._docId||g.id).join(',');
  const banner=document.querySelector('.pd-demo-banner');
  if(banner) banner.style.display=inVillage?'none':'';
  if(key===jgVillageGamesKey) return;
  jgVillageGamesKey=key;
  GAMES.splice(0, GAMES.length, ...src);
  if(typeof pdRebuildAndRender==='function'){ try{ pdRebuildAndRender(); }catch(e){ console.error(e); } }
}

// ── 村莊區塊 ──
function jgVillageRender(){
  const box=document.getElementById('village-panel');
  if(!box||!jgVillageOn()) return;
  const s=jgVillageS();
  const busy=jgVillageBusy?' disabled':'';
  const privacy='<div class="village-privacy"><button type="button" class="ghost village-link" onclick="jgVillageTogglePrivacy()">隱私說明</button>'
    +(jgVillageShowPrivacy?'<div class="info" style="font-size:12px;margin-top:6px;">村莊會存：你的 Google 名稱與 Email（用來辨識村莊成員）、村莊名稱、玩家名單裡的名字、存進村莊的場次紀錄。'
      +'這些資料只有村莊成員看得到。村長可以刪除整個村莊，所有資料會一起刪除；成員可以隨時離開村莊。</div>':'')+'</div>';
  let html='';
  if(!s||!s.ready){
    html='<div class="village-card"><div class="info" style="font-size:13px;">村莊功能載入中…</div></div>';
  } else if(!s.user){
    const inv=jgVillagePendingInvite?'<div class="info-success" style="font-size:13px;margin:0 0 10px;">你收到一個村莊邀請！先用 Gmail 登入，就可以加入。</div>':'';
    html='<div class="village-card">'+inv
      +'<div class="village-title">建立你的村莊</div>'
      +'<div class="village-desc">用 Gmail 登入，建立村莊或加入朋友的村莊。村莊成員共用玩家名單，每主持完一場可以「存到村莊」，累積出這群朋友自己的排行榜、勝率和特別獎項，只有村莊成員看得到。</div>'
      +(jgVillageInAppBrowser()?'<div class="info-warn" style="font-size:12px;">你現在用的是 App 內建的瀏覽器，Google 不允許在這裡登入。按下面的按鈕會改用外部瀏覽器開啟；沒反應的話，請從右上角選單選「用瀏覽器開啟」。</div>':'')
      +'<button class="primary" onclick="jgVillageSignIn()"'+busy+'>用 Google 登入</button>'
      +privacy+'</div>';
  } else if(jgVillageInviteInfo){
    const inv=jgVillageInviteInfo;
    html='<div class="village-card"><div class="village-title">加入「'+jgVillageEsc(inv.name)+'」</div>'
      +(inv.already?'<div class="village-desc">你已經是這個村莊的成員了。</div><button class="primary" onclick="jgVillageSwitch(\''+inv.vid+'\');jgVillageCancelJoin()">前往村莊</button>'
        :'<div class="village-desc">加入後可以一起用村莊的玩家名單、把主持的場次存進村莊、看村莊的排行榜。</div>'
          +'<div class="village-row"><button class="primary" onclick="jgVillageJoin()"'+busy+'>加入村莊</button><button onclick="jgVillageCancelJoin()">先不要</button></div>')
      +'</div>';
  } else if(!s.current){
    html='<div class="village-card"><div class="village-title">建立村莊</div>'
      +'<div class="village-desc">'+jgVillageEsc(s.user.name)+'，你還沒有村莊。幫你們這群朋友取個名字吧！要加入朋友的村莊，請村長傳邀請連結給你。</div>'
      +'<div class="village-row"><input type="text" id="village-new-name" maxlength="30" placeholder="村莊名稱，例如「週五狼人殺」" style="flex:1;margin:0;"><button class="primary" style="width:auto;margin:0;padding:0 20px;" onclick="jgVillageCreate()"'+busy+'>建立</button></div>'
      +'<div class="village-foot"><span>'+jgVillageEsc(s.user.email)+'</span><button type="button" class="ghost village-link" onclick="jgVillageSignOut()">登出</button></div>'
      +privacy+'</div>';
  } else {
    const c=s.current, owner=c.role==='owner';
    const switcher=s.villages.length>1
      ?'<select class="village-switch" onchange="jgVillageSwitch(this.value)">'+s.villages.map(v=>'<option value="'+v.id+'"'+(v.id===c.id?' selected':'')+'>'+jgVillageEsc(v.name)+'</option>').join('')+'</select>':'';
    const link=c.inviteCode?jgVillageInviteLink(c.inviteCode):'';
    html='<div class="village-card">'
      +'<div class="village-head"><div><div class="village-name">'+jgVillageEsc(c.name)+'</div>'
      +'<div class="village-meta">'+(owner?'你是村長':'村莊成員')+'・成員 '+s.members.length+' 人・'+(s.gamesLoaded?s.games.length+' 場紀錄':'讀取中…')+'</div></div>'+switcher+'</div>'
      +'<div class="village-row"><button class="primary" onclick="jgVillageToggleInvite()">邀請朋友</button><button onclick="jgVillageToggleMembers()">成員</button></div>'
      +(jgVillageShowInvite?'<div class="village-sub"><div style="font-size:13px;">把這條連結傳給要一起玩的朋友，對方用 Gmail 登入就會加入「'+jgVillageEsc(c.name)+'」：</div>'
        +'<input type="text" readonly value="'+jgVillageEsc(link)+'" onclick="this.select()" style="margin:8px 0;font-size:12px;">'
        +'<div class="village-row"><button onclick="jgVillageCopyInvite()">複製連結</button>'+(navigator.share?'<button onclick="jgVillageShareInvite()">分享…</button>':'')+'</div></div>':'')
      +(jgVillageShowMembers?'<div class="village-sub">'+s.members.slice().sort((a,b)=>(a.role==='owner'?-1:0)-(b.role==='owner'?-1:0)).map(m=>'<div class="village-member">'+jgVillageEsc(m.name)+(m.role==='owner'?'<span class="village-badge">村長</span>':'')+'</div>').join('')+'</div>':'')
      +(s.gamesLoaded&&!s.games.length?'<div class="info" style="font-size:12px;margin-top:10px;">還沒有紀錄。主持完在遊戲結束畫面按「存到村莊」，這一場就會出現在下面的排行榜和場次紀錄。</div>':'')
      +'<div class="village-foot"><span>'+jgVillageEsc(s.user.email)+'</span>'
      +(owner?'<button type="button" class="ghost village-link" onclick="jgVillageDelete()">刪除村莊</button>':'<button type="button" class="ghost village-link" onclick="jgVillageLeave()">離開村莊</button>')
      +'<button type="button" class="ghost village-link" onclick="jgVillageSignOut()">登出</button></div>'
      +privacy+'</div>';
  }
  if(s&&s.error) html+='<div class="info-warn" style="font-size:12px;">村莊資料讀取失敗：'+jgVillageEsc(s.error)+'</div>';
  box.innerHTML=html;
}

// js/village.js 狀態有變化時呼叫
window.jgVillageOnChange=function(){
  const s=jgVillageS();
  // 登入後才查邀請碼（要登入才能讀邀請）
  if(s&&s.user&&jgVillagePendingInvite&&!jgVillageInviteInfo&&window.jgVillageApi){
    const code=jgVillagePendingInvite;
    window.jgVillageApi.lookupInvite(code).then(info=>{
      if(!info){ alert('這條邀請連結已經失效，請跟村長要一條新的。'); jgVillagePendingInvite=null; }
      else jgVillageInviteInfo=info;
      jgVillageRender();
    }).catch(e=>{ console.warn(e); jgVillagePendingInvite=null; jgVillageRender(); });
  }
  jgVillageRender();
  jgVillageSyncGames();
};

// 從邀請連結（?join=邀請碼）進來：記下邀請碼、切到遊玩數據頁，網址上的參數清掉。
(function jgVillageInitInvite(){
  if(!jgVillageOn()) return;
  try{
    const params=new URLSearchParams(location.search);
    const code=params.get('join');
    if(code){
      jgVillagePendingInvite=code.replace(/[^a-z0-9]/gi,'').slice(0,20);
      params.delete('join'); params.delete('openExternalBrowser');
      const q=params.toString();
      history.replaceState({}, '', location.pathname+(q?'?'+q:'')+location.hash);
      document.addEventListener('DOMContentLoaded', ()=>{ if(typeof switchTab==='function') switchTab('t-data'); });
    }
  }catch(e){}
  document.addEventListener('DOMContentLoaded', jgVillageRender);
})();

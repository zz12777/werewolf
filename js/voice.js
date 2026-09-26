// ═══════════════════════════════════════════
// js/voice.js
// 連線房間的即時語音通話——用 LiveKit（WebRTC SFU）建立通話，簽發權杖／房主強制靜音
// 這兩個需要金鑰的動作都交給 Vercel 上的伺服器端函式（見 api/livekit-token.js、
// api/livekit-mute.js），這個檔案本身完全不碰任何金鑰。
//
// 部署後記得把下面 JG_VOICE_API_BASE 換成你自己的 Vercel 專案網址（例如
// 'https://werewolf-voice.vercel.app/api'）——這個網址本身不是秘密，可以放心 commit。
//
// 這個檔案是獨立的 <script type="module">，跟 js/room.js 是不同的模組作用域，互相看不到
// 對方宣告的變數；房間狀態（房號／是不是房主／玩家名單／我的座位）改成呼叫 room.js 掛在
// window 上的幾個小函式（jgRoomGetCode／jgRoomGetIsHost／jgRoomGetPlayers／
// jgRoomGetMySeatNum）即時讀取，不用自己再維護一份、也不會跟 room.js 的狀態兜不起來。
// ═══════════════════════════════════════════
import { Room, RoomEvent } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.22.3/dist/livekit-client.esm.mjs';

// TODO(部署時必改)：換成你自己的 Vercel 專案網址（Vercel 專案頁面最上面那個網址，後面
// 加 /api）。這個常數只是一個網址，不是金鑰，可以安心留在程式碼裡、commit 進 GitHub。
const JG_VOICE_API_BASE = 'https://werewolf-sage.vercel.app/api';

let jgVoiceRoom=null;          // LiveKit 的 Room 物件，還沒加入通話時是 null
let jgVoiceMicOn=false;        // 我自己的麥克風目前是不是開著
let jgVoiceConnecting=false;   // 正在建立連線（避免使用者連點好幾次「加入語音通話」）
let jgVoicePanelExpanded=false; // 通話中面板是不是展開顯示參與者清單

function jgVoiceRoomCode(){ return window.jgRoomGetCode ? window.jgRoomGetCode() : null; }
function jgVoiceIsHost(){ return window.jgRoomGetIsHost ? window.jgRoomGetIsHost() : false; }
function jgVoicePlayers(){ return (window.jgRoomGetPlayers && window.jgRoomGetPlayers()) || []; }
// 語音通話的「身分」直接沿用 Firebase 匿名登入的 uid——房間系統本來就是用這個 uid 分辨
// 每支手機是哪個座位，語音這邊沿用同一套，不用另外發明一組 id、也不用擔心對不起來。
function jgVoiceMyIdentity(){ return window.jgFirebaseUid || null; }
function jgVoiceSeatLabel(identity){
  const p=jgVoicePlayers().find(pp=>pp.uid===identity);
  return p?(p.seatNum+'號 '+p.name):'（座位資料還沒同步）';
}

// 跟 LiveKit token 簽發／房主靜音這兩支 Vercel 函式溝通的小工具——回傳失敗一律丟例外，
// 呼叫端統一用 try/catch + alert 顯示錯誤，不要讓失敗默默發生。
async function jgVoiceApiPost(path, payload){
  const resp=await fetch(JG_VOICE_API_BASE+path, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
  const data=await resp.json().catch(()=>({}));
  if(!resp.ok) throw new Error(data.error||('伺服器回應錯誤（狀態碼 '+resp.status+'）'));
  return data;
}

// ── 加入語音通話：跟 Vercel 要一份這個房間的 token，連上 LiveKit，打開自己的麥克風。──
window.jgVoiceJoin=async function(){
  if(jgVoiceRoom||jgVoiceConnecting) return;
  const roomCode=jgVoiceRoomCode();
  const identity=jgVoiceMyIdentity();
  if(!roomCode||!identity){ alert('房間資料還沒準備好，請稍等一下再試一次'); return; }
  jgVoiceConnecting=true;
  jgVoiceRenderPanel();
  try{
    const me=jgVoicePlayers().find(p=>p.uid===identity);
    const name=me?(me.seatNum+'號 '+me.name):identity;
    const { token, wsUrl }=await jgVoiceApiPost('/livekit-token', { roomCode, identity, name });
    const room=new Room({ adaptiveStream:true, dynacast:true });
    // 收到別人的音訊軌，接上一個看不見的 <audio> 播放；離開通話時（TrackUnsubscribed）
    // 要記得把元素拿掉，不然會累積一堆用不到的 <audio> 標籤。
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant)=>{
      if(track.kind==='audio'){
        const el=track.attach();
        el.style.display='none';
        el.dataset.jgVoiceTrack='1';
        // 記住這個音訊元素是誰講的話——狼隊出刀商議時要靠這個判斷「這個聲音該不該讓
        // 目前這支手機聽到」，見 jgVoiceApplyWolfAudioFilter。
        el.dataset.jgVoiceIdentity=participant?participant.identity:'';
        document.body.appendChild(el);
        jgVoiceApplyWolfAudioFilter();
      }
      jgVoiceRenderPanel();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track)=>{ track.detach().forEach(el=>el.remove()); jgVoiceRenderPanel(); });
    room.on(RoomEvent.ParticipantConnected, jgVoiceRenderPanel);
    room.on(RoomEvent.ParticipantDisconnected, jgVoiceRenderPanel);
    room.on(RoomEvent.ActiveSpeakersChanged, jgVoiceRenderPanel);
    room.on(RoomEvent.TrackMuted, jgVoiceRenderPanel);
    room.on(RoomEvent.TrackUnmuted, jgVoiceRenderPanel);
    // 被房主用伺服器端強制靜音時，LiveKit 會把我自己的麥克風軌標成 muted，這裡同步一下
    // 畫面上的開關狀態，不要讓畫面看起來還是「開著」但其實已經被關掉、講話沒人聽得到。
    room.on(RoomEvent.LocalTrackUnpublished, ()=>{ jgVoiceMicOn=false; jgVoiceRenderPanel(); });
    room.on(RoomEvent.Disconnected, ()=>{
      jgVoiceRoom=null; jgVoiceMicOn=false; jgVoicePanelExpanded=false;
      document.querySelectorAll('[data-jg-voice-track]').forEach(el=>el.remove());
      jgVoiceRenderPanel();
    });
    await room.connect(wsUrl, token);
    await room.localParticipant.setMicrophoneEnabled(true);
    jgVoiceMicOn=true;
    jgVoiceRoom=room;
  }catch(err){
    alert('加入語音通話失敗：'+(err&&err.message?err.message:String(err)));
  }finally{
    jgVoiceConnecting=false;
    jgVoiceRenderPanel();
  }
};
window.jgVoiceLeave=async function(){
  if(!jgVoiceRoom) return;
  await jgVoiceRoom.disconnect();
  // Disconnected 事件的 handler 會清狀態、重畫面板，這裡不用重複做。
};
window.jgVoiceToggleMic=async function(){
  if(!jgVoiceRoom) return;
  const next=!jgVoiceMicOn;
  await jgVoiceRoom.localParticipant.setMicrophoneEnabled(next);
  jgVoiceMicOn=next;
  jgVoiceRenderPanel();
};
window.jgVoiceTogglePanelExpand=function(){
  jgVoicePanelExpanded=!jgVoicePanelExpanded;
  jgVoiceRenderPanel();
};
// 房主強制靜音／恢復某位玩家——真正的靜音動作在 Vercel 那支函式裡呼叫 LiveKit 伺服器端
// API 完成，這裡只負責發出請求；成功後對方畫面的 TrackMuted/TrackUnmuted 事件會自動
// 觸發面板重畫，不用在這裡手動更新。
window.jgVoiceHostMute=async function(targetIdentity, muted){
  const roomCode=jgVoiceRoomCode();
  if(!roomCode) return;
  try{
    await jgVoiceApiPost('/livekit-mute', { roomCode, identity:targetIdentity, muted });
  }catch(err){
    alert('操作失敗：'+(err&&err.message?err.message:String(err)));
  }
};

// 麥克風按鈕圖案（比照 Google Meet 的做法：純圖案不放字，開啟是一般顏色的麥克風、關閉
// 是變色（紅底白圖）＋畫一條斜線的麥克風）。用 currentColor 畫線條，顏色交給外層按鈕的
// color 屬性決定，圖案本身不用另外傳顏色參數。
function jgVoiceMicIconSvg(on){
  const slash=on?'':'<line x1="4" y1="4" x2="20" y2="20"></line>';
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    +'<rect x="9" y="2" width="6" height="11" rx="3"></rect>'
    +'<path d="M5 10a7 7 0 0 0 14 0"></path>'
    +'<line x1="12" y1="19" x2="12" y2="22"></line>'
    +'<line x1="8" y1="22" x2="16" y2="22"></line>'
    +slash
    +'</svg>';
}
// ── 畫面：固定貼在畫面最下方的一條通話列，不管現在切到哪個分頁都看得到（跟右上角
//    「確認自己身分」、左上角「法官語音」是同一種「掛在 body 上、不會被整頁重畫清掉」
//    的做法）——故意不跟著分頁切換隱藏：正在通話中卻因為切到別的分頁看不到控制項、
//    忘記自己還開著麥克風，比多顯示一條列更容易出問題。──
function jgVoiceRenderPanel(){
  let bar=document.getElementById('jg-voice-bar');
  const roomCode=jgVoiceRoomCode();
  if(!roomCode){
    // 已經離開房間（或還沒進房間）：直接把整條列拿掉，不留空殼。
    if(bar) bar.remove();
    return;
  }
  if(!bar){
    bar=document.createElement('div');
    bar.id='jg-voice-bar';
    bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:300;background:var(--bg2);border-top:1px solid var(--border);box-shadow:0 -2px 10px rgba(0,0,0,0.1);font-size:13px;';
    document.body.appendChild(bar);
  }
  if(!jgVoiceRoom){
    bar.innerHTML='<div style="padding:10px 14px;text-align:center;">'
      +'<button class="primary" style="width:auto;display:inline-block;padding:8px 20px;" onclick="jgVoiceJoin()" '+(jgVoiceConnecting?'disabled':'')+'>'
      +(jgVoiceConnecting?'連線中…':'加入語音通話')+'</button></div>';
    return;
  }
  const remoteIds=Array.from(jgVoiceRoom.remoteParticipants.keys());
  const activeSpeakerIds=new Set((jgVoiceRoom.activeSpeakers||[]).map(p=>p.identity));
  const isHost=jgVoiceIsHost();
  const rows=remoteIds.map(id=>{
    const rp=jgVoiceRoom.remoteParticipants.get(id);
    const label=jgVoiceSeatLabel(id);
    const speaking=activeSpeakerIds.has(id);
    const micPubs=rp&&rp.audioTrackPublications?Array.from(rp.audioTrackPublications.values()):[];
    const micPub=micPubs[0];
    const hasAudio=!!micPub;
    const muted=!hasAudio||micPub.isMuted;
    const muteBtn=isHost
      ?'<button style="width:auto;padding:3px 10px;font-size:11px;" onclick="jgVoiceHostMute(\''+id+'\','+(muted?'false':'true')+')">'+(muted?'恢復麥克風':'靜音')+'</button>'
      :'';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 14px;'+(speaking?'background:rgba(46,125,50,0.12);':'')+'">'
      +'<span>'+label+(muted?'（靜音）':'')+'</span>'+muteBtn+'</div>';
  }).join('')||'<div style="padding:8px 14px;color:var(--text3);">還沒有其他人加入語音</div>';
  bar.innerHTML='<div style="display:flex;align-items:center;justify-content:space-around;padding:8px 6px;">'
    +'<button onclick="jgVoiceToggleMic()" title="'+(jgVoiceMicOn?'麥克風開':'麥克風關')+'" style="width:40px;height:40px;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;'
    +(jgVoiceMicOn?'background:var(--bg3);color:var(--text2);':'background:var(--wolf,#b83828);color:#fff;')+'">'+jgVoiceMicIconSvg(jgVoiceMicOn)+'</button>'
    +'<button style="width:auto;padding:6px 10px;" onclick="jgVoiceTogglePanelExpand()">'+(jgVoicePanelExpanded?'收合 ▲':'通話中（'+(remoteIds.length+1)+'人）▼')+'</button>'
    +'<button style="width:auto;padding:6px 10px;color:var(--wolf,#b83828);" onclick="jgVoiceLeave()">離開通話</button>'
    +'</div>'
    +(jgVoicePanelExpanded?'<div style="max-height:200px;overflow-y:auto;border-top:1px solid var(--border);">'+rows+'</div>':'');
}
// ── 狼隊出刀商議時，只讓「見面狼隊友」互相聽得到彼此，機械狼、夢魘這些不跟狼隊一起
//    睜眼的人，跟其他神職／平民，都不該聽到這段商議內容，不然語音通話會讓遊戲整個
//    變成「網殺」（誰都聽得到全場所有夜間行動）。做法是每支手機自己決定要不要播放
//    收到的音訊：不是真的斷線或伺服器端擋掉（那需要 LiveKit 針對每個聽者分別控制
//    誰能訂閱誰的音軌，跟這個 app 其餘功能一樣採「信任房間成員、只防外人」的取捨），
//    單純用 <audio> 元素的 muted 屬性決定「這支手機現在要不要播放某個人的聲音」，
//    跟房主強制靜音（那個是真的透過 Vercel／LiveKit 伺服器端 API 停止轉發）是兩回事。──
async function jgVoiceApplyWolfAudioFilter(){
  const els=document.querySelectorAll('[data-jg-voice-track]');
  if(!els.length) return;
  const isWolfStep=!!(window.jgRoomIsNightWolfStepNow&&window.jgRoomIsNightWolfStepNow());
  if(!isWolfStep){
    // 不是狼隊出刀商議時間：所有人的聲音正常播放。
    els.forEach(el=>{ el.muted=false; });
    return;
  }
  if(!window.jgRoomGetFaceWolfUidsAsync){ els.forEach(el=>{ el.muted=false; }); return; }
  const faceWolfUids=await window.jgRoomGetFaceWolfUidsAsync();
  const myIdentity=jgVoiceMyIdentity();
  const amIFaceWolf=faceWolfUids.includes(myIdentity);
  els.forEach(el=>{
    const speakerId=el.dataset.jgVoiceIdentity;
    const shouldHear=amIFaceWolf&&faceWolfUids.includes(speakerId);
    el.muted=!shouldHear;
  });
}
// 由 js/room.js 在房間文件（含 currentStep）每次更新時呼叫，重新判斷現在是不是狼隊
// 出刀商議時間——見 jgRoomEnterLobby 裡房間文件監聽器的說明。
window.jgVoiceOnRoomStepChange=function(){ jgVoiceApplyWolfAudioFilter(); };
// 進房間、離開房間時由 js/room.js 呼叫（見 jgRoomEnterLobby／jgRoomLeave）。
window.jgVoiceOnRoomEnter=function(){ jgVoiceRenderPanel(); };
window.jgVoiceOnRoomLeave=function(){
  if(jgVoiceRoom){ jgVoiceRoom.disconnect(); jgVoiceRoom=null; }
  jgVoiceMicOn=false; jgVoicePanelExpanded=false;
  document.querySelectorAll('[data-jg-voice-track]').forEach(el=>el.remove());
  const bar=document.getElementById('jg-voice-bar'); if(bar) bar.remove();
};

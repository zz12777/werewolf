'use strict';
// ═══════════════════════════════════════════
// js/room/public-info.js
// 發牌房、連線房間共用的「玩家手機上看到的公開／私人資訊」畫面元件：
//   ・號碼與姓名名單（一列 3 人）
//   ・警長競選資訊（上警號碼、退水、警上發言順序、當選警長），候選人自己多一顆「退水」按鈕
//   ・私人提醒（幸運兒拿到什麼技能、情侶是誰）：只有本人手機會跳出的放大版提醒，按「知道了」才關
//   ・短暫的全場提示（例如「5號退水」），幾秒後自己消失
// 這裡只負責把資料畫出來，資料從哪裡來由呼叫端決定：發牌房是法官助手同步上來的
// publicInfo（見 js/room/deal.js、js/deal-sync.js），連線房間是房間文件本身。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍）；檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

function jgRoomEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// players: [{num, name, dead?, sheriff?}]；mySeat：自己的號碼（標成「你」）。
function jgRoomNameGridHtml(players, mySeat){
  const cells=(players||[]).slice().sort((a,b)=>a.num-b.num).map(p=>{
    const mine=mySeat!=null&&Number(p.num)===Number(mySeat);
    const nm=p.name&&p.name!==(p.num+'號')?p.name:'';
    return '<div class="pi-cell'+(mine?' pi-me':'')+(p.dead?' pi-dead':'')+'">'
      +'<span class="pi-num">'+p.num+'</span>'
      +'<span class="pi-name">'+jgRoomEsc(nm)+(p.sheriff?' <span class="pi-tag">警長</span>':'')+'</span>'
      +'</div>';
  }).join('');
  return '<div class="pi-grid">'+cells+'</div>';
}

// 警長競選資訊。sh 的欄位：
//   candidates   目前還在競選的號碼；withdrawn 已退水的號碼
//   confirmed    法官已經按「候選人已確定」（還沒按之前顯示「法官登記中」）
//   order        警上發言順序（號碼陣列，含已退水的人，退水的會畫刪除線）；start／dir 起點與方向
//   pk           平票 PK 中（不能退水）；elected 警長號碼；none 本局無警長的說明
//   canWithdraw  現在可以退水（法官正在發言／退水階段）
// withdrawJs：候選人按「退水」時要執行的 onclick 字串（帶入號碼）；pendingWithdraw：已送出、等法官處理。
function jgRoomSheriffInfoHtml(sh, mySeat, withdrawJs, pendingWithdraw){
  if(!sh) return '';
  const cands=(sh.candidates||[]).map(Number), wd=(sh.withdrawn||[]).map(Number);
  if(!cands.length&&!wd.length&&!sh.elected&&!sh.none) return '';
  const lines=[];
  if(cands.length||wd.length){
    const all=cands.concat(wd).sort((a,b)=>a-b);
    lines.push('<div><b>上警：</b>'+all.map(n=>wd.includes(n)?'<s>'+n+'</s>':n).join('、')+'號'
      +(sh.confirmed?'':'<span class="pi-muted">（法官登記中）</span>')+'</div>');
  }
  if(wd.length) lines.push('<div><b>退水：</b>'+wd.join('、')+'號</div>');
  if(sh.order&&sh.order.length){
    const ord=sh.order.map(Number).map(n=>wd.includes(n)?'<s>'+n+'</s>':String(n)).join(' → ');
    const dirLabel=sh.dir==='逆'?'逆時針':(sh.dir==='順'?'順時針':'');
    lines.push('<div><b>'+(sh.pk?'PK 發言順序':'警上發言順序')+'：</b>'+ord
      +(sh.start&&!sh.pk?'<span class="pi-muted">（從 '+sh.start+' 號開始'+(dirLabel?'，'+dirLabel:'')+'）</span>':'')+'</div>');
  }
  if(sh.elected) lines.push('<div><b>警長：</b>'+sh.elected+'號</div>');
  else if(sh.none) lines.push('<div><b>警長：</b>'+jgRoomEsc(sh.none)+'</div>');
  let btn='';
  const me=mySeat!=null?Number(mySeat):null;
  if(me!=null&&cands.includes(me)&&withdrawJs){
    if(pendingWithdraw) btn='<div class="info" style="font-size:12px;margin-top:8px;">已送出退水，等法官處理…</div>';
    else if(sh.canWithdraw&&!sh.pk) btn='<button class="danger" style="margin-top:10px;" onclick="'+withdrawJs.replace(/"/g,'&quot;')+'">退水</button>';
  }
  return '<div class="card pi-sheriff"><div class="section-title" style="margin-top:0;">警長競選</div>'+lines.join('')+btn+'</div>';
}

// ── 私人提醒：只在本人手機上跳出的放大版提醒。key 用來記住「這則已經看過了」（同一則內容
//    按過「知道了」之後就不會再自動跳出）；內容改了（例如法官重新指定）會再跳一次。──
function jgRoomNoticeSeenKey(key, main){
  return 'jgNoticeSeen_'+(jgRoomCode||'')+'_'+key+'_'+String(main||'').length+'_'+String(main||'').slice(0,40);
}
function jgRoomNoticeSeen(key, main){
  try{ return localStorage.getItem(jgRoomNoticeSeenKey(key, main))==='1'; }catch(e){ return false; }
}
// notice: {key, title, main, note}；onCloseJs：按「知道了」之後要多執行的程式（字串，可省略）。
// force：不管看過沒有都顯示（給「確認自己身分」重看用）。
function jgRoomShowPrivateNotice(notice, onCloseJs, force){
  if(!notice) return;
  if(!force&&jgRoomNoticeSeen(notice.key, notice.main)) return;
  if(document.getElementById('jg-room-private-notice')) return; // 已經開著，不重複疊
  const modal=document.createElement('div');
  modal.id='jg-room-private-notice';
  modal.style.cssText='position:fixed;inset:0;background:#0a0a0a;color:#fff;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;overflow-y:auto;';
  window.__jgRoomNoticeClose=function(){
    try{ localStorage.setItem(jgRoomNoticeSeenKey(notice.key, notice.main),'1'); }catch(e){}
    modal.remove();
    if(onCloseJs){ try{ (new Function(onCloseJs))(); }catch(e){ console.error(e); } }
  };
  modal.innerHTML='<div style="font-size:9vw;font-weight:900;line-height:1.2;">'+jgRoomEsc(notice.title)+'</div>'
    +'<div style="font-size:7vw;font-weight:800;margin-top:18px;color:#ffd166;line-height:1.3;">'+jgRoomEsc(notice.main)+'</div>'
    +(notice.note?'<div style="font-size:15px;margin-top:18px;opacity:0.85;max-width:520px;">'+jgRoomEsc(notice.note)+'</div>':'')
    +'<div style="font-size:13px;margin-top:14px;opacity:0.7;">請小心不要讓別人看到這個畫面</div>'
    +'<button onclick="window.__jgRoomNoticeClose()" style="width:auto;margin-top:40px;padding:14px 36px;font-size:18px;border-radius:12px;border:none;background:#fff;color:#111;font-weight:700;flex-shrink:0;">知道了</button>';
  document.body.appendChild(modal);
}

// ── 全場短暫提示（例如「5號退水」），幾秒後自己消失，不擋操作。──
function jgRoomFlashNotice(text){
  let box=document.getElementById('jg-room-flash');
  if(!box){
    box=document.createElement('div');
    box.id='jg-room-flash';
    box.style.cssText='position:fixed;left:50%;top:110px;transform:translateX(-50%);z-index:9997;background:var(--text,#111);color:var(--bg,#fff);padding:12px 22px;border-radius:12px;font-size:20px;font-weight:800;box-shadow:0 4px 16px rgba(0,0,0,0.25);pointer-events:none;';
    document.body.appendChild(box);
  }
  box.textContent=text;
  box.style.display='block';
  clearTimeout(window.__jgRoomFlashTimer);
  window.__jgRoomFlashTimer=setTimeout(()=>{ box.style.display='none'; }, 3500);
}
// 比對前後兩次的退水名單，新增的人就跳「X號退水」。prevKey 用來分開記不同來源。
const jgRoomWithdrawSeen={};
function jgRoomAnnounceNewWithdrawals(prevKey, withdrawn){
  const now=(withdrawn||[]).map(Number);
  const before=jgRoomWithdrawSeen[prevKey];
  jgRoomWithdrawSeen[prevKey]=now;
  if(!before) return; // 第一次載入不跳（避免一進畫面就把之前的退水全部跳一次）
  const added=now.filter(n=>!before.includes(n));
  if(added.length) jgRoomFlashNotice(added.join('、')+'號退水');
}

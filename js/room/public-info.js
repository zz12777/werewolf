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

// 名單上的標籤：固定順序、每種一欄，同一種標籤上下對齊；只有名單裡有人用到的欄位才會出現。
const JG_ROOM_TAG_TYPES=[
  {key:'sheriff', label:'警長'},
  {key:'candidate', label:'上警'},
  {key:'withdrawn', label:'退水'},
  {key:'lover', label:'情侶'},
  {key:'infected', label:'感染者'}
];
// players: [{num, name, dead?, tags:{sheriff, candidate, withdrawn, lover, infected}}]；mySeat：自己的號碼（外框標色）。
function jgRoomNameGridHtml(players, mySeat){
  const list=(players||[]).slice().sort((a,b)=>a.num-b.num);
  const used=JG_ROOM_TAG_TYPES.filter(t=>list.some(p=>p.tags&&p.tags[t.key]));
  const cells=list.map(p=>{
    const mine=mySeat!=null&&Number(p.num)===Number(mySeat);
    const nm=p.name&&p.name!==(p.num+'號')?p.name:'';
    const slots=used.map(t=>'<span class="pi-slot pi-slot-'+t.key+'">'
      +((p.tags&&p.tags[t.key])?'<span class="pi-tag pi-tag-'+t.key+'">'+(t.key==='sheriff'&&typeof jgIcon==='function'?jgIcon('sheriff'):'')+t.label+'</span>':'')
      +'</span>').join('');
    return '<div class="pi-cell'+(mine?' pi-me':'')+(p.dead?' pi-dead':'')+'">'
      +'<span class="pi-num">'+p.num+'</span>'
      +'<span class="pi-name">'+jgRoomEsc(nm)+'</span>'+slots
      +'</div>';
  }).join('');
  return '<div class="pi-grid">'+cells+'</div>';
}
// 把警長資訊、私人標籤（情侶、感染者）合成名單要用的 tags。
function jgRoomNameTags(num, sh, priv){
  const n=Number(num), has=(arr)=>(arr||[]).map(Number).includes(n);
  const holder=sh?(sh.holder!=null?Number(sh.holder):(sh.elected!=null&&!sh.none?Number(sh.elected):null)):null;
  return {
    sheriff: holder===n,
    candidate: !!sh&&(has(sh.candidates)||has(sh.withdrawn)),
    withdrawn: !!sh&&has(sh.withdrawn),
    lover: !!priv&&has(priv.lovers),
    infected: !!priv&&has(priv.infected)
  };
}

// 警長競選資訊（依序：警上發言順序、票型、當選警長；上警、退水改標在玩家名單上）。sh 的欄位：
//   candidates   目前還在競選的號碼；withdrawn 已退水的號碼
//   confirmed    法官已經按「候選人已確定」（還沒按之前顯示「法官登記中」）
//   order        警上發言順序（號碼陣列，含已退水的人）；start／dir 起點與方向
//   pk           平票 PK 中（不能退水）；votes 票型（照文字紀錄的寫法，一行一筆）
//   elected      當選警長；holder 目前拿著警徽的人（警徽移交過才會跟 elected 不同）；none 沒有警長的說明
//   canWithdraw  現在可以退水（法官正在發言／退水階段）
// withdrawJs：候選人按「退水」時要執行的 onclick 字串；pendingWithdraw：已送出、等法官處理。
function jgRoomSheriffInfoHtml(sh, mySeat, withdrawJs, pendingWithdraw){
  if(!sh) return '';
  const cands=(sh.candidates||[]).map(Number), wd=(sh.withdrawn||[]).map(Number);
  if(!cands.length&&!wd.length&&!sh.elected&&!sh.none) return '';
  const lines=[];
  // 誰上警、誰退水改成直接標在玩家名單上（見 jgRoomNameTags），這裡只提示還在登記中。
  if((cands.length||wd.length)&&!sh.confirmed) lines.push('<div class="pi-muted" style="margin-left:0;">法官登記上警中…</div>');
  if(sh.order&&sh.order.length){
    const dirLabel=sh.dir==='逆'?'逆時針':(sh.dir==='順'?'順時針':'');
    lines.push('<div><b>'+(sh.pk?'PK 發言順序':'警上發言順序')+'：</b>'+sh.order.map(Number).join(' → ')
      +(sh.start&&!sh.pk?'<span class="pi-muted">（從 '+sh.start+' 號開始'+(dirLabel?'，'+dirLabel:'')+'）</span>':'')+'</div>');
  }
  if(sh.votes&&sh.votes.length) lines.push('<div><b>票型</b></div><div class="pi-votes">'+sh.votes.map(l=>'<div>'+jgRoomEsc(l)+'</div>').join('')+'</div>');
  if(sh.elected) lines.push('<div><b>當選警長：</b>'+sh.elected+'號</div>');
  if(sh.holder&&sh.elected&&Number(sh.holder)!==Number(sh.elected)) lines.push('<div><b>警徽移交：</b>'+sh.holder+'號</div>');
  if(sh.none) lines.push('<div><b>警長：</b>'+jgRoomEsc(sh.none)+'</div>');
  let btn='';
  const me=mySeat!=null?Number(mySeat):null;
  if(me!=null&&cands.includes(me)&&withdrawJs){
    if(pendingWithdraw) btn='<div class="info" style="font-size:12px;margin-top:8px;">已送出退水，等法官處理…</div>';
    else if(sh.canWithdraw&&!sh.pk) btn='<button class="danger" style="margin-top:10px;" onclick="'+withdrawJs.replace(/"/g,'&quot;')+'">退水</button>';
  }
  if(!lines.length&&!btn) return '';
  return '<div class="card pi-sheriff"><div class="section-title" style="margin-top:0;">警長競選</div>'+lines.join('')+btn+'</div>';
}
// 每天白天的放逐投票票型：dayVotes = [{day, lines:[...]}]，依天數排下來。
function jgRoomDayVotesHtml(dayVotes){
  return (dayVotes||[]).map(d=>'<div class="card pi-sheriff"><div class="section-title" style="margin-top:0;">第 '+d.day+' 天白天投票</div>'
    +'<div class="pi-votes">'+(d.lines||[]).map(l=>'<div>'+jgRoomEsc(l)+'</div>').join('')+'</div></div>').join('');
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

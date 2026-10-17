// ═══════════════════════════════════════════
// js/home.js
// 首頁（只有公開版有，見 js/edition.js 的 home）：一排身分牌輪流翻開、蓋回去，
// 每次翻開換一個角色。牌背是月亮，牌面是角色的線條圖示跟名字。
// 系統設定「減少動態效果」的話不翻牌，直接顯示幾張角色牌。
// ═══════════════════════════════════════════

const JG_HOME_CARD_ROLES=['seer','witch','hunter','guard','wolf','villager','evilknight','knight','wolfbeauty','mechanicalwolf','medium','dreamcatcher','nightmare','gargoyle','bloodmoon','magician','cupid','zombie','blackmarket'];
const JG_HOME_CARD_COUNT=5;
let jgHomeFlipTimer=null;

// 首頁牌面上的平民改用比較好看的版本（戴草帽的村民），其他地方的平民圖示不變。
const JG_HOME_VILLAGER_ICON='<svg class="jg-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 8.5h15"/><path d="M8.5 8.5l1-3.5h5l1 3.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 20.5a5.5 5.5 0 0 1 11 0"/></svg>';
function jgHomeRoleFace(id){
  const r=(typeof ALL_ROLES!=='undefined'&&ALL_ROLES[id])||null;
  if(!r) return '';
  const side=r.team==='wolf'?'wolf':'good';
  const icon=id==='villager'?JG_HOME_VILLAGER_ICON:r.icon;
  return '<span class="home-card-ico home-card-'+side+'">'+icon+'</span><span class="home-card-name">'+r.name+'</span>';
}
function jgHomeCardBack(){
  return '<svg class="jg-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 15.5A6.5 6.5 0 0 1 9 6.5a6.5 6.5 0 1 0 8 9z"/><path d="M17.5 5.5v2M16.5 6.5h2M14.5 3.5v1M14 4h1"/></svg>';
}
// 隨機挑一個「目前沒有出現在其他牌上」的角色。
function jgHomePickRole(used){
  const pool=JG_HOME_CARD_ROLES.filter(id=>!used.includes(id));
  return pool[Math.floor(Math.random()*pool.length)]||JG_HOME_CARD_ROLES[0];
}
function jgHomeReducedMotion(){
  try{ return window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; }
}
function jgRenderHomeCards(){
  const box=document.getElementById('home-cards');
  if(!box) return;
  const reduced=jgHomeReducedMotion();
  const roles=[];
  for(let i=0;i<JG_HOME_CARD_COUNT;i++) roles.push(jgHomePickRole(roles));
  box.innerHTML=roles.map((id,i)=>'<div class="home-card'+(reduced?' flipped':'')+'" data-role="'+id+'" style="--i:'+i+'">'
    +'<div class="home-card-inner">'
    +'<div class="home-card-side home-card-back">'+jgHomeCardBack()+'</div>'
    +'<div class="home-card-side home-card-front">'+jgHomeRoleFace(id)+'</div>'
    +'</div></div>').join('');
  clearInterval(jgHomeFlipTimer);
  if(reduced) return;
  // 每一拍翻一張：蓋著的就換一個新角色再翻開，翻開的就蓋回去，看起來像在一張一張發牌。
  let step=0;
  const order=[0,2,4,1,3];
  jgHomeFlipTimer=setInterval(()=>{
    const home=document.getElementById('t-home');
    if(!home||!home.classList.contains('on')) return; // 不在首頁時不動，省電
    const cards=[...box.querySelectorAll('.home-card')];
    if(!cards.length) return;
    const card=cards[order[step%order.length]%cards.length];
    step++;
    if(card.classList.contains('flipped')){
      card.classList.remove('flipped');
    } else {
      const used=cards.map(c=>c.getAttribute('data-role'));
      const id=jgHomePickRole(used);
      card.setAttribute('data-role', id);
      card.querySelector('.home-card-front').innerHTML=jgHomeRoleFace(id);
      card.classList.add('flipped');
    }
  }, 900);
}

if(typeof jgEditionHas==='function'&&jgEditionHas('home')){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', jgRenderHomeCards);
  else jgRenderHomeCards();
}

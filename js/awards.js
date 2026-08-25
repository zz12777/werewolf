// ═══════════════════════════════════════════
// js/awards.js
// 特別獎項計算（查狼專家、超強女巫、自刀專家、鋼鐵守衛、抿女巫專家、邱比特傳說）
// ═══════════════════════════════════════════

const AW_WOLF_CORE=new Set(['狼','狼人','王','黑狼王','狼兄']);      // 會一起商量刀口／見面的正牌狼（狼兄首夜就與其餘狼人一同睜眼執行狼刀，算見面狼；狼弟覺醒前不進狼窩，抿女巫只看首夜，故不列入）
const AW_WOLF_SUPPORT=new Set(['月','血月使者','魘','夢魘']);       // 邪惡陣營但不參與刀口決策的支援角色
function awRoleParts(role){ return String(role||'').split('/'); }
// 廣義狼隊（查狼／毒對狼命中判定用）：正牌狼 + 支援邪惡角色 + 機械狼
// 注意：「機械民/機械巫/機械守/機械通」等都是機械狼目前「學到的技能」標籤，本體仍是狼隊，
// 通靈師查到機械狼時本來就該顯示「查到狼」（詳見板子規則說明），所以只要角色字串以「機械」開頭就算狼。
function awIsWolfBroad(role){
  if(/^機械/.test(role)) return true;
  return awRoleParts(role).some(r=>AW_WOLF_CORE.has(r)||AW_WOLF_SUPPORT.has(r));
}
// 核心狼隊（自刀／抿女巫用；機械狼、石像鬼等不見面角色不算）
function awIsWolfCore(role){ return awRoleParts(role).some(r=>AW_WOLF_CORE.has(r)); }
// 機械狼即使學到了女巫/守衛技能，本體仍是狼隊，不能算好人陣營的「超強女巫」「鋼鐵守衛」，故排除 /^機械/。
function awIsWitchStd(role){ return /巫/.test(role) && !/^機械/.test(role); }
function awIsGuardStd(role){ return /守/.test(role) && !/墓/.test(role) && !/^機械/.test(role); }
function awIsSeerOrMedium(role){ return role==='預'||role==='預言家'||role==='通'||role==='通靈師'; } // 守墓人、石像鬼、機械通不算
function awIsX(v){ return /^x$/i.test(String(v==null?'':v).trim()); }
// 查狼專家專用判定：機械狼算不算「查到狼」不能沿用 awIsWolfBroad（那是看牌面最終角色，不代表
// 「查驗當下實際顯示的結果」）。預言家對機械狼永遠是二元好壞判斷、一律驗出「狼」；但通靈師驗到
// 的是機械狼「目前學到的具體身份」——一旦學到女巫/守衛/獵人/民等好人技能，通靈師驗出來就是那個
// 好人身份（跟真的該身份一模一樣，看不出是機械狼），這種情況不能算「查到狼」。由於文字紀錄只保留
// 每個玩家「最終」角色（如「機械女巫」），沒辦法回推每一次查驗當下機械狼學到什麼，因此機械狼只有
// 在最終顯示仍是「機械狼／機械黑狼王／機械狼人」（代表從未學到好人技能、或學到的仍是狼隊身分）時，
// 才算命中；其餘「機械X」（機械女巫、機械守衛、機械獵人、機械通靈師、機械民……）一律不算。
function awIsWolfForSeerCheck(role){
  if(role==='機械狼'||role==='機械黑狼王'||role==='機械狼人') return true;
  if(/^機械/.test(role)) return false;
  return awRoleParts(role).some(r=>AW_WOLF_CORE.has(r)||AW_WOLF_SUPPORT.has(r));
}

// ── 把一晚的文字（"**夜晚Nth" 到下一個 "**白天"/"**警長競選" 之間）拆成動作 ──
function awParseNight(block){
  const lines=String(block||'').split('\n').map(l=>l.trim()).filter(l=>l.startsWith('--')).map(l=>l.slice(2).trim());
  const info={kill:null,witchSave:null,witchPoison:null,witchPoisonMachine:null,guardTarget:null,guardTargetMachine:null,checks:[]};
  for(const line of lines){
    let m;
    if((m=line.match(/^通驗\s*(\d+|[xX])/))){ info.checks.push({type:'通驗',target:m[1]}); continue; }
    if((m=line.match(/^機驗\s*(\d+|[xX])/))){ info.checks.push({type:'機驗',target:m[1]}); continue; }
    if((m=line.match(/^石驗\s*(\d+|[xX])/))){ info.checks.push({type:'石驗',target:m[1]}); continue; }
    if((m=line.match(/^守墓\s*(\d+|[xX])/))){ info.checks.push({type:'守墓',target:m[1]}); continue; }
    if((m=line.match(/^機守\s*(\d+|[xX])/))){ info.guardTargetMachine=m[1]; continue; }
    if((m=line.match(/^機毒\s*(\d+|[xX])/))){ info.witchPoisonMachine=m[1]; continue; }
    if((m=line.match(/^機械刀刀?\s*(\d+|[xX])/))){ info.killMachine=m[1]; continue; }
    if((m=line.match(/^驗\s*(\d+|[xX])/))){ info.checks.push({type:'驗',target:m[1]}); continue; }
    if((m=line.match(/^守\s*(\d+|[xX])/))){ info.guardTarget=m[1]; continue; }
    if((m=line.match(/^刀\s*(\d+|[xX])/))){ if(info.kill===null) info.kill=m[1]; else info.kill2=m[1]; continue; }
    if((m=line.match(/^救\s*(\d+|[xX])/))){ info.witchSave=m[1]; continue; }
    if((m=line.match(/^毒\s*(\d+|[xX])/))){ info.witchPoison=m[1]; continue; }
  }
  return info;
}

function awAddCredit(dict,name,gameId){
  dict[name]=dict[name]||{count:0,games:new Set()};
  dict[name].count++;
  dict[name].games.add(gameId);
}

// 把 {name:{count,games}} 依次數分組，取前 maxTiers 個「名次區間」（同分並列同名次）
function awTopTiers(dict, maxTiers){
  maxTiers=maxTiers||3;
  const entries=Object.entries(dict).map(([name,d])=>({name,count:d.count,gamesStr:[...d.games].join('、')}));
  entries.sort((a,b)=>b.count-a.count);
  const groups=[];
  entries.forEach(e=>{
    let grp=groups.find(g=>g.count===e.count);
    if(!grp){ grp={count:e.count,items:[]}; groups.push(grp); }
    grp.items.push(e);
  });
  return groups.slice(0,maxTiers).map((g,i)=>({
    rank:i+1, count:g.count,
    name:g.items.map(x=>x.name).join('／'),
    detail:g.items.map(x=>x.name+'：'+x.gamesStr).join('；')
  }));
}

function computeAwards(){
  const poisonHits={}, seerHits={}, guardHits={}, minWitchCredit={}, selfKillDict={}, thirdPartyWins={};

  // 💘 邱比特傳說：人狼鏈成立、成為第三方陣營，且該局第三方獲勝——不需要解析 g.log，
  // 直接看送出紀錄時標記在 g.players[].third 上的旗標（見 pdSubmitGameRecord）即可。
  (GAMES||[]).forEach(g=>{
    if(!g.players||g.winner!=='third') return;
    g.players.forEach(pl=>{ if(pl.third) awAddCredit(thirdPartyWins, pl.name, g.id); });
  });

  (GAMES||[]).forEach(g=>{
    if(!g.players||!g.log) return;
    const players=g.players;
    const rawNights=String(g.log).split(/\*\*夜晚\d+(?:st|nd|rd|th)?/).slice(1);
    const nights=rawNights.map(seg=>seg.split(/\*\*白天|\*\*警長競選/)[0]);
    if(!nights.length) return;

    const witchStd=players.find(p=>awIsWitchStd(p.role));
    const guardStd=players.find(p=>awIsGuardStd(p.role));
    const seerP=players.find(p=>awIsSeerOrMedium(p.role));

    const n1=awParseNight(nights[0]);

    // 🔪 自刀專家：首夜狼隊「刀」自己隊友（機械狼／石像鬼等不見面角色不算）
    if(n1.kill && !awIsX(n1.kill)){
      const victim=players.find(p=>String(p.num)===String(n1.kill));
      if(victim && awIsWolfCore(victim.role)) awAddCredit(selfKillDict, victim.name, g.id);
    }
    // 🤐 抿女巫專家：女巫座號 ＝ 首夜刀口號碼，同局所有正牌狼都算一次
    if(witchStd && n1.kill && String(witchStd.num)===String(n1.kill)){
      players.filter(p=>awIsWolfCore(p.role)).forEach(w=>awAddCredit(minWitchCredit, w.name, g.id));
    }

    nights.forEach(seg=>{
      const info=awParseNight(seg);
      // 🧪 超強女巫：毒到廣義狼隊（含機械狼）
      if(witchStd && info.witchPoison && !awIsX(info.witchPoison)){
        const t=players.find(p=>String(p.num)===String(info.witchPoison));
        if(t && awIsWolfBroad(t.role)) awAddCredit(poisonHits, witchStd.name, g.id);
      }
      // 🛡️ 鋼鐵守衛：守X＝刀X
      if(guardStd && info.guardTarget && info.kill && !awIsX(info.guardTarget) && info.guardTarget===info.kill){
        awAddCredit(guardHits, guardStd.name, g.id);
      }
      // 🔮 查狼專家：僅計「預言家／通靈師」的「驗／通驗」，查到廣義狼隊（機械狼限定：僅在
      // 最終顯示仍為「機械狼／機械黑狼王／機械狼人」時才算，學到好人技能後查到不算）
      if(seerP){
        info.checks.forEach(c=>{
          if(c.type!=='驗' && c.type!=='通驗') return;
          if(awIsX(c.target)) return;
          const t=players.find(p=>String(p.num)===String(c.target));
          if(t && awIsWolfForSeerCheck(t.role)) awAddCredit(seerHits, seerP.name, g.id);
        });
      }
    });
  });

  return [
    {icon:'🧪',title:'超強女巫',top:awTopTiers(poisonHits),
      note:'【女巫毒對狼】:女巫毒藥使用對象，該局屬於狼隊（含機械狼）即算命中1次。'},
    {icon:'🔮',title:'查狼專家',top:awTopTiers(seerHits),
      note:'【預言家查到狼】:僅計「預言家／通靈師」的查驗結果，查到邪惡陣營即算命中；機械狼僅限最終顯示為「機械狼／機械黑狼王／機械狼人」時才算（學到女巫/守衛/獵人等好人技能後查到不算）。雙身分板若牌面顯示為好人則不算。'},
    {icon:'🔪',title:'自刀專家',top:awTopTiers(selfKillDict),
      note:'【狼隊首晚自刀騙解藥】:首夜狼隊「刀」的目標本身也是見面狼隊友（機械狼、石像鬼等不見面角色不算）。'},
    {icon:'🛡️',title:'鋼鐵守衛',top:awTopTiers(guardHits),
      note:'【守到狼刀】:逐晚比對「守X」與「刀X」，號碼相同才算守到刀口。'},
    {icon:'🤐',title:'抿女巫專家',top:awTopTiers(minWitchCredit),
      note:'【首刀女巫】:女巫首夜被狼刀，該局所有見面狼隊友（不含機械狼）都算1次。'},
    {icon:'💘',title:'邱比特傳說',top:awTopTiers(thirdPartyWins),
      note:'【第三方獲勝】:邱比特與情侶配成人狼鏈、獨立成第三方陣營，該局由第三方獲勝時，三人都算1次。'},
  ];
}

function awardsRender(){
  const strip=document.getElementById('awards-strip');
  if(!strip) return;
  const awards=computeAwards();
  window.AW_CURRENT=awards; // 給 awardsToggle 用
  strip.innerHTML=awards.map((a,i)=>{
    const first=a.top[0];
    return `<div class="award-card" id="aw-card-${i}" onclick="awardsToggle(${i})">
      <div class="aw-icon">${a.icon}</div>
      <div class="aw-title">${a.title}</div>
      <div class="aw-name">${first?first.name:'尚無資料'}</div>
      <div class="aw-count">${first?first.count+'次':''}</div>
    </div>`;
  }).join('');
  const detail=document.getElementById('award-detail');
  if(detail){ detail.classList.remove('open'); detail.innerHTML=''; }
  AWARD_OPEN=-1;
}
let AWARD_OPEN=-1;
function awardsToggle(i){
  const detail=document.getElementById('award-detail');
  document.querySelectorAll('.award-card').forEach(el=>el.classList.remove('sel'));
  if(AWARD_OPEN===i){ AWARD_OPEN=-1; detail.classList.remove('open'); detail.innerHTML=''; return; }
  AWARD_OPEN=i;
  document.getElementById('aw-card-'+i).classList.add('sel');
  const a=(window.AW_CURRENT||[])[i];
  if(!a) return;
  const rows=a.top.length
    ? a.top.map(t=>`<div>🏅 <b>第${t.rank}名｜${t.name}</b>　${t.count}次　<span style="color:var(--text3);">(${t.detail})</span></div>`).join('')
    : '<div style="color:var(--text3);">目前還沒有場次符合這個項目</div>';
  detail.innerHTML=`${rows}<div class="aw-note">${a.note}</div>`;
  detail.classList.add('open');
}

// ═══════════════════════════════════════════
// js/rules-ui.js
// 規則介紹分頁（角色卡片、板子資料、專有名詞、攻略文章、問題回報）
// 本檔案由 index.html 拆分而成，內容為原檔案對應區塊的原樣搬移（未修改邏輯）
// ═══════════════════════════════════════════

// ═══════════════════════════════════
// ROLE DATA & RULES CARDS
// ═══════════════════════════════════
const ALL_ROLES = {
  // Wolf pack
  wolf:     {icon:'🐺', name:'狼人',   team:'wolf', teamLabel:'狼人陣營', desc:'每晚與同伴商議選擇獵殺對象。白天偽裝好人，引導投票淘汰好人。<br><strong>目標：</strong>狼人數 ≥ 好人數。<br><strong>自刀自爆：</strong>可以被隊友自刀，也可以自己自爆（含警長競選期間自爆吞警徽）。'},
  wolfking: {icon:'👑', name:'黑狼王',   team:'wolf', teamLabel:'狼人陣營', desc:'<strong>帶人能力：</strong>被狼刀（夜槍，含隊友夜間自刀選中自己）、被票出局（白天槍），或被獵人開槍帶走淘汰時，都可以開槍帶走一名玩家；就算是守衛與女巫解藥同時作用而「奶穿」致死，仍然可以帶人。<br><strong>限制：</strong>白天自爆、被獵魔人獵出局、被女巫毒殺時，都無法開槍帶人。<br><strong>跟白狼王的差別：</strong>黑狼王沒有「自爆帶人」技能，白天自爆一律不能帶人；只有在被淘汰（狼刀／被票出局／獵人帶走）的當下才能開槍反擊。<br><strong>自刀自爆：</strong>可以被隊友自刀，也可以自己自爆（含警長競選期間自爆吞警徽），只是自爆時不能開槍帶人。'},
  whitewolf:{icon:'🤍', name:'白狼王', team:'wolf', teamLabel:'狼人陣營', desc:'<strong>自爆帶人：</strong>白天除了投票環節以外的任何階段，都可以主動宣告自爆，帶走場上任意一名玩家，接著直接進入夜晚。<br><strong>限制：</strong>白狼王沒有黑狼王「出局開槍」的技能——不管是白天被放逐（投票出局）、被獵人開槍帶走，還是夜間被自己隊友刀死（自刀），都不能帶人，只有「自己主動自爆」才能帶人。<br><strong>自刀自爆：</strong>可以被隊友自刀（不能帶人）；可以自己自爆（含警長競選期間自爆吞警徽，但吞警徽時不會觸發帶人）。'},
  wolfbeauty:{icon:'💋',name:'狼美人', team:'wolf', teamLabel:'狼人陣營', desc:'<strong>魅惑連結：</strong>每晚必須魅惑一名玩家（不能連續兩晚魅惑同一人，不能自刀自爆，不能魅惑自己）。<br><strong>殉情：</strong>狼美人出局（被票、獵人射殺）或夜間被毒，魅惑對象殉情。<br><strong>限制：</strong>被騎士決鬥出局時技能無法發動。<br><span style="color:var(--seer);font-size:12px;">⚡ 通常與騎士搭配出現</span>'},
  evilknight:{icon:'🖤',name:'惡靈騎士',team:'wolf',teamLabel:'狼人陣營', desc:'<strong>被動防禦：</strong>夜間免疫狼殺、女巫毒、以及夜槍（獵人/黑狼王被狼刀淘汰後開槍帶人）（但預言家查驗仍顯示狼人）。<br><strong>反傷：</strong>被預言家查驗→次日預言家死亡；被女巫毒殺→次日女巫死亡。但反傷效果整局限一次。<br><strong>限制：</strong>不可自刀自爆。'},
  bloodmoon: {icon:'🌑', name:'血月使者', team:'wolf', teamLabel:'狼人陣營', desc:'<strong>主動技：</strong>白天自己發言階段可自爆後直接進入黑夜，當晚所有神牌技能封印。<br><strong>被動技：</strong>若為最後一個被放逐的狼人，可暫時存活進入黑夜，夜晚再擊殺一名玩家，達屠邊則狼人勝利。<br><strong>自刀自爆：</strong>可以被隊友自刀，也可以自己自爆（含警長競選期間自爆吞警徽），但一般自爆須在自己發言階段宣告，不能搶在別人發言時自爆。<br><span style="color:var(--seer);font-size:12px;">⚡ 通常與獵魔人搭配出現</span>'},
    gargoyle: {icon:'🗿', name:'石像鬼', team:'wolf', teamLabel:'狼人陣營', desc:'<strong>查驗牌面：</strong>每晚查驗一名玩家的具體角色。<br><strong>限制：</strong>不與狼隊見面，隊友全滅前不能殺人；隊友全滅後可在查驗之外，額外選擇今晚的帶刀對象殺人。不可自爆，可自刀。<br><span style="color:var(--seer);font-size:12px;">⚡ 通常與守墓人搭配出現</span>'},
  mechanicalwolf:{icon:'🤖',name:'機械狼', team:'wolf', teamLabel:'狼人陣營', desc:'<strong>不與狼隊相認：</strong>與其他狼人互不相認，全程不可自爆。<br><strong>學習技能：</strong>任一晚可選擇一名玩家並「學習」其身份技能，次晚起可使用該技能：<br>‧ 學到狼人／黑狼王：接下來夜晚可選一晚多開一刀（整局限一次），這一刀不可被守衛（含機械狼學到的守衛）或女巫解藥阻擋；一般守衛每晚只能擋下一刀，若這一刀與狼隊當晚的正常狼刀同時命中同一人，守衛只能擋住其中一刀，該玩家仍會因為另一刀死亡，隔天公布死亡。學到黑狼王額外還多了「被狼刀或被票出局時可以開槍帶人（被毒則不行）」。<br>‧ 學到平民：沒有主動技能。<br>‧ 學到女巫：只有一瓶毒藥（沒有解藥），整局限一次。<br>‧ 學到通靈師：每晚可查驗一名玩家的具體身份。<br>‧ 學到獵人：出局（夜槍或白天槍）時可開槍帶人。<br>‧ 學到守衛：除一般守衛功能之外，還能抵擋女巫毒與夜槍（獵人/黑狼王被狼刀淘汰後開槍帶人）；但守護與真守衛一樣仍會跟女巫同守同救「奶穿」死亡，而且只要成功擋到任一種傷害（無論最終是否因奶穿而死），這個技能就視為用畢，之後不能再守。<br><strong>帶刀手勢：</strong>當其餘狼人同伴全部出局時，機械狼開始獨自帶刀殺人。<br><strong>自刀自爆：</strong>可以被隊友自刀；全程不可自己自爆（含警長競選期間自爆吞警徽）。<br><span style="color:var(--seer);font-size:12px;">⚡ 通常與通靈師搭配出現</span>'},
  nightmare: {icon:'😈', name:'夢魘',   team:'wolf', teamLabel:'狼人陣營', desc:'<strong>恐懼：</strong>每晚在狼人行動前先發動技能，恐懼一名玩家，使其當晚無法發動夜間技能。若恐懼到狼隊友，狼人當晚不得殺人。<br><strong>限制：</strong>不能連續兩晚恐懼同一人，不可自爆、自刀。首夜與狼隊互不見面，可能誤恐懼到隊友。<br><span style="color:var(--seer);font-size:12px;">⚡ 通常與攝夢人搭配出現</span>'},
  wolfbrother_e:{icon:'👴', name:'狼兄', team:'wolf', teamLabel:'狼人陣營', desc:'<strong>首夜相認：</strong>與狼弟優先睜眼互相確認身份，隨後狼弟先閉眼，狼兄再與其餘狼人一同睜眼執行狼刀。<br><strong>陣亡效果：</strong>狼兄以任何方式（票出、毒殺、被殺等）陣亡後，下一晚狼弟將「覺醒」，必須殺一人復仇。<br><strong>自刀自爆：</strong>狼兄可以被隊友自刀，但不可以自己自爆（含警長競選期間自爆吞警徽）。<br><span style="color:var(--seer);font-size:12px;">⚡ 常見板子搭配：黑市商人＋狼兄狼弟——狼弟覺醒前形同隱狼，黑市商人若誤與其交易會直接失敗身亡</span>'},
  wolfbrother_y:{icon:'👦', name:'狼弟', team:'wolf', teamLabel:'狼人陣營', desc:'<strong>平時不進狼窩：</strong>狼兄尚存活時，狼弟不參與狼人商討殺人，且被預言家查驗顯示為好人。<br><strong>覺醒復仇：</strong>狼兄陣亡後的第一個夜晚，狼弟單獨睜眼，必須擊殺一名玩家（不可空刀），此後預言家查驗才會顯示狼人。<br><strong>加入狼窩：</strong>覺醒夜之後的下一晚起，狼弟才與其餘狼人一同睜眼執行狼刀（覺醒當晚仍不入狼窩）。<br><strong>覺醒時機：</strong>狼兄白天被票出局，當晚天黑狼弟就能立刻覺醒復仇；但狼兄是晚上被女巫毒死的話，因為死亡要到隔天天亮才公布，狼弟要等到「下一晚」才能覺醒——女巫毒殺狼兄的當晚，就算預言家在女巫之後查驗狼弟，仍會顯示好人（金水），要到狼弟真正覺醒的那一晚起，查驗狼弟才會顯示狼人。<br><strong>帶刀手勢：</strong>狼弟每晚睜眼都要比兩個手勢——「技能使用狀況」（復仇刀，只有覺醒那一晚比讚，其餘每晚都是倒讚）跟「今晚的帶刀手勢」（只看狼弟以外的狼隊成員是否已經全滅，跟狼弟自己有沒有正式加入狼窩無關——就算是狼兄剛陣亡、狼弟正要覺醒的那一晚，只要其餘狼隊友也全滅了，帶刀手勢照樣比讚）。帶刀手勢比讚時，狼弟帶的就是原本「狼人睜眼」要選的那把正常狼刀（不是額外多一刀），可以當下直接選人，也可以留到「狼人睜眼」步驟再殺；覺醒當晚若同時符合帶刀條件，復仇刀跟正常狼刀是分開的兩刀，當晚可以兩刀都出。<br><strong>自刀自爆：</strong>狼弟可以被隊友自刀，也可以自己自爆（含警長競選期間自爆吞警徽）。'},
  // Good - villager
  villager: {icon:'🧑‍🌾',name:'平民',  team:'good', teamLabel:'好人陣營', desc:'沒有特殊技能，靠發言與推理找出狼人。白天投票是唯一武器。'},
  fool:     {icon:'🃏', name:'傻瓜', team:'good', teamLabel:'神職（特殊）', desc:'<strong>本局採用哪一種規則，由法官在開局選角時用切換鈕決定：</strong><br>'
    +'<strong>🔺 要追刀（預設）：</strong>白天被投票出局時，可以翻牌自證身分，免於淘汰、留在場上繼續發言，但翻牌之後每一天都只能發言、不能再參與投票（不管一般投票還是 PK 投票）。狼隊若想達成「屠神」勝利條件，晚上必須額外對傻瓜補刀殺死他才算數——傻瓜這時候要算進神職人數裡。<br>'
    +'<strong>🔻 不需追刀：</strong>傻瓜被投票出局時直接淘汰、不能留在場上，沒有翻牌自證的機制；狼隊「屠神」不需要特地在夜裡殺死傻瓜。<br>'
    +'<strong>對夜晚攻擊沒有免疫：</strong>不論哪種規則，被狼刀或女巫毒死時都跟一般玩家一樣立即死亡；翻牌留場的效果只對「要追刀」規則下的「白天被投票出局」有效。'},
  hybrid:   {icon:'🧬', name:'混血兒', team:'good', teamLabel:'好人陣營（特殊）', desc:'<strong>選擇支持對象：</strong>第一晚睜眼選擇一位玩家作為支持對象（不能選自己），此後不再有夜間動作。<br><strong>勝利條件：</strong>與支持對象的勝利陣營相同，但混血兒自己不會被告知對方是好人還是狼人，需自行從發言判斷。<br><strong>對外表現：</strong>被預言家查驗永遠顯示為好人（金水）；在人數統計與「屠民」判定上視為一般平民——狼隊若要屠民，仍必須刀死混血兒，就算他其實支持狼隊也一樣。'},
  cupid:    {icon:'💘', name:'邱比特', team:'good', teamLabel:'特殊（陣營依情侶配對而定，不屬於神職也不屬於平民）', desc:'<strong>第一夜指定情侶：</strong>整局唯一的一次行動——第一晚睜眼指定兩名玩家（可以鏈自己）成為情侶，隨後這兩人睜眼互相確認彼此身份（但不知道誰是邱比特、也不知道對方陣營）。<br><strong>查驗：</strong>被預言家查驗永遠顯示為好人（金水）。<br><strong>人人鏈：</strong>兩人都是好人，邱比特勝利條件與好人相同。<br><strong>狼狼鏈：</strong>兩人都是狼人，邱比特勝利條件與狼人相同——但邱比特永遠不會帶狼刀、不參與狼人殺人決策，好人陣營要獲勝，除了原本的條件，也必須連邱比特一起淘汰。<br><strong>人狼鏈：</strong>一人好人一人狼人時，邱比特與這對情侶獨立成為第三方陣營，邱比特本人也永遠是第三方一員。第三方需屠光除自己以外的所有玩家才算獲勝；若第三方存活人數「多於」場上其餘存活人數，直接判定第三方獲勝（例如第三方三人都在場，需要 3:2 才算獲勝；打平，例如 3:3，遊戲尚未結束）。狼人與好人陣營除了原本各自的勝利條件，也都必須連同第三方（含邱比特）一起淘汰才算獲勝。<br><strong>殉情：</strong>情侶其中一人死亡（不論死因），另一人立刻跟著殉情死亡，殉情者原本的技能不會發動（例如殉情者是獵人也無法開槍）。<br><strong>狼刀一致：</strong>此板子狼隊當晚討論後刀型必須一致，若刀型不一致則當晚強制變成平安夜（建議討論時間約20秒）。'},
  thief:    {icon:'🎴', name:'盜賊', team:'good', teamLabel:'特殊（最終陣營依選擇的角色而定，開局前不屬於神職也不屬於平民）', desc:'<strong>整局第一個睜眼：</strong>比邱比特、夢魘還早，是全場第一個行動的角色。遊戲開始前，會多準備兩張額外的身分牌（例如12人局準備14張牌），這兩張牌不發給任何玩家，只保留給盜賊在第一夜選擇。<br><strong>選擇身分：</strong>法官在盜賊睜眼時，把手上另外準備的兩張候選身分告訴系統，用「大字報」的方式攤開讓盜賊看到這兩個角色，盜賊選一個成為自己最終真正的身分（另一張則直接「埋」掉，整局都不會有人是這個身分）。<br><strong>強制選狼：</strong>兩張候選身分中如果有狼人陣營的角色，盜賊「一定要」選擇狼人遊玩——這也讓盜賊多了一個資訊：場上「沒有」出現另一張候選卡代表的那個身分。正常設置下不會出現「兩張候選都是狼人」的情況。<br><strong>選完之後：</strong>盜賊立刻變成所選的身分，從這一夜開始完全依照新身分的規則遊玩（若變成狼人，之後與狼隊一起睜眼殺人；若變成神職，之後在該神職的步驟行動），原本的「盜賊」身分只在選擇之前短暫存在。'},
  // Good - gods
  seer:     {icon:'🔮', name:'預言家', team:'good', teamLabel:'神職', desc:'每晚查驗一名玩家，得知「好人」或「狼人」。<br>可以重複查驗已經查過的號碼；不能查驗已經死亡的號碼。'},
  witch:    {icon:'🧪', name:'女巫',   team:'good', teamLabel:'神職', desc:'<strong>解藥：</strong>救活當晚被狼殺的玩家（整局限一次）。<br><strong>毒藥：</strong>毒殺任意玩家（整局限一次）。<br>兩瓶藥沒有時間限制，整局中任何一晚都能使用；但同一晚只能擇一使用，不能同時用解藥又用毒藥，且不能自救。'},
  hunter:   {icon:'🔫', name:'獵人',   team:'good', teamLabel:'神職', desc:'被狼刀淘汰（夜槍）或被投票淘汰（白天槍）時，都可以開槍帶走一名玩家（留空不帶）。<strong>以下情況無法發動：被女巫毒殺；被狼美人發動技能殉情帶走；被白狼王發動自爆技能帶走。</strong>'},
  guard:    {icon:'🛡️', name:'守衛',   team:'good', teamLabel:'神職', desc:'每晚可以選擇一名玩家守護（也可以空守），守過的號碼可以再次守，但不能連續兩晚守同一人。<br>守衛擋得住狼刀，也擋得住當晚的夜槍（獵人／黑狼王被狼刀淘汰後開槍帶人）——同一個盾只能擋下一刀或一槍。<br>守衛無法阻擋女巫毒藥。<br><strong>奶穿：</strong>若同一晚守衛的守護與女巫的解藥同時作用在同一名玩家身上，該玩家仍會死亡（雙重保護互相抵銷）。<br><strong>機械狼額外一刀：</strong>一般守衛每晚只能擋下一刀狼刀；若機械狼「學到狼人／黑狼王」後開出的額外一刀，跟狼隊當晚的正常狼刀同時命中同一人，守衛守不住（額外一刀本來就不可被守護阻擋），該玩家隔天仍會死亡。'},
  dreamcatcher:{icon:'🌙',name:'攝夢人',team:'good',teamLabel:'神職', desc:'<strong>守護/擊殺：</strong>主動技:每晚都必須選擇一位玩家成為夢遊者使其進入夢遊狀態。夢遊者將不會死於攝夢人以外的夜間技能(狼刀、巫毒、夜槍)，若攝夢人連續兩晚夢同一位玩家，則夢遊者會因此死於夢裡。<br>被動技:若攝夢人在夜裡死亡，則夢遊者會一同死去。'},
  knight:   {icon:'⚔️', name:'騎士',   team:'good', teamLabel:'神職', desc:'<strong>決鬥：</strong>白天發言階段可隨時翻牌宣告決鬥，指定一名玩家對決。<br>對方是狼→法官宣布「X號是狼人，X號淘汰」，對方直接出局，跳過投票直接進入黑夜。<br>對方是好人→法官宣布「X號是好人，騎士以死謝罪」，騎士淘汰，白天繼續發言與投票。<br><strong>限制：</strong>若決鬥對象是黑狼王／狼美人／白狼王，因決鬥出局不會發動其技能（不能開槍帶人、魅惑對象不會殉情）。'},
  magician: {icon:'🎩', name:'魔術師', team:'good', teamLabel:'神職', desc:'<strong>交換號碼：</strong>每晚睜眼後最早行動，交換兩個號碼牌（也可以不換）。已交換過的號碼不能再被交換，不能交換已死亡的號碼。<br><strong>換流效果：</strong>當晚所有以「號碼」為目標的夜間技能，實際作用對象都會被改成對方號碼——換 A、B 後，狼刀A會刀到B、女巫毒A會毒到B、預言家查A會查到B、守衛守A會守到B……以此類推。<br><strong>夜槍例外：</strong>獵人被狼刀（夜槍）帶走的目標仍屬於夜間作用、一樣會被換流影響；但若獵人是白天被投票出局（白天槍），此時已經是白天，換流只對夜間作用有效，不受影響。'},
  demonhunter:{icon:'🗡️',name:'獵魔人',team:'good',teamLabel:'神職', desc:'<strong>狩獵：</strong>第二晚起狩獵一名玩家，對方是狼則狼死，對方是好人則自己死。<strong>免疫女巫毒藥。</strong>'},
  gravkeeper:{icon:'⚰️',name:'守墓人', team:'good', teamLabel:'神職', desc:'<strong>得知遺身：</strong>第二晚起得知前一個白天被投票處死的玩家是狼人還是好人（法官比讚＝好人／倒讚＝狼人）。<br><span style="color:var(--seer);font-size:12px;">⚡ 通常與石像鬼搭配出現</span>'},
  medium:   {icon:'👁️', name:'通靈師', team:'good', teamLabel:'神職', desc:'<strong>查驗具體身份：</strong>每晚查驗一名玩家的具體角色（而非單純好人／狼人）。可以重複查驗已查過的號碼；不能查驗已死亡的號碼。<br><strong>查驗機械狼：</strong>若機械狼尚未學習技能，顯示為「機械狼」；若已學習，顯示其學到的具體身份。<br><span style="color:var(--seer);font-size:12px;">⚡ 通常與機械狼搭配出現</span>'},
  blackmarket:{icon:'💰',name:'黑市商人',team:'good',teamLabel:'神職', desc:'<strong>黑市交易：</strong>整局限一次，任一晚選擇一名玩家進行交易，給予「預言家查驗」「女巫毒藥」「獵人獵槍」三選一的技能。<br><strong>交易成功：</strong>若對象是好人，成為「幸運兒」，從下一晚（查驗／毒藥）或下一個白天（獵槍）起可使用該技能。<br><strong>交易失敗：</strong>若對象是狼人，交易失敗，黑市商人於次日死亡，該狼人不會知道自己曾被選中。<br><span style="color:var(--seer);font-size:12px;">⚡ 帶出「幸運兒」附加身分，常見板子搭配「狼兄狼弟」——覺醒前的狼弟形同隱狼，若黑市商人誤與其交易會直接失敗身亡</span>'},
  // Special
  sheriff:  {icon:'🏅', name:'警長',   team:'special', teamLabel:'附加身分', desc:'<strong>投票 1.5 票。</strong>可決定發言順序，擁有歸票位。死亡時可傳警長牌或撕毀。'
    +'<br><br><strong>競選流程：</strong>第一夜結束、天亮前先問是否上警，候選人起立 → 抽政見發表順序，依序發言 → 發言結束後可退水 → 未上警的玩家投票，最高票者當選警長 → 警長宣布警左／警右決定發言起始方向。'
    +'<br><br><strong>平票怎麼處理？</strong><ul>'
    +'<li>如果最高票是 0 票（沒有人投票給任何候選人），本局無警長。</li>'
    +'<li>如果最高票是非 0 的平票，平票的玩家進行新一輪發言 PK，然後重新投票，得票較多者當選警長；如果 PK 之後再度平票，本局不再有警長。</li>'
    +'<li>狼人可以在競選環節的任何時間點自爆；狼人自爆會直接吞掉警徽，本局不再有警長。</li></ul>'
    +'<strong>PK 平票後還能退水嗎？</strong> 原則上不行——進入投票環節、出現平票之後，參與 PK 的候選人不能再退水。'},
  luckyone: {icon:'🍀', name:'幸運兒', team:'special', teamLabel:'附加身分', desc:'由黑市商人交易產生，並非開局直接分配的身分。獲得預言家查驗、女巫毒藥或獵人獵槍其中一項技能，自取得的下個夜晚（查驗／毒藥）或下個白天（獵槍）起可以使用。<br>若獲得查驗，每晚都可查；若獲得巫毒及獵槍，只能使用一次。'},
};

const WOLF_ROLES = ['wolf','wolfking','whitewolf','wolfbeauty','evilknight','gargoyle','bloodmoon','mechanicalwolf','nightmare','wolfbrother_e','wolfbrother_y'];
const VIL_ROLES  = ['villager','hybrid'];
const GOD_ROLES  = ['seer','witch','hunter','guard','dreamcatcher','knight','magician','demonhunter','gravkeeper','medium','blackmarket','fool'];
const SPECIAL_ROLES = ['sheriff','luckyone','cupid','thief'];

// 單身分限定的「板子」預設：每個板子固定包含一組常見搭配的特殊角色（狼隊或神職），
// 選定板子後，法官還能依人數自由調整基本角色：
// 狼隊【狼人、黑狼王、平民】不限一個；神職／混血兒【混血兒、預言家、女巫、獵人、守衛】各自最多一個。
const JG_BOARD_PRESETS = {
  mechwolf_medium:         {label:'機械狼+通靈師',   fixed:{mechanicalwolf:1, medium:1}},
  dreamcatcher_nightmare:  {label:'攝夢人+夢魘',     fixed:{dreamcatcher:1, nightmare:1}},
  blackmarket_wolfbrothers:{label:'黑市商人+狼兄狼弟', fixed:{blackmarket:1, wolfbrother_e:1, wolfbrother_y:1}},
  wolfbeauty_knight:       {label:'狼美人+騎士',     fixed:{wolfbeauty:1, knight:1}},
  gargoyle_gravkeeper:     {label:'石像鬼+守墓人',   fixed:{gargoyle:1, gravkeeper:1}},
  bloodmoon_demonhunter:   {label:'血月使者+獵魔人', fixed:{bloodmoon:1, demonhunter:1}},
  magician_wolfking:       {label:'魔術師+黑/白狼王',     fixed:{magician:1}, wolfkingDefault:'wolfking'},
  hybrid_wolfking_bloodmoon:{label:'混血兒+黑/白狼王+血月', fixed:{hybrid:1, bloodmoon:1}, wolfkingDefault:'wolfking'},
  evilknight_guard:        {label:'惡靈騎士+守衛',   fixed:{evilknight:1, guard:1}},
  cupid_board:             {label:'邱比特（情侶板，建議10或13人）', fixed:{cupid:1}},
  cupid_thief_board:       {label:'邱比特+盜賊（不含傻瓜）', fixed:{cupid:1, thief:1}, wolfkingDefault:'wolfking'},
  thief_board:             {label:'盜賊（開局前需另外多準備2張候選身分牌）', fixed:{thief:1}},
  thief_cupid_board:       {label:'盜賊+邱比特+傻瓜（建議12人警長局）', fixed:{thief:1, cupid:1, fool:1}, wolfkingDefault:'wolfking'},
};
// 板子的基本角色只開放這兩組：狼隊（不限一個，黑狼王／白狼王彈性二選一）、神職＋混血兒（各自最多一個）
const JG_PRESET_WOLF_BASE=['wolf','wolfking','whitewolf'];
// 混血兒不放進這個通用清單：只有在板子本身就固定包含混血兒（見 JG_BOARD_PRESETS）時，
// 才會以「鎖定」格子出現在該板子裡，不會讓混血兒出現在其他跟他無關的板子讓大家誤選。
const JG_PRESET_GOD_BASE=['seer','witch','hunter','guard'];

// Role picker state: {roleId: count}
let jgRolePick = {wolf:2, villager:2, seer:1, witch:1};
let jgBoardPreset='custom'; // 'custom' = 自訂角色（原本的完整選角畫面）；其餘 = JG_BOARD_PRESETS 的 key
// 傻瓜規則：'chase'＝要追刀（預設，翻牌留場但不能投票，狼隊屠神必須額外夜刀補殺傻瓜才算數）；
// 'nochase'＝不需追刀（傻瓜被放逐時直接出局，沒有翻牌留場機制，屠神不需要另外殺他）。
// 開局設定畫面選了傻瓜之後才會顯示切換用的膠囊按鈕，見 jgRenderFoolModeUI／jgSetFoolChaseMode。
let jgFoolChaseMode='chase';
// 「屠神」勝負判定用的神職清單：只有「要追刀」規則才把傻瓜算進去（狼隊必須連傻瓜一起殺光才算屠神）；
// 「不需追刀」規則傻瓜被放逐就直接出局，不需要、也不會被當成屠神判定的一員。
function jgAllGodsForWin(){
  const base=['seer','witch','hunter','guard','dreamcatcher','knight','magician','demonhunter','gravkeeper','medium','blackmarket'];
  if(jgFoolChaseMode==='chase') base.push('fool');
  return base;
}

function renderRulesCards(){
  function makeCard(id){
    const r=ALL_ROLES[id]; if(!r) return '';
    const bCls=r.team==='wolf'?'team-wolf':'team-good';
    return `<div class="rcol" id="role-${id}">
      <div class="rcol-hd" onclick="toggleRcol(this)">
        <span class="rcol-icon">${r.icon}</span>
        <span class="rcol-name">${r.name}</span>
        <span class="rcol-badge ${bCls}">${r.teamLabel}</span>
        <span class="rcol-arrow">▶</span>
      </div>
      <div class="rcol-body">${r.desc}</div>
    </div>`;
  }
  const wEl=document.getElementById('rules-wolf-list');
  const vEl=document.getElementById('rules-vil-list');
  const gEl=document.getElementById('rules-god-list');
  const sEl=document.getElementById('rules-special-list');
  if(wEl) wEl.innerHTML=WOLF_ROLES.map(makeCard).join('');
  if(vEl) vEl.innerHTML=VIL_ROLES.map(makeCard).join('');
  if(gEl) gEl.innerHTML=GOD_ROLES.map(makeCard).join('');
  if(sEl) sEl.innerHTML=SPECIAL_ROLES.map(makeCard).join('');
}

function toggleRcol(hd){
  hd.classList.toggle('open');
  hd.nextElementSibling.classList.toggle('open');
}

// 板子介紹裡的角色連結：跳到下方對應角色卡片並自動展開
function jumpToRole(id){
  const card=document.getElementById('role-'+id);
  if(!card) return;
  const hd=card.querySelector('.rcol-hd');
  const body=card.querySelector('.rcol-body');
  if(hd && !hd.classList.contains('open')){
    hd.classList.add('open');
    body.classList.add('open');
  }
  card.scrollIntoView({behavior:'smooth', block:'center'});
  card.style.transition='background-color 0.3s';
  card.style.backgroundColor='var(--bg3)';
  setTimeout(()=>{ card.style.backgroundColor=''; }, 900);
}

// ── Role Picker ──
// 預設配置盡量抓 1:1:1（狼／神／民）比例：狼人以基本狼人為主，神職依序（預言家／女巫／獵人／守衛）補上；
// 狼人陣營能力較強，人數無法整除 3 時，多出來的名額優先分給平民（不會讓狼人數量更多），
// 法官仍可在畫面上自行調整每個角色的數量。
const DEFAULT_COMP = {
  6:{wolf:2,villager:2,seer:1,witch:1},
  7:{wolf:2,villager:3,seer:1,witch:1},
  8:{wolf:2,villager:4,seer:1,witch:1},
  9:{wolf:3,villager:3,seer:1,witch:1,hunter:1},
  10:{wolf:3,villager:4,seer:1,witch:1,hunter:1},
  11:{wolf:3,villager:5,seer:1,witch:1,hunter:1},
  12:{wolf:4,villager:4,seer:1,witch:1,hunter:1,guard:1},
  13:{wolf:4,villager:5,seer:1,witch:1,hunter:1,guard:1},
  14:{wolf:4,villager:6,seer:1,witch:1,hunter:1,guard:1},
};

// 雙身分模式的預設配置（key＝玩家人數 4～7，角色數＝人數×2；僅供參考，法官可自行調整）
const DEFAULT_COMP_DUAL = {
  4:{wolf:2,villager:3,seer:1,witch:1,hunter:1},                       // 共 8 個角色
  5:{wolf:2,villager:4,seer:1,witch:1,hunter:1,guard:1},                // 共 10 個角色
  6:{wolf:3,villager:4,seer:1,witch:1,hunter:1,guard:1,knight:1},       // 共 12 個角色
  7:{wolf:3,villager:6,seer:1,witch:1,hunter:1,guard:1,knight:1},       // 共 14 個角色
};

function renderRolePicker(containerId, pickState, total, onUpdate){
  const el=document.getElementById(containerId);
  if(!el) return;
  const isDual=jgSetupDualMode;
  const unitLabel=isDual?'個角色':'人';
  const wolves=isDual?WOLF_ROLES.filter(r=>JG_DUAL_ROLE_POOL.includes(r)):WOLF_ROLES;
  const gods=isDual?GOD_ROLES.filter(r=>JG_DUAL_ROLE_POOL.includes(r)):GOD_ROLES;
  const wolfCount=Object.entries(pickState).filter(([k])=>wolves.includes(k)).reduce((s,[,v])=>s+v,0);
  const godCount=Object.entries(pickState).filter(([k])=>gods.includes(k)).reduce((s,[,v])=>s+v,0);
  const vilCount=pickState.villager||0;
  const hybridCount=isDual?0:(pickState.hybrid||0); // 混血兒不開放雙身分模式選用
  const cupidCount=isDual?0:(pickState.cupid||0); // 邱比特不開放雙身分模式選用
  const thiefCount=isDual?0:(pickState.thief||0); // 盜賊不開放雙身分模式選用
  // 注意：傻瓜現在算在 GOD_ROLES 裡，godCount 已經含傻瓜的數量了，這裡不再另外加一次，
  // 不然選了傻瓜的話，總數會被重複計算多算一個。
  const totalPicked=wolfCount+godCount+vilCount+hybridCount+cupidCount+thiefCount;

  let html=`<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">
    目前：${totalPicked}/${total} ${unitLabel}
    ${totalPicked!==total?'<span style="color:#922418;font-weight:700;">（需選滿 '+total+' '+unitLabel+'）</span>':'<span style="color:#2a601c;">✓</span>'}
  </div>`;

  // Wolf roles
  html+='<div style="font-size:11px;font-weight:700;color:var(--wolf);margin:6px 0 4px;letter-spacing:0.5px;">狼人陣營</div>';
  html+='<div class="rpick-grid">';
  wolves.forEach(id=>{
    const r=ALL_ROLES[id]; const cnt=pickState[id]||0;
    html+=`<div class="rpick${cnt>0?' sel':''}" onclick="rpickTap('${containerId}','${id}')">
      <span class="rp-ico">${r.icon}</span>
      <div class="rp-nm">${r.name}</div>
      ${cnt>0?'<span class="rp-cnt">×'+cnt+'</span>':''}
    </div>`;
  });
  html+='</div>';

  // Villager
  html+='<div style="font-size:11px;font-weight:700;color:var(--vil);margin:8px 0 4px;letter-spacing:0.5px;">平民</div>';
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html+=`<button onclick="rpickAdj('${containerId}','villager',-1)" style="width:36px;height:36px;padding:0;margin:0;font-size:20px;border-radius:50%;">−</button>`;
  html+=`<div style="font-size:22px;font-weight:800;min-width:30px;text-align:center;">${vilCount}</div>`;
  html+=`<button onclick="rpickAdj('${containerId}','villager',1)" style="width:36px;height:36px;padding:0;margin:0;font-size:20px;border-radius:50%;">＋</button>`;
  html+=`<span style="font-size:13px;color:var(--text2);">平民</span></div>`;

  // 混血兒／邱比特／盜賊（特殊身分；不開放雙身分模式）。傻瓜現在歸在下面的「神職」區塊裡
  // 一起顯示（見 GOD_ROLES 加入了 fool），不再在這裡單獨列一格。
  if(!isDual){
    const hy=ALL_ROLES.hybrid;
    const cp=ALL_ROLES.cupid;
    const tf=ALL_ROLES.thief;
    html+='<div style="font-size:11px;font-weight:700;color:var(--cupid);margin:6px 0 4px;letter-spacing:0.5px;">特殊身分</div>';
    html+='<div class="rpick-grid">';
    html+=`<div class="rpick${hybridCount>0?' sel':''}" onclick="rpickTap('${containerId}','hybrid')">
      <span class="rp-ico">${hy.icon}</span>
      <div class="rp-nm">${hy.name}</div>
      ${hybridCount>0?'<span class="rp-cnt">✓</span>':''}
    </div>`;
    html+=`<div class="rpick${cupidCount>0?' sel':''}" onclick="rpickTap('${containerId}','cupid')">
      <span class="rp-ico">${cp.icon}</span>
      <div class="rp-nm">${cp.name}</div>
      ${cupidCount>0?'<span class="rp-cnt">✓</span>':''}
    </div>`;
    html+=`<div class="rpick${thiefCount>0?' sel':''}" onclick="rpickTap('${containerId}','thief')">
      <span class="rp-ico">${tf.icon}</span>
      <div class="rp-nm">${tf.name}</div>
      ${thiefCount>0?'<span class="rp-cnt">✓</span>':''}
    </div>`;
    html+='</div>';
    if(thiefCount>0){
      html+='<div class="info" style="font-size:12px;margin-top:4px;">有盜賊時，因為開局前要多準備 2 張候選身分牌（例如 12 人局要選滿 14 個角色），所以下面總共要選的角色數會自動變成「人數+2」，這多選的 2 個角色就是盜賊的候選池，實際是哪兩張則由開局前的「盜賊候選轉盤」隨機決定（只有法官看得到）。</div>';
    }
  }

  // God roles
  // 通靈師會顯示比預言家更完整的查驗資訊（含機械狼學到的身份），兩者效果重疊，
  // 所以其中一個被選了之後，另一個就不再顯示讓大家選，避免同時出現在同一場。
  const seerCnt=pickState.seer||0, mediumCnt=pickState.medium||0;
  html+='<div style="font-size:11px;font-weight:700;color:var(--seer);margin:6px 0 4px;letter-spacing:0.5px;">神職（點選加入，再點移除）</div>';
  html+='<div class="rpick-grid">';
  gods.forEach(id=>{
    if(id==='seer'&&mediumCnt>0) return;
    if(id==='medium'&&seerCnt>0) return;
    const r=ALL_ROLES[id]; const cnt=pickState[id]||0;
    html+=`<div class="rpick${cnt>0?' sel':''}" onclick="rpickTap('${containerId}','${id}')">
      <span class="rp-ico">${r.icon}</span>
      <div class="rp-nm">${r.name}</div>
      ${cnt>0?'<span class="rp-cnt">✓</span>':''}
    </div>`;
  });
  html+='</div>';
  if(mediumCnt>0) html+='<div style="font-size:11px;color:var(--text3);margin:-4px 0 8px;">已選通靈師，預言家不會重複出現</div>';
  if(seerCnt>0) html+='<div style="font-size:11px;color:var(--text3);margin:-4px 0 8px;">已選預言家，通靈師不會重複出現</div>';
  el.innerHTML=html;
}

// Store reference for role picker (jg = 法官の助手)
const RPICK_STATE = {
  'jg-role-picker': ()=>jgRolePick,
};
const RPICK_TOTAL = {
  'jg-role-picker': ()=>{
    const isDual=jgSetupDualMode;
    const min=isDual?4:6, max=isDual?7:14;
    const n=Math.min(max,Math.max(min,parseInt(document.getElementById('jg-count')?.value)||min));
    // 有盜賊時，開局前要多準備 2 張候選身分牌，要選滿的角色總數是「玩家人數 + 2」。
    const hasThief=!isDual&&((jgRolePick&&jgRolePick.thief)>0);
    return isDual?n*2:(hasThief?n+2:n);
  },
};

function rpickTap(cid, id){
  const state=jgRolePick;
  const isWolf=WOLF_ROLES.includes(id);
  const isGod=GOD_ROLES.includes(id);
  if(id==='hybrid'||id==='cupid'||id==='thief'||id==='fool'){
    // 混血兒／邱比特／盜賊／傻瓜：toggle（max 1，不開放雙身分模式）
    state[id]=(state[id]||0)>0?0:1;
  } else if(isGod){
    // gods: toggle (max 1)
    state[id]=(state[id]||0)>0?0:1;
  } else if(isWolf){
    // wolf: cycle 0→1→...→max→0 (狼兄/狼弟 are a fixed pair, capped at 0/1；其餘狼人角色上限拉高到 6，
    // 才夠應付 13、14 人局常見的 4～5 隻狼)
    const max=(id==='wolfbrother_e'||id==='wolfbrother_y')?1:6;
    state[id]=((state[id]||0)+1)%(max+1);
  }
  refreshPicker(cid);
  jgUpdateComp();
}

function rpickAdj(cid, id, delta){
  const state=jgRolePick;
  state[id]=Math.max(0,(state[id]||0)+delta);
  refreshPicker(cid);
  jgUpdateComp();
}

function refreshPicker(cid){
  const total=RPICK_TOTAL[cid]();
  const state=jgRolePick;
  renderRolePicker(cid, state, total, null);
}

function getPickComp(state){
  const comp={};
  Object.entries(state).forEach(([k,v])=>{ if(k!=='_init'&&v>0) comp[k]=v; });
  return comp;
}

// ── 板子選擇（單身分限定）──
// 切換板子（含切回「自訂角色」）時呼叫；重新套用該板子的預設配置。
function jgSetBoardPreset(val){
  jgBoardPreset=val;
  const n=Math.min(14,Math.max(6,parseInt(document.getElementById('jg-count')?.value)||6));
  if(val==='custom'){
    jgRolePick=Object.assign({}, DEFAULT_COMP[n]||DEFAULT_COMP[6]);
    jgRolePick._init=true;
  } else {
    jgApplyPresetDefaults(n);
  }
  jgUpdateComp();
}

// 套用板子的預設配置：固定角色（各 1，見 JG_BOARD_PRESETS）+ 基本狼人 1 隻（讓狼隊至少有人可以刀人；
// 若板子本身已包含黑狼王，法官仍可自行把狼人調到 0，只留黑狼王）+ 其餘人數全部先填平民，
// 之後法官可依人數把平民換成神職／混血兒，或調整狼人／黑狼王數量。
function jgApplyPresetDefaults(n){
  const preset=JG_BOARD_PRESETS[jgBoardPreset];
  if(!preset) return;
  const rp={};
  Object.entries(preset.fixed).forEach(([k,v])=>{ rp[k]=v; });
  if(!rp.wolf) rp.wolf=1;
  // 板子建議的黑狼王／白狼王預設值——只是「預先選好」方便法官，不是鎖定，法官可以自由改選
  // 另一種、或直接取消都可以（見 renderPresetPicker 的黑狼王／白狼王二選一格子）。
  if(preset.wolfkingDefault&&!rp.wolfking&&!rp.whitewolf) rp[preset.wolfkingDefault]=1;

  // 盡量抓 1:1:1（狼／神／民）比例：狼人以基本狼人為主，神職依序（預言家／女巫／獵人／守衛）補上，
  // 若板子已固定通靈師，就不預設加預言家（兩者查驗效果重疊，不同時出現）。
  // 狼人陣營能力較強，人數無法整除 3 時，多出來的名額優先分給平民，不會讓狼人數量更多。
  const wolfFixedCount=Object.entries(rp).filter(([k])=>WOLF_ROLES.includes(k)).reduce((s,[,v])=>s+v,0);
  const godFixedKeys=Object.keys(rp).filter(k=>GOD_ROLES.includes(k));
  const godFixedCount=godFixedKeys.reduce((s,k)=>s+rp[k],0);

  const base=Math.floor(n/3);
  const targetWolf=base;
  const targetGod=Math.min(4, base);

  const wolfNeeded=Math.max(0, targetWolf-wolfFixedCount);
  if(wolfNeeded>0) rp.wolf=(rp.wolf||0)+wolfNeeded;

  const godPriority=['seer','witch','hunter','guard'];
  const excludeSeer=godFixedKeys.includes('medium');
  let godCount=godFixedCount;
  for(const g of godPriority){
    if(godCount>=targetGod) break;
    if(godFixedKeys.includes(g)) continue;
    if(g==='seer'&&excludeSeer) continue;
    rp[g]=(rp[g]||0)+1;
    godCount++;
  }

  const usedTotal=Object.entries(rp).filter(([k])=>k!=='villager').reduce((s,[,v])=>s+v,0);
  // 有盜賊時，開局前要多準備 2 張候選身分牌，角色總數要填滿 n+2（不是 n），
  // 這 2 個名額由後面的判斷幫忙先預填成平民，法官仍可以自由改成別的角色。
  const fillTarget=rp.thief?n+2:n;
  rp.villager=Math.max(0, fillTarget-usedTotal);
  rp._init=true;
  jgRolePick=rp;
}

// 把板子固定包含的角色畫成「鎖定」格子：跟一般選角格子長得一樣、有打勾，
// 但不能點掉（沒有 onclick），並用金色邊框＋🔒標示跟一般可選的格子區分開來。
function jgPresetLockedTileHtml(id){
  const r=ALL_ROLES[id];
  if(!r) return '';
  return '<div class="rpick sel locked" title="本板固定包含，無法取消">'
    +'<span class="rp-ico">'+r.icon+'</span><div class="rp-nm">'+r.name+'</div>'
    +'<span class="rp-lock">🔒</span></div>';
}

// 板子模式的精簡選角畫面：固定角色直接以「鎖定」格子顯示在對應陣營區塊裡（不再另外用一行文字
// 說明，避免大家補角色時看不到固定角色、以為要自己重選），狼隊【狼人、黑狼王、平民】可自由調整
// 數量；神職【預言家、女巫、獵人、守衛】各自最多一個；混血兒只有在該板子本身固定包含時才會出現。
function renderPresetPicker(){
  const el=document.getElementById('jg-preset-picker');
  if(!el) return;
  const preset=JG_BOARD_PRESETS[jgBoardPreset];
  if(!preset) return;
  const state=jgRolePick;
  const fixedKeys=Object.keys(preset.fixed);
  const fixedWolfKeys=fixedKeys.filter(k=>WOLF_ROLES.includes(k));
  const fixedGodKeys=fixedKeys.filter(k=>!WOLF_ROLES.includes(k)&&k!=='villager');
  const wolfCount=state.wolf||0;
  const vilCount=state.villager||0;

  let html='';

  html+='<div style="font-size:11px;font-weight:700;color:var(--wolf);margin:6px 0 4px;letter-spacing:0.5px;">狼人陣營</div>';
  const showWolfKingChoice=!fixedKeys.includes('wolfking')&&!fixedKeys.includes('whitewolf');
  let wolfKingTiles='';
  if(showWolfKingChoice){
    const wkOn=(state.wolfking||0)>0;
    const wwOn=(state.whitewolf||0)>0;
    wolfKingTiles='<div class="rpick'+(wkOn?' sel':'')+'" onclick="jgPresetSelectWolfKing(\'wolfking\')">'
      +'<span class="rp-ico">👑</span><div class="rp-nm">黑狼王</div>'
      +(wkOn?'<span class="rp-cnt">✓</span>':'')+'</div>'
      +'<div class="rpick'+(wwOn?' sel':'')+'" onclick="jgPresetSelectWolfKing(\'whitewolf\')">'
      +'<span class="rp-ico">🤍</span><div class="rp-nm">白狼王</div>'
      +(wwOn?'<span class="rp-cnt">✓</span>':'')+'</div>';
  }
  const wolfTiles=fixedWolfKeys.map(jgPresetLockedTileHtml).join('')+wolfKingTiles;
  if(wolfTiles){
    html+='<div class="rpick-grid" style="margin-bottom:6px;">'+wolfTiles+'</div>';
  }
  if(showWolfKingChoice) html+='<div style="font-size:11px;color:var(--text3);margin:-2px 0 6px;">黑狼王／白狼王二選一，可自由切換或都不選</div>';
  html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
    +'<button onclick="jgPresetAdjWolf(-1)" style="width:32px;height:32px;padding:0;margin:0;font-size:18px;border-radius:50%;">−</button>'
    +'<div style="font-size:18px;font-weight:800;min-width:24px;text-align:center;">'+wolfCount+'</div>'
    +'<button onclick="jgPresetAdjWolf(1)" style="width:32px;height:32px;padding:0;margin:0;font-size:18px;border-radius:50%;">＋</button>'
    +'<span style="font-size:13px;color:var(--text2);">狼人</span></div>';

  html+='<div style="font-size:11px;font-weight:700;color:var(--vil);margin:6px 0 4px;letter-spacing:0.5px;">平民</div>';
  html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
    +'<button onclick="jgPresetAdjVillager(-1)" style="width:32px;height:32px;padding:0;margin:0;font-size:18px;border-radius:50%;">−</button>'
    +'<div style="font-size:18px;font-weight:800;min-width:24px;text-align:center;">'+vilCount+'</div>'
    +'<button onclick="jgPresetAdjVillager(1)" style="width:32px;height:32px;padding:0;margin:0;font-size:18px;border-radius:50%;">＋</button>'
    +'<span style="font-size:13px;color:var(--text2);">平民</span></div>';

  html+='<div style="font-size:11px;font-weight:700;color:var(--seer);margin:6px 0 4px;letter-spacing:0.5px;">神職</div>';
  html+='<div class="rpick-grid">';
  fixedGodKeys.forEach(id=>{ html+=jgPresetLockedTileHtml(id); });
  // 通靈師（medium）與預言家（seer）查驗效果重疊，本板固定通靈師時就不再顯示預言家可選
  const excludeSeer=fixedKeys.includes('medium');
  JG_PRESET_GOD_BASE.forEach(id=>{
    if(fixedKeys.includes(id)) return; // 這個板子已經把這個角色當固定角色了，不重複顯示
    if(id==='seer'&&excludeSeer) return;
    const r=ALL_ROLES[id]; const cnt=state[id]||0;
    html+='<div class="rpick'+(cnt>0?' sel':'')+'" onclick="jgPresetToggleGod(\''+id+'\')">'
      +'<span class="rp-ico">'+r.icon+'</span><div class="rp-nm">'+r.name+'</div>'
      +(cnt>0?'<span class="rp-cnt">✓</span>':'')+'</div>';
  });
  html+='</div>';
  if(excludeSeer) html+='<div style="font-size:11px;color:var(--text3);margin:4px 0 0;">本板固定為通靈師，不會重複出現預言家</div>';

  el.innerHTML=html;
}

function jgPresetAdjWolf(delta){
  jgRolePick.wolf=Math.max(0,(jgRolePick.wolf||0)+delta);
  jgUpdateComp();
}
// 黑狼王／白狼王二選一：點選其中一個會自動清掉另一個（互斥），再點一次已選中的那個則取消選取。
function jgPresetSelectWolfKing(variant){
  const other=variant==='wolfking'?'whitewolf':'wolfking';
  const alreadyOn=(jgRolePick[variant]||0)>0;
  jgRolePick[other]=0;
  jgRolePick[variant]=alreadyOn?0:1;
  jgUpdateComp();
}
function jgPresetAdjVillager(delta){
  jgRolePick.villager=Math.max(0,(jgRolePick.villager||0)+delta);
  jgUpdateComp();
}
function jgPresetToggleGod(id){
  jgRolePick[id]=(jgRolePick[id]||0)>0?0:1;
  jgUpdateComp();
}

// ═══════════════════════════════════
// 專有名詞 (Glossary)
// ═══════════════════════════════════
const GLOSSARY_WATER=[
  {term:'金水', desc:'預言家在夜晚查驗後，查出為好人的玩家。'},
  {term:'銀水', desc:'女巫在夜晚使用解藥救的玩家。'},
  {term:'銅水', desc:'守衛在夜晚成功守護的玩家。'},
];
const GLOSSARY_SHERIFF=[
  {term:'上警', desc:'參與警長競選。'},
  {term:'退水', desc:'參與警長競選（上警）的玩家，在發言結束後或投票前主動退出競選的行為。'},
  {term:'警左／警右', desc:'警長當選後，決定當晚（或後續每次）發言／睜眼從自己的左邊或右邊的玩家開始，稱為「警左」或「警右」。'},
];
const GLOSSARY_TACTIC=[
  {term:'悍跳', desc:'狼人玩家在白天強行假冒神職身份（多指假冒預言家，即「悍跳預言家」）以爭奪警長徽章或主導發言風向。'},
  {term:'衝鋒', desc:'狼人玩家在發言與投票環節中，公開且強力地為己方悍跳的狼隊友站台、衝票，試圖將真神職或好人投票出局。'},
  {term:'倒鉤', desc:'狼人玩家選擇不幫狼隊友，反而假裝成好人，公開站邊真預言家並為其投票，藉此隱藏自身狼人身份並建立良好形象。'},
  {term:'墊飛', desc:'狼人故意以極差、極像狼人的發言去站邊真預言家，藉由讓自己顯得像狼人，來污染真預言家的金水或團隊信用，使其看起來像「狼人在幫真預言家拉票」。'},
  {term:'奶穿', desc:'守衛的守護與女巫的解藥在同一夜晚作用於同一位玩家，「同守同救」，導致該名玩家依然死亡。'},
  {term:'屠邊', desc:'狼人陣營不必殺光所有好人也能獲勝的其中一種方式：只要把「神職」全部殺光，或把「平民」全部殺光（任一邊清空），狼人就直接獲勝，不需要等到殺光全部好人。'},
];
function renderGlossary(){
  function makeTermCard(item){
    return `<div class="rcol">
      <div class="rcol-hd" onclick="toggleRcol(this)">
        <span class="rcol-name">${item.term}</span>
        <span class="rcol-arrow">▶</span>
      </div>
      <div class="rcol-body">${item.desc}</div>
    </div>`;
  }
  const wEl=document.getElementById('glossary-water-list');
  const sEl=document.getElementById('glossary-sheriff-list');
  const tEl=document.getElementById('glossary-tactic-list');
  if(wEl) wEl.innerHTML=GLOSSARY_WATER.map(makeTermCard).join('');
  if(sEl) sEl.innerHTML=GLOSSARY_SHERIFF.map(makeTermCard).join('');
  if(tEl) tEl.innerHTML=GLOSSARY_TACTIC.map(makeTermCard).join('');
}

// ── 角色與規則頁的關鍵字搜尋：比對每張卡片（板子介紹／角色／名詞）的標題與內文 ──
function rulesSearch(qRaw){
  const q=(qRaw||'').trim().toLowerCase();
  const root=document.getElementById('t-rules');
  if(!root) return;
  let anyMatch=false;
  root.querySelectorAll('.rules-section').forEach(sec=>{
    const cards=sec.querySelectorAll('.rcol');
    if(cards.length===0){ return; } // 像「勝利條件」沒有卡片，永遠顯示
    let sectionHasMatch=false;
    cards.forEach(card=>{
      const nameEl=card.querySelector('.rcol-name');
      const bodyEl=card.querySelector('.rcol-body');
      const text=((nameEl?nameEl.textContent:'')+' '+(bodyEl?bodyEl.textContent:'')).toLowerCase();
      const match=!q||text.includes(q);
      card.style.display=match?'':'none';
      if(q&&match){
        sectionHasMatch=true; anyMatch=true;
        const hd=card.querySelector('.rcol-hd');
        if(hd&&bodyEl){ hd.classList.add('open'); bodyEl.classList.add('open'); }
      } else if(!q){
        sectionHasMatch=true;
      }
    });
    sec.style.display=(q&&!sectionHasMatch)?'none':'';

    // 同時處理區塊內的第二層標題（如「神職」「警長競選」）：往下找到下一個 h2 或區塊結尾之間
    // 若完全沒有可見卡片，就把這個標題也一起藏起來，避免搜尋時留下孤零零的標題文字。
    const subHeads=sec.querySelectorAll('.rules-h2');
    subHeads.forEach(h2=>{
      let hasVisible=false;
      let el=h2.nextElementSibling;
      while(el&&!el.classList.contains('rules-h2')){
        if(el.matches('.rcol')&&el.style.display!=='none'){ hasVisible=true; }
        el.querySelectorAll&&el.querySelectorAll('.rcol').forEach(c=>{ if(c.style.display!=='none') hasVisible=true; });
        el=el.nextElementSibling;
      }
      h2.style.display=(q&&!hasVisible)?'none':'';
    });
  });
  const emptyEl=document.getElementById('rules-search-empty');
  const termEl=document.getElementById('rules-search-empty-term');
  if(emptyEl){ emptyEl.style.display=(q&&!anyMatch)?'':'none'; }
  if(termEl){ termEl.textContent=qRaw||''; }
  const toc=document.getElementById('rules-toc');
  if(toc){ toc.style.display=q?'none':''; }
}

// ═══════════════════════════════════
// 問題回報 (Issue reporting)
// ═══════════════════════════════════
// 把這兩個網址換成你自己的：GitHub repo 開好之後，issue 連結格式是
// https://github.com/你的帳號/你的repo/issues/new；Google 表單則是你建立表單後的分享連結。
// 只要其中一個有填，對應按鈕就能正常開啟；沒填的話按下去會提示尚未設定。
// 問題回報統一用這個 Google 表單收集（回覆會自動整理成一份試算表）
const REPORT_FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSdECZ_0E4aQQkQXEdQ42n-vhEI2E3lerbCLsbWnVLAkmhAPKg/viewform?usp=header';
function jgOpenReportLink(url){
  if(!url){ alert('這個回報管道還沒有設定連結，法官／開發者需要先在原始碼裡填上網址。'); return; }
  window.open(url,'_blank');
}
function jgLoadReportForm(){
  const ifr=document.getElementById('jg-report-iframe');
  if(!ifr||ifr.dataset.loaded||!REPORT_FORM_URL) return;
  const embedUrl=REPORT_FORM_URL+(REPORT_FORM_URL.includes('?')?'&':'?')+'embedded=true';
  ifr.src=embedUrl;
  ifr.dataset.loaded='1';
}

// ═══════════════════════════════════
// 攻略參考 (Guide articles)
// ═══════════════════════════════════
// 設定方式（跟「遊玩數據」抓雲端場次紀錄是同一套 Google 試算表 + 發布成 CSV 的做法）：
// 1. 開一份新的 Google 試算表，A／B 兩欄放「標題」「內文」，C 欄放「標籤」，
//    D 欄開始才放「參考網址」：C＝標籤、D＝參考網址1、E＝參考網址2、F＝參考網址3……
//    往右加多少欄都可以，程式會自動把 D 欄之後每一個有填值的欄位都當成一個參考來源依序顯示
//    （參考來源1、參考來源2…）。C 欄「標籤」沒有固定選項，打什麼字就顯示什麼字（同一個標籤
//    文字每次顏色都一樣，不同標籤文字會自動配不同顏色），留空就不會顯示標籤徽章。
//    第一列可以放「標題／內文／標籤／參考網址」當表頭（程式會自動偵測並跳過，不放表頭也沒關係）。
//    每一列 = 一篇文章，之後看到不錯的文章，就直接在試算表最下面新增一列即可。
// 2. 檔案 → 共用 → 發布到網路（File → Share → Publish to web），來源選「該工作表」、
//    格式選「逗號分隔值 (.csv)」，按發布，把產生的網址整段複製起來。
// 3. 把複製到的網址貼進下面 GUIDE_SHEET_CSV_URL 的單引號中間，存檔上傳即可。
// 4. 之後只要在試算表裡新增一列，重新整理網頁、切到「攻略參考」分頁就會抓到最新內容，
//    完全不需要再回來改這份 HTML。
// 5. 如果沒有設定試算表網址，或抓取失敗（例如網路離線、試算表還沒發布成功），
//    會改用下面 GUIDE_ARTICLES_LOCAL 這個陣列（可以直接手動在這裡加文章當作備援內容）。
//
// 內文格式（標題、內文兩欄都適用）：
// ‧ 換行：儲存格裡直接按 Enter 打成好幾行就好，存成 CSV 後會自動變成分段，不用打任何符號。
// ‧ 粗體：把想加粗的文字前後各打兩個星號，例如 **這句話很重要**，顯示出來就會變粗體。
// ‧ 其餘一律當作純文字處理（尖括號等符號會被自動跳脫），不用擔心打字打到特殊符號會把版面弄壞，
//   但也代表不能直接貼真正的 HTML 標籤進去（例如 <b>…</b> 不會生效，請一律改用 **…**）。
const GUIDE_SHEET_CSV_URL='https://docs.google.com/spreadsheets/d/e/2PACX-1vSdA5OjCfXPH9iKiVzR_WvUFCLfqAjTHJRZeU8RwhXyMNKliM5lTn8-zfqjGpYwBv7IWgNKAtVjIaWG/pub?gid=0&single=true&output=csv';
const GUIDE_ARTICLES_LOCAL=[
  // {title:'新手常見誤區整理', content:'這裡放文章內容或摘要，換行直接按 Enter，**重點**用兩個星號包起來即可。', urls:['https://example.com/article1','https://example.com/article2']},
];
let guideLoaded=false;

// 標籤說明橫向方塊：外觀沿用「遊玩數據」頁特別獎項的橫向排列（awards-strip，放不下可左右滑），
// 但說明文字直接顯示在方塊裡，不需要點擊展開；純文字、不使用 emoji。這裡是純靜態內容，
// 不用等抓試算表資料。
const GUIDE_TAG_INFO=[
  {title:'一般攻略', desc:'就是一般的攻略，主要針對各角色或操作。'},
  {title:'Y向推理', desc:'可能會有暴雷，若不想被暴雷，請先到 YouTube 搜尋該集數，在資訊欄找到本集討論的場次，先看完該場次再看 Y向推理影片＆文字整理。'},
  {title:'OCW', desc:'我看完覺得很精彩的場次，值得一看，可以直接到參考來源點選 YouTube 超連結收看。'},
];
function renderGuideTagInfo(){
  const strip=document.getElementById('guide-tag-strip');
  if(!strip) return;
  strip.innerHTML=GUIDE_TAG_INFO.map(t=>`<div class="guide-tag-card">
    <div class="gt-title">${t.title}</div>
    <div class="gt-desc">${t.desc}</div>
  </div>`).join('');
}

// 簡易 CSV 解析：處理雙引號欄位、欄位內逗號與換行
function parseGuideCsv(text){
  const rows=[]; let row=[]; let field=''; let inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){
        if(text[i+1]==='"'){ field+='"'; i++; } else { inQuotes=false; }
      } else { field+=c; }
    } else {
      if(c==='"'){ inQuotes=true; }
      else if(c===','){ row.push(field); field=''; }
      else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c==='\r'){ /* skip */ }
      else { field+=c; }
    }
  }
  if(field.length||row.length){ row.push(field); rows.push(row); }
  return rows.filter(r=>r.some(c=>c&&c.trim()));
}

// 標籤欄直接照打了什麼字顯示什麼字（不限定固定選項），留空就不顯示標籤徽章
function guideRowsToArticles(rows){
  if(!rows.length) return [];
  let start=0;
  const first=(rows[0][0]||'').trim().toLowerCase();
  if(first==='標題'||first==='title'||first==='') start=1; // 跳過標題列
  return rows.slice(start).map(r=>{
    return {
      title:(r[0]||'').trim(),
      content:(r[1]||'').trim(),
      tag:(r[2]||'').trim(),
      // D 欄開始每一欄都是一個參考網址，有填值的依序收集成陣列（可以有 1 個、3 個、10 個都行）
      urls:r.slice(3).map(u=>(u||'').trim()).filter(Boolean),
    };
  }).filter(a=>a.title);
}
// 用標籤文字本身簡單算出一個固定色相，讓不同標籤有不同顏色，但同一個標籤永遠同一個顏色
function guideTagColorStyle(tag){
  let hash=0;
  for(let i=0;i<tag.length;i++){ hash=(hash*31+tag.charCodeAt(i))>>>0; }
  const hue=hash%360;
  return `background:hsla(${hue},55%,45%,0.12);color:hsl(${hue},55%,32%);`;
}

// 把試算表打進來的純文字轉成安全的 HTML：先跳脫尖括號等符號避免版面跑掉，
// 再支援兩個簡單語法──直接按 Enter 換行會變成段落分行；用 **文字** 包住會變成粗體。
function formatGuideText(raw){
  const esc=(raw||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\n/g,'<br>');
}

let GUIDE_ALL_ARTICLES=[];
let guideActiveTag='';
function renderGuideTagFilter(articles){
  const filterEl=document.getElementById('guide-tag-filter');
  if(!filterEl) return;
  // 標籤沒有固定選項，直接從目前抓到的文章裡收集有出現過的標籤文字（依第一次出現的順序）
  const usedTags=[];
  articles.forEach(a=>{ if(a.tag&&!usedTags.includes(a.tag)) usedTags.push(a.tag); });
  if(!usedTags.length){ filterEl.style.display='none'; filterEl.innerHTML=''; return; }
  filterEl.style.display='';
  const chip=(label,val)=>{
    const style=val?guideTagColorStyle(val):'';
    const active=guideActiveTag===val?' active':'';
    return `<span class="chip clickable${active}" style="${style}" onclick="guideFilterByTag('${val.replace(/'/g,"\\'")}')">${label}</span>`;
  };
  filterEl.innerHTML=chip('全部','')+usedTags.map(t=>chip(t,t)).join('');
}
function guideFilterByTag(tag){
  guideActiveTag=tag;
  renderGuideArticles(GUIDE_ALL_ARTICLES);
}
function renderGuideArticles(articles){
  const listEl=document.getElementById('guide-list');
  const emptyEl=document.getElementById('guide-empty');
  const loadingEl=document.getElementById('guide-loading');
  if(loadingEl) loadingEl.style.display='none';
  if(!listEl) return;
  GUIDE_ALL_ARTICLES=articles||[];
  renderGuideTagFilter(GUIDE_ALL_ARTICLES);
  const shown=guideActiveTag?GUIDE_ALL_ARTICLES.filter(a=>a.tag===guideActiveTag):GUIDE_ALL_ARTICLES;
  if(!shown||!shown.length){
    listEl.innerHTML='';
    if(emptyEl) emptyEl.style.display='';
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  listEl.innerHTML=shown.map(a=>{
    // 相容舊格式的單一 url 欄位，同時支援新的多網址 urls 陣列
    const urls=(a.urls&&a.urls.length)?a.urls:(a.url?[a.url]:[]);
    const linkHtml=urls.length?'<br><br>'+urls.map((u,i)=>{
      const safeUrl=u.replace(/"/g,'&quot;');
      const label=urls.length>1?`參考來源${i+1}`:'參考來源';
      return `<a class="role-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:4px;">→ ${label}</a>`;
    }).join(''):'';
    const tagHtml=a.tag?`<span class="guide-tag" style="${guideTagColorStyle(a.tag)}">${formatGuideText(a.tag)}</span>`:'';
    return `<div class="rcol">
      <div class="rcol-hd" onclick="toggleRcol(this)">
        <span class="guide-hd-main"><span class="rcol-icon">📝</span>${tagHtml}</span>
        <span class="rcol-name">${formatGuideText(a.title)}</span>
        <span class="rcol-arrow">▶</span>
      </div>
      <div class="rcol-body">${formatGuideText(a.content)}${linkHtml}</div>
    </div>`;
  }).join('');
}

async function loadGuideArticles(){
  if(guideLoaded) return;
  guideLoaded=true;
  if(!GUIDE_SHEET_CSV_URL){
    renderGuideArticles(GUIDE_ARTICLES_LOCAL);
    return;
  }
  try{
    const res=await fetch(GUIDE_SHEET_CSV_URL);
    if(!res.ok) throw new Error('fetch failed');
    const text=await res.text();
    const rows=parseGuideCsv(text);
    const articles=guideRowsToArticles(rows);
    renderGuideArticles(articles.length?articles:GUIDE_ARTICLES_LOCAL);
  }catch(e){
    renderGuideArticles(GUIDE_ARTICLES_LOCAL);
  }
}


// ══════════════════════════════════════
// 遊玩數據分頁
// ══════════════════════════════════════

// ═══════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════

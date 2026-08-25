// ═══════════════════════════════════════════
// js/main.js
// 初始化與啟動流程——放在所有其他 js 檔案「之後」載入，因為裡面的程式會立刻呼叫其他檔案定義的函式
// ═══════════════════════════════════════════

// ── INIT ──
jgPopulateBoardPresetDropdown();
jgUpdateComp();
document.getElementById('jg-count').addEventListener('input',()=>{
  const isDual=jgSetupDualMode;
  const min=isDual?4:6, max=isDual?7:14;
  const n=Math.min(max,Math.max(min,parseInt(document.getElementById('jg-count').value)||min));
  if(!isDual&&jgBoardPreset!=='custom'){
    jgApplyPresetDefaults(n);
  } else {
    jgRolePick=Object.assign({}, isDual?(DEFAULT_COMP_DUAL[n]||DEFAULT_COMP_DUAL[4]):(DEFAULT_COMP[n]||DEFAULT_COMP[6]));
  }
  jgUpdateComp();
});
renderRulesCards();
renderGlossary();
renderGuideTagInfo();


pdRebuildAndRender();
pdLoadCloudGames();


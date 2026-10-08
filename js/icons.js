// ═══════════════════════════════════════════
// js/icons.js
// 全站共用的線條圖示（取代 emoji）。每個圖示都是 24×24 的線條 SVG，寬高 1em、
// 顏色跟著文字顏色走，放在哪裡就跟著那裡的字級縮放。
// 用法：jgIcon('wolf') 回傳一段 <svg> 字串，直接塞進 innerHTML／樣板字串即可。
// 這個檔案要最先載入（其他檔案在畫面渲染時都會呼叫 jgIcon）。
// ═══════════════════════════════════════════
const JG_ICON_PATHS={
  // ── 角色 ──
  wolf:'<path d="M5 3l3 5h8l3-5v8l-3 6-4 4-4-4-3-6z"/><path d="M9.5 12h.01M14.5 12h.01M11 16l1 1 1-1"/>',
  wolfking:'<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/>',
  whitewolf:'<path d="M4 10l4 3.5L12 7.5l4 6L20 10l-1.8 9.5H5.8z"/><path d="M12 2v2.5M7.5 3.5l1.2 2M16.5 3.5l-1.2 2"/>',
  wolfbeauty:'<path d="M3 12c2.5-3 5-4.5 6.5-3.5.9.6 1.6.6 2.5 0 .9.6 1.6.6 2.5 0 1.5-1 4 .5 6.5 3.5-2.5 3.5-5.5 5.5-9 5.5S5.5 15.5 3 12z"/><path d="M3 12h18"/>',
  evilknight:'<path d="M5 20v-8a7 7 0 0 1 14 0v8z"/><path d="M5 13.5h14M12 13.5V20M8.5 10h7"/>',
  bloodmoon:'<circle cx="12" cy="12" r="8"/><path d="M14 4.3a8 8 0 0 1 0 15.4 10 10 0 0 0 0-15.4z"/><path d="M8 9.5h.01M9.5 14h.01"/>',
  gargoyle:'<path d="M12 5c-2.5 0-4 2-4 4.5V14l-5-3 1 5 4 2v3h8v-3l4-2 1-5-5 3V9.5C16 7 14.5 5 12 5z"/><path d="M10.5 10h.01M13.5 10h.01"/>',
  mechanicalwolf:'<rect x="5" y="8" width="14" height="11" rx="2.5"/><circle cx="12" cy="4.5" r="1.2"/><path d="M12 5.7V8M9.5 12.5h.01M14.5 12.5h.01M9.5 16h5M3 12v3M21 12v3"/>',
  nightmare:'<path d="M5 3.5l3 4M19 3.5l-3 4"/><circle cx="12" cy="13" r="7"/><path d="M9 11.5l1.5 1M15 11.5l-1.5 1M9.5 16.5c1.5 1 3.5 1 5 0"/>',
  wolfbrother_e:'<circle cx="10" cy="6" r="3"/><path d="M4.5 21v-4a5.5 5.5 0 0 1 11 0v4M19 11v10M19 11a2 2 0 0 0-2-2"/>',
  wolfbrother_y:'<circle cx="12" cy="8" r="3.5"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>',
  wolfshaman:'<circle cx="12" cy="10" r="6"/><path d="M9.5 8.5a3 3 0 0 1 2.5-1.5"/><path d="M8.5 15.5L7.5 19M15.5 15.5l1 3.5M5.5 21h13"/>',
  mask:'<path d="M3 9c2-1.5 5.5-1.5 9 0 3.5-1.5 7-1.5 9 0-.5 4.5-3 6.5-5.5 6.5-2 0-3-1.5-3.5-2.5-.5 1-1.5 2.5-3.5 2.5C6 15.5 3.5 13.5 3 9z"/><path d="M6.5 11h2.5M15 11h2.5"/>',
  bigbadwolf:'<circle cx="12" cy="15.5" r="3.5"/><circle cx="6" cy="10.5" r="1.7"/><circle cx="9.7" cy="6.5" r="1.7"/><circle cx="14.3" cy="6.5" r="1.7"/><circle cx="18" cy="10.5" r="1.7"/>',
  bigmechwolf:'<rect x="3.5" y="7" width="17" height="13" rx="3"/><path d="M8 7V4.5M16 7V4.5M8.5 12h.01M15.5 12h.01M8.5 16h7"/>',
  smallmechwolf:'<rect x="6.5" y="10" width="11" height="9" rx="2.5"/><path d="M12 10V7.5M10 13.5h.01M14 13.5h.01M10 16.5h4"/>',
  biggreywolf:'<path d="M5 3l3 5h8l3-5v8l-3 6-4 4-4-4-3-6z"/><path d="M9.5 12h.01M14.5 12h.01M11 16l1 1 1-1M15.5 4.5l-2 3"/>',
  trickster:'<path d="M12 3l9 9-9 9-9-9z"/><path d="M7.5 12s1.8-2.7 4.5-2.7 4.5 2.7 4.5 2.7-1.8 2.7-4.5 2.7S7.5 12 7.5 12z"/><path d="M12 12h.01"/>',
  villager:'<path d="M3.5 9.5h17"/><path d="M7.5 9.5c0-3 2-5 4.5-5s4.5 2 4.5 5"/><circle cx="12" cy="13" r="3"/><path d="M6 21a6 6 0 0 1 12 0"/>',
  fool:'<path d="M4 18c2-1 4-1.5 8-1.5s6 .5 8 1.5L18.5 8.5 15 12 12 5.5 9 12 5.5 8.5z"/><circle cx="5.5" cy="7" r="1.2"/><circle cx="12" cy="4" r="1.2"/><circle cx="18.5" cy="7" r="1.2"/>',
  hybrid:'<path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9"/><path d="M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9"/><path d="M8.5 6h7M8.5 18h7"/>',
  cupid:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M3 21L21 3M21 3h-4M21 3v4"/>',
  thief:'<rect x="3.5" y="6" width="10" height="14" rx="1.5"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h9A1.5 1.5 0 0 1 20 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-5"/><path d="M6.5 11.5h4M6.5 14.5h4"/>',
  seer:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  witch:'<path d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7.5 14h9"/>',
  hunter:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  guard:'<path d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6z"/><path d="M12 7.5v9M8.5 11h7"/>',
  dreamcatcher:'<circle cx="12" cy="9" r="6"/><path d="M12 3v12M6 9h12M8.2 4.8l7.6 8.4M15.8 4.8l-7.6 8.4M8 14.5L7 21M16 14.5l1 6.5M12 15v6"/>',
  knight:'<path d="M19.5 4.5L9.5 14.5M19.5 4.5h-4M19.5 4.5v4"/><path d="M7 12l5 5M8.5 15.5L5 19M3.5 20.5l1.5-1.5"/>',
  magician:'<path d="M7.5 15.5V5h9v10.5"/><path d="M7.5 12h9"/><ellipse cx="12" cy="17" rx="9.5" ry="2.5"/>',
  trickmage:'<path d="M4 20L15 9"/><path d="M15 3.5v2.5M15 12v2.5M20.5 9H18M12 9H9.5M18.9 5.1l-1.7 1.7M18.9 12.9l-1.7-1.7M11.1 5.1l1.7 1.7"/>',
  demonhunter:'<path d="M18 3l3 3-10 10-3-3z"/><path d="M6 11l7 7M8.5 15.5L4 20"/>',
  gravkeeper:'<path d="M6 21V10a6 6 0 0 1 12 0v11"/><path d="M4 21h16M12 8.5v6M9.5 11h5"/>',
  medium:'<path d="M2.5 13S6 7 12 7s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="13" r="2.5"/><path d="M12 2.5V5M6 3.5l1.2 2M18 3.5l-1.2 2"/>',
  blackmarket:'<path d="M9 3.5h6L13.5 7h-3z"/><path d="M10.5 7C6 9 4.5 13 4.5 16a4 4 0 0 0 4 4h7a4 4 0 0 0 4-4c0-3-1.5-7-6-9"/><path d="M12 10.5v8M14 12.3h-2.8a1.2 1.2 0 0 0 0 2.4h1.6a1.2 1.2 0 0 1 0 2.4H10"/>',
  purewhitemaiden:'<path d="M20 4C11 4 6 9 6 18l-2 2"/><path d="M6 18c6 0 11-4 14-14M9.5 14.5h5M12 11h5"/>',
  dancer:'<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  littlegirl:'<circle cx="12" cy="10" r="5"/><circle cx="5" cy="8" r="2"/><circle cx="19" cy="8" r="2"/><path d="M7 21a5 5 0 0 1 10 0"/>',
  diviner:'<path d="M12 3l8 13.5H4z"/><path d="M12 21L4 7.5h16z"/>',
  sequenceprince:'<circle cx="12" cy="15.5" r="5"/><path d="M8 9.5V5l2 2 2-3.5L14 7l2-2v4.5z"/>',
  zombie:'<path d="M3 21h18"/><path d="M8 21v-7a1.2 1.2 0 0 1 2.4 0v-2a1.2 1.2 0 0 1 2.4 0v1a1.2 1.2 0 0 1 2.4 0v1a1.2 1.2 0 0 1 2.4 0v4.5L16.5 21"/><path d="M8 16.5l-2.5-2"/>',
  sheriff:'<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  luckyone:'<circle cx="9" cy="9" r="3"/><circle cx="15" cy="9" r="3"/><circle cx="9" cy="15" r="3"/><circle cx="15" cy="15" r="3"/><path d="M13.5 13.5L19 21"/>',
  bear:'<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><circle cx="12" cy="13" r="7"/><circle cx="12" cy="15.5" r="2"/><path d="M9.5 11.5h.01M14.5 11.5h.01"/>',
  foxcub:'<path d="M4 3l4 6h8l4-6-1.5 9L12 21l-6.5-9z"/><path d="M9.5 12.5h.01M14.5 12.5h.01M11 16l1 1 1-1"/>',
  pufferfish:'<circle cx="11" cy="12" r="6"/><path d="M17 12l4-3v6z"/><path d="M11 3.5v2M11 18.5v2M5.5 6.5l1.4 1.4M5.5 17.5l1.4-1.4M2.5 12h2"/><path d="M9 11h.01"/>',
  whitecat:'<path d="M5 20v-8.5L4 4l5 4h6l5-4-1 7.5V20z"/><path d="M9.5 13h.01M14.5 13h.01M11 16.5h2"/>',
  // ── 介面用 ──
  bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  'tri-up':'<path d="M12 5l8 14H4z"/>',
  'tri-down':'<path d="M12 19L4 5h16z"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chevron:'<path d="M9 6l6 6-6 6"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/>',
  folder:'<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.5h8A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/>',
  note:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 15h7M9 19h4"/>',
  clip:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
  play:'<path d="M7 4.5v15l12-7.5z"/>',
  pause:'<path d="M9 5v14M15 5v14"/>',
  replay:'<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  alarm:'<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M5 4L2.5 6.5M19 4l2.5 2.5"/>',
  wrench:'<path d="M15 4a5 5 0 0 0-4.6 6.9L4 17.3V20h2.7l6.4-6.4A5 5 0 0 0 20 9l-3 3-3-1-1-3z"/>',
  wheel:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5"/><path d="M12 4v6.5M12 13.5V20M4 12h6.5M13.5 12H20M6.3 6.3l4.6 4.6M13.1 13.1l4.6 4.6M17.7 6.3l-4.6 4.6M10.9 13.1l-4.6 4.6"/>',
  flame:'<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.3 2 1.3 3 2.5 3.5C11 8 12 5 14 3c.5 3 5 5.5 5 11.5 0 3.8-3 6.5-7 6.5z"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/>',
  dream:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M16 4.5v3M14.5 6h3"/>'
};
function jgIcon(name){
  const inner=JG_ICON_PATHS[name];
  if(!inner) return '';
  return '<svg class="jg-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.125em;">'+inner+'</svg>';
}

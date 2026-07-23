/* =========================================================================
   TOOLBENCH — Developer Utility Toolkit
   Single-file plugin architecture: every tool is an object pushed into
   TOOLS. The shell (sidebar / tabs / command palette / settings / persistence)
   knows nothing about individual tools — it only calls tool.mount(container).
   Adding a new tool = pushing one object into TOOLS. Nothing else to touch.
   ========================================================================= */

/* ---------------------------- small utilities --------------------------- */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs={}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  kids.flat().forEach(k => { if (k==null) return; n.appendChild(k instanceof Node ? k : document.createTextNode(String(k))); });
  return n;
};
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function toast(msg, kind=''){
  const t = el('div', {class:`toast ${kind}`}, msg);
  $('#toast-stack').appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .2s'; setTimeout(()=>t.remove(),200); }, 2400);
}
async function copyText(str, label='Copied to clipboard'){
  try{ await navigator.clipboard.writeText(str); toast(label,'ok'); }
  catch(e){ toast('Copy failed — select and copy manually','err'); }
}
function download(filename, content, mime='text/plain'){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = el('a', {href:url, download:filename});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function readFileAsText(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); });
}
function fmtBytes(n){
  if (n < 1024) return n+' B';
  if (n < 1024*1024) return (n/1024).toFixed(1)+' KB';
  return (n/1024/1024).toFixed(2)+' MB';
}
function uid(){ return Math.random().toString(36).slice(2,10); }

/* ------------------------------- state ---------------------------------- */
const STORAGE_KEY = 'toolbench_state_v1';
let STATE = {
  theme: 'dark', fontSize: 13, indent: 2, restoreTabs: true,
  favorites: [], openTabs: [], activeTabId: null, sidebarCollapsed: false
};
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) STATE = Object.assign(STATE, JSON.parse(raw));
  }catch(e){ /* ignore corrupt state */ }
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: STATE.theme, fontSize: STATE.fontSize, indent: STATE.indent, restoreTabs: STATE.restoreTabs,
      favorites: STATE.favorites,
      openTabs: STATE.restoreTabs ? STATE.openTabs.map(t=>({id:t.id, toolId:t.toolId, title:t.title, clone:t.clone||false})) : [],
      activeTabId: STATE.restoreTabs ? STATE.activeTabId : null,
      sidebarCollapsed: STATE.sidebarCollapsed
    }));
  }catch(e){ /* storage full / unavailable */ }
}

/* ---------------------------- tool registry ------------------------------
   Each tool: { id, name, category, icon, mount(container) -> optional cleanup fn }
   Categories drive the sidebar grouping and are shown in that order.
--------------------------------------------------------------------------- */
const CATEGORIES = ['Core Tools', 'Notes Workspace', 'Developer Utilities'];
const TOOLS = [];
function registerTool(def){ TOOLS.push(def); }

/* =========================================================================
   SHELL
   ========================================================================= */
let openInstances = {}; // tabId -> {toolId, container, cleanup}

function toolById(id){ return TOOLS.find(t=>t.id===id); }

function renderSidebar(filter=''){
  const scroll = $('#side-scroll');
  scroll.innerHTML = '';
  const f = filter.trim().toLowerCase();
  for (const cat of CATEGORIES){
    const items = TOOLS.filter(t => t.category===cat && (!f || t.name.toLowerCase().includes(f)));
    if (!items.length) continue;
    scroll.appendChild(el('div',{class:'cat-title'}, el('span',{},cat)));
    for (const t of items){
      const active = STATE.openTabs.find(tab=>tab.id===STATE.activeTabId)?.toolId === t.id;
      const isFav = STATE.favorites.includes(t.id);
      const row = el('div',{class:'tool-row'+(active?' active':'')},
        el('span',{class:'ic'}, t.icon),
        el('span',{}, t.name),
        el('span',{class:'star'+(isFav?' on':''), onclick:(e)=>{e.stopPropagation();toggleFavorite(t.id);}}, isFav?'\u2605':'\u2606')
      );
      row.addEventListener('click', ()=>{ openTool(t.id); if (window.matchMedia('(max-width:900px)').matches) setSidebarCollapsed(true); });
      scroll.appendChild(row);
    }
  }
  if (STATE.favorites.length){
    const favTools = STATE.favorites.map(toolById).filter(Boolean);
    if (favTools.length){
      const favBlock = el('div',{});
      favBlock.appendChild(el('div',{class:'cat-title'}, el('span',{},'Favorites')));
      favTools.forEach(t=>{
        const row = el('div',{class:'tool-row'}, el('span',{class:'ic'},t.icon), el('span',{},t.name), el('span',{class:'star on', onclick:(e)=>{e.stopPropagation();toggleFavorite(t.id);}},'\u2605'));
        row.addEventListener('click', ()=>{ openTool(t.id); if (window.matchMedia('(max-width:900px)').matches) setSidebarCollapsed(true); });
        favBlock.appendChild(row);
      });
      scroll.prepend(favBlock);
    }
  }
}
function toggleFavorite(toolId){
  const i = STATE.favorites.indexOf(toolId);
  if (i>=0) STATE.favorites.splice(i,1); else STATE.favorites.unshift(toolId);
  saveState(); renderSidebar($('#tool-filter').value);
}

function setSidebarCollapsed(collapsed){
  const sb = $('#sidebar'); sb.classList.toggle('collapsed', collapsed);
  document.body.classList.toggle('sidebar-open', !collapsed);
  STATE.sidebarCollapsed = collapsed;
  $('#collapse-ic').innerHTML = collapsed ? '&#9654;' : '&#9664;';
  saveState();
}
function openTool(toolId){
  const tool = toolById(toolId);
  if (!tool) return;
  // Reuse the original (non-cloned) tab for this tool if one is open; clones are always independent.
  let tab = STATE.openTabs.find(t=>t.toolId===toolId && !t.clone);
  if (!tab){
    tab = {id: uid(), toolId, title: tool.name};
    STATE.openTabs.push(tab);
  }
  setActiveTab(tab.id);
  saveState();
}
function duplicateTab(tabId){
  const srcTab = STATE.openTabs.find(t=>t.id===tabId);
  const tool = srcTab && toolById(srcTab.toolId);
  if (!srcTab || !tool) return;
  const inst = ensurePaneMounted(srcTab);
  let snapshot = null;
  if (inst.getState){ try{ snapshot = inst.getState(); }catch(e){ /* clone will just open a fresh instance */ } }
  const baseTitle = (srcTab.title || tool.name).replace(/ \(copy( \d+)?\)$/, '');
  const newTab = {id: uid(), toolId: srcTab.toolId, title: baseTitle + ' (copy)', clone:true};
  const srcIdx = STATE.openTabs.indexOf(srcTab);
  STATE.openTabs.splice(srcIdx+1, 0, newTab);
  setActiveTab(newTab.id);
  if (snapshot){
    const newInst = openInstances[newTab.id];
    if (newInst && newInst.setState){ try{ newInst.setState(snapshot); }catch(e){} }
  }
  saveState();
  toast('Tab duplicated','ok');
}
function renameTab(tabId){
  const tab = STATE.openTabs.find(t=>t.id===tabId);
  const tool = tab && toolById(tab.toolId);
  if (!tab) return;
  const name = prompt('Rename tab:', tab.title || (tool?tool.name:'Tool'));
  if (!name) return;
  tab.title = name.trim();
  renderTabbar(); saveState();
}
function closeTab(tabId, evt){
  if (evt) evt.stopPropagation();
  const idx = STATE.openTabs.findIndex(t=>t.id===tabId);
  if (idx<0) return;
  STATE.openTabs.splice(idx,1);
  const inst = openInstances[tabId];
  if (inst && inst.cleanup) { try{ inst.cleanup(); }catch(e){} }
  delete openInstances[tabId];
  const paneEl = document.getElementById('pane-'+tabId);
  if (paneEl) paneEl.remove();
  if (STATE.activeTabId === tabId){
    const next = STATE.openTabs[idx] || STATE.openTabs[idx-1];
    STATE.activeTabId = next ? next.id : null;
  }
  renderTabbar(); renderActivePane(); saveState(); renderSidebar($('#tool-filter').value);
}
function setActiveTab(tabId){
  STATE.activeTabId = tabId;
  renderTabbar(); renderActivePane(); saveState();
  renderSidebar($('#tool-filter').value);
}
function renderTabbar(){
  const bar = $('#tabbar'); bar.innerHTML = '';
  for (const tab of STATE.openTabs){
    const tool = toolById(tab.toolId);
    const tEl = el('div',{class:'tab'+(tab.id===STATE.activeTabId?' active':'')},
      el('span',{},tool? tool.icon : '?'),
      el('span',{}, tab.title || (tool?tool.name:'Tool')),
      el('span',{class:'x', title:'Duplicate tab', onclick:(e)=>{e.stopPropagation(); duplicateTab(tab.id);}}, '\u29C9'),
      el('span',{class:'x', onclick:(e)=>closeTab(tab.id,e)}, '\u2715')
    );
    tEl.addEventListener('click', ()=>setActiveTab(tab.id));
    tEl.addEventListener('dblclick', ()=>renameTab(tab.id));
    bar.appendChild(tEl);
  }
  $('#sb-tabs-count').textContent = STATE.openTabs.length + (STATE.openTabs.length===1?' tab open':' tabs open');
}
function ensurePaneMounted(tab){
  if (openInstances[tab.id]) return openInstances[tab.id];
  const tool = toolById(tab.toolId);
  const pane = el('div',{class:'tool-pane', id:'pane-'+tab.id});
  $('#workspace').appendChild(pane);
  let result = null;
  try{
    result = tool.mount(pane, {
      setStatus: (text, ok=null)=>{ if (tab.id===STATE.activeTabId) setStatus(text, ok); },
      setTitle: (title)=>{ tab.title = title; renderTabbar(); }
    }) || null;
  }catch(e){
    pane.innerHTML = `<div class="empty-state"><div class="glyph">&#9888;</div><h3>Tool failed to load</h3><p>${escapeHtml(e.message||String(e))}</p></div>`;
    console.error(e);
  }
  // mount() may return a bare cleanup function (legacy) or {cleanup, getState, setState} for clone support
  const normalized = typeof result === 'function' ? {cleanup: result} : (result || {});
  openInstances[tab.id] = {toolId: tab.toolId, container: pane, cleanup: normalized.cleanup||null, getState: normalized.getState||null, setState: normalized.setState||null};
  return openInstances[tab.id];
}
function renderActivePane(){
  $$('.tool-pane').forEach(p=>p.classList.remove('active'));
  const empty = $('#empty-state');
  if (!STATE.activeTabId || !STATE.openTabs.length){
    empty.style.display = 'flex';
    setStatus('Ready');
    $('#sb-tool').textContent = 'Ready';
    return;
  }
  empty.style.display = 'none';
  const tab = STATE.openTabs.find(t=>t.id===STATE.activeTabId);
  if (!tab) return;
  const inst = ensurePaneMounted(tab);
  inst.container.classList.add('active');
  const tool = toolById(tab.toolId);
  $('#sb-tool').textContent = tool ? tool.name : 'Tool';
  setStatus('Ready');
}
function setStatus(text, ok=null){
  const s = $('#sb-status');
  s.textContent = text || '';
  s.className = 'seg' + (ok===true?' status-ok':ok===false?' status-err':'');
}

/* --------------------------- command palette ----------------------------- */
const COMMANDS = [
  {id:'cmd-theme', name:'Toggle theme (dark / light)', icon:'\u25D1', run:()=>toggleTheme()},
  {id:'cmd-settings', name:'Open settings', icon:'\u2699', run:()=>openSettings()},
  {id:'cmd-closeall', name:'Close all tabs', icon:'\u2715', run:()=>{ [...STATE.openTabs].forEach(t=>closeTab(t.id)); }},
];
let paletteSel = 0, paletteItems = [];
function openPalette(){
  $('#palette-overlay').classList.add('show');
  const input = $('#palette-input'); input.value=''; input.focus();
  renderPalette('');
}
function closePalette(){ $('#palette-overlay').classList.remove('show'); }
function renderPalette(q){
  const query = q.trim().toLowerCase();
  const toolMatches = TOOLS.filter(t=>!query || t.name.toLowerCase().includes(query) || t.category.toLowerCase().includes(query))
    .map(t=>({kind:'tool', id:t.id, name:t.name, icon:t.icon, cat:t.category}));
  const cmdMatches = COMMANDS.filter(c=>!query || c.name.toLowerCase().includes(query))
    .map(c=>({kind:'cmd', id:c.id, name:c.name, icon:c.icon, cat:'Command'}));
  paletteItems = [...cmdMatches, ...toolMatches];
  paletteSel = 0;
  const list = $('#palette-list'); list.innerHTML='';
  if (!paletteItems.length){
    list.appendChild(el('div',{class:'palette-item'}, 'No matches'));
    return;
  }
  paletteItems.forEach((it,i)=>{
    const row = el('div',{class:'palette-item'+(i===0?' sel':'')},
      el('span',{class:'ic'}, it.icon), el('span',{}, it.name), el('span',{class:'cat'}, it.cat));
    row.addEventListener('click', ()=>{ activatePaletteItem(it); });
    row.addEventListener('mousemove', ()=>{ paletteSel=i; updatePaletteSel(); });
    list.appendChild(row);
  });
}
function updatePaletteSel(){
  $$('.palette-item').forEach((r,i)=>r.classList.toggle('sel', i===paletteSel));
  const sel = $$('.palette-item')[paletteSel];
  if (sel) sel.scrollIntoView({block:'nearest'});
}
function activatePaletteItem(it){
  closePalette();
  if (it.kind==='tool') openTool(it.id);
  else { const cmd = COMMANDS.find(c=>c.id===it.id); cmd && cmd.run(); }
}

/* ------------------------------ settings ---------------------------------- */
function openSettings(){
  $('#set-theme').value = STATE.theme;
  $('#set-fontsize').value = String(STATE.fontSize);
  $('#set-indent').value = String(STATE.indent);
  $('#set-restore').checked = STATE.restoreTabs;
  $('#settings-overlay').classList.add('show');
}
function closeSettings(){ $('#settings-overlay').classList.remove('show'); }
function applyTheme(theme){
  STATE.theme = theme;
  document.body.setAttribute('data-theme', theme);
  $('#theme-btn').innerHTML = theme==='dark' ? '&#9789;' : '&#9788;';
  $$('.CodeMirror').forEach(cmEl=>{
    if (cmEl.CodeMirror) cmEl.CodeMirror.setOption('theme', theme==='dark' ? 'material-darker' : 'default');
  });
  saveState();
}
function toggleTheme(){ applyTheme(STATE.theme==='dark'?'light':'dark'); }

/* ------------------------------- boot -------------------------------------- */
function initShell(){
  loadState();
  applyTheme(STATE.theme || 'dark');
  if (STATE.sidebarCollapsed) $('#sidebar').classList.add('collapsed');

  renderSidebar();
  if (STATE.restoreTabs && STATE.openTabs.length){
    // keep tabs, but drop any pointing at unknown tool ids (defensive)
    STATE.openTabs = STATE.openTabs.filter(t=>toolById(t.toolId));
    if (!STATE.openTabs.find(t=>t.id===STATE.activeTabId)) STATE.activeTabId = STATE.openTabs[0]?.id || null;
  } else {
    STATE.openTabs = []; STATE.activeTabId = null;
  }
  renderTabbar(); renderActivePane();

  $('#tool-filter').addEventListener('input', e=>renderSidebar(e.target.value));
  $('#sidebar-toggle').addEventListener('click', ()=>setSidebarCollapsed(!$('#sidebar').classList.contains('collapsed')));
  $('#hamburger-btn').addEventListener('click', ()=>setSidebarCollapsed($('#sidebar').classList.contains('collapsed') ? false : true));
  $('#sidebar-backdrop').addEventListener('click', ()=>setSidebarCollapsed(true));
  // On narrow viewports the sidebar is an overlay drawer, so it should always start closed regardless of the saved desktop preference.
  if (window.matchMedia('(max-width:900px)').matches) setSidebarCollapsed(true);

  $('#theme-btn').addEventListener('click', toggleTheme);
  $('#open-palette-btn').addEventListener('click', openPalette);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings-overlay').addEventListener('click', e=>{ if (e.target.id==='settings-overlay') closeSettings(); });
  $('#set-theme').addEventListener('change', e=>applyTheme(e.target.value));
  $('#set-fontsize').addEventListener('change', e=>{ STATE.fontSize=+e.target.value; document.documentElement.style.setProperty('--cm-fs', STATE.fontSize+'px'); saveState(); });
  $('#set-indent').addEventListener('change', e=>{ STATE.indent=+e.target.value; saveState(); });
  $('#set-restore').addEventListener('change', e=>{ STATE.restoreTabs=e.target.checked; saveState(); });
  $('#clear-workspace').addEventListener('click', ()=>{ localStorage.removeItem(STORAGE_KEY); toast('Saved workspace cleared','ok'); });

  function updateFullscreenIcon(){
    $('#fullscreen-btn').innerHTML = document.fullscreenElement ? '&#10006;' : '&#10021;';
    $('#fullscreen-btn').title = document.fullscreenElement ? 'Exit fullscreen (F11)' : 'Toggle fullscreen (F11)';
  }
  $('#fullscreen-btn').addEventListener('click', ()=>{
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(()=>toast('Fullscreen not available in this browser','err'));
  });
  document.addEventListener('fullscreenchange', updateFullscreenIcon);

  async function importFile(f){
    const text = await readFileAsText(f);
    const ext = f.name.split('.').pop().toLowerCase();
    const map = {json:'json-tool', xml:'xml-tool', sql:'sql-tool', yaml:'data-converter', yml:'data-converter', csv:'data-converter', md:'notes-tool', markdown:'notes-tool', js:'jsbeautify-tool', css:'jsbeautify-tool', pem:'x509-tool', crt:'x509-tool', cer:'x509-tool'};
    const targetId = map[ext] || 'json-tool';
    openTool(targetId);
    setTimeout(()=>{
      const tab = STATE.openTabs.find(t=>t.toolId===targetId);
      const inst = tab && openInstances[tab.id];
      if (inst && inst.container._importText) inst.container._importText(text, f.name);
      else toast('Imported '+f.name+' — paste not auto-filled for this tool yet');
    }, 60);
  }
  $('#import-btn').addEventListener('click', ()=>$('#hidden-file-input').click());
  $('#hidden-file-input').addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    await importFile(f);
    e.target.value='';
  });

  // Drag-and-drop a file anywhere on the window routes it into the matching tool, same as the Import button.
  let dragDepth = 0;
  window.addEventListener('dragenter', e=>{
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); dragDepth++;
    $('#app').classList.add('drag-over');
  });
  window.addEventListener('dragover', e=>{ if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('dragleave', e=>{ dragDepth = Math.max(0, dragDepth-1); if (!dragDepth) $('#app').classList.remove('drag-over'); });
  window.addEventListener('drop', e=>{
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); dragDepth = 0; $('#app').classList.remove('drag-over');
    // per-tool drop zones (e.g. Image Editor's canvas) already stopPropagation on their own drop handlers,
    // so this only fires for drops that no specific tool claimed.
    importFile(e.dataTransfer.files[0]);
  });

  $('#palette-overlay').addEventListener('click', e=>{ if (e.target.id==='palette-overlay') closePalette(); });
  $('#palette-input').addEventListener('input', e=>renderPalette(e.target.value));
  $('#palette-input').addEventListener('keydown', e=>{
    if (e.key==='ArrowDown'){ e.preventDefault(); paletteSel=Math.min(paletteSel+1, paletteItems.length-1); updatePaletteSel(); }
    else if (e.key==='ArrowUp'){ e.preventDefault(); paletteSel=Math.max(paletteSel-1,0); updatePaletteSel(); }
    else if (e.key==='Enter'){ e.preventDefault(); if (paletteItems[paletteSel]) activatePaletteItem(paletteItems[paletteSel]); }
    else if (e.key==='Escape'){ closePalette(); }
  });

  document.addEventListener('keydown', e=>{
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.key.toLowerCase()==='p'){ e.preventDefault(); openPalette(); }
    else if (mod && e.key.toLowerCase()==='k'){ e.preventDefault(); openPalette(); }
    else if (mod && e.key.toLowerCase()==='w'){ e.preventDefault(); if (STATE.activeTabId) closeTab(STATE.activeTabId); }
    else if (e.key==='Escape'){ closePalette(); closeSettings(); }
  });

  window.addEventListener('beforeunload', saveState);
}

/* =========================================================================
   SHARED ALGORITHMS (no dependencies): MD5, mini-JSONPath, line diff
   ========================================================================= */

/* ---- MD5 (pure JS, small implementation; SubtleCrypto has no MD5) ---- */
function md5(str){
  function rotl(x,c){ return (x<<c)|(x>>>(32-c)); }
  function toWords(s){
    const bytes = unescape(encodeURIComponent(s));
    const n = bytes.length;
    const words = new Array(((n+8)>>6)+1<<4).fill(0);
    for (let i=0;i<n;i++) words[i>>2] |= bytes.charCodeAt(i) << ((i%4)*8);
    words[n>>2] |= 0x80 << ((n%4)*8);
    words[words.length-2] = n*8;
    return words;
  }
  const K = [];
  for (let i=0;i<64;i++) K[i] = Math.floor(Math.abs(Math.sin(i+1)) * 2**32);
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  const words = toWords(str);
  for (let chunk=0; chunk<words.length; chunk+=16){
    let [A,B,C,D]=[a0,b0,c0,d0];
    for (let i=0;i<64;i++){
      let F,g;
      if (i<16){ F=(B&C)|(~B&D); g=i; }
      else if (i<32){ F=(D&B)|(~D&C); g=(5*i+1)%16; }
      else if (i<48){ F=B^C^D; g=(3*i+5)%16; }
      else { F=C^(B|~D); g=(7*i)%16; }
      F = (F + A + K[i] + (words[chunk+g]|0)) | 0;
      A=D; D=C; C=B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0=(a0+A)|0; b0=(b0+B)|0; c0=(c0+C)|0; d0=(d0+D)|0;
  }
  function toHex(n){
    let s=''; for (let i=0;i<4;i++){ s += ((n>>(i*8))&0xff).toString(16).padStart(2,'0'); }
    return s;
  }
  return toHex(a0)+toHex(b0)+toHex(c0)+toHex(d0);
}

/* ---- SHA family via SubtleCrypto ---- */
async function sha(algo, str){
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest(algo, buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function shaBytes(algo, bytes){
  const hash = await crypto.subtle.digest(algo, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength));
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ---- Mini JSONPath: supports $, ., [], *, .., [n], [n:m], [?(@.x==y)] ----
   Not the full spec, but covers the common real-world queries. */
function jsonPathQuery(data, path){
  path = path.trim();
  if (!path) return [];
  if (path === '$') return [data];
  const steps = [];
  let i = 0;
  if (path[0] === '$') i = 1;
  while (i < path.length){
    if (path[i] === '.'){
      if (path[i+1] === '.'){ steps.push({type:'recursive'}); i+=2; continue; }
      i++;
      let j=i; while (j<path.length && /[A-Za-z0-9_\-\*]/.test(path[j])) j++;
      if (j>i){ steps.push({type:'child', name: path.slice(i,j)}); i=j; }
      continue;
    }
    if (path[i] === '['){
      let j = path.indexOf(']', i);
      if (j<0) j = path.length;
      const inner = path.slice(i+1, j).trim();
      if (inner.startsWith('?(')){
        steps.push({type:'filter', expr: inner.slice(2, inner.endsWith(')')?-1:undefined)});
      } else if (inner === '*'){
        steps.push({type:'wild'});
      } else if (inner.includes(':')){
        const parts = inner.split(':').map(s=>s.trim());
        steps.push({type:'slice', from: parts[0]===''?undefined:+parts[0], to: parts[1]===''?undefined:+parts[1]});
      } else if (inner.includes(',')){
        steps.push({type:'indexList', list: inner.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,''))});
      } else {
        const clean = inner.replace(/^['"]|['"]$/g,'');
        steps.push({type:'child', name: clean});
      }
      i = j+1; continue;
    }
    i++;
  }
  let current = [data];
  for (const step of steps){
    const next = [];
    for (const node of current){
      if (step.type === 'child'){
        if (step.name === '*'){
          if (node && typeof node==='object') Object.values(node).forEach(v=>next.push(v));
        } else if (node && typeof node === 'object' && step.name in node){
          next.push(node[step.name]);
        }
      } else if (step.type === 'wild'){
        if (Array.isArray(node)) node.forEach(v=>next.push(v));
        else if (node && typeof node === 'object') Object.values(node).forEach(v=>next.push(v));
      } else if (step.type === 'indexList'){
        step.list.forEach(k=>{
          if (Array.isArray(node) && !isNaN(+k)) { if (node[+k]!==undefined) next.push(node[+k]); }
          else if (node && typeof node==='object' && k in node) next.push(node[k]);
        });
      } else if (step.type === 'slice'){
        if (Array.isArray(node)) node.slice(step.from, step.to).forEach(v=>next.push(v));
      } else if (step.type === 'recursive'){
        (function walk(n){
          next.push(n);
          if (n && typeof n==='object') Object.values(n).forEach(walk);
        })(node);
      } else if (step.type === 'filter'){
        const arr = Array.isArray(node) ? node : (node && typeof node==='object' ? Object.values(node) : []);
        arr.forEach(item=>{
          try{
            const expr = step.expr.replace(/@\.([A-Za-z0-9_]+)/g, (_,p)=>`(${JSON.stringify(item)})[${JSON.stringify(p)}]`)
                                    .replace(/@/g, JSON.stringify(item));
            if (Function('"use strict";return ('+expr+')')()) next.push(item);
          }catch(e){ /* skip invalid filter items */ }
        });
      }
    }
    current = next;
  }
  return current;
}

/* ---- Simple LCS-based line diff ---- */
function lineDiff(a, b){
  const A = a.split('\n'), B = b.split('\n');
  const n=A.length, m=B.length;
  const dp = Array.from({length:n+1}, ()=>new Uint32Array(m+1));
  for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--)
    dp[i][j] = A[i]===B[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const out = [];
  let i=0,j=0;
  while (i<n && j<m){
    if (A[i]===B[j]){ out.push({type:'same', a:A[i], b:B[j]}); i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]){ out.push({type:'del', a:A[i]}); i++; }
    else { out.push({type:'add', b:B[j]}); j++; }
  }
  while (i<n){ out.push({type:'del', a:A[i]}); i++; }
  while (j<m){ out.push({type:'add', b:B[j]}); j++; }
  return out;
}

/* =========================================================================
   TOOL: JSON Path Finder
   ========================================================================= */
registerTool({
  id:'json-tool', name:'JSON Path Finder', category:'Core Tools', icon:'{ }',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <button class="btn primary" data-a="format">Beautify</button>
          <button class="btn" data-a="minify">Minify</button>
          <button class="btn ghost" data-a="sample">Load sample</button>
          <button class="btn ghost" data-a="clear">Clear</button>
          <span class="grow"></span>
          <button class="btn" data-a="copy">Copy</button>
          <button class="btn" data-a="download">Download</button>
        </div>
        <div class="err-banner" id="json-err"></div>
        <div class="tool-body">
          <div class="split" style="flex:1.2">
            <div class="split-header"><span>Editor</span><span class="grow"></span><span class="pill" id="json-pill">—</span></div>
            <div class="cm-wrap" id="json-cm"></div>
          </div>
          <div class="split" style="flex:1">
            <div class="split-header">
              <span>JSONPath</span>
              <input class="mini grow" id="json-path" placeholder="$.store.book[*].author" style="margin-left:8px">
              <span class="pill ok" id="json-path-count">0 matches</span>
            </div>
            <div class="tree" id="json-tree" style="flex:0 0 60%;border-bottom:1px solid var(--border);overflow:auto;"></div>
            <div class="split-header">Matches</div>
            <div class="result-box" id="json-matches" style="flex:0 0 auto;max-height:30%;"></div>
          </div>
        </div>
      </div>`;
    const cm = CodeMirror(container.querySelector('#json-cm'), {
      mode:'application/json', lineNumbers:true, theme: STATE.theme==='dark'?'material-darker':'default',
      value:'{\n  "store": {\n    "book": [\n      {"title": "Sapiens", "author": "Yuval Noah Harari", "price": 24.5},\n      {"title": "Clean Code", "author": "Robert C. Martin", "price": 32.0}\n    ]\n  }\n}',
      indentUnit: STATE.indent, tabSize: STATE.indent, viewportMargin: 60
    });
    let lastParsed = null;

    /* ---- bracket matching (JSON-aware: ignores brackets inside string values) ---- */
    let bracketPairs = [], bracketMarks = [];
    function computeBracketPairs(text){
      const pairs = [];
      const stack = [];
      let inString = false, escape = false;
      for (let i=0;i<text.length;i++){
        const c = text[i];
        if (inString){
          if (escape) escape = false;
          else if (c==='\\') escape = true;
          else if (c==='"') inString = false;
          continue;
        }
        if (c==='"'){ inString = true; continue; }
        if (c==='{' || c==='[') stack.push(i);
        else if (c==='}' || c===']'){ if (stack.length) pairs.push({open: stack.pop(), close: i}); }
      }
      return pairs;
    }
    function findEnclosingPair(idx){
      let best = null;
      for (const p of bracketPairs){
        if (p.open <= idx && idx <= p.close+1){
          if (!best || (p.close-p.open) < (best.close-best.open)) best = p;
        }
      }
      return best;
    }
    function updateBracketHighlight(){
      bracketMarks.forEach(m=>m.clear()); bracketMarks = [];
      const pair = findEnclosingPair(cm.indexFromPos(cm.getCursor()));
      if (!pair) return;
      const openFrom = cm.posFromIndex(pair.open), openTo = cm.posFromIndex(pair.open+1);
      const closeFrom = cm.posFromIndex(pair.close), closeTo = cm.posFromIndex(pair.close+1);
      bracketMarks.push(cm.markText(openFrom, closeTo, {className:'cm-bracket-block'}));
      bracketMarks.push(cm.markText(openFrom, openTo, {className:'cm-bracket-match'}));
      bracketMarks.push(cm.markText(closeFrom, closeTo, {className:'cm-bracket-match'}));
    }

    function setPill(ok, msg){
      const p = container.querySelector('#json-pill');
      p.textContent = ok ? 'Valid JSON' : 'Invalid';
      p.className = 'pill ' + (ok?'ok':'err');
      const bnr = container.querySelector('#json-err');
      if (!ok){ bnr.textContent = msg; bnr.classList.add('show'); } else bnr.classList.remove('show');
      api.setStatus(ok?'Valid JSON':'JSON error', ok);
    }
    function tryParse(){
      try{ lastParsed = JSON.parse(cm.getValue()); setPill(true); renderTree(); return true; }
      catch(e){ lastParsed = null; setPill(false, e.message); container.querySelector('#json-tree').innerHTML=''; return false; }
    }
    function valNode(v){
      if (v===null) return `<span class="null">null</span>`;
      if (typeof v==='string') return `<span class="str">"${escapeHtml(v)}"</span>`;
      if (typeof v==='number') return `<span class="num">${v}</span>`;
      if (typeof v==='boolean') return `<span class="bool">${v}</span>`;
      return '';
    }
    function buildTree(v, matchedSet){
      if (v && typeof v==='object'){
        const isArr = Array.isArray(v);
        const entries = isArr ? v.map((x,i)=>[i,x]) : Object.entries(v);
        const wrap = el('span',{});
        const toggle = el('span',{class:'toggle'},'▾');
        wrap.appendChild(toggle);
        wrap.appendChild(document.createTextNode(isArr?'[':'{'));
        const ul = el('ul',{});
        entries.forEach(([k,val])=>{
          const li = el('li',{});
          if (matchedSet.has(val) && val && typeof val==='object') li.classList.add('match');
          const keySpan = isArr ? '' : `<span class="key">"${escapeHtml(k)}"</span>: `;
          li.innerHTML = keySpan;
          if (val && typeof val==='object'){ li.appendChild(buildTree(val, matchedSet)); }
          else {
            const leafMatched = matchedSet.__prims && matchedSet.__prims.has(JSON.stringify(val));
            const span = el('span',{class: leafMatched?'match':''}); span.innerHTML = valNode(val);
            li.appendChild(span);
          }
          ul.appendChild(li);
        });
        wrap.appendChild(ul);
        wrap.appendChild(document.createTextNode(isArr?']':'}'));
        toggle.addEventListener('click', ()=>{
          const hidden = ul.style.display==='none';
          ul.style.display = hidden?'block':'none';
          toggle.textContent = hidden?'▾':'▸';
        });
        return wrap;
      }
      const s = el('span',{}); s.innerHTML = valNode(v); return s;
    }
    function renderTree(matches){
      const holder = container.querySelector('#json-tree');
      holder.innerHTML = '';
      if (lastParsed===null) return;
      const matchedSet = new Set((matches||[]).filter(m=>m && typeof m==='object'));
      matchedSet.__prims = new Set((matches||[]).filter(m=>!(m && typeof m==='object')).map(m=>JSON.stringify(m)));
      holder.appendChild(buildTree(lastParsed, matchedSet));
    }
    function runPath(){
      const path = container.querySelector('#json-path').value;
      const countEl = container.querySelector('#json-path-count');
      const matchesEl = container.querySelector('#json-matches');
      if (lastParsed===null){ countEl.textContent='0 matches'; matchesEl.innerHTML=''; return; }
      if (!path.trim()){ countEl.textContent='0 matches'; matchesEl.innerHTML=''; renderTree(); return; }
      let matches = [];
      try{ matches = jsonPathQuery(lastParsed, path); }catch(e){ /* keep empty on bad path */ }
      countEl.textContent = matches.length + ' match' + (matches.length===1?'':'es');
      countEl.className = 'pill ' + (matches.length?'ok':'err');
      matchesEl.innerHTML = '';
      matches.slice(0,200).forEach((m,i)=>{
        const row = el('div',{style:'display:flex;gap:8px;align-items:flex-start;padding:3px 0;border-bottom:1px solid var(--border-soft)'});
        row.appendChild(el('span',{style:'color:var(--text-dim);min-width:26px'}, '#'+i));
        const val = el('span',{style:'flex:1;word-break:break-all'}, JSON.stringify(m));
        row.appendChild(val);
        const cp = el('span',{class:'icon-btn', title:'Copy', onclick:()=>copyText(JSON.stringify(m,null,2))}, '⧉');
        row.appendChild(cp);
        matchesEl.appendChild(row);
      });
      renderTree(matches);
    }
    cm.on('change', debounce(()=>{ tryParse(); runPath(); bracketPairs = computeBracketPairs(cm.getValue()); updateBracketHighlight(); }, 220));
    cm.on('cursorActivity', updateBracketHighlight);
    container.querySelector('#json-path').addEventListener('input', debounce(runPath, 150));

    container.querySelector('[data-a="format"]').addEventListener('click', ()=>{
      if (tryParse()) { cm.setValue(JSON.stringify(lastParsed, null, STATE.indent)); toast('Formatted','ok'); }
    });
    container.querySelector('[data-a="minify"]').addEventListener('click', ()=>{
      if (tryParse()) { cm.setValue(JSON.stringify(lastParsed)); toast('Minified','ok'); }
    });
    container.querySelector('[data-a="clear"]').addEventListener('click', ()=>{ cm.setValue(''); tryParse(); });
    container.querySelector('[data-a="sample"]').addEventListener('click', ()=>{
      cm.setValue('{\n  "users": [\n    {"id": 1, "name": "Ada", "roles": ["admin","dev"]},\n    {"id": 2, "name": "Grace", "roles": ["dev"]}\n  ],\n  "count": 2\n}');
    });
    container.querySelector('[data-a="copy"]').addEventListener('click', ()=>copyText(cm.getValue()));
    container.querySelector('[data-a="download"]').addEventListener('click', ()=>download('data.json', cm.getValue(), 'application/json'));

    container._importText = (text, name)=>{ cm.setValue(text); api.setTitle(name); tryParse(); };
    tryParse();
    bracketPairs = computeBracketPairs(cm.getValue());
    updateBracketHighlight();
    setTimeout(()=>cm.refresh(), 30);
    return {
      getState: ()=>({value: cm.getValue(), path: container.querySelector('#json-path').value}),
      setState: (s)=>{ cm.setValue(s.value||''); container.querySelector('#json-path').value = s.path||''; tryParse(); runPath(); }
    };
  }
});

/* =========================================================================
   TOOL: XML Path Finder (XPath via native document.evaluate)
   ========================================================================= */
registerTool({
  id:'xml-tool', name:'XML Path Finder', category:'Core Tools', icon:'</>',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <button class="btn primary" data-a="format">Beautify</button>
          <button class="btn" data-a="minify">Minify</button>
          <button class="btn ghost" data-a="sample">Load sample</button>
          <span class="grow"></span>
          <button class="btn" data-a="copy">Copy</button>
          <button class="btn" data-a="download">Download</button>
        </div>
        <div class="err-banner" id="xml-err"></div>
        <div class="tool-body">
          <div class="split" style="flex:1.2">
            <div class="split-header"><span>Editor</span><span class="grow"></span><span class="pill" id="xml-pill">—</span></div>
            <div class="cm-wrap" id="xml-cm"></div>
          </div>
          <div class="split" style="flex:1">
            <div class="split-header">
              <span>XPath</span>
              <input class="mini grow" id="xml-path" placeholder="//book[price>25]/title" style="margin-left:8px">
              <span class="pill ok" id="xml-path-count">0 matches</span>
            </div>
            <div class="result-box" id="xml-matches"></div>
          </div>
        </div>
      </div>`;
    const cm = CodeMirror(container.querySelector('#xml-cm'), {
      mode:'xml', lineNumbers:true, theme: STATE.theme==='dark'?'material-darker':'default',
      value:'<store>\n  <book>\n    <title>Sapiens</title>\n    <author>Yuval Noah Harari</author>\n    <price>24.5</price>\n  </book>\n  <book>\n    <title>Clean Code</title>\n    <author>Robert C. Martin</author>\n    <price>32.0</price>\n  </book>\n</store>',
      indentUnit: STATE.indent, tabSize: STATE.indent, viewportMargin:60
    });
    let lastDoc = null;
    function setPill(ok,msg){
      const p = container.querySelector('#xml-pill');
      p.textContent = ok?'Valid XML':'Invalid'; p.className='pill '+(ok?'ok':'err');
      const bnr = container.querySelector('#xml-err');
      if (!ok){ bnr.textContent=msg; bnr.classList.add('show'); } else bnr.classList.remove('show');
      api.setStatus(ok?'Valid XML':'XML error', ok);
    }
    function tryParse(){
      const text = cm.getValue();
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const errNode = doc.querySelector('parsererror');
      if (errNode){ lastDoc=null; setPill(false, errNode.textContent.split('\n')[0]); return false; }
      lastDoc = doc; setPill(true); return true;
    }
    function runPath(){
      const path = container.querySelector('#xml-path').value;
      const countEl = container.querySelector('#xml-path-count');
      const box = container.querySelector('#xml-matches');
      box.innerHTML=''; countEl.textContent='0 matches'; countEl.className='pill ok';
      if (!lastDoc || !path.trim()) return;
      try{
        const result = lastDoc.evaluate(path, lastDoc, null, XPathResult.ANY_TYPE, null);
        let node, list=[], type=result.resultType;
        if (type===XPathResult.NUMBER_TYPE){ list=[result.numberValue]; }
        else if (type===XPathResult.STRING_TYPE){ list=[result.stringValue]; }
        else if (type===XPathResult.BOOLEAN_TYPE){ list=[result.booleanValue]; }
        else { while((node=result.iterateNext())) list.push(node); }
        countEl.textContent = list.length + ' match' + (list.length===1?'':'es');
        countEl.className = 'pill ' + (list.length?'ok':'err');
        list.slice(0,200).forEach((n,i)=>{
          let text;
          if (n && n.nodeType){ text = n.nodeType===2 ? `${n.name}="${n.value}"` : new XMLSerializer().serializeToString(n); }
          else text = String(n);
          const row = el('div',{style:'display:flex;gap:8px;align-items:flex-start;padding:3px 0;border-bottom:1px solid var(--border-soft)'});
          row.appendChild(el('span',{style:'color:var(--text-dim);min-width:26px'},'#'+i));
          row.appendChild(el('span',{style:'flex:1;white-space:pre-wrap;word-break:break-all'}, text));
          row.appendChild(el('span',{class:'icon-btn',onclick:()=>copyText(text)},'⧉'));
          box.appendChild(row);
        });
      }catch(e){ countEl.textContent='Invalid XPath'; countEl.className='pill err'; }
    }
    function formatXml(text){
      const doc = new DOMParser().parseFromString(text,'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('Cannot format invalid XML');
      const serialize = (node, depth)=>{
        const pad = ' '.repeat(depth*STATE.indent);
        if (node.nodeType===3){ const t=node.textContent.trim(); return t? pad+t+'\n':''; }
        if (node.nodeType!==1) return '';
        const attrs = Array.from(node.attributes||[]).map(a=>` ${a.name}="${a.value}"`).join('');
        const children = Array.from(node.childNodes).filter(c=>!(c.nodeType===3 && !c.textContent.trim()));
        if (!children.length) return `${pad}<${node.tagName}${attrs}/>\n`;
        if (children.length===1 && children[0].nodeType===3){
          return `${pad}<${node.tagName}${attrs}>${children[0].textContent.trim()}</${node.tagName}>\n`;
        }
        let out = `${pad}<${node.tagName}${attrs}>\n`;
        children.forEach(c=>out+=serialize(c, depth+1));
        out += `${pad}</${node.tagName}>\n`;
        return out;
      };
      return Array.from(doc.childNodes).map(n=>serialize(n,0)).join('').trim();
    }
    cm.on('change', debounce(()=>{ tryParse(); runPath(); }, 220));
    container.querySelector('#xml-path').addEventListener('input', debounce(runPath, 150));
    container.querySelector('[data-a="format"]').addEventListener('click', ()=>{
      try{ cm.setValue(formatXml(cm.getValue())); toast('Formatted','ok'); }catch(e){ toast(e.message,'err'); }
    });
    container.querySelector('[data-a="minify"]').addEventListener('click', ()=>{
      if (tryParse()) cm.setValue(new XMLSerializer().serializeToString(lastDoc).replace(/>\s+</g,'><').trim());
    });
    container.querySelector('[data-a="sample"]').addEventListener('click', ()=>{
      cm.setValue('<store>\n  <book><title>Sapiens</title><price>24.5</price></book>\n  <book><title>Clean Code</title><price>32.0</price></book>\n</store>');
    });
    container.querySelector('[data-a="copy"]').addEventListener('click', ()=>copyText(cm.getValue()));
    container.querySelector('[data-a="download"]').addEventListener('click', ()=>download('data.xml', cm.getValue(), 'application/xml'));
    container._importText = (text,name)=>{ cm.setValue(text); api.setTitle(name); tryParse(); };
    tryParse();
    setTimeout(()=>cm.refresh(),30);
    return {
      getState: ()=>({value: cm.getValue(), path: container.querySelector('#xml-path').value}),
      setState: (s)=>{ cm.setValue(s.value||''); container.querySelector('#xml-path').value = s.path||''; tryParse(); runPath(); }
    };
  }
});

/* =========================================================================
   TOOL: SQL Formatter
   ========================================================================= */
registerTool({
  id:'sql-tool', name:'SQL Formatter', category:'Core Tools', icon:'▤',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <select class="mini" id="sql-dialect">
            <option>MySQL</option><option>PostgreSQL</option><option>SQL Server</option><option>Oracle</option><option>SQLite</option>
          </select>
          <button class="btn primary" data-a="format">Beautify</button>
          <button class="btn" data-a="minify">Minify</button>
          <button class="btn ghost" data-a="upper">UPPER keywords</button>
          <button class="btn ghost" data-a="lower">lower keywords</button>
          <span class="grow"></span>
          <button class="btn" data-a="copy">Copy</button>
          <button class="btn" data-a="download">Download</button>
        </div>
        <div class="tool-body">
          <div class="split" style="flex:1"><div class="cm-wrap" id="sql-cm"></div></div>
        </div>
      </div>`;
    const cm = CodeMirror(container.querySelector('#sql-cm'), {
      mode:'text/x-sql', lineNumbers:true, theme: STATE.theme==='dark'?'material-darker':'default',
      value:"select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.active = 1 group by u.id, u.name having count(o.id) > 0 order by orders desc limit 20;",
      indentUnit: STATE.indent, tabSize: STATE.indent, viewportMargin:60
    });
    const KEYWORDS = ['select','from','where','join','left join','right join','inner join','outer join','full join',
      'group by','order by','having','limit','offset','insert into','values','update','set','delete from','create table',
      'alter table','drop table','and','or','not','in','is null','is not null','on','as','union','union all','distinct',
      'case','when','then','else','end','into','with'];
    function splitClauses(sql){
      // normalize whitespace first
      let s = sql.replace(/\s+/g,' ').trim();
      const sorted = [...KEYWORDS].sort((a,b)=>b.length-a.length);
      const re = new RegExp('\\b('+sorted.map(k=>k.replace(/ /g,'\\s+')).join('|')+')\\b','gi');
      s = s.replace(re, m=>'\n'+m.toUpperCase());
      return s.split('\n').map(l=>l.trim()).filter(Boolean);
    }
    function beautify(sql){
      const lines = splitClauses(sql);
      let out = [];
      lines.forEach(line=>{
        const isSub = /^(AND|OR)\b/i.test(line);
        // split select-list commas onto their own indented lines for readability
        if (/^SELECT\b/i.test(line)){
          const rest = line.replace(/^SELECT\s*/i,'');
          out.push('SELECT');
          rest.split(',').map(s=>s.trim()).filter(Boolean).forEach((col,i,arr)=>{
            out.push('  ' + col + (i<arr.length-1?',':''));
          });
        } else {
          out.push((isSub?'  ':'') + line);
        }
      });
      return out.join('\n');
    }
    container.querySelector('[data-a="format"]').addEventListener('click', ()=>{ cm.setValue(beautify(cm.getValue())); toast('Formatted','ok'); });
    container.querySelector('[data-a="minify"]').addEventListener('click', ()=>{ cm.setValue(cm.getValue().replace(/\s+/g,' ').trim()); });
    container.querySelector('[data-a="upper"]').addEventListener('click', ()=>{
      const sorted=[...KEYWORDS].sort((a,b)=>b.length-a.length);
      const re = new RegExp('\\b('+sorted.map(k=>k.replace(/ /g,'\\s+')).join('|')+')\\b','gi');
      cm.setValue(cm.getValue().replace(re, m=>m.toUpperCase()));
    });
    container.querySelector('[data-a="lower"]').addEventListener('click', ()=>{
      const sorted=[...KEYWORDS].sort((a,b)=>b.length-a.length);
      const re = new RegExp('\\b('+sorted.map(k=>k.replace(/ /g,'\\s+')).join('|')+')\\b','gi');
      cm.setValue(cm.getValue().replace(re, m=>m.toLowerCase()));
    });
    container.querySelector('[data-a="copy"]').addEventListener('click', ()=>copyText(cm.getValue()));
    container.querySelector('[data-a="download"]').addEventListener('click', ()=>download('query.sql', cm.getValue(), 'text/plain'));
    container._importText = (text,name)=>{ cm.setValue(text); api.setTitle(name); };
    api.setStatus('Ready');
    setTimeout(()=>cm.refresh(),30);
    return {
      getState: ()=>({value: cm.getValue(), dialect: container.querySelector('#sql-dialect').value}),
      setState: (s)=>{ cm.setValue(s.value||''); if (s.dialect) container.querySelector('#sql-dialect').value = s.dialect; }
    };
  }
});

/* =========================================================================
   TOOL: Text / JSON Diff
   ========================================================================= */
registerTool({
  id:'diff-tool', name:'Text / JSON Diff', category:'Core Tools', icon:'⇄',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <label class="toggle-row"><input type="checkbox" id="diff-json"> JSON-aware (sort keys, ignore formatting)</label>
          <label class="toggle-row"><input type="checkbox" id="diff-ws"> Ignore whitespace</label>
          <span class="grow"></span>
          <button class="btn primary" data-a="run">Compare</button>
        </div>
        <div class="tool-body" style="flex-direction:column">
          <div style="display:flex;flex:0 0 42%;border-bottom:1px solid var(--border)">
            <div class="split"><div class="split-header">Original (A)</div><textarea class="plain-textarea" id="diff-a" placeholder="Paste original text or JSON…"></textarea></div>
            <div class="split"><div class="split-header">Changed (B)</div><textarea class="plain-textarea" id="diff-b" placeholder="Paste changed text or JSON…"></textarea></div>
          </div>
          <div class="split-header">Result <span class="grow"></span><span id="diff-stats" style="color:var(--text-dim)"></span></div>
          <div id="diff-out" style="flex:1;overflow:auto;background:var(--bg-input)"></div>
        </div>
      </div>`;
    function normalize(text, asJson, ignoreWs){
      let t = text;
      if (asJson){
        try{ t = JSON.stringify(JSON.parse(text), Object.keys(JSON.parse(text)).sort ? undefined: undefined, 2); }catch(e){}
        try{
          const sortKeys = (v)=> Array.isArray(v) ? v.map(sortKeys) : (v && typeof v==='object') ?
            Object.keys(v).sort().reduce((acc,k)=>(acc[k]=sortKeys(v[k]),acc),{}) : v;
          t = JSON.stringify(sortKeys(JSON.parse(text)), null, 2);
        }catch(e){ /* leave as-is if invalid json */ }
      }
      if (ignoreWs) t = t.split('\n').map(l=>l.trim()).join('\n');
      return t;
    }
    function run(){
      const asJson = container.querySelector('#diff-json').checked;
      const ignoreWs = container.querySelector('#diff-ws').checked;
      const a = normalize(container.querySelector('#diff-a').value, asJson, ignoreWs);
      const b = normalize(container.querySelector('#diff-b').value, asJson, ignoreWs);
      const diff = lineDiff(a,b);
      const out = container.querySelector('#diff-out'); out.innerHTML='';
      let ai=1, bi=1, adds=0, dels=0;
      diff.forEach(d=>{
        if (d.type==='same'){ out.appendChild(el('div',{class:'diff-line'}, el('span',{class:'ln'},ai++), el('span',{class:'ln'},bi++), el('span',{class:'content'}, d.a))); }
        else if (d.type==='del'){ dels++; out.appendChild(el('div',{class:'diff-line diff-del'}, el('span',{class:'ln'},ai++), el('span',{class:'ln'},''), el('span',{class:'content'}, '- '+d.a))); }
        else { adds++; out.appendChild(el('div',{class:'diff-line diff-add'}, el('span',{class:'ln'},''), el('span',{class:'ln'},bi++), el('span',{class:'content'}, '+ '+d.b))); }
      });
      container.querySelector('#diff-stats').textContent = `+${adds} / -${dels}`;
      api.setStatus(`${adds} additions, ${dels} deletions`);
    }
    container.querySelector('[data-a="run"]').addEventListener('click', run);
    container.querySelector('#diff-a').value = '{\n  "name": "toolkit",\n  "version": "1.0.0",\n  "private": true\n}';
    container.querySelector('#diff-b').value = '{\n  "name": "toolkit",\n  "version": "1.1.0",\n  "private": true,\n  "license": "MIT"\n}';
    run();
    return {
      getState: ()=>({a:container.querySelector('#diff-a').value, b:container.querySelector('#diff-b').value,
        json:container.querySelector('#diff-json').checked, ws:container.querySelector('#diff-ws').checked}),
      setState: (s)=>{
        container.querySelector('#diff-a').value = s.a||''; container.querySelector('#diff-b').value = s.b||'';
        container.querySelector('#diff-json').checked = !!s.json; container.querySelector('#diff-ws').checked = !!s.ws;
        run();
      }
    };
  }
});

/* =========================================================================
   TOOL: Data Converter (JSON <-> YAML <-> CSV <-> XML)
   ========================================================================= */
registerTool({
  id:'data-converter', name:'Data Converter', category:'Core Tools', icon:'⇌',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <select class="mini" id="dc-from"><option>JSON</option><option>YAML</option><option>CSV</option><option>XML</option></select>
          <span style="color:var(--text-dim)">→</span>
          <select class="mini" id="dc-to"><option>YAML</option><option>JSON</option><option>CSV</option><option>XML</option></select>
          <button class="btn primary" data-a="convert">Convert</button>
          <span class="grow"></span>
          <button class="btn" data-a="copy">Copy output</button>
          <button class="btn" data-a="download">Download</button>
        </div>
        <div class="err-banner" id="dc-err"></div>
        <div class="tool-body">
          <div class="split"><div class="split-header">Input</div><textarea class="plain-textarea" id="dc-in">{
  "book": {
    "title": "Clean Code",
    "author": "Robert C. Martin",
    "year": 2008,
    "tags": ["software", "craft"]
  }
}</textarea></div>
          <div class="split"><div class="split-header">Output</div><textarea class="plain-textarea" id="dc-out" readonly></textarea></div>
        </div>
      </div>`;
    function xmlToObj(node){
      const obj = {};
      if (node.attributes) Array.from(node.attributes).forEach(a=>obj['@'+a.name]=a.value);
      const children = Array.from(node.children||[]);
      if (!children.length){ const t=node.textContent.trim(); return Object.keys(obj).length? Object.assign(obj,{'#text':t}) : t; }
      children.forEach(c=>{
        const val = xmlToObj(c);
        if (obj[c.tagName]!==undefined){ if (!Array.isArray(obj[c.tagName])) obj[c.tagName]=[obj[c.tagName]]; obj[c.tagName].push(val); }
        else obj[c.tagName]=val;
      });
      return obj;
    }
    function objToXml(obj, tag='root', depth=0){
      const pad='  '.repeat(depth);
      if (Array.isArray(obj)) return obj.map(o=>objToXml(o,tag,depth)).join('\n');
      if (obj && typeof obj==='object'){
        const inner = Object.entries(obj).map(([k,v])=>objToXml(v,k,depth+1)).join('\n');
        return `${pad}<${tag}>\n${inner}\n${pad}</${tag}>`;
      }
      return `${pad}<${tag}>${escapeHtml(String(obj))}</${tag}>`;
    }
    function parseInput(fmt, text){
      if (fmt==='JSON') return JSON.parse(text);
      if (fmt==='YAML') return jsyaml.load(text);
      if (fmt==='CSV') return Papa.parse(text.trim(), {header:true, dynamicTyping:true, skipEmptyLines:true}).data;
      if (fmt==='XML'){
        const doc = new DOMParser().parseFromString(text,'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('Invalid XML input');
        return {[doc.documentElement.tagName]: xmlToObj(doc.documentElement)};
      }
    }
    function stringifyOutput(fmt, data){
      if (fmt==='JSON') return JSON.stringify(data, null, STATE.indent);
      if (fmt==='YAML') return jsyaml.dump(data);
      if (fmt==='CSV'){
        const rows = Array.isArray(data) ? data : [data];
        return Papa.unparse(rows);
      }
      if (fmt==='XML'){
        const rootKey = (data && typeof data==='object' && !Array.isArray(data)) ? Object.keys(data)[0] : 'root';
        const body = (data && typeof data==='object' && !Array.isArray(data)) ? data[rootKey] : data;
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + objToXml(body, rootKey, 0);
      }
    }
    function convert(){
      const from = container.querySelector('#dc-from').value, to = container.querySelector('#dc-to').value;
      const bnr = container.querySelector('#dc-err');
      try{
        const data = parseInput(from, container.querySelector('#dc-in').value);
        const out = stringifyOutput(to, data);
        container.querySelector('#dc-out').value = out;
        bnr.classList.remove('show');
        api.setStatus(`Converted ${from} → ${to}`, true);
      }catch(e){
        bnr.textContent = e.message; bnr.classList.add('show');
        api.setStatus('Conversion failed', false);
      }
    }
    container.querySelector('[data-a="convert"]').addEventListener('click', convert);
    container.querySelector('[data-a="copy"]').addEventListener('click', ()=>copyText(container.querySelector('#dc-out').value));
    container.querySelector('[data-a="download"]').addEventListener('click', ()=>{
      const to = container.querySelector('#dc-to').value.toLowerCase();
      download('converted.'+to, container.querySelector('#dc-out').value, 'text/plain');
    });
    container._importText = (text,name)=>{ container.querySelector('#dc-in').value = text; api.setTitle(name); };
    convert();
    return {
      getState: ()=>({input:container.querySelector('#dc-in').value, from:container.querySelector('#dc-from').value, to:container.querySelector('#dc-to').value}),
      setState: (s)=>{
        container.querySelector('#dc-in').value = s.input||'';
        if (s.from) container.querySelector('#dc-from').value = s.from;
        if (s.to) container.querySelector('#dc-to').value = s.to;
        convert();
      }
    };
  }
});

/* =========================================================================
   TOOL: JWT Decoder
   ========================================================================= */
registerTool({
  id:'jwt-tool', name:'JWT Decoder', category:'Developer Utilities', icon:'\u26BF',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar"><span style="font-size:12px;color:var(--text-dim)">Paste a JSON Web Token — decoding happens locally, nothing is sent anywhere.</span></div>
        <div class="tool-body" style="flex-direction:column">
          <textarea class="plain-textarea" id="jwt-in" style="flex:0 0 110px" placeholder="eyJhbGciOi...header.payload.signature"></textarea>
          <div class="err-banner" id="jwt-err"></div>
          <div class="grid-2" style="flex:1;overflow:auto">
            <div class="card"><h4>Header</h4><table class="kv" id="jwt-header"></table></div>
            <div class="card"><h4>Payload</h4><table class="kv" id="jwt-payload"></table></div>
          </div>
        </div>
      </div>`;
    const CLAIM_NAMES = {iat:'Issued At', exp:'Expires At', nbf:'Not Before', iss:'Issuer', sub:'Subject', aud:'Audience'};
    function b64urlDecode(s){
      s = s.replace(/-/g,'+').replace(/_/g,'/');
      while (s.length % 4) s += '=';
      return decodeURIComponent(atob(s).split('').map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));
    }
    function fillTable(tbody, obj){
      tbody.innerHTML='';
      Object.entries(obj).forEach(([k,v])=>{
        let display = typeof v==='object' ? JSON.stringify(v) : String(v);
        if (['iat','exp','nbf'].includes(k) && typeof v==='number'){
          display += `  (${new Date(v*1000).toLocaleString()})`;
        }
        const label = CLAIM_NAMES[k] ? `${k} — ${CLAIM_NAMES[k]}` : k;
        tbody.appendChild(el('tr',{}, el('td',{},label), el('td',{}, display)));
      });
    }
    function decode(){
      const token = container.querySelector('#jwt-in').value.trim();
      const bnr = container.querySelector('#jwt-err');
      const hTable = container.querySelector('#jwt-header'), pTable = container.querySelector('#jwt-payload');
      if (!token){ hTable.innerHTML=''; pTable.innerHTML=''; bnr.classList.remove('show'); api.setStatus('Ready'); return; }
      const parts = token.split('.');
      if (parts.length < 2){ bnr.textContent='Not a valid JWT (expected header.payload.signature)'; bnr.classList.add('show'); api.setStatus('Invalid JWT', false); return; }
      try{
        const header = JSON.parse(b64urlDecode(parts[0]));
        const payload = JSON.parse(b64urlDecode(parts[1]));
        fillTable(hTable, header); fillTable(pTable, payload);
        bnr.classList.remove('show');
        let statusMsg = 'Decoded';
        if (payload.exp){
          const expired = Date.now() > payload.exp*1000;
          statusMsg = expired ? 'Token expired' : 'Token valid (not expired)';
          api.setStatus(statusMsg, !expired);
        } else api.setStatus(statusMsg, true);
      }catch(e){ bnr.textContent = 'Could not decode: '+e.message; bnr.classList.add('show'); api.setStatus('Decode error', false); }
    }
    container.querySelector('#jwt-in').addEventListener('input', debounce(decode, 150));
    container._importText = (text)=>{ container.querySelector('#jwt-in').value=text.trim(); decode(); };
    return {
      getState: ()=>({token: container.querySelector('#jwt-in').value}),
      setState: (s)=>{ container.querySelector('#jwt-in').value = s.token||''; decode(); }
    };
  }
});

/* =========================================================================
   TOOL: Base64 Utility
   ========================================================================= */
registerTool({
  id:'base64-tool', name:'Base64 Utility', category:'Developer Utilities', icon:'⠿',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <button class="btn primary" data-a="encode">Encode →</button>
          <button class="btn" data-a="decode">← Decode</button>
          <span class="grow"></span>
          <label class="btn ghost" style="cursor:pointer">Encode file… <input type="file" id="b64-file" style="display:none"></label>
        </div>
        <div class="err-banner" id="b64-err"></div>
        <div class="tool-body">
          <div class="split"><div class="split-header">Plain text (UTF-8)</div><textarea class="plain-textarea" id="b64-plain" placeholder="Type or paste text…"></textarea></div>
          <div class="split"><div class="split-header">Base64</div><textarea class="plain-textarea" id="b64-encoded" placeholder="Paste Base64…"></textarea></div>
        </div>
      </div>`;
    const plain = container.querySelector('#b64-plain'), enc = container.querySelector('#b64-encoded');
    const bnr = container.querySelector('#b64-err');
    function encode(){
      try{ enc.value = btoa(unescape(encodeURIComponent(plain.value))); bnr.classList.remove('show'); api.setStatus('Encoded', true); }
      catch(e){ bnr.textContent=e.message; bnr.classList.add('show'); }
    }
    function decode(){
      try{ plain.value = decodeURIComponent(escape(atob(enc.value.trim()))); bnr.classList.remove('show'); api.setStatus('Decoded', true); }
      catch(e){ bnr.textContent='Invalid Base64 input'; bnr.classList.add('show'); api.setStatus('Decode error', false); }
    }
    container.querySelector('[data-a="encode"]').addEventListener('click', encode);
    container.querySelector('[data-a="decode"]').addEventListener('click', decode);
    container.querySelector('#b64-file').addEventListener('change', (e)=>{
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ()=>{ enc.value = r.result.split(',')[1]; api.setTitle('Base64 — '+f.name); toast('Encoded '+f.name,'ok'); };
      r.readAsDataURL(f);
    });
    container._importText = (text)=>{ plain.value = text; encode(); };
    return {
      getState: ()=>({plain: plain.value, encoded: enc.value}),
      setState: (s)=>{ plain.value = s.plain||''; enc.value = s.encoded||''; }
    };
  }
});

/* =========================================================================
   TOOL: URL Encoder / Decoder
   ========================================================================= */
registerTool({
  id:'url-tool', name:'URL Encoder / Decoder', category:'Developer Utilities', icon:'%',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <button class="btn primary" data-a="encode">Encode →</button>
          <button class="btn" data-a="decode">← Decode</button>
          <label class="toggle-row" style="margin-left:8px"><input type="checkbox" id="url-component" checked> Component encode (spaces → %20)</label>
        </div>
        <div class="err-banner" id="url-err"></div>
        <div class="tool-body">
          <div class="split"><div class="split-header">Raw</div><textarea class="plain-textarea" id="url-raw" placeholder="https://example.com/search?q=hello world&page=1"></textarea></div>
          <div class="split"><div class="split-header">Encoded</div><textarea class="plain-textarea" id="url-enc" placeholder="https%3A%2F%2Fexample.com..."></textarea></div>
        </div>
        <div class="split-header">Query parameters <span class="grow"></span><button class="btn ghost" data-a="addparam" style="margin:4px 12px">+ Add param</button></div>
        <div id="url-params" style="max-height:180px;overflow:auto;padding:6px 12px;display:flex;flex-direction:column;gap:6px"></div>
      </div>`;
    const raw = container.querySelector('#url-raw'), enc = container.querySelector('#url-enc');
    const component = container.querySelector('#url-component');
    const bnr = container.querySelector('#url-err');
    function showError(msg){ bnr.textContent = msg; bnr.classList.add('show'); api.setStatus(msg, false); }
    function clearError(){ bnr.classList.remove('show'); bnr.textContent=''; }
    function encode(){
      try{
        enc.value = component.checked ? encodeURIComponent(raw.value) : encodeURI(raw.value);
        clearError(); parseParams(); api.setStatus('Encoded', true);
      }catch(e){ showError('Could not encode: '+e.message); }
    }
    function decode(){
      if (!enc.value){ clearError(); return; }
      try{
        raw.value = component.checked ? decodeURIComponent(enc.value) : decodeURI(enc.value);
        clearError(); parseParams(); api.setStatus('Decoded', true);
      }catch(e){
        showError('Invalid percent-encoding — ' + (e.message || 'malformed URI sequence') + '. Check for a stray "%" not followed by two hex digits, or an incomplete UTF-8 byte sequence.');
      }
    }
    function parseParams(){
      const box = container.querySelector('#url-params'); box.innerHTML='';
      let qs = raw.value.includes('?') ? raw.value.split('?')[1] : raw.value;
      if (!qs || !qs.includes('=')) return;
      new URLSearchParams(qs).forEach((v,k)=>{
        const row = el('div',{style:'display:flex;gap:6px'},
          el('input',{class:'mini', style:'flex:1', value:k, 'data-role':'k'}),
          el('input',{class:'mini', style:'flex:1', value:v, 'data-role':'v'}),
          el('span',{class:'icon-btn', onclick:(e)=>{ e.target.closest('div').remove(); rebuild(); }},'✕')
        );
        row.querySelectorAll('input').forEach(i=>i.addEventListener('input', rebuild));
        box.appendChild(row);
      });
    }
    function rebuild(){
      const box = container.querySelector('#url-params');
      const params = new URLSearchParams();
      box.querySelectorAll('div').forEach(row=>{
        const [k,v] = row.querySelectorAll('input');
        if (k && k.value) params.append(k.value, v.value);
      });
      const base = raw.value.split('?')[0];
      raw.value = params.toString() ? base+'?'+params.toString() : base;
      encode();
    }
    container.querySelector('[data-a="encode"]').addEventListener('click', encode);
    container.querySelector('[data-a="decode"]').addEventListener('click', decode);
    raw.addEventListener('input', debounce(encode, 200));
    enc.addEventListener('input', debounce(decode, 200));
    component.addEventListener('change', encode);
    container.querySelector('[data-a="addparam"]').addEventListener('click', ()=>{
      const box = container.querySelector('#url-params');
      const row = el('div',{style:'display:flex;gap:6px'},
        el('input',{class:'mini', style:'flex:1', placeholder:'key', 'data-role':'k'}),
        el('input',{class:'mini', style:'flex:1', placeholder:'value', 'data-role':'v'}),
        el('span',{class:'icon-btn', onclick:(e)=>{ e.target.closest('div').remove(); rebuild(); }},'✕')
      );
      row.querySelectorAll('input').forEach(i=>i.addEventListener('input', rebuild));
      box.appendChild(row);
    });
    raw.value = 'https://example.com/search?q=hello world&page=1&sort=relevance';
    encode();
    container._importText = (text)=>{ raw.value=text; encode(); };
    return {
      getState: ()=>({raw: raw.value, component: component.checked}),
      setState: (s)=>{ raw.value = s.raw||''; component.checked = !!s.component; encode(); }
    };
  }
});

/* =========================================================================
   TOOL: Regex Tester
   ========================================================================= */
registerTool({
  id:'regex-tool', name:'Regex Tester', category:'Developer Utilities', icon:'.*',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="field-row">
          <label>Pattern</label>
          <span style="color:var(--text-dim)">/</span>
          <input class="mini grow" id="rx-pattern" placeholder="\\b[A-Z][a-z]+\\b" style="flex:1">
          <span style="color:var(--text-dim)">/</span>
          <input class="mini" id="rx-flags" value="g" style="width:60px" placeholder="flags">
          <span class="pill" id="rx-pill">—</span>
        </div>
        <div class="chip-list" id="rx-examples"></div>
        <div class="tool-body">
          <div class="split"><div class="split-header">Test string</div><textarea class="plain-textarea" id="rx-text" placeholder="Paste text to test against…"></textarea></div>
          <div class="split"><div class="split-header">Matches <span id="rx-count" style="color:var(--text-dim);margin-left:6px"></span></div><div class="result-box" id="rx-out"></div></div>
        </div>
      </div>`;
    const EXAMPLES = [
      {name:'Email', pattern:'[\\w.+-]+@[\\w-]+\\.[\\w.-]+', flags:'g'},
      {name:'URL', pattern:'https?:\\/\\/[^\\s]+', flags:'g'},
      {name:'IPv4', pattern:'\\b\\d{1,3}(\\.\\d{1,3}){3}\\b', flags:'g'},
      {name:'Hex color', pattern:'#[0-9a-fA-F]{3,6}\\b', flags:'g'},
      {name:'Digits only', pattern:'\\d+', flags:'g'},
    ];
    const chips = container.querySelector('#rx-examples');
    EXAMPLES.forEach(x=>{
      const c = el('div',{class:'chip'}, x.name);
      c.addEventListener('click', ()=>{ container.querySelector('#rx-pattern').value=x.pattern; container.querySelector('#rx-flags').value=x.flags; run(); });
      chips.appendChild(c);
    });
    function run(){
      const pat = container.querySelector('#rx-pattern').value;
      const flags = container.querySelector('#rx-flags').value;
      const text = container.querySelector('#rx-text').value;
      const pill = container.querySelector('#rx-pill');
      const out = container.querySelector('#rx-out'); out.innerHTML='';
      if (!pat){ pill.textContent='—'; pill.className='pill'; container.querySelector('#rx-count').textContent=''; return; }
      let re;
      try{ re = new RegExp(pat, flags.includes('g')?flags:flags+'g'); pill.textContent='Valid'; pill.className='pill ok'; api.setStatus('Valid pattern', true); }
      catch(e){ pill.textContent='Invalid'; pill.className='pill err'; container.querySelector('#rx-count').textContent=''; api.setStatus(e.message, false); return; }
      const matches = [...text.matchAll(re)];
      container.querySelector('#rx-count').textContent = matches.length + ' match' + (matches.length===1?'':'es');
      if (!matches.length){ out.innerHTML = '<span style="color:var(--text-dim)">No matches</span>'; return; }
      matches.slice(0,300).forEach((m,i)=>{
        const row = el('div',{style:'padding:5px 0;border-bottom:1px solid var(--border-soft)'});
        row.appendChild(el('div',{}, el('span',{style:'color:var(--text-dim)'},'#'+i+' '), el('span',{style:'color:var(--accent)'}, JSON.stringify(m[0])), el('span',{style:'color:var(--text-dim)'}, '  @'+m.index)));
        if (m.length>1){
          const groups = el('div',{style:'padding-left:16px;color:var(--text-secondary);font-size:11.5px'});
          for (let g=1; g<m.length; g++) groups.appendChild(el('div',{}, `group ${g}: ${JSON.stringify(m[g])}`));
          row.appendChild(groups);
        }
        out.appendChild(row);
      });
    }
    container.querySelector('#rx-pattern').addEventListener('input', debounce(run,150));
    container.querySelector('#rx-flags').addEventListener('input', debounce(run,150));
    container.querySelector('#rx-text').addEventListener('input', debounce(run,150));
    container.querySelector('#rx-pattern').value = '\\b[A-Z][a-z]+\\b';
    container.querySelector('#rx-text').value = 'Ada Lovelace and Grace Hopper pioneered early Computing.';
    run();
    return {
      getState: ()=>({pattern:container.querySelector('#rx-pattern').value, flags:container.querySelector('#rx-flags').value, text:container.querySelector('#rx-text').value}),
      setState: (s)=>{
        container.querySelector('#rx-pattern').value = s.pattern||''; container.querySelector('#rx-flags').value = s.flags||'g'; container.querySelector('#rx-text').value = s.text||'';
        run();
      }
    };
  }
});

/* =========================================================================
   TOOL: UUID Generator
   ========================================================================= */
registerTool({
  id:'uuid-tool', name:'UUID Generator', category:'Developer Utilities', icon:'#',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <select class="mini" id="uuid-version"><option value="v4">UUID v4 (random)</option><option value="v7">UUID v7 (time-ordered)</option><option value="v1">UUID v1-like (time-based)</option></select>
          <label>Count</label><input class="mini" id="uuid-count" type="number" min="1" max="500" value="5" style="width:70px">
          <button class="btn primary" data-a="gen">Generate</button>
          <span class="grow"></span>
          <label class="toggle-row"><input type="checkbox" id="uuid-upper"> UPPERCASE</label>
          <label class="toggle-row"><input type="checkbox" id="uuid-hyphen" checked> hyphens</label>
          <button class="btn" data-a="copyall">Copy all</button>
        </div>
        <div class="result-box" id="uuid-out" style="font-size:13px;line-height:1.9"></div>
      </div>`;
    function uuidv4(){
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6]&0x0f)|0x40; b[8] = (b[8]&0x3f)|0x80;
      const h = [...b].map(x=>x.toString(16).padStart(2,'0'));
      return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
    }
    function uuidv7(){
      const ts = Date.now();
      const tsHex = ts.toString(16).padStart(12,'0');
      const rand = crypto.getRandomValues(new Uint8Array(10));
      rand[0] = (rand[0]&0x0f)|0x70; rand[2] = (rand[2]&0x3f)|0x80;
      const r = [...rand].map(x=>x.toString(16).padStart(2,'0'));
      return `${tsHex.slice(0,8)}-${tsHex.slice(8,12)}-${r[0]}${r[1]}-${r[2]}${r[3]}-${r[4]}${r[5]}${r[6]}${r[7]}${r[8]}${r[9]}`;
    }
    function uuidv1like(){
      const ts = BigInt(Date.now()) * 10000n + 122192928000000000n;
      const tsHex = ts.toString(16).padStart(15,'0');
      const rand = crypto.getRandomValues(new Uint8Array(8));
      rand[0] = (rand[0]&0x3f)|0x80;
      const r = [...rand].map(x=>x.toString(16).padStart(2,'0'));
      return `${tsHex.slice(-8)}-${tsHex.slice(-12,-8)}-1${tsHex.slice(-15,-12)}-${r[0]}${r[1]}-${r[2]}${r[3]}${r[4]}${r[5]}${r[6]}${r[7]}`;
    }
    function gen(){
      const version = container.querySelector('#uuid-version').value;
      const count = Math.max(1, Math.min(500, +container.querySelector('#uuid-count').value||1));
      const upper = container.querySelector('#uuid-upper').checked;
      const hyphen = container.querySelector('#uuid-hyphen').checked;
      const fn = version==='v7'?uuidv7 : version==='v1'?uuidv1like : uuidv4;
      const box = container.querySelector('#uuid-out'); box.innerHTML='';
      for (let i=0;i<count;i++){
        let id = fn();
        if (!hyphen) id = id.replace(/-/g,'');
        if (upper) id = id.toUpperCase();
        const row = el('div',{style:'display:flex;gap:10px;align-items:center'},
          el('span',{style:'flex:1'}, id),
          el('span',{class:'icon-btn', onclick:()=>copyText(id)}, '⧉'));
        box.appendChild(row);
      }
      api.setStatus(`Generated ${count} ${version}`, true);
    }
    container.querySelector('[data-a="gen"]').addEventListener('click', gen);
    container.querySelector('[data-a="copyall"]').addEventListener('click', ()=>{
      const ids = [...container.querySelectorAll('#uuid-out > div > span:first-child')].map(s=>s.textContent);
      copyText(ids.join('\n'), `${ids.length} UUIDs copied`);
    });
    gen();
    return {
      getState: ()=>({version:container.querySelector('#uuid-version').value, count:container.querySelector('#uuid-count').value,
        upper:container.querySelector('#uuid-upper').checked, hyphen:container.querySelector('#uuid-hyphen').checked}),
      setState: (s)=>{
        container.querySelector('#uuid-version').value = s.version||'v4'; container.querySelector('#uuid-count').value = s.count||5;
        container.querySelector('#uuid-upper').checked = !!s.upper; container.querySelector('#uuid-hyphen').checked = s.hyphen!==false;
        gen();
      }
    };
  }
});

/* =========================================================================
   TOOL: Hash Generator
   ========================================================================= */
registerTool({
  id:'hash-tool', name:'Hash Generator', category:'Developer Utilities', icon:'⧉',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar"><span style="font-size:12px;color:var(--text-dim)">Hashes are computed locally in your browser as you type.</span></div>
        <textarea class="plain-textarea" id="hash-in" style="flex:0 0 120px" placeholder="Type or paste text to hash…"></textarea>
        <div class="stack" style="padding:12px">
          <div class="hash-row"><span class="algo">MD5</span><span class="val" id="h-md5"></span><span class="icon-btn" data-c="h-md5">⧉</span></div>
          <div class="hash-row"><span class="algo">SHA-1</span><span class="val" id="h-sha1"></span><span class="icon-btn" data-c="h-sha1">⧉</span></div>
          <div class="hash-row"><span class="algo">SHA-256</span><span class="val" id="h-sha256"></span><span class="icon-btn" data-c="h-sha256">⧉</span></div>
          <div class="hash-row"><span class="algo">SHA-512</span><span class="val" id="h-sha512"></span><span class="icon-btn" data-c="h-sha512">⧉</span></div>
        </div>
      </div>`;
    async function run(){
      const text = container.querySelector('#hash-in').value;
      container.querySelector('#h-md5').textContent = text? md5(text) : '';
      container.querySelector('#h-sha1').textContent = text? await sha('SHA-1', text) : '';
      container.querySelector('#h-sha256').textContent = text? await sha('SHA-256', text) : '';
      container.querySelector('#h-sha512').textContent = text? await sha('SHA-512', text) : '';
      api.setStatus(text? 'Hashes updated' : 'Ready', text?true:null);
    }
    container.querySelector('#hash-in').addEventListener('input', debounce(run,150));
    container.addEventListener('click', e=>{
      const id = e.target.getAttribute && e.target.getAttribute('data-c');
      if (id) copyText(container.querySelector('#'+id).textContent);
    });
    container.querySelector('#hash-in').value = 'Toolbench';
    run();
    return {
      getState: ()=>({input: container.querySelector('#hash-in').value}),
      setState: (s)=>{ container.querySelector('#hash-in').value = s.input||''; run(); }
    };
  }
});

/* =========================================================================
   TOOL: Timestamp Converter
   ========================================================================= */
registerTool({
  id:'timestamp-tool', name:'Timestamp Converter', category:'Developer Utilities', icon:'⏱',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <span style="font-size:12px;color:var(--text-dim)">Live now:</span>
          <span id="ts-live" class="pill ok" style="font-family:var(--mono)"></span>
          <button class="btn ghost" data-a="usenow">Use current time</button>
        </div>
        <div class="grid-2" style="grid-template-columns:1fr;max-width:680px">
          <div class="card">
            <h4>Pick a date &amp; time</h4>
            <div class="field-row" style="padding:6px 0">
              <input type="datetime-local" class="mini grow" id="ts-picker" step="1">
            </div>
          </div>
          <div class="card">
            <h4>Convert</h4>
            <div id="ts-fields"></div>
          </div>
          <div class="card">
            <h4>Also shown as</h4>
            <div class="field-row" style="padding:6px 0"><label style="min-width:100px">Local time</label><input class="mini grow" id="ts-local" readonly></div>
            <div class="field-row" style="padding:6px 0"><label style="min-width:100px">UTC</label><input class="mini grow" id="ts-utc" readonly></div>
            <div class="field-row" style="padding:6px 0"><label style="min-width:100px">Relative</label><input class="mini grow" id="ts-rel" readonly></div>
          </div>
        </div>
      </div>`;

    /* ---- LDAP Generalized Time (RFC 4517) ---- */
    function parseLdapGeneralizedTime(str){
      const m = str.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(?:(\d{2}))?(?:(\d{2}))?([.,](\d+))?(Z|[+-]\d{2}:?\d{2})?$/);
      if (!m) throw new Error('Expected YYYYMMDDHHMMSSZ, e.g. 20260722103045Z');
      const Y=+m[1], Mo=+m[2], D=+m[3], H=+m[4], Mi=m[5]?+m[5]:0, S=m[6]?+m[6]:0;
      if (Mo<1||Mo>12) throw new Error('Month must be 01–12');
      if (D<1||D>31) throw new Error('Day must be 01–31');
      if (H>23||Mi>59||S>60) throw new Error('Invalid time of day');
      let ms = 0;
      if (m[8]) ms = Math.round(parseFloat('0.'+m[8])*1000);
      const tz = m[9];
      let date;
      if (!tz || tz==='Z'){
        date = new Date(Date.UTC(Y, Mo-1, D, H, Mi, S, ms));
      } else {
        const sign = tz[0]==='-' ? -1 : 1;
        const clean = tz.slice(1).replace(':','');
        const oh = +clean.slice(0,2), om = +(clean.slice(2,4)||0);
        date = new Date(Date.UTC(Y, Mo-1, D, H, Mi, S, ms) - sign*(oh*60+om)*60000);
      }
      if (isNaN(date.getTime())) throw new Error('Invalid date/time values');
      return date;
    }
    function toLdapGeneralizedTime(d){
      const pad=(n)=>String(n).padStart(2,'0');
      return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    }

    /* ---- AD / Windows FileTime: 100ns intervals since 1601-01-01 UTC ---- */
    const FILETIME_EPOCH_DIFF_MS = 11644473600000n;
    function parseFileTime(str){
      const s = str.trim();
      if (!/^\d+$/.test(s)) throw new Error('Expected a positive integer (100-nanosecond intervals since 1601-01-01)');
      const ft = BigInt(s);
      const msBig = ft/10000n - FILETIME_EPOCH_DIFF_MS;
      const msNum = Number(msBig);
      if (!Number.isFinite(msNum) || msNum < -8640000000000000 || msNum > 8640000000000000) throw new Error('Value is out of the representable date range');
      const date = new Date(msNum);
      if (isNaN(date.getTime())) throw new Error('Value is out of the representable date range');
      return date;
    }
    function toFileTime(d){
      const ms = BigInt(d.getTime()) + FILETIME_EPOCH_DIFF_MS;
      if (ms < 0n) throw new Error('Date is before the FileTime epoch (1601-01-01)');
      return (ms*10000n).toString();
    }

    const FORMATS = [
      {id:'sec', label:'Unix Timestamp (Seconds)', placeholder:'1753172345',
        toDate: v=>{ if(!/^-?\d+$/.test(v.trim())) throw new Error('Expected an integer number of seconds'); return new Date(+v*1000); },
        fromDate: d=>String(Math.floor(d.getTime()/1000))},
      {id:'ms', label:'Unix Timestamp (Milliseconds)', placeholder:'1753172345000',
        toDate: v=>{ if(!/^-?\d+$/.test(v.trim())) throw new Error('Expected an integer number of milliseconds'); return new Date(+v); },
        fromDate: d=>String(d.getTime())},
      {id:'ldap', label:'LDAP Generalized Time', placeholder:'20260722103045Z',
        toDate: parseLdapGeneralizedTime, fromDate: toLdapGeneralizedTime},
      {id:'filetime', label:'LDAP/AD Windows FileTime', placeholder:'134291898450000000',
        toDate: parseFileTime, fromDate: toFileTime, hint:'100-ns intervals since 1601-01-01 UTC · AD often uses 0 for "never" and 9223372036854775807 for "never expires"'},
      {id:'iso', label:'ISO 8601 Date Time', placeholder:'2026-07-22T10:30:45.000Z',
        toDate: v=>{ const d=new Date(v); if (isNaN(d.getTime())) throw new Error('Not a recognizable ISO 8601 date/time'); return d; },
        fromDate: d=>d.toISOString()},
    ];

    const fieldsBox = container.querySelector('#ts-fields');
    FORMATS.forEach(f=>{
      const row = el('div', {class:'field-row', style:'padding:6px 0;align-items:flex-start;flex-wrap:wrap'},
        el('label',{style:'min-width:170px;padding-top:6px'}, f.label),
        el('div',{style:'flex:1;min-width:180px'},
          el('div',{style:'display:flex;gap:6px'},
            el('input',{class:'mini grow', id:'ts-'+f.id, placeholder:f.placeholder, style:'font-family:var(--mono)'}),
            el('span',{class:'icon-btn', onclick:()=>copyText(container.querySelector('#ts-'+f.id).value)}, '⧉')
          ),
          el('div',{id:'ts-'+f.id+'-err', style:'color:var(--danger);font-size:10.5px;margin-top:3px;display:none'}),
          f.hint ? el('div',{style:'color:var(--text-dim);font-size:10.5px;margin-top:3px'}, f.hint) : null
        )
      );
      fieldsBox.appendChild(row);
    });

    function toDatetimeLocalValue(d){
      const pad=(n)=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    function relative(d){
      const diff = (Date.now()-d.getTime())/1000;
      const abs = Math.abs(diff);
      const units = [[60,'second'],[60,'minute'],[24,'hour'],[7,'day'],[4.345,'week'],[12,'month'],[Infinity,'year']];
      let val = abs, name='second';
      for (const [step,unit] of units){ if (val<step){ name=unit; break; } val/=step; }
      const rounded = Math.round(val);
      return diff>=0 ? `${rounded} ${name}${rounded===1?'':'s'} ago` : `in ${rounded} ${name}${rounded===1?'':'s'}`;
    }
    function clearFieldError(id){
      const e = container.querySelector('#ts-'+id+'-err'); e.style.display='none'; e.textContent='';
      container.querySelector('#ts-'+id).style.borderColor='';
    }
    function showFieldError(id, msg){
      const e = container.querySelector('#ts-'+id+'-err'); e.style.display='block'; e.textContent=msg;
      container.querySelector('#ts-'+id).style.borderColor='var(--danger)';
    }

    let lastValidDate = new Date();
    function fillFrom(date, skipId){
      if (isNaN(date.getTime())) return;
      lastValidDate = date;
      FORMATS.forEach(f=>{
        if (f.id===skipId) return;
        try{ container.querySelector('#ts-'+f.id).value = f.fromDate(date); clearFieldError(f.id); }
        catch(e){ /* e.g. a date before 1601 can't be shown as FileTime — leave that field's last value */ }
      });
      if (skipId!=='picker') container.querySelector('#ts-picker').value = toDatetimeLocalValue(date);
      container.querySelector('#ts-local').value = date.toString();
      container.querySelector('#ts-utc').value = date.toUTCString();
      container.querySelector('#ts-rel').value = relative(date);
      api.setStatus('Converted', true);
    }

    FORMATS.forEach(f=>{
      container.querySelector('#ts-'+f.id).addEventListener('input', e=>{
        const v = e.target.value;
        if (!v.trim()){ clearFieldError(f.id); return; }
        try{ const d = f.toDate(v); clearFieldError(f.id); fillFrom(d, f.id); }
        catch(err){ showFieldError(f.id, err.message); api.setStatus('Invalid '+f.label, false); }
      });
    });
    container.querySelector('#ts-picker').addEventListener('input', e=>{
      if (!e.target.value) return;
      const d = new Date(e.target.value);
      if (isNaN(d.getTime())){ api.setStatus('Invalid date/time', false); return; }
      fillFrom(d, 'picker');
    });
    container.querySelector('[data-a="usenow"]').addEventListener('click', ()=>fillFrom(new Date()));

    const liveTimer = setInterval(()=>{ container.querySelector('#ts-live').textContent = Math.floor(Date.now()/1000)+'  ·  '+new Date().toLocaleTimeString(); }, 1000);
    container.querySelector('#ts-live').textContent = Math.floor(Date.now()/1000)+'  ·  '+new Date().toLocaleTimeString();
    fillFrom(new Date());
    api.setStatus('Ready');
    return {
      cleanup: ()=>clearInterval(liveTimer),
      getState: ()=>({iso: container.querySelector('#ts-iso').value}),
      setState: (s)=>{ if (s.iso){ try{ fillFrom(new Date(s.iso)); }catch(e){} } }
    };
  }
});

/* ------------------------------- go! -------------------------------------- */
document.addEventListener('DOMContentLoaded', initShell);

/* =========================================================================
   Lazy asset loader — the Notes tool's dependencies (marked, DOMPurify,
   highlight.js, mermaid, KaTeX) are only fetched the first time someone
   actually opens that tool, so the rest of the app doesn't pay for them.
   ========================================================================= */
const _loadedAssets = {};
function loadScript(src){
  if (_loadedAssets[src]) return _loadedAssets[src];
  _loadedAssets[src] = new Promise((resolve,reject)=>{
    const s = document.createElement('script');
    s.src = src; s.async = false; s.onload = ()=>resolve(); s.onerror = ()=>reject(new Error('Failed to load '+src));
    document.head.appendChild(s);
  });
  return _loadedAssets[src];
}
function loadCSS(href){
  if (_loadedAssets[href]) return;
  _loadedAssets[href] = true;
  const l = document.createElement('link'); l.rel='stylesheet'; l.href=href;
  document.head.appendChild(l);
}
async function loadNotesDeps(){
  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.10/katex.min.css');
  // async=false on each <script> preserves execution order even though fetches run in parallel
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/markdown/markdown.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.10/katex.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.10/contrib/auto-render.min.js'),
  ]);
  if (window.mermaid) mermaid.initialize({startOnLoad:false, theme: STATE.theme==='dark'?'dark':'default'});
}

/* ---- Built-in note templates ---- */
const NOTE_TEMPLATES = {
  'README': '# Project Name\n\nOne-line description of what this project does.\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Usage\n\n```js\n// example\n```\n\n## License\n\nMIT',
  'Meeting Notes': '# Meeting Notes — {{date}}\n\n**Attendees:** \n**Goal:** \n\n## Discussion\n\n- \n\n## Decisions\n\n- \n\n## Action Items\n\n- [ ] \n',
  'Daily Note': '# {{date}}\n\n## Focus\n\n- \n\n## Notes\n\n- \n\n## Tomorrow\n\n- [ ] \n',
  'Project Documentation': '# Project Documentation\n\n## Overview\n\n## Goals\n\n## Scope\n\n## Timeline\n\n## Stakeholders\n',
  'API Documentation': '# API Reference\n\n## `GET /resource`\n\n**Description:** \n\n**Params**\n\n| Name | Type | Required | Description |\n|---|---|---|---|\n| id | string | yes | |\n\n**Response**\n\n```json\n{}\n```\n',
  'Release Notes': '# Release {{date}}\n\n## Added\n\n- \n\n## Fixed\n\n- \n\n## Changed\n\n- \n',
  'Architecture Design': '# Architecture Design\n\n## Context\n\n## Decision\n\n## Consequences\n\n## Alternatives Considered\n',
  'Sprint Planning': '# Sprint Planning — {{date}}\n\n## Sprint Goal\n\n## Committed Items\n\n- [ ] \n\n## Capacity\n\n## Risks\n',
  'Bug Report': '# Bug Report\n\n**Summary:** \n**Environment:** \n**Steps to Reproduce**\n\n1. \n\n**Expected**\n\n**Actual**\n\n**Severity:** ',
  'Technical Design Document': '# Technical Design Document\n\n## Problem Statement\n\n## Proposed Solution\n\n## Data Model\n\n## API Changes\n\n## Rollout Plan\n',
  'Knowledge Base Article': '# Article Title\n\n## Summary\n\n## Details\n\n## Related\n\n- [[]]\n',
  'Blank': '',
};
function fillTemplate(t){ return t.replace(/\{\{date\}\}/g, new Date().toISOString().slice(0,10)); }

/* =========================================================================
   TOOL: Markdown Notes Workspace
   Scope note: uses localStorage (not IndexedDB / File System Access API),
   no drag-reorder, no version history beyond CodeMirror's own undo stack,
   no virtual-scroll for very large note counts. Everything else — nested
   folders, tags, full-text search, [[wikilinks]] with autocomplete and
   backlinks, GFM + Mermaid + KaTeX preview, templates, export — is real.
   ========================================================================= */
registerTool({
  id:'notes-tool', name:'Markdown Notes', category:'Notes Workspace', icon:'✎',
  mount(container, api){
    const NOTES_KEY = 'toolbench_notes_v1';
    const TAG_PALETTE = ['#6c8dff','#4fd18b','#e8a33d','#f0616d','#a78bfa','#38bdf8','#fb923c','#34d399'];
    function tagColor(tag){
      let h=0; for (let i=0;i<tag.length;i++) h = (h*31 + tag.charCodeAt(i))>>>0;
      return TAG_PALETTE[h % TAG_PALETTE.length];
    }
    function loadData(){
      try{
        const raw = localStorage.getItem(NOTES_KEY);
        if (raw) return JSON.parse(raw);
      }catch(e){}
      const welcomeId = uid();
      return {
        folders: [{id:'f-projects', name:'Projects', parentId:null}, {id:'f-personal', name:'Personal', parentId:null}],
        notes: [{id:welcomeId, title:'Welcome to Notes', folderId:null, content:
          '# Welcome to Markdown Notes\n\nThis is a local, offline notes workspace built into Toolbench.\n\n## Try it out\n\n- Type Markdown on the left, see it rendered on the right\n- Link to another note with `[[Project Ideas]]` — type `[[` for suggestions\n- Add tags below the title\n- Use the template picker in the toolbar to start from a README, meeting notes, a bug report, and more\n\n```js\nconsole.log("code blocks are syntax-highlighted");\n```\n\n| Feature | Status |\n|---|---|\n| Tags | ✅ |\n| Backlinks | ✅ |\n| Mermaid | ✅ |\n\n- [x] Read this note\n- [ ] Create your own\n',
          tags:['guide'], favorite:true, pinned:false, createdAt:Date.now(), updatedAt:Date.now()}],
        activeNoteId: welcomeId
      };
    }
    let data = loadData();
    function save(){ try{ localStorage.setItem(NOTES_KEY, JSON.stringify(data)); }catch(e){ toast('Could not save — storage may be full','err'); } }

    container.innerHTML = `
      <div class="notes-shell">
        <div class="notes-side">
          <div class="notes-side-search">
            <input class="mini" id="notes-search" placeholder="Search notes, tags…">
            <button class="icon-btn" data-a="new-note" title="New note (in selected folder)">+</button>
          </div>
          <div class="notes-side-scroll" id="notes-tree"></div>
        </div>
        <div class="notes-main">
          <div class="notes-toolbar" id="notes-toolbar">
            <select class="mini" id="notes-template" title="Insert template">
              <option value="">Template…</option>
              ${Object.keys(NOTE_TEMPLATES).map(k=>`<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('')}
            </select>
            <span class="tb-sep"></span>
            <button class="tb-icon" data-a="bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button class="tb-icon" data-a="italic" title="Italic (Ctrl+I)"><i>i</i></button>
            <button class="tb-icon" data-a="code" title="Inline code">&lt;/&gt;</button>
            <button class="tb-icon" data-a="link" title="Insert link (Ctrl+L)">&#128279;</button>
            <button class="tb-icon" data-a="table" title="Insert table">&#9638;</button>
            <button class="tb-icon" data-a="check" title="Insert task item">&#9745;</button>
            <span class="tb-sep"></span>
            <button class="tb-icon" data-a="find" title="Find & replace (Ctrl+F)">&#128269;</button>
            <span class="grow"></span>
            <button class="tb-icon" data-mode="editor" title="Editor only">&#9776;</button>
            <button class="tb-icon" data-mode="split" title="Split view">&#9707;</button>
            <button class="tb-icon" data-mode="preview" title="Preview only">&#128065;</button>
            <span class="tb-sep"></span>
            <select class="mini" id="notes-export" title="Export">
              <option value="">Export…</option>
              <option value="md">Markdown (.md)</option>
              <option value="html">HTML (.html)</option>
              <option value="txt">Plain text (.txt)</option>
              <option value="print">Print / PDF…</option>
            </select>
          </div>
          <div class="field-row" id="notes-findbar" style="display:none;background:var(--bg-elevated)">
            <input class="mini" id="find-q" placeholder="Find" style="width:160px">
            <input class="mini" id="find-r" placeholder="Replace with" style="width:160px">
            <label class="toggle-row"><input type="checkbox" id="find-regex"> regex</label>
            <button class="btn ghost" data-a="find-next">Next</button>
            <button class="btn ghost" data-a="find-replace">Replace</button>
            <button class="btn ghost" data-a="find-replace-all">Replace all</button>
            <span class="grow"></span>
            <button class="icon-btn" data-a="find-close">✕</button>
          </div>
          <div class="notes-editcol" id="notes-editcol">
            <div class="empty-note-state" id="notes-empty">
              <div style="font-size:26px">✎</div>
              <div>No note open</div>
              <button class="btn primary" data-a="new-note-2">New note</button>
            </div>
          </div>
          <div class="notes-statusbar" id="notes-statusbar"></div>
        </div>
      </div>`;

    let cm = null, activeNote = null, viewMode = 'split', depsLoaded = false, mermaidTick = 0;

    function findNote(id){ return data.notes.find(n=>n.id===id); }
    function folderChildren(parentId){ return data.folders.filter(f=>f.parentId===parentId); }
    function notesInFolder(folderId){ return data.notes.filter(n=>n.folderId===folderId); }

    /* ---------------- sidebar tree ---------------- */
    function renderTree(){
      const tree = container.querySelector('#notes-tree');
      tree.innerHTML = '';
      const q = container.querySelector('#notes-search').value.trim().toLowerCase();

      if (q){
        const matches = data.notes.filter(n =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some(t=>t.toLowerCase().includes(q))
        );
        tree.appendChild(el('div',{class:'notes-section-title'}, `Search results (${matches.length})`));
        matches.forEach(n=>tree.appendChild(noteRow(n)));
        return;
      }

      const favs = data.notes.filter(n=>n.favorite);
      if (favs.length){
        tree.appendChild(el('div',{class:'notes-section-title'},'Favorites'));
        favs.forEach(n=>tree.appendChild(noteRow(n)));
      }

      function renderFolder(parentId, depth){
        folderChildren(parentId).forEach(f=>{
          const row = el('div',{class:'folder-row', style:`padding-left:${8+depth*12}px`},
            el('span',{},'\u25B8'), el('span',{style:'flex:1'}, f.name),
            el('span',{class:'icon-btn', title:'New note here', onclick:(e)=>{e.stopPropagation(); createNote(f.id);}}, '+'),
            el('span',{class:'icon-btn', title:'Rename', onclick:(e)=>{e.stopPropagation(); renameFolder(f.id);}}, '\u270E'),
            el('span',{class:'icon-btn', title:'Delete folder', onclick:(e)=>{e.stopPropagation(); deleteFolder(f.id);}}, '\u2715')
          );
          tree.appendChild(row);
          renderFolder(f.id, depth+1);
          notesInFolder(f.id).filter(n=>!n.favorite).forEach(n=>tree.appendChild(noteRow(n, depth+1)));
        });
      }
      tree.appendChild(el('div',{class:'notes-section-title'},
        el('span',{},'Folders'),
        el('span',{class:'icon-btn', title:'New folder', onclick:()=>createFolder(null)}, '+')));
      renderFolder(null, 0);

      const rootNotes = notesInFolder(null).filter(n=>!n.favorite);
      if (rootNotes.length){
        tree.appendChild(el('div',{class:'notes-section-title'},'Unfiled'));
        rootNotes.forEach(n=>tree.appendChild(noteRow(n)));
      }

      const tagCounts = {};
      data.notes.forEach(n=>n.tags.forEach(t=>tagCounts[t]=(tagCounts[t]||0)+1));
      const tagNames = Object.keys(tagCounts);
      if (tagNames.length){
        tree.appendChild(el('div',{class:'notes-section-title'},'Tags'));
        const wrap = el('div',{style:'display:flex;flex-wrap:wrap;gap:5px;padding:2px 10px 8px'});
        tagNames.forEach(t=>{
          const chip = el('span',{class:'chip', style:`border-color:${tagColor(t)}55;color:${tagColor(t)}`}, `${t} (${tagCounts[t]})`);
          chip.addEventListener('click', ()=>{ container.querySelector('#notes-search').value = t; renderTree(); });
          wrap.appendChild(chip);
        });
        tree.appendChild(wrap);
      }
    }
    function noteRow(n, depth){
      const row = el('div',{class:'note-row'+(activeNote && n.id===activeNote.id?' active':''), style: depth?`padding-left:${8+depth*12}px`:''},
        el('span',{class:'dot', style:`background:${n.tags[0]?tagColor(n.tags[0]):'var(--text-dim)'}`}),
        el('span',{class:'nm'}, n.title || 'Untitled'),
        n.pinned ? el('span',{class:'pin'},'\u2605') : null
      );
      row.addEventListener('click', ()=>openNote(n.id));
      return row;
    }

    /* ---------------- CRUD ---------------- */
    function createFolder(parentId){
      const name = prompt('Folder name:');
      if (!name) return;
      data.folders.push({id:uid(), name:name.trim(), parentId});
      save(); renderTree();
    }
    function renameFolder(id){
      const f = data.folders.find(x=>x.id===id); if (!f) return;
      const name = prompt('Rename folder:', f.name);
      if (!name) return;
      f.name = name.trim(); save(); renderTree();
    }
    function deleteFolder(id){
      if (!confirm('Delete this folder? Notes and sub-folders inside will move to Unfiled.')) return;
      data.folders.filter(f=>f.parentId===id).forEach(f=>f.parentId=null);
      data.notes.filter(n=>n.folderId===id).forEach(n=>n.folderId=null);
      data.folders = data.folders.filter(f=>f.id!==id);
      save(); renderTree();
    }
    function createNote(folderId){
      const n = {id:uid(), title:'Untitled note', folderId: folderId||null, content:'', tags:[], favorite:false, pinned:false, createdAt:Date.now(), updatedAt:Date.now()};
      data.notes.unshift(n); save(); renderTree(); openNote(n.id);
      setTimeout(()=>container.querySelector('#note-title')?.select(), 30);
    }
    function deleteNote(id){
      if (!confirm('Delete this note? This cannot be undone.')) return;
      data.notes = data.notes.filter(n=>n.id!==id);
      if (data.activeNoteId===id){ data.activeNoteId=null; activeNote=null; }
      save(); renderTree(); renderEditArea();
    }
    function findOrCreateByTitle(title){
      let n = data.notes.find(x=>x.title.trim().toLowerCase()===title.trim().toLowerCase());
      if (!n){
        n = {id:uid(), title:title.trim(), folderId:null, content:'', tags:[], favorite:false, pinned:false, createdAt:Date.now(), updatedAt:Date.now()};
        data.notes.unshift(n); save(); renderTree();
      }
      return n;
    }

    /* ---------------- editor / preview area ---------------- */
    function renderEditArea(){
      const col = container.querySelector('#notes-editcol');
      if (!activeNote){
        col.innerHTML = `<div class="empty-note-state" id="notes-empty"><div style="font-size:26px">✎</div><div>No note open</div><button class="btn primary" data-a="new-note-2">New note</button></div>`;
        col.querySelector('[data-a="new-note-2"]').addEventListener('click', ()=>createNote(null));
        container.querySelector('#notes-statusbar').textContent = '';
        cm = null;
        return;
      }
      col.innerHTML = `
        <div class="notes-editpane" id="pane-edit">
          <input class="note-title-input" id="note-title" value="${escapeHtml(activeNote.title)}" placeholder="Untitled note">
          <div class="note-meta-row">
            <div id="note-tags" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;flex:1"></div>
            <input class="note-tag-input" id="note-tag-add" placeholder="+ tag">
            <button class="icon-btn" id="note-fav" title="Favorite">${activeNote.favorite?'\u2605':'\u2606'}</button>
            <button class="icon-btn" id="note-pin" title="Pin">${activeNote.pinned?'\u{1F4CC}':'\u{1F4CD}'}</button>
            <button class="icon-btn" id="note-del" title="Delete note">\u2715</button>
          </div>
          <div class="cm-wrap" id="notes-cm" style="flex:1"></div>
        </div>
        <div class="notes-prevpane" id="pane-prev">
          <div class="notes-preview" id="notes-preview-body"></div>
          <div class="notes-outline" id="notes-outline"></div>
          <div class="notes-backlinks" id="notes-backlinks"></div>
        </div>`;
      renderTagChips();
      col.querySelector('#note-title').addEventListener('input', debounce(e=>{ activeNote.title = e.target.value; scheduleSave(); renderTree(); },200));
      col.querySelector('#note-fav').addEventListener('click', ()=>{ activeNote.favorite=!activeNote.favorite; scheduleSave(true); renderTree(); renderEditArea(); });
      col.querySelector('#note-pin').addEventListener('click', ()=>{ activeNote.pinned=!activeNote.pinned; scheduleSave(true); renderTree(); });
      col.querySelector('#note-del').addEventListener('click', ()=>deleteNote(activeNote.id));
      col.querySelector('#note-tag-add').addEventListener('keydown', e=>{
        if (e.key==='Enter' && e.target.value.trim()){
          const t = e.target.value.trim().toLowerCase();
          if (!activeNote.tags.includes(t)) activeNote.tags.push(t);
          e.target.value=''; scheduleSave(true); renderTagChips(); renderTree();
        }
      });

      cm = CodeMirror(col.querySelector('#notes-cm'), {
        mode:'markdown', lineNumbers:false, lineWrapping:true, theme: STATE.theme==='dark'?'material-darker':'default',
        value: activeNote.content, viewportMargin: 500, indentUnit: STATE.indent, tabSize: STATE.indent
      });
      cm.on('change', ()=>{ activeNote.content = cm.getValue(); scheduleSave(); renderPreviewDebounced(); updateStatusbar(); });
      cm.on('cursorActivity', updateStatusbar);
      wireWikilinkAutocomplete();
      wireDropPaste();
      applyMode();
      renderPreview();
      updateStatusbar();
      setTimeout(()=>cm.refresh(), 30);
    }
    function renderTagChips(){
      const wrap = container.querySelector('#note-tags'); if (!wrap) return;
      wrap.innerHTML = '';
      activeNote.tags.forEach(t=>{
        const chip = el('span',{class:'tag-chip', style:`background:${tagColor(t)}22;color:${tagColor(t)}`},
          t, el('span',{style:'cursor:pointer', onclick:()=>{ activeNote.tags = activeNote.tags.filter(x=>x!==t); scheduleSave(true); renderTagChips(); renderTree(); }}, ' \u2715'));
        wrap.appendChild(chip);
      });
    }
    let saveTimer=null;
    function scheduleSave(immediate){
      activeNote.updatedAt = Date.now();
      clearTimeout(saveTimer);
      if (immediate){ save(); return; }
      saveTimer = setTimeout(save, 400);
    }

    function openNote(id){
      activeNote = findNote(id);
      data.activeNoteId = id;
      save();
      renderEditArea();
      renderTree();
      api.setTitle(activeNote ? activeNote.title.slice(0,24) || 'Untitled' : 'Markdown Notes');
    }

    /* ---------------- view modes ---------------- */
    function applyMode(){
      const edit = container.querySelector('#pane-edit'), prev = container.querySelector('#pane-prev');
      if (!edit || !prev) return;
      edit.style.display = viewMode==='preview' ? 'none' : 'flex';
      prev.style.display = viewMode==='editor' ? 'none' : 'flex';
      container.querySelectorAll('[data-mode]').forEach(b=>b.style.color = b.getAttribute('data-mode')===viewMode ? 'var(--accent)' : '');
      if (cm) setTimeout(()=>cm.refresh(), 30);
    }
    container.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click', ()=>{ viewMode=b.getAttribute('data-mode'); applyMode(); }));

    /* ---------------- markdown rendering pipeline ---------------- */
    function wikilinkPreprocess(md){
      return md.replace(/\[\[([^\]|]+)\]\]/g, (m,title)=>{
        const t = title.trim();
        const exists = !!data.notes.find(n=>n.title.trim().toLowerCase()===t.toLowerCase());
        return `<a href="#" class="wikilink${exists?'':' broken'}" data-title="${escapeHtml(t)}">${escapeHtml(t)}</a>`;
      });
    }
    async function renderPreview(){
      const body = container.querySelector('#notes-preview-body');
      if (!body || !activeNote) return;
      if (!depsLoaded){
        body.innerHTML = '<div style="color:var(--text-dim)">Loading preview engine…</div>';
        try{ await loadNotesDeps(); depsLoaded = true; }
        catch(e){ body.innerHTML = '<div style="color:var(--danger)">Could not load preview libraries — check your connection.</div>'; return; }
        if (!activeNote) return;
      }
      let html;
      try{
        const pre = wikilinkPreprocess(activeNote.content || '*Nothing here yet — start typing on the left.*');
        html = marked.parse(pre, {gfm:true, breaks:false});
        html = DOMPurify.sanitize(html, {ADD_ATTR:['data-title','class','target'], ADD_TAGS:['iframe']});
      }catch(e){ html = '<div style="color:var(--danger)">Render error: '+escapeHtml(e.message)+'</div>'; }
      body.innerHTML = html;

      // code highlighting + copy buttons
      body.querySelectorAll('pre code').forEach(block=>{
        if (block.className.includes('language-mermaid')) return;
        try{ hljs.highlightElement(block); }catch(e){}
        const pre = block.parentElement;
        if (pre && !pre.querySelector('.copy-code-btn')){
          const btn = el('button',{class:'copy-code-btn'},'Copy');
          btn.addEventListener('click', ()=>copyText(block.textContent));
          pre.appendChild(btn);
        }
      });
      // mermaid
      const mermaidBlocks = body.querySelectorAll('code.language-mermaid');
      if (mermaidBlocks.length && window.mermaid){
        mermaidBlocks.forEach(block=>{
          const div = document.createElement('div');
          div.className = 'mermaid'; div.textContent = block.textContent;
          block.closest('pre').replaceWith(div);
        });
        try{ mermaidTick++; await mermaid.run({nodes: body.querySelectorAll('.mermaid')}); }catch(e){ /* leave raw text if a diagram is malformed */ }
      }
      // KaTeX
      if (window.renderMathInElement){
        try{
          renderMathInElement(body, {delimiters:[
            {left:'$$', right:'$$', display:true}, {left:'$', right:'$', display:false}
          ], throwOnError:false});
        }catch(e){}
      }
      // wikilinks
      body.querySelectorAll('a.wikilink').forEach(a=>{
        a.addEventListener('click', (e)=>{
          e.preventDefault();
          const title = a.getAttribute('data-title');
          const n = findOrCreateByTitle(title);
          openNote(n.id);
        });
      });
      renderOutline(body);
      renderBacklinks();
    }
    const renderPreviewDebounced = debounce(renderPreview, 260);

    function renderOutline(body){
      const box = container.querySelector('#notes-outline'); if (!box) return;
      const heads = body.querySelectorAll('h1,h2,h3,h4');
      box.innerHTML = '';
      if (!heads.length) return;
      box.appendChild(el('div',{style:'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);padding:2px 6px 4px'},'Outline'));
      heads.forEach((h,i)=>{
        h.id = h.id || ('outline-'+i);
        const depth = +h.tagName[1];
        const row = el('div',{style:`padding-left:${(depth-1)*10}px`}, h.textContent);
        row.addEventListener('click', ()=>h.scrollIntoView({behavior:'smooth', block:'start'}));
        box.appendChild(row);
      });
    }
    function renderBacklinks(){
      const box = container.querySelector('#notes-backlinks'); if (!box || !activeNote) return;
      const title = activeNote.title.trim().toLowerCase();
      const linkers = data.notes.filter(n=>{
        if (n.id===activeNote.id) return false;
        const re = /\[\[([^\]|]+)\]\]/g; let m;
        while ((m = re.exec(n.content))){ if (m[1].trim().toLowerCase()===title) return true; }
        return false;
      });
      box.innerHTML = '';
      box.appendChild(el('div',{style:'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);padding:2px 0 4px'},`Backlinks (${linkers.length})`));
      linkers.forEach(n=>{
        const item = el('div',{class:'bl-item'}, n.title||'Untitled');
        item.addEventListener('click', ()=>openNote(n.id));
        box.appendChild(item);
      });
    }

    function updateStatusbar(){
      const bar = container.querySelector('#notes-statusbar'); if (!bar) return;
      if (!activeNote || !cm){ bar.textContent=''; return; }
      const text = cm.getValue();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const mins = Math.max(1, Math.round(words/200));
      const cur = cm.getCursor();
      bar.innerHTML = '';
      [`${words} words`, `${chars} chars`, `${mins} min read`, `Ln ${cur.line+1}, Col ${cur.ch+1}`, `Updated ${new Date(activeNote.updatedAt).toLocaleTimeString()}`]
        .forEach(t=>bar.appendChild(el('span',{},t)));
    }

    /* ---------------- wikilink autocomplete ---------------- */
    let hintBox = null;
    function closeHint(){ if (hintBox){ hintBox.remove(); hintBox=null; } }
    function wireWikilinkAutocomplete(){
      cm.on('cursorActivity', ()=>{
        const cur = cm.getCursor();
        const line = cm.getLine(cur.line).slice(0, cur.ch);
        const m = line.match(/\[\[([^\]]*)$/);
        if (!m){ closeHint(); return; }
        const q = m[1].toLowerCase();
        const matches = data.notes.filter(n=>n.title.toLowerCase().includes(q)).slice(0,8);
        closeHint();
        if (!matches.length) return;
        const coords = cm.cursorCoords(cur, 'local');
        const wrap = cm.getWrapperElement();
        hintBox = el('div',{class:'wikilink-hint', style:`left:${coords.left}px; top:${coords.bottom+4}px;`});
        matches.forEach(n=>{
          const row = el('div',{}, n.title);
          row.addEventListener('mousedown', (e)=>{
            e.preventDefault();
            const from = {line:cur.line, ch: cur.ch - m[1].length};
            cm.replaceRange(n.title + ']]', from, cur);
            closeHint(); cm.focus();
          });
          hintBox.appendChild(row);
        });
        wrap.style.position = 'relative';
        wrap.appendChild(hintBox);
      });
      cm.on('blur', ()=>setTimeout(closeHint, 120));
    }

    /* ---------------- paste / drop images ---------------- */
    function wireDropPaste(){
      function handleFiles(files){
        [...files].forEach(f=>{
          if (!f.type.startsWith('image/')) return;
          const reader = new FileReader();
          reader.onload = ()=>{
            const cur = cm.getCursor();
            cm.replaceRange(`![${f.name}](${reader.result})\n`, cur);
            toast('Image inserted (embedded as data URL)','ok');
          };
          reader.readAsDataURL(f);
        });
      }
      cm.on('paste', (instance, e)=>{ if (e.clipboardData?.files?.length){ handleFiles(e.clipboardData.files); e.preventDefault(); } });
      cm.getWrapperElement().addEventListener('drop', e=>{
        if (e.dataTransfer?.files?.length){ e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }
      });
    }

    /* ---------------- find & replace ---------------- */
    function buildRegex(){
      const q = container.querySelector('#find-q').value;
      const isRegex = container.querySelector('#find-regex').checked;
      if (!q) return null;
      try{ return new RegExp(isRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'); }catch(e){ return null; }
    }
    let lastFindIndex = 0;
    function findNext(){
      if (!cm) return;
      const re = buildRegex(); if (!re) return;
      const text = cm.getValue();
      re.lastIndex = lastFindIndex;
      let m = re.exec(text);
      if (!m){ re.lastIndex = 0; m = re.exec(text); }
      if (!m){ toast('No matches','err'); return; }
      const from = cm.posFromIndex(m.index), to = cm.posFromIndex(m.index+m[0].length);
      cm.setSelection(from, to); cm.scrollIntoView({from,to}, 60);
      lastFindIndex = m.index + Math.max(1,m[0].length);
    }
    function replaceOne(){
      if (!cm || !cm.somethingSelected()) { findNext(); return; }
      cm.replaceSelection(container.querySelector('#find-r').value);
      findNext();
    }
    function replaceAll(){
      if (!cm) return;
      const re = buildRegex(); if (!re) return;
      const rep = container.querySelector('#find-r').value;
      cm.setValue(cm.getValue().replace(re, rep));
      toast('Replaced all matches','ok');
    }

    /* ---------------- toolbar wiring ---------------- */
    function wrapSelection(before, after=before){
      if (!cm) return;
      const sel = cm.getSelection();
      cm.replaceSelection(before + (sel||'text') + after);
      cm.focus();
    }
    container.addEventListener('click', (e)=>{
      const a = e.target.closest('[data-a]')?.getAttribute('data-a'); if (!a) return;
      if (a==='bold') wrapSelection('**');
      else if (a==='italic') wrapSelection('*');
      else if (a==='code') wrapSelection('`');
      else if (a==='link') { if (cm){ const sel=cm.getSelection(); cm.replaceSelection(`[${sel||'text'}](url)`); cm.focus(); } }
      else if (a==='table') { if (cm){ cm.replaceSelection('\n| Col A | Col B |\n|---|---|\n| a | b |\n'); cm.focus(); } }
      else if (a==='check') { if (cm){ cm.replaceSelection('- [ ] '); cm.focus(); } }
      else if (a==='find') { const bar=container.querySelector('#notes-findbar'); bar.style.display = bar.style.display==='none'?'flex':'none'; if (bar.style.display==='flex') container.querySelector('#find-q').focus(); }
      else if (a==='new-note') createNote(null);
      else if (a==='find-next') findNext();
      else if (a==='find-replace') replaceOne();
      else if (a==='find-replace-all') replaceAll();
      else if (a==='find-close') container.querySelector('#notes-findbar').style.display='none';
    });
    container.querySelector('#notes-template').addEventListener('change', e=>{
      const key = e.target.value; e.target.value='';
      if (!key || !cm) return;
      if (cm.getValue().trim() && !confirm('Replace current note content with the "'+key+'" template?')) return;
      cm.setValue(fillTemplate(NOTE_TEMPLATES[key]));
    });
    container.querySelector('#notes-export').addEventListener('change', e=>{
      const mode = e.target.value; e.target.value=''; if (!mode || !activeNote) return;
      const safeTitle = (activeNote.title||'note').replace(/[^\w\-]+/g,'_');
      if (mode==='md') download(safeTitle+'.md', activeNote.content, 'text/markdown');
      else if (mode==='txt') download(safeTitle+'.txt', activeNote.content, 'text/plain');
      else if (mode==='html'){
        const body = container.querySelector('#notes-preview-body').innerHTML;
        download(safeTitle+'.html', `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(activeNote.title)}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1c1e26} pre{background:#f4f5f8;padding:10px;border-radius:6px;overflow:auto} code{background:#eef0f5;padding:1px 5px;border-radius:4px} table{border-collapse:collapse} td,th{border:1px solid #ddd;padding:6px 10px}</style>\n</head><body>${body}</body></html>`, 'text/html');
      }
      else if (mode==='print'){
        const body = container.querySelector('#notes-preview-body').innerHTML;
        const w = window.open('', '_blank');
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(activeNote.title)}</title>
          <style>body{font-family:system-ui,sans-serif;max-width:760px;margin:30px auto;line-height:1.6}pre{background:#f4f5f8;padding:10px;border-radius:6px;overflow:auto}code{background:#eef0f5;padding:1px 5px;border-radius:4px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}</style>
          </head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`);
        w.document.close();
      }
    });
    container.querySelector('#notes-search').addEventListener('input', debounce(renderTree, 150));

    // tool-scoped shortcuts (only fire while focus is inside this tool, so they never leak to the shell)
    container.addEventListener('keydown', e=>{
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase()==='b'){ e.preventDefault(); wrapSelection('**'); }
      else if (mod && e.key.toLowerCase()==='i'){ e.preventDefault(); wrapSelection('*'); }
      else if (mod && e.key.toLowerCase()==='l'){ e.preventDefault(); if (cm){ const sel=cm.getSelection(); cm.replaceSelection(`[${sel||'text'}](url)`); } }
      else if (mod && e.key.toLowerCase()==='f'){ e.preventDefault(); const bar=container.querySelector('#notes-findbar'); bar.style.display='flex'; container.querySelector('#find-q').focus(); }
    });

    /* ---------------- workspace import/export ---------------- */
    const wsRow = el('div',{class:'field-row'},
      el('label',{},'Workspace'),
      el('button',{class:'btn ghost', onclick:()=>download('toolbench-notes-export.json', JSON.stringify(data,null,2), 'application/json')},'Export all notes'),
      el('label',{class:'btn ghost', style:'cursor:pointer'}, 'Import…', (()=>{ const inp=el('input',{type:'file', accept:'.json', style:'display:none'});
        inp.addEventListener('change', async ev=>{
          const f = ev.target.files[0]; if (!f) return;
          try{
            const imported = JSON.parse(await readFileAsText(f));
            if (!imported.notes || !imported.folders) throw new Error('Not a Toolbench notes export');
            if (!confirm('Import will replace your current notes workspace. Continue?')) return;
            data = imported; save(); activeNote=null; renderTree(); renderEditArea();
            toast('Workspace imported','ok');
          }catch(err){ toast('Import failed: '+err.message,'err'); }
        });
        return inp;
      })())
    );
    container.querySelector('.notes-side').appendChild(wsRow);

    /* ---------------- boot ---------------- */
    renderTree();
    if (data.activeNoteId && findNote(data.activeNoteId)) openNote(data.activeNoteId);
    else renderEditArea();

    container._importText = (text, name)=>{ createNote(null); activeNote.title = name.replace(/\.[^.]+$/,''); activeNote.content = text; renderEditArea(); };
    return ()=>{ closeHint(); };
  }
});

/* =========================================================================
   TOOL: Number Base Converter
   ========================================================================= */
registerTool({
  id:'numbase-tool', name:'Number Base Converter', category:'Developer Utilities', icon:'01',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar"><span style="font-size:12px;color:var(--text-dim)">Enter a value in any base — the others update live. Non-negative integers only.</span></div>
        <div class="err-banner" id="nb-err"></div>
        <div class="stack" style="padding:14px;max-width:560px">
          <div class="field-row" style="padding:8px 0"><label style="min-width:70px">Decimal</label><input class="mini grow" id="nb-dec" style="font-family:var(--mono)"></div>
          <div class="field-row" style="padding:8px 0"><label style="min-width:70px">Hex</label><input class="mini grow" id="nb-hex" style="font-family:var(--mono)"></div>
          <div class="field-row" style="padding:8px 0"><label style="min-width:70px">Octal</label><input class="mini grow" id="nb-oct" style="font-family:var(--mono)"></div>
          <div class="field-row" style="padding:8px 0"><label style="min-width:70px">Binary</label><input class="mini grow" id="nb-bin" style="font-family:var(--mono);word-break:break-all"></div>
        </div>
      </div>`;
    const dec=container.querySelector('#nb-dec'), hex=container.querySelector('#nb-hex'), oct=container.querySelector('#nb-oct'), bin=container.querySelector('#nb-bin');
    const bnr = container.querySelector('#nb-err');
    function setAllFrom(value, skip){
      try{
        if (value==='' || value==null){ [dec,hex,oct,bin].forEach(i=>i.value=''); bnr.classList.remove('show'); return; }
        const n = BigInt(value);
        if (n<0n) throw new Error('Negative numbers are not supported');
        if (skip!==dec) dec.value = n.toString(10);
        if (skip!==hex) hex.value = n.toString(16).toUpperCase();
        if (skip!==oct) oct.value = n.toString(8);
        if (skip!==bin) bin.value = n.toString(2);
        bnr.classList.remove('show'); api.setStatus('Valid', true);
      }catch(e){ bnr.textContent = 'Invalid number for this base'; bnr.classList.add('show'); api.setStatus('Invalid input', false); }
    }
    dec.addEventListener('input', ()=>{ try{ setAllFrom(dec.value===''?'':BigInt(dec.value||0), dec); }catch(e){ bnr.textContent='Invalid decimal'; bnr.classList.add('show'); } });
    hex.addEventListener('input', ()=>{ try{ setAllFrom(hex.value===''?'':BigInt('0x'+(hex.value.replace(/^0x/i,'')||'0')), hex); }catch(e){ bnr.textContent='Invalid hex'; bnr.classList.add('show'); } });
    oct.addEventListener('input', ()=>{ try{ setAllFrom(oct.value===''?'':BigInt('0o'+(oct.value.replace(/^0o/i,'')||'0')), oct); }catch(e){ bnr.textContent='Invalid octal'; bnr.classList.add('show'); } });
    bin.addEventListener('input', ()=>{ try{ setAllFrom(bin.value===''?'':BigInt('0b'+(bin.value.replace(/^0b/i,'')||'0')), bin); }catch(e){ bnr.textContent='Invalid binary'; bnr.classList.add('show'); } });
    dec.value = '255'; setAllFrom(255n, dec);
    return {
      getState: ()=>({dec:dec.value}),
      setState: (s)=>{ dec.value = s.dec||''; try{ setAllFrom(dec.value===''?'':BigInt(dec.value||0), dec); }catch(e){} }
    };
  }
});

/* =========================================================================
   TOOL: Text Case Converter
   ========================================================================= */
registerTool({
  id:'textcase-tool', name:'Text Case Converter', category:'Developer Utilities', icon:'Aa',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <textarea class="plain-textarea" id="tc-in" style="flex:0 0 90px" placeholder="Type or paste text — e.g. hello world example"></textarea>
        <div class="stack" style="padding:10px 12px" id="tc-out"></div>
      </div>`;
    const CASES = [
      ['camelCase', words=>words.map((w,i)=>i===0?w.toLowerCase():cap(w)).join('')],
      ['PascalCase', words=>words.map(cap).join('')],
      ['snake_case', words=>words.map(w=>w.toLowerCase()).join('_')],
      ['kebab-case', words=>words.map(w=>w.toLowerCase()).join('-')],
      ['CONSTANT_CASE', words=>words.map(w=>w.toUpperCase()).join('_')],
      ['Title Case', words=>words.map(cap).join(' ')],
      ['Sentence case', words=>words.length? cap(words[0])+' '+words.slice(1).map(w=>w.toLowerCase()).join(' ') : ''],
      ['lowercase', words=>words.map(w=>w.toLowerCase()).join(' ')],
      ['UPPERCASE', words=>words.map(w=>w.toUpperCase()).join(' ')],
    ];
    function cap(w){ return w? w[0].toUpperCase()+w.slice(1).toLowerCase() : w; }
    function toWords(text){
      return text
        .replace(/([a-z0-9])([A-Z])/g,'$1 $2')
        .split(/[\s_\-]+/)
        .map(w=>w.trim()).filter(Boolean);
    }
    function run(){
      const words = toWords(container.querySelector('#tc-in').value);
      const out = container.querySelector('#tc-out'); out.innerHTML='';
      CASES.forEach(([name,fn])=>{
        const val = words.length ? fn(words) : '';
        const row = el('div',{class:'hash-row'}, el('span',{class:'algo', style:'width:120px'}, name), el('span',{class:'val'}, val||'—'),
          el('span',{class:'icon-btn', onclick:()=>copyText(val)}, '⧉'));
        out.appendChild(row);
      });
      api.setStatus(words.length? `${words.length} words` : 'Ready');
    }
    container.querySelector('#tc-in').addEventListener('input', debounce(run,120));
    container.querySelector('#tc-in').value = 'hello world example';
    run();
    return {
      getState: ()=>({text: container.querySelector('#tc-in').value}),
      setState: (s)=>{ container.querySelector('#tc-in').value = s.text||''; run(); }
    };
  }
});

/* =========================================================================
   TOOL: Random Generator (passwords, strings, tokens, PINs)
   ========================================================================= */
registerTool({
  id:'random-tool', name:'Random Generator', category:'Developer Utilities', icon:'\u2685',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <select class="mini" id="rg-kind">
            <option value="password">Password</option>
            <option value="string">Random string</option>
            <option value="token">API token / secret (hex)</option>
            <option value="pin">Numeric PIN</option>
          </select>
          <label>Length</label><input class="mini" id="rg-len" type="number" min="1" max="256" value="16" style="width:70px">
          <label>Count</label><input class="mini" id="rg-count" type="number" min="1" max="100" value="5" style="width:70px">
          <button class="btn primary" data-a="gen">Generate</button>
          <button class="btn" data-a="copyall">Copy all</button>
        </div>
        <div class="field-row" id="rg-charsets">
          <label class="toggle-row"><input type="checkbox" id="rg-lower" checked> a-z</label>
          <label class="toggle-row"><input type="checkbox" id="rg-upper" checked> A-Z</label>
          <label class="toggle-row"><input type="checkbox" id="rg-digits" checked> 0-9</label>
          <label class="toggle-row"><input type="checkbox" id="rg-symbols"> symbols</label>
          <label class="toggle-row"><input type="checkbox" id="rg-ambig"> exclude ambiguous (0O1lI)</label>
        </div>
        <div id="rg-strength" class="field-row"></div>
        <div class="result-box" id="rg-out" style="font-size:13.5px;line-height:2"></div>
      </div>`;
    const AMBIG = /[0O1lI]/g;
    function charset(){
      let s = '';
      if (container.querySelector('#rg-lower').checked) s += 'abcdefghijklmnopqrstuvwxyz';
      if (container.querySelector('#rg-upper').checked) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (container.querySelector('#rg-digits').checked) s += '0123456789';
      if (container.querySelector('#rg-symbols').checked) s += '!@#$%^&*()_+-=[]{}|;:,.<>?';
      if (container.querySelector('#rg-ambig').checked) s = s.replace(AMBIG,'');
      return s || 'abcdefghijklmnopqrstuvwxyz';
    }
    function randomFrom(set, len){
      const arr = crypto.getRandomValues(new Uint32Array(len));
      return Array.from(arr, x=>set[x % set.length]).join('');
    }
    function strengthBits(len, poolSize){ return Math.round(len * Math.log2(poolSize)); }
    function gen(){
      const kind = container.querySelector('#rg-kind').value;
      const len = Math.max(1, Math.min(256, +container.querySelector('#rg-len').value||16));
      const count = Math.max(1, Math.min(100, +container.querySelector('#rg-count').value||5));
      container.querySelector('#rg-charsets').style.display = kind==='password'||kind==='string' ? 'flex' : 'none';
      const out = container.querySelector('#rg-out'); out.innerHTML='';
      let poolSize = 0;
      for (let i=0;i<count;i++){
        let val, pool;
        if (kind==='password' || kind==='string'){ pool = charset(); poolSize = pool.length; val = randomFrom(pool, len); }
        else if (kind==='pin'){ pool='0123456789'; poolSize=10; val = randomFrom(pool, len); }
        else { const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(len/2))); val = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').slice(0,len); poolSize=16; }
        const row = el('div',{style:'display:flex;gap:10px;align-items:center'}, el('span',{style:'flex:1;font-family:var(--mono)'}, val), el('span',{class:'icon-btn', onclick:()=>copyText(val)}, '⧉'));
        out.appendChild(row);
      }
      const bits = strengthBits(len, poolSize||62);
      const strengthEl = container.querySelector('#rg-strength');
      const label = bits<40?'Weak':bits<64?'Moderate':bits<90?'Strong':'Very strong';
      const color = bits<40?'var(--danger)':bits<64?'var(--warning)':'var(--success)';
      strengthEl.innerHTML = `<span class="pill" style="background:${color}22;color:${color}">${label} · ~${bits} bits of entropy</span>`;
      api.setStatus(`Generated ${count}`, true);
    }
    container.querySelector('[data-a="gen"]').addEventListener('click', gen);
    container.querySelector('#rg-kind').addEventListener('change', gen);
    ['#rg-lower','#rg-upper','#rg-digits','#rg-symbols','#rg-ambig'].forEach(sel=>container.querySelector(sel).addEventListener('change', gen));
    container.querySelector('[data-a="copyall"]').addEventListener('click', ()=>{
      const vals = [...container.querySelectorAll('#rg-out > div > span:first-child')].map(s=>s.textContent);
      copyText(vals.join('\n'), `${vals.length} values copied`);
    });
    gen();
    return {
      getState: ()=>({kind:container.querySelector('#rg-kind').value, len:container.querySelector('#rg-len').value, count:container.querySelector('#rg-count').value,
        lower:container.querySelector('#rg-lower').checked, upper:container.querySelector('#rg-upper').checked, digits:container.querySelector('#rg-digits').checked,
        symbols:container.querySelector('#rg-symbols').checked, ambig:container.querySelector('#rg-ambig').checked}),
      setState: (s)=>{
        container.querySelector('#rg-kind').value = s.kind||'password'; container.querySelector('#rg-len').value = s.len||16; container.querySelector('#rg-count').value = s.count||5;
        container.querySelector('#rg-lower').checked = !!s.lower; container.querySelector('#rg-upper').checked = !!s.upper; container.querySelector('#rg-digits').checked = !!s.digits;
        container.querySelector('#rg-symbols').checked = !!s.symbols; container.querySelector('#rg-ambig').checked = !!s.ambig;
        gen();
      }
    };
  }
});

/* =========================================================================
   TOOL: HTTP Status Code Reference
   ========================================================================= */
const HTTP_STATUSES = [
  [100,'Continue','Interim response — the client should continue the request.'],
  [101,'Switching Protocols','Server is switching protocols as requested (e.g. to WebSocket).'],
  [200,'OK','Standard success response for GET/PUT/POST.'],
  [201,'Created','Request succeeded and a new resource was created — typical POST response.'],
  [202,'Accepted','Request accepted for processing but not yet completed.'],
  [204,'No Content','Success with no response body — common for DELETE.'],
  [206,'Partial Content','Range request fulfilled — used for resumable downloads/streaming.'],
  [301,'Moved Permanently','Resource permanently moved to a new URL; clients should update links.'],
  [302,'Found','Resource temporarily at a different URL.'],
  [304,'Not Modified','Cached version is still valid — used with ETag / If-Modified-Since.'],
  [307,'Temporary Redirect','Like 302 but guarantees the method/body are preserved.'],
  [308,'Permanent Redirect','Like 301 but guarantees the method/body are preserved.'],
  [400,'Bad Request','Malformed request syntax or invalid parameters.'],
  [401,'Unauthorized','Authentication is required and has failed or not been provided.'],
  [402,'Payment Required','Reserved for future use — occasionally used by APIs for billing.'],
  [403,'Forbidden','Authenticated but not permitted to access this resource.'],
  [404,'Not Found','The requested resource does not exist.'],
  [405,'Method Not Allowed','HTTP method isn\u2019t supported for this resource.'],
  [406,'Not Acceptable','Server can\u2019t produce a response matching the Accept headers.'],
  [408,'Request Timeout','Server timed out waiting for the request.'],
  [409,'Conflict','Request conflicts with the current state of the resource.'],
  [410,'Gone','Resource used to exist but has been permanently removed.'],
  [411,'Length Required','Content-Length header is required.'],
  [413,'Payload Too Large','Request body exceeds server limits.'],
  [414,'URI Too Long','The request URI is too long for the server to process.'],
  [415,'Unsupported Media Type','Request payload format isn\u2019t supported.'],
  [418,"I'm a teapot",'April Fools\u2019 joke from RFC 2324 — sometimes used intentionally in APIs.'],
  [422,'Unprocessable Entity','Well-formed request but semantically invalid (common for validation errors).'],
  [425,'Too Early','Server unwilling to process a request that might be replayed.'],
  [429,'Too Many Requests','Client has sent too many requests — rate limiting.'],
  [431,'Request Header Fields Too Large','Header section is too large.'],
  [451,'Unavailable For Legal Reasons','Resource withheld for legal reasons.'],
  [500,'Internal Server Error','Generic server-side failure.'],
  [501,'Not Implemented','Server doesn\u2019t support the functionality required.'],
  [502,'Bad Gateway','Upstream server returned an invalid response.'],
  [503,'Service Unavailable','Server temporarily unable to handle the request (overload/maintenance).'],
  [504,'Gateway Timeout','Upstream server failed to respond in time.'],
  [505,'HTTP Version Not Supported','Server doesn\u2019t support the HTTP version used.'],
  [507,'Insufficient Storage','Server unable to store the representation needed (WebDAV).'],
  [511,'Network Authentication Required','Client needs to authenticate to gain network access.'],
];
registerTool({
  id:'http-status-tool', name:'HTTP Status Reference', category:'Developer Utilities', icon:'#',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <input class="mini grow" id="hs-search" placeholder="Search code or description…">
          <select class="mini" id="hs-cat">
            <option value="">All categories</option>
            <option value="1">1xx Informational</option>
            <option value="2">2xx Success</option>
            <option value="3">3xx Redirection</option>
            <option value="4">4xx Client Error</option>
            <option value="5">5xx Server Error</option>
          </select>
        </div>
        <div class="result-box" id="hs-list" style="padding:0"></div>
      </div>`;
    function render(){
      const q = container.querySelector('#hs-search').value.trim().toLowerCase();
      const cat = container.querySelector('#hs-cat').value;
      const list = container.querySelector('#hs-list'); list.innerHTML='';
      const matches = HTTP_STATUSES.filter(([code,name,desc])=>
        (!cat || String(code)[0]===cat) &&
        (!q || String(code).includes(q) || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)));
      matches.forEach(([code,name,desc])=>{
        const color = code<300?'var(--success)':code<400?'var(--accent)':code<500?'var(--warning)':'var(--danger)';
        const row = el('div',{style:'display:flex;gap:12px;padding:9px 14px;border-bottom:1px solid var(--border-soft);align-items:flex-start'},
          el('span',{style:`font-weight:700;color:${color};min-width:44px;font-family:var(--mono)`}, code),
          el('div',{style:'flex:1'}, el('div',{style:'font-weight:600'}, name), el('div',{style:'color:var(--text-secondary);font-size:12px;margin-top:2px'}, desc)),
          el('span',{class:'icon-btn', onclick:()=>copyText(String(code))}, '⧉'));
        list.appendChild(row);
      });
      api.setStatus(`${matches.length} status codes`);
    }
    container.querySelector('#hs-search').addEventListener('input', debounce(render,100));
    container.querySelector('#hs-cat').addEventListener('change', render);
    render();
    return {
      getState: ()=>({q:container.querySelector('#hs-search').value, cat:container.querySelector('#hs-cat').value}),
      setState: (s)=>{ container.querySelector('#hs-search').value=s.q||''; container.querySelector('#hs-cat').value=s.cat||''; render(); }
    };
  }
});

/* =========================================================================
   TOOL: Color Picker & Converter
   ========================================================================= */
registerTool({
  id:'color-tool', name:'Color Picker & Converter', category:'Developer Utilities', icon:'\u25CF',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-body" style="flex-direction:column;overflow:auto">
          <div style="display:flex;gap:16px;padding:16px;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
              <input type="color" id="cl-picker" value="#6c8dff" style="width:110px;height:110px;border:none;border-radius:14px;cursor:pointer;background:none">
              <div id="cl-swatch" style="width:110px;height:36px;border-radius:8px;border:1px solid var(--border)"></div>
            </div>
            <div class="stack" style="flex:1;min-width:260px">
              <div class="field-row"><label style="min-width:50px">HEX</label><input class="mini grow" id="cl-hex" style="font-family:var(--mono)"><span class="icon-btn" data-c="cl-hex">⧉</span></div>
              <div class="field-row"><label style="min-width:50px">RGB</label><input class="mini grow" id="cl-rgb" style="font-family:var(--mono)"><span class="icon-btn" data-c="cl-rgb">⧉</span></div>
              <div class="field-row"><label style="min-width:50px">RGBA</label><input class="mini grow" id="cl-rgba" style="font-family:var(--mono)"><span class="icon-btn" data-c="cl-rgba">⧉</span></div>
              <div class="field-row"><label style="min-width:50px">HSL</label><input class="mini grow" id="cl-hsl" style="font-family:var(--mono)"><span class="icon-btn" data-c="cl-hsl">⧉</span></div>
              <div class="field-row"><label style="min-width:50px">Alpha</label><input type="range" id="cl-alpha" min="0" max="100" value="100" style="flex:1"><span id="cl-alpha-val" style="width:36px;font-family:var(--mono);font-size:11.5px">100%</span></div>
            </div>
          </div>
          <div class="card" style="margin:0 16px 16px"><h4>Palette</h4><div id="cl-palette" style="display:flex;flex-direction:column;gap:10px"></div></div>
          <div class="card" style="margin:0 16px 16px">
            <h4>Contrast checker</h4>
            <div class="field-row"><label>Foreground</label><input type="color" id="cl-fg" value="#e6e8ee"><label style="margin-left:12px">Background</label><input type="color" id="cl-bg" value="#14151a"></div>
            <div id="cl-contrast" style="padding:6px 0"></div>
          </div>
        </div>
      </div>`;
    function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
    function hexToRgb(hex){
      hex = hex.replace('#','');
      if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
      const n = parseInt(hex,16);
      return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
    }
    function rgbToHex({r,g,b}){ return '#'+[r,g,b].map(x=>clamp(Math.round(x),0,255).toString(16).padStart(2,'0')).join(''); }
    function rgbToHsl({r,g,b}){
      r/=255; g/=255; b/=255;
      const max=Math.max(r,g,b), min=Math.min(r,g,b); let h,s,l=(max+min)/2;
      if (max===min){ h=s=0; } else {
        const d = max-min; s = l>0.5 ? d/(2-max-min) : d/(max+min);
        switch(max){ case r: h=(g-b)/d+(g<b?6:0); break; case g: h=(b-r)/d+2; break; default: h=(r-g)/d+4; }
        h/=6;
      }
      return {h:Math.round(h*360), s:Math.round(s*100), l:Math.round(l*100)};
    }
    function hslToRgb({h,s,l}){
      h/=360; s/=100; l/=100;
      if (s===0){ const v=Math.round(l*255); return {r:v,g:v,b:v}; }
      const q = l<0.5 ? l*(1+s) : l+s-l*s;
      const p = 2*l-q;
      const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
      return { r:Math.round(hue2rgb(p,q,h+1/3)*255), g:Math.round(hue2rgb(p,q,h)*255), b:Math.round(hue2rgb(p,q,h-1/3)*255) };
    }
    let current = hexToRgb('#6c8dff'), alpha = 100;
    function updateFields(skip){
      const hex = rgbToHex(current), hsl = rgbToHsl(current);
      if (skip!=='hex') container.querySelector('#cl-hex').value = hex;
      if (skip!=='rgb') container.querySelector('#cl-rgb').value = `rgb(${current.r}, ${current.g}, ${current.b})`;
      if (skip!=='rgba') container.querySelector('#cl-rgba').value = `rgba(${current.r}, ${current.g}, ${current.b}, ${(alpha/100).toFixed(2)})`;
      if (skip!=='hsl') container.querySelector('#cl-hsl').value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
      container.querySelector('#cl-picker').value = hex;
      container.querySelector('#cl-swatch').style.background = `rgba(${current.r},${current.g},${current.b},${alpha/100})`;
      container.querySelector('#cl-alpha-val').textContent = alpha+'%';
      renderPalette(hsl);
    }
    function renderPalette(hsl){
      const box = container.querySelector('#cl-palette'); box.innerHTML='';
      function row(label, colors){
        const r = el('div',{});
        r.appendChild(el('div',{style:'font-size:10.5px;color:var(--text-dim);margin-bottom:4px'}, label));
        const swatches = el('div',{style:'display:flex;gap:6px'});
        colors.forEach(c=>{
          const hex = rgbToHex(hslToRgb(c));
          const sw = el('div',{style:`width:36px;height:36px;border-radius:7px;background:${hex};border:1px solid var(--border);cursor:pointer`, title:hex});
          sw.addEventListener('click', ()=>copyText(hex));
          swatches.appendChild(sw);
        });
        r.appendChild(swatches);
        box.appendChild(r);
      }
      row('Complementary', [hsl, {h:(hsl.h+180)%360, s:hsl.s, l:hsl.l}]);
      row('Analogous', [-30,-15,0,15,30].map(d=>({h:(hsl.h+d+360)%360, s:hsl.s, l:hsl.l})));
      row('Monochrome', [20,35,50,65,80].map(l=>({h:hsl.h, s:hsl.s, l})));
    }
    function fromHex(v){ try{ current = hexToRgb(v); updateFields('hex'); }catch(e){} }
    function fromRgbString(v, key){
      const m = v.match(/([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?/);
      if (!m) return;
      current = {r:clamp(+m[1],0,255), g:clamp(+m[2],0,255), b:clamp(+m[3],0,255)};
      if (m[4]!==undefined) alpha = clamp(Math.round(+m[4]*100),0,100);
      updateFields(key);
    }
    function fromHsl(v){
      const m = v.match(/([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?/);
      if (!m) return;
      current = hslToRgb({h:+m[1]%360, s:clamp(+m[2],0,100), l:clamp(+m[3],0,100)});
      updateFields('hsl');
    }
    container.querySelector('#cl-picker').addEventListener('input', e=>fromHex(e.target.value));
    container.querySelector('#cl-hex').addEventListener('change', e=>fromHex(e.target.value));
    container.querySelector('#cl-rgb').addEventListener('change', e=>fromRgbString(e.target.value,'rgb'));
    container.querySelector('#cl-rgba').addEventListener('change', e=>fromRgbString(e.target.value,'rgba'));
    container.querySelector('#cl-hsl').addEventListener('change', e=>fromHsl(e.target.value));
    container.querySelector('#cl-alpha').addEventListener('input', e=>{ alpha=+e.target.value; updateFields(); });
    container.addEventListener('click', e=>{
      const id = e.target.getAttribute && e.target.getAttribute('data-c');
      if (id) copyText(container.querySelector('#'+id).value);
    });
    function luminance({r,g,b}){
      const f = v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
      return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
    }
    function contrastRatio(c1,c2){
      const l1=luminance(c1), l2=luminance(c2);
      const [a,b] = l1>l2 ? [l1,l2] : [l2,l1];
      return (a+0.05)/(b+0.05);
    }
    function updateContrast(){
      const fg = hexToRgb(container.querySelector('#cl-fg').value);
      const bg = hexToRgb(container.querySelector('#cl-bg').value);
      const ratio = contrastRatio(fg,bg);
      const box = container.querySelector('#cl-contrast');
      const badge = (pass,label)=>`<span class="pill ${pass?'ok':'err'}" style="margin-right:6px">${label} ${pass?'Pass':'Fail'}</span>`;
      box.innerHTML = `<div style="font-family:var(--mono);font-size:20px;margin-bottom:8px">${ratio.toFixed(2)}:1</div>` +
        badge(ratio>=4.5,'AA normal') + badge(ratio>=3,'AA large') + badge(ratio>=7,'AAA normal') + badge(ratio>=4.5,'AAA large');
    }
    container.querySelector('#cl-fg').addEventListener('input', updateContrast);
    container.querySelector('#cl-bg').addEventListener('input', updateContrast);
    updateFields(); updateContrast();
    return {
      getState: ()=>({hex: rgbToHex(current), alpha}),
      setState: (s)=>{ if (s.hex) current = hexToRgb(s.hex); if (s.alpha!=null) alpha = s.alpha; updateFields(); }
    };
  }
});

/* =========================================================================
   TOOL: Markdown Table Generator
   ========================================================================= */
registerTool({
  id:'mdtable-tool', name:'Markdown Table Generator', category:'Developer Utilities', icon:'\u2637',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <button class="btn" data-a="addrow">+ Row</button>
          <button class="btn" data-a="addcol">+ Column</button>
          <button class="btn ghost" data-a="delrow">- Row</button>
          <button class="btn ghost" data-a="delcol">- Column</button>
          <span class="grow"></span>
          <button class="btn" data-a="copy">Copy Markdown</button>
        </div>
        <div style="padding:14px;overflow:auto" id="mdt-grid"></div>
        <div class="split-header">Markdown output</div>
        <textarea class="plain-textarea" id="mdt-out" readonly style="flex:0 0 140px;font-size:12px"></textarea>
      </div>`;
    let cols = ['Column A','Column B','Column C'];
    let aligns = ['left','left','left'];
    let rows = [['a1','b1','c1'],['a2','b2','c2']];
    function renderGrid(){
      const grid = container.querySelector('#mdt-grid');
      const table = el('table',{style:'border-collapse:collapse'});
      const headRow = el('tr',{});
      cols.forEach((c,ci)=>{
        const th = el('th',{style:'border:1px solid var(--border);padding:0'});
        const inp = el('input',{class:'mini', style:'border:none;font-weight:700;width:120px', value:c});
        inp.addEventListener('input', e=>cols[ci]=e.target.value);
        inp.addEventListener('change', renderOutput);
        const alignSel = el('select',{class:'mini', style:'border:none;font-size:10px;width:120px'},
          el('option',{value:'left'},'left'), el('option',{value:'center'},'center'), el('option',{value:'right'},'right'));
        alignSel.value = aligns[ci];
        alignSel.addEventListener('change', e=>{ aligns[ci]=e.target.value; renderOutput(); });
        th.appendChild(inp); th.appendChild(alignSel);
        headRow.appendChild(th);
      });
      table.appendChild(headRow);
      rows.forEach((row,ri)=>{
        const tr = el('tr',{});
        row.forEach((cell,ci)=>{
          const td = el('td',{style:'border:1px solid var(--border);padding:0'});
          const inp = el('input',{class:'mini', style:'border:none;width:120px', value:cell});
          inp.addEventListener('input', e=>{ rows[ri][ci]=e.target.value; });
          inp.addEventListener('change', renderOutput);
          td.appendChild(inp);
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      grid.innerHTML=''; grid.appendChild(table);
    }
    function renderOutput(){
      const alignMark = a => a==='center' ? ':---:' : a==='right' ? '---:' : '---';
      let out = '| ' + cols.join(' | ') + ' |\n';
      out += '| ' + aligns.map(alignMark).join(' | ') + ' |\n';
      rows.forEach(r=> out += '| ' + r.map(c=>c.replace(/\|/g,'\\|')).join(' | ') + ' |\n');
      container.querySelector('#mdt-out').value = out;
      api.setStatus(`${rows.length} rows × ${cols.length} cols`);
    }
    container.querySelector('#mdt-grid').addEventListener('click', ()=>{});
    container.querySelector('[data-a="addrow"]').addEventListener('click', ()=>{ rows.push(cols.map(()=>'')); renderGrid(); renderOutput(); });
    container.querySelector('[data-a="addcol"]').addEventListener('click', ()=>{ cols.push('Column '+(cols.length+1)); aligns.push('left'); rows.forEach(r=>r.push('')); renderGrid(); renderOutput(); });
    container.querySelector('[data-a="delrow"]').addEventListener('click', ()=>{ if (rows.length>1) rows.pop(); renderGrid(); renderOutput(); });
    container.querySelector('[data-a="delcol"]').addEventListener('click', ()=>{ if (cols.length>1){ cols.pop(); aligns.pop(); rows.forEach(r=>r.pop()); } renderGrid(); renderOutput(); });
    container.querySelector('[data-a="copy"]').addEventListener('click', ()=>copyText(container.querySelector('#mdt-out').value));
    renderGrid(); renderOutput();
    return {
      getState: ()=>({cols:[...cols], aligns:[...aligns], rows: rows.map(r=>[...r])}),
      setState: (s)=>{ cols=s.cols||cols; aligns=s.aligns||aligns; rows=s.rows||rows; renderGrid(); renderOutput(); }
    };
  }
});

/* =========================================================================
   TOOL: CSV <-> JSON Converter (dedicated — richer than the generic Data Converter)
   ========================================================================= */
registerTool({
  id:'csvjson-tool', name:'CSV \u2194 JSON', category:'Core Tools', icon:'\u2317',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <button class="btn primary" data-a="csv2json">CSV \u2192 JSON</button>
          <button class="btn" data-a="json2csv">JSON \u2192 CSV</button>
          <label class="toggle-row"><input type="checkbox" id="cj-header" checked> Has header row</label>
          <label class="toggle-row"><input type="checkbox" id="cj-nested" checked> Nest dot-path columns (a.b.c)</label>
          <select class="mini" id="cj-delim"><option value=",">, comma</option><option value=";">; semicolon</option><option value="\t">tab</option></select>
          <span class="grow"></span>
          <label class="btn ghost" style="cursor:pointer">Import file… <input type="file" id="cj-file" accept=".csv,.json" style="display:none"></label>
          <button class="btn" data-a="download">Download output</button>
        </div>
        <div class="err-banner" id="cj-err"></div>
        <div class="tool-body">
          <div class="split"><div class="split-header">Input</div><textarea class="plain-textarea" id="cj-in" placeholder="Paste CSV or JSON…">name,role,address.city,address.zip
Ada Lovelace,Engineer,London,SW1A
Grace Hopper,Admiral,Arlington,22201</textarea></div>
          <div class="split">
            <div class="split-header">Preview <span class="grow"></span><span class="pill" id="cj-status">—</span></div>
            <div id="cj-preview" style="flex:0 0 45%;overflow:auto;border-bottom:1px solid var(--border)"></div>
            <div class="split-header">Output</div>
            <textarea class="plain-textarea" id="cj-out" readonly></textarea>
          </div>
        </div>
      </div>`;
    function setNested(obj, path, value){
      const parts = path.split('.');
      let cur = obj;
      for (let i=0;i<parts.length-1;i++){ cur[parts[i]] = cur[parts[i]] || {}; cur = cur[parts[i]]; }
      cur[parts[parts.length-1]] = value;
    }
    function flatten(obj, prefix=''){
      let out = {};
      for (const [k,v] of Object.entries(obj)){
        const key = prefix ? prefix+'.'+k : k;
        if (v && typeof v==='object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
        else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
      }
      return out;
    }
    function renderPreview(rows){
      const box = container.querySelector('#cj-preview'); box.innerHTML='';
      if (!rows || !rows.length){ box.innerHTML = '<div style="padding:10px;color:var(--text-dim)">No rows to preview</div>'; return; }
      const cols = Object.keys(rows[0]);
      const table = el('table',{class:'kv', style:'width:100%'});
      const head = el('tr',{}); cols.forEach(c=>head.appendChild(el('td',{style:'font-weight:700;color:var(--text-primary)'},c))); table.appendChild(head);
      rows.slice(0,50).forEach(r=>{
        const tr = el('tr',{}); cols.forEach(c=>tr.appendChild(el('td',{}, r[c]===undefined?'':String(r[c])))); table.appendChild(tr);
      });
      box.appendChild(table);
      if (rows.length>50) box.appendChild(el('div',{style:'padding:6px;color:var(--text-dim);font-size:11px'}, `…and ${rows.length-50} more rows`));
    }
    function csv2json(){
      const delim = container.querySelector('#cj-delim').value;
      const hasHeader = container.querySelector('#cj-header').checked;
      const nested = container.querySelector('#cj-nested').checked;
      const bnr = container.querySelector('#cj-err');
      try{
        const parsed = Papa.parse(container.querySelector('#cj-in').value.trim(), {header:hasHeader, delimiter:delim, dynamicTyping:true, skipEmptyLines:true});
        if (parsed.errors.length) throw new Error(parsed.errors[0].message);
        let rows = parsed.data;
        let jsonRows;
        if (hasHeader){
          jsonRows = rows.map(r=>{
            if (!nested) return r;
            const obj = {};
            Object.entries(r).forEach(([k,v])=>setNested(obj,k,v));
            return obj;
          });
        } else jsonRows = rows;
        container.querySelector('#cj-out').value = JSON.stringify(jsonRows, null, STATE.indent);
        renderPreview(rows.map(r=>hasHeader?r:Object.fromEntries(r.map((v,i)=>['col'+i,v]))));
        bnr.classList.remove('show');
        container.querySelector('#cj-status').textContent = `${jsonRows.length} rows`; container.querySelector('#cj-status').className='pill ok';
        api.setStatus(`Converted ${jsonRows.length} rows`, true);
      }catch(e){ bnr.textContent = e.message; bnr.classList.add('show'); api.setStatus('CSV parse error', false); }
    }
    function json2csv(){
      const bnr = container.querySelector('#cj-err');
      try{
        const data = JSON.parse(container.querySelector('#cj-in').value);
        const arr = Array.isArray(data) ? data : [data];
        const flat = arr.map(o=>flatten(o));
        const csv = Papa.unparse(flat, {delimiter: container.querySelector('#cj-delim').value});
        container.querySelector('#cj-out').value = csv;
        renderPreview(flat);
        bnr.classList.remove('show');
        container.querySelector('#cj-status').textContent = `${arr.length} rows`; container.querySelector('#cj-status').className='pill ok';
        api.setStatus(`Converted ${arr.length} rows`, true);
      }catch(e){ bnr.textContent = e.message; bnr.classList.add('show'); api.setStatus('JSON parse error', false); }
    }
    container.querySelector('[data-a="csv2json"]').addEventListener('click', csv2json);
    container.querySelector('[data-a="json2csv"]').addEventListener('click', json2csv);
    container.querySelector('[data-a="download"]').addEventListener('click', ()=>{
      const out = container.querySelector('#cj-out').value;
      const looksJson = out.trim().startsWith('[') || out.trim().startsWith('{');
      download(looksJson?'output.json':'output.csv', out, looksJson?'application/json':'text/csv');
    });
    container.querySelector('#cj-file').addEventListener('change', async e=>{
      const f = e.target.files[0]; if (!f) return;
      container.querySelector('#cj-in').value = await readFileAsText(f);
      if (f.name.endsWith('.json')) json2csv(); else csv2json();
    });
    csv2json();
    return {
      getState: ()=>({input: container.querySelector('#cj-in').value, header:container.querySelector('#cj-header').checked, nested:container.querySelector('#cj-nested').checked, delim:container.querySelector('#cj-delim').value}),
      setState: (s)=>{
        container.querySelector('#cj-in').value = s.input||'';
        container.querySelector('#cj-header').checked = s.header!==false;
        container.querySelector('#cj-nested').checked = s.nested!==false;
        if (s.delim) container.querySelector('#cj-delim').value = s.delim;
        csv2json();
      }
    };
  }
});

/* =========================================================================
   TOOL: Cron Builder, Parser, Human-readable Translator & Next-run Calculator
   Scope note: standard 5-field Unix cron (minute hour day month weekday),
   plus an optional leading seconds field for basic Quartz-style expressions.
   Special Quartz characters (L, W, #, ?) are not supported — lists, ranges,
   steps, and wildcards are. Human -> cron covers common phrasings, not
   full natural language.
   ========================================================================= */
const CRON_PRESETS = [
  ['Every minute', '* * * * *'],
  ['Every 5 minutes', '*/5 * * * *'],
  ['Every 15 minutes', '*/15 * * * *'],
  ['Every 30 minutes', '*/30 * * * *'],
  ['Every hour', '0 * * * *'],
  ['Every day at midnight', '0 0 * * *'],
  ['Every day at 9am', '0 9 * * *'],
  ['Every weekday at 9am', '0 9 * * 1-5'],
  ['Every Sunday at midnight', '0 0 * * 0'],
  ['Every 1st of the month', '0 0 1 * *'],
  ['Every year on Jan 1st', '0 0 1 1 *'],
];
const MONTH_NAMES = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const DOW_NAMES = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
function cronParseField(str, min, max, names){
  str = str.trim().toLowerCase();
  if (names) Object.entries(names).forEach(([name,num])=>{ str = str.replace(new RegExp(name,'g'), num); });
  const out = new Set();
  str.split(',').forEach(part=>{
    let [range, step] = part.split('/');
    step = step ? parseInt(step,10) : 1;
    if (!step || step<1) throw new Error('Invalid step in "'+part+'"');
    let lo=min, hi=max;
    if (range !== '*'){
      if (range.includes('-')){ const [a,b] = range.split('-').map(n=>parseInt(n,10)); if (isNaN(a)||isNaN(b)) throw new Error('Invalid range "'+range+'"'); lo=a; hi=b; }
      else { const v = parseInt(range,10); if (isNaN(v)) throw new Error('Invalid value "'+range+'"'); lo=v; hi=v; }
    }
    if (lo<min||hi>max||lo>hi) throw new Error(`Value out of range (${min}-${max}) in "${part}"`);
    for (let v=lo; v<=hi; v+=step) out.add(v===7&&max===7?0:v); // normalize Sunday=7 to 0
  });
  return out;
}
function parseCron(expr){
  const parts = expr.trim().split(/\s+/);
  let sec=null, min, hour, day, month, weekday;
  if (parts.length===6){ [sec,min,hour,day,month,weekday] = parts; }
  else if (parts.length===5){ [min,hour,day,month,weekday] = parts; }
  else throw new Error('Expected 5 fields (or 6 with seconds), got '+parts.length);
  return {
    sec: sec!==null ? cronParseField(sec,0,59) : null,
    min: cronParseField(min,0,59),
    hour: cronParseField(hour,0,23),
    day: cronParseField(day,1,31),
    dayIsWild: day.trim()==='*',
    month: cronParseField(month,1,12,MONTH_NAMES),
    weekday: cronParseField(weekday,0,7,DOW_NAMES),
    weekdayIsWild: weekday.trim()==='*',
    raw: expr.trim()
  };
}
function cronMatches(fields, d){
  if (fields.sec && !fields.sec.has(d.getSeconds())) return false;
  if (!fields.min.has(d.getMinutes())) return false;
  if (!fields.hour.has(d.getHours())) return false;
  if (!fields.month.has(d.getMonth()+1)) return false;
  const dayOk = fields.day.has(d.getDate());
  const dowOk = fields.weekday.has(d.getDay());
  if (fields.dayIsWild && fields.weekdayIsWild) return true;
  if (fields.dayIsWild) return dowOk;
  if (fields.weekdayIsWild) return dayOk;
  return dayOk || dowOk; // classic cron OR-rule when both are restricted
}
function cronNextRuns(fields, count, from){
  const results = [];
  let d = new Date(from.getTime());
  const stepMs = fields.sec ? 1000 : 60000;
  if (!fields.sec) d.setSeconds(0,0);
  d = new Date(d.getTime() + stepMs);
  let guard = fields.sec ? 366*24*60*60 : 2*366*24*60; // ~1yr of seconds, or ~2yr of minutes
  while (results.length < count && guard-- > 0){
    if (cronMatches(fields, d)) results.push(new Date(d.getTime()));
    d = new Date(d.getTime() + stepMs);
  }
  return results;
}
function setToList(set, min, max){
  const arr = [...set].sort((a,b)=>a-b);
  if (arr.length === (max-min+1)) return null; // full range = "every"
  return arr;
}
const MONTH_LABELS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function cronToHuman(fields){
  const minList = setToList(fields.min, 0, 59);
  const hourList = setToList(fields.hour, 0, 23);
  const dayList = fields.dayIsWild ? null : setToList(fields.day, 1, 31);
  const monthList = setToList(fields.month, 1, 12);
  const dowList = fields.weekdayIsWild ? null : setToList(fields.weekday, 0, 6);


  // "every N minutes/hours" step detection
  const stepOf = (raw)=>{ const m = raw.match(/^\*\/(\d+)$/); return m ? +m[1] : null; };
  const cronFieldsRaw = fields.raw.split(/\s+/);
  const rawOffset = cronFieldsRaw.length===6 ? 1 : 0;
  const minStep = stepOf(cronFieldsRaw[rawOffset]);
  const hourStep = stepOf(cronFieldsRaw[rawOffset+1]);

  let time;
  if (minStep) time = `every ${minStep} minute${minStep===1?'':'s'}`;
  else if (hourStep) time = `every ${hourStep} hour${hourStep===1?'':'s'}, at minute ${[...fields.min][0]}`;
  else if (minList===null && hourList===null) time = 'every minute';
  else if (minList===null) time = `every minute of ${[...fields.hour].sort((a,b)=>a-b).map(h=>String(h).padStart(2,'0')+':00').join(', ')}`;
  else if (hourList===null) time = `at minute ${minList.join(', ')} of every hour`;
  else {
    const times = [...fields.hour].sort((a,b)=>a-b).flatMap(h=>[...fields.min].sort((a,b)=>a-b).map(m=>`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`));
    time = (times.length<=4 ? 'at ' : times.length+' times/day, at ') + times.slice(0,4).join(', ') + (times.length>4?', …':'');
  }

  let dayPart = '';
  if (dowList && dayList) dayPart = ` on day ${dayList.join(', ')} of the month or on ${dowList.map(d=>DOW_LABELS[d]).join(', ')}`;
  else if (dowList) dayPart = ` on ${dowList.map(d=>DOW_LABELS[d]).join(', ')}`;
  else if (dayList) dayPart = ` on day ${dayList.join(', ')} of the month`;

  let monthPart = monthList ? ` in ${monthList.map(m=>MONTH_LABELS[m]).join(', ')}` : '';

  return `Runs ${time}${dayPart}${monthPart}.`.replace(/\s+/g,' ');
}
function humanToCron(phrase){
  const p = phrase.trim().toLowerCase();
  let m;
  if (/^every minute$/.test(p)) return '* * * * *';
  if ((m = p.match(/^every (\d+) minutes?$/))) return `*/${m[1]} * * * *`;
  if ((m = p.match(/^every (\d+) hours?$/))) return `0 */${m[1]} * * *`;
  if (/^every hour$/.test(p)) return '0 * * * *';
  if (/^every day at midnight$/.test(p)) return '0 0 * * *';
  if ((m = p.match(/^every day at (\d{1,2}):?(\d{2})?\s*(am|pm)?$/))){
    let h = +m[1]; const min = m[2]?+m[2]:0; const ap = m[3];
    if (ap==='pm' && h<12) h+=12; if (ap==='am' && h===12) h=0;
    return `${min} ${h} * * *`;
  }
  if (/^every weekday(s)? at (\d{1,2})/.test(p)){
    const mm = p.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
    let h=+mm[1]; const min = mm[2]?+mm[2]:0; const ap=mm[3];
    if (ap==='pm'&&h<12) h+=12; if (ap==='am'&&h===12) h=0;
    return `${min} ${h} * * 1-5`;
  }
  for (const dname of Object.keys(DOW_NAMES)){
    if (p.startsWith('every '+dname)){
      const mm = p.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
      let h = mm ? +mm[1] : 0; const min = mm && mm[2] ? +mm[2] : 0; const ap = mm && mm[3];
      if (ap==='pm'&&h<12) h+=12; if (ap==='am'&&h===12) h=0;
      return `${min} ${h} * * ${DOW_NAMES[dname]}`;
    }
  }
  if (/^every week$/.test(p)) return '0 0 * * 0';
  if (/^every month$/.test(p)) return '0 0 1 * *';
  if (/^every year$/.test(p)) return '0 0 1 1 *';
  return null;
}

registerTool({
  id:'cron-tool', name:'Cron Builder', category:'Core Tools', icon:'\u23F0',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <select class="mini" id="cr-preset"><option value="">Presets…</option>${CRON_PRESETS.map(([n,e])=>`<option value="${escapeHtml(e)}">${escapeHtml(n)}</option>`).join('')}</select>
          <input class="mini grow" id="cr-expr" style="font-family:var(--mono);max-width:220px" value="*/5 * * * *">
          <span class="pill" id="cr-pill">—</span>
        </div>
        <div class="err-banner" id="cr-err"></div>
        <div class="grid-2" style="grid-template-columns:1fr 1fr">
          <div class="card">
            <h4>Visual builder</h4>
            <div id="cr-builder" class="stack"></div>
          </div>
          <div class="card">
            <h4>Human readable</h4>
            <div id="cr-human" style="font-size:13.5px;line-height:1.6;min-height:40px"></div>
            <div class="field-row" style="padding:10px 0 4px">
              <input class="mini grow" id="cr-h2c" placeholder="e.g. every 5 minutes / every day at 9am">
              <button class="btn" data-a="h2c">\u2192 Cron</button>
            </div>
          </div>
        </div>
        <div class="card" style="margin:0 12px 12px">
          <h4>Next runs</h4>
          <div class="field-row" style="padding:0 0 8px"><label>From</label><input type="datetime-local" class="mini" id="cr-from"><button class="btn ghost" data-a="now">Now</button></div>
          <div id="cr-runs" style="font-family:var(--mono);font-size:12.5px"></div>
        </div>
      </div>`;
    const FIELD_DEFS = [
      {key:'min', label:'Minute', min:0, max:59},
      {key:'hour', label:'Hour', min:0, max:23},
      {key:'day', label:'Day of month', min:1, max:31},
      {key:'month', label:'Month', min:1, max:12},
      {key:'weekday', label:'Weekday (0=Sun)', min:0, max:6},
    ];
    function buildExprFromBuilder(){
      const vals = FIELD_DEFS.map(f=>{
        const mode = container.querySelector(`[data-field="${f.key}"] .cr-mode`).value;
        if (mode==='every') return '*';
        if (mode==='step') return '*/' + (container.querySelector(`[data-field="${f.key}"] .cr-step`).value || '1');
        return container.querySelector(`[data-field="${f.key}"] .cr-list`).value || '*';
      });
      container.querySelector('#cr-expr').value = vals.join(' ');
      evaluate();
    }
    function renderBuilder(fields){
      const box = container.querySelector('#cr-builder'); box.innerHTML = '';
      FIELD_DEFS.forEach(f=>{
        const row = el('div',{'data-field':f.key, style:'display:flex;gap:6px;align-items:center'});
        row.appendChild(el('span',{style:'width:110px;font-size:11.5px;color:var(--text-secondary)'}, f.label));
        const mode = el('select',{class:'mini cr-mode'}, el('option',{value:'every'},'Every'), el('option',{value:'step'},'Every N'), el('option',{value:'list'},'Specific / range'));
        const step = el('input',{class:'mini cr-step', type:'number', min:'1', style:'width:60px;display:none', placeholder:'N'});
        const list = el('input',{class:'mini cr-list', style:'width:110px;display:none', placeholder:'e.g. 1,3,5 or 9-17'});
        mode.addEventListener('change', ()=>{
          step.style.display = mode.value==='step' ? 'inline-block':'none';
          list.style.display = mode.value==='list' ? 'inline-block':'none';
          buildExprFromBuilder();
        });
        step.addEventListener('input', debounce(buildExprFromBuilder,200));
        list.addEventListener('input', debounce(buildExprFromBuilder,200));
        row.appendChild(mode); row.appendChild(step); row.appendChild(list);
        box.appendChild(row);
      });
    }
    function syncBuilderFromFields(fields){
      FIELD_DEFS.forEach(f=>{
        const row = container.querySelector(`[data-field="${f.key}"]`); if (!row) return;
        const set = fields[f.key];
        const full = setToList(set, f.min, f.max) === null;
        const modeSel = row.querySelector('.cr-mode'), stepInp = row.querySelector('.cr-step'), listInp = row.querySelector('.cr-list');
        if (full){ modeSel.value='every'; stepInp.style.display='none'; listInp.style.display='none'; return; }
        const rawField = fields.raw.split(/\s+/)[fields.raw.split(/\s+/).length===6?FIELD_DEFS.indexOf(f)+1:FIELD_DEFS.indexOf(f)];
        const stepMatch = rawField && rawField.match(/^\*\/(\d+)$/);
        if (stepMatch){ modeSel.value='step'; stepInp.value = stepMatch[1]; stepInp.style.display='inline-block'; listInp.style.display='none'; }
        else { modeSel.value='list'; listInp.value = rawField; listInp.style.display='inline-block'; stepInp.style.display='none'; }
      });
    }
    function evaluate(){
      const expr = container.querySelector('#cr-expr').value;
      const bnr = container.querySelector('#cr-err');
      const pill = container.querySelector('#cr-pill');
      try{
        const fields = parseCron(expr);
        pill.textContent = 'Valid'; pill.className='pill ok'; bnr.classList.remove('show');
        container.querySelector('#cr-human').textContent = cronToHuman(fields);
        renderRuns(fields);
        if (!container.querySelector('#cr-builder').children.length) renderBuilder(fields);
        syncBuilderFromFields(fields);
        api.setStatus('Valid cron expression', true);
        return fields;
      }catch(e){
        pill.textContent = 'Invalid'; pill.className='pill err';
        bnr.textContent = e.message; bnr.classList.add('show');
        container.querySelector('#cr-human').textContent = '';
        container.querySelector('#cr-runs').innerHTML = '';
        api.setStatus(e.message, false);
        return null;
      }
    }
    function renderRuns(fields){
      const fromInput = container.querySelector('#cr-from').value;
      const from = fromInput ? new Date(fromInput) : new Date();
      const runs = cronNextRuns(fields, 5, from);
      const box = container.querySelector('#cr-runs'); box.innerHTML = '';
      if (!runs.length){ box.textContent = 'No upcoming run found in the search window.'; return; }
      const msUntil = runs[0].getTime() - Date.now();
      box.appendChild(el('div',{style:'color:var(--text-dim);margin-bottom:6px'}, `Next run in ${humanizeMs(msUntil)}`));
      runs.forEach(r=>box.appendChild(el('div',{}, r.toLocaleString())));
    }
    function humanizeMs(ms){
      if (ms<0) return 'the past (check your "from" time)';
      const s = Math.floor(ms/1000);
      const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
      const parts = [];
      if (d) parts.push(d+'d'); if (h) parts.push(h+'h'); if (m || !parts.length) parts.push(m+'m');
      return parts.join(' ');
    }
    container.querySelector('#cr-expr').addEventListener('input', debounce(evaluate, 200));
    container.querySelector('#cr-preset').addEventListener('change', e=>{ if (e.target.value){ container.querySelector('#cr-expr').value = e.target.value; evaluate(); } });
    container.querySelector('#cr-from').addEventListener('change', ()=>evaluate());
    container.querySelector('[data-a="now"]').addEventListener('click', ()=>{ container.querySelector('#cr-from').value=''; evaluate(); });
    container.querySelector('[data-a="h2c"]').addEventListener('click', ()=>{
      const phrase = container.querySelector('#cr-h2c').value;
      const cron = humanToCron(phrase);
      if (cron){ container.querySelector('#cr-expr').value = cron; evaluate(); toast('Translated to cron','ok'); }
      else toast('Could not translate that phrase — try e.g. "every 5 minutes" or "every day at 9am"','err');
    });
    evaluate();
    return {
      getState: ()=>({expr: container.querySelector('#cr-expr').value, from: container.querySelector('#cr-from').value}),
      setState: (s)=>{ container.querySelector('#cr-expr').value = s.expr||'* * * * *'; container.querySelector('#cr-from').value = s.from||''; evaluate(); }
    };
  }
});

/* =========================================================================
   X.509 CERTIFICATE PARSING CORE (pure functions, DOM-independent)
   Hand-rolled minimal DER/ASN.1 reader — no external crypto/ASN.1 library.
   Verified field-for-field (version, serial, issuer, subject, validity,
   SAN, extensions, fingerprints) against real openssl-generated
   certificates during development; not a general-purpose ASN.1 parser —
   covers exactly what X.509 v1/v3 certificates need.
   ========================================================================= */
function derReadLength(bytes, pos){
  let b = bytes[pos]; pos++;
  if ((b & 0x80) === 0) return {length:b, pos};
  const numBytes = b & 0x7f;
  if (numBytes === 0) throw new Error('Indefinite length not supported in DER');
  let len = 0;
  for (let i=0;i<numBytes;i++){ len = (len*256) + bytes[pos]; pos++; }
  return {length:len, pos};
}
function derReadTLV(bytes, pos){
  if (pos >= bytes.length) throw new Error('Unexpected end of certificate data');
  const tagByte = bytes[pos];
  const tagClass = (tagByte & 0xC0) >> 6;
  const constructed = !!(tagByte & 0x20);
  const tag = tagByte & 0x1F;
  let p = pos+1;
  const {length, pos:p2} = derReadLength(bytes, p);
  const contentStart = p2, contentEnd = p2+length;
  if (contentEnd > bytes.length) throw new Error('Certificate data is truncated or malformed');
  return {tagByte, tagClass, constructed, tag, length, contentStart, contentEnd, nextPos: contentEnd};
}
function derReadAll(bytes, start, end){
  const out = []; let pos = start;
  while (pos < end){ const tlv = derReadTLV(bytes, pos); out.push(tlv); pos = tlv.nextPos; }
  return out;
}
function derOid(bytes, start, end){
  let arcs = [];
  const first = bytes[start];
  if (first < 40) arcs.push(0, first);
  else if (first < 80) arcs.push(1, first-40);
  else arcs.push(2, first-80);
  let val = 0;
  for (let i=start+1; i<end; i++){
    val = val*128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)){ arcs.push(val); val = 0; }
  }
  return arcs.join('.');
}
function derInt(bytes, start, end){
  let hex = '';
  for (let i=start;i<end;i++) hex += bytes[i].toString(16).padStart(2,'0');
  return hex.replace(/^00/,'') || '00';
}
function derIntSmall(bytes, start, end){ let v=0; for (let i=start;i<end;i++) v = v*256+bytes[i]; return v; }
function derBytesToAscii(bytes, start, end){ let s=''; for (let i=start;i<end;i++) s += String.fromCharCode(bytes[i]); return s; }
function derUtf8(bytes, start, end){ return new TextDecoder('utf-8').decode(bytes.slice(start,end)); }
function derTime(bytes, tlv){
  const s = derBytesToAscii(bytes, tlv.contentStart, tlv.contentEnd);
  let y,mo,d,h,mi,se;
  if (tlv.tag === 23){ let yy=+s.slice(0,2); y = yy<50 ? 2000+yy : 1900+yy; mo=+s.slice(2,4); d=+s.slice(4,6); h=+s.slice(6,8); mi=+s.slice(8,10); se=+s.slice(10,12); }
  else { y=+s.slice(0,4); mo=+s.slice(4,6); d=+s.slice(6,8); h=+s.slice(8,10); mi=+s.slice(10,12); se=+s.slice(12,14); }
  return new Date(Date.UTC(y, mo-1, d, h, mi, se));
}
const X509_ATTR_NAMES = {'2.5.4.3':'CN','2.5.4.6':'C','2.5.4.7':'L','2.5.4.8':'ST','2.5.4.10':'O','2.5.4.11':'OU','2.5.4.5':'serialNumber','2.5.4.9':'STREET','2.5.4.17':'postalCode','1.2.840.113549.1.9.1':'emailAddress'};
const X509_SIGALG_NAMES = {'1.2.840.113549.1.1.5':'sha1WithRSAEncryption','1.2.840.113549.1.1.11':'sha256WithRSAEncryption','1.2.840.113549.1.1.12':'sha384WithRSAEncryption','1.2.840.113549.1.1.13':'sha512WithRSAEncryption','1.2.840.10045.4.3.2':'ecdsa-with-SHA256','1.2.840.10045.4.3.3':'ecdsa-with-SHA384','1.2.840.10045.4.3.4':'ecdsa-with-SHA512','1.2.840.113549.1.1.1':'rsaEncryption'};
const X509_EXT_NAMES = {'2.5.29.17':'subjectAltName','2.5.29.15':'keyUsage','2.5.29.19':'basicConstraints','2.5.29.14':'subjectKeyIdentifier','2.5.29.35':'authorityKeyIdentifier','2.5.29.37':'extKeyUsage','2.5.29.31':'cRLDistributionPoints','2.5.29.32':'certificatePolicies','1.3.6.1.5.5.7.1.1':'authorityInfoAccess'};
function derParseName(bytes, start, end){
  const rdns = derReadAll(bytes, start, end);
  const parts = [];
  rdns.forEach(rdnSet=>{
    derReadAll(bytes, rdnSet.contentStart, rdnSet.contentEnd).forEach(atv=>{
      const kv = derReadAll(bytes, atv.contentStart, atv.contentEnd);
      const oid = derOid(bytes, kv[0].contentStart, kv[0].contentEnd);
      const v = kv[1];
      const value = (v.tag===12) ? derUtf8(bytes, v.contentStart, v.contentEnd) : derBytesToAscii(bytes, v.contentStart, v.contentEnd);
      parts.push({oid, name: X509_ATTR_NAMES[oid]||oid, value});
    });
  });
  return parts;
}
function x509NameToString(parts){ return parts.map(p=>`${p.name}=${p.value}`).join(', '); }
function derParseSAN(bytes, extnValueBytes){
  const seq = derReadTLV(extnValueBytes, 0);
  return derReadAll(extnValueBytes, seq.contentStart, seq.contentEnd).map(n=>{
    if (n.tagClass!==2) return {type:'other', value:'(unsupported)'};
    switch(n.tag){
      case 1: return {type:'email', value: derBytesToAscii(extnValueBytes, n.contentStart, n.contentEnd)};
      case 2: return {type:'DNS', value: derBytesToAscii(extnValueBytes, n.contentStart, n.contentEnd)};
      case 6: return {type:'URI', value: derBytesToAscii(extnValueBytes, n.contentStart, n.contentEnd)};
      case 7: {
        const len = n.contentEnd-n.contentStart;
        if (len===4) return {type:'IP', value: Array.from(extnValueBytes.slice(n.contentStart,n.contentEnd)).join('.')};
        if (len===16){ const g=[]; for (let i=0;i<16;i+=2) g.push(((extnValueBytes[n.contentStart+i]<<8)|extnValueBytes[n.contentStart+i+1]).toString(16)); return {type:'IP', value:g.join(':')}; }
        return {type:'IP', value:'(unrecognized length)'};
      }
      default: return {type:'other('+n.tag+')', value:'(not decoded)'};
    }
  });
}
function parseCertificateDER(bytes){
  const cert = derReadTLV(bytes, 0);
  const certParts = derReadAll(bytes, cert.contentStart, cert.contentEnd);
  const tbs = certParts[0];
  const tbsChildren = derReadAll(bytes, tbs.contentStart, tbs.contentEnd);
  let idx=0, version=1;
  if (tbsChildren[idx].tagClass===2 && tbsChildren[idx].tag===0){
    const inner = derReadTLV(bytes, tbsChildren[idx].contentStart);
    version = derIntSmall(bytes, inner.contentStart, inner.contentEnd)+1;
    idx++;
  }
  const serialTlv = tbsChildren[idx++];
  const serialHex = derInt(bytes, serialTlv.contentStart, serialTlv.contentEnd);
  const sigAlgTlv = tbsChildren[idx++];
  const sigAlgChildren = derReadAll(bytes, sigAlgTlv.contentStart, sigAlgTlv.contentEnd);
  const sigAlgOid = derOid(bytes, sigAlgChildren[0].contentStart, sigAlgChildren[0].contentEnd);
  const issuer = derParseName(bytes, tbsChildren[idx].contentStart, tbsChildren[idx].contentEnd); idx++;
  const validityChildren = derReadAll(bytes, tbsChildren[idx].contentStart, tbsChildren[idx].contentEnd); idx++;
  const notBefore = derTime(bytes, validityChildren[0]), notAfter = derTime(bytes, validityChildren[1]);
  const subject = derParseName(bytes, tbsChildren[idx].contentStart, tbsChildren[idx].contentEnd); idx++;
  idx++; // subjectPublicKeyInfo — not decoded in detail
  let extensions = [];
  for (; idx<tbsChildren.length; idx++){
    const t = tbsChildren[idx];
    if (t.tagClass===2 && t.tag===3){
      const extSeq = derReadTLV(bytes, t.contentStart);
      extensions = derReadAll(bytes, extSeq.contentStart, extSeq.contentEnd).map(extTlv=>{
        const children = derReadAll(bytes, extTlv.contentStart, extTlv.contentEnd);
        const oid = derOid(bytes, children[0].contentStart, children[0].contentEnd);
        let critical=false, vi=1;
        if (children[1].tag===1){ critical = bytes[children[1].contentStart]!==0; vi=2; }
        const octetTlv = children[vi];
        const valueBytes = bytes.slice(octetTlv.contentStart, octetTlv.contentEnd);
        let summary=null, san=null;
        if (oid==='2.5.29.17'){ san = derParseSAN(bytes, valueBytes); summary = san.map(s=>`${s.type}:${s.value}`).join(', '); }
        else summary = Array.from(valueBytes.slice(0,40)).map(b=>b.toString(16).padStart(2,'0')).join(':') + (valueBytes.length>40?'…':'');
        return {oid, name: X509_EXT_NAMES[oid]||oid, critical, summary, san};
      });
    }
  }
  return {
    version, serialHex, sigAlgOid, sigAlgName: X509_SIGALG_NAMES[sigAlgOid]||sigAlgOid,
    issuer, issuerStr: x509NameToString(issuer), subject, subjectStr: x509NameToString(subject),
    notBefore, notAfter, extensions, san: (extensions.find(e=>e.oid==='2.5.29.17')||{}).san || [],
  };
}
function pemBlocksToDER(pemText){
  const blocks = [];
  const re = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  let m;
  while ((m = re.exec(pemText))){
    const b64 = m[1].replace(/\s+/g,'');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    blocks.push(bytes);
  }
  return blocks;
}

registerTool({
  id:'x509-tool', name:'X.509 Certificate Decoder', category:'Developer Utilities', icon:'\u26E8',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar"><span style="font-size:12px;color:var(--text-dim)">Paste one or more PEM certificates — parsing happens entirely in your browser.</span></div>
        <div class="tool-body" style="flex-direction:column">
          <textarea class="plain-textarea" id="x5-in" style="flex:0 0 160px;font-size:11.5px" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
          <div class="err-banner" id="x5-err"></div>
          <div class="tool-toolbar" id="x5-chain-tabs" style="display:none"></div>
          <div id="x5-out" style="flex:1;overflow:auto;padding:14px"></div>
        </div>
      </div>`;
    let certs = [], activeIdx = 0;
    function fieldTable(rows){
      const t = el('table',{class:'kv'});
      rows.forEach(([k,v])=>t.appendChild(el('tr',{}, el('td',{},k), el('td',{}, v))));
      return t;
    }
    async function renderCert(i){
      const c = certs[i];
      const box = container.querySelector('#x5-out'); box.innerHTML='';
      const now = new Date();
      const expired = now > c.notAfter, notYetValid = now < c.notBefore;
      const validityBadge = expired ? el('span',{class:'pill err'},'Expired') : notYetValid ? el('span',{class:'pill err'},'Not yet valid') : el('span',{class:'pill ok'},'Valid');

      const card1 = el('div',{class:'card', style:'margin-bottom:12px'});
      card1.appendChild(el('h4',{}, 'Certificate'));
      card1.appendChild(fieldTable([
        ['Version', 'v'+c.version],
        ['Serial Number', c.serialHex],
        ['Signature Algorithm', c.sigAlgName],
        ['Subject', c.subjectStr],
        ['Issuer', c.issuerStr],
        ['Self-signed', c.subjectStr===c.issuerStr ? 'Yes' : 'No'],
      ]));
      box.appendChild(card1);

      const card2 = el('div',{class:'card', style:'margin-bottom:12px'});
      card2.appendChild(el('h4',{},'Validity'));
      const vRow = el('div',{style:'display:flex;align-items:center;gap:10px;margin-bottom:8px'}, validityBadge, el('span',{style:'color:var(--text-dim);font-size:11.5px'}, `${c.notBefore.toLocaleString()} \u2192 ${c.notAfter.toLocaleString()}`));
      card2.appendChild(vRow);
      card2.appendChild(fieldTable([['Valid From', c.notBefore.toISOString()], ['Valid Until', c.notAfter.toISOString()]]));
      box.appendChild(card2);

      if (c.san.length){
        const card3 = el('div',{class:'card', style:'margin-bottom:12px'});
        card3.appendChild(el('h4',{},'Subject Alternative Names'));
        const list = el('div',{style:'display:flex;flex-direction:column;gap:4px;font-family:var(--mono);font-size:12px'});
        c.san.forEach(s=>list.appendChild(el('div',{}, `${s.type}: ${s.value}`)));
        card3.appendChild(list);
        box.appendChild(card3);
      }

      if (c.extensions.length){
        const card4 = el('div',{class:'card', style:'margin-bottom:12px'});
        card4.appendChild(el('h4',{},'Extensions'));
        const t = el('table',{class:'kv'});
        c.extensions.forEach(e=>{
          t.appendChild(el('tr',{}, el('td',{}, e.name + (e.critical?' (critical)':'')), el('td',{style:'font-family:var(--mono);font-size:11px;word-break:break-all'}, e.summary)));
        });
        card4.appendChild(t);
        box.appendChild(card4);
      }

      const card5 = el('div',{class:'card'});
      card5.appendChild(el('h4',{},'Fingerprints'));
      const sha1fp = await shaBytes('SHA-1', c._bytes);
      const sha256fp = await shaBytes('SHA-256', c._bytes);
      const fpRow = (label,val) => el('div',{class:'hash-row', style:'margin-bottom:6px'}, el('span',{class:'algo'},label), el('span',{class:'val'}, val.match(/.{2}/g).join(':')), el('span',{class:'icon-btn', onclick:()=>copyText(val)}, '⧉'));
      card5.appendChild(fpRow('SHA-1', sha1fp));
      card5.appendChild(fpRow('SHA-256', sha256fp));
      box.appendChild(card5);

      api.setStatus(expired ? 'Certificate expired' : notYetValid ? 'Not yet valid' : 'Valid certificate', !expired && !notYetValid);
    }
    function renderChainTabs(){
      const tabs = container.querySelector('#x5-chain-tabs');
      if (certs.length<=1){ tabs.style.display='none'; return; }
      tabs.style.display='flex';
      tabs.innerHTML = '';
      certs.forEach((c,i)=>{
        const b = el('button',{class:'btn'+(i===activeIdx?' primary':'')}, `#${i+1} ${c.subject.find(p=>p.oid==='2.5.4.3')?.value || 'cert'}`);
        b.addEventListener('click', ()=>{ activeIdx=i; renderChainTabs(); renderCert(i); });
        tabs.appendChild(b);
      });
    }
    async function parse(){
      const bnr = container.querySelector('#x5-err');
      const text = container.querySelector('#x5-in').value;
      if (!text.trim()){ bnr.classList.remove('show'); container.querySelector('#x5-out').innerHTML=''; certs=[]; renderChainTabs(); return; }
      try{
        const blocks = pemBlocksToDER(text);
        if (!blocks.length) throw new Error('No "-----BEGIN CERTIFICATE-----" block found');
        certs = blocks.map(bytes=>{ const c = parseCertificateDER(bytes); c._bytes = bytes; return c; });
        activeIdx = 0;
        bnr.classList.remove('show');
        renderChainTabs();
        await renderCert(0);
      }catch(e){
        bnr.textContent = 'Could not parse certificate: '+e.message; bnr.classList.add('show');
        container.querySelector('#x5-out').innerHTML=''; api.setStatus('Parse error', false);
      }
    }
    container.querySelector('#x5-in').addEventListener('input', debounce(parse, 300));
    container._importText = (text)=>{ container.querySelector('#x5-in').value = text; parse(); };
    return {
      getState: ()=>({input: container.querySelector('#x5-in').value}),
      setState: (s)=>{ container.querySelector('#x5-in').value = s.input||''; parse(); }
    };
  }
});

/* =========================================================================
   TOOL: QR Code Generator & Reader
   Lazy-loads 'qrcode' (generation) and 'jsQR' (image/webcam decoding) the
   first time this tool is opened.
   ========================================================================= */
async function loadQrDeps(){
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.4.4/qrcode.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'),
  ]);
}
registerTool({
  id:'qr-tool', name:'QR Code Generator & Reader', category:'Developer Utilities', icon:'\u2610',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <button class="btn primary" data-a="mode-gen">Generate</button>
          <button class="btn" data-a="mode-read">Read / Scan</button>
        </div>
        <div class="err-banner" id="qr-err"></div>
        <div id="qr-body" style="flex:1;overflow:auto;padding:14px"></div>
      </div>`;
    let depsLoaded = false, mode = 'gen', stream = null, scanRAF = null;
    async function ensureDeps(){
      if (depsLoaded) return true;
      try{ await loadQrDeps(); depsLoaded = true; return true; }
      catch(e){
        const bnr = container.querySelector('#qr-err');
        bnr.textContent = 'Could not load the QR library from the CDN — check your internet connection and reload. ('+e.message+')';
        bnr.classList.add('show');
        api.setStatus('Failed to load QR library', false);
        return false;
      }
    }

    function renderGen(){
      const box = container.querySelector('#qr-body'); box.innerHTML = `
        <div class="grid-2" style="grid-template-columns:1fr 1fr">
          <div class="card">
            <h4>Content</h4>
            <div class="field-row" style="padding:0 0 8px"><label style="min-width:70px">Type</label>
              <select class="mini grow" id="qr-type">
                <option value="text">Text / URL</option>
                <option value="email">Email</option>
                <option value="wifi">Wi-Fi</option>
                <option value="contact">Contact (vCard)</option>
              </select>
            </div>
            <div id="qr-fields" class="stack"></div>
            <div class="field-row" style="padding:10px 0 0"><label style="min-width:70px">Size</label><input class="mini" id="qr-size" type="number" value="256" min="64" max="1024" style="width:80px">
              <label style="min-width:70px;margin-left:10px">Error corr.</label>
              <select class="mini" id="qr-ecl"><option>L</option><option>M</option><option selected>Q</option><option>H</option></select>
            </div>
          </div>
          <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:10px">
            <h4 style="align-self:flex-start">Preview</h4>
            <canvas id="qr-canvas" style="background:#fff;border-radius:8px"></canvas>
            <button class="btn primary" data-a="qr-download">Download PNG</button>
          </div>
        </div>`;
      function fieldsFor(type){
        if (type==='email') return `<input class="mini" id="qr-f1" placeholder="Email address"><input class="mini" id="qr-f2" placeholder="Subject (optional)">`;
        if (type==='wifi') return `<input class="mini" id="qr-f1" placeholder="Network name (SSID)"><input class="mini" id="qr-f2" placeholder="Password"><select class="mini" id="qr-f3"><option>WPA</option><option>WEP</option><option value="nopass">None</option></select>`;
        if (type==='contact') return `<input class="mini" id="qr-f1" placeholder="Full name"><input class="mini" id="qr-f2" placeholder="Phone"><input class="mini" id="qr-f3" placeholder="Email">`;
        return `<textarea class="mini" id="qr-f1" style="min-height:70px" placeholder="Text or URL to encode"></textarea>`;
      }
      function buildPayload(type){
        const v1 = container.querySelector('#qr-f1')?.value||'', v2 = container.querySelector('#qr-f2')?.value||'', v3 = container.querySelector('#qr-f3')?.value||'';
        if (type==='email') return `mailto:${v1}${v2?'?subject='+encodeURIComponent(v2):''}`;
        if (type==='wifi'){ const sec = v3==='nopass'?'nopass':v3; return sec==='nopass' ? `WIFI:T:nopass;S:${v1};;` : `WIFI:T:${sec};S:${v1};P:${v2};;`; }
        if (type==='contact') return `BEGIN:VCARD\nVERSION:3.0\nFN:${v1}\nTEL:${v2}\nEMAIL:${v3}\nEND:VCARD`;
        return v1;
      }
      async function regenerate(){
        const ok = await ensureDeps();
        if (!ok) return;
        container.querySelector('#qr-err').classList.remove('show');
        const type = container.querySelector('#qr-type').value;
        const payload = buildPayload(type);
        const canvas = container.querySelector('#qr-canvas');
        const size = Math.max(64, Math.min(1024, +container.querySelector('#qr-size').value||256));
        const ecl = container.querySelector('#qr-ecl').value;
        if (!payload.trim()){ const ctx=canvas.getContext('2d'); canvas.width=size; canvas.height=size; ctx.clearRect(0,0,size,size); api.setStatus('Enter content to generate'); return; }
        try{
          await QRCode.toCanvas(canvas, payload, {width:size, errorCorrectionLevel:ecl, margin:2});
          api.setStatus('QR code generated', true);
        }catch(e){ api.setStatus('Could not generate: '+e.message, false); }
      }
      function rebuildFields(){
        container.querySelector('#qr-fields').innerHTML = fieldsFor(container.querySelector('#qr-type').value);
        container.querySelectorAll('#qr-fields input, #qr-fields textarea, #qr-fields select').forEach(i=>i.addEventListener('input', debounce(regenerate,250)));
        regenerate();
      }
      container.querySelector('#qr-type').addEventListener('change', rebuildFields);
      container.querySelector('#qr-size').addEventListener('input', debounce(regenerate,250));
      container.querySelector('#qr-ecl').addEventListener('change', regenerate);
      container.querySelector('[data-a="qr-download"]').addEventListener('click', ()=>{
        const canvas = container.querySelector('#qr-canvas');
        const a = document.createElement('a'); a.download='qrcode.png'; a.href = canvas.toDataURL('image/png'); a.click();
      });
      rebuildFields();
    }

    function stopScan(){
      if (scanRAF) cancelAnimationFrame(scanRAF);
      if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
    }
    function renderRead(){
      const box = container.querySelector('#qr-body'); box.innerHTML = `
        <div class="grid-2" style="grid-template-columns:1fr 1fr">
          <div class="card">
            <h4>Upload an image</h4>
            <input type="file" id="qr-file" accept="image/*">
            <canvas id="qr-upload-canvas" style="display:none;max-width:100%;margin-top:10px;border-radius:8px"></canvas>
          </div>
          <div class="card">
            <h4>Scan with webcam</h4>
            <div class="field-row" style="padding:0 0 8px"><button class="btn" data-a="qr-cam-start">Start camera</button><button class="btn ghost" data-a="qr-cam-stop">Stop</button></div>
            <video id="qr-video" style="width:100%;border-radius:8px;background:#000;display:none" playsinline></video>
            <canvas id="qr-scan-canvas" style="display:none"></canvas>
          </div>
        </div>
        <div class="card" style="margin-top:12px">
          <h4>Result</h4>
          <div id="qr-result" style="font-family:var(--mono);font-size:13px;word-break:break-all;color:var(--text-dim)">No QR code decoded yet.</div>
        </div>`;
      function showResult(text){
        const r = container.querySelector('#qr-result');
        r.innerHTML = ''; r.appendChild(el('div',{style:'color:var(--text-primary)'}, text));
        r.appendChild(el('button',{class:'btn ghost', style:'margin-top:8px', onclick:()=>copyText(text)},'Copy'));
        api.setStatus('QR code decoded', true);
      }
      container.querySelector('#qr-file').addEventListener('change', async e=>{
        const f = e.target.files[0]; if (!f) return;
        if (!await ensureDeps()) return;
        const img = new Image();
        img.onload = ()=>{
          const canvas = container.querySelector('#qr-upload-canvas');
          canvas.width = img.width; canvas.height = img.height; canvas.style.display='block';
          const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
          const data = ctx.getImageData(0,0,canvas.width,canvas.height);
          const result = jsQR(data.data, canvas.width, canvas.height);
          if (result) showResult(result.data);
          else { container.querySelector('#qr-result').textContent = 'No QR code found in that image.'; api.setStatus('No QR code found', false); }
        };
        img.src = URL.createObjectURL(f);
      });
      container.querySelector('[data-a="qr-cam-start"]').addEventListener('click', async ()=>{
        if (!await ensureDeps()) return;
        try{
          stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
        }catch(e){ toast('Camera access denied or unavailable','err'); return; }
        const video = container.querySelector('#qr-video');
        video.srcObject = stream; video.style.display='block'; await video.play();
        const canvas = container.querySelector('#qr-scan-canvas');
        function tick(){
          if (!stream) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA){
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(video,0,0,canvas.width,canvas.height);
            const data = ctx.getImageData(0,0,canvas.width,canvas.height);
            const result = jsQR(data.data, canvas.width, canvas.height);
            if (result){ showResult(result.data); stopScan(); video.style.display='none'; return; }
          }
          scanRAF = requestAnimationFrame(tick);
        }
        scanRAF = requestAnimationFrame(tick);
      });
      container.querySelector('[data-a="qr-cam-stop"]').addEventListener('click', ()=>{ stopScan(); container.querySelector('#qr-video').style.display='none'; });
    }
    function setMode(m){
      mode = m;
      container.querySelector('[data-a="mode-gen"]').className = 'btn'+(m==='gen'?' primary':'');
      container.querySelector('[data-a="mode-read"]').className = 'btn'+(m==='read'?' primary':'');
      stopScan();
      if (m==='gen') renderGen(); else renderRead();
    }
    container.querySelector('[data-a="mode-gen"]').addEventListener('click', ()=>setMode('gen'));
    container.querySelector('[data-a="mode-read"]').addEventListener('click', ()=>setMode('read'));
    setMode('gen');
    return { cleanup: stopScan };
  }
});

/* =========================================================================
   TOOL: JavaScript / CSS Beautifier & Minifier
   Lazy-loads js-beautify (beautify, real parser-based, not regex) and
   Terser (minify, a real minifier — not a naive regex strip, which would
   risk silently corrupting code around strings/regex literals/ASI).
   ========================================================================= */
async function loadBeautifyDeps(){
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/js-beautify/1.15.4/beautify.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/js-beautify/1.15.4/beautify-css.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/terser/dist/bundle.min.js'),
  ]);
}
registerTool({
  id:'jsbeautify-tool', name:'JS / CSS Beautifier & Minifier', category:'Developer Utilities', icon:'{;}',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar">
          <select class="mini" id="jb-lang"><option value="js">JavaScript</option><option value="css">CSS</option></select>
          <button class="btn primary" data-a="beautify">Beautify</button>
          <button class="btn" data-a="minify">Minify</button>
          <label class="toggle-row"><input type="checkbox" id="jb-comments" checked> preserve comments</label>
          <span class="grow"></span>
          <button class="btn" data-a="copy">Copy output</button>
        </div>
        <div class="err-banner" id="jb-err"></div>
        <div class="tool-body">
          <div class="split"><div class="split-header">Input</div><div class="cm-wrap" id="jb-in-cm"></div></div>
          <div class="split"><div class="split-header">Output <span class="grow"></span><span class="pill" id="jb-stats"></span></div><div class="cm-wrap" id="jb-out-cm"></div></div>
        </div>
      </div>`;
    const cmIn = CodeMirror(container.querySelector('#jb-in-cm'), {
      mode:'javascript', lineNumbers:true, theme: STATE.theme==='dark'?'material-darker':'default',
      value:'function greet(name){\nif(!name){name="world"}\nconsole.log("Hello, "+name+"!")\n}\ngreet();',
      indentUnit: STATE.indent, tabSize: STATE.indent, viewportMargin:60
    });
    const cmOut = CodeMirror(container.querySelector('#jb-out-cm'), {
      mode:'javascript', lineNumbers:true, theme: STATE.theme==='dark'?'material-darker':'default',
      readOnly:true, viewportMargin:60
    });
    function checkJsSyntax(code){
      try{ new Function(code); return {ok:true}; }
      catch(e){ return {ok:false, error: e.message}; }
    }
    function checkCssBraces(code){
      let depth = 0;
      for (const ch of code){ if (ch==='{') depth++; else if (ch==='}') depth--; if (depth<0) return {ok:false, error:'Unmatched "}" — a closing brace appears with no matching "{"'}; }
      if (depth>0) return {ok:false, error:`${depth} unclosed "{" — missing ${depth} closing brace${depth===1?'':'s'}`};
      return {ok:true};
    }
    let depsLoaded = false;
    async function ensureDeps(){
      if (depsLoaded) return true;
      try{ await loadBeautifyDeps(); depsLoaded = true; return true; }
      catch(e){
        const bnr = container.querySelector('#jb-err');
        bnr.textContent = 'Could not load the formatting library from the CDN — check your internet connection and reload. ('+e.message+')';
        bnr.classList.add('show');
        api.setStatus('Failed to load library', false);
        return false;
      }
    }
    function setLangMode(){
      const lang = container.querySelector('#jb-lang').value;
      const mode = lang==='css' ? 'css' : 'javascript';
      cmIn.setOption('mode', mode); cmOut.setOption('mode', mode);
    }
    container.querySelector('#jb-lang').addEventListener('change', setLangMode);
    async function beautify(){
      if (!await ensureDeps()) return;
      const lang = container.querySelector('#jb-lang').value;
      const bnr = container.querySelector('#jb-err');
      try{
        const code = cmIn.getValue();
        if (!code.trim()){ bnr.textContent='Nothing to beautify — paste some code first.'; bnr.classList.add('show'); return; }
        const check = lang==='css' ? checkCssBraces(code) : checkJsSyntax(code);
        if (!check.ok){ bnr.textContent = `Invalid ${lang.toUpperCase()}: ${check.error}`; bnr.classList.add('show'); api.setStatus('Invalid input', false); return; }
        const out = lang==='css' ? css_beautify(code, {indent_size: STATE.indent}) : js_beautify(code, {indent_size: STATE.indent, preserve_newlines:true});
        cmOut.setValue(out);
        container.querySelector('#jb-stats').textContent = `${out.length} chars`; container.querySelector('#jb-stats').className='pill ok';
        bnr.classList.remove('show'); api.setStatus('Beautified', true);
      }catch(e){ bnr.textContent = 'Beautify error: '+e.message; bnr.classList.add('show'); api.setStatus('Beautify error', false); }
    }
    async function minify(){
      const lang = container.querySelector('#jb-lang').value;
      const bnr = container.querySelector('#jb-err');
      const code = cmIn.getValue();
      if (!code.trim()){ bnr.textContent='Nothing to minify — paste some code first.'; bnr.classList.add('show'); return; }
      if (lang==='css'){
        // CSS is much safer to regex-minify than JS (no ASI / regex-literal ambiguity) — needs no external library
        const check = checkCssBraces(code);
        if (!check.ok){ bnr.textContent = 'Invalid CSS: '+check.error; bnr.classList.add('show'); api.setStatus('Invalid input', false); return; }
        try{
          let out = code.replace(/\/\*[\s\S]*?\*\//g, container.querySelector('#jb-comments').checked ? m=>m : '')
                         .replace(/\s*([{}:;,])\s*/g,'$1').replace(/;}/g,'}').replace(/\s+/g,' ').trim();
          cmOut.setValue(out);
          container.querySelector('#jb-stats').textContent = `${out.length} chars (was ${code.length})`; container.querySelector('#jb-stats').className='pill ok';
          bnr.classList.remove('show'); api.setStatus('Minified', true);
        }catch(e){ bnr.textContent='Minify error: '+e.message; bnr.classList.add('show'); api.setStatus('Minify error', false); }
        return;
      }
      if (!await ensureDeps()) return;
      try{
        const result = await Terser.minify(code, {compress:true, mangle:true, format:{comments: container.querySelector('#jb-comments').checked}});
        if (result.error) throw result.error;
        cmOut.setValue(result.code||'');
        container.querySelector('#jb-stats').textContent = `${(result.code||'').length} chars (was ${code.length})`; container.querySelector('#jb-stats').className='pill ok';
        bnr.classList.remove('show'); api.setStatus('Minified', true);
      }catch(e){ bnr.textContent = 'Minify error: '+(e.message||String(e)); bnr.classList.add('show'); api.setStatus('Syntax error — cannot minify', false); }
    }
    container.querySelector('[data-a="beautify"]').addEventListener('click', beautify);
    container.querySelector('[data-a="minify"]').addEventListener('click', minify);
    container.querySelector('[data-a="copy"]').addEventListener('click', ()=>copyText(cmOut.getValue()));
    container._importText = (text,name)=>{ cmIn.setValue(text); if (name && name.endsWith('.css')) { container.querySelector('#jb-lang').value='css'; setLangMode(); } };
    setTimeout(()=>{ cmIn.refresh(); cmOut.refresh(); }, 30);
    return {
      getState: ()=>({input: cmIn.getValue(), lang: container.querySelector('#jb-lang').value}),
      setState: (s)=>{ cmIn.setValue(s.input||''); if (s.lang){ container.querySelector('#jb-lang').value = s.lang; setLangMode(); } }
    };
  }
});

/* =========================================================================
   TOOL: Basic Image Editor (resize, crop, rotate, flip, compress, export)
   Pure canvas — no external libraries, no upload, everything local.
   ========================================================================= */
registerTool({
  id:'image-editor-tool', name:'Image Editor', category:'Developer Utilities', icon:'\u25A3',
  mount(container, api){
    container.innerHTML = `
      <div class="tool-shell">
        <div class="tool-toolbar" id="ie-toolbar">
          <label class="btn ghost" style="cursor:pointer">Open image… <input type="file" id="ie-file" accept="image/*" style="display:none"></label>
          <span class="tb-sep"></span>
          <button class="tb-icon" data-a="rotate-l" title="Rotate left">\u21B6</button>
          <button class="tb-icon" data-a="rotate-r" title="Rotate right">\u21B7</button>
          <button class="tb-icon" data-a="flip-h" title="Flip horizontal">\u2194</button>
          <button class="tb-icon" data-a="flip-v" title="Flip vertical">\u2195</button>
          <span class="tb-sep"></span>
          <button class="tb-icon" data-a="crop-mode" title="Draw a crop selection on the image">\u2702</button>
          <button class="btn primary" data-a="crop-apply" style="display:none">Apply Crop</button>
          <button class="btn ghost" data-a="crop-cancel" style="display:none">Cancel</button>
          <span class="tb-sep"></span>
          <button class="btn ghost" data-a="reset">Reset</button>
          <span class="grow"></span>
          <button class="btn primary" data-a="download">Export</button>
        </div>
        <div class="tool-body" style="flex-direction:column;overflow:auto">
          <div class="empty-note-state" id="ie-empty"><div style="font-size:26px">\u{1F5BC}</div><div>Open an image to start editing</div></div>
          <div id="ie-workarea" style="display:none;padding:14px;gap:14px;flex-direction:row;flex-wrap:wrap">
            <div style="position:relative;flex:1;min-width:280px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#33353f 0% 25%, #2a2c35 0% 50%) 50%/16px 16px;border-radius:10px;border:1px solid var(--border);overflow:auto;max-height:60vh">
              <div id="ie-canvas-wrap" style="position:relative;display:inline-block;line-height:0">
                <canvas id="ie-canvas" style="max-width:100%;display:block"></canvas>
              </div>
            </div>
            <div class="card" style="width:230px">
              <h4>Resize</h4>
              <div class="field-row" style="padding:0 0 8px"><label style="min-width:44px">W</label><input class="mini" id="ie-w" type="number" style="width:80px"><label style="min-width:20px">H</label><input class="mini" id="ie-h" type="number" style="width:80px"></div>
              <label class="toggle-row" style="margin-bottom:8px"><input type="checkbox" id="ie-lock" checked> lock aspect ratio</label>
              <button class="btn" data-a="apply-resize" style="width:100%">Apply resize</button>
              <h4 style="margin-top:16px">Compress (JPEG)</h4>
              <input type="range" id="ie-quality" min="10" max="100" value="85" style="width:100%">
              <div style="font-size:11px;color:var(--text-dim)" id="ie-quality-label">Quality: 85%</div>
              <div style="font-size:11px;color:var(--text-dim);margin-top:6px" id="ie-size-estimate"></div>
              <h4 style="margin-top:16px">Info</h4>
              <table class="kv" id="ie-info"></table>
            </div>
          </div>
        </div>
      </div>`;
    const canvas = container.querySelector('#ie-canvas');
    const ctx = canvas.getContext('2d');
    let originalImg = null, cropping = false;

    function showWorkarea(){ container.querySelector('#ie-empty').style.display='none'; container.querySelector('#ie-workarea').style.display='flex'; }
    function updateInfo(){
      container.querySelector('#ie-info').innerHTML = '';
      const rows = [['Dimensions', `${canvas.width} × ${canvas.height}`]];
      rows.forEach(([k,v])=>container.querySelector('#ie-info').appendChild(el('tr',{}, el('td',{},k), el('td',{},v))));
      container.querySelector('#ie-w').value = canvas.width;
      container.querySelector('#ie-h').value = canvas.height;
      aspectRatio = canvas.width / canvas.height;
      estimateSize();
    }
    function estimateSize(){
      const q = (+container.querySelector('#ie-quality').value)/100;
      canvas.toBlob(blob=>{ if (blob) container.querySelector('#ie-size-estimate').textContent = `Estimated export size: ${fmtBytes(blob.size)}`; }, 'image/jpeg', q);
    }
    function loadImage(file){
      const img = new Image();
      img.onload = ()=>{
        originalImg = img;
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img,0,0);
        showWorkarea(); updateInfo();
        api.setStatus(`Loaded ${file.name} (${img.width}×${img.height})`, true);
      };
      img.onerror = ()=> toast('Could not load that image','err');
      img.src = URL.createObjectURL(file);
    }
    container.querySelector('#ie-file').addEventListener('change', e=>{ const f=e.target.files[0]; if (f) loadImage(f); });
    // drag & drop
    canvas.addEventListener('dragover', e=>e.preventDefault());
    container.querySelector('#ie-workarea').addEventListener('dragover', e=>e.preventDefault());
    container.querySelector('#ie-workarea').addEventListener('drop', e=>{ e.preventDefault(); e.stopPropagation(); const f=e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) loadImage(f); });
    container.querySelector('#ie-empty').addEventListener('dragover', e=>e.preventDefault());
    container.querySelector('#ie-empty').addEventListener('drop', e=>{ e.preventDefault(); e.stopPropagation(); const f=e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) loadImage(f); });

    function rotate(dir){
      const w=canvas.width, h=canvas.height;
      const tmp = document.createElement('canvas'); tmp.width=w; tmp.height=h;
      tmp.getContext('2d').drawImage(canvas,0,0);
      canvas.width=h; canvas.height=w;
      ctx.save();
      if (dir==='r'){ ctx.translate(h,0); ctx.rotate(Math.PI/2); } else { ctx.translate(0,w); ctx.rotate(-Math.PI/2); }
      ctx.drawImage(tmp,0,0);
      ctx.restore();
      updateInfo();
    }
    function flip(axis){
      const w=canvas.width, h=canvas.height;
      const tmp = document.createElement('canvas'); tmp.width=w; tmp.height=h;
      tmp.getContext('2d').drawImage(canvas,0,0);
      ctx.save(); ctx.clearRect(0,0,w,h);
      if (axis==='h'){ ctx.translate(w,0); ctx.scale(-1,1); } else { ctx.translate(0,h); ctx.scale(1,-1); }
      ctx.drawImage(tmp,0,0);
      ctx.restore();
      estimateSize();
    }
    container.querySelector('[data-a="rotate-l"]').addEventListener('click', ()=>{ if (originalImg) rotate('l'); });
    container.querySelector('[data-a="rotate-r"]').addEventListener('click', ()=>{ if (originalImg) rotate('r'); });
    container.querySelector('[data-a="flip-h"]').addEventListener('click', ()=>{ if (originalImg) flip('h'); });
    container.querySelector('[data-a="flip-v"]').addEventListener('click', ()=>{ if (originalImg) flip('v'); });
    container.querySelector('[data-a="reset"]').addEventListener('click', ()=>{
      if (!originalImg) return;
      canvas.width = originalImg.width; canvas.height = originalImg.height;
      ctx.drawImage(originalImg,0,0); updateInfo();
    });

    // resize
    let aspectRatio = 1;
    function refreshAspect(){ aspectRatio = canvas.width / canvas.height; }
    container.querySelector('#ie-w').addEventListener('input', ()=>{
      if (!container.querySelector('#ie-lock').checked) return;
      container.querySelector('#ie-h').value = Math.round((+container.querySelector('#ie-w').value||1) / aspectRatio);
    });
    container.querySelector('#ie-h').addEventListener('input', ()=>{
      if (!container.querySelector('#ie-lock').checked) return;
      container.querySelector('#ie-w').value = Math.round((+container.querySelector('#ie-h').value||1) * aspectRatio);
    });
    container.querySelector('[data-a="apply-resize"]').addEventListener('click', ()=>{
      const nw = Math.max(1, +container.querySelector('#ie-w').value||canvas.width);
      const nh = Math.max(1, +container.querySelector('#ie-h').value||canvas.height);
      const tmp = document.createElement('canvas'); tmp.width=canvas.width; tmp.height=canvas.height;
      tmp.getContext('2d').drawImage(canvas,0,0);
      canvas.width = nw; canvas.height = nh;
      ctx.drawImage(tmp,0,0,tmp.width,tmp.height,0,0,nw,nh);
      refreshAspect(); updateInfo();
      toast('Resized to '+nw+'×'+nh,'ok');
    });

    // ---- crop: dimmed-surround selection box with draggable resize handles ----
    const canvasWrap = container.querySelector('#ie-canvas-wrap');
    const HANDLE_POS = {nw:[0,0], n:[50,0], ne:[100,0], e:[100,50], se:[100,100], s:[50,100], sw:[0,100], w:[0,50]};
    const HANDLE_CURSOR = {nw:'nwse-resize', n:'ns-resize', ne:'nesw-resize', e:'ew-resize', se:'nwse-resize', s:'ns-resize', sw:'nesw-resize', w:'ew-resize'};
    let cropBox = null, cropBoxEl = null, cropDrag = null;

    function wrapRect(){ return canvasWrap.getBoundingClientRect(); }
    function buildCropBoxEl(){
      if (cropBoxEl) return cropBoxEl;
      cropBoxEl = el('div', {class:'ie-crop-box'});
      Object.keys(HANDLE_POS).forEach(pos=>{
        const [lx,ty] = HANDLE_POS[pos];
        const h = el('div', {class:'ie-crop-handle', 'data-handle':pos, style:`left:${lx}%;top:${ty}%;cursor:${HANDLE_CURSOR[pos]}`});
        cropBoxEl.appendChild(h);
      });
      canvasWrap.appendChild(cropBoxEl);
      return cropBoxEl;
    }
    function renderCropBox(){
      if (!cropBox){ if (cropBoxEl) cropBoxEl.style.display='none'; return; }
      const elBox = buildCropBoxEl();
      elBox.style.display = 'block';
      elBox.style.left = cropBox.x+'px'; elBox.style.top = cropBox.y+'px';
      elBox.style.width = cropBox.w+'px'; elBox.style.height = cropBox.h+'px';
    }
    function clearCropBox(){
      cropBox = null;
      if (cropBoxEl){ cropBoxEl.remove(); cropBoxEl = null; }
    }
    function setCropActionsVisible(show){
      container.querySelector('[data-a="crop-apply"]').style.display = show ? 'inline-flex' : 'none';
      container.querySelector('[data-a="crop-cancel"]').style.display = show ? 'inline-flex' : 'none';
    }
    function enterCropMode(){
      cropping = true;
      container.querySelector('[data-a="crop-mode"]').style.color = 'var(--accent)';
      canvas.style.cursor = 'crosshair';
    }
    function exitCropMode(){
      cropping = false;
      container.querySelector('[data-a="crop-mode"]').style.color = '';
      canvas.style.cursor = '';
      setCropActionsVisible(false);
      clearCropBox();
    }
    container.querySelector('[data-a="crop-mode"]').addEventListener('click', ()=>{
      if (!originalImg) return;
      cropping ? exitCropMode() : enterCropMode();
    });
    container.querySelector('[data-a="crop-cancel"]').addEventListener('click', exitCropMode);
    container.querySelector('[data-a="crop-apply"]').addEventListener('click', ()=>{
      if (!cropBox || cropBox.w<4 || cropBox.h<4){ toast('Draw a crop selection first','err'); return; }
      const r = wrapRect();
      const scaleX = canvas.width / r.width, scaleY = canvas.height / r.height;
      const x = Math.round(cropBox.x*scaleX), y = Math.round(cropBox.y*scaleY);
      const w = Math.round(cropBox.w*scaleX), h = Math.round(cropBox.h*scaleY);
      const tmp = document.createElement('canvas'); tmp.width=canvas.width; tmp.height=canvas.height;
      tmp.getContext('2d').drawImage(canvas,0,0);
      canvas.width=w; canvas.height=h;
      ctx.drawImage(tmp, x,y,w,h, 0,0,w,h);
      refreshAspect(); updateInfo();
      exitCropMode();
      toast('Cropped to '+w+'×'+h,'ok');
    });

    function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
    canvasWrap.addEventListener('mousedown', e=>{
      if (!cropping) return;
      const r = wrapRect();
      const mx = clamp(e.clientX-r.left, 0, r.width), my = clamp(e.clientY-r.top, 0, r.height);
      const handle = e.target.getAttribute && e.target.getAttribute('data-handle');
      if (handle){ cropDrag = {mode:'resize', handle, startBox:{...cropBox}, startX:mx, startY:my}; e.preventDefault(); return; }
      if (cropBoxEl && e.target===cropBoxEl){ cropDrag = {mode:'move', startBox:{...cropBox}, startX:mx, startY:my}; e.preventDefault(); return; }
      // start a fresh selection
      cropBox = {x:mx, y:my, w:0, h:0};
      cropDrag = {mode:'create', originX:mx, originY:my};
      setCropActionsVisible(true);
      renderCropBox();
      e.preventDefault();
    });
    function onCropMouseMove(e){
      if (!cropDrag) return;
      const r = wrapRect();
      const mx = clamp(e.clientX-r.left, 0, r.width), my = clamp(e.clientY-r.top, 0, r.height);
      if (cropDrag.mode==='create'){
        cropBox = {x:Math.min(cropDrag.originX,mx), y:Math.min(cropDrag.originY,my), w:Math.abs(mx-cropDrag.originX), h:Math.abs(my-cropDrag.originY)};
      } else if (cropDrag.mode==='move'){
        const dx = mx-cropDrag.startX, dy = my-cropDrag.startY;
        const b = cropDrag.startBox;
        cropBox = {x: clamp(b.x+dx, 0, r.width-b.w), y: clamp(b.y+dy, 0, r.height-b.h), w:b.w, h:b.h};
      } else if (cropDrag.mode==='resize'){
        const dx = mx-cropDrag.startX, dy = my-cropDrag.startY;
        const b = cropDrag.startBox; let {x,y,w,h} = b;
        const hd = cropDrag.handle;
        if (hd.includes('e')) w = clamp(b.w+dx, 4, r.width-b.x);
        if (hd.includes('s')) h = clamp(b.h+dy, 4, r.height-b.y);
        if (hd.includes('w')){ const nx = clamp(b.x+dx, 0, b.x+b.w-4); w = b.w+(b.x-nx); x = nx; }
        if (hd.includes('n')){ const ny = clamp(b.y+dy, 0, b.y+b.h-4); h = b.h+(b.y-ny); y = ny; }
        cropBox = {x,y,w,h};
      }
      renderCropBox();
    }
    function onCropMouseUp(){ cropDrag = null; }
    document.addEventListener('mousemove', onCropMouseMove);
    document.addEventListener('mouseup', onCropMouseUp);

    container.querySelector('#ie-quality').addEventListener('input', ()=>{
      container.querySelector('#ie-quality-label').textContent = 'Quality: '+container.querySelector('#ie-quality').value+'%';
      debounce(estimateSize,150)();
    });
    container.querySelector('[data-a="download"]').addEventListener('click', ()=>{
      if (!originalImg) { toast('Open an image first','err'); return; }
      const q = (+container.querySelector('#ie-quality').value)/100;
      canvas.toBlob(blob=>{
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download='edited.jpg'; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }, 'image/jpeg', q);
    });
    return {
      cleanup: ()=>{ document.removeEventListener('mousemove', onCropMouseMove); document.removeEventListener('mouseup', onCropMouseUp); }
    };
  }
});

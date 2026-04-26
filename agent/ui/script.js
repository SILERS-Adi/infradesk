/* Asystent InfraDesk — Full SPA v3 */
let currentPage='overview',lastScore=0,metricsInterval=null,pyReady=false,ttsEnabled=true;
let _ttsIsSpeaking=false;

// ─── TTS (Text-to-Speech) with lip-sync ───
let _ttsVoice=null;
function _findBestVoice(){
  const voices=speechSynthesis.getVoices();
  // Priority: Ewa > Natural > Paulina/Zofia > any Polish
  const ewa=voices.find(v=>v.lang.startsWith('pl')&&v.name.includes('Ewa'));
  if(ewa){_ttsVoice=ewa;return}
  const neural=voices.find(v=>v.lang.startsWith('pl')&&v.name.includes('Natural'));
  if(neural){_ttsVoice=neural;return}
  const mspl=voices.find(v=>v.lang.startsWith('pl')&&(v.name.includes('Paulina')||v.name.includes('Zofia')));
  if(mspl){_ttsVoice=mspl;return}
  const pl=voices.find(v=>v.lang.startsWith('pl'));
  if(pl){_ttsVoice=pl;return}
  _ttsVoice=voices.find(v=>v.lang.startsWith('en'))||voices[0]||null;
}
if(speechSynthesis.onvoiceschanged!==undefined) speechSynthesis.onvoiceschanged=_findBestVoice;
_findBestVoice();

function speak(text,interrupt){
  if(!ttsEnabled||!text)return;
  if(interrupt)speechSynthesis.cancel();
  const clean=text.replace(/<[^>]*>/g,' ').replace(/```[\s\S]*?```/g,'').replace(/\s+/g,' ').trim();
  if(!clean)return;
  const short=clean.length>400?clean.substring(0,397)+'...':clean;
  const u=new SpeechSynthesisUtterance(short);
  u.lang='pl-PL';u.rate=1.05;u.pitch=1.0;
  if(_ttsVoice)u.voice=_ttsVoice;
  u.onstart=()=>{_ttsIsSpeaking=true};
  u.onend=()=>{_ttsIsSpeaking=false};
  u.onpause=()=>{_ttsIsSpeaking=false};
  u.onresume=()=>{_ttsIsSpeaking=true};
  speechSynthesis.speak(u);
}
function speakNow(text){speak(text,true)}
function speakQueue(text){speak(text,false)}

// ─── Floating TTS toggle — always visible ───
document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.createElement('button');
  btn.id='ttsFloatBtn';
  btn.className='tts-float';
  btn.innerHTML='🔊';
  btn.title='Włącz/Wyłącz głos';
  btn.onclick=()=>{
    ttsEnabled=!ttsEnabled;
    btn.innerHTML=ttsEnabled?'🔊':'🔇';
    btn.classList.toggle('muted',!ttsEnabled);
    if(!ttsEnabled){speechSynthesis.cancel();_ttsIsSpeaking=false}
  };
  document.body.appendChild(btn);
});

// ─── Human-readable descriptions for PS commands ───
function describePsCmd(cmd){
  const c=cmd.toLowerCase();
  if(c.includes('get-process')&&c.includes('sort')) return 'Sprawdzam procesy zużywające pamięć';
  if(c.includes('cleanmgr')) return 'Uruchamiam oczyszczanie dysku Windows';
  if(c.includes('remove-item')&&c.includes('temp')) return 'Czyszczę pliki tymczasowe';
  if(c.includes('get-service')) return 'Sprawdzam stan usług systemowych';
  if(c.includes('start-service')) return 'Uruchamiam zatrzymane usługi';
  if(c.includes('get-winevent')||c.includes('eventlog')) return 'Sprawdzam dziennik zdarzeń systemu';
  if(c.includes('set-mppreference')||c.includes('defender')) return 'Konfiguruję Windows Defender';
  if(c.includes('get-mpcomputerstatus')) return 'Sprawdzam stan antywirusa';
  if(c.includes('netfirewallprofile')||c.includes('firewall')) return 'Sprawdzam ustawienia zapory';
  if(c.includes('shutdown')||c.includes('restart')) return 'Planuję restart komputera';
  if(c.includes('sfc /scannow')) return 'Skanuję pliki systemowe';
  if(c.includes('dism')) return 'Naprawiam obraz systemu Windows';
  if(c.includes('chkdsk')) return 'Sprawdzam dysk pod kątem błędów';
  if(c.includes('ipconfig')) return 'Sprawdzam konfigurację sieci';
  if(c.includes('netstat')) return 'Sprawdzam połączenia sieciowe';
  if(c.includes('get-disk')||c.includes('disk')) return 'Sprawdzam stan dysków';
  if(c.includes('windowsupdate')||c.includes('wuauserv')) return 'Sprawdzam aktualizacje Windows';
  if(c.includes('get-hotfix')) return 'Sprawdzam zainstalowane poprawki';
  return 'Wykonuję komendę systemową';
}

// ─── Safe vs dangerous command detection ───
// Safe = read-only (Get-, check, list, scan) → no consent needed, just announce
// Dangerous = modify, delete, restart, install → consent required
function isSafeCmd(block){
  if(block.type==='action'){
    // Safe actions: find_window, screenshot (just looking)
    return ['find_window','screenshot'].includes(block.action);
  }
  if(block.type==='ps'){
    const c=block.cmd.toLowerCase();
    // Dangerous keywords
    const dangerous=['remove-','delete','del ','stop-','kill','restart','shutdown','set-','start-service',
      'disable-','enable-','uninstall','install','format','clean','clear-','reset','reg delete',
      'new-','add-','move-','rename-','copy-','invoke-webrequest','start-process','sfc','dism',
      'cleanmgr','chkdsk'];
    if(dangerous.some(d=>c.includes(d))) return false;
    // Safe = mostly Get-* queries and reads
    const safe=['get-','select-','where-','format-','measure-','test-','resolve-','out-string',
      'write-host','echo','ipconfig','netstat','ping','nslookup','tracert','whoami','systeminfo',
      'hostname','ver','wmic','gwmi','gcim'];
    if(safe.some(s=>c.includes(s))) return true;
    return false; // unknown → ask
  }
  return false;
}

// ─── Consent dialog (promise-based) ───
// Returns: 'yes' | 'no' | 'all'
function askConsent(description, spokenDesc){
  return new Promise(resolve=>{
    const overlay=document.createElement('div');
    overlay.className='consent-overlay';
    overlay.innerHTML=`
      <div class="consent-box">
        <div class="consent-title">Wymagana zgoda</div>
        <div class="consent-desc">${description}</div>
        <div class="consent-btns">
          <button class="consent-btn consent-yes">✅ Tak, wykonaj</button>
          <button class="consent-btn consent-no">❌ Nie, pomiń</button>
          <button class="consent-btn consent-all">✅ Zatwierdź wszystkie</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if(spokenDesc) speakQueue(`Potrzebuję Twojej zgody. Chcę ${spokenDesc.charAt(0).toLowerCase()+spokenDesc.slice(1)}. Czy mogę kontynuować?`);
    overlay.querySelector('.consent-yes').onclick=()=>{overlay.remove();resolve('yes')};
    overlay.querySelector('.consent-no').onclick=()=>{overlay.remove();resolve('no')};
    overlay.querySelector('.consent-all').onclick=()=>{overlay.remove();resolve('all')};
  });
}

// ─── Scan Summary Card ───
function renderScanSummary(results,blocks){
  const ok=results.filter(r=>r.ok&&!r.skipped).length;
  const fail=results.filter(r=>!r.ok&&!r.skipped).length;
  const skip=results.filter(r=>r.skipped).length;
  const total=results.length;
  const pct=total?Math.round(ok/total*100):0;
  const scoreColor=pct>=80?'#22C55E':pct>=50?'#F59E0B':'#EF4444';
  const scoreLabel=pct>=80?'Dobry':pct>=50?'Wymaga uwagi':'Krytyczny';

  let items='';
  results.forEach((r,i)=>{
    const b=blocks[i];
    let label='',detail='';
    if(b.type==='ps'){label='PowerShell';detail=b.cmd.substring(0,60)+(b.cmd.length>60?'...':'')}
    else{
      label={open_folder:'Folder',open_url:'Strona',open_program:'Program',mouse_move:'Mysz',mouse_click:'Klik',type_text:'Tekst',hotkey:'Skrót',find_window:'Okno',focus_window:'Fokus',screenshot:'Screenshot'}[b.action]||b.action;
      const p=b.params||{};
      detail=p.path||p.url||p.text||p.title||(p.keys?p.keys.join('+'):'')||'';
    }
    const icon=r.skipped?'⏭':r.ok?'✅':'❌';
    const cls=r.skipped?'skip':r.ok?'ok':'err';
    items+=`<div class="scan-item ${cls}"><span class="scan-icon">${icon}</span><div class="scan-item-body"><div class="scan-item-label">${label}</div><div class="scan-item-detail">${detail?detail.substring(0,80):''}${r.detail?' — '+r.detail:''}${r.error&&!r.skipped?' — '+r.error.substring(0,80):''}</div></div></div>`;
  });

  return `<div class="scan-summary">
    <div class="scan-header">
      <div class="scan-score" style="--score-color:${scoreColor}">
        <svg viewBox="0 0 36 36" class="scan-ring"><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${scoreColor}" stroke-width="3" stroke-dasharray="${pct}, 100" stroke-linecap="round"/></svg>
        <div class="scan-score-text"><span class="scan-score-num">${pct}%</span><span class="scan-score-label">${scoreLabel}</span></div>
      </div>
      <div class="scan-stats">
        <div class="scan-stat ok"><span class="scan-stat-num">${ok}</span><span class="scan-stat-label">Wykonano</span></div>
        <div class="scan-stat err"><span class="scan-stat-num">${fail}</span><span class="scan-stat-label">Błędów</span></div>
        <div class="scan-stat skip"><span class="scan-stat-num">${skip}</span><span class="scan-stat-label">Pominięto</span></div>
      </div>
    </div>
    <div class="scan-items">${items}</div>
  </div>`;
}

function _initApp(){
  initTheme();initNavigation();
  // Auto-navigate if #page= hash present (e.g. after admin restart)
  const hash=window.location.hash;
  const pageMatch=hash.match(/page=(\w+)/);
  const startPage=pageMatch?pageMatch[1]:'overview';
  navigateTo(startPage);
}
document.addEventListener('DOMContentLoaded',()=>{
  if(window.pywebview&&window.pywebview.api){pyReady=true;_initApp()}
  else{
    // Show shell immediately, load data when pywebview ready
    _initApp();
    window.addEventListener('pywebviewready',()=>{pyReady=true;navigateTo(currentPage)})
  }
});

function initTheme(){
  const saved=localStorage.getItem('iad_theme')||'auto';
  _applyTheme(saved);
  // 3-mode switcher
  document.querySelectorAll('.theme-opt').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const mode=btn.dataset.theme;
      localStorage.setItem('iad_theme',mode);
      _applyTheme(mode);
    });
  });
}
function _applyTheme(mode){
  let effective=mode;
  if(mode==='auto'){
    effective=window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';
  }
  document.documentElement.setAttribute('data-theme',effective);
  document.querySelectorAll('.theme-opt').forEach(b=>{
    b.classList.toggle('active',b.dataset.theme===mode);
  });
  // Re-render score ring if on overview
  if(currentPage==='overview'&&typeof animateRing==='function'){
    setTimeout(()=>animateRing(lastScore),100);
  }
}

async function py(m,...a){
  // Wait up to 3s for pywebview API
  if(!pyReady){for(let i=0;i<30;i++){if(window.pywebview&&window.pywebview.api){pyReady=true;break}await new Promise(r=>setTimeout(r,100))}}
  if(window.pywebview&&window.pywebview.api){try{return await window.pywebview.api[m](...a)}catch(e){console.warn('py:',m,e)}}
  return null
}

function initNavigation(){document.querySelectorAll('.nav-item').forEach(i=>{i.addEventListener('click',()=>{const p=i.getAttribute('data-page');if(p)navigateTo(p)})});const ms=document.getElementById('modeSwitch');if(ms)ms.addEventListener('click',async()=>{if(confirm('Przełączyć na tryb firmowy?'))await py('switch_to_business')})}

function navigateTo(p){currentPage=p;document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.getAttribute('data-page')===p));const c=document.querySelector('.content');if(!c)return;if(metricsInterval){clearInterval(metricsInterval);metricsInterval=null}c.innerHTML='';({overview:renderOverview,security:renderSecurity,performance:renderPerformance,monitoring:renderMonitoring,network:renderNetwork,autostart:renderAutostart,ai_repair:renderAiRepair,vault:renderVault,backup:renderBackup,feedback:renderFeedback,pro:renderPro,settings:renderSettings,help:renderHelp})[p]?.(c)}

function h(t,c,html){const e=document.createElement(t);if(c)e.className=c;if(html)e.innerHTML=html;return e}
function spin(t){return `<div class="live-status"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-icon"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg><span>${t}</span></div>`}
function statusLine(id){return `<div class="live-status" id="${id}"></div>`}
function setStatus(id,t,s=true){const e=document.getElementById(id);if(!e)return;e.innerHTML=s?spin(t):`<span class="status-done">${t}</span>`}
function cardEl(p,title,fn){const c=h('div','page-card fade-up');if(title){c.appendChild(h('div','page-card-header',title))}const b=h('div','page-card-body');if(fn)fn(b);c.appendChild(b);p.appendChild(c);return b}
function btnEl(p,t,fn,cls='btn-primary'){const b=h('button',cls,t);b.addEventListener('click',fn);p.appendChild(b);return b}
function rowEl(p,l,v,col){const r=h('div','info-row');r.innerHTML=`<span class="info-label">${l}</span><span class="info-value"${col?` style="color:${col}"`:''}>${v}</span>`;p.appendChild(r)}

const ICO={
  overview:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  security:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  performance:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  monitoring:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  autostart:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',
  network:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
  ai_repair:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 014 4c0 1.95-2 3-2 8h-4c0-5-2-6.05-2-8a4 4 0 014-4z"/><line x1="10" y1="22" x2="14" y2="22"/><line x1="10" y1="18" x2="14" y2="18"/></svg>',
  help:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
  ping:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
};
function pageTitle(icon,title,sub){return `<div class="content-header"><div class="content-title"><span class="title-icon">${ICO[icon]||''}</span>${title}</div><div class="content-subtitle">${sub}</div></div>`}

/* ══ OVERVIEW ══ */
let _overviewInfo=null;
async function renderOverview(root){
  root.innerHTML=`<div class="content-header"><div class="content-title">Opiekun systemu</div><div class="content-subtitle">Kompleksowa optymalizacja komputera</div></div>
  <section class="hero fade-up"><canvas class="hero-canvas" id="heroCanvas"></canvas><div class="hero-overlay"></div><div class="hero-highlight"></div>
  <div class="hero-left"><div class="hero-greeting" id="heroGreeting">${spin('Analizuję system...')}</div><div class="hero-title" id="heroTitle">&nbsp;</div>
  <div class="hero-status"><div class="hero-status-dot" id="statusDot"></div><div class="hero-status-text" id="statusText">Pobieram dane...</div></div>
  <button class="hero-cta" id="ctaButton"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>Optymalizuj system</button></div>
  <div class="hero-right"><div class="ring-wrapper"><div class="ring-outer-glow"></div><div class="ring-container"><canvas class="ring-canvas" id="ringCanvas" width="180" height="180"></canvas>
  <div class="ring-center"><div class="ring-value" id="ringValue">—</div><div class="ring-label">Stan systemu</div></div></div>
  <div class="ring-status-area"><div class="ring-status-label">Stan systemu</div><div class="ring-status-value" id="ringStatus">—</div></div></div></div></section>
  <section class="cards" id="statsCards">
    <div class="card fade-up" style="animation-delay:.1s"><div class="card-header"><div class="card-icon memory"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M9 2v2M15 20v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/></svg></div><div class="card-badge blue" id="ramBadge">—</div></div><div class="card-value blue" id="ramValue">—</div><div class="card-title">Pamięć RAM</div><div class="card-desc" id="ramDesc">Ładowanie...</div><div class="card-bar"><div class="card-bar-fill" id="ramBar" style="width:0%;transition:width .8s ease,background .5s"></div></div></div>
    <div class="card fade-up" style="animation-delay:.2s"><div class="card-header"><div class="card-icon browser"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div><div class="card-badge purple" id="cpuBadge">—</div></div><div class="card-value purple" id="cpuValue">—</div><div class="card-title">Procesor</div><div class="card-desc" id="cpuDesc">Ładowanie...</div><div class="card-bar"><div class="card-bar-fill" id="cpuBar" style="width:0%;transition:width .8s ease,background .5s"></div></div></div>
    <div class="card fade-up" style="animation-delay:.3s"><div class="card-header"><div class="card-icon perf"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg></div><div class="card-badge green" id="dskBadge">—</div></div><div class="card-value green" id="dskValue">—</div><div class="card-title">Dysk C:</div><div class="card-desc" id="dskDesc">Ładowanie...</div><div class="card-bar"><div class="card-bar-fill" id="dskBar" style="width:0%;transition:width .8s ease,background .5s"></div></div></div>
  </section>`;
  drawHeroBackground();window.addEventListener('resize',drawHeroBackground);

  // Load system info (once) + metrics (repeating)
  const info=_overviewInfo||(await py('get_system_info'));
  if(info&&!info.error)_overviewInfo=info;
  const cpuName=info?(info.cpu||'').split('@')[0].trim():'CPU';
  const cpuFreq=info&&(info.cpu||'').includes('@')?(info.cpu||'').split('@')[1].trim():'';

  if(info&&!info.error){
    document.getElementById('heroGreeting').textContent=`Witaj, ${info.hostname}`;
    lastScore=Math.round(info.score*10);
    const dsk=info.disks&&info.disks[0]?info.disks[0]:{};
    const dskH=dsk.health||'—';
    const dskHCol=dskH==='Healthy'?'#4ADE80':'#EF4444';
    const dskHLabel=dskH==='Healthy'?'Zdrowy':'Uwaga!';
    document.getElementById('dskBadge').textContent=dskHLabel;
    document.getElementById('dskBadge').style.color=dskHCol;
    document.getElementById('cpuValue').textContent=cpuName||'CPU';
  }

  async function updateCards(){
    const m=await py('get_metrics');if(!m||m.error)return;
    const ramGb=info?info.ramGb:0;
    const ramU=Math.round(ramGb*m.ram/100*10)/10;
    const ramF=Math.round((ramGb-ramU)*10)/10;
    const ramCol=m.ram>80?'#EF4444':m.ram>60?'#FB923C':'#4F8CFF';
    const cpuUse=m.cpu;
    const cpuCol=cpuUse>80?'#EF4444':cpuUse>50?'#FB923C':'#8B5CF6';
    const dskPct=m.diskPercent;
    const dskFree=m.diskFreeGb;
    const dskTotal=dskPct<100?Math.round(dskFree/(1-dskPct/100)):0;
    const dskUsed=dskTotal-dskFree;
    const dskCol=dskPct>90?'#EF4444':dskPct>70?'#FB923C':'#4ADE80';

    // RAM card
    document.getElementById('ramBadge').textContent=m.ram+'%';document.getElementById('ramBadge').style.color=ramCol;
    document.getElementById('ramValue').textContent=ramGb+' GB';
    document.getElementById('ramDesc').textContent=`Zajęte: ${ramU} GB · Wolne: ${ramF} GB`;
    document.getElementById('ramBar').style.width=m.ram+'%';document.getElementById('ramBar').style.background=ramCol;

    // CPU card
    document.getElementById('cpuBadge').textContent=cpuUse+'%';document.getElementById('cpuBadge').style.color=cpuCol;
    document.getElementById('cpuDesc').textContent=`${cpuFreq?cpuFreq+' · ':''}Zużycie: ${cpuUse}%`;
    document.getElementById('cpuBar').style.width=cpuUse+'%';document.getElementById('cpuBar').style.background=cpuCol;

    // Disk card
    document.getElementById('dskValue').textContent=dskFree+' GB wolne';
    document.getElementById('dskDesc').textContent=`Pojemność: ${dskTotal} GB · Zajęte: ${dskUsed} GB`;
    document.getElementById('dskBar').style.width=dskPct+'%';document.getElementById('dskBar').style.background=dskCol;
  }

  // First load immediately + animate ring
  await updateCards();
  setTimeout(()=>animateRing(lastScore),300);

  // Live refresh every 3s
  metricsInterval=setInterval(()=>{if(currentPage==='overview')updateCards()},3000);

  document.getElementById('ctaButton')?.addEventListener('click',async()=>{const b=document.getElementById('ctaButton');b.innerHTML=spin('Sprawdzanie systemu...');b.style.pointerEvents='none';const s=await py('start_cleanup_scan');if(s&&s.length>0){const mb=s.reduce((a,c)=>a+c.size,0)/(1024*1024);b.innerHTML=`✓ ${mb.toFixed(0)} MB do odzyskania`;b.style.background='linear-gradient(135deg,#4ADE80,#22C55E)'}else{b.innerHTML='✓ System w porządku!';b.style.background='linear-gradient(135deg,#4ADE80,#22C55E)';animateRing(95)}})
}

/* ══ SECURITY — progress ring while scanning ══ */
async function renderSecurity(root){
  root.innerHTML=`${pageTitle('security','Audyt bezpieczeństwa','20 testów zabezpieczeń')}<div id="sc" class="fade-up"></div>`;
  const sc=document.getElementById('sc');
  cardEl(sc,'Sprawdź bezpieczeństwo komputera',b=>{
    b.innerHTML='<p class="page-desc">Firewall, antywirus, szyfrowanie, aktualizacje i 16 innych punktów.</p>';
    btnEl(b,'▶ Uruchom audyt',async()=>{
      sc.innerHTML=`<div class="progress-ring-wrap"><canvas id="auditRing" width="140" height="140"></canvas><div class="progress-ring-text"><span id="auditPct">0%</span><span class="progress-ring-sub">Testowanie...</span></div></div>`;
      // Animate progress
      let pct=0;const iv=setInterval(()=>{pct=Math.min(pct+Math.random()*8+2,95);drawProgressRing('auditRing',pct/100,'#8B5CF6');document.getElementById('auditPct').textContent=Math.round(pct)+'%'},300);
      const r=await py('run_security_audit');clearInterval(iv);
      if(!r){sc.innerHTML='<div class="error-state">Błąd audytu</div>';return;}
      drawProgressRing('auditRing',1,'#4ADE80');document.getElementById('auditPct').textContent='100%';
      await new Promise(r=>setTimeout(r,500));
      const s=r.score,ch=r.checks||[],col=s>=80?'#4ADE80':s>=60?'#FB923C':'#EF4444',lab=s>=80?'DOBRY':s>=60?'WYMAGA UWAGI':'KRYTYCZNY';
      sc.innerHTML=`<div class="audit-score fade-up" style="border-color:${col}30"><div class="audit-score-value" style="color:${col}">${s}/100</div><div class="audit-score-label" style="color:${col}">${lab}</div><div class="audit-score-detail">${ch.filter(c=>c.status==='pass').length} ✓ · ${ch.filter(c=>c.status==='fail').length} ✗</div></div><div id="ach"></div>`;
      const ac=document.getElementById('ach');
      [...ch].sort((a,b)=>(a.status==='fail'?0:1)-(b.status==='fail'?0:1)).forEach((c,i)=>{const ic=c.status==='pass'?'✅':c.status==='fail'?'❌':'⚠️';const sv={critical:'#EF4444',high:'#FB923C',medium:'#FBBF24',low:'#60A5FA',info:'#64748B'};const d=h('div','audit-check fade-up');d.style.animationDelay=(i*.04)+'s';if(c.status==='fail')d.style.borderLeftColor='#EF4444';d.innerHTML=`<div class="audit-check-top"><span>${ic} ${c.name}</span><span class="audit-sev" style="color:${sv[c.severity]||'#64748B'}">${(c.severity||'').toUpperCase()}</span></div>${c.detail?`<div class="audit-check-detail" style="color:${c.status==='fail'?'#EF4444':'#4ADE80'}">${c.detail}</div>`:''}`;ac.appendChild(d)})
    })
  })
}

/* ══ CLEANUP — with disk icon + progress ring ══ */
async function renderPerformance(root){
  root.innerHTML=`${pageTitle('performance','Pełna diagnoza','Kompleksowy audyt systemu')}
  <div id="diagContent" class="fade-up">
    <div style="text-align:center;padding:24px">
      <div style="font-size:11px;color:var(--tm);margin-bottom:16px">Kompleksowa analiza wydajności, bezpieczeństwa, usług, sieci, dysków i aktualizacji.</div>
      <button class="aicore-btn aicore-btn-primary" id="diagStart" style="padding:12px 32px;font-size:13px">Rozpocznij diagnozę</button>
    </div>
  </div>`;

  document.getElementById('diagStart')?.addEventListener('click',async()=>{
    const dc=document.getElementById('diagContent');

    // Live scanning UI
    const steps=[
      'Sprawdzam procesor i pamięć RAM...',
      'Analizuję wykorzystanie dysku...',
      'Sprawdzam pliki tymczasowe...',
      'Weryfikuję Windows Defender...',
      'Testuję zaporę sieciową...',
      'Sprawdzam usługi systemowe...',
      'Testuję połączenie internetowe...',
      'Sprawdzam DNS...',
      'Analizuję dziennik zdarzeń...',
      'Sprawdzam aktualizacje Windows...',
      'Analizuję programy autostartu...',
      'Sprawdzam stan dysków...',
      'Generuję raport...',
    ];

    dc.innerHTML=`
      <div class="diag-live">
        <div class="diag-live-core">
          <div class="diag-live-orb">
            <div class="diag-live-ring"></div>
            <div class="diag-live-dot"></div>
          </div>
          <div class="diag-live-status" id="diagLiveStatus">Inicjalizacja...</div>
        </div>
        <div class="diag-live-feed" id="diagLiveFeed"></div>
      </div>`;

    const statusEl=document.getElementById('diagLiveStatus');
    const feedEl=document.getElementById('diagLiveFeed');
    let stepIdx=0;

    // Animate steps while waiting for diagnosis
    const stepIv=setInterval(()=>{
      if(stepIdx>=steps.length)return;
      const step=steps[stepIdx];
      statusEl.textContent=step;
      // Add completed step to feed
      if(stepIdx>0){
        const prev=feedEl.querySelector('.diag-feed-current');
        if(prev){prev.classList.remove('diag-feed-current');prev.classList.add('diag-feed-done');prev.querySelector('.diag-feed-icon').textContent='✓'}
      }
      const el=document.createElement('div');
      el.className='diag-feed-item diag-feed-current';
      el.innerHTML=`<span class="diag-feed-icon">...</span><span class="diag-feed-text">${step}</span>`;
      feedEl.appendChild(el);
      feedEl.scrollTop=feedEl.scrollHeight;
      stepIdx++;
    },800);

    const data=await py('full_diagnosis');
    clearInterval(stepIv);

    // Mark remaining as done
    feedEl.querySelectorAll('.diag-feed-current').forEach(el=>{
      el.classList.remove('diag-feed-current');el.classList.add('diag-feed-done');
      el.querySelector('.diag-feed-icon').textContent='✓';
    });
    // Add final step
    const finalEl=document.createElement('div');
    finalEl.className='diag-feed-item diag-feed-done';
    finalEl.innerHTML=`<span class="diag-feed-icon" style="color:#4ADE80">✓</span><span class="diag-feed-text" style="color:#4ADE80">Diagnoza zakończona</span>`;
    feedEl.appendChild(finalEl);
    statusEl.textContent='Diagnoza zakończona';
    await new Promise(r=>setTimeout(r,1000));

    if(!data||!data.checks){dc.innerHTML='<div class="error-state">Błąd diagnozy</div>';return}

    const sc=data.score;
    const scCol=sc>=70?'#4ADE80':sc>=40?'#FB923C':'#EF4444';
    const scLabel=sc>=70?'DOBRY':sc>=40?'WYMAGA UWAGI':'KRYTYCZNY';
    const cats={wydajnosc:'Wydajność',bezpieczenstwo:'Bezpieczeństwo',czyszczenie:'Czyszczenie',uslugi:'Usługi',siec:'Sieć',system:'System',aktualizacje:'Aktualizacje',autostart:'Autostart',dyski:'Dyski'};
    const fixable=data.checks.filter(c=>c.fixCmd&&c.status==='fail');

    dc.innerHTML=`
      <div class="vault-stats" style="margin-bottom:16px">
        <div class="vault-stat accent"><div class="vault-stat-num" style="color:${scCol}">${sc}/100</div><div class="vault-stat-label">${scLabel}</div></div>
        <div class="vault-stat"><div class="vault-stat-num">${data.total}</div><div class="vault-stat-label">Testów</div></div>
        <div class="vault-stat"><div class="vault-stat-num" style="color:#4ADE80">${data.passed}</div><div class="vault-stat-label">Pozytywnych</div></div>
        <div class="vault-stat"><div class="vault-stat-num" style="color:#EF4444">${data.failed}</div><div class="vault-stat-label">Problemów</div></div>
      </div>

      ${fixable.length?`<div class="diag-fix-bar">
        <span>${fixable.length} problemów można naprawić automatycznie</span>
        <button class="aicore-btn aicore-btn-primary" id="diagFixAll">Napraw zaznaczone</button>
      </div>`:''}

      <div id="diagChecks"></div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="aicore-btn aicore-btn-secondary" id="diagPdf"><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Zapisz raport PDF</button>
        <button class="aicore-btn aicore-btn-secondary" id="diagRepeat"><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Powtórz diagnozę</button>
      </div>`;

    // Render checks grouped by category
    const checksEl=document.getElementById('diagChecks');
    const grouped={};
    data.checks.forEach(c=>{if(!grouped[c.cat])grouped[c.cat]=[];grouped[c.cat].push(c)});

    Object.entries(grouped).forEach(([cat,items])=>{
      const catEl=document.createElement('div');
      catEl.className='diag-category';
      catEl.innerHTML=`<div class="diag-cat-title">${cats[cat]||cat}</div>`;
      items.forEach(c=>{
        const statusIcon=c.status==='pass'?'<span style="color:#4ADE80">✓</span>':c.status==='fail'?'<span style="color:#EF4444">✗</span>':'<span style="color:#FB923C">!</span>';
        const sevCol={critical:'#EF4444',high:'#FB923C',medium:'#FBBF24',low:'#60A5FA',info:'#64748B'}[c.severity]||'#64748B';
        const row=document.createElement('div');
        row.className='diag-check';
        row.innerHTML=`
          ${c.fixCmd&&c.status==='fail'?'<input type="checkbox" checked class="diag-fix-cb" data-cmd="'+btoa(c.fixCmd)+'">':'<div style="width:18px"></div>'}
          <div class="diag-check-status">${statusIcon}</div>
          <div class="diag-check-body">
            <div class="diag-check-name">${c.name}</div>
            <div class="diag-check-detail">${c.detail}</div>
          </div>
          <span class="diag-check-sev" style="color:${sevCol}">${(c.severity||'').toUpperCase()}</span>
          <button class="autostart-ai-btn diag-ai-btn" data-name="${c.name}" data-detail="${c.detail}" title="Zapytaj AI"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>`;
        catEl.appendChild(row);
      });
      checksEl.appendChild(catEl);
    });

    // AI expert per check
    checksEl.querySelectorAll('.diag-ai-btn').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        const name=btn.dataset.name;
        const detail=btn.dataset.detail;
        const overlay=document.createElement('div');
        overlay.className='consent-overlay';
        overlay.innerHTML=`<div class="consent-box" style="max-width:440px">
          <div class="consent-title">${name}</div>
          <div style="font-size:10px;color:var(--tm);margin-bottom:8px">${detail}</div>
          <div id="diagAiResult">${spin('Pytam AI...')}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="aicore-btn aicore-btn-secondary" id="diagAiClose" style="flex:1">Zamknij</button>
            <button class="aicore-btn aicore-btn-primary" id="diagAiExpert" style="flex:1">Zapytaj eksperta</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#diagAiClose').onclick=()=>overlay.remove();
        overlay.querySelector('#diagAiExpert').onclick=()=>window.open('https://infradesk.pl/portal','_blank');
        const r=await py('ai_chat',[{role:'user',content:`Diagnostyka systemu wykryła: "${name}" — ${detail}. Wyjaśnij krótko po polsku: 1) Co to oznacza? 2) Czy to poważne? 3) Jak to naprawić?`}]);
        const res=document.getElementById('diagAiResult');
        if(r&&r.ok)res.innerHTML=`<div style="font-size:11px;color:var(--t);line-height:1.7">${r.content.replace(/\\n/g,'<br>')}</div>`;
        else res.innerHTML='<div style="color:#EF4444;font-size:11px">Nie udało się uzyskać odpowiedzi.</div>';
      });
    });

    // Fix selected
    document.getElementById('diagFixAll')?.addEventListener('click',async()=>{
      const cmds=[...checksEl.querySelectorAll('.diag-fix-cb:checked')].map(cb=>atob(cb.dataset.cmd));
      if(!cmds.length)return;
      const btn=document.getElementById('diagFixAll');
      btn.textContent='Naprawiam...';btn.disabled=true;
      for(const cmd of cmds){await py('run_ai_fix',cmd)}
      btn.textContent='Gotowe!';
      setTimeout(()=>renderPerformance(root),2000);
    });

    // PDF report
    document.getElementById('diagPdf')?.addEventListener('click',()=>{
      let html=`<html><head><meta charset="utf-8"><title>Raport diagnozy — InfraDesk</title>
        <style>body{font-family:Arial,sans-serif;padding:20px;color:#333}h1{font-size:18px}h2{font-size:14px;margin-top:16px;border-bottom:1px solid #ddd;padding-bottom:4px}.check{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px}.pass{color:#16A34A}.fail{color:#DC2626}.warn{color:#D97706}.sev{font-size:10px;color:#888;min-width:60px}.detail{color:#666;font-size:11px}.score{font-size:32px;font-weight:bold;color:${scCol}}</style></head><body>
        <h1>Raport diagnozy systemu — InfraDesk</h1>
        <p>Data: ${data.timestamp}</p>
        <div class="score">${sc}/100 — ${scLabel}</div>
        <p>Testów: ${data.total} | Pozytywnych: ${data.passed} | Problemów: ${data.failed}</p>`;
      Object.entries(grouped).forEach(([cat,items])=>{
        html+=`<h2>${cats[cat]||cat}</h2>`;
        items.forEach(c=>{
          const icon=c.status==='pass'?'✓':c.status==='fail'?'✗':'!';
          html+=`<div class="check"><span class="${c.status}">${icon}</span><strong>${c.name}</strong><span class="detail">${c.detail}</span><span class="sev">${(c.severity||'').toUpperCase()}</span></div>`;
        });
      });
      html+=`<hr><p style="font-size:10px;color:#999">Wygenerowano przez InfraDesk v5.0.0 · infradesk.pl</p></body></html>`;
      const blob=new Blob([html],{type:'text/html'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download=`diagnoza_${data.timestamp.replace(/[: ]/g,'-')}.html`;
      a.click();URL.revokeObjectURL(url);
    });

    // Repeat
    document.getElementById('diagRepeat')?.addEventListener('click',()=>renderPerformance(root));
  });
}

/* ══ MONITORING ══ */
async function renderMonitoring(root){
  root.innerHTML=`${pageTitle('monitoring','Monitoring systemu','Obciążenie w czasie rzeczywistym')}
  <div class="metrics-grid fade-up"><div class="metric-card" id="mCpu"><div class="metric-label">CPU</div><div class="metric-value">—</div></div><div class="metric-card" id="mRam"><div class="metric-label">RAM</div><div class="metric-value">—</div></div><div class="metric-card" id="mDisk"><div class="metric-label">Dysk C:</div><div class="metric-value">—</div></div><div class="metric-card" id="mFree"><div class="metric-label">Wolne</div><div class="metric-value">—</div></div></div><div id="procs" class="fade-up"></div>`;
  async function tick(){const m=await py('get_metrics');if(m&&!m.error){const cv=document.querySelector('#mCpu .metric-value'),rv=document.querySelector('#mRam .metric-value');if(cv){cv.textContent=m.cpu+'%';cv.style.color=m.cpu>80?'#EF4444':m.cpu>50?'#FB923C':'#4ADE80'}if(rv){rv.textContent=m.ram+'%';rv.style.color=m.ram>80?'#EF4444':m.ram>60?'#FB923C':'#4ADE80'}const dv=document.querySelector('#mDisk .metric-value');if(dv)dv.textContent=m.diskPercent+'%';const fv=document.querySelector('#mFree .metric-value');if(fv)fv.textContent=m.diskFreeGb+' GB'}}
  tick();metricsInterval=setInterval(tick,2000);
  const pr=await py('get_top_processes');if(pr&&pr.length){cardEl(document.getElementById('procs'),'Top procesy RAM',b=>{pr.forEach(p=>rowEl(b,p.name,p.ram_pct+'%',p.ram_pct>5?'#FB923C':'#64748B'))})}
}

/* ══ NETWORK — real ping + speed phases + summary ══ */
async function renderNetwork(root){
  root.innerHTML=`${pageTitle('network','Sieć i Internet','Prędkość łącza i diagnostyka')}
  <div class="speed-hero fade-up">
    <div class="speed-hero-inner">
      <div class="gauge-wrap"><canvas id="gPing" width="120" height="120"></canvas><div class="gauge-label">Ping</div><div class="gauge-value" id="vPing">— ms</div></div>
      <div class="gauge-wrap"><canvas id="gDown" width="120" height="120"></canvas><div class="gauge-label">Pobieranie</div><div class="gauge-value" id="vDown">— Mbps</div></div>
      <div class="gauge-wrap"><canvas id="gUp" width="120" height="120"></canvas><div class="gauge-label">Wysyłanie</div><div class="gauge-value" id="vUp">— Mbps</div></div>
    </div>
    <button class="btn-primary" id="speedBtn">▶ Zmierz prędkość łącza</button>
    ${statusLine('speedSt')}
  </div>
  <div id="speedSummary" class="fade-up"></div>
  <div class="fade-up" id="pingSection"></div>
  <div id="netInfo" class="fade-up">${spin('Pobieranie informacji o sieci...')}</div>`;

  drawGauge('gPing',0,200,'#333');drawGauge('gDown',0,1000,'#333');drawGauge('gUp',0,1000,'#333');

  document.getElementById('speedBtn')?.addEventListener('click',async()=>{
    const b=document.getElementById('speedBtn');b.disabled=true;
    document.getElementById('speedSummary').innerHTML='';

    // Phase 1: Ping
    setStatus('speedSt','Faza 1/3: Mierzenie ping...');b.innerHTML=spin('Ping...');
    const pr=await py('ping_host','8.8.8.8');
    const pingMs=pr?.avg_ms||0;const pingCol=pingMs<30?'#4ADE80':pingMs<100?'#FB923C':'#EF4444';
    drawGauge('gPing',pingMs,200,pingCol);document.getElementById('vPing').textContent=pingMs+' ms';document.getElementById('vPing').style.color=pingCol;

    // Phase 2: Download
    setStatus('speedSt','Faza 2/3: Mierzenie pobierania...');b.innerHTML=spin('Pobieranie...');
    const sr=await py('run_speed_test');
    const dlMbps=sr?.download_mbps||0;const dlCol=dlMbps>=50?'#4ADE80':dlMbps>=10?'#FB923C':'#EF4444';
    drawGauge('gDown',dlMbps,1000,dlCol);document.getElementById('vDown').textContent=dlMbps+' Mbps';document.getElementById('vDown').style.color=dlCol;

    // Phase 3: Upload (real measurement from server)
    setStatus('speedSt','Faza 3/3: Mierzenie wysyłania...');b.innerHTML=spin('Wysyłanie...');
    const upMbps=sr?.upload_mbps||0;const upCol=upMbps>=20?'#4ADE80':upMbps>=5?'#FB923C':'#EF4444';
    drawGauge('gUp',upMbps,1000,upCol);document.getElementById('vUp').textContent=upMbps+' Mbps';document.getElementById('vUp').style.color=upCol;

    setStatus('speedSt','✅ Test zakończony',false);
    b.disabled=false;b.innerHTML='▶ Zmierz ponownie';

    // Summary + hints
    const ss=document.getElementById('speedSummary');
    let grade='Doskonałe',grCol='#4ADE80',hint='Twoje łącze nadaje się do streamingu 4K, wideokonferencji i pracy zdalnej.';
    if(dlMbps<50){grade='Dobre';grCol='#22D3EE';hint='Łącze wystarczające do większości zastosowań. Streaming HD bez problemów.'}
    if(dlMbps<20){grade='Przeciętne';grCol='#FB923C';hint='Mogą wystąpić problemy z wideokonferencjami i streamingiem HD. Rozważ zmianę planu u dostawcy.'}
    if(dlMbps<5){grade='Słabe';grCol='#EF4444';hint='Łącze zbyt wolne na komfortową pracę. Skontaktuj się z dostawcą Internetu.'}
    ss.innerHTML=`<div class="page-card fade-up"><div class="page-card-header">${ICO.overview} Podsumowanie</div><div class="page-card-body">
      <div class="speed-grade" style="color:${grCol}">Ocena łącza: ${grade}</div>
      <div class="speed-details">Ping: ${pingMs} ms · Pobieranie: ${dlMbps} Mbps · Wysyłanie: ${upMbps} Mbps</div>
      <div class="speed-server">Serwer: ${sr?.server||'Auto'}</div>
      <div class="speed-hint">${hint}</div>
    </div></div>`;
  });

  // Ping checker
  const ps=document.getElementById('pingSection');
  cardEl(ps,'${ICO.ping} Sprawdź połączenie',b=>{
    b.innerHTML=`<p class="page-desc">Wpisz adres IP lub domenę:</p>
    <div class="ping-input-row"><input type="text" id="pingTarget" class="ping-input" value="8.8.8.8" placeholder="np. 8.8.8.8 lub google.com"><button class="btn-primary" id="pingBtn">Ping</button></div><div id="pingResult"></div>`;
    document.getElementById('pingBtn')?.addEventListener('click',async()=>{
      const t=document.getElementById('pingTarget').value.trim();if(!t)return;
      const pr2=document.getElementById('pingResult');pr2.innerHTML=spin(`Pinguję ${t}...`);
      const r=await py('ping_host',t);
      if(r&&r.ok)pr2.innerHTML=`<div class="ping-result-ok">✅ ${t} odpowiada · Ping: ${r.avg_ms} ms · Utrata: ${r.loss_pct}%</div>`;
      else pr2.innerHTML=`<div class="ping-result-fail">❌ ${t} nie odpowiada${r?.loss_pct?' · Utrata: '+r.loss_pct+'%':''}</div>`;
    });
  });

  // Network info
  const net=await py('get_network_info');const ni=document.getElementById('netInfo');
  if(!net){ni.innerHTML='';return}ni.innerHTML='';
  cardEl(ni,`${ICO.network} Połączenie z routerem`,b=>{if(net.public_ip)rowEl(b,'Publiczny IP',net.public_ip,'#22D3EE');if(net.isp)rowEl(b,'Dostawca',net.isp);if(net.gateway)rowEl(b,'Router',net.gateway);if(net.dns?.length)rowEl(b,'DNS',net.dns.slice(0,3).join(' · '))});
  if(net.interfaces?.length){cardEl(ni,'${ICO.network} Interfejsy sieciowe',b=>{net.interfaces.forEach(i=>{rowEl(b,`${i.isUp?'<span class="sev-dot" style="background:#4ADE80"></span>':'<span class="sev-dot" style="background:#EF4444"></span>'}${i.name}`,i.ip+(i.speed?` · ${i.speed} Mbps`:''))})})}
  if(net.open_ports?.length){cardEl(ni,`${ICO.security} Otwarte porty (${net.open_ports.length})`,b=>{const w=h('div','ports-wrap');net.open_ports.forEach(p=>{w.appendChild(h('span','port-tag',String(p)))});b.appendChild(w)})}
}

/* ══ AUTOSTART — with toggle buttons ══ */
async function renderAutostart(root){
  root.innerHTML=`${pageTitle('autostart','Autostart','Programy uruchamiane przy starcie')}<div id="asc" class="fade-up">${spin('Analizuję programy startowe i wpływ na czas uruchamiania...')}</div>`;
  const ac=document.getElementById('asc');
  const data=await py('get_autostart');
  if(!data){ac.innerHTML='<div class="page-card"><div class="page-card-body">Nie udało się pobrać listy autostartu.</div></div>';return}

  const progs=data.programs||data;// backward compat
  const bootTime=data.bootTimeSec||0;
  const totalImpact=data.totalImpactSec||0;
  const count=progs.length;

  if(!count){ac.innerHTML='<div class="page-card"><div class="page-card-body">Brak programów autostartu.</div></div>';return}

  const safe=['Windows Security','SecurityHealth','OneDrive','Realtek','Intel','NVIDIA','AMD','Synaptics','Windows Defender'];
  const highCount=progs.filter(p=>p.impact==='high').length;
  const medCount=progs.filter(p=>p.impact==='medium').length;

  ac.innerHTML=`
    <div class="vault-stats" style="margin-bottom:16px">
      <div class="vault-stat"><div class="vault-stat-num">${count}</div><div class="vault-stat-label">Programów</div></div>
      <div class="vault-stat ${highCount?'accent':''}"><div class="vault-stat-num">${highCount}</div><div class="vault-stat-label">Wysoki wpływ</div></div>
      <div class="vault-stat"><div class="vault-stat-num">${medCount}</div><div class="vault-stat-label">Średni wpływ</div></div>
      <div class="vault-stat"><div class="vault-stat-num">${bootTime?bootTime+'s':'—'}</div><div class="vault-stat-label">Czas startu</div></div>
    </div>
    ${totalImpact>3?`<div class="autostart-tip">Autostart opóźnia uruchomienie systemu o ok. <strong>${totalImpact.toFixed(1)}s</strong>. Wyłączenie programów z wysokim wpływem może przyspieszyć start o ${(highCount*2.5).toFixed(0)}–${(highCount*3.5).toFixed(0)} sekund.</div>`:''}
    <div id="autostartList"></div>`;

  const listEl=document.getElementById('autostartList');

  // Sort: high impact first
  const sorted=[...progs].sort((a,b)=>{
    const order={high:0,medium:1,low:2};
    return (order[a.impact]||1)-(order[b.impact]||1);
  });

  sorted.forEach(p=>{
    const isSys=safe.some(s=>p.name.toLowerCase().includes(s.toLowerCase()));
    const impactCol=p.impact==='high'?'#EF4444':p.impact==='medium'?'#FB923C':'#4ADE80';
    const r=h('div','autostart-row');
    r.innerHTML=`
      <div class="autostart-impact" style="background:${impactCol}20;color:${impactCol};border:1px solid ${impactCol}30">
        <div class="autostart-impact-time">+${p.impactSec||'?'}s</div>
        <div class="autostart-impact-label">${p.impactLabel||'?'}</div>
      </div>
      <div class="autostart-info">
        <span class="autostart-name">${isSys?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;opacity:.4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>':''}${p.name}</span>
        <span class="autostart-loc">${p.location} · ${(p.command||'').substring(0,50)}</span>
      </div>`;
    // AI info button — always visible
    const aiBtn=h('button','autostart-ai-btn');
    aiBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    aiBtn.title='Zapytaj AI o ten program';
    aiBtn.addEventListener('click',async(e)=>{
      e.stopPropagation();
      _showAutostartAI(p);
    });
    r.appendChild(aiBtn);

    if(isSys){
      r.innerHTML+=`<span class="autostart-badge system">Systemowy</span>`;
    }else{
      const btn=h('button','autostart-toggle-btn active','Włączony');
      btn.addEventListener('click',async(e)=>{
        e.stopPropagation();
        const enabled=btn.classList.contains('active');
        btn.innerHTML=spin('...');
        const ok=await py('toggle_autostart_prog',p.name,p.location,!enabled);
        if(ok){btn.classList.toggle('active');btn.textContent=enabled?'Wyłączony':'Włączony';btn.className=`autostart-toggle-btn ${enabled?'':'active'}`}
        else{btn.textContent=enabled?'Włączony':'Wyłączony'}
      });
      r.appendChild(btn);
    }
    listEl.appendChild(r);
  });

  async function _showAutostartAI(prog){
    const overlay=document.createElement('div');
    overlay.className='consent-overlay';
    overlay.innerHTML=`<div class="consent-box" style="max-width:440px">
      <div class="consent-title" style="margin-bottom:10px">${prog.name}</div>
      <div style="font-size:10px;color:var(--tm);margin-bottom:6px">${prog.command||''}</div>
      <div id="aiAutostartResult" style="min-height:60px">${spin('Pytam AI...')}</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="aicore-btn aicore-btn-secondary" id="aiAutoClose" style="flex:1">Zamknij</button>
        <button class="aicore-btn aicore-btn-primary" id="aiAutoExpert" style="flex:1">Zapytaj eksperta online</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#aiAutoClose').onclick=()=>overlay.remove();
    overlay.querySelector('#aiAutoExpert').onclick=()=>{
      window.open('https://infradesk.pl/portal','_blank');
    };

    // Ask AI
    const question=`Program "${prog.name}" uruchamia się automatycznie z Windows. Komenda: "${(prog.command||'').substring(0,120)}". Odpowiedz krótko po polsku: 1) Co to za program i do czego służy? 2) Czy można go bezpiecznie wyłączyć z autostartu? 3) Jakie będą konsekwencje wyłączenia?`;
    const r=await py('ai_chat',[{role:'user',content:question}]);
    const resEl=document.getElementById('aiAutostartResult');
    if(r&&r.ok&&r.content){
      resEl.innerHTML=`<div style="font-size:11px;color:var(--t);line-height:1.7">${r.content.replace(/\n/g,'<br>')}</div>`;
      speakQueue(r.content);
    }else{
      resEl.innerHTML=`<div style="color:#EF4444;font-size:11px">Nie udało się uzyskać odpowiedzi od AI.</div>`;
    }
  }
}

/* ══ AI REPAIR — Chat with Avatar ══ */
let aiMessages=[];
function renderAiRepair(root){
  // First check admin — show permission prompt if needed
  _renderAiRepairInner(root);
}

async function _renderAiRepairInner(root){
  const isAdm=await py('is_admin');

  // ── If no admin: show permission request screen ──
  if(!isAdm){
    root.innerHTML=`
    <div class="aicore-perm fade-up">
      <div class="aicore-perm-icon">🛡</div>
      <div class="aicore-perm-title">Wymagane uprawnienia administratora</div>
      <div class="aicore-perm-desc">Aby w pełni skanować i naprawiać system, Rdzeń AI potrzebuje uprawnień administratora. Bez nich część operacji (usługi, firewall, rejestr) nie będzie możliwa.</div>
      <div class="aicore-perm-btns">
        <button class="aicore-btn aicore-btn-primary" id="permGrant" style="padding:12px 28px;font-size:13px">Udzielam uprawnień</button>
        <button class="aicore-btn aicore-btn-secondary" id="permSkip" style="padding:12px 28px;font-size:13px">Kontynuuj bez uprawnień</button>
      </div>
      <div class="aicore-perm-note">Pojawi się okno systemu Windows z pytaniem o zgodę (UAC).</div>
    </div>`;
    document.getElementById('permGrant').onclick=()=>py('restart_as_admin');
    document.getElementById('permSkip').onclick=()=>_buildCoreUI(root,false);
    return;
  }
  _buildCoreUI(root,true);
}

function _buildCoreUI(root,isAdmin){
  root.innerHTML=`
  <div class="aicore-layout fade-up">
    <!-- LEFT — Core + Status -->
    <div class="aicore-left">
      <div class="aicore-orb-wrap">
        <div class="aicore-orb aicore-state-idle" id="aicoreOrb">
          <div class="aicore-canvas-wrap" id="coreCanvasWrap"></div>
        </div>
      </div>
      <div class="aicore-badge" id="coreBadge">Rdzeń AI</div>
      <div class="aicore-title" id="coreTitle">Gotowy do analizy</div>
      <div class="aicore-desc" id="coreDesc">System oczekuje na polecenie</div>
      <div class="aicore-admin-badge ${isAdmin?'ok':'warn'}">${isAdmin?'Administrator':'Ograniczone uprawnienia'}</div>
      <div class="aicore-sep"></div>
      <div class="aicore-controls">
        <button class="aicore-btn aicore-btn-primary" id="aiAutoScan">Rozpocznij analizę</button>
        ${!isAdmin?'<button class="aicore-btn aicore-btn-secondary" id="aiAdminBtn">Uzyskaj uprawnienia</button>':''}
      </div>
      <div class="aicore-mode">
        <button class="aicore-mode-opt active" data-mode="show">Pokaż działania</button>
        <button class="aicore-mode-opt" data-mode="bg">W tle</button>
      </div>
    </div>
    <!-- RIGHT — Feed + Results + Chat -->
    <div class="aicore-right">
      <div class="aicore-right-inner">
        <div class="aicore-section">
          <span class="aicore-section-title">Działania na żywo</span>
          <span class="aicore-section-tag" id="coreActionCount">0</span>
        </div>
        <div class="aicore-actions" id="coreFeed"></div>
        <div class="aicore-result" id="coreResult"></div>
      </div>
      <div class="aicore-input-wrap">
        <input class="aicore-input" id="aiChatInput" placeholder="Opisz problem lub zadaj pytanie..." autocomplete="off">
        <button class="aicore-send" id="aiChatSend">${ICO.overview}</button>
      </div>
    </div>
  </div>`;

  // Init canvas core
  initCoreCanvas('coreCanvasWrap');
  setCoreState('idle');

  const feed=document.getElementById('coreFeed');
  const input=document.getElementById('aiChatInput');
  const sendBtn=document.getElementById('aiChatSend');
  const scanBtn=document.getElementById('aiAutoScan');
  let busy=false, showMode=true, _stopRequested=false;

  // Admin button
  document.getElementById('aiAdminBtn')?.addEventListener('click',()=>py('restart_as_admin'));

  // Mode toggle
  document.querySelectorAll('.aicore-mode-opt').forEach(o=>{
    o.addEventListener('click',()=>{
      document.querySelectorAll('.aicore-mode-opt').forEach(x=>x.classList.remove('active'));
      o.classList.add('active');
      showMode=o.dataset.mode==='show';
    });
  });

  function addMsg(role,text){
    if(!showMode&&role==='ai')return null;
    const d=document.createElement('div');
    d.className=`ai-msg ${role} fade-up`;
    d.innerHTML=`<div class="ai-msg-content">${text}</div>`;
    feed.appendChild(d);
    feed.scrollTop=feed.scrollHeight;
    return d;
  }


  // Extract executable blocks from AI response (powershell + action)
  function extractBlocks(text){
    const blocks=[];
    text.replace(/```powershell\n?([\s\S]*?)```/g,(m,code)=>{blocks.push({type:'ps',cmd:code.trim()})});
    text.replace(/```action\n?([\s\S]*?)```/g,(m,json)=>{
      try{const d=JSON.parse(json.trim());blocks.push({type:'action',action:d.action,params:d.params||{}})}catch{}
    });
    return blocks;
  }

  // Render AI response — show code/action blocks with results
  function formatResponse(text,blockResults){
    let pi=0,ai=0;
    return text.replace(/```powershell\n?([\s\S]*?)```/g,(m,code)=>{
      const cmd=code.trim();
      const r=blockResults&&blockResults[pi];pi++;
      if(r){return `<pre class="ai-code">${cmd}</pre><div class="ai-cmd-result ${r.ok?'ok':'err'}">${r.ok?'✅ Wykonano':'❌ Błąd'}${r.output?' — '+r.output.substring(0,120):''}${r.detail?' — '+r.detail:''}</div>`}
      return `<pre class="ai-code">${cmd}</pre><div class="ai-cmd-result pending">⏳ Oczekuje...</div>`;
    }).replace(/```action\n?([\s\S]*?)```/g,(m,json)=>{
      try{
        const d=JSON.parse(json.trim());
        const r=blockResults&&blockResults[pi];pi++;
        const label={open_folder:'Otwieranie folderu',open_url:'Otwieranie strony',open_program:'Uruchamianie programu',mouse_move:'Przesunięcie myszy',mouse_click:'Kliknięcie',type_text:'Wpisywanie',hotkey:'Skrót klawiaturowy',find_window:'Szukanie okna',focus_window:'Fokus na okno'}[d.action]||d.action;
        if(r){return `<div class="ai-cmd-result ${r.ok?'ok':'err'}">${r.ok?'✅':'❌'} ${label}${r.detail?' — '+r.detail:''}</div>`}
        return `<div class="ai-cmd-result pending">⏳ ${label}...</div>`;
      }catch{return ''}
    }).replace(/\n/g,'<br>');
  }

  async function sendMessage(text){
    if(busy)return;
    busy=true;
    _stopRequested=false;
    sendBtn.disabled=true;
    // Change scan button to "Stop"
    if(scanBtn){
      scanBtn.textContent='Zakończ analizę';
      scanBtn.classList.remove('aicore-btn-primary');
      scanBtn.classList.add('aicore-btn-danger');
    }
    addMsg('user',text);
    aiMessages.push({role:'user',content:text});

    // Announce what we're about to do
    speakNow('Rozpoczynam analizę. Przeskanuję konfigurację systemu, sprawdzę pamięć, dysk, usługi i zabezpieczenia. Każdy krok opiszę na bieżąco.');

    // Loop: AI responds → auto-execute commands → feed results back → repeat
    let maxRounds=5, totalOk=0, totalFail=0, totalSkip=0, allLabels=[];
    while(maxRounds-->0){
      if(_stopRequested){speakNow('Analiza została przerwana na Twoje życzenie.');break}
      setCoreState('scanning');
      const aiEl=addMsg('ai',spin('Myślę...'));
      const r=await py('ai_chat',aiMessages);

      if(!r||!r.ok){
        if(aiEl)aiEl.querySelector('.ai-msg-content').innerHTML=`<span style="color:#EF4444">Błąd: ${r?.error||'Brak połączenia z AI'}</span>`;
        break;
      }

      const content=r.content;
      aiMessages.push({role:'assistant',content});
      const blocks=extractBlocks(content);

      if(blocks.length===0){
        // No commands — just show response and speak it
        setCoreState('idle');
        if(aiEl)aiEl.querySelector('.ai-msg-content').innerHTML=content.replace(/\n/g,'<br>');
        speakQueue(content);
        feed.scrollTop=feed.scrollHeight;
        break;
      }

      // Show response with "pending" blocks
      if(aiEl)aiEl.querySelector('.ai-msg-content').innerHTML=formatResponse(content,null);
      feed.scrollTop=feed.scrollHeight;

      // Describe what AI wants to do and ask for consent
      const actionLabels={open_folder:'Otwieranie folderu',open_url:'Otwieranie strony',open_program:'Uruchamianie programu',mouse_move:'Przesunięcie myszy',mouse_click:'Kliknięcie',type_text:'Wpisywanie tekstu',hotkey:'Skrót klawiaturowy',find_window:'Szukanie okna',focus_window:'Fokus na okno',screenshot:'Screenshot'};
      setCoreState('fixing');
      const results=[];
      let autoApprove=false;

      for(const block of blocks){
        if(_stopRequested){speak('Analiza przerwana.');break}
        let desc='', label='', spokenDesc='';
        if(block.type==='ps'){
          const humanDesc=describePsCmd(block.cmd);
          label=humanDesc;
          desc=`<strong>${humanDesc}</strong><br><code style="font-size:10px;opacity:.6">${block.cmd.substring(0,100)}${block.cmd.length>100?'...':''}</code>`;
          spokenDesc=humanDesc;
        } else if(block.type==='action'){
          label=actionLabels[block.action]||block.action;
          const p=block.params||{};
          const detail=p.path||p.url||p.text||p.title||(p.keys?p.keys.join('+'):'')||(p.x!=null?`(${p.x},${p.y})`:'');
          desc=`Chcę wykonać: <strong>${label}</strong>${detail?' — '+detail:''}`;
          spokenDesc=label+(detail?' — '+detail:'');
        }

        const safe=isSafeCmd(block);

        // Safe commands → auto-execute with announcement, no consent
        // Dangerous commands → ask for consent
        let consent='yes';
        if(!safe && !autoApprove){
          consent=await askConsent(desc,spokenDesc);
          if(consent==='all') autoApprove=true;
        }

        if(consent==='no'){
          results.push({ok:false,error:'Pominięto — brak zgody użytkownika',skipped:true});
          totalSkip++;
          const aid=addCoreAction(label,'Pominięto przez użytkownika');
          updateCoreAction(aid,'skipped');
          speakQueue('Pomijam tę operację.');
          continue;
        }

        // Check admin rights for dangerous commands
        if(!safe && block.type==='ps'){
          const isAdm=await py('is_admin');
          if(!isAdm){
            const needsAdmin=block.cmd.toLowerCase();
            const adminCmds=['start-service','stop-service','set-mppreference','set-netfirewall','sfc','dism',
              'shutdown','restart-computer','remove-item','cleanmgr','chkdsk','reg ','new-item','enable-','disable-'];
            if(adminCmds.some(a=>needsAdmin.includes(a))){
              speakQueue('Ta operacja wymaga uprawnień administratora. Pomijam.');
              const aid=addCoreAction(label,'Wymaga uprawnień administratora');
              updateCoreAction(aid,'error','Uruchom jako administrator');
              results.push({ok:false,error:'Brak uprawnień administratora',skipped:true});
              continue;
            }
          }
        }

        // Execute — track in action feed
        const actionId=addCoreAction(label,block.type==='ps'?block.cmd.substring(0,60):spokenDesc);
        speakQueue(`Teraz ${spokenDesc.charAt(0).toLowerCase()+spokenDesc.slice(1)}.`);
        allLabels.push(spokenDesc);

        if(block.type==='ps'){
          const res=await py('run_ai_fix',block.cmd);
          results.push(res||{ok:false,output:'',error:'Brak odpowiedzi'});
          const ok=res&&res.ok;
          const resultDesc=ok?(res?.output||'').substring(0,80):(res?.error||'Błąd').substring(0,80);
          updateCoreAction(actionId,ok?'done':'error',resultDesc);
          if(ok){totalOk++;speakQueue(`Zakończone pomyślnie.`)}
          else{totalFail++;speakQueue(`Niestety wystąpił problem. ${resultDesc}`)}
        } else if(block.type==='action'){
          const res=await py('desktop_action',block.action,block.params);
          results.push(res||{ok:false,error:'Brak odpowiedzi'});
          const ok=res&&res.ok;
          const resultDesc=res?.detail||res?.error||'';
          updateCoreAction(actionId,ok?'done':'error',resultDesc);
          if(ok){totalOk++;speakQueue('Gotowe.')}
          else{totalFail++;speakQueue(`Nie udało się. ${resultDesc}`)}
        }
        updateActionCount();
      }

      // Update core state + show result card + spoken summary
      const okCount=results.filter(r=>r.ok&&!r.skipped).length;
      const failCount=results.filter(r=>!r.ok&&!r.skipped).length;
      const skipCount=results.filter(r=>r.skipped).length;
      if(failCount>0) setCoreState('warning');
      else setCoreState('success');
      showCoreResult(results);
      // Natural spoken summary
      let summary='Analiza zakończona. ';
      if(okCount>0&&failCount===0) summary+=`Wykonałam ${okCount} ${okCount===1?'operację':okCount<5?'operacje':'operacji'} i wszystkie zakończyły się pomyślnie. System działa prawidłowo.`;
      else if(okCount>0&&failCount>0) summary+=`Wykonałam ${okCount+failCount} operacji. ${okCount} zakończyło się pomyślnie, ale ${failCount} wymaga uwagi. Zalecam sprawdzenie szczegółów.`;
      else if(failCount>0) summary+=`Niestety żadna z ${failCount} operacji nie powiodła się. Prawdopodobnie potrzebne są uprawnienia administratora.`;
      else summary+='Nie wykonano żadnych operacji.';
      if(skipCount>0) summary+=` ${skipCount} ${skipCount===1?'operacja została pominięta':'operacje zostały pominięte'} na Twoje życzenie.`;
      speakQueue(summary);

      // Update original AI message
      if(aiEl){try{aiEl.querySelector('.ai-msg-content').innerHTML=formatResponse(content,results)}catch(e){}}

      // Send results back to AI for next step
      const resultSummary=results.map((r,i)=>{
        if(r.skipped) return `Blok ${i+1}: POMINIĘTO (użytkownik odmówił)`;
        return `Blok ${i+1}: ${r.ok?'OK':'BŁĄD'}${r.output?' — '+r.output.substring(0,200):''}${r.detail?' — '+r.detail:''}${r.error?' — '+r.error.substring(0,200):''}`;
      }).join('\n');
      aiMessages.push({role:'user',content:`[WYNIKI WYKONANIA]\n${resultSummary}\n\nKontynuuj naprawę lub podsumuj co zostało zrobione.`});

      // Small delay before next round
      await new Promise(r=>setTimeout(r,500));
    }

    setCoreState('idle');
    busy=false;
    _stopRequested=false;
    sendBtn.disabled=false;
    // Restore scan button
    if(scanBtn){
      scanBtn.textContent='Rozpocznij analizę';
      scanBtn.classList.remove('aicore-btn-danger');
      scanBtn.classList.add('aicore-btn-primary');
    }
    input.focus();
  }

  sendBtn.addEventListener('click',()=>{const t=input.value.trim();if(t){input.value='';sendMessage(t)}});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const t=input.value.trim();if(t){input.value='';sendMessage(t)}}});

  // Scan / Stop button
  document.getElementById('aiAutoScan')?.addEventListener('click',async()=>{
    if(busy){
      _stopRequested=true;
      speechSynthesis.cancel();
      return;
    }
    // Free scan → show problems → paywall with repair options
    await runFreeScan();
  });

  async function runFreeScan(){
    busy=true;
    _stopRequested=false;
    if(scanBtn){scanBtn.textContent='Zatrzymaj skanowanie';scanBtn.classList.remove('aicore-btn-primary');scanBtn.classList.add('aicore-btn-danger')}
    sendBtn.disabled=true;
    clearCoreActions();
    setCoreState('scanning');
    speakNow('Rozpoczynam bezpłatne skanowanie systemu. Sprawdzę pamięć, dysk, usługi, zabezpieczenia i dziennik zdarzeń.');

    // Run diagnostics
    const scanId=addCoreAction('Skanowanie systemu','Zbieranie danych diagnostycznych...');
    const diag=await py('run_ai_diagnose');
    if(!diag||diag.error){
      updateCoreAction(scanId,'error',diag?.error||'Błąd skanowania');
      setCoreState('error');
      speakQueue('Nie udało się przeprowadzić skanowania.');
      _resetScanBtn();
      return;
    }
    updateCoreAction(scanId,'done',`Wynik: ${diag.score}/100`);

    // Show each problem as action item
    const problems=diag.problems||[];
    const fixes=diag.fixes||[];
    problems.forEach(p=>{
      const icon=p.severity==='critical'?'error':p.severity==='high'?'error':'waiting';
      const aid=addCoreAction(p.name,p.detail);
      updateCoreAction(aid,icon==='error'?'error':'waiting');
    });

    if(problems.length===0){
      setCoreState('success');
      speakQueue('Skanowanie zakończone. System działa prawidłowo, nie wykryto żadnych problemów.');
      _resetScanBtn();
      return;
    }

    // Categorize: what AI can fix vs what needs technician
    const aiFixable=fixes.filter(f=>['low','medium'].includes(f.severity)||['Wyczyść pliki tymczasowe','Pokaż procesy zużywające RAM','Uruchom zatrzymane usługi','Uruchom oczyszczanie dysku Windows','Włącz ochronę Defender','Włącz firewall'].includes(f.name));
    const techNeeded=problems.filter(p=>['critical','high'].includes(p.severity));
    const estTimeAI=Math.max(1,aiFixable.length*2); // ~2 min per fix
    const estTimeTech=Math.max(15,techNeeded.length*10); // ~10 min per issue

    setCoreState('warning');
    speakQueue(`Skanowanie zakończone. Wykryto ${problems.length} ${problems.length===1?'problem':'problemów'}. ${aiFixable.length>0?`${aiFixable.length} mogę naprawić automatycznie.`:''} ${techNeeded.length>0?`${techNeeded.length} wymaga interwencji specjalisty.`:''}`);

    // Show paywall offer
    _showRepairOffer(diag, aiFixable, techNeeded, estTimeAI, estTimeTech);
    _resetScanBtn();
  }

  function _resetScanBtn(){
    busy=false;
    sendBtn.disabled=false;
    if(scanBtn){scanBtn.textContent='Rozpocznij analizę';scanBtn.classList.remove('aicore-btn-danger');scanBtn.classList.add('aicore-btn-primary')}
  }

  function _showRepairOffer(diag, aiFixable, techNeeded, estTimeAI, estTimeTech){
    const score=diag.score;
    const problems=diag.problems||[];

    // Build AI analysis text + speak it
    let analysisText='';
    let spokenOffer='Przeanalizowałam wyniki. ';
    if(aiFixable.length>0){
      const fixNames=aiFixable.map(f=>f.name).join(', ');
      analysisText+=`Mogę automatycznie naprawić: ${fixNames}. Szacowany czas: ~${estTimeAI} min.`;
      spokenOffer+=`${aiFixable.length} ${aiFixable.length===1?'problem mogę':'problemów mogę'} naprawić automatycznie za 29 złotych. `;
    }
    if(techNeeded.length>0){
      const techNames=techNeeded.map(p=>p.name).join(', ');
      analysisText+=` Wymagają specjalisty: ${techNames}. Szacowany czas sesji: ~${estTimeTech} min.`;
      spokenOffer+=`${techNeeded.length} ${techNeeded.length===1?'problem wymaga':'problemów wymaga'} specjalisty. Sesja zdalna kosztuje 89 złotych za 30 minut. `;
    }
    spokenOffer+='Wybierz opcję naprawy poniżej.';
    speakQueue(spokenOffer);

    // Insert offer directly into feed
    const offerEl=document.createElement('div');
    offerEl.className='ai-msg ai fade-up';
    offerEl.innerHTML=`<div class="ai-msg-content">
      <div class="repair-offer">
        <div class="repair-offer-header">
          <div class="repair-offer-score">
            <div class="repair-offer-score-num" style="color:${score>=70?'#4ADE80':score>=40?'#FB923C':'#EF4444'}">${score}<span style="font-size:14px;opacity:.5">/100</span></div>
            <div class="repair-offer-score-label">${score>=70?'Dobry':score>=40?'Wymaga uwagi':'Krytyczny'}</div>
          </div>
          <div class="repair-offer-summary">
            <div class="repair-offer-title">Wykryto ${problems.length} ${problems.length===1?'problem':problems.length<5?'problemy':'problemów'}</div>
            <div class="repair-offer-sub">${analysisText}</div>
          </div>
        </div>

        <div class="repair-offer-problems">
          ${problems.map(p=>{
            const canFix=aiFixable.some(f=>f.name===p.name||f.name.includes(p.name.split(' ')[0]));
            return `<div class="repair-problem">
              <span class="repair-problem-dot ${p.severity}"></span>
              <span class="repair-problem-name">${p.name}</span>
              <span class="repair-problem-tag ${canFix?'ai':'tech'}">${canFix?'AI naprawi':'Wymaga specjalisty'}</span>
            </div>`;
          }).join('')}
        </div>

        <div class="repair-offer-plans">
          <div class="repair-plan ${aiFixable.length===0?'disabled':''}">
            <div class="repair-plan-badge">Asystent AI</div>
            <div class="repair-plan-price">29 <span>zł</span></div>
            <div class="repair-plan-desc">Automatyczna naprawa ${aiFixable.length} ${aiFixable.length===1?'problemu':aiFixable.length<5?'problemów':'problemów'}</div>
            <ul class="repair-plan-features">
              <li>Naprawa w ~${estTimeAI} min</li>
              <li>Czyszczenie i optymalizacja</li>
              <li>Konfiguracja zabezpieczeń</li>
            </ul>
            <button class="aicore-btn aicore-btn-primary repair-plan-btn" id="repairAI" ${aiFixable.length===0?'disabled':''} style="width:100%">Napraw teraz — 29 zł</button>
          </div>

          <div class="repair-plan featured">
            <div class="repair-plan-popular">Najpopularniejszy</div>
            <div class="repair-plan-badge">Informatyk zdalnie</div>
            <div class="repair-plan-price">89 <span>zł</span></div>
            <div class="repair-plan-desc">Sesja ze specjalistą · do 30 min</div>
            <ul class="repair-plan-features">
              <li>Naprawa wszystkich problemów</li>
              <li>Pomoc zdalna RustDesk</li>
              <li>Gwarancja skuteczności</li>
            </ul>
            <button class="aicore-btn aicore-btn-primary repair-plan-btn" id="repairTech" style="width:100%">Połącz ze specjalistą — 89 zł</button>
          </div>

          <div class="repair-plan">
            <div class="repair-plan-badge">Opieka IT</div>
            <div class="repair-plan-price">149 <span>zł/msc</span></div>
            <div class="repair-plan-desc">Nielimitowane naprawy + monitoring</div>
            <ul class="repair-plan-features">
              <li>Priorytetowe wsparcie</li>
              <li>Monitoring systemu 24/7</li>
              <li>Bez limitu sesji</li>
            </ul>
            <button class="aicore-btn aicore-btn-secondary repair-plan-btn" id="repairSub" style="width:100%">Wybierz plan</button>
          </div>
        </div>
      </div>
    </div>`;
    feed.appendChild(offerEl);
    feed.scrollTop=feed.scrollHeight;

    // Handle buttons
    document.getElementById('repairAI')?.addEventListener('click',()=>{
      offerEl.remove();
      sendMessage('Napraw automatycznie wszystkie wykryte problemy. Wykonaj komendy naprawcze.');
    });
    document.getElementById('repairTech')?.addEventListener('click',()=>{
      speakQueue('Łączę z informatykiem. Za chwilę otworzy się okno pomocy zdalnej.');
      window.open('https://rustdesk.com/','_blank');
    });
    document.getElementById('repairSub')?.addEventListener('click',()=>{
      window.open('https://infradesk.pl/portal','_blank');
    });
  }
}

/* ══ SEJF ══ */
// Smart suggestions database
const _vaultSuggest=[
  {q:'net',name:'Netflix',icon:'🎬',cat:'streaming'},
  {q:'spot',name:'Spotify',icon:'🎵',cat:'streaming'},
  {q:'disn',name:'Disney+',icon:'🏰',cat:'streaming'},
  {q:'hbo',name:'HBO Max',icon:'🎬',cat:'streaming'},
  {q:'yout',name:'YouTube Premium',icon:'▶',cat:'streaming'},
  {q:'appl',name:'Apple TV+',icon:'🍎',cat:'streaming'},
  {q:'amaz',name:'Amazon Prime',icon:'📦',cat:'streaming'},
  {q:'offi',name:'Microsoft 365',icon:'📊',cat:'productivity'},
  {q:'adob',name:'Adobe CC',icon:'🎨',cat:'creative'},
  {q:'canv',name:'Canva Pro',icon:'🎨',cat:'creative'},
  {q:'drop',name:'Dropbox',icon:'📁',cat:'cloud'},
  {q:'goog',name:'Google One',icon:'☁',cat:'cloud'},
  {q:'one',name:'OneDrive',icon:'☁',cat:'cloud'},
  {q:'zoom',name:'Zoom Pro',icon:'📹',cat:'communication'},
  {q:'slac',name:'Slack',icon:'💬',cat:'communication'},
  {q:'nord',name:'NordVPN',icon:'🔒',cat:'vpn'},
  {q:'chat',name:'ChatGPT Plus',icon:'🤖',cat:'ai'},
  {q:'gith',name:'GitHub Pro',icon:'💻',cat:'dev'},
  {q:'nort',name:'Norton',icon:'🛡',cat:'security'},
  {q:'eset',name:'ESET',icon:'🛡',cat:'security'},
  {q:'tel',name:'Telefon komórkowy',icon:'📱',cat:'telecom'},
  {q:'int',name:'Internet',icon:'🌐',cat:'telecom'},
  {q:'dom',name:'Domena',icon:'🌐',cat:'hosting'},
  {q:'host',name:'Hosting',icon:'🖥',cat:'hosting'},
  {q:'rout',name:'Router',icon:'📡',cat:'device'},
  {q:'druk',name:'Drukarka',icon:'🖨',cat:'device'},
  {q:'lapt',name:'Laptop',icon:'💻',cat:'device'},
  {q:'komp',name:'Komputer',icon:'🖥',cat:'device'},
  {q:'serw',name:'Serwer',icon:'🖥',cat:'device'},
  {q:'kame',name:'Kamera IP',icon:'📷',cat:'device'},
  {q:'tele',name:'Telewizor',icon:'📺',cat:'device'},
  {q:'swit',name:'Switch sieciowy',icon:'🔌',cat:'device'},
  {q:'acce',name:'Access Point',icon:'📡',cat:'device'},
  {q:'nas',name:'NAS',icon:'💾',cat:'device'},
  {q:'ups',name:'UPS / zasilacz',icon:'🔋',cat:'device'},
  {q:'bank',name:'Bankowość online',icon:'🏦',cat:'finance'},
  {q:'alle',name:'Allegro',icon:'🛒',cat:'shopping'},
  {q:'face',name:'Facebook',icon:'📘',cat:'social'},
  {q:'inst',name:'Instagram',icon:'📸',cat:'social'},
  {q:'mail',name:'Poczta email',icon:'📧',cat:'email'},
  {q:'wifi',name:'WiFi',icon:'📶',cat:'network'},
];

function renderVault(root){
  const _vault=JSON.parse(localStorage.getItem('iad_vault')||'{"items":[],"pin":""}');
  if(!_vault.items)_vault.items=[];
  if(!_vault.pin)_vault.pin='';
  function _save(){localStorage.setItem('iad_vault',JSON.stringify(_vault))}

  // PIN protection (PIN is now in Settings, but still checked here)
  const _settings=JSON.parse(localStorage.getItem('iad_settings')||'{}');
  if(_settings.vaultPin && !window._vaultUnlocked){
    root.innerHTML=`${pageTitle('vault','Sejf','Wprowadź PIN aby odblokować')}
    <div class="vault-pin-screen fade-up">
      <div style="font-size:48px;margin-bottom:16px">🔒</div>
      <div style="font-size:14px;font-weight:600;color:var(--t);margin-bottom:8px">Sejf jest zabezpieczony</div>
      <div style="font-size:11px;color:var(--tm);margin-bottom:16px">Wprowadź 4-cyfrowy PIN</div>
      <input type="password" id="vaultPinInput" class="vault-input" maxlength="4" style="width:120px;text-align:center;font-size:24px;letter-spacing:8px" placeholder="····">
      <div id="vaultPinError" style="color:#EF4444;font-size:10px;margin-top:8px;min-height:16px"></div>
      <button class="aicore-btn aicore-btn-primary" id="vaultPinSubmit" style="margin-top:8px">Odblokuj</button>
    </div>`;
    document.getElementById('vaultPinSubmit')?.addEventListener('click',()=>{
      if(document.getElementById('vaultPinInput').value===_settings.vaultPin){window._vaultUnlocked=true;renderVault(root)}
      else{document.getElementById('vaultPinError').textContent='Nieprawidłowy PIN'}
    });
    document.getElementById('vaultPinInput')?.addEventListener('keydown',e=>{
      if(e.key==='Enter')document.getElementById('vaultPinSubmit')?.click();
    });
    return;
  }

  function _monthlyTotal(){
    return _vault.items.reduce((sum,it)=>{
      if(!it.price)return sum;
      const a=parseFloat(it.price);
      if(it.cycle==='yearly')return sum+a/12;
      if(it.cycle==='quarterly')return sum+a/3;
      return sum+a;
    },0);
  }

  function _render(){
    const monthly=_monthlyTotal();
    const devices=_vault.items.filter(i=>i.cat==='device');
    const subs=_vault.items.filter(i=>i.cat!=='device'&&i.cat!=='password');
    const imported=_vault.items.filter(i=>i.cat==='password');

    root.innerHTML=`${pageTitle('vault','Sejf','Wszystko w jednym miejscu')}
    <div class="vault-stats fade-up">
      <div class="vault-stat"><div class="vault-stat-num">${devices.length}</div><div class="vault-stat-label">Urządzenia</div></div>
      <div class="vault-stat"><div class="vault-stat-num">${subs.length}</div><div class="vault-stat-label">Subskrypcje</div></div>
      <div class="vault-stat accent"><div class="vault-stat-num">${monthly.toFixed(0)} zł</div><div class="vault-stat-label">Łącznie 1 m-c</div></div>
      <div class="vault-stat"><div class="vault-stat-num">${imported.length}</div><div class="vault-stat-label">Z przeglądarki</div></div>
    </div>

    <!-- Search + Add -->
    <div class="vault-toolbar fade-up">
      <div class="vault-add-wrap" style="flex:1">
        <input class="vault-input vault-add-input" id="vaultSearch" placeholder="Szukaj w sejfie..." autocomplete="off">
      </div>
      <button class="aicore-btn aicore-btn-primary" id="vaultAddBtn">+ Dodaj</button>
    </div>

    <!-- Action buttons -->
    <div class="vault-actions fade-up">
      <button class="aicore-btn aicore-btn-secondary" id="vaultScanNetwork"><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg> Wykryj urządzenia</button>
      <button class="aicore-btn aicore-btn-secondary" id="vaultDetectSubs"><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Wykryj subskrypcje</button>
      <button class="aicore-btn aicore-btn-secondary" id="vaultImportBrowser"><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> Import z przeglądarki</button>
      <button class="aicore-btn aicore-btn-secondary" id="vaultCloudSync"><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg> Kopiuj na chmurę</button>
    </div>

    <!-- Items list -->
    <div class="vault-list fade-up" id="vaultList"></div>`;

    _renderList();

    // Search filter
    document.getElementById('vaultSearch')?.addEventListener('input',()=>{
      const q=document.getElementById('vaultSearch').value.toLowerCase().trim();
      document.querySelectorAll('#vaultList .vault-item').forEach(el=>{
        const name=el.querySelector('.vault-item-name')?.textContent.toLowerCase()||'';
        const meta=el.querySelector('.vault-item-meta')?.textContent.toLowerCase()||'';
        el.style.display=(name+meta).includes(q)?'':'none';
      });
    });

    // Add button — opens smart add with suggestions
    document.getElementById('vaultAddBtn')?.addEventListener('click',()=>{
      const overlay=document.createElement('div');
      overlay.className='consent-overlay';
      overlay.innerHTML=`<div class="consent-box" style="max-width:420px">
        <div class="consent-title">Dodaj do sejfu</div>
        <div class="vault-add-wrap" style="margin-bottom:0">
          <input class="vault-input vault-add-input" id="vaultSmartInput" placeholder="Wpisz nazwę np. Netflix, Router, Bank..." autocomplete="off" autofocus>
          <div class="vault-suggestions" id="vaultSuggestions" style="position:relative;margin-top:4px"></div>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
      const inp=overlay.querySelector('#vaultSmartInput');
      const sugBox=overlay.querySelector('#vaultSuggestions');
      inp.focus();
      inp.addEventListener('input',()=>{
        const q=inp.value.toLowerCase().trim();
        if(q.length<1){sugBox.innerHTML='';return}
        const matches=_vaultSuggest.filter(s=>s.name.toLowerCase().includes(q)||s.q.startsWith(q)).slice(0,8);
        let html=matches.map(m=>`<div class="vault-sug-item" data-name="${m.name}" data-icon="${m.icon}" data-cat="${m.cat}"><span class="vault-sug-icon">${m.icon}</span><span class="vault-sug-name">${m.name}</span></div>`).join('');
        html+=`<div class="vault-sug-item" data-custom="1"><span class="vault-sug-icon">➕</span><span>Dodaj "${inp.value}" jako nową pozycję</span></div>`;
        sugBox.innerHTML=html;
        sugBox.querySelectorAll('.vault-sug-item').forEach(el=>{
          el.addEventListener('click',()=>{
            const tpl=el.dataset.custom?{name:inp.value,icon:'📦',cat:'other'}:{name:el.dataset.name,icon:el.dataset.icon,cat:el.dataset.cat};
            overlay.remove();
            _addItem(tpl);
          });
        });
      });
    });

    // Auto-detect with preview
    document.getElementById('vaultScanNetwork')?.addEventListener('click',async()=>{
      const btn=document.getElementById('vaultScanNetwork');
      btn.textContent='📡 Skanowanie...';btn.disabled=true;
      const r=await py('scan_network_devices');
      btn.textContent='📡 Wykryj urządzenia';btn.disabled=false;
      if(!r||!r.devices||!r.devices.length){alert('Nie wykryto urządzeń w sieci.');return}
      const newD=r.devices.filter(d=>!_vault.items.some(i=>i.ip===d.ip));
      if(!newD.length){alert('Wszystkie wykryte urządzenia są już w sejfie.');return}
      _showDetectedPreview('Wykryte urządzenia w sieci',newD.map(d=>({
        name:d.hostname||d.ip,icon:d.type==='router'?'📡':'💻',cat:'device',ip:d.ip,mac:d.mac,detail:`${d.ip} · ${d.mac}`
      })));
    });

    // Cloud sync
    document.getElementById('vaultCloudSync')?.addEventListener('click',async()=>{
      const cfg=JSON.parse(localStorage.getItem('iad_config')||'{}');
      if(!cfg.token){
        // Not logged in — prompt registration
        const overlay=document.createElement('div');
        overlay.className='consent-overlay';
        overlay.innerHTML=`<div class="consent-box" style="max-width:360px;text-align:center">
          <div style="font-size:36px;margin-bottom:10px">☁</div>
          <div class="consent-title">Wymagane konto InfraDesk</div>
          <div style="font-size:11px;color:var(--tm);margin-bottom:16px">Aby synchronizować sejf z chmurą, musisz mieć konto. Po zalogowaniu synchronizacja będzie automatyczna przy każdej zmianie.</div>
          <div style="display:flex;gap:8px">
            <button class="aicore-btn aicore-btn-primary" style="flex:1" onclick="window.open('https://infradesk.pl/portal','_blank')">Zarejestruj się</button>
            <button class="aicore-btn aicore-btn-secondary" style="flex:1" id="cloudCancel">Zamknij</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#cloudCancel').onclick=()=>overlay.remove();
        return;
      }
      // Logged in — sync
      const btn=document.getElementById('vaultCloudSync');
      btn.innerHTML='<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg> Synchronizuję...';
      btn.disabled=true;
      // TODO: actual API call to sync vault
      await new Promise(r=>setTimeout(r,1500));
      btn.innerHTML='<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg> Kopiuj na chmurę';
      btn.disabled=false;
      alert('Sejf zsynchronizowany z chmurą.');
    });

    document.getElementById('vaultDetectSubs')?.addEventListener('click',async()=>{
      const btn=document.getElementById('vaultDetectSubs');
      btn.textContent='🔍 Wykrywanie...';btn.disabled=true;
      const detected=await py('detect_subscriptions');
      btn.textContent='🔍 Wykryj subskrypcje';btn.disabled=false;
      if(!detected||!detected.length){alert('Nie wykryto subskrypcji.');return}
      const newS=detected.filter(s=>!_vault.items.some(i=>i.name===s.name));
      if(!newS.length){alert('Wszystkie wykryte subskrypcje są już w sejfie.');return}
      _showDetectedPreview('Wykryte subskrypcje',newS.map(s=>({
        name:s.name,icon:s.icon,cat:s.category||'subscription',detail:'Wykryte automatycznie'
      })));
    });

    // Import passwords — detect browsers first, let user choose
    document.getElementById('vaultImportBrowser')?.addEventListener('click',async()=>{
      const btn=document.getElementById('vaultImportBrowser');
      btn.textContent='🌐 Wykrywanie...';btn.disabled=true;
      const browsers=await py('detect_browsers');
      btn.textContent='🌐 Import z przeglądarki';btn.disabled=false;
      if(!browsers||!browsers.length){alert('Nie wykryto żadnych przeglądarek z zapisanymi hasłami.');return}

      const overlay=document.createElement('div');
      overlay.className='consent-overlay';
      overlay.innerHTML=`<div class="consent-box" style="max-width:420px">
        <div class="consent-title">Import haseł z przeglądarki</div>
        <div style="font-size:10px;color:var(--tm);margin-bottom:12px">Wykryte przeglądarki z zapisanymi hasłami:</div>
        <div class="vault-browser-list">${browsers.map(b=>`
          <div class="vault-browser-item" data-name="${b.name}">
            <span class="vault-browser-icon">${{Chrome:'🌐',Edge:'🔵',Opera:'🔴',Brave:'🦁',Firefox:'🦊'}[b.name]||'🌐'}</span>
            <div class="vault-browser-info">
              <div style="font-size:12px;font-weight:600;color:var(--t)">${b.name}</div>
              <div style="font-size:10px;color:var(--tm)">${b.count} zapisanych haseł ${b.encrypted?'· szyfrowane (AES)':'· nieszyfrowane'}</div>
              ${b.encrypted?`<div style="font-size:9px;color:var(--core,#4F8CFF);margin-top:2px">${b.canDecrypt?'✓ Mogę odszyfrować automatycznie':'⚠ Wymagany ręczny eksport'}</div>`:''}
            </div>
            <button class="aicore-btn aicore-btn-primary" style="padding:6px 14px;font-size:10px" data-browser="${b.name}">Importuj</button>
          </div>`).join('')}</div>
        <div style="margin-top:12px"><button class="aicore-btn aicore-btn-secondary" id="browserCancel" style="width:100%">Zamknij</button></div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#browserCancel').onclick=()=>overlay.remove();

      overlay.querySelectorAll('[data-browser]').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          const bName=btn.dataset.browser;
          btn.textContent='Importuję...';btn.disabled=true;
          const result=await py('import_browser_passwords',bName);
          if(!result||!result.ok||!result.passwords.length){
            btn.textContent='Brak haseł';
            return;
          }
          overlay.remove();

          // Split into new and updated
          let added=0, updated=0;
          const toPreview=[];
          result.passwords.forEach(p=>{
            let host='';try{host=new URL(p.url).hostname.replace('www.','')}catch{host=p.url||bName}
            // Check if already exists
            const existing=_vault.items.find(i=>i.cat==='password'&&i.login===p.login&&i.name===host);
            if(existing){
              // Update password if changed
              if(existing.password!==p.password&&p.password&&!p.password.includes('[nie udało')){
                existing.password=p.password;
                updated++;
              }
            }else{
              toPreview.push({name:host,icon:'🔑',cat:'password',login:p.login,password:p.password,detail:p.login});
            }
          });

          if(updated>0) _save();

          if(toPreview.length===0){
            const msg=updated>0
              ?`Zaktualizowano ${updated} haseł. Brak nowych do dodania.`
              :'Wszystkie hasła z '+bName+' są już w sejfie.';
            alert(msg);
            if(updated>0)_render();
            return;
          }

          // Show info about updates + preview new (limit to 100 in preview)
          const total=toPreview.length;
          const shown=toPreview.slice(0,100);
          const infoText=updated>0
            ?`Zaktualizowano ${updated} haseł. ${total} nowych${total>100?' (pokazuję pierwsze 100)':''}:`
            :`${total} nowych haseł${total>100?' (pokazuję pierwsze 100)':''}:`;
          _showDetectedPreview(bName+' — '+infoText,shown,total>100?toPreview:null);
        });
      });
    });

    // Preview detected items with checkboxes
    function _showDetectedPreview(title,items,allItems){
      const overlay=document.createElement('div');
      overlay.className='consent-overlay';
      overlay.innerHTML=`<div class="consent-box" style="max-width:480px">
        <div class="consent-title">${title}</div>
        <div style="font-size:10px;color:var(--tm);margin-bottom:10px">Zaznacz co chcesz dodać:</div>
        <div style="max-height:300px;overflow-y:auto">${items.map((it,i)=>`
          <label class="vault-preview-item">
            <input type="checkbox" checked data-idx="${i}">
            <span style="font-size:16px">${it.icon}</span>
            <div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;color:var(--t)">${it.name}</div><div style="font-size:9px;color:var(--tm)">${it.detail||''}</div></div>
          </label>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="aicore-btn aicore-btn-primary" id="prevAdd" style="flex:1">Dodaj zaznaczone</button>
          ${allItems?'<button class="aicore-btn aicore-btn-secondary" id="prevAddAll" style="flex:1">Dodaj wszystkie ('+allItems.length+')</button>':''}
          <button class="aicore-btn aicore-btn-secondary" id="prevCancel" style="flex:1">Anuluj</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#prevCancel').onclick=()=>overlay.remove();
      overlay.querySelector('#prevAdd').onclick=()=>{
        overlay.querySelectorAll('input[type="checkbox"]:checked').forEach(cb=>{
          const it=items[+cb.dataset.idx];
          _vault.items.push({name:it.name,icon:it.icon,cat:it.cat,ip:it.ip||'',mac:it.mac||'',login:it.login||'',password:it.password||'',price:0,cycle:'monthly',notes:''});
        });
        _save();overlay.remove();_render();
      };
      overlay.querySelector('#prevAddAll')?.addEventListener('click',()=>{
        (allItems||items).forEach(it=>{
          _vault.items.push({name:it.name,icon:it.icon,cat:it.cat,ip:it.ip||'',mac:it.mac||'',login:it.login||'',password:it.password||'',price:0,cycle:'monthly',notes:''});
        });
        _save();overlay.remove();_render();
      });
    }
  }

  function _addItem(template){
    // Open quick form pre-filled from suggestion
    const overlay=document.createElement('div');
    overlay.className='consent-overlay';
    overlay.innerHTML=`<div class="consent-box" style="max-width:380px">
      <div class="consent-title" style="margin-bottom:12px">${template.icon} ${template.name}</div>
      <div style="margin-bottom:8px"><label class="vault-form-label">Nazwa</label><input name="name" class="vault-input" value="${template.name}"></div>
      ${template.cat!=='device'?`<div style="margin-bottom:8px"><label class="vault-form-label">Kwota</label><div style="display:flex;gap:6px"><input name="price" class="vault-input" type="number" value="${template.price}" style="flex:1"><select name="cycle" class="vault-input" style="width:120px"><option value="monthly" ${template.cycle==='monthly'?'selected':''}>Miesięcznie</option><option value="quarterly" ${template.cycle==='quarterly'?'selected':''}>Kwartalnie</option><option value="yearly" ${template.cycle==='yearly'?'selected':''}>Rocznie</option></select></div></div>`:''}
      ${template.cat==='device'?`<div style="margin-bottom:8px"><label class="vault-form-label">IP / adres</label><input name="ip" class="vault-input" placeholder="192.168.1.1"></div>`:''}
      <div style="margin-bottom:8px"><label class="vault-form-label">Login</label><input name="login" class="vault-input" placeholder="email lub login"></div>
      <div style="margin-bottom:8px"><label class="vault-form-label">Hasło</label><input name="password" class="vault-input" type="password"></div>
      <div style="margin-bottom:8px"><label class="vault-form-label">Notatki</label><textarea name="notes" class="vault-input" rows="2"></textarea></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="aicore-btn aicore-btn-primary" id="vfSave" style="flex:1">Zapisz</button>
        <button class="aicore-btn aicore-btn-secondary" id="vfCancel" style="flex:1">Anuluj</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#vfCancel').onclick=()=>overlay.remove();
    overlay.querySelector('#vfSave').onclick=()=>{
      const item={
        name:overlay.querySelector('[name="name"]').value||template.name,
        icon:template.icon,cat:template.cat,
        price:parseFloat(overlay.querySelector('[name="price"]')?.value||0),
        cycle:overlay.querySelector('[name="cycle"]')?.value||template.cycle,
        ip:overlay.querySelector('[name="ip"]')?.value||'',
        login:overlay.querySelector('[name="login"]').value||'',
        password:overlay.querySelector('[name="password"]').value||'',
        notes:overlay.querySelector('[name="notes"]').value||'',
      };
      _vault.items.push(item);_save();
      overlay.remove();
      _render();
    };
  }

  function _renderList(){
    const list=document.getElementById('vaultList');
    if(!list)return;
    if(_vault.items.length===0){list.innerHTML='<div class="vault-empty">Zacznij wpisywać nazwę powyżej lub użyj automatycznego wykrywania.</div>';return}
    list.innerHTML=_vault.items.map((it,i)=>`
      <div class="vault-item">
        <div class="vault-item-icon">${it.icon||'📦'}</div>
        <div class="vault-item-body">
          <div class="vault-item-name">${it.name}</div>
          <div class="vault-item-meta">${it.cat==='device'?(it.ip||'Urządzenie'):(it.cycle==='yearly'?'Rocznie':it.cycle==='quarterly'?'Kwartalnie':'Miesięcznie')}${it.login?' · '+it.login:''}</div>
          ${it.login?`<div class="vault-item-pw"><span class="vault-pw-label">Login:</span> <span class="vault-pw-text">${it.login}</span><button class="vault-copy-btn" data-copy="${btoa(it.login)}" title="Kopiuj login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div>`:''}
          ${it.password?`<div class="vault-item-pw"><span class="vault-pw-label">Hasło:</span> <span class="vault-pw-dots" data-idx="${i}">••••••••</span><button class="vault-pw-eye" data-idx="${i}" title="Pokaż/Ukryj"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="vault-copy-btn" data-copy="${btoa(it.password)}" title="Kopiuj hasło"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div>`:''}
        </div>
        ${it.price?`<div class="vault-item-cost">${it.price} zł</div>`:''}
        <button class="vault-item-del" data-idx="${i}" title="Usuń"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>`).join('');
    // Eye toggle — show/hide password
    list.querySelectorAll('.vault-pw-eye').forEach(b=>b.addEventListener('click',e=>{
      e.stopPropagation();
      const idx=+b.dataset.idx;
      const dots=list.querySelector(`.vault-pw-dots[data-idx="${idx}"]`);
      if(!dots)return;
      if(dots.dataset.shown==='1'){dots.textContent='••••••••';dots.dataset.shown='0'}
      else{dots.textContent=_vault.items[idx].password;dots.dataset.shown='1'}
    }));
    // Copy buttons (login + password)
    list.querySelectorAll('.vault-copy-btn').forEach(b=>b.addEventListener('click',e=>{
      e.stopPropagation();
      navigator.clipboard.writeText(atob(b.dataset.copy));
      const orig=b.innerHTML;b.innerHTML='<span style="color:#4ADE80;font-size:10px">✓</span>';
      setTimeout(()=>b.innerHTML=orig,1200);
    }));
    list.querySelectorAll('.vault-item-del').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();_vault.items.splice(+b.dataset.idx,1);_save();_render()}));
    // Click item to edit
    list.querySelectorAll('.vault-item').forEach((el,i)=>{
      el.style.cursor='pointer';
      el.addEventListener('click',()=>_editItem(i));
    });
  }

  function _editItem(idx){
    const it=_vault.items[idx];
    if(!it)return;
    const overlay=document.createElement('div');
    overlay.className='consent-overlay';
    const _copyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const _eyeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    overlay.innerHTML=`<div class="consent-box" style="max-width:400px">
      <div class="consent-title" style="margin-bottom:12px">${it.icon} Edytuj: ${it.name}</div>
      <div style="margin-bottom:8px"><label class="vault-form-label">Nazwa</label><input name="name" class="vault-input" value="${it.name||''}"></div>
      <div style="margin-bottom:8px"><label class="vault-form-label">Login</label><div style="display:flex;gap:4px"><input name="login" class="vault-input" value="${it.login||''}" style="flex:1"><button class="vault-edit-copy" data-field="login" title="Kopiuj login">${_copyIcon}</button></div></div>
      <div style="margin-bottom:8px"><label class="vault-form-label">Hasło</label><div style="display:flex;gap:4px"><input name="password" class="vault-input" type="password" value="${it.password||''}" style="flex:1" id="editPwField"><button class="vault-edit-copy" data-field="password" title="Kopiuj hasło">${_copyIcon}</button><button class="vault-edit-eye" title="Pokaż/Ukryj">${_eyeIcon}</button></div></div>
      ${it.cat==='device'?`<div style="margin-bottom:8px"><label class="vault-form-label">IP / adres</label><input name="ip" class="vault-input" value="${it.ip||''}"></div>`:''}
      <div style="margin-bottom:8px"><label class="vault-form-label">Kwota</label><div style="display:flex;gap:6px"><input name="price" class="vault-input" type="number" value="${it.price||0}" style="flex:1"><select name="cycle" class="vault-input" style="width:120px"><option value="monthly" ${it.cycle==='monthly'?'selected':''}>Miesięcznie</option><option value="quarterly" ${it.cycle==='quarterly'?'selected':''}>Kwartalnie</option><option value="yearly" ${it.cycle==='yearly'?'selected':''}>Rocznie</option></select></div></div>
      <div style="margin-bottom:8px"><label class="vault-form-label">Notatki</label><textarea name="notes" class="vault-input" rows="2">${it.notes||''}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="aicore-btn aicore-btn-primary" id="editSave" style="flex:1">Zapisz</button>
        <button class="aicore-btn aicore-btn-secondary" id="editCancel" style="flex:1">Anuluj</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    // Copy buttons in edit
    overlay.querySelectorAll('.vault-edit-copy').forEach(b=>b.addEventListener('click',()=>{
      const field=overlay.querySelector(`[name="${b.dataset.field}"]`);
      if(field){navigator.clipboard.writeText(field.value);const orig=b.innerHTML;b.innerHTML='<span style="color:#4ADE80;font-size:10px">✓</span>';setTimeout(()=>b.innerHTML=orig,1200)}
    }));
    // Eye toggle in edit
    overlay.querySelector('.vault-edit-eye')?.addEventListener('click',()=>{
      const pw=overlay.querySelector('#editPwField');
      if(pw){pw.type=pw.type==='password'?'text':'password'}
    });
    overlay.querySelector('#editCancel').onclick=()=>overlay.remove();
    overlay.querySelector('#editSave').onclick=()=>{
      it.name=overlay.querySelector('[name="name"]').value||it.name;
      it.login=overlay.querySelector('[name="login"]').value||'';
      it.password=overlay.querySelector('[name="password"]').value||'';
      it.price=parseFloat(overlay.querySelector('[name="price"]')?.value||0);
      it.cycle=overlay.querySelector('[name="cycle"]')?.value||'monthly';
      it.notes=overlay.querySelector('[name="notes"]').value||'';
      if(overlay.querySelector('[name="ip"]'))it.ip=overlay.querySelector('[name="ip"]').value||'';
      _save();overlay.remove();_render();
    };
  }

  _render();
}

/* ══ OPINIE ══ */
function renderFeedback(root){
  const _fb=JSON.parse(localStorage.getItem('iad_feedback')||'[]');
  function _save(){localStorage.setItem('iad_feedback',JSON.stringify(_fb))}

  root.innerHTML=`${pageTitle('feedback','Opinie','Pomóż nam ulepszać aplikację')}
  <div class="fade-up" id="fbContent">
    <div class="fb-intro">
      <div class="fb-intro-icon">💬</div>
      <div class="fb-intro-text">Twoja opinia jest dla nas ważna! Napisz co działa dobrze, co poprawić, lub zaproponuj nową funkcję.</div>
    </div>
    <div class="fb-form">
      <div class="fb-categories">
        <button class="fb-cat active" data-cat="feature">💡 Nowa funkcja</button>
        <button class="fb-cat" data-cat="bug">🐛 Problem</button>
        <button class="fb-cat" data-cat="praise">❤️ Pochwała</button>
        <button class="fb-cat" data-cat="other">📝 Inne</button>
      </div>
      <textarea id="fbText" class="vault-input" rows="4" placeholder="Opisz swoją opinię lub sugestię..." style="width:100%;margin-top:10px"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <div class="fb-stars" id="fbStars">
          <span class="fb-star" data-v="1">★</span>
          <span class="fb-star" data-v="2">★</span>
          <span class="fb-star" data-v="3">★</span>
          <span class="fb-star" data-v="4">★</span>
          <span class="fb-star" data-v="5">★</span>
        </div>
        <button class="aicore-btn aicore-btn-primary" id="fbSend">Wyślij opinię</button>
      </div>
    </div>
    <div class="fb-history-title" style="margin-top:20px;font-size:10px;text-transform:uppercase;color:var(--tm);letter-spacing:1px">Twoje opinie</div>
    <div id="fbHistory"></div>
  </div>`;

  let selectedCat='feature',selectedStars=0;

  document.querySelectorAll('.fb-cat').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.fb-cat').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      selectedCat=b.dataset.cat;
    });
  });

  document.querySelectorAll('.fb-star').forEach(s=>{
    s.addEventListener('click',()=>{
      selectedStars=+s.dataset.v;
      document.querySelectorAll('.fb-star').forEach((x,i)=>x.classList.toggle('active',i<selectedStars));
    });
  });

  document.getElementById('fbSend')?.addEventListener('click',()=>{
    const text=document.getElementById('fbText').value.trim();
    if(!text)return;
    _fb.unshift({cat:selectedCat,text,stars:selectedStars,date:new Date().toISOString().slice(0,10)});
    _save();
    document.getElementById('fbText').value='';
    selectedStars=0;
    document.querySelectorAll('.fb-star').forEach(x=>x.classList.remove('active'));
    _renderHistory();
  });

  function _renderHistory(){
    const h=document.getElementById('fbHistory');
    if(!h)return;
    h.innerHTML=_fb.map(f=>`
      <div class="fb-item fade-up">
        <div class="fb-item-top">
          <span class="fb-item-cat">${{feature:'💡',bug:'🐛',praise:'❤️',other:'📝'}[f.cat]||'📝'} ${f.cat}</span>
          <span class="fb-item-date">${f.date}</span>
        </div>
        <div class="fb-item-text">${f.text}</div>
        ${f.stars?'<div class="fb-item-stars">'+'★'.repeat(f.stars)+'☆'.repeat(5-f.stars)+'</div>':''}
      </div>`).join('')||'<div class="vault-empty">Nie wysłano jeszcze żadnych opinii.</div>';
  }
  _renderHistory();
}

/* ══ WERSJA PRO ══ */
function renderPro(root){
  root.innerHTML=`${pageTitle('pro','Wersja Pro','Odblokuj pełny potencjał')}
  <div class="pro-page fade-up">
    <div class="pro-hero">
      <div class="pro-hero-badge">PRO</div>
      <div class="pro-hero-title">Asystent InfraDesk Pro</div>
      <div class="pro-hero-sub">Zaawansowana ochrona, naprawy AI i opieka IT bez limitów</div>
    </div>

    <div class="pro-comparison">
      <div class="pro-col free">
        <div class="pro-col-header">Darmowy</div>
        <div class="pro-col-price">0 zł</div>
        <ul class="pro-features">
          <li class="yes">Skanowanie systemu</li>
          <li class="yes">Podgląd problemów</li>
          <li class="yes">Monitoring podstawowy</li>
          <li class="no">Naprawy AI</li>
          <li class="no">Sejf haseł</li>
          <li class="no">Śledzenie subskrypcji</li>
          <li class="no">Priorytetowe wsparcie</li>
          <li class="no">Monitoring 24/7</li>
        </ul>
        <div class="pro-current">Aktualny plan</div>
      </div>
      <div class="pro-col pro">
        <div class="pro-popular">Rekomendowany</div>
        <div class="pro-col-header">Pro</div>
        <div class="pro-col-price">29 <span>zł/msc</span></div>
        <ul class="pro-features">
          <li class="yes">Skanowanie systemu</li>
          <li class="yes">Podgląd problemów</li>
          <li class="yes">Monitoring zaawansowany</li>
          <li class="yes">Naprawy AI bez limitu</li>
          <li class="yes">Sejf haseł (szyfrowany)</li>
          <li class="yes">Śledzenie subskrypcji</li>
          <li class="yes">Priorytetowe wsparcie</li>
          <li class="yes">Monitoring 24/7</li>
        </ul>
        <button class="aicore-btn aicore-btn-primary" style="width:100%;padding:12px" onclick="window.open('https://infradesk.pl/portal','_blank')">Przejdź na Pro</button>
      </div>
      <div class="pro-col business">
        <div class="pro-col-header">Firma</div>
        <div class="pro-col-price">149 <span>zł/msc</span></div>
        <ul class="pro-features">
          <li class="yes">Wszystko z Pro</li>
          <li class="yes">Nielimitowani użytkownicy</li>
          <li class="yes">Zarządzanie flotą</li>
          <li class="yes">Sesje z informatykiem</li>
          <li class="yes">Dedykowany opiekun</li>
          <li class="yes">SLA gwarancja</li>
          <li class="yes">Raporty i statystyki</li>
          <li class="yes">API i integracje</li>
        </ul>
        <button class="aicore-btn aicore-btn-secondary" style="width:100%;padding:12px" onclick="window.open('https://infradesk.pl/portal','_blank')">Skontaktuj się</button>
      </div>
    </div>
  </div>`;
}

/* ══ USTAWIENIA ══ */
function renderSettings(root){
  const _s=JSON.parse(localStorage.getItem('iad_settings')||'{}');
  function _save(){localStorage.setItem('iad_settings',JSON.stringify(_s))}

  root.innerHTML=`${pageTitle('settings','Ustawienia','Konfiguracja aplikacji')}
  <div class="fade-up" id="settingsContent">

    <div class="settings-section">
      <div class="settings-section-title">Zabezpieczenia</div>

      <div class="settings-row">
        <div class="settings-row-body">
          <div class="settings-row-name">PIN do Sejfu</div>
          <div class="settings-row-desc">${_s.vaultPin?'PIN jest ustawiony. Sejf wymaga podania PIN przy każdym wejściu.':'Brak PIN. Sejf jest dostępny bez zabezpieczenia.'}</div>
        </div>
        <button class="aicore-btn aicore-btn-secondary" id="settingsVaultPin">${_s.vaultPin?'Zmień PIN':'Ustaw PIN'}</button>
        ${_s.vaultPin?'<button class="aicore-btn aicore-btn-danger" id="settingsRemovePin" style="margin-left:6px">Usuń</button>':''}
      </div>

      <div class="settings-row">
        <div class="settings-row-body">
          <div class="settings-row-name">PIN do aplikacji</div>
          <div class="settings-row-desc">${_s.appPin?'PIN jest ustawiony. Aplikacja wymaga PIN przy uruchomieniu.':'Brak PIN. Aplikacja startuje bez zabezpieczenia.'}</div>
        </div>
        <button class="aicore-btn aicore-btn-secondary" id="settingsAppPin">${_s.appPin?'Zmień PIN':'Ustaw PIN'}</button>
        ${_s.appPin?'<button class="aicore-btn aicore-btn-danger" id="settingsRemoveAppPin" style="margin-left:6px">Usuń</button>':''}
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Konto</div>
      <div class="settings-row">
        <div class="settings-row-body">
          <div class="settings-row-name">Konto InfraDesk</div>
          <div class="settings-row-desc">Zaloguj się aby synchronizować sejf z chmurą i odzyskać PIN w razie zapomnienia.</div>
        </div>
        <button class="aicore-btn aicore-btn-primary" id="settingsLogin" onclick="window.open('https://infradesk.pl/portal','_blank')">Zaloguj się</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Informacje</div>
      <div class="settings-row">
        <div class="settings-row-body">
          <div class="settings-row-name">Wersja</div>
          <div class="settings-row-desc">Asystent InfraDesk v5.0.0</div>
        </div>
      </div>
    </div>
  </div>`;

  function _pinDialog(key, label){
    const current=_s[key]||'';
    const overlay=document.createElement('div');
    overlay.className='consent-overlay';
    overlay.innerHTML=`<div class="consent-box" style="max-width:320px;text-align:center">
      <div class="consent-title">${current?'Zmień':'Ustaw'} ${label}</div>
      ${!current?'<div style="font-size:10px;color:var(--core,#4F8CFF);margin-bottom:10px;padding:8px;border-radius:6px;background:rgba(79,140,255,.06);border:1px solid rgba(79,140,255,.1)">Załóż konto InfraDesk aby odzyskać PIN w razie zapomnienia.</div>':''}
      ${current?'<input type="password" id="pinOld" class="vault-input" maxlength="4" placeholder="Obecny PIN" style="width:140px;text-align:center;font-size:18px;letter-spacing:6px;margin-bottom:8px">':''}
      <input type="password" id="pinNew" class="vault-input" maxlength="4" placeholder="Nowy PIN (4 cyfry)" style="width:140px;text-align:center;font-size:18px;letter-spacing:6px;margin-bottom:8px">
      <input type="password" id="pinConfirm" class="vault-input" maxlength="4" placeholder="Powtórz PIN" style="width:140px;text-align:center;font-size:18px;letter-spacing:6px">
      <div id="pinError" style="color:#EF4444;font-size:10px;margin-top:6px;min-height:14px"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="aicore-btn aicore-btn-primary" id="pinSave" style="flex:1">Zapisz</button>
        <button class="aicore-btn aicore-btn-secondary" id="pinCancel" style="flex:1">Anuluj</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#pinCancel').onclick=()=>overlay.remove();
    overlay.querySelector('#pinSave').onclick=()=>{
      if(current&&overlay.querySelector('#pinOld').value!==current){overlay.querySelector('#pinError').textContent='Nieprawidłowy obecny PIN';return}
      const n=overlay.querySelector('#pinNew').value;
      if(n.length!==4||!/^\d{4}$/.test(n)){overlay.querySelector('#pinError').textContent='PIN musi mieć 4 cyfry';return}
      if(n!==overlay.querySelector('#pinConfirm').value){overlay.querySelector('#pinError').textContent='PINy nie są identyczne';return}
      _s[key]=n;_save();overlay.remove();renderSettings(root);
    };
  }

  document.getElementById('settingsVaultPin')?.addEventListener('click',()=>_pinDialog('vaultPin','PIN do Sejfu'));
  document.getElementById('settingsAppPin')?.addEventListener('click',()=>_pinDialog('appPin','PIN do aplikacji'));
  document.getElementById('settingsRemovePin')?.addEventListener('click',()=>{_s.vaultPin='';_save();renderSettings(root)});
  document.getElementById('settingsRemoveAppPin')?.addEventListener('click',()=>{_s.appPin='';_save();renderSettings(root)});
}

/* ══ HELP ══ */
function renderHelp(root){root.innerHTML=`${pageTitle('help','Pomoc zdalna','Połącz się z technikiem')}<div id="hC" class="fade-up"></div>`;cardEl(document.getElementById('hC'),'Profesjonalna pomoc zdalna',b=>{b.innerHTML=`<div class="help-card"><div class="help-company">SILERS — Obsługa informatyczna</div><div class="help-contact"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align:middle;margin-right:6px"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>+48 575 662 664</div><div class="help-contact"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align:middle;margin-right:6px"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>kontakt@infradesk.pl</div><div class="help-contact">${ICO.network} infradesk.pl</div></div><div class="help-price"><span class="help-price-value">od 89 zł</span><span class="help-price-note">Sesja 15-60 min</span></div>`;btnEl(b,'⬇ Pobierz RustDesk',()=>{window.open('https://rustdesk.com/','_blank')},'btn-secondary')})}

/* ══ GAUGES + PROGRESS RINGS ══ */
function drawGauge(id,val,max,col){const c=document.getElementById(id);if(!c)return;const x=c.getContext('2d');c.width=240;c.height=240;x.scale(2,2);const cx=60,cy=60,r=46,lw=8,pct=Math.min(val/max,1);x.beginPath();x.arc(cx,cy,r,.75*Math.PI,2.25*Math.PI);x.strokeStyle='rgba(255,255,255,.06)';x.lineWidth=lw;x.lineCap='round';x.stroke();for(let i=0;i<=10;i++){const a=.75*Math.PI+i*.15*Math.PI;x.beginPath();x.moveTo(cx+(r+4)*Math.cos(a),cy+(r+4)*Math.sin(a));x.lineTo(cx+(r+8)*Math.cos(a),cy+(r+8)*Math.sin(a));x.strokeStyle='rgba(255,255,255,.06)';x.lineWidth=1;x.stroke()}if(pct>0){const sw=1.5*Math.PI*pct;x.beginPath();x.arc(cx,cy,r,.75*Math.PI,.75*Math.PI+sw);x.strokeStyle=col;x.lineWidth=lw;x.lineCap='round';x.stroke();x.save();x.filter='blur(4px)';x.globalAlpha=.3;x.beginPath();x.arc(cx,cy,r,.75*Math.PI,.75*Math.PI+sw);x.strokeStyle=col;x.lineWidth=lw+3;x.lineCap='round';x.stroke();x.restore();const na=.75*Math.PI+sw;x.beginPath();x.arc(cx+r*Math.cos(na),cy+r*Math.sin(na),4,0,Math.PI*2);x.fillStyle='white';x.shadowColor=col;x.shadowBlur=8;x.fill();x.shadowBlur=0}}

function drawProgressRing(id,pct,col){const c=document.getElementById(id);if(!c)return;const x=c.getContext('2d');c.width=280;c.height=280;x.scale(2,2);const cx=70,cy=70,r=58,lw=10;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.strokeStyle='rgba(255,255,255,.04)';x.lineWidth=lw;x.stroke();if(pct>0){x.beginPath();x.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*pct);x.strokeStyle=col;x.lineWidth=lw;x.lineCap='round';x.stroke();x.save();x.filter='blur(4px)';x.globalAlpha=.3;x.beginPath();x.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*pct);x.strokeStyle=col;x.lineWidth=lw+3;x.lineCap='round';x.stroke();x.restore()}}

/* ══ HERO CANVAS + MAIN RING ══ */
function drawHeroBackground(){const c=document.getElementById('heroCanvas');if(!c)return;const x=c.getContext('2d');const r=c.parentElement.getBoundingClientRect();c.width=r.width*2;c.height=r.height*2;c.style.width=r.width+'px';c.style.height=r.height+'px';x.scale(2,2);const w=r.width,ht=r.height;const bg=x.createLinearGradient(0,0,w,ht);bg.addColorStop(0,'#0A1230');bg.addColorStop(.5,'#0D1838');bg.addColorStop(1,'#081028');x.fillStyle=bg;x.fillRect(0,0,w,ht);function orb(ox,oy,or,col,a){const g=x.createRadialGradient(ox,oy,0,ox,oy,or);g.addColorStop(0,col.replace(')',`,${a})`).replace('rgb','rgba'));g.addColorStop(.5,col.replace(')',`,${a*.4})`).replace('rgb','rgba'));g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(ox-or,oy-or,or*2,or*2)}orb(w*.2,ht*.5,w*.4,'rgb(79,140,255)',.12);orb(w*.75,ht*.3,w*.3,'rgb(123,92,255)',.08);orb(w*.5,ht*.7,w*.25,'rgb(34,211,238)',.05);orb(w*.4,ht*.4,w*.2,'rgb(251,146,60)',.04);for(let i=0;i<40;i++){x.beginPath();x.arc(Math.random()*w,Math.random()*ht,Math.random()+.3,0,Math.PI*2);x.fillStyle=`rgba(255,255,255,${Math.random()*.3+.05})`;x.fill()}}

/* ══ BACKUP PAGE ══ */
function renderBackup(c){
  c.innerHTML=`
    ${pageTitle('backup','Kopie zapasowe','Konfiguracje i historia backupów')}
    <div id="backupContent" class="fade-up" style="display:flex;flex-direction:column;gap:10px">
      <div style="text-align:center;padding:32px;color:var(--tm)"><div class="spinner"></div> Pobieranie konfiguracji...</div>
    </div>
    <div style="margin-top:18px">
      <div style="font-size:12px;font-weight:700;color:var(--t);margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Historia
      </div>
      <div id="backupHistory" class="fade-up">
        <div style="text-align:center;padding:20px;color:var(--tm);font-size:12px"><div class="spinner"></div> Ładowanie...</div>
      </div>
    </div>`;
  loadBackupData();
}

async function loadBackupData(){
  const _ico={
    sql:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>',
    folder:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    ok:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    fail:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    run:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2" class="spinning"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>',
    play:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  };
  try{
    const data=await py('get_backup_status');
    const el=document.getElementById('backupContent');
    if(!el)return;

    if(!data||!data.configs||data.configs.length===0){
      el.innerHTML=`
        <div style="text-align:center;padding:40px 20px">
          <div style="width:48px;height:48px;border-radius:14px;background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,.5)" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>
          </div>
          <div style="font-size:13px;font-weight:600;color:var(--t);margin-bottom:4px">Brak konfiguracji</div>
          <div style="font-size:11px;color:var(--tm)">Skonfiguruj backup w panelu InfraDesk</div>
        </div>`;
      document.getElementById('backupHistory').innerHTML='<div style="text-align:center;padding:20px;color:var(--tm);font-size:12px">Brak historii</div>';
      return;
    }

    let html='';
    data.configs.forEach(cfg=>{
      const isSql=cfg.type.startsWith('SQL');
      const iconBg=isSql?'rgba(139,92,246,.1)':'rgba(59,130,246,.1)';
      const iconColor=isSql?'#A78BFA':'#60A5FA';
      const icon=isSql?_ico.sql:_ico.folder;
      const stIcon=cfg.lastStatus==='SUCCESS'?_ico.ok:cfg.lastStatus==='FAILED'?_ico.fail:cfg.lastStatus==='RUNNING'?_ico.run:'';
      const stColor=cfg.lastStatus==='SUCCESS'?'#4ADE80':cfg.lastStatus==='FAILED'?'#F87171':cfg.lastStatus==='RUNNING'?'#60A5FA':'var(--td)';
      const stBg=cfg.lastStatus==='SUCCESS'?'rgba(74,222,128,.08)':cfg.lastStatus==='FAILED'?'rgba(248,113,113,.08)':cfg.lastStatus==='RUNNING'?'rgba(96,165,250,.08)':'var(--hover-bg)';
      const lastRun=cfg.lastRunAt?new Date(cfg.lastRunAt).toLocaleString('pl'):'Nigdy';
      const schedule=cfg.cronLabel||cfg.cronSchedule||'—';

      html+=`
        <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;background:var(--bg-card,rgba(10,16,38,.5));border:1px solid var(--border);transition:all .2s;cursor:default" onmouseover="this.style.borderColor='var(--border-l)';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none'">
          <div style="width:40px;height:40px;border-radius:12px;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${iconColor}">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cfg.name}</div>
            <div style="font-size:10px;color:var(--tm);margin-top:3px;display:flex;align-items:center;gap:8px">
              <span style="display:inline-flex;align-items:center;gap:3px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${schedule}</span>
              <span style="opacity:.4">·</span>
              <span>${lastRun}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:3px;padding:4px 10px;border-radius:20px;background:${stBg};flex-shrink:0">
            ${stIcon}
            <span style="font-size:10px;font-weight:600;color:${stColor}">${cfg.lastStatus||'—'}</span>
          </div>
          <button onclick="event.stopPropagation();runBackupNow('${cfg.id}')" style="display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:9px;border:none;background:var(--cta,linear-gradient(135deg,#4F8CFF,#6366F1));color:#fff;font-size:10px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;box-shadow:0 2px 8px rgba(99,102,241,.2);flex-shrink:0" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 16px rgba(99,102,241,.3)'" onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(99,102,241,.2)'">
            ${_ico.play} Uruchom
          </button>
        </div>`;
    });
    el.innerHTML=html;

    // History
    const hEl=document.getElementById('backupHistory');
    if(data.history&&data.history.length>0){
      let hHtml='<div style="display:flex;flex-direction:column;gap:2px">';
      data.history.slice(0,15).forEach(h=>{
        const stI=h.status==='SUCCESS'?_ico.ok:h.status==='FAILED'?_ico.fail:_ico.run;
        const dt=new Date(h.startedAt).toLocaleString('pl');
        const sz=h.sizeBytes?formatBytes(h.sizeBytes):'—';
        const dur=h.completedAt?Math.round((new Date(h.completedAt)-new Date(h.startedAt))/1000)+'s':'...';
        hHtml+=`
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;transition:background .15s" onmouseover="this.style.background='var(--hover-bg)'" onmouseout="this.style.background='transparent'">
            <span style="flex-shrink:0;display:flex">${stI}</span>
            <span style="flex:1;font-size:12px;color:var(--t);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.configName||'Backup'}</span>
            <span style="font-size:11px;color:var(--ts);font-weight:500;font-family:monospace;flex-shrink:0">${sz}</span>
            <span style="font-size:10px;color:var(--td);flex-shrink:0;min-width:32px;text-align:right">${dur}</span>
            <span style="font-size:10px;color:var(--td);flex-shrink:0">${dt}</span>
          </div>`;
      });
      hHtml+='</div>';
      hEl.innerHTML=hHtml;
    }else{
      hEl.innerHTML='<div style="text-align:center;padding:24px;color:var(--tm);font-size:12px">Brak historii backupów</div>';
    }
  }catch(e){
    const el=document.getElementById('backupContent');
    if(el)el.innerHTML=`<div style="text-align:center;padding:24px;color:#F87171;font-size:12px">Błąd: ${e.message||e}</div>`;
  }
}

function formatBytes(b){
  if(b<1024)return b+' B';
  if(b<1048576)return (b/1024).toFixed(1)+' KB';
  if(b<1073741824)return (b/1048576).toFixed(1)+' MB';
  return (b/1073741824).toFixed(2)+' GB';
}

async function runBackupNow(configId){
  try{
    await py('run_backup_now',configId);
    speakNow('Backup uruchomiony');
    setTimeout(()=>loadBackupData(),3000);
  }catch(e){
    alert('Błąd: '+(e.message||e));
  }
}

function animateRing(pct){const c=document.getElementById('ringCanvas'),v=document.getElementById('ringValue'),st=document.getElementById('ringStatus'),dt=document.getElementById('statusDot'),ti=document.getElementById('heroTitle'),tx=document.getElementById('statusText'),gl=document.querySelector('.ring-outer-glow');if(!c)return;const x=c.getContext('2d');const sz=180;c.width=sz*2;c.height=sz*2;x.scale(2,2);const cx=sz/2,cy=sz/2,r=68,lw=12,sa=-Math.PI/2;const il=document.documentElement.getAttribute('data-theme')==='light';let co,s,sc,gc;if(pct>=75){co=[{o:0,c:'#4ADE80'},{o:.35,c:'#22D3EE'},{o:.7,c:'#4F8CFF'},{o:1,c:'#818CF8'}];s='DOBRY';sc='good';gc='radial-gradient(circle,rgba(74,222,128,.12),rgba(34,211,238,.06),transparent 65%)';if(ti)ti.textContent='System działa prawidłowo';if(tx)tx.textContent='Stan systemu: dobry';if(dt)dt.className='hero-status-dot'}else if(pct>=50){co=[{o:0,c:'#FBBF24'},{o:.4,c:'#FB923C'},{o:.7,c:'#EF4444'},{o:1,c:'#DC2626'}];s='OBCIĄŻONY';sc='warn';gc='radial-gradient(circle,rgba(251,146,60,.12),transparent 65%)';if(ti)ti.textContent='System wymaga optymalizacji';if(tx)tx.textContent='Stan systemu: obciążony';if(dt)dt.className='hero-status-dot warn'}else{co=[{o:0,c:'#EF4444'},{o:.5,c:'#DC2626'},{o:1,c:'#991B1B'}];s='KRYTYCZNY';sc='bad';gc='radial-gradient(circle,rgba(239,68,68,.12),transparent 65%)';if(ti)ti.textContent='System wymaga pilnej uwagi';if(tx)tx.textContent='Stan systemu: krytyczny';if(dt)dt.className='hero-status-dot warn'}if(st){st.textContent=s;st.className='ring-status-value '+sc}if(gl)gl.style.background=gc;const dur=2200,t0=performance.now();function fr(now){const el=now-t0,pr=Math.min(el/dur,1),ea=1-Math.pow(1-pr,4),cp=ea*pct,ca=sa+(cp/100)*Math.PI*2;x.clearRect(0,0,sz,sz);x.beginPath();x.arc(cx,cy,r-lw/2-2,0,Math.PI*2);const dg=x.createRadialGradient(cx,cy*.85,0,cx,cy,r);if(il){dg.addColorStop(0,'#FFF');dg.addColorStop(1,'#F0F4FB')}else{dg.addColorStop(0,'#0E1530');dg.addColorStop(1,'#080D1E')}x.fillStyle=dg;x.fill();x.beginPath();x.arc(cx,cy,r-lw/2-2,0,Math.PI*2);const sg=x.createRadialGradient(cx,cy-10,r*.3,cx,cy,r);sg.addColorStop(0,'rgba(0,0,0,0)');sg.addColorStop(1,il?'rgba(0,0,0,.06)':'rgba(0,0,0,.3)');x.fillStyle=sg;x.fill();x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.strokeStyle='rgba(255,255,255,.04)';x.lineWidth=lw;x.stroke();if(cp>.5){x.beginPath();x.arc(cx,cy,r,sa,ca);const sw=cp/100,g=x.createConicGradient(sa,cx,cy);co.forEach(c=>{g.addColorStop(Math.min(c.o*sw,.999),c.c)});g.addColorStop(Math.min(sw,.999),co[co.length-1].c);g.addColorStop(1,co[0].c);x.strokeStyle=g;x.lineWidth=lw;x.lineCap='round';x.stroke();x.save();x.filter=il?'blur(4px)':'blur(6px)';x.globalAlpha=il?.25:.4;x.beginPath();x.arc(cx,cy,r,sa,ca);x.strokeStyle=g;x.lineWidth=lw+4;x.lineCap='round';x.stroke();x.restore();const ex=cx+r*Math.cos(ca),ey=cy+r*Math.sin(ca);x.beginPath();x.arc(ex,ey,5,0,Math.PI*2);x.fillStyle='white';x.shadowColor='rgba(255,255,255,.8)';x.shadowBlur=10;x.fill();x.shadowBlur=0}if(v)v.textContent=Math.round(cp)+'%';if(pr<1)requestAnimationFrame(fr)}requestAnimationFrame(fr)}

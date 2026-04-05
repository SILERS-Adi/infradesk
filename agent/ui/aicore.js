/* ═══════════════════════════════════════════════════════════
   AI CORE v3 — Canvas-powered living core + State engine
   ═══════════════════════════════════════════════════════════ */

let _coreState='idle';
let _coreCanvas=null, _coreCtx=null, _coreAnim=null;
let _coreTime=0;

/* ── State management ── */
function setAvatarState(state){
  const map={idle:'idle',thinking:'scanning',talking:'scanning',fixing:'fixing'};
  setCoreState(map[state]||state);
}

function setCoreState(state){
  const el=document.getElementById('aicoreOrb');
  if(el) el.className='aicore-orb aicore-state-'+state;
  _coreState=state;
  const labels={
    idle:['Rdzeń AI','Gotowy do analizy','System oczekuje na polecenie'],
    scanning:['Analiza','Skanowanie systemu','Przetwarzanie danych diagnostycznych'],
    warning:['Uwaga','Wykryto problemy','Wymagana interwencja'],
    fixing:['Naprawa','Wykonuję operacje','Automatyczna naprawa w toku'],
    success:['Gotowe','Zakończono pomyślnie','System działa prawidłowo'],
    error:['Błąd','Operacja nieudana','Wymagana ręczna interwencja']
  };
  const [badge,title,desc]=labels[state]||labels.idle;
  const b=document.getElementById('coreBadge');
  const t=document.getElementById('coreTitle');
  const d=document.getElementById('coreDesc');
  if(b)b.textContent=badge;
  if(t)t.textContent=title;
  if(d)d.textContent=desc;
}

/* ═══════════════════════════════════════════
   CANVAS CORE — The living heart
   ═══════════════════════════════════════════ */
function initCoreCanvas(containerId){
  const container=document.getElementById(containerId);
  if(!container)return;
  const canvas=document.createElement('canvas');
  const size=Math.min(container.clientWidth,container.clientHeight)||200;
  canvas.width=size*2;canvas.height=size*2;
  canvas.style.width=size+'px';canvas.style.height=size+'px';
  container.appendChild(canvas);
  _coreCanvas=canvas;
  _coreCtx=canvas.getContext('2d');
  _coreTime=0;
  _animateCore();
}

function _getAccentColor(){
  const s=_coreState;
  if(s==='warning')return{h:35,r:251,g:146,b:60};
  if(s==='success')return{h:142,r:74,g:222,b:128};
  if(s==='error')return{h:0,r:239,g:68,b:68};
  return{h:210,r:79,g:140,b:255}; // blue default
}

function _animateCore(){
  _coreAnim=requestAnimationFrame(_animateCore);
  if(!_coreCtx)return;
  _coreTime+=0.016;
  const t=_coreTime;
  const ctx=_coreCtx;
  const W=_coreCanvas.width;
  const cx=W/2,cy=W/2;
  const state=_coreState;
  const ac=_getAccentColor();

  ctx.clearRect(0,0,W,W);

  // Speed multiplier per state
  const speed=state==='scanning'?2.5:state==='fixing'?3:state==='success'?0.6:state==='error'?0.8:1;
  const intensity=state==='scanning'?1.3:state==='fixing'?1.5:state==='idle'?0.7:state==='success'?0.8:0.6;

  // ── Layer 0: Deep ambient glow ──
  const ambR=W*0.42;
  const ambGrad=ctx.createRadialGradient(cx,cy,0,cx,cy,ambR);
  ambGrad.addColorStop(0,`rgba(${ac.r},${ac.g},${ac.b},${0.08*intensity})`);
  ambGrad.addColorStop(0.5,`rgba(${ac.r},${ac.g},${ac.b},${0.03*intensity})`);
  ambGrad.addColorStop(1,'transparent');
  ctx.fillStyle=ambGrad;
  ctx.fillRect(0,0,W,W);

  // ── Layer 1: Outer data ring (thin arcs) ──
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(t*0.15*speed);
  const outerR=W*0.44;
  for(let i=0;i<12;i++){
    const angle=(i/12)*Math.PI*2;
    const len=0.12+Math.sin(t*speed+i*1.3)*0.06;
    const alpha=0.15+Math.sin(t*speed*0.7+i)*0.1;
    ctx.beginPath();
    ctx.arc(0,0,outerR,angle,angle+len);
    ctx.strokeStyle=`rgba(${ac.r},${ac.g},${ac.b},${alpha})`;
    ctx.lineWidth=1;
    ctx.stroke();
  }
  ctx.restore();

  // ── Layer 2: Ring 1 — main orbit ──
  ctx.save();
  ctx.translate(cx,cy);
  const r1Angle=t*0.3*speed;
  ctx.rotate(r1Angle);
  const r1=W*0.38;
  ctx.beginPath();
  ctx.arc(0,0,r1,0,Math.PI*2);
  ctx.strokeStyle=`rgba(${ac.r},${ac.g},${ac.b},${0.08+0.04*Math.sin(t)})`;
  ctx.lineWidth=1.5;
  ctx.stroke();
  // Orbiter dot
  const dotX=r1;
  ctx.beginPath();
  ctx.arc(dotX,0,3*intensity,0,Math.PI*2);
  ctx.fillStyle=`rgba(${ac.r},${ac.g},${ac.b},0.9)`;
  ctx.shadowColor=`rgba(${ac.r},${ac.g},${ac.b},0.6)`;
  ctx.shadowBlur=8;
  ctx.fill();
  ctx.shadowBlur=0;
  ctx.restore();

  // ── Layer 3: Ring 2 — reverse, dashed feel ──
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(-t*0.2*speed);
  const r2=W*0.33;
  for(let i=0;i<24;i++){
    const a=(i/24)*Math.PI*2;
    if(i%3===0)continue;
    ctx.beginPath();
    ctx.arc(0,0,r2,a,a+0.08);
    ctx.strokeStyle=`rgba(${ac.r},${ac.g},${ac.b},${0.06+0.03*Math.sin(t*speed+i)})`;
    ctx.lineWidth=1;
    ctx.stroke();
  }
  // Second orbiter
  const d2a=-t*0.2*speed+Math.PI*0.7;
  ctx.beginPath();
  ctx.arc(r2*Math.cos(d2a-(-t*0.2*speed)),r2*Math.sin(d2a-(-t*0.2*speed)),2,0,Math.PI*2);
  ctx.fillStyle=`rgba(${ac.r},${ac.g},${ac.b},0.5)`;
  ctx.fill();
  ctx.restore();

  // ── Layer 4: Ring 3 — inner conic sweep ──
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(t*0.5*speed);
  const r3=W*0.27;
  const sweepGrad=ctx.createConicGradient(0,0,0);
  sweepGrad.addColorStop(0,'transparent');
  sweepGrad.addColorStop(0.15,`rgba(${ac.r},${ac.g},${ac.b},${0.12*intensity})`);
  sweepGrad.addColorStop(0.3,'transparent');
  sweepGrad.addColorStop(0.5,`rgba(${ac.r},${ac.g},${ac.b},${0.08*intensity})`);
  sweepGrad.addColorStop(0.65,'transparent');
  ctx.beginPath();
  ctx.arc(0,0,r3,0,Math.PI*2);
  ctx.strokeStyle=sweepGrad;
  ctx.lineWidth=2;
  ctx.stroke();
  ctx.restore();

  // ── Layer 5: Grid pattern (hexagonal suggestion) ──
  if(state==='scanning'||state==='fixing'){
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(t*0.05);
    const gridR=W*0.22;
    ctx.globalAlpha=0.03+0.02*Math.sin(t*2);
    for(let i=-3;i<=3;i++){
      ctx.beginPath();
      ctx.moveTo(-gridR,i*gridR/3);
      ctx.lineTo(gridR,i*gridR/3);
      ctx.strokeStyle=`rgb(${ac.r},${ac.g},${ac.b})`;
      ctx.lineWidth=0.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i*gridR/3,-gridR);
      ctx.lineTo(i*gridR/3,gridR);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }

  // ── Layer 6: Glass shell ──
  const shellR=W*0.22;
  const shellGrad=ctx.createRadialGradient(cx-shellR*0.2,cy-shellR*0.3,0,cx,cy,shellR);
  shellGrad.addColorStop(0,`rgba(255,255,255,${0.04*intensity})`);
  shellGrad.addColorStop(0.4,'rgba(255,255,255,0.01)');
  shellGrad.addColorStop(1,'transparent');
  ctx.beginPath();
  ctx.arc(cx,cy,shellR,0,Math.PI*2);
  ctx.fillStyle=shellGrad;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx,cy,shellR,0,Math.PI*2);
  ctx.strokeStyle=`rgba(255,255,255,${0.04+0.02*Math.sin(t)})`;
  ctx.lineWidth=1;
  ctx.stroke();

  // ── Layer 7: NUCLEUS — the beating heart ──
  const breathe=Math.sin(t*1.2*speed)*0.03+1;
  const nucR=W*0.14*breathe;

  // Outer nucleus glow
  const nucGlow=ctx.createRadialGradient(cx,cy,nucR*0.5,cx,cy,nucR*2.2);
  nucGlow.addColorStop(0,`rgba(${ac.r},${ac.g},${ac.b},${0.2*intensity})`);
  nucGlow.addColorStop(0.4,`rgba(${ac.r},${ac.g},${ac.b},${0.06*intensity})`);
  nucGlow.addColorStop(1,'transparent');
  ctx.fillStyle=nucGlow;
  ctx.fillRect(cx-nucR*2.5,cy-nucR*2.5,nucR*5,nucR*5);

  // Nucleus body
  const nucGrad=ctx.createRadialGradient(cx-nucR*0.25,cy-nucR*0.3,0,cx,cy,nucR);
  nucGrad.addColorStop(0,`rgba(${Math.min(ac.r+80,255)},${Math.min(ac.g+80,255)},${Math.min(ac.b+80,255)},1)`);
  nucGrad.addColorStop(0.3,`rgba(${ac.r},${ac.g},${ac.b},0.95)`);
  nucGrad.addColorStop(0.7,`rgba(${Math.floor(ac.r*0.6)},${Math.floor(ac.g*0.6)},${Math.floor(ac.b*0.6)},0.9)`);
  nucGrad.addColorStop(1,`rgba(${Math.floor(ac.r*0.3)},${Math.floor(ac.g*0.3)},${Math.floor(ac.b*0.3)},0.85)`);
  ctx.beginPath();
  ctx.arc(cx,cy,nucR,0,Math.PI*2);
  ctx.fillStyle=nucGrad;
  ctx.shadowColor=`rgba(${ac.r},${ac.g},${ac.b},${0.5*intensity})`;
  ctx.shadowBlur=30;
  ctx.fill();
  ctx.shadowBlur=0;

  // Nucleus highlight (top-left)
  const hlGrad=ctx.createRadialGradient(cx-nucR*0.3,cy-nucR*0.35,0,cx-nucR*0.3,cy-nucR*0.35,nucR*0.5);
  hlGrad.addColorStop(0,'rgba(255,255,255,0.35)');
  hlGrad.addColorStop(1,'transparent');
  ctx.beginPath();
  ctx.arc(cx,cy,nucR,0,Math.PI*2);
  ctx.fillStyle=hlGrad;
  ctx.fill();

  // ── Layer 8: Particles / data impulses ──
  if(state==='scanning'||state==='fixing'||state==='idle'){
    const pCount=state==='idle'?4:state==='scanning'?10:8;
    for(let i=0;i<pCount;i++){
      const phase=t*speed*0.8+i*2.1;
      const pR=W*0.18+W*0.2*(((phase%3)/3));
      const pAngle=i*1.37+t*0.3*speed;
      const px=cx+Math.cos(pAngle)*pR;
      const py2=cy+Math.sin(pAngle)*pR;
      const pAlpha=state==='idle'?0.15:0.3+Math.sin(phase)*0.2;
      const pSize=state==='idle'?1:1.5+Math.sin(phase)*0.5;
      ctx.beginPath();
      ctx.arc(px,py2,pSize,0,Math.PI*2);
      ctx.fillStyle=`rgba(${ac.r},${ac.g},${ac.b},${pAlpha})`;
      ctx.fill();
    }
  }

  // ── Layer 9: Energy lines (scanning/fixing) ──
  if(state==='scanning'||state==='fixing'){
    for(let i=0;i<3;i++){
      const la=t*1.5*speed+i*2.09;
      const lR1=W*0.16;
      const lR2=W*0.35;
      const x1=cx+Math.cos(la)*lR1;
      const y1=cy+Math.sin(la)*lR1;
      const x2=cx+Math.cos(la+0.3)*lR2;
      const y2=cy+Math.sin(la+0.3)*lR2;
      const lineGrad=ctx.createLinearGradient(x1,y1,x2,y2);
      lineGrad.addColorStop(0,`rgba(${ac.r},${ac.g},${ac.b},0)`);
      lineGrad.addColorStop(0.4,`rgba(${ac.r},${ac.g},${ac.b},${0.15*intensity})`);
      lineGrad.addColorStop(1,`rgba(${ac.r},${ac.g},${ac.b},0)`);
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.strokeStyle=lineGrad;
      ctx.lineWidth=1;
      ctx.stroke();
    }
  }
}

/* ═══════════════════════════════════════════
   ACTION FEED
   ═══════════════════════════════════════════ */
let _actionIdx=0;

function addCoreAction(label,detail){
  const feed=document.getElementById('coreFeed');
  if(!feed)return null;
  const id='ca_'+(++_actionIdx);
  const el=document.createElement('div');
  el.className='aicore-action';
  el.id=id;
  el.innerHTML=`
    <div class="aicore-action-dot running">...</div>
    <div class="aicore-action-body">
      <div class="aicore-action-name">${label}</div>
      ${detail?'<div class="aicore-action-detail">'+detail+'</div>':''}
    </div>
    <div class="aicore-action-time">${new Date().toLocaleTimeString('pl',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>`;
  feed.appendChild(el);
  feed.scrollTop=feed.scrollHeight;
  _updateCount();
  return id;
}

function updateCoreAction(id,status,resultText){
  const el=document.getElementById(id);
  if(!el)return;
  const dot=el.querySelector('.aicore-action-dot');
  const icons={success:'✓',error:'✗',skipped:'—',running:'...',waiting:'○'};
  dot.className='aicore-action-dot '+status;
  dot.textContent=icons[status]||'·';
  if(resultText){
    let det=el.querySelector('.aicore-action-detail');
    if(!det){det=document.createElement('div');det.className='aicore-action-detail';el.querySelector('.aicore-action-body').appendChild(det)}
    det.textContent=resultText;
  }
  _updateCount();
}

function _updateCount(){
  const tag=document.getElementById('coreActionCount');
  const feed=document.getElementById('coreFeed');
  if(!tag||!feed)return;
  const total=feed.querySelectorAll('.aicore-action').length;
  const done=feed.querySelectorAll('.aicore-action-dot.success').length;
  const err=feed.querySelectorAll('.aicore-action-dot.error').length;
  tag.textContent=total?`${done+err}/${total}`:'0';
}
function updateActionCount(){_updateCount()}
function clearCoreActions(){const f=document.getElementById('coreFeed');if(f)f.innerHTML='';_updateCount()}

/* ── Result Card ── */
function showCoreResult(results){
  const el=document.getElementById('coreResult');
  if(!el)return;
  const ok=results.filter(r=>r.ok&&!r.skipped).length;
  const fail=results.filter(r=>!r.ok&&!r.skipped).length;
  const skip=results.filter(r=>r.skipped).length;
  const total=results.length;
  const score=total?Math.round(ok/total*100):0;
  const level=score>=80?'good':score>=50?'warning':'critical';
  const levelText=score>=80?'Dobry':score>=50?'Wymaga uwagi':'Krytyczny';
  el.innerHTML=`
    <div class="aicore-result-header">
      <span class="aicore-result-title">Wynik analizy</span>
      <span class="aicore-result-badge ${level}">${levelText}</span>
    </div>
    <div class="aicore-result-grid">
      <div class="aicore-result-item"><div class="aicore-result-item-label">Stan systemu</div><div class="aicore-result-item-value">${score}%</div></div>
      <div class="aicore-result-item"><div class="aicore-result-item-label">Problemy</div><div class="aicore-result-item-value">${fail}</div></div>
      <div class="aicore-result-item"><div class="aicore-result-item-label">Naprawiono</div><div class="aicore-result-item-value">${ok}</div></div>
      <div class="aicore-result-item"><div class="aicore-result-item-label">Pominięto</div><div class="aicore-result-item-value">${skip}</div></div>
    </div>`;
  el.classList.add('visible');
}

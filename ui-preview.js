(() => {
'use strict';

const UI=window.GRSProductionUI;
if(!UI)return;
const originalRender=UI.render;
const {FACE,ICON,IDS}=UI;
let previewSelect=null;
let referenceCanvas=null;
let compareWrap=null;
let primaryLabel=null;

function two(v){return String(Math.floor(v)).padStart(2,'0');}
function langOf(s){return s.lang==='en'?'en':'zh';}
function timeHM(d){return `${two(d.getHours())}:${two(d.getMinutes())}`;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function trunc(v){return v<0?Math.ceil(v):Math.floor(v);}

function compactHeader(l,m,s){
  const d=m.time instanceof Date?m.time:new Date();
  l.text(1,9,FACE.PROFONT12,timeHM(d));
  if(s.alarmSound){
    l.glyph(76,1,FACE.ICON,ICON.SOUND);
    if(m.muted){
      l.box(82,1,4,8,0);
      l.line(82,2,85,6);
      l.line(85,2,82,6);
    }
  }
  if(s.alarmLight)l.glyph(90,1,FACE.ICON,ICON.LIGHT);
  if(s.alarmVib)l.glyph(103,1,FACE.ICON,ICON.VIBRATION);
  l.frame(113,2,12,6);
  l.pixel(125,4);l.pixel(125,5);
  const level=clamp(m.battLevel??0,0,3);
  for(let bar=0;bar<level;bar++)l.box(115+bar*3,4,2,2);
}

function drawHold(l,s){
  const lang=langOf(s),face=lang==='en'?FACE.LATIN:FACE.BODY;
  const text=l.string(IDS.HOLD,lang),w=l.width(face,text),bw=Math.min(124,w+8),x=trunc((128-bw)/2);
  l.box(x,23,bw,19,0);l.frame(x,23,bw,19);
  l.centerText(x,bw,face===FACE.BODY?26:29,face,text);
}

function renderCompact(state,canvas){
  const l=canvas.__grsCompactLCD||(canvas.__grsCompactLCD=UI.createLCD(canvas));
  l.clear();
  const {m,s,u}=state;
  if(u.page!=='monitor'||u.mode!=='rate')return originalRender(state,canvas);
  const lang=langOf(s);
  compactHeader(l,m,s);

  // 精简版主界面：无任何区域分割线、无 Home/STATUS/表情/USB/环境与计数区。
  l.centerId(0,128,20,FACE.SIX10,IDS.MAIN_DOSE,lang);
  const rate=UI.formatDoseRate(m.dose);
  const valueWidth=l.width(FACE.TIMR24,rate.value);
  const unitWidth=l.width(FACE.T0_11,rate.unit);
  const gap=3;
  const totalWidth=valueWidth+gap+unitWidth;
  const x=Math.max(0,trunc((128-totalWidth)/2));
  l.text(x,46,FACE.TIMR24,rate.value);
  l.text(x+valueWidth+gap,46,FACE.T0_11,rate.unit);

  if(Date.now()<(u.hint||0))drawHold(l,s);
  l.present();
  canvas.dataset.frameCrc=l.crc32().toString(16).padStart(8,'0');
  return l.buf;
}

function addPreviewStyles(){
  const style=document.createElement('style');
  style.textContent=`
    .ui-preview-control{display:flex;align-items:center;gap:8px}
    .lcd-compare-wrap{display:block}
    .lcd-compare-wrap.compare-active{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
    .lcd-compare-wrap.compare-active .lcd-shell{margin:18px 0 16px;padding:12px 10px 14px}
    #lcdReference{box-sizing:content-box;width:512px;max-width:calc(100% - 14px);height:auto;margin:0 auto;display:block;background:var(--lcd-bg);border:7px solid #0c1316;border-radius:5px;image-rendering:pixelated;image-rendering:crisp-edges;filter:none}
    .lcd-compare-wrap.compare-active #lcd,.lcd-compare-wrap.compare-active #lcdReference{width:256px;max-width:calc(100% - 14px)}
    .ui-preview-note{margin:-4px auto 12px;max-width:690px;color:var(--muted);font-size:.74rem;line-height:1.5}
    @media(max-width:1450px){
      .lcd-compare-wrap.compare-active{grid-template-columns:1fr}
      .lcd-compare-wrap.compare-active #lcd,.lcd-compare-wrap.compare-active #lcdReference{width:512px}
    }
  `;
  document.head.appendChild(style);
}

function setPrimaryLabel(text){if(primaryLabel)primaryLabel.textContent=text;}
function updateLayout(mode,eligible){
  const compare=mode==='compare'&&eligible;
  compareWrap?.classList.toggle('compare-active',compare);
  if(referenceCanvas?.closest('.lcd-shell'))referenceCanvas.closest('.lcd-shell').hidden=!compare;
  if(compare)setPrimaryLabel('GRS LC01 · 精简版');
  else if(mode==='compact'&&eligible)setPrimaryLabel('GRS LC01 · 精简版');
  else setPrimaryLabel('GRS LC01 · 原版 Production');
}

function installPreviewUI(){
  const lcd=document.getElementById('lcd');
  const shell=lcd?.closest('.lcd-shell');
  const controls=document.querySelector('.simulator-card .inline-controls');
  if(!lcd||!shell||!controls||document.getElementById('uiVariant'))return;
  addPreviewStyles();
  controls.style.flexWrap='wrap';

  const group=document.createElement('span');
  group.className='ui-preview-control';
  const label=document.createElement('label');
  label.htmlFor='uiVariant';label.textContent='界面版本';
  previewSelect=document.createElement('select');
  previewSelect.id='uiVariant';
  previewSelect.innerHTML='<option value="compact">精简版</option><option value="production">原版</option><option value="compare" selected>对比</option>';
  group.append(label,previewSelect);
  controls.prepend(group);

  compareWrap=document.createElement('div');
  compareWrap.id='lcdCompareWrap';compareWrap.className='lcd-compare-wrap';
  shell.parentNode.insertBefore(compareWrap,shell);compareWrap.appendChild(shell);
  primaryLabel=shell.querySelector('.lcd-label-row span:first-child');

  const refShell=document.createElement('div');
  refShell.className='lcd-shell';refShell.hidden=true;
  refShell.innerHTML='<div class="lcd-label-row"><span>GRS LC01 · 原版 Production</span><span>REFERENCE</span></div><canvas id="lcdReference" width="128" height="64" aria-label="原版Production 128×64 LCD对照"></canvas>';
  compareWrap.appendChild(refShell);
  referenceCanvas=refShell.querySelector('#lcdReference');

  const note=document.createElement('p');
  note.className='ui-preview-note';
  note.textContent='当前仅调整 Dose 主界面：Total、趋势页、设置页仍保持 Production 原版，便于逐项确认后再同步到实机固件。';
  compareWrap.insertAdjacentElement('afterend',note);

  previewSelect.addEventListener('change',()=>{
    if(lcd.__grsPreviewState)window.GRSProductionUI.render(lcd.__grsPreviewState,lcd);
  });
}

function render(state,canvas){
  if(typeof document==='undefined'||canvas?.id!=='lcd')return originalRender(state,canvas);
  canvas.__grsPreviewState=state;
  const mode=previewSelect?.value||document.getElementById('uiVariant')?.value||'compare';
  const eligible=state?.u?.page==='monitor'&&state?.u?.mode==='rate';
  updateLayout(mode,eligible);
  if(mode==='compare'&&eligible){
    const compact=renderCompact(state,canvas);
    if(referenceCanvas)originalRender(state,referenceCanvas);
    return compact;
  }
  if(mode==='compact'&&eligible)return renderCompact(state,canvas);
  return originalRender(state,canvas);
}

UI.renderCompact=renderCompact;
UI.render=render;
if(typeof document!=='undefined')installPreviewUI();
})();

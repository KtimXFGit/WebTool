(() => {
'use strict';

const UI=window.GRSProductionUI;
if(!UI)return;
const originalRender=UI.render;
const {FACE,ICON,IDS}=UI;
const PREVIEW_FACE_LOGISOSO32=8;
let previewSelect=null;
let referenceCanvas=null;
let compareWrap=null;
let primaryLabel=null;

// 精简版大数字使用与 GRS 主资源相同固定版本 U8g2 中的
// u8g2_font_logisoso32_tn。这里只提取剂量率需要的 0-9、'.'、'-'，
// 保持 Web 预览与后续实机资源方案可以逐像素对应。
window.GRSUIFaces=window.GRSUIFaces||{};
window.GRSUIFaces[PREVIEW_FACE_LOGISOSO32]=window.GRSUIFaces[PREVIEW_FACE_LOGISOSO32]||{"meta":{"name":"PREVIEW_LOGISOSO32_TN","width":20,"height":32,"baseline":32},"glyphs":{"48":[16,32,20,2,-32,"B+Af+D/8f/58Pvgf8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/gffD5//j/8H/gH4A=="],"49":[8,32,20,7,-32,"Dw8fHz/////vDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8="],"50":[16,32,20,2,-32,"B+Af+D/8f/58Pvgf8A/wD/AP8A/wH2A+AD4AfAB4APgB8AHgA+AHwAfAD4AfAB8APgA8AHwA+AD//////////w=="],"51":[16,32,20,2,-32,"//////////8AHwA+ADwAfAD4APAB8APgA+AD8AP4A/wAPgAeAA8ADwAPAA8ADwAPAA8QH3Ae/H5//D/4H/AHwA=="],"52":[16,32,20,2,-32,"B8AHgAeAB4APgA8ADwAPAB8AHgAeAB4APgA8ADwAPAB88HjwePB48Pjw8PD//////////wDwAPAA8ADwAPAA8A=="],"53":[16,32,20,2,-32,"///////////wAPAA8ADwAPAA8ADwAPfg//j//P/+/D74H/AP8A8ADwAPAA8ADwAP8A/wD/gffD5//j/8H/gH4A=="],"54":[16,32,20,2,-32,"B+Af+D/8f/58Pvgf8A/wD/AA8ADwAPAA9+D/+P/8//78Pvgf8A/wD/AP8A/wD/AP8A/wD/gffD5//j/8H/gH4A=="],"55":[16,32,20,2,-32,"///////////wH/Af8B7wPgA+AD4APAB8AHwAeAB4APgA+ADwAPAB8AHwAeAD4APgA+ADwAfAB8AHwAeAD4APgA=="],"56":[16,32,20,2,-32,"B+Af+D/8f/58Pvgf8A/wD/AP8A/wD/AP+B98Pn/+P/w//H/+fD74H/AP8A/wD/AP8A/wD/gffD5//j/8H/gH4A=="],"57":[16,32,20,2,-32,"B+Af+D/8f/58Pvgf8A/wD/AP8A/wD/AP8A/wD/gffD9//z//H/8H7wAPAA8ADwAP8A/wD/gffD5//j/8H/gH4A=="],"46":[4,4,12,4,-4,"YPDwYA=="],"45":[12,4,20,4,-14,"//D/8P/w//A="]}};

function langOf(s){return s.lang==='en'?'en':'zh';}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function trunc(v){return v<0?Math.ceil(v):Math.floor(v);}

function drawCompactTemperature(l,m){
  const valid=m.env&&Number.isFinite(Number(m.temp));
  const text=valid?String(clamp(Math.round(Number(m.temp)),-99,199)):'--';
  l.text(1,9,FACE.HAX,text);
  const degreeX=1+l.width(FACE.HAX,text)+1;
  // 3×3 像素温度度数符号；C 使用 HAXRCORP 大写字形。
  l.pixel(degreeX+1,1);
  l.pixel(degreeX,2);
  l.pixel(degreeX+2,2);
  l.pixel(degreeX+1,3);
  l.text(degreeX+4,9,FACE.HAX,'C');
}

function compactHeader(l,m,s){
  drawCompactTemperature(l,m);
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

function activeRangeCenti(doseCenti){
  const value=Math.max(0,Number(doseCenti)||0);
  const ranges=[100,1000,10000,100000,1000000,10000000];
  for(const range of ranges)if(value<=range)return range;
  return ranges[ranges.length-1];
}

function drawRangeBar(l,doseCenti){
  // 参考阶梯式量程图：8 条水平线由上到下逐级缩短。
  // 128×64 下最长 28 px、级间距 4 px，可形成明确层次且不侵占主读数区。
  const x=3;
  const y0=27;
  const gap=4;
  const widths=[28,25,22,19,16,13,10,7];
  const range=activeRangeCenti(doseCenti);
  const ratio=clamp((Math.max(0,Number(doseCenti)||0))/range,0,1);
  const activeCount=ratio>0?Math.max(1,Math.ceil(widths.length*ratio)):0;

  for(let i=0;i<widths.length;i++){
    const y=y0+i*gap;
    l.hline(x,y,widths[i]);
    // 量程进度由下向上高亮；在单色屏上用 2 px 厚度区分激活级。
    if(i>=widths.length-activeCount)l.hline(x,y+1,widths[i]);
  }
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

  // 精简版：顶部左侧整数温度；Dose 右上；左侧阶梯式自动量程条；
  // 大号剂量率在右侧剩余空间重新居中，单位固定右下角。
  const doseLabel=l.string(IDS.MAIN_DOSE,lang);
  const doseWidth=l.width(FACE.SIX10,doseLabel);
  l.text(Math.max(36,127-doseWidth),20,FACE.SIX10,doseLabel);
  drawRangeBar(l,m.dose);

  const rate=UI.formatDoseRate(m.dose);
  const valueWidth=l.width(PREVIEW_FACE_LOGISOSO32,rate.value);
  const valueLeft=34;
  const valueRight=127;
  const valueArea=valueRight-valueLeft+1;
  const valueX=valueLeft+Math.max(0,trunc((valueArea-valueWidth)/2));
  l.text(valueX,55,PREVIEW_FACE_LOGISOSO32,rate.value);
  const unitWidth=l.width(FACE.T0_11,rate.unit);
  l.text(Math.max(34,127-unitWidth),63,FACE.T0_11,rate.unit);

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
  note.textContent='当前精简 Dose 主界面采用整数温度、右上 Dose、左侧 8 级阶梯式自动量程条、大号 U8g2 剂量率和右下角单位；Total、趋势页、设置页仍保持 Production 原版。';
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

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

// 3×5 单色微型字模：量程标签与顶部温度共用。
const TINY3X5={
  '0':['111','101','101','101','111'],
  '1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'],
  '3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'],
  '5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'],
  '7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'],
  '9':['111','101','111','001','111'],
  'C':['111','100','100','100','111'],
  'u':['101','101','101','101','111'],
  'm':['101','111','111','101','101'],
  '-':['000','000','111','000','000'],
  '.':['000','000','000','000','010']
};
function tinyWidth(text){return Math.max(0,String(text).length*4-1);}
function tinyText(l,x,y,text){
  let px=x;
  for(const ch of String(text)){
    const rows=TINY3X5[ch]||TINY3X5['0'];
    for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++)if(rows[yy][xx]==='1')l.pixel(px+xx,y+yy);
    px+=4;
  }
}

function drawCompactTemperature(l,m){
  const valid=m.env&&Number.isFinite(Number(m.temp));
  const text=valid?String(clamp(Math.round(Number(m.temp)),-99,199)):'--';
  const x=1,y=2;
  tinyText(l,x,y,text);
  const degreeX=x+tinyWidth(text)+1;
  // 2×2 度数符号 + 3×5 大写 C，整体高度仅 5 px。
  l.pixel(degreeX,1);l.pixel(degreeX+1,1);
  l.pixel(degreeX,2);l.pixel(degreeX+1,2);
  tinyText(l,degreeX+3,y,'C');
  return degreeX+6;
}
function compactHeader(l,m,s){
  const tempRight=drawCompactTemperature(l,m);
  // 电池移到温度旁边，形成左上角紧凑状态组。
  const batteryX=Math.max(18,tempRight+3);
  l.frame(batteryX,2,12,6);
  l.pixel(batteryX+12,4);l.pixel(batteryX+12,5);
  const level=clamp(m.battLevel??0,0,3);
  for(let bar=0;bar<level;bar++)l.box(batteryX+2+bar*3,4,2,2);

  // 顶部仅保留声音状态；灯光、振动图标从精简主界面移除。
  if(s.alarmSound){
    const soundX=116;
    l.glyph(soundX,1,FACE.ICON,ICON.SOUND);
    if(m.muted){
      l.box(122,1,4,8,0);
      l.line(122,2,125,6);
      l.line(125,2,122,6);
    }
  }
}
// 当前 Production 资源中最小正式文本 face 是 HAXRCORP 5×7。
// 精简页为顶部温度和量程标签复用 3×5 1-bit 微型字模，以降低状态栏视觉重量。

function drawLogRangeBar(l,doseCenti){
  // 范围：0.1 uSv/h ～ 100 mSv/h，共 6 个 decade。
  // 标签在线上方，当前位置三角指针在线下方。
  const x1=8;
  const x2=119;
  const y=60;
  const minLog=-1;
  const maxLog=5;
  const doseUSv=Math.max(0.1,(Math.max(0,Number(doseCenti)||0))/100);

  const labels=[
    {decade:-1,text:'.1u'},
    {decade:1,text:'10u'},
    {decade:3,text:'1m'},
    {decade:5,text:'100m'}
  ];
  for(const item of labels){
    const ratio=(item.decade-minLog)/(maxLog-minLog);
    const center=x1+Math.round((x2-x1)*ratio);
    const width=tinyWidth(item.text);
    const x=clamp(center-trunc(width/2),0,127-width);
    tinyText(l,x,52,item.text);
  }

  l.hline(x1,y,x2-x1+1);
  for(let decade=minLog;decade<=maxLog;decade++){
    const ratio=(decade-minLog)/(maxLog-minLog);
    const x=x1+Math.round((x2-x1)*ratio);
    l.vline(x,y-2,3);
  }

  const valueLog=Math.log10(doseUSv);
  const valueRatio=clamp((valueLog-minLog)/(maxLog-minLog),0,1);
  const px=x1+Math.round((x2-x1)*valueRatio);
  // 指针位于量程线下方，尖端朝上指向当前量程位置。
  l.pixel(px,61);
  l.hline(px-1,62,3);
  l.hline(px-2,63,5);
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
  compactHeader(l,m,s);

  const rate=UI.formatDoseRate(m.dose);
  const valueWidth=l.width(PREVIEW_FACE_LOGISOSO32,rate.value);
  const valueX=Math.max(10,trunc((128-valueWidth)/2));
  l.text(valueX,42,PREVIEW_FACE_LOGISOSO32,rate.value);

  const unitWidth=l.width(FACE.LATIN,rate.unit);
  l.text(Math.max(0,126-unitWidth),42,FACE.LATIN,rate.unit);
  drawLogRangeBar(l,m.dose);

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
  note.textContent='当前精简主界面采用 3×5 小号整数温度，电池图标移至温度旁边；顶部仅保留声音状态，灯光和振动图标已移除。主区继续使用居中大号 U8g2 剂量率，下方为 0.1 uSv/h～100 mSv/h 对数量级条，标签在线上方、三角指针在线下方。Total、趋势页、设置页仍保持 Production 原版。';
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

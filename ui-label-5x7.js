(() => {
'use strict';

const UI=window.GRSProductionUI;
if(!UI)return;
const {FACE,IDS}=UI;
const MAIN_VALUE_FACE=8;

// U8g2 官方 5x7 fixed 字体中 Dose / Rate / Total 所需的最小字形子集。
// 每字符占 5×7 单元；避免当前 HAXRCORP 裁剪字库缺少小写 s 导致 Dose 显示不完整。
const LABEL5X7={
  'D':['11100','10010','10010','10010','10010','11100','00000'],
  'R':['11100','10010','10010','11100','10100','10010','00000'],
  'T':['01110','00100','00100','00100','00100','00100','00000'],
  'a':['00000','00000','01110','10010','10110','01010','00000'],
  'e':['00000','00000','01100','10110','11000','01100','00000'],
  'l':['01100','00100','00100','00100','00100','01110','00000'],
  'o':['00000','00000','01100','10010','10010','01100','00000'],
  's':['00000','00000','01110','11000','00110','11100','00000'],
  't':['01000','01000','11100','01000','01000','00110','00000']
};

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
  ':':['000','010','000','010','000']
};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function two(v){return String(Math.floor(v)).padStart(2,'0');}

function drawLabel(l,x,y,text){
  let px=x;
  for(const ch of String(text)){
    const rows=LABEL5X7[ch];
    if(rows){
      for(let yy=0;yy<7;yy++)for(let xx=0;xx<5;xx++)if(rows[yy][xx]==='1')l.pixel(px+xx,y+yy);
    }
    px+=5;
  }
}

function tinyText(l,x,y,text){
  let px=x;
  for(const ch of String(text)){
    const rows=TINY3X5[ch];
    if(rows){
      for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++)if(rows[yy][xx]==='1')l.pixel(px+xx,y+yy);
    }
    px+=4;
  }
}

function drawMiniBitmap(l,x,y,rows){
  for(let yy=0;yy<rows.length;yy++)for(let xx=0;xx<rows[yy].length;xx++)if(rows[yy][xx]==='1')l.pixel(x+xx,y+yy);
}

function drawCompactStatusIcons(l,m,s){
  if(s.alarmSound){
    drawMiniBitmap(l,86,1,['001000','011010','111001','111001','011010','001000']);
    if(m.muted)l.line(87,1,91,6);
  }
  if(s.alarmLight)drawMiniBitmap(l,95,1,['001000','100010','011100','011100','100010','001000']);
  if(s.alarmVib)drawMiniBitmap(l,104,1,['100001','010010','011110','011110','010010','100001']);

  l.frame(114,1,12,6);
  l.pixel(126,3);l.pixel(126,4);
  const level=clamp(m.battLevel??0,0,3);
  for(let bar=0;bar<level;bar++)l.box(116+bar*3,3,2,2);
}

function drawCompactTotalHeader(l,m,s){
  const d=m.time instanceof Date?m.time:new Date();
  tinyText(l,1,2,`${two(d.getHours())}:${two(d.getMinutes())}`);
  drawCompactStatusIcons(l,m,s);
}

function drawHold(l,s){
  const lang=s.lang==='en'?'en':'zh';
  const face=lang==='en'?FACE.LATIN:FACE.BODY;
  const text=l.string(IDS.HOLD,lang);
  const w=l.width(face,text),bw=Math.min(124,w+8),x=Math.trunc((128-bw)/2);
  l.box(x,23,bw,19,0);l.frame(x,23,bw,19);
  l.centerText(x,bw,face===FACE.BODY?26:29,face,text);
}

function renderCompactTotal(state,canvas){
  if(!state||state.u?.page!=='monitor'||state.u?.mode!=='total'||!canvas)return null;
  const l=canvas.__grsCompactLCD||(canvas.__grsCompactLCD=UI.createLCD(canvas));
  const {m,s,u}=state;
  l.clear();

  drawCompactTotalHeader(l,m,s);
  drawLabel(l,3,16,'Total');
  drawLabel(l,3,24,'Dose');

  const total=UI.formatTotal(m.total);
  const valueWidth=l.width(MAIN_VALUE_FACE,total.value);
  const valueX=Math.max(30,Math.trunc((128-valueWidth)/2)+3);
  l.text(valueX,42,MAIN_VALUE_FACE,total.value);

  const unitWidth=l.width(FACE.LATIN,total.unit);
  l.text(Math.max(0,126-unitWidth),42,FACE.LATIN,total.unit);

  // 保留原 Total 页的累计时长信息，但去掉三列分割线，改成一行紧凑显示。
  const elapsed=Math.max(0,Math.floor(m.totalSec||0));
  const days=Math.floor(elapsed/86400);
  const hours=Math.floor(elapsed/3600)%24;
  const minutes=Math.floor(elapsed/60)%60;
  const elapsedText=`${days}D ${two(hours)}H ${two(minutes)}M`;
  l.centerText(0,128,56,FACE.LATIN,elapsedText);

  if(Date.now()<(u.hint||0))drawHold(l,s);
  l.present();
  canvas.dataset.frameCrc=l.crc32().toString(16).padStart(8,'0');
  return l.buf;
}

function patchRateLabel(state,canvas){
  if(!state||state.u?.page!=='monitor'||state.u?.mode!=='rate'||!canvas)return null;
  const l=canvas.__grsCompactLCD;
  if(!l)return null;

  // 清除旧 HAXRCORP Dose / Rate 区域，再按 U8g2 5x7 fixed 字形重绘。
  l.box(2,14,23,18,0);
  drawLabel(l,3,16,'Dose');
  drawLabel(l,3,24,'Rate');
  l.present();
  canvas.dataset.frameCrc=l.crc32().toString(16).padStart(8,'0');
  return l.buf;
}

const oldCompact=UI.renderCompact;
if(typeof oldCompact==='function'){
  UI.renderCompact=function(state,canvas){
    if(state?.u?.page==='monitor'&&state.u.mode==='total')return renderCompactTotal(state,canvas);
    const out=oldCompact(state,canvas);
    return patchRateLabel(state,canvas)||out;
  };
}

const oldRender=UI.render;
if(typeof oldRender==='function'){
  UI.render=function(state,canvas){
    if(typeof document==='undefined'||canvas?.id!=='lcd')return oldRender(state,canvas);

    const isTotal=state?.u?.page==='monitor'&&state.u.mode==='total';
    if(isTotal){
      const mode=document.getElementById('uiVariant')?.value||'compare';
      if(mode==='production')return oldRender(state,canvas);

      // 先让原 preview 更新外围 DOM 状态，再覆盖主 LCD 为精简 Total。
      oldRender(state,canvas);
      const out=renderCompactTotal(state,canvas);

      if(mode==='compare'){
        const wrap=document.getElementById('lcdCompareWrap');
        const ref=document.getElementById('lcdReference');
        const refShell=ref?.closest('.lcd-shell');
        const primaryLabel=canvas.closest('.lcd-shell')?.querySelector('.lcd-label-row span:first-child');
        wrap?.classList.add('compare-active');
        if(refShell)refShell.hidden=false;
        if(primaryLabel)primaryLabel.textContent='GRS LC01 · 精简版';
        if(ref)oldRender(state,ref);
      }
      return out;
    }

    const out=oldRender(state,canvas);
    const mode=document.getElementById('uiVariant')?.value||'compare';
    if(mode==='production')return out;
    return patchRateLabel(state,canvas)||out;
  };
}

if(typeof document!=='undefined'){
  const note=document.querySelector('.ui-preview-note');
  if(note)note.textContent='精简 Dose Rate 页：左上为 3×5 整数温度，右上为小号声音 / 灯光 / 振动 / 电池，主区使用 U8g2 5×7 Dose / Rate、大号剂量率和底部对数量程条。精简 Total Dose 页采用同一顶部状态样式，但左上改为 HH:MM；主区使用 Total / Dose + 大号累计剂量，底部无分割线显示累计时长（D/H/M）。趋势页、设置页仍保持 Production 原版。';
}
})();

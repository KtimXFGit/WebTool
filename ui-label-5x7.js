(() => {
'use strict';

const UI=window.GRSProductionUI;
if(!UI)return;

// U8g2 官方 5x7 fixed 字体中 Dose / Rate 所需的最小字形子集。
// 每字符占 5×7 单元；避免当前 HAXRCORP 裁剪字库缺少小写 s 导致 Dose 显示不完整。
const LABEL5X7={
  'D':['11100','10010','10010','10010','10010','11100','00000'],
  'R':['11100','10010','10010','11100','10100','10010','00000'],
  'a':['00000','00000','01110','10010','10110','01010','00000'],
  'e':['00000','00000','01100','10110','11000','01100','00000'],
  'o':['00000','00000','01100','10010','10010','01100','00000'],
  's':['00000','00000','01110','11000','00110','11100','00000'],
  't':['01000','01000','11100','01000','01000','00110','00000']
};

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

function patchCompactLabel(state,canvas){
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
    const out=oldCompact(state,canvas);
    return patchCompactLabel(state,canvas)||out;
  };
}

const oldRender=UI.render;
if(typeof oldRender==='function'){
  UI.render=function(state,canvas){
    const out=oldRender(state,canvas);
    if(typeof document==='undefined'||canvas?.id!=='lcd')return out;
    const mode=document.getElementById('uiVariant')?.value||'compare';
    if(mode==='production')return out;
    return patchCompactLabel(state,canvas)||out;
  };
}

if(typeof document!=='undefined'){
  const note=document.querySelector('.ui-preview-note');
  if(note)note.textContent='当前精简主界面左上仅保留 3×5 小号整数温度；右上依次显示 6×6 小号声音、灯光、振动状态，并将电池图标移到最右侧。主剂量率左侧使用 U8g2 5×7 fixed 风格小字分两行显示 Dose / Rate，主区继续使用大号 U8g2 剂量率，下方为 0.1 uSv/h～100 mSv/h 对数量级条，标签在线上方、三角指针在线下方。Total、趋势页、设置页仍保持 Production 原版。';
}
})();

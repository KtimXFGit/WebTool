'use strict';
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
global.window=global;
for(const file of [
  'ui-resource/grs-ui-meta.js',
  'ui-resource/grs-ui-strings.js',
  'ui-resource/grs-ui-faces.js',
  'grs-production-ui.js',
  'ui-preview.js',
  'ui-label-5x7.js'
])vm.runInThisContext(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});

function assert(v,msg){if(!v)throw new Error(msg);}
const ctx={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},putImageData(){},imageSmoothingEnabled:false};
function makeCanvas(){return {dataset:{},id:'test',getContext(){return ctx;}};}
function bit(buf,x,y){return (buf[(y>>3)*128+x]>>(y&7))&1;}
const base={
  m:{dose:8,measure:7,cps:0,cpm:8,pulses:12,elapsed:1000,raw:0,total:3.42,totalSec:94620,temp:24.6,rh:48,env:true,batt:3860,battLevel:3,alarm:false,gmFault:false,flags:0,algo:0,detect:0,history:Array(60).fill(0),avg:8,peak:8,time:new Date(2026,9,21,10,38,32),muted:false},
  s:{lang:'zh',threshold:250,backlightOn:true,backlight:80,autoSleep:true,keySound:true,keyVib:true,gmSound:true,alarmSound:true,alarmLight:true,alarmVib:true},
  u:{page:'monitor',mode:'rate',sel:0,first:0,edit:false,sub:null,subSel:0,hint:0},
  c:{connected:false}
};
function clone(){const s=structuredClone(base);s.m.time=new Date(base.m.time);return s;}

// Dose Rate：继续验证 U8g2 5x7 的小写 s，防止再次显示成 Doe。
const rateCanvas=makeCanvas();
const rateState=clone();
const rateBuf=Uint8Array.from(GRSProductionUI.renderCompact(rateState,rateCanvas));
for(const x of [14,15,16])assert(bit(rateBuf,x,18)===1,`Dose lowercase s top stroke missing at x=${x}`);
assert(bit(rateBuf,13,18)===0&&bit(rateBuf,17,18)===0,'Dose lowercase s width/pattern unexpected');
assert(bit(rateBuf,13,19)===1&&bit(rateBuf,14,19)===1,'Dose lowercase s second stroke missing');
assert(bit(rateBuf,15,20)===1&&bit(rateBuf,16,20)===1,'Dose lowercase s middle/right stroke missing');
assert(bit(rateBuf,13,21)===1&&bit(rateBuf,14,21)===1&&bit(rateBuf,15,21)===1,'Dose lowercase s bottom stroke missing');
let ratePixels=0;
for(let y=24;y<=30;y++)for(let x=3;x<23;x++)ratePixels+=bit(rateBuf,x,y);
assert(ratePixels>25,'Rate 5x7 label missing');

// Total Dose：精简页应使用无分割线布局，左上为 HH:MM 而不是温度。
const totalState=clone();
totalState.u.mode='total';
const totalCanvas=makeCanvas();
const totalBuf=Uint8Array.from(GRSProductionUI.renderCompact(totalState,totalCanvas));
assert(totalBuf.length===1024,'total compact framebuffer must be 1024 bytes');

// 原 Production 的标题横线与主区底部分割线应消失。
for(const [x,y] of [[0,10],[30,10],[0,46],[20,46]])
  assert(bit(totalBuf,x,y)===0,`total divider residue at ${x},${y}`);

// Total / Dose 两行 5x7 标签应存在。
let totalLabelPixels=0;
for(let y=16;y<=30;y++)for(let x=3;x<29;x++)totalLabelPixels+=bit(totalBuf,x,y);
assert(totalLabelPixels>45,'Total Dose 5x7 label missing');

// 累计剂量大数字与单位应存在。
let totalMainPixels=0;
for(let y=10;y<=49;y++)for(let x=28;x<127;x++)totalMainPixels+=bit(totalBuf,x,y);
assert(totalMainPixels>50,'total dose main value/unit missing');

// 底部累计时长改为无分割线单行 D/H/M 信息。
let elapsedPixels=0;
for(let y=56;y<=63;y++)for(let x=20;x<110;x++)elapsedPixels+=bit(totalBuf,x,y);
assert(elapsedPixels>20,'total elapsed D/H/M line missing');

// 秒变化不应影响 HH:MM；分钟变化必须影响界面。
const secState=clone();secState.u.mode='total';secState.m.time=new Date(2026,9,21,10,38,59);
const secCanvas=makeCanvas();GRSProductionUI.renderCompact(secState,secCanvas);
assert(secCanvas.dataset.frameCrc===totalCanvas.dataset.frameCrc,'seconds unexpectedly affect HH:MM total header');
const minState=clone();minState.u.mode='total';minState.m.time=new Date(2026,9,21,10,39,0);
const minCanvas=makeCanvas();GRSProductionUI.renderCompact(minState,minCanvas);
assert(minCanvas.dataset.frameCrc!==totalCanvas.dataset.frameCrc,'minute change does not affect total header');

// Total 页左上不再显示温度，温度变化不应改变画面。
const tempState=clone();tempState.u.mode='total';tempState.m.temp=33.2;
const tempCanvas=makeCanvas();GRSProductionUI.renderCompact(tempState,tempCanvas);
assert(tempCanvas.dataset.frameCrc===totalCanvas.dataset.frameCrc,'temperature unexpectedly affects total header');

// 累计剂量与累计时间本身应影响画面。
const changedTotal=clone();changedTotal.u.mode='total';changedTotal.m.total=12.34;
const changedTotalCanvas=makeCanvas();GRSProductionUI.renderCompact(changedTotal,changedTotalCanvas);
assert(changedTotalCanvas.dataset.frameCrc!==totalCanvas.dataset.frameCrc,'total dose value does not affect total page');
const changedElapsed=clone();changedElapsed.u.mode='total';changedElapsed.m.totalSec+=60;
const changedElapsedCanvas=makeCanvas();GRSProductionUI.renderCompact(changedElapsed,changedElapsedCanvas);
assert(changedElapsedCanvas.dataset.frameCrc!==totalCanvas.dataset.frameCrc,'total elapsed minutes do not affect total page');

console.log(JSON.stringify({rate:rateCanvas.dataset.frameCrc,total:totalCanvas.dataset.frameCrc,totalLabelPixels,elapsedPixels},null,2));

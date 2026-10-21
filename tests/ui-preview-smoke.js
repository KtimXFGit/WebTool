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
  'ui-preview.js'
]) vm.runInThisContext(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});

function assert(v,msg){if(!v)throw new Error(msg);}
const ctx={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},putImageData(){},imageSmoothingEnabled:false};
function canvas(){return {dataset:{},id:'test',getContext(){return ctx;}};}
function bit(buf,x,y){return (buf[(y>>3)*128+x]>>(y&7))&1;}
const base={
  m:{dose:8,measure:7,cps:0,cpm:8,pulses:12,elapsed:1000,raw:0,total:3.42,totalSec:94620,temp:24.6,rh:48,env:true,batt:3860,battLevel:3,alarm:false,gmFault:false,flags:0,algo:0,detect:0,history:Array.from({length:60},(_,i)=>i%4),avg:8,peak:17,time:new Date(2026,9,20,17,42,13),muted:false},
  s:{lang:'zh',threshold:250,backlightOn:true,backlight:80,autoSleep:true,keySound:true,keyVib:true,gmSound:true,alarmSound:true,alarmLight:true,alarmVib:true},
  u:{page:'monitor',mode:'rate',sel:0,first:0,edit:false,sub:null,subSel:0,hint:0},
  c:{connected:false,info:null,res:null}
};
function clone(){const s=structuredClone(base);s.m.time=new Date(base.m.time);return s;}
function compact(state){const c=canvas();const b=GRSProductionUI.renderCompact(state,c);return {buf:Uint8Array.from(b),crc:c.dataset.frameCrc};}

const normal=clone();
const a=compact(normal);
assert(a.buf.length===1024,'compact framebuffer must be 1024 bytes');
assert(/^[0-9a-f]{8}$/.test(a.crc),'compact CRC missing');
for(const [x,y] of [[0,10],[73,9],[127,30],[127,46]]) assert(bit(a.buf,x,y)===0,`divider pixel still present at ${x},${y}`);

// Home 图标所在中间标题栏区域保持空白。
for(let y=0;y<10;y++)for(let x=40;x<74;x++)
  assert(bit(a.buf,x,y)===0,`home/header icon residue at ${x},${y}`);

const timeChanged=clone();timeChanged.m.time=new Date(2030,1,2,3,4,59);assert(compact(timeChanged).crc===a.crc,'time unexpectedly affects compact UI');
const sameRoundedTemp=clone();sameRoundedTemp.m.temp=25.4;assert(compact(sameRoundedTemp).crc===a.crc,'same rounded temperature changed compact UI');
const changedTemp=clone();changedTemp.m.temp=26.1;assert(compact(changedTemp).crc!==a.crc,'integer temperature does not affect compact UI');
const alarm=clone();alarm.m.alarm=true;const usb=clone();usb.c.connected=true;const other=clone();Object.assign(other.m,{cps:99,cpm:5940,rh:99});
assert(compact(alarm).crc===a.crc,'alarm status still affects compact UI');
assert(compact(usb).crc===a.crc,'USB status still affects compact UI');
assert(compact(other).crc===a.crc,'CPS/CPM/RH still affect compact UI');

const dose=clone();dose.m.dose=206;const doseFrame=compact(dose);assert(doseFrame.crc!==a.crc,'dose value does not affect compact UI');
for(const [x,y] of [[3,40],[16,40],[3,44],[16,44],[3,48]]) assert(bit(a.buf,x,y)===0,`old stair gauge residue at ${x},${y}`);
assert(bit(a.buf,8,60)===1,'log range bar left endpoint missing');
assert(bit(a.buf,119,60)===1,'log range bar right endpoint missing');
for(const x of [8,27,45,64,82,101,119]) assert(bit(a.buf,x,58)===1,`decade tick missing at x=${x}`);
assert(bit(a.buf,8,61)===1,'left-clamped upward pointer apex missing');
assert(bit(a.buf,6,63)===1&&bit(a.buf,10,63)===1,'left-clamped upward pointer base missing');
let pointerFound=false;for(let x=30;x<=35;x++)pointerFound=pointerFound||bit(doseFrame.buf,x,61)===1;assert(pointerFound,'2.06 uSv/h pointer not in expected decade position');
let tinyLabelPixels=0;for(let y=52;y<=56;y++)for(let x=0;x<128;x++)tinyLabelPixels+=bit(a.buf,x,y);assert(tinyLabelPixels>10,'tiny log-range labels are missing');
for(let x=90;x<128;x++){
  assert(bit(a.buf,x,50)===0,`unit/log-label spacing lost at x=${x},y=50`);
  assert(bit(a.buf,x,51)===0,`unit/log-label spacing lost at x=${x},y=51`);
}
// 原右上 Dose 文本区域仍保持空白。
for(let y=12;y<=19;y++)for(let x=108;x<128;x++)
  assert(bit(a.buf,x,y)===0,`right-top Dose residue at ${x},${y}`);

// 主剂量率左侧新增两行 Dose / Rate 小字。
let doseRatePixels=0;for(let y=14;y<=36;y++)for(let x=0;x<28;x++)doseRatePixels+=bit(a.buf,x,y);assert(doseRatePixels>25,'Dose Rate left label missing');
// 主数字仍保持在主要视觉区域。
let mainPixels=0;for(let y=10;y<=42;y++)for(let x=24;x<116;x++)mainPixels+=bit(a.buf,x,y);assert(mainPixels>30,'main value missing after Dose Rate label layout');

// 顶部状态：左侧小号温度，右侧小号声音/灯光/振动和电池。
let tempPixels=0;for(let y=1;y<=6;y++)for(let x=1;x<24;x++)tempPixels+=bit(a.buf,x,y);assert(tempPixels>8,'tiny temperature missing');
let soundPixels=0;for(let y=1;y<=6;y++)for(let x=86;x<=91;x++)soundPixels+=bit(a.buf,x,y);assert(soundPixels>=8,'small sound icon missing');
let lightPixels=0;for(let y=1;y<=6;y++)for(let x=95;x<=100;x++)lightPixels+=bit(a.buf,x,y);assert(lightPixels>=8,'small light icon missing');
let vibPixels=0;for(let y=1;y<=6;y++)for(let x=104;x<=109;x++)vibPixels+=bit(a.buf,x,y);assert(vibPixels>=6,'small vibration icon missing');
for(let y=1;y<=6;y++)for(let x=20;x<34;x++)
  assert(bit(a.buf,x,y)===0,`old left battery residue at ${x},${y}`);
for(const x of [92,93,94,101,102,103,110,111,112,113])for(let y=1;y<=6;y++)
  assert(bit(a.buf,x,y)===0,`top icon spacing lost at ${x},${y}`);
for(const [x,y] of [[114,1],[125,1],[114,6],[125,6],[126,3],[126,4]]) assert(bit(a.buf,x,y)===1,`right battery pixel missing at ${x},${y}`);

console.log(JSON.stringify({compact:a.crc,changedTemp:compact(changedTemp).crc,dose206:doseFrame.crc},null,2));

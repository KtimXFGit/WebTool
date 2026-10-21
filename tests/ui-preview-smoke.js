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
const ctx={
  createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},
  putImageData(){},
  imageSmoothingEnabled:false
};
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

// 1) 原 Production 的主要分割线仍应移除；避开新主数字实际占用区域。
for(const [x,y] of [[0,10],[73,9],[127,30],[127,46]])
  assert(bit(a.buf,x,y)===0,`divider pixel still present at ${x},${y}`);

// 2) Home 图标所在中间标题栏区域保持空白。
for(let y=0;y<10;y++)for(let x=40;x<74;x++)
  assert(bit(a.buf,x,y)===0,`home/header icon residue at ${x},${y}`);

// 3) 顶部已改为整数温度，时间变化不应影响精简界面。
const timeChanged=clone();timeChanged.m.time=new Date(2030,1,2,3,4,59);
assert(compact(timeChanged).crc===a.crc,'time unexpectedly affects compact UI');

// 4) 24.6 -> 25°C；相同四舍五入结果不变，不同整数应改变。
const sameRoundedTemp=clone();sameRoundedTemp.m.temp=25.4;
assert(compact(sameRoundedTemp).crc===a.crc,'same rounded temperature changed compact UI');
const changedTemp=clone();changedTemp.m.temp=26.1;
assert(compact(changedTemp).crc!==a.crc,'integer temperature does not affect compact UI');

// 5) CPS/CPM/RH、STATUS/USB/表情仍不出现在精简界面。
const alarm=clone();alarm.m.alarm=true;
const usb=clone();usb.c.connected=true;
const other=clone();Object.assign(other.m,{cps:99,cpm:5940,rh:99});
assert(compact(alarm).crc===a.crc,'alarm status/face still affects compact UI');
assert(compact(usb).crc===a.crc,'USB status still affects compact UI');
assert(compact(other).crc===a.crc,'CPS/CPM/RH still affect compact UI');

// 6) 剂量率本身必须改变大号数字及对数量级指针位置。
const dose=clone();dose.m.dose=206; // 2.06 uSv/h
const doseFrame=compact(dose);
assert(doseFrame.crc!==a.crc,'dose value does not affect compact UI');

// 7) 旧左侧阶梯条已删除。
for(const [x,y] of [[3,24],[16,24],[3,28],[3,40],[3,52]])
  assert(bit(a.buf,x,y)===0,`old stair gauge residue at ${x},${y}`);

// 8) 底部对数量级横条位于 y=60，范围端点 x=8 与 x=119。
assert(bit(a.buf,8,60)===1,'log range bar left endpoint missing');
assert(bit(a.buf,119,60)===1,'log range bar right endpoint missing');

// decade 刻度：0.1u / 1u / 10u / 100u / 1m / 10m / 100m。
for(const x of [8,27,45,64,82,101,119])
  assert(bit(a.buf,x,58)===1,`decade tick missing at x=${x}`);

// 0.08 uSv/h 低于量程下限，指针应在横线下方并钳位到最左端。
assert(bit(a.buf,6,61)===1&&bit(a.buf,10,61)===1,'left-clamped log pointer top missing');
assert(bit(a.buf,8,63)===1,'left-clamped log pointer apex missing');

// 2.06 uSv/h 应位于 1u 与 10u 两个 decade 之间，约 x=32；指针尖端在 y=63。
let pointerFound=false;
for(let x=30;x<=35;x++)pointerFound=pointerFound||bit(doseFrame.buf,x,63)===1;
assert(pointerFound,'2.06 uSv/h log pointer is not in expected decade position');

// 9) 量程标签采用 3×5 微型点阵，位于横线上方 y=52..56；主单位与标签间保留空行。
let tinyLabelPixels=0;
for(let y=52;y<=56;y++)for(let x=0;x<128;x++)tinyLabelPixels+=bit(a.buf,x,y);
assert(tinyLabelPixels>10,'tiny log-range labels are missing');
for(let x=90;x<128;x++){
  assert(bit(a.buf,x,50)===0,`unit/log-label spacing lost at x=${x},y=50`);
  assert(bit(a.buf,x,51)===0,`unit/log-label spacing lost at x=${x},y=51`);
}

// 10) Dose 已完全移除：原右上 Dose 文本区域必须保持空白。
for(let y=12;y<=19;y++)for(let x=108;x<128;x++)
  assert(bit(a.buf,x,y)===0,`Dose residue at ${x},${y}`);

// 11) 主读数为底部量级条让位后上移，中心区域应在 y=10..42 内有足够像素。
let mainPixels=0;
for(let y=10;y<=42;y++)for(let x=18;x<110;x++)mainPixels+=bit(a.buf,x,y);
assert(mainPixels>30,'main value missing after log-range layout change');

console.log(JSON.stringify({compact:a.crc,changedTemp:compact(changedTemp).crc,dose206:doseFrame.crc},null,2));

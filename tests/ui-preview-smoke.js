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

// 1) 主界面原分割线位置应为空。
for(const [x,y] of [[0,10],[51,10],[73,9],[91,20],[92,30],[28,46],[58,46],[91,46]])
  assert(bit(a.buf,x,y)===0,`divider pixel still present at ${x},${y}`);

// 2) Home 图标所在中间标题栏区域保持空白。
for(let y=0;y<10;y++)for(let x=40;x<74;x++)
  assert(bit(a.buf,x,y)===0,`home/header icon residue at ${x},${y}`);

// 3) 秒数变化不能改变精简界面；只显示 HH:MM。
const secChanged=clone();secChanged.m.time.setSeconds(59);
assert(compact(secChanged).crc===a.crc,'seconds unexpectedly affect compact UI');

// 4) STATUS/USB/表情、CPS/CPM/温湿度被移除，因此这些状态变化不应改变 framebuffer。
const alarm=clone();alarm.m.alarm=true;
const usb=clone();usb.c.connected=true;
const env=clone();Object.assign(env.m,{cps:99,cpm:5940,temp:-12.3,rh:99,env:true});
assert(compact(alarm).crc===a.crc,'alarm status/face still affects compact UI');
assert(compact(usb).crc===a.crc,'USB status still affects compact UI');
assert(compact(env).crc===a.crc,'CPS/CPM/environment still affects compact UI');

// 5) Dose 本身变化必须改变 framebuffer。
const dose=clone();dose.m.dose=1234;
assert(compact(dose).crc!==a.crc,'dose value does not affect compact UI');

console.log(JSON.stringify({compact:a.crc,changedDose:compact(dose).crc},null,2));

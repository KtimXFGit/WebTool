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
  'ui-label-5x7.js',
  'ui-redesign-v3.js'
])vm.runInThisContext(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});

function assert(v,msg){if(!v)throw new Error(msg);}
const ctx={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},putImageData(){},imageSmoothingEnabled:false};
function canvas(){return {dataset:{},id:'test',getContext(){return ctx;}};}
function bit(buf,x,y){return (buf[(y>>3)*128+x]>>(y&7))&1;}
const base={
  m:{dose:8,measure:7,cps:4,cpm:240,pulses:12,total:3.42,totalSec:94620,temp:25.2,rh:48,env:true,battLevel:3,avg:160,peak:9800,time:new Date(2026,9,21,14,34,56),muted:false,doseHistory:Array.from({length:60},(_,i)=>Math.round(Math.pow(10,-.7+3.8*(.5+.5*Math.sin(i/8)))*100))},
  s:{lang:'zh',threshold:250,backlightOn:true,backlight:80,autoSleep:true,keySound:true,keyVib:true,gmSound:true,alarmSound:true,alarmLight:true,alarmVib:true},
  u:{page:'monitor',mode:'rate',sel:0,first:0,edit:false,sub:null,subSel:0,hint:0},
  c:{connected:false}
};
function clone(x=base){const q=structuredClone(x);q.m.time=new Date(x.m.time);return q;}
function render(s){const c=canvas(),b=Uint8Array.from(GRSProductionUI.renderRedesign(s,c));return {buf:b,crc:c.dataset.frameCrc};}

const rate=render(clone());
assert(rate.buf.length===1024,'rate framebuffer size');
let q=clone();q.m.time=new Date(2026,9,21,14,34,1);assert(render(q).crc===rate.crc,'rate seconds must not change HH:MM header');
q=clone();q.m.time=new Date(2026,9,21,14,35,1);assert(render(q).crc!==rate.crc,'rate minute must change header');
q=clone();q.m.temp=31;q.m.rh=70;assert(render(q).crc===rate.crc,'rate header must not show environment');
for(const v of [8,160,1040,9990,99900,160000]){q=clone();q.m.dose=v;assert(render(q).buf.length===1024,`rate boundary render failed ${v}`);}

let total=clone();total.u.mode='total';total.m.total=3420;const totalFrame=render(total);
q=clone(total);q.m.time=new Date(2031,1,2,5,55,0);assert(render(q).crc===totalFrame.crc,'Total header must not show time');
q=clone(total);q.m.temp=31;assert(render(q).crc!==totalFrame.crc,'Total temperature missing');
q=clone(total);q.m.rh=66;assert(render(q).crc!==totalFrame.crc,'Total humidity missing');
for(const v of [0,999,1000,999000,1000000,999000000,9999000000]){q=clone();q.u.mode='total';q.m.total=v;assert(render(q).buf.length===1024,`total boundary render failed ${v}`);}
q=clone();q.u.mode='total';q.m.total=9999000000;const totalInfo=GRSProductionUI.formatTotal(q.m.total);assert(totalInfo.value==='9999'&&totalInfo.unit==='Sv','9999 Sv formatting');assert(GRSProductionUI.redesignDebug.totalFace(totalInfo)===GRSProductionUI.FACE.TIMR24,'9999 Sv must switch to smaller font');
q.m.totalSec=9999*86400+23*3600+59*60;const extreme=render(q);let bottomPixels=0;for(let y=56;y<64;y++)for(let x=0;x<128;x++)bottomPixels+=bit(extreme.buf,x,y);assert(bottomPixels>30,'wide D/H/M row missing');

assert(GRSProductionUI.redesignDebug.shortDose(160)==='1.6u','short dose should render 1.6u');
assert(GRSProductionUI.redesignDebug.logY(10)>GRSProductionUI.redesignDebug.logY(1000),'log Y mapping must rise with dose');
q=clone();q.u.page='trend';const trend=render(q);assert(trend.buf.length===1024,'trend render failed');

q=clone();q.u.page='settings';q.u.sel=0;q.u.first=0;const settingsTop=render(q);q=clone();q.u.page='settings';q.u.sel=16;q.u.first=13;const settingsBottom=render(q);assert(settingsTop.crc!==settingsBottom.crc,'settings slider/thumb does not move');
assert(GRSProductionUI.redesignDebug.tests.some(x=>x[0]==='t9999s'),'9999 Sv display test missing');
assert(GRSProductionUI.redesignDebug.tests.some(x=>x[0]==='trend'),'trend display test missing');

console.log(JSON.stringify({rate:rate.crc,total:totalFrame.crc,totalExtreme:extreme.crc,trend:trend.crc,short:GRSProductionUI.redesignDebug.shortDose(160)},null,2));

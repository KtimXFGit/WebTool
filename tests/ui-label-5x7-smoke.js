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
const canvas={dataset:{},id:'test',getContext(){return ctx;}};
const state={
  m:{dose:8,measure:7,cps:0,cpm:8,pulses:12,elapsed:1000,raw:0,total:0,totalSec:0,temp:24.6,rh:48,env:true,batt:3860,battLevel:3,alarm:false,gmFault:false,flags:0,algo:0,detect:0,history:Array(60).fill(0),avg:8,peak:8,time:new Date(),muted:false},
  s:{lang:'zh',threshold:250,backlightOn:true,backlight:80,autoSleep:true,keySound:true,keyVib:true,gmSound:true,alarmSound:true,alarmLight:true,alarmVib:true},
  u:{page:'monitor',mode:'rate',sel:0,first:0,edit:false,sub:null,subSel:0,hint:0},
  c:{connected:false}
};

const buf=Uint8Array.from(GRSProductionUI.renderCompact(state,canvas));
function bit(x,y){return (buf[(y>>3)*128+x]>>(y&7))&1;}

// Dose 中小写 s 位于 x=13..17；验证 U8g2 5x7 字形关键行，防止再次显示成 Doe。
for(const x of [14,15,16])assert(bit(x,18)===1,`Dose lowercase s top stroke missing at x=${x}`);
assert(bit(13,18)===0&&bit(17,18)===0,'Dose lowercase s width/pattern unexpected');
assert(bit(13,19)===1&&bit(14,19)===1,'Dose lowercase s second stroke missing');
assert(bit(15,20)===1&&bit(16,20)===1,'Dose lowercase s middle/right stroke missing');
assert(bit(13,21)===1&&bit(14,21)===1&&bit(15,21)===1,'Dose lowercase s bottom stroke missing');

let ratePixels=0;
for(let y=24;y<=30;y++)for(let x=3;x<23;x++)ratePixels+=bit(x,y);
assert(ratePixels>25,'Rate 5x7 label missing');

console.log(JSON.stringify({crc:canvas.dataset.frameCrc,ratePixels},null,2));

'use strict';
// Production glyph data must remain valid strict browser Base64 and render without any browser font APIs.
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
global.window=global;
for(const file of [
  'ui-resource/grs-ui-meta.js',
  'ui-resource/grs-ui-strings.js',
  'ui-resource/grs-ui-faces.js',
  'grs-production-ui.js'
]) vm.runInThisContext(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});

function assert(v,msg){if(!v)throw new Error(msg);}
assert(GRSUIMeta.glyph_count===280,'unexpected glyph count');
let actualGlyphs=0;
for(let i=0;i<8;i++){
  assert(GRSUIFaces[i]&&GRSUIFaces[i].glyphs,`missing face ${i}`);
  for(const [cp,r] of Object.entries(GRSUIFaces[i].glyphs)){
    actualGlyphs++;
    try{atob(r[5]);}catch(e){throw new Error(`invalid base64 face=${i} cp=${cp} data=${JSON.stringify(r[5])}: ${e.message}`);}
  }
}
assert(actualGlyphs===GRSUIMeta.glyph_count,`glyph count mismatch actual=${actualGlyphs}`);

const ctx={
  createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},
  putImageData(){},
  imageSmoothingEnabled:false
};
const canvas={dataset:{},getContext(){return ctx;}};
const base={
  m:{dose:8,measure:7,cps:0,cpm:8,pulses:12,elapsed:1000,raw:0,total:3.42,totalSec:94620,temp:24.6,rh:48,env:true,batt:3860,battLevel:3,alarm:false,gmFault:false,flags:0,algo:0,detect:0,history:Array.from({length:60},(_,i)=>i%4),avg:8,peak:17,time:new Date(2026,9,20,17,42,13),muted:false},
  s:{lang:'zh',threshold:250,backlightOn:true,backlight:80,autoSleep:true,keySound:true,keyVib:true,gmSound:true,alarmSound:true,alarmLight:true,alarmVib:true},
  u:{page:'monitor',mode:'rate',sel:0,first:0,edit:false,sub:null,subSel:0,hint:0},
  c:{connected:false,info:null,res:null}
};
function run(mut){const state=structuredClone(base);state.m.time=new Date(base.m.time);mut?.(state);const buf=GRSProductionUI.render(state,canvas);assert(buf.length===1024,'framebuffer must be 1024 bytes');assert(/^[0-9a-f]{8}$/.test(canvas.dataset.frameCrc),'missing frame CRC');return canvas.dataset.frameCrc;}
const main=run();
const total=run(s=>s.u.mode='total');
const trend=run(s=>s.u.page='trend');
const settingsZh=run(s=>s.u.page='settings');
const settingsEn=run(s=>{s.u.page='settings';s.s.lang='en';});
for(const [name,crc] of Object.entries({main,total,trend,settingsZh,settingsEn}))assert(crc!=='00000000',`${name} empty CRC`);
assert(new Set([main,total,trend,settingsZh,settingsEn]).size>=4,'frames unexpectedly identical');
console.log(JSON.stringify({glyphs:GRSUIMeta.glyph_count,main,total,trend,settingsZh,settingsEn},null,2));

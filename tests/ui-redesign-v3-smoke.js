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
function count(buf,x1,y1,x2,y2){let n=0;for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)n+=bit(buf,x,y);return n;}

const rate=render(clone());
assert(rate.buf.length===1024,'rate framebuffer size');
let q=clone();q.m.time=new Date(2026,9,21,14,34,1);assert(render(q).crc===rate.crc,'rate seconds must not change HH:MM header');
q=clone();q.m.time=new Date(2026,9,21,14,35,1);assert(render(q).crc!==rate.crc,'rate minute must change header');
q=clone();q.m.temp=31;q.m.rh=70;assert(render(q).crc===rate.crc,'rate header must not show environment');
for(const v of [8,160,1040,9990,99900,160000]){q=clone();q.m.dose=v;assert(render(q).buf.length===1024,`rate boundary render failed ${v}`);}
assert(count(rate.buf,2,14,24,31)===0,'old Dose/Rate label pixels remain');
const zeroGlyph=GRSUIFaces[8].glyphs[String('0'.codePointAt(0))];
const zeroBytes=Uint8Array.from(Buffer.from(zeroGlyph[5],'base64'));
assert(zeroGlyph[1]===32&&zeroBytes.length===64,'Logisoso32 zero glyph is not a full 16x32 bitmap');
assert(zeroBytes[62]!==0||zeroBytes[63]!==0,'Logisoso32 zero bottom row is blank/truncated');
const redesignSource=fs.readFileSync(path.join(root,'ui-redesign-v3.js'),'utf8');
assert(!redesignSource.includes('function drawRateUnit'),'custom rate-unit slash helper still present');
assert(redesignSource.includes("l.text(Math.max(0,126-uw),42,FACE.LATIN,rate.unit)"),'font-rendered rate unit missing');

let total=clone();total.u.mode='total';total.m.total=3420;const totalFrame=render(total);
q=clone(total);q.m.time=new Date(2031,1,2,5,55,0);assert(render(q).crc===totalFrame.crc,'Total header must not show time');
q=clone(total);q.m.temp=31;assert(render(q).crc!==totalFrame.crc,'Total temperature missing');
q=clone(total);q.m.rh=66;assert(render(q).crc!==totalFrame.crc,'Total humidity missing');
for(const v of [0,999,1000,999000,1000000,999000000,9999000000]){q=clone();q.u.mode='total';q.m.total=v;assert(render(q).buf.length===1024,`total boundary render failed ${v}`);}
assert(count(totalFrame.buf,2,14,24,28)===0,'old Total Dose label pixels remain');
q=clone();q.u.mode='total';q.m.total=9999000000;const totalInfo=GRSProductionUI.formatTotal(q.m.total);assert(totalInfo.value==='9999'&&totalInfo.unit==='Sv','9999 Sv formatting');assert(GRSProductionUI.redesignDebug.totalFace(totalInfo)===GRSProductionUI.FACE.TIMR24,'9999 Sv must switch to smaller font');
q.m.totalSec=9999*86400+23*3600+59*60;const extreme=render(q);let bottomPixels=0;for(let y=56;y<64;y++)for(let x=0;x<128;x++)bottomPixels+=bit(extreme.buf,x,y);assert(bottomPixels>30,'wide D/H/M row missing');

assert(GRSProductionUI.redesignDebug.shortDose(160)==='1.6u','short dose should render 1.6u');
assert(GRSProductionUI.redesignDebug.logY(10)>GRSProductionUI.redesignDebug.logY(1000),'log Y mapping must rise with dose');
q=clone();q.u.page='trend';const trend=render(q);assert(trend.buf.length===1024,'trend render failed');
assert(bit(trend.buf,22,53)===1&&bit(trend.buf,124,53)===1,'trend X axis no longer spans to the right boundary');
assert(bit(trend.buf,25,56)===1&&bit(trend.buf,75,56)===1&&bit(trend.buf,124,56)===1,'trend X major ticks are not downward-facing');
assert(count(trend.buf,22,58,28,62)>5,'trend 0S label missing');
assert(count(trend.buf,70,58,80,62)>8,'trend 30S label missing');
assert(count(trend.buf,113,58,124,62)>8,'trend 60S label missing');
for(const y of [5,19,33,47]) assert(bit(trend.buf,18,y)===1&&bit(trend.buf,22,y)===1,`trend left-facing Y tick missing at y=${y}`);
assert(count(trend.buf,0,3,14,9)>6,'trend 100m Y label missing');
assert(count(trend.buf,0,17,14,23)>3,'trend 1m Y label missing');
assert(count(trend.buf,0,31,14,37)>5,'trend 10u Y label missing');
assert(count(trend.buf,0,45,14,51)>5,'trend .1u Y label missing');
assert(bit(trend.buf,20,50)===1,'trend 0~.1u minor Y tick is missing');
const trendSource=redesignSource;
assert(trendSource.includes("const AX=22,L=25,R=124,T=5,Y_TOP=5,Y_LOW=47,B=53"),'trend plot geometry regressed');
assert(trendSource.includes("[10000000,'100m',5]")&&trendSource.includes("[10,'.1u',47]"),'trend evenly-spaced major Y ticks regressed');
assert(trendSource.includes("l.hline(AX-4,y,5)"),'trend Y major ticks are not left-facing');
assert(trendSource.includes("microRight(l,AX-7"),'trend Y labels are not on the left side of the axis');
assert(trendSource.includes("'0S'")&&trendSource.includes("'30S'")&&trendSource.includes("'60S'"),'trend X labels are missing seconds suffixes');
assert(trendSource.includes("const x0=L+Math.floor(b*PLOT_W/BUCKETS)")&&trendSource.includes("const x1=L+Math.floor((b+1)*PLOT_W/BUCKETS)-1"),'trend bars are no longer continuous bucket slots');
assert(!trendSource.includes("l.line(px,py,x,y)"),'old trend polyline rendering still present');
assert(trendSource.includes("const lowMinorY=Math.round((Y_LOW+B)/2)"),'trend low-range minor tick mapping regressed');
assert(trendSource.includes("frontText(30,1,'AVG'); frontText(49,1")&&trendSource.includes("frontText(80,8,'CPM'); frontText(99,8"),'trend statistic foreground spacing regressed');
assert(trendSource.includes("l.box(Math.max(0,x-1)"),'trend foreground text no longer clears the background bars');
let wideBar=false;
for(let y=16;y<53&&!wideBar;y++)for(let x=25;x<=122;x++)if(bit(trend.buf,x,y)&&bit(trend.buf,x+1,y)&&bit(trend.buf,x+2,y)){wideBar=true;break;}
assert(wideBar,'trend bars are still visually too thin');
assert(trendSource.includes("/2)-3);l.text(x,42,MAIN_FACE,rate.value)"),'Rate value left shift missing');
assert(trendSource.includes("/2)-3);l.text(x,base,face,total.value)"),'Total value left shift missing');

q=clone();q.u.page='settings';q.u.sel=0;q.u.first=0;const settingsTop=render(q);q=clone();q.u.page='settings';q.u.sel=16;q.u.first=13;const settingsBottom=render(q);assert(settingsTop.crc!==settingsBottom.crc,'settings slider/thumb does not move');
assert(GRSProductionUI.redesignDebug.tests.some(x=>x[0]==='t9999s'),'9999 Sv display test missing');
assert(GRSProductionUI.redesignDebug.tests.some(x=>x[0]==='trend'),'trend display test missing');

console.log(JSON.stringify({rate:rate.crc,total:totalFrame.crc,totalExtreme:extreme.crc,trend:trend.crc,short:GRSProductionUI.redesignDebug.shortDose(160)},null,2));
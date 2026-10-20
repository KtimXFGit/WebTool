(() => {
'use strict';

const W=128,H=64,PAGES=8;
const FACE={BODY:0,LATIN:1,ICON:2,PROFONT12:3,TIMR24:4,T0_11:5,HAX:6,SIX10:7};
const ICON={LEFT:0xE020,RIGHT:0xE021,SOUND:0xE030,LIGHT:0xE031,VIBRATION:0xE032,FACE_NORMAL:0xE033,HOME:0xE034,FACE_ALERT:0xE035,SETTINGS:0xE036,DATA:0xE037};
const IDS={LANGUAGE:0,ALARM_THRESHOLD:1,BACKLIGHT:2,DEVICE_INFO:3,CHINESE:4,ENGLISH:5,FIRMWARE:6,RESOURCE:7,SAVING:8,ON:9,OFF:10,HOLD:11,ALARM_SOUND:12,ALARM_LIGHT:13,ALARM_VIB:14,GM_SOUND:15,BACKLIGHT_SWITCH:16,DATE_TIME:17,KEY_SOUND:19,BACK:20,CONFIRM:21,CANCEL:22,TOTAL_DOSE:23,CLEAR:24,SAVE_FAILED:25,AUTO_SLEEP:26,LOW_BATTERY:27,PLEASE_CHARGE:28,BATTERY_CRITICAL:29,SHUTDOWN:30,LIMIT:31,UNKNOWN:33,DATA:34,ALARM_LOG:35,CLEAR_LOG:36,NO_RECORDS:37,LOADING:38,CLEARING:39,CLEAR_FAILED:40,DATE:41,TYPE:42,RATE:43,CPS:44,STATE:45,MAIN_DOSE:46,MAIN_TOTAL:47,MAIN_STATUS:48,MAIN_ALARM:49,MAIN_GM_ERROR:50,MAIN_USB:51,MAIN_NORMAL:52,MAIN_CPS:53,MAIN_CPM:54,MAIN_TEMP:55,MAIN_RH:56,DAY:68,HOUR:69,MINUTE:70,SAVE_CHANGES:71,KEY_VIB:65,RESTORE:66,RETURN_HOME:67};
const SETTINGS_LABELS=[IDS.LANGUAGE,IDS.ALARM_THRESHOLD,IDS.BACKLIGHT_SWITCH,IDS.BACKLIGHT,IDS.AUTO_SLEEP,IDS.KEY_SOUND,IDS.KEY_VIB,IDS.GM_SOUND,IDS.ALARM_SOUND,IDS.ALARM_LIGHT,IDS.ALARM_VIB,IDS.DATE_TIME,IDS.TOTAL_DOSE,IDS.DATA,IDS.DEVICE_INFO,IDS.RESTORE,IDS.RETURN_HOME];
const TOTAL_LABELS=[IDS.CLEAR,IDS.LIMIT,IDS.BACK];
const DATA_LABELS=[IDS.ALARM_LOG,IDS.CLEAR_LOG,IDS.BACK];
const b64cache=new Map();

function decode64(s){
  if(!s)return new Uint8Array(0);
  let v=b64cache.get(s); if(v)return v;
  const raw=atob(s); v=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)v[i]=raw.charCodeAt(i);
  b64cache.set(s,v); return v;
}
function trunc(v){return v<0?Math.ceil(v):Math.floor(v);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

class LCD {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.buf=new Uint8Array(W*PAGES);this.fg=[21,33,22];this.bg=[217,229,181];}
  clear(){this.buf.fill(0);}
  pixel(x,y,c=1){x=trunc(x);y=trunc(y);if(x<0||x>=W||y<0||y>=H)return;const i=(y>>3)*W+x,m=1<<(y&7);if(c)this.buf[i]|=m;else this.buf[i]&=~m;}
  hline(x,y,n,c=1){for(let i=0;i<n;i++)this.pixel(x+i,y,c);}
  vline(x,y,n,c=1){for(let i=0;i<n;i++)this.pixel(x,y+i,c);}
  frame(x,y,w,h,c=1){if(w<=0||h<=0)return;this.hline(x,y,w,c);this.hline(x,y+h-1,w,c);this.vline(x,y,h,c);this.vline(x+w-1,y,h,c);}
  box(x,y,w,h,c=1){for(let yy=0;yy<h;yy++)this.hline(x,y+yy,w,c);}
  line(x0,y0,x1,y1,c=1){x0=trunc(x0);y0=trunc(y0);x1=trunc(x1);y1=trunc(y1);const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let e=dx+dy;for(;;){this.pixel(x0,y0,c);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
  resolveFace(face,cp){if(face===FACE.BODY&&cp<0x80)return FACE.LATIN;return face;}
  glyphRecord(face,cp){face=this.resolveFace(face,cp);let f=window.GRSUIFaces?.[face],r=f?.glyphs?.[String(cp)];if(!r&&cp!==63){f=window.GRSUIFaces?.[this.resolveFace(face,63)];r=f?.glyphs?.['63'];}return r?{face,r}:null;}
  glyph(x,y,face,cp){const q=this.glyphRecord(face,cp);if(!q)return 0;const [w,h,adv,xo,yo,b64]=q.r,data=decode64(b64),stride=(w+7)>>3;for(let row=0;row<h;row++)for(let col=0;col<w;col++)if(data[row*stride+(col>>3)]&(0x80>>(col&7)))this.pixel(x+xo+col,y+yo+row,1);return adv;}
  width(face,text){let n=0;for(const ch of String(text)){const q=this.glyphRecord(face,ch.codePointAt(0));if(q)n+=q.r[2];}return n;}
  text(x,y,face,text){let p=x;for(const ch of String(text))p+=this.glyph(p,y,face,ch.codePointAt(0));return p-x;}
  string(id,lang){const table=lang==='en'?window.GRSUIStrings.en:window.GRSUIStrings.zh;return table?.[String(id)]??'';}
  textId(x,y,face,id,lang){return this.text(x,y,face,this.string(id,lang));}
  textIdWidth(face,id,lang){return this.width(face,this.string(id,lang));}
  centerText(left,width,y,face,text){const tw=this.width(face,text),x=tw<width?left+trunc((width-tw)/2):left;this.text(x,y,face,text);}
  centerId(left,width,y,face,id,lang){this.centerText(left,width,y,face,this.string(id,lang));}
  present(){const img=this.ctx.createImageData(W,H),d=img.data;let k=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const on=(this.buf[(y>>3)*W+x]>>(y&7))&1,a=on?this.fg:this.bg;d[k++]=a[0];d[k++]=a[1];d[k++]=a[2];d[k++]=255;}this.ctx.imageSmoothingEnabled=false;this.ctx.putImageData(img,0,0);}
  crc32(){let crc=0xffffffff;for(const b of this.buf){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
}

function formatCompactCenti(v){v=Math.max(0,Math.floor(v));if(v<1000)return `${Math.floor(v/100)}.${String(v%100).padStart(2,'0')}`;if(v<9995){const t=Math.floor((v+5)/10);return `${Math.floor(t/10)}.${t%10}`;}return String(Math.floor((v+50)/100));}
function formatDoseRate(centi){centi=Math.max(0,Math.floor(centi));if(centi>=99950)return {value:formatCompactCenti(Math.floor((centi+500)/1000)),unit:'mSv/h'};return {value:formatCompactCenti(centi),unit:'uSv/h'};}
function totalParts(usv){let totalNsv=Math.max(0,Math.round((Number(usv)||0)*1000));const msv=Math.floor(totalNsv/1000000);return {msv,nsv:totalNsv-msv*1000000};}
function formatTotal(usv){const a=totalParts(usv);if(a.msv>=999000)return {value:String(Math.min(9999,Math.floor(a.msv/1000))),unit:'Sv'};if(a.msv>=999)return {value:formatCompactCenti(Math.floor((a.msv+5)/10)),unit:'Sv'};if(a.msv>=1||a.nsv>=999000)return {value:formatCompactCenti(a.msv*100+Math.floor((a.nsv+5000)/10000)),unit:'mSv'};return {value:formatCompactCenti(Math.floor(a.nsv/10)),unit:'uSv'};}
function two(v){return String(Math.floor(v)).padStart(2,'0');}
function timeHMS(d){return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;}
function dateYMD(d){return `${String(d.getFullYear()).padStart(4,'0')}-${two(d.getMonth()+1)}-${two(d.getDate())}`;}
function version8(v){return v==null?'00000000':(Number(v)>>>0).toString(16).toUpperCase().padStart(8,'0');}
function fixed1(v){const n=Math.round(Number(v)*1000),neg=n<0,a=Math.abs(n);return `${neg?'-':''}${Math.floor(a/1000)}.${Math.floor((a%1000)/100)}`;}

function langOf(s){return s.lang==='en'?'en':'zh';}
function header(l,m,s,centerIcon){const lang=langOf(s);l.hline(0,10,128);l.vline(51,0,11);l.vline(73,0,10);l.text(1,9,FACE.PROFONT12,timeHMS(m.time instanceof Date?m.time:new Date()));if(centerIcon)l.glyph(58,0,FACE.ICON,centerIcon);if(s.alarmSound){l.glyph(76,1,FACE.ICON,ICON.SOUND);if(m.muted){l.box(82,1,4,8,0);l.line(82,2,85,6);l.line(85,2,82,6);}}if(s.alarmLight)l.glyph(90,1,FACE.ICON,ICON.LIGHT);if(s.alarmVib)l.glyph(103,1,FACE.ICON,ICON.VIBRATION);l.frame(113,2,12,6);l.pixel(125,4);l.pixel(125,5);const level=clamp(m.battLevel??0,0,3);for(let bar=0;bar<level;bar++)l.box(115+bar*3,4,2,2);return lang;}
function drawHold(l,s){const lang=langOf(s),face=lang==='en'?FACE.LATIN:FACE.BODY,text=l.string(IDS.HOLD,lang),w=l.width(face,text),bw=Math.min(124,w+8),x=trunc((128-bw)/2);l.box(x,23,bw,19,0);l.frame(x,23,bw,19);l.centerText(x,bw,face===FACE.BODY?26:29,face,text);}

function monitor(l,m,s,u,c){const lang=header(l,m,s,ICON.HOME),isTotal=u.mode==='total',total=formatTotal(m.total),rate=formatDoseRate(m.dose),p=isTotal?total:rate,parts=totalParts(m.total),wide=isTotal&&parts.msv>=999000,valueRight=wide?72:58,vw=l.width(FACE.TIMR24,p.value);l.text(vw<valueRight?valueRight-vw:0,40,FACE.TIMR24,p.value);l.text(wide?76:61,44,FACE.T0_11,p.unit);if(!wide)l.textId(isTotal?60:66,22,FACE.SIX10,isTotal?IDS.MAIN_TOTAL:IDS.MAIN_DOSE,lang);
  l.vline(91,10,37);l.hline(92,20,36);l.hline(92,30,36);l.frame(95,32,31,13);l.centerId(93,35,19,FACE.SIX10,IDS.MAIN_STATUS,lang);
  let status=IDS.MAIN_NORMAL;if(m.alarm)status=IDS.MAIN_ALARM;else if(m.gmFault)status=IDS.MAIN_GM_ERROR;else if(c.connected)status=IDS.MAIN_USB;else if(wide)status=IDS.MAIN_TOTAL;l.centerId(status===IDS.MAIN_NORMAL?93:92,36,29,FACE.SIX10,status,lang);l.glyph(m.dose>=s.threshold?98:99,m.dose>=s.threshold?34:35,FACE.ICON,m.dose>=s.threshold?ICON.FACE_ALERT:ICON.FACE_NORMAL);
  l.hline(0,46,128);if(isTotal){const centers=[21,64,106],labels=[IDS.DAY,IDS.HOUR,IDS.MINUTE],elapsed=Math.max(0,Math.floor(m.totalSec||0)),vals=[Math.floor(elapsed/86400),Math.floor(elapsed/3600)%24,Math.floor(elapsed/60)%60];for(let i=0;i<3;i++){const label=l.string(labels[i],lang),lw=l.width(FACE.HAX,label);l.text(centers[i]-trunc(lw/2),55,FACE.HAX,label);const v=i&&vals[i]<10?`0${vals[i]}`:String(vals[i]),ww=l.width(FACE.HAX,v);l.text(centers[i]-trunc(ww/2),64,FACE.HAX,v);}}
  else{l.vline(28,46,18);l.vline(58,47,17);l.vline(91,47,17);l.textId(5,55,FACE.HAX,IDS.MAIN_CPS,lang);l.textId(34,55,FACE.HAX,IDS.MAIN_CPM,lang);l.textId(63,55,FACE.HAX,IDS.MAIN_TEMP,lang);l.textId(105,55,FACE.HAX,IDS.MAIN_RH,lang);l.text(11,64,FACE.HAX,String(Math.max(0,Math.floor(m.cps||0))));l.text(39,64,FACE.HAX,String(Math.max(0,Math.floor(m.cpm||0))));const temp=m.env?fixed1(m.temp):'--.-';l.text(66,64,FACE.HAX,temp);if(m.env){const tw=l.width(FACE.HAX,temp);if(tw<62)l.frame(66+tw,57,3,3);}const rh=m.env?`${Math.floor(m.rh||0)}%`:'--%';l.text(102,64,FACE.HAX,rh);}
  if(Date.now()<(u.hint||0))drawHold(l,s);
}

function trendScale(m,h){if(Number.isFinite(m.trendScale)&&m.trendScale>0)return Math.floor(m.trendScale);const mx=Math.max(0,...h);return Math.max(5,Math.ceil(mx/5)*5);}
function historyY(v,scale){if(!scale)scale=5;if(v>=scale)return 4;let height=Math.floor((v*50)/scale);if(height>50)height=50;return 54-height;}
function trend(l,m){const h=(m.history||[]).slice(-60).map(v=>Math.max(0,Math.floor(v))),scale=trendScale(m,h),third=Math.floor(scale/3);const axis=(baseline,v)=>l.text(7,baseline-6,FACE.LATIN,String(v));axis(8,scale);axis(25,third*2);axis(42,third);l.vline(1,4,51);l.hline(1,54,121);[4,21,38,54].forEach(y=>l.hline(1,y,5));[10,14,27,31,44,48].forEach(y=>l.hline(1,y,3));[16,66,116].forEach(x=>l.vline(x,54,2));if(h.length){let px=121-Math.floor(((h.length-1)*105)/59),py=historyY(h[0],scale);if(h.length===1)l.pixel(px,py);for(let i=1;i<h.length;i++){const x=121-Math.floor(((h.length-1-i)*105)/59),y=historyY(h[i],scale);l.line(px,py,x,y);px=x;py=y;}}
  const centerTick=(x,t)=>{const w=l.width(FACE.LATIN,t);l.text(x-trunc(w/2),57,FACE.LATIN,t);};centerTick(16,'0S');centerTick(66,'30S');centerTick(116,'60S');const right=(baseline,text)=>{const w=l.width(FACE.LATIN,text);l.text(w<128?128-w:0,baseline-6,FACE.LATIN,text);};const a=formatDoseRate(m.avg||0),p=formatDoseRate(m.peak||0);right(7,`Avg ${a.value}${a.unit}`);right(15,`Max ${p.value}${p.unit}`);right(23,`RT ${Math.max(0,Math.floor(m.cps||0))} CPS`);
}

function selection(l,y){l.line(7,y+2,10,y+5);l.line(10,y+5,7,y+8);}
function scrollbar(l,selected,count){if(count<=1)return;const travel=43,ty=12+Math.floor((selected*travel)/(count-1)),lower=ty+8,bottom=63;if(ty>12)l.vline(2,12,ty-12);l.box(0,ty,5,8);if(lower<bottom)l.vline(2,lower,bottom-lower);}
function settingValueX(width){return 98-trunc(width/2);}
function editArrows(l,y,x,w){let lx=x-2-5,rx=x+w+2;if(lx<12)lx=12;if(rx>122)rx=122;l.glyph(lx,y+3,FACE.ICON,ICON.RIGHT);l.glyph(rx,y+3,FACE.ICON,ICON.LEFT);}
function settingTextValue(l,y,face,id,lang){const t=l.string(id,lang),w=l.width(face,t),x=settingValueX(w);l.text(x,y,face,t);return {x,w};}
function settingUtf8Value(l,y,text){const w=l.width(FACE.LATIN,text),x=settingValueX(w);l.text(x,y,FACE.LATIN,text);return {x,w};}
function settingsFlag(s,i){const map={2:'backlightOn',4:'autoSleep',5:'keySound',6:'keyVib',7:'gmSound',8:'alarmSound',9:'alarmLight',10:'alarmVib'};return map[i]===undefined?null:!!s[map[i]];}
function formatThreshold(centi){const d=formatDoseRate(centi);return `${d.value}${d.unit}`;}

function deviceInfo(l,m,s,c){const lang=header(l,m,s,ICON.SETTINGS),face=lang==='en'?FACE.LATIN:FACE.BODY,rows=[[IDS.FIRMWARE,c.info?version8(c.info.applicationVersion):'SIM'],[IDS.RESOURCE,c.res?version8(c.res.activeVersion):'SIM']];rows.forEach((r,i)=>{const y=13+i*13,vy=y+(face===FACE.LATIN?2:0);l.textId(7,vy,face,r[0],lang);const w=l.width(face,r[1]);l.text(124-w,y+2,face,r[1]);});}
function datetime(l,m,s){const lang=header(l,m,s,ICON.SETTINGS);l.centerId(0,128,14,FACE.BODY,IDS.DATE_TIME,lang);const d=m.time instanceof Date?m.time:new Date();l.text(34,32,FACE.LATIN,dateYMD(d));l.text(40,48,FACE.LATIN,timeHMS(d));l.frame(33,28,26,14);}
function settings(l,m,s,u,c){if(u.sub==='device'){deviceInfo(l,m,s,c);return;}if(u.sub==='datetime'){datetime(l,m,s);return;}const lang=header(l,m,s,ICON.SETTINGS),face=lang==='en'?FACE.LATIN:FACE.BODY,total=u.sub==='total',data=u.sub==='data',selected=total||data?(u.subSel||0):(u.sel||0),labels=total?TOTAL_LABELS:data?DATA_LABELS:SETTINGS_LABELS,count=labels.length;if(!total&&!data)scrollbar(l,selected,17);let first=total||data?0:(u.first||0);if(!total&&!data&&first>13)first=13;
  for(let row=0;row<4;row++){const item=first+row;if(item>=count)break;const y=12+row*13,textY=y+(face===FACE.LATIN?2:0);if(!total&&!data&&u.edit&&item===selected&&item===1){const value=formatThreshold(s.threshold),w=l.width(FACE.LATIN,value),x=8+trunc((112-w)/2);l.frame(8,y,112,12);l.text(x,y+2,FACE.LATIN,value);continue;}if(item===selected)selection(l,y);const id=labels[item],lw=l.textIdWidth(face,id,lang),lx=Math.max(12,43-trunc(lw/2));l.textId(lx,textY,face,id,lang);
    if(data){if(item===0)settingUtf8Value(l,y+2,'0');else l.glyph(120,y+3,FACE.ICON,ICON.RIGHT);continue;}if(total){if(item===1){const p=formatTotal(s.totalThreshold||100),v=`${p.value}${p.unit}`;settingUtf8Value(l,y+2,v);}else l.glyph(120,y+3,FACE.ICON,ICON.RIGHT);continue;}
    let q=null,editable=true;if(item===0)q=settingTextValue(l,textY,face,s.lang==='en'?IDS.ENGLISH:IDS.CHINESE,lang);else if(item===1)q=settingUtf8Value(l,y+2,formatThreshold(s.threshold));else if(item===3){if(item===selected&&u.edit){l.frame(80,y+2,36,8);const fill=Math.floor((s.backlight*(34))/100);if(fill)l.box(81,y+3,fill,6);editArrows(l,y,80,36);editable=false;}else q=settingUtf8Value(l,y+2,`${s.backlight}%`);}else{const flag=settingsFlag(s,item);if(flag!==null)q=settingTextValue(l,textY,face,flag?IDS.ON:IDS.OFF,lang);else{editable=false;l.glyph(120,y+3,FACE.ICON,ICON.RIGHT);}}if(item===selected&&u.edit&&editable&&q)editArrows(l,y,q.x,q.w);
  }
}

function render(state,canvas){if(!window.GRSUIFaces||!window.GRSUIStrings)throw new Error('GRS Production UI resource is not loaded');const l=canvas.__grsExactLCD||(canvas.__grsExactLCD=new LCD(canvas));l.clear();const {m,s,u,c}=state;if(u.page==='trend')trend(l,m);else if(u.page==='settings')settings(l,m,s,u,c);else monitor(l,m,s,u,c);l.present();canvas.dataset.frameCrc=l.crc32().toString(16).padStart(8,'0');return l.buf;}

window.GRSProductionUI={render,FACE,ICON,IDS,createLCD:canvas=>new LCD(canvas),formatDoseRate,formatTotal};
})();

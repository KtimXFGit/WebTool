(() => {
'use strict';

const UI=window.GRSProductionUI;
if(!UI)return;
const {FACE,ICON,IDS}=UI;
const MAIN_FACE=8;
const SMALL_TOTAL_FACE=FACE.TIMR24;
const prevRender=UI.render;

// 修正精简主读数字体中的 0：原预览子集只携带了 29 行有效位图，
// 其余数字为完整 32 行，导致 0 在 0.08 / 0.16 等值中明显偏矮。
// 保持原 20 px advance 和 16 px glyph width，只补齐到 32 行视觉高度。
const FIXED_ZERO_B64='B+Af+D/8f/58Pvgf+B/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/4H/gffD5//j/8H/gH4A==';
if(window.GRSUIFaces?.[MAIN_FACE]?.glyphs?.['48']){
  window.GRSUIFaces[MAIN_FACE].glyphs['48']=[16,32,20,2,-32,FIXED_ZERO_B64];
}
let testSelect=null;
let lastBaseState=null;
const liveDoseHistory=[];
let lastSampleKey=null;

const MICRO={
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'],'3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'],'7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
  '.':['000','000','000','000','010'],':':['000','010','000','010','000'],
  '-':['000','000','111','000','000'],'%':['101','001','010','100','101'],
  'u':['000','000','101','101','111'],'m':['000','000','111','111','101'],
  's':['000','000','111','110','111'],'D':['110','101','101','101','110'],
  'H':['101','101','111','101','101'],'M':['101','111','111','101','101'],
  'A':['010','101','111','101','101'],'X':['101','101','010','101','101'],
  'C':['111','100','100','100','111'],'P':['110','101','110','100','100'],
  'R':['110','101','110','101','101'],'S':['011','100','010','001','110'],
  'V':['101','101','101','101','010'],'G':['111','100','101','101','111'],
  'L':['100','100','100','100','111'],'T':['111','010','010','010','010'],
  'E':['111','100','110','100','111'],'I':['111','010','010','010','111'],
  'N':['101','111','111','111','101'],'O':['111','101','101','101','111'],
  'B':['110','101','110','101','110'],'F':['111','100','110','100','100'],
  ' ':['000','000','000','000','000']
};
const LABEL5X7={
  'D':['11100','10010','10010','10010','10010','11100','00000'],
  'R':['11100','10010','10010','11100','10100','10010','00000'],
  'a':['00000','00000','01110','10010','10110','01010','00000'],
  'e':['00000','00000','01100','10110','11000','01100','00000'],
  'o':['00000','00000','01100','10010','10010','01100','00000'],
  's':['00000','00000','01110','11000','00110','11100','00000'],
  't':['01000','01000','11100','01000','01000','00110','00000']
};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function trunc(v){return v<0?Math.ceil(v):Math.floor(v);}
function two(v){return String(Math.floor(v)).padStart(2,'0');}
function microWidth(text){return Math.max(0,String(text).length*4-1);}
function microText(l,x,y,text){let px=x;for(const ch of String(text)){const rows=MICRO[ch]||MICRO[' '];for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++)if(rows[yy][xx]==='1')l.pixel(px+xx,y+yy);px+=4;}return px-x;}
function microRight(l,right,y,text){const w=microWidth(text);microText(l,right-w,y,text);}
function labelText(l,x,y,text){let px=x;for(const ch of String(text)){const rows=LABEL5X7[ch];if(rows)for(let yy=0;yy<7;yy++)for(let xx=0;xx<5;xx++)if(rows[yy][xx]==='1')l.pixel(px+xx,y+yy);px+=5;}return px-x;}
function solidTriangle(l,x,y){
  const widths=[1,2,3,4,3,2,1];
  for(let row=0;row<7;row++)l.hline(x,y+row,widths[row]);
}
function rightChevron(l,x,y){l.line(x,y,x+3,y+3);l.line(x+3,y+3,x,y+6);}

function drawStatusIcons(l,m,s){
  if(s.alarmSound){l.glyph(76,1,FACE.ICON,ICON.SOUND);if(m.muted){l.box(82,1,4,8,0);l.line(82,2,85,6);l.line(85,2,82,6);}}
  if(s.alarmLight)l.glyph(90,1,FACE.ICON,ICON.LIGHT);
  if(s.alarmVib)l.glyph(103,1,FACE.ICON,ICON.VIBRATION);
  l.frame(113,2,12,6);l.pixel(125,4);l.pixel(125,5);
  const level=clamp(m.battLevel??0,0,3);for(let bar=0;bar<level;bar++)l.box(115+bar*3,4,2,2);
}
function drawTimeHeader(l,m,s){const d=m.time instanceof Date?m.time:new Date();l.text(1,9,FACE.PROFONT12,`${two(d.getHours())}:${two(d.getMinutes())}`);drawStatusIcons(l,m,s);}
function drawEnvHeader(l,m,s){
  const valid=m.env&&Number.isFinite(Number(m.temp));
  const t=valid?String(clamp(Math.round(Number(m.temp)),-99,199)):'--';
  l.text(1,9,FACE.HAX,t);const dx=1+l.width(FACE.HAX,t)+1;l.pixel(dx+1,1);l.pixel(dx,2);l.pixel(dx+2,2);l.pixel(dx+1,3);l.text(dx+4,9,FACE.HAX,'C');
  const cRight=dx+4+l.width(FACE.HAX,'C');
  const rh=m.env&&Number.isFinite(Number(m.rh))?`${clamp(Math.round(Number(m.rh)),0,99)}%`:'--%';l.text(cRight+5,9,FACE.HAX,rh);
  drawStatusIcons(l,m,s);
}

function drawHold(l,s){const lang=s.lang==='en'?'en':'zh',face=lang==='en'?FACE.LATIN:FACE.BODY,text=l.string(IDS.HOLD,lang),w=l.width(face,text),bw=Math.min(124,w+8),x=trunc((128-bw)/2);l.box(x,23,bw,19,0);l.frame(x,23,bw,19);l.centerText(x,bw,face===FACE.BODY?26:29,face,text);}
function mainValueX(l,face,value,left=28,right=126){const w=l.width(face,value);return left+Math.max(0,trunc((right-left+1-w)/2));}
function drawLogRangeBar(l,doseCenti){
  const x1=8,x2=119,y=60,minLog=-1,maxLog=5;
  const labels=[[-1,'.1u'],[1,'10u'],[3,'1m'],[5,'100m']];
  for(const [d,t] of labels){const center=x1+Math.round((x2-x1)*(d-minLog)/(maxLog-minLog));const w=microWidth(t);microText(l,clamp(center-trunc(w/2),0,127-w),52,t);}
  l.hline(x1,y,x2-x1+1);for(let d=minLog;d<=maxLog;d++){const x=x1+Math.round((x2-x1)*(d-minLog)/(maxLog-minLog));l.vline(x,y-2,3);}
  const usv=Math.max(.1,(Math.max(0,Number(doseCenti)||0))/100),r=clamp((Math.log10(usv)-minLog)/(maxLog-minLog),0,1),px=x1+Math.round((x2-x1)*r);l.pixel(px,61);l.hline(px-1,62,3);l.hline(px-2,63,5);
}
function renderRate(l,state){
  const {m,s,u}=state;drawTimeHeader(l,m,s);
  const rate=UI.formatDoseRate(m.dose);const x=Math.max(0,trunc((128-l.width(MAIN_FACE,rate.value))/2)-3);l.text(x,44,MAIN_FACE,rate.value);
  const uw=l.width(FACE.LATIN,rate.unit);l.text(Math.max(0,126-uw),44,FACE.LATIN,rate.unit);drawLogRangeBar(l,m.dose);if(Date.now()<(u.hint||0))drawHold(l,s);
}
function totalFace(){return MAIN_FACE;}
function renderTotal(l,state){
  const {m,s,u}=state;drawEnvHeader(l,m,s);const total=UI.formatTotal(m.total),face=totalFace(total),base=47;
  const x=Math.max(0,trunc((128-l.width(face,total.value))/2)-3);l.text(x,base,face,total.value);const uw=l.width(FACE.LATIN,total.unit);l.text(Math.max(0,126-uw),42,FACE.LATIN,total.unit);
  const sec=Math.max(0,Math.floor(m.totalSec||0)),days=Math.min(9999,Math.floor(sec/86400)),hours=Math.floor(sec/3600)%24,mins=Math.floor(sec/60)%60;
  l.centerText(0,42,56,FACE.LATIN,`${days}D`);l.centerText(43,42,56,FACE.LATIN,`${two(hours)}H`);l.centerText(86,42,56,FACE.LATIN,`${two(mins)}M`);if(Date.now()<(u.hint||0))drawHold(l,s);
}

function shortDose(centi){const u=Math.max(0,Number(centi)||0)/100;if(u<1000)return `${u.toFixed(2)}u`;const ms=u/1000;if(ms<1000)return `${ms.toFixed(2)}m`;return `${(ms/1000).toFixed(2)}S`;}
function logY(centi,top=4,bottom=52){const u=Math.max(.1,(Math.max(0,Number(centi)||0))/100),r=clamp((Math.log10(u)+1)/6,0,1);return bottom-Math.round(r*(bottom-top));}
function renderTrend(l,state){
  const {m}=state;
  const history=(Array.isArray(m.doseHistory)&&m.doseHistory.length?m.doseHistory:liveDoseHistory).slice(-60);
  const AX=22,L=25,R=124,T=5,Y_TOP=5,Y_LOW=47,B=53;

  // Y 轴主量级严格等间距：100m / 1m / 10u / .1u 每级相隔 14 px。
  // 0~.1u 单独保留 6 px 低端区间，不破坏主对数量级的等距关系。
  const trendY=(centi)=>{
    const u=Math.max(0,Number(centi)||0)/100;
    if(u<=0.1)return B-Math.round(clamp(u/0.1,0,1)*(B-Y_LOW));
    const r=clamp((Math.log10(u)+1)/6,0,1);
    return Y_LOW-Math.round(r*(Y_LOW-Y_TOP));
  };

  l.vline(AX,T,B-T+1);
  l.hline(AX,B,R-AX+1);

  // 主刻度和刻度值均位于 Y 轴左侧。
  const majors=[
    [10000000,'100m',5],
    [100000,'1m',19],
    [1000,'10u',33],
    [10,'.1u',47]
  ];
  for(const [,text,y] of majors){
    l.hline(AX-4,y,5);
    microRight(l,AX-7,clamp(y-2,0,59),text);
  }

  // 每个 decade 的小刻度同样朝左；0~.1u 之间保留一个额外短刻度。
  for(let d=-1;d<=5;d++){
    const centi=Math.pow(10,d)*100,y=trendY(centi);
    l.hline(AX-2,y,3);
  }
  const lowMinorY=Math.round((Y_LOW+B)/2);
  l.hline(AX-2,lowMinorY,3);

  // 最近 60 秒数据按时间顺序绘制为连续折线。
  if(history.length){
    let prevX=L,prevY=clamp(trendY(history[0]),T,B);
    if(history.length===1)l.pixel(prevX,prevY);
    for(let i=1;i<history.length;i++){
      const x=L+Math.round(i*(R-L)/Math.max(1,history.length-1));
      const y=clamp(trendY(history[i]),T,B);
      l.line(prevX,prevY,x,y);
      prevX=x;prevY=y;
    }
  }

  // X 轴三个主刻度均向下，统一显示秒单位：0S / 30S / 60S。
  const x0=L,x30=Math.round((L+R)/2),x60=R;
  l.vline(x0,B,4);l.vline(x30,B,4);l.vline(x60,B,4);
  microText(l,x0-trunc(microWidth('0S')/2),58,'0S');
  microText(l,x30-trunc(microWidth('30S')/2),58,'30S');
  microText(l,x60-microWidth('60S')+1,58,'60S');

  // 前景层：参数最后绘制，局部清除文字区域，折线可以进入参数区。
  const frontText=(x,y,text)=>{
    const w=microWidth(text);
    l.box(Math.max(0,x-1),Math.max(0,y-1),Math.min(128-x+1,w+2),7,0);
    microText(l,x,y,text);
  };
  frontText(30,1,'AVG'); frontText(49,1,shortDose(m.avg||m.dose||0));
  frontText(80,1,'MAX'); frontText(99,1,shortDose(m.peak||m.dose||0));
  frontText(30,8,'CPS'); frontText(49,8,String(Math.max(0,Math.floor(m.cps||0))));
  frontText(80,8,'CPM'); frontText(99,8,String(Math.max(0,Math.floor(m.cpm||0))));
}

const SETTINGS_LABELS=[IDS.LANGUAGE,IDS.ALARM_THRESHOLD,IDS.BACKLIGHT_SWITCH,IDS.BACKLIGHT,IDS.AUTO_SLEEP,IDS.KEY_SOUND,IDS.KEY_VIB,IDS.GM_SOUND,IDS.ALARM_SOUND,IDS.ALARM_LIGHT,IDS.ALARM_VIB,IDS.DATE_TIME,IDS.TOTAL_DOSE,IDS.DATA,IDS.DEVICE_INFO,IDS.RESTORE,IDS.RETURN_HOME];
function boolKey(i){return ({2:'backlightOn',4:'autoSleep',5:'keySound',6:'keyVib',7:'gmSound',8:'alarmSound',9:'alarmLight',10:'alarmVib'})[i];}
function settingValue(l,state,i,lang){const {s}=state;if(i===0)return s.lang==='en'?l.string(IDS.ENGLISH,lang):l.string(IDS.CHINESE,lang);if(i===1){const d=UI.formatDoseRate(s.threshold);return `${d.value}${d.unit.replace('Sv/h','')}`;}if(i===3)return `${s.backlight}%`;const k=boolKey(i);if(k)return l.string(s[k]?IDS.ON:IDS.OFF,lang);return '>';} 
function drawScrollThumb(l,sel,count){const y1=12,y2=60;l.vline(3,y1,y2-y1+1);const pos=y1+Math.round((Math.max(0,Math.min(count-1,sel))*(y2-y1-4))/Math.max(1,count-1));l.frame(1,pos,5,5);l.box(2,pos+1,3,3);}
function renderSettingsSub(l,state){const {m,s,u,c}=state,lang=s.lang==='en'?'en':'zh';drawTimeHeader(l,m,s);const face=lang==='en'?FACE.LATIN:FACE.BODY;
  if(u.sub==='device'){l.text(9,17,face,l.string(IDS.FIRMWARE,lang));l.text(9,34,face,l.string(IDS.RESOURCE,lang));l.text(74,19,FACE.LATIN,c.info?`0x${Number(c.info.applicationVersion).toString(16).toUpperCase()}`:'SIM');l.text(74,36,FACE.LATIN,c.res?`0x${Number(c.res.activeVersion).toString(16).toUpperCase()}`:'SIM');return;}
  if(u.sub==='datetime'){l.centerText(0,128,14,face,l.string(IDS.DATE_TIME,lang));const d=m.time instanceof Date?m.time:new Date();l.centerText(0,128,39,FACE.LATIN,`${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}`);return;}
  const isData=u.sub==='data',ids=isData?[IDS.ALARM_LOG,IDS.CLEAR_LOG,IDS.BACK]:[IDS.CLEAR,IDS.LIMIT,IDS.BACK],sel=u.subSel||0;for(let i=0;i<3;i++){const y=16+i*15;if(i===sel)solidTriangle(l,7,y+2);l.textId(15,y,face,ids[i],lang);}return;
}
function renderSettings(l,state){const {m,s,u}=state;drawTimeHeader(l,m,s);if(u.sub){renderSettingsSub(l,state);return;}const lang=s.lang==='en'?'en':'zh',face=lang==='en'?FACE.LATIN:FACE.BODY,count=SETTINGS_LABELS.length;drawScrollThumb(l,u.sel||0,count);let first=Math.max(0,Math.min(count-4,u.first||0));for(let r=0;r<4;r++){const i=first+r;if(i>=count)break;const y=12+r*13;if(i===u.sel)solidTriangle(l,8,y+2);l.textId(15,y,face,SETTINGS_LABELS[i],lang);const val=settingValue(l,state,i,lang);if(val==='>'){rightChevron(l,121,y+2);}else{const vf=lang==='en'?FACE.LATIN:(i===0||boolKey(i)?FACE.BODY:FACE.LATIN),w=l.width(vf,val);l.text(Math.max(80,125-w),y+(vf===FACE.BODY?0:2),vf,val);}}}

function renderRedesign(state,canvas){const l=canvas.__grsRedesignLCD||(canvas.__grsRedesignLCD=UI.createLCD(canvas));l.clear();const u=state.u||{};if(u.page==='trend')renderTrend(l,state);else if(u.page==='settings')renderSettings(l,state);else if(u.mode==='total')renderTotal(l,state);else renderRate(l,state);l.present();canvas.dataset.frameCrc=l.crc32().toString(16).padStart(8,'0');return l.buf;}

const TESTS=[
  ['auto','自动数据'],['r008','Rate 0.08u'],['r160','Rate 1.60u'],['r104','Rate 10.4u'],['r999','Rate 999u'],['r16m','Rate 1.6m'],
  ['t0','Total 0u'],['t999u','Total 999u'],['t1m','Total 1m'],['t999m','Total 999m'],['t1s','Total 1Sv'],['t999s','Total 999Sv'],['t9999s','Total 9999Sv'],['telapsed','Total 9999D'],
  ['trend','趋势对数测试'],['set0','设置顶部'],['set8','设置中部'],['set16','设置底部']
];
function cloneState(state){return {m:{...state.m},s:{...state.s},u:{...state.u},c:{...state.c}};}
function applyTest(state,key){if(!key||key==='auto')return state;const q=cloneState(state);q.m.time=new Date(2026,9,21,14,34,56);q.m.temp=25.2;q.m.rh=48;q.m.env=true;q.u.page='monitor';q.u.mode='rate';const rateMap={r008:8,r160:160,r104:1040,r999:99900,r16m:160000};if(key in rateMap)q.m.dose=rateMap[key];
  const totalMap={t0:0,t999u:999,t1m:1000,t999m:999000,t1s:1000000,t999s:999000000,t9999s:9999000000};if(key in totalMap){q.u.mode='total';q.m.total=totalMap[key];q.m.totalSec=86400+2*3600+21*60;}
  if(key==='telapsed'){q.u.mode='total';q.m.total=9999000000;q.m.totalSec=9999*86400+23*3600+59*60;}
  if(key==='trend'){q.u.page='trend';q.m.avg=160;q.m.peak=9800;q.m.cps=4;q.m.cpm=240;q.m.doseHistory=Array.from({length:60},(_,i)=>Math.round(Math.pow(10,-.7+3.8*(.5+.5*Math.sin(i/8)))*100));}
  if(key.startsWith('set')){q.u.page='settings';q.u.sub=null;q.u.sel=key==='set0'?0:key==='set8'?8:16;q.u.first=Math.max(0,Math.min(13,q.u.sel-1));}
  return q;
}
function sampleLive(state){if(!state?.m)return;const d=state.m.time instanceof Date?state.m.time:new Date(),key=d.getTime();if(key===lastSampleKey)return;lastSampleKey=key;liveDoseHistory.push(Math.max(0,Number(state.m.dose)||0));if(liveDoseHistory.length>60)liveDoseHistory.shift();}
function currentMode(){return document.getElementById('uiVariant')?.value||'compare';}
function syncCompare(state,canvas,mode){const wrap=document.getElementById('lcdCompareWrap'),ref=document.getElementById('lcdReference'),refShell=ref?.closest('.lcd-shell'),primary=canvas.closest('.lcd-shell')?.querySelector('.lcd-label-row span:first-child');if(mode==='compare'){wrap?.classList.add('compare-active');if(refShell)refShell.hidden=false;if(primary)primary.textContent='GRS LC01 · 精简版';if(ref)prevRender(state,ref);}else{wrap?.classList.remove('compare-active');if(refShell)refShell.hidden=true;if(primary)primary.textContent=mode==='production'?'GRS LC01 · 原版 Production':'GRS LC01 · 精简版';}}

UI.renderRedesign=renderRedesign;
UI.redesignDebug={shortDose,logY,totalFace,tests:TESTS};
UI.render=function(state,canvas){
  if(typeof document==='undefined'||canvas?.id!=='lcd')return prevRender(state,canvas);
  lastBaseState=state;sampleLive(state);const key=testSelect?.value||'auto',effective=applyTest(state,key),mode=currentMode();const prior=prevRender(effective,canvas);if(mode==='production'){syncCompare(effective,canvas,mode);return prior;}const out=renderRedesign(effective,canvas);syncCompare(effective,canvas,mode);const st=document.getElementById('uiStateText');if(st&&key!=='auto')st.textContent=`显示测试：${TESTS.find(x=>x[0]===key)?.[1]||key}`;return out;
};

function installTestUI(){const controls=document.querySelector('.simulator-card .inline-controls');if(!controls||document.getElementById('displayTest'))return;const group=document.createElement('span');group.className='ui-preview-control display-test-control';const label=document.createElement('label');label.htmlFor='displayTest';label.textContent='显示测试';testSelect=document.createElement('select');testSelect.id='displayTest';for(const [v,t] of TESTS){const o=document.createElement('option');o.value=v;o.textContent=t;testSelect.appendChild(o);}const prev=document.createElement('button');prev.type='button';prev.textContent='‹';prev.title='上一个测试值';const next=document.createElement('button');next.type='button';next.textContent='›';next.title='下一个测试值';const rerender=()=>{const lcd=document.getElementById('lcd');if(lcd&&lastBaseState)UI.render(lastBaseState,lcd);};testSelect.addEventListener('change',rerender);prev.addEventListener('click',()=>{testSelect.selectedIndex=(testSelect.selectedIndex-1+testSelect.options.length)%testSelect.options.length;rerender();});next.addEventListener('click',()=>{testSelect.selectedIndex=(testSelect.selectedIndex+1)%testSelect.options.length;rerender();});group.append(label,testSelect,prev,next);controls.appendChild(group);const note=document.querySelector('.ui-preview-note');if(note)note.textContent='精简 UI V3：顶部状态栏恢复旧版较大的正式字体、状态图标与电池尺寸；Dose Rate 主读数保持当前位置；Total Dose 保持温湿度 5 px 间距与统一大字体；趋势页继续使用连续折线和两位小数 AVG / MAX；日期时间子页显示年月日。';}
if(typeof document!=='undefined')installTestUI();
})();
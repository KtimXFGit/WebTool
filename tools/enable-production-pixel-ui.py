#!/usr/bin/env python3
from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
app=root/'app.js'
index=root/'index.html'

src=app.read_text(encoding='utf-8')
pattern=r"function render\(\)\{.*?\}\nfunction vis\(\)"
replacement="""function render(){
  if(window.GRSProductionUI){
    window.GRSProductionUI.render({m,s,u,c},lcd);
  }else{
    g.fillStyle='#d9e5b5';fill(0,0,128,64);g.fillStyle='#152116';g.strokeStyle='#152116';g.lineWidth=1;
    u.page==='monitor'?monitor():u.page==='trend'?trend():settings();
  }
  $('uiStateText').textContent=`页面：${u.page==='monitor'?'主界面':u.page==='trend'?'趋势':'设置'}${u.page==='monitor'?' · '+(u.mode==='rate'?'Dose':'Total'):''}${u.sub?' · '+u.sub:''}`;
}
function vis()"""
new,count=re.subn(pattern,replacement,src,count=1,flags=re.S)
if count!=1:
    raise SystemExit(f'app.js render replacement count={count}')
app.write_text(new,encoding='utf-8')

html=index.read_text(encoding='utf-8')
old='''  <script src="grs-protocol.js"></script>\n  <script src="lcd-sharp.js"></script>\n  <script src="app.js"></script>'''
new_scripts='''  <script src="grs-protocol.js"></script>\n  <script src="ui-resource/grs-ui-meta.js"></script>\n  <script src="ui-resource/grs-ui-strings.js"></script>\n  <script src="ui-resource/grs-ui-faces.js"></script>\n  <script src="grs-production-ui.js"></script>\n  <script src="app.js"></script>'''
if old not in html:
    raise SystemExit('index.html script block not found')
index.write_text(html.replace(old,new_scripts,1),encoding='utf-8')

#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'ui-resource'/'grs-ui-faces.js'
s=p.read_text(encoding='utf-8')
old='"55":[5,7,6,0,-7,"+AgQIEBAgIA=="]'
new='"55":[5,7,6,0,-7,"+AgIEBAgIA=="]'
if old not in s:
    raise SystemExit('target glyph record not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')

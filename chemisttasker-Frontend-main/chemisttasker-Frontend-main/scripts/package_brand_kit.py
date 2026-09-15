"""Package only public review assets and verify the existing app source baseline."""
from pathlib import Path
import csv
import hashlib
import json
import zipfile
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
studio=root/'brand-studio'
qa=studio/'qa'
qa.mkdir(exist_ok=True)
catalog=json.loads((root/'shared-core/skills_catalog.json').read_text())
expected={entry['code'] for groups in catalog.values() for entries in groups.values() for entry in entries}
skills=json.loads((studio/'skills.json').read_text())
assert {s['code'] for s in skills}==expected and len(skills)==27
for file in (studio/'assets').rglob('*.svg'):
    ET.parse(file)
for skill in skills:
    assert (studio/skill['file']).is_file()

def luminance(value):
    rgb=[int(value[i:i+2],16)/255 for i in (1,3,5)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    return sum(v*w for v,w in zip(rgb,[.2126,.7152,.0722]))

def contrast(a,b):
    lo,hi=sorted([luminance(a),luminance(b)])
    return (hi+.05)/(lo+.05)

tokens=json.loads((studio/'brand-tokens.json').read_text())
checks=[]
def check(name,fg,bg,minimum=4.5):
    ratio=contrast(fg,bg)
    checks.append({'name':name,'foreground':fg,'background':bg,'ratio':round(ratio,3),'minimum':minimum,'passes':ratio>=minimum})
for name,p in tokens['personas'].items():
    check(name+' solid',p['onColour'],p['colour'])
    check(name+' hover',p['onColour'],p['hover'])
    check(name+' light badge',p['text'],p['soft'])
    check(name+' dark badge',p['darkText'],p['darkSoft'])
    for mode,t in tokens['themes'].items():
        check(name+' '+mode+' accent text',p['darkText'] if mode=='dark' else p['text'],t['surface'])
for mode,t in tokens['themes'].items():
    for foreground in ['ink','muted']:
        for surface in ['page','surface','soft']:
            check(mode+' '+foreground+' on '+surface,t[foreground],t[surface])
    check(mode+' control boundary',t['controlBorder'],t['surface'],3)
for name,status in tokens['status'].items():check(name,status['text'],status['surface'])
(qa/'contrast.json').write_text(json.dumps(checks,indent=2)+'\n')
assert all(c['passes'] for c in checks),[c for c in checks if not c['passes']]
baseline=list(csv.DictReader((root/'docs/rebuild/inventory/source-baseline.csv').open(encoding='utf-8-sig')))
changed=[row['source'] for row in baseline if hashlib.sha256((root/row['source']).read_bytes()).hexdigest()!=row['sha256']]
assert not changed,changed
files=[p for p in (studio/'assets').rglob('*') if p.is_file() and p.suffix!='.zip']
files += [studio/'brand-tokens.json',studio/'skills.json',studio/'REVIEW.md']
with zipfile.ZipFile(studio/'assets/chemisttasker-brand-kit.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in files:archive.write(file,file.relative_to(studio))
print(f'Brand kit: {len(files)} files; {len(checks)} passing contrast checks; {len(baseline)} source hashes unchanged; 27 skill codes and SVGs validated.')

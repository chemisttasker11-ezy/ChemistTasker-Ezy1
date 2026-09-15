import pathlib,json,re,sys
root=pathlib.Path(__file__).resolve().parents[1]/'.research'
for key in sys.argv[1:]:
 p=root/(key+'.json')
 if not p.exists(): print(key,'MISSING');continue
 d=json.loads(p.read_text(encoding='utf-8'));t=d.get('text','')
 print('\n###',key,d['status'],d['url'])
 for heading,stop in [('2 Qualitative and Quantitative Composition','4 Clinical Particulars'),('4.2 Dose and Method of Administration','4.3 Contraindications')]:
  a=t.find(heading);b=t.find(stop,a+len(heading))
  if a>=0: print(t[a:b if b>=0 else a+6000][:7500])
 if '4.2 Dose and Method of Administration' not in t:print(t[-2500:])

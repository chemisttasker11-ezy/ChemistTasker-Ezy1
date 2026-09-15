"""Read public Australian PI pages for source review; cached text is never bundled in the app."""
import concurrent.futures, json, pathlib, re, requests
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.research'; CACHE.mkdir(exist_ok=True)
targets={
 'amoxicillin':'amoxil-capsules','amoxicillin-clavulanate':'augmentin-duo-augmentin-duo-forte-tablets',
 'amoxclav-liquid':'augmentin-duo-400-powder-for-oral-liquid','phenoxymethylpenicillin':'cilicaine-v','flucloxacillin':'flopen',
 'dicloxacillin':'dicloxacillin-viatris','cefalexin':'keflex','cefaclor':'cefaclor-sun','cefuroxime':'zinnat-tablets',
 'azithromycin':'zithromax','clarithromycin':'klacid-powder-for-oral-liquid','erythromycin':'erythrocin','roxithromycin':'roxithromycin-wgr-tablets',
 'clindamycin':'dalacin-c-capsules','doxycycline':'vibramycin','minocycline':'minomycin','trimethoprim':'triprim',
 'trimethoprim-sulfamethoxazole':'bactrim','nitrofurantoin':'macrodantin','metronidazole':'flagyl',
 'ciprofloxacin':'ciproxin','moxifloxacin':'avelox','rifaximin':'xifaxan','methenamine':'hiprex','sodium-fusidate':'fucidin',
 'fidaxomicin':'dificid','vancomycin':'vancocin','fluconazole':'diflucan','nystatin':'chemists-own-nystatin-oral-drops',
 'terbinafine':'lamisil-tablets','itraconazole':'sporanox-capsules','itraconazole-liquid':'sporanox-oral-solution',
 'griseofulvin':'grisovin','flucytosine':'ancotil','posaconazole':'noxafil','voriconazole':'vfend','isavuconazole':'cresemba',
 'aciclovir':'zovirax-tablets','valaciclovir':'valtrex','famciclovir':'famvir','oseltamivir':'tamiflu','valganciclovir':'valcyte','maribavir':'livtencity',
 'rifampicin':'rifadin','isoniazid':'isoniazid','pyrazinamide':'pyrazinamide','ethambutol':'myambutol','clofazimine':'lamprene','dapsone':'dapsone',
 'albendazole':'zentel','mebendazole':'vermox','ivermectin':'stromectol','pyrantel':'combantrin','tinidazole':'fasigyn',
 'linezolid':'zyvox','fosfomycin':'monurol','atovaquone-proguanil':'malarone','artemether-lumefantrine':'riamet','praziquantel':'biltricide',
}
def fetch(pair):
 key,slug=pair; path=CACHE/(key+'.json')
 if path.exists():return json.loads(path.read_text(encoding='utf-8'))
 url='https://www.safetyandquality.gov.au/medicine-finder/'+slug
 try:
  r=requests.get(url,timeout=25);s=BeautifulSoup(r.text,'html.parser')
  for tag in s(['script','style','nav','header','footer']):tag.decompose()
  text=s.get_text('\n',strip=True)
  result={'id':key,'url':r.url,'status':r.status_code,'title':s.title.get_text() if s.title else '', 'text':text}
 except Exception as e:result={'id':key,'url':url,'status':0,'error':str(e)}
 path.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');return result
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for r in pool.map(fetch,targets.items()):print(r['id'],r['status'],r.get('title','')[:80],flush=True)

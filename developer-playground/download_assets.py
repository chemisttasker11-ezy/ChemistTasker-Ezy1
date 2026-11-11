import requests
from pathlib import Path
base=Path(__file__).resolve().parent/'assets'
base.mkdir(parents=True,exist_ok=True)
files={'business-sheet.png':'hf_20260923_014400_0462612a-4620-4763-894c-a176dfa600e2.png','content-sheet.png':'hf_20260923_014441_0bc554db-457b-43bd-9a33-09d355d3129a.png','uniform-sheet.png':'hf_20260923_053609_3e29b285-0f97-4721-a561-daa54d8539bd.png'}
for name,remote in files.items():
 r=requests.get('https://d8j0ntlcm91z4.cloudfront.net/user_3IaElTEbmzVym1E2yLmmXLfUieT/'+remote,timeout=45);r.raise_for_status();(base/name).write_bytes(r.content);print(name,len(r.content))

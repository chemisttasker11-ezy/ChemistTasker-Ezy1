"""Extract generated contact-sheet cells into app upload assets."""
from pathlib import Path
from PIL import Image
import shutil
root=Path(__file__).resolve().parent
for stem,columns,rows in [('uniform',6,6),('business',6,6),('content',3,2)]:
    source=Image.open(root/'assets'/f'{stem}-sheet.png').convert('RGB')
    for row in range(rows):
        for col in range(columns):
            cell=source.crop((round(col*source.width/columns)+3,round(row*source.height/rows)+3,round((col+1)*source.width/columns)-3,round((row+1)*source.height/rows)-3))
            name=f'{stem}-{row*columns+col:02d}.jpg' if stem!='content' else f'content-{row*columns+col}.jpg'
            cell.save(root/'assets'/name,quality=93)
target=root.parent/'backend/media/playground'
target.mkdir(parents=True,exist_ok=True)
for asset in (root/'assets').glob('*.jpg'):shutil.copy2(asset,target/asset.name)
print('Prepared 72 role-matched portraits and 6 content photos in the local backend.')

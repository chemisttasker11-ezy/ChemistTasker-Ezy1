"""Build review-only brand assets. Does not touch web/mobile application code.

Requires fontTools with WOFF2 support. Font source and OFL licence are retained.
Run: python scripts/build_brand_assets.py
"""
from pathlib import Path
import json
import urllib.request
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
STUDIO = ROOT / 'brand-studio'
ASSETS = STUDIO / 'assets'
for folder in ['fonts', 'logos', 'skills']:
    (ASSETS / folder).mkdir(parents=True, exist_ok=True)
FONT = ASSETS / 'fonts/DM-Sans.ttf'
if not FONT.exists():
    urllib.request.urlretrieve('https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf', FONT)
if not (ASSETS / 'fonts/OFL.txt').exists():
    urllib.request.urlretrieve('https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt', ASSETS / 'fonts/OFL.txt')
font = TTFont(FONT)
font.flavor = 'woff2'
font.save(ASSETS / 'fonts/DM-Sans.woff2')
outline_font = instantiateVariableFont(TTFont(FONT), {'wght': 650, 'opsz': 24})
glyphs = outline_font.getGlyphSet()
cmap = outline_font.getBestCmap()
units = outline_font['head'].unitsPerEm


def lettering(text, size, x=0, y=0, colour='currentColor', spacing=0):
    scale = size / units
    pen = SVGPathPen(glyphs)
    offset, paths = 0, []
    for char in text:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        paths.append(f'<path d="{pen.getCommands()}" transform="translate({offset:.3f} 0)"/>')
        offset += glyphs[name].width + spacing / scale
    return f'<g fill="{colour}" stroke="none" transform="translate({x} {y}) scale({scale} {-scale})">' + ''.join(paths) + '</g>', offset * scale


def svg(content, box, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" role="img" aria-label="{escape(title)}"><title>{escape(title)}</title>{content}</svg>'


def bottle(ink='#0B0F2B', mono=False):
    if mono:
        return f'<defs><mask id="knockout"><rect width="160" height="180" fill="white"/><path d="m51 111 23 23 38-47" fill="none" stroke="black" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><g fill="{ink}" mask="url(#knockout)"><rect x="34" y="8" width="92" height="36" rx="12"/><path d="M47 40h66v20H47z"/><rect x="18" y="54" width="124" height="116" rx="34"/></g>'
    inner = f'<rect x="30" y="68" width="100" height="90" rx="23" fill="{ink}"/>' if mono else '<defs><clipPath id="inside"><rect x="30" y="68" width="100" height="90" rx="23"/></clipPath></defs><g clip-path="url(#inside)"><path fill="#FF2DB2" d="M30 68h50v45H30z"/><path fill="#7A2DFF" d="M80 68h50v45H80z"/><path fill="#00D4E6" d="M30 113h50v45H30z"/><path fill="#1A73E8" d="M80 113h50v45H80z"/></g>'
    check = '#0B0F2B' if mono and ink == '#FFFFFF' else '#FFFFFF'
    return f'<rect x="34" y="8" width="92" height="36" rx="12" fill="{ink}"/><path d="M47 40h66v20H47z" fill="{ink}"/><rect x="18" y="54" width="124" height="116" rx="34" fill="{ink}"/>{inner}<path d="m51 111 23 23 38-47" fill="none" stroke="{check}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>'


for name, ink, mono in [('colour', '#0B0F2B', False), ('reverse', '#FFFFFF', False), ('mono-navy', '#0B0F2B', True), ('mono-white', '#FFFFFF', True)]:
    (ASSETS / f'logos/bottle-{name}.svg').write_text(svg(bottle(ink, mono), '0 0 160 180', 'ChemistTasker bottle'), encoding='utf-8')
    word, width = lettering('ChemistTasker', 53, 160, 111, ink, -1.5)
    (ASSETS / f'logos/wordmark-{name}.svg').write_text(svg(bottle(ink, mono) + word, f'0 0 {int(width + 178)} 180', 'ChemistTasker'), encoding='utf-8')
    line1, _ = lettering('Chemist', 57, 166, 83, ink, -1.7)
    line2, width = lettering('TaskeR', 57, 166, 141, ink, -1.7)
    rx, _ = lettering('x', 42, 163 + width, 158, '#1A73E8' if not mono else ink)
    (ASSETS / f'logos/stacked-{name}.svg').write_text(svg(bottle(ink, mono) + line1 + line2 + rx, '0 0 404 180', 'ChemistTasker with Rx accent'), encoding='utf-8')

(ASSETS / 'logos/app-icon.svg').write_text(svg('<path fill="#0B0F2B" d="M0 0h240v240H0z"/><g transform="translate(40 30)">'+bottle('#FFFFFF')+'</g>', '0 0 240 240', 'ChemistTasker app icon'), encoding='utf-8')

ICON_PATHS = {
 'VACCINATION': '<path d="m15 3 6 6M17 5l-3 3m5-1-3 3M8 8l8 8M9 9l-5 5v6h6l5-5M4 20l-2 2M8 14l2 2m1-5 2 2"/>',
 'CANNABIS': '<path d="M12 21v-7M12 16C7 15 3 12 3 8c4 0 7 3 9 8Zm0 0c5-1 9-4 9-8-4 0-7 3-9 8Zm0-1C9 11 9 6 12 2c3 4 3 9 0 13ZM12 17c-3 3-6 3-8 1m8-1c3 3 6 3 8 1"/>',
 'COMPOUNDING': '<path d="M3 11h18c0 5-3 8-9 8s-9-3-9-8Zm4 10h10M13 11l5-8a2 2 0 0 1 3 2l-4 6M6 7h4M8 5v4"/>',
 'CRED_PHARM': '<path d="M6 3h12v13l-6 5-6-5V3Z"/><path d="m9 10 2 2 4-4M9 5h6"/>',
 'FIRST_AID': '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M12 11v6m-3-3h6"/>',
 'PDL': '<path d="M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10l4 4v3M14 3v5h5M7 8h3M7 12h4"/><path d="m17 12 4 2v3c0 2-2 4-4 5-2-1-4-3-4-5v-3l4-2Zm-2 5 1 1 3-3"/>',
 'PHARMACOTHERAPY_METHADONE_SUBOXONE': '<rect x="7" y="2" width="10" height="4" rx="1"/><path d="M8 6v3l-3 3v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7l-3-3V6M8 14h8m-4-3v6"/>',
 'WEBSTER_PACKING_DAA': '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 7h1m6 0h1M8 12h1m6 0h1M8 17h1m6 0h1" stroke-width="3"/>',
 'ROBOT_DISPENSING': '<path d="M4 21h14M7 21v-4l6-5-4-5 3-4 6 6-3 7M18 9l3-2m0 0v4m0-4-3-2M8 17h6"/><circle cx="13" cy="12" r="2"/><circle cx="11" cy="5" r="2"/>',
 'STAGED_SUPPLY': '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v4m10-4v4M3 9h18M7 13h3m4 0h3M7 17h3m4 0h3"/>',
 'NDSS': '<path d="M12 2s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M8 14h2l1-3 2 6 1-3h2"/>',
 'PI_INSURANCE': '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="M12 7v8m-4-4h8"/>',
 'VACCINATOR': '<circle cx="9" cy="6" r="3"/><path d="M3 20v-3a6 6 0 0 1 10-4m2-3 6 6m-4-4-4 4v4h4l4-4M13 20l-2 2m6-11 2-2m1 1 2 2"/>',
 'UTI_PRESCRIBER': '<path d="M8 3v5c0 3-4 3-4 7a8 8 0 0 0 16 0c0-4-4-4-4-7V3M12 20v2M9 14h6m-3-3v6"/>',
 'ORAL_CONTRACEPTIVE_RESUPPLY': '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="11" r="5"/><path d="M12 6v1m5 4h-1m-4 5v-1m-5-4h1m1-3 1 1m5-1-1 1m1 5-1-1m-5 1 1-1M9 19h6"/>',
 'TRAVEL_HEALTH_YELLOW_FEVER': '<circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2c-4 4-4 12 0 16M10 2c2 2 3 4 3 6m0 7 9-3-3 9-2-4-4-2Z"/>',
 'HMR_ACCREDITED_MRN': '<path d="m2 10 10-8 10 8M5 8v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M9 10h6v8H9zM11 13h2m-2 2h2"/>',
 'MEDSCHECK': '<rect x="4" y="4" width="13" height="17" rx="2"/><rect x="8" y="2" width="5" height="4" rx="1"/><path d="M7 10h5m-5 4h3"/><circle cx="16" cy="16" r="4"/><path d="m19 19 3 3"/>',
}
SOFTWARE = {'FRED':'FR','MINFOS':'MI','Z_DISPENSE':'Z','CORUM_LOTS':'CL','DISPENSE_WORKS':'DW','RXONE':'RX','AQUARIUS':'AQ','POSWORKS':'PW','OTHER':'+'}
catalog = json.loads((ROOT/'shared-core/skills_catalog.json').read_text(encoding='utf-8'))
skills = []
for category, entries in catalog['pharmacist'].items():
    for entry in entries:
        code = entry['code']
        if code in SOFTWARE:
            mark, width = lettering(SOFTWARE[code], 7, 0, 0)
            content = '<rect x="2" y="3" width="20" height="15" rx="3"/><path d="M8 22h8m-4-4v4"/>' + f'<g transform="translate({12-width/2:.3f} 13)">{mark}</g>'
        else:
            content = ICON_PATHS[code]
        drawing = '<g fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+content+'</g>'
        (ASSETS/f'skills/{code.lower()}.svg').write_text(svg(drawing, '0 0 24 24', entry['label']), encoding='utf-8')
        skills.append({**entry,'category':category,'svg':drawing,'file':f'assets/skills/{code.lower()}.svg'})

tokens = {
 'version':'0.1-review','font':'DM Sans','navy':'#0B0F2B',
 'personas':{
  'owner':{'name':'Pharmacy owner','short':'Owner','colour':'#7A2DFF','onColour':'#FFFFFF','text':'#5C1BC2','soft':'#F1E9FF','hover':'#6520DF','darkText':'#C9B0FF','darkSoft':'#292040','glyph':'store'},
  'pharmacist':{'name':'Pharmacist / locum','short':'Pharmacist','colour':'#1A73E8','onColour':'#FFFFFF','text':'#1454AE','soft':'#EAF2FF','hover':'#155EC0','darkText':'#A5C9FF','darkSoft':'#192C46','glyph':'pill'},
  'otherstaff':{'name':'Other staff','short':'Other staff','colour':'#00D4E6','onColour':'#0B0F2B','text':'#006570','soft':'#E3FAFC','hover':'#00BDCD','darkText':'#68E6EF','darkSoft':'#11353C','glyph':'people'},
  'explorer':{'name':'Explorer','short':'Explorer','colour':'#FF2DB2','onColour':'#0B0F2B','text':'#A6086B','soft':'#FFF0F8','hover':'#FF60C5','darkText':'#FFABE0','darkSoft':'#3D2034','glyph':'compass'}
 },
 'themes':{'light':{'page':'#F6F7FB','surface':'#FFFFFF','ink':'#0B0F2B','muted':'#5B637A','line':'#DFE3EC','controlBorder':'#80889C','soft':'#F0F2F7'},'dark':{'page':'#101326','surface':'#191D33','ink':'#F4F5FC','muted':'#B4BCD1','line':'#343B56','controlBorder':'#8790AC','soft':'#242A43'}},
 'status':{'success':{'text':'#146345','surface':'#E8F7EF'},'warning':{'text':'#805000','surface':'#FFF3D6'},'error':{'text':'#AC263B','surface':'#FFF0F2'},'info':{'text':'#1454AE','surface':'#EAF2FF'}},
 'spacing':[4,8,12,16,24,32,48,64,96], 'radius':{'control':8,'card':12,'feature':24},
 'type':{'body':16,'small':14,'caption':12,'h3':24,'h2':36,'display':64},
 'motion':{'quick':140,'standard':220,'reduced':0}
}
(STUDIO/'brand-tokens.json').write_text(json.dumps(tokens,indent=2)+'\n',encoding='utf-8')
(STUDIO/'skills.json').write_text(json.dumps(skills,indent=2)+'\n',encoding='utf-8')
# Classic script data allows the showcase to work over file:// as well as HTTP.
(STUDIO/'brand-data.js').write_text('window.CT_BRAND = '+json.dumps({'tokens':tokens,'skills':skills})+';\n',encoding='utf-8')
print(f'Created {len(skills)} skill SVGs, 12 logo SVGs, local fonts, tokens and showcase data.')

"""Generate the Step 1 source inventory; does not execute or edit application code.

Run from any directory: python scripts/inventory_frontend.py
The route reader handles the literal route objects currently in main.tsx. It is
not a general TypeScript parser or proof of runtime reachability/permissions.
"""
from pathlib import Path
import csv
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/rebuild/inventory'
OUT.mkdir(parents=True, exist_ok=True)


def read(path):
    return path.read_text(encoding='utf-8', errors='replace')


def write_csv(name, rows, fields):
    with (OUT / name).open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


source = read(ROOT / 'frontend_web/src/main.tsx')
token_pattern = re.compile(r'//[^\n]*|/\*[\s\S]*?\*/|\'(?:\\.|[^\'\\])*\'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[{}]|\b(?:path|index)\s*:')
stack, objects = [], []
for token in token_pattern.finditer(source):
    value = token.group()
    if value.startswith(('//', '/*')):
        continue
    if value == '{':
        obj = {'start': token.start(), 'parent': stack[-1] if stack else None}
        objects.append(obj)
        stack.append(obj)
    elif value == '}':
        assert stack, 'Unbalanced source braces'
        stack.pop()['end'] = token.end()
    elif value.startswith('path') and stack:
        literal = re.match(r"\s*(['\"])(.*?)\1", source[token.end():])
        assert literal, 'Nonliteral route needs manual inventory'
        stack[-1]['path'] = literal.group(2)
        stack[-1]['line'] = source.count('\n', 0, token.start()) + 1
    elif value.startswith('index') and stack and re.match(r'\s*true\b', source[token.end():]):
        stack[-1]['index'] = True
        stack[-1]['line'] = source.count('\n', 0, token.start()) + 1
assert not stack, 'Unbalanced source braces'

web = []
for obj in objects:
    if 'path' not in obj and not obj.get('index'):
        continue
    ancestry, current = [], obj
    while current:
        ancestry.insert(0, current)
        current = current['parent']
    full_path, guards = '', []
    for ancestor in ancestry:
        segment = ancestor.get('path', '')
        if segment:
            full_path = segment if segment.startswith('/') else full_path.rstrip('/') + '/' + segment
        head = source[ancestor['start']:ancestor['end']].split('children:', 1)[0]
        if '<ProtectedRoute' in head:
            role = re.search(r'requiredRole="([^"]+)"', head)
            guards.append(role.group(1) if role else ('admin assignment' if 'requireAdmin' in head else 'authenticated'))
    head = source[obj['start']:obj['end']].split('children:', 1)[0]
    components = re.findall(r'<([A-Z]\w*)\b', head)
    redirect = re.search(r'<Navigate\s+to="([^"]+)"', head)
    web.append({'route': full_path or '/', 'kind': 'index' if obj.get('index') else ('group' if 'children:' in source[obj['start']:obj['end']] else 'page'),
                'components': ', '.join(dict.fromkeys(components)), 'route_guard': ', '.join(dict.fromkeys(guards)) or 'No route-level guard; inspect page/session logic',
                'redirect': redirect.group(1) if redirect else '', 'planned_host': 'Vite' if guards else 'Next.js',
                'source': 'frontend_web/src/main.tsx', 'line': obj['line'], 'runtime_status': 'Not tested'})
write_csv('web-routes.csv', web, list(web[0]))

mobile = []
for path in sorted((ROOT / 'frontend_mobile/app').rglob('*.tsx')):
    relative = path.relative_to(ROOT / 'frontend_mobile/app')
    parts = [part for part in relative.with_suffix('').parts if not part.startswith('(')]
    kind = 'layout' if parts[-1] == '_layout' else ('support-file-review' if parts[-1].startswith('_') else 'route')
    if parts[-1] == 'index':
        parts.pop()
    route = '/' + '/'.join(parts)
    route = re.sub(r'\[([^\]]+)\]', r':\1', route)
    text = read(path)
    targets = re.findall(r'(?:from\s+|import\s+)[\'"]([^\'"]+)[\'"]', text)
    mobile.append({'route': route, 'kind': kind, 'source': path.relative_to(ROOT).as_posix(),
                   'implementation_imports': '; '.join(t for t in targets if t.startswith(('@/', '.', '@chemisttasker'))),
                   'access': 'Inspect root/role layouts and screen capability checks', 'runtime_status': 'Not tested'})
write_csv('mobile-routes.csv', mobile, list(mobile[0]))

files, api, queries = [], [], []
roots = ['frontend_web', 'frontend_mobile', 'shared-core', 'scripts']
for folder in roots:
    for path in sorted((ROOT / folder).rglob('*')):
        if not path.is_file() or any(p in {'node_modules', 'dist', 'build', '.expo', '__pycache__'} for p in path.parts):
            continue
        if path.suffix not in {'.ts', '.tsx', '.js', '.mjs', '.css', '.html'} and not path.name.endswith(('.backup', '.txt')):
            continue
        if path.name == 'steps.txt':
            continue
        text = read(path)
        rel = path.relative_to(ROOT).as_posix()
        files.append({'source': rel, 'lines': len(text.splitlines()), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                      'review_flag': 'Backup/temp candidate; verify imports before removing' if re.search(r'backup| copy|__tmp', path.name) else ''})
        for number, line in enumerate(text.splitlines(), 1):
            if line.lstrip().startswith(('//', '*', '/*')):
                continue
            for match in re.finditer(r'[\'"`](/(?:client-profile|users|billing|account)(?:/[^\'"`\s]*)?)[\'"`]', line):
                api.append({'source': rel, 'line': number, 'endpoint_expression': match.group(1), 'status': 'Source reference; not live verified'})
            for match in re.finditer(r'(?:searchParams|params)\.get\([\'"]([^\'"]+)[\'"]\)', line):
                queries.append({'source': rel, 'line': number, 'query_key': match.group(1), 'status': 'Preserve existing link semantics'})
write_csv('source-baseline.csv', files, ['source', 'lines', 'sha256', 'review_flag'])
write_csv('api-references.csv', api, ['source', 'line', 'endpoint_expression', 'status'])
write_csv('query-parameters.csv', queries, ['source', 'line', 'query_key', 'status'])

catalog = json.loads(read(ROOT / 'shared-core/skills_catalog.json'))
skills = []
for role, groups in catalog.items():
    for category, entries in groups.items():
        for entry in entries:
            skills.append({'role_catalog': role, 'category': category, 'code': entry['code'], 'label': entry['label'],
                           'requires_certificate': entry['requires_certificate'], 'description': entry.get('description', ''),
                           'icon_status': 'To design in Step 2; no verification inferred'})
write_csv('skills.csv', skills, list(skills[0]))

summary = {'method': 'Static source inspection; not runtime or backend verification',
           'web_route_entries': len(web), 'web_unique_paths': len({r['route'] for r in web}),
           'next_public_route_entries': sum(r['planned_host'] == 'Next.js' for r in web),
           'mobile_route_files': sum(r['kind'] == 'route' for r in mobile),
           'mobile_layout_files': sum(r['kind'] == 'layout' for r in mobile),
           'mobile_support_files_under_app': sum(r['kind'] == 'support-file-review' for r in mobile),
           'source_files_hashed': len(files), 'literal_api_references': len(api),
           'skill_entries': len(skills), 'unique_skill_codes': len({r['code'] for r in skills}),
           'largest_source_files': sorted(files, key=lambda row: row['lines'], reverse=True)[:12]}
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in summary.items() if k != 'largest_source_files'}, indent=2))

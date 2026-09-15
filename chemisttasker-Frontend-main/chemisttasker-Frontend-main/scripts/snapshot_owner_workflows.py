"""Capture immutable source evidence before the owner-workflow refinement."""
from pathlib import Path
import hashlib, json, zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'docs/rebuild/owner-workflows'
out.mkdir(parents=True, exist_ok=True)
target = out / 'source-before.zip'
if target.exists():
    raise SystemExit('Baseline already exists; refusing to overwrite.')
paths = sorted((root / 'frontend_web/src').rglob('*'))
records = []
with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED) as archive:
    for p in paths:
        if p.is_file() and p.suffix in ('.ts', '.tsx', '.css'):
            relative = p.relative_to(root).as_posix()
            data = p.read_bytes()
            archive.writestr(relative, data)
            records.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest()})
(out / 'source-before.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print(f'Snapshotted {len(records)} source files; no credentials or environments included.')

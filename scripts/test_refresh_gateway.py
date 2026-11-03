"""A stopped/missing gateway is refused before any destructive refresh operation."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import uuid


@unittest.skipUnless(os.name == "posix", "Linux operator script")
class RefreshGatewayPreflightTests(unittest.TestCase):
    def test_unavailable_gateway_refuses_before_service_or_database_writes(self):
        for missing in (False, True):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                (root/'scripts').mkdir()
                shutil.copyfile(Path(__file__).with_name('refresh-staging-db.sh'), root/'scripts/refresh-staging-db.sh')
                shutil.copyfile(Path(__file__).with_name('staging_provider_preflight.py'), root/'scripts/staging_provider_preflight.py')
                (root/'env').mkdir()
                for name in ('secrets','runtime','integrations','web'):
                    (root/f'env/staging.{name}.env').write_text('DISPOSABLE=1\n')
                (root/'bin').mkdir()
                docker=root/'bin/docker'
                docker.write_text("#!/usr/bin/env python3\nimport json,os,pathlib,sys\na=sys.argv[1:]\np=pathlib.Path(os.environ['FAKE_ROOT'])/'calls.jsonl'\nwith p.open('a') as f:f.write(json.dumps(a)+'\\n')\nif 'config' in a and '--format' in a:print(json.dumps({'services':{owner:{'environment':{}} for owner in ('web','migration')}}))\nelif 'ps' in a and '-q' in a:\n if not os.environ.get('MISSING_GATEWAY'):print('gateway-id')\nelif a and a[0]=='inspect':\n if a[-1]=='chemisttasker_staging_migrate':sys.exit(1)\n print('false')\n")
                docker.chmod(0o755)
                backups=root/'backups'
                backups.mkdir(parents=True,exist_ok=True)
                backup=backups/('readiness-synthetic-'+uuid.uuid4().hex+'.dump')
                backup.write_bytes(b'disposable fixture; never restored')
                script=root/'scripts/refresh-staging-db.sh'
                script.write_text(script.read_text().replace('/opt/backups/chemisttasker',str(backups)))
                try:
                    env={**os.environ,'FAKE_ROOT':str(root),'STAGING_OPS_DIR':str(root/'ops'),
                         'PATH':str(root/'bin')+os.pathsep+os.environ['PATH']}
                    if missing:env['MISSING_GATEWAY']='1'
                    result=subprocess.run(['bash',str(root/'scripts/refresh-staging-db.sh'),
                        '--confirm-production-data',str(backup)],env=env,capture_output=True,text=True,timeout=15)
                    self.assertNotEqual(result.returncode,0)
                    calls=[json.loads(x) for x in (root/'calls.jsonl').read_text().splitlines()]
                    self.assertFalse(any('up' in x or 'stop' in x or 'exec' in x or 'cp' in x for x in calls),calls)
                    self.assertIn('gateway',result.stderr.lower())
                finally:
                    assert backup.resolve().parent==backups.resolve()
                    backup.unlink(missing_ok=True)


if __name__=='__main__':unittest.main()

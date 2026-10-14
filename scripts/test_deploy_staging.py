"""Exercise release safety boundaries with fake Docker/curl, never a live stack.

Run on Linux: python3 -m unittest discover -s scripts -p test_deploy_staging.py -v
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


FAKE_TOOL = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args=sys.argv[1:]
root=pathlib.Path(os.environ['FAKE_ROOT'])
with (root/'calls.jsonl').open('a') as log:
    log.write(json.dumps([pathlib.Path(sys.argv[0]).name,*args])+'\n')
if pathlib.Path(sys.argv[0]).name!='docker':
    sys.exit(0)
if args[0]=='compose':
    operation=next(x for x in args if x in ['config','build','ps','up','restart','stop','exec'])
    if operation=='build' and os.environ.get('FAIL_BUILD'):
        sys.exit(10)
    if operation=='ps':
        if not os.environ.get('NEW_GATEWAY'):
            print('gateway-id')
    if operation=='restart':
        (root/'restarted').touch()
elif args[0]=='ps':
    print('chemisttasker_postgres_staging')
elif args[0]=='inspect':
    if 'Health.Status' in args[2]:
        print('unhealthy' if os.environ.get('UNHEALTHY_GATEWAY') else 'healthy')
    else:
        changed=os.environ.get('CHANGED_ADDRESS') and (root/'restarted').exists()
        print(json.dumps({'network':{'IPAddress':'172.20.0.9' if changed else '172.20.0.2'}}))
elif args[0]=='exec' and 'pg_dump' in args:
    if os.environ.get('FAIL_BACKUP'):
        sys.exit(11)
    print('fake-custom-format-archive')
elif args[0]=='exec' and 'pg_restore' in args:
    sys.stdin.read()
    if os.environ.get('FAIL_RESTORE_CHECK'):
        sys.exit(12)
'''


class StagingReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'scripts').mkdir()
        shutil.copyfile(Path(__file__).with_name('deploy-staging.sh'), self.root/'scripts/deploy-staging.sh')
        (self.root/'env').mkdir()
        for name in ['secrets','runtime','integrations','web']:
            (self.root/f'env/staging.{name}.env').write_text('FAKE_SETTING=test\n')
        (self.root/'env/staging.test-users.json').write_text('{}')
        (self.root/'bin').mkdir()
        for name in ['docker','curl','sleep']:
            p=self.root/'bin'/name
            p.write_text(FAKE_TOOL)
            p.chmod(0o755)

    def release(self, *args, **extra):
        env={**os.environ, 'FAKE_ROOT':str(self.root),
             'PATH':str(self.root/'bin')+os.pathsep+os.environ['PATH'],
             'STAGING_BACKUP_DIR':str(self.root/'backups'), **extra}
        result=subprocess.run(['bash',str(self.root/'scripts/deploy-staging.sh'),*args],
                              env=env,capture_output=True,text=True,timeout=30)
        path=self.root/'calls.jsonl'
        self.calls=[json.loads(x) for x in path.read_text().splitlines()] if path.exists() else []
        return result

    def operations(self, op):
        return [x[x.index(op)+1:] for x in self.calls if x[:2]==['docker','compose'] and op in x]

    def test_default_release_preserves_infrastructure_and_gateway(self):
        result=self.release()
        self.assertEqual(result.returncode,0,result.stderr)
        ups=self.operations('up')
        infra=next(x for x in ups if 'postgres' in x)
        self.assertIn('--no-recreate',infra)
        self.assertTrue(all('gateway' not in x for x in ups))
        self.assertEqual(len(self.operations('restart')),1)
        self.assertTrue(any('celery_worker' in x and 'celery_beat' in x for x in ups))
        self.assertFalse(self.operations('stop'))
        self.assertTrue(all('--no-deps' in x for x in ups if 'postgres' not in x))
        backup=next((self.root/'backups').glob('*.dump'))
        self.assertEqual(backup.stat().st_mode & 0o777,0o600)

    def test_frontend_only_never_changes_backend_workers_or_accounts(self):
        result=self.release('--frontend-only')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.operations('build'),[['frontend','landing']])
        self.assertEqual(len(self.operations('up')),1)
        up=self.operations('up')[0]
        self.assertEqual(up[-2:],['frontend','landing'])
        self.assertIn('--no-deps',up)
        self.assertFalse(self.operations('stop'))
        self.assertFalse(self.operations('exec'))

    def test_explicit_worker_opt_out(self):
        result=self.release('--without-workers')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.operations('stop'),[['celery_worker','celery_beat']])

    def test_build_failure_does_not_replace_running_services(self):
        self.assertNotEqual(self.release(FAIL_BUILD='1').returncode,0)
        self.assertFalse(self.operations('up'))
        self.assertFalse(self.operations('restart'))
        self.assertFalse(any('pg_dump' in x for x in self.calls))

    def test_failed_backup_blocks_service_changes(self):
        self.assertNotEqual(self.release(FAIL_BACKUP='1').returncode,0)
        self.assertFalse(self.operations('up'))
        self.assertFalse(self.operations('restart'))

    def test_invalid_archive_blocks_service_changes(self):
        self.assertNotEqual(self.release(FAIL_RESTORE_CHECK='1').returncode,0)
        self.assertFalse(self.operations('up'))
        self.assertFalse(self.operations('restart'))

    def test_backup_validation_precedes_first_service_update(self):
        result=self.release()
        self.assertEqual(result.returncode,0,result.stderr)
        validation=next(i for i,x in enumerate(self.calls) if 'pg_restore' in x)
        update=next(i for i,x in enumerate(self.calls) if x[:2]==['docker','compose'] and 'up' in x)
        self.assertLess(validation,update)

    def test_changed_gateway_address_fails_release(self):
        self.assertNotEqual(self.release(CHANGED_ADDRESS='1').returncode,0)
        self.assertFalse(any(x[0]=='curl' for x in self.calls))

    def test_gateway_health_failure_is_not_silently_ignored(self):
        result=self.release(UNHEALTHY_GATEWAY='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('did not become healthy',result.stderr)

    def test_initial_install_can_create_missing_gateway(self):
        result=self.release(NEW_GATEWAY='1')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue(any(x[-1]=='gateway' and '--no-deps' in x for x in self.operations('up')))
        self.assertFalse(self.operations('restart'))

    def test_invalid_option_does_not_build_or_update(self):
        self.assertNotEqual(self.release('--invalid').returncode,0)
        self.assertFalse(self.operations('build'))
        self.assertFalse(self.operations('up'))


if __name__=='__main__':
    unittest.main()

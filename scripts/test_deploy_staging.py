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
tool=pathlib.Path(sys.argv[0]).name
with (root/'calls.jsonl').open('a') as log:
    log.write(json.dumps([tool,*args])+'\n')
if tool=='git':
    if args[:2]==['rev-parse','HEAD']:
        print('2'*40 if os.environ.get('WRONG_SHA') or (root/'source-drift').exists() else '1'*40)
    elif args[:2]==['status','--porcelain'] and os.environ.get('DIRTY_TREE'):
        print(' M unreviewed.py')
    sys.exit(0)
if tool!='docker': sys.exit(0)
if args[0]=='compose':
    operation=next(x for x in args if x in ['config','build','ps','up','restart','stop','exec','run','start'])
    if operation=='config' and '--format' in args:
        services={'gateway':{'image':'nginx:1.27.5-alpine'},'web':{'environment':{'STRIPE_SECRET_KEY':os.environ.get('WEB_STRIPE_KEY','sk_test_disposable123')}}}
        if '--profile' in args and 'release' in args:
            services['migration']={'environment':{'RUN_MIGRATIONS':'0' if os.environ.get('DISABLE_MIGRATIONS') else '1','STRIPE_SECRET_KEY':os.environ.get('MIGRATION_STRIPE_KEY','sk_test_disposable123')}}
        if 'docker-compose.staging.resources.yml' in args:
            budgets={'postgres':(1024,.75,128),'redis':(768,.25,64),'redis_cache':(160,.25,64),
                'web':(1024,1,128),'migration':(1024,1,128),'celery_worker':(1536,1,128),
                'celery_beat':(384,.25,64),'frontend':(128,.25,64),'landing':(768,.75,128),'gateway':(128,.25,64)}
            for role,(memory,cpu,pids) in budgets.items():
                services.setdefault(role,{}).update(mem_limit=str(memory*1024**2),cpus=str(cpu),pids_limit=pids,
                    logging={'driver':'json-file','options':{'max-size':'10m','max-file':'5'}})
            services['redis']['command']=['redis-server','--maxmemory','256mb']
            services['redis_cache']['command']=['redis-server','--maxmemory','96mb']
            if os.environ.get('STAGING_WEB_MEMORY_LIMIT')=='9g': services['web']['mem_limit']=str(9*1024**3)
        print(json.dumps({'services':services}))
    if operation=='build' and os.environ.get('HUP_DURING_BUILD'):
        import signal
        os.kill(os.getppid(), signal.SIGHUP)
    if operation=='build' and os.environ.get('SOURCE_DRIFT_AFTER_BUILD'): (root/'source-drift').touch()
    if operation=='build' and os.environ.get('FAIL_BUILD'): sys.exit(10)
    if operation=='build' and os.environ.get('POLICY_CHANGED_DURING_BUILD'): (root/'policy-changed').touch()
    if operation=='run' and os.environ.get('FAIL_MIGRATION'): sys.exit(15)
    if operation=='exec' and os.environ.get('FAIL_SEED'): sys.exit(16)
    if operation=='up' and 'web' in args:
        (root/'web-started').touch()
        if os.environ.get('FAIL_WEB'): sys.exit(13)
    if operation=='ps' and '-q' in args:
        if not (args[-1]=='gateway' and os.environ.get('NEW_GATEWAY')):
            print(args[-1]+'-id')
    if operation=='restart': (root/'restarted').touch()
elif args[0]=='kill':
    assert '--signal=TERM' in args, 'A release must never send an unqualified kill'
    (root/('stopped-'+args[-1])).touch()
elif args[0]=='ps':
    if not os.environ.get('MISSING_DB'): print('chemisttasker_postgres_staging')
elif args[0]=='inspect':
    if args[-1]=='chemisttasker_staging_migrate':
        state=os.environ.get('MIGRATION_STATE') or ('running' if os.environ.get('MIGRATION_RUNNING') else '')
        if not state: sys.exit(1)
        print('true' if state=='running' else 'false')
    elif 'HostConfig.Memory' in args[2]: print('1073741824 0 0' if os.environ.get('EXISTING_RESOURCE_CAPS') else '0 0 0')
    elif 'State.ExitCode' in args[2]:
        print('137' if os.environ.get('FORCED_STOP') else '0')
    elif 'State.OOMKilled' in args[2]: print('false')
    elif 'State.Running' in args[2]:
        stopped=(root/('stopped-'+args[-1])).exists()
        print('false' if os.environ.get('STOPPED_WRITERS') or (stopped and not os.environ.get('STUCK_WRITER')) else 'true')
    elif 'Health.Status' in args[2]:
        print('unhealthy' if os.environ.get('UNHEALTHY_GATEWAY') else 'healthy')
    else:
        changed=(os.environ.get('CHANGED_ADDRESS') and (root/'restarted').exists()) or (os.environ.get('PRODUCTION_DRIFT') and args[-1]=='chemisttasker_backend_prod' and (root/'web-started').exists())
        print(json.dumps({'network':{'IPAddress':'172.20.0.9' if changed else '172.20.0.2'}}))
elif args[0]=='exec' and 'CONFIG' in args:
    print('maxmemory-policy')
    print('allkeys-lru' if os.environ.get('EVICTING_STATE') or (root/'policy-changed').exists() else 'noeviction')
elif args[0]=='exec' and 'pg_database_size(current_database())' in ' '.join(args):
    print('1048576')
elif args[0]=='exec' and 'df' in args:
    print('Filesystem 1024-blocks Used Available Capacity Mounted on\nfixture 33554432 1048576 32505856 4% /')
elif args[0]=='exec' and 'pg_dump' in args:
    if os.environ.get('SOURCE_DRIFT_DURING_BACKUP'): (root/'source-drift').touch()
    if os.environ.get('FAIL_BACKUP'): sys.exit(11)
    print('fake-custom-format-archive')
elif args[0]=='exec' and 'pg_restore' in args:
    sys.stdin.read()
    if '--file=/dev/null' in args and os.environ.get('FAIL_ARCHIVE_DATA'): sys.exit(12)
    if '--file=/dev/null' in args and os.environ.get('SOURCE_DRIFT_DURING_INPUT_DECODE'): (root/'source-drift').touch()
    if '--list' in args:
        count=root/'archive-checks'
        number=int(count.read_text())+1 if count.exists() else 1
        count.write_text(str(number))
        if os.environ.get('FAIL_RESTORE_CHECK') or (os.environ.get('FAIL_ROLLBACK_CHECK') and number==2): sys.exit(12)
'''


class StagingReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'scripts').mkdir()
        source_root=Path(__file__).resolve().parent.parent
        for name in ('scripts/staging_resource_budget.py','scripts/staging_provider_preflight.py','scripts/staging_backup_preflight.py','docker-compose.staging.resources.yml'):
            shutil.copyfile(source_root/name,self.root/name)
        shutil.copyfile(Path(__file__).with_name('deploy-staging.sh'), self.root/'scripts/deploy-staging.sh')
        (self.root/'scripts/smoke-staging.sh').write_text('#!/bin/sh\n[ -z \"${FAIL_SMOKE:-}\" ] || exit 14\ncurl --fail https://example.test/health/\n')
        (self.root/'env').mkdir()
        for name in ['secrets','runtime','integrations','web']:
            (self.root/f'env/staging.{name}.env').write_text('FAKE_SETTING=test\n')
        (self.root/'env/staging.test-users.json').write_text('{}')
        (self.root/'bin').mkdir()
        for name in ['docker','curl','sleep','git']:
            p=self.root/'bin'/name
            p.write_text(FAKE_TOOL)
            p.chmod(0o755)

    def release(self, *args, **extra):
        env={**os.environ, 'FAKE_ROOT':str(self.root),
             'PATH':str(self.root/'bin')+os.pathsep+os.environ['PATH'],
             'STAGING_BACKUP_DIR':str(self.root/'backups'), 'STAGING_OPS_DIR':str(self.root/'ops'),
             'STAGING_EXPECTED_SHA':'1'*40, 'STAGING_STOP_TIMEOUT':'2','STAGING_RESOURCE_BUDGET_APPROVED':'0', **extra}
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
        self.assertIn('redis_cache',infra)
        self.assertIn('--wait',infra)
        self.assertTrue(all('gateway' not in x for x in ups))
        self.assertEqual(len(self.operations('restart')),1)
        self.assertTrue(any('celery_worker' in x for x in ups))
        self.assertTrue(any('celery_beat' in x for x in ups))
        self.assertEqual([x[-1] for x in self.calls if x[:2]==['docker','kill']], ['celery_beat-id','celery_worker-id','web-id'])
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

    def test_frontend_only_with_stopped_web_refuses_before_build_or_gateway_restart(self):
        result=self.release('--frontend-only',STOPPED_WRITERS='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('backend recovery',result.stderr)
        self.assertFalse(self.operations('build'))
        self.assertFalse(self.operations('up'))
        self.assertFalse(self.operations('restart'))

    def test_evicting_protected_state_refuses_before_build_or_writer_pause(self):
        result=self.release(EVICTING_STATE='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('noeviction',result.stderr)
        self.assertFalse(self.operations('build'))
        self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x for x in self.calls))

    def test_refresh_evicting_protected_state_refuses_before_writer_pause(self):
        result,calls=self.refresh(EVICTING_STATE='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('noeviction',result.stderr)
        self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x or 'DROP SCHEMA' in ' '.join(x) for x in calls))

    def test_policy_change_during_build_refuses_before_writer_pause(self):
        result=self.release(POLICY_CHANGED_DURING_BUILD='1')
        self.assertNotEqual(result.returncode,0)
        self.assertTrue(self.operations('build'))
        self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x for x in self.calls))

    def test_live_provider_refuses_deploy_before_build_or_writer_pause(self):
        for owner,key in [('WEB_STRIPE_KEY','sk_live_disposable123'),('MIGRATION_STRIPE_KEY','rk_live_disposable123')]:
            with self.subTest(owner=owner):
                result=self.release(**{owner:key})
                self.assertNotEqual(result.returncode,0)
                self.assertIn('provider preflight',result.stderr)
                self.assertNotIn(key,result.stderr+result.stdout)
                self.assertFalse(self.operations('build'))
                self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x for x in self.calls))

    def test_live_provider_refuses_refresh_before_service_or_database_changes(self):
        for owner,key in [('WEB_STRIPE_KEY','sk_live_disposable123'),('MIGRATION_STRIPE_KEY','rk_live_disposable123')]:
            with self.subTest(owner=owner):
                result,calls=self.refresh(**{owner:key})
                self.assertNotEqual(result.returncode,0)
                self.assertIn('provider preflight',result.stderr)
                self.assertNotIn(key,result.stderr+result.stdout)
                self.assertFalse(any('up' in x or x[:2]==['docker','kill'] or 'pg_dump' in x or 'pg_restore' in x for x in calls))

    def test_provider_preflight_fails_closed_without_echoing_invalid_input(self):
        import sys
        helper=Path(__file__).with_name('staging_provider_preflight.py')
        for payload in ('not-echoed-disposable',json.dumps({'services':{'web':{'environment':'not-echoed-disposable'}}})):
            result=subprocess.run([sys.executable,str(helper)],input=payload,capture_output=True,text=True,timeout=10)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('provider preflight',result.stderr)
            self.assertNotIn('not-echoed-disposable',result.stderr+result.stdout)

    def test_provider_preflight_accepts_test_or_disabled_collection(self):
        helper=Path(__file__).with_name('staging_provider_preflight.py')
        import sys
        for key in ('','sk_test_disposable123','rk_test_disposable123'):
            config={'services':{owner:{'environment':{'STRIPE_SECRET_KEY':key}} for owner in ('web','migration')}}
            result=subprocess.run([sys.executable,str(helper)],input=json.dumps(config),capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)

    def test_resource_budgets_require_explicit_opt_in(self):
        result=self.release()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any('docker-compose.staging.resources.yml' in x for x in self.calls))

    def test_accepted_resource_budget_is_used_by_every_compose_operation(self):
        result=self.release(STAGING_RESOURCE_BUDGET_APPROVED='1')
        self.assertEqual(result.returncode,0,result.stderr)
        compose=[x for x in self.calls if x[:2]==['docker','compose']]
        self.assertTrue(compose)
        self.assertTrue(all('docker-compose.staging.resources.yml' in x for x in compose))

    def test_invalid_resolved_resource_override_refuses_before_build_or_pause(self):
        result=self.release(STAGING_RESOURCE_BUDGET_APPROVED='1',STAGING_WEB_MEMORY_LIMIT='9g')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('aggregate',result.stderr)
        self.assertFalse(self.operations('build'))
        self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x for x in self.calls))

    def test_omitted_overlay_never_removes_existing_runtime_limits(self):
        result=self.release(EXISTING_RESOURCE_CAPS='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Existing staging limits',result.stderr)
        self.assertFalse(self.operations('build'))
        self.assertFalse(self.operations('up'))
        self.assertFalse(any(x[:2]==['docker','kill'] for x in self.calls))

    def test_refresh_uses_accepted_overlay_and_named_static_owner(self):
        result,calls=self.refresh(STAGING_RESOURCE_BUDGET_APPROVED='1')
        self.assertEqual(result.returncode,0,result.stderr)
        compose=[x for x in calls if x[:2]==['docker','compose']]
        self.assertTrue(all('docker-compose.staging.resources.yml' in x for x in compose))
        prepare=next(x for x in compose if 'run' in x)
        self.assertIn('chemisttasker_staging_migrate',prepare)

    def test_refresh_invalid_budget_refuses_before_database_or_writer_changes(self):
        result,calls=self.refresh(STAGING_RESOURCE_BUDGET_APPROVED='1',STAGING_WEB_MEMORY_LIMIT='9g')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('aggregate',result.stderr)
        self.assertFalse(any('up' in x or 'pg_dump' in x or x[:2]==['docker','kill'] for x in calls))

    def test_refresh_omitted_overlay_keeps_existing_limits(self):
        result,calls=self.refresh(EXISTING_RESOURCE_CAPS='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Existing staging limits',result.stderr)
        self.assertFalse(any('up' in x or 'pg_dump' in x or x[:2]==['docker','kill'] for x in calls))

    def test_any_leftover_migration_refuses_before_writer_pause(self):
        for state in ('created', 'exited', 'running'):
            with self.subTest(state=state):
                (self.root/'calls.jsonl').unlink(missing_ok=True)
                result=self.release(MIGRATION_STATE=state)
                self.assertNotEqual(result.returncode,0,result.stdout)
                self.assertFalse(self.operations('build'))
                self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x for x in self.calls))
                result,calls=self.refresh(MIGRATION_STATE=state)
                self.assertNotEqual(result.returncode,0,result.stdout)
                self.assertFalse(any('up' in x or x[:2]==['docker','kill'] or 'pg_dump' in x for x in calls))

    def test_ssh_hangup_records_failure_with_signal_exit(self):
        script=self.root/'scripts/deploy-staging.sh'
        script.write_text(script.read_text().replace('phase=build\n', 'phase=build\nkill -HUP \"$$\"\n'))
        result=self.release()
        failures=list((self.root/'ops').glob('release-*/failed.exit'))
        self.assertEqual(len(failures),1,result.stderr)
        self.assertEqual(failures[0].read_text().strip(),'129')
        self.assertEqual(result.returncode,129,result.stderr)
        self.assertFalse((self.root/'ops/deployed.commit').exists())

    def test_hangup_during_foreground_build_records_failure(self):
        result=self.release(HUP_DURING_BUILD='1')
        self.assertEqual(result.returncode,129,result.stderr)
        self.assertEqual(next((self.root/'ops').glob('release-*/failed.exit')).read_text().strip(),'129')

    def test_seed_failure_is_distinguished_from_smoke(self):
        result=self.release(FAIL_SEED='1')
        self.assertEqual(result.returncode,16,result.stderr)
        self.assertEqual(next((self.root/'ops').glob('release-*/phase')).read_text().strip(),'seed')
        self.assertFalse((self.root/'ops/deployed.commit').exists())

    def test_refresh_refuses_prior_running_migration_before_service_changes(self):
        result,calls=self.refresh(MIGRATION_RUNNING='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('container exists',result.stderr)
        self.assertFalse(any('up' in x or 'pg_dump' in x or x[:2]==['docker','kill'] for x in calls))

    def test_invalid_resource_acknowledgement_refuses_before_docker(self):
        result=self.release(STAGING_RESOURCE_BUDGET_APPROVED='yes')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any(x[0]=='docker' for x in self.calls))

    def test_explicit_worker_opt_out(self):
        result=self.release('--without-workers')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual([x[-1] for x in self.calls if x[:2]==['docker','kill']], ['celery_beat-id','celery_worker-id','web-id'])
        self.assertFalse(any('celery_worker' in x or 'celery_beat' in x for x in self.operations('up')))

    def test_build_failure_does_not_replace_running_services(self):
        self.assertNotEqual(self.release(FAIL_BUILD='1').returncode,0)
        self.assertFalse(self.operations('up'))
        self.assertFalse(self.operations('restart'))
        self.assertFalse(any('pg_dump' in x for x in self.calls))
        self.assertFalse(any(x[:2]==['docker','kill'] for x in self.calls))

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


    def test_disabled_or_active_prior_migration_refuses_before_build(self):
        for flag in ('DISABLE_MIGRATIONS','MIGRATION_RUNNING'):
            with self.subTest(flag=flag):
                self.assertNotEqual(self.release(**{flag:'1'}).returncode, 0)
                self.assertFalse(self.operations('build'))
                self.assertFalse(any(x[:2]==['docker','kill'] for x in self.calls))

    def refresh(self, *args, **extra):
        source=Path(__file__).with_name('refresh-staging-db.sh').read_text()
        backups=self.root/'backups'
        backups.mkdir(exist_ok=True)
        source=source.replace('/opt/backups/chemisttasker',str(backups))
        script=self.root/'scripts/refresh-staging-db.sh'
        script.write_text(source)
        (self.root/'scripts/reconcile-staging-migration-history.sh').write_text('#!/bin/sh\nexit 0\n')
        archive=backups/'synthetic.dump'
        archive.write_bytes(b'fixture')
        env={**os.environ,'FAKE_ROOT':str(self.root),'STAGING_OPS_DIR':str(self.root/'ops'),
             'PATH':str(self.root/'bin')+os.pathsep+os.environ['PATH'],'STAGING_STOP_TIMEOUT':'2','STAGING_RESOURCE_BUDGET_APPROVED':'0','STAGING_EXPECTED_SHA':'1'*40,**extra}
        result=subprocess.run(['bash',str(script),'--confirm-production-data',str(archive),*args],
                              env=env,capture_output=True,text=True,timeout=30)
        calls_path=self.root/'calls.jsonl'
        calls=[json.loads(x) for x in calls_path.read_text().splitlines()] if calls_path.exists() else []
        return result,calls

    def test_refresh_requires_reviewed_clean_source_before_any_docker_call(self):
        for flag in ({'STAGING_EXPECTED_SHA':''},{'WRONG_SHA':'1'},{'DIRTY_TREE':'1'}):
            with self.subTest(flag=flag):
                (self.root/'calls.jsonl').unlink(missing_ok=True)
                result,calls=self.refresh(**flag)
                self.assertNotEqual(result.returncode,0,result.stdout)
                self.assertFalse(any(x[0]=='docker' for x in calls))

    def test_refresh_explicit_sha_option_overrides_environment(self):
        result,calls=self.refresh('--expected-sha','2'*40)
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any(x[0]=='docker' for x in calls))
        (self.root/'calls.jsonl').unlink(missing_ok=True)
        result,calls=self.refresh('--expected-sha','1'*40,STAGING_EXPECTED_SHA='')
        self.assertEqual(result.returncode,0,result.stderr)

    def test_refresh_source_drift_after_build_keeps_writers_and_schema(self):
        result,calls=self.refresh(SOURCE_DRIFT_AFTER_BUILD='1')
        self.assertNotEqual(result.returncode,0)
        self.assertTrue(any('build' in x for x in calls))
        self.assertFalse(any(x[:2]==['docker','kill'] or 'DROP SCHEMA' in ' '.join(x) for x in calls))

    def test_refresh_source_drift_during_input_decode_keeps_writers_and_schema(self):
        result,calls=self.refresh(SOURCE_DRIFT_DURING_INPUT_DECODE='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Expected SHA',result.stderr)
        self.assertTrue(any('--file=/dev/null' in x for x in calls))
        self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x or 'DROP SCHEMA' in ' '.join(x) for x in calls))

    def test_refresh_source_drift_during_backup_keeps_schema(self):
        result,calls=self.refresh(SOURCE_DRIFT_DURING_BACKUP='1')
        self.assertNotEqual(result.returncode,0)
        self.assertTrue(any('pg_dump' in x for x in calls))
        self.assertFalse(any('DROP SCHEMA' in ' '.join(x) for x in calls))

    def test_refresh_build_failure_preserves_writers_and_schema(self):
        result,calls=self.refresh(FAIL_BUILD='1')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any(x[:2]==['docker','kill'] or 'pg_dump' in x or 'DROP SCHEMA' in ' '.join(x) for x in calls))

    def test_full_archive_decode_failure_never_publishes_backup_or_destroys_schema(self):
        result=self.release(FAIL_ARCHIVE_DATA='1')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(list((self.root/'backups').glob('*.dump')),[])
        self.assertEqual(list((self.root/'backups').glob('*.partial')),[], 'A rejected archive must not linger outside rotation')
        (self.root/'calls.jsonl').unlink()
        result,calls=self.refresh(FAIL_ARCHIVE_DATA='1')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any(x[:2]==['docker','kill'] or 'DROP SCHEMA' in ' '.join(x) for x in calls))
        staged=next(x for x in calls if x[:2]==['docker','cp'])[-1].split(':',1)[1]
        self.assertIn(['docker','exec','chemisttasker_postgres_staging','rm','-f',staged],calls,
                      'A refused refresh must remove its staged production copy')

    def test_refresh_rejected_rollback_archive_is_removed(self):
        result,_=self.refresh(FAIL_ROLLBACK_CHECK='1')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(list((self.root/'backups').glob('*.partial')),[])
        self.assertEqual(list((self.root/'backups').glob('staging-before-production-refresh-*.dump')),[])

    def test_refresh_cleanup_attempts_both_targets_and_preserves_original_failure(self):
        unlink=self.root/'bin/rm'
        unlink.write_text('#!/bin/sh\ncase "$*" in *.partial) exit 73 ;; esac\nexec /bin/rm "$@"\n')
        unlink.chmod(0o755)
        result,calls=self.refresh(FAIL_ROLLBACK_CHECK='1')
        self.assertEqual(result.returncode,12,result.stderr)
        staged=next(x for x in calls if x[:2]==['docker','cp'])[-1].split(':',1)[1]
        self.assertIn(['docker','exec','chemisttasker_postgres_staging','rm','-f',staged],calls)

    def test_refresh_input_is_copied_and_decoded_before_quiesce(self):
        result,calls=self.refresh()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(len(list((self.root/'backups').glob('staging-before-production-refresh-*.dump'))),1)
        self.assertTrue((self.root/'backups/synthetic.dump').is_file())
        copies=[i for i,x in enumerate(calls) if x[:2]==['docker','cp']]
        self.assertEqual(len(copies),1, 'Refresh must stage exactly one input, never copy after DROP')
        staged=copies[0]
        decoded=next(i for i,x in enumerate(calls) if '--file=/dev/null' in x)
        pause=next(i for i,x in enumerate(calls) if x[:2]==['docker','kill'])
        build=next(i for i,x in enumerate(calls) if x[:2]==['docker','compose'] and 'build' in x)
        self.assertLess(build,staged)
        self.assertLess(staged,decoded)
        self.assertLess(decoded,pause)

    def test_refresh_bad_input_archive_refuses_before_writer_pause_or_dump(self):
        result,calls=self.refresh(FAIL_RESTORE_CHECK='1')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any('pg_dump' in x or 'DROP SCHEMA' in ' '.join(x) or x[:2]==['docker','kill'] for x in calls))

    def test_refresh_bad_rollback_archive_never_destroys_schema(self):
        result,calls=self.refresh(FAIL_ROLLBACK_CHECK='1')
        self.assertNotEqual(result.returncode,0)
        self.assertTrue(any('pg_dump' in x for x in calls))
        self.assertFalse(any('DROP SCHEMA' in ' '.join(x) for x in calls))

    def test_refresh_stuck_writer_refuses_without_force_kill_or_dump(self):
        result,calls=self.refresh(STUCK_WRITER='1')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any('pg_dump' in x or 'DROP SCHEMA' in ' '.join(x) for x in calls))
        self.assertTrue(any(x[:2]==['docker','kill'] for x in calls))
        self.assertTrue(all('--signal=TERM' in x for x in calls if x[:2]==['docker','kill']))

    def test_refresh_collects_static_from_built_image_before_starting_web_without_migrations(self):
        result,calls=self.refresh()
        self.assertEqual(result.returncode,0,result.stderr)
        calls=[json.loads(x) for x in (self.root/'calls.jsonl').read_text().splitlines()]
        build=next(i for i,x in enumerate(calls) if x[:2]==['docker','compose'] and 'build' in x)
        prepare=next(i for i,x in enumerate(calls) if x[:2]==['docker','compose'] and 'run' in x)
        start=next(i for i,x in enumerate(calls) if x[:2]==['docker','compose'] and 'up' in x and 'web' in x)
        infrastructure=next(i for i,x in enumerate(calls) if x[:2]==['docker','compose'] and 'up' in x and 'redis' in x)
        self.assertIn('--no-recreate',calls[infrastructure])
        self.assertIn('redis_cache',calls[infrastructure])
        self.assertLess(infrastructure,prepare)
        dump=next(i for i,x in enumerate(calls) if 'pg_dump' in x)
        self.assertTrue(all(i<dump for i,x in enumerate(calls) if x[:2]==['docker','kill']))
        self.assertFalse(any('stop' in x and ('web' in x or 'celery_worker' in x) for x in calls))
        self.assertLess(build,prepare)
        self.assertLess(prepare,start)
        self.assertIn('RUN_MIGRATIONS=0',calls[prepare])
        self.assertEqual(calls[prepare][-1],'migration')

    def test_refresh_waits_for_gateway_health_before_public_smoke(self):
        result,calls=self.refresh(UNHEALTHY_GATEWAY='1')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('did not become healthy',result.stderr)
        self.assertFalse(any(x[0]=='curl' for x in calls))

    def test_migration_failure_never_starts_web_or_kills_migration(self):
        self.assertNotEqual(self.release(FAIL_MIGRATION='1').returncode, 0)
        migration=next(i for i,x in enumerate(self.calls) if x[:2]==['docker','compose'] and 'run' in x)
        self.assertFalse(any('web' in x for x in self.operations('up')))
        self.assertFalse(any(x[:2]==['docker','kill'] for x in self.calls[migration+1:]))
        self.assertFalse((self.root/'ops/deployed.commit').exists())

    def test_stopped_crashed_writers_do_not_block_recovery(self):
        result=self.release(STOPPED_WRITERS='1', FORCED_STOP='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(x[:2]==['docker','kill'] for x in self.calls))

    def test_slow_writer_is_not_force_killed_and_blocks_backup(self):
        result=self.release(STUCK_WRITER='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any('pg_dump' in x for x in self.calls))
        self.assertTrue(all('--signal=TERM' in x for x in self.calls if x[:2]==['docker','kill']))

    def test_independent_production_drift_warns_without_failing_staging(self):
        result=self.release(PRODUCTION_DRIFT='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('WARNING', result.stderr)
        record=json.loads(next((self.root/'ops').glob('release-*/release.json')).read_text())
        self.assertNotEqual(record['production_before'], record['production_after'])

    def test_checkout_config_preflight_is_isolated_from_running_gateway(self):
        result=self.release()
        self.assertEqual(result.returncode, 0, result.stderr)
        preflight=next(x for x in self.calls if x[:2]==['docker','run'])
        self.assertIn('none', preflight)
        self.assertIn('--mount', preflight)
        self.assertFalse(any(x[:2]==['docker','exec'] and 'nginx' in x for x in self.calls))

    def test_source_mismatch_and_dirty_tree_stop_before_build(self):
        for flag in ('WRONG_SHA', 'DIRTY_TREE'):
            with self.subTest(flag=flag):
                self.assertNotEqual(self.release(**{flag:'1'}).returncode, 0)
                self.assertFalse(self.operations('build'))

    def test_missing_db_or_forced_writer_stop_blocks_migration(self):
        for flag in ('MISSING_DB', 'FORCED_STOP'):
            with self.subTest(flag=flag):
                self.assertNotEqual(self.release(**{flag:'1'}).returncode, 0)
                self.assertFalse(self.operations('up'))
                self.assertFalse(any('pg_dump' in x for x in self.calls))

    def test_writers_stop_before_final_backup(self):
        self.assertEqual(self.release().returncode, 0)
        stops = [i for i,x in enumerate(self.calls) if x[:2]==['docker','kill']]
        dump = next(i for i,x in enumerate(self.calls) if 'pg_dump' in x)
        self.assertTrue(stops)
        self.assertLess(max(stops), dump)

    def test_failed_web_or_smoke_preserves_prior_release_record(self):
        ops = self.root/'ops'
        ops.mkdir()
        (ops/'deployed.commit').write_text('previous\n')
        for flag in ('FAIL_WEB', 'FAIL_SMOKE'):
            with self.subTest(flag=flag):
                self.assertNotEqual(self.release(**{flag:'1'}).returncode, 0)
                self.assertEqual((ops/'deployed.commit').read_text(), 'previous\n')
                self.assertFalse(any('celery_worker' in x or 'celery_beat' in x for x in self.operations('up')))

    def test_success_records_expected_commit_after_smoke(self):
        self.assertEqual(self.release().returncode, 0)
        self.assertEqual((self.root/'ops/deployed.commit').read_text().strip(), '1'*40)
        records=list((self.root/'ops').glob('release-*/release.json'))
        self.assertEqual(len(records), 1)
        record=json.loads(records[0].read_text())
        self.assertEqual(record['status'], 'passed')
        self.assertEqual(len(record['current_images']), 5)
        self.assertEqual(len(record['previous_images']), 5)
        self.assertEqual(record['sha'], '1'*40)

    def test_db_refresh_obeys_the_same_release_lock(self):
        import fcntl, uuid
        ops=self.root/'ops'
        ops.mkdir()
        script=self.root/'scripts/refresh-staging-db.sh'
        shutil.copyfile(Path(__file__).with_name('refresh-staging-db.sh'),script)
        backups=self.root/'backups'
        backups.mkdir(parents=True,exist_ok=True)
        backup=backups/('readiness-synthetic-'+uuid.uuid4().hex+'.dump')
        backup.write_bytes(b'disposable fixture; never restored')
        script.write_text(script.read_text().replace('/opt/backups/chemisttasker',str(backups)))
        try:
            env={**os.environ,'STAGING_OPS_DIR':str(ops),'FAKE_ROOT':str(self.root),'STAGING_EXPECTED_SHA':'1'*40,
                 'PATH':str(self.root/'bin')+os.pathsep+os.environ['PATH']}
            with (ops/'deploy.lock').open('w') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
                result=subprocess.run(['bash',str(script),'--confirm-production-data',str(backup)],
                    env=env,capture_output=True,text=True,timeout=15)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('lock',result.stderr.lower())
            calls=[json.loads(line) for line in (self.root/'calls.jsonl').read_text().splitlines()]
            self.assertFalse(any(call[0]=='docker' for call in calls))
        finally:
            assert backup.resolve().parent==backups.resolve()
            backup.unlink(missing_ok=True)

    def test_concurrent_release_refuses_before_docker_calls(self):
        import fcntl
        ops=self.root/'ops'
        ops.mkdir()
        with (ops/'deploy.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertNotEqual(self.release().returncode, 0)
        self.assertFalse(any(x[0]=='docker' for x in self.calls))


if __name__=='__main__':
    unittest.main()

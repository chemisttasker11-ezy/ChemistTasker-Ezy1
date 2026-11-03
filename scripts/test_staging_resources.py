"""Validate default staging budgets via the actual Compose parser; no daemon needed."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest

from staging_resource_budget import validate_budget


ROOT=Path(__file__).resolve().parent.parent


class StagingResourceContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        env={k:v for k,v in os.environ.items() if not (k.startswith('STAGING_') and k.endswith(('_MEMORY_LIMIT','_CPUS','_PIDS_LIMIT')))}
        env.update({key:'disposable-test-only' for key in (
            'STAGING_DJANGO_SECRET_KEY','STAGING_POSTGRES_PASSWORD','RECAPTCHA_SECRET_KEY',
            'VITE_Maps_API_KEY','VITE_RECAPTCHA_SITE_KEY')})
        cls.compose_env=env
        result=subprocess.run(['docker','compose','-f',str(ROOT/'docker-compose.staging.yml'),
            '-f',str(ROOT/'docker-compose.staging.resources.yml'),
            '--profile','workers','--profile','release','config','--format','json'],
            env=env,capture_output=True,text=True,timeout=30)
        if result.returncode:raise RuntimeError('Compose resource config did not parse; inspect privately')
        cls.services=json.loads(result.stdout)['services']
        for service in cls.services.values():
            service['mem_limit']=int(service['mem_limit'])
            service['pids_limit']=int(service['pids_limit'])

    def test_resolved_operator_overrides_are_validated(self):
        validate_budget(self.services)
        env={**self.compose_env,'STAGING_REDIS_MEMORY_LIMIT':'300m'}
        result=subprocess.run(['docker','compose','-f',str(ROOT/'docker-compose.staging.yml'),
            '-f',str(ROOT/'docker-compose.staging.resources.yml'),'--profile','workers','--profile','release',
            'config','--format','json'],env=env,capture_output=True,text=True,timeout=30,check=True)
        with self.assertRaisesRegex(ValueError,'Protected Redis'):
            validate_budget(json.loads(result.stdout)['services'])

    def test_regular_compose_does_not_adopt_unaccepted_limits(self):
        result=subprocess.run(['docker','compose','-f',str(ROOT/'docker-compose.staging.yml'),
            'config','--format','json'],env=self.compose_env,capture_output=True,text=True,timeout=30,check=True)
        services=json.loads(result.stdout)['services']
        for name in ('postgres','web','gateway'):
            self.assertNotIn('mem_limit',services[name])

    def test_every_owner_has_finite_runtime_and_logging_bounds(self):
        for name,service in self.services.items():
            with self.subTest(service=name):
                self.assertGreater(service['mem_limit'],0)
                self.assertGreater(float(service['cpus']),0)
                self.assertGreater(service['pids_limit'],0)
                self.assertEqual(service['logging']['driver'],'json-file')
                self.assertEqual(service['logging']['options'],{'max-size':'10m','max-file':'5'})

    def test_aggregate_runtime_keeps_measured_host_headroom(self):
        memory=sum(s['mem_limit'] for s in self.services.values())
        cpus=sum(float(s['cpus']) for s in self.services.values())
        self.assertLessEqual(memory,8*1024**3)
        self.assertLessEqual(cpus,6)
        self.assertIn('migration',self.services)
        self.assertIn('redis_cache',self.services)

    def test_redis_dataset_margins_and_worker_drain_are_preserved(self):
        self.assertGreaterEqual(self.services['redis']['mem_limit'],3*256*1024**2)
        self.assertGreater(self.services['redis_cache']['mem_limit'],96*1024**2)
        self.assertIn('--concurrency=2',self.services['celery_worker']['command'])
        for name in ('web','celery_worker'):
            self.assertEqual(self.services[name]['stop_grace_period'],'2m0s')

    def test_sampler_understands_docker_decimal_and_binary_units(self):
        spec=importlib.util.spec_from_file_location('resource_sampler',ROOT/'scripts/measure-staging-resources.py')
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.memory_bytes('1.5GiB'),1610612736)
        self.assertEqual(module.memory_bytes('128MiB'),134217728)
        self.assertEqual(module.memory_bytes('25.5MB'),25500000)
        self.assertEqual(module.memory_bytes('0B'),0)


if __name__=='__main__':unittest.main(verbosity=2)

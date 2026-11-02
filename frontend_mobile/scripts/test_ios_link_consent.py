"""Black-box bootstrap recovery contracts; fake Maestro/simctl, no actual simulator."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


TOOL = r'''#!/usr/bin/env python3
import json,os,pathlib,sys
root=pathlib.Path(os.environ['CT_IOS_TEST_DIR']);tool=pathlib.Path(sys.argv[0]).name
path=root/'calls.jsonl';prior=[json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
with path.open('a') as log:log.write(json.dumps([tool,*sys.argv[1:]])+'\n')
mode=os.environ['CT_IOS_TEST_MODE']
if tool=='maestro':
    attempt=1+sum(row[0]=='maestro' for row in prior)
    if mode=='success' or (mode in {'once','boot-fails'} and attempt==2):sys.exit(0)
    if mode=='assertion':print('Assertion failed: expected Welcome Native');sys.exit(7)
    print('xcuitest.installer.LocalXCTestInstaller$IOSDriverTimeoutException: iOS driver not ready in time')
    sys.exit(130 if mode=='cancel' else 7)
if tool=='xcrun' and mode=='boot-fails' and sys.argv[1:3]==['simctl','boot']:sys.exit(17)
'''


@unittest.skipUnless(os.name=='posix','Bash maintenance harness')
class IOSLinkConsentTests(unittest.TestCase):
    simulator='12345678-1234-1234-1234-123456789abc'

    def run_consent(self,mode,simulator=None):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'bin').mkdir()
            for name in ('maestro','xcrun'):
                tool=root/'bin'/name;tool.write_text(TOOL);tool.chmod(0o755)
            flow=root/'consent.yaml';flow.write_text('appId: com.chemisttasker.app\n---\n- launchApp\n')
            env={**os.environ,'CT_IOS_TEST_DIR':str(root),'CT_IOS_TEST_MODE':mode,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH']}
            result=subprocess.run(['bash',str(Path(__file__).with_name('run-ios-link-consent.sh')),simulator or self.simulator,str(flow),str(root/'attempt')],env=env,capture_output=True,text=True,timeout=15)
            calls=root/'calls.jsonl';rows=[json.loads(line) for line in calls.read_text().splitlines()] if calls.exists() else []
            logs={p.name:p.read_text() for p in root.glob('attempt-*.log')}
            return result,rows,logs

    def test_success_does_not_reset_or_retry(self):
        result,calls,logs=self.run_consent('success')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual([row[0] for row in calls],['maestro'])
        self.assertEqual(calls[0][1:4],['--device',self.simulator,'test'])
        self.assertEqual(set(logs),{'attempt-1.log'})

    def test_bootstrap_timeout_reboots_only_selected_simulator_once(self):
        result,calls,logs=self.run_consent('once')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual([row[0] for row in calls],['maestro','xcrun','xcrun','xcrun','maestro'])
        self.assertEqual(calls[1:4],[['xcrun','simctl','shutdown',self.simulator],['xcrun','simctl','boot',self.simulator],['xcrun','simctl','bootstatus',self.simulator,'-b']])
        self.assertIn('IOSDriverTimeoutException',logs['attempt-1.log'])
        self.assertEqual(set(logs),{'attempt-1.log','attempt-2.log'})

    def test_application_assertion_failure_is_never_retried(self):
        result,calls,_=self.run_consent('assertion')
        self.assertEqual(result.returncode,7)
        self.assertEqual(len(calls),1)

    def test_second_bootstrap_failure_stays_failed(self):
        result,calls,_=self.run_consent('always')
        self.assertEqual(result.returncode,7)
        self.assertEqual(sum(row[0]=='maestro' for row in calls),2)
        self.assertEqual(sum(row[1:3]==['simctl','shutdown'] for row in calls),1)

    def test_cancel_is_never_retried_even_with_bootstrap_text(self):
        result,calls,_=self.run_consent('cancel')
        self.assertEqual(result.returncode,130)
        self.assertEqual(len(calls),1)

    def test_boot_failure_stops_without_second_maestro_attempt(self):
        result,calls,_=self.run_consent('boot-fails')
        self.assertEqual(result.returncode,17)
        self.assertEqual(sum(row[0]=='maestro' for row in calls),1)

    def test_invalid_simulator_is_refused_before_commands(self):
        result,calls,_=self.run_consent('success','all')
        self.assertEqual(result.returncode,2)
        self.assertEqual(calls,[])


if __name__=='__main__':unittest.main()

"""Verify real staging/Vite Nginx compression through an isolated Docker proxy."""
import gzip
import http.client
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import uuid


class StagingAssetProxyTests(unittest.TestCase):
    def test_gateway_negotiates_gzip_for_vite_javascript(self):
        root=Path(__file__).resolve().parents[1]
        # Exercise the same pinned gateway image as the staging declaration.
        match=re.search(r'^    image:\s*(nginx:\S+)\s*$', (root/'docker-compose.staging.yml').read_text(), re.MULTILINE)
        self.assertIsNotNone(match, 'Staging must declare its NGINX image')
        image=match.group(1)
        with tempfile.TemporaryDirectory() as directory:
            html=Path(directory)
            html.chmod(0o755)  # Nginx workers must traverse the bind mount on Linux.
            (html/'js').mkdir()
            body=b'console.log("staging asset proxy regression");\n'*2000
            (html/'js/app.review.js').write_bytes(body)
            name='ct-staging-asset-test-'+uuid.uuid4().hex[:10]
            args=['docker','run','-d','--name',name,'--memory','128m','--cpus','0.5','--pids-limit','64',
                  '--add-host','frontend:127.0.0.1','--add-host','web:127.0.0.1','--add-host','landing:127.0.0.1',
                  '-p','127.0.0.1::8080',
                  '--mount',f'type=bind,source={root/"nginx/staging.conf"},target=/etc/nginx/conf.d/staging.conf,readonly',
                  '--mount',f'type=bind,source={root/"frontend_web/nginx-spa.conf"},target=/etc/nginx/conf.d/default.conf,readonly',
                  '--mount',f'type=bind,source={html},target=/usr/share/nginx/html,readonly',
                  image]
            try:
                subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
                port=int(subprocess.check_output(['docker','inspect','-f',
                    '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}',name],text=True).strip())
                for attempt in range(30):
                    try:
                        client=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
                        self.addCleanup(client.close)
                        client.request('GET','/js/app.review.js',headers={'Accept-Encoding':'gzip'})
                        response=client.getresponse()
                        compressed=response.read()
                        break
                    except (ConnectionError,OSError):
                        if attempt==29: raise
                        time.sleep(.2)
                self.assertEqual(response.status,200)
                self.assertEqual(response.getheader('Content-Encoding'),'gzip')
                self.assertIn('Accept-Encoding',response.getheader('Vary',''))
                self.assertEqual(gzip.decompress(compressed),body)
                client.close()
                client=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
                self.addCleanup(client.close)
                client.request('GET','/js/app.review.js',headers={'Accept-Encoding':'identity'})
                response=client.getresponse()
                self.assertEqual(response.status,200)
                self.assertIsNone(response.getheader('Content-Encoding'))
                self.assertEqual(response.read(),body)
                client.close()
            finally:
                subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


    def test_open_tab_assets_survive_replacement_and_html_is_not_cached(self):
        root = Path(__file__).resolve().parents[1]
        image = re.search(r'^    image:\s*(nginx:\S+)\s*$',
            (root/'docker-compose.staging.yml').read_text(), re.MULTILINE).group(1)
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            work.chmod(0o755)
            old, current, archive = (work/name for name in ('old', 'current', 'archive'))
            for folder in (old, current, archive):
                folder.mkdir(mode=0o755)
                (folder/'js').mkdir()
                (folder/'dashboard-assets').mkdir()
            (old/'js/ChatPage.12345678.js').write_bytes(b'export default "old chat";')
            (old/'dashboard-assets/app.12345678.css').write_bytes(b'body{color:green}')
            (current/'js/app.87654321.js').write_bytes(b'console.log("current");')
            (current/'js/shared.12345678.js').write_bytes(b'export default "shared";')
            (current/'index.html').write_bytes(b'<html>current app entry</html>')
            startup = str(root/'frontend_web/40-retain-assets.sh')
            base = ['docker', 'run', '--network', 'none', '--user', f'{os.getuid()}:{os.getgid()}',
                    '--memory', '128m', '--cpus', '0.5',
                    '--pids-limit', '64', '--mount',
                    f'type=bind,source={archive},target=/var/cache/chemisttasker-assets',
                    '--mount', f'type=bind,source={startup},target=/retain.sh,readonly']
            def retain(source, allow_empty=False):
                approval = ["-e", "STAGING_ALLOW_EMPTY_FRONTEND_ARCHIVE=1"] if allow_empty else []
                return subprocess.run([*base, *approval, '--rm', '--entrypoint', '/bin/sh', '--mount',
                    f'type=bind,source={source},target=/usr/share/nginx/html,readonly',
                    image, '/retain.sh'], capture_output=True, text=True)
            self.assertNotEqual(retain(old).returncode, 0, 'An unseeded existing install must fail closed')
            result = retain(old, allow_empty=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((archive/'index.html').exists())
            expired = archive/'js/expired.12345678.js'
            expired.write_bytes(b'expired')
            active = archive/'js/shared.12345678.js'
            active.write_bytes((current/'js/shared.12345678.js').read_bytes())
            long_ago = time.time()-40*86400
            os.utime(expired, (long_ago, long_ago))
            os.utime(active, (long_ago, long_ago))
            for prior in (archive/'js/ChatPage.12345678.js', archive/'dashboard-assets/app.12345678.css'):
                os.utime(prior, (long_ago, long_ago))
            seeded = archive/'js/seeded.12345678.js'
            seeded.write_bytes(b'imported from old image')
            os.utime(seeded, (0, 0))
            # Simulate first adoption from a tar archive with epoch-zero file mtimes.
            (archive/'.active-assets').unlink()
            self.assertEqual(retain(old).returncode, 0)
            self.assertTrue(seeded.exists())
            # Then simulate a previous active release which ran for forty days.
            for prior in (archive/'js/ChatPage.12345678.js', archive/'dashboard-assets/app.12345678.css'):
                os.utime(prior, (long_ago, long_ago))
            os.utime(expired, (long_ago, long_ago))
            result = retain(current)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(expired.exists())
            self.assertTrue(active.exists(), 'A current asset must be refreshed before pruning')
            # A hash-name collision must fail closed, without overwriting earlier content.
            (old/'js/shared.12345678.js').write_bytes(b'different bytes at same hash')
            result = retain(old)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(active.read_bytes(), b'export default "shared";')
            name = 'ct-retained-asset-test-'+uuid.uuid4().hex[:10]
            try:
                subprocess.run(['docker', 'run', '-d', '--name', name, '--memory', '128m',
                    '--cpus', '0.5', '--pids-limit', '64', '-p', '127.0.0.1::80',
                    '--mount', f'type=bind,source={current},target=/usr/share/nginx/html,readonly',
                    '--mount', f'type=bind,source={archive},target=/var/cache/chemisttasker-assets,readonly',
                    '--mount', f'type=bind,source={root/"frontend_web/nginx-spa.conf"},target=/etc/nginx/conf.d/default.conf,readonly',
                    image], check=True, stdout=subprocess.DEVNULL)
                port = int(subprocess.check_output(['docker', 'inspect', '-f',
                    '{{(index (index .NetworkSettings.Ports "80/tcp") 0).HostPort}}', name], text=True).strip())
                for attempt in range(30):
                    try:
                        client = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                        client.request('GET', '/dashboard/pharmacist/chat')
                        response = client.getresponse()
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.getheader('Cache-Control'), 'no-store')
                        self.assertEqual(response.read(), (current/'index.html').read_bytes())
                        client.close()
                        break
                    except (ConnectionError, OSError):
                        if attempt == 29: raise
                        time.sleep(.2)
                for path, content in [('/js/ChatPage.12345678.js', b'export default "old chat";'),
                    ('/dashboard-assets/app.12345678.css', b'body{color:green}'),
                    ('/js/app.87654321.js', b'console.log("current");')]:
                    client = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                    try:
                        client.request('GET', path)
                        response = client.getresponse()
                        self.assertEqual(response.status, 200, path)
                        self.assertIn('immutable', response.getheader('Cache-Control', ''))
                        self.assertEqual(response.read(), content, path)
                    finally:
                        client.close()
                client = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                try:
                    client.request('GET', '/js/unknown.12345678.js')
                    response = client.getresponse()
                    self.assertEqual(response.status, 404)
                    self.assertNotIn('immutable', response.getheader('Cache-Control', ''))
                    response.read()
                finally:
                    client.close()
            finally:
                subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__=='__main__':
    unittest.main()

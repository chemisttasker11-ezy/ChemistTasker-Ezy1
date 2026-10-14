"""Verify real staging/Vite Nginx compression through an isolated Docker proxy."""
import gzip
import http.client
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import uuid


class StagingAssetProxyTests(unittest.TestCase):
    def test_gateway_negotiates_gzip_for_vite_javascript(self):
        root=Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            html=Path(directory)
            html.chmod(0o755)  # Nginx workers must traverse the bind mount on Linux.
            (html/'js').mkdir()
            body=b'console.log("staging asset proxy regression");\n'*2000
            (html/'js/app.review.js').write_bytes(body)
            name='ct-staging-asset-test-'+uuid.uuid4().hex[:10]
            args=['docker','run','-d','--name',name,
                  '--add-host','frontend:127.0.0.1','--add-host','web:127.0.0.1','--add-host','landing:127.0.0.1',
                  '-p','127.0.0.1::8080',
                  '--mount',f'type=bind,source={root/"nginx/staging.conf"},target=/etc/nginx/conf.d/staging.conf,readonly',
                  '--mount',f'type=bind,source={root/"frontend_web/nginx-spa.conf"},target=/etc/nginx/conf.d/default.conf,readonly',
                  '--mount',f'type=bind,source={html},target=/usr/share/nginx/html,readonly',
                  'nginx:1.27.5-alpine']
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


if __name__=='__main__':
    unittest.main()

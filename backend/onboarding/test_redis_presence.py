"""Disposable presence hints must not acquire security authority or fail on outage."""
from unittest.mock import patch

from django.core.cache import caches
from django.test import SimpleTestCase, override_settings
from redis.exceptions import ConnectionError as RedisConnectionError

from onboarding.test_ahpra_desktop import TEST_CACHES
from onboarding.verification.desktop import extension_verifier_present, verifier_seen


@override_settings(CACHES=TEST_CACHES)
class VerifierPresenceOutageTests(SimpleTestCase):
    def test_read_outage_falls_back_without_accessing_protected_caches(self):
        with patch.object(caches['verifier_presence'], 'get', side_effect=RedisConnectionError), \
             patch.object(caches['ahpra'], 'get') as protected, \
             patch.object(caches['security'], 'get') as security, \
             self.assertLogs('onboarding.verification.desktop', level='WARNING'):
            self.assertFalse(extension_verifier_present())
        protected.assert_not_called()
        security.assert_not_called()

    def test_write_outage_is_only_a_lost_hint(self):
        with patch.object(caches['verifier_presence'], 'set', side_effect=RedisConnectionError), \
             patch.object(caches['ahpra'], 'set') as protected, \
             self.assertLogs('onboarding.verification.desktop', level='WARNING'):
            verifier_seen('extension')
        protected.assert_not_called()

    def test_available_presence_keeps_routing_and_ttl(self):
        caches['verifier_presence'].clear()
        self.assertFalse(extension_verifier_present())
        verifier_seen('extension')
        self.assertTrue(extension_verifier_present())
        caches['verifier_presence'].clear()


    def test_presence_socket_timeout_is_bounded_against_unresponsive_peer(self):
        import socket
        import time
        from threading import Event, Thread
        from core.settings import CACHES as BASE_CACHES
        options=BASE_CACHES['verifier_presence']['OPTIONS']
        self.assertEqual(options['socket_connect_timeout'],1)
        self.assertEqual(options['socket_timeout'],1)
        stop=Event()
        with socket.create_server(('127.0.0.1',0)) as listener:
            listener.settimeout(3)
            def blackhole():
                try:
                    with listener.accept()[0]:stop.wait(3)
                except OSError:pass
            peer=Thread(target=blackhole,daemon=True)
            peer.start()
            config={**TEST_CACHES,'verifier_presence':{
                'BACKEND':'django.core.cache.backends.redis.RedisCache',
                'LOCATION':f'redis://127.0.0.1:{listener.getsockname()[1]}/0',
                'OPTIONS':options}}
            try:
                start=time.monotonic()
                with override_settings(CACHES=config), self.assertLogs('onboarding.verification.desktop',level='WARNING'):
                    self.assertFalse(extension_verifier_present())
                self.assertLess(time.monotonic()-start,2.5)
            finally:
                stop.set()
                peer.join(timeout=3)


    def test_channel_socket_timeout_exceeds_healthy_blocking_receive(self):
        from core.settings import _REDIS_CHANNEL_LAYERS as BASE_CHANNELS
        from channels_redis.core import RedisChannelLayer
        layer=RedisChannelLayer(**BASE_CHANNELS['default']['CONFIG'])
        options=layer.create_pool(0).connection_kwargs
        self.assertEqual(options['socket_connect_timeout'],1)
        self.assertEqual(options['socket_timeout'],10)
        self.assertGreater(options['socket_timeout'],layer.brpop_timeout)


    def test_channel_group_send_times_out_against_unresponsive_peer(self):
        import socket
        import time
        from threading import Event, Thread
        from asgiref.sync import async_to_sync
        from channels_redis.core import RedisChannelLayer
        from core.settings import _REDIS_CHANNEL_LAYERS as BASE_CHANNELS
        from redis.exceptions import TimeoutError as RedisTimeoutError
        stop=Event()
        with socket.create_server(('127.0.0.1',0)) as listener:
            listener.settimeout(15)
            def blackhole():
                try:
                    with listener.accept()[0]:stop.wait(20)
                except OSError:pass
            peer=Thread(target=blackhole,daemon=True)
            peer.start()
            host={**BASE_CHANNELS['default']['CONFIG']['hosts'][0],
                  'address':f'redis://127.0.0.1:{listener.getsockname()[1]}/0'}
            layer=RedisChannelLayer(hosts=[host])
            try:
                start=time.monotonic()
                with self.assertRaises(RedisTimeoutError):
                    async_to_sync(layer.group_send)('resource-timeout-test',{'type':'test.message'})
                self.assertLess(time.monotonic()-start,13)
            finally:
                stop.set()
                peer.join(timeout=3)

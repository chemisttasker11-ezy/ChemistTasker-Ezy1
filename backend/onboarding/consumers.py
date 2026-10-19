import asyncio
import hashlib
import hmac
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings

from onboarding.models import AhpraCheck
from onboarding.verification.desktop import apply_ahpra_result, claim_checks, valid_result


class AhpraVerifierConsumer(AsyncJsonWebsocketConsumer):
    authenticated = False
    ready = False

    def token_valid(self, token):
        expected = settings.AHPRA_VERIFIER_TOKEN_SHA256
        return bool(expected and isinstance(token, str) and token and hmac.compare_digest(
            hashlib.sha256(token.encode()).hexdigest(), expected,
        ))

    async def connect(self):
        self.timer = None
        if not settings.AHPRA_VERIFIER_TOKEN_SHA256:
            await self.close(code=4401)
            return
        header = dict(self.scope.get('headers', [])).get(b'authorization')
        if header is not None:
            scheme, _, token = header.decode('utf-8', errors='replace').partition(' ')
            if scheme.lower() != 'bearer' or not self.token_valid(token):
                await self.close(code=4401)
                return
            self.authenticated = True
        await self.accept()
        self.timer = asyncio.create_task(self.heartbeat())

    async def heartbeat(self):
        await asyncio.sleep(10)
        if not self.ready:
            await self.close(code=4401)
            return
        while True:
            await self.send_json({'type': 'ping'})
            await asyncio.sleep(30)

    async def disconnect(self, code):
        if self.timer:
            self.timer.cancel()
        if self.ready:
            await self.channel_layer.group_discard('ahpra_verifiers', self.channel_name)

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        try:
            payload = json.loads(text_data) if text_data is not None else None
        except (ValueError, TypeError):
            payload = None
        if not isinstance(payload, dict):
            await self.close(code=4401 if not self.ready else 4400)
            return
        await self.receive_json(payload)

    async def receive_json(self, content, **kwargs):
        if not self.ready:
            if (content.get('type') != 'hello' or not isinstance(content.get('agent'), str)
                    or not (self.authenticated or self.token_valid(content.get('token')))):
                await self.close(code=4401)
                return
            self.authenticated = self.ready = True
            await self.channel_layer.group_add('ahpra_verifiers', self.channel_name)
            await self.send_json({'type': 'ready'})
            for message in await database_sync_to_async(claim_checks)():
                await self.send_json(message)
        elif content.get('type') == 'result' and valid_result(content):
            if await database_sync_to_async(self.apply_result)(content):
                await self.send_json({'type': 'ack', 'check_id': content['check_id']})
        # pong and unknown message types require no response.

    @staticmethod
    def apply_result(payload):
        check = AhpraCheck.objects.filter(pk=payload['check_id']).exclude(status='done').first()
        return check is not None and apply_ahpra_result(check, payload)

    async def ahpra_check(self, event):
        for message in await database_sync_to_async(claim_checks)(event['check_id']):
            await self.send_json(message)

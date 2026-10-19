import asyncio
import hashlib
import hmac
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings

from onboarding.verification.desktop import (
    claim_checks, handle_verifier_result, renew_lease, store_repair_report, valid_result, verifier_seen,
)


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
        self.inflight = None
        self.dispatching = False
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
            if self.inflight is not None:
                if not await database_sync_to_async(renew_lease)(self.inflight, self.kind):
                    self.inflight = None
            await self.dispatch_check()
            await asyncio.sleep(30)

    async def disconnect(self, code):
        if self.timer:
            self.timer.cancel()
        if self.ready:
            await self.channel_layer.group_discard(f'ahpra_verifiers_{self.kind}', self.channel_name)

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
                    or content.get('kind', 'bridge') not in ('extension', 'bridge')
                    or not (self.authenticated or self.token_valid(content.get('token')))):
                await self.close(code=4401)
                return
            self.authenticated = self.ready = True
            self.kind = content.get('kind', 'bridge')
            await database_sync_to_async(verifier_seen)(self.kind)
            await self.channel_layer.group_add(f'ahpra_verifiers_{self.kind}', self.channel_name)
            await self.send_json({'type': 'ready'})
            await self.dispatch_check()
        elif content.get('type') == 'result' and valid_result(content):
            if await database_sync_to_async(handle_verifier_result)(content, self.kind):
                await self.send_json({'type': 'ack', 'check_id': content['check_id']})
                if self.inflight == content['check_id']:
                    self.inflight = None
                    await self.dispatch_check()
        elif content.get('type') in ('pong', 'heartbeat'):
            await database_sync_to_async(verifier_seen)(self.kind)
        elif content.get('type') == 'repair_report' and self.kind == 'bridge':
            await database_sync_to_async(store_repair_report)(content)
        # pong and unknown message types require no response.

    async def ahpra_check(self, event):
        await self.dispatch_check()

    async def dispatch_check(self):
        if self.inflight is not None or self.dispatching:
            return
        self.dispatching = True
        try:
            for message in await database_sync_to_async(claim_checks)(stage=self.kind, limit=1):
                self.inflight = message['check_id']
                await self.send_json(message)
        finally:
            self.dispatching = False

    async def ahpra_repair(self, event):
        if self.kind == 'bridge':
            await self.send_json(event['message'])

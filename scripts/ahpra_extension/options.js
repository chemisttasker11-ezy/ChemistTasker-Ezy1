'use strict';
let enabled = false;
async function refresh() {
  const s = await chrome.runtime.sendMessage({type: 'status'});
  if (s.error) throw new Error(s.error);
  enabled = s.enabled;
  document.querySelector('#toggle').textContent = enabled ? 'Disconnect' : 'Connect';
  document.querySelector('#resume').hidden = !s.paused;
  document.querySelector('#status').textContent = `${s.connected ? 'Connected' : enabled ? 'Connecting' : 'Disconnected'} \u00b7 Queue: ${s.queueSize ?? 0} \u00b7 Last result: ${s.lastResultAt || 'never'}${s.paused ? ' \u00b7 Paused: human check required' : ''}${s.connectError ? ` \u00b7 Error: ${s.connectError}` : ''}`;
  for (const id of ['url', 'token', 'gap']) document.getElementById(id).disabled = enabled;
}
document.querySelector('#settings').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await chrome.runtime.sendMessage({type: 'configure', enabled: !enabled,
      url: document.querySelector('#url').value.trim(), token: document.querySelector('#token').value.trim(),
      gap: Number(document.querySelector('#gap').value)});
    if (result?.error) throw new Error(result.error);
    document.querySelector('#error').textContent = '';
    await refresh();
  } catch (error) { document.querySelector('#error').textContent = error.message; }
});
document.querySelector('#resume').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({type: 'resume'});
  await refresh();
});
(async () => {
  const {config = {}} = await chrome.storage.local.get('config');
  document.querySelector('#url').value = config.url || '';
  document.querySelector('#token').value = config.token || '';
  document.querySelector('#gap').value = config.gap || 30;
  await refresh();
  setInterval(() => refresh().catch(error => { document.querySelector('#status').textContent = error.message; }), 2000);
})().catch(error => { document.querySelector('#error').textContent = error.message; });

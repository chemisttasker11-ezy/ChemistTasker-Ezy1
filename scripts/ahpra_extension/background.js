'use strict';
const REGISTER_URL = 'https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx';
const NOTICE = 'ahpra-blocked';
let config = {enabled: false, gap: 30};
let state = {queue: [], outbox: [], active: null, paused: false, lastStarted: 0, lastResultAt: null, blockedResults: []};
let socket, authenticated = false, reconnectTimer, heartbeat, queueTimer, jobTimer;
let backoff = 5000, nextConnectAt = 0, pumping = false, connectError = '';
let writes = Promise.resolve();
function save() {
  const snapshot = JSON.parse(JSON.stringify(state));
  writes = writes.then(() => chrome.storage.local.set({state: snapshot}));
  return writes;
}
const initialized = (async () => {
  await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  const stored = await chrome.storage.local.get(['config', 'state']);
  Object.assign(config, stored.config);
  Object.assign(state, stored.state);
  await chrome.alarms.create('restore', {periodInMinutes: 1});
  if (state.active) {
    // A worker restart cannot safely establish how far a lookup progressed.
    await finish(state.active.check_id, 'error', null, 'Service worker restarted during lookup');
  }
})();
function transmit(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function flush() {
  if (authenticated) for (const result of state.outbox) transmit(result);
}
function reconnect() {
  if (!config.enabled) return;
  clearTimeout(reconnectTimer);
  nextConnectAt = Date.now() + backoff;
  reconnectTimer = setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 300000);
}
function connect() {
  if (!config.enabled || socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
  clearTimeout(reconnectTimer);
  try { socket = new WebSocket(config.url); } catch (error) { connectError = error.message; reconnect(); return; }
  const current = socket;
  current.onopen = () => {
    if (socket !== current) return;
    transmit({type: 'hello', agent: 'chrome-extension', token: config.token});
    // Websocket traffic keeps Chrome 116+ service workers alive. No applicant data.
    heartbeat = setInterval(() => transmit({type: 'pong'}), 20000);
  };
  current.onmessage = event => {
    if (socket !== current) return;
    receive(event.data).catch(() => current.close());
  };
  current.onerror = () => current.close();
  current.onclose = event => {
    if (socket !== current) return;
    connectError = event.reason || `Connection closed (code ${event.code}); retrying`;
    clearInterval(heartbeat);
    authenticated = false;
    socket = null;
    reconnect();
  };
}
async function receive(data) {
  let message;
  try { message = JSON.parse(data); } catch { return; }
  if (!message || typeof message !== 'object') return;
  if (message.type === 'ping') { transmit({type: 'pong'}); return; }
  if (message.type === 'ready') {
    authenticated = true;
    connectError = '';
    backoff = 5000;
    flush();
    void pump();
  } else if (message.type === 'ack') {
    state.outbox = state.outbox.filter(item => item.check_id !== message.check_id);
    await save();
  } else if (authenticated && message.type === 'check' && Number.isSafeInteger(message.check_id) &&
      typeof message.registration_number === 'string' && /^[A-Z]{3}\d{10}$/i.test(message.registration_number)) {
    const blockedResult = state.blockedResults.find(item => item.check_id === message.check_id);
    if (blockedResult) { transmit(blockedResult); return; }
    if (state.outbox.some(item => item.check_id === message.check_id)) { flush(); return; }
    if (state.active?.check_id === message.check_id || state.queue.some(item => item.check_id === message.check_id)) return;
    state.queue.push({check_id: message.check_id, registration_number: message.registration_number.toUpperCase()});
    await save();
    void pump();
  }
}
async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({target: {tabId}, files: ['parser.js', 'content.js']});
  } catch {
    // Navigation can destroy an injection context; onUpdated injects the new document.
  }
}
async function pump() {
  if (pumping || !config.enabled || !authenticated || state.paused || state.active || !state.queue.length) return;
  const delay = state.lastStarted + config.gap * 1000 - Date.now();
  clearTimeout(queueTimer);
  if (delay > 0) { queueTimer = setTimeout(() => void pump(), delay); return; }
  pumping = true;
  const job = state.queue.shift();
  state.lastStarted = Date.now();
  // Two attempts of 60 seconds each; the overall deadline bounds both.
  state.active = {...job, tabId: null, step: 'search', deadline: Date.now() + 120000, attemptDeadline: Date.now() + 60000};
  try {
    await save();
    jobTimer = setTimeout(() => void finish(job.check_id, 'error', null, 'Lookup timed out after 120 seconds'), 120000);
    await openTab(state.active);
  } catch (error) { await finish(job.check_id, 'error', null, error.message); }
  finally { pumping = false; void pump(); }
}
async function openTab(job) {
  // Create blank first so the tab belongs to this job before navigation completes.
  const tab = await chrome.tabs.create({url: 'about:blank', active: false});
  job.tabId = tab.id;
  await save();
  await chrome.tabs.update(tab.id, {url: REGISTER_URL});
}
// A slow AHPRA page load is a flake, so retry once in a fresh tab; parse errors and challenges are not retried.
async function retry(job) {
  const oldTab = job.tabId;
  Object.assign(job, {tabId: null, step: 'search', retried: true, attemptDeadline: Math.min(Date.now() + 60000, job.deadline - 5000)});
  try {
    await save();
    // tabId is cleared first so onRemoved does not finish the check.
    if (oldTab != null) await chrome.tabs.remove(oldTab).catch(() => {});
    await openTab(job);
  } catch (error) { await finish(job.check_id, 'error', null, error.message); }
}
async function finish(checkId, outcome, record, error = '') {
  if (!state.active || state.active.check_id !== checkId) return;
  const job = state.active;
  if (outcome === 'error' && !job.retried && ['Practitioner record did not load', 'AHPRA returned no recognizable search results'].includes(error)) {
    await retry(job);
    return;
  }
  clearTimeout(jobTimer);
  state.active = null;
  if (outcome === 'blocked') state.paused = true;
  const result = {type: 'result', check_id: checkId, outcome, checked_at: new Date().toISOString(), register: record, error};
  state.lastResultAt = result.checked_at;
  state.outbox.push(result);
  if (outcome === 'blocked') state.blockedResults.push(result);
  await save();
  flush();
  if (outcome === 'blocked') {
    await chrome.notifications.create(NOTICE, {type: 'basic', iconUrl: 'icon.png', title: 'AHPRA check needs you',
      message: 'AHPRA check needs you: please open the register tab and complete the check, then click Resume',
      buttons: [{title: 'Resume'}], requireInteraction: true});
  } else if (job.tabId != null) {
    await chrome.tabs.remove(job.tabId).catch(() => {});
  }
  void pump();
}
async function resume() {
  state.paused = false;
  await save();
  await chrome.notifications.clear(NOTICE);
  void pump();
}
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  void initialized.then(() => {
    if (state.active?.tabId === tabId && change.status === 'complete' && tab.url?.startsWith('https://www.ahpra.gov.au/')) void inject(tabId);
  });
});
chrome.tabs.onRemoved.addListener(tabId => {
  void initialized.then(() => {
    if (state.active?.tabId === tabId) void finish(state.active.check_id, 'error', null, 'Lookup tab was closed');
  });
});
chrome.alarms.onAlarm.addListener(() => {
  void initialized.then(async () => {
    if (state.active && Date.now() >= state.active.deadline) await finish(state.active.check_id, 'error', null, 'Lookup timed out after 120 seconds');
    if (Date.now() >= nextConnectAt) connect();
    void pump();
  });
});
chrome.notifications.onButtonClicked.addListener((id, button) => {
  if (id === NOTICE && button === 0) void initialized.then(resume);
});
chrome.notifications.onClicked.addListener(id => {
  if (id === NOTICE) void chrome.runtime.openOptionsPage();
});
chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    await initialized;
    // The options page also runs in a tab, so tell content scripts apart by origin.
    if (sender.origin !== self.location.origin) {
      if (sender.tab.id !== state.active?.tabId || sender.frameId !== 0) return {};
      if (message.type === 'lookup') return state.active;
      // AHPRA's links are javascript: URLs, which the extension CSP blocks; clicking in the page's world uses its CSP.
      if (message.type === 'click') {
        const [{result}] = await chrome.scripting.executeScript({target: {tabId: sender.tab.id}, world: 'MAIN',
          args: [String(message.selector), Number(message.index) || 0],
          func: (selector, index) => {
            const element = [...document.querySelectorAll(selector)].filter(e => e.getClientRects().length)[index];
            element?.click();
            return !!element;
          }});
        return {clicked: result};
      }
      // Steps only move forward, so a page reload never repeats the search for this check.
      if (message.type === 'step' && message.check_id === state.active.check_id &&
          ['submitted', 'opened'].includes(message.step)) { state.active.step = message.step; await save(); }
      if (message.type === 'lookupResult' && message.check_id === state.active.check_id &&
          ['found', 'not_found', 'blocked', 'error'].includes(message.outcome)) {
        await finish(message.check_id, message.outcome, message.outcome === 'found' ? message.register : null, String(message.error || '').slice(0, 1000));
      }
      return {};
    }
    if (message.type === 'status') return {enabled: config.enabled, connected: authenticated, queueSize: state.queue.length + (state.active ? 1 : 0), lastResultAt: state.lastResultAt, paused: state.paused, connectError};
    if (message.type === 'resume') await resume();
    if (message.type === 'configure') {
      if (message.enabled) {
        let url;
        try { url = new URL(message.url); } catch { throw new Error('Enter a valid websocket URL'); }
        if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a ws:// or wss:// URL without embedded credentials');
        if (!message.token || !Number.isInteger(message.gap) || message.gap < 1) throw new Error('Token and a positive whole number gap are required');
        config = {enabled: true, url: url.href, token: message.token, gap: message.gap};
      } else config.enabled = false;
      connectError = '';
      await chrome.storage.local.set({config});
      clearTimeout(reconnectTimer);
      clearInterval(heartbeat);
      authenticated = false;
      const previous = socket;
      socket = null;
      previous?.close();
      backoff = 5000;
      connect();
    }
    return {};
  })().then(reply, error => reply({error: error.message}));
  return true;
});
void initialized.then(connect);



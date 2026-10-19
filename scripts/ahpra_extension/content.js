'use strict';
(() => {
  if (globalThis.__chemistAhpraRunning) return;
  globalThis.__chemistAhpraRunning = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const blocked = () => /just a moment/i.test(document.title) || !!document.querySelector(
    'iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], [id*="turnstile"], [class*="turnstile"]');
  const pageText = () => document.body?.innerText || '';
  const noResults = () => /\bno\s+(?:results|matches|practitioners|records)(?:\s+(?:were\s+)?found)?\b|\b0\s+(?:results|matches|practitioners|records)\b|no matching practitioners/i.test(pageText());
  function checkChallenge() { if (blocked()) throw new Error('AHPRA challenge requires a human'); }
  async function waitFor(read, milliseconds) {
    const until = Date.now() + milliseconds;
    while (Date.now() < until) {
      checkChallenge();
      const value = read();
      if (value) return value;
      await sleep(250);
    }
    checkChallenge();
    return null;
  }
  (async () => {
    const job = await chrome.runtime.sendMessage({type: 'lookup'});
    if (!job?.registration_number) return;
    const number = job.registration_number;
    const normalize = value => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const recordReady = () => /Registration details/i.test(pageText()) &&
      normalize(pageText()).includes(number) && /Registration status/i.test(pageText());
    const matchingLink = () => {
      const candidates = document.querySelectorAll('tr, [role="option"], li, .predictiveSearchResult, .predictive-search-result');
      for (const row of candidates) {
        if (!row.getClientRects().length || !normalize(row.innerText || '').includes(number)) continue;
        const links = [...row.querySelectorAll('a[href]')];
        const link = links.find(a => normalize(a.innerText || '').includes(number)) || links.find(a => {
          try { return new URL(a.href).origin === location.origin && !/^javascript:/i.test(a.getAttribute('href')); }
          catch { return false; }
        });
        if (link) return link;
      }
      return [...document.querySelectorAll('a[href]')].find(a => a.getClientRects().length && normalize(a.innerText || '').includes(number));
    };
    let outcome = 'error', register = null, error = '';
    try {
      checkChallenge();
      if (!recordReady() && noResults()) outcome = 'not_found';
      const existingLink = !recordReady() && outcome !== 'not_found' ? matchingLink() : null;
      if (existingLink) {
        existingLink.click();
        if (!await waitFor(recordReady, 15000)) throw new Error('Practitioner record did not load');
      }
      if (!recordReady() && outcome !== 'not_found') {
        const input = await waitFor(() => document.querySelector('#name-reg'), 10000);
        if (!input) throw new Error('AHPRA registration search input was not found');
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, number);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
        let match = await waitFor(() => recordReady() ? 'record' : matchingLink(), 15000);
        if (!match) {
          const button = document.querySelector('#predictiveSearchHomeBtn');
          if (!button) {
            if (noResults()) outcome = 'not_found';
            else throw new Error('AHPRA search button was not found');
          } else {
            button.click();
            // Allow the previous predictive results to be replaced by search results.
            await sleep(750);
            match = await waitFor(() => recordReady() ? 'record' : matchingLink() || (noResults() ? 'none' : null), 15000);
            if (match === 'none') outcome = 'not_found';
          }
        }
        if (match && match !== 'record' && match !== 'none') match.click();
        if (outcome !== 'not_found') {
          if (!match) throw new Error('AHPRA returned no recognizable search results');
          if (!await waitFor(recordReady, 15000)) throw new Error('Practitioner record did not load');
        }
      }
      if (outcome !== 'not_found') {
        checkChallenge();
        register = parseRecordText(pageText(), number);
        if (!register.name || !register.profession || !register.registration_status) throw new Error('Practitioner record is missing required fields');
        if ([register.conditions, register.undertakings, register.reprimands].some(value => value === null)) throw new Error('Practitioner restriction sections could not be read');
        outcome = 'found';
      }
    } catch (failure) {
      outcome = blocked() ? 'blocked' : 'error';
      register = null;
      error = failure.message;
    }
    await chrome.runtime.sendMessage({type: 'lookupResult', check_id: job.check_id, outcome, register, error});
  })().catch(() => {});
})();


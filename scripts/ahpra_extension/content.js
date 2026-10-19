'use strict';
(() => {
  if (globalThis.__chemistAhpraRunning) return;
  globalThis.__chemistAhpraRunning = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const blocked = () => /just a moment/i.test(document.title) || !!document.querySelector(
    'iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], [id*="turnstile"], [class*="turnstile"]');
  const pageText = () => document.body?.innerText || '';
  // AHPRA's live empty page: "We cannot find any matches for 'PHA0001803269'." (tied to the searched number).
  const noResults = number => /\bno\s+(?:results|matches|practitioners|records)(?:\s+(?:were\s+)?found)?\b|\b0\s+(?:results|matches|practitioners|records)\b|no matching practitioners/i.test(pageText()) ||
    new RegExp(`cannot find any matches for\\W*${number.replace(/[^A-Za-z0-9]/g, '')}\\b`, 'i').test(pageText());
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
    // Selectors from the AHPRA register DOM (same ones the old ScrapingBee flow used).
    const recordReady = () => !!document.querySelector('.practitioner-detail-header .practitioner-name') &&
      normalize(pageText()).includes(number);
    const resultSelector = '.search-results-table-row .search-results-table-col .text a';
    const resultLinks = () => [...document.querySelectorAll(resultSelector)].filter(a => a.getClientRects().length);
    const setStep = step => chrome.runtime.sendMessage({type: 'step', check_id: job.check_id, step});
    // The background clicks in the page's world (index counts visible matches), so AHPRA's javascript: links may run.
    async function pageClick(selector, index = 0) {
      // Background errors come back as {error}; a rejection means the click already navigated this page away.
      const response = await chrome.runtime.sendMessage({type: 'click', selector, index}).catch(() => ({clicked: true}));
      if (!response?.clicked) throw new Error(response?.error || `AHPRA element ${selector} could not be clicked`);
    }
    let outcome = 'error', register = null, error = '';
    try {
      checkChallenge();
      // The step lives in the background, so a re-injected script continues instead of searching again.
      if (job.step === 'search') {
        const input = await waitFor(() => document.querySelector('#name-reg'), 10000);
        if (!input) throw new Error('AHPRA registration search input was not found');
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, number);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
        input.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true}));
        await sleep(1500);
        const button = await waitFor(() => document.querySelector('#predictiveSearchHomeBtn'), 5000);
        if (!button) throw new Error('AHPRA search button was not found');
        await setStep('submitted');
        await pageClick('#predictiveSearchHomeBtn');
      }
      if (job.step !== 'opened') {
        const found = await waitFor(() => recordReady() ? 'record' : resultLinks().length ? 'results' : noResults(number) ? 'none' : null, 20000);
        if (!found) throw new Error('AHPRA returned no recognizable search results');
        if (found === 'none') outcome = 'not_found';
        if (found === 'results') {
          await sleep(1000);
          const links = resultLinks();
          if (links.length !== 1) throw new Error(`Expected one search result, found ${links.length}`);
          await setStep('opened');
          await pageClick(resultSelector);
        }
      }
      if (outcome !== 'not_found' && !await waitFor(recordReady, job.attemptDeadline - Date.now())) throw new Error('Practitioner record did not load');
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


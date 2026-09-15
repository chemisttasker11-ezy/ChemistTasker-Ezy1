/* Isolated review prototype. No API, authentication or production data access. */
(() => {
  'use strict';
  const { tokens, skills } = window.CT_BRAND;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (text) => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
    bottle:'<rect x="7" y="2" width="10" height="4" rx="1"/><rect x="4" y="9" width="16" height="13" rx="4"/><path d="M8 6v3m8-3v3m-8 7 3 3 5-6"/>',
    window:'<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M2 8h20M8 8v13"/>',
    spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-2v4m-2-2h4"/>',
    type:'<path d="M3 5h12M9 5v16M18 11h5m-2-3v13"/>',
    sliders:'<path d="M4 3v4m0 4v10M12 3v10m0 4v4M20 3v2m0 4v12"/><circle cx="4" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="20" cy="7" r="2"/>',
    moon:'<path d="M20 15a8 8 0 0 1-11-11A9 9 0 1 0 20 15Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    store:'<path d="M3 9h18l-2-6H5L3 9Zm1 0v12h16V9M9 21v-7h6v7M8 3 7 9m9-6 1 6"/>',
    pill:'<path d="m8 4-4 4a6 6 0 0 0 8 8l4-4a6 6 0 0 0-8-8Zm-3 3 8 8" transform="translate(2 2)"/>',
    compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
    calendar:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 4h2"/>',
    link:'<path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    alert:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v.1"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    chat:'<path d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6 4V4a1 1 0 0 1 1-1ZM7 8h10M7 12h6"/>',
    person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>'
  };
  const icon = (name) => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
  const skillIcon = (skill) => `<svg viewBox="0 0 24 24" aria-hidden="true">${skill.svg}</svg>`;
  const categories = { clinical_services:'Clinical & credentials', dispense_software:'Dispensing software', expanded_scope:'Expanded scope' };
  const descriptions = {
    owner:'For pharmacy owners and the teams they lead.',
    pharmacist:'For pharmacists building a working life that fits.',
    otherstaff:'For assistants, technicians and pharmacy staff.',
    explorer:'For people finding their way into pharmacy.'
  };
  const defaults = ['VACCINATION','FIRST_AID','FRED','MEDSCHECK'];
  const state = { persona:'owner', dark:false, view:'dashboard', category:'all', query:'', selected:new Set(defaults), finish:'colour' };
  let toastTimer;
  function toast(text) {
    clearTimeout(toastTimer);
    const target = $('#toast');
    target.textContent = text;
    target.hidden = false;
    toastTimer = setTimeout(() => { target.hidden = true; }, 4200);
  }
  function hydrateIcons(root = document) {
    $$('[data-icon]',root).forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  }
  function applyTheme() {
    const p = tokens.personas[state.persona];
    const theme = tokens.themes[state.dark ? 'dark':'light'];
    for (const [key,value] of Object.entries(theme)) document.documentElement.style.setProperty('--'+key.replace(/[A-Z]/g, c => '-'+c.toLowerCase()),value);
    for (const [key,value] of Object.entries({accent:p.colour,'on-accent':p.onColour,'accent-text':state.dark?p.darkText:p.text,'accent-soft':state.dark?p.darkSoft:p.soft,'accent-hover':p.hover})) document.documentElement.style.setProperty('--'+key,value);
    document.documentElement.style.colorScheme = state.dark?'dark':'light';
    document.documentElement.dataset.theme = state.dark?'dark':'light';
    const themeButton=$('#theme-toggle');
    themeButton.innerHTML=icon(state.dark?'sun':'moon');
    themeButton.setAttribute('aria-pressed',String(state.dark));
    themeButton.setAttribute('aria-label',`Switch to ${state.dark?'light':'dark'} theme`);
    $('.studio-logo img').src=`assets/logos/stacked-${state.dark?'reverse':'colour'}.svg`;
    $('#preview-persona').innerHTML=`<i aria-hidden="true"></i>${esc(p.name)} workspace`;
    renderPersonas();
    renderWorkspace();
  }
  function renderPersonas() {
    $('#persona-grid').innerHTML=Object.entries(tokens.personas).map(([key,p],i)=>`<button class="persona-card" data-persona="${key}" aria-pressed="${key===state.persona}" aria-label="Preview ${esc(p.name)} persona" style="--p:${p.colour};--p-on:${p.onColour};--p-text:${state.dark?p.darkText:p.text}"><div class="persona-swatch">${icon(p.glyph)}<span>0${i+1}</span></div><div class="persona-body"><strong>${esc(p.name)}</strong><p>${descriptions[key]}</p><div class="persona-bottom"><span>${p.colour}</span>${icon(key===state.persona?'check':'arrow')}</div></div></button>`).join('');
  }
  function renderLogos() {
    $('#logo-grid').innerHTML=[['bottle','The bottle','App icon · favicon · compact spaces'],['stacked','The signature','Rx accent · original-inspired layout'],['wordmark','The wordmark','Navigation · emails · wide formats']].map(([file,name,caption])=>`<article class="logo-card"><div class="logo-display ${['reverse','mono-white'].includes(state.finish)?'is-reverse':''}"><img src="assets/logos/${file}-${state.finish}.svg" alt="${esc(name)} — ${state.finish}" loading="lazy"></div><div class="logo-card-foot"><div><strong>${name}</strong><small>${caption}</small></div><a class="download-icon" href="assets/logos/${file}-${state.finish}.svg" download aria-label="Download ${esc(name)} ${state.finish} SVG">${icon('download')}</a></div></article>`).join('');
  }
  function badges() {
    const selected=skills.filter(s=>state.selected.has(s.code));
    return selected.length ? selected.map(s=>`<span class="skill-badge">${skillIcon(s)}<span>${esc(s.label)}</span></span>`).join(''):'<p>No example skills selected. Add skills from the library below.</p>';
  }
  function renderWorkspace() {
    const p=tokens.personas[state.persona];
    const management=state.persona==='owner';
    const explorer=state.persona==='explorer';
    const nav=[['grid','Overview','dashboard'],[management?'store':'calendar',management?'Pharmacies & team':'My shifts',''],['people','Talent Hub','talent'],['calendar','Calendar',''],['chat','Messages','']];
    const mockNav=`<aside class="mock-nav" aria-label="Illustrative navigation"><div class="mock-brand"><img src="assets/logos/bottle-${state.dark?'reverse':'colour'}.svg" alt="">ChemistTasker</div><div class="mock-scope">${esc(p.short)} workspace</div>${nav.map(([glyph,label,view])=>`<div class="mock-nav-item ${view===state.view?'chosen':''}">${icon(glyph)}${label}</div>`).join('')}<div class="mock-bottom">Your people. Connected.</div></aside>`;
    const intro=`<div class="mock-top"><div><h3>${state.view==='talent'?'Talent, with a little more context.':management?'Your pharmacy, at a glance.':explorer?'Your next chapter starts here.':'Your working week, connected.'}</h3><p>${state.view==='talent'?'Discover the person behind the profile.':'A clearer view of the things that matter today.'}</p></div><span class="mock-date">Monday, 7 September</span></div>`;
    const metrics=management?[['Upcoming shifts','12','Across your pharmacies'],['Team members','24','Your connected team'],['Pharmacies','3','One shared workspace']]:explorer?[['Opportunities','8','Discover your next step'],['Saved profiles','3','Your example shortlist'],['Connections','6','Your growing network']]:[['Upcoming shifts','4','Your working week'],['Pharmacy teams','3','Your connected network'],['Profile skills',String(state.selected.size),'In this example']];
    const dashboard=`<div class="metrics">${metrics.map(([label,value,note],i)=>`<div class="metric ${i===0?'highlight':''}"><span class="metric-label">${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}</div><div class="mock-content"><div class="mock-card"><h4>${explorer?'An opportunity to explore':'Coming up next'}</h4><div class="shift-row"><div class="date-tile"><span>SEP</span><strong>09</strong></div><div><strong>${explorer?'Pharmacy placement':'Community pharmacy shift'}</strong><small>Example Pharmacy · Brisbane</small><small>${explorer?'Learn with a supportive team':'9:00 am – 5:00 pm'}</small></div></div><p>Illustrative content for layout review.</p></div><div class="mock-card"><h4>${management?'Example team member’s skills':explorer?'Example pharmacist’s skills':'Your example skill profile'}</h4><div class="skill-badges">${badges()}</div><p>Skill labels describe the example profile. Verification is shown separately.</p></div></div>`;
    const talent=`<article class="talent-card"><div class="candidate-head"><div class="avatar" aria-hidden="true">AM</div><div><h4>Alex Morgan</h4><p>Pharmacist / locum · Brisbane, QLD</p></div><span class="availability-tag">Example profile</span></div><p class="talent-description">A clear snapshot of skills and software experience, with room for the person behind them.</p><div class="skill-badges">${badges()}</div><div class="candidate-footer"><span>Illustrative skills · certification not assessed</span><button class="button primary" data-open-profile>Preview profile ${icon('arrow')}</button></div></article>`;
    $('#workspace-preview').innerHTML=mockNav+`<div class="mock-main">${intro}${state.view==='dashboard'?dashboard:talent}</div>`;
  }
  function renderSkills() {
    const query=state.query.toLocaleLowerCase().trim();
    const matches=skills.filter(s=>(state.category==='all'||s.category===state.category)&&`${s.label} ${s.code} ${s.description||''}`.toLocaleLowerCase().includes(query));
    $('#skill-count').textContent=`${matches.length} of ${skills.length} skills · ${state.selected.size} in the example profile`;
    $('#skill-grid').innerHTML=matches.length?matches.map(s=>`<article class="skill-card ${state.selected.has(s.code)?'is-selected':''}" data-skill="${s.code}"><button class="skill-card-main" data-details="${s.code}" aria-label="View ${esc(s.label)} icon details"><span class="skill-icon-tile">${skillIcon(s)}</span><strong>${esc(s.label)}</strong><small>${esc(categories[s.category])}</small></button><div class="skill-card-footer"><button class="skill-toggle" data-toggle="${s.code}" aria-pressed="${state.selected.has(s.code)}" aria-label="${state.selected.has(s.code)?'Remove':'Add'} ${esc(s.label)} ${state.selected.has(s.code)?'from':'to'} example profile">${icon(state.selected.has(s.code)?'check':'plus')}${state.selected.has(s.code)?'In example':'Add to example'}</button><a class="download-icon" href="${s.file}" download aria-label="Download ${esc(s.label)} SVG">${icon('download')}</a></div></article>`).join(''):'<div class="no-results"><strong>No matching skills</strong><p>Try a different search or choose All skills.</p><button class="text-button" id="clear-search">Clear search and filters</button></div>';
  }
  function toggleSkill(code, returnFocus=true) {
    if(!skills.some(s=>s.code===code)) return;
    if(state.selected.has(code)) state.selected.delete(code); else state.selected.add(code);
    renderSkills(); renderWorkspace();
    if(returnFocus) $(`[data-toggle="${code}"]`)?.focus({preventScroll:true});
  }
  function openSkill(code) {
    const s=skills.find(skill=>skill.code===code);
    if(!s) return;
    $('#skill-dialog-content').innerHTML=`<div class="dialog-skill-icon">${skillIcon(s)}</div><h2 id="skill-dialog-title">${esc(s.label)}</h2><p>${esc(s.description||categories[s.category])}</p><div class="dialog-code">${s.code}</div><p>${s.requires_certificate?'The existing catalogue requires a certificate for this entry. An uploaded document and a verified credential are separate states.':'The existing catalogue does not flag a required certificate for this entry. This is not a statement of professional eligibility or verification.'}</p><div class="dialog-actions"><button class="button primary" id="dialog-toggle-skill" data-code="${s.code}">${state.selected.has(code)?'Remove from':'Add to'} example ${icon(state.selected.has(code)?'close':'plus')}</button><a class="button secondary" href="${s.file}" download>Download SVG ${icon('download')}</a></div>`;
    $('#skill-dialog').showModal();
  }
  $('#persona-grid').addEventListener('click',e=>{
    const button=e.target.closest('[data-persona]');if(!button)return;
    state.persona=button.dataset.persona;applyTheme();
    $(`[data-persona="${state.persona}"]`).focus({preventScroll:true});
    toast(`${tokens.personas[state.persona].name} accent applied to the showcase.`);
  });
  $('#theme-toggle').addEventListener('click',()=>{state.dark=!state.dark;applyTheme();});
  $('#logo-finish').addEventListener('change',e=>{state.finish=e.target.value;renderLogos();});
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    state.view=button.dataset.view;
    $$('[data-view]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
    renderWorkspace();
  }));
  $$('[data-category]').forEach(button=>button.addEventListener('click',()=>{
    state.category=button.dataset.category;
    $$('[data-category]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});renderSkills();
  }));
  $('#skill-search').addEventListener('input',e=>{state.query=e.target.value;renderSkills();});
  $('#reset-skills').addEventListener('click',()=>{state.selected=new Set(defaults);renderSkills();renderWorkspace();toast('The four original example skills have been restored.');});
  $('#skill-grid').addEventListener('click',e=>{
    const detail=e.target.closest('[data-details]');if(detail){openSkill(detail.dataset.details);return;}
    const toggle=e.target.closest('[data-toggle]');if(toggle){toggleSkill(toggle.dataset.toggle);return;}
    if(e.target.closest('#clear-search')){state.query='';state.category='all';$('#skill-search').value='';$$('[data-category]').forEach(b=>{b.classList.toggle('selected',b.dataset.category==='all');b.setAttribute('aria-pressed',String(b.dataset.category==='all'));});renderSkills();$('#skill-search').focus();}
  });
  $('#skill-dialog-content').addEventListener('click',e=>{
    const button=e.target.closest('#dialog-toggle-skill');if(!button)return;
    const code=button.dataset.code;toggleSkill(code,false);$('#skill-dialog').close();$(`[data-details="${code}"]`)?.focus({preventScroll:true});
  });
  $$('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  const openExample=()=>$('#example-dialog').showModal();
  $('#demo-dialog').addEventListener('click',openExample);
  $('#workspace-preview').addEventListener('click',e=>{if(e.target.closest('[data-open-profile]'))openExample();});
  $('#confirm-example').addEventListener('click',()=>{$('#example-dialog').close();toast('Dialog confirmed. This was a local preview only.');});
  $('#demo-primary').addEventListener('click',()=>toast('This is how action feedback appears. No live action was performed.'));
  $('#demo-skill').innerHTML=skills.map(s=>`<option value="${s.code}">${esc(s.label)}</option>`).join('');
  $('#demo-form').addEventListener('submit',e=>{
    e.preventDefault();const name=$('#display-name').value.trim();
    $('#name-error').hidden=Boolean(name);$('#display-name').setAttribute('aria-invalid',String(!name));
    if(!name){$('#form-result').textContent='';$('#display-name').focus();return;}
    const s=skills.find(s=>s.code===$('#demo-skill').value);
    if($('#demo-consent').checked){state.selected.add(s.code);renderSkills();renderWorkspace();}
    $('#form-result').textContent=`Preview ready for ${name}. ${$('#demo-consent').checked?s.label+' added to the example profile.':'No skills added.'} Nothing was saved.`;
  });
  $('#display-name').addEventListener('input',()=>{if($('#display-name').value.trim()){$('#name-error').hidden=true;$('#display-name').setAttribute('aria-invalid','false');}});
  $$('.spacing-bars span').forEach(el=>el.dataset.value=el.textContent);
  $('#certificate-skill').innerHTML=skillIcon(skills.find(s=>s.code==='VACCINATION'))+'<span>Vaccination</span>';
  hydrateIcons();applyTheme();renderLogos();renderSkills();
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;
    $$('.studio-sidebar nav a').forEach(link=>{const active=link.hash==='#'+visible.target.id;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
  },{rootMargin:'-90px 0px -55% 0px',threshold:[0,.1,.5]});
  $$('main section[id]').forEach(section=>observer.observe(section));
})();

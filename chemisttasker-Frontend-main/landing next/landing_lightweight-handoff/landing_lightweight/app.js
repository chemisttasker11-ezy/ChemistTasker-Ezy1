const roles = [
  {
    "label": "Pharmacy owners",
    "heading": "More visibility. Less chasing.",
    "text": "A home for your pharmacies, people and everyday operations. Move from managing a shift to managing your whole team.",
    "benefits": [
      "Manage multiple pharmacies",
      "Post shifts and coordinate coverage",
      "Keep your team and invoices organised"
    ],
    "button": "Explore for pharmacies",
    "role": "Owner workspace",
    "metric": "Your pharmacy network",
    "items": [
      "Harbour Health Pharmacy",
      "Riverside Community Pharmacy",
      "Parkside Pharmacy"
    ],
    "icon": "building"
  },
  {
    "label": "Pharmacists",
    "heading": "Work that fits your world.",
    "text": "Discover opportunities, share your availability and stay connected to the pharmacy teams you work with.",
    "benefits": [
      "Find shifts that suit your schedule",
      "Manage confirmed and past shifts",
      "Keep memberships and invoices together"
    ],
    "button": "Explore for pharmacists",
    "role": "Pharmacist workspace",
    "metric": "Your next opportunities",
    "items": [
      "Community pharmacist",
      "Weekend locum shift",
      "Pharmacist in charge"
    ],
    "icon": "calendar"
  },
  {
    "label": "Other staff",
    "heading": "Every role belongs here.",
    "text": "Assistants, technicians and other pharmacy staff have a workspace of their own, with the tools to organise their working day.",
    "benefits": [
      "Publish and update availability",
      "View your roster and shifts",
      "Connect through chat and Pharmacy Hub"
    ],
    "button": "Explore for pharmacy staff",
    "role": "Staff workspace",
    "metric": "Your work, in one place",
    "items": [
      "My roster",
      "Published availability",
      "Team announcements"
    ],
    "icon": "users"
  },
  {
    "label": "Organisations",
    "heading": "One view across your network.",
    "text": "Bring your pharmacy locations together with shared oversight and access suited to each team member’s responsibilities.",
    "benefits": [
      "Oversee pharmacy locations",
      "Manage memberships and delegated access",
      "Coordinate people across your organisation"
    ],
    "button": "Explore for organisations",
    "role": "Organisation workspace",
    "metric": "Across your organisation",
    "items": [
      "Pharmacy locations",
      "Team memberships",
      "Admin permissions"
    ],
    "icon": "dashboard"
  }
];
const tiers = [
  {
    "name": "Store Team",
    "short": "Start close to home.",
    "text": "Offer the shift to the people at your own pharmacy first.",
    "audience": "Your immediate branch staff",
    "icon": "store",
    "colour": "#aa7bff"
  },
  {
    "name": "Selected Stores",
    "short": "Reach your sister stores.",
    "text": "If cover is still needed, extend the invitation to selected stores and regional staff.",
    "audience": "Your selected pharmacy network",
    "icon": "building",
    "colour": "#43d7e3"
  },
  {
    "name": "Favourite Locums",
    "short": "Call on familiar faces.",
    "text": "Bring the opportunity to your curated network of trusted locum pharmacists.",
    "audience": "Your favourite casual professionals",
    "icon": "star",
    "colour": "#f1b965"
  },
  {
    "name": "All Organisation Staff",
    "short": "Connect the whole organisation.",
    "text": "Widen the search to eligible staff across your organisation’s pharmacy network.",
    "audience": "Your wider organisation",
    "icon": "users",
    "colour": "#f282c9"
  },
  {
    "name": "Public Pool",
    "short": "Open up the possibilities.",
    "text": "If the shift remains unfilled, share it with the wider ChemistTasker community.",
    "audience": "The public ChemistTasker community",
    "icon": "globe",
    "colour": "#62b8ff"
  }
];
/* Dependency-free interactions. All data is illustrative; no backend writes. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const platform = 'https://chemisttasker.com.au'; // Change to your application origin.
$$('a[href^="https://chemisttasker.com.au"]').forEach(a => a.href = a.href.replace('https://chemisttasker.com.au', platform));

const menu = $('.menu-toggle');
const mobileNav = document.createElement('nav');
mobileNav.id = 'mobile-nav'; mobileNav.className = 'mobile-nav';
mobileNav.setAttribute('aria-label', 'Mobile navigation'); mobileNav.hidden = true;
$$('.desktop-nav a, .nav-actions a').forEach(a => mobileNav.append(a.cloneNode(true)));
$('.site-header').append(mobileNav);
function closeMenu() { mobileNav.hidden = true; menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Open menu'); }
menu.addEventListener('click', () => { mobileNav.hidden = !mobileNav.hidden; menu.setAttribute('aria-expanded', String(!mobileNav.hidden)); menu.setAttribute('aria-label', mobileNav.hidden ? 'Open menu' : 'Close menu'); });
mobileNav.addEventListener('click', closeMenu);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});

function selectRole(index) {
  const role=roles[index], panel=$('#role-panel');
  $$('.role-tabs button').forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
  panel.setAttribute('aria-labelledby',`role-tab-${index}`);
  $('.role-copy h3').textContent=role.heading; $('.role-copy > p').textContent=role.text;
  $$('.role-copy li').forEach((li,i)=>{li.lastChild.textContent=role.benefits[i];});
  $('.role-copy .button').firstChild.textContent=role.button;
  $('.workspace-top > strong').textContent=role.role;
  $('.workspace-welcome h4').textContent=role.metric;
  $$('.workspace-items strong').forEach((el,i)=>el.textContent=role.items[i]);
}
$$('.role-tabs button').forEach((button,i)=>{
  button.addEventListener('click',()=>selectRole(i));
  button.addEventListener('keydown',e=>{let n=i;if(e.key==='ArrowRight')n=(i+1)%4;else if(e.key==='ArrowLeft')n=(i+3)%4;else if(e.key==='Home')n=0;else if(e.key==='End')n=3;else return;e.preventDefault();selectRole(n);$(`#role-tab-${n}`).focus();});
});
$$('.footer a[href="#workspaces"]').forEach((a,i)=>a.addEventListener('click',()=>selectRole(i)));

let step=0, playing=false, visible=false, timer;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const svgNamespace='http://www.w3.org/2000/svg';
const tierButtons=$$('.tier-route button');
const playButton=$('.tier-controls button');
const replayButton=$$('.tier-controls button')[1];
const clusters=$$('.network-cluster');
const linkGroups=$$('.network-link').map(link=>link.parentNode);
const connections=[[0,1],[0,2],[1,2],[1,3],[2,3],[3,4],[2,4],[0,4]];
const positions=[[105,125],[335,85],[510,230],[300,350],[90,365]];
const invitation=$('.network-invitation').cloneNode(true);
function schedule() {
  clearTimeout(timer);
  $('.network-graphic').classList.toggle('network-playing',playing&&visible);
  playButton.textContent=playing?'Ⅱ Pause explanation':'▶ Play explanation';
  if(playing&&visible)timer=setTimeout(()=>{if(step===4){playing=false;schedule();}else{step++;renderTier();}},4500);
}
function renderTier() {
  const tier=tiers[step];
  $('.tier-stage').style.setProperty('--tier-colour',tier.colour);
  $('.tier-caption > span').textContent=`0${step+1} / 05`;
  $('.tier-caption h3').textContent=tier.short; $('.tier-caption p').textContent=tier.text;
  tierButtons.forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===step));$('.tier-step-number',b).textContent=i<step?'✓':`0${i+1}`;});
  $$('.network-invitation').forEach(n=>n.remove());
  clusters.forEach((cluster,i)=>{
    cluster.classList.toggle('is-reached',i<=step);cluster.classList.toggle('is-current',i===step);
    $('.network-tier-number',cluster).previousElementSibling.setAttribute('fill',i<=step?tiers[i].colour:'#354666');
  });
  const badge=invitation.cloneNode(true);
  badge.setAttribute('transform',`translate(${positions[step][0]-positions[0][0]} ${positions[step][1]-positions[0][1]})`);
  $('rect',badge).setAttribute('fill',tier.colour);clusters[step].append(badge);
  linkGroups.forEach((group,i)=>{
    const active=connections[i][1]<=step;
    const link=$('.network-link',group);link.classList.toggle('connected',active);
    $$('.network-packet',group).forEach(p=>p.remove());
    if(active){const packet=document.createElementNS(svgNamespace,'path');packet.setAttribute('d',link.getAttribute('d'));packet.setAttribute('class','network-packet');packet.style.stroke=tiers[connections[i][1]].colour;packet.style.animationDelay=`-${i*.4}s`;group.append(packet);}
  });
  $('.network-svg').setAttribute('aria-label',`Decentralised audience concept. Tier ${step+1}: ${tier.name}. Local teams connect directly across an illustrative network.`);
  schedule();
}
tierButtons.forEach((button,i)=>button.addEventListener('click',()=>{step=i;playing=false;renderTier();}));
playButton.addEventListener('click',()=>{if(!playing&&step===4)step=0;playing=!playing;renderTier();});
replayButton.addEventListener('click',()=>{step=0;playing=true;renderTier();});
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;schedule();},{threshold:.2}).observe($('#escalation'));
motionPreference.addEventListener('change',()=>{playing=!motionPreference.matches;schedule();});
playing=!motionPreference.matches;renderTier();

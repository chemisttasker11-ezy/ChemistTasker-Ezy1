'use client';

import PublicHeader from '@/public/header';
import {useSession} from '@/shared/session-provider';
import AccountControls from '@/shared/account-controls';
import { useEffect, useState } from 'react';
import { MeasuringCylinder } from '@/features/paediatric-calculator/components/measuring-cylinder';
import TierExplainer from './tier-explainer';
import FeatureCatalogue from './feature-catalogue';
import JournalTeaser from './journal-teaser';
import { ArrowRight, ArrowUpRight, CalendarDays, CalendarCheck, Check, CheckCheck, ChevronDown, Clock3, Building2, Users, MessageCircle, FileText, GraduationCap, Smartphone, ShieldCheck, Menu, X, Plus, MapPin, BriefcaseBusiness, Bell, LayoutDashboard, Pause, Play } from 'lucide-react';

const platform = (process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://chemisttasker.com.au').replace(/\/$/, '');
const href = (path: string) => path;
const features = [
  { icon: CalendarDays, title: 'A calmer calendar.', text: 'Keep tasks, events and your pharmacy’s day-to-day plans in one place.', colour: 'purple' },
  { icon: Clock3, title: 'Availability, aligned.', text: 'Publish availability and plan coverage around your team’s real capacity.', colour: 'cyan' },
  { icon: BriefcaseBusiness, title: 'The right shift. The right fit.', text: 'Post opportunities or explore shifts by location, timing and preferences.', colour: 'pink' },
  { icon: Users, title: 'Your team, connected.', text: 'Bring pharmacy owners, pharmacists and other staff into a shared workspace.', colour: 'blue' },
  { icon: MessageCircle, title: 'Conversations with context.', text: 'Keep chat, announcements and team updates together in Pharmacy Hub.', colour: 'cyan' },
  { icon: FileText, title: 'Less invoice admin.', text: 'Create and manage shift invoices with the details already close at hand.', colour: 'purple' },
];
const roles = [
  {
    label: 'Owner',
    kicker: 'OWNER · DEEP NAVY',
    heading: 'Fill the gap. Keep the whole pharmacy moving.',
    text: 'Owners and managers get the operational view: pharmacies, people, rosters, shift escalation, attendance and administration connected around the work.',
    benefits: ['Start with your own team before widening the search', 'Coordinate one pharmacy, multiple pharmacies or a wider group', 'Keep staffing, attendance and invoices connected to the shift'],
    button: 'Explore the owner workspace',
    secondary: 'Find talent',
    secondaryPath: '/talent/public-board',
    role: 'Owner workspace',
    metric: 'Your pharmacy control tower',
    demo: 'A connected path from a roster gap to confirmed cover.',
    items: [
      { title: 'See the gap', detail: 'Roster and pharmacy context stay visible', status: 'Start' },
      { title: 'Use your network', detail: 'Reach internal teams and trusted people first', status: 'Escalate' },
      { title: 'Widen only if needed', detail: 'Move into the wider ChemistTasker pool', status: 'Public' },
    ],
    accent: 'owner',
    icon: Building2,
  },
  {
    label: 'Pharmacist',
    kicker: 'PHARMACIST · VIOLET',
    heading: 'Flexible work without the fragmented admin.',
    text: 'Pharmacists and locums can discover opportunities, publish availability and keep confirmed work, communication and invoicing in one professional workspace.',
    benefits: ['Browse shifts around location, timing and preferences', 'Keep availability and professional details ready', 'Move from confirmed shift to invoice without rebuilding the details'],
    button: 'Explore the pharmacist workspace',
    secondary: 'Find a shift',
    secondaryPath: '/shifts/public-board',
    role: 'Pharmacist workspace',
    metric: 'Your next opportunities',
    demo: 'Discovery, availability and confirmed work stay connected.',
    items: [
      { title: 'Discover', detail: 'Browse relevant pharmacy opportunities', status: 'Browse' },
      { title: 'Confirm', detail: 'Keep upcoming work and details together', status: 'Plan' },
      { title: 'Complete', detail: 'Attendance, history and invoicing follow the shift', status: 'Finish' },
    ],
    accent: 'pharmacist',
    icon: CalendarCheck,
  },
  {
    label: 'Other staff',
    kicker: 'OTHER STAFF · MAGENTA',
    heading: 'A proper workspace for every pharmacy team member.',
    text: 'Assistants, technicians and other pharmacy staff get a role-aware view of rosters, availability, opportunities and team communication without owner-only clutter.',
    benefits: ['See rostered work and publish availability', 'Keep team updates and Pharmacy Hub close at hand', 'Use the tools relevant to your actual pharmacy role'],
    button: 'Explore the staff workspace',
    secondary: 'Explore community',
    secondaryPath: '/hubs',
    role: 'Other staff workspace',
    metric: 'Your working day, in view',
    demo: 'Everyday staff tools stay clear, focused and connected.',
    items: [
      { title: 'Roster', detail: 'Know where and when you are working', status: 'View' },
      { title: 'Availability', detail: 'Keep your real capacity visible', status: 'Update' },
      { title: 'Team spaces', detail: 'Follow the conversations linked to work', status: 'Connect' },
    ],
    accent: 'other-staff',
    icon: Users,
  },
  {
    label: 'Explorer',
    kicker: 'EXPLORER · CYAN',
    heading: 'Explore pharmacy opportunities before choosing your path.',
    text: 'Explorer keeps the public side of ChemistTasker approachable: discover shifts, learning, talent and community while building toward a more complete pharmacy profile.',
    benefits: ['Browse public pharmacy opportunities', 'Explore learning and community spaces', 'Complete your profile as your pharmacy pathway becomes clearer'],
    button: 'Explore ChemistTasker',
    secondary: 'Open learning',
    secondaryPath: '/learning',
    role: 'Explorer workspace',
    metric: 'Discovery without the clutter',
    demo: 'A clear starting point for the wider pharmacy ecosystem.',
    items: [
      { title: 'Discover', detail: 'See public shifts and pharmacy opportunities', status: 'Explore' },
      { title: 'Learn', detail: 'Open pharmacy learning and shared resources', status: 'Grow' },
      { title: 'Connect', detail: 'Join the wider pharmacy community', status: 'Meet' },
    ],
    accent: 'explorer',
    icon: GraduationCap,
  },
];
const faqs = [
  ['Who is ChemistTasker for?', 'ChemistTasker brings together pharmacy owners, pharmacists, pharmacy assistants, technicians, other staff and organisations. Each role has a workspace suited to its needs.'],
  ['Can I manage more than one pharmacy?', 'The owner workspace includes multi-pharmacy management, so you can organise pharmacy locations and their teams from one account.'],
  ['How do I find a shift or find talent?', 'Choose Find a Shift to open the public shift board, or Find Talent to explore the public talent board. Account registration may be required to apply or connect.'],
  ['Can my pharmacy staff use it too?', 'Yes. Other staff have their own dashboard, including roster, availability, memberships, chat and Pharmacy Hub access according to their role and permissions.'],
  ['Where can I see pricing?', 'Visit the pricing page for the current plans and subscription details. You can access it from the navigation or footer.'],
];

function Logo({ footer = false }: { footer?: boolean }) { return <a href="#" className={`logo ${footer ? 'footer-logo' : ''}`} aria-label="ChemistTasker home"><img src={footer ? "/assets/official-logo.png" : "/assets/calculator-wordmark.png"} alt="ChemistTasker — Pharmacy Workforce Platform" /></a>; }
function LinkButton({ children, path, secondary = false }: { children: React.ReactNode; path: string; secondary?: boolean }) { return <a className={`button ${secondary ? 'secondary' : 'primary'}`} href={path}>{children}<ArrowUpRight size={17} /></a>; }

export default function LandingPage() {
  const {user,status}=useSession();
  const startPath=status==='anonymous'?'/register':'/dashboard';
  const [role, setRole] = useState(0);
  const [roleAuto, setRoleAuto] = useState(true);
  const [roleInteracting, setRoleInteracting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const active = roles[role];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!roleAuto || roleInteracting || reduceMotion) return;
    const timer = window.setTimeout(() => setRole(current => (current + 1) % roles.length), 7500);
    return () => window.clearTimeout(timer);
  }, [role, roleAuto, roleInteracting, reduceMotion]);

  const roleMoving = roleAuto && !roleInteracting && !reduceMotion;
  return <>
    <PublicHeader skipTarget="main"/>
    <main id="main">
      <section className="hero"><div className="container hero-grid"><div className="hero-copy"><p className="eyebrow"><span className="live-dot"/> BUILT FOR THE PEOPLE BEHIND THE COUNTER</p><h1>Locum shifts.<br/>Pharmacy teams.<br/><span>Better together.</span></h1><p className="hero-description">Find locum pharmacist shifts and pharmacy talent across Australia. Connect your people, availability and everyday work in one place.</p><div className="button-row"><LinkButton path={href('/shifts/public-board')}>Find a Shift</LinkButton><LinkButton path={href('/talent/public-board')} secondary>Find Talent</LinkButton></div><p className="hero-note"><Check size={16}/> For pharmacy owners, pharmacists &amp; staff</p></div>
      <div className="hero-visual"><div className="photo-main"><img src="/assets/pharmacist-priya.jpg" alt="Pharmacy professional in a bright community pharmacy" fetchPriority="high"/><span className="photo-caption"><span className="tiny-dot"/> People at the heart of pharmacy.</span></div><div className="photo-small"><img src="/assets/pharmacist-david.jpg" alt="Pharmacist in a community pharmacy"/></div><div className="floating-card"><span className="icon-box cyan"><CalendarCheck size={23}/></span><div><strong>A good day starts here.</strong><span>Your team. Your schedule. Connected.</span></div><CheckCheck size={21} className="teal"/></div><div className="orbit-stamp"><Users size={20}/><span>MADE FOR<br/>YOUR TEAM</span></div></div>
      <a className="hero-calculator" href="/calculator" aria-label="Open children's dose calculator"><span className="hero-calculator-icon"><MeasuringCylinder/></span><span className="hero-calculator-copy"><span className="hero-calculator-kicker">FOR HEALTH PROFESSIONALS</span><strong>Children’s dose calculator</strong><span>Oral anti-infectives · Source-linked doses</span></span><ArrowUpRight size={20} aria-hidden="true"/></a></div>
      <div className="container value-strip"><div><Building2/><span>Pharmacy-first<br/><strong>Built around your day</strong></span></div><div><Users/><span>A space for every role<br/><strong>Your whole team belongs</strong></span></div><div><Smartphone/><span>Web &amp; mobile<br/><strong>Wherever work takes you</strong></span></div><div><ShieldCheck/><span>Role-based access<br/><strong>The right tools for each person</strong></span></div></div></section>


      <section id="workspaces" className="section container persona-showcase">
        <div className="center-heading persona-heading">
          <p className="eyebrow">ONE PLATFORM. A DIFFERENT VIEW FOR EVERY ROLE.</p>
          <h2>See what ChemistTasker adds to your working day.</h2>
          <p>Four persona colours from the ChemistTasker bottle. One connected platform. The board moves with the person using it.</p>
        </div>
        <div className="persona-switcher">
          <div className="role-tabs" role="tablist" aria-label="Explore ChemistTasker by role">
            {roles.map((r,i)=><button key={r.label} data-accent={r.accent} id={`role-tab-${i}`} role="tab" aria-selected={role===i} aria-controls="role-panel" tabIndex={role===i?0:-1} onClick={()=>setRole(i)} onKeyDown={e=>{let next=role;if(e.key==='ArrowRight')next=(role+1)%roles.length;else if(e.key==='ArrowLeft')next=(role+roles.length-1)%roles.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=roles.length-1;else return;e.preventDefault();setRole(next);document.getElementById(`role-tab-${next}`)?.focus();}}>{r.label}</button>)}
          </div>
          <button className="persona-playback" type="button" disabled={reduceMotion} onClick={()=>setRoleAuto(value=>!value)} aria-label={reduceMotion?'Automatic persona preview disabled by reduced motion preference':roleAuto?'Pause automatic persona preview':'Play automatic persona preview'}>
            {reduceMotion ? <Pause size={15}/> : roleAuto ? <Pause size={15}/> : <Play size={15}/>}
            <span>{reduceMotion ? 'Motion reduced' : roleAuto ? 'Pause preview' : 'Play preview'}</span>
          </button>
        </div>
        <div
          id="role-panel"
          role="tabpanel"
          aria-labelledby={`role-tab-${role}`}
          className={`role-panel persona-board ${roleMoving?'is-moving':'is-paused'}`}
          data-accent={active.accent}
          onMouseEnter={()=>setRoleInteracting(true)}
          onMouseLeave={()=>setRoleInteracting(false)}
          onFocusCapture={()=>setRoleInteracting(true)}
          onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node | null))setRoleInteracting(false);}}
        >
          <div className="role-copy persona-copy" key={`copy-${role}`}>
            <p className="persona-kicker">{active.kicker}</p>
            <h3>{active.heading}</h3>
            <p>{active.text}</p>
            <ul className="check-list">{active.benefits.map(b=><li key={b}><Check/>{b}</li>)}</ul>
            <div className="persona-actions">
              <LinkButton path={startPath}>{user?'Open my workspace':active.button}</LinkButton>
              <a className="text-link persona-secondary" href={active.secondaryPath}>{active.secondary}<ArrowRight size={18}/></a>
            </div>
          </div>
          <div className="workspace-demo persona-demo" key={`demo-${role}`}>
            <div className="workspace-top">
              <span className="persona-mark"><active.icon size={20}/></span>
              <strong>{active.role}</strong>
              <span className="demo-tag">Product pathway</span>
            </div>
            <div className="workspace-welcome">
              <span>ROLE-AWARE WORKSPACE</span>
              <h4>{active.metric}</h4>
              <p>{active.demo}</p>
            </div>
            <div className="workspace-items persona-steps">
              {active.items.map((item,i)=><div key={item.title}>
                <span className="workspace-index">0{i+1}</span>
                <span className="workspace-step-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                <span className="workspace-status">{item.status}</span>
              </div>)}
            </div>
            <p className="illustration-note">Illustrative workflow preview — available tools depend on role and permissions.</p>
          </div>
        </div>
      </section>

      <section className="container public-board-showcase" aria-labelledby="public-board-title">
        <div className="section-heading">
          <div><p className="eyebrow">THE MARKETPLACE, BEFORE YOU SIGN IN</p><h2 id="public-board-title">Jobs and talent should be easy to inspect.</h2></div>
          <p>Two clear public entry points keep discovery simple, while the dashboard handles the operational work behind each match.</p>
        </div>
        <div className="public-board-grid">
          <a className="public-board-card" href="/shifts/public-board">
            <span className="public-board-label"><BriefcaseBusiness size={18}/> PUBLIC SHIFT BOARD</span>
            <h3>Find pharmacy work around the life you actually have.</h3>
            <p>Browse opportunities with the details needed to decide whether a shift is worth opening.</p>
            <span className="public-filter-row"><span>Location</span><span>Date</span><span>Role</span></span>
            <span className="text-link">Explore shifts <ArrowRight size={18}/></span>
          </a>
          <a className="public-board-card" href="/talent/public-board">
            <span className="public-board-label"><Users size={18}/> PUBLIC TALENT BOARD</span>
            <h3>Find pharmacy people, not another pile of CVs.</h3>
            <p>Move from talent discovery into the ChemistTasker workflow without disconnecting the person from the shift.</p>
            <span className="public-filter-row"><span>Profession</span><span>Location</span><span>Availability</span></span>
            <span className="text-link">Explore talent <ArrowRight size={18}/></span>
          </a>
        </div>
      </section>

      <section id="features" className="section container"><div className="section-heading"><div><p className="eyebrow">LESS JUGGLING. MORE CONNECTION.</p><h2>Everything your workforce needs.<br/><span className="muted-heading">Finally, in one place.</span></h2></div><p>From filling a shift to keeping your team in the loop.<br/>Make room for a more organised working day.</p></div><div className="feature-grid">{features.map(({icon:Icon,title,text,colour})=><article className="feature-card" key={title}><span className={`icon-box ${colour}`}><Icon size={23}/></span><h3>{title}</h3><p>{text}</p></article>)}</div><div className="feature-jumps"><a className="text-link" href="#all-features">Explore all capabilities <ArrowRight size={18}/></a><a className="text-link" href="#escalation">Watch the five-tier concept <ArrowRight size={18}/></a></div></section>
      <TierExplainer/>
      <FeatureCatalogue/>
      <JournalTeaser/>

      <section id="how-it-works" className="workflow-section"><div className="container workflow-grid"><div><p className="eyebrow">A LITTLE MORE ORDER. A LOT MORE EASE.</p><h2>Make space for<br/>a smoother day.</h2><p className="section-description">Keep the plan visible, the team informed and the next step clear. Your pharmacy’s everyday work deserves a place of its own.</p><ul className="check-list"><li><Check/> Plan tasks and events in a shared calendar</li><li><Check/> Stay across availability and coverage</li><li><Check/> Keep updates close to the work</li></ul><a className="text-link" href={startPath}>Bring your team together <ArrowRight size={18}/></a></div><div className="calendar-demo" aria-label="Illustrative pharmacy calendar"><div className="demo-top"><div><span className="demo-label">YOUR PHARMACY, AT A GLANCE</span><h3>The day ahead</h3></div><span className="demo-tag">Product preview</span></div><div className="calendar-heading"><strong>Monday, 7 September</strong><CalendarDays size={18}/></div><div className="week-row">{['MON','TUE','WED','THU','FRI'].map((d,i)=><div key={d} className={i===0?'selected':''}><span>{d}</span><strong>{7+i}</strong></div>)}</div><div className="task-row"><span className="task-time">08:30</span><span className="task-line purple-line"/><div><strong>Opening checklist</strong><span>Daily tasks · Pharmacy team</span></div><span className="status done">Done</span></div><div className="task-row"><span className="task-time">10:00</span><span className="task-line cyan-line"/><div><strong>Team handover</strong><span>Keep everyone in the loop</span></div><span className="status">Upcoming</span></div><div className="task-row"><span className="task-time">14:00</span><span className="task-line pink-line"/><div><strong>Stock review</strong><span>A little planning goes a long way</span></div><span className="status">Upcoming</span></div><div className="demo-bottom"><CheckCheck size={17}/> A shared plan. A connected team.</div></div></div></section>

      <section className="community-section"><div className="container community-grid"><div className="community-photos"><img src="/assets/pharmacist-mina.jpg" alt="Pharmacy team member" loading="lazy"/><img src="/assets/pharmacist-rahul.jpg" alt="Pharmacy professional" loading="lazy"/><div className="community-pill"><MessageCircle size={18}/> A real sense of connection.</div></div><div><p className="eyebrow">MORE THAN A ROSTER</p><h2>Good teams stay<br/>in the loop.</h2><p className="section-description">Learn with the wider pharmacy community in six public hubs. Keep your own pharmacy’s updates and internal staff discussions in private team spaces.</p><div className="community-features"><span><MessageCircle/> Team chat</span><span><Bell/> Announcements</span><span><Users/> Community polls</span><span><GraduationCap/> Talent Hub</span></div><a className="text-link" href="/hubs">Explore pharmacy communities <ArrowRight size={18}/></a></div></div></section>

      <section className="section container faq-section"><div><p className="eyebrow">A FEW THINGS YOU MIGHT BE WONDERING</p><h2>Let’s clear things up.</h2><p>Getting started should feel simple.</p></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<Plus size={19}/></summary><p>{a}</p></details>)}</div></section>
      <section className="container final-cta"><div><p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h2>A more connected pharmacy.<br/>A better working day.</h2><p>Bring your people and your plans together with ChemistTasker.</p></div><LinkButton path={startPath}>{user?'Open my dashboard':'Explore your workspace'}</LinkButton><div className="cta-circle" aria-hidden="true"/></section>
    </main>
    <footer className="container footer"><div className="footer-main"><div><Logo footer/><p>The people behind every pharmacy.<br/>The platform bringing them together.</p></div><div><h4>Platform</h4><a href="#features">Features</a><a href={href('/shifts/public-board')}>Find a Shift</a><a href={href('/talent/public-board')}>Find Talent</a><a href={href('/pricing')}>Pricing</a><a href={href('/pricing/organization')}>Organisations</a></div><div><h4>Your workspace</h4><a href="#workspaces" onClick={()=>setRole(0)}>Owner</a><a href="#workspaces" onClick={()=>setRole(1)}>Pharmacist</a><a href="#workspaces" onClick={()=>setRole(2)}>Other staff</a><a href="#workspaces" onClick={()=>setRole(3)}>Explorer</a></div><div><h4>Ready when you are</h4><AccountControls/><span className="footer-caption">Made for Australian pharmacies.</span></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} ChemistTasker. All rights reserved.</span><div><a href={href('/privacy-policy')}>Privacy policy</a><a href={href('/terms-of-service')}>Terms of service</a></div><span>People. Pharmacy. Possibility.</span></div></footer>
  </>;
}

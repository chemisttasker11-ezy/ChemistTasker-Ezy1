'use client';

import PublicHeader from '@/public/header';
import { staffPersonas } from './persona-data';
import {useSession} from '@/shared/session-provider';
import AccountControls from '@/shared/account-controls';
import { useEffect, useRef, useState } from 'react';
import { MeasuringCylinder } from '@/features/paediatric-calculator/components/measuring-cylinder';
import TierExplainer from './tier-explainer';
import FeatureCatalogue from './feature-catalogue';
import JournalTeaser from './journal-teaser';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, Clock3, Building2, Users, MessageCircle, FileText, GraduationCap, Smartphone, ShieldCheck, Menu, X, Plus, MapPin, BriefcaseBusiness, Bell, LayoutDashboard, Pause, Play } from 'lucide-react';

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
  const [reduceMotion, setReduceMotion] = useState(false);
  const [staffRole, setStaffRole] = useState(4);
  const [staffAuto, setStaffAuto] = useState(true);
  const staffRailRef = useRef<HTMLDivElement>(null);
  const activeStaff = staffPersonas[staffRole];
  const orderedStaff = staffPersonas.map((_, position) => {
    const offset = position - Math.floor(staffPersonas.length / 2);
    const index = (staffRole + offset + staffPersonas.length) % staffPersonas.length;
    return { persona: staffPersonas[index], index, distance: Math.abs(offset), active: offset === 0 };
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!staffAuto || reduceMotion) return;
    const timer = window.setTimeout(() => setStaffRole(current => (current + 1) % staffPersonas.length), 7500);
    return () => window.clearTimeout(timer);
  }, [staffRole, staffAuto, reduceMotion]);

  useEffect(() => {
    const rail = staffRailRef.current;
    const selected = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !selected || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({
      left: selected.offsetLeft - (rail.clientWidth - selected.offsetWidth) / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [staffRole, reduceMotion]);

  return <>
    <PublicHeader skipTarget="main"/>
    <main id="main">
      <section className="hero">
        <div className="container hero-shell">
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>Locum shifts.<br/>Pharmacy teams.<br/><span>Better together.</span></h1>
              <p className="hero-description">Find pharmacy work, discover talent and keep availability, teams and everyday workforce admin connected in one pharmacy-focused platform.</p>
              <div className="button-row"><LinkButton path={href('/shifts/public-board')}>Find a Shift</LinkButton><LinkButton path={href('/talent/public-board')} secondary>Find Talent</LinkButton></div>
              <div className="hero-personas" aria-label="ChemistTasker personas"><span data-persona="owner"><i/>Owner</span><span data-persona="pharmacist"><i/>Pharmacist</span><span data-persona="other-staff"><i/>Other staff</span><span data-persona="explorer"><i/>Explorer</span></div>
            </div>
            <div className="hero-visual">
              <div className="photo-main"><img src="/assets/pharmacist-priya.jpg" alt="Pharmacy professional in a bright community pharmacy" fetchPriority="high"/><span className="photo-caption"><span className="tiny-dot"/> People at the heart of pharmacy.</span></div>
              <div className="photo-small"><img src="/assets/pharmacist-david.jpg" alt="Pharmacist in a community pharmacy"/></div>
            </div>
          </div>
          <div className="hero-mobile-app">
            <div className="hero-mobile-app-intro"><span className="hero-mobile-app-icon"><Smartphone size={24}/></span><div><h2>Take ChemistTasker with you</h2><p>Get faster shift updates, easier scheduling and your pharmacy workflow wherever the day takes you.</p></div></div>
            <div className="hero-mobile-app-links"><a href="https://play.google.com/store/apps/details?id=com.chemisttasker.app" target="_blank" rel="noopener noreferrer" aria-label="Download ChemistTasker on Google Play"><img src="/assets/google-play-badge.svg" alt="Get it on Google Play"/></a><a href="https://apps.apple.com/sb/app/chemisttasker/id6759088580" target="_blank" rel="noopener noreferrer" aria-label="Download ChemistTasker on the App Store"><img src="/assets/app-store-badge.svg" alt="Download on the App Store"/></a></div>
          </div>
        </div>
      <div className="container value-strip"><div><Building2/><span>Pharmacy-first<br/><strong>Built around pharmacy work</strong></span></div><div><Users/><span>One connected workforce<br/><strong>From your team to wider talent</strong></span></div><div><Smartphone/><span>Web &amp; mobile<br/><strong>Wherever work takes you</strong></span></div><div><ShieldCheck/><span>Role-aware access<br/><strong>The right tools for each person</strong></span></div></div></section>


      <section id="workspaces" className="section container persona-showcase">
        <div className="pharmacy-team-portrait">
          <img src="/assets/personas/pharmacy-team.png" alt="A pharmacy team together in their workplace" loading="lazy" />
        </div>
        <div className="center-heading persona-heading">
          <h2>See what ChemistTasker adds to your working day.</h2>
        </div>
        <div className="staff-persona-showcase" aria-label="Explore ChemistTasker for each pharmacy role">
          <div ref={staffRailRef} className="staff-persona-rail" role="group" aria-label="Choose a pharmacy role">
            {orderedStaff.map(({ persona, index, distance, active }) => (
              <button
                key={persona.label}
                type="button"
                className="staff-persona"
                style={{ '--staff-accent': persona.accent } as React.CSSProperties}
                data-active={active}
                data-distance={distance}
                aria-pressed={active}
                aria-label={`Show ${persona.label} benefits`}
                onClick={() => { setStaffRole(index); setStaffAuto(false); }}
              >
                <span className="staff-persona-figure">
                  <img className="staff-persona-image" src={persona.image} alt="" aria-hidden="true" loading={distance < 2 ? 'eager' : 'lazy'} />
                </span>
                <span className="staff-persona-role">{persona.label}</span>
                <span className="staff-persona-summary">{persona.short}</span>
              </button>
            ))}
          </div>
          <div className="staff-persona-detail" aria-live="polite" style={{ '--staff-accent': activeStaff.accent } as React.CSSProperties}>
            <strong>{activeStaff.heading}</strong>
            <p>{activeStaff.detail}</p>
            <div className="staff-persona-tools" aria-label={`${activeStaff.label} ChemistTasker tools`}>
              {activeStaff.tools.map(tool => <span key={tool}>{tool}</span>)}
            </div>
          </div>
        </div>
        <div className="role-panel persona-board" data-accent={activeStaff.group} style={{ '--staff-accent': activeStaff.accent } as React.CSSProperties}>
          <div className="role-copy persona-copy" key={`copy-${staffRole}`}>
            <h3>Made for your role.</h3>
            <ul className="check-list">{activeStaff.benefits.map(benefit => <li key={benefit}><Check/>{benefit}</li>)}</ul>
            <div className="persona-actions">
              <LinkButton path={startPath}>{user ? 'Open my workspace' : `Explore the ${activeStaff.label.toLowerCase()} workspace`}</LinkButton>
              <a className="text-link persona-secondary" href={activeStaff.secondaryPath}>{activeStaff.secondary}<ArrowRight size={18}/></a>
            </div>
          </div>
          <div className="workspace-demo persona-demo" key={`demo-${staffRole}`}>
            <div className="workspace-top">
              <span className="persona-mark"><Users size={20}/></span>
              <strong>{activeStaff.label} workspace</strong>
              <span className="demo-tag">Product pathway</span>
            </div>
            <div className="workspace-welcome">
              <h4>{activeStaff.workspaceTitle}</h4>
              <p>{activeStaff.workspaceDescription}</p>
            </div>
            <div className="workspace-items persona-steps">
              {activeStaff.steps.map(([title, detail], i) => <div key={title}>
                <span className="workspace-index">0{i + 1}</span>
                <span className="workspace-step-copy"><strong>{title}</strong><small>{detail}</small></span>
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

      <div className="container clinical-utility"><a className="hero-calculator" href="/calculator" aria-label="Open children's dose calculator"><span className="hero-calculator-icon"><MeasuringCylinder/></span><span className="hero-calculator-copy"><span className="hero-calculator-kicker">CLINICAL UTILITY</span><strong>Children’s dose calculator</strong><span>Oral anti-infectives · Source-linked doses</span></span><ArrowUpRight size={18} aria-hidden="true"/></a></div>
      <section id="features" className="section container"><div className="section-heading"><div><p className="eyebrow">LESS JUGGLING. MORE CONNECTION.</p><h2>Everything your workforce needs.<br/><span className="muted-heading">Finally, in one place.</span></h2></div><p>From filling a shift to keeping your team in the loop.<br/>Make room for a more organised working day.</p></div><div className="feature-grid">{features.map(({icon:Icon,title,text,colour})=><article className="feature-card" key={title}><span className={`icon-box ${colour}`}><Icon size={23}/></span><h3>{title}</h3><p>{text}</p></article>)}</div><div className="feature-jumps"><a className="text-link" href="#all-features">Explore all capabilities <ArrowRight size={18}/></a><a className="text-link" href="#escalation">Watch the five-tier concept <ArrowRight size={18}/></a></div></section>
      <TierExplainer/>
      <FeatureCatalogue/>
      <JournalTeaser/>

      <section id="how-it-works" className="workflow-section"><div className="container workflow-grid"><div><p className="eyebrow">A LITTLE MORE ORDER. A LOT MORE EASE.</p><h2>Make space for<br/>a smoother day.</h2><p className="section-description">Keep the plan visible, the team informed and the next step clear. Your pharmacy’s everyday work deserves a place of its own.</p><ul className="check-list"><li><Check/> Plan tasks and events in a shared calendar</li><li><Check/> Stay across availability and coverage</li><li><Check/> Keep updates close to the work</li></ul><a className="text-link" href={startPath}>Bring your team together <ArrowRight size={18}/></a></div><div className="calendar-demo" aria-label="Illustrative pharmacy calendar"><div className="demo-top"><div><span className="demo-label">YOUR PHARMACY, AT A GLANCE</span><h3>The day ahead</h3></div><span className="demo-tag">Product preview</span></div><div className="calendar-heading"><strong>Monday, 7 September</strong><CalendarDays size={18}/></div><div className="week-row">{['MON','TUE','WED','THU','FRI'].map((d,i)=><div key={d} className={i===0?'selected':''}><span>{d}</span><strong>{7+i}</strong></div>)}</div><div className="task-row"><span className="task-time">08:30</span><span className="task-line purple-line"/><div><strong>Opening checklist</strong><span>Daily tasks · Pharmacy team</span></div><span className="status done">Done</span></div><div className="task-row"><span className="task-time">10:00</span><span className="task-line cyan-line"/><div><strong>Team handover</strong><span>Keep everyone in the loop</span></div><span className="status">Upcoming</span></div><div className="task-row"><span className="task-time">14:00</span><span className="task-line pink-line"/><div><strong>Stock review</strong><span>A little planning goes a long way</span></div><span className="status">Upcoming</span></div><div className="demo-bottom"><CheckCheck size={17}/> A shared plan. A connected team.</div></div></div></section>

      <section className="community-section"><div className="container community-grid"><div className="community-photos"><img src="/assets/pharmacist-mina.jpg" alt="Pharmacy team member" loading="lazy"/><img src="/assets/pharmacist-rahul.jpg" alt="Pharmacy professional" loading="lazy"/><div className="community-pill"><MessageCircle size={18}/> A real sense of connection.</div></div><div><p className="eyebrow">MORE THAN A ROSTER</p><h2>Good teams stay<br/>in the loop.</h2><p className="section-description">Learn with the wider pharmacy community in six public hubs. Keep your own pharmacy’s updates and internal staff discussions in private team spaces.</p><div className="community-features"><span><MessageCircle/> Team chat</span><span><Bell/> Announcements</span><span><Users/> Community polls</span><span><GraduationCap/> Talent Hub</span></div><a className="text-link" href="/hubs">Explore pharmacy communities <ArrowRight size={18}/></a></div></div></section>

      <section className="section container faq-section"><div><p className="eyebrow">A FEW THINGS YOU MIGHT BE WONDERING</p><h2>Let’s clear things up.</h2><p>Getting started should feel simple.</p></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<Plus size={19}/></summary><p>{a}</p></details>)}</div></section>
      <section className="container final-cta"><div><p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h2>A more connected pharmacy.<br/>A better working day.</h2><p>Bring your people and your plans together with ChemistTasker.</p></div><LinkButton path={startPath}>{user?'Open my dashboard':'Explore your workspace'}</LinkButton><div className="cta-circle" aria-hidden="true"/></section>
    </main>
    <footer className="container footer"><div className="footer-main"><div><Logo footer/><p>The people behind every pharmacy.<br/>The platform bringing them together.</p></div><div><h4>Platform</h4><a href="#features">Features</a><a href={href('/shifts/public-board')}>Find a Shift</a><a href={href('/talent/public-board')}>Find Talent</a><a href={href('/pricing')}>Pricing</a><a href={href('/pricing/organization')}>Organisations</a></div><div><h4>Your workspace</h4><a href="#workspaces" onClick={()=>{setStaffRole(0);setStaffAuto(false)}}>Owner</a><a href="#workspaces" onClick={()=>{setStaffRole(2);setStaffAuto(false)}}>Pharmacist</a><a href="#workspaces" onClick={()=>{setStaffRole(4);setStaffAuto(false)}}>Other staff</a><a href="#workspaces" onClick={()=>{setStaffRole(6);setStaffAuto(false)}}>Explorer</a></div><div><h4>Ready when you are</h4><AccountControls/><span className="footer-caption">Made for Australian pharmacies.</span></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} ChemistTasker. All rights reserved.</span><div><a href={href('/privacy-policy')}>Privacy policy</a><a href={href('/terms-of-service')}>Terms of service</a></div><span>People. Pharmacy. Possibility.</span></div></footer>
  </>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import './tier-explainer.css';
import './network-motion.css';
import { ArrowRight, Building2, CalendarDays, Check, Globe2, Pause, Play, RotateCcw, Star, Store, Users } from 'lucide-react';

const tiers = [
  { name: 'Store Team', short: 'Start close to home.', text: 'Offer the shift to the people at your own pharmacy first.', audience: 'Your immediate branch staff', icon: Store, colour: '#aa7bff' },
  { name: 'Selected Stores', short: 'Reach your sister stores.', text: 'If cover is still needed, extend the invitation to selected stores and regional staff.', audience: 'Your selected pharmacy network', icon: Building2, colour: '#43d7e3' },
  { name: 'Favourite Locums', short: 'Call on familiar faces.', text: 'Bring the opportunity to your curated network of trusted locum pharmacists.', audience: 'Your favourite casual professionals', icon: Star, colour: '#f1b965' },
  { name: 'All Organisation Staff', short: 'Connect the whole organisation.', text: 'Widen the search to eligible staff across your organisation’s pharmacy network.', audience: 'Your wider organisation', icon: Users, colour: '#f282c9' },
  { name: 'Public Pool', short: 'Open up the possibilities.', text: 'If the shift remains unfilled, share it with the wider ChemistTasker community.', audience: 'The public ChemistTasker community', icon: Globe2, colour: '#62b8ff' },
];

const communities = [
  { x: 105, y: 125, label: 'Your pharmacy', kind: 'store' },
  { x: 335, y: 85, label: 'Sister stores', kind: 'store' },
  { x: 510, y: 230, label: 'Trusted locums', kind: 'people' },
  { x: 300, y: 350, label: 'Organisation', kind: 'store' },
  { x: 90, y: 365, label: 'Public community', kind: 'people' },
];
const connections = [[0,1],[0,2],[1,2],[1,3],[2,3],[3,4],[2,4],[0,4]];

export default function TierExplainer() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPlaying(!preference.matches);
    sync();
    preference.addEventListener('change', sync);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .2 });
    if (section.current) observer.observe(section.current);
    return () => { preference.removeEventListener('change', sync); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setTimeout(() => {
      if (step === 4) setPlaying(false);
      else setStep(step + 1);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [step, playing, visible]);
  const current = tiers[step];
  return <section ref={section} id="escalation" className="tier-section">
    <div className="container">
      <div className="tier-heading"><div><p className="eyebrow">FIVE TIERS. ONE CONNECTED SEARCH.</p><h2>Your people first.<br/><span>More possibilities, step by step.</span></h2></div><p>Start with the team you know. Expand your reach when you need to. See how the five-tier shift concept brings each audience into the picture.</p></div>
      <div className="tier-player">
        <div className="tier-stage" style={{ '--tier-colour': current.colour } as React.CSSProperties}>
          <div className="tier-stage-label"><span className="tiny-dot"/> SHIFT BROADCAST · CONCEPT DEMO</div>
          <div className={`network-graphic ${playing && visible ? 'network-playing' : ''}`}>
            <svg viewBox="0 0 610 470" className="network-svg" role="img" aria-label={`Decentralised audience concept: ${communities.slice(0,step+1).map(c=>c.label).join(', ')} connected. Each cluster represents a local team, not a central agency.`}>
              <defs><pattern id="network-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#9bb6e1" opacity=".12"/></pattern></defs>
              <rect width="610" height="470" fill="url(#network-grid)"/>
              {connections.map(([a,b],i) => { const from=communities[a], to=communities[b]; const active=b<=step; return <g key={i}><path d={`M${from.x} ${from.y} L${to.x} ${to.y}`} className={`network-link ${active?'connected':''}`}/>{active && <path d={`M${from.x} ${from.y} L${to.x} ${to.y}`} className="network-packet" style={{stroke:tiers[b].colour,animationDelay:`-${i*.4}s`}}/>}</g>; })}
              {communities.map((node,i) => { const reached=i<=step; const HubIcon=node.kind==='store'?Store:Users; return <g key={node.label} className={`network-cluster ${reached?'is-reached':''} ${step===i?'is-current':''}`} style={{'--node-colour':tiers[i].colour} as React.CSSProperties}>
                <circle cx={node.x} cy={node.y} r="68" className="network-boundary"/>
                {[-1,1].map((side,j) => <g key={side}><line x1={node.x} y1={node.y} x2={node.x+side*47} y2={node.y+32} className="local-link"/><circle cx={node.x+side*47} cy={node.y+32} r="14" className="person-node"/><circle cx={node.x+side*47} cy={node.y+28} r="3" fill="currentColor"/><path d={`M${node.x+side*47-6} ${node.y+38} q6 -10 12 0`} fill="none" stroke="currentColor" strokeWidth="2"/></g>)}
                <rect x={node.x-27} y={node.y-28} width="54" height="54" rx="16" className="network-hub"/>
                <HubIcon x={node.x-13} y={node.y-14} width="26" height="26"/>
                <circle cx={node.x+25} cy={node.y-25} r="12" fill={reached?tiers[i].colour:'#354666'}/><text x={node.x+25} y={node.y-21} textAnchor="middle" className="network-tier-number">{i+1}</text>
                <text x={node.x} y={node.y+61} textAnchor="middle" className="network-label">{node.label}</text>
                {step===i && <g className="network-invitation"><rect x={node.x-52} y={node.y-65} width="104" height="24" rx="12" fill={tiers[i].colour}/><text x={node.x} y={node.y-49} textAnchor="middle">SHIFT INVITATION</text></g>}
              </g>; })}
            </svg>
            <div className="network-legend"><span><i/> Connected teams</span><span><i/> Invitation pathways</span></div>
            <p className="network-principle">Local teams. Direct connections. A wider shared opportunity.</p>
          </div>
          <div className="tier-caption" key={`caption-${step}`}><span>0{step+1} / 05</span><h3>{current.short}</h3><p>{current.text}</p></div>
        </div>
        <div className="tier-sidebar"><p className="tier-route-label">FOLLOW THE INVITATION</p><ol className="tier-route">{tiers.map((tier, i) => <li key={tier.name}><button aria-pressed={step === i} onClick={() => { setStep(i); setPlaying(false); }}><span className="tier-step-number">{i < step ? <Check size={15}/> : `0${i+1}`}</span><span><strong>{tier.name}</strong><small>{tier.audience}</small></span>{step===i && <ArrowRight size={17}/>}</button></li>)}</ol><div className="tier-controls"><button onClick={() => { if (!playing && step === 4) setStep(0); setPlaying(!playing); }}>{playing ? <Pause size={16}/> : <Play size={16}/>} {playing ? 'Pause' : 'Play'} explanation</button><button aria-label="Replay five-tier explanation" onClick={() => { setStep(0); setPlaying(true); }}><RotateCcw size={17}/></button></div><p className="tier-note">An illustrative sequence, not a live broadcast. Escalation depends on your settings and whether cover is still needed. No guaranteed fill or fixed waiting times.</p></div>
      </div>
    </div>
  </section>;
}

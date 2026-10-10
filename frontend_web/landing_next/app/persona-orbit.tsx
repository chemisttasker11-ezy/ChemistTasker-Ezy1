'use client';

import Image from 'next/image';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { staffPersonas } from './persona-data';
import './persona-orbit.css';

type Persona = (typeof staffPersonas)[number];

type PersonaOrbitProps = {
  personas: readonly Persona[];
  active: number;
  playing: boolean;
  reduceMotion: boolean;
  onSelect: (index: number) => void;
  onTogglePlay: () => void;
  /** True while the visitor is pointing at, focused in, or scrolled away from the belt. */
  onHoldChange: (hold: boolean) => void;
};

// Belt geometry, in stage pixels. The card sits above the belt's centre line so the
// back half of the ellipse passes behind it and the front half in front of it.
const BELT_CENTRE_Y = 392;
const BELT_RADIUS_Y = 86;
const BELT_MAX_RADIUS_X = 290;
const COMPACT_QUERY = '(max-width: 880px)';

function beltRadiusX(width: number) {
  return Math.max(120, Math.min(BELT_MAX_RADIUS_X, width / 2 - 50));
}

export default function PersonaOrbit({ personas, active, playing, reduceMotion, onSelect, onTogglePlay, onHoldChange }: PersonaOrbitProps) {
  const gradientId = useId().replace(/:/g, '');
  const stageRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const angle = useRef(0);
  const target = useRef(0);
  const frame = useRef(0);
  const [width, setWidth] = useState(0);
  const [compact, setCompact] = useState(false);
  const hold = useRef({ pointer: false, focus: false, offscreen: false });
  const count = personas.length;
  const step = (2 * Math.PI) / count;
  const persona = personas[active];

  const reportHold = useCallback(() => {
    const { pointer, focus, offscreen } = hold.current;
    onHoldChange(pointer || focus || offscreen);
  }, [onHoldChange]);

  const place = useCallback((value: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const centreX = stage.clientWidth / 2;
    const radiusX = beltRadiusX(stage.clientWidth);
    itemRefs.current.forEach((item, index) => {
      if (!item) return;
      const theta = value + index * step;
      const depth = Math.cos(theta); // 1 = nearest the visitor, -1 = behind the card
      const scale = 0.62 + 0.38 * ((depth + 1) / 2);
      const x = centreX + radiusX * Math.sin(theta);
      const y = BELT_CENTRE_Y + BELT_RADIUS_Y * depth - 58 * scale;
      const atFront = index === active && depth > 0.6;
      item.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      item.style.zIndex = String(depth > 0.05 ? 250 + Math.round(depth * 100) : 20 + Math.round((depth + 1) * 80));
      item.style.opacity = atFront ? '0' : (0.55 + 0.45 * ((depth + 1) / 2)).toFixed(3);
      item.style.filter = depth < -0.3 ? `saturate(.8) blur(${((-depth - 0.3) * 1.2).toFixed(2)}px)` : '';
      item.dataset.front = String(atFront);
      item.dataset.near = String(depth > 0.2 && index !== active);
    });
  }, [active, step]);

  // Follow the viewport: the belt on wide screens, a swipeable row on narrow ones.
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const resize = new ResizeObserver(() => setWidth(stage.clientWidth));
    resize.observe(stage);
    const visibility = new IntersectionObserver(([entry]) => {
      hold.current.offscreen = !entry.isIntersecting;
      reportHold();
    }, { threshold: 0.2 });
    visibility.observe(stage);
    return () => { resize.disconnect(); visibility.disconnect(); };
  }, [reportHold]);

  // Turn the belt the short way round so the selected persona arrives at the front.
  useLayoutEffect(() => {
    const goal = -active * step;
    let delta = (goal - target.current) % (2 * Math.PI);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    target.current += delta;

    if (compact) {
      itemRefs.current.forEach((item) => {
        if (!item) return;
        for (const property of ['transform', 'z-index', 'opacity', 'filter']) item.style.removeProperty(property);
        delete item.dataset.front;
        delete item.dataset.near;
      });
      return;
    }
    if (reduceMotion) {
      angle.current = target.current;
      place(angle.current);
      return;
    }
    const tick = () => {
      const remaining = target.current - angle.current;
      angle.current = Math.abs(remaining) < 0.0005 ? target.current : angle.current + remaining * 0.085;
      place(angle.current);
      if (angle.current !== target.current) frame.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [active, compact, place, reduceMotion, step, width]);

  const radiusX = beltRadiusX(width || 600);
  const centreX = (width || 600) / 2;
  const arc = (back: boolean) => `M ${centreX - radiusX} ${BELT_CENTRE_Y} A ${radiusX} ${BELT_RADIUS_Y} 0 0 ${back ? 1 : 0} ${centreX + radiusX} ${BELT_CENTRE_Y}`;
  const belt = (back: boolean) => (
    <svg className={`persona-orbit-belt ${back ? 'is-back' : 'is-front'}`} viewBox={`0 0 ${width || 600} 640`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${gradientId}-${back ? 'b' : 'f'}`} x1="0" x2="1">
          <stop offset="0" stopColor="#D600C8" />
          <stop offset=".5" stopColor="#5222B8" />
          <stop offset="1" stopColor="#00BDD2" />
        </linearGradient>
      </defs>
      <path className="persona-orbit-glow" d={arc(back)} stroke={`url(#${gradientId}-${back ? 'b' : 'f'})`} />
      <path className="persona-orbit-line" d={arc(back)} stroke={`url(#${gradientId}-${back ? 'b' : 'f'})`} />
    </svg>
  );

  return (
    <div
      className="persona-orbit"
      data-compact={compact}
      style={{ '--persona-accent': persona.accent } as React.CSSProperties}
      onPointerEnter={() => { hold.current.pointer = true; reportHold(); }}
      onPointerLeave={() => { hold.current.pointer = false; reportHold(); }}
      onFocus={() => { hold.current.focus = true; reportHold(); }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        hold.current.focus = false;
        reportHold();
      }}
    >
      <div className="persona-orbit-stage" ref={stageRef}>
        {!compact && belt(true)}
        <figure className="persona-orbit-card">
          <Image
            key={persona.image}
            className="persona-orbit-photo"
            src={persona.image}
            alt={`Illustrative portrait of a ${persona.label.toLowerCase()}`}
            fill
            sizes="(max-width: 880px) 72vw, 300px"
            loading="eager"
            fetchPriority="high"
          />
        </figure>
        {!compact && belt(false)}
        <div className="persona-orbit-people" role="group" aria-label="Choose a pharmacy role">
          {personas.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => { itemRefs.current[index] = node; }}
              type="button"
              className="persona-orbit-person"
              style={{ '--person-accent': item.accent } as React.CSSProperties}
              aria-pressed={index === active}
              aria-label={`Show ${item.label}`}
              onClick={() => onSelect(index)}
            >
              <span className="persona-orbit-face"><Image src={item.image} alt="" fill sizes="84px" /></span>
              <span className="persona-orbit-name">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="persona-orbit-caption">
        <p className="persona-orbit-copy" aria-live={playing ? 'off' : 'polite'}>
          <strong>{persona.label}</strong>
          <span>{persona.short}</span>
        </p>
        <span className="persona-orbit-count" aria-hidden="true">{String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
        <div className="persona-orbit-controls">
          <button type="button" aria-label="Previous role" onClick={() => onSelect((active - 1 + count) % count)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" className="is-play" aria-label={playing ? 'Pause role rotation' : 'Play role rotation'} onClick={onTogglePlay}>
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <button type="button" aria-label="Next role" onClick={() => onSelect((active + 1) % count)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}

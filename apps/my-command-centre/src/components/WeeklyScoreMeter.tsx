interface Props { percent: number | null; label: string; compact?: boolean }
/** Scores are undefined for an empty plan: never display a misleading 0% or 100%. */
export function WeeklyScoreMeter({ percent, label, compact = false }: Props) {
  return <div className={`weekly-meter ${compact ? 'compact' : ''}`}>
    <div className="weekly-meter-heading"><span>{label}</span><strong>{percent === null ? 'Not scored' : `${percent}/100`}</strong></div>
    <div className="weekly-meter-track" role={percent === null ? 'img' : 'progressbar'}
      aria-label={percent === null ? 'No weekly score yet' : label}
      aria-valuemin={percent === null ? undefined : 0} aria-valuemax={percent === null ? undefined : 100}
      aria-valuenow={percent ?? undefined}><div className="weekly-meter-fill" style={{ width: `${percent ?? 0}%` }}/></div>
  </div>;
}

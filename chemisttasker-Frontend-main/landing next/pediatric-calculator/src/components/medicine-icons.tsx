export function MedicineBottle({size = 24}:{size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="2" width="8" height="4" rx="1"/>
    <path d="M9 6v2l-3 3v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-9l-3-3V6"/>
    <path d="M6 12h12v7H6m4-3.5h4m-2-2v4"/>
  </svg>;
}

export function MedicineSpoon({size = 24}:{size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="6.5" rx="4.5" ry="5"/>
    <path d="M10.8 11.4 10 20a2 2 0 0 0 4 0l-.8-8.6M9.5 7.5h5"/>
  </svg>;
}

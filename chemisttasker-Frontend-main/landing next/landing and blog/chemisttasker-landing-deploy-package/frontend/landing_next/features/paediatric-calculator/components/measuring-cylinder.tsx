/** Decorative graduated cylinder, matching the calculator's existing line icons. */
export function MeasuringCylinder() {
  return <svg width="44" height="54" viewBox="0 0 44 54" fill="none" aria-hidden="true">
    <path d="M13 4h21l-5 5v34l7 5v2H8v-2l7-5V9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M16 28h12v14H16z" fill="currentColor" opacity=".15" />
    <path d="M22 15h7m-4 5h4m-7 5h7m-4 5h4m-7 5h7m-4 5h4M13 46h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <text x="21" y="12" textAnchor="middle" fill="currentColor" fontSize="5" fontFamily="sans-serif" fontWeight="700">100 mL</text>
  </svg>;
}

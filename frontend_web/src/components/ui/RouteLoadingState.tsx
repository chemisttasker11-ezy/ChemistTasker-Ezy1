/** Public loading feedback; never renders cached account or workspace information. */
export default function RouteLoadingState({ label = 'Loading ChemistTasker…' }: { label?: string }) {
  return <div className="ct-route-loading" role="status" aria-live="polite" aria-busy="true">{label}</div>;
}

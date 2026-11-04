// Pure rules for the shared Shifts screen. Only imports shiftSurface, so the node test can load it.
import { isWorkerPersona, type ShiftPersona, type ShiftSection, type ShiftSurface } from './shiftSurface';

/** Where "Create invoice" goes from History; explorers have no invoices on web, so none. */
export function workerInvoiceRoute(persona: ShiftPersona | null): string | undefined {
  return persona === 'pharmacist' || persona === 'otherstaff' ? `/${persona}/invoice/new` : undefined;
}

/** Web's internal Shift Centre opens on My Roster: pharmacists and other staff in the internal workspace get a link to it. */
export function workerRosterRoute(surface: Pick<ShiftSurface, 'persona' | 'workspace'>): string | null {
  const { persona } = surface;
  if ((persona !== 'pharmacist' && persona !== 'otherstaff') || surface.workspace !== 'internal') return null;
  // The internal shell's own roster tab (useWorkerShell), so the tab bar stays.
  return `/${persona}/roster`;
}

/** A notification's ?tab=accepted opens the board on Offers; any other tab keeps the board's own default. */
export const incomingBoardTab = (tab?: string | null) => (String(tab ?? '').toLowerCase() === 'accepted' ? 'accepted' : undefined);

/** ?tab=accepted shows the workspace board (Offers live there) whatever ?section= says, until a section tap drops it. */
export function shownShiftSection(
  section: ShiftSection | null,
  sections: readonly ShiftSection[],
  workspace: ShiftSurface['workspace'],
  tab?: string | null,
): ShiftSection | null {
  const board: ShiftSection = workspace === 'platform' ? 'public' : 'community';
  return incomingBoardTab(tab) && sections.includes(board) ? board : section;
}

/** One line under the section tabs saying what the section is for (web copy, phone length). */
export function shiftSectionSubtitle(section: ShiftSection | null, persona: ShiftPersona | null): string {
  const worker = isWorkerPersona(persona);
  switch (section) {
    case 'public':
      return 'Open shifts from pharmacies across ChemistTasker. Save the ones you like and show interest in one tap.';
    case 'community':
      return 'Shifts shared by the pharmacies and teams you belong to.';
    case 'active':
      return 'Shifts you have posted that are still filling.';
    case 'confirmed':
      return worker ? "Shifts you are booked for, with the pharmacy's details and your locked rate." : 'Shifts with a booked worker.';
    case 'history':
      if (!worker) return 'Shifts that have finished.';
      return workerInvoiceRoute(persona) ? 'Shifts you have worked. Raise an invoice and rate the pharmacy.' : 'Shifts you have worked. Rate the pharmacy.';
    default:
      return '';
  }
}

/** Whether Save Rating is disabled. */
export function isRatingSaveDisabled(params: {
  loading: boolean;
  saving: boolean;
  stars: number;
  hasError?: boolean;
}): boolean {
  return params.loading || params.saving || params.stars === 0 || Boolean(params.hasError);
}

/** Whether a rating fetch response matches the current dialog generation and target. */
export function shouldApplyRatingResponse(
  currentGen: number,
  requestGen: number,
  currentTargetId: number | null,
  requestTargetId: number | null,
): boolean {
  return currentGen === requestGen && currentTargetId === requestTargetId && currentTargetId != null;
}

/** Clean initial state for opening or closing a rating dialog. */
export function createInitialRatingState<T>(target: T | null) {
  return {
    target,
    stars: 0,
    comment: '',
    loading: true,
    error: null as string | null,
    saving: false,
  };
}

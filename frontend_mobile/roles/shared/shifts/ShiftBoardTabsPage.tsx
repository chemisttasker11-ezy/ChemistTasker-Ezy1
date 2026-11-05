import React from 'react';
import { ContentState } from '@/components/ui';
import { space } from '@/constants/tokens';
import PublicShiftsView from './PublicShiftsView';
import CommunityShiftsView from './CommunityShiftsView';
import { useShiftSurface } from './useShiftSurface';

/** The worker's board for the current workspace (Community inside, Public on the platform) with its own view tabs. */
export default function ShiftBoardTabsPage() {
    const surface = useShiftSurface();
    if (!surface.ready) return <ContentState kind="loading" style={{ margin: space.lg }} />;
    return surface.workspace === 'internal' ? <CommunityShiftsView /> : <PublicShiftsView />;
}

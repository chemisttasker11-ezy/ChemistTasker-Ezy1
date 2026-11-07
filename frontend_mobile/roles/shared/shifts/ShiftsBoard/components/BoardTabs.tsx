import React from 'react';
import { SegmentTabs, type SegmentTab } from '@/components/ui/SegmentTabs';
import { space } from '@/constants/tokens';

export type BoardTab = 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted';

export function BoardTabs({ value, onChange, savedCount }: { value: BoardTab; onChange: (tab: BoardTab) => void; savedCount: number }) {
  const tabs: SegmentTab<BoardTab>[] = [
    { value: 'browse', label: 'Browse' },
    { value: 'saved', label: savedCount > 0 ? `Saved · ${savedCount}` : 'Saved', accessibilityLabel: `Saved, ${savedCount}` },
    { value: 'interested', label: 'Interested' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'accepted', label: 'Offers' },
  ];
  return <SegmentTabs tabs={tabs} value={value} onChange={onChange} label="Board views" secondary idPrefix="board-views" style={{ marginHorizontal: space.lg }} />;
}

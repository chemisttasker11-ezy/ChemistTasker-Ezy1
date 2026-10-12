import { useMemo } from 'react';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { filterTalentCandidates } from '@chemisttasker/shared-core';
import type { Candidate } from '../types';
import type { TalentFilterState } from '../components/FiltersSidebar';

export const useTalentFilters = (candidates: Candidate[], filters: TalentFilterState) =>
  useMemo(() => filterTalentCandidates(registry as any, candidates, filters), [candidates, filters]);

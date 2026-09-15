import { useMemo } from "react";
import { Candidate } from "../types";
import { TalentFilterState } from "../components/FiltersSidebar";

export const useTalentFilters = (candidates: Candidate[], filters: TalentFilterState) => {
  const normalizedStart = filters.availabilityStart ?? null;
  const normalizedEnd = filters.availabilityEnd ?? null;
  const hasDateFilter = Boolean(normalizedStart || normalizedEnd);
  const startBound =
    normalizedStart && normalizedEnd && normalizedStart > normalizedEnd ? normalizedEnd : normalizedStart;
  const endBound =
    normalizedStart && normalizedEnd && normalizedStart > normalizedEnd ? normalizedStart : normalizedEnd;

  const roleOptions = useMemo(() => {
    const unique = new Set<string>();
    candidates.forEach((c) => {
      if (c.role) unique.add(c.role);
    });
    return Array.from(unique).sort();
  }, [candidates]);

  const stateOptions = useMemo(() => {
    const unique = new Set<string>();
    candidates.forEach((c) => {
      if (c.state) unique.add(c.state);
    });
    return Array.from(unique).sort();
  }, [candidates]);

  const roleSkillOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    candidates.forEach((c) => {
      if (!map[c.role]) map[c.role] = [];
      const roleSkills = [...(c.clinicalServices ?? []), ...(c.expandedScope ?? []), ...(c.skills ?? [])];
      map[c.role].push(...roleSkills);
    });
    Object.keys(map).forEach((role) => {
      map[role] = Array.from(new Set(map[role])).sort();
    });
    return map;
  }, [candidates]);

  const softwareOptions = useMemo(() => {
    const unique = new Set<string>();
    candidates.forEach((c) => c.dispenseSoftware.forEach((s: string) => unique.add(s)));
    return Array.from(unique).sort();
  }, [candidates]);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (search) {
        const haystack = `${c.role} ${c.pitch} ${c.city} ${c.refId}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters.roles.length > 0 && !filters.roles.includes(c.role)) return false;
      if (filters.workTypes.length > 0) {
        const hasMatch = c.workTypes.some((type: string) => filters.workTypes.includes(type));
        if (!hasMatch) return false;
      }
      if (filters.states.length > 0 && !filters.states.includes(c.state)) return false;
      if (filters.skills.length > 0) {
        const allSkills = Array.from(
          new Set([...(c.skills ?? []), ...(c.dispenseSoftware ?? [])])
        );
        const hasAllSkills = filters.skills.every((skill: string) => allSkills.includes(skill));
        if (!hasAllSkills) return false;
      }
      if (filters.willingToTravel && !c.willingToTravel) return false;
      if (filters.placementSeeker && !c.isInternshipSeeker) return false;
      if (hasDateFilter) {
        const dates = Array.isArray(c.availableDates) ? c.availableDates : [];
        if (dates.length === 0) return false;
        const matches = dates.some((date) => {
          if (startBound && date < startBound) return false;
          if (endBound && date > endBound) return false;
          return true;
        });
        if (!matches) return false;
      }
      return true;
    });
  }, [candidates, filters, hasDateFilter, startBound, endBound]);

  return {
    filtered,
    roleOptions,
    stateOptions,
    roleSkillOptions,
    softwareOptions,
  };
};

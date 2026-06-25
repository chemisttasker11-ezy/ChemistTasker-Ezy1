import { useCallback, useEffect, useState } from 'react';
import { getExplorerPostFeed } from '@chemisttasker/shared-core';

type ExplorerPost = Record<string, any>;

const mapPost = (post: any): ExplorerPost => ({
  ...post,
  authorUserId: post.author_user_id ?? post.authorUserId ?? null,
  roleTitle: post.role_title ?? post.roleTitle ?? null,
  workTypes: post.work_types ?? post.workTypes ?? null,
  postKind: post.post_kind ?? post.postKind ?? null,
  coverageRadiusKm: post.coverage_radius_km ?? post.coverageRadiusKm ?? null,
  openToTravel: post.open_to_travel ?? post.openToTravel ?? null,
  availabilityMode: post.availability_mode ?? post.availabilityMode ?? null,
  availabilitySummary: post.availability_summary ?? post.availabilitySummary ?? null,
  availabilityDays: post.availability_days ?? post.availabilityDays ?? null,
  availabilityNotice: post.availability_notice ?? post.availabilityNotice ?? null,
  locationState: post.location_state ?? post.locationState ?? null,
  locationSuburb: post.location_suburb ?? post.locationSuburb ?? null,
  locationPostcode: post.location_postcode ?? post.locationPostcode ?? null,
  skills: post.skills ?? null,
  software: post.software ?? null,
  referenceCode: post.reference_code ?? post.referenceCode ?? null,
  isAnonymous: post.is_anonymous ?? post.isAnonymous ?? null,
  explorerRoleType: post.explorer_role_type ?? post.explorerRoleType ?? null,
  explorerUserId: post.explorer_user_id ?? post.explorerUserId ?? null,
  explorerProfileId: post.explorer_profile ?? post.explorerProfile ?? null,
});

export const useTalentFeed = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<ExplorerPost[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res: any = await getExplorerPostFeed({ page: 1, page_size: 200 });
      if (Array.isArray(res)) {
        const mapped = res.map(mapPost);
        setPosts(mapped);
        setTotalCount(mapped.length);
      } else if (res && Array.isArray(res.results)) {
        const mapped = res.results.map(mapPost);
        setPosts(mapped);
        setTotalCount(typeof res.count === 'number' ? res.count : mapped.length);
      } else {
        setPosts([]);
        setTotalCount(0);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load talent feed.');
      setPosts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [load, enabled]);

  return { posts, totalCount, loading, error, reload: load };
};







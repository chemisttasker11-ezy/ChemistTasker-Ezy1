import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { addDashboardScopeParams } from "../dashboardRouteScope";
import { fetchAccessibleOrganizationPharmacies, getOnboardingDetail, getOrganizationMembership, hasFavoriteStaffMembership, hasOrganizationAccess, hasVerifiedWorkerProfile, isAdminPersonaAssignment, fetchPharmaciesService } from "@chemisttasker/shared-core";
import { collectPharmacies, type PharmacyOption } from "./shellModel";

export function useDashboardWorkspaceScope(forceAdminScope: boolean) {
  const {
    user,
    activePersona,
    adminAssignments,
    activeAdminPharmacyId,
    isAdminUser,
    selectRolePersona,
    selectAdminPersona,
    setActivePersona,
  } = useAuth();
  const {
    workspace,
    setWorkspace,
    canUseInternal,
    selectedPharmacyId: workspaceSelectedPharmacyId,
    setSelectedPharmacyId: setWorkspacePharmacyId,
  } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(activeAdminPharmacyId ?? workspaceSelectedPharmacyId ?? null);
  const [workerVerified, setWorkerVerified] = useState<boolean>(() => hasVerifiedWorkerProfile(user));
  const [otherStaffRoleType, setOtherStaffRoleType] = useState<string | null>(() => {
    return (user as any)?.other_staff_profile?.role_type ?? (user as any)?.otherStaffProfile?.roleType ?? null;
  });

  const [organizationPharmacies, setOrganizationPharmacies] = useState<PharmacyOption[]>([]);
  const [authorizedOwnerPharmacies, setAuthorizedOwnerPharmacies] = useState<PharmacyOption[] | null>(null);
  const organizationId = getOrganizationMembership(user)?.organization_id;
  useEffect(() => {
    if (!organizationId) {
      setOrganizationPharmacies([]);
      return;
    }
    let active = true;
    setOrganizationPharmacies([]);
    fetchAccessibleOrganizationPharmacies(organizationId)
      .then((items) => { if (active) setOrganizationPharmacies(items); })
      .catch(() => { if (active) setOrganizationPharmacies([]); });
    return () => { active = false; };
  }, [organizationId]);
  // The pharmacy API is the source of truth for accessible locations. OWNER admin rows are
  // a subset of that list on some older accounts and must not silently hide legitimate locations.
  useEffect(() => {
    if (String(user?.role || "").toUpperCase() !== "OWNER") {
      setAuthorizedOwnerPharmacies(null);
      return;
    }
    let active = true;
    setAuthorizedOwnerPharmacies(null);
    fetchPharmaciesService({})
      .then((items) => {
        if (!active) return;
        setAuthorizedOwnerPharmacies((items || [])
          .map((item: any) => ({ id: Number(item.id), name: String(item.name || "").trim() }))
          .filter((item) => Number.isFinite(item.id) && item.id > 0 && Boolean(item.name)));
      })
      .catch(() => { if (active) setAuthorizedOwnerPharmacies(null); });
    return () => { active = false; };
  }, [user?.id, user?.role]);

  const ownedPharmacyIds = useMemo(() => {
    const ids = new Set<number>();
    const add = (id: unknown) => { const number = Number(id); if (Number.isFinite(number) && number > 0) ids.add(number); };
    (user?.memberships ?? []).forEach((membership: any) => {
      if (["OWNER", "PHARMACY_OWNER"].includes(String(membership?.role || "").toUpperCase()) || membership?.is_pharmacy_owner === true) {
        add(membership.pharmacy_id ?? membership.pharmacyId ?? membership.pharmacy?.id);
      }
    });
    adminAssignments.filter((assignment) => String(assignment.admin_level || "").toUpperCase() === "OWNER")
      .forEach((assignment) => add(assignment.pharmacy_id));
    for (const key of ["owned_pharmacies", "owner_pharmacies"]) {
      const list = (user as any)?.[key];
      if (Array.isArray(list)) list.forEach((item: any) => add(item?.id));
    }
    return ids;
  }, [user, adminAssignments]);

  const pharmacies = useMemo(() => {
    const byId = new Map(collectPharmacies(user, adminAssignments).map((item) => [item.id, item]));
    organizationPharmacies.forEach((item) => byId.set(item.id, { ...item, helper: "Organization pharmacy" }));
    // The server-authorised list includes all owned and delegated pharmacies. Keep delegated
    // assignments visible but route their selection through the existing Admin persona.
    if (String(user?.role || "").toUpperCase() === "OWNER" && authorizedOwnerPharmacies !== null) {
      const authorised = new Set(authorizedOwnerPharmacies.map((item) => item.id));
      return authorizedOwnerPharmacies.map((item) => ({
        ...item,
        helper: ownedPharmacyIds.has(item.id) ? "Owner" :
          adminAssignments.some((assignment) => Number(assignment.pharmacy_id) === item.id && isAdminPersonaAssignment(assignment))
            ? "Admin access" : byId.get(item.id)?.helper ?? "Accessible pharmacy",
      })).filter((item) => authorised.has(item.id)).sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [user, adminAssignments, organizationPharmacies, authorizedOwnerPharmacies, ownedPharmacyIds]);
  const isOrgUser = hasOrganizationAccess(user);
  const isOwner = String(user?.role || "").toUpperCase() === "OWNER";
  const isWorker = ["PHARMACIST", "OTHER_STAFF"].includes(String(user?.role || "").toUpperCase());
  // Owners and explorers can also hold a delegated admin assignment at another pharmacy; they switch the same way.
  const hasOwnPersona = isWorker || ["OWNER", "EXPLORER"].includes(String(user?.role || "").toUpperCase());
  const delegatedAdminAssignments = useMemo(
    () => adminAssignments.filter((assignment) => isAdminPersonaAssignment(assignment)),
    [adminAssignments],
  );
  const isFavoriteStaff = useMemo(() => hasFavoriteStaffMembership(user), [user]);
  const canUsePlatformWorkspace = isWorker && (workerVerified || isFavoriteStaff) && activePersona !== "admin" && !forceAdminScope;
  const hidePharmacyScope = forceAdminScope || activePersona === "admin";
  const showPharmacySelector = !hidePharmacyScope && (isOwner || isOrgUser || isWorker) && (pharmacies.length > 0 || canUsePlatformWorkspace);
  const selectedPharmacy = pharmacies.find((item) => item.id === selectedPharmacyId) ?? null;
  useEffect(() => {
    const initialVerified = hasVerifiedWorkerProfile(user);
    setWorkerVerified(initialVerified);

    if (!user || !isWorker) return;

    let cancelled = false;
    const roleKey = String(user.role).toUpperCase() === "PHARMACIST" ? "pharmacist" : "other_staff";

    getOnboardingDetail(roleKey)
      .then((onboarding: any) => {
        if (cancelled) return;
        setWorkerVerified(hasVerifiedWorkerProfile(onboarding));
        if (roleKey === "other_staff") {
          const roleType = onboarding?.role_type ?? onboarding?.data?.role_type ?? null;
          setOtherStaffRoleType(roleType);
        }
      })
      .catch(() => {
        if (!cancelled) setWorkerVerified(initialVerified);
      });

    return () => {
      cancelled = true;
    };
  }, [isWorker, user]);

  useEffect(() => {
    if (hidePharmacyScope) return;
    const rawPharmacyId =
      searchParams.get("pharmacy_id") ??
      searchParams.get("pharmacy") ??
      searchParams.get("pharmacyId");
    const nextPharmacyId = Number(rawPharmacyId);
    if (Number.isFinite(nextPharmacyId) && pharmacies.some((pharmacy) => pharmacy.id === nextPharmacyId)) {
      setWorkspace("internal");
      setSelectedPharmacyId(nextPharmacyId);
      setWorkspacePharmacyId(nextPharmacyId);
    }
  }, [hidePharmacyScope, pharmacies, searchParams, setWorkspace, setWorkspacePharmacyId]);

  useEffect(() => {
    if (hidePharmacyScope || workspace === "platform") return;
    if (workspaceSelectedPharmacyId != null && workspaceSelectedPharmacyId !== selectedPharmacyId) {
      setSelectedPharmacyId(workspaceSelectedPharmacyId);
    }
  }, [hidePharmacyScope, selectedPharmacyId, workspace, workspaceSelectedPharmacyId]);

  useEffect(() => {
    if (canUsePlatformWorkspace || workspace !== "platform") return;
    setWorkspace("internal");
    // Preserve an explicit requested scope while the authorised pharmacy list loads.
    // Django validates access; normalisation must not widen the request to all locations.
    const urlPharmacyId = Number(searchParams.get("pharmacy_id") ?? searchParams.get("pharmacy") ?? searchParams.get("pharmacyId"));
    const urlPharmacy = Number.isFinite(urlPharmacyId) && urlPharmacyId > 0 ? urlPharmacyId : null;
    const fallbackPharmacyId = urlPharmacy ?? (isOrgUser ? null : selectedPharmacyId ?? workspaceSelectedPharmacyId ?? pharmacies[0]?.id ?? null);
    setSelectedPharmacyId(fallbackPharmacyId);
    setWorkspacePharmacyId(fallbackPharmacyId);
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      nextParams.set("workspace", "internal");
      nextParams.delete("pharmacy_id");
      nextParams.delete("pharmacy");
      nextParams.delete("pharmacyId");
      if (fallbackPharmacyId != null) {
        nextParams.set("pharmacy_id", String(fallbackPharmacyId));
      }
      return nextParams;
    }, { replace: true });
  }, [
    canUsePlatformWorkspace,
    isOrgUser,
    pharmacies,
    searchParams,
    selectedPharmacyId,
    setSearchParams,
    setWorkspace,
    setWorkspacePharmacyId,
    workspace,
    workspaceSelectedPharmacyId,
  ]);

  useEffect(() => {
    if (hidePharmacyScope) {
      setSelectedPharmacyId(activeAdminPharmacyId ?? null);
      setWorkspacePharmacyId(activeAdminPharmacyId ?? null);
      return;
    }
    if (workspace === "platform") {
      setSelectedPharmacyId(null);
      setWorkspacePharmacyId(null);
      return;
    }
    if (!isOrgUser && selectedPharmacyId == null && pharmacies[0]) {
      setSelectedPharmacyId(pharmacies[0].id);
      setWorkspacePharmacyId(pharmacies[0].id);
    }
  }, [activeAdminPharmacyId, hidePharmacyScope, isOrgUser, pharmacies, selectedPharmacyId, setWorkspacePharmacyId, workspace]);

  const applyScopeToCurrentUrl = (pharmacyId: number | null) => {
    setSearchParams((current) => {
      const scoped = addDashboardScopeParams(`${location.pathname}?${current.toString()}`, pharmacyId);
      const [, query = ""] = scoped.split("?");
      const nextParams = new URLSearchParams(query);
      return nextParams.toString() === current.toString() ? current : nextParams;
    }, { replace: true });
  };

  const handleSelectPlatform = () => {
    if (!canUsePlatformWorkspace) {
      return;
    }
    setWorkspace("platform");
    setSelectedPharmacyId(null);
    setWorkspacePharmacyId(null);
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      nextParams.set("workspace", "platform");
      nextParams.delete("pharmacy_id");
      nextParams.delete("pharmacy");
      nextParams.delete("pharmacyId");
      nextParams.delete("view");
      return nextParams;
    }, { replace: true });
  };

  const handleSelectPharmacy = (id: number) => {
    if (!pharmacies.some((pharmacy) => pharmacy.id === id)) return;
    // A delegated assignment has its own capability-gated Admin workspace. Do not
    // silently treat it as Owner authority when selecting from the combined list.
    if (isOwner && !ownedPharmacyIds.has(id)) {
      const assignment = delegatedAdminAssignments.find((row) => Number(row.pharmacy_id) === id && row.id != null);
      if (assignment?.id != null) {
        selectAdminPersona(assignment.id);
          navigate(`/dashboard/admin/${id}/overview`);
        return;
      }
    }
    setWorkspace("internal");
    setSelectedPharmacyId(id);
    setWorkspacePharmacyId(id);
    applyScopeToCurrentUrl(id);
  };

  const handleSelectAllOrganizationPharmacies = () => {
    setWorkspace("internal");
    setSelectedPharmacyId(null);
    setWorkspacePharmacyId(null);
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      nextParams.set("workspace", "internal");
      nextParams.delete("pharmacy_id");
      nextParams.delete("pharmacy");
      nextParams.delete("pharmacyId");
      nextParams.delete("view");
      return nextParams;
    }, { replace: true });
  };

  return { user, activePersona, isAdminUser, selectRolePersona, selectAdminPersona, setActivePersona, navigate, workspace, canUseInternal, selectedPharmacyId, pharmacies, isOrgUser, hasOwnPersona, delegatedAdminAssignments, canUsePlatformWorkspace, showPharmacySelector, selectedPharmacy, otherStaffRoleType, handleSelectPlatform, handleSelectPharmacy, handleSelectAllOrganizationPharmacies };
}

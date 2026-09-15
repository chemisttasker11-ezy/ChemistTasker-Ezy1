// src/pages/dashboard/sidebar/owner/OwnerOverviewContainer.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";
import TopBar from "./TopBar";
import { useAuth } from '../../../../contexts/AuthContext';
import { useWorkspace } from '../../../../contexts/WorkspaceContext';
import OwnerOverviewHome from "./OwnerOverviewHome";
import OwnerPharmaciesPage from "./OwnerPharmaciesPage";
import OwnerPharmacyDetailPage from "./OwnerPharmacyDetailPage";
import OwnerBillingPage from "./OwnerBillingPage";
import { MembershipDTO, PharmacyAdminDTO, PharmacyDTO } from "./types";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchPharmaciesService,
  fetchPharmacyAdminsService,
} from "@chemisttasker/shared-core";
import apiClient from "../../../../utils/apiClient";
import { fetchMembershipsForPharmacy } from "./membershipApi";

type View = "overview" | "pharmacies" | "pharmacy" | "billing";

const membershipIsVisibleCategoryMember = (membership: MembershipDTO) => {
  const status = String((membership as any).status || "").toUpperCase();
  return !["REJECTED", "LEFT"].includes(status);
};

export default function OwnerOverviewContainer() {
  const navigate = useNavigate();
  const [pharmacies, setPharmacies] = useState<PharmacyDTO[]>([]);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [membershipsByPharmacy, setMembershipsByPharmacy] = useState<Record<string, MembershipDTO[]>>({});
  const [adminAssignmentsByPharmacy, setAdminAssignmentsByPharmacy] = useState<Record<string, PharmacyAdminDTO[]>>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const { activePersona, activeAdminPharmacyId } = useAuth();
  const { selectedPharmacyId: workspacePharmacyId, workspace } = useWorkspace();
  const scopedPharmacyId =
    activePersona === "admin" && typeof activeAdminPharmacyId === "number"
      ? activeAdminPharmacyId
      : null;
  const adminBasePath = scopedPharmacyId != null ? `/dashboard/admin/${scopedPharmacyId}` : null;

  const fetchMemberships = useCallback(
    async (pharmacyId: string) => fetchMembershipsForPharmacy(pharmacyId),
    []
  );

  const fetchAdmins = useCallback(
    async (pharmacyId: string) => {
      const admins = await fetchPharmacyAdminsService(Number(pharmacyId));
      return admins;
    },
    []
  );

  const reloadPharmacyMemberships = useCallback(async (pharmacyId: string) => {
    try {
      const [memberships, admins] = await Promise.all([
        fetchMemberships(pharmacyId),
        fetchAdmins(pharmacyId),
      ]);
      setMembershipsByPharmacy((prev) => ({ ...prev, [pharmacyId]: memberships }));
      setAdminAssignmentsByPharmacy((prev) => ({ ...prev, [pharmacyId]: admins }));
    } catch (error) {
      console.error("Failed to reload memberships", error);
    }
  }, [fetchMemberships, fetchAdmins, scopedPharmacyId]);

  // Fetch pharmacies + memberships (like your Pharmacy page)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetchPharmaciesService({});
        if (!mounted) return;

        // FIX: Extract the array from the 'results' property if it exists.
        const normalizedPharmacies: PharmacyDTO[] = res.map((item: any) => ({
          ...item,
          id: String(item.id),
        }));
        const scopedPharmacies =
          scopedPharmacyId != null
            ? normalizedPharmacies.filter((pharmacy) => Number(pharmacy.id) === scopedPharmacyId)
            : normalizedPharmacies;
        setPharmacies(scopedPharmacies);

        // Load memberships for each pharmacy
        const memberMap: Record<string, MembershipDTO[]> = {};
        const adminMap: Record<string, PharmacyAdminDTO[]> = {};
        await Promise.all(
          scopedPharmacies.map(async (p) => {
            const [memberships, admins] = await Promise.all([
              fetchMemberships(p.id),
              fetchAdmins(p.id),
            ]);
            memberMap[p.id] = memberships;
            adminMap[p.id] = admins;
          })
        );
        if (!mounted) return;
        setMembershipsByPharmacy(memberMap);
        setAdminAssignmentsByPharmacy(adminMap);
      } catch (e) {
        console.error("OwnerOverviewContainer fetch error:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchMemberships, fetchAdmins, scopedPharmacyId]);

  const setViewParam = useCallback(
    (nextView: View, options?: { pharmacyId?: string | null; replace?: boolean }) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextView === "overview") {
        nextParams.delete("view");
        nextParams.delete("pharmacyId");
      } else {
        nextParams.set("view", nextView);
        if (nextView === "pharmacy" && options?.pharmacyId) {
          nextParams.set("pharmacyId", options.pharmacyId);
        } else {
          nextParams.delete("pharmacyId");
        }
      }
      setSearchParams(nextParams, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams]
  );

  const rawViewParam = searchParams.get("view");
  const rawPharmacyId = searchParams.get("pharmacyId");
  const view: View =
    rawViewParam === "pharmacy" && rawPharmacyId
      ? "pharmacy"
      : rawViewParam === "pharmacies"
        ? "pharmacies"
        : rawViewParam === "billing"
          ? "billing"
          : "overview";
  const activePharmacyId = view === "pharmacy" && rawPharmacyId ? rawPharmacyId : null;
  const urlScopePharmacyId = Number(
    searchParams.get("pharmacy_id") ??
    searchParams.get("pharmacy") ??
    searchParams.get("pharmacyId")
  );

  const activePharmacy = useMemo(
    () => pharmacies.find((p) => p.id === activePharmacyId) || null,
    [pharmacies, activePharmacyId]
  );
  const overviewPharmacyId =
    scopedPharmacyId != null
      ? scopedPharmacyId
      : workspace === "internal" && typeof workspacePharmacyId === "number"
        ? workspacePharmacyId
        : Number.isFinite(urlScopePharmacyId)
          ? urlScopePharmacyId
          : null;
  const staffCounts = useMemo(
    () => Object.fromEntries(pharmacies.map((p) => [p.id, (membershipsByPharmacy[p.id] || []).length])),
    [pharmacies, membershipsByPharmacy]
  );

  useEffect(() => {
    let mounted = true;
    const dashboardParams =
      overviewPharmacyId
        ? { workspace: "internal", pharmacy_id: overviewPharmacyId }
        : { workspace: "platform" };
    apiClient
      .get("/client-profile/dashboard/owner/", { params: dashboardParams })
      .then(({ data }) => {
        if (mounted) setDashboardData(data);
      })
      .catch((error: any) => {
        console.error("Owner dashboard analytics fetch error:", error);
        if (mounted) setDashboardData(null);
      });
    return () => {
      mounted = false;
    };
  }, [overviewPharmacyId, workspace]);

  const goHome = () => setViewParam("overview");
  const openPharmacies = (options?: { replace?: boolean }) => setViewParam("pharmacies", { replace: options?.replace });
  const openPharmacy = (id: string) => {
    setViewParam("pharmacy", { pharmacyId: id });
    void reloadPharmacyMemberships(id);
  };
  const openAdmins = (id: string) => {
    setViewParam("pharmacy", { pharmacyId: id }); // Admins panel is inside the detail page in this split
    void reloadPharmacyMemberships(id);
  };

  const buildOwnerPath = (suffix: string) =>
    `/dashboard/owner/${suffix}`;
  const resolvePath = (suffix: string) =>
    adminBasePath ? `${adminBasePath}/${suffix}` : buildOwnerPath(suffix);

  const goToRoster = () => navigate(resolvePath("manage-pharmacies/roster"));
  const goToShifts = () => navigate(resolvePath("shift-center"));
  const goToPostShift = () => navigate(resolvePath("post-shift"));
  const goToProfile = () => navigate(resolvePath("onboarding"));
  const goToInterests = () => navigate(resolvePath("interests"));
  const goToManagePharmacies = () => {
    if (pharmacies.length === 1) {
      const pharmacyId = pharmacies[0].id;
      navigate(
        `${resolvePath("manage-pharmacies/my-pharmacies")}?workspace=internal&pharmacy_id=${pharmacyId}&view=detail&pharmacyId=${pharmacyId}`
      );
      return;
    }
    navigate(resolvePath("manage-pharmacies/my-pharmacies"));
  };
  const goToPills = () => navigate("/dashboard/owner/pills");
  const goToSettings = () => undefined;
  const goToPharmacyManager = (query: string) =>
    navigate(`${resolvePath("manage-pharmacies/my-pharmacies")}${query}`);
  const handleEditPharmacy = (pharmacy: PharmacyDTO) => {
    goToPharmacyManager(`?view=detail&pharmacyId=${pharmacy.id}&action=edit`);
  };
  const handleDeletePharmacy = (pharmacyId: string) => {
    goToPharmacyManager(`?view=detail&pharmacyId=${pharmacyId}&action=delete`);
  };

  useEffect(() => {
    if (
      view === "pharmacy" &&
      activePharmacyId &&
      (!(activePharmacyId in membershipsByPharmacy) || !(activePharmacyId in adminAssignmentsByPharmacy))
    ) {
      void reloadPharmacyMemberships(activePharmacyId);
    }
  }, [view, activePharmacyId, membershipsByPharmacy, adminAssignmentsByPharmacy, reloadPharmacyMemberships]);

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {view === "overview" && (
        <>
          <TopBar breadcrumb={["Overview"]} />
          <OwnerOverviewHome
            totalPharmacies={pharmacies.length}
            pharmacies={pharmacies}
            selectedPharmacyId={overviewPharmacyId}
            dashboardData={dashboardData}
            onOpenManage={goToManagePharmacies}
            onOpenRoster={goToRoster}
            onOpenShifts={goToShifts}
            onPostShift={goToPostShift}
            onOpenProfile={goToProfile}
            onOpenInterests={goToInterests}
            onOpenSettings={goToSettings}
            onOpenPills={goToPills}
          />
        </>
      )}

      {view === "pharmacies" && (
        <>
          <TopBar onBack={goHome} breadcrumb={["My Pharmacies"]} />
          <OwnerPharmaciesPage
            pharmacies={pharmacies}
            staffCounts={staffCounts}
            onOpenPharmacy={openPharmacy}
            onEditPharmacy={handleEditPharmacy}
            onDeletePharmacy={handleDeletePharmacy}
            onOpenAdmins={openAdmins}
          />
        </>
      )}

      {view === "pharmacy" && activePharmacy && (
        <>
          <TopBar onBack={() => openPharmacies({ replace: true })} breadcrumb={["My Pharmacies", activePharmacy.name]} />
          {(() => {
            const membershipList = membershipsByPharmacy[activePharmacy.id] || [];
            const adminList = adminAssignmentsByPharmacy[activePharmacy.id] || [];
            const nonOwnerMemberships = membershipList.filter((m) => !m.is_pharmacy_owner);
            const staffMemberships = nonOwnerMemberships.filter((m) => {
              const role = (m.role || "").toUpperCase();
              const work = (m.employment_type || "").toUpperCase();
              return membershipIsVisibleCategoryMember(m) && !role.includes("ADMIN") && !work.includes("LOCUM") && !work.includes("SHIFT");
            });
            const locumMemberships = nonOwnerMemberships.filter((m) => {
              const role = (m.role || "").toUpperCase();
              const work = (m.employment_type || "").toUpperCase();
              return membershipIsVisibleCategoryMember(m) && !role.includes("ADMIN") && (work.includes("LOCUM") || work.includes("SHIFT"));
            });
            const pendingAdminMemberships = nonOwnerMemberships.filter(
              (m) =>
                Boolean((m as any).is_pharmacy_admin ?? (m as any).isPharmacyAdmin) &&
                (String((m as any).status || "").toUpperCase() === "PENDING" ||
                  ((m as any).is_active ?? (m as any).isActive) === false)
            );
            const visibleAdminList = adminList.filter((admin) => admin.admin_level !== "OWNER" && admin.is_active !== false);
            return (
              <OwnerPharmacyDetailPage
                pharmacy={activePharmacy}
                staffMemberships={staffMemberships}
                locumMemberships={locumMemberships}
                adminAssignments={visibleAdminList}
                pendingAdminMemberships={pendingAdminMemberships}
                onMembershipsChanged={() => reloadPharmacyMemberships(activePharmacy.id)}
              />
            );
          })()}
        </>
      )}

      {view === "billing" && (
        <OwnerBillingPage
          onBack={goHome}
          totalPharmacies={pharmacies.length}
        />
      )}
    </Box>
  );
}



export function addDashboardScopeParams(path: string, selectedPharmacyId: number | null) {
  if (!selectedPharmacyId) return path;
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const isRoster = pathname.includes("/manage-pharmacies/roster") || pathname.includes("/shifts/roster");
  const isCalendar = pathname.endsWith("/calendar");
  const isPostShift = pathname.endsWith("/post-shift");
  const isMyPharmacies = pathname.includes("/manage-pharmacies/my-pharmacies");

  params.set("workspace", "internal");
  params.set("pharmacy_id", String(selectedPharmacyId));

  if (isCalendar || isPostShift || isRoster) {
    params.set("pharmacy", String(selectedPharmacyId));
  }
  if (isMyPharmacies || (pathname.endsWith('/manage-pharmacies') && params.get('view') === 'detail')) {
    params.set("view", "detail");
    params.set("pharmacyId", String(selectedPharmacyId));
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function normalizeDashboardSegment(parentPath: string, item: any) {
  const segment = String(item?.segment || "").replace(/^\/+/, "");
  if (!segment) return parentPath;
  if (segment.startsWith("dashboard/")) return `/${segment}`;
  return `${parentPath.replace(/\/+$/, "")}/${segment}`.replace(/\/+/g, "/");
}

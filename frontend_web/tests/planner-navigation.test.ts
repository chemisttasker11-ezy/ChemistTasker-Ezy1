import { describe, expect, it } from "vitest";
import { getAdminNav, getOrganizationNav, getOwnerNav } from "../src/navigation";

describe("Calendar navigation replaces Operations access", () => {
    it.each([["manage_roster"], ["manage_communications"], ["manage_roster", "manage_communications"]])("keeps the organization permission union: %s", (...capabilities) => {
        const navigation = getOrganizationNav(false, capabilities);
        expect(navigation.filter(item => "title" in item && item.title === "Calendar")).toHaveLength(1);
        expect(JSON.stringify(navigation)).not.toContain("/operations");
    });
    it("does not add organization Calendar without either former permission", () => {
        expect(getOrganizationNav(false, []).some(item => "title" in item && item.title === "Calendar")).toBe(false);
    });
    it("retains scoped pharmacy-admin roster access", () => {
        const assignment = { pharmacy_id: 101, admin_level: "FULL_ADMIN" as const, capabilities: ["MANAGE_ROSTER" as const] };
        const navigation = getAdminNav({ assignments: [assignment], activeAssignment: assignment, hasUnreadMessages: false, userRole: "PHARMACIST", activePharmacyId: 101 });
        expect(navigation.filter(item => "segment" in item && item.segment === "dashboard/admin/101/calendar")).toHaveLength(1);
        expect(JSON.stringify(navigation)).not.toContain("operations");
    });
    it("retains owner Calendar without an Operations item", () => {
        const navigation = getOwnerNav(100, false);
        expect(navigation.filter(item => "segment" in item && item.segment === "dashboard/owner/calendar")).toHaveLength(1);
        expect(JSON.stringify(navigation)).not.toContain("/operations");
    });
});

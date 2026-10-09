/**
 * Static architecture contract for the Figma-aligned React overview.
 * Run from frontend_web/ with:
 *   node scripts/audit-dashboard-overview-primitives.mjs
 * The runtime/UI contract still requires Vite build + browser acceptance tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const primitives = read("../src/components/dashboard/DashboardOverviewPrimitives.tsx");
const shared = read("../src/components/dashboard/DashboardOverviewTemplate.tsx");
const owner = read("../src/pages/dashboard/sidebar/owner/OwnerOverviewHome.tsx");

for (const [name, source] of [
  ["DashboardOverviewTemplate", shared],
  ["OwnerOverviewHome", owner],
]) {
  for (const component of [
    "DashboardQuickActionGrid",
    "DashboardUpcomingShiftsCard",
    "DashboardRecentActivityCard",
    "DashboardMetricsGrid",
  ]) {
    assert.ok(source.includes("<" + component), name + " must reuse " + component);
  }
  assert.ok(!source.includes("const toneStyles ="), name + " must not duplicate dashboard tone definitions");
  assert.ok(!source.includes("function activityIcon("), name + " must not duplicate activity icon mapping");
  assert.ok(!source.includes("function activityColor("), name + " must not duplicate activity palette");
}

assert.match(primitives, /export function DashboardQuickActionGrid/);
assert.match(primitives, /export function DashboardMetricsGrid/);
assert.match(primitives, /gridTemplateColumns:\s*\{/);
assert.match(primitives, /Mui-focusVisible/);
assert.match(primitives, /prefers-reduced-motion/);
assert.match(primitives, /type="button"/);
assert.match(primitives, /disabled=\{!actionUrl\}/);
assert.ok(!primitives.includes("figma.com/api/mcp/asset"), "Do not ship ephemeral design URLs");

assert.ok(shared.includes("onViewShifts={onOpenShifts}"));
assert.ok(owner.includes("onViewShifts={onOpenShifts}"));
assert.ok(owner.includes('navigate("/dashboard/owner/invoice")'));
assert.ok(owner.includes("onOpenPills"));
assert.ok(shared.includes("<RecentActivityDialog"));
assert.ok(owner.includes("<RecentActivityDialog"));

console.log("PASS: Figma React dashboard shared presentation/wiring contracts");

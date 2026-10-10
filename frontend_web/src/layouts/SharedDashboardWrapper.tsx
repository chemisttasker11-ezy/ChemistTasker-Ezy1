import { Outlet } from "react-router-dom";
import { ColorModeProvider } from "../theme/sleekTheme";
import DashboardTopShell from "./DashboardTopShell";

// Shell for dashboard pages reached by a direct URL rather than a persona route
// (workforce pages). Each child keeps its own capability guard.
export default function SharedDashboardWrapper() {
  return (
    <ColorModeProvider>
      <DashboardTopShell>
        <Outlet />
      </DashboardTopShell>
    </ColorModeProvider>
  );
}

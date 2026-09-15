import { Outlet } from 'react-router-dom';
import { ColorModeProvider } from "../theme/sleekTheme";
import DashboardTopShell from "./DashboardTopShell";

export default function OtherstaffDashboardWrapper() {
  return (
    <ColorModeProvider>
      <DashboardTopShell>
        <Outlet />
      </DashboardTopShell>
    </ColorModeProvider>
  );
}

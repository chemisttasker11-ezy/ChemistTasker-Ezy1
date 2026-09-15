import { createContext, ReactNode, useContext } from "react";
import type { Navigation } from "@toolpad/core";

const DashboardNavigationContext = createContext<Navigation>([]);

export function DashboardNavigationProvider({
  navigation,
  children,
}: {
  navigation: Navigation;
  children: ReactNode;
}) {
  return (
    <DashboardNavigationContext.Provider value={navigation}>
      {children}
    </DashboardNavigationContext.Provider>
  );
}

export function useDashboardNavigation() {
  return useContext(DashboardNavigationContext);
}

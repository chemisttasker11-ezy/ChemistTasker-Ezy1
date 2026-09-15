import React from "react";
import { ToggleButtonGroup, ToggleButton } from "@mui/material";

export type WorkspaceType = "internal" | "platform";

interface WorkspaceSwitcherProps {
  workspace: WorkspaceType;
  setWorkspace: (workspace: WorkspaceType) => void;
}

export function WorkspaceSwitcher({ workspace, setWorkspace }: WorkspaceSwitcherProps) {
  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newWorkspace: WorkspaceType | null
  ) => {
    if (newWorkspace !== null) {
      setWorkspace(newWorkspace);
    }
  };

  return (
    <ToggleButtonGroup
      value={workspace}
      exclusive
      onChange={handleChange}
      aria-label="Workspace"
      size="small"
    >
      <ToggleButton value="platform" aria-label="Platform">
        Platform
      </ToggleButton>
      <ToggleButton value="internal" aria-label="Internal">
        Internal
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

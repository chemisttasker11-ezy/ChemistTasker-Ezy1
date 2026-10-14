import { Tab, Tabs } from "@mui/material";
import type { ReactNode } from "react";

export type SegmentTab<T extends string> = { value: T; label: string; icon?: ReactNode };

const tabId = (idPrefix: string, value: string) => `${idPrefix}-tab-${value}`;
const panelId = (idPrefix: string) => `${idPrefix}-panel`;

/** Props for the element that shows the selected section, so assistive tech links it to its tab. */
export function tabPanelProps(idPrefix: string, value: string) {
  return { role: "tabpanel", id: panelId(idPrefix), "aria-labelledby": tabId(idPrefix, value), tabIndex: 0 } as const;
}

/**
 * Equal-width pill tabs (Figma Shift Centre style). The selected pill is soft violet with deep-violet text;
 * the others are white with a hairline border. Use for page-level section switches with 2–5 options.
 * Built on MUI Tabs: arrow keys, Home and End move focus; Enter or Space opens the focused section.
 */
export default function SegmentTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  mobileWrap = false,
}: {
  tabs: SegmentTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Prefix for tab and panel ids; pair with `tabPanelProps(idPrefix, value)` on the content. */
  idPrefix: string;
  /** Wrap crowded five-option sub-navigation on phones rather than compressing tab labels. */
  mobileWrap?: boolean;
}) {
  return (
    <Tabs
      value={value}
      onChange={(_, next: T) => { if (next !== value) onChange(next); }}
      aria-label={label}
      variant="fullWidth"
      slotProps={{ indicator: { sx: { display: "none" } } }}
      sx={{
        minHeight: 0,
        p: { xs: 0.75, sm: 1 },
        borderRadius: "var(--ct-card-radius)",
        border: "1px solid var(--ct-border-color)",
        bgcolor: "var(--ct-surface-bg)",
        "& .MuiTabs-flexContainer": {
          gap: { xs: 0.75, sm: 1.25 },
          ...(mobileWrap ? { flexWrap: { xs: "wrap", sm: "nowrap" } } : {}),
        },
        ...(mobileWrap ? { "& .MuiTab-root": { flexBasis: { xs: "29%", sm: 0 }, minWidth: { xs: 90, sm: 0 }, flexGrow: 1, maxWidth: "none" } } : {}),
      }}
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.value}
          value={tab.value}
          id={tabId(idPrefix, tab.value)}
          aria-controls={panelId(idPrefix)}
          icon={tab.icon as React.ReactElement | undefined}
          iconPosition="start"
          label={tab.label}
          disableRipple
          sx={{
            minWidth: 0,
            minHeight: 44,
            px: { xs: 0.75, sm: 2 },
            gap: 1,
            borderRadius: "14px",
            textTransform: "none",
            fontSize: { xs: 12.5, sm: 14 },
            fontWeight: 500,
            whiteSpace: "nowrap",
            color: "var(--ct-text-secondary)",
            border: "1px solid var(--ct-border-color)",
            transition: "background-color 160ms ease, color 160ms ease",
            "&:hover": { bgcolor: "var(--ct-hover-bg)", color: "var(--ct-text-primary)" },
            "&.Mui-selected": { color: "var(--ct-accent-strong)", bgcolor: "var(--ct-tone-violet-bg)", borderColor: "transparent", fontWeight: 600 },
            "&.Mui-focusVisible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
            "& .MuiTab-iconWrapper": { m: 0 },
            "& svg": { width: 16, height: 16, strokeWidth: 1.75, flexShrink: 0 },
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
      ))}
    </Tabs>
  );
}

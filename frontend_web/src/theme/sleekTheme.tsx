// src/theme/sleekTheme.tsx
import * as React from "react";
import { createTheme, alpha, Theme } from "@mui/material/styles";
import { ThemeProvider, CssBaseline, useMediaQuery } from "@mui/material";

type Mode = "light" | "dark";

// Brand violet is shared with the Next.js public theme, not generic indigo.
const primary = {
  50: '#F8F5FE', 100: '#EFE7FF', 200: '#E0D3FC', 300: '#CCB6F5', 400: '#AA81E9',
  500: '#7D45CB', 600: '#5222B8', 700: '#40168F', 800: '#32116F', 900: '#210B4E',
};

// Greys
const grey = {
  50:"#f8fafc",100:"#f1f5f9",200:"#e2e8f0",300:"#cbd5e1",400:"#94a3b8",
  500:"#64748b",600:"#475569",700:"#334155",800:"#1f2937",900:"#0f172a",
};

export function createSleekTheme(mode: Mode): Theme {
  const isLight = mode === "light";

  // Sidebar states tuned for contrast
  const selectedBg = isLight
    ? alpha(primary[600], 0.10)
    : alpha(primary[400], 0.18);
  const hoverBg = isLight
    ? alpha(grey[200], 0.50)
    : alpha("#ffffff", 0.06);
  const pageBg = isLight ? "#F7F9FC" : "#08111F";
  const surfaceBg = isLight ? "#fff" : "#101A2D";
  const elevatedBg = isLight ? "#fff" : "#142036";
  const textPrimary = isLight ? "#06123A" : "#EAF1FF";
  const textSecondary = isLight ? "#5E6B8D" : "#A9B8D3";
  const borderColor = isLight ? "#E5ECF7" : "rgba(148,163,184,0.24)";

  return createTheme({
    // MUI default scale (4px) so sx numbers mean what authors expect: 2 = 8px, 3 = 12px.
    // Component corners are set explicitly below (cards 20, papers/popovers 14, inputs/buttons 12).
    shape: { borderRadius: 4 },
    palette: {
      mode,
      primary: { main: primary[600], dark: primary[700], light: primary[100], contrastText: "#FFFFFF" },
      // Brand magenta #D600C8 is 4.47:1 on white; #C000B4 keeps the hue and passes AA as text and under white labels.
      secondary: { main: "#C000B4", dark: "#A60B9C", light: "#FDE7F5" },
      info: { main: "#0369A1", light: "#E7F0FF" },
      success: { main: "#117A50" },
      warning: { main: "#A15C07" },
      error: { main: "#C9364A" },
      background: isLight
        ? { default: pageBg, paper: surfaceBg }
        : { default: pageBg, paper: surfaceBg },
      divider: borderColor,
      text: isLight
        ? { primary: textPrimary, secondary: textSecondary }
        : { primary: textPrimary, secondary: textSecondary },
      action: {
        hover: isLight ? alpha(grey[200], 0.5) : alpha("#ffffff", 0.06),
        selected: isLight ? alpha(primary[600], 0.1) : alpha(primary[400], 0.2),
        disabledBackground: isLight ? grey[100] : alpha("#ffffff", 0.08),
        disabled: isLight ? grey[400] : alpha("#EAF1FF", 0.38),
      },
    },
    typography: {
      // Match the Next public site: Outfit speaks, Inter operates.
      fontFamily: "Inter, Segoe UI, Arial, sans-serif",
      h1: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 1.05 },
      h2: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.08 },
      h3: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.13 },
      h4: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.18 },
      h5: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 500, letterSpacing: "-0.02em" },
      h6: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 600 },
      body1: { fontFamily: "Inter, Segoe UI, Arial, sans-serif", lineHeight: 1.55 },
      body2: { fontFamily: "Inter, Segoe UI, Arial, sans-serif", lineHeight: 1.5 },
      button: { fontFamily: "Inter, Segoe UI, Arial, sans-serif", fontWeight: 600, textTransform: "none" },
      caption: { fontFamily: "Inter, Segoe UI, Arial, sans-serif", lineHeight: 1.45 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            colorScheme: mode,
            "--ct-page-bg": pageBg,
            "--ct-surface-bg": surfaceBg,
            "--ct-elevated-bg": elevatedBg,
            "--ct-text-primary": textPrimary,
            "--ct-text-secondary": textSecondary,
            "--ct-border-color": borderColor,
            "--ct-hover-bg": hoverBg,
            "--ct-soft-primary": isLight ? alpha(primary[600], 0.1) : alpha(primary[400], 0.18),
            "--ct-input-bg": isLight ? "#fff" : "#0C1628",
            "--ct-font-body": "Inter, Segoe UI, Arial, sans-serif",
            "--ct-font-display": "Outfit, Inter, sans-serif",
            // Dashboard Figma system (ChemistTasker-Dashboard): text tiers, the deep
            // violet used for active items/figures, and the four tinted icon-tile tones.
            "--ct-text-muted": isLight ? "#63708C" : "#8E9BB5",
            "--ct-accent-strong": isLight ? "#3C18A8" : "#B9A5F5",
            "--ct-card-radius": "20px",
            "--ct-tone-violet-bg": isLight ? "#EFE9FD" : alpha("#8B6CF0", 0.18),
            "--ct-tone-violet-fg": isLight ? "#3C18A8" : "#C6B6F7",
            "--ct-tone-blue-bg": isLight ? "#E6F1FC" : alpha("#3F9BE8", 0.18),
            "--ct-tone-blue-fg": isLight ? "#0063A8" : "#8CC6F5",
            "--ct-tone-cyan-bg": isLight ? "#DFF7F9" : alpha("#22B8C9", 0.18),
            "--ct-tone-cyan-fg": isLight ? "#007486" : "#7FDCE6",
            "--ct-tone-magenta-bg": isLight ? "#FCE6F8" : alpha("#D63BC4", 0.18),
            "--ct-tone-magenta-fg": isLight ? "#A3008F" : "#F09BE4",
            // Skill symbols: navy linework over two brand tints (shared/SkillGlyph.tsx).
            "--ct-skill-ink": isLight ? "#06214A" : "#E9EEF8",
            "--ct-skill-violet-fill": isLight ? "#CBBBF6" : alpha("#8B6CF0", 0.45),
            "--ct-skill-cyan-fill": isLight ? "#A3E9F0" : alpha("#22B8C9", 0.45),
            "--ct-skill-magenta-fill": isLight ? "#F5BDEF" : alpha("#D63BC4", 0.45),
            "--ct-skill-blue-fill": isLight ? "#A9D6F5" : alpha("#3F9BE8", 0.45),
            "--ct-skill-violet-arc": isLight ? "#8B6CF0" : "#B9A5F5",
            "--ct-skill-cyan-arc": isLight ? "#22B8C9" : "#5FD9E6",
            "--ct-skill-magenta-arc": isLight ? "#D63BC4" : "#F09BE4",
            "--ct-skill-blue-arc": isLight ? "#3F9BE8" : "#8CC6F5",
            // Status tones (booked / waiting / declined). Foregrounds keep >= 4.5:1 on their own tint.
            "--ct-status-green-bg": isLight ? "#E4F5EA" : alpha("#34C27A", 0.18),
            "--ct-status-green-fg": isLight ? "#17663A" : "#8EE0B3",
            "--ct-status-amber-bg": isLight ? "#FDF0D9" : alpha("#F0A83A", 0.18),
            "--ct-status-amber-fg": isLight ? "#8A4B00" : "#F6C77E",
            "--ct-status-red-bg": isLight ? "#FDE8E7" : alpha("#F06A5E", 0.18),
            "--ct-status-red-fg": isLight ? "#B42318" : "#F7A39B",
            "--ct-subtle-bg": isLight ? "#F7F8FC" : alpha("#FFFFFF", 0.03),
          },
          "html, body, #root": {
            minHeight: "100%",
          },
          body: {
            fontFamily: "var(--ct-font-body)",
            backgroundColor: pageBg,
            color: textPrimary,
            transition: "background-color 160ms ease, color 160ms ease",
          },
          "[data-ct-theme='dark']": {
            colorScheme: "dark",
          },
          "[data-ct-theme='dark'] .MuiPaper-root, [data-ct-theme='dark'] .MuiCard-root": {
            backgroundColor: `${surfaceBg} !important`,
            color: `${textPrimary} !important`,
            borderColor: `${borderColor} !important`,
            backgroundImage: "none !important",
          },
          "[data-ct-theme='dark'] .MuiPopover-paper, [data-ct-theme='dark'] .MuiMenu-paper, [data-ct-theme='dark'] .MuiDialog-paper": {
            backgroundColor: `${elevatedBg} !important`,
            color: `${textPrimary} !important`,
            borderColor: `${borderColor} !important`,
          },
          // Legacy pages hard-code light-mode text colours, so in dark mode their text inherits from
          // the surface instead. Pages built on the --ct-* tokens opt out with data-ct-tokens.
          "[data-ct-theme='dark'] .MuiTypography-root:not([data-ct-tokens] .MuiTypography-root)": {
            color: "inherit",
          },
          "[data-ct-theme='dark'] .MuiTypography-colorTextSecondary, [data-ct-theme='dark'] .MuiFormHelperText-root": {
            color: `${textSecondary} !important`,
          },
          "[data-ct-theme='dark'] .MuiInputBase-root, [data-ct-theme='dark'] .MuiOutlinedInput-root": {
            backgroundColor: "var(--ct-input-bg) !important",
            color: `${textPrimary} !important`,
          },
          "[data-ct-theme='dark'] .MuiOutlinedInput-notchedOutline": {
            borderColor: `${borderColor} !important`,
          },
          "[data-ct-theme='dark'] .MuiListItemButton-root:hover, [data-ct-theme='dark'] .MuiMenuItem-root:hover": {
            backgroundColor: `${hoverBg} !important`,
          },
          "[data-ct-theme='dark'] a": {
            color: primary[300],
          },
        },
      },
      // Soft app bar
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(isLight ? "#ffffff" : surfaceBg, 0.85),
            backdropFilter: "blur(6px)",
            borderBottom: `1px solid ${borderColor}`,
          },
        },
      },

      // Paper: subtle borders / shadows
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${borderColor}`,
            boxShadow: isLight
              ? "0 1px 2px rgba(15,23,42,0.04)"
              : "0 1px 2px rgba(0,0,0,0.25)",
            borderRadius: 14,
            backgroundImage: "none",
            backgroundColor: surfaceBg,
            color: textPrimary,
          },
        },
      },

      // -------- Sidebar polish (works with Toolpad’s List-based sidebar) -------
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: surfaceBg,
            borderRight: `1px solid ${borderColor}`,
          },
        },
      },
      MuiListSubheader: {
        styleOverrides: {
          root: {
            color: textSecondary,
            lineHeight: 1.2,
            fontSize: "0.72rem",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            fontWeight: 700,
            paddingTop: 12,
            paddingBottom: 6,
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: {
            minWidth: 32,
            color: textSecondary,
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: { fontWeight: 600 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            margin: "2px 8px",
            borderRadius: 12,
            paddingTop: 8,
            paddingBottom: 8,
            "&:hover": {
              backgroundColor: hoverBg,
            },
            "&.Mui-selected": {
              backgroundColor: selectedBg,
              border: `1px solid ${isLight ? alpha(primary[600], 0.25) : alpha(primary[300], 0.35)}`,
              color: isLight ? primary[700] : primary[300],
              "& .MuiListItemIcon-root": {
                color: isLight ? primary[700] : primary[300],
              },
              "&:hover": {
                backgroundColor: isLight
                  ? alpha(primary[600], 0.16)
                  : alpha(primary[400], 0.26),
              },
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 12, textTransform: "none", fontWeight: 600, letterSpacing: 0 },
          sizeMedium: { minHeight: 40, paddingLeft: 18, paddingRight: 18 },
          sizeLarge: { minHeight: 48, paddingLeft: 22, paddingRight: 22, fontSize: 15 },
          outlined: {
            borderColor,
            backgroundColor: "transparent",
          },
        },
        // A variant rule (not a nested selector) so a button's own sx colour always wins:
        // the nested selector out-ranked sx and painted labels the colour of their background.
        variants: [
          { props: { variant: "text", color: "primary" }, style: { color: isLight ? "#3C18A8" : primary[300] } },
          { props: { variant: "outlined", color: "primary" }, style: { color: isLight ? "#3C18A8" : primary[300] } },
          // Error red (#C9364A) is 3.4:1 on the dark surface; a lighter red keeps destructive labels readable.
          { props: { variant: "text", color: "error" }, style: isLight ? {} : { color: "#FF8A97" } },
          { props: { variant: "outlined", color: "error" }, style: isLight ? {} : { color: "#FF8A97", borderColor: "rgba(255,138,151,0.5)" } },
          { props: { variant: "outlined", color: "warning" }, style: isLight ? {} : { color: "#F5B85A", borderColor: "rgba(245,184,90,0.5)" } },
        ],
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: 10, "& svg.lucide": { width: 20, height: 20, strokeWidth: 1.75 } },
        },
      },
      // Dashboard design system: flat cards with hairline borders, 20px radius.
      // Letter avatars: MUI's grey (#9E9E9E) with white text is 2.7:1; use the violet tile tone.
      MuiAvatar: {
        styleOverrides: {
          colorDefault: { backgroundColor: "var(--ct-tone-violet-bg)", color: "var(--ct-tone-violet-fg)", fontWeight: 600 },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { borderRadius: 20, boxShadow: "none" } },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${borderColor}` },
          title: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 500, fontSize: 18, letterSpacing: "-0.015em" },
          subheader: { fontSize: 13, color: textSecondary },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontFamily: "Outfit, Inter, sans-serif", fontWeight: 500, fontSize: 20, letterSpacing: "-0.015em" } },
      },
      MuiTextField: {
        defaultProps: { variant: "outlined" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: isLight ? "#fff" : "#0C1628",
            "& .MuiOutlinedInput-notchedOutline": { borderColor: isLight ? "#D9E0EC" : borderColor },
            "&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline": { borderColor: isLight ? "#AEB9CC" : alpha("#ffffff", 0.3) },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: primary[600], borderWidth: 1.5 },
          },
        },
      },
      MuiInputLabel: {
        // Focused labels use the AA accent; brand violet is 1.8:1 on the dark field.
        styleOverrides: { root: { fontSize: 14, "&.Mui-focused:not(.Mui-error)": { color: "var(--ct-accent-strong)" } } },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 600, fontSize: 12.5 },
          sizeSmall: { fontSize: 11.5 },
          outlined: {
            borderColor,
            backgroundColor: isLight ? grey[50] : alpha("#ffffff", 0.04),
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 44,
            // Phones: no sideways scrolling or arrow buttons. Scrollable tab bars wrap into a grid of
            // pills so every section is visible and one tap away.
            [`@media (max-width:${600 - 0.05}px)`]: {
              "& .MuiTabs-scrollButtons": { display: "none" },
              "& .MuiTabs-scrollableX": { overflowX: "visible !important", marginBottom: "0 !important" },
              "& .MuiTabs-scrollableX .MuiTabs-flexContainer": { flexWrap: "wrap", gap: 8, paddingBlock: 4 },
              "& .MuiTabs-scrollableX .MuiTabs-indicator": { display: "none" },
              "& .MuiTabs-scrollableX .MuiTab-root": {
                minHeight: 40,
                minWidth: 0,
                padding: "6px 14px",
                borderRadius: 999,
                border: `1px solid ${borderColor}`,
                backgroundColor: "transparent",
              },
              "& .MuiTabs-scrollableX .MuiTab-root.Mui-selected": {
                backgroundColor: "var(--ct-tone-violet-bg)",
                borderColor: isLight ? "#3C18A8" : primary[300],
                color: "var(--ct-tone-violet-fg)",
              },
            },
          },
          indicator: { height: 3, borderRadius: "3px 3px 0 0", backgroundColor: isLight ? "#3C18A8" : primary[300] },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 44,
            textTransform: "none",
            fontWeight: 500,
            fontSize: 14,
            color: textSecondary,
            "&.Mui-selected": { color: isLight ? "#3C18A8" : primary[300], fontWeight: 600 },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600, borderColor, "&.Mui-selected": { color: isLight ? "#3C18A8" : primary[300], backgroundColor: selectedBg } },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 14, alignItems: "center" } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: isLight ? "#06214A" : "#26324A", fontSize: 12, fontWeight: 500, borderRadius: 8, padding: "6px 10px" },
          arrow: { color: isLight ? "#06214A" : "#26324A" },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            backgroundColor: surfaceBg,
            color: textPrimary,
          },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { "&&&": isLight ? {} : { borderColor } } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            // Owned component rule replaces the former global important override.
            "&&&": isLight ? {} : { color: textPrimary, borderColor },
              borderColor,
              fontSize: 13.5,
            },
          head: {
            fontSize: 12,
            fontWeight: 600,
            color: textSecondary,
            textTransform: "uppercase",
            letterSpacing: ".04em",
            backgroundColor: isLight ? "#F7F9FC" : alpha("#ffffff", 0.03),
          },
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0 },
        styleOverrides: { root: { borderRadius: 16, "&::before": { display: "none" } } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 999, height: 6 } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: elevatedBg,
            color: textPrimary,
            borderRadius: 20,
            boxShadow: "0 24px 64px rgba(6, 18, 58, 0.18)",
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: elevatedBg,
            color: textPrimary,
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(6, 18, 58, 0.12)",
          },
        },
      },
    },
  });
}

// ---------------- Color mode provider (persisted + system preference) --------
type ColorModeContextValue = {
  mode: Mode;
  toggleColorMode: () => void;
  setMode: (m: Mode) => void;
};

const ColorModeContext = React.createContext<ColorModeContextValue | undefined>(undefined);
const STORAGE_KEY = "ct-theme-mode";

export function useColorMode(): ColorModeContextValue {
  const ctx = React.useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode must be used within ColorModeProvider");
  return ctx;
}

export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [mode, setModeState] = React.useState<Mode>(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    if (saved === "light" || saved === "dark") return saved as Mode;
    return prefersDark ? "dark" : "light";
  });

  const setMode = (m: Mode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };
  const toggleColorMode = () => setMode(mode === "light" ? "dark" : "light");

  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) setMode(prefersDark ? "dark" : "light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersDark]);

  React.useEffect(() => {
    document.documentElement.dataset.ctTheme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const theme = React.useMemo(() => createSleekTheme(mode), [mode]);
  const value = React.useMemo(() => ({ mode, toggleColorMode, setMode }), [mode]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

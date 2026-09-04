// Material Design 3 theme for MUI.
// MUI needs concrete color values (it computes contrast/shades), so we resolve
// the M3 CSS vars to actual hex at module/theme-build time via a small
// runtime map. Falls back to M3 defaults when the browser/DOM isn't available.
"use client";

export const M3_LIGHT = {
  primary: "#4655C9", onPrimary: "#FFFFFF", primaryContainer: "#DEE0FF", onPrimaryContainer: "#001159",
  secondary: "#5B5D72", onSecondary: "#FFFFFF", secondaryContainer: "#E0E1F9", onSecondaryContainer: "#181A2C",
  tertiary: "#00696B", onTertiary: "#FFFFFF", tertiaryContainer: "#9CF1F2", onTertiaryContainer: "#002020",
  error: "#B3261E", onError: "#FFFFFF", errorContainer: "#F9DEDC", onErrorContainer: "#410E0B",
  background: "#FBF8FF", onBackground: "#1B1B21", surface: "#FBF8FF", onSurface: "#1B1B21",
  surfaceVariant: "#E3E1EC", onSurfaceVariant: "#46464F", outline: "#777680", outlineVariant: "#C7C5D0",
  surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#F5F2FA", surfaceContainer: "#EFEDF5",
  surfaceContainerHigh: "#E9E7EF", surfaceContainerHighest: "#E3E1EA",
};
export const M3_DARK = {
  primary: "#BCC2FF", onPrimary: "#1B2A8F", primaryContainer: "#3140B1", onPrimaryContainer: "#DEE1FF",
  secondary: "#C4C5DD", onSecondary: "#2D2F42", secondaryContainer: "#434659", onSecondaryContainer: "#E0E1F9",
  tertiary: "#4DD9DB", onTertiary: "#003737", tertiaryContainer: "#004F50", onTertiaryContainer: "#9CF1F2",
  error: "#F2B8B5", onError: "#601410", errorContainer: "#8C1D18", onErrorContainer: "#F9DEDC",
  background: "#131318", onBackground: "#E4E1E9", surface: "#131318", onSurface: "#E4E1E9",
  surfaceVariant: "#46464F", onSurfaceVariant: "#C7C5D0", outline: "#91909A", outlineVariant: "#46464F",
  surfaceContainerLowest: "#0E0E13", surfaceContainerLow: "#1B1B21", surfaceContainer: "#1F1F25",
  surfaceContainerHigh: "#2A292F", surfaceContainerHighest: "#35343A",
};

export const M3_TYPOGRAPHY = {
  fontFamily: "var(--font-roboto), Roboto, 'Helvetica Neue', Arial, sans-serif",
};

export function buildM3Theme(mode) {
  const C = mode === "dark" ? M3_DARK : M3_LIGHT;
  return {
    palette: {
      mode,
      primary: { main: C.primary, contrastText: C.onPrimary },
      secondary: { main: C.secondary, contrastText: C.onSecondary },
      tertiary: { main: C.tertiary, contrastText: C.onTertiary },
      error: { main: C.error, contrastText: C.onError },
      background: { default: C.background, paper: C.surface },
      text: { primary: C.onSurface, secondary: C.onSurfaceVariant, disabled: C.onSurfaceVariant },
      divider: C.outlineVariant,
      surface: C.surface,
      onSurface: C.onSurface,
      outline: C.outline,
      outlineVariant: C.outlineVariant,
      surfaceContainerLowest: C.surfaceContainerLowest,
      surfaceContainerLow: C.surfaceContainerLow,
      surfaceContainer: C.surfaceContainer,
      surfaceContainerHigh: C.surfaceContainerHigh,
      surfaceContainerHighest: C.surfaceContainerHighest,
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: M3_TYPOGRAPHY.fontFamily,
      button: { textTransform: "none", fontWeight: 500 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: "var(--md-sys-shape-corner-full)",
            textTransform: "none",
            fontWeight: 500,
            paddingInline: "1.25rem",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: "var(--md-sys-shape-corner-extra-large)",
            backgroundImage: "none",
            boxShadow: "none",
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    },
  };
}

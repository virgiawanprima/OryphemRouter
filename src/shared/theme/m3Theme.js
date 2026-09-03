// Material Design 3 theme for MUI.
// MUI needs concrete color values (it computes contrast/shades), so we resolve
// the M3 CSS vars to actual hex at module/theme-build time via a small
// runtime map. Falls back to M3 defaults when the browser/DOM isn't available.
"use client";

export const M3_LIGHT = {
  primary: "#6750A4", onPrimary: "#FFFFFF", primaryContainer: "#EADDFF", onPrimaryContainer: "#21005D",
  secondary: "#625B71", onSecondary: "#FFFFFF", secondaryContainer: "#E8DEF8", onSecondaryContainer: "#1D192B",
  tertiary: "#7D5260", onTertiary: "#FFFFFF", tertiaryContainer: "#FFD8E4", onTertiaryContainer: "#31111D",
  error: "#B3261E", onError: "#FFFFFF", errorContainer: "#F9DEDC", onErrorContainer: "#410E0B",
  background: "#FEF7FF", onBackground: "#1D1B20", surface: "#FEF7FF", onSurface: "#1D1B20",
  surfaceVariant: "#E7E0EC", onSurfaceVariant: "#49454F", outline: "#79747E", outlineVariant: "#CAC4D0",
  surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#F7F2FA", surfaceContainer: "#F3EDF7",
  surfaceContainerHigh: "#ECE6F0", surfaceContainerHighest: "#E6E0E9",
};
export const M3_DARK = {
  primary: "#D0BCFF", onPrimary: "#381E72", primaryContainer: "#4F378B", onPrimaryContainer: "#EADDFF",
  secondary: "#CCC2DC", onSecondary: "#332D41", secondaryContainer: "#4A4458", onSecondaryContainer: "#E8DEF8",
  tertiary: "#EFB8C8", onTertiary: "#492532", tertiaryContainer: "#633B48", onTertiaryContainer: "#FFD8E4",
  error: "#F2B8B5", onError: "#601410", errorContainer: "#8C1D18", onErrorContainer: "#F9DEDC",
  background: "#141218", onBackground: "#E6E0E9", surface: "#141218", onSurface: "#E6E0E9",
  surfaceVariant: "#49454F", onSurfaceVariant: "#CAC4D0", outline: "#938F99", outlineVariant: "#49454F",
  surfaceContainerLowest: "#0F0D13", surfaceContainerLow: "#1D1B20", surfaceContainer: "#211F26",
  surfaceContainerHigh: "#2B2930", surfaceContainerHighest: "#36343B",
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

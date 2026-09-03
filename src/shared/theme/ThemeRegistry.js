"use client";

import { useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import useThemeStore from "@/store/themeStore";
import { buildM3Theme } from "./m3Theme";

// Bridges the app's existing theme store (`dark` class on <html>) to MUI's
// M3 palette. MUI only re-renders when `mode` flips, and M3 colors resolve
// through CSS vars so both schemes stay in sync with globals.css.
export default function ThemeRegistry({ children }) {
  const theme = useThemeStore((s) => s.theme);

  const mode = useMemo(() => {
    if (typeof window === "undefined") return "dark";
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  const muiTheme = useMemo(() => createTheme(buildM3Theme(mode)), [mode]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme={false} />
      {children}
    </ThemeProvider>
  );
}

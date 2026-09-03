"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import useThemeStore from "@/store/themeStore";
import { buildM3Theme } from "./m3Theme";

// Client-only MUI bridge. Renders nothing until mounted so the server-rendered
// HTML never contains MUI's injected styles/classes — this avoids hydration
// mismatches between the initial SSR tree and the client tree.
export default function ThemeRegistry({ children }) {
  const theme = useThemeStore((s) => s.theme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const mode = useMemo(() => {
    if (theme === "system" && typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme || "dark";
  }, [theme]);

  if (!mounted) return <>{children}</>;

  const muiTheme = createTheme(buildM3Theme(mode));
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme={false} />
      {children}
    </ThemeProvider>
  );
}

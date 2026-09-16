"use client";

import { useMemo } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import useThemeStore from "@/store/themeStore";

// Ant Design enterprise theme — bridges the app's dark/light store to antd's
// ConfigProvider. Primary blue (#7AA2F7 night / #2E7DE9 day) aligns with the
// Tokyo Night palette; neutral background/layout tokens follow the Night/Day
// neutral layer order (bg-deepest -> bg -> surface). All antd components
// rendered below inherit this.
export default function AntDesignProvider({ children }) {
  const themeStore = useThemeStore((s) => s.theme);
  const isDark = useMemo(() => {
    if (typeof window === "undefined") return true;
    if (themeStore === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return themeStore !== "light";
  }, [themeStore]);

  const token = useMemo(
    () => ({
      colorPrimary: isDark ? "#7AA2F7" : "#2E7DE9",
      colorInfo: isDark ? "#7AA2F7" : "#2E7DE9",
      colorLink: isDark ? "#7AA2F7" : "#2E7DE9",
      colorSuccess: isDark ? "#9ECE6A" : "#587539",
      colorWarning: isDark ? "#E0AF68" : "#8C6C3E",
      colorError: isDark ? "#F7768E" : "#F52A65",
      colorBgBase: isDark ? "#1A1B26" : "#E1E2E7",
      colorBgLayout: isDark ? "#16161E" : "#E1E2E7",
      colorTextBase: isDark ? "#C0CAF5" : "#3760BF",
      borderRadius: 8,
      borderRadiusLG: 16,
      fontFamily: "var(--font-roboto), 'Roboto', system-ui, sans-serif",
    }),
    [isDark]
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token,
        components: {
          Layout: {
            siderBg: isDark ? "#16161E" : "#C4C8DA",
            headerBg: isDark ? "#1F2335" : "#F3F4F8",
            bodyBg: isDark ? "#1A1B26" : "#E1E2E7",
            headerHeight: 60,
          },
          Menu: {
            itemBg: "transparent",
            activeBarBorderWidth: 0,
            itemSelectedColor: isDark ? "#7AA2F7" : "#2E7DE9",
            itemSelectedBg: isDark ? "#292E42" : "#D6D9E4",
            itemBorderRadius: 8,
          },
          Card: {
            colorBgContainer: isDark ? "#1F2335" : "#F3F4F8",
            borderRadiusLG: 16,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
"use client";

import { useMemo } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import useThemeStore from "@/store/themeStore";

// Ant Design enterprise theme — bridges the app's dark/light store to antd's
// ConfigProvider. Primary indigo (#4655C9) aligns the app brand with antd's
// blue-based enterprise palette; background/layout tokens are neutral for
// eye-friendly contrast. All antd components rendered below inherit this.
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
      colorPrimary: "#4655C9",
      colorInfo: "#4655C9",
      colorLink: "#4655C9",
      colorSuccess: "#0E7A5F",
      colorWarning: "#B3540C",
      colorError: "#C62828",
      colorBgBase: isDark ? "#141218" : "#FBF8FF",
      colorBgLayout: isDark ? "#0E0E13" : "#F5F2FA",
      colorTextBase: isDark ? "#E4E1E9" : "#1B1B21",
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
            siderBg: isDark ? "#1B1B21" : "#F5F2FA",
            headerBg: isDark ? "#1F1F25" : "#FFFFFF",
            bodyBg: isDark ? "#0E0E13" : "#F5F2FA",
            headerHeight: 60,
          },
          Menu: {
            itemBg: "transparent",
            activeBarBorderWidth: 0,
            itemSelectedColor: "#4655C9",
            itemSelectedBg: isDark ? "#2A2930" : "#E8EAFB",
            itemBorderRadius: 8,
          },
          Card: {
            colorBgContainer: isDark ? "#1F1F25" : "#FFFFFF",
            borderRadiusLG: 16,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
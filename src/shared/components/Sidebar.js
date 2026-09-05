"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  ApiOutlined,
  ClusterOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  LineChartOutlined,
  BankOutlined,
  SaveOutlined,
  CodeOutlined,
  ApartmentOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  SettingOutlined,
  TagsOutlined,
  PictureOutlined,
  DatabaseOutlined,
  BgColorsOutlined,
  AudioOutlined,
  SoundOutlined,
  PlayCircleOutlined,
  GlobalOutlined,
  ZoomInOutlined,
  ScanOutlined,
  SwapOutlined,
  SafetyCertificateOutlined,
  TranslationOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Button from "./Button";
import { ConfirmModal } from "./Modal";
import RemotePromoModal from "./RemotePromoModal";

const { Sider } = Layout;

const ICON_MAP = {
  space_dashboard: <DashboardOutlined />,
  api: <ApiOutlined />,
  dns: <ClusterOutlined />,
  layers: <AppstoreOutlined />,
  bar_chart: <BarChartOutlined />,
  data_usage: <LineChartOutlined />,
  local_atm: <BankOutlined />,
  savings: <SaveOutlined />,
  terminal: <CodeOutlined />,
  lan: <ApartmentOutlined />,
  extension: <ExperimentOutlined />,
  article: <FileTextOutlined />,
  settings: <SettingOutlined />,
  sell: <TagsOutlined />,
  perm_media: <PictureOutlined />,
  data_array: <DatabaseOutlined />,
  brush: <BgColorsOutlined />,
  record_voice_over: <AudioOutlined />,
  mic: <SoundOutlined />,
  movie: <PlayCircleOutlined />,
  travel_explore: <GlobalOutlined />,
  photo_size_select_large: <ZoomInOutlined />,
  document_scanner: <ScanOutlined />,
  swap_vert: <SwapOutlined />,
  shield_check: <SafetyCertificateOutlined />,
  translate: <TranslationOutlined />,
  computer: <DesktopOutlined />,
};

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "space_dashboard" },
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combo & Vision Adapter", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/free-tiers", label: "Free Tiers", icon: "local_atm" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
  { href: "/dashboard/console-log", label: "Console Log", icon: "article" },
  { href: "/dashboard/profile", label: "Settings", icon: "settings" },
  { href: "/dashboard/pricing", label: "Pricing", icon: "sell" },
];

const MEDIA_SUBITEMS = [
  { href: "/dashboard/media-providers/embedding", label: "Embedding", icon: "data_array" },
  { href: "/dashboard/media-providers/image", label: "Text to Image", icon: "brush" },
  { href: "/dashboard/media-providers/tts", label: "Text To Speech", icon: "record_voice_over" },
  { href: "/dashboard/media-providers/stt", label: "Speech To Text", icon: "mic" },
  { href: "/dashboard/media-providers/video", label: "Video", icon: "movie" },
  { href: "/dashboard/media-providers/web", label: "Web Fetch & Search", icon: "travel_explore" },
  { href: "/dashboard/media-providers/upscale", label: "Image Upscale", icon: "photo_size_select_large" },
  { href: "/dashboard/media-providers/ocr", label: "OCR", icon: "document_scanner" },
  { href: "/dashboard/media-providers/rerank", label: "Rerank", icon: "swap_vert" },
  { href: "/dashboard/media-providers/moderation", label: "Moderation", icon: "shield_check" },
];

function NavLabel({ href, label, onNavigate }) {
  return (
    <Link href={href} onClick={onNavigate} className="!text-inherit">
      {label}
    </Link>
  );
}

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState([]);
  const countdownRef = useRef(null);

  // Clean up the shutdown countdown on unmount — otherwise the interval keeps
  // running on a dead component and can POST /api/version/shutdown unexpectedly.
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, []);
  const { copied, copy } = useCopyToClipboard(2000);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

  // Restore collapse preference
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("oryphem:sidebar") === "collapsed");
    } catch { /* ignore */ }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("oryphem:sidebar", next ? "collapsed" : "expanded");
      } catch { /* ignore */ }
      return next;
    });
  };

  // Open the Media Providers submenu when inside a media route
  useEffect(() => {
    if (pathname.startsWith("/dashboard/media-providers")) {
      setOpenKeys((keys) => (keys.includes("media") ? keys : [...keys, "media"]));
    }
  }, [pathname]);

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => { if (data.enableTranslator) setEnableTranslator(true); })
      .catch(() => {});
  }, []);

  // Lazy check for new npm version on mount
  useEffect(() => {
    fetch("/api/version")
      .then(res => res.json())
      .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
      .catch(() => {});
  }, []);

  const isActive = (href) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    if (href === "/dashboard/endpoint") {
      return pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };

  // Open manual update panel (no countdown yet — user must click Copy to trigger shutdown)
  const handleUpdate = () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
  };

  // Triggered by Copy button inside ManualUpdatePanel: copy + countdown + shutdown
  const handleCopyAndShutdown = async () => {
    try { await navigator.clipboard.writeText(INSTALL_CMD); } catch { /* clipboard blocked */ }
    copy(INSTALL_CMD);
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
        setIsDisconnected(true);
      }
    }, 1000);
  };

  const handleCancelUpdate = () => {
    setIsUpdating(false);
    setShutdownCountdown(0);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const selectedKey = useMemo(() => {
    const all = [
      ...navItems,
      ...systemItems,
      ...MEDIA_SUBITEMS,
      ...(enableTranslator ? [{ href: "/dashboard/translator" }] : []),
    ];
    const active = all.find((i) => isActive(i.href));
    return active ? active.href : "/dashboard";
  }, [pathname, enableTranslator]); // eslint-disable-line react-hooks/exhaustive-deps

  const menuItems = useMemo(() => {
    const toItem = ({ href, label, icon }) => ({
      key: href,
      icon: ICON_MAP[icon],
      label: <NavLabel href={href} label={label} onNavigate={onClose} />,
    });
    const systemChildren = [
      {
        key: "media",
        icon: ICON_MAP.perm_media,
        label: "Media Providers",
        children: MEDIA_SUBITEMS.map(toItem),
      },
      ...systemItems.map(toItem),
    ];
    if (enableTranslator) {
      systemChildren.push(toItem({ href: "/dashboard/translator", label: "Translator", icon: "translate" }));
    }
    return [
      ...navItems.map(toItem),
      { type: "group", label: "System", children: systemChildren },
    ];
  }, [onClose, enableTranslator]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Sider
        width={256}
        collapsedWidth={68}
        collapsed={collapsed}
        trigger={null}
        collapsible
        theme="light"
        style={{ background: "var(--md-sys-color-surfaceContainerLow)" }}
        className="!border-r !border-[color:var(--md-sys-color-outlineVariant)] transition-all duration-200 min-h-full"
      >
        <div className="flex h-full flex-col">
          {/* Traffic lights + collapse toggle */}
          <div className={`flex items-center ${collapsed ? "justify-center px-0" : "justify-between px-4"} pt-4 pb-2`}>
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
              </div>
            )}
            <button
              onClick={toggleCollapse}
              className="text-text-subtle hover:text-text-main transition-colors p-0.5"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="material-symbols-outlined text-[16px]">
                {collapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}
              </span>
            </button>
          </div>

          {/* Logo */}
          <div className={`px-4 py-4 flex flex-col gap-2 ${collapsed ? "items-center" : ""}`}>
            <Link href="/dashboard" className={`flex items-center gap-3 group ${collapsed ? "justify-center" : ""}`}>
              <div className="flex items-center justify-center size-9 shrink-0">
                <img
                  src="/images/logo-oryphem-putih.png"
                  alt="OryphemRouter"
                  className="hidden dark:block size-9 object-contain"
                />
                <img
                  src="/images/logo-oryphem-hitam.png"
                  alt="OryphemRouter"
                  className="block dark:hidden size-9 object-contain"
                />
              </div>
              {!collapsed && (
                <div className="flex flex-col">
                  <span className="text-base font-medium tracking-tight text-text-main">
                    {APP_CONFIG.name}
                  </span>
                  <span className="text-[13px] text-text-muted">v{APP_CONFIG.version}</span>
                </div>
              )}
            </Link>
            {updateInfo && !collapsed && (
              <div className="flex flex-col gap-1.5 -m-1">
                <span className="text-xs font-semibold text-green-600 dark:text-amber-500">
                  ↑ New version available: v{updateInfo.latestVersion}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowUpdateModal(true)}
                    className="rounded-[var(--radius-brand)] border border-green-600 bg-green-600 hover:bg-green-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors cursor-pointer px-2 py-1"
                  >
                    Update now
                  </button>
                  <button
                    onClick={() => copy(INSTALL_CMD)}
                    title="Copy install command"
                    className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer min-w-0"
                  >
                    <code className="block text-[10px] text-green-600/80 dark:text-amber-400/70 font-mono truncate">
                      {copied ? "✓ copied!" : INSTALL_CMD}
                    </code>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation — Ant Design Menu */}
          <nav className="flex-1 px-2 py-2 overflow-y-auto custom-scrollbar">
            <Menu
              mode="inline"
              inlineCollapsed={collapsed}
              selectedKeys={[selectedKey]}
              openKeys={collapsed ? undefined : openKeys}
              onOpenChange={setOpenKeys}
              items={menuItems}
              className="!border-none !bg-transparent"
            />
          </nav>

          {/* Remote promo */}
          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowRemoteModal(true)}
              title={collapsed ? "Remote" : undefined}
              className="!justify-start"
            >
              <span className="flex items-center gap-3 w-full">
                <DesktopOutlined className="shrink-0 text-[16px]" />
                {!collapsed && <span className="text-[14px]">Remote</span>}
              </span>
            </Button>
          </div>
        </div>
      </Sider>

      {/* Remote Promo Modal */}
      <RemotePromoModal isOpen={showRemoteModal} onClose={() => setShowRemoteModal(false)} />

      {/* Update Confirmation Modal */}
      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Update OryphemRouter"
        message={`Show install command for v${updateInfo?.latestVersion || ""}? You can copy it and shutdown to install manually.`}
        confirmText="Show Command"
        cancelText="Cancel"
        variant="primary"
      />

      {/* Disconnected / Updating Overlay */}
      {(isDisconnected || isUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          {isUpdating ? (
            <ManualUpdatePanel
              latestVersion={updateInfo?.latestVersion}
              installCmd={INSTALL_CMD}
              copied={copied}
              onCopyAndShutdown={handleCopyAndShutdown}
              onCancel={handleCancelUpdate}
              countdown={shutdownCountdown}
              isDisconnected={isDisconnected}
            />
          ) : (
            <div className="text-center p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined text-[32px]">power_off</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Server Disconnected</h2>
              <p className="text-text-muted mb-6">The proxy server has been stopped.</p>
              <Button variant="secondary" onClick={() => globalThis.location.reload()}>
                Reload Page
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};

function ManualUpdatePanel({ latestVersion, installCmd, copied, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div className="p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-amber-500/20 text-amber-400">
          <span className="material-symbols-outlined text-[24px]">content_copy</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Update OryphemRouter{latestVersion ? ` to v${latestVersion}` : ""}</h2>
          <p className="text-xs text-white/60">
            {isDisconnected
              ? "Server stopped. Paste the command into a terminal to install."
              : isCountingDown
                ? `Command copied. Server will stop in ${countdown}s...`
                : "Click the button below to copy the install command and shutdown."}
          </p>
        </div>
      </div>

      <p className="text-sm text-white/80 mb-2">Install command:</p>
      <div className="w-full px-3 py-2 border border-white/10 rounded-[var(--radius-brand)] mb-4">
        <code className="text-xs font-mono text-amber-400 break-all">{installCmd}</code>
      </div>

      <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside mb-4">
        <li>Click <strong>Copy & Shutdown</strong> below.</li>
        <li>Paste the command into your terminal and press Enter.</li>
        <li>Run <code className="px-1 rounded bg-white/10 text-green-400">oryphemrouter</code> again after install.</li>
      </ol>

      {isDisconnected ? (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Reload Page
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isCountingDown}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={onCopyAndShutdown} disabled={isCountingDown}>
            {copied ? "✓ Copied, shutting down..." : isCountingDown ? `Shutting down in ${countdown}s` : "Copy & Shutdown"}
          </Button>
        </div>
      )}
    </div>
  );
}

ManualUpdatePanel.propTypes = {
  latestVersion: PropTypes.string,
  installCmd: PropTypes.string.isRequired,
  copied: PropTypes.bool,
  onCopyAndShutdown: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  countdown: PropTypes.number,
  isDisconnected: PropTypes.bool,
};

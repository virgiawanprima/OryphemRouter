"use client";

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Button from "./Button";
import { ConfirmModal } from "./Modal";
import RemotePromoModal from "./RemotePromoModal";


const navItems = [
  { href: "/dashboard", label: "Overview", icon: "space_dashboard" },
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combo & Vision Adapter", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
  { href: "/dashboard/profile", label: "Settings", icon: "settings" },
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

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
  // user runs the command manually in another terminal.


  return (
    <>
      <aside className={`flex flex-col border-r border-border-subtle bg-vibrancy backdrop-blur-xl shadow-elev transition-all duration-200 min-h-full ${collapsed ? "w-[68px]" : "w-64"}`}>
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

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive(item.href)}
              collapsed={collapsed}
              onNavigate={onClose}
            />
          ))}

          {/* System section */}
          <div className="pt-3 mt-2 space-y-0.5">
            {!collapsed && (
              <p className="px-4 text-[13px] text-text-muted mb-2">
                System
              </p>
            )}

            {/* Media Providers collapsible group */}
            <button
              onClick={() => setMediaOpen((v) => !v)}
              title={collapsed ? "Media Providers" : undefined}
              className={cn(
                "relative w-full flex items-center gap-3 px-3 py-2 rounded-[8px] transition-colors group",
                collapsed && "justify-center px-0",
                pathname.startsWith("/dashboard/media-providers")
                  ? "bg-c-blue-50/10 text-c-blue-600"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              {pathname.startsWith("/dashboard/media-providers") && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-c-blue-600" />
              )}
              <span className="material-symbols-outlined text-[18px] shrink-0">perm_media</span>
              {!collapsed && (
                <>
                  <span className="text-[14px] flex-1 text-left">Media Providers</span>
                  <span className="material-symbols-outlined text-[16px]" style={{ transform: mediaOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    expand_more
                  </span>
                </>
              )}
            </button>
            {mediaOpen && !collapsed && (
              <div className="pl-3 space-y-0.5">
                {MEDIA_SUBITEMS.map((sub) => (
                  <NavLink
                    key={sub.href}
                    href={sub.href}
                    icon={sub.icon}
                    label={sub.label}
                    active={pathname.startsWith(sub.href)}
                    collapsed={false}
                    small
                    onNavigate={onClose}
                  />
                ))}
              </div>
            )}

            {systemItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={isActive(item.href)}
                collapsed={collapsed}
                onNavigate={onClose}
              />
            ))}

            {/* Remote promo */}
            <button
              onClick={() => setShowRemoteModal(true)}
              title={collapsed ? "Remote" : undefined}
              className={cn(
                "relative w-full flex items-center gap-3 px-3 py-2 rounded-[8px] transition-colors group",
                collapsed && "justify-center px-0",
                "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">computer</span>
              {!collapsed && <span className="text-[14px]">Remote</span>}
            </button>

            </div>

          {/* Bottom: language + theme toggles */}
          <div className="mt-auto pt-3 border-t border-border-subtle px-3">
          </div>
        </nav>

      </aside>

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

function NavLink({ href, icon, label, active, collapsed, small, onNavigate }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2 rounded-[8px] transition-all duration-150 group",
        collapsed && "justify-center px-0",
        small && "px-4",
        active
          ? "bg-c-blue-50/10 text-c-blue-600"
          : "text-text-muted hover:bg-surface-2 hover:text-text-main hover:translate-x-0.5"
      )}
    >
      {/* Left accent bar for active item */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-c-blue-600 shadow-glow" />
      )}
      <span
        className={cn(
          "material-symbols-outlined shrink-0 transition-all duration-150",
          active && "fill-1",
          small ? "text-[16px]" : "text-[18px]"
        )}
      >
        {icon}
      </span>
      {!collapsed && (
        <span className={cn("text-[14px]", small ? "text-[13px]" : "")}>
          {label}
        </span>
      )}
    </Link>
  );
}

NavLink.propTypes = {
  href: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  active: PropTypes.bool,
  collapsed: PropTypes.bool,
  small: PropTypes.bool,
  onNavigate: PropTypes.func,
};

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

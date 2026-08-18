"use client";

// Top navigation bar — terminal-style horizontal nav for the dracula dashboard.
// Replaces the old sidebar layout.

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import HeaderLanguage from "@/shared/components/HeaderLanguage";
import ThemeToggle from "@/shared/components/ThemeToggle";
import HeaderMenu from "@/shared/components/HeaderMenu";
import DonateModal from "@/shared/components/DonateModal";
import { useHeaderSearchStore } from "@/store/headerSearchStore";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "space_dashboard" },
  { href: "/dashboard/endpoint", label: "Endpoint", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combos", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota", icon: "data_usage" },
  { href: "/dashboard/token-saver", label: "Tokens", icon: "savings" },
  { href: "/dashboard/cli-tools", label: "CLI", icon: "terminal" },
];

const SYSTEM_ITEMS = [
  { href: "/dashboard/proxy-pools", label: "Pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
  { href: "/dashboard/profile", label: "Settings", icon: "settings" },
];

export default function TopNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setDisplayName(d.displayName || d.samlName || ""); setLoginMethod(d.loginMethod || ""); } })
      .catch(() => {});
  }, []);

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) window.location.assign("/login");
    } catch { /* ignore */ }
  };

  return (
    <>
      <header className="shrink-0 border-b border-border-subtle bg-surface/80 backdrop-blur-xl z-30">
        <div className="flex items-center justify-between h-12 px-3 lg:px-6">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="flex items-center justify-center size-7 rounded-[var(--radius-brand)] bg-gradient-to-br from-brand-800 to-brand-500">
              <span className="material-symbols-outlined text-white text-[16px]">hub</span>
            </div>
            <span className="hidden sm:inline font-bold text-sm text-text-main font-[var(--font-mono)] tracking-tight">
              {APP_CONFIG.name}
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden lg:flex items-center gap-0.5 mx-4 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-brand)] text-xs font-[var(--font-mono)] transition-all",
                  isActive(item.href)
                    ? "bg-brand-500/12 text-brand-300 border border-brand-500/20"
                    : "text-text-muted border border-transparent hover:text-text-main hover:bg-surface-2"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                {item.label}
              </Link>
            ))}
            {/* System */}
            <span className="mx-1 text-text-subtle select-none">|</span>
            {SYSTEM_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-brand)] text-xs font-[var(--font-mono)] transition-all",
                  isActive(item.href)
                    ? "bg-brand-500/12 text-brand-300 border border-brand-500/20"
                    : "text-text-muted border border-transparent hover:text-text-main hover:bg-surface-2"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            <SearchBox />
            {displayName && (
              <span className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-full bg-surface-2 text-[10px] text-text-muted font-[var(--font-mono)]">
                <span className="text-brand-300">{displayName.split("@")[0]}</span>
              </span>
            )}
            <button
              onClick={() => setDonateOpen(true)}
              className="hidden sm:flex items-center gap-1 px-2 h-7 rounded-full border border-pink-500/20 bg-pink-500/10 text-pink-400 text-[11px] font-medium hover:bg-pink-500/20 transition-colors"
              aria-label="Donate"
            >
              <span className="material-symbols-outlined text-[14px]">volunteer_activism</span>
            </button>
            <ThemeToggle />
            <HeaderLanguage />
            <HeaderMenu onLogout={handleLogout} />
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden flex items-center justify-center size-8 rounded-[var(--radius-brand)] text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors"
              aria-label="Toggle menu"
            >
              <span className="material-symbols-outlined text-[20px]">
                {mobileOpen ? "close" : "menu"}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-border-subtle bg-surface/95 backdrop-blur-xl p-3 space-y-1 animate-in slide-in-top">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-brand)] text-sm font-[var(--font-mono)] transition-all",
                  isActive(item.href)
                    ? "bg-brand-500/12 text-brand-300"
                    : "text-text-muted hover:text-text-main hover:bg-surface-2"
                )}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.label}
              </Link>
            ))}
            <div className="border-t border-border-subtle pt-1 mt-1">
              {SYSTEM_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-brand)] text-sm font-[var(--font-mono)] transition-all",
                    isActive(item.href)
                      ? "bg-brand-500/12 text-brand-300"
                      : "text-text-muted hover:text-text-main hover:bg-surface-2"
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>
      <DonateModal isOpen={donateOpen} onClose={() => setDonateOpen(false)} />
    </>
  );
}

function SearchBox() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="relative w-[120px] sm:w-[180px]">
      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-[14px] pointer-events-none">
        search
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full h-7 pl-7 pr-6 rounded-[var(--radius-brand)] border border-border bg-surface-2 text-xs focus:outline-none focus:border-brand-500/50 transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded"
          aria-label="Clear search"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      )}
    </div>
  );
}
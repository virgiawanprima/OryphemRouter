"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import StatusBar from "../StatusBar";

function getToastStyle(type) {
  if (type === "success") return { wrapper: "border-[color:var(--md-sys-color-outlineVariant)] bg-[color:var(--md-sys-color-surfaceContainerHigh)] text-[color:var(--md-sys-color-onSurface)]", icon: "check_circle", iconColor: "text-[color:var(--md-sys-color-primary)]" };
  if (type === "error") return { wrapper: "border-[color:var(--md-sys-color-errorContainer)] bg-[color:var(--md-sys-color-errorContainer)] text-[color:var(--md-sys-color-onErrorContainer)]", icon: "error", iconColor: "" };
  if (type === "warning") return { wrapper: "border-[color:var(--md-sys-color-outlineVariant)] bg-[color:var(--md-sys-color-surfaceContainerHigh)] text-[color:var(--md-sys-color-onSurface)]", icon: "warning", iconColor: "text-[color:var(--md-sys-color-onSurfaceVariant)]" };
  return { wrapper: "border-[color:var(--md-sys-color-outlineVariant)] bg-[color:var(--md-sys-color-surfaceContainerHigh)] text-[color:var(--md-sys-color-onSurface)]", icon: "info", iconColor: "text-[color:var(--md-sys-color-primary)]" };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div key={n.id} className={`rounded-[var(--md-sys-shape-corner-large)] border px-3 py-2 shadow-md ${style.wrapper}`}>
              <div className="flex items-start gap-2">
                <span className={`material-symbols-outlined text-[18px] leading-5 ${style.iconColor}`}>{style.icon}</span>
                <div className="min-w-0 flex-1">
                  {n.title ? <p className="text-xs font-medium mb-0.5">{n.title}</p> : null}
                  <p className="text-xs whitespace-pre-wrap break-words">{n.message}</p>
                </div>
                {n.dismissible ? (
                  <button type="button" onClick={() => removeNotification(n.id)} className="text-current/70 hover:text-current" aria-label="Dismiss">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — Desktop */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Sidebar — Mobile */}
      <div className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex flex-col flex-1 h-full min-w-0">
        <Header key={pathname} onMenuClick={() => setSidebarOpen(true)} />
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {/* Ambient premium glow */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-c-blue-50/5 via-transparent to-transparent" />
          <div className="relative p-6 lg:p-10">
            <div className="max-w-7xl mx-auto">{children}</div>
          </div>
        </div>
        <StatusBar />
      </main>
    </div>
  );
}
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import StatusBar from "../StatusBar";

function getToastStyle(type) {
  if (type === "success") return { wrapper: "border-c-teal-600/30 bg-c-teal-50/10 text-c-teal-800", icon: "check_circle" };
  if (type === "error") return { wrapper: "border-c-red-600/30 bg-c-red-50/10 text-c-red-800", icon: "error" };
  if (type === "warning") return { wrapper: "border-c-amber-600/30 bg-c-amber-50/10 text-c-amber-800", icon: "warning" };
  return { wrapper: "border-c-blue-600/30 bg-c-blue-50/10 text-c-blue-800", icon: "info" };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  // Basic Chat is a full-viewport app: it manages its own internal scrolling, so
  // the dashboard wrapper must not add padding or a page-level scrollbar.
  const isFullViewport = pathname?.startsWith("/dashboard/basic-chat");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div key={n.id} className={`rounded-lg border px-3 py-2 shadow-sm backdrop-blur-sm ${style.wrapper}`}>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] leading-5">{style.icon}</span>
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
        <div className={`flex-1 relative ${isFullViewport ? "overflow-hidden" : "overflow-y-auto custom-scrollbar"}`}>
          {/* Ambient premium glow */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-c-blue-50/5 via-transparent to-transparent" />
          <div className={`relative ${isFullViewport ? "p-0 h-full" : "p-6 lg:p-10"}`}>
            <div className={`${isFullViewport ? "h-full max-w-none" : "max-w-7xl mx-auto"}`}>{children}</div>
          </div>
        </div>
        <StatusBar />
      </main>
    </div>
  );
}
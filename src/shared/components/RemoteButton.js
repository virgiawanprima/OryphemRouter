"use client";

import { useState } from "react";
import RemotePromoModal from "./RemotePromoModal";

export default function RemoteButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5"
        title="Remote"
      >
        <span className="material-symbols-outlined text-[18px]">computer</span>
        <span className="text-xs font-medium">Remote</span>
      </button>

      <RemotePromoModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

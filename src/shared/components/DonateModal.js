"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useTranslation } from "@/i18n";

export default function DonateModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(null);
  const modalRef = { current: null };

  if (!isOpen || typeof document === "undefined") return null;

  const bankInfo = {
    name: "VIRGIAWAN PRIMA RIZK",
    bank: "Bank Mandiri",
    number: "1480022960655",
  };

  const copyNumber = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(bankInfo.number).then(() => {
        setCopied("number");
        setTimeout(() => setCopied(null), 2000);
      });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full bg-surface border border-[color:var(--md-sys-color-outlineVariant)] rounded-[var(--radius-brand-lg)] shadow-[var(--shadow-lg)] max-w-md flex flex-col"
      >
        <div className="flex items-center justify-between p-3 border-b border-[color:var(--md-sys-color-outlineVariant)]">
          <h2 className="text-lg font-semibold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-pink-500">volunteer_activism</span>
            {t("donate.title") || "Support OryphemRouter"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-text-muted text-sm mb-6 text-center">
            {t("donate.message") || "Terima kasih telah menggunakan OryphemRouter. Dukungan Anda membantu kami terus mengembangkan proyek ini!"}
          </p>

          <div className="flex flex-col items-center p-5 border border-[color:var(--md-sys-color-outlineVariant)] bg-[color:var(--md-sys-color-surfaceContainerHigh)] rounded-[var(--radius-brand)]">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-pink-500/20 text-pink-500">
              <span className="material-symbols-outlined text-[26px]">account_balance</span>
            </div>
            <div className="font-semibold text-text-main mb-1">{bankInfo.bank}</div>
            <div className="text-xs text-text-muted mb-1">{bankInfo.name}</div>
            <div className="flex items-center gap-2 mt-2">
              <code className="text-lg font-mono font-bold text-text-main">{bankInfo.number}</code>
              <button
                onClick={copyNumber}
                className="p-1.5 border border-[color:var(--md-sys-color-outlineVariant)] rounded-[var(--radius-brand)] hover:border-pink-500 text-text-muted hover:text-pink-500 transition-colors"
                title={t("donate.copy") || "Salin"}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copied === "number" ? "check" : "content_copy"}
                </span>
              </button>
            </div>
            {copied === "number" && (
              <span className="text-xs text-green-600 mt-1">
                {t("donate.copied") || "Tersalin!"}
              </span>
            )}
          </div>

          <div className="mt-4 p-3 border border-dashed border-[color:var(--md-sys-color-outlineVariant)] text-center">
            <p className="text-xs text-text-muted">
              {t("donate.note") || "Terima kasih atas dukungan Anda. Setiap donasi membantu pengembangan fitur baru dan pemeliharaan server."}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

DonateModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
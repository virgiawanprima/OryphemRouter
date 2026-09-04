"use client";

import { useId } from "react";
import { Modal as AntModal, Button as AntModalButton } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Modal — adapter keeping the app's existing props (isOpen, onClose,
// footer, size). antd handles focus trap, ESC, overlay click and body scroll
// lock natively; traffic-light header decoration is preserved via title slot.
const sizeWidths = {
  sm: 420,
  md: 480,
  lg: 560,
  xl: 640,
  full: 896,
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  showTrafficLights = true,
  className,
  ...props
}) {
  const titleId = useId();

  const headerNode = showTrafficLights ? (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full bg-[#FF5F56] inline-block" />
      <span className="w-3 h-3 rounded-full bg-[#FFBD2E] inline-block" />
      <span className="w-3 h-3 rounded-full bg-[#27C93F] inline-block" />
      <h2 id={titleId} className="ml-2 text-base font-semibold text-text-main">{title}</h2>
    </div>
  ) : (
    <h2 id={titleId} className="text-base font-semibold text-text-main">{title}</h2>
  );

  return (
    <AntModal
      open={isOpen}
      onCancel={onClose}
      mask={{ closable: closeOnOverlay }}
      width={sizeWidths[size] || 480}
      title={title ? headerNode : undefined}
      footer={footer !== undefined ? footer : null}
      centered
      className={cn("antd-modal-ryp", className)}
      aria-labelledby={title ? titleId : undefined}
      {...props}
    >
      {children}
    </AntModal>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}) {
  return (
    <AntModal
      open={isOpen}
      onCancel={onClose}
      title={title}
      centered
      footer={
        <div className="flex items-center justify-end gap-3">
          <AntModalButton onClick={onClose} disabled={loading}>{cancelText}</AntModalButton>
          <AntModalButton
            type="primary"
            danger={variant !== "success"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmText}
          </AntModalButton>
        </div>
      }
    >
      <p className="text-text-main">{message}</p>
    </AntModal>
  );
}


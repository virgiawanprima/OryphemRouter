"use client";

import { useId } from "react";
import { Modal as AntModal, Button as AntModalButton } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Modal — adapter keeping the app's existing props (isOpen, onClose,
// footer, size). antd handles focus trap, ESC, overlay click and body scroll
// lock natively; the title slot keeps the header decoration consistent.
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
  className,
  ...props
}) {
  const titleId = useId();

  const headerNode = title ? (
    <h2 id={titleId} className="text-base font-semibold text-text-main">{title}</h2>
  ) : undefined;

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


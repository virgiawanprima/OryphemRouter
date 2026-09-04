"use client";

import { Drawer as AntDrawer } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Drawer — adapter keeping the app's existing props
// (isOpen, onClose, title, width). antd handles focus trap, ESC and scroll
// lock natively.
const widthMap = {
  sm: 400,
  md: 500,
  lg: 600,
  xl: 800,
  full: "100vw",
};

export default function Drawer({ isOpen, onClose, title, children, width = "md", className }) {
  return (
    <AntDrawer
      open={isOpen}
      onClose={onClose}
      title={title}
      width={widthMap[width] ?? 500}
      placement="right"
      closable
      destroyOnClose
      className={cn("antd-drawer-ryp", className)}
    >
      {children}
    </AntDrawer>
  );
}
"use client";

import { Tooltip as AntTooltip } from "antd";

// Ant Design Tooltip — adapter. App API: text/children/position/color.
const placementMap = {
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
};

export default function Tooltip({ text, children, position = "top", color }) {
  if (!text) return children;
  return (
    <AntTooltip
      title={text}
      placement={placementMap[position] || "top"}
      color={color}
      arrow={false}
    >
      {children}
    </AntTooltip>
  );
}
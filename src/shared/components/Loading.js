"use client";

import { Spin, Skeleton as AntSkeleton, Card as AntCard } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { cn } from "@/shared/utils/cn";

// Ant Design Spin/Skeleton — adapters keeping the app's existing API names.

export function Spinner({ size = "md", className }) {
  const sizeMap = { sm: 20, md: 28, lg: 40 };
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <Spin indicator={<LoadingOutlined style={{ fontSize: sizeMap[size] || 28 }} spin />} />
    </span>
  );
}

export function PageLoading({ message = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Spinner size="lg" />
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

export function Skeleton({ className, ...props }) {
  return (
    <AntSkeleton
      active
      title={{ width: "40%" }}
      paragraph={{ rows: 3 }}
      className={className}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <AntCard className="w-full">
      <AntSkeleton active title={{ width: "60%" }} paragraph={{ rows: 4 }} />
    </AntCard>
  );
}

export default function Loading({ type = "spinner", ...props }) {
  if (type === "skeleton") return <Skeleton {...props} />;
  return <Spinner {...props} />;
}
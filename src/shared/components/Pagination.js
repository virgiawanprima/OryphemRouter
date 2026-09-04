"use client";

import { Pagination as AntPagination } from "antd";
import { cn } from "@/shared/utils/cn";

// Ant Design Pagination — adapter keeping the app's existing props
// (currentPage, pageSize, totalItems, onPageChange, onPageSizeChange).
export default function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  className,
}) {
  if (!totalItems || totalItems === 0) return null;

  return (
    <div className={cn("flex items-center justify-between gap-4 flex-wrap", className)}>
      <div className="text-sm text-text-muted">
        <span className="font-medium text-text-main">{totalItems}</span> results
      </div>
      <AntPagination
        current={currentPage}
        pageSize={pageSize}
        total={totalItems}
        onChange={onPageChange}
        showSizeChanger={!!onPageSizeChange}
        onShowSizeChange={onPageSizeChange ? (_, size) => onPageSizeChange(size) : undefined}
        pageSizeOptions={[10, 20, 50]}
        showQuickJumper
        showTotal={(total) => null}
      />
    </div>
  );
}
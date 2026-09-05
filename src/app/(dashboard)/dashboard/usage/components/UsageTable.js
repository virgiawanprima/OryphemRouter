"use client";

import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { Table as AntTable ,
  Typography } from "antd";
import Card from "@/shared/components/Card";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

function fmtTime(iso) {
  if (!iso) return "Never";
  const diffMins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Render 3 token or cost cells based on viewMode (summary/detail HTML rows)
 */
function ValueCells({ item, viewMode, isSummary = false }) {
  if (viewMode === "tokens") {
    return (
      <>
        <td className="px-6 py-3 text-right text-text-muted">
          {isSummary && item.promptTokens === undefined ? "-" : fmt(item.promptTokens)}
        </td>
        <td className="px-6 py-3 text-right text-text-muted">
          {item.cachedTokens ? fmt(item.cachedTokens) : "-"}
        </td>
        <td className="px-6 py-3 text-right text-text-muted">
          {isSummary && item.completionTokens === undefined ? "-" : fmt(item.completionTokens)}
        </td>
        <td className="px-6 py-3 text-right font-medium">
          {fmt(item.totalTokens)}
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-6 py-3 text-right text-text-muted">
        {isSummary && item.inputCost === undefined ? "-" : fmtCost(item.inputCost)}
      </td>
      <td className="px-6 py-3 text-right text-text-muted">
        {item.cachedCost ? fmtCost(item.cachedCost) : "-"}
      </td>
      <td className="px-6 py-3 text-right text-text-muted">
        {isSummary && item.outputCost === undefined ? "-" : fmtCost(item.outputCost)}
      </td>
      <td className="px-6 py-3 text-right font-medium text-warning">
        {fmtCost(item.totalCost || item.cost)}
      </td>
    </>
  );
}

ValueCells.propTypes = {
  item: PropTypes.object.isRequired,
  viewMode: PropTypes.string.isRequired,
  isSummary: PropTypes.bool,
};

/**
 * Reusable sortable usage table with expandable group rows (Ant Design Table).
 *
 * @param {object} props
 * @param {string} props.title - Table title
 * @param {Array} props.columns - Column definitions [{field, label}]
 * @param {Array} props.groupedData - Grouped data from groupDataByKey
 * @param {string} props.tableType - Table type key for sort URL params
 * @param {string} props.sortBy - Current sort field
 * @param {string} props.sortOrder - Current sort order
 * @param {function} props.onToggleSort - Sort toggle handler
 * @param {string} props.viewMode - "tokens" or "costs"
 * @param {string} props.storageKey - localStorage key for expanded state
 * @param {function} props.renderSummaryCells - Render summary row cells as array (one node per non-label column)
 * @param {function} props.renderDetailCells - Render detail row custom cells (before value cells)
 * @param {string} props.emptyMessage - Empty state message
 */
export default function UsageTable({
  title,
  columns,
  groupedData,
  tableType,
  sortBy,
  sortOrder,
  onToggleSort,
  viewMode,
  storageKey,
  renderDetailCells,
  renderSummaryCells,
  emptyMessage,
}) {
  const [expandedKeys, setExpandedKeys] = useState([]);

  // Load expanded state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setExpandedKeys(JSON.parse(saved));
    } catch (e) {
      console.error(`Failed to load ${storageKey}:`, e);
    }
  }, [storageKey]);

  // Save expanded state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(expandedKeys));
    } catch (e) {
      console.error(`Failed to save ${storageKey}:`, e);
    }
  }, [expandedKeys, storageKey]);

  const valueColumns = useMemo(() => {
    if (viewMode === "tokens") {
      return [
        { field: "promptTokens", label: "Input Tokens" },
        { field: "cachedTokens", label: "Cached" },
        { field: "completionTokens", label: "Output Tokens" },
        { field: "totalTokens", label: "Total Tokens" },
      ];
    }
    return [
      { field: "promptTokens", label: "Input Cost" },
      { field: "cachedCost", label: "Cached Cost" },
      { field: "completionTokens", label: "Output Cost" },
      { field: "cost", label: "Total Cost" },
    ];
  }, [viewMode]);

  // antd column definitions. Summary rows come from groupedData; detail rows are
  // rendered inside expandedRowRender as an HTML table (renderDetailCells contract).
  const antdColumns = useMemo(() => {
    const buildCol = (label, align) => ({
      title: label,
      align: align || "left",
      ellipsis: align !== "right",
    });

    const labelCol = {
      title: columns[0]?.label || "",
      dataIndex: "groupKey",
      render: (_, group) => (
        <span className={`font-medium transition-colors ${group.summary?.pending > 0 ? "text-primary" : ""}`}>
          {group.groupKey}
        </span>
      ),
    };

    const summaryCols = columns.slice(1).map((col, i) => ({
      ...buildCol(col.label, col.align),
      dataIndex: col.field,
      render: (_, group) => renderSummaryCells(group)?.[i] ?? null,
    }));

    const valueCols = valueColumns.map((col) => ({
      ...buildCol(col.label, "right"),
      dataIndex: col.field,
      render: (_, group) => {
        const item = group.summary;
        const isSummary = true;
        if (viewMode === "tokens") {
          if (col.field === "promptTokens") return isSummary && item.promptTokens === undefined ? "-" : fmt(item.promptTokens);
          if (col.field === "cachedTokens") return item.cachedTokens ? fmt(item.cachedTokens) : "-";
          if (col.field === "completionTokens") return isSummary && item.completionTokens === undefined ? "-" : fmt(item.completionTokens);
          return fmt(item.totalTokens);
        }
        if (col.field === "promptTokens") return isSummary && item.inputCost === undefined ? "-" : fmtCost(item.inputCost);
        if (col.field === "cachedCost") return item.cachedCost ? fmtCost(item.cachedCost) : "-";
        if (col.field === "completionTokens") return isSummary && item.outputCost === undefined ? "-" : fmtCost(item.outputCost);
        return fmtCost(item.totalCost || item.cost);
      },
    }));

    return [labelCol, ...summaryCols, ...valueCols];
  }, [columns, valueColumns, viewMode, renderSummaryCells]);

  const totalColSpan = columns.length + valueColumns.length;

  const expandedRowRender = (group) => (
    <table className="w-full text-sm text-left">
      <tbody>
        {group.items.map((item) => (
          <tr key={`detail-${item.key}`} className="hover:bg-bg-subtle/20 transition-colors">
            {renderDetailCells(item)}
            <ValueCells item={item} viewMode={viewMode} />
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border bg-bg-subtle/50">
        <Typography.Title level={3} className="font-semibold"  style={{ margin: 0 }}>>{title}</Typography.Title>
      </div>
      <div className="overflow-x-auto">
        <AntTable
          rowKey={(group) => group.groupKey}
          dataSource={groupedData}
          size="small"
          pagination={false}
          locale={{ emptyText: emptyMessage }}
          columns={antdColumns}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys || []),
            expandRowByClick: true,
            expandedRowRender,
          }}
          onHeaderCell={(column) => ({
            onClick: () => {
              const field = column.dataIndex;
              if (field) onToggleSort(tableType, field);
            },
            style: { cursor: "pointer" },
          })}
        />
      </div>
    </Card>
  );
}

UsageTable.propTypes = {
  title: PropTypes.string.isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({
    field: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    align: PropTypes.string,
  })).isRequired,
  groupedData: PropTypes.array.isRequired,
  tableType: PropTypes.string.isRequired,
  sortBy: PropTypes.string.isRequired,
  sortOrder: PropTypes.string.isRequired,
  onToggleSort: PropTypes.func.isRequired,
  viewMode: PropTypes.string.isRequired,
  storageKey: PropTypes.string.isRequired,
  renderDetailCells: PropTypes.func.isRequired,
  renderSummaryCells: PropTypes.func.isRequired,
  emptyMessage: PropTypes.string.isRequired,
};

// Re-export utilities for use in UsageStats orchestrator
export { fmt, fmtCost, fmtTime };

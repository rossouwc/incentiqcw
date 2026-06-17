const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  EXECUTIVE_APPROVED: { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",   label: "Executive Approved" },
  FINANCE_APPROVED:   { cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",       label: "Finance Approved" },
  MANAGER_APPROVED:   { cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",   label: "Manager Approved" },
  PENDING_APPROVAL:   { cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pending Approval" },
  PENDING:            { cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pending" },
  PAYROLL_APPROVED:   { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Payroll Approved" },
  PAID:               { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Paid" },
  APPROVED:           { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",   label: "Approved" },
  REJECTED:           { cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",           label: "Rejected" },
  CHANGES_REQUESTED:  { cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", label: "Changes Requested" },
  DRAFT:              { cls: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400",       label: "Draft" },
  ACTIVE:             { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",   label: "Active" },
  INACTIVE:           { cls: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",       label: "Inactive" },
  PROCESSING:         { cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", label: "Processing" },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status];
  const cls   = entry?.cls   ?? "bg-gray-100 text-gray-700";
  const label = entry?.label ?? status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

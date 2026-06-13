export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    EXECUTIVE_APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    FINANCE_APPROVED:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    MANAGER_APPROVED:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    PENDING_APPROVAL:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    PENDING:            "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    PAID:               "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    APPROVED:           "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    REJECTED:           "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    ACTIVE:             "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    INACTIVE:           "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    PROCESSING:         "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-700";
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

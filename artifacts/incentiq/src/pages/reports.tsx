import { useState, useMemo } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  BarChart2, TrendingUp, Users, DollarSign, Clock, FileText,
  Download, FileSpreadsheet, Loader2, AlertCircle, Filter,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | "commission-by-month"
  | "commission-by-executive"
  | "commission-by-deal-type"
  | "pending-approvals"
  | "payout-requests"
  | "payroll-export"
  | "wallet-balances"
  | "audit-trail";

interface Filters {
  from: string;
  to: string;
  userId: string;
  dealType: string;
  status: string;
}

const REPORT_DEFS: { type: ReportType; label: string; icon: React.ElementType; description: string }[] = [
  { type: "commission-by-month",     label: "Commission by Month",      icon: BarChart2,      description: "Monthly commission totals, GP and revenue" },
  { type: "commission-by-executive", label: "Commission by Executive",   icon: Users,          description: "Commission earned per sales executive" },
  { type: "commission-by-deal-type", label: "Commission by Deal Type",   icon: TrendingUp,     description: "Commission split across NET_NEW, RENEWAL, etc." },
  { type: "pending-approvals",       label: "Pending Approvals",         icon: Clock,          description: "Deals currently in the approval pipeline" },
  { type: "payout-requests",         label: "Payout Request Report",     icon: FileText,       description: "All payout requests with status details" },
  { type: "payroll-export",          label: "Payroll Export Report",     icon: DollarSign,     description: "Finance/Payroll approved and paid payouts" },
  { type: "wallet-balances",         label: "Wallet Balance Report",     icon: DollarSign,     description: "Current wallet balances per employee" },
  { type: "audit-trail",             label: "Audit Trail",               icon: FileText,       description: "Transaction history and system audit logs" },
];

const DEAL_TYPES = ["ALL", "NET_NEW", "RENEWAL", "UPSELL", "CROSS_SELL"];
const DEAL_STATUSES = ["ALL", "DRAFT", "SUBMITTED", "PENDING_APPROVAL", "MANAGER_APPROVED", "FINANCE_APPROVED", "EXECUTIVE_APPROVED", "APPROVED", "REJECTED", "CANCELLED"];
const PAYOUT_STATUSES = ["ALL", "PENDING", "FINANCE_APPROVED", "PAYROLL_APPROVED", "PAID", "REJECTED", "DEFERRED"];

// ─── API helper ───────────────────────────────────────────────────────────────

function buildQueryString(type: ReportType, f: Filters): string {
  const p = new URLSearchParams();
  if (f.from)     p.set("from",     f.from);
  if (f.to)       p.set("to",       f.to);
  if (f.userId && f.userId !== "ALL") p.set("userId", f.userId);
  if (f.dealType && f.dealType !== "ALL") p.set("dealType", f.dealType);
  if (f.status && f.status !== "ALL") p.set("status", f.status);
  return p.toString() ? `?${p}` : "";
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchReport(type: ReportType, filters: Filters) {
  const qs = buildQueryString(type, filters);
  const res = await fetch(`/api/reports/${type}${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function downloadFile(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 font-medium text-xs uppercase text-muted-foreground ${right ? "text-right" : ""}`}>{children}</th>;
}
function Td({ children, right, bold, muted, green }: { children: React.ReactNode; right?: boolean; bold?: boolean; muted?: boolean; green?: boolean }) {
  return (
    <td className={`px-4 py-3 text-sm ${right ? "text-right" : ""} ${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""} ${green ? "text-emerald-600 font-semibold" : ""}`}>
      {children}
    </td>
  );
}

function EmptyRow({ cols, message }: { cols: number; message?: string }) {
  return (
    <tr><td colSpan={cols} className="px-4 py-12 text-center text-muted-foreground">
      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
      {message ?? "No data for the selected filters"}
    </td></tr>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm text-left">{children}</table></div>;
}

// ─── Report Tables ────────────────────────────────────────────────────────────

function CommissionByMonthTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <TableWrap>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Month</Th><Th right>Deals</Th><Th right>Revenue</Th><Th right>Gross Profit</Th><Th right>Commission</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={5} /> : rows.map((r) => (
          <tr key={r.month} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td bold>{r.month}</Td><Td right muted>{r.deals}</Td>
            <Td right>{formatCurrency(r.revenue)}</Td>
            <Td right>{formatCurrency(r.grossProfit)}</Td>
            <Td right green>{formatCurrency(r.commission)}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <tr className="bg-muted/40 font-semibold border-t-2 border-border">
            <Td bold>Total</Td><Td right bold>{t.deals}</Td>
            <Td right bold>{formatCurrency(t.revenue)}</Td>
            <Td right bold>{formatCurrency(t.grossProfit)}</Td>
            <Td right bold>{formatCurrency(t.commission)}</Td>
          </tr>
        )}
      </tbody>
    </TableWrap>
  );
}

function CommissionByExecutiveTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <TableWrap>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>#</Th><Th>Executive</Th><Th>Email</Th><Th right>Deals</Th><Th right>Revenue</Th><Th right>Gross Profit</Th><Th right>Commission</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={7} /> : rows.map((r, i) => (
          <tr key={r.userId} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td muted>#{i + 1}</Td><Td bold>{r.name}</Td><Td muted>{r.email}</Td>
            <Td right muted>{r.deals}</Td><Td right>{formatCurrency(r.revenue)}</Td>
            <Td right>{formatCurrency(r.grossProfit)}</Td><Td right green>{formatCurrency(r.commission)}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <tr className="bg-muted/40 border-t-2 border-border">
            <Td muted>—</Td><Td bold>Total</Td><Td muted>—</Td><Td right bold>{t.deals}</Td>
            <Td right bold>{formatCurrency(t.revenue)}</Td>
            <Td right bold>{formatCurrency(t.grossProfit)}</Td>
            <Td right bold>{formatCurrency(t.commission)}</Td>
          </tr>
        )}
      </tbody>
    </TableWrap>
  );
}

function CommissionByDealTypeTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  const TYPE_COLORS: Record<string, string> = { NET_NEW: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", RENEWAL: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", UPSELL: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", CROSS_SELL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" };
  return (
    <TableWrap>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Deal Type</Th><Th right>Deals</Th><Th right>Revenue</Th><Th right>Gross Profit</Th><Th right>Commission</Th><Th right>% of Total</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={6} /> : rows.map((r) => (
          <tr key={r.dealType} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.dealType] ?? ""}`}>{r.dealType}</span></Td>
            <Td right muted>{r.deals}</Td><Td right>{formatCurrency(r.revenue)}</Td>
            <Td right>{formatCurrency(r.grossProfit)}</Td>
            <Td right green>{formatCurrency(r.commission)}</Td>
            <Td right muted>{r.percentage}%</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <tr className="bg-muted/40 border-t-2 border-border">
            <Td bold>Total</Td><Td right bold>{t.deals}</Td>
            <Td right bold>{formatCurrency(t.revenue)}</Td>
            <Td right bold>{formatCurrency(t.grossProfit)}</Td>
            <Td right bold>{formatCurrency(t.commission)}</Td>
            <Td right muted>100%</Td>
          </tr>
        )}
      </tbody>
    </TableWrap>
  );
}

function StatusBadgePill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    PENDING_APPROVAL: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    MANAGER_APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    FINANCE_APPROVED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    EXECUTIVE_APPROVED: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
    PAYROLL_APPROVED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    CANCELLED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    DEFERRED: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    SUBMITTED: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
    CHANGES_REQUESTED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>{status.replace(/_/g, " ")}</span>;
}

function PendingApprovalsTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  return (
    <TableWrap>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Deal Name</Th><Th>Customer</Th><Th>Executive</Th><Th>Type</Th><Th right>Commission</Th><Th>Status</Th><Th>Current Step</Th><Th>Submitted</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={8} /> : rows.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td bold>{r.dealName}</Td><Td muted>{r.customerName}</Td><Td>{r.executiveName}</Td>
            <Td muted>{r.dealType}</Td><Td right green>{formatCurrency(r.commission)}</Td>
            <td className="px-4 py-3"><StatusBadgePill status={r.status} /></td>
            <Td muted>{r.currentStep}</Td>
            <Td muted>{r.submittedAt ? r.submittedAt.slice(0, 10) : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function PayoutRequestTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <>
      {t && (
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex flex-wrap gap-6 text-sm">
          {[
            { label: "Total Requests", value: t.total },
            { label: "Total Amount",   value: formatCurrency(t.totalAmount) },
            { label: "Paid",           value: t.paid },
            { label: "Pending",        value: t.pending },
          ].map((s) => (
            <div key={s.label}><span className="text-muted-foreground">{s.label}: </span><span className="font-semibold">{s.value}</span></div>
          ))}
        </div>
      )}
      <TableWrap>
        <thead className="bg-muted/50 border-b border-border">
          <tr><Th>Employee</Th><Th>Email</Th><Th>Month</Th><Th right>Commission</Th><Th>Status</Th><Th>Requested</Th><Th>Approved</Th><Th>Paid</Th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={8} /> : rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
              <Td bold>{r.employeeName}</Td><Td muted>{r.email}</Td><Td muted>{r.payoutMonth}</Td>
              <Td right green>{formatCurrency(r.requestedAmount)}</Td>
              <td className="px-4 py-3"><StatusBadgePill status={r.status} /></td>
              <Td muted>{r.requestedAt?.slice(0,10)}</Td>
              <Td muted>{r.approvedAt ? r.approvedAt.slice(0,10) : "—"}</Td>
              <Td muted>{r.paidAt ? r.paidAt.slice(0,10) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

function PayrollExportTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <>
      {t && (
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex flex-wrap gap-6 text-sm">
          {[{ label: "Records", value: t.total }, { label: "Total Commission", value: formatCurrency(t.totalAmount) }, { label: "Unique Employees", value: t.uniqueEmployees }].map((s) => (
            <div key={s.label}><span className="text-muted-foreground">{s.label}: </span><span className="font-semibold">{s.value}</span></div>
          ))}
        </div>
      )}
      <TableWrap>
        <thead className="bg-muted/50 border-b border-border">
          <tr><Th>Employee</Th><Th>Email</Th><Th>Month</Th><Th right>Commission</Th><Th>Status</Th><Th>Approved</Th><Th>Paid</Th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={7} /> : rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
              <Td bold>{r.employeeName}</Td><Td muted>{r.email}</Td><Td muted>{r.payoutMonth}</Td>
              <Td right green>{formatCurrency(r.commissionAmount)}</Td>
              <td className="px-4 py-3"><StatusBadgePill status={r.status} /></td>
              <Td muted>{r.approvedAt ? r.approvedAt.slice(0,10) : "—"}</Td>
              <Td muted>{r.paidAt ? r.paidAt.slice(0,10) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

function WalletBalanceTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <>
      {t && rows.length > 0 && (
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex flex-wrap gap-6 text-sm">
          {[{ label: "Available", value: formatCurrency(t.availableBalance) }, { label: "Pending", value: formatCurrency(t.pendingBalance) }, { label: "Deferred", value: formatCurrency(t.deferredBalance) }, { label: "Paid Out", value: formatCurrency(t.paidOutBalance) }, { label: "Total Earned", value: formatCurrency(t.totalEarned) }].map((s) => (
            <div key={s.label}><span className="text-muted-foreground">{s.label}: </span><span className="font-semibold">{s.value}</span></div>
          ))}
        </div>
      )}
      <TableWrap>
        <thead className="bg-muted/50 border-b border-border">
          <tr><Th>Employee</Th><Th>Email</Th><Th>Role</Th><Th right>Available</Th><Th right>Pending</Th><Th right>Deferred</Th><Th right>Paid Out</Th><Th right>Total Earned</Th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={8} /> : rows.map((r) => (
            <tr key={r.userId} className="border-b border-border last:border-0 hover:bg-muted/20">
              <Td bold>{r.name}</Td><Td muted>{r.email}</Td><Td muted>{r.role}</Td>
              <Td right green>{formatCurrency(r.availableBalance)}</Td>
              <Td right>{formatCurrency(r.pendingBalance)}</Td>
              <Td right>{formatCurrency(r.deferredBalance)}</Td>
              <Td right>{formatCurrency(r.paidOutBalance)}</Td>
              <Td right bold>{formatCurrency(r.totalEarned)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

function AuditTrailTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  return (
    <TableWrap>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Date</Th><Th>Type</Th><Th>Category</Th><Th>Actor</Th><Th>Description</Th><Th right>Amount</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={6} /> : rows.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td muted>{r.createdAt?.slice(0,10)}</Td>
            <Td muted>{r.type === "WALLET_TRANSACTION" ? "Wallet" : "Audit"}</Td>
            <td className="px-4 py-3"><span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{r.category}</span></td>
            <Td>{r.actor}</Td>
            <Td muted>{r.description}</Td>
            <Td right>{r.amount != null ? formatCurrency(r.amount) : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Reports() {
  const { user } = useAuth();
  const isSales = user?.role === "SALES_EXECUTIVE";

  const [activeReport, setActiveReport] = useState<ReportType>("commission-by-month");
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", userId: "ALL", dealType: "ALL", status: "ALL" });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ from: "", to: "", userId: "ALL", dealType: "ALL", status: "ALL" });
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const { data: usersData } = useListUsers(isSales ? undefined : { role: "SALES_EXECUTIVE" } as any);
  const salesUsers: any[] = Array.isArray(usersData) ? usersData : (usersData as any)?.data ?? [];

  const { data: reportData, isLoading, isError } = useQuery({
    queryKey: ["report", activeReport, appliedFilters],
    queryFn: () => fetchReport(activeReport, appliedFilters),
  });

  const activeDef = REPORT_DEFS.find(d => d.type === activeReport)!;

  const showDealTypeFilter = ["commission-by-month", "commission-by-executive", "commission-by-deal-type", "pending-approvals"].includes(activeReport);
  const showStatusFilter = !["wallet-balances", "audit-trail"].includes(activeReport);
  const statusOptions = ["payout-requests", "payroll-export"].includes(activeReport) ? PAYOUT_STATUSES : DEAL_STATUSES;

  function applyFilters() {
    setAppliedFilters({ ...filters });
  }

  function resetFilters() {
    const empty: Filters = { from: "", to: "", userId: "ALL", dealType: "ALL", status: "ALL" };
    setFilters(empty);
    setAppliedFilters(empty);
  }

  async function handleExport(fmt: "excel" | "pdf") {
    setExporting(fmt);
    try {
      const qs = buildQueryString(activeReport, appliedFilters);
      const url = `/api/reports/${activeReport}/${fmt}${qs}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const ext = fmt === "excel" ? "xlsx" : "pdf";
      const filename = `Incentiq_${activeReport}_${new Date().toISOString().slice(0,10)}.${ext}`;
      const objUrl = URL.createObjectURL(blob);
      downloadFile(objUrl, filename);
      URL.revokeObjectURL(objUrl);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  function renderTable() {
    if (isLoading) return <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
    if (isError) return <div className="p-12 text-center text-red-500"><AlertCircle className="h-8 w-8 mx-auto mb-2" />Failed to load report data</div>;
    switch (activeReport) {
      case "commission-by-month":     return <CommissionByMonthTable data={reportData} />;
      case "commission-by-executive": return <CommissionByExecutiveTable data={reportData} />;
      case "commission-by-deal-type": return <CommissionByDealTypeTable data={reportData} />;
      case "pending-approvals":       return <PendingApprovalsTable data={reportData} />;
      case "payout-requests":         return <PayoutRequestTable data={reportData} />;
      case "payroll-export":          return <PayrollExportTable data={reportData} />;
      case "wallet-balances":         return <WalletBalanceTable data={reportData} />;
      case "audit-trail":             return <AuditTrailTable data={reportData} />;
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">Commission analytics and operational reporting</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={!!exporting || isLoading}
            onClick={() => handleExport("excel")}
          >
            {exporting === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Export Excel
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!!exporting || isLoading}
            onClick={() => handleExport("pdf")}
          >
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Report selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {REPORT_DEFS.map((def) => {
          const active = def.type === activeReport;
          return (
            <button
              key={def.type}
              onClick={() => { setActiveReport(def.type); setAppliedFilters({ ...filters }); }}
              className={`p-4 rounded-xl border text-left transition-all duration-150 ${
                active
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <def.icon className={`h-5 w-5 mb-2 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <div className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{def.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{def.description}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Date range */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">From</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters(f => ({ ...f, from: e.target.value }))}
                className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">To</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters(f => ({ ...f, to: e.target.value }))}
                className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* User filter */}
            {!isSales && salesUsers.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Sales Executive</label>
                <select
                  value={filters.userId}
                  onChange={(e) => setFilters(f => ({ ...f, userId: e.target.value }))}
                  className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="ALL">All Executives</option>
                  {salesUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Deal type filter */}
            {showDealTypeFilter && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Deal Type</label>
                <select
                  value={filters.dealType}
                  onChange={(e) => setFilters(f => ({ ...f, dealType: e.target.value }))}
                  className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {DEAL_TYPES.map((t) => <option key={t} value={t}>{t === "ALL" ? "All Types" : t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            )}

            {/* Status filter */}
            {showStatusFilter && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {statusOptions.map((s) => <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            )}

            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={resetFilters}>Reset</Button>
              <Button size="sm" onClick={applyFilters}>Apply Filters</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>{activeDef.label}</CardTitle>
            <CardDescription>{activeDef.description}</CardDescription>
          </div>
          {!isLoading && !isError && reportData && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
              {(() => {
                const d = reportData as any;
                const count = d.rows?.length ?? d.total ?? 0;
                return `${count} record${count !== 1 ? "s" : ""}`;
              })()}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {renderTable()}
        </CardContent>
      </Card>
    </div>
  );
}

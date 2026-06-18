import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListUsers } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import {
  TrendingDown, FileSpreadsheet, Loader2, AlertCircle, Filter, Download,
  Users, BarChart2, AlertTriangle, ShieldOff, MessageSquareWarning, ReceiptText,
  Activity, ChevronRight, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CbReportType =
  | "clawback-summary"
  | "clawback-outstanding"
  | "clawback-transactions"
  | "clawback-by-executive"
  | "clawback-by-industry"
  | "clawback-by-reason"
  | "clawback-waived"
  | "clawback-disputed";

interface Filters {
  from:           string;
  to:             string;
  userId:         string;
  status:         string;
  recoveryStatus: string;
  reason:         string;
}

const CLAWBACK_STATUSES = [
  "ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "EXECUTED",
  "CANCELLED", "WAIVED", "DISPUTED", "CHANGES_REQUESTED",
];

const RECOVERY_STATUSES = ["ALL", "PARTIALLY_RECOVERED", "FULLY_RECOVERED"];

const DEFAULT_FILTERS: Filters = { from: "", to: "", userId: "ALL", status: "ALL", recoveryStatus: "ALL", reason: "" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildQS(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.from)                              p.set("from",           f.from);
  if (f.to)                                p.set("to",             f.to);
  if (f.userId && f.userId !== "ALL")      p.set("userId",         f.userId);
  if (f.status && f.status !== "ALL")      p.set("status",         f.status);
  if (f.recoveryStatus && f.recoveryStatus !== "ALL") p.set("recoveryStatus", f.recoveryStatus);
  if (f.reason && f.reason.trim())         p.set("reason",         f.reason.trim());
  Object.entries(extra).forEach(([k, v]) => v && p.set(k, v));
  return p.toString() ? `?${p}` : "";
}

async function fetchReport(type: CbReportType, filters: Filters) {
  const res = await fetch(`/api/reports/${type}${buildQS(filters)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function downloadExcel(type: CbReportType, filters: Filters) {
  const url = `/api/reports/${type}/excel${buildQS(filters)}`;
  const token = localStorage.getItem("incentiq_token");
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Incentiq_${type}_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT:            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  APPROVED:         "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  EXECUTED:         "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  CANCELLED:        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  WAIVED:           "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  DISPUTED:         "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  CHANGES_REQUESTED:"bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  PARTIALLY_RECOVERED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  FULLY_RECOVERED:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  PENDING:          "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function StatusChip({ status }: { status: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>{status.replace(/_/g," ")}</span>;
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 font-medium text-xs uppercase text-muted-foreground whitespace-nowrap ${right ? "text-right" : ""}`}>{children}</th>;
}
function Td({ children, right, bold, muted, red }: { children?: React.ReactNode; right?: boolean; bold?: boolean; muted?: boolean; red?: boolean }) {
  return <td className={`px-4 py-3 text-sm ${right ? "text-right" : ""} ${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""} ${red ? "text-red-600 dark:text-red-400 font-semibold" : ""}`}>{children}</td>;
}
function Tw({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm text-left">{children}</table></div>;
}
function EmptyRow({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="px-4 py-14 text-center text-muted-foreground"><AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" /><p>No data for the selected filters</p></td></tr>;
}
function TotRow({ children }: { children: React.ReactNode }) {
  return <tr className="bg-red-50/60 dark:bg-red-950/20 border-t-2 border-border font-semibold">{children}</tr>;
}

// ─── Report Tables ─────────────────────────────────────────────────────────────

function SummaryTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Status</Th><Th right>Count</Th><Th right>Clawback Amount</Th><Th right>Recovered</Th><Th right>Outstanding</Th><Th right>Recovery %</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={6} /> : rows.map((r) => (
          <tr key={r.status} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td><StatusChip status={r.status} /></Td>
            <Td right muted>{r.count}</Td>
            <Td right red>{formatCurrency(r.amount)}</Td>
            <Td right>{formatCurrency(r.recovered)}</Td>
            <Td right>{formatCurrency(r.outstanding)}</Td>
            <Td right muted>{r.amount > 0 ? `${Math.round((r.recovered / r.amount) * 100)}%` : "—"}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <TotRow>
            <Td bold>Total</Td><Td right bold>{t.count}</Td>
            <Td right bold>{formatCurrency(t.amount)}</Td>
            <Td right bold>{formatCurrency(t.recovered)}</Td>
            <Td right bold>{formatCurrency(t.outstanding)}</Td>
            <Td right muted>{t.amount > 0 ? `${Math.round((t.recovered / t.amount) * 100)}%` : "—"}</Td>
          </TotRow>
        )}
      </tbody>
    </Tw>
  );
}

function OutstandingTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Event</Th><Th>Executive</Th><Th>Reason</Th><Th>Type</Th><Th right>Clawback</Th><Th right>Recovered</Th><Th right>Outstanding</Th><Th>Recovery Status</Th><Th>Executed</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={9} /> : rows.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td bold>{r.eventTitle}</Td>
            <Td muted>{r.executiveName}</Td>
            <Td muted>{r.reasonCategory}</Td>
            <Td muted>{r.clawbackType}</Td>
            <Td right red>{formatCurrency(r.clawbackAmount)}</Td>
            <Td right>{formatCurrency(r.recoveredAmount)}</Td>
            <Td right red>{formatCurrency(r.outstandingAmount)}</Td>
            <Td><StatusChip status={r.recoveryStatus} /></Td>
            <Td muted>{r.executedAt ?? "—"}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <TotRow>
            <Td bold>Total</Td><Td /><Td /><Td />
            <Td right bold>{formatCurrency(t.clawbackAmount)}</Td>
            <Td right bold>{formatCurrency(t.recoveredAmount)}</Td>
            <Td right bold>{formatCurrency(t.outstandingAmount)}</Td>
            <Td /><Td />
          </TotRow>
        )}
      </tbody>
    </Tw>
  );
}

function TransactionsTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Date</Th><Th>Type</Th><Th>Executive</Th><Th>Description</Th><Th right>Amount</Th><Th>Reference</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={6} /> : rows.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td muted>{r.date}</Td>
            <Td><StatusChip status={r.transactionType} /></Td>
            <Td bold>{r.executiveName}</Td>
            <Td muted>{r.description}</Td>
            <Td right red>{formatCurrency(r.amount)}</Td>
            <Td muted><span className="font-mono text-xs">{r.referenceId.slice(0,12)}…</span></Td>
          </tr>
        ))}
      </tbody>
    </Tw>
  );
}

function ByExecutiveTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>#</Th><Th>Executive</Th><Th>Email</Th><Th right>Count</Th><Th right>Total Amount</Th><Th right>Recovered</Th><Th right>Outstanding</Th><Th right>Active</Th><Th right>Waived</Th><Th right>Disputed</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={10} /> : rows.map((r, i) => (
          <tr key={r.userId} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td muted>#{i+1}</Td>
            <Td bold>{r.name}</Td>
            <Td muted>{r.email}</Td>
            <Td right muted>{r.count}</Td>
            <Td right red>{formatCurrency(r.amount)}</Td>
            <Td right>{formatCurrency(r.recovered)}</Td>
            <Td right>{formatCurrency(r.outstanding)}</Td>
            <Td right muted>{r.active}</Td>
            <Td right muted>{r.waived}</Td>
            <Td right muted>{r.disputed}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <TotRow>
            <Td />
            <Td bold>Total</Td><Td muted>—</Td><Td right bold>{t.count}</Td>
            <Td right bold>{formatCurrency(t.amount)}</Td>
            <Td right bold>{formatCurrency(t.recovered)}</Td>
            <Td right bold>{formatCurrency(t.outstanding)}</Td>
            <Td /><Td /><Td />
          </TotRow>
        )}
      </tbody>
    </Tw>
  );
}

function ByIndustryTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Clawback Type</Th><Th right>Count</Th><Th right>Total Amount</Th><Th right>% Share</Th><Th right>Recovered</Th><Th right>Outstanding</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={6} /> : rows.map((r) => (
          <tr key={r.clawbackType} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td bold>{r.clawbackType}</Td>
            <Td right muted>{r.count}</Td>
            <Td right red>{formatCurrency(r.amount)}</Td>
            <Td right>
              <div className="flex items-center justify-end gap-2">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${r.percentage}%` }} />
                </div>
                <span className="text-muted-foreground text-xs">{r.percentage}%</span>
              </div>
            </Td>
            <Td right>{formatCurrency(r.recovered)}</Td>
            <Td right>{formatCurrency(r.outstanding)}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <TotRow>
            <Td bold>Total</Td><Td right bold>{t.count}</Td>
            <Td right bold>{formatCurrency(t.amount)}</Td>
            <Td right muted>100%</Td>
            <Td right bold>{formatCurrency(t.recovered)}</Td>
            <Td right bold>{formatCurrency(t.outstanding)}</Td>
          </TotRow>
        )}
      </tbody>
    </Tw>
  );
}

function ByReasonTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Reason Category</Th><Th right>Count</Th><Th right>Total Amount</Th><Th right>% Share</Th><Th right>Recovered</Th><Th right>Outstanding</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={6} /> : rows.map((r) => (
          <tr key={r.reasonCategory} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td bold>{r.reasonCategory}</Td>
            <Td right muted>{r.count}</Td>
            <Td right red>{formatCurrency(r.amount)}</Td>
            <Td right>
              <div className="flex items-center justify-end gap-2">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${r.percentage}%` }} />
                </div>
                <span className="text-muted-foreground text-xs">{r.percentage}%</span>
              </div>
            </Td>
            <Td right>{formatCurrency(r.recovered)}</Td>
            <Td right>{formatCurrency(r.outstanding)}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <TotRow>
            <Td bold>Total</Td><Td right bold>{t.count}</Td>
            <Td right bold>{formatCurrency(t.amount)}</Td>
            <Td right muted>100%</Td>
            <Td right bold>{formatCurrency(t.recovered)}</Td>
            <Td right bold>{formatCurrency(t.outstanding)}</Td>
          </TotRow>
        )}
      </tbody>
    </Tw>
  );
}

function WaivedTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Event</Th><Th>Executive</Th><Th>Reason Category</Th><Th>Type</Th><Th right>Amount Waived</Th><Th>Waive Reason</Th><Th>Date</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={7} /> : rows.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td bold>{r.eventTitle}</Td>
            <Td muted>{r.executiveName}</Td>
            <Td muted>{r.reasonCategory}</Td>
            <Td muted>{r.clawbackType}</Td>
            <Td right red>{formatCurrency(r.clawbackAmount)}</Td>
            <Td muted>{r.waiveReason || "—"}</Td>
            <Td muted>{r.createdAt}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <TotRow>
            <Td bold>Total ({t.count})</Td><Td /><Td /><Td />
            <Td right bold>{formatCurrency(t.totalWaived)}</Td>
            <Td /><Td />
          </TotRow>
        )}
      </tbody>
    </Tw>
  );
}

function DisputedTable({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  const t = data?.totals;
  return (
    <Tw>
      <thead className="bg-muted/50 border-b border-border">
        <tr><Th>Event</Th><Th>Executive</Th><Th>Reason Category</Th><Th>Type</Th><Th right>Amount</Th><Th>Dispute Note</Th><Th>Disputed On</Th><Th>Created</Th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={8} /> : rows.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
            <Td bold>{r.eventTitle}</Td>
            <Td muted>{r.executiveName}</Td>
            <Td muted>{r.reasonCategory}</Td>
            <Td muted>{r.clawbackType}</Td>
            <Td right red>{formatCurrency(r.clawbackAmount)}</Td>
            <Td muted>{r.disputeNote || "—"}</Td>
            <Td muted>{r.disputedAt || "—"}</Td>
            <Td muted>{r.createdAt}</Td>
          </tr>
        ))}
        {t && rows.length > 0 && (
          <TotRow>
            <Td bold>Total ({t.count})</Td><Td /><Td /><Td />
            <Td right bold>{formatCurrency(t.totalDisputed)}</Td>
            <Td /><Td /><Td />
          </TotRow>
        )}
      </tbody>
    </Tw>
  );
}

// ─── Report table dispatcher ──────────────────────────────────────────────────

function ReportTable({ type, data }: { type: CbReportType; data: any }) {
  if (!data) return null;
  switch (type) {
    case "clawback-summary":      return <SummaryTable data={data} />;
    case "clawback-outstanding":  return <OutstandingTable data={data} />;
    case "clawback-transactions": return <TransactionsTable data={data} />;
    case "clawback-by-executive": return <ByExecutiveTable data={data} />;
    case "clawback-by-industry":  return <ByIndustryTable data={data} />;
    case "clawback-by-reason":    return <ByReasonTable data={data} />;
    case "clawback-waived":       return <WaivedTable data={data} />;
    case "clawback-disputed":     return <DisputedTable data={data} />;
    default:                      return null;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsClawbacks() {
  const { user } = useAuth();
  const { clawbackTerm, clawbackTermPlural } = useIndustryConfig();
  const role = user?.role ?? "";
  const canManage = ["ADMIN","SUPER_ADMIN","MANAGER","FINANCE","EXECUTIVE"].includes(role);

  const [activeReport, setActiveReport] = useState<CbReportType>("clawback-summary");
  const [filters, setFilters]           = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied]           = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters]   = useState(false);
  const [downloading, setDownloading]   = useState(false);

  const { data: usersData } = useListUsers();
  const executives = (usersData as any)?.users?.filter((u: any) => u.role === "SALES_EXECUTIVE") ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["cb-report", activeReport, applied],
    queryFn:  () => fetchReport(activeReport, applied),
    staleTime: 30_000,
  });

  const REPORT_DEFS: { type: CbReportType; label: string; icon: React.ElementType; description: string }[] = [
    { type: "clawback-summary",      label: `${clawbackTerm} Summary`,         icon: BarChart2,             description: `Overview of all ${clawbackTermPlural.toLowerCase()} by status` },
    { type: "clawback-outstanding",  label: "Outstanding Recovery",             icon: AlertTriangle,         description: "Approved/executed with amounts still owed" },
    { type: "clawback-transactions", label: "Recovery Transactions",            icon: Activity,              description: "Wallet deductions linked to recoveries" },
    { type: "clawback-by-executive", label: `${clawbackTerm} by Executive`,     icon: Users,                 description: `${clawbackTermPlural} grouped per sales executive` },
    { type: "clawback-by-industry",  label: `${clawbackTerm} by Type`,          icon: ReceiptText,           description: "Distribution by clawback type within your industry" },
    { type: "clawback-by-reason",    label: "By Reason Category",               icon: MessageSquareWarning,  description: "Breakdown of root-cause reason categories" },
    { type: "clawback-waived",       label: "Waived",                           icon: ShieldOff,             description: `${clawbackTermPlural} that were waived with audit trail` },
    { type: "clawback-disputed",     label: "Disputed",                         icon: AlertCircle,           description: `${clawbackTermPlural} currently frozen in dispute` },
  ];

  function applyFilters() {
    setApplied({ ...filters });
    setShowFilters(false);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  }

  const hasFilters = applied.from || applied.to || applied.userId !== "ALL" || applied.status !== "ALL" || applied.recoveryStatus !== "ALL" || applied.reason;

  async function handleExcel() {
    setDownloading(true);
    try { await downloadExcel(activeReport, applied); }
    finally { setDownloading(false); }
  }

  const activeLabel = REPORT_DEFS.find(r => r.type === activeReport)?.label ?? activeReport;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-red-500" />
            {clawbackTermPlural} Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyse {clawbackTermPlural.toLowerCase()}, outstanding recoveries, and dispute trends across your team.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(v => !v)} className="gap-1.5">
            <Filter className="h-4 w-4" />
            Filters
            {hasFilters && <Badge variant="destructive" className="h-4 w-4 p-0 text-[10px] flex items-center justify-center">!</Badge>}
          </Button>
          <Button size="sm" onClick={handleExcel} disabled={downloading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card className="border-amber-200 dark:border-amber-800 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Filter className="h-4 w-4" />Filters</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="h-8 text-sm" />
              </div>
              {canManage && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Sales Executive</Label>
                  <select value={filters.userId} onChange={e => setFilters(f => ({ ...f, userId: e.target.value }))} className="h-8 w-full text-sm rounded-md border border-input bg-background px-2">
                    <option value="ALL">All Executives</option>
                    {executives.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="h-8 w-full text-sm rounded-md border border-input bg-background px-2">
                  {CLAWBACK_STATUSES.map(s => <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace(/_/g," ")}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Recovery Status</Label>
                <select value={filters.recoveryStatus} onChange={e => setFilters(f => ({ ...f, recoveryStatus: e.target.value }))} className="h-8 w-full text-sm rounded-md border border-input bg-background px-2">
                  {RECOVERY_STATUSES.map(s => <option key={s} value={s}>{s === "ALL" ? "All Recovery" : s.replace(/_/g," ")}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason Category</Label>
                <Input value={filters.reason} onChange={e => setFilters(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Contract breach" className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button size="sm" onClick={applyFilters} className="bg-red-600 hover:bg-red-700 text-white">Apply Filters</Button>
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Filters Banner */}
      {hasFilters && !showFilters && (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <Filter className="h-3.5 w-3.5 shrink-0" />
          <span>Filters active — results may be limited</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-amber-700 dark:text-amber-300" onClick={clearFilters}>Clear all</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        {/* Report Selector */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground px-1 mb-2">Report Type</p>
          {REPORT_DEFS.map(({ type, label, icon: Icon, description }) => (
            <button
              key={type}
              onClick={() => setActiveReport(type)}
              className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                activeReport === type
                  ? "bg-red-600 text-white shadow-sm"
                  : "hover:bg-muted/60 text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${activeReport === type ? "text-white" : "text-red-500 group-hover:text-red-400"}`} />
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-tight ${activeReport === type ? "text-white" : ""}`}>{label}</p>
                <p className={`text-xs mt-0.5 leading-tight ${activeReport === type ? "text-red-100" : "text-muted-foreground"}`}>{description}</p>
              </div>
              {activeReport === type && <ChevronRight className="h-4 w-4 ml-auto shrink-0 text-white/70 mt-0.5" />}
            </button>
          ))}
        </div>

        {/* Report Panel */}
        <Card className="shadow-sm min-w-0">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  {activeLabel}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {REPORT_DEFS.find(r => r.type === activeReport)?.description}
                  {applied.from && ` · From ${applied.from}`}
                  {applied.to   && ` to ${applied.to}`}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExcel} disabled={downloading} className="gap-1.5 shrink-0">
                {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Excel</span>
              </Button>
            </div>

            {/* Stat chips — only for list-type reports */}
            {data?.totals && (
              <div className="flex flex-wrap gap-2 mt-3">
                {data.totals.count !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs bg-muted/50 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Records</span>
                    <span className="font-semibold">{data.totals.count ?? data.totals.total}</span>
                  </div>
                )}
                {data.totals.amount !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs bg-red-50 dark:bg-red-950/20 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(data.totals.amount)}</span>
                  </div>
                )}
                {data.totals.recovered !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-950/20 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Recovered</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(data.totals.recovered)}</span>
                  </div>
                )}
                {data.totals.outstanding !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/20 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(data.totals.outstanding)}</span>
                  </div>
                )}
                {data.totals.totalWaived !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-950/20 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Total Waived</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(data.totals.totalWaived)}</span>
                  </div>
                )}
                {data.totals.totalDisputed !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-950/20 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Total Disputed</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(data.totals.totalDisputed)}</span>
                  </div>
                )}
                {data.totals.totalAmount !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs bg-muted/50 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Total Deducted</span>
                    <span className="font-semibold">{formatCurrency(data.totals.totalAmount)}</span>
                  </div>
                )}
                {data.industry && (
                  <div className="flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-1">
                    <span className="text-muted-foreground">Industry</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{data.industry.replace(/_/g," ")}</span>
                  </div>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : error ? (
              <div className="px-6 py-14 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                <p className="text-sm font-medium">Failed to load report</p>
                <p className="text-xs mt-1">{(error as Error).message}</p>
              </div>
            ) : (
              <ReportTable type={activeReport} data={data} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

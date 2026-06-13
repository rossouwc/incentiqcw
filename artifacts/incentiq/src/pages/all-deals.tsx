import { useState, useMemo } from "react";
import { useListDeals } from "@workspace/api-client-react";
import type { Deal } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Search, Briefcase, TrendingUp, DollarSign, Clock, Eye, CheckCircle2,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT:              { label: "Draft",              cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  SUBMITTED:          { label: "Submitted",          cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  PENDING_APPROVAL:   { label: "Pending Approval",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  MANAGER_APPROVED:   { label: "Manager Approved",   cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  FINANCE_APPROVED:   { label: "Finance Approved",   cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  EXECUTIVE_APPROVED: { label: "Approved",           cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  REJECTED:           { label: "Rejected",           cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  PAID:               { label: "Paid",               cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

const TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  NET_NEW:    { label: "Net New",    cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  RENEWAL:    { label: "Renewal",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  UPSELL:     { label: "Upsell",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  CROSS_SELL: { label: "Cross-Sell", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type.replace(/_/g, " "), cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

type Tab = "all" | "pending";

export default function AllDeals() {
  const [tab, setTab]               = useState<Tab>("all");
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewDeal, setViewDeal]     = useState<Deal | null>(null);

  const { data: dealsData, isLoading } = useListDeals({ limit: 500 });
  const deals = dealsData?.data ?? [];

  const pending = useMemo(
    () =>
      deals.filter((d) =>
        ["PENDING_APPROVAL", "MANAGER_APPROVED", "FINANCE_APPROVED"].includes(d.status)
      ),
    [deals]
  );

  const source = tab === "pending" ? pending : deals;

  const filtered = useMemo(() => {
    let list = source;
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (typeFilter   !== "all") list = list.filter((d) => d.dealType === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.dealName.toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q) ||
          d.salesExecutiveName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [source, search, statusFilter, typeFilter]);

  const totalGp      = deals.reduce((s, d) => s + d.grossProfit, 0);
  const totalComm    = deals.reduce((s, d) => s + d.commission, 0);
  const totalRevenue = deals.reduce((s, d) => s + d.revenue,    0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">All Deals</h1>
        <p className="text-muted-foreground">Company-wide deal overview across all sales reps</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Deals",      value: isLoading ? "—" : String(deals.length),           icon: Briefcase,   accent: "border-l-primary" },
          { label: "Pending Approval", value: isLoading ? "—" : String(pending.length),         icon: Clock,       accent: "border-l-amber-400" },
          { label: "Total GP",         value: isLoading ? "—" : formatCurrency(totalGp),        icon: TrendingUp,  accent: "border-l-blue-400" },
          { label: "Total Commission", value: isLoading ? "—" : formatCurrency(totalComm),      icon: DollarSign,  accent: "border-l-emerald-500" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["all", "pending"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatusFilter("all"); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all"
              ? `All Deals (${deals.length})`
              : `Pending Approval (${pending.length})`}
          </button>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search deals, customers, or reps..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {tab === "all" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                  <SelectItem value="MANAGER_APPROVED">Manager Approved</SelectItem>
                  <SelectItem value="FINANCE_APPROVED">Finance Approved</SelectItem>
                  <SelectItem value="EXECUTIVE_APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="NET_NEW">Net New</SelectItem>
                <SelectItem value="RENEWAL">Renewal</SelectItem>
                <SelectItem value="UPSELL">Upsell</SelectItem>
                <SelectItem value="CROSS_SELL">Cross-Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">Deal</th>
                    <th className="px-6 py-3 font-medium">Sales Rep</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium text-right">Revenue</th>
                    <th className="px-6 py-3 font-medium text-right">GP</th>
                    <th className="px-6 py-3 font-medium text-right">Commission</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Created</th>
                    <th className="px-6 py-3 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        No deals found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{d.dealName}</div>
                          <div className="text-xs text-muted-foreground">{d.customerName}</div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {d.salesExecutiveName || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <TypeBadge type={d.dealType} />
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {formatCurrency(d.revenue)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {formatCurrency(d.grossProfit)}
                          <div className="text-xs text-muted-foreground">
                            {d.grossProfitPercentage.toFixed(1)}%
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-primary">
                          {formatCurrency(d.commission)}
                          <div className="text-xs font-normal text-muted-foreground">
                            {d.commissionPercentage}%
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">
                          {formatDate(d.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setViewDeal(d)}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {viewDeal && (
        <Dialog open={!!viewDeal} onOpenChange={(open) => !open && setViewDeal(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{viewDeal.dealName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: "Customer",     value: viewDeal.customerName },
                  { label: "Sales Rep",    value: viewDeal.salesExecutiveName || "—" },
                  { label: "Type",         value: <TypeBadge type={viewDeal.dealType} /> },
                  { label: "Status",       value: <StatusBadge status={viewDeal.status} /> },
                  { label: "Revenue",      value: formatCurrency(viewDeal.revenue) },
                  { label: "Cost",         value: formatCurrency(viewDeal.cost) },
                  { label: "Gross Profit", value: formatCurrency(viewDeal.grossProfit) },
                  { label: "GP%",          value: `${viewDeal.grossProfitPercentage.toFixed(1)}%` },
                  { label: "Commission %", value: `${viewDeal.commissionPercentage}%` },
                  { label: "Commission",   value: <span className="font-bold text-primary">{formatCurrency(viewDeal.commission)}</span> },
                  { label: "Submitted",    value: viewDeal.submittedAt ? formatDate(viewDeal.submittedAt) : "Not submitted" },
                  { label: "Created",      value: formatDate(viewDeal.createdAt) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <div className="font-medium mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
              {(viewDeal.contractStartDate || viewDeal.contractEndDate) && (
                <div className="pt-2 border-t border-border">
                  <p className="text-muted-foreground text-xs">Contract Period</p>
                  <p className="font-medium mt-0.5">
                    {viewDeal.contractStartDate ? formatDate(viewDeal.contractStartDate) : "—"}
                    {" → "}
                    {viewDeal.contractEndDate ? formatDate(viewDeal.contractEndDate) : "Open-ended"}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setViewDeal(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

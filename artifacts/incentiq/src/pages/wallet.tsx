import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import {
  useGetWallet,
  useListTransactions,
  useListWalletDeals,
  useListTeamWallets,
  useGetUserWallet,
  useListWalletUserTransactions,
  useListUsers,
  useCreatePayout,
  useGetTaxProfile,
  useEstimatePAYE,
  getGetWalletQueryKey,
  type Wallet,
  type Transaction,
  type WalletDeal,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Wallet as WalletIcon,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  DollarSign,
  ArrowRightLeft,
  Pause,
  Sliders,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Users,
  RefreshCw,
  PlusCircle,
  Receipt,
  Briefcase,
  CalendarDays,
  MessageSquare,
  Info,
  AlertCircle,
  ShieldAlert,
  Scale,
  RotateCcw,
  AlertTriangle,
  FileText,
  Loader2,
} from "lucide-react";

function getAuthHeaders(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

// ─── Transaction type display helpers ─────────────────────────────────────────

interface TxMeta {
  label: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  isCredit: boolean;
}

const TX_META: Record<string, TxMeta> = {
  // Commission events
  PENDING_COMMISSION_ADDED:   { label: "Pending Commission Added",      icon: PlusCircle,     colorClass: "text-amber-600",  bgClass: "bg-amber-50",    isCredit: true  },
  PENDING_COMMISSION_REMOVED: { label: "Pending Commission Removed",    icon: XCircle,        colorClass: "text-red-600",    bgClass: "bg-red-50",      isCredit: false },
  COMMISSION_APPROVED:        { label: "Commission Approved",           icon: CheckCircle2,   colorClass: "text-green-600",  bgClass: "bg-green-50",    isCredit: true  },
  TRIGGER_RELEASED:           { label: "Commission Released",           icon: CheckCircle2,   colorClass: "text-emerald-600",bgClass: "bg-emerald-50",  isCredit: true  },
  WALLET_CREDITED:            { label: "Wallet Credited",               icon: ArrowDownLeft,  colorClass: "text-green-600",  bgClass: "bg-green-50",    isCredit: true  },
  // Payouts
  PAYOUT_REQUESTED:           { label: "Payout Requested",              icon: Receipt,        colorClass: "text-blue-600",   bgClass: "bg-blue-50",     isCredit: false },
  PAYOUT_APPROVED:            { label: "Payout Approved",               icon: CheckCircle2,   colorClass: "text-cyan-600",   bgClass: "bg-cyan-50",     isCredit: false },
  PAYOUT_PAID:                { label: "Payout Paid",                   icon: ArrowUpRight,   colorClass: "text-indigo-600", bgClass: "bg-indigo-50",   isCredit: false },
  PAYOUT_DEFERRED:            { label: "Payout Deferred",               icon: Pause,          colorClass: "text-orange-600", bgClass: "bg-orange-50",   isCredit: false },
  PAYOUT:                     { label: "Payout",                        icon: ArrowUpRight,   colorClass: "text-indigo-600", bgClass: "bg-indigo-50",   isCredit: false },
  PAYROLL:                    { label: "Payroll Payout",                icon: DollarSign,     colorClass: "text-emerald-600",bgClass: "bg-emerald-50",  isCredit: false },
  PAYROLL_APPROVED:           { label: "Payroll Approved",              icon: CheckCircle2,   colorClass: "text-emerald-600",bgClass: "bg-emerald-50",  isCredit: false },
  // Clawback & recovery
  CLAWBACK_PENDING:           { label: "Potential Clawback",            icon: AlertTriangle,  colorClass: "text-amber-600",  bgClass: "bg-amber-50",    isCredit: false },
  CLAWBACK_DEDUCTION:         { label: "Wallet Recovery Deduction",     icon: ShieldAlert,    colorClass: "text-red-600",    bgClass: "bg-red-50",      isCredit: false },
  FUTURE_OFFSET_APPLIED:      { label: "Future Commission Offset",      icon: RotateCcw,      colorClass: "text-red-600",    bgClass: "bg-red-50",      isCredit: false },
  CLAWBACK_CREATED:           { label: "Clawback Created",              icon: AlertCircle,    colorClass: "text-red-600",    bgClass: "bg-red-50",      isCredit: false },
  CLAWBACK_APPROVED:          { label: "Clawback Approved",             icon: CheckCircle2,   colorClass: "text-amber-600",  bgClass: "bg-amber-50",    isCredit: false },
  CLAWBACK_WAIVED:            { label: "Clawback Waived",               icon: Scale,          colorClass: "text-purple-600", bgClass: "bg-purple-50",   isCredit: false },
  CLAWBACK_DISPUTED:          { label: "Clawback Disputed",             icon: MessageSquare,  colorClass: "text-orange-600", bgClass: "bg-orange-50",   isCredit: false },
  PAYROLL_DEDUCTION:          { label: "Payroll Recovery",              icon: DollarSign,     colorClass: "text-red-600",    bgClass: "bg-red-50",      isCredit: false },
  // Splits / misc
  COMMISSION_SPLIT_DEDUCTION: { label: "Commission Split Deduction",    icon: ArrowUpRight,   colorClass: "text-orange-600", bgClass: "bg-orange-50",   isCredit: false },
  COMMISSION_SPLIT_CREDIT:    { label: "Commission Split Credit",       icon: ArrowDownLeft,  colorClass: "text-teal-600",   bgClass: "bg-teal-50",     isCredit: true  },
  MANUAL_ADJUSTMENT:          { label: "Manual Adjustment",             icon: Sliders,        colorClass: "text-gray-600",   bgClass: "bg-gray-100",    isCredit: true  },
  CREDIT:                     { label: "Credit",                        icon: ArrowDownLeft,  colorClass: "text-green-600",  bgClass: "bg-green-50",    isCredit: true  },
  DEBIT:                      { label: "Debit",                         icon: ArrowUpRight,   colorClass: "text-red-600",    bgClass: "bg-red-50",      isCredit: false },
  ADJUSTMENT:                 { label: "Adjustment",                    icon: ArrowRightLeft, colorClass: "text-gray-600",   bgClass: "bg-gray-100",    isCredit: true  },
};

function getTxMeta(type: string): TxMeta {
  return TX_META[type] ?? { label: type, icon: ArrowRightLeft, colorClass: "text-gray-600", bgClass: "bg-gray-100", isCredit: true };
}

const TAX_RATE = 0.25;
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// ─── Balance Cards ─────────────────────────────────────────────────────────────

function BalanceCards({
  wallet,
  loading,
  recoveryBalance = 0,
  potentialClawbacks = 0,
  recoveryLoading = false,
}: {
  wallet: Wallet | undefined;
  loading: boolean;
  recoveryBalance?: number;
  potentialClawbacks?: number;
  recoveryLoading?: boolean;
}) {
  const { clawbackTerm, clawbackTermPlural } = useIndustryConfig();
  const cards = [
    {
      label: "Available Balance",
      value: wallet?.availableBalance ?? 0,
      description: "Approved — ready to request payout",
      colorClass: "border-l-green-500",
      valueClass: "text-green-600",
      icon: WalletIcon,
      extraLoading: false,
    },
    {
      label: "Pending Commission",
      value: wallet?.pendingBalance ?? 0,
      description: "Awaiting approval in the workflow",
      colorClass: "border-l-amber-400",
      valueClass: "text-amber-600",
      icon: Clock,
      extraLoading: false,
    },
    {
      label: "Deferred Commission",
      value: wallet?.deferredBalance ?? 0,
      description: "Held — deferred to a future month",
      colorClass: "border-l-orange-400",
      valueClass: "text-orange-600",
      icon: Pause,
      extraLoading: false,
    },
    {
      label: "Paid Commission",
      value: wallet?.paidOutBalance ?? 0,
      description: "All-time lifetime payouts",
      colorClass: "border-l-purple-400",
      valueClass: "text-foreground",
      icon: TrendingUp,
      extraLoading: false,
    },
    {
      label: "Recovery Balance",
      value: recoveryBalance,
      description: "Outstanding clawback still owed",
      colorClass: "border-l-red-500",
      valueClass: recoveryBalance > 0 ? "text-red-600" : "text-foreground",
      icon: ShieldAlert,
      extraLoading: recoveryLoading,
    },
    {
      label: `Potential ${clawbackTermPlural}`,
      value: potentialClawbacks,
      description: "Pending approval — may affect wallet",
      colorClass: "border-l-amber-600",
      valueClass: potentialClawbacks > 0 ? "text-amber-600" : "text-foreground",
      icon: AlertTriangle,
      extraLoading: recoveryLoading,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className={`border-l-4 ${c.colorClass} shadow-sm`}>
            <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">{c.label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loading || c.extraLoading ? (
                <Skeleton className="h-8 w-24 mt-1" />
              ) : (
                <>
                  <div className={`text-2xl font-bold mt-1 ${c.valueClass}`}>
                    {formatCurrency(c.value)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Transaction Table ─────────────────────────────────────────────────────────

function TransactionTable({ transactions, loading }: { transactions: Transaction[]; loading: boolean }) {
  const [filter, setFilter] = useState("ALL");

  const filtered = filter === "ALL" ? transactions : transactions.filter(t => t.transactionType === filter);

  const typeOptions = [
    { value: "ALL",                        label: "All Types" },
    // Commission
    { value: "PENDING_COMMISSION_ADDED",   label: "Pending Commission Added" },
    { value: "PENDING_COMMISSION_REMOVED", label: "Pending Commission Removed" },
    { value: "COMMISSION_APPROVED",        label: "Commission Approved" },
    { value: "TRIGGER_RELEASED",           label: "Commission Released" },
    { value: "WALLET_CREDITED",            label: "Wallet Credited" },
    // Payouts
    { value: "PAYOUT_REQUESTED",           label: "Payout Requested" },
    { value: "PAYOUT_APPROVED",            label: "Payout Approved" },
    { value: "PAYOUT_PAID",               label: "Payout Paid" },
    { value: "PAYOUT_DEFERRED",            label: "Payout Deferred" },
    { value: "PAYROLL",                    label: "Payroll Payout" },
    { value: "PAYROLL_APPROVED",           label: "Payroll Approved" },
    // Clawback & recovery
    { value: "CLAWBACK_PENDING",           label: "Potential Clawback" },
    { value: "CLAWBACK_DEDUCTION",         label: "Wallet Recovery Deduction" },
    { value: "FUTURE_OFFSET_APPLIED",      label: "Future Commission Offset" },
    { value: "CLAWBACK_CREATED",           label: "Clawback Created" },
    { value: "CLAWBACK_APPROVED",          label: "Clawback Approved" },
    { value: "CLAWBACK_WAIVED",            label: "Clawback Waived" },
    { value: "CLAWBACK_DISPUTED",          label: "Clawback Disputed" },
    { value: "PAYROLL_DEDUCTION",          label: "Payroll Recovery" },
    // Splits & misc
    { value: "COMMISSION_SPLIT_DEDUCTION", label: "Split Deduction" },
    { value: "COMMISSION_SPLIT_CREDIT",    label: "Split Credit" },
    { value: "MANUAL_ADJUSTMENT",          label: "Manual Adjustment" },
    { value: "CREDIT",                     label: "Credit" },
    { value: "DEBIT",                      label: "Debit" },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>All wallet movements and commission events</CardDescription>
        </div>
        <div className="w-full sm:w-52">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center text-muted-foreground">
            <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const meta = getTxMeta(tx.transactionType);
                  const Icon = meta.icon;
                  return (
                    <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${meta.bgClass} ${meta.colorClass} shrink-0`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span className="font-medium text-foreground whitespace-nowrap">{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground max-w-xs">
                        <span className="truncate block">{tx.description}</span>
                        {tx.referenceType && (
                          <span className="text-xs text-muted-foreground/60">{tx.referenceType}</span>
                        )}
                      </td>
                      <td className={`px-6 py-3 text-right font-semibold tabular-nums ${meta.isCredit ? "text-green-600" : "text-foreground"}`}>
                        {meta.isCredit ? "+" : "-"}{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                        {formatDateTime(tx.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Linked Deals Table ────────────────────────────────────────────────────────

function DealsTable({ deals, loading }: { deals: WalletDeal[]; loading: boolean }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Linked Deals</CardTitle>
        <CardDescription>All commission deals associated with this wallet</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : deals.length === 0 ? (
          <div className="px-6 py-14 text-center text-muted-foreground">
            <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No deals found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium">Deal</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Commission</th>
                  <th className="px-6 py-3 font-medium text-right">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-medium text-foreground">{d.dealName}</div>
                      <div className="text-xs text-muted-foreground">{d.customerName}</div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant="outline" className="text-xs">{d.dealType ?? "—"}</Badge>
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-6 py-3 text-right font-semibold text-primary tabular-nums">
                      {formatCurrency(d.calculatedCommission)}
                    </td>
                    <td className="px-6 py-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                      {d.submittedAt ? formatDate(d.submittedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recovery Section ──────────────────────────────────────────────────────────

const CLAWBACK_STATUS_BADGE: Record<string, string> = {
  DRAFT:             "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  PENDING_APPROVAL:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED:          "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  CANCELLED:         "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  WAIVED:            "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  DISPUTED:          "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  EXECUTED:          "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  CHANGES_REQUESTED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};

const RECOVERY_STATUS_BADGE: Record<string, string> = {
  PENDING:              "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  RECOVERY_IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  PARTIALLY_RECOVERED:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  FULLY_RECOVERED:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function RecoverySection({ clawbacks, loading }: { clawbacks: any[]; loading: boolean }) {
  const { clawbackTerm, clawbackTermPlural } = useIndustryConfig();
  const active = clawbacks.filter(c =>
    !["DRAFT", "CANCELLED", "WAIVED", "FULLY_RECOVERED"].includes(c.status) ||
    c.outstandingAmount > 0
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            {clawbackTermPlural}
          </CardTitle>
          <CardDescription>{clawbackTermPlural} affecting your commission wallet</CardDescription>
        </div>
        {active.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {active.length} active {active.length !== 1 ? clawbackTermPlural.toLowerCase() : clawbackTerm.toLowerCase()} require attention
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : clawbacks.length === 0 ? (
          <div className="px-6 py-14 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No {clawbackTermPlural.toLowerCase()} on record — your commission is clean.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Ref</th>
                  <th className="px-4 py-3 font-medium">Original Event</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium text-right">Original Commission</th>
                  <th className="px-4 py-3 font-medium text-right">Earned Commission</th>
                  <th className="px-4 py-3 font-medium text-right">Recoverable</th>
                  <th className="px-4 py-3 font-medium text-right">Recovered</th>
                  <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {clawbacks.map((cb) => {
                  const earnedCommission = cb.originalCommissionAmount - cb.clawbackAmount;
                  const statusCls = CLAWBACK_STATUS_BADGE[cb.status] ?? "bg-muted text-muted-foreground";
                  const recoveryCls = RECOVERY_STATUS_BADGE[cb.recoveryStatus] ?? "bg-muted text-muted-foreground";
                  const recoveryLabel: Record<string, string> = {
                    PENDING: "Pending", RECOVERY_IN_PROGRESS: "In Progress",
                    PARTIALLY_RECOVERED: "Partial", FULLY_RECOVERED: "Recovered",
                  };
                  return (
                    <tr key={cb.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">{cb.id.slice(0, 8)}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="font-medium truncate text-foreground">{cb.eventTitle}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[140px]">
                        <p className="text-muted-foreground truncate" title={cb.reason}>{cb.reason}</p>
                        <p className="text-[10px] text-muted-foreground/60">{cb.reasonCategory?.replace(/_/g, " ")}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(cb.originalCommissionAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(earnedCommission)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600 dark:text-red-400">{formatCurrency(cb.clawbackAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatCurrency(cb.recoveredAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={cb.outstandingAmount > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-emerald-600"}>
                          {formatCurrency(cb.outstandingAmount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCls}`}>
                            {cb.status?.replace(/_/g, " ")}
                          </span>
                          {cb.status === "EXECUTED" && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${recoveryCls}`}>
                              {recoveryLabel[cb.recoveryStatus] ?? cb.recoveryStatus}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(cb.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Payout Request Dialog ─────────────────────────────────────────────────────

type PayoutType = "FULL" | "PARTIAL" | "DEFER";

function getUpcomingMonths(count: number, startFromNext = false): { label: string; value: string }[] {
  const months: { label: string; value: string }[] = [];
  const now = new Date();
  const start = startFromNext ? 1 : 0;
  for (let i = start; i < start + count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      label: d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }),
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return months;
}

function PayoutDialog({ open, onClose, availableBalance, onSuccess }: {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createPayout = useCreatePayout();
  const { data: taxProfile } = useGetTaxProfile();
  const estimatePAYE = useEstimatePAYE();

  // Fetch payroll config so we can respect the commission cut-off day.
  const { data: payrollCfg } = useQuery<{ payrollDay: number; commissionCutoffDay: number }>({
    queryKey: ["payroll-config"],
    queryFn: () => fetch("/api/tenant/payroll-config", { headers: getAuthHeaders() }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // If today is past the cut-off day, the current month's payroll run is already
  // locked — the earliest selectable payout month is next month.
  const pastCutoff = (() => {
    const cutoff = payrollCfg?.commissionCutoffDay ?? 0;
    return cutoff > 0 && new Date().getDate() > cutoff;
  })();

  const [payoutType, setPayoutType] = useState<PayoutType>("FULL");
  const [amount, setAmount] = useState("");
  const [payoutMonth, setPayoutMonth] = useState(() => getUpcomingMonths(1)[0].value);
  const [deferToMonth, setDeferToMonth] = useState(() => getUpcomingMonths(1, true)[0].value);
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [payeEstimate, setPayeEstimate] = useState<{
    netTaxWithCommission: number;
    netTaxBase: number;
    effectiveRateOnCommission: number;
  } | null>(null);

  // Once we know whether we're past cut-off, sync the default payoutMonth.
  useEffect(() => {
    if (payrollCfg) {
      setPayoutMonth(getUpcomingMonths(1, pastCutoff)[0].value);
    }
  }, [pastCutoff, payrollCfg]);

  const profile = taxProfile as any;
  // Months available for "this payroll run": skip current month if past cut-off.
  const currentMonths = getUpcomingMonths(12, pastCutoff);
  const futureMonths = getUpcomingMonths(12, true);

  const effectiveAmount = useMemo(() => {
    if (payoutType === "FULL") return availableBalance;
    return parseFloat(amount) || 0;
  }, [payoutType, amount, availableBalance]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setPayeEstimate(null);
    if (!profile?.annualSalary || effectiveAmount <= 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      estimatePAYE.mutate(
        {
          data: {
            annualSalary: profile.annualSalary,
            commissionPayout: effectiveAmount,
            medicalAidCredits: profile.medicalAidCredits ?? 0,
            retirementContribution: profile.retirementContribution ?? 0,
            taxYear: profile.taxYear ?? new Date().getFullYear(),
          },
        },
        { onSuccess: (r: any) => setPayeEstimate(r) },
      );
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [effectiveAmount, profile]);

  const hasTaxProfile = !!profile?.annualSalary;
  const monthlySalary = hasTaxProfile ? (profile.annualSalary / 12) : 0;
  const grossThisMonth = monthlySalary + effectiveAmount;
  const totalMonthlyPAYE = payeEstimate ? Math.round((payeEstimate.netTaxWithCommission / 12) * 100) / 100 : null;
  const salaryOnlyPAYE = payeEstimate ? Math.round((payeEstimate.netTaxBase / 12) * 100) / 100 : null;
  const netTakeHome = totalMonthlyPAYE != null ? Math.round((grossThisMonth - totalMonthlyPAYE) * 100) / 100 : null;
  const fallbackTax = Math.round(effectiveAmount * 0.25 * 100) / 100;
  const fallbackNet = Math.round((effectiveAmount - fallbackTax) * 100) / 100;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (effectiveAmount <= 0) errs.amount = "Amount must be greater than zero";
    if (effectiveAmount > availableBalance) errs.amount = `Cannot exceed available balance of ${formatCurrency(availableBalance)}`;
    if (payoutType === "DEFER" && !deferToMonth) errs.deferTo = "Please select a deferred month";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const resetDialog = () => {
    setAmount("");
    setComments("");
    setErrors({});
    setPayoutType("FULL");
    setPayeEstimate(null);
    setPayoutMonth(getUpcomingMonths(1)[0].value);
    setDeferToMonth(getUpcomingMonths(1, true)[0].value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      await createPayout.mutateAsync({
        data: {
          requestedAmount: effectiveAmount,
          payoutMonth: payoutType === "DEFER" ? deferToMonth : payoutMonth,
          ...(payoutType === "DEFER" && { deferredToMonth: deferToMonth }),
          ...(comments && { comments }),
        },
      });
      qc.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      toast({
        title: payoutType === "DEFER" ? "Commission deferred" : "Payout request submitted",
        description: payoutType === "DEFER"
          ? `R${effectiveAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} deferred to ${deferToMonth}`
          : "Finance has been notified and will review your request.",
      });
      resetDialog();
      onClose();
      onSuccess();
    } catch (err: any) {
      toast({ title: "Request failed", description: err?.response?.data?.error ?? "Please try again", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetDialog(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Payout</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-center gap-3 text-sm">
            <WalletIcon className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground">Available balance:</span>
            <span className="font-semibold text-foreground ml-auto">{formatCurrency(availableBalance)}</span>
          </div>

          <div className="space-y-2">
            <Label>Payout type</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["FULL", "PARTIAL", "DEFER"] as PayoutType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setPayoutType(t); setErrors({}); }}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    payoutType === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {t === "FULL" ? "Full Balance" : t === "PARTIAL" ? "Partial" : "Defer"}
                </button>
              ))}
            </div>
          </div>

          {payoutType === "FULL" ? (
            <div className="space-y-1">
              <Label>Amount (ZAR)</Label>
              <div className="h-10 px-3 flex items-center rounded-md border border-border bg-muted/40 text-foreground font-semibold">
                {formatCurrency(availableBalance)}
              </div>
              <p className="text-xs text-muted-foreground">Full available balance will be requested</p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Amount (ZAR)</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                max={availableBalance}
                placeholder="e.g. 5000.00"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value;
                  setAmount(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed > availableBalance) {
                    setErrors((prev) => ({ ...prev, amount: `Cannot exceed available balance of ${formatCurrency(availableBalance)}` }));
                  } else {
                    setErrors((prev) => ({ ...prev, amount: "" }));
                  }
                }}
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
          )}

          {payoutType === "DEFER" ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Defer to month</Label>
              <Select value={deferToMonth} onValueChange={setDeferToMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {futureMonths.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.deferTo && <p className="text-xs text-destructive">{errors.deferTo}</p>}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded-md p-2">
                <Info className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
                Funds will be moved to your deferred balance and become available in the selected month.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Payout month</Label>
              <Select value={payoutMonth} onValueChange={setPayoutMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currentMonths.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {effectiveAmount > 0 && payoutType !== "DEFER" && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
              {!hasTaxProfile ? (
                <>
                  <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2 mb-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Using flat 25% estimate on commission only. <a href="/tax-profile" className="underline">Set up your Tax Profile</a> for a full monthly breakdown.</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Commission payout</span>
                    <span className="font-medium text-foreground">{formatCurrency(effectiveAmount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Estimated tax (25%)</span>
                    <span className="font-medium text-red-400">- {formatCurrency(fallbackTax)}</span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between font-semibold">
                    <span>Est. net commission</span>
                    <span className="text-emerald-500">{formatCurrency(fallbackNet)}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pb-1">This month's estimated income</p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Monthly salary</span>
                    <span className="font-medium text-foreground">{formatCurrency(monthlySalary)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Commission payout</span>
                    <span className="font-medium text-foreground">{formatCurrency(effectiveAmount)}</span>
                  </div>
                  <div className="flex justify-between text-foreground font-medium border-t border-border pt-2">
                    <span>Gross this month</span>
                    <span>{formatCurrency(grossThisMonth)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {payeEstimate
                        ? `Est. total PAYE (${payeEstimate.effectiveRateOnCommission}% on commission)`
                        : "Calculating PAYE…"}
                    </span>
                    <span className="font-medium text-red-400">
                      {totalMonthlyPAYE != null ? `- ${formatCurrency(totalMonthlyPAYE)}` : "—"}
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between font-semibold">
                    <span>Est. net take-home</span>
                    <span className="text-emerald-500">
                      {netTakeHome != null ? formatCurrency(netTakeHome) : "—"}
                    </span>
                  </div>
                  {salaryOnlyPAYE != null && (
                    <p className="text-xs text-muted-foreground">
                      * Salary-only PAYE would be {formatCurrency(salaryOnlyPAYE)}/month. Commission adds {formatCurrency(totalMonthlyPAYE! - salaryOnlyPAYE)} in PAYE.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Estimated from your saved salary, retirement &amp; medical aid. Actual tax may differ.</p>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Comments <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Any notes for the finance team..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => { resetDialog(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={createPayout.isPending || effectiveAmount <= 0 || !!errors.amount}>
              {createPayout.isPending ? "Submitting…" : payoutType === "DEFER" ? "Defer Commission" : "Submit Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Team Wallet Selector ──────────────────────────────────────────────────────

function TeamWalletSelector({
  selectedUserId,
  onChange,
}: {
  selectedUserId: string;
  onChange: (id: string) => void;
}) {
  const { data: walletsData, isLoading } = useListTeamWallets({});
  const wallets: Wallet[] = Array.isArray(walletsData) ? walletsData : [];

  if (isLoading) return <Skeleton className="h-9 w-60" />;
  if (!wallets.length) return null;

  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={selectedUserId} onValueChange={onChange}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select team member" />
        </SelectTrigger>
        <SelectContent>
          {wallets.map((w) => {
            const u = w.user;
            if (!u) return null;
            return (
              <SelectItem key={w.userId} value={w.userId}>
                <div className="flex items-center gap-2">
                  <span>{u.firstName} {u.lastName}</span>
                  <span className="text-xs text-muted-foreground">· {formatCurrency(w.availableBalance)}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Own Wallet View ──────────────────────────────────────────────────────────

function useClawbacksForWallet(execId?: string) {
  const [clawbacks, setClawbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = execId ? `/api/clawbacks?execId=${execId}` : "/api/clawbacks";
    fetch(url, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setClawbacks(Array.isArray(d) ? d : []))
      .catch(() => setClawbacks([]))
      .finally(() => setLoading(false));
  }, [execId]);

  const recoveryBalance = clawbacks
    .filter(c => c.status === "EXECUTED")
    .reduce((s, c) => s + (c.outstandingAmount ?? 0), 0);

  const potentialClawbacks = clawbacks
    .filter(c => c.status === "PENDING_APPROVAL")
    .reduce((s, c) => s + (c.clawbackAmount ?? 0), 0);

  return { clawbacks, loading, recoveryBalance, potentialClawbacks };
}

function OwnWalletView({ isSalesExec }: { isSalesExec: boolean }) {
  const { data: wallet, isLoading: walletLoading, refetch } = useGetWallet();
  const { data: txPage, isLoading: txLoading } = useListTransactions();
  const { data: dealsData, isLoading: dealsLoading } = useListWalletDeals();
  const { clawbacks, loading: cbLoading, recoveryBalance, potentialClawbacks } = useClawbacksForWallet();
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);

  const w = wallet as Wallet | undefined;
  const transactions: Transaction[] = Array.isArray((txPage as any)?.data) ? (txPage as any).data : [];
  const deals: WalletDeal[] = Array.isArray(dealsData) ? dealsData as any : [];

  return (
    <>
      <BalanceCards
        wallet={w}
        loading={walletLoading}
        recoveryBalance={recoveryBalance}
        potentialClawbacks={potentialClawbacks}
        recoveryLoading={cbLoading}
      />
      {w && !walletLoading && (
        <p className="text-xs text-muted-foreground text-right -mt-2">Last updated: {formatDateTime(w.updatedAt)}</p>
      )}
      {isSalesExec && (
        <div className="flex justify-end">
          <Button
            className="gap-2"
            onClick={() => setShowPayoutDialog(true)}
            disabled={!w || (w.availableBalance ?? 0) <= 0}
          >
            <ArrowUpRight className="h-4 w-4" />
            Request Payout
          </Button>
        </div>
      )}
      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions" className="gap-2">
            <Receipt className="h-3.5 w-3.5" />
            Transaction History
          </TabsTrigger>
          <TabsTrigger value="deals" className="gap-2">
            <Briefcase className="h-3.5 w-3.5" />
            Linked Deals
          </TabsTrigger>
          <TabsTrigger value="recovery" className="gap-2">
            <ShieldAlert className="h-3.5 w-3.5" />
            Recovery
            {(recoveryBalance > 0 || potentialClawbacks > 0) && (
              <span className="ml-1 h-4 min-w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
                {clawbacks.filter(c => ["PENDING_APPROVAL","EXECUTED"].includes(c.status) && (c.outstandingAmount > 0 || c.status === "PENDING_APPROVAL")).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-4">
          <TransactionTable transactions={transactions} loading={txLoading} />
        </TabsContent>
        <TabsContent value="deals" className="mt-4">
          <DealsTable deals={deals} loading={dealsLoading} />
        </TabsContent>
        <TabsContent value="recovery" className="mt-4">
          <RecoverySection clawbacks={clawbacks} loading={cbLoading} />
        </TabsContent>
      </Tabs>
      {isSalesExec && (
        <PayoutDialog
          open={showPayoutDialog}
          onClose={() => setShowPayoutDialog(false)}
          availableBalance={w?.availableBalance ?? 0}
          onSuccess={() => { refetch(); }}
        />
      )}
    </>
  );
}

// ─── Other User Wallet View ────────────────────────────────────────────────────

function OtherWalletView({ userId }: { userId: string }) {
  const { data: wallet, isLoading: walletLoading } = useGetUserWallet(userId);
  const { data: txPage, isLoading: txLoading } = useListWalletUserTransactions(userId);
  const { clawbacks, loading: cbLoading, recoveryBalance, potentialClawbacks } = useClawbacksForWallet(userId);

  const w = wallet as Wallet | undefined;
  const transactions: Transaction[] = Array.isArray((txPage as any)?.data) ? (txPage as any).data : [];

  return (
    <>
      <BalanceCards
        wallet={w}
        loading={walletLoading}
        recoveryBalance={recoveryBalance}
        potentialClawbacks={potentialClawbacks}
        recoveryLoading={cbLoading}
      />
      {w && !walletLoading && (
        <p className="text-xs text-muted-foreground text-right -mt-2">Last updated: {formatDateTime(w.updatedAt)}</p>
      )}
      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions" className="gap-2">
            <Receipt className="h-3.5 w-3.5" />
            Transaction History
          </TabsTrigger>
          <TabsTrigger value="recovery" className="gap-2">
            <ShieldAlert className="h-3.5 w-3.5" />
            Recovery
            {(recoveryBalance > 0 || potentialClawbacks > 0) && (
              <span className="ml-1 h-4 min-w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
                {clawbacks.filter(c => ["PENDING_APPROVAL","EXECUTED"].includes(c.status) && (c.outstandingAmount > 0 || c.status === "PENDING_APPROVAL")).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-4">
          <TransactionTable transactions={transactions} loading={txLoading} />
        </TabsContent>
        <TabsContent value="recovery" className="mt-4">
          <RecoverySection clawbacks={clawbacks} loading={cbLoading} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─── Main Wallet Page ──────────────────────────────────────────────────────────

export default function WalletPage() {
  const { user } = useAuth();
  const isSalesExec = user?.role === "SALES_EXECUTIVE";
  const canViewTeam = ["SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"].includes(user?.role ?? "");

  const [viewingUserId, setViewingUserId] = useState<string>("");
  const isViewingOther = canViewTeam && !!viewingUserId;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {isViewingOther ? "Team Member Wallet" : "My Wallet"}
          </h1>
          <p className="text-muted-foreground">
            {isViewingOther
              ? "Viewing selected team member's commission wallet"
              : "Your commission balance and transaction history"}
          </p>
        </div>
        {canViewTeam && (
          <TeamWalletSelector
            selectedUserId={viewingUserId}
            onChange={setViewingUserId}
          />
        )}
      </div>

      {isViewingOther
        ? <OtherWalletView key={viewingUserId} userId={viewingUserId} />
        : <OwnWalletView isSalesExec={isSalesExec} />
      }
    </div>
  );
}

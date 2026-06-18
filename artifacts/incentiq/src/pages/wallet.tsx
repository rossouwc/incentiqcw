import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";

// ─── Transaction type display helpers ─────────────────────────────────────────

interface TxMeta {
  label: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  isCredit: boolean;
}

const TX_META: Record<string, TxMeta> = {
  PENDING_COMMISSION_ADDED:   { label: "Pending Commission Added",   icon: PlusCircle,     colorClass: "text-amber-600",  bgClass: "bg-amber-50",   isCredit: true  },
  PENDING_COMMISSION_REMOVED: { label: "Pending Commission Removed", icon: XCircle,        colorClass: "text-red-600",    bgClass: "bg-red-50",     isCredit: false },
  COMMISSION_APPROVED:        { label: "Commission Approved",        icon: CheckCircle2,   colorClass: "text-green-600",  bgClass: "bg-green-50",   isCredit: true  },
  PAYOUT_REQUESTED:           { label: "Payout Requested",           icon: Receipt,        colorClass: "text-blue-600",   bgClass: "bg-blue-50",    isCredit: false },
  PAYOUT_APPROVED:            { label: "Payout Approved",            icon: CheckCircle2,   colorClass: "text-cyan-600",   bgClass: "bg-cyan-50",    isCredit: false },
  PAYOUT_PAID:                { label: "Payout Paid",                icon: ArrowUpRight,   colorClass: "text-indigo-600", bgClass: "bg-indigo-50",  isCredit: false },
  PAYOUT_DEFERRED:            { label: "Payout Deferred",            icon: Pause,          colorClass: "text-orange-600", bgClass: "bg-orange-50",  isCredit: false },
  MANUAL_ADJUSTMENT:          { label: "Manual Adjustment",          icon: Sliders,        colorClass: "text-gray-600",   bgClass: "bg-gray-100",   isCredit: true  },
  CREDIT:                     { label: "Credit",                     icon: ArrowDownLeft,  colorClass: "text-green-600",  bgClass: "bg-green-50",   isCredit: true  },
  DEBIT:                      { label: "Debit",                      icon: ArrowUpRight,   colorClass: "text-red-600",    bgClass: "bg-red-50",     isCredit: false },
  PAYOUT:                     { label: "Payout",                     icon: ArrowUpRight,   colorClass: "text-indigo-600", bgClass: "bg-indigo-50",  isCredit: false },
  ADJUSTMENT:                 { label: "Adjustment",                 icon: ArrowRightLeft, colorClass: "text-gray-600",   bgClass: "bg-gray-100",   isCredit: true  },
};

function getTxMeta(type: string): TxMeta {
  return TX_META[type] ?? { label: type, icon: ArrowRightLeft, colorClass: "text-gray-600", bgClass: "bg-gray-100", isCredit: true };
}

const TAX_RATE = 0.25;
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// ─── Balance Cards ─────────────────────────────────────────────────────────────

function BalanceCards({ wallet, loading }: { wallet: Wallet | undefined; loading: boolean }) {
  const w = wallet as any;
  const pendingApprovalAmount: number = w?.pendingApprovalAmount ?? 0;
  const payrollApprovedAmount: number = w?.payrollApprovedAmount ?? 0;

  const cards = [
    {
      label: "Available Balance",
      value: wallet?.availableBalance ?? 0,
      description: "Approved commission — ready to request",
      colorClass: "border-l-green-500",
      valueClass: "text-green-600",
      icon: WalletIcon,
    },
    {
      label: "Payroll Approved",
      value: payrollApprovedAmount,
      description: "Approved — awaiting pay date",
      colorClass: "border-l-emerald-400",
      valueClass: "text-emerald-600",
      icon: CheckCircle2,
    },
    {
      label: "Deferred Balance",
      value: wallet?.deferredBalance ?? 0,
      description: "Held pending conditions",
      colorClass: "border-l-orange-400",
      valueClass: "text-orange-600",
      icon: Pause,
    },
    {
      label: "Total Paid Out",
      value: wallet?.paidOutBalance ?? 0,
      description: "All-time lifetime payouts",
      colorClass: "border-l-purple-400",
      valueClass: "text-foreground",
      icon: TrendingUp,
    },
    {
      label: "Paid Out YTD",
      value: wallet?.paidYtd ?? 0,
      description: `${new Date().getFullYear()} year-to-date`,
      colorClass: "border-l-primary",
      valueClass: "text-primary",
      icon: CreditCard,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className={`border-l-4 ${c.colorClass} shadow-sm`}>
            <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loading ? (
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
    { value: "ALL", label: "All Types" },
    { value: "PENDING_COMMISSION_ADDED",   label: "Pending Added" },
    { value: "PENDING_COMMISSION_REMOVED", label: "Pending Removed" },
    { value: "COMMISSION_APPROVED",        label: "Commission Approved" },
    { value: "PAYOUT_REQUESTED",           label: "Payout Requested" },
    { value: "PAYOUT_APPROVED",            label: "Payout Approved" },
    { value: "PAYOUT_PAID",                label: "Payout Paid" },
    { value: "PAYOUT_DEFERRED",            label: "Payout Deferred" },
    { value: "MANUAL_ADJUSTMENT",          label: "Manual Adjustment" },
    { value: "CREDIT",                     label: "Credit" },
    { value: "DEBIT",                      label: "Debit" },
    { value: "PAYOUT",                     label: "Payout (legacy)" },
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

  const profile = taxProfile as any;
  const currentMonths = getUpcomingMonths(12);
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

function OwnWalletView({ isSalesExec }: { isSalesExec: boolean }) {
  const { data: wallet, isLoading: walletLoading, refetch } = useGetWallet();
  const { data: txPage, isLoading: txLoading } = useListTransactions();
  const { data: dealsData, isLoading: dealsLoading } = useListWalletDeals();
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);

  const w = wallet as Wallet | undefined;
  const transactions: Transaction[] = Array.isArray((txPage as any)?.data) ? (txPage as any).data : [];
  const deals: WalletDeal[] = Array.isArray(dealsData) ? dealsData as any : [];

  return (
    <>
      <BalanceCards wallet={w} loading={walletLoading} />
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
        </TabsList>
        <TabsContent value="transactions" className="mt-4">
          <TransactionTable transactions={transactions} loading={txLoading} />
        </TabsContent>
        <TabsContent value="deals" className="mt-4">
          <DealsTable deals={deals} loading={dealsLoading} />
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

  const w = wallet as Wallet | undefined;
  const transactions: Transaction[] = Array.isArray((txPage as any)?.data) ? (txPage as any).data : [];

  return (
    <>
      <BalanceCards wallet={w} loading={walletLoading} />
      {w && !walletLoading && (
        <p className="text-xs text-muted-foreground text-right -mt-2">Last updated: {formatDateTime(w.updatedAt)}</p>
      )}
      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions" className="gap-2">
            <Receipt className="h-3.5 w-3.5" />
            Transaction History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-4">
          <TransactionTable transactions={transactions} loading={txLoading} />
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

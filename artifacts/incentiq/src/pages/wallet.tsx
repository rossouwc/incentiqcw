import { useState, useMemo } from "react";
import {
  useGetWallet,
  useListTransactions,
  useListWalletDeals,
  useListTeamWallets,
  useGetUserWallet,
  useListWalletUserTransactions,
  useListUsers,
  useCreatePayout,
  type Wallet,
  type Transaction,
  type WalletDeal,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
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

  // Determine what's in the "pending" bucket and pick the best label
  const hasPendingApproval   = pendingApprovalAmount > 0;
  const hasPayrollApproved   = payrollApprovedAmount > 0;
  const pendingLabel       = hasPayrollApproved && !hasPendingApproval
    ? "Payroll Approved"
    : hasPendingApproval && hasPayrollApproved
    ? "In Progress"
    : "Submitted for Payout";
  const pendingDescription = hasPayrollApproved && !hasPendingApproval
    ? "Approved — awaiting pay date"
    : hasPendingApproval && hasPayrollApproved
    ? `R${pendingApprovalAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} pending · R${payrollApprovedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} payroll approved`
    : hasPendingApproval
    ? "Awaiting finance / payroll review"
    : "Awaiting payment processing";
  const pendingColor       = hasPayrollApproved && !hasPendingApproval
    ? "border-l-emerald-400"
    : "border-l-amber-400";
  const pendingValueClass  = hasPayrollApproved && !hasPendingApproval
    ? "text-emerald-600"
    : "text-amber-600";

  const cards = [
    {
      label: "Available Balance",
      value: wallet?.availableBalance ?? 0,
      description: "Ready to request as payout",
      colorClass: "border-l-green-500",
      valueClass: "text-green-600",
      icon: WalletIcon,
      highlight: true,
    },
    {
      label: pendingLabel,
      value: wallet?.pendingBalance ?? 0,
      description: pendingDescription,
      colorClass: pendingColor,
      valueClass: pendingValueClass,
      icon: hasPayrollApproved && !hasPendingApproval ? CheckCircle2 : Clock,
      highlight: false,
    },
    {
      label: "Deferred Balance",
      value: wallet?.deferredBalance ?? 0,
      description: "Held pending conditions",
      colorClass: "border-l-orange-400",
      valueClass: "text-orange-600",
      icon: Pause,
      highlight: false,
    },
    {
      label: "Total Paid Out",
      value: wallet?.paidOutBalance ?? 0,
      description: "All-time lifetime payouts",
      colorClass: "border-l-purple-400",
      valueClass: "text-foreground",
      icon: TrendingUp,
      highlight: false,
    },
    {
      label: "Paid Out YTD",
      value: wallet?.paidYtd ?? 0,
      description: `${new Date().getFullYear()} year-to-date`,
      colorClass: "border-l-primary",
      valueClass: "text-primary",
      icon: CreditCard,
      highlight: false,
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

function PayoutDialog({ open, onClose, availableBalance, onSuccess }: {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [payoutMonth, setPayoutMonth] = useState(CURRENT_MONTH);
  const createPayout = useCreatePayout();
  const { toast } = useToast();

  const parsed = parseFloat(amount) || 0;
  const estimatedTax = Math.round(parsed * TAX_RATE * 100) / 100;
  const netPayout = Math.round((parsed - estimatedTax) * 100) / 100;
  const isValid = parsed > 0 && parsed <= availableBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    try {
      await createPayout.mutateAsync({ data: { amount: parsed, payoutMonth } as any });
      toast({ title: "Payout request submitted", description: `${formatCurrency(parsed)} has been requested for ${payoutMonth}.` });
      onClose();
      setAmount("");
      onSuccess();
    } catch (err: any) {
      toast({ title: "Failed to submit payout", description: err?.message ?? "Something went wrong", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Payout</DialogTitle>
          <DialogDescription>Request a payout from your available commission balance</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(availableBalance)}</p>
            </div>
            <WalletIcon className="h-8 w-8 text-muted-foreground opacity-40" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payoutAmount">Amount (ZAR)</Label>
            <Input
              id="payoutAmount"
              type="number"
              min="1"
              max={availableBalance}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max ${formatCurrency(availableBalance)}`}
              className={parsed > availableBalance ? "border-red-400" : ""}
            />
            {parsed > availableBalance && (
              <p className="text-xs text-red-600">Exceeds available balance</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payoutMonth">Payout Month</Label>
            <Input
              id="payoutMonth"
              type="month"
              value={payoutMonth}
              onChange={(e) => setPayoutMonth(e.target.value)}
              required
            />
          </div>

          {parsed > 0 && parsed <= availableBalance && (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross payout</span>
                <span className="font-medium">{formatCurrency(parsed)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Est. tax (25%)</span>
                <span className="text-red-600">- {formatCurrency(estimatedTax)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Est. net payout</span>
                <span className="text-green-600">{formatCurrency(netPayout)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={!isValid || createPayout.isPending}>
              {createPayout.isPending ? "Submitting…" : "Submit Request"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
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

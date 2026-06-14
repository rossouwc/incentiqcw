import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPayouts,
  useCreatePayout,
  useGetWallet,
  useGetTaxProfile,
  useEstimatePAYE,
  getListPayoutsQueryKey,
  getGetWalletQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Wallet, Clock, CheckCircle2, ArrowDownCircle,
  CalendarDays, MessageSquare, Info, ArrowRightCircle, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

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

export default function Payouts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isSalesExec = user?.role === "SALES_EXECUTIVE";

  const { data: walletData, isLoading: walletLoading } = useGetWallet();
  const { data: payoutsData, isLoading: payoutsLoading } = useListPayouts();
  const { data: taxProfile } = useGetTaxProfile();
  const createPayout = useCreatePayout();
  const estimatePAYE = useEstimatePAYE();

  const wallet = walletData as any;
  const profile = taxProfile as any;
  const list: any[] = Array.isArray(payoutsData) ? payoutsData : (payoutsData as any)?.data ?? [];

  const [open, setOpen] = useState(false);
  const [payoutType, setPayoutType] = useState<PayoutType>("FULL");
  const [amount, setAmount] = useState("");
  const [payoutMonth, setPayoutMonth] = useState(() => getUpcomingMonths(1)[0].value);
  const [deferToMonth, setDeferToMonth] = useState(() => getUpcomingMonths(1, true)[0].value);
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [payeEstimate, setPayeEstimate] = useState<{
    additionalTax: number;
    estimatedNetPayout: number;
    effectiveRateOnCommission: number;
    taxableIncomeBase: number;
    taxableIncomeWithCommission: number;
  } | null>(null);

  const availableBalance = wallet?.availableBalance ?? 0;
  const pendingBalance = wallet?.pendingBalance ?? 0;
  const paidOutBalance = wallet?.paidOutBalance ?? 0;

  const currentMonths = getUpcomingMonths(12);
  const futureMonths = getUpcomingMonths(12, true);

  const effectiveAmount = useMemo(() => {
    if (payoutType === "FULL") return availableBalance;
    return parseFloat(amount) || 0;
  }, [payoutType, amount, availableBalance]);

  // Debounced PAYE estimate whenever amount or profile changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setPayeEstimate(null);
    if (!profile || !profile.annualSalary || effectiveAmount <= 0) return;
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

  // Fallback flat 25% when no tax profile is saved
  const TAX_RATE = 0.25;
  const fallbackTax = Math.round(effectiveAmount * TAX_RATE * 100) / 100;
  const fallbackNet = Math.round((effectiveAmount - fallbackTax) * 100) / 100;

  const hasTaxProfile = !!profile?.annualSalary;
  const displayTax = payeEstimate ? payeEstimate.additionalTax : (hasTaxProfile ? null : fallbackTax);
  const displayNet = payeEstimate ? payeEstimate.estimatedNetPayout : (hasTaxProfile ? null : fallbackNet);
  const displayRate = payeEstimate ? payeEstimate.effectiveRateOnCommission : (hasTaxProfile ? null : 25);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (effectiveAmount <= 0) errs.amount = "Amount must be greater than zero";
    if (effectiveAmount > availableBalance)
      errs.amount = `Cannot exceed available balance of ${formatCurrency(availableBalance)}`;
    if (payoutType === "DEFER" && !deferToMonth) errs.deferTo = "Please select a deferred month";
    setErrors(errs);
    return Object.keys(errs).length === 0;
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
      qc.invalidateQueries({ queryKey: getListPayoutsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      toast({ title: payoutType === "DEFER" ? "Commission deferred" : "Payout request submitted", description: payoutType === "DEFER" ? `R${effectiveAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} deferred to ${deferToMonth}` : "Finance has been notified and will review your request." });
      setOpen(false);
      setAmount("");
      setComments("");
      setPayoutType("FULL");
    } catch (err: any) {
      toast({ title: "Request failed", description: err?.response?.data?.error ?? "Please try again", variant: "destructive" });
    }
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

  const pending = list.filter((p) => p.status === "PENDING").length;
  const totalPaid = list.filter((p) => p.status === "PAID").reduce((s: number, p: any) => s + p.requestedAmount, 0);
  const deferred = list.filter((p) => p.status === "DEFERRED").length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payout Requests</h1>
          <p className="text-muted-foreground">
            {isSalesExec ? "Manage your commission payouts" : "Review and manage payout requests"}
          </p>
        </div>
        {isSalesExec && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={availableBalance <= 0 && !walletLoading}>
                <Plus className="h-4 w-4" /> Request Payout
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Request Payout</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Available balance info */}
                <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-center gap-3 text-sm">
                  <Wallet className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">Available balance:</span>
                  <span className="font-semibold text-foreground ml-auto">{formatCurrency(availableBalance)}</span>
                </div>

                {/* Payout type */}
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

                {/* Amount */}
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
                      onChange={(e) => { setAmount(e.target.value); setErrors((prev) => ({ ...prev, amount: "" })); }}
                    />
                    {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
                  </div>
                )}

                {/* Month selector */}
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

                {/* Tax estimate */}
                {effectiveAmount > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
                    {/* No tax profile nudge */}
                    {!hasTaxProfile && (
                      <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2 mb-1">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Using flat 25% estimate. <a href="/tax-profile" className="underline">Set up your Tax Profile</a> for a personalised PAYE calculation.</span>
                      </div>
                    )}

                    <div className="flex justify-between text-muted-foreground">
                      <span>Gross amount</span>
                      <span className="font-medium text-foreground">{formatCurrency(effectiveAmount)}</span>
                    </div>

                    {/* PAYE breakdown when profile exists */}
                    {hasTaxProfile && payeEstimate && (
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-xs">Taxable income (with commission)</span>
                        <span className="text-xs">{formatCurrency(payeEstimate.taxableIncomeWithCommission)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {hasTaxProfile && payeEstimate
                          ? `Est. PAYE (${payeEstimate.effectiveRateOnCommission}% effective)`
                          : hasTaxProfile
                          ? "Calculating PAYE…"
                          : "Estimated tax (25%)"}
                      </span>
                      <span className="font-medium text-red-400">
                        {displayTax != null ? `- ${formatCurrency(displayTax)}` : "—"}
                      </span>
                    </div>

                    <div className="border-t border-border pt-2 flex justify-between font-semibold">
                      <span>Estimated net payout</span>
                      <span className="text-emerald-500">
                        {displayNet != null ? formatCurrency(displayNet) : "—"}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      * {hasTaxProfile
                        ? "PAYE estimated from your saved salary, retirement, and medical aid. Actual tax may differ."
                        : "Tax is an estimate. Actual deduction depends on your tax profile."}
                    </p>
                  </div>
                )}

                {/* Comments */}
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
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createPayout.isPending || effectiveAmount <= 0}>
                    {createPayout.isPending ? "Submitting…" : payoutType === "DEFER" ? "Defer Commission" : "Submit Request"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Wallet summary (sales exec only) */}
      {isSalesExec && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Available Balance", value: availableBalance, icon: Wallet, color: "border-l-emerald-500" },
            { label: "Pending Payout", value: pendingBalance, icon: Clock, color: "border-l-amber-400" },
            { label: "Paid Out (All Time)", value: paidOutBalance, icon: CheckCircle2, color: "border-l-blue-400" },
            { label: "Deferred", value: wallet?.deferredBalance ?? 0, icon: ArrowRightCircle, color: "border-l-purple-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className={`border-l-4 ${color} shadow-sm`}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {walletLoading ? <Skeleton className="h-7 w-24" /> : (
                  <div className="text-xl font-bold">{formatCurrency(value)}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Request stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{payoutsLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{pending}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deferred</CardTitle>
            <ArrowRightCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{payoutsLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{deferred}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid Out</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{payoutsLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatCurrency(totalPaid)}</div>}</CardContent>
        </Card>
      </div>

      {/* History table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Payout History</CardTitle>
          <CardDescription>All payout requests and their current status</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {payoutsLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    {!isSalesExec && <th className="px-6 py-4 font-medium">Employee</th>}
                    <th className="px-6 py-4 font-medium text-right">Gross</th>
                    <th className="px-6 py-4 font-medium text-right">Est. Tax</th>
                    <th className="px-6 py-4 font-medium text-right">Net</th>
                    <th className="px-6 py-4 font-medium">Month</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Requested</th>
                    <th className="px-6 py-4 font-medium">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                        <Wallet className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No payout requests yet
                      </td>
                    </tr>
                  ) : list.map((p: any) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      {!isSalesExec && <td className="px-6 py-4 font-medium text-foreground">{p.userName}</td>}
                      <td className="px-6 py-4 text-right font-semibold">{formatCurrency(p.requestedAmount)}</td>
                      <td className="px-6 py-4 text-right text-red-400">- {formatCurrency(p.estimatedTax)}</td>
                      <td className="px-6 py-4 text-right text-emerald-500 font-semibold">{formatCurrency(p.estimatedNetPayout)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.deferredToMonth ? `→ ${p.deferredToMonth}` : p.payoutMonth}</td>
                      <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{formatDate(p.requestedAt)}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs max-w-xs">
                        {p.comments && <span className="block truncate">{p.comments}</span>}
                        {p.reviewerComments && <span className="block truncate text-amber-400 mt-0.5">Finance: {p.reviewerComments}</span>}
                        {!p.comments && !p.reviewerComments && "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

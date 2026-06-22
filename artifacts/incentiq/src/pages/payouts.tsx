import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Wallet, Clock, CheckCircle2, ArrowDownCircle,
  CalendarDays, MessageSquare, Info, ArrowRightCircle, AlertCircle,
  XCircle, CircleDot,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type PayoutType = "FULL" | "PARTIAL" | "DEFER";

type StepState = "done" | "active" | "pending" | "rejected";

function getWorkflowSteps(status: string): { label: string; sublabel: string; state: StepState }[] {
  const done   = (label: string, sublabel: string) => ({ label, sublabel, state: "done"     as StepState });
  const active = (label: string, sublabel: string) => ({ label, sublabel, state: "active"   as StepState });
  const pend   = (label: string, sublabel: string) => ({ label, sublabel, state: "pending"  as StepState });
  const rej    = (label: string, sublabel: string) => ({ label, sublabel, state: "rejected" as StepState });

  const base = done("Request Submitted", "Payout request created");

  if (status === "REJECTED") return [
    base,
    rej("Payroll Review", "Request was rejected"),
    pend("Payment Processing", "Not reached"),
  ];
  if (status === "DEFERRED") return [
    base,
    active("Deferred", "Payout deferred to a future month"),
    pend("Payment Processing", "Awaiting processing"),
  ];
  if (status === "PENDING") return [
    base,
    active("Payroll Review", "Awaiting payroll approval"),
    pend("Payment Processing", "Pending payroll approval"),
  ];
  if (status === "FINANCE_APPROVED" || status === "PAYROLL_APPROVED") return [
    base,
    done("Payroll Review", "Approved by payroll"),
    active("Payment Processing", "Scheduled for payment"),
  ];
  if (status === "PAID") return [
    base,
    done("Payroll Review", "Approved by payroll"),
    done("Payment Processing", "Payment disbursed"),
  ];
  return [base, pend("Payroll Review", ""), pend("Payment Processing", "")];
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")     return <CheckCircle2 className="h-6 w-6 text-emerald-500" />;
  if (state === "active")   return <CircleDot className="h-6 w-6 text-indigo-400 animate-pulse" />;
  if (state === "rejected") return <XCircle className="h-6 w-6 text-red-500" />;
  return <div className="h-6 w-6 rounded-full border-2 border-border bg-background" />;
}

function PayoutTrackingBody({ payout }: { payout: any }) {
  const steps = getWorkflowSteps(payout.status);
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-semibold">{formatCurrency(payout.requestedAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Est. tax</span>
          <span className="text-red-400">- {formatCurrency(payout.estimatedTax)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2">
          <span className="text-muted-foreground">Net payout</span>
          <span className="font-bold text-emerald-500">{formatCurrency(payout.estimatedNetPayout)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Month</span>
          <span>{payout.payoutMonth}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Requested</span>
          <span>{formatDate(payout.requestedAt)}</span>
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-4">Approval Progress</p>
        <div className="relative">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <StepIcon state={step.state} />
                {i < steps.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 my-1 ${step.state === "done" ? "bg-emerald-500/50" : "bg-border"}`}
                    style={{ minHeight: "2rem" }}
                  />
                )}
              </div>
              <div className={`pb-6 ${i === steps.length - 1 ? "pb-0" : ""}`}>
                <p className={`font-medium text-sm ${
                  step.state === "done" ? "text-foreground"
                  : step.state === "active" ? "text-indigo-400"
                  : step.state === "rejected" ? "text-red-400"
                  : "text-muted-foreground"
                }`}>{step.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.sublabel}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {payout.reviewerComments && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
          <p className="font-medium mb-1">Reviewer note:</p>
          <p>"{payout.reviewerComments}"</p>
        </div>
      )}
    </div>
  );
}

function getAuthHeaders(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

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

  const { data: payrollConfig } = useQuery({
    queryKey: ["payroll-config"],
    queryFn: () => fetch("/api/tenant/payroll-config", { headers: getAuthHeaders() }).then(r => r.json()),
  });
  const cutoffDay: number = (payrollConfig as any)?.commissionCutoffDay ?? 0;
  const pastCutoff = cutoffDay > 0 && new Date().getDate() > cutoffDay;

  const [open, setOpen] = useState(false);
  const [trackingPayout, setTrackingPayout] = useState<any>(null);
  const [payoutType, setPayoutType] = useState<PayoutType>("FULL");
  const [amount, setAmount] = useState("");
  const [payoutMonthOverride, setPayoutMonthOverride] = useState<string | null>(null);
  const [deferToMonth, setDeferToMonth] = useState(() => getUpcomingMonths(1, true)[0].value);
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [payeEstimate, setPayeEstimate] = useState<{
    netTaxWithCommission: number;
    netTaxBase: number;
    effectiveRateOnCommission: number;
  } | null>(null);

  const w = wallet as any;
  const availableBalance = wallet?.availableBalance ?? 0;
  const outstandingClawbackAmount: number = w?.outstandingClawbackAmount ?? 0;
  // Payable balance = available minus any approved-but-not-yet-executed clawback recoveries
  const payableBalance: number = w?.payableBalance ?? availableBalance;
  const pendingReviewBalance = w?.pendingApprovalAmount ?? 0;
  const payrollApprovedBalance = w?.payrollApprovedAmount ?? 0;
  const paidOutBalance = wallet?.paidOutBalance ?? 0;

  const currentMonths = getUpcomingMonths(12, pastCutoff);
  const futureMonths = getUpcomingMonths(12, true);
  const payoutMonth = (payoutMonthOverride && currentMonths.some(m => m.value === payoutMonthOverride))
    ? payoutMonthOverride
    : currentMonths[0]?.value ?? "";

  const effectiveAmount = useMemo(() => {
    if (payoutType === "FULL") return payableBalance;
    return parseFloat(amount) || 0;
  }, [payoutType, amount, payableBalance]);

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

  const hasTaxProfile = !!profile?.annualSalary;
  const monthlySalary = hasTaxProfile ? (profile.annualSalary / 12) : 0;

  // Full monthly picture: salary + commission
  const grossThisMonth = monthlySalary + effectiveAmount;
  const totalMonthlyPAYE = payeEstimate ? Math.round((payeEstimate.netTaxWithCommission / 12) * 100) / 100 : null;
  const salaryOnlyPAYE  = payeEstimate ? Math.round((payeEstimate.netTaxBase / 12) * 100) / 100 : null;
  const netTakeHome = totalMonthlyPAYE != null ? Math.round((grossThisMonth - totalMonthlyPAYE) * 100) / 100 : null;

  // Fallback flat 25% when no tax profile is saved (commission only)
  const fallbackTax = Math.round(effectiveAmount * 0.25 * 100) / 100;
  const fallbackNet = Math.round((effectiveAmount - fallbackTax) * 100) / 100;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (effectiveAmount <= 0) errs.amount = "Amount must be greater than zero";
    if (effectiveAmount > payableBalance)
      errs.amount = `Cannot exceed payable balance of ${formatCurrency(payableBalance)}`;
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
    setPayoutMonthOverride(null);
    setDeferToMonth(getUpcomingMonths(1, true)[0].value);
  };

  const pending = list.filter((p) => p.status === "PENDING").length;
  const totalPaid = list.filter((p) => ["PAID","PAYROLL_APPROVED"].includes(p.status)).reduce((s: number, p: any) => s + p.requestedAmount, 0);
  const deferred = list.filter((p) => p.status === "DEFERRED").length;

  return (
    <>
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
              <Button className="gap-2" disabled={payableBalance <= 0 && !walletLoading}>
                <Plus className="h-4 w-4" /> Request Payout
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Request Payout</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Available balance info */}
                <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-3">
                    <Wallet className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-muted-foreground">Payable balance:</span>
                    <span className="font-semibold text-foreground ml-auto">{formatCurrency(payableBalance)}</span>
                  </div>
                  {outstandingClawbackAmount > 0 && (
                    <div className="flex items-center gap-3 pl-7 text-amber-500">
                      <span className="text-xs">Gross balance {formatCurrency(availableBalance)} — outstanding recovery {formatCurrency(outstandingClawbackAmount)} held back</span>
                    </div>
                  )}
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
                      {formatCurrency(payableBalance)}
                    </div>
                    <p className="text-xs text-muted-foreground">Full payable balance will be requested</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Amount (ZAR)</Label>
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      max={payableBalance}
                      placeholder="e.g. 5000.00"
                      value={amount}
                      onChange={(e) => {
                          const val = e.target.value;
                          setAmount(val);
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed) && parsed > payableBalance) {
                            setErrors((prev) => ({ ...prev, amount: `Cannot exceed payable balance of ${formatCurrency(payableBalance)}` }));
                          } else {
                            setErrors((prev) => ({ ...prev, amount: "" }));
                          }
                        }}
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
                    <Select value={payoutMonth} onValueChange={setPayoutMonthOverride}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {currentMonths.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Monthly income breakdown */}
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
                  <Button type="submit" disabled={createPayout.isPending || effectiveAmount <= 0 || !!errors.amount}>
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Available Balance", value: availableBalance, icon: Wallet, color: "border-l-emerald-500" },
            { label: "Pending Review", value: pendingReviewBalance, icon: Clock, color: "border-l-amber-400" },
            { label: "Payroll Approved", value: payrollApprovedBalance, icon: CheckCircle2, color: "border-l-emerald-400" },
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
                      <td className="px-6 py-4">
                        {isSalesExec ? (
                          <button
                            onClick={() => setTrackingPayout(p)}
                            className="hover:opacity-80 transition-opacity cursor-pointer"
                            title="Click to view approval progress"
                          >
                            <StatusBadge status={p.status} />
                          </button>
                        ) : (
                          <StatusBadge status={p.status} />
                        )}
                      </td>
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

    {/* Payout tracking sheet — sales exec only */}
    <Sheet open={!!trackingPayout} onOpenChange={(v) => { if (!v) setTrackingPayout(null); }}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Payout Progress</SheetTitle>
        </SheetHeader>
        {trackingPayout && <PayoutTrackingBody payout={trackingPayout} />}
      </SheetContent>
    </Sheet>
    </>
  );
}

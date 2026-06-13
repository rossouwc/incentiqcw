import {
  useListApprovals, useListPayouts, useGetPayoutSummary, useGetMyTasks, useGetRecentActivity,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  ClipboardCheck, DollarSign, FileText, AlertTriangle, CheckCircle2,
  ArrowRight, Download, Clock, TrendingDown,
} from "lucide-react";

export default function FinanceDashboard() {
  const { data: pendingApprovals, isLoading: loadingApprovals } = useListApprovals({ status: "PENDING" });
  const { data: pendingPayouts,   isLoading: loadingPayouts   } = useListPayouts({ status: "PENDING" });
  const { data: readyPayouts,     isLoading: loadingReady     } = useListPayouts({ status: "FINANCE_APPROVED" });
  const { data: payoutSummary,    isLoading: loadingSummary   } = useGetPayoutSummary();
  const { data: myTasks,          isLoading: loadingTasks     } = useGetMyTasks();
  const { data: recentActivity,   isLoading: loadingActivity  } = useGetRecentActivity();

  const approvalList = pendingApprovals ?? [];
  const payoutList   = pendingPayouts   ?? [];
  const readyList    = readyPayouts     ?? [];
  const totalPendingComm = payoutList.reduce((s, p) => s + p.requestedAmount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Finance Dashboard</h1>
          <p className="text-muted-foreground">Commission validation and payout management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/finance-approvals" className="flex items-center gap-1.5"><ClipboardCheck className="h-4 w-4" /> Approvals Queue</a>
          </Button>
          <Button size="sm" asChild>
            <a href="/payroll-export" className="flex items-center gap-1.5"><Download className="h-4 w-4" /> Payroll Export</a>
          </Button>
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Awaiting Validation"
          value={approvalList.length}
          sub="deals pending finance review"
          icon={ClipboardCheck}
          accent="border-l-amber-400"
          loading={loadingApprovals}
          valueColor={approvalList.length > 0 ? "text-amber-500" : undefined}
        />
        <StatCard
          title="Pending Commission Value"
          value={formatCurrency(totalPendingComm)}
          sub={`${payoutList.length} payout requests`}
          icon={DollarSign}
          accent="border-l-primary"
          loading={loadingPayouts}
        />
        <StatCard
          title="Payouts Awaiting Approval"
          value={payoutList.length}
          sub={formatCurrency(totalPendingComm) + " total"}
          icon={FileText}
          accent="border-l-blue-400"
          loading={loadingPayouts}
        />
        <StatCard
          title="Tax Estimate"
          value={payoutSummary ? formatCurrency(payoutSummary.estimatedTax) : "—"}
          sub={payoutSummary ? `${payoutSummary.payoutPercentage}% payout rate` : "on pending payouts"}
          icon={TrendingDown}
          accent="border-l-rose-400"
          loading={loadingSummary}
        />
      </div>

      {/* Secondary indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ready for Payroll Export</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingReady ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold text-emerald-600">{readyList.length}</div>
                <p className="text-xs text-muted-foreground mt-1">{formatCurrency(readyList.reduce((s, p) => s + p.requestedAmount, 0))} approved</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Est. Net Payout</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold">{payoutSummary ? formatCurrency(payoutSummary.estimatedNetPayout) : "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">after tax deductions</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Action Required</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingTasks ? <Skeleton className="h-8 w-16" /> : (
              <>
                <div className={`text-2xl font-bold ${(myTasks?.informationRequired ?? 0) > 0 ? "text-orange-500" : ""}`}>
                  {myTasks?.informationRequired ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">items needing attention</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deals awaiting finance approval */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Commission Validation Queue</CardTitle>
              <CardDescription>Deals pending your finance review</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/commission-validation" className="flex items-center gap-1.5 text-sm">All <ArrowRight className="h-3.5 w-3.5" /></a>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingApprovals ? (
              <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="divide-y divide-border">
                {approvalList.length === 0 ? (
                  <div className="px-6 py-10 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                    No pending validations
                  </div>
                ) : approvalList.slice(0, 6).map(a => {
                  const ageHrs = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 3600000);
                  return (
                    <div key={a.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {a.dealName}
                        </div>
                        <div className="text-xs text-muted-foreground">{a.salesExecutiveName} · {a.stepName ?? `Level ${a.approvalLevel}`}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className={`text-xs ${ageHrs > 24 ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                          {ageHrs > 0 ? `${ageHrs}h` : "now"}{ageHrs > 24 ? " ⚠" : ""}
                        </span>
                        <StatusBadge status={a.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payouts awaiting sign-off */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Payout Requests</CardTitle>
              <CardDescription>Pending payouts awaiting finance approval</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/finance-approvals" className="flex items-center gap-1.5 text-sm">All <ArrowRight className="h-3.5 w-3.5" /></a>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingPayouts ? (
              <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="divide-y divide-border">
                {payoutList.length === 0 ? (
                  <div className="px-6 py-10 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                    No pending payout requests
                  </div>
                ) : payoutList.slice(0, 6).map(p => (
                  <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-foreground">{p.userName ?? p.userId.slice(0, 12)}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(p.requestedAt)}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="font-semibold text-sm">{formatCurrency(p.requestedAmount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payroll export status */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Payroll Export Status</CardTitle>
            <CardDescription>Finance-approved payouts ready for payroll processing</CardDescription>
          </div>
          <Button size="sm" asChild>
            <a href="/payroll-export" className="flex items-center gap-2"><Download className="h-4 w-4" /> Export Payroll</a>
          </Button>
        </CardHeader>
        <CardContent>
          {loadingReady ? <Skeleton className="h-24 w-full" /> : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900">
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{readyList.length}</div>
                <div className="text-sm text-emerald-600 dark:text-emerald-500 font-medium">Approved, ready to export</div>
              </div>
              <div className="flex flex-col gap-1 p-4 bg-muted/50 rounded-xl border border-border">
                <div className="text-2xl font-bold">{formatCurrency(readyList.reduce((s, p) => s + p.requestedAmount, 0))}</div>
                <div className="text-sm text-muted-foreground">Total payroll value</div>
              </div>
              <div className="flex flex-col gap-1 p-4 bg-muted/50 rounded-xl border border-border">
                <div className="text-2xl font-bold">{new Set(readyList.map(p => p.userId)).size}</div>
                <div className="text-sm text-muted-foreground">Unique recipients</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

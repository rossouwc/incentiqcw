import {
  useListPayouts, useGetMyTasks, useGetRecentActivity,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Download, CheckCircle2, Clock, Users, DollarSign, ArrowRight, FileSpreadsheet, AlertCircle,
} from "lucide-react";

export default function PayrollDashboard() {
  const { data: readyPayouts,  isLoading: loadingReady  } = useListPayouts({ status: "FINANCE_APPROVED" });
  const { data: paidPayouts,   isLoading: loadingPaid   } = useListPayouts({ status: "PAID" });
  const { data: pendingPayouts, isLoading: loadingPending } = useListPayouts({ status: "PENDING" });
  const { data: myTasks,       isLoading: loadingTasks  } = useGetMyTasks();
  const { data: recentActivity, isLoading: loadingActivity } = useGetRecentActivity();

  const readyList   = readyPayouts   ?? [];
  const paidList    = paidPayouts    ?? [];
  const pendingList = pendingPayouts ?? [];

  const totalReady  = readyList.reduce((s, p) => s + p.amount, 0);
  const totalPaid   = paidList.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payroll Dashboard</h1>
          <p className="text-muted-foreground">Commission payroll export and payment processing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/payout-history" className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> History</a>
          </Button>
          <Button size="sm" asChild>
            <a href="/payroll-export" className="flex items-center gap-2">
              <Download className="h-4 w-4" /> Export Payroll
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ready for Export"
          value={readyList.length}
          sub={formatCurrency(totalReady) + " total"}
          icon={CheckCircle2}
          accent="border-l-emerald-500"
          loading={loadingReady}
          valueColor={readyList.length > 0 ? "text-emerald-600" : undefined}
        />
        <StatCard
          title="Paid This Period"
          value={formatCurrency(totalPaid)}
          sub={`${paidList.length} transactions`}
          icon={DollarSign}
          accent="border-l-primary"
          loading={loadingPaid}
        />
        <StatCard
          title="Pending Requests"
          value={pendingList.length}
          sub="awaiting approval"
          icon={Clock}
          accent="border-l-amber-400"
          loading={loadingPending}
        />
        <StatCard
          title="Recipients"
          value={new Set([...readyList, ...paidList].map(p => p.userId)).size}
          sub="unique employees"
          icon={Users}
          accent="border-l-blue-400"
          loading={loadingReady || loadingPaid}
        />
      </div>

      {/* Export action banner */}
      {readyList.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {readyList.length} payouts ready for payroll export
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Total of {formatCurrency(totalReady)} approved and waiting to be processed
              </p>
            </div>
          </div>
          <Button className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white" asChild>
            <a href="/payroll-export" className="flex items-center gap-2">
              <Download className="h-4 w-4" /> Export Now
            </a>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ready for export list */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Ready for Payroll</CardTitle>
              <CardDescription>Finance-approved payouts awaiting export</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href="/payroll-export"><Download className="h-3.5 w-3.5" /> Export</a>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingReady ? (
              <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
                {readyList.length === 0 ? (
                  <div className="px-6 py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                    No payouts ready for export
                  </div>
                ) : readyList.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-foreground">{p.userName ?? p.userId.slice(0, 14)}</div>
                      <div className="text-xs text-muted-foreground">Approved · {formatDate(p.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="font-semibold text-sm text-emerald-600">{formatCurrency(p.amount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent paid history */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Payments</CardTitle>
              <CardDescription>Successfully processed commission payouts</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/payout-history" className="flex items-center gap-1.5 text-sm">All <ArrowRight className="h-3.5 w-3.5" /></a>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingPaid ? (
              <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
                {paidList.length === 0 ? (
                  <div className="px-6 py-12 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No payments recorded
                  </div>
                ) : paidList.slice(0, 8).map(p => (
                  <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-foreground">{p.userName ?? p.userId.slice(0, 14)}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="font-semibold text-sm">{formatCurrency(p.amount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status summary */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Payroll Status Summary</CardTitle>
          <CardDescription>Current period pipeline status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Pending",           count: pendingList.length, amount: pendingList.reduce((s,p) => s+p.amount,0),  color: "bg-amber-100 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400" },
              { label: "Finance Approved",  count: readyList.length,   amount: readyList.reduce((s,p) => s+p.amount,0),    color: "bg-blue-100 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400"         },
              { label: "Paid",              count: paidList.length,    amount: paidList.reduce((s,p) => s+p.amount,0),     color: "bg-green-100 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400"    },
              { label: "Tasks Pending",     count: myTasks?.pendingApprovals ?? 0, amount: 0, color: "bg-muted/50 border-border text-foreground" },
            ].map(({ label, count, amount, color }) => (
              <div key={label} className={`p-4 rounded-xl border ${color}`}>
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm font-medium mt-0.5">{label}</div>
                {amount > 0 && <div className="text-xs mt-1 opacity-80">{formatCurrency(amount)}</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

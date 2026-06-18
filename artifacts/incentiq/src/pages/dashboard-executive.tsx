import {
  useListApprovals, useGetPayoutSummary, useGetCommissionByType, useGetDealsReport, useListUsers,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  BadgeCheck, DollarSign, TrendingUp, Users, BarChart2, ArrowRight,
  AlertTriangle, Calendar, TrendingDown, Scale, ShieldAlert,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

function execAuthHeaders(): HeadersInit {
  const t = localStorage.getItem("incentiq_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

export default function ExecutiveDashboard() {
  const { data: pendingApprovals, isLoading: loadingApprovals } = useListApprovals({ status: "PENDING" });
  const { data: payoutSummary,   isLoading: loadingSummary   } = useGetPayoutSummary();
  const { data: byType,          isLoading: loadingByType    } = useGetCommissionByType();
  const { data: report,          isLoading: loadingReport    } = useGetDealsReport();
  const { data: allUsers,        isLoading: loadingUsers     } = useListUsers();

  const { data: pendingCb, isLoading: loadingPendingCb } = useQuery({
    queryKey: ["exec-pending-cb"],
    queryFn: async () => { const r = await fetch("/api/clawbacks?status=PENDING_APPROVAL", { headers: execAuthHeaders() }); return r.json(); },
  });
  const { data: cbSummary, isLoading: loadingCbSummary } = useQuery({
    queryKey: ["exec-cb-summary"],
    queryFn: async () => { const r = await fetch("/api/reports/clawback-summary", { headers: execAuthHeaders() }); return r.json(); },
  });

  const approvalList  = pendingApprovals ?? [];
  const salesExecs    = (allUsers ?? []).filter(u => u.role === "SALES_EXECUTIVE");
  const pendingCbList = (Array.isArray(pendingCb) ? pendingCb : []) as any[];
  const highValueCb   = [...pendingCbList].sort((a, b) => b.clawbackAmount - a.clawbackAmount).slice(0, 5);
  const cbOutstanding = cbSummary?.totals?.outstanding ?? 0;
  const cbRiskPct     = (report?.totalCommission ?? 0) > 0
    ? ((cbOutstanding / report!.totalCommission!) * 100).toFixed(1) : "0.0";

  const MONTHLY_FORECAST = [
    { month: "Jul", forecast: 85000 },
    { month: "Aug", forecast: 92000 },
    { month: "Sep", forecast: 78000 },
    { month: "Oct", forecast: 110000 },
    { month: "Nov", forecast: 98000 },
    { month: "Dec", forecast: 125000 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Executive Dashboard</h1>
          <p className="text-muted-foreground">Commission oversight and final approval management</p>
        </div>
        <Button size="sm" asChild>
          <a href="/final-approvals" className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4" /> Final Approvals
            {approvalList.length > 0 && (
              <span className="ml-1 bg-white/20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {approvalList.length}
              </span>
            )}
          </a>
        </Button>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Final Approvals Required"
          value={approvalList.length}
          sub="awaiting your sign-off"
          icon={BadgeCheck}
          accent="border-l-amber-400"
          loading={loadingApprovals}
          valueColor={approvalList.length > 0 ? "text-amber-500" : "text-green-500"}
        />
        <StatCard
          title="Commission Liability"
          value={payoutSummary ? formatCurrency(payoutSummary.totalAvailable) : "—"}
          sub="total available to pay out"
          icon={DollarSign}
          accent="border-l-primary"
          loading={loadingSummary}
        />
        <StatCard
          title="Total Commission YTD"
          value={report ? formatCurrency(report.totalCommission) : "—"}
          sub={`across ${report?.totalDeals ?? 0} deals`}
          icon={TrendingUp}
          accent="border-l-emerald-500"
          loading={loadingReport}
        />
        <StatCard
          title="Active Sales Team"
          value={salesExecs.length}
          sub="sales executives"
          icon={Users}
          accent="border-l-blue-400"
          loading={loadingUsers}
        />
      </div>

      {/* Clawback Risk Section */}
      <div className="flex items-center gap-2 pt-1">
        <TrendingDown className="h-4 w-4 text-red-500" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Clawback Risk Overview</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="High-Value Clawbacks"
          value={pendingCbList.filter(c => c.clawbackAmount >= 10000).length}
          sub="≥ R10k pending approval"
          icon={ShieldAlert}
          accent="border-l-red-500"
          loading={loadingPendingCb}
          valueColor={pendingCbList.some(c => c.clawbackAmount >= 10000) ? "text-red-500" : undefined}
        />
        <StatCard
          title="Waiver Approvals Required"
          value={pendingCbList.length}
          sub="clawbacks awaiting your sign-off"
          icon={Scale}
          accent="border-l-amber-400"
          loading={loadingPendingCb}
          valueColor={pendingCbList.length > 0 ? "text-amber-500" : undefined}
        />
        <StatCard
          title="Commission Risk Exposure"
          value={`${cbRiskPct}%`}
          sub={`${formatCurrency(cbOutstanding)} outstanding vs commission YTD`}
          icon={AlertTriangle}
          accent="border-l-orange-400"
          loading={loadingCbSummary || loadingReport}
          valueColor={parseFloat(cbRiskPct) > 5 ? "text-orange-500" : undefined}
        />
      </div>

      {/* High-value clawback queue */}
      {highValueCb.length > 0 && (
        <Card className="shadow-sm border-l-4 border-l-red-400">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                High-Value Clawbacks Requiring Attention
              </CardTitle>
              <CardDescription>Pending approval — sorted by clawback amount</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/clawbacks" className="flex items-center gap-1.5 text-sm">All <ArrowRight className="h-3.5 w-3.5" /></a>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {highValueCb.map((cb: any) => (
                <div key={cb.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">{cb.eventTitle}</div>
                    <div className="text-xs text-muted-foreground">{cb.salesExecutiveName} · {cb.reasonCategory?.replace(/_/g, " ")}</div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="font-semibold text-sm text-red-600 dark:text-red-400 tabular-nums">
                      {formatCurrency(cb.clawbackAmount)}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Pending Approval
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payout forecast + commission by type */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Payout Forecast</CardTitle>
            <CardDescription>Projected commission payouts for the next 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MONTHLY_FORECAST} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={v => `R${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Forecast"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="forecast" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Commission by Sales Team</CardTitle>
            <CardDescription>Breakdown by deal type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loadingByType ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byType}
                      cx="50%" cy="45%"
                      innerRadius={50} outerRadius={72}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="dealType"
                    >
                      {(byType ?? []).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payout summary panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Payout Summary</CardTitle>
            <CardDescription>Current period commission and tax overview</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingSummary ? <Skeleton className="h-32 w-full" /> : (
              <>
                {[
                  { label: "Total Available",       value: formatCurrency(payoutSummary?.totalAvailable ?? 0),       color: "text-foreground" },
                  { label: "Estimated Tax",          value: formatCurrency(payoutSummary?.estimatedTax ?? 0),          color: "text-red-500"     },
                  { label: "Estimated Net Payout",   value: formatCurrency(payoutSummary?.estimatedNetPayout ?? 0),   color: "text-emerald-600" },
                  { label: "Payout Rate",            value: `${payoutSummary?.payoutPercentage ?? 0}%`,               color: "text-primary"     },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`font-semibold ${color}`}>{value}</span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Final approval queue */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Approvals Requiring Sign-off</CardTitle>
              <CardDescription>Items awaiting your executive approval</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/final-approvals" className="flex items-center gap-1.5 text-sm">All <ArrowRight className="h-3.5 w-3.5" /></a>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingApprovals ? (
              <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
                {approvalList.length === 0 ? (
                  <div className="px-6 py-10 text-center text-muted-foreground">
                    <BadgeCheck className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                    All approvals are up to date
                  </div>
                ) : approvalList.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-foreground truncate">
                        {a.dealName}
                      </div>
                      <div className="text-xs text-muted-foreground">{a.salesExecutiveName} · {formatDate(a.createdAt)}</div>
                    </div>
                    <div className="shrink-0 ml-4">
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

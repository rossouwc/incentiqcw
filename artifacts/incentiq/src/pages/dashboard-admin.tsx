import {
  useListUsers, useListDeals, useListApprovals, useListPayouts,
  useGetCommissionTrend, useGetCommissionByType, useGetDealsReport,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Users, Briefcase, DollarSign, AlertTriangle, CheckCircle2, ArrowUpRight,
  Clock, TrendingUp, ExternalLink, TrendingDown, RotateCcw, Scale,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";

function adminAuthHeaders(): HeadersInit {
  const t = localStorage.getItem("incentiq_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const REASON_LABELS: Record<string, string> = {
  CANCELLATION: "Cancellation", TERMINATION: "Termination", NON_PAYMENT: "Non-Payment",
  REVERSAL: "Reversal", RETURN: "Return/Refund", LAPSE: "Policy Lapse",
  NO_LONGER_QUALIFIES: "No Longer Qualifies", OTHER: "Other",
};

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: allUsers,    isLoading: loadingUsers }    = useListUsers();
  const { data: dealsPage,   isLoading: loadingDeals }    = useListDeals();
  const { data: pendingApprovals, isLoading: loadingApprovals } = useListApprovals({ status: "PENDING" });
  const { data: approvedApprovals } = useListApprovals({ status: "APPROVED" });
  const { data: pendingPayouts, isLoading: loadingPayouts } = useListPayouts({ status: "PENDING" });
  const { data: trend,       isLoading: loadingTrend }    = useGetCommissionTrend();
  const { data: byType,      isLoading: loadingByType }   = useGetCommissionByType();
  const { data: report,      isLoading: loadingReport }   = useGetDealsReport();

  const monthFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const { data: cbMonth, isLoading: loadingCbMonth } = useQuery({
    queryKey: ["admin-cb-month", monthFrom],
    queryFn: async () => { const r = await fetch(`/api/reports/clawback-summary?from=${monthFrom}`, { headers: adminAuthHeaders() }); return r.json(); },
  });
  const { data: cbAll, isLoading: loadingCbAll } = useQuery({
    queryKey: ["admin-cb-all"],
    queryFn: async () => { const r = await fetch("/api/reports/clawback-summary", { headers: adminAuthHeaders() }); return r.json(); },
  });
  const { data: cbReasons, isLoading: loadingCbReasons } = useQuery({
    queryKey: ["admin-cb-reasons"],
    queryFn: async () => { const r = await fetch("/api/reports/clawback-by-reason", { headers: adminAuthHeaders() }); return r.json(); },
  });

  const indCfg          = useIndustryConfig();
  const salesExecs      = (allUsers ?? []).filter(u => u.role === "SALES_EXECUTIVE");
  const totalDeals      = dealsPage?.total ?? 0;
  const approvalList    = pendingApprovals ?? [];
  const approvedList    = approvedApprovals ?? [];
  const payoutList      = pendingPayouts ?? [];
  const totalPendingComm = report?.totalCommission ?? 0;
  const totalPayoutReq  = payoutList.reduce((s, p) => s + p.requestedAmount, 0);

  const isLoading = loadingUsers || loadingDeals || loadingApprovals || loadingReport;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Company Dashboard</h1>
          <p className="text-muted-foreground">Overview of your team's commission activity</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/reports" className="gap-2 flex items-center"><TrendingUp className="h-4 w-4" /> Reports</a>
          </Button>
          <Button size="sm" asChild>
            <a href="/users" className="gap-2 flex items-center"><Users className="h-4 w-4" /> Manage Users</a>
          </Button>
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Sales Executives"
          value={salesExecs.length}
          sub={`${(allUsers ?? []).length} total users`}
          icon={Users}
          accent="border-l-primary"
          loading={loadingUsers}
        />
        <StatCard
          title="Total Deals"
          value={totalDeals}
          sub="in your company"
          icon={Briefcase}
          accent="border-l-blue-400"
          loading={loadingDeals}
        />
        <StatCard
          title="Commission Pending"
          value={formatCurrency(totalPendingComm)}
          sub={`${approvalList.length} items awaiting approval`}
          icon={Clock}
          accent="border-l-amber-400"
          loading={loadingReport}
        />
        <StatCard
          title="Payout Requests"
          value={formatCurrency(totalPayoutReq)}
          sub={`${payoutList.length} pending requests`}
          icon={DollarSign}
          accent="border-l-emerald-500"
          loading={loadingPayouts}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Commission Approved"
          value={approvedList.length}
          sub="approved this period"
          icon={CheckCircle2}
          accent="border-l-green-500"
          loading={loadingApprovals}
          valueColor="text-green-600"
        />
        <StatCard
          title="Total Gross Profit"
          value={formatCurrency(report?.totalGrossProfit ?? 0)}
          sub={`${report?.totalDeals ?? 0} ${indCfg.eventLabelPlural.toLowerCase()} total`}
          icon={TrendingUp}
          accent="border-l-indigo-400"
          loading={loadingReport}
        />
        <StatCard
          title="Approval Bottlenecks"
          value={approvalList.filter(a => {
            const age = Date.now() - new Date(a.createdAt).getTime();
            return age > 48 * 60 * 60 * 1000;
          }).length}
          sub="items pending > 48 hours"
          icon={AlertTriangle}
          accent="border-l-red-400"
          loading={loadingApprovals}
          valueColor={approvalList.some(a => Date.now() - new Date(a.createdAt).getTime() > 48 * 60 * 60 * 1000) ? "text-red-500" : undefined}
        />
      </div>

      {/* Clawback Risk Section */}
      {(() => {
        const cbThisMonthCount  = cbMonth?.totals?.count ?? 0;
        const cbThisMonthAmt    = cbMonth?.totals?.amount ?? 0;
        const cbOutstanding     = cbAll?.totals?.outstanding ?? 0;
        const cbWaivedRow       = (cbAll?.rows ?? []).find((r: any) => r.status === "WAIVED");
        const cbWaivedCount     = cbWaivedRow?.count ?? 0;
        const cbWaivedAmt       = cbWaivedRow?.amount ?? 0;
        const cbRate            = totalDeals > 0 ? ((cbThisMonthCount / totalDeals) * 100).toFixed(1) : "0.0";
        const topReasons        = ((cbReasons?.rows ?? []) as any[]).slice(0, 5);
        const loading           = loadingCbMonth || loadingCbAll;
        return (
          <>
            <div className="flex items-center gap-2 pt-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Clawback & Recovery</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard
                title={`${indCfg.clawbackTermPlural} This Month`}
                value={cbThisMonthCount}
                sub={formatCurrency(cbThisMonthAmt) + " total value"}
                icon={TrendingDown}
                accent="border-l-red-400"
                loading={loading}
                valueColor={cbThisMonthCount > 0 ? "text-red-500" : undefined}
              />
              <StatCard
                title="Outstanding Recovery"
                value={formatCurrency(cbOutstanding)}
                sub="across all executives"
                icon={DollarSign}
                accent="border-l-rose-500"
                loading={loading}
                valueColor={cbOutstanding > 0 ? "text-rose-600" : undefined}
              />
              <StatCard
                title="Clawback Rate"
                value={`${cbRate}%`}
                sub="of deals this month"
                icon={AlertTriangle}
                accent="border-l-orange-400"
                loading={loading}
                valueColor={parseFloat(cbRate) > 5 ? "text-orange-500" : undefined}
              />
              <StatCard
                title="Waived Clawbacks"
                value={cbWaivedCount}
                sub={formatCurrency(cbWaivedAmt) + " written off"}
                icon={Scale}
                accent="border-l-purple-400"
                loading={loading}
              />
              <StatCard
                title="Recovery Actions"
                value={((cbAll?.rows ?? []) as any[]).filter((r: any) => r.status === "PENDING_APPROVAL").reduce((s: number, r: any) => s + r.count, 0)}
                sub="pending approval"
                icon={RotateCcw}
                accent="border-l-amber-400"
                loading={loading}
                valueColor={((cbAll?.rows ?? []) as any[]).some((r: any) => r.status === "PENDING_APPROVAL" && r.count > 0) ? "text-amber-500" : undefined}
              />
            </div>

            {/* Top Clawback Reasons */}
            {topReasons.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Top {indCfg.clawbackTerm} Reasons</CardTitle>
                    <CardDescription>Breakdown by reason category (all time)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingCbReasons ? <Skeleton className="h-48 w-full" /> : (
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topReasons.map((r: any) => ({ name: REASON_LABELS[r.reasonCategory] ?? r.reasonCategory, amount: r.amount, count: r.count }))} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={v => `R${v / 1000}k`} />
                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={110} />
                            <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                            <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} opacity={0.85} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>{indCfg.clawbackTerm} Reason Details</CardTitle>
                      <CardDescription>Recovery performance by category</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href="/reports-clawbacks" className="flex items-center gap-1.5 text-sm">Full Report <ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {topReasons.map((r: any) => {
                        const pct = r.amount > 0 ? Math.min(100, (r.recovered / r.amount) * 100) : 0;
                        return (
                          <div key={r.reasonCategory} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">{REASON_LABELS[r.reasonCategory] ?? r.reasonCategory}</span>
                                <span className="text-xs text-muted-foreground ml-4 shrink-0">{r.count} case{r.count !== 1 ? "s" : ""}</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                                <span>{formatCurrency(r.recovered)} recovered</span>
                                <span>{formatCurrency(r.outstanding)} outstanding</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        );
      })()}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Commission Trend</CardTitle>
            <CardDescription>Company-wide commissions over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loadingTrend ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={v => `R${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Commission"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#adminGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Deal Type Split</CardTitle>
            <CardDescription>Commission breakdown by deal type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loadingByType ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byType}
                      cx="50%" cy="45%"
                      innerRadius={55} outerRadius={75}
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

      {/* Approval bottlenecks table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Approval Bottlenecks</CardTitle>
            <CardDescription>Items stuck in the approval pipeline</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href="/approval-workflow" className="flex items-center gap-1.5 text-sm">
              View All <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loadingApprovals ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">Requested By</th>
                    <th className="px-6 py-3 font-medium">Submitted</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                        No pending approvals — all clear!
                      </td>
                    </tr>
                  ) : approvalList.slice(0, 8).map(a => {
                    const ageMs = Date.now() - new Date(a.createdAt).getTime();
                    const ageHrs = Math.floor(ageMs / 3600000);
                    const isStale = ageHrs > 48;
                    return (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{a.dealName}</div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{a.stepName ?? `Level ${a.approvalLevel}`}</td>
                        <td className="px-6 py-4 text-muted-foreground">{a.salesExecutiveName}</td>
                        <td className="px-6 py-4">
                          <span className={`text-sm ${isStale ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                            {isStale ? `${ageHrs}h ago ⚠` : formatDate(a.createdAt)}
                          </span>
                        </td>
                        <td className="px-6 py-4"><StatusBadge status={a.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

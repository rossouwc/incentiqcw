import {
  useListDeals, useListApprovals, useGetCommissionTrend, useGetMyTasks, useListUsers,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Users, Briefcase, Clock, CheckCircle2, AlertCircle, TrendingUp, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function ManagerDashboard() {
  const { data: dealsPage,        isLoading: loadingDeals     } = useListDeals();
  const { data: pendingApprovals, isLoading: loadingApprovals } = useListApprovals({ status: "PENDING" });
  const { data: trend,            isLoading: loadingTrend     } = useGetCommissionTrend();
  const { data: myTasks,          isLoading: loadingTasks     } = useGetMyTasks();
  const { data: teamUsers,        isLoading: loadingUsers     } = useListUsers({ role: "SALES_EXECUTIVE" });

  const deals        = dealsPage?.data   ?? [];
  const approvalList = pendingApprovals  ?? [];
  const teamCount    = (teamUsers ?? []).length;
  const totalComm    = deals.reduce((s, d) => s + d.commission, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Manager Dashboard</h1>
          <p className="text-muted-foreground">Team performance and approval pipeline</p>
        </div>
        <Button size="sm" asChild>
          <a href="/approvals" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Review Approvals
            {approvalList.length > 0 && (
              <span className="ml-1 bg-white/20 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {approvalList.length}
              </span>
            )}
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Sales Team"
          value={teamCount}
          sub="sales executives"
          icon={Users}
          accent="border-l-primary"
          loading={loadingUsers}
        />
        <StatCard
          title="Team Deals"
          value={dealsPage?.total ?? 0}
          sub="total submissions"
          icon={Briefcase}
          accent="border-l-blue-400"
          loading={loadingDeals}
        />
        <StatCard
          title="Pending Approvals"
          value={approvalList.length}
          sub="awaiting your review"
          icon={Clock}
          accent="border-l-amber-400"
          loading={loadingApprovals}
          valueColor={approvalList.length > 0 ? "text-amber-500" : undefined}
        />
        <StatCard
          title="Team Commission"
          value={formatCurrency(totalComm)}
          sub="from loaded deals"
          icon={TrendingUp}
          accent="border-l-emerald-500"
          loading={loadingDeals}
        />
      </div>

      {/* Tasks summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loadingTasks ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : (
          <>
            <div className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/50 rounded-full text-amber-600"><Clock className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{myTasks?.pendingApprovals ?? 0}</div>
                <div className="text-sm text-amber-600 dark:text-amber-500">Pending Approvals</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl">
              <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-full text-green-600"><CheckCircle2 className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{myTasks?.approvedForPayroll ?? 0}</div>
                <div className="text-sm text-green-600 dark:text-green-500">Approved for Payroll</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl">
              <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-full text-red-600"><AlertCircle className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">{myTasks?.informationRequired ?? 0}</div>
                <div className="text-sm text-red-600 dark:text-red-500">Action Required</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Commission trend + pending approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Team Commission Trend</CardTitle>
            <CardDescription>Commission earned by your team over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {loadingTrend ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mgrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={v => `R${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Commission"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Area type="monotone" dataKey="amount" stroke="hsl(var(--chart-2))" strokeWidth={3} fill="url(#mgrGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Approval Queue</CardTitle>
              <CardDescription>Items awaiting review</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/approvals" className="text-sm flex items-center gap-1">All <ArrowRight className="h-3.5 w-3.5" /></a>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[260px] overflow-y-auto">
              {loadingApprovals ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : approvalList.length === 0 ? (
                <div className="px-6 py-10 text-center text-muted-foreground">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-green-500 opacity-60" />
                  All clear!
                </div>
              ) : approvalList.slice(0, 8).map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{a.referenceName ?? a.referenceId?.slice(0, 14)}</div>
                    <div className="text-xs text-muted-foreground">{a.requestedByName ?? a.requestedBy}</div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team deals table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Deals</CardTitle>
            <CardDescription>Recent deals submitted by your sales team</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href="/team-deals" className="flex items-center gap-1.5 text-sm">View All <ArrowRight className="h-3.5 w-3.5" /></a>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loadingDeals ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">Deal</th>
                    <th className="px-6 py-3 font-medium">Sales Rep</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium text-right">GP</th>
                    <th className="px-6 py-3 font-medium text-right">Commission</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No deals found</td>
                    </tr>
                  ) : deals.slice(0, 8).map(d => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{d.dealName}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{d.userName ?? "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{d.dealType.replace(/_/g, " ")}</td>
                      <td className="px-6 py-4 text-right">{formatCurrency(d.grossProfit)}</td>
                      <td className="px-6 py-4 text-right font-semibold text-primary">{formatCurrency(d.commission)}</td>
                      <td className="px-6 py-4"><StatusBadge status={d.status} /></td>
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

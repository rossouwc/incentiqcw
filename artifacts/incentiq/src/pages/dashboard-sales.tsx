import {
  useGetDashboardSummary, useGetCommissionTrend, useGetRecentActivity,
  useGetMyTasks, useListDeals,
} from "@workspace/api-client-react";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Wallet, Clock, Lock, CheckCircle2, TrendingUp, AlertCircle, Briefcase,
  ArrowRight, DollarSign,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function SalesDashboard() {
  const indCfg = useIndustryConfig();
  const { data: summary,      isLoading: loadingSummary }  = useGetDashboardSummary();
  const { data: trend,        isLoading: loadingTrend }    = useGetCommissionTrend();
  const { data: recentActivity, isLoading: loadingActivity } = useGetRecentActivity();
  const { data: myTasks,      isLoading: loadingTasks }    = useGetMyTasks();
  const { data: dealsPage,    isLoading: loadingDeals }    = useListDeals();

  const deals = dealsPage?.data ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back{summary?.userName ? `, ${summary.userName}` : ""} 👋
          </h1>
          <p className="text-muted-foreground">{summary?.dateRange ?? "Your commission overview"}</p>
        </div>
        <Button className="gap-2 self-start" asChild>
          <a href="/payouts">
            <DollarSign className="h-4 w-4" /> Request Payout
          </a>
        </Button>
      </div>

      {/* Wallet balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Available Balance"
          value={summary ? formatCurrency(summary.available) : "—"}
          sub="ready to request"
          icon={Wallet}
          accent="border-l-primary"
          loading={loadingSummary}
          valueColor="text-primary"
        />
        <StatCard
          title="Pending Approval"
          value={summary ? formatCurrency(summary.pending) : "—"}
          sub="in the approval pipeline"
          icon={Clock}
          accent="border-l-amber-400"
          loading={loadingSummary}
        />
        <StatCard
          title="Deferred"
          value={summary ? formatCurrency(summary.deferred) : "—"}
          sub="held per commission rules"
          icon={Lock}
          accent="border-l-blue-400"
          loading={loadingSummary}
        />
        <StatCard
          title="Paid YTD"
          value={summary ? formatCurrency(summary.paidYtd) : "—"}
          sub="year-to-date commissions"
          icon={CheckCircle2}
          accent="border-l-emerald-500"
          loading={loadingSummary}
        />
      </div>

      {/* Payout CTA banner */}
      {summary && summary.available > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-foreground">
              You have {formatCurrency(summary.available)} available to withdraw
            </p>
            <p className="text-sm text-muted-foreground">Submit a payout request and get paid within 3–5 business days</p>
          </div>
          <Button className="shrink-0 gap-2" asChild>
            <a href="/payouts">
              Request Payout <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      )}

      {/* Commission trend + tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>My Commission Trend</CardTitle>
            <CardDescription>Your earned commissions over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loadingTrend ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={v => `R${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Commission"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#salesGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* My Tasks */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingTasks ? <Skeleton className="w-full h-28" /> : (
                <>
                  {[
                    { label: "Pending Approvals",   value: myTasks?.pendingApprovals   ?? 0, icon: Clock,       color: "bg-amber-100 text-amber-600"  },
                    { label: "Approved for Payroll", value: myTasks?.approvedForPayroll ?? 0, icon: CheckCircle2, color: "bg-green-100 text-green-600"   },
                    { label: "Action Required",      value: myTasks?.informationRequired ?? 0, icon: AlertCircle, color: "bg-red-100 text-red-600"       },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${color}`}><Icon className="w-3.5 h-3.5" /></div>
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <span className="font-bold text-sm">{value}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick links */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Submit New Deal",    href: "/deals",   icon: Briefcase  },
                { label: "View My Wallet",     href: "/wallet",  icon: Wallet     },
                { label: "Request a Payout",   href: "/payouts", icon: DollarSign },
              ].map(({ label, href, icon: Icon }) => (
                <a key={href} href={href}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10 text-primary"><Icon className="w-3.5 h-3.5" /></div>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent deals */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>My {indCfg.eventLabelPlural} This Month</CardTitle>
            <CardDescription>Your most recent deal submissions</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href="/deals" className="flex items-center gap-1.5">View All <ArrowRight className="h-3.5 w-3.5" /></a>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loadingDeals ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">Deal</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium text-right">Gross Profit</th>
                    <th className="px-6 py-3 font-medium text-right">Commission</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No deals yet this month
                      </td>
                    </tr>
                  ) : deals.slice(0, 6).map(deal => (
                    <tr key={deal.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{deal.dealName}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(deal.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{deal.dealType.replace(/_/g, " ")}</td>
                      <td className="px-6 py-4 text-right">{formatCurrency(deal.grossProfit)}</td>
                      <td className="px-6 py-4 text-right font-semibold text-primary">{formatCurrency(deal.commission)}</td>
                      <td className="px-6 py-4"><StatusBadge status={deal.status} /></td>
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

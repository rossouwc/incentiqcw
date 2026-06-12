import { useGetDashboardSummary, useGetCommissionTrend, useGetCommissionByType, useGetPayoutSummary, useGetRecentActivity, useGetMyTasks, useListDeals } from "@workspace/api-client-react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell, RadialBarChart, RadialBar, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckCircle2, AlertCircle, Clock, ArrowUpRight, DollarSign, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function StatusBadge({ status }: { status: string }) {
  let color = "bg-gray-100 text-gray-800";
  if (status === "EXECUTIVE_APPROVED" || status === "PAID") color = "bg-green-100 text-green-800";
  if (status === "FINANCE_APPROVED") color = "bg-blue-100 text-blue-800";
  if (status === "MANAGER_APPROVED") color = "bg-amber-100 text-amber-800";
  if (status === "PENDING_APPROVAL" || status === "PENDING") color = "bg-yellow-100 text-yellow-800";
  if (status === "REJECTED") color = "bg-red-100 text-red-800";

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: trend, isLoading: isLoadingTrend } = useGetCommissionTrend();
  const { data: byType, isLoading: isLoadingByType } = useGetCommissionByType();
  const { data: payoutSummary, isLoading: isLoadingPayout } = useGetPayoutSummary();
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity();
  const { data: myTasks, isLoading: isLoadingTasks } = useGetMyTasks();
  const { data: dealsData, isLoading: isLoadingDeals } = useListDeals({ limit: 5 });

  if (isLoadingSummary) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back, {summary?.userName} 👋</h1>
          <p className="text-muted-foreground">{summary?.dateRange}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">Download Report</Button>
          <Button>New Request</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{summary ? formatCurrency(summary.available) : '-'}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-amber-400 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{summary ? formatCurrency(summary.pending) : '-'}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-400 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deferred</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{summary ? formatCurrency(summary.deferred) : '-'}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid YTD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{summary ? formatCurrency(summary.paidYtd) : '-'}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Commission Trend</CardTitle>
            <CardDescription>Your earned commissions over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {isLoadingTrend ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} tickFormatter={(value) => `R${value/1000}k`} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Commission']}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Deals by Type</CardTitle>
            <CardDescription>Breakdown of your closed deals</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[240px] w-full">
              {isLoadingByType ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byType}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="dealType"
                    >
                      {byType?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" 
                      wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Deals</CardTitle>
              <CardDescription>Your most recently submitted deals</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/deals">View All</a>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingDeals ? <Skeleton className="w-full h-[200px]" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 font-medium rounded-tl-md">Deal Name</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium text-right">Gross Profit</th>
                      <th className="px-4 py-3 font-medium text-right">Commission</th>
                      <th className="px-4 py-3 font-medium rounded-tr-md">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealsData?.data.map((deal) => (
                      <tr key={deal.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground">{deal.dealName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{deal.dealType.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(deal.grossProfit)}</td>
                        <td className="px-4 py-3 text-right font-medium text-primary">{formatCurrency(deal.commission)}</td>
                        <td className="px-4 py-3"><StatusBadge status={deal.status} /></td>
                      </tr>
                    ))}
                    {!dealsData?.data.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No recent deals found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>My Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingTasks ? <Skeleton className="w-full h-32" /> : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                        <Clock className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-sm">Pending Approvals</span>
                    </div>
                    <span className="font-bold">{myTasks?.pendingApprovals || 0}</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-sm">Approved for Payroll</span>
                    </div>
                    <span className="font-bold">{myTasks?.approvedForPayroll || 0}</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-100 p-2 rounded-full text-red-600">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-sm">Action Required</span>
                    </div>
                    <span className="font-bold">{myTasks?.informationRequired || 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingActivity ? <Skeleton className="w-full h-40" /> : (
                <div className="space-y-5">
                  {recentActivity?.map((activity, i) => (
                    <div key={activity.id} className="flex gap-3 relative">
                      {i !== recentActivity.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-[-16px] w-px bg-border"></div>
                      )}
                      <div className="flex-shrink-0 mt-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 border-background z-10 relative
                          ${activity.type === 'DEAL_APPROVED' ? 'bg-green-100 text-green-600' : 
                            activity.type === 'PAYOUT_SUBMITTED' ? 'bg-blue-100 text-blue-600' : 
                            'bg-gray-100 text-gray-600'}`}
                        >
                          {activity.type === 'DEAL_APPROVED' ? <CheckCircle2 className="w-4 h-4" /> : 
                           activity.type === 'PAYOUT_SUBMITTED' ? <DollarSign className="w-4 h-4" /> :
                           <Briefcase className="w-4 h-4" />}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-snug">{activity.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{activity.timeAgo || formatDateTime(activity.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

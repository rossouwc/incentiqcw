import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Users, DollarSign, TrendingUp, Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const TREND_DATA = [
  { month: "Jan", revenue: 180000, tenants: 4 },
  { month: "Feb", revenue: 220000, tenants: 5 },
  { month: "Mar", revenue: 195000, tenants: 5 },
  { month: "Apr", revenue: 310000, tenants: 7 },
  { month: "May", revenue: 285000, tenants: 7 },
  { month: "Jun", revenue: 390000, tenants: 9 },
];

const TENANT_DATA = [
  { id: 1, name: "TechSales ZA",   plan: "Enterprise", users: 24, status: "ACTIVE",   mrr: 4500 },
  { id: 2, name: "Demo Corp",      plan: "Growth",     users: 12, status: "ACTIVE",   mrr: 1800 },
  { id: 3, name: "FinServ Group",  plan: "Starter",    users: 5,  status: "ACTIVE",   mrr: 490  },
  { id: 4, name: "SalesForce SA",  plan: "Growth",     users: 18, status: "ACTIVE",   mrr: 1800 },
  { id: 5, name: "CommPro Ltd",    plan: "Enterprise", users: 31, status: "INACTIVE", mrr: 0    },
];

function StatCard({ title, value, sub, icon: Icon, accent }: { title: string; value: string; sub: string; icon: any; accent: string }) {
  return (
    <Card className={`border-l-4 ${accent} shadow-sm hover:shadow-md transition-all`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function PlatformDashboard() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Platform Dashboard</h1>
        <p className="text-muted-foreground">Full overview of all tenants and platform health</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Active Tenants"    value="9"           sub="+2 this month"           icon={Building2}   accent="border-l-primary" />
        <StatCard title="Total Platform Users" value="147"      sub="across all tenants"      icon={Users}       accent="border-l-blue-400" />
        <StatCard title="Platform MRR"      value={formatCurrency(23490)} sub="+18% vs last month" icon={DollarSign} accent="border-l-emerald-500" />
        <StatCard title="Avg Commissions"   value={formatCurrency(390000)} sub="processed this month" icon={TrendingUp} accent="border-l-amber-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Platform Revenue Trend</CardTitle>
            <CardDescription>Monthly commission volume across all tenants</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={TREND_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `R${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Volume"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Tenant Growth</CardTitle>
            <CardDescription>New tenants per month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={TREND_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="tenants" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Tenants</CardTitle>
            <CardDescription>All registered companies on the platform</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Company</th>
                  <th className="px-6 py-4 font-medium">Plan</th>
                  <th className="px-6 py-4 font-medium text-right">Users</th>
                  <th className="px-6 py-4 font-medium text-right">MRR</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {TENANT_DATA.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{t.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{t.plan}</td>
                    <td className="px-6 py-4 text-right">{t.users}</td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(t.mrr)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${t.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

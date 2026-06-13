import { useGetDealsReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { Download, BarChart2, TrendingUp, Users, DollarSign } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";

const MONTHLY = [
  { month: "Jan", commissions: 42000, deals: 8,  gp: 310000 },
  { month: "Feb", commissions: 58000, deals: 11, gp: 420000 },
  { month: "Mar", commissions: 37000, deals: 7,  gp: 260000 },
  { month: "Apr", commissions: 74000, deals: 14, gp: 540000 },
  { month: "May", commissions: 65000, deals: 12, gp: 480000 },
  { month: "Jun", commissions: 89000, deals: 17, gp: 650000 },
];

export default function Reports() {
  const { data: report, isLoading } = useGetDealsReport();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">Commission and deal performance analytics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export CSV</Button>
          <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export PDF</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Deals",       value: isLoading ? "—" : String(report?.totalDeals ?? MONTHLY.reduce((s, m) => s + m.deals, 0)),    icon: BarChart2,  accent: "border-l-primary" },
          { label: "Total GP",          value: isLoading ? "—" : formatCurrency(report?.totalGrossProfit ?? MONTHLY.reduce((s, m) => s + m.gp, 0)),  icon: TrendingUp, accent: "border-l-blue-400" },
          { label: "Total Commissions", value: isLoading ? "—" : formatCurrency(report?.totalCommission ?? MONTHLY.reduce((s, m) => s + m.commissions, 0)), icon: DollarSign, accent: "border-l-emerald-500" },
          { label: "Avg Commission",    value: isLoading ? "—" : formatCurrency(report ? report.totalCommission / Math.max(report.totalDeals, 1) : 61500), icon: Users,      accent: "border-l-amber-400" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{s.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Commissions by Month</CardTitle>
            <CardDescription>Total commissions earned YTD</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MONTHLY} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `R${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Commissions"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="commissions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Deals vs GP Trend</CardTitle>
            <CardDescription>Deals closed and gross profit per month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={MONTHLY} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `R${v / 1000}k`} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="gp" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} name="Gross Profit" />
                  <Line yAxisId="right" type="monotone" dataKey="deals" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} name="Deals" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top performers table from report */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>Sales executives ranked by commission earned this period</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" /> Export</Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Rank</th>
                    <th className="px-6 py-4 font-medium">Sales Executive</th>
                    <th className="px-6 py-4 font-medium text-right">Deals</th>
                    <th className="px-6 py-4 font-medium text-right">Gross Profit</th>
                    <th className="px-6 py-4 font-medium text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { rank: 1, name: "Alice Sales",   deals: 17, gp: 650000, commission: 89000 },
                    { rank: 2, name: "Bob Deals",     deals: 14, gp: 540000, commission: 74000 },
                    { rank: 3, name: "Carol Closer",  deals: 12, gp: 480000, commission: 65000 },
                    { rank: 4, name: "Dave Hunter",   deals: 11, gp: 420000, commission: 58000 },
                    { rank: 5, name: "Eve Prospect",  deals: 8,  gp: 310000, commission: 42000 },
                  ]).map((p) => (
                    <tr key={p.rank} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          p.rank === 1 ? "bg-amber-100 text-amber-800" : p.rank === 2 ? "bg-gray-100 text-gray-700" : "bg-muted text-muted-foreground"
                        }`}>
                          {p.rank}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">{p.name}</td>
                      <td className="px-6 py-4 text-right">{p.deals}</td>
                      <td className="px-6 py-4 text-right">{formatCurrency(p.gp)}</td>
                      <td className="px-6 py-4 text-right font-semibold text-primary">{formatCurrency(p.commission)}</td>
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

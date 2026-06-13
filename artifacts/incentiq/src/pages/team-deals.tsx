import { useState } from "react";
import { useListDeals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Search, Users, TrendingUp, DollarSign, Briefcase } from "lucide-react";

export default function TeamDeals() {
  const [search, setSearch] = useState("");
  const { data: dealsData, isLoading } = useListDeals({ limit: 100 });
  const deals = dealsData?.data ?? [];
  const filtered = deals.filter((d: any) =>
    !search ||
    d.dealName?.toLowerCase().includes(search.toLowerCase()) ||
    d.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const totalGp = deals.reduce((s: number, d: any) => s + (d.grossProfit ?? 0), 0);
  const totalComm = deals.reduce((s: number, d: any) => s + (d.commission ?? 0), 0);
  const pending = deals.filter((d: any) => d.status === "PENDING_APPROVAL").length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Team Deals</h1>
        <p className="text-muted-foreground">All deals submitted by your team</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Deals",       value: isLoading ? "—" : String(deals.length),           icon: Briefcase,  accent: "border-l-primary" },
          { label: "Pending Approval",  value: isLoading ? "—" : String(pending),                icon: Users,      accent: "border-l-amber-400" },
          { label: "Total GP",          value: isLoading ? "—" : formatCurrency(totalGp),        icon: TrendingUp, accent: "border-l-blue-400" },
          { label: "Total Commission",  value: isLoading ? "—" : formatCurrency(totalComm),      icon: DollarSign, accent: "border-l-emerald-500" },
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

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search deals..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Deal</th>
                    <th className="px-6 py-4 font-medium">Rep</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium text-right">Gross Profit</th>
                    <th className="px-6 py-4 font-medium text-right">Commission</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No deals found</td></tr>
                  ) : filtered.map((d: any) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{d.dealName}</div>
                        <div className="text-xs text-muted-foreground">{d.customerName}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{d.userName ?? d.userId?.slice(0, 8)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{d.dealType?.replace(/_/g, " ")}</td>
                      <td className="px-6 py-4 text-right">{formatCurrency(d.grossProfit)}</td>
                      <td className="px-6 py-4 text-right font-medium text-primary">{formatCurrency(d.commission)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(d.createdAt)}</td>
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

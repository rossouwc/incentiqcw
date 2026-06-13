import { useState } from "react";
import { useListCommissionRules } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, MoreHorizontal, Sliders } from "lucide-react";

const DEAL_TYPE_COLORS: Record<string, string> = {
  NEW_BUSINESS:  "bg-green-100 text-green-800",
  RENEWAL:       "bg-blue-100 text-blue-800",
  UPSELL:        "bg-purple-100 text-purple-800",
  CROSS_SELL:    "bg-amber-100 text-amber-800",
};

export default function CommissionRules() {
  const [search, setSearch] = useState("");
  const { data: rules, isLoading } = useListCommissionRules();
  const list = Array.isArray(rules) ? rules : (rules as any)?.data ?? [];
  const filtered = list.filter((r: any) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Commission Rules</h1>
          <p className="text-muted-foreground">Configure how commissions are calculated for each deal type</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Rule</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Rules</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{list.length}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Rules</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{list.filter((r: any) => r.isActive !== false).length}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Deal Types Covered</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{new Set(list.map((r: any) => r.dealType)).size}</div>}</CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search rules..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Rule Name</th>
                    <th className="px-6 py-4 font-medium">Deal Type</th>
                    <th className="px-6 py-4 font-medium text-right">Rate</th>
                    <th className="px-6 py-4 font-medium">Basis</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        <Sliders className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No commission rules found
                      </td>
                    </tr>
                  ) : filtered.map((r: any) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{r.name}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[r.dealType] ?? "bg-gray-100 text-gray-800"}`}>
                          {r.dealType?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-primary">
                        {r.rateType === "PERCENTAGE" ? `${r.rate}%` : `R${r.rate}`}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{r.basis?.replace(/_/g, " ") ?? "Gross Profit"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${r.isActive !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                          {r.isActive !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </td>
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

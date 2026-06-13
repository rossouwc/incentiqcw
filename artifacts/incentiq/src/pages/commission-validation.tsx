import { useListDeals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { ListChecks, AlertTriangle, CheckCircle2, DollarSign } from "lucide-react";

export default function CommissionValidation() {
  const { data: dealsData, isLoading } = useListDeals({ status: "MANAGER_APPROVED", limit: 100 });
  const deals = dealsData?.data ?? [];
  const totalCommission = deals.reduce((s: number, d: any) => s + (d.commission ?? 0), 0);
  const totalGp = deals.reduce((s: number, d: any) => s + (d.grossProfit ?? 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Commission Validation</h1>
        <p className="text-muted-foreground">Verify GP figures and commission amounts before finance approval</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Awaiting Validation",  value: isLoading ? "—" : String(deals.length),          icon: ListChecks,     accent: "border-l-amber-400" },
          { label: "Total GP to Validate", value: isLoading ? "—" : formatCurrency(totalGp),       icon: DollarSign,     accent: "border-l-blue-400" },
          { label: "Total Commission",     value: isLoading ? "—" : formatCurrency(totalCommission),icon: CheckCircle2,   accent: "border-l-primary" },
          { label: "Discrepancies",        value: "0",                                              icon: AlertTriangle,  accent: "border-l-red-400" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{s.value}</div>}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Deals Pending Finance Validation</CardTitle>
          <CardDescription>Manager-approved deals that require finance verification of GP and commission</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Deal</th>
                    <th className="px-6 py-4 font-medium">Sales Rep</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium text-right">Reported GP</th>
                    <th className="px-6 py-4 font-medium text-right">Commission</th>
                    <th className="px-6 py-4 font-medium text-right">Eff. Rate</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                        <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No deals pending validation
                      </td>
                    </tr>
                  ) : deals.map((d: any) => {
                    const rate = d.grossProfit > 0 ? ((d.commission / d.grossProfit) * 100).toFixed(1) : "—";
                    return (
                      <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{d.dealName}</div>
                          <div className="text-xs text-muted-foreground">{d.customerName}</div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{d.userName ?? "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{d.dealType?.replace(/_/g, " ")}</td>
                        <td className="px-6 py-4 text-right">{formatCurrency(d.grossProfit)}</td>
                        <td className="px-6 py-4 text-right font-medium text-primary">{formatCurrency(d.commission)}</td>
                        <td className="px-6 py-4 text-right text-muted-foreground">{rate}%</td>
                        <td className="px-6 py-4 text-muted-foreground">{formatDate(d.createdAt)}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8 gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Validate
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
                              <AlertTriangle className="h-3.5 w-3.5" /> Flag
                            </Button>
                          </div>
                        </td>
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

import { useState } from "react";
import { useListPayouts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { Download, Receipt, CheckCircle2, DollarSign, FileText } from "lucide-react";

const PERIODS = [
  { label: "June 2026",      value: "2026-06" },
  { label: "May 2026",       value: "2026-05" },
  { label: "April 2026",     value: "2026-04" },
  { label: "March 2026",     value: "2026-03" },
];

export default function PayrollExport() {
  const [period, setPeriod] = useState("2026-06");
  const { data: payoutsData, isLoading } = useListPayouts({ status: "APPROVED" });
  const list = Array.isArray(payoutsData) ? payoutsData : (payoutsData as any)?.data ?? [];
  const total = list.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);

  const handleExport = (format: "csv" | "pdf") => {
    alert(`Exporting ${format.toUpperCase()} for ${period}…`);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payroll Export</h1>
          <p className="text-muted-foreground">Export approved commissions for payroll processing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => handleExport("csv")}><Download className="h-4 w-4" /> CSV</Button>
          <Button className="gap-2" onClick={() => handleExport("pdf")}><Download className="h-4 w-4" /> PDF / EFT</Button>
        </div>
      </div>

      {/* Period selector */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Select Pay Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  period === p.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Records to Export</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{list.length}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payout Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatCurrency(total)}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">Ready</div></CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Approved Payouts — {PERIODS.find(p => p.value === period)?.label}</CardTitle>
            <CardDescription>These records will be included in the payroll export</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2"><FileText className="h-4 w-4" /> Preview</Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Employee</th>
                    <th className="px-6 py-4 font-medium">Reference</th>
                    <th className="px-6 py-4 font-medium text-right">Net Amount</th>
                    <th className="px-6 py-4 font-medium">Bank</th>
                    <th className="px-6 py-4 font-medium">Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No approved payouts for this period
                      </td>
                    </tr>
                  ) : list.map((p: any) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{p.userName ?? p.userId?.slice(0, 8)}</td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{p.id.slice(0, 12)}…</td>
                      <td className="px-6 py-4 text-right font-semibold text-emerald-600">{formatCurrency(p.amount)}</td>
                      <td className="px-6 py-4 text-muted-foreground">FNB ••••{Math.floor(Math.random() * 9000 + 1000)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(p.updatedAt ?? p.createdAt)}</td>
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

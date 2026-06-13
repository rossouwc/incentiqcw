import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPayouts,
  useMarkPayoutPaid,
  useExportPayouts,
  getListPayoutsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  Download, Receipt, CheckCircle2, DollarSign,
  Users, FileSpreadsheet, Loader2, AlertCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

function getRecentMonths(count: number): { label: string; value: string }[] {
  const months: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }),
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return months;
}

export default function PayrollExport() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const markPaid = useMarkPayoutPaid();
  const [confirmPayout, setConfirmPayout] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportingMonth, setExportingMonth] = useState<string | null>(null);

  const PERIODS = getRecentMonths(8);
  const [period, setPeriod] = useState(PERIODS[0].value);

  const { data: payoutsData, isLoading } = useListPayouts();
  const list: any[] = (Array.isArray(payoutsData) ? payoutsData : (payoutsData as any)?.data ?? [])
    .filter((p: any) => p.status === "FINANCE_APPROVED");

  const filteredList = useMemo(
    () => list.filter((p: any) => !period || p.payoutMonth === period),
    [list, period]
  );

  const totalNet = filteredList.reduce((s: number, p: any) => s + p.estimatedNetPayout, 0);
  const totalGross = filteredList.reduce((s: number, p: any) => s + p.requestedAmount, 0);
  const uniqueEmployees = new Set(filteredList.map((p: any) => p.userId)).size;

  const openConfirm = (payout: any) => {
    setConfirmPayout(payout);
    setConfirmOpen(true);
  };

  const handleMarkPaid = async () => {
    if (!confirmPayout) return;
    try {
      await markPaid.mutateAsync({ payoutId: confirmPayout.id });
      qc.invalidateQueries({ queryKey: getListPayoutsQueryKey() });
      toast({
        title: "Payout marked as paid",
        description: `${confirmPayout.userName} — ${formatCurrency(confirmPayout.requestedAmount)} processed.`,
      });
      setConfirmOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to mark as paid", description: err?.response?.data?.error ?? "Please try again", variant: "destructive" });
    }
  };

  const handleExportExcel = async () => {
    setExportingMonth(period);
    try {
      const rows = filteredList.map((p: any, idx: number) => ({
        "#": idx + 1,
        "Employee Name": p.userName,
        "Payout Month": p.payoutMonth,
        "Gross Amount (ZAR)": p.requestedAmount,
        "Estimated Tax (ZAR)": p.estimatedTax,
        "Net Payout (ZAR)": p.estimatedNetPayout,
        "Approved Date": p.approvedAt ? formatDate(p.approvedAt) : "—",
        "Reference": p.id,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      // Column widths
      ws["!cols"] = [
        { wch: 4 }, { wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 32 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Approved Payouts");

      // Summary sheet
      const summaryData = [
        { Field: "Period", Value: PERIODS.find((p) => p.value === period)?.label ?? period },
        { Field: "Records", Value: rows.length },
        { Field: "Total Gross (ZAR)", Value: totalGross },
        { Field: "Total Net (ZAR)", Value: totalNet },
        { Field: "Unique Employees", Value: uniqueEmployees },
        { Field: "Generated At", Value: new Date().toLocaleString("en-ZA") },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      wsSummary["!cols"] = [{ wch: 22 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      XLSX.writeFile(wb, `Incentiq_Payroll_${period}.xlsx`);
      toast({ title: "Excel exported", description: `Incentiq_Payroll_${period}.xlsx downloaded.` });
    } catch {
      toast({ title: "Export failed", description: "Please try again", variant: "destructive" });
    } finally {
      setExportingMonth(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payroll Processing</h1>
          <p className="text-muted-foreground">Mark approved payouts as paid and export for payroll</p>
        </div>
        <Button
          className="gap-2"
          onClick={handleExportExcel}
          disabled={filteredList.length === 0 || !!exportingMonth}
        >
          {exportingMonth ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Export to Excel
        </Button>
      </div>

      {/* Period selector */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Pay Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
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

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Records to Process</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{filteredList.length}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Net Payout</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold text-emerald-500">{formatCurrency(totalNet)}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique Recipients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{uniqueEmployees}</div>}</CardContent>
        </Card>
      </div>

      {/* Payouts table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Approved Payouts — {PERIODS.find((p) => p.value === period)?.label ?? period}</CardTitle>
            <CardDescription>Finance-approved payouts ready for salary processing</CardDescription>
          </div>
          {filteredList.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" />
              <span>{filteredList.length} record{filteredList.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Employee</th>
                    <th className="px-6 py-4 font-medium text-right">Gross</th>
                    <th className="px-6 py-4 font-medium text-right">Tax</th>
                    <th className="px-6 py-4 font-medium text-right">Net Payout</th>
                    <th className="px-6 py-4 font-medium">Month</th>
                    <th className="px-6 py-4 font-medium">Approved</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No approved payouts for this period
                      </td>
                    </tr>
                  ) : filteredList.map((p: any) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{p.userName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 10)}…</div>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">{formatCurrency(p.requestedAmount)}</td>
                      <td className="px-6 py-4 text-right text-red-400 text-xs">- {formatCurrency(p.estimatedTax)}</td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-500">{formatCurrency(p.estimatedNetPayout)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.payoutMonth}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{p.approvedAt ? formatDate(p.approvedAt) : "—"}</td>
                      <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                      <td className="px-6 py-4">
                        <Button
                          size="sm"
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => openConfirm(p)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredList.length > 0 && (
                <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-between text-sm">
                  <span className="text-muted-foreground">{filteredList.length} record{filteredList.length !== 1 ? "s" : ""} · Total gross: {formatCurrency(totalGross)}</span>
                  <span className="font-semibold text-emerald-500">Net total: {formatCurrency(totalNet)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm mark paid dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
          </DialogHeader>
          {confirmPayout && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{confirmPayout.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross amount</span>
                  <span className="font-semibold">{formatCurrency(confirmPayout.requestedAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. tax deducted</span>
                  <span className="text-red-400">- {formatCurrency(confirmPayout.estimatedTax)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-medium">Net payout</span>
                  <span className="font-bold text-emerald-500">{formatCurrency(confirmPayout.estimatedNetPayout)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Month</span>
                  <span>{confirmPayout.payoutMonth}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">This will mark the payout as paid and notify the employee. This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                <Button onClick={handleMarkPaid} disabled={markPaid.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  {markPaid.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {markPaid.isPending ? "Processing…" : "Confirm & Mark Paid"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

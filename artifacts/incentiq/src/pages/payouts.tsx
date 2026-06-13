import { useState } from "react";
import { useListPayouts, useCreatePayout } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, CreditCard, Clock, CheckCircle2, DollarSign } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Payouts() {
  const { user } = useAuth();
  const isSalesExec = user?.role === "SALES_EXECUTIVE";
  const { data: payouts, isLoading, refetch } = useListPayouts();
  const createPayout = useCreatePayout();
  const list = Array.isArray(payouts) ? payouts : (payouts as any)?.data ?? [];

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createPayout.mutateAsync({ data: { amount: parseFloat(amount), notes } });
    setOpen(false);
    setAmount("");
    setNotes("");
    refetch();
  };

  const pending = list.filter((p: any) => p.status === "PENDING").length;
  const approved = list.filter((p: any) => p.status === "APPROVED" || p.status === "PAID").length;
  const totalRequested = list.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payout Requests</h1>
          <p className="text-muted-foreground">{isSalesExec ? "Track and request your commission payouts" : "Review and manage payout requests"}</p>
        </div>
        {isSalesExec && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Request Payout</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Payout</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Amount (ZAR)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 15000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    placeholder="Any notes for the finance team..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createPayout.isPending}>
                    {createPayout.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{pending}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved / Paid</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{approved}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Requested</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatCurrency(totalRequested)}</div>}</CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Payout History</CardTitle>
          <CardDescription>All payout requests and their current status</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Request ID</th>
                    {!isSalesExec && <th className="px-6 py-4 font-medium">Sales Rep</th>}
                    <th className="px-6 py-4 font-medium text-right">Amount</th>
                    <th className="px-6 py-4 font-medium">Requested</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Notes</th>
                    {!isSalesExec && <th className="px-6 py-4 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No payout requests yet
                      </td>
                    </tr>
                  ) : list.map((p: any) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}…</td>
                      {!isSalesExec && <td className="px-6 py-4 text-foreground">{p.userName ?? p.userId}</td>}
                      <td className="px-6 py-4 text-right font-semibold">{formatCurrency(p.amount)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(p.createdAt)}</td>
                      <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                      <td className="px-6 py-4 text-muted-foreground text-xs max-w-xs truncate">{p.notes ?? "—"}</td>
                      {!isSalesExec && (
                        <td className="px-6 py-4">
                          {p.status === "PENDING" && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50">Approve</Button>
                              <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-50">Reject</Button>
                            </div>
                          )}
                        </td>
                      )}
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

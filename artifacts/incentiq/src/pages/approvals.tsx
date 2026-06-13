import { useListApprovals, useActionApproval } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { CheckCircle2, XCircle, Clock, CheckSquare } from "lucide-react";
import { useState } from "react";

export default function Approvals() {
  const { data: approvals, isLoading, refetch } = useListApprovals({ status: "PENDING" });
  const actionApproval = useActionApproval();
  const list = Array.isArray(approvals) ? approvals : (approvals as any)?.data ?? [];
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAction = async (id: string, action: "APPROVE" | "REJECT") => {
    setProcessing(id);
    try {
      await actionApproval.mutateAsync({ approvalId: id, data: { action, notes: "" } });
      refetch();
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Pending Approvals</h1>
        <p className="text-muted-foreground">Deals awaiting your review and approval</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{list.length}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatCurrency(list.reduce((s: number, a: any) => s + (a.commissionAmount ?? a.deal?.commission ?? 0), 0))}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total GP Value</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatCurrency(list.reduce((s: number, a: any) => s + (a.deal?.grossProfit ?? a.grossProfit ?? 0), 0))}</div>}</CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Deals Pending Approval</CardTitle>
          <CardDescription>Review each deal and approve or reject</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Deal</th>
                    <th className="px-6 py-4 font-medium">Sales Rep</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium text-right">GP</th>
                    <th className="px-6 py-4 font-medium text-right">Commission</th>
                    <th className="px-6 py-4 font-medium">Submitted</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                        All caught up! No pending approvals.
                      </td>
                    </tr>
                  ) : list.map((a: any) => {
                    const deal = a.deal ?? a;
                    return (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{deal.dealName ?? a.dealName}</div>
                          <div className="text-xs text-muted-foreground">{deal.customerName ?? a.customerName}</div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{a.userName ?? a.submittedByName ?? deal.userName}</td>
                        <td className="px-6 py-4 text-muted-foreground">{(deal.dealType ?? a.dealType)?.replace(/_/g, " ")}</td>
                        <td className="px-6 py-4 text-right">{formatCurrency(deal.grossProfit ?? a.grossProfit ?? 0)}</td>
                        <td className="px-6 py-4 text-right font-medium text-primary">{formatCurrency(a.commissionAmount ?? deal.commission ?? 0)}</td>
                        <td className="px-6 py-4 text-muted-foreground">{formatDate(a.createdAt)}</td>
                        <td className="px-6 py-4"><StatusBadge status={a.status ?? "PENDING_APPROVAL"} /></td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white h-8"
                              onClick={() => handleAction(a.id, "APPROVE")}
                              disabled={processing === a.id}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-red-700 border-red-300 hover:bg-red-50 h-8"
                              onClick={() => handleAction(a.id, "REJECT")}
                              disabled={processing === a.id}
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
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

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPayouts,
  useUpdatePayoutStatus,
  getListPayoutsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Clock, Users, AlertCircle, DollarSign, MessageSquare } from "lucide-react";

type Filter = "ALL" | "PENDING" | "FINANCE_APPROVED" | "REJECTED";

export default function ApprovedPayouts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateStatus = useUpdatePayoutStatus();

  const [filter, setFilter] = useState<Filter>("PENDING");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState<"FINANCE_APPROVED" | "REJECTED">("FINANCE_APPROVED");
  const [reviewerComments, setReviewerComments] = useState("");

  const queryParams = filter === "ALL" ? undefined : { status: filter };
  const { data: payoutsData, isLoading } = useListPayouts(queryParams);
  const list: any[] = Array.isArray(payoutsData) ? payoutsData : (payoutsData as any)?.data ?? [];

  const { data: allData } = useListPayouts();
  const all: any[] = Array.isArray(allData) ? allData : (allData as any)?.data ?? [];
  const pendingCount = all.filter((p: any) => p.status === "PENDING").length;
  const approvedCount = all.filter((p: any) => p.status === "FINANCE_APPROVED").length;
  const totalPendingValue = all.filter((p: any) => p.status === "PENDING").reduce((s: number, p: any) => s + p.requestedAmount, 0);

  const openReview = (payout: any, action: "FINANCE_APPROVED" | "REJECTED") => {
    setSelectedPayout(payout);
    setReviewAction(action);
    setReviewerComments("");
    setReviewOpen(true);
  };

  const handleReview = async () => {
    if (!selectedPayout) return;
    try {
      await updateStatus.mutateAsync({
        payoutId: selectedPayout.id,
        data: { status: reviewAction, ...(reviewerComments && { reviewerComments }) },
      });
      qc.invalidateQueries({ queryKey: getListPayoutsQueryKey() });
      toast({
        title: reviewAction === "FINANCE_APPROVED" ? "Payout approved" : "Payout rejected",
        description: reviewAction === "FINANCE_APPROVED"
          ? `${selectedPayout.userName}'s payout has been approved and sent to payroll.`
          : `${selectedPayout.userName}'s payout has been rejected. Funds returned to their wallet.`,
      });
      setReviewOpen(false);
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.response?.data?.error ?? "Please try again", variant: "destructive" });
    }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "PENDING", label: "Pending" },
    { key: "FINANCE_APPROVED", label: "Approved" },
    { key: "REJECTED", label: "Rejected" },
    { key: "ALL", label: "All" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Payout Review</h1>
        <p className="text-muted-foreground">Review, approve, or reject commission payout requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{pendingCount}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent to Payroll</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{approvedCount}</div>}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pending Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatCurrency(totalPendingValue)}</div>}</CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-foreground hover:bg-muted"
            }`}
          >
            {f.label}
            {f.key === "PENDING" && pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-400 text-amber-900 text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>
            {filter === "PENDING" ? "Pending Requests" : filter === "FINANCE_APPROVED" ? "Approved — Sent to Payroll" : filter === "REJECTED" ? "Rejected Requests" : "All Payout Requests"}
          </CardTitle>
          <CardDescription>
            {filter === "PENDING" ? "Review these requests and approve or reject them" : "Historical record of payout decisions"}
          </CardDescription>
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
                    <th className="px-6 py-4 font-medium text-right">Net</th>
                    <th className="px-6 py-4 font-medium">Month</th>
                    <th className="px-6 py-4 font-medium">Requested</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Comments</th>
                    {filter === "PENDING" && <th className="px-6 py-4 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        {filter === "PENDING" ? "No pending payout requests" : "No records found"}
                      </td>
                    </tr>
                  ) : list.map((p: any) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{p.userName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 10)}…</div>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">{formatCurrency(p.requestedAmount)}</td>
                      <td className="px-6 py-4 text-right text-red-400 text-xs">- {formatCurrency(p.estimatedTax)}</td>
                      <td className="px-6 py-4 text-right text-emerald-500 font-semibold">{formatCurrency(p.estimatedNetPayout)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.payoutMonth}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{formatDate(p.requestedAt)}</td>
                      <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                      <td className="px-6 py-4 text-xs text-muted-foreground max-w-xs">
                        {p.comments && <span className="block truncate">{p.comments}</span>}
                        {p.reviewerComments && <span className="block truncate text-amber-400">You: {p.reviewerComments}</span>}
                        {!p.comments && !p.reviewerComments && "—"}
                      </td>
                      {filter === "PENDING" && (
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                              onClick={() => openReview(p, "FINANCE_APPROVED")}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5 text-red-500 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                              onClick={() => openReview(p, "REJECTED")}>
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </Button>
                          </div>
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

      {/* Review dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={reviewAction === "FINANCE_APPROVED" ? "text-emerald-500" : "text-red-500"}>
              {reviewAction === "FINANCE_APPROVED" ? "Approve Payout Request" : "Reject Payout Request"}
            </DialogTitle>
          </DialogHeader>
          {selectedPayout && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{selectedPayout.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross amount</span>
                  <span className="font-semibold">{formatCurrency(selectedPayout.requestedAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated tax</span>
                  <span className="text-red-400">- {formatCurrency(selectedPayout.estimatedTax)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-muted-foreground">Net payout</span>
                  <span className="font-bold text-emerald-500">{formatCurrency(selectedPayout.estimatedNetPayout)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payout month</span>
                  <span>{selectedPayout.payoutMonth}</span>
                </div>
                {selectedPayout.comments && (
                  <div className="border-t border-border pt-2">
                    <span className="text-muted-foreground block mb-1">Employee note:</span>
                    <span className="text-foreground italic">"{selectedPayout.comments}"</span>
                  </div>
                )}
              </div>

              {reviewAction === "REJECTED" && (
                <div className="flex items-start gap-2 text-xs bg-red-500/10 border border-red-500/20 rounded-md p-2 text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Rejecting will return the full amount to the employee's available wallet balance.
                </div>
              )}

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Comments <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Textarea
                  placeholder={reviewAction === "FINANCE_APPROVED" ? "Any notes for payroll…" : "Reason for rejection…"}
                  value={reviewerComments}
                  onChange={(e) => setReviewerComments(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleReview}
                  disabled={updateStatus.isPending}
                  className={reviewAction === "FINANCE_APPROVED" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                >
                  {updateStatus.isPending ? "Processing…" : reviewAction === "FINANCE_APPROVED" ? "Approve & Send to Payroll" : "Reject Request"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

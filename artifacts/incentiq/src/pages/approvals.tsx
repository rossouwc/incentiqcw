import { useState } from "react";
import {
  useListApprovals,
  useActionApproval,
  useGetDealApprovals,
  type Approval,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, MessageSquare,
  ChevronDown, CheckSquare, DollarSign, RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ActionType = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

interface ActionDialogProps {
  approval: Approval | null;
  onClose: () => void;
  onAction: (action: ActionType, comments: string) => Promise<void>;
  submitting: boolean;
}

function ApprovalChain({ dealId }: { dealId: string }) {
  const { data, isLoading } = useGetDealApprovals(dealId);
  const chain = Array.isArray(data) ? data : [];
  if (isLoading) return <div className="text-xs text-muted-foreground">Loading chain…</div>;
  if (!chain.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {chain.map((step: any, i: number) => {
        const statusCls =
          step.status === "APPROVED" ? "bg-green-100 text-green-700 border-green-300"
          : step.status === "REJECTED" ? "bg-red-100 text-red-700 border-red-300"
          : step.status === "CHANGES_REQUESTED" ? "bg-orange-100 text-orange-700 border-orange-300"
          : "bg-yellow-50 text-yellow-700 border-yellow-200";
        return (
          <div key={step.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/40 text-xs">→</span>}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${statusCls}`}>
              {step.status === "APPROVED" && <CheckCircle2 className="h-3 w-3" />}
              {step.status === "REJECTED" && <XCircle className="h-3 w-3" />}
              {step.status === "CHANGES_REQUESTED" && <RotateCcw className="h-3 w-3" />}
              {step.status === "PENDING" && <Clock className="h-3 w-3" />}
              {step.stepName ?? `Level ${step.approvalLevel}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ActionDialog({ approval, onClose, onAction, submitting }: ActionDialogProps) {
  const [comments, setComments] = useState("");
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);

  if (!approval) return null;

  const handleAction = async (action: ActionType) => {
    if (["REJECT", "REQUEST_CHANGES"].includes(action) && !comments.trim()) {
      setPendingAction(action);
      return;
    }
    await onAction(action, comments);
  };

  const requiresComment = pendingAction !== null && !comments.trim();

  return (
    <Dialog open={!!approval} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Review Deal</DialogTitle>
          <DialogDescription>
            Review the deal details and choose an action.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Deal summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{approval.dealName}</p>
                <p className="text-sm text-muted-foreground">{approval.customerName}</p>
              </div>
              <Badge variant="outline" className="shrink-0">
                Level {approval.approvalLevel}{approval.stepName ? ` – ${approval.stepName}` : ""}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Sales Rep</span>
                <p className="font-medium text-foreground">{approval.salesExecutiveName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Commission</span>
                <p className="font-semibold text-primary text-base">
                  {formatCurrency(approval.calculatedCommission)}
                </p>
              </div>
            </div>
            <ApprovalChain dealId={approval.dealId} />
          </div>

          {/* Comments */}
          <div className="space-y-1.5">
            <Label htmlFor="comments" className="text-sm font-medium">
              Comments{" "}
              <span className="text-muted-foreground font-normal">
                (required for Reject / Request Changes)
              </span>
            </Label>
            {requiresComment && (
              <p className="text-xs text-red-600">Please add a comment before {pendingAction === "REJECT" ? "rejecting" : "requesting changes"}.</p>
            )}
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => { setComments(e.target.value); setPendingAction(null); }}
              placeholder="Add comments or feedback for the sales executive…"
              rows={3}
              className={requiresComment ? "border-red-400" : ""}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white"
              disabled={submitting}
              onClick={() => handleAction("APPROVE")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 border-orange-400 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
              disabled={submitting}
              onClick={() => handleAction("REQUEST_CHANGES")}
            >
              <RotateCcw className="h-4 w-4" />
              Request Changes
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 border-red-400 text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
              disabled={submitting}
              onClick={() => handleAction("REJECT")}
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
          </div>

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  title?: string;
  description?: string;
}

export default function Approvals({ title = "Pending Approvals", description = "Deals awaiting your review and approval" }: Props) {
  const { data: approvals, isLoading, refetch } = useListApprovals({ status: "PENDING" });
  const actionApproval = useActionApproval();
  const { toast } = useToast();
  const list: Approval[] = Array.isArray(approvals) ? approvals : (approvals as any)?.data ?? [];

  const [selected, setSelected] = useState<Approval | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalCommission = list.reduce((s, a) => s + (a.calculatedCommission ?? 0), 0);

  const handleAction = async (action: ActionType, comments: string) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await actionApproval.mutateAsync({
        approvalId: selected.id,
        data: { action, comments },
      });
      toast({
        title:
          action === "APPROVE" ? "Deal approved"
          : action === "REJECT" ? "Deal rejected"
          : "Changes requested",
        description:
          action === "APPROVE" ? `${selected.dealName} has been approved and moved to the next stage.`
          : action === "REJECT" ? `${selected.dealName} has been rejected.`
          : `${selected.dealName} has been sent back for changes.`,
      });
      setSelected(null);
      refetch();
    } catch (err: any) {
      toast({
        title: "Action failed",
        description: err?.message ?? "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{list.length}</div>}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission at Stake</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold">{formatCurrency(totalCommission)}</div>
            )}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Actions Available</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <Badge className="bg-green-100 text-green-800 border-green-300 gap-1 text-xs font-normal"><CheckCircle2 className="h-3 w-3" />Approve</Badge>
              <Badge className="bg-orange-100 text-orange-800 border-orange-300 gap-1 text-xs font-normal"><RotateCcw className="h-3 w-3" />Changes</Badge>
              <Badge className="bg-red-100 text-red-800 border-red-300 gap-1 text-xs font-normal"><XCircle className="h-3 w-3" />Reject</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Deals Pending Your Approval</CardTitle>
          <CardDescription>Click "Review" to approve, reject, or request changes with comments</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : list.length === 0 ? (
            <div className="px-6 py-16 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
              <p className="font-medium">All caught up!</p>
              <p className="text-sm mt-1">No pending approvals for your role.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Deal</th>
                    <th className="px-6 py-4 font-medium">Sales Rep</th>
                    <th className="px-6 py-4 font-medium">Approval Step</th>
                    <th className="px-6 py-4 font-medium text-right">Commission</th>
                    <th className="px-6 py-4 font-medium">Submitted</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{a.dealName}</div>
                        <div className="text-xs text-muted-foreground">{a.customerName}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{a.salesExecutiveName}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium">{a.stepName ?? `Level ${a.approvalLevel}`}</div>
                        <div className="text-xs text-muted-foreground">{a.approverRole}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-primary">
                        {formatCurrency(a.calculatedCommission)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{formatDate(a.createdAt)}</td>
                      <td className="px-6 py-4"><StatusBadge status={a.status} /></td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => setSelected(a)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ActionDialog
        approval={selected}
        onClose={() => setSelected(null)}
        onAction={handleAction}
        submitting={submitting}
      />
    </div>
  );
}

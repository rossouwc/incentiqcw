import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListApprovals,
  useActionApproval,
  useGetDealApprovals,
  getListApprovalsQueryKey,
  type Approval,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  CheckCircle2, XCircle, Clock, MessageSquare,
  DollarSign, RotateCcw, Wallet, ArrowRight,
  Search, X, User, ChevronDown, FileText, ExternalLink,
  Paperclip, TrendingUp, Calculator, CalendarDays,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

type ActionType = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

interface ActionDialogProps {
  approval: Approval | null;
  onClose: () => void;
  onAction: (action: ActionType, comments: string, payoutAmount?: number) => Promise<void>;
  submitting: boolean;
}

// ── Auth helper ────────────────────────────────────────────────────────────────
function getAuthHeaders(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Commission Breakdown ───────────────────────────────────────────────────────

interface Breakdown {
  eventType: string;
  revenueAmount: number;
  costAmount: number;
  grossProfitAmount: number;
  commissionBaseAmount: number;
  commissionPercentage: number;
}

function CommissionBreakdown({ bd }: { bd: Breakdown }) {
  const [open, setOpen] = useState(false);
  const gp = bd.grossProfitAmount;
  const gpMargin = bd.revenueAmount > 0 ? ((gp / bd.revenueAmount) * 100).toFixed(1) : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors text-sm text-left">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <Calculator className="h-3.5 w-3.5 text-primary" />
            How was this commission calculated?
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-md border border-border bg-card overflow-hidden text-sm">
          <div className="px-3 py-1.5 bg-muted/30 border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calculation breakdown</span>
          </div>
          <div className="divide-y divide-border">
            {bd.revenueAmount > 0 && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-medium tabular-nums">{formatCurrency(bd.revenueAmount)}</span>
              </div>
            )}
            {bd.costAmount > 0 && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Cost of Sale</span>
                <span className="font-medium tabular-nums text-red-600 dark:text-red-400">− {formatCurrency(bd.costAmount)}</span>
              </div>
            )}
            {gp > 0 && (
              <div className="flex justify-between px-3 py-2 bg-muted/20">
                <span className="text-muted-foreground font-medium">Gross Profit{gpMargin ? ` (${gpMargin}%)` : ""}</span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(gp)}</span>
              </div>
            )}
            {bd.commissionBaseAmount !== bd.grossProfitAmount && bd.commissionBaseAmount > 0 && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Commission Base</span>
                <span className="font-medium tabular-nums">{formatCurrency(bd.commissionBaseAmount)}</span>
              </div>
            )}
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Commission Rate</span>
              <span className="font-medium tabular-nums">{bd.commissionPercentage}%</span>
            </div>
            <div className="flex justify-between px-3 py-2.5 bg-primary/5 border-t-2 border-primary/20">
              <span className="font-semibold text-foreground">Calculated Commission</span>
              <span className="font-bold text-primary tabular-nums">
                {formatCurrency((bd.commissionBaseAmount > 0 ? bd.commissionBaseAmount : bd.revenueAmount) * bd.commissionPercentage / 100)}
              </span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Key Dates ─────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function camelToWords(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function extractDateFields(data: Record<string, unknown>) {
  return Object.entries(data)
    .filter(([, v]) => typeof v === "string" && ISO_DATE_RE.test(v as string))
    .sort(([, a], [, b]) => (a as string).localeCompare(b as string))
    .map(([k, v]) => ({
      label: camelToWords(k),
      value: new Date((v as string) + "T00:00:00").toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric",
      }),
    }));
}

// ── Supporting Documents ───────────────────────────────────────────────────────

interface CommDoc {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  description: string | null;
  uploadedByName: string;
  createdAt: string;
}

async function openSecureFile(fileUrl: string) {
  const apiPath = `/api/storage/objects${fileUrl.replace(/^\/objects/, "")}`;
  try {
    const res = await fetch(apiPath, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch {
    alert("Unable to open document. Please try again.");
  }
}

function SupportingDocuments({ dealId }: { dealId: string }) {
  const [docs, setDocs] = useState<CommDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/commission-events/${dealId}/documents`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [dealId]);

  if (loading) return (
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-full" />
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Supporting Documents</span>
        {docs.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{docs.length}</Badge>
        )}
      </div>
      {docs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic pl-5">No supporting documents attached.</p>
      ) : (
        <div className="space-y-1">
          {docs.map((doc) =>
            doc.documentType === "FILE" ? (
              <button
                key={doc.id}
                type="button"
                disabled={opening === doc.id}
                onClick={async () => {
                  setOpening(doc.id);
                  await openSecureFile(doc.fileUrl);
                  setOpening(null);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors group text-left disabled:opacity-60"
              >
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:underline">{doc.fileName}</p>
                  {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
                  <p className="text-[10px] text-muted-foreground">by {doc.uploadedByName}</p>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ) : (
              <a
                key={doc.id}
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors group"
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:underline">{doc.fileName}</p>
                  {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
                  <p className="text-[10px] text-muted-foreground">by {doc.uploadedByName}</p>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )
          )}
        </div>
      )}
    </div>
  );
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

// ─── Standard approve/reject/changes dialog ──────────────────────────────────

function StandardActionDialog({ approval, onClose, onAction, submitting }: ActionDialogProps) {
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
  const breakdown = (approval as any).commissionBreakdown as Breakdown | undefined;
  const dateFields = extractDateFields((approval as any).eventDataJson ?? {});

  return (
    <Dialog open={!!approval} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground">Review Commission</DialogTitle>
          <DialogDescription>Review all details below before taking an action.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-0.5">
          {/* Deal summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{approval.dealName}</p>
                <p className="text-sm text-muted-foreground">{approval.customerName}</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-xs">
                Level {approval.approvalLevel}{approval.stepName ? ` – ${approval.stepName}` : ""}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Sales Rep</span>
                <p className="font-medium text-foreground">{approval.salesExecutiveName}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Commission</span>
                <p className="font-semibold text-primary text-lg">{formatCurrency(approval.calculatedCommission)}</p>
              </div>
            </div>
            <ApprovalChain dealId={approval.dealId} />
          </div>

          {/* Commission breakdown */}
          {breakdown && (
            <CommissionBreakdown bd={breakdown} />
          )}

          {/* Key dates */}
          {dateFields.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <CalendarDays className="h-3.5 w-3.5" />
                Key Dates
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                {dateFields.map((df) => (
                  <div key={df.label}>
                    <span className="text-muted-foreground text-xs">{df.label}</span>
                    <p className="font-medium text-foreground">{df.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supporting documents */}
          <SupportingDocuments dealId={approval.dealId} />

          {/* Comments */}
          <div className="space-y-1.5">
            <Label htmlFor="comments" className="text-sm font-medium">
              Comments <span className="text-muted-foreground font-normal">(required for Reject / Request Changes)</span>
            </Label>
            {requiresComment && (
              <p className="text-xs text-red-600">Please add a comment before {pendingAction === "REJECT" ? "rejecting" : "requesting changes"}.</p>
            )}
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => { setComments(e.target.value); setPendingAction(null); }}
              placeholder="Add comments or feedback…"
              rows={3}
              className={requiresComment ? "border-red-400" : ""}
            />
          </div>
        </div>

        {/* Actions — fixed at the bottom */}
        <div className="space-y-2 pt-2 shrink-0 border-t border-border mt-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white" disabled={submitting} onClick={() => handleAction("APPROVE")}>
              <CheckCircle2 className="h-4 w-4" />Approve
            </Button>
            <Button variant="outline" className="flex-1 gap-2 border-orange-400 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950" disabled={submitting} onClick={() => handleAction("REQUEST_CHANGES")}>
              <RotateCcw className="h-4 w-4" />Request Changes
            </Button>
            <Button variant="outline" className="flex-1 gap-2 border-red-400 text-red-700 hover:bg-red-50 dark:hover:bg-red-950" disabled={submitting} onClick={() => handleAction("REJECT")}>
              <XCircle className="h-4 w-4" />Reject
            </Button>
          </div>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose} disabled={submitting}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sales Executive Payout Confirmation dialog ───────────────────────────────

function ConfirmPayoutDialog({ approval, onClose, onAction, submitting }: ActionDialogProps) {
  const [payoutAmount, setPayoutAmount] = useState("");
  const [comments, setComments] = useState("");

  if (!approval) return null;

  const commission = approval.calculatedCommission ?? 0;
  const parsed = parseFloat(payoutAmount.replace(/,/g, ""));
  const isValid = !isNaN(parsed) && parsed > 0 && parsed <= commission;
  const tax = isValid ? parsed * 0.25 : 0;
  const net = isValid ? parsed - tax : 0;

  const handleConfirm = async () => {
    if (!isValid) return;
    await onAction("APPROVE", comments, parsed);
  };

  const handleRequestChanges = async () => {
    if (!comments.trim()) return;
    await onAction("REQUEST_CHANGES", comments);
  };

  return (
    <Dialog open={!!approval} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Wallet className="h-5 w-5 text-teal-600" />
            Confirm Your Payout Amount
          </DialogTitle>
          <DialogDescription>
            Your commission has been approved and credited to your wallet. Choose how much you want included in this salary payout — it will go to Payroll for processing.
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
                {approval.stepName ?? `Level ${approval.approvalLevel}`}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-md bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 p-3 text-center">
                <p className="text-xs text-teal-600 dark:text-teal-400 font-medium uppercase tracking-wide mb-0.5">Approved Commission</p>
                <p className="text-xl font-bold text-teal-700 dark:text-teal-300">{formatCurrency(commission)}</p>
                <p className="text-xs text-teal-500 mt-0.5">Available in your wallet</p>
              </div>
            </div>
            <ApprovalChain dealId={approval.dealId} />
          </div>

          {/* Payout amount input */}
          <div className="space-y-2">
            <Label htmlFor="payout-amount" className="text-sm font-medium">
              Payout amount for this salary cycle
              <span className="text-muted-foreground font-normal"> (max {formatCurrency(commission)})</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">R</span>
              <Input
                id="payout-amount"
                className="pl-7"
                placeholder="0.00"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                type="number"
                min={0}
                max={commission}
                step={0.01}
              />
            </div>
            {payoutAmount && !isValid && (
              <p className="text-xs text-red-600">
                {parsed > commission
                  ? `Cannot exceed the approved commission of ${formatCurrency(commission)}`
                  : "Please enter a valid amount greater than zero"}
              </p>
            )}
          </div>

          {/* Tax estimate */}
          {isValid && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross payout</span>
                <span className="font-medium">{formatCurrency(parsed)}</span>
              </div>
              <div className="flex justify-between text-orange-600 dark:text-orange-400">
                <span>Estimated tax (25%)</span>
                <span>– {formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1">
                <span>Estimated net payout</span>
                <span className="text-green-600 dark:text-green-400">{formatCurrency(net)}</span>
              </div>
            </div>
          )}

          {/* Flow indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            <Wallet className="h-3.5 w-3.5 text-teal-500" />
            <span>Your wallet</span>
            <ArrowRight className="h-3 w-3" />
            <span className="font-medium text-foreground">Your confirmation</span>
            <ArrowRight className="h-3 w-3" />
            <span>Payroll processing</span>
          </div>

          {/* Optional comments */}
          <div className="space-y-1.5">
            <Label htmlFor="exec-comments" className="text-sm font-medium">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="exec-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Any notes for Payroll…"
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              className="flex-1 gap-2 bg-teal-600 hover:bg-teal-700 text-white"
              disabled={submitting || !isValid}
              onClick={handleConfirm}
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm Payout Amount
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 border-orange-400 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
              disabled={submitting || !comments.trim()}
              onClick={handleRequestChanges}
            >
              <RotateCcw className="h-4 w-4" />
              Request Changes
            </Button>
          </div>
          {!comments.trim() && (
            <p className="text-xs text-muted-foreground text-center -mt-1">
              Request Changes requires a comment explaining what needs to change.
            </p>
          )}
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose} disabled={submitting}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface Props {
  title?: string;
  description?: string;
}

export default function Approvals({ title = "Pending Approvals", description }: Props) {
  const indCfg = useIndustryConfig();
  const resolvedDescription = description ?? `${indCfg.eventLabelPlural} awaiting your review and approval`;
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: getListApprovalsQueryKey({ status: "PENDING" }) });

  const { data: approvals, isLoading } = useListApprovals({ status: "PENDING" });
  const actionApproval = useActionApproval();
  const { toast } = useToast();
  const list: Approval[] = Array.isArray(approvals) ? approvals : (approvals as any)?.data ?? [];

  const [selected, setSelected] = useState<Approval | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [execFilter, setExecFilter] = useState("all");

  // Unique sales execs for the filter dropdown
  const salesExecs = useMemo(() => {
    const map = new Map<string, string>();
    list.forEach((a) => {
      if (a.salesExecutiveName) map.set(a.salesExecutiveName, a.salesExecutiveName);
    });
    return Array.from(map.values()).sort();
  }, [list]);

  const hasFilters = search.trim() !== "" || execFilter !== "all";

  function applyFilters(items: Approval[]) {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      const matchesSearch =
        !q ||
        a.dealName?.toLowerCase().includes(q) ||
        a.customerName?.toLowerCase().includes(q) ||
        a.salesExecutiveName?.toLowerCase().includes(q) ||
        a.stepName?.toLowerCase().includes(q);
      const matchesExec = execFilter === "all" || a.salesExecutiveName === execFilter;
      return matchesSearch && matchesExec;
    });
  }

  const totalCommission = list.reduce((s, a) => s + (a.calculatedCommission ?? 0), 0);
  const salesExecConfirmations = applyFilters(list.filter((a) => a.approverRole === "SALES_EXECUTIVE"));
  const standardApprovals = applyFilters(list.filter((a) => a.approverRole !== "SALES_EXECUTIVE"));

  const handleAction = async (action: ActionType, comments: string, payoutAmount?: number) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await actionApproval.mutateAsync({
        approvalId: selected.id,
        data: { action, comments, ...(payoutAmount ? { payoutAmount } : {}) },
      });
      toast({
        title:
          action === "APPROVE"
            ? selected.approverRole === "SALES_EXECUTIVE" ? "Payout confirmed" : "Deal approved"
            : action === "REJECT" ? "Deal rejected"
            : "Changes requested",
        description:
          action === "APPROVE" && selected.approverRole === "SALES_EXECUTIVE"
            ? `Your payout request for ${formatCurrency(payoutAmount ?? 0)} has been sent to Payroll.`
            : action === "APPROVE"
            ? `${selected.dealName} has been approved and moved to the next stage.`
            : action === "REJECT"
            ? `${selected.dealName} has been rejected.`
            : `${selected.dealName} has been sent back for changes.`,
      });
      setSelected(null);
      invalidate();
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

  const dialogProps = { approval: selected, onClose: () => setSelected(null), onAction: handleAction, submitting };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{resolvedDescription}</p>
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
        <Card className="border-l-4 border-l-teal-400 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your Confirmations</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{salesExecConfirmations.length}</div>
                {salesExecConfirmations.length > 0 && (
                  <Badge className="bg-teal-100 text-teal-700 border-teal-300 text-xs">Action required</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search deal, customer, rep…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={execFilter} onValueChange={setExecFilter}>
            <SelectTrigger className="h-9 w-48 text-sm">
              <SelectValue placeholder="All sales reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sales reps</SelectItem>
              {salesExecs.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-muted-foreground hover:text-foreground gap-1.5"
              onClick={() => { setSearch(""); setExecFilter("all"); }}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {hasFilters && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {standardApprovals.length + salesExecConfirmations.length} result{standardApprovals.length + salesExecConfirmations.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Sales Exec Confirmation section */}
      {salesExecConfirmations.length > 0 && (
        <Card className="shadow-sm border-teal-300 dark:border-teal-700">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-teal-600" />
              <div>
                <CardTitle className="text-base">Commission Payout Confirmations</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Your commission has been approved and is in your wallet. Confirm the amount you want paid out this salary cycle — it will go straight to Payroll.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">Deal</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium text-right">Commission in Wallet</th>
                    <th className="px-6 py-3 font-medium">Step</th>
                    <th className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {salesExecConfirmations.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{a.dealName}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{a.customerName}</td>
                      <td className="px-6 py-4 text-right font-semibold text-teal-600 dark:text-teal-400 text-base">
                        {formatCurrency(a.calculatedCommission)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-teal-100 text-teal-700 border-teal-300 text-xs">
                          {a.stepName ?? "Sales Exec Confirmation"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                          onClick={() => setSelected(a)}
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          Confirm Payout
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Standard approvals table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{indCfg.eventLabelPlural} Pending Your Approval</CardTitle>
          <CardDescription>Click "Review" to approve, reject, or request changes with comments</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : standardApprovals.length === 0 ? (
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
                  {standardApprovals.map((a) => (
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
                        <Button size="sm" className="h-8 gap-1.5" onClick={() => setSelected(a)}>
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

      {/* Render the correct dialog based on step type */}
      {selected?.approverRole === "SALES_EXECUTIVE" ? (
        <ConfirmPayoutDialog {...dialogProps} />
      ) : (
        <StandardActionDialog {...dialogProps} />
      )}
    </div>
  );
}

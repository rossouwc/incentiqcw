import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RotateCcw, AlertTriangle, CheckCircle2, XCircle, Loader2, Plus,
  DollarSign, Clock, TrendingDown, Search, ChevronDown, ChevronUp,
  Eye, Trash2, Scale, MessageSquare, Wallet, ArrowRightLeft, CalendarRange,
  Building2, ChevronsUpDown, Check, Calendar,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Clawback {
  id: string;
  commissionEventId: string;
  eventTitle: string;
  salesExecutiveId: string;
  salesExecutiveName: string;
  clawbackType: string;
  reasonCategory: string;
  reason: string;
  originalCommissionAmount: number;
  clawbackAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  proRataFactor: number | null;
  componentDescription: string | null;
  status: string;
  notes: string | null;
  waiveReason: string | null;
  disputeNote: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  createdByName: string;
  approvedByName: string | null;
  createdAt: string;
  recoveries: Recovery[];
  approvalSteps: ApprovalStep[];
  approvalCurrentStep: number | null;
  walletPendingTxId: string | null;
  recoveryStatus: string;
}

interface Recovery {
  id: string;
  recoveryMethod: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

interface ApprovalStep {
  id: string;
  stepOrder: number;
  stepName: string;
  approverRole: string;
  status: string;
  comments: string | null;
  approvedById: string | null;
  approvedAt: string | null;
}

interface CommissionEventOption {
  id: string;
  eventTitle: string;
  calculatedCommissionAmount: number;
  approvalStatus: string;
  salesExecutiveName: string;
  customerName: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

const CLAWBACK_TYPE_LABELS: Record<string, string> = {
  FULL:              "Full Clawback",
  PARTIAL:           "Partial Clawback",
  PRO_RATA:          "Pro-Rata",
  FIXED_AMOUNT:      "Fixed Amount",
  COMPONENT:         "Component-Level",
  MANUAL_ADJUSTMENT: "Manual Adjustment",
};

const REASON_LABELS: Record<string, string> = {
  CANCELLATION:        "Cancellation",
  TERMINATION:         "Termination",
  NON_PAYMENT:         "Non-Payment",
  REVERSAL:            "Reversal",
  RETURN:              "Return/Refund",
  LAPSE:               "Policy Lapse",
  NO_LONGER_QUALIFIES: "No Longer Qualifies",
  OTHER:               "Other",
};

const RECOVERY_LABELS: Record<string, string> = {
  WALLET_DEDUCTION:        "Wallet Deduction",
  FUTURE_COMMISSION_OFFSET: "Future Commission Offset",
  PAYROLL_DEDUCTION:       "Payroll Deduction",
  MANUAL_PAYMENT:          "Manual Payment",
  WAIVED:                  "Waived",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT:             { label: "Draft",             cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  PENDING_APPROVAL:  { label: "Pending Approval",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  APPROVED:          { label: "Approved",          cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  DECLINED:          { label: "Declined",          cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  CANCELLED:         { label: "Cancelled",         cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  WAIVED:            { label: "Waived",            cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  DISPUTED:          { label: "Disputed",          cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  EXECUTED:          { label: "Executed",          cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  CHANGES_REQUESTED: { label: "Changes Requested", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
};

const RECOVERY_STATUS_CONFIG: Record<string, { label: string; cls: string; barCls: string }> = {
  PENDING:              { label: "Pending",             cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",         barCls: "bg-slate-400" },
  RECOVERY_IN_PROGRESS: { label: "In Progress",         cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",          barCls: "bg-blue-500" },
  PARTIALLY_RECOVERED:  { label: "Partially Recovered", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",      barCls: "bg-amber-500" },
  FULLY_RECOVERED:      { label: "Fully Recovered",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", barCls: "bg-emerald-500" },
};

const RECOVERY_METHOD_ICON: Record<string, string> = {
  WALLET_DEDUCTION:        "💳",
  FUTURE_COMMISSION_OFFSET: "📅",
  PAYROLL_DEDUCTION:        "🗂",
  MANUAL_PAYMENT:           "💵",
  WAIVED:                   "~",
  FUTURE_OFFSET:            "📅",
  MANUAL:                   "💵",
};

const STEP_STATUS_CONFIG: Record<string, { label: string; icon: string; cls: string }> = {
  PENDING:           { label: "Pending",           icon: "●", cls: "text-muted-foreground" },
  APPROVED:          { label: "Approved",          icon: "✓", cls: "text-green-600 dark:text-green-400" },
  REJECTED:          { label: "Rejected",          icon: "✕", cls: "text-red-600 dark:text-red-400" },
  WAIVED:            { label: "Waived",            icon: "~", cls: "text-purple-600 dark:text-purple-400" },
  DISPUTED:          { label: "Disputed",          icon: "!", cls: "text-orange-600 dark:text-orange-400" },
  CHANGES_REQUESTED: { label: "Changes Requested", icon: "↩", cls: "text-yellow-600 dark:text-yellow-500" },
  SKIPPED:           { label: "Skipped",           icon: "»", cls: "text-muted-foreground" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function RecoveryProgress({ cb }: { cb: Clawback }) {
  if (cb.status === "WAIVED") return <span className="text-xs text-purple-600 dark:text-purple-400">Waived</span>;
  if (cb.clawbackAmount <= 0) return null;
  const pct = Math.min(100, (cb.recoveredAmount / cb.clawbackAmount) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">
        {formatCurrency(cb.recoveredAmount)} / {formatCurrency(cb.clawbackAmount)} recovered
      </span>
    </div>
  );
}

// ── Create Clawback Modal ─────────────────────────────────────────────────────

function CreateClawbackModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const isSalesExec = user?.role === "SALES_EXECUTIVE";
  const { toast } = useToast();
  const { clawbackTerm } = useIndustryConfig();
  const [events, setEvents] = useState<CommissionEventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CommissionEventOption | null>(null);
  const [clawbackType, setClawbackType] = useState("FULL");
  const [reasonCategory, setReasonCategory] = useState("CANCELLATION");
  const [reason, setReason] = useState("");
  const [clawbackAmount, setClawbackAmount] = useState("");
  const [proRataFactor, setProRataFactor] = useState("");
  const [componentDescription, setComponentDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Early termination calculator
  const [contractStart, setContractStart] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [originalEnd, setOriginalEnd] = useState("");

  const termCalc = useMemo(() => {
    if (reasonCategory !== "TERMINATION" || !contractStart || !terminationDate || !originalEnd) return null;
    const s = new Date(contractStart);
    const t = new Date(terminationDate);
    const e = new Date(originalEnd);
    if ([s, t, e].some((d) => isNaN(d.getTime()))) return null;
    if (t >= e || s >= e) return null;
    const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375;
    const totalMonths = Math.round((e.getTime() - s.getTime()) / msPerMonth);
    const remainingMonths = Math.round((e.getTime() - t.getTime()) / msPerMonth);
    if (totalMonths <= 0) return null;
    const factor = Math.min(1, Math.max(0, remainingMonths / totalMonths));
    return { totalMonths, remainingMonths, factor };
  }, [reasonCategory, contractStart, terminationDate, originalEnd]);

  // Auto-fill clawback amount when termination calculator has a result
  useEffect(() => {
    if (termCalc && selectedEvent) {
      setProRataFactor(termCalc.factor.toFixed(4));
      setClawbackAmount((selectedEvent.calculatedCommissionAmount * termCalc.factor).toFixed(2));
    }
  }, [termCalc, selectedEvent]);

  // Auto-switch to PRO_RATA type when TERMINATION is selected
  useEffect(() => {
    if (reasonCategory === "TERMINATION") setClawbackType("PRO_RATA");
  }, [reasonCategory]);

  useEffect(() => {
    if (!open) return;
    setEventsLoading(true);
    fetch("/api/commission-events/clawback-eligible", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const evts = (Array.isArray(d) ? d : d.data ?? []).map((e: any) => ({
          id: e.id,
          eventTitle: e.eventTitle,
          calculatedCommissionAmount: e.calculatedCommissionAmount,
          approvalStatus: e.approvalStatus,
          salesExecutiveName: e.salesExecutiveName ?? "",
          customerName: e.customerName ?? null,
          projectStartDate: e.projectStartDate ?? null,
          projectEndDate: e.projectEndDate ?? null,
        }));
        setEvents(evts);
      })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedEventId(""); setSelectedEvent(null); setClawbackType("FULL");
      setReasonCategory("CANCELLATION"); setReason(""); setClawbackAmount("");
      setProRataFactor(""); setComponentDescription(""); setNotes("");
      setContractStart(""); setTerminationDate(""); setOriginalEnd("");
      setPickerOpen(false);
    }
  }, [open]);

  useEffect(() => {
    const ev = events.find((e) => e.id === selectedEventId) ?? null;
    setSelectedEvent(ev);
    if (ev) {
      if (clawbackType === "FULL") setClawbackAmount(ev.calculatedCommissionAmount.toFixed(2));
      else if (clawbackType === "PRO_RATA" && proRataFactor) {
        setClawbackAmount((ev.calculatedCommissionAmount * parseFloat(proRataFactor || "0")).toFixed(2));
      }
      // Auto-populate contract dates from event data
      if (ev.projectStartDate) setContractStart(ev.projectStartDate);
      if (ev.projectEndDate) setOriginalEnd(ev.projectEndDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, events, clawbackType]);

  useEffect(() => {
    if (selectedEvent && clawbackType === "PRO_RATA" && proRataFactor) {
      const factor = Math.min(1, Math.max(0, parseFloat(proRataFactor) || 0));
      setClawbackAmount((selectedEvent.calculatedCommissionAmount * factor).toFixed(2));
    }
  }, [proRataFactor, clawbackType, selectedEvent]);

  async function handleSubmit() {
    if (!selectedEventId || !reason.trim() || !clawbackAmount) return;
    setSubmitting(true);
    try {
      let finalNotes = notes.trim();
      if (termCalc && reasonCategory === "TERMINATION") {
        const ctx = `[Early Termination] Contract: ${contractStart} → ${originalEnd} (${termCalc.totalMonths} months). Terminated: ${terminationDate} — ${termCalc.remainingMonths} months remaining (${(termCalc.factor * 100).toFixed(1)}% pro-rata factor).`;
        finalNotes = finalNotes ? `${ctx}\n\n${finalNotes}` : ctx;
      }
      const body: any = {
        commissionEventId: selectedEventId,
        clawbackType,
        reasonCategory,
        reason: reason.trim(),
        clawbackAmount: parseFloat(clawbackAmount),
        notes: finalNotes || undefined,
      };
      if (clawbackType === "PRO_RATA") body.proRataFactor = parseFloat(proRataFactor) || 0;
      if (clawbackType === "COMPONENT") body.componentDescription = componentDescription.trim();

      const res = await fetch("/api/clawbacks", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create clawback");
      }
      toast({
        title: "Clawback created",
        description: isSalesExec ? "Finance has been notified and will review." : "The sales executive has been notified.",
      });
      onCreated();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const maxAmount = selectedEvent?.calculatedCommissionAmount ?? 0;
  const parsedAmount = parseFloat(clawbackAmount) || 0;
  const amountValid = parsedAmount > 0 && parsedAmount <= maxAmount + 0.01;
  const canSubmit = selectedEventId && reason.trim() && clawbackAmount && amountValid &&
    (clawbackType !== "COMPONENT" || componentDescription.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <DialogTitle>Create {clawbackTerm}</DialogTitle>
          </div>
          <DialogDescription>
            Record a commission clawback against an approved or in-approval deal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Event selection — combobox */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Commission Event <span className="text-destructive">*</span>
            </Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-sm text-left transition-colors bg-background hover:bg-muted/40 ${
                    pickerOpen ? "border-primary ring-1 ring-primary/30" : "border-border"
                  }`}
                >
                  {selectedEvent ? (
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{selectedEvent.eventTitle}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[selectedEvent.customerName, !isSalesExec && selectedEvent.salesExecutiveName].filter(Boolean).join(" · ")}
                        {" · "}
                        <span className="text-primary font-mono">{formatCurrency(selectedEvent.calculatedCommissionAmount)}</span>
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground flex-1">
                      {eventsLoading ? "Loading deals…" : "Select a commission event…"}
                    </span>
                  )}
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-[var(--radix-popover-trigger-width)]"
                align="start"
                sideOffset={4}
              >
                <Command>
                  <CommandInput placeholder="Search by deal, customer, or rep…" className="h-9" />
                  <CommandList className="max-h-72">
                    {eventsLoading ? (
                      <div className="p-3 space-y-2">
                        {[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : (
                      <>
                        <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                          No eligible deals found.
                          <br />
                          <span className="text-xs">Only deals with credited commission are eligible.</span>
                        </CommandEmpty>
                        <CommandGroup>
                          {events.map((ev) => (
                            <CommandItem
                              key={ev.id}
                              value={`${ev.eventTitle} ${ev.customerName ?? ""} ${ev.salesExecutiveName}`}
                              onSelect={() => {
                                setSelectedEventId(ev.id);
                                setPickerOpen(false);
                              }}
                              className="flex items-start gap-3 py-2.5 cursor-pointer"
                            >
                              <div className="mt-0.5 shrink-0">
                                <Check className={`h-3.5 w-3.5 ${selectedEventId === ev.id ? "text-primary opacity-100" : "opacity-0"}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{ev.eventTitle}</p>
                                <div className="flex flex-wrap gap-x-3 mt-0.5">
                                  {ev.customerName && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Building2 className="h-3 w-3 shrink-0" />{ev.customerName}
                                    </span>
                                  )}
                                  {!isSalesExec && ev.salesExecutiveName && (
                                    <span className="text-xs text-muted-foreground">{ev.salesExecutiveName}</span>
                                  )}
                                  {ev.projectStartDate && ev.projectEndDate && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Calendar className="h-3 w-3 shrink-0" />
                                      {ev.projectStartDate} → {ev.projectEndDate}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs font-mono text-primary shrink-0 mt-0.5">
                                {formatCurrency(ev.calculatedCommissionAmount)}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Clawback type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Clawback Type <span className="text-destructive">*</span></Label>
              <Select value={clawbackType} onValueChange={setClawbackType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLAWBACK_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason Category <span className="text-destructive">*</span></Label>
              <Select value={reasonCategory} onValueChange={setReasonCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount fields */}
          <div className="grid grid-cols-2 gap-4">
            {clawbackType === "PRO_RATA" && (
              <div className="space-y-1.5">
                <Label>Pro-Rata Factor (0–1) <span className="text-destructive">*</span></Label>
                <Input
                  type="number" min="0" max="1" step="0.01"
                  placeholder="e.g. 0.5 for 50%"
                  value={proRataFactor}
                  onChange={(e) => setProRataFactor(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                Clawback Amount (ZAR) <span className="text-destructive">*</span>
                {selectedEvent && (
                  <span className="text-muted-foreground font-normal ml-1 text-xs">
                    max {formatCurrency(selectedEvent.calculatedCommissionAmount)}
                  </span>
                )}
              </Label>
              <Input
                type="number" min="0" step="0.01"
                placeholder="0.00"
                value={clawbackAmount}
                readOnly={clawbackType === "FULL"}
                onChange={(e) => setClawbackAmount(e.target.value)}
                className={!amountValid && clawbackAmount ? "border-red-400" : ""}
              />
              {!amountValid && clawbackAmount && (
                <p className="text-xs text-red-500">
                  Amount must be between 1 and {formatCurrency(maxAmount)}.
                </p>
              )}
            </div>
          </div>

          {/* Component description */}
          {clawbackType === "COMPONENT" && (
            <div className="space-y-1.5">
              <Label>Component Description <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Hardware component, recurring fee portion…"
                value={componentDescription}
                onChange={(e) => setComponentDescription(e.target.value)}
              />
            </div>
          )}

          {/* Early Termination Calculator */}
          {reasonCategory === "TERMINATION" && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10 p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                  Early Termination Calculator
                </p>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Enter the contract dates to auto-calculate the pro-rata clawback. This context is sent to Finance.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Contract Start <span className="text-destructive">*</span></Label>
                  <Input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} className="text-xs h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Termination Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} className="text-xs h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Original End Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={originalEnd} onChange={(e) => setOriginalEnd(e.target.value)} className="text-xs h-8" />
                </div>
              </div>
              {termCalc ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-background/60 border border-border px-2 py-2">
                    <p className="text-[10px] text-muted-foreground">Total Duration</p>
                    <p className="text-sm font-semibold">{termCalc.totalMonths} mo</p>
                  </div>
                  <div className="rounded-md bg-background/60 border border-border px-2 py-2">
                    <p className="text-[10px] text-muted-foreground">Remaining Months</p>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{termCalc.remainingMonths} mo</p>
                  </div>
                  <div className="rounded-md bg-background/60 border border-border px-2 py-2">
                    <p className="text-[10px] text-muted-foreground">Clawback Factor</p>
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">{(termCalc.factor * 100).toFixed(1)}%</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Enter all three dates — clawback amount will auto-calculate.</p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Explain why this commission is being clawed back…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Internal notes */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground font-normal">Internal Notes (optional)</Label>
            <Textarea
              placeholder="Any additional notes for the record…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
            Create {clawbackTerm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Execute Clawback Modal ────────────────────────────────────────────────────
// The recovery engine runs the cascade automatically:
//   1) Deduct from wallet available balance
//   2) Future commission offset for remainder
//   3) Payroll deduction (if tenant allows it)

function ExecuteModal({
  clawback,
  onClose,
  onDone,
}: {
  clawback: Clawback | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { clawbackTerm } = useIndustryConfig();
  const [submitting, setSubmitting] = useState(false);

  if (!clawback) return null;

  async function handleExecute() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clawbacks/${clawback!.id}/action`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: "EXECUTE" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to execute clawback");
      }
      toast({ title: "Recovery engine started", description: "Wallet deduction + future offset applied automatically." });
      onDone(); onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const outstanding = clawback.outstandingAmount;

  return (
    <Dialog open={!!clawback} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-red-500" />
            <DialogTitle>Execute {clawbackTerm} Recovery</DialogTitle>
          </div>
          <DialogDescription>
            Recover <strong>{formatCurrency(outstanding)}</strong> from{" "}
            <strong>{clawback.salesExecutiveName}</strong> for "{clawback.eventTitle}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <p className="text-sm text-muted-foreground">
            The recovery engine will automatically cascade through the priority order:
          </p>
          <div className="space-y-2 text-sm">
            {[
              { step: "1", icon: "💳", label: "Wallet Balance",          desc: "Deducts from available balance immediately" },
              { step: "2", icon: "📅", label: "Future Commission Offset", desc: "Remainder offset against next approved commission" },
              { step: "3", icon: "🗂",  label: "Payroll Deduction",       desc: "Fallback if enabled by your organisation settings" },
            ].map(({ step, icon, label, desc }) => (
              <div key={step} className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                <div>
                  <p className="font-medium">{icon} {label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Wallet deduction happens immediately and is not reversible.
              Any outstanding balance will be tracked and automatically recovered from future commissions.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleExecute}
            disabled={submitting}
            className="gap-1.5 text-white bg-red-600 hover:bg-red-700"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Execute Recovery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail Drawer / Modal ─────────────────────────────────────────────────────

function DetailModal({
  clawback,
  onClose,
  onUpdated,
  canManage,
  role,
}: {
  clawback: Clawback | null;
  onClose: () => void;
  onUpdated: () => void;
  canManage: boolean;
  role: string;
}) {
  const { toast } = useToast();
  const { clawbackTerm } = useIndustryConfig();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const activeStep = clawback?.approvalSteps.find(
    (s) => s.stepOrder === clawback.approvalCurrentStep && s.status === "PENDING"
  ) ?? null;
  const userCanApproveStep =
    ["ADMIN", "SUPER_ADMIN"].includes(role) ||
    (activeStep != null && activeStep.approverRole === role);
  const [disputeNote, setDisputeNote] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [declineNote, setDeclineNote] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [showDisputeInput, setShowDisputeInput] = useState(false);
  const [showWaiveInput, setShowWaiveInput] = useState(false);
  const [showDeclineInput, setShowDeclineInput] = useState(false);
  const [showChangesInput, setShowChangesInput] = useState(false);

  useEffect(() => {
    if (clawback) {
      setDisputeNote(""); setWaiveReason(""); setDeclineNote(""); setChangesNote("");
      setShowDisputeInput(false); setShowWaiveInput(false); setShowDeclineInput(false); setShowChangesInput(false);
    }
  }, [clawback?.id]);

  if (!clawback) return null;

  async function doAction(action: string, extra?: Record<string, any>) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/clawbacks/${clawback!.id}/action`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Action failed");
      }
      const msgs: Record<string, string> = {
        SUBMIT:          "Submitted for approval.",
        APPROVE:         "Step approved — clawback advancing.",
        DECLINE:         "Clawback rejected and cancelled.",
        WAIVE:           "Clawback waived.",
        DISPUTE:         "Dispute recorded. Recovery is frozen.",
        REQUEST_CHANGES: "Changes requested.",
      };
      toast({ title: msgs[action] ?? "Done" });
      onUpdated(); onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  const busy = !!actionLoading;

  return (
    <Dialog open={!!clawback} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <DialogTitle className="text-foreground">{clawbackTerm} Details</DialogTitle>
            </div>
            <StatusBadge status={clawback.status} />
          </div>
          <DialogDescription className="mt-1">{clawback.eventTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {/* Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">Sales Executive</span>
                <p className="font-medium">{clawback.salesExecutiveName}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Clawback Type</span>
                <p className="font-medium">{CLAWBACK_TYPE_LABELS[clawback.clawbackType] ?? clawback.clawbackType}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Reason Category</span>
                <p className="font-medium">{REASON_LABELS[clawback.reasonCategory] ?? clawback.reasonCategory}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Created By</span>
                <p className="font-medium">{clawback.createdByName}</p>
              </div>
            </div>

            <div className="pt-1 border-t border-border/60 grid grid-cols-3 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">Original</span>
                <p className="font-medium tabular-nums">{formatCurrency(clawback.originalCommissionAmount)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Clawback</span>
                <p className="font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(clawback.clawbackAmount)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Outstanding</span>
                <p className={`font-semibold tabular-nums ${clawback.outstandingAmount > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600"}`}>
                  {formatCurrency(clawback.outstandingAmount)}
                </p>
              </div>
            </div>

            {clawback.proRataFactor != null && (
              <p className="text-xs text-muted-foreground">Pro-rata factor: {(clawback.proRataFactor * 100).toFixed(1)}%</p>
            )}
            {clawback.componentDescription && (
              <p className="text-xs text-muted-foreground">Component: {clawback.componentDescription}</p>
            )}
          </div>

          {/* Reason */}
          <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Reason</span>
            {clawback.reason}
          </div>

          {clawback.notes && (
            <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Notes</span>
              {clawback.notes}
            </div>
          )}

          {clawback.waiveReason && (
            <div className="rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 px-3 py-2.5 text-sm">
              <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide block mb-1">Waive Reason</span>
              {clawback.waiveReason}
            </div>
          )}

          {clawback.disputeNote && (
            <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 px-3 py-2.5 text-sm">
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide block mb-1">Dispute Note</span>
              {clawback.disputeNote}
            </div>
          )}

          {/* Recovery Engine Status */}
          {["EXECUTED", "WAIVED"].includes(clawback.status) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recovery Engine</p>
                {(() => {
                  const rcfg = RECOVERY_STATUS_CONFIG[clawback.recoveryStatus] ?? RECOVERY_STATUS_CONFIG.PENDING;
                  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${rcfg.cls}`}>{rcfg.label}</span>;
                })()}
              </div>

              {/* Progress bar */}
              {clawback.clawbackAmount > 0 && (
                <div className="space-y-1">
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${(RECOVERY_STATUS_CONFIG[clawback.recoveryStatus] ?? RECOVERY_STATUS_CONFIG.PENDING).barCls}`}
                      style={{ width: `${Math.min(100, (clawback.recoveredAmount / clawback.clawbackAmount) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Recovered: {formatCurrency(clawback.recoveredAmount)}</span>
                    <span>Outstanding: {formatCurrency(clawback.outstandingAmount)}</span>
                  </div>
                </div>
              )}

              {/* In-progress note */}
              {["RECOVERY_IN_PROGRESS", "PARTIALLY_RECOVERED"].includes(clawback.recoveryStatus) && (
                <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
                  <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{formatCurrency(clawback.outstandingAmount)} will be automatically offset from the next approved commission payment.</span>
                </div>
              )}

              {/* Recovery transaction history */}
              {clawback.recoveries.length > 0 && (
                <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
                  {clawback.recoveries.map((r) => (
                    <div key={r.id} className="flex items-start justify-between px-3 py-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">{RECOVERY_METHOD_ICON[r.recoveryMethod] ?? "•"}</span>
                        <div>
                          <p className="font-medium">{RECOVERY_LABELS[r.recoveryMethod] ?? r.recoveryMethod}</p>
                          {r.description && <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>}
                          <p className="text-[10px] text-muted-foreground">{formatDate(r.createdAt)}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums ml-4 shrink-0">
                        {formatCurrency(r.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Approval Steps Timeline */}
          {clawback.approvalSteps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approval Workflow</p>
              <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border/50">
                {clawback.approvalSteps.map((step, i) => {
                  const scfg = STEP_STATUS_CONFIG[step.status] ?? { label: step.status, icon: "●", cls: "text-muted-foreground" };
                  const isActive = step.stepOrder === clawback.approvalCurrentStep;
                  return (
                    <div key={step.id} className={`flex items-start gap-3 px-3 py-2.5 text-sm ${isActive ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}>
                      <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                        <span className={`text-base font-bold leading-none ${scfg.cls}`}>{scfg.icon}</span>
                        {i < clawback.approvalSteps.length - 1 && <div className="w-px h-3 bg-border mt-0.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-medium truncate ${isActive ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
                            {step.stepOrder}. {step.stepName}
                          </span>
                          <span className={`text-xs shrink-0 ${scfg.cls}`}>{scfg.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{step.approverRole.replace(/_/g, " ")}</p>
                        {step.comments && <p className="text-xs text-muted-foreground mt-0.5 italic">"{step.comments}"</p>}
                        {step.approvedAt && <p className="text-[10px] text-muted-foreground">{new Date(step.approvedAt).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Potential clawback wallet notice */}
          {clawback.walletPendingTxId && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>This clawback is showing as a <strong>Potential Clawback</strong> in the sales executive's wallet until resolved.</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-1">
            {/* Submit (DRAFT) */}
            {canManage && clawback.status === "DRAFT" && (
              <Button className="w-full gap-1.5" onClick={() => doAction("SUBMIT")} disabled={busy}>
                {actionLoading === "SUBMIT" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit for Approval
              </Button>
            )}

            {/* Primary approval actions (PENDING_APPROVAL or CHANGES_REQUESTED) */}
            {canManage && ["PENDING_APPROVAL", "CHANGES_REQUESTED"].includes(clawback.status) && (
              <>
                {activeStep && (
                  <p className="text-xs text-muted-foreground">
                    Awaiting: <span className="font-medium text-foreground">{activeStep.stepName}</span>
                    {" "}({activeStep.approverRole.replace(/_/g, " ")})
                    {!userCanApproveStep && <span className="text-amber-500 ml-1">— not your step</span>}
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button className="flex-1 min-w-[100px] gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => doAction("APPROVE")} disabled={busy || !userCanApproveStep}>
                    {actionLoading === "APPROVE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve Step
                  </Button>
                  <Button variant="outline" className="flex-1 min-w-[90px] gap-1.5 border-yellow-400 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
                    onClick={() => { setShowChangesInput(!showChangesInput); setShowDeclineInput(false); setShowWaiveInput(false); setShowDisputeInput(false); }} disabled={busy}>
                    <RotateCcw className="h-4 w-4" /> Request Changes
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" className="flex-1 min-w-[90px] gap-1.5 border-red-400 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    onClick={() => { setShowDeclineInput(!showDeclineInput); setShowChangesInput(false); setShowWaiveInput(false); setShowDisputeInput(false); }} disabled={busy}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button variant="outline" className="flex-1 min-w-[90px] gap-1.5 border-purple-400 text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                    onClick={() => { setShowWaiveInput(!showWaiveInput); setShowDeclineInput(false); setShowChangesInput(false); setShowDisputeInput(false); }} disabled={busy}>
                    <Scale className="h-4 w-4" /> Waive
                  </Button>
                  <Button variant="outline" className="flex-1 min-w-[90px] gap-1.5 border-orange-400 text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20"
                    onClick={() => { setShowDisputeInput(!showDisputeInput); setShowDeclineInput(false); setShowChangesInput(false); setShowWaiveInput(false); }} disabled={busy}>
                    <MessageSquare className="h-4 w-4" /> Dispute
                  </Button>
                </div>
              </>
            )}

            {/* Dispute available on APPROVED too */}
            {clawback.status === "APPROVED" && (
              <Button variant="outline" className="w-full gap-1.5 border-orange-400 text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20"
                onClick={() => setShowDisputeInput(!showDisputeInput)} disabled={busy}>
                <MessageSquare className="h-4 w-4" /> Dispute This Clawback
              </Button>
            )}

            {/* Waive available on APPROVED too */}
            {canManage && clawback.status === "APPROVED" && (
              <Button variant="outline" className="w-full gap-1.5 border-purple-400 text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                onClick={() => setShowWaiveInput(!showWaiveInput)} disabled={busy}>
                <Scale className="h-4 w-4" /> Waive Clawback
              </Button>
            )}

            {/* Request Changes input */}
            {showChangesInput && (
              <div className="space-y-1.5 rounded-md border border-yellow-200 dark:border-yellow-700/40 bg-yellow-50/50 dark:bg-yellow-900/10 p-2.5">
                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Describe what needs to change</p>
                <Textarea placeholder="What changes are required?" value={changesNote} onChange={(e) => setChangesNote(e.target.value)} rows={2} className="text-sm" />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-yellow-400 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-400"
                    onClick={() => doAction("REQUEST_CHANGES", { notes: changesNote })} disabled={busy || !changesNote.trim()}>
                    {actionLoading === "REQUEST_CHANGES" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Send Back for Changes
                  </Button>
                  <Button variant="outline" onClick={() => setShowChangesInput(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Decline/Reject input */}
            {showDeclineInput && (
              <div className="space-y-1.5 rounded-md border border-red-200 dark:border-red-700/40 bg-red-50/50 dark:bg-red-900/10 p-2.5">
                <p className="text-xs font-medium text-red-700 dark:text-red-400">Reason for rejection (required)</p>
                <Textarea placeholder="Reason for rejecting this clawback…" value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} rows={2} className="text-sm" />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-red-400 text-red-700 hover:bg-red-100 dark:text-red-400"
                    onClick={() => doAction("DECLINE", { notes: declineNote })} disabled={busy || !declineNote.trim()}>
                    {actionLoading === "DECLINE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Confirm Rejection
                  </Button>
                  <Button variant="outline" onClick={() => setShowDeclineInput(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Waive input */}
            {showWaiveInput && (
              <div className="space-y-1.5 rounded-md border border-purple-200 dark:border-purple-700/40 bg-purple-50/50 dark:bg-purple-900/10 p-2.5">
                <p className="text-xs font-medium text-purple-700 dark:text-purple-400">Waive reason (required)</p>
                <Textarea placeholder="Why is this clawback being waived?" value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} rows={2} className="text-sm" />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-purple-400 text-purple-700 hover:bg-purple-100 dark:text-purple-400"
                    onClick={() => doAction("WAIVE", { waiveReason })} disabled={busy || !waiveReason.trim()}>
                    {actionLoading === "WAIVE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                    Confirm Waive
                  </Button>
                  <Button variant="outline" onClick={() => setShowWaiveInput(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Dispute input */}
            {showDisputeInput && (
              <div className="space-y-1.5 rounded-md border border-orange-200 dark:border-orange-700/40 bg-orange-50/50 dark:bg-orange-900/10 p-2.5">
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400">Dispute note (required)</p>
                <Textarea placeholder="Explain why you're disputing this clawback…" value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} rows={2} className="text-sm" />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
                    onClick={() => doAction("DISPUTE", { disputeNote })} disabled={busy || !disputeNote.trim()}>
                    {actionLoading === "DISPUTE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                    Submit Dispute
                  </Button>
                  <Button variant="outline" onClick={() => setShowDisputeInput(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Clawbacks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { clawbackTerm, clawbackTermPlural } = useIndustryConfig();
  const role = user?.role ?? "";
  const canManage = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"].includes(role);
  const isSalesExec = role === "SALES_EXECUTIVE";
  const canCreate = canManage || isSalesExec;

  const [clawbacks, setClawbacks] = useState<Clawback[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [viewDetail, setViewDetail] = useState<Clawback | null>(null);
  const [executeTarget, setExecuteTarget] = useState<Clawback | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Clawback | null>(null);

  const fetchClawbacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/clawbacks?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setClawbacks(Array.isArray(data) ? data : []);
    } catch {
      setClawbacks([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchClawbacks(); }, [fetchClawbacks]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/clawbacks/${deleteTarget.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: `${clawbackTerm} deleted` });
      setDeleteTarget(null);
      fetchClawbacks();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const filtered = clawbacks.filter((cb) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return cb.eventTitle.toLowerCase().includes(q) || cb.salesExecutiveName.toLowerCase().includes(q) || cb.reason.toLowerCase().includes(q);
  });

  // Stats
  const totalClawback = clawbacks.reduce((s, c) => s + c.clawbackAmount, 0);
  const totalOutstanding = clawbacks.filter((c) => c.status === "EXECUTED").reduce((s, c) => s + c.outstandingAmount, 0);
  const pending = clawbacks.filter((c) => c.status === "PENDING_APPROVAL").length;
  const executed = clawbacks.filter((c) => c.status === "EXECUTED").length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-red-500" />
            {clawbackTermPlural}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {canManage
              ? `Manage ${clawbackTermPlural.toLowerCase()} and commission recoveries across your team.`
              : `View ${clawbackTermPlural.toLowerCase()} and reversals applied to your commission.`}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white shrink-0">
            <Plus className="h-4 w-4" /> New {clawbackTerm}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: `Total ${clawbackTerm} Value`,  value: formatCurrency(totalClawback),    icon: TrendingDown,   accent: "border-l-red-500",    valueClass: "text-red-600 dark:text-red-400" },
          { label: "Pending Approval",       value: String(pending),                  icon: Clock,          accent: "border-l-amber-400",  valueClass: "text-foreground" },
          { label: "Executed",               value: String(executed),                 icon: CheckCircle2,   accent: "border-l-rose-500",   valueClass: "text-foreground" },
          { label: "Outstanding Recovery",   value: formatCurrency(totalOutstanding), icon: AlertTriangle,  accent: "border-l-orange-500", valueClass: "text-orange-600 dark:text-orange-400" },
        ].map(({ label, value, icon: Icon, accent, valueClass }) => (
          <Card key={label} className={`shadow-sm border-l-4 ${accent}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{clawbackTermPlural}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {filtered.length} record{filtered.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input className="pl-8 h-8 text-sm w-52" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-sm w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center text-muted-foreground space-y-2">
              <TrendingDown className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p>No {clawbackTermPlural.toLowerCase()} found.</p>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Create first {clawbackTerm.toLowerCase()}
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">Event</th>
                    {canManage && <th className="px-6 py-3 font-medium">Sales Executive</th>}
                    <th className="px-6 py-3 font-medium">Type / Reason</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                    <th className="px-6 py-3 font-medium">Recovery</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cb) => (
                    <tr key={cb.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-foreground">{cb.eventTitle}</p>
                        <p className="text-xs text-muted-foreground">{REASON_LABELS[cb.reasonCategory] ?? cb.reasonCategory}</p>
                      </td>
                      {canManage && (
                        <td className="px-6 py-4 text-muted-foreground">{cb.salesExecutiveName}</td>
                      )}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          {CLAWBACK_TYPE_LABELS[cb.clawbackType] ?? cb.clawbackType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(cb.clawbackAmount)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">of {formatCurrency(cb.originalCommissionAmount)}</p>
                      </td>
                      <td className="px-6 py-4 min-w-[140px]">
                        <RecoveryProgress cb={cb} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={cb.status} />
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {formatDate(cb.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => setViewDetail(cb)}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {canManage && cb.status === "APPROVED" && (
                            <Button
                              size="icon" variant="ghost"
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                              onClick={() => setExecuteTarget(cb)}
                              title="Execute clawback"
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                          )}

                          {canManage && cb.status === "DRAFT" && (
                            <Button
                              size="icon" variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget(cb)}
                              title="Delete draft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <CreateClawbackModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={fetchClawbacks} />
      <ExecuteModal clawback={executeTarget} onClose={() => setExecuteTarget(null)} onDone={fetchClawbacks} />
      <DetailModal clawback={viewDetail} onClose={() => setViewDetail(null)} onUpdated={() => { fetchClawbacks(); setViewDetail(null); }} canManage={canManage} role={role} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {clawbackTerm.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this {clawbackTerm.toLowerCase()} for <strong>{deleteTarget?.eventTitle}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

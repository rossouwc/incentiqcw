import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { getIndustryConfig } from "@/lib/industry-config";
import { calculateCommission, CalcResult } from "@/lib/commission-formula";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, Trash2, SendHorizontal, Briefcase, Clock,
  CheckCircle2, XCircle, TrendingUp, DollarSign, Loader2, CircleDot, Eye,
  Zap, ZapOff, CheckSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// ── Auth helper ───────────────────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

// ── Field keys treated as "customer name" for autocomplete ────────────────────
const CUSTOMER_FIELD_KEYS = new Set([
  "customerName", "clientName", "candidateName", "buyerName",
  "accountName", "tenantName", "recruiterClient", "partnerName",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldDef {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  isRequired: boolean;
  displayOrder: number;
  calculationRole: string | null;
  optionsJson: unknown;
}

interface EventType { value: string; label: string }

interface FieldConfig {
  industryCode: string;
  industryName: string;
  dealEntityName: string;
  commissionEventName: string;
  showGP: boolean;
  revenueLabel: string;
  costLabel: string | null;
  commissionMethodLabel: string;
  eventTypes: EventType[];
  fieldDefinitions: FieldDef[];
  defaultCommissionPct: number;
}

interface CommEvent {
  id: string;
  eventTitle: string;
  eventType: string;
  eventDataJson: Record<string, unknown> | null;
  revenueAmount: number;
  costAmount: number;
  grossProfitAmount: number;
  commissionBaseAmount: number;
  commissionPercentage: number;
  calculatedCommissionAmount: number;
  triggerStatus: string;
  approvalStatus: string;
  walletStatus: string;
  submittedAt: string | null;
  createdAt: string;
  salesExecutiveName: string;
}

// ── Custom hooks ──────────────────────────────────────────────────────────────

function useFieldConfig() {
  const [data, setData]       = useState<FieldConfig | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/commission-events/field-config", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

function useCommissionEvents() {
  const [data, setData]       = useState<CommEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/commission-events", { headers: getAuthHeaders() });
      const json = await res.json();
      setData(json.data ?? []);
    } catch { setData([]); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, refetch: fetchData };
}

function useCustomers() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/customers", { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then((rows: { name: string }[]) => setNames(rows.map((r) => r.name).sort()))
      .catch(() => setNames([]));
  }, []);
  return names;
}

// ── Trigger status display ─────────────────────────────────────────────────────

const TRIGGER_STATUS_CFG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  NOT_TRIGGERED: { label: "Awaiting Trigger", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",   Icon: ZapOff      },
  TRIGGERED:     { label: "Triggered",        cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400", Icon: Zap          },
  WAIVED:        { label: "Waived",           cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",     Icon: CheckSquare  },
  FAILED:        { label: "Failed",           cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",         Icon: XCircle      },
};

function TriggerBadge({ status, onClick }: { status: string; onClick?: () => void }) {
  const s = TRIGGER_STATUS_CFG[status] ?? TRIGGER_STATUS_CFG.NOT_TRIGGERED;
  const tag = (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      <s.Icon className="h-3 w-3" />{s.label}
    </span>
  );
  if (onClick) return <button onClick={onClick} className="hover:opacity-80 transition-opacity">{tag}</button>;
  return tag;
}

// ── Status display ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  DRAFT:            { label: "Draft",           cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",       Icon: CircleDot },
  PENDING_APPROVAL: { label: "In Approval",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",   Icon: Clock },
  APPROVED:         { label: "Approved",        cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",   Icon: CheckCircle2 },
  REJECTED:         { label: "Rejected",        cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",           Icon: XCircle },
  PAID:             { label: "Paid",            cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", Icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CFG[status] ?? { label: status, cls: "bg-muted text-muted-foreground", Icon: CircleDot };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      <s.Icon className="h-3 w-3" />{s.label}
    </span>
  );
}

// ── Customer name autocomplete ────────────────────────────────────────────────

function CustomerAutocomplete({
  id, label, value, onChange, customers, required, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  customers: string[];
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (!value.trim()) return customers.slice(0, 8);
    const q = value.toLowerCase();
    return customers.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [value, customers]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          autoComplete="off"
          placeholder={placeholder ?? `Enter or select ${label.toLowerCase()}`}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {open && matches.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-52 overflow-y-auto">
            {matches.map((name) => (
              <button
                key={name}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${value === name ? "bg-accent/50 font-medium" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); onChange(name); setOpen(false); }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dynamic field renderer ────────────────────────────────────────────────────

function DynamicField({
  def, value, onChange, customers,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
  customers?: string[];
}) {
  const id      = `f-${def.fieldKey}`;
  const options = Array.isArray(def.optionsJson) ? (def.optionsJson as string[]) : [];
  const req     = def.isRequired;
  const reqMark = req ? <span className="text-destructive ml-0.5">*</span> : null;

  // ── Customer autocomplete for known customer-name fields ──
  if (CUSTOMER_FIELD_KEYS.has(def.fieldKey) && customers && customers.length > 0) {
    return (
      <CustomerAutocomplete
        id={id}
        label={def.fieldLabel}
        value={value}
        onChange={onChange}
        customers={customers}
        required={def.isRequired}
        placeholder={`Enter ${def.fieldLabel.toLowerCase()}`}
      />
    );
  }

  switch (def.fieldType) {
    case "textarea":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{def.fieldLabel}{reqMark}</Label>
          <Textarea
            id={id} rows={2} value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${def.fieldLabel.toLowerCase()}`}
            className="resize-none"
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{def.fieldLabel}{reqMark}</Label>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={`Select…`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2.5 pt-5">
          <input
            id={id} type="checkbox"
            className="h-4 w-4 accent-primary rounded"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          />
          <Label htmlFor={id} className="cursor-pointer">{def.fieldLabel}</Label>
        </div>
      );

    case "currency":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{def.fieldLabel}{reqMark}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R</span>
            <Input
              id={id} type="number" className="pl-7" value={value}
              onChange={(e) => onChange(e.target.value)}
              min="0" step="0.01" placeholder="0.00"
            />
          </div>
        </div>
      );

    case "percentage":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{def.fieldLabel}{reqMark}</Label>
          <div className="relative">
            <Input
              id={id} type="number" className="pr-8" value={value}
              onChange={(e) => onChange(e.target.value)}
              min="0" max="100" step="0.01" placeholder="0.00"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{def.fieldLabel}{reqMark}</Label>
          <Input
            id={id} type="number" value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0"
          />
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{def.fieldLabel}{reqMark}</Label>
          <Input
            id={id} type="date" value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    default: // "text"
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{def.fieldLabel}{reqMark}</Label>
          <Input
            id={id} type="text" value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${def.fieldLabel.toLowerCase()}`}
          />
        </div>
      );
  }
}

// ── Commission breakdown panel ────────────────────────────────────────────────

function CalcBreakdown({ result }: { result: CalcResult }) {
  if (result.lineItems.length === 0) return null;

  const fmtVal = (item: CalcResult["lineItems"][number]) => {
    if (item.isCurrency || item.isResult) return formatCurrency(item.value);
    if (item.isPct)                       return `${item.value}%`;
    if (Number.isInteger(item.value))     return `${item.value} months`;
    return String(item.value);
  };

  const resultItem = result.lineItems.find((i) => i.isResult);

  return (
    <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
      <p className="text-[10px] font-semibold text-primary uppercase tracking-widest flex items-center gap-1">
        <DollarSign className="h-3 w-3" /> Commission Breakdown
      </p>

      {/* Step-by-step line items */}
      <div className="space-y-1.5">
        {result.lineItems.map((item, idx) => (
          item.isResult ? null : (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className={`${item.isIntermediate ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {item.label}
              </span>
              <span className={`font-mono text-xs tabular-nums ${
                item.isIntermediate ? "font-semibold text-foreground" :
                item.isPct          ? "text-amber-500 dark:text-amber-400" :
                "text-muted-foreground"
              }`}>
                {fmtVal(item)}
              </span>
            </div>
          )
        ))}
      </div>

      {/* Separator + final result */}
      {resultItem && (
        <>
          <div className="border-t border-primary/20" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{resultItem.label}</span>
            <span className="text-lg font-bold text-primary tabular-nums">
              {formatCurrency(resultItem.value)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Based on your commission rate of {result.commissionPercentage}%
          </p>
        </>
      )}
    </div>
  );
}

// ── Approval steps viewer ─────────────────────────────────────────────────────

const STEP_ROLE_LABEL: Record<string, string> = {
  MANAGER: "Manager", FINANCE: "Finance", ADMIN: "Director", EXECUTIVE: "Executive",
};

function ApprovalStepsModal({
  eventId, eventTitle, onClose,
}: {
  eventId: string; eventTitle: string; onClose: () => void;
}) {
  const [steps, setSteps]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/commission-events/${eventId}`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setSteps(d.approvals ?? []))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false));
  }, [eventId]);

  const STEP_STATUS: Record<string, { cls: string; label: string }> = {
    PENDING:           { cls: "text-amber-500",              label: "Pending"   },
    WAITING:           { cls: "text-muted-foreground",       label: "Waiting"   },
    APPROVED:          { cls: "text-green-500",              label: "Approved"  },
    REJECTED:          { cls: "text-red-500",                label: "Rejected"  },
    ESCALATED:         { cls: "text-orange-500",             label: "Escalated" },
    CHANGES_REQUESTED: { cls: "text-yellow-600 dark:text-yellow-400", label: "Changes Requested" },
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approval Progress</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{eventTitle}</p>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : steps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No approval steps found.</p>
        ) : (
          <div className="space-y-2 py-2">
            {steps.map((s) => {
              const sc = STEP_STATUS[s.status] ?? { cls: "text-muted-foreground", label: s.status };
              return (
                <div key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-md border bg-card transition-opacity ${
                  s.status === "WAITING" ? "opacity-50 border-border" : "border-border"
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                    s.status === "APPROVED"  ? "border-green-500 bg-green-500/20 text-green-500" :
                    s.status === "REJECTED"  ? "border-red-500 bg-red-500/20 text-red-500" :
                    s.status === "WAITING"   ? "border-muted-foreground/30 bg-muted/30 text-muted-foreground" :
                    "border-amber-400 bg-amber-400/10 text-amber-500"
                  }`}>{s.approvalStep}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {s.stepName ?? (STEP_ROLE_LABEL[s.approverRole] ?? s.approverRole)}
                    </p>
                    {s.comments && <p className="text-xs text-muted-foreground truncate">{s.comments}</p>}
                  </div>
                  <span className={`text-xs font-semibold ${sc.cls}`}>{sc.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── TriggerEventsModal ─────────────────────────────────────────────────────────

interface TriggerRecord {
  id: string;
  triggerEventType: string;
  label: string;
  description: string | null;
  status: string;
  notes: string | null;
  triggeredByName: string | null;
  triggeredAt: string | null;
}

function TriggerEventsModal({
  eventId, eventTitle, canManage, onClose, onUpdated,
}: {
  eventId: string;
  eventTitle: string;
  canManage: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [triggers, setTriggers]     = useState<TriggerRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [acting, setActing]         = useState<string | null>(null); // triggerId being actioned
  const [notesMap, setNotesMap]     = useState<Record<string, string>>({});

  const fetchTriggers = useCallback(() => {
    setLoading(true);
    fetch(`/api/commission-events/${eventId}/triggers`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setTriggers(d.triggers ?? []))
      .catch(() => setTriggers([]))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { fetchTriggers(); }, [fetchTriggers]);

  const handleAction = async (triggerId: string, action: "TRIGGER" | "WAIVE" | "FAIL") => {
    setActing(triggerId);
    try {
      const res = await fetch(
        `/api/commission-events/${eventId}/triggers/${triggerId}/action`,
        {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ action, notes: notesMap[triggerId] ?? "" }),
        }
      );
      const json = await res.json();
      if (!res.ok) { toast({ title: "Error", description: json.error ?? "Failed", variant: "destructive" }); return; }
      toast({
        title: action === "TRIGGER" ? "Trigger Confirmed" : action === "WAIVE" ? "Trigger Waived" : "Trigger Failed",
        description: `Trigger event has been marked as ${action.toLowerCase()}d.`,
      });
      fetchTriggers();
      onUpdated();
    } finally {
      setActing(null);
    }
  };

  const TRIGGER_ROW_STATUS: Record<string, { cls: string; label: string; Icon: React.ElementType }> = {
    NOT_TRIGGERED: { cls: "text-slate-400",  label: "Not Triggered", Icon: ZapOff      },
    TRIGGERED:     { cls: "text-green-500",  label: "Triggered",     Icon: Zap          },
    WAIVED:        { cls: "text-blue-500",   label: "Waived",        Icon: CheckSquare  },
    FAILED:        { cls: "text-red-500",    label: "Failed",        Icon: XCircle      },
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Trigger Events
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{eventTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-4">
            {[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : triggers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No trigger events defined for this commission event.</p>
        ) : (
          <div className="space-y-3 py-2">
            {triggers.map((t) => {
              const sc = TRIGGER_ROW_STATUS[t.status] ?? TRIGGER_ROW_STATUS.NOT_TRIGGERED;
              const isPending = t.status === "NOT_TRIGGERED" || t.status === "FAILED";
              return (
                <div key={t.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <sc.Icon className={`h-4 w-4 shrink-0 ${sc.cls}`} />
                        <p className="text-sm font-medium text-foreground">{t.label}</p>
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-6">{t.description}</p>
                      )}
                      {t.triggeredByName && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                          By {t.triggeredByName}
                          {t.triggeredAt && ` · ${new Date(t.triggeredAt).toLocaleDateString("en-ZA")}`}
                        </p>
                      )}
                      {t.notes && (
                        <p className="text-xs italic text-muted-foreground mt-0.5 ml-6">"{t.notes}"</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${sc.cls}`}>{sc.label}</span>
                  </div>

                  {canManage && isPending && (
                    <div className="ml-6 space-y-2">
                      <Input
                        placeholder="Notes (optional)"
                        className="h-7 text-xs"
                        value={notesMap[t.id] ?? ""}
                        onChange={(e) => setNotesMap((m) => ({ ...m, [t.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm" className="h-7 gap-1 text-xs flex-1"
                          onClick={() => handleAction(t.id, "TRIGGER")}
                          disabled={!!acting}
                        >
                          {acting === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                          Mark Triggered
                        </Button>
                        <Button
                          size="sm" variant="outline" className="h-7 gap-1 text-xs"
                          onClick={() => handleAction(t.id, "WAIVE")}
                          disabled={!!acting}
                        >
                          <CheckSquare className="h-3 w-3" /> Waive
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleAction(t.id, "FAIL")}
                          disabled={!!acting}
                        >
                          <XCircle className="h-3 w-3" /> Fail
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Deals() {
  const { toast }                  = useToast();
  const { user: currentUser }      = useAuth();
  const { data: fc, loading: fcLoading } = useFieldConfig();
  const { data: events, loading, refetch } = useCommissionEvents();
  const customers = useCustomers();

  // Dialog / modal state
  const [showForm, setShowForm]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommEvent | null>(null);
  const [viewApprovals, setViewApprovals] = useState<{ id: string; title: string } | null>(null);
  const [viewTriggers, setViewTriggers] = useState<{ id: string; title: string } | null>(null);

  const canManageTriggers = ["MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser?.role ?? "");

  // Form state
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType]   = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Industry config (frontend copy for labels + event types)
  const indCfg = fc ? getIndustryConfig(fc.industryCode) : null;

  // Plural label for the page heading
  const entityPlural   = indCfg?.eventLabelPlural ?? "Deals";
  const entitySingular = indCfg?.eventLabel ?? "Deal";
  const newLabel       = indCfg?.newEventLabel ?? `New ${entitySingular}`;

  // ── Live commission breakdown from formula engine ──
  const calcResult = useMemo<CalcResult | null>(() => {
    if (!fc) return null;
    const data: Record<string, unknown> = { ...formValues };
    return calculateCommission(fc.industryCode, data, fc.defaultCommissionPct || 10);
  }, [formValues, fc]);

  // ── Validation ──
  const hasCalcValues = (calcResult?.revenueAmount ?? 0) > 0 ||
                        (calcResult?.commissionBaseAmount ?? 0) > 0 ||
                        (calcResult?.calculatedCommissionAmount ?? 0) > 0;
  const requiredFilled = useMemo(() => {
    if (!eventTitle.trim() || !eventType) return false;
    if (!fc) return false;
    for (const f of fc.fieldDefinitions) {
      if (f.isRequired && !(formValues[f.fieldKey] ?? "").trim()) return false;
    }
    return true;
  }, [eventTitle, eventType, formValues, fc]);

  // ── Stats ──
  const stats = useMemo(() => {
    const total    = events.length;
    const draft    = events.filter((e) => e.approvalStatus === "DRAFT").length;
    const pending  = events.filter((e) => e.approvalStatus === "PENDING_APPROVAL").length;
    const totalComm = events.reduce((s, e) => s + e.calculatedCommissionAmount, 0);
    return { total, draft, pending, totalComm };
  }, [events]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    return events.filter((e) => {
      const matchesStatus = statusFilter === "all" || e.approvalStatus === statusFilter;
      if (!matchesStatus) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const data = e.eventDataJson as Record<string, string> | null;
      const customer = data?.customerName ?? data?.clientName ?? data?.candidateName ?? "";
      return (
        e.eventTitle.toLowerCase().includes(q) ||
        String(customer).toLowerCase().includes(q)
      );
    });
  }, [events, search, statusFilter]);

  // ── Handlers ──
  function openForm() {
    setEventTitle("");
    setEventType(fc?.eventTypes[0]?.value ?? "");
    setFormValues({});
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
  }

  function setField(key: string, val: string) {
    setFormValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleCreate(submitImmediately: boolean) {
    if (!requiredFilled) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/commission-events", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          eventTitle: eventTitle.trim(),
          eventType,
          eventDataJson: formValues,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Server error");
      }
      const created = await res.json();

      if (submitImmediately) {
        const sr = await fetch(`/api/commission-events/${created.id}/submit`, {
          method: "POST",
          headers: getAuthHeaders(),
        });
        if (!sr.ok) throw new Error("Failed to submit for approval");
        toast({ title: `${entitySingular} submitted for approval`, description: "Managers have been notified." });
      } else {
        toast({ title: "Draft saved", description: `${entitySingular} saved as draft.` });
      }

      closeForm();
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitExisting(ev: CommEvent) {
    try {
      const res = await fetch(`/api/commission-events/${ev.id}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Submit failed");
      toast({ title: "Submitted for approval" });
      refetch();
    } catch {
      toast({ title: "Error submitting", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/commission-events/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      toast({ title: `${entitySingular} deleted` });
      setDeleteTarget(null);
      refetch();
    } catch {
      toast({ title: "Error deleting", variant: "destructive" });
    }
  }

  // ── Customer name helper ──
  function getCustomerName(ev: CommEvent): string {
    const d = ev.eventDataJson as Record<string, unknown> | null;
    if (!d) return "—";
    return String(
      d.customerName ?? d.clientName ?? d.candidateName ??
      d.buyerName ?? d.tenantName ?? ""
    ) || "—";
  }

  // ── Event type label ──
  function getTypeLabel(ev: CommEvent): string {
    return (indCfg?.eventTypes.find((t) => t.value === ev.eventType)?.label) ?? ev.eventType.replace(/_/g, " ");
  }

  // ── Whether a field spans full width ──
  function isWide(f: FieldDef) {
    return f.fieldType === "textarea";
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          {fcLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <>
              <h1 className="text-3xl font-bold text-foreground">My {entityPlural}</h1>
              <p className="text-muted-foreground mt-0.5">
                Manage and submit your commission {entityPlural.toLowerCase()}
              </p>
            </>
          )}
        </div>
        <Button onClick={openForm} disabled={fcLoading} className="gap-2">
          <Plus className="h-4 w-4" />
          {fcLoading ? "Loading…" : newLabel}
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: `Total ${entityPlural}`, value: String(stats.total),             icon: Briefcase,  accent: "border-l-primary" },
          { label: "Drafts",                value: String(stats.draft),             icon: Clock,      accent: "border-l-slate-400" },
          { label: "In Approval",           value: String(stats.pending),           icon: TrendingUp, accent: "border-l-amber-400" },
          { label: `My ${indCfg?.commissionLabel ?? "Commission"}`, value: formatCurrency(stats.totalComm), icon: DollarSign, accent: "border-l-emerald-500" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters + table ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${entityPlural.toLowerCase()} or ${(indCfg?.customerLabel ?? "customer").toLowerCase()}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PENDING_APPROVAL">In Approval</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">{indCfg?.titleLabel ?? entitySingular}</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium text-right">{indCfg?.revenueLabel ?? fc?.revenueLabel ?? "Revenue"}</th>
                    {fc?.showGP && <th className="px-6 py-3 font-medium text-right">{indCfg?.gpLabel ?? "GP"}</th>}
                    <th className="px-6 py-3 font-medium text-right">{indCfg?.commissionLabel ?? "Commission"}</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-14 text-center text-muted-foreground">
                        No {entityPlural.toLowerCase()} found.{" "}
                        <button className="text-primary hover:underline" onClick={openForm}>
                          Record your first {entitySingular.toLowerCase()}
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((ev) => (
                      <tr key={ev.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{ev.eventTitle}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{getCustomerName(ev)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            {getTypeLabel(ev)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {formatCurrency(ev.revenueAmount)}
                        </td>
                        {fc?.showGP && (
                          <td className="px-6 py-4 text-right">
                            {formatCurrency(ev.grossProfitAmount)}
                          </td>
                        )}
                        <td className="px-6 py-4 text-right">
                          <span className="font-semibold text-primary">{formatCurrency(ev.calculatedCommissionAmount)}</span>
                          <div className="text-xs text-muted-foreground">{ev.commissionPercentage}%</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            {ev.approvalStatus === "DRAFT" ? (
                              <StatusBadge status={ev.approvalStatus} />
                            ) : (
                              <button
                                onClick={() => setViewApprovals({ id: ev.id, title: ev.eventTitle })}
                                className="hover:opacity-80 transition-opacity text-left"
                                title="View approval progress"
                              >
                                <StatusBadge status={ev.approvalStatus} />
                              </button>
                            )}
                            {ev.approvalStatus !== "DRAFT" && ev.triggerStatus && (
                              <TriggerBadge
                                status={ev.triggerStatus}
                                onClick={() => setViewTriggers({ id: ev.id, title: ev.eventTitle })}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {formatDate(ev.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {ev.approvalStatus !== "DRAFT" && (
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() => setViewApprovals({ id: ev.id, title: ev.eventTitle })}
                                title="View approvals"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {ev.approvalStatus !== "DRAFT" && (
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 text-amber-500 hover:text-amber-600"
                                onClick={() => setViewTriggers({ id: ev.id, title: ev.eventTitle })}
                                title="Manage trigger events"
                              >
                                <Zap className="h-4 w-4" />
                              </Button>
                            )}
                            {ev.approvalStatus === "DRAFT" && (
                              <>
                                <Button
                                  size="sm" variant="outline"
                                  className="h-8 gap-1 text-xs"
                                  onClick={() => handleSubmitExisting(ev)}
                                  title="Submit for approval"
                                >
                                  <SendHorizontal className="h-3.5 w-3.5" /> Submit
                                </Button>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteTarget(ev)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── New event dialog ── */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <DialogTitle>Record a {newLabel.replace("New ", "New ")}</DialogTitle>
            {fc && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Fill in the details to record a new {entitySingular.toLowerCase()} and calculate your commission.
              </p>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {fcLoading || !fc ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <>
                {/* Event identity */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                    Event Details
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="event-title">
                        {indCfg?.titleLabel ?? entitySingular} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="event-title"
                        value={eventTitle}
                        onChange={(e) => setEventTitle(e.target.value)}
                        placeholder={`e.g. ${indCfg?.titleLabel ?? entitySingular} for Acme Corp`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="event-type">
                        Event Type <span className="text-destructive">*</span>
                      </Label>
                      <Select value={eventType} onValueChange={setEventType}>
                        <SelectTrigger id="event-type">
                          <SelectValue placeholder="Select type…" />
                        </SelectTrigger>
                        <SelectContent>
                          {fc.eventTypes.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Dynamic fields */}
                {fc.fieldDefinitions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      {fc.industryName} Details
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      {fc.fieldDefinitions.map((f) => (
                        <div key={f.fieldKey} className={isWide(f) ? "col-span-2" : ""}>
                          <DynamicField
                            def={f}
                            value={formValues[f.fieldKey] ?? ""}
                            onChange={(v) => setField(f.fieldKey, v)}
                            customers={customers}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commission breakdown */}
                {hasCalcValues && calcResult && <CalcBreakdown result={calcResult} />}
              </>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 flex gap-2 justify-between sm:justify-between">
            <Button variant="outline" onClick={closeForm} disabled={submitting}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleCreate(false)}
                disabled={submitting || !requiredFilled}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Draft
              </Button>
              <Button
                onClick={() => handleCreate(true)}
                disabled={submitting || !requiredFilled}
                className="gap-1.5"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                Submit for Approval
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entitySingular}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.eventTitle}</strong>. This cannot be undone.
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

      {/* ── Approval steps modal ── */}
      {viewApprovals && (
        <ApprovalStepsModal
          eventId={viewApprovals.id}
          eventTitle={viewApprovals.title}
          onClose={() => setViewApprovals(null)}
        />
      )}

      {/* ── Trigger events modal ── */}
      {viewTriggers && (
        <TriggerEventsModal
          eventId={viewTriggers.id}
          eventTitle={viewTriggers.title}
          canManage={canManageTriggers}
          onClose={() => setViewTriggers(null)}
          onUpdated={refetch}
        />
      )}
    </div>
  );
}

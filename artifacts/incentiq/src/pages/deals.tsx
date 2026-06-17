import { useState, useMemo, useEffect, useRef } from "react";
import {
  useListDeals,
  useCreateDeal,
  useUpdateDeal,
  useSubmitDeal,
  useDeleteDeal,
  useListCommissionRuleGroups,
  useGetTenant,
  DealInputDealType,
} from "@workspace/api-client-react";
import type { Deal, CommissionRuleGroup } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { getIndustryConfig } from "@/lib/industry-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  SendHorizontal,
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  DollarSign,
  Eye,
  Loader2,
  CircleDot,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Customer Name Autocomplete ───────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function CustomerCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(value)}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data: { name: string }[] = await res.json();
          setSuggestions(data.map(c => c.name));
          setOpen(data.length > 0);
        }
      } catch { /* ignore */ }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder="e.g. Acme Corp"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-popover shadow-md overflow-hidden">
          {suggestions.map(name => (
            <div
              key={name}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
              onMouseDown={e => {
                e.preventDefault();
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const DEAL_TYPES = [
  { value: "NET_NEW",   label: "Net New" },
  { value: "RENEWAL",   label: "Renewal" },
  { value: "UPSELL",    label: "Upsell" },
  { value: "CROSS_SELL", label: "Cross-Sell" },
];

const FALLBACK_COMM: Record<string, number> = {
  NET_NEW: 10, RENEWAL: 5, UPSELL: 7, CROSS_SELL: 6,
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT:              { label: "Draft",              cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  SUBMITTED:          { label: "Submitted",          cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  PENDING_APPROVAL:   { label: "Pending Approval",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  MANAGER_APPROVED:   { label: "Manager Approved",   cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  FINANCE_APPROVED:   { label: "Finance Approved",   cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  EXECUTIVE_APPROVED: { label: "Approved",           cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  REJECTED:           { label: "Rejected",           cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  PAID:               { label: "Paid",               cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

const TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  NET_NEW:   { label: "Net New",    cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  RENEWAL:   { label: "Renewal",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  UPSELL:    { label: "Upsell",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  CROSS_SELL:{ label: "Cross-Sell", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type.replace(/_/g, " "), cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function lookupCommInfo(dealType: string, groups: CommissionRuleGroup[]): { pct: number; label: string } {
  for (const group of groups) {
    if (group.status !== "ACTIVE") continue;
    const rule = group.rules.find((r) => r.dealType === dealType && r.status === "ACTIVE");
    if (rule) {
      return {
        pct: rule.commissionPercentage,
        label: `${group.groupName} — ${rule.commissionPercentage}%`,
      };
    }
  }
  const pct = FALLBACK_COMM[dealType] ?? 10;
  return { pct, label: `Default (${pct}%)` };
}

interface FormState {
  customerName: string;
  dealName: string;
  dealType: string;
  contractStartDate: string;
  contractEndDate: string;
  revenue: string;
  cost: string;
  metadata: Record<string, string>;
}

const emptyForm: FormState = {
  customerName: "", dealName: "", dealType: "",
  contractStartDate: "", contractEndDate: "",
  revenue: "", cost: "",
  metadata: {},
};

function dealToForm(deal: Deal): FormState {
  const meta = ((deal as any).metadata as Record<string, string> | null) ?? {};
  return {
    customerName:      deal.customerName,
    dealName:          deal.dealName,
    dealType:          meta.eventType ?? deal.dealType,
    contractStartDate: deal.contractStartDate ? deal.contractStartDate.substring(0, 10) : "",
    contractEndDate:   deal.contractEndDate   ? deal.contractEndDate.substring(0, 10)   : "",
    revenue:           String(deal.revenue),
    cost:              String(deal.cost),
    metadata:          meta,
  };
}

export default function Deals() {
  const { toast } = useToast();

  const [showDialog, setShowDialog] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [viewDeal, setViewDeal] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [workflowDeal, setWorkflowDeal] = useState<{ id: string; name: string } | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  async function openWorkflow(deal: Deal) {
    setWorkflowDeal({ id: deal.id, name: deal.dealName });
    setWorkflowSteps([]);
    setWorkflowLoading(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWorkflowSteps(data.approvalWorkflows ?? []);
      }
    } catch { /* ignore */ } finally {
      setWorkflowLoading(false);
    }
  }
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: dealsData, isLoading, refetch } = useListDeals({
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(typeFilter   !== "all" && { dealType: typeFilter }),
    limit: 100,
  });
  const { data: commGroups = [] } = useListCommissionRuleGroups();
  const { data: tenant } = useGetTenant();
  const industryConfig = getIndustryConfig((tenant as any)?.industry);
  const isIT = industryConfig.id === "IT_CONSULTING";

  const createM  = useCreateDeal();
  const updateM  = useUpdateDeal();
  const submitM  = useSubmitDeal();
  const deleteM  = useDeleteDeal();

  const deals = dealsData?.data ?? [];

  const filtered = useMemo(() => {
    if (!search) return deals;
    const q = search.toLowerCase();
    return deals.filter(
      (d) =>
        d.dealName.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q)
    );
  }, [deals, search]);

  const rev     = parseFloat(form.revenue) || 0;
  const cst     = parseFloat(form.cost)    || 0;
  const gp      = rev - cst;
  const gpPct   = rev > 0 ? (gp / rev) * 100 : 0;
  const commInfo = useMemo(
    () => lookupCommInfo(isIT ? form.dealType : "NET_NEW", commGroups),
    [form.dealType, commGroups, isIT]
  );
  const commAmt = industryConfig.showGP
    ? (gp > 0 ? gp * (commInfo.pct / 100) : 0)
    : rev * (commInfo.pct / 100);

  const stats = useMemo(() => {
    const total   = deals.length;
    const draft   = deals.filter((d) => d.status === "DRAFT").length;
    const pending = deals.filter((d) =>
      ["PENDING_APPROVAL", "MANAGER_APPROVED", "FINANCE_APPROVED"].includes(d.status)
    ).length;
    const approved = deals.filter((d) =>
      ["EXECUTIVE_APPROVED", "PAID"].includes(d.status)
    ).length;
    const totalComm = deals.reduce((s, d) => s + d.commission, 0);
    return { total, draft, pending, approved, totalComm };
  }, [deals]);

  function setField(key: keyof FormState, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function openCreate() {
    setEditDeal(null);
    setForm(emptyForm);
    setShowDialog(true);
  }

  function openEdit(deal: Deal) {
    setEditDeal(deal);
    setForm(dealToForm(deal));
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditDeal(null);
    setForm(emptyForm);
  }

  const getInput = () => {
    const extraMeta: Record<string, string> = { industry: industryConfig.id };
    if (!isIT && form.dealType) extraMeta.eventType = form.dealType;
    return {
      customerName: form.customerName,
      dealName:     form.dealName,
      dealType:     (isIT ? form.dealType : "NET_NEW") as DealInputDealType,
      revenue:      rev,
      cost:         isIT ? cst : 0,
      contractStartDate: form.contractStartDate || null,
      contractEndDate:   form.contractEndDate   || null,
      metadata: { ...form.metadata, ...extraMeta },
    };
  };

  async function handleSaveDraft() {
    if (!form.customerName || !form.dealName || !form.dealType || !form.revenue) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      if (editDeal) {
        await updateM.mutateAsync({ dealId: editDeal.id, data: getInput() });
        toast({ title: "Deal saved" });
      } else {
        await createM.mutateAsync({ data: getInput() });
        toast({ title: "Draft saved" });
      }
      closeDialog();
      refetch();
    } catch {
      toast({ title: "Error saving deal", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitForApproval() {
    if (!form.customerName || !form.dealName || !form.dealType || !form.revenue) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      let targetId: string;
      if (editDeal) {
        await updateM.mutateAsync({ dealId: editDeal.id, data: getInput() });
        targetId = editDeal.id;
      } else {
        const created = await createM.mutateAsync({ data: getInput() });
        targetId = created.id;
      }
      await submitM.mutateAsync({ dealId: targetId });
      toast({ title: "Deal submitted for approval", description: "Managers have been notified." });
      closeDialog();
      refetch();
    } catch {
      toast({ title: "Error submitting deal", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitExisting(deal: Deal) {
    try {
      await submitM.mutateAsync({ dealId: deal.id });
      toast({ title: "Deal submitted for approval" });
      refetch();
    } catch {
      toast({ title: "Error submitting deal", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteM.mutateAsync({ dealId: deleteTarget.id });
      toast({ title: "Deal deleted" });
      setDeleteTarget(null);
      refetch();
    } catch {
      toast({ title: "Error deleting deal", variant: "destructive" });
    }
  }

  const isFormValid = form.customerName && form.dealName && form.dealType && form.revenue;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Deals</h1>
          <p className="text-muted-foreground">Manage and submit your commission deals</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Deal
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Deals",   value: String(stats.total),             icon: Briefcase,    accent: "border-l-primary" },
          { label: "Drafts",        value: String(stats.draft),             icon: Clock,        accent: "border-l-slate-400" },
          { label: "In Approval",   value: String(stats.pending),           icon: TrendingUp,   accent: "border-l-amber-400" },
          { label: "My Commission", value: formatCurrency(stats.totalComm), icon: DollarSign,   accent: "border-l-emerald-500" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by deal or customer name..."
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
                <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                <SelectItem value="MANAGER_APPROVED">Manager Approved</SelectItem>
                <SelectItem value="FINANCE_APPROVED">Finance Approved</SelectItem>
                <SelectItem value="EXECUTIVE_APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DEAL_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">Deal</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium text-right">Revenue</th>
                    <th className="px-6 py-3 font-medium text-right">GP</th>
                    <th className="px-6 py-3 font-medium text-right">GP%</th>
                    <th className="px-6 py-3 font-medium text-right">Commission</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Submitted</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        No deals found.{" "}
                        <button
                          className="text-primary hover:underline"
                          onClick={openCreate}
                        >
                          Create your first deal
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((deal) => (
                      <tr
                        key={deal.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{deal.dealName}</div>
                          <div className="text-xs text-muted-foreground">{deal.customerName}</div>
                          {deal.contractStartDate && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(deal.contractStartDate)}
                              {deal.contractEndDate ? ` → ${formatDate(deal.contractEndDate)}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <TypeBadge type={deal.dealType} />
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {formatCurrency(deal.revenue)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {formatCurrency(deal.grossProfit)}
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {deal.grossProfitPercentage.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-primary">
                          {formatCurrency(deal.commission)}
                          <div className="text-xs font-normal text-muted-foreground">
                            {deal.commissionPercentage}%
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {deal.status === "DRAFT" ? (
                            <StatusBadge status={deal.status} />
                          ) : (
                            <button
                              onClick={() => openWorkflow(deal)}
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              title="View approval progress"
                            >
                              <StatusBadge status={deal.status} />
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">
                          {deal.submittedAt ? formatDate(deal.submittedAt) : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="View"
                              onClick={() => setViewDeal(deal)}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {deal.status === "DRAFT" && (
                              <>
                                <button
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit"
                                  onClick={() => openEdit(deal)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition-colors"
                                  title="Submit for Approval"
                                  onClick={() => handleSubmitExisting(deal)}
                                >
                                  <SendHorizontal className="h-4 w-4" />
                                </button>
                                <button
                                  className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                                  title="Delete"
                                  onClick={() => setDeleteTarget(deal)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
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

      <Dialog open={showDialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editDeal
                ? `Edit ${industryConfig.eventLabel} — ${editDeal.dealName}`
                : `New ${industryConfig.eventLabel}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="customerName">{industryConfig.entityLabel} <span className="text-destructive">*</span></Label>
                <CustomerCombobox
                  value={form.customerName}
                  onChange={(v) => setField("customerName", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dealName">{industryConfig.eventLabel} Name <span className="text-destructive">*</span></Label>
                <Input
                  id="dealName"
                  placeholder={`e.g. ${industryConfig.eventLabel} 2025`}
                  value={form.dealName}
                  onChange={(e) => setField("dealName", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Type <span className="text-destructive">*</span></Label>
                <Select value={form.dealType} onValueChange={(v) => setField("dealType", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {industryConfig.eventTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isIT ? "Contract Start" : "Start Date"}</Label>
                <DatePicker
                  value={form.contractStartDate}
                  onChange={(v) => setField("contractStartDate", v)}
                  placeholder="Select start date"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isIT ? "Contract End" : "End Date"}</Label>
                <DatePicker
                  value={form.contractEndDate}
                  onChange={(v) => setField("contractEndDate", v)}
                  placeholder="Select end date"
                />
              </div>
            </div>

            <div className={`grid gap-4 ${industryConfig.costLabel ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1.5">
                <Label htmlFor="revenue">{industryConfig.revenueLabel} (ZAR) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R</span>
                  <Input
                    id="revenue"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.revenue}
                    onChange={(e) => setField("revenue", e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
              {industryConfig.costLabel && (
                <div className="space-y-1.5">
                  <Label htmlFor="cost">{industryConfig.costLabel} (ZAR)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R</span>
                    <Input
                      id="cost"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.cost}
                      onChange={(e) => setField("cost", e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
              )}
            </div>

            {industryConfig.extraFields.length > 0 && (
              <div className={`grid gap-4 ${industryConfig.extraFields.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {industryConfig.extraFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={field.key}>
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {field.type === "select" && field.options ? (
                      <Select
                        value={form.metadata[field.key] ?? ""}
                        onValueChange={(v) => setForm(f => ({ ...f, metadata: { ...f.metadata, [field.key]: v } }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={field.placeholder ?? "Select..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "currency" ? (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R</span>
                        <Input
                          id={field.key}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={field.placeholder ?? "0.00"}
                          value={form.metadata[field.key] ?? ""}
                          onChange={(e) => setForm(f => ({ ...f, metadata: { ...f.metadata, [field.key]: e.target.value } }))}
                          className="pl-7"
                        />
                      </div>
                    ) : (
                      <Input
                        id={field.key}
                        type={field.type === "number" ? "number" : "text"}
                        placeholder={field.placeholder}
                        value={form.metadata[field.key] ?? ""}
                        onChange={(e) => setForm(f => ({ ...f, metadata: { ...f.metadata, [field.key]: e.target.value } }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {(rev > 0 || cst > 0) && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Commission Preview
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {industryConfig.showGP && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gross Profit</span>
                        <span className={`font-medium ${gp >= 0 ? "text-foreground" : "text-destructive"}`}>
                          {formatCurrency(gp)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GP%</span>
                        <span className="font-medium text-foreground">
                          {gpPct.toFixed(1)}%
                        </span>
                      </div>
                    </>
                  )}
                  {!industryConfig.showGP && (
                    <div className="flex justify-between col-span-2">
                      <span className="text-muted-foreground">{industryConfig.revenueLabel}</span>
                      <span className="font-medium text-foreground">{formatCurrency(rev)}</span>
                    </div>
                  )}
                  {form.dealType && (
                    <>
                      <div className="flex justify-between col-span-2">
                        <span className="text-muted-foreground">Commission Rule</span>
                        <span className="font-medium text-foreground text-right max-w-[60%]">
                          {commInfo.label}
                        </span>
                      </div>
                      <div className="flex justify-between col-span-2 pt-1 border-t border-border">
                        <span className="text-muted-foreground font-medium">Calculated Commission</span>
                        <span className="font-bold text-primary text-base">
                          {formatCurrency(commAmt)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={submitting || !isFormValid}
            >
              {submitting ? "Saving…" : editDeal ? "Save Changes" : "Save as Draft"}
            </Button>
            <Button
              onClick={handleSubmitForApproval}
              disabled={submitting || !isFormValid}
            >
              <SendHorizontal className="mr-2 h-4 w-4" />
              {submitting ? "Submitting…" : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewDeal && (
        <Dialog open={!!viewDeal} onOpenChange={(open) => !open && setViewDeal(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{viewDeal.dealName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: "Customer",   value: viewDeal.customerName },
                  { label: "Type",       value: <TypeBadge type={viewDeal.dealType} /> },
                  { label: "Status",     value: <StatusBadge status={viewDeal.status} /> },
                  { label: "Revenue",    value: formatCurrency(viewDeal.revenue) },
                  { label: "Cost",       value: formatCurrency(viewDeal.cost) },
                  { label: "Gross Profit", value: formatCurrency(viewDeal.grossProfit) },
                  { label: "GP%",        value: `${viewDeal.grossProfitPercentage.toFixed(1)}%` },
                  { label: "Commission %", value: `${viewDeal.commissionPercentage}%` },
                  { label: "Commission", value: <span className="font-bold text-primary">{formatCurrency(viewDeal.commission)}</span> },
                  { label: "Submitted",  value: viewDeal.submittedAt ? formatDate(viewDeal.submittedAt) : "Not submitted" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <div className="font-medium mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
              {(viewDeal.contractStartDate || viewDeal.contractEndDate) && (
                <div className="pt-2 border-t border-border">
                  <p className="text-muted-foreground text-xs">Contract Period</p>
                  <p className="font-medium mt-0.5">
                    {viewDeal.contractStartDate ? formatDate(viewDeal.contractStartDate) : "—"}
                    {" → "}
                    {viewDeal.contractEndDate ? formatDate(viewDeal.contractEndDate) : "Open-ended"}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setViewDeal(null)}>Close</Button>
              {viewDeal.status === "DRAFT" && (
                <Button onClick={() => { setViewDeal(null); openEdit(viewDeal); }}>
                  <Edit2 className="mr-2 h-4 w-4" /> Edit Deal
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Approval Workflow Dialog */}
      <Dialog open={!!workflowDeal} onOpenChange={(open) => !open && setWorkflowDeal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approval Progress</DialogTitle>
            <p className="text-sm text-muted-foreground">{workflowDeal?.name}</p>
          </DialogHeader>
          {workflowLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : workflowSteps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No approval steps recorded.</p>
          ) : (
            <ol className="relative mt-2 space-y-0">
              {workflowSteps
                .filter((s: any) => s.approverRole !== "SALES_EXECUTIVE" && s.approverRole !== "PAYROLL")
                .map((step, idx, visibleSteps) => {
                const isApproved = step.status === "APPROVED";
                const isRejected = step.status === "REJECTED";
                const isActive   = step.status === "PENDING" && visibleSteps.slice(0, idx).every((s: any) => s.status === "APPROVED");
                const isLast     = idx === visibleSteps.length - 1;

                const ROLE_LABELS: Record<string, string> = {
                  MANAGER: "Sales Manager",
                  FINANCE: "Finance",
                  EXECUTIVE: "Executive",
                  SALES_EXECUTIVE: "Sales Executive",
                  PAYROLL: "Payroll",
                };
                const roleLabel = ROLE_LABELS[step.approverRole] ?? step.approverRole;

                const iconEl = isApproved
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  : isRejected
                  ? <XCircle className="h-5 w-5 text-red-500" />
                  : isActive
                  ? <Clock className="h-5 w-5 text-amber-400" />
                  : <CircleDot className="h-5 w-5 text-muted-foreground/40" />;

                const statusPill = isApproved
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 font-medium">Approved</span>
                  : isRejected
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 font-medium">Rejected</span>
                  : isActive
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 font-medium">Awaiting</span>
                  : <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not yet reached</span>;

                return (
                  <li key={step.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="mt-0.5 shrink-0">{iconEl}</div>
                      {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-1" />}
                    </div>
                    <div className="pb-5 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold text-foreground">
                            {step.stepName ?? `Step ${step.approvalLevel}`}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">({roleLabel})</span>
                        </div>
                        {statusPill}
                      </div>
                      {isApproved && step.approverName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ✓ Approved by <span className="font-medium text-foreground">{step.approverName}</span>
                          {step.approvedAt && (
                            <span className="ml-1">
                              · {new Date(step.approvedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                          )}
                        </p>
                      )}
                      {isRejected && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ✗ Rejected{step.approverName ? <> by <span className="font-medium text-foreground">{step.approverName}</span></> : null}
                          {step.approvedAt && (
                            <span className="ml-1">
                              · {new Date(step.approvedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                          )}
                        </p>
                      )}
                      {isActive && (
                        <p className="text-xs text-amber-400/80 mt-1">
                          Waiting for <span className="font-medium">{step.approverName ?? roleLabel}</span> to review
                        </p>
                      )}
                      {step.comments && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{step.comments}"</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWorkflowDeal(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.dealName}&rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

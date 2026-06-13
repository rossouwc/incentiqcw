import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCommissionRules,
  useCreateCommissionRule,
  useUpdateCommissionRule,
  useDeleteCommissionRule,
  getListCommissionRulesQueryKey,
} from "@workspace/api-client-react";
import type { CommissionRule } from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import {
  Plus, Search, Sliders, Pencil, Trash2, Power, PowerOff,
  CalendarRange, TrendingUp, CheckCircle2, XCircle,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEAL_TYPE_OPTIONS = [
  { value: "NET_NEW",   label: "Net New"   },
  { value: "RENEWAL",   label: "Renewal"   },
  { value: "UPSELL",    label: "Upsell"    },
  { value: "CROSS_SELL", label: "Cross-Sell" },
];

const DEAL_TYPE_COLORS: Record<string, string> = {
  NET_NEW:    "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  RENEWAL:    "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  UPSELL:     "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  CROSS_SELL: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
};

// ─── Form types ──────────────────────────────────────────────────────────────

interface FormState {
  ruleName: string;
  dealType: string;
  commissionPercentage: string;
  appliesToRole: string;
  minGrossProfit: string;
  maxGrossProfit: string;
  effectiveFrom: string;
  effectiveTo: string;
}

interface FormErrors {
  ruleName?: string;
  dealType?: string;
  commissionPercentage?: string;
  effectiveFrom?: string;
  minGrossProfit?: string;
  maxGrossProfit?: string;
}

const EMPTY_FORM: FormState = {
  ruleName: "",
  dealType: "",
  commissionPercentage: "",
  appliesToRole: "SALES_EXECUTIVE",
  minGrossProfit: "",
  maxGrossProfit: "",
  effectiveFrom: "",
  effectiveTo: "",
};

function ruleToForm(rule: CommissionRule): FormState {
  return {
    ruleName: rule.ruleName,
    dealType: rule.dealType,
    commissionPercentage: String(rule.commissionPercentage),
    appliesToRole: rule.appliesToRole ?? "SALES_EXECUTIVE",
    minGrossProfit: rule.minGrossProfit != null ? String(rule.minGrossProfit) : "",
    maxGrossProfit: rule.maxGrossProfit != null ? String(rule.maxGrossProfit) : "",
    effectiveFrom: rule.effectiveFrom.slice(0, 10),
    effectiveTo: rule.effectiveTo ? rule.effectiveTo.slice(0, 10) : "",
  };
}

function validateForm(form: FormState, isEdit: boolean): FormErrors {
  const errors: FormErrors = {};

  if (!isEdit) {
    if (!form.ruleName.trim()) errors.ruleName = "Rule name is required";
    if (!form.dealType)        errors.dealType = "Deal type is required";
    if (!form.effectiveFrom)   errors.effectiveFrom = "Effective from date is required";
  }

  if (form.commissionPercentage !== "") {
    const val = parseFloat(form.commissionPercentage);
    if (isNaN(val) || val < 0 || val > 100)
      errors.commissionPercentage = "Must be between 0 and 100";
  } else if (!isEdit) {
    errors.commissionPercentage = "Commission percentage is required";
  }

  if (form.minGrossProfit !== "" && form.maxGrossProfit !== "") {
    const min = parseFloat(form.minGrossProfit);
    const max = parseFloat(form.maxGrossProfit);
    if (!isNaN(min) && !isNaN(max) && min >= max)
      errors.maxGrossProfit = "Max must be greater than min";
  }

  return errors;
}

// ─── Form field component ─────────────────────────────────────────────────────

function Field({
  label, required, error, hint, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CommissionRules() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: rules, isLoading } = useListCommissionRules();
  const createMutation  = useCreateCommissionRule();
  const updateMutation  = useUpdateCommissionRule();
  const deleteMutation  = useDeleteCommissionRule();

  const list: CommissionRule[] = Array.isArray(rules) ? rules : [];

  // ─── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [filterDealType, setFilterDealType] = useState("ALL");

  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [form, setForm]               = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors]           = useState<FormErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<CommissionRule | null>(null);

  // Sync form when editingRule changes
  useEffect(() => {
    if (editingRule) {
      setForm(ruleToForm(editingRule));
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
  }, [editingRule]);

  // ─── Filtered list ─────────────────────────────────────────────────────────
  const filtered = list.filter(r => {
    const matchSearch = !search || r.ruleName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "ALL" || r.status === filterStatus;
    const matchType   = filterDealType === "ALL" || r.dealType === filterDealType;
    return matchSearch && matchStatus && matchType;
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function invalidate() {
    qc.invalidateQueries({ queryKey: getListCommissionRulesQueryKey() });
  }

  function openCreate() {
    setEditingRule(null);
    setDialogOpen(true);
  }

  function openEdit(rule: CommissionRule) {
    setEditingRule(rule);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRule(null);
    setErrors({});
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [key]: undefined }));
    }
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit() {
    const isEdit = !!editingRule;
    const errs = validateForm(form, isEdit);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    if (isEdit) {
      const data: Record<string, unknown> = {};
      if (form.ruleName.trim())          data.ruleName = form.ruleName.trim();
      if (form.commissionPercentage !== "") data.commissionPercentage = parseFloat(form.commissionPercentage);
      data.minGrossProfit = form.minGrossProfit !== "" ? parseFloat(form.minGrossProfit) : null;
      data.maxGrossProfit = form.maxGrossProfit !== "" ? parseFloat(form.maxGrossProfit) : null;
      data.effectiveTo    = form.effectiveTo || null;

      updateMutation.mutate(
        { ruleId: editingRule!.id, data: data as any },
        {
          onSuccess: () => {
            invalidate();
            closeDialog();
            toast({ title: "Rule updated", description: `"${editingRule!.ruleName}" has been updated.` });
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      const data: Record<string, unknown> = {
        ruleName: form.ruleName.trim(),
        dealType: form.dealType,
        commissionPercentage: parseFloat(form.commissionPercentage),
        effectiveFrom: form.effectiveFrom,
      };
      if (form.appliesToRole) data.appliesToRole = form.appliesToRole;
      if (form.minGrossProfit !== "") data.minGrossProfit = parseFloat(form.minGrossProfit);
      if (form.maxGrossProfit !== "") data.maxGrossProfit = parseFloat(form.maxGrossProfit);
      if (form.effectiveTo)  data.effectiveTo = form.effectiveTo;

      createMutation.mutate(
        { data: data as any },
        {
          onSuccess: () => {
            invalidate();
            closeDialog();
            toast({ title: "Rule created", description: `"${form.ruleName}" is now active.` });
          },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        }
      );
    }
  }

  // ─── Toggle status ─────────────────────────────────────────────────────────
  function toggleStatus(rule: CommissionRule) {
    const newStatus = rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    updateMutation.mutate(
      { ruleId: rule.id, data: { status: newStatus as any } },
      {
        onSuccess: () => {
          invalidate();
          toast({
            title: newStatus === "ACTIVE" ? "Rule activated" : "Rule deactivated",
            description: `"${rule.ruleName}" is now ${newStatus.toLowerCase()}.`,
          });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { ruleId: deleteTarget.id },
      {
        onSuccess: () => {
          invalidate();
          setDeleteTarget(null);
          toast({ title: "Rule deleted", description: `"${deleteTarget.ruleName}" has been removed.` });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Commission Rules</h1>
          <p className="text-muted-foreground">Configure how commissions are calculated for each deal type</p>
        </div>
        <Button onClick={openCreate} className="gap-2 self-start">
          <Plus className="h-4 w-4" /> New Rule
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Total Rules",        value: list.length,                                             icon: Sliders,       accent: "border-l-primary"      },
          { title: "Active Rules",       value: list.filter(r => r.status === "ACTIVE").length,          icon: CheckCircle2,  accent: "border-l-emerald-500"  },
          { title: "Deal Types Covered", value: new Set(list.filter(r => r.status === "ACTIVE").map(r => r.dealType)).size, icon: TrendingUp, accent: "border-l-amber-400" },
        ].map(({ title, value, icon: Icon, accent }) => (
          <Card key={title} className={`border-l-4 ${accent} shadow-sm`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-12" /> : (
                <div className="text-2xl font-bold">{value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rules..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterDealType} onValueChange={setFilterDealType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All deal types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Deal Types</SelectItem>
                {DEAL_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => setFilterStatus(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Rule Name</th>
                    <th className="px-6 py-4 font-medium">Deal Type</th>
                    <th className="px-6 py-4 font-medium text-right">Commission %</th>
                    <th className="px-6 py-4 font-medium">GP Thresholds</th>
                    <th className="px-6 py-4 font-medium">Effective Period</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-14 text-center text-muted-foreground">
                        <Sliders className="h-9 w-9 mx-auto mb-2 opacity-40" />
                        <p className="font-medium">No commission rules found</p>
                        <p className="text-xs mt-1">Create a rule to start calculating commissions</p>
                      </td>
                    </tr>
                  ) : filtered.map(rule => (
                    <tr
                      key={rule.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${rule.status === "INACTIVE" ? "opacity-60" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{rule.ruleName}</div>
                        {rule.appliesToRole && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Applies to: {rule.appliesToRole.replace(/_/g, " ")}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[rule.dealType] ?? "bg-muted text-muted-foreground"}`}>
                          {DEAL_TYPE_OPTIONS.find(o => o.value === rule.dealType)?.label ?? rule.dealType.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span className="text-xl font-bold text-primary">{rule.commissionPercentage}%</span>
                      </td>

                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {rule.minGrossProfit != null || rule.maxGrossProfit != null ? (
                          <div className="space-y-0.5">
                            {rule.minGrossProfit != null && <div>Min: R{rule.minGrossProfit.toLocaleString()}</div>}
                            {rule.maxGrossProfit != null && <div>Max: R{rule.maxGrossProfit.toLocaleString()}</div>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">No limits</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <CalendarRange className="h-3 w-3 shrink-0" />
                          <span>
                            {formatDate(rule.effectiveFrom)}
                            {rule.effectiveTo ? ` – ${formatDate(rule.effectiveTo)}` : " onwards"}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${rule.status === "ACTIVE"
                            ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-400"
                            : "bg-muted text-muted-foreground"}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${rule.status === "ACTIVE" ? "bg-green-500" : "bg-muted-foreground"}`} />
                          {rule.status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            title="Edit"
                            onClick={() => openEdit(rule)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            title={rule.status === "ACTIVE" ? "Deactivate" : "Activate"}
                            onClick={() => toggleStatus(rule)}
                            disabled={updateMutation.isPending}
                          >
                            {rule.status === "ACTIVE"
                              ? <PowerOff className="h-3.5 w-3.5 text-amber-500" />
                              : <Power className="h-3.5 w-3.5 text-emerald-500" />
                            }
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            title="Delete"
                            onClick={() => setDeleteTarget(rule)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
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

      {/* Deal-type coverage summary */}
      {!isLoading && list.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DEAL_TYPE_OPTIONS.map(({ value, label }) => {
            const active = list.filter(r => r.dealType === value && r.status === "ACTIVE");
            const total  = list.filter(r => r.dealType === value);
            const hasActive = active.length > 0;
            return (
              <div
                key={value}
                className={`p-4 rounded-xl border transition-all ${hasActive ? "border-border bg-card" : "border-dashed border-border/50 bg-muted/30"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[value]}`}>
                    {label}
                  </span>
                  {hasActive
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <XCircle className="h-4 w-4 text-muted-foreground/50" />
                  }
                </div>
                <div className="text-xl font-bold">{active.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {active.length === 0 ? "No active rules" : `active rule${active.length > 1 ? "s" : ""}`}
                  {total.length > active.length && ` (${total.length - active.length} inactive)`}
                </div>
                {active.length > 0 && (
                  <div className="text-sm font-semibold text-primary mt-1">
                    {active[0].commissionPercentage}%
                    {active.length > 1 && <span className="text-xs font-normal text-muted-foreground ml-1">+ {active.length - 1} more</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create / Edit dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Commission Rule" : "Create Commission Rule"}</DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Update the commission rule settings. Deal type and effective start date cannot be changed."
                : "Define a new commission rule. The tenant is automatically set from your account."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Rule Name */}
            <Field label="Rule Name" required={!editingRule} error={errors.ruleName}>
              <Input
                placeholder="e.g. Standard Net New 10%"
                value={form.ruleName}
                onChange={e => setField("ruleName", e.target.value)}
              />
            </Field>

            {/* Deal Type */}
            <Field label="Deal Type" required={!editingRule} error={errors.dealType}>
              {editingRule ? (
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted/40 text-sm">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[form.dealType] ?? ""}`}>
                    {DEAL_TYPE_OPTIONS.find(o => o.value === form.dealType)?.label ?? form.dealType}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">(cannot be changed)</span>
                </div>
              ) : (
                <Select value={form.dealType} onValueChange={v => setField("dealType", v)}>
                  <SelectTrigger className={errors.dealType ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select deal type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            {/* Commission Percentage */}
            <Field
              label="Commission Percentage"
              required
              error={errors.commissionPercentage}
              hint="Enter a value between 0 and 100"
            >
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="e.g. 10"
                  className={`pr-8 ${errors.commissionPercentage ? "border-red-500" : ""}`}
                  value={form.commissionPercentage}
                  onChange={e => setField("commissionPercentage", e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
              </div>
            </Field>

            {/* Thresholds */}
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Min Gross Profit (R)"
                error={errors.minGrossProfit}
                hint="Optional lower GP limit"
              >
                <Input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="e.g. 10000"
                  value={form.minGrossProfit}
                  onChange={e => setField("minGrossProfit", e.target.value)}
                />
              </Field>
              <Field
                label="Max Gross Profit (R)"
                error={errors.maxGrossProfit}
                hint="Optional upper GP limit"
              >
                <Input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="e.g. 500000"
                  value={form.maxGrossProfit}
                  onChange={e => setField("maxGrossProfit", e.target.value)}
                />
              </Field>
            </div>

            {/* Effective Dates */}
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Effective From"
                required={!editingRule}
                error={errors.effectiveFrom}
              >
                {editingRule ? (
                  <div className="flex items-center h-10 px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
                    {formatDate(form.effectiveFrom)} <span className="ml-2 text-xs">(locked)</span>
                  </div>
                ) : (
                  <Input
                    type="date"
                    className={errors.effectiveFrom ? "border-red-500" : ""}
                    value={form.effectiveFrom}
                    onChange={e => setField("effectiveFrom", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Effective To" hint="Leave blank for no end date">
                <Input
                  type="date"
                  value={form.effectiveTo}
                  min={form.effectiveFrom || undefined}
                  onChange={e => setField("effectiveTo", e.target.value)}
                />
              </Field>
            </div>

            {/* Applies To Role */}
            <Field label="Applies To Role" hint="Defaults to Sales Executive">
              <Select value={form.appliesToRole} onValueChange={v => setField("appliesToRole", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES_EXECUTIVE">Sales Executive</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? "Saving…" : editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Commission Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteTarget?.ruleName}"</strong>?
              This action cannot be undone and may affect commission calculations for new deals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCommissionRules,
  useCreateCommissionRule,
  useUpdateCommissionRule,
  useDeleteCommissionRule,
  getListCommissionRulesQueryKey,
  useListCommissionRuleGroups,
  useCreateCommissionRuleGroup,
  useUpdateCommissionRuleGroup,
  useDeleteCommissionRuleGroup,
  getListCommissionRuleGroupsQueryKey,
  useListUsers,
} from "@workspace/api-client-react";
import type {
  CommissionRule,
  CommissionRuleGroup,
} from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  CalendarRange, TrendingUp, CheckCircle2, XCircle, Users, Layers,
  UserCheck, UserX, ChevronRight,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEAL_TYPE_OPTIONS = [
  { value: "NET_NEW",    label: "Net New"    },
  { value: "RENEWAL",   label: "Renewal"    },
  { value: "UPSELL",    label: "Upsell"     },
  { value: "CROSS_SELL", label: "Cross-Sell" },
];

const DEAL_TYPE_COLORS: Record<string, string> = {
  NET_NEW:    "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  RENEWAL:    "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  UPSELL:     "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  CROSS_SELL: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
};

// ─── Rule form ────────────────────────────────────────────────────────────────

interface RuleFormState {
  ruleName: string;
  dealType: string;
  commissionPercentage: string;
  appliesToRole: string;
  minGrossProfit: string;
  maxGrossProfit: string;
  effectiveFrom: string;
  effectiveTo: string;
}

interface RuleFormErrors {
  ruleName?: string;
  dealType?: string;
  commissionPercentage?: string;
  effectiveFrom?: string;
  maxGrossProfit?: string;
}

const EMPTY_RULE_FORM: RuleFormState = {
  ruleName: "", dealType: "", commissionPercentage: "", appliesToRole: "SALES_EXECUTIVE",
  minGrossProfit: "", maxGrossProfit: "", effectiveFrom: "", effectiveTo: "",
};

function ruleToForm(rule: CommissionRule): RuleFormState {
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

function validateRuleForm(form: RuleFormState, isEdit: boolean): RuleFormErrors {
  const errors: RuleFormErrors = {};
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

// ─── Group form ───────────────────────────────────────────────────────────────

interface GroupFormState {
  groupName: string;
  description: string;
  assignToAll: boolean;
  ruleIds: string[];
  memberUserIds: string[];
}

interface GroupFormErrors {
  groupName?: string;
  ruleIds?: string;
}

const EMPTY_GROUP_FORM: GroupFormState = {
  groupName: "", description: "", assignToAll: false, ruleIds: [], memberUserIds: [],
};

function groupToForm(g: CommissionRuleGroup): GroupFormState {
  return {
    groupName: g.groupName,
    description: g.description ?? "",
    assignToAll: g.assignToAll,
    ruleIds: g.rules.map((r) => r.id),
    memberUserIds: g.members.map((m) => m.id),
  };
}

function validateGroupForm(form: GroupFormState): GroupFormErrors {
  const errors: GroupFormErrors = {};
  if (!form.groupName.trim()) errors.groupName = "Group name is required";
  if (form.ruleIds.length === 0) errors.ruleIds = "Select at least one commission rule";
  return errors;
}

// ─── Shared field component ───────────────────────────────────────────────────

function Field({
  label, required, error, hint, children,
}: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
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

  const { data: rules, isLoading: rulesLoading } = useListCommissionRules();
  const { data: groups, isLoading: groupsLoading } = useListCommissionRuleGroups();
  const { data: allUsers } = useListUsers();

  const createRuleMutation  = useCreateCommissionRule();
  const updateRuleMutation  = useUpdateCommissionRule();
  const deleteRuleMutation  = useDeleteCommissionRule();
  const createGroupMutation = useCreateCommissionRuleGroup();
  const updateGroupMutation = useUpdateCommissionRuleGroup();
  const deleteGroupMutation = useDeleteCommissionRuleGroup();

  const ruleList: CommissionRule[]  = Array.isArray(rules)  ? rules  : [];
  const groupList: CommissionRuleGroup[] = Array.isArray(groups) ? groups : [];
  const salesExecs = (Array.isArray(allUsers) ? allUsers : [])
    .filter((u: any) => u.role === "SALES_EXECUTIVE" && u.status === "ACTIVE");

  // ─── Rules UI state ────────────────────────────────────────────────────────
  const [ruleSearch, setRuleSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [filterDealType, setFilterDealType] = useState("ALL");

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE_FORM);
  const [ruleErrors, setRuleErrors] = useState<RuleFormErrors>({});
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<CommissionRule | null>(null);

  useEffect(() => {
    if (editingRule) setRuleForm(ruleToForm(editingRule));
    else setRuleForm(EMPTY_RULE_FORM);
    setRuleErrors({});
  }, [editingRule]);

  // ─── Groups UI state ───────────────────────────────────────────────────────
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CommissionRuleGroup | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(EMPTY_GROUP_FORM);
  const [groupErrors, setGroupErrors] = useState<GroupFormErrors>({});
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<CommissionRuleGroup | null>(null);

  useEffect(() => {
    if (editingGroup) setGroupForm(groupToForm(editingGroup));
    else setGroupForm(EMPTY_GROUP_FORM);
    setGroupErrors({});
  }, [editingGroup]);

  // ─── Filtered lists ────────────────────────────────────────────────────────
  const filteredRules = ruleList.filter(r => {
    const matchSearch = !ruleSearch || r.ruleName.toLowerCase().includes(ruleSearch.toLowerCase());
    const matchStatus = filterStatus === "ALL" || r.status === filterStatus;
    const matchType   = filterDealType === "ALL" || r.dealType === filterDealType;
    return matchSearch && matchStatus && matchType;
  });

  const filteredGroups = groupList.filter(g =>
    !groupSearch || g.groupName.toLowerCase().includes(groupSearch.toLowerCase())
  );

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function invalidateRules()  { qc.invalidateQueries({ queryKey: getListCommissionRulesQueryKey() }); }
  function invalidateGroups() { qc.invalidateQueries({ queryKey: getListCommissionRuleGroupsQueryKey() }); }

  // ─── Rule handlers ─────────────────────────────────────────────────────────
  function setRuleField<K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) {
    setRuleForm(prev => ({ ...prev, [key]: value }));
    if (ruleErrors[key as keyof RuleFormErrors]) setRuleErrors(prev => ({ ...prev, [key]: undefined }));
  }

  function submitRule() {
    const isEdit = !!editingRule;
    const errs = validateRuleForm(ruleForm, isEdit);
    if (Object.keys(errs).length > 0) { setRuleErrors(errs); return; }

    if (isEdit) {
      const data: Record<string, unknown> = {};
      if (ruleForm.ruleName.trim()) data.ruleName = ruleForm.ruleName.trim();
      if (ruleForm.commissionPercentage !== "") data.commissionPercentage = parseFloat(ruleForm.commissionPercentage);
      data.minGrossProfit = ruleForm.minGrossProfit !== "" ? parseFloat(ruleForm.minGrossProfit) : null;
      data.maxGrossProfit = ruleForm.maxGrossProfit !== "" ? parseFloat(ruleForm.maxGrossProfit) : null;
      data.effectiveTo    = ruleForm.effectiveTo || null;
      updateRuleMutation.mutate(
        { ruleId: editingRule!.id, data: data as any },
        {
          onSuccess: () => { invalidateRules(); setRuleDialogOpen(false); setEditingRule(null); toast({ title: "Rule updated" }); },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      const data: Record<string, unknown> = {
        ruleName: ruleForm.ruleName.trim(), dealType: ruleForm.dealType,
        commissionPercentage: parseFloat(ruleForm.commissionPercentage),
        effectiveFrom: ruleForm.effectiveFrom,
      };
      if (ruleForm.appliesToRole) data.appliesToRole = ruleForm.appliesToRole;
      if (ruleForm.minGrossProfit !== "") data.minGrossProfit = parseFloat(ruleForm.minGrossProfit);
      if (ruleForm.maxGrossProfit !== "") data.maxGrossProfit = parseFloat(ruleForm.maxGrossProfit);
      if (ruleForm.effectiveTo) data.effectiveTo = ruleForm.effectiveTo;
      createRuleMutation.mutate(
        { data: data as any },
        {
          onSuccess: () => { invalidateRules(); setRuleDialogOpen(false); toast({ title: "Rule created", description: `"${ruleForm.ruleName}" is now active.` }); },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        }
      );
    }
  }

  function toggleRuleStatus(rule: CommissionRule) {
    const newStatus = rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    updateRuleMutation.mutate(
      { ruleId: rule.id, data: { status: newStatus as any } },
      {
        onSuccess: () => { invalidateRules(); toast({ title: newStatus === "ACTIVE" ? "Rule activated" : "Rule deactivated" }); },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  }

  function confirmDeleteRule() {
    if (!deleteRuleTarget) return;
    deleteRuleMutation.mutate(
      { ruleId: deleteRuleTarget.id },
      {
        onSuccess: () => { invalidateRules(); setDeleteRuleTarget(null); toast({ title: "Rule deleted" }); },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  // ─── Group handlers ────────────────────────────────────────────────────────
  function setGroupField<K extends keyof GroupFormState>(key: K, value: GroupFormState[K]) {
    setGroupForm(prev => ({ ...prev, [key]: value }));
    if (groupErrors[key as keyof GroupFormErrors]) setGroupErrors(prev => ({ ...prev, [key]: undefined }));
  }

  function toggleGroupRule(ruleId: string) {
    setGroupForm(prev => ({
      ...prev,
      ruleIds: prev.ruleIds.includes(ruleId)
        ? prev.ruleIds.filter(id => id !== ruleId)
        : [...prev.ruleIds, ruleId],
    }));
    if (groupErrors.ruleIds) setGroupErrors(prev => ({ ...prev, ruleIds: undefined }));
  }

  function toggleGroupMember(userId: string) {
    setGroupForm(prev => ({
      ...prev,
      memberUserIds: prev.memberUserIds.includes(userId)
        ? prev.memberUserIds.filter(id => id !== userId)
        : [...prev.memberUserIds, userId],
    }));
  }

  function submitGroup() {
    const errs = validateGroupForm(groupForm);
    if (Object.keys(errs).length > 0) { setGroupErrors(errs); return; }

    const payload = {
      groupName: groupForm.groupName.trim(),
      description: groupForm.description.trim() || undefined,
      assignToAll: groupForm.assignToAll,
      ruleIds: groupForm.ruleIds,
      memberUserIds: groupForm.assignToAll ? [] : groupForm.memberUserIds,
    };

    if (editingGroup) {
      updateGroupMutation.mutate(
        { groupId: editingGroup.id, data: payload as any },
        {
          onSuccess: () => { invalidateGroups(); setGroupDialogOpen(false); setEditingGroup(null); toast({ title: "Group updated" }); },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      createGroupMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => { invalidateGroups(); setGroupDialogOpen(false); toast({ title: "Group created", description: `"${groupForm.groupName}" is ready.` }); },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        }
      );
    }
  }

  function toggleGroupStatus(group: CommissionRuleGroup) {
    const newStatus = group.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    updateGroupMutation.mutate(
      { groupId: group.id, data: { status: newStatus as any } },
      {
        onSuccess: () => { invalidateGroups(); toast({ title: newStatus === "ACTIVE" ? "Group activated" : "Group deactivated" }); },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  }

  function confirmDeleteGroup() {
    if (!deleteGroupTarget) return;
    deleteGroupMutation.mutate(
      { groupId: deleteGroupTarget.id },
      {
        onSuccess: () => { invalidateGroups(); setDeleteGroupTarget(null); toast({ title: "Group deleted" }); },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  const isRuleSaving  = createRuleMutation.isPending  || updateRuleMutation.isPending;
  const isGroupSaving = createGroupMutation.isPending || updateGroupMutation.isPending;
  const activeRuleList = ruleList.filter(r => r.status === "ACTIVE");

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Commission Rules</h1>
        <p className="text-muted-foreground">Configure commission rates and organise them into groups per sales executive</p>
      </div>

      <Tabs defaultValue="rules">
        <TabsList className="mb-2">
          <TabsTrigger value="rules" className="gap-2">
            <Sliders className="h-4 w-4" /> Rules
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{ruleList.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2">
            <Layers className="h-4 w-4" /> Groups
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{groupList.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════ RULES TAB ═══════════════════════════════ */}
        <TabsContent value="rules" className="space-y-5 mt-4">

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Total Rules",        value: ruleList.length,          icon: Sliders,       accent: "border-l-primary"     },
              { title: "Active Rules",       value: activeRuleList.length,     icon: CheckCircle2,  accent: "border-l-emerald-500" },
              { title: "Deal Types Covered", value: new Set(activeRuleList.map(r => r.dealType)).size, icon: TrendingUp, accent: "border-l-amber-400" },
            ].map(({ title, value, icon: Icon, accent }) => (
              <Card key={title} className={`border-l-4 ${accent} shadow-sm`}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {rulesLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{value}</div>}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table card */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-3 flex-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search rules..." className="pl-9" value={ruleSearch} onChange={e => setRuleSearch(e.target.value)} />
                  </div>
                  <Select value={filterDealType} onValueChange={setFilterDealType}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="All deal types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Deal Types</SelectItem>
                      {DEAL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={v => setFilterStatus(v as any)}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => { setEditingRule(null); setRuleDialogOpen(true); }} className="gap-2 shrink-0">
                  <Plus className="h-4 w-4" /> New Rule
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {rulesLoading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
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
                      {filteredRules.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-14 text-center text-muted-foreground">
                            <Sliders className="h-9 w-9 mx-auto mb-2 opacity-40" />
                            <p className="font-medium">No commission rules found</p>
                            <p className="text-xs mt-1">Create a rule to start calculating commissions</p>
                          </td>
                        </tr>
                      ) : filteredRules.map(rule => (
                        <tr key={rule.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${rule.status === "INACTIVE" ? "opacity-60" : ""}`}>
                          <td className="px-6 py-4">
                            <div className="font-medium text-foreground">{rule.ruleName}</div>
                            {rule.appliesToRole && (
                              <div className="text-xs text-muted-foreground mt-0.5">Applies to: {rule.appliesToRole.replace(/_/g, " ")}</div>
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
                            ) : <span className="text-muted-foreground/50">No limits</span>}
                          </td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <CalendarRange className="h-3 w-3 shrink-0" />
                              <span>{formatDate(rule.effectiveFrom)}{rule.effectiveTo ? ` – ${formatDate(rule.effectiveTo)}` : " onwards"}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
                              ${rule.status === "ACTIVE" ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${rule.status === "ACTIVE" ? "bg-green-500" : "bg-muted-foreground"}`} />
                              {rule.status === "ACTIVE" ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditingRule(rule); setRuleDialogOpen(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title={rule.status === "ACTIVE" ? "Deactivate" : "Activate"} onClick={() => toggleRuleStatus(rule)} disabled={updateRuleMutation.isPending}>
                                {rule.status === "ACTIVE" ? <PowerOff className="h-3.5 w-3.5 text-amber-500" /> : <Power className="h-3.5 w-3.5 text-emerald-500" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => setDeleteRuleTarget(rule)}>
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
          {!rulesLoading && ruleList.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {DEAL_TYPE_OPTIONS.map(({ value, label }) => {
                const active = ruleList.filter(r => r.dealType === value && r.status === "ACTIVE");
                const total  = ruleList.filter(r => r.dealType === value);
                const hasActive = active.length > 0;
                return (
                  <div key={value} className={`p-4 rounded-xl border transition-all ${hasActive ? "border-border bg-card" : "border-dashed border-border/50 bg-muted/30"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[value]}`}>{label}</span>
                      {hasActive ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground/50" />}
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
        </TabsContent>

        {/* ═══════════════════════════ GROUPS TAB ══════════════════════════════ */}
        <TabsContent value="groups" className="space-y-5 mt-4">

          {/* Groups stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Total Groups",          value: groupList.length,                                      icon: Layers,    accent: "border-l-primary"      },
              { title: "Active Groups",          value: groupList.filter(g => g.status === "ACTIVE").length,   icon: CheckCircle2, accent: "border-l-emerald-500" },
              { title: "Global Groups",          value: groupList.filter(g => g.assignToAll).length,          icon: Users,     accent: "border-l-violet-500"   },
            ].map(({ title, value, icon: Icon, accent }) => (
              <Card key={title} className={`border-l-4 ${accent} shadow-sm`}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {groupsLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{value}</div>}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Groups list header */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search groups..." className="pl-9" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} />
            </div>
            <Button onClick={() => { setEditingGroup(null); setGroupDialogOpen(true); }} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> New Group
            </Button>
          </div>

          {/* Groups cards */}
          {groupsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No groups yet</p>
              <p className="text-sm mt-1">Create a group to organise commission rules per team or individual</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGroups.map(group => (
                <Card key={group.id} className={`shadow-sm border transition-all hover:shadow-md ${group.status === "INACTIVE" ? "opacity-60" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground text-base leading-tight">{group.groupName}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                            ${group.status === "ACTIVE" ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${group.status === "ACTIVE" ? "bg-green-500" : "bg-muted-foreground"}`} />
                            {group.status}
                          </span>
                        </div>
                        {group.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditingGroup(group); setGroupDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title={group.status === "ACTIVE" ? "Deactivate" : "Activate"} onClick={() => toggleGroupStatus(group)} disabled={updateGroupMutation.isPending}>
                          {group.status === "ACTIVE" ? <PowerOff className="h-3.5 w-3.5 text-amber-500" /> : <Power className="h-3.5 w-3.5 text-emerald-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => setDeleteGroupTarget(group)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 space-y-4">
                    {/* Members */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        <Users className="h-3.5 w-3.5" /> Assigned To
                      </div>
                      {group.assignToAll ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300 text-xs font-medium">
                            <UserCheck className="h-3 w-3" /> All Sales Executives
                          </span>
                        </div>
                      ) : group.members.length === 0 ? (
                        <div className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
                          <UserX className="h-3.5 w-3.5" /> No members assigned
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {group.members.map(m => (
                            <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium">
                              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                {m.firstName[0]}
                              </span>
                              {m.firstName} {m.lastName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Rules */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        <Sliders className="h-3.5 w-3.5" /> Commission Rules ({group.rules.length})
                      </div>
                      {group.rules.length === 0 ? (
                        <div className="text-xs text-muted-foreground/60">No rules assigned</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {group.rules.map(rule => (
                            <span key={rule.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[rule.dealType] ?? "bg-muted text-muted-foreground"}`}>
                              {rule.ruleName}
                              <span className="opacity-75 font-normal">({rule.commissionPercentage}%)</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Rule Create / Edit Dialog ──────────────────────────────────────── */}
      <Dialog open={ruleDialogOpen} onOpenChange={open => { if (!open) { setRuleDialogOpen(false); setEditingRule(null); } }}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Commission Rule" : "Create Commission Rule"}</DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Update the rule settings. Deal type and effective start date cannot be changed."
                : "Define a new commission rule for your team."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            <Field label="Rule Name" required={!editingRule} error={ruleErrors.ruleName}>
              <Input placeholder="e.g. Standard Net New 10%" value={ruleForm.ruleName} onChange={e => setRuleField("ruleName", e.target.value)} />
            </Field>

            <Field label="Deal Type" required={!editingRule} error={ruleErrors.dealType}>
              {editingRule ? (
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted/40 text-sm">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[ruleForm.dealType] ?? ""}`}>
                    {DEAL_TYPE_OPTIONS.find(o => o.value === ruleForm.dealType)?.label ?? ruleForm.dealType}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">(cannot be changed)</span>
                </div>
              ) : (
                <Select value={ruleForm.dealType} onValueChange={v => setRuleField("dealType", v)}>
                  <SelectTrigger className={ruleErrors.dealType ? "border-red-500" : ""}><SelectValue placeholder="Select deal type" /></SelectTrigger>
                  <SelectContent>
                    {DEAL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="Commission Percentage" required error={ruleErrors.commissionPercentage} hint="0 – 100">
              <div className="relative">
                <Input type="number" min="0" max="100" step="0.1" placeholder="e.g. 10"
                  className={`pr-8 ${ruleErrors.commissionPercentage ? "border-red-500" : ""}`}
                  value={ruleForm.commissionPercentage} onChange={e => setRuleField("commissionPercentage", e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Min Gross Profit (R)" hint="Optional" error={ruleErrors.maxGrossProfit ? "" : undefined}>
                <Input type="number" min="0" step="100" placeholder="e.g. 10000"
                  value={ruleForm.minGrossProfit} onChange={e => setRuleField("minGrossProfit", e.target.value)} />
              </Field>
              <Field label="Max Gross Profit (R)" hint="Optional" error={ruleErrors.maxGrossProfit}>
                <Input type="number" min="0" step="100" placeholder="e.g. 500000"
                  value={ruleForm.maxGrossProfit} onChange={e => setRuleField("maxGrossProfit", e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Effective From" required={!editingRule} error={ruleErrors.effectiveFrom}>
                {editingRule ? (
                  <div className="flex items-center h-10 px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
                    {formatDate(ruleForm.effectiveFrom)} <span className="ml-2 text-xs">(locked)</span>
                  </div>
                ) : (
                  <Input type="date" className={ruleErrors.effectiveFrom ? "border-red-500" : ""}
                    value={ruleForm.effectiveFrom} onChange={e => setRuleField("effectiveFrom", e.target.value)} />
                )}
              </Field>
              <Field label="Effective To" hint="Leave blank for no end date">
                <Input type="date" value={ruleForm.effectiveTo} min={ruleForm.effectiveFrom || undefined}
                  onChange={e => setRuleField("effectiveTo", e.target.value)} />
              </Field>
            </div>

            <Field label="Applies To Role" hint="Defaults to Sales Executive">
              <Select value={ruleForm.appliesToRole} onValueChange={v => setRuleField("appliesToRole", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES_EXECUTIVE">Sales Executive</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRuleDialogOpen(false); setEditingRule(null); }} disabled={isRuleSaving}>Cancel</Button>
            <Button onClick={submitRule} disabled={isRuleSaving}>
              {isRuleSaving ? "Saving…" : editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Group Create / Edit Dialog ─────────────────────────────────────── */}
      <Dialog open={groupDialogOpen} onOpenChange={open => { if (!open) { setGroupDialogOpen(false); setEditingGroup(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Create Commission Group"}</DialogTitle>
            <DialogDescription>
              Groups let you bundle commission rules and assign them to specific sales executives or your entire team.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Name */}
            <Field label="Group Name" required error={groupErrors.groupName}>
              <Input placeholder="e.g. Enterprise Team" value={groupForm.groupName} onChange={e => setGroupField("groupName", e.target.value)} />
            </Field>

            {/* Description */}
            <Field label="Description" hint="Optional — describe when this group applies">
              <Input placeholder="e.g. High-value deals above R100k GP" value={groupForm.description} onChange={e => setGroupField("description", e.target.value)} />
            </Field>

            {/* Assign to all toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
              <div>
                <div className="font-medium text-sm">Apply to all sales executives</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {groupForm.assignToAll
                    ? "These rules apply to every sales executive in your tenant"
                    : "Choose specific sales executives below"}
                </div>
              </div>
              <Switch
                checked={groupForm.assignToAll}
                onCheckedChange={checked => {
                  setGroupField("assignToAll", checked);
                  if (checked) setGroupField("memberUserIds", []);
                }}
              />
            </div>

            {/* Commission rules selection */}
            <Field label="Commission Rules" required error={groupErrors.ruleIds} hint="Select the rules to include in this group">
              {activeRuleList.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 rounded-lg border border-dashed border-border">
                  No active commission rules found. Create rules first.
                </div>
              ) : (
                <ScrollArea className="h-44 rounded-md border border-border p-1">
                  <div className="space-y-1 p-2">
                    {ruleList.map(rule => (
                      <label
                        key={rule.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-muted/50
                          ${groupForm.ruleIds.includes(rule.id) ? "bg-primary/5 border border-primary/20" : ""}
                          ${rule.status === "INACTIVE" ? "opacity-50" : ""}`}
                      >
                        <Checkbox
                          checked={groupForm.ruleIds.includes(rule.id)}
                          onCheckedChange={() => toggleGroupRule(rule.id)}
                          disabled={rule.status === "INACTIVE"}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{rule.ruleName}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${DEAL_TYPE_COLORS[rule.dealType]}`}>
                              {DEAL_TYPE_OPTIONS.find(o => o.value === rule.dealType)?.label}
                            </span>
                            {rule.status === "INACTIVE" && <span className="text-xs text-muted-foreground">(inactive)</span>}
                          </div>
                        </div>
                        <span className="text-sm font-bold text-primary shrink-0">{rule.commissionPercentage}%</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Field>

            {/* Member selection — only visible when not assignToAll */}
            {!groupForm.assignToAll && (
              <Field
                label="Sales Executives"
                hint={salesExecs.length === 0 ? "No active sales executives found" : "Select which sales executives this group applies to"}
              >
                {salesExecs.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 rounded-lg border border-dashed border-border">
                    No active sales executives found in your tenant.
                  </div>
                ) : (
                  <ScrollArea className="h-44 rounded-md border border-border p-1">
                    <div className="space-y-1 p-2">
                      {salesExecs.map((user: any) => {
                        const isSelected = groupForm.memberUserIds.includes(user.id);
                        return (
                          <label
                            key={user.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-muted/50
                              ${isSelected ? "bg-primary/5 border border-primary/20" : ""}`}
                          >
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleGroupMember(user.id)} />
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                {user.firstName[0]}{user.lastName[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{user.firstName} {user.lastName}</div>
                                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                {groupForm.memberUserIds.length > 0 && (
                  <p className="text-xs text-primary mt-1">{groupForm.memberUserIds.length} executive{groupForm.memberUserIds.length > 1 ? "s" : ""} selected</p>
                )}
              </Field>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setGroupDialogOpen(false); setEditingGroup(null); }} disabled={isGroupSaving}>Cancel</Button>
            <Button onClick={submitGroup} disabled={isGroupSaving}>
              {isGroupSaving ? "Saving…" : editingGroup ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Rule Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={!!deleteRuleTarget} onOpenChange={open => { if (!open) setDeleteRuleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Commission Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteRuleTarget?.ruleName}"</strong>?
              This will also remove it from any groups it belongs to. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRule} className="bg-red-600 hover:bg-red-700 text-white" disabled={deleteRuleMutation.isPending}>
              {deleteRuleMutation.isPending ? "Deleting…" : "Delete Rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Group Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={!!deleteGroupTarget} onOpenChange={open => { if (!open) setDeleteGroupTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Commission Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteGroupTarget?.groupName}"</strong>?
              The individual commission rules will not be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGroup} className="bg-red-600 hover:bg-red-700 text-white" disabled={deleteGroupMutation.isPending}>
              {deleteGroupMutation.isPending ? "Deleting…" : "Delete Group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

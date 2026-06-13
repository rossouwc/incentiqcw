import { useState, useEffect } from "react";
import {
  useListApprovalConfigs,
  useCreateApprovalConfig,
  useUpdateApprovalConfig,
  useDeleteApprovalConfig,
  useListUsers,
  type ApprovalConfig,
  type ApprovalConfigInput,
  type ApprovalConfigUpdate,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight, Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  CheckCircle2, Settings, UserCheck, DollarSign, Briefcase, BadgeCheck, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ROLE_OPTIONS = [
  { value: "MANAGER",   label: "Sales Manager" },
  { value: "FINANCE",   label: "Finance" },
  { value: "EXECUTIVE", label: "Executive" },
  { value: "ADMIN",     label: "Admin" },
  { value: "PAYROLL",   label: "Payroll" },
];

const ROLE_ICONS: Record<string, React.ElementType> = {
  MANAGER:   UserCheck,
  FINANCE:   DollarSign,
  EXECUTIVE: BadgeCheck,
  ADMIN:     Settings,
  PAYROLL:   Briefcase,
};

const ROLE_COLORS: Record<string, string> = {
  MANAGER:   "bg-amber-100 text-amber-700 border-amber-200",
  FINANCE:   "bg-cyan-100 text-cyan-700 border-cyan-200",
  EXECUTIVE: "bg-purple-100 text-purple-700 border-purple-200",
  ADMIN:     "bg-indigo-100 text-indigo-700 border-indigo-200",
  PAYROLL:   "bg-pink-100 text-pink-700 border-pink-200",
};

const DEFAULT_STEPS = [
  { stepOrder: 1, stepName: "Sales Manager Approval", approverRole: "MANAGER" },
  { stepOrder: 2, stepName: "Finance Approval",        approverRole: "FINANCE" },
  { stepOrder: 3, stepName: "Executive Approval",     approverRole: "EXECUTIVE" },
  { stepOrder: 4, stepName: "Payroll Ready",           approverRole: "PAYROLL" },
];

interface StepFormState {
  stepName: string;
  approverRole: string;
  approverUserId: string;
  isActive: boolean;
}

const emptyForm: StepFormState = {
  stepName: "",
  approverRole: "MANAGER",
  approverUserId: "",
  isActive: true,
};

export default function ApprovalWorkflow() {
  const { data: configs, isLoading, refetch } = useListApprovalConfigs();
  const createConfig = useCreateApprovalConfig();
  const updateConfig = useUpdateApprovalConfig();
  const deleteConfig = useDeleteApprovalConfig();
  const { toast } = useToast();

  const list: ApprovalConfig[] = Array.isArray(configs) ? configs : [];

  const [showDialog, setShowDialog] = useState(false);
  const [editConfig, setEditConfig] = useState<ApprovalConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalConfig | null>(null);
  const [form, setForm] = useState<StepFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Users for assignment dropdown (filtered by selected role)
  const { data: usersData } = useListUsers({});
  const users = Array.isArray(usersData) ? usersData : (usersData as any)?.data ?? [];
  const roleUsers = users.filter((u: any) => u.role === form.approverRole && u.status === "ACTIVE");

  useEffect(() => {
    if (editConfig) {
      setForm({
        stepName: editConfig.stepName,
        approverRole: editConfig.approverRole,
        approverUserId: editConfig.approverUserId ?? "",
        isActive: editConfig.isActive,
      });
    } else {
      setForm(emptyForm);
    }
  }, [editConfig, showDialog]);

  const openAdd = () => { setEditConfig(null); setShowDialog(true); };
  const openEdit = (c: ApprovalConfig) => { setEditConfig(c); setShowDialog(true); };
  const closeDialog = () => { setShowDialog(false); setEditConfig(null); };

  const handleSave = async () => {
    if (!form.stepName.trim() || !form.approverRole) return;
    setSaving(true);
    try {
      const payload = {
        stepName: form.stepName.trim(),
        approverRole: form.approverRole,
        approverUserId: form.approverUserId || null,
        isActive: form.isActive,
      };
      if (editConfig) {
        await updateConfig.mutateAsync({ configId: editConfig.id, data: payload as ApprovalConfigUpdate });
        toast({ title: "Step updated" });
      } else {
        await createConfig.mutateAsync({ data: payload as ApprovalConfigInput });
        toast({ title: "Step added" });
      }
      closeDialog();
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Something went wrong", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteConfig.mutateAsync({ configId: deleteTarget.id });
      toast({ title: "Step deleted" });
      setDeleteTarget(null);
      refetch();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const handleMove = async (config: ApprovalConfig, direction: "up" | "down") => {
    const sorted = [...list].sort((a, b) => a.stepOrder - b.stepOrder);
    const idx = sorted.findIndex((c) => c.id === config.id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;
    const swapWith = sorted[direction === "up" ? idx - 1 : idx + 1];
    try {
      await updateConfig.mutateAsync({ configId: config.id, data: { stepOrder: swapWith.stepOrder } });
      refetch();
    } catch {
      toast({ title: "Reorder failed", variant: "destructive" });
    }
  };

  const handleSeedDefaults = async () => {
    setSaving(true);
    try {
      for (const step of DEFAULT_STEPS) {
        await createConfig.mutateAsync({ data: { ...step, isActive: true } as ApprovalConfigInput });
      }
      toast({ title: "Default workflow created", description: "4 approval steps have been configured." });
      refetch();
    } catch (err: any) {
      toast({ title: "Error seeding defaults", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...list].sort((a, b) => a.stepOrder - b.stepOrder);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Approval Workflow</h1>
          <p className="text-muted-foreground">Configure the commission approval pipeline for your company</p>
        </div>
        <div className="flex gap-2">
          {list.length === 0 && (
            <Button variant="outline" onClick={handleSeedDefaults} disabled={saving}>
              Load Defaults
            </Button>
          )}
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add Step
          </Button>
        </div>
      </div>

      {/* Visual Pipeline */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Approval Pipeline</CardTitle>
          <CardDescription>
            {list.length > 0
              ? `${sorted.filter(s => s.isActive).length} active step${sorted.filter(s => s.isActive).length !== 1 ? "s" : ""} — deals flow through these in order`
              : "No steps configured yet — add steps or load the default workflow"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-32" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Settings className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No approval steps yet</p>
              <p className="text-sm mt-1">Add steps above or click "Load Defaults" to use the standard 4-step flow</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-0 overflow-x-auto pb-2">
              {/* Deal Submission (always first) */}
              <div className="flex flex-col md:flex-row items-center gap-0">
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl border-2 flex items-center justify-center bg-blue-50 text-blue-600 border-blue-200">
                    <Briefcase className="h-6 w-6" />
                  </div>
                  <div className="mt-2 text-center max-w-[100px]">
                    <div className="text-xs font-semibold text-foreground">Deal Submission</div>
                    <div className="text-xs text-muted-foreground">Sales Exec</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2 my-3 md:my-0 rotate-90 md:rotate-0 shrink-0" />
              </div>

              {sorted.map((step, idx) => {
                const Icon = ROLE_ICONS[step.approverRole] ?? Settings;
                const colorCls = step.isActive
                  ? (ROLE_COLORS[step.approverRole] ?? "bg-gray-100 text-gray-600 border-gray-200")
                  : "bg-gray-100 text-gray-400 border-gray-200 opacity-50";
                return (
                  <div key={step.id} className="flex flex-col md:flex-row items-center gap-0">
                    <div className="flex flex-col items-center">
                      <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center ${colorCls}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="mt-2 text-center max-w-[100px]">
                        <div className="text-xs font-semibold text-foreground leading-tight">{step.stepName}</div>
                        {step.approverName ? (
                          <div className="text-xs text-primary mt-0.5 truncate max-w-[100px]">{step.approverName}</div>
                        ) : (
                          <div className="text-xs text-muted-foreground">{ROLE_OPTIONS.find(r => r.value === step.approverRole)?.label ?? step.approverRole}</div>
                        )}
                        {!step.isActive && <Badge variant="secondary" className="text-xs mt-0.5">Inactive</Badge>}
                      </div>
                    </div>
                    {idx < sorted.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground mx-2 my-3 md:my-0 rotate-90 md:rotate-0 shrink-0" />
                    )}
                  </div>
                );
              })}

              {/* Wallet Credit (always last) */}
              <div className="flex flex-col md:flex-row items-center gap-0">
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2 my-3 md:my-0 rotate-90 md:rotate-0 shrink-0" />
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl border-2 flex items-center justify-center bg-green-50 text-green-600 border-green-200">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="mt-2 text-center max-w-[100px]">
                    <div className="text-xs font-semibold text-foreground">Commission Paid</div>
                    <div className="text-xs text-muted-foreground">Automatic</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step Management Table */}
      {sorted.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Manage Steps</CardTitle>
            <CardDescription>Edit, reorder, or remove individual approval steps</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium w-16">Order</th>
                    <th className="px-6 py-4 font-medium">Step Name</th>
                    <th className="px-6 py-4 font-medium">Approver Role</th>
                    <th className="px-6 py-4 font-medium">Assigned User</th>
                    <th className="px-6 py-4 font-medium">Active</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((step, idx) => {
                    const Icon = ROLE_ICONS[step.approverRole] ?? Settings;
                    return (
                      <tr key={step.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <button
                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                              disabled={idx === 0}
                              onClick={() => handleMove(step, "up")}
                              title="Move up"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-center text-xs font-mono text-muted-foreground">{step.stepOrder}</span>
                            <button
                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                              disabled={idx === sorted.length - 1}
                              onClick={() => handleMove(step, "down")}
                              title="Move down"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${ROLE_COLORS[step.approverRole] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="font-medium text-foreground">{step.stepName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-xs">
                            {ROLE_OPTIONS.find(r => r.value === step.approverRole)?.label ?? step.approverRole}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {step.approverName
                            ? <span className="text-foreground font-medium">{step.approverName}</span>
                            : <span className="text-muted-foreground italic text-xs">Any {ROLE_OPTIONS.find(r => r.value === step.approverRole)?.label ?? step.approverRole}</span>}
                        </td>
                        <td className="px-6 py-4">
                          <Switch
                            checked={step.isActive}
                            onCheckedChange={async (val) => {
                              await updateConfig.mutateAsync({ configId: step.id, data: { isActive: val } });
                              refetch();
                            }}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openEdit(step)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(step)}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info box */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3 items-start">
            <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <strong>How it works:</strong> When a deal is submitted for approval, the system creates one pending approval task per active step, in order. Each approver can <strong>Approve</strong> (move to next step), <strong>Request Changes</strong> (send back to sales exec), or <strong>Reject</strong> (permanently reject the deal). Commission moves to the sales exec's wallet only after the final step is approved.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editConfig ? "Edit Approval Step" : "Add Approval Step"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="stepName">Step Name</Label>
              <Input
                id="stepName"
                value={form.stepName}
                onChange={(e) => setForm({ ...form, stepName: e.target.value })}
                placeholder="e.g. Sales Manager Approval"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Approver Role</Label>
              <Select
                value={form.approverRole}
                onValueChange={(v) => setForm({ ...form, approverRole: v, approverUserId: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">All users with this role can action this step unless a specific user is assigned.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Assign Specific User <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select
                value={form.approverUserId || "__any__"}
                onValueChange={(v) => setForm({ ...form, approverUserId: v === "__any__" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any user with this role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">
                    <span className="text-muted-foreground">Any {ROLE_OPTIONS.find(r => r.value === form.approverRole)?.label ?? form.approverRole}</span>
                  </SelectItem>
                  {roleUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} <span className="text-muted-foreground text-xs ml-1">({u.email})</span>
                    </SelectItem>
                  ))}
                  {roleUsers.length === 0 && (
                    <SelectItem value="__none__" disabled>No active users with this role</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 py-1">
              <Switch
                id="isActive"
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">Active (include in workflow)</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.stepName.trim()}>
                {saving ? "Saving…" : editConfig ? "Save Changes" : "Add Step"}
              </Button>
              <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.stepName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This approval step will be removed from the workflow. Existing in-progress approvals for this step are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Factory, Languages, ListChecks, Calculator, GitBranch, Zap,
  Lock, ChevronUp, ChevronDown, Plus, Trash2, Save, Loader2, AlertCircle, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

function auth() {
  const token = localStorage.getItem("incentiq_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

interface FieldDef {
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  enabled: boolean;
  displayOrder: number;
  isProtected: boolean;
  systemRole: string | null;
  placeholder?: string | null;
  options?: string[] | null;
}

interface FormulaConfig {
  calculationType: string;
  baseField: string;
  defaultCommissionPct: number;
  description: string;
}

interface TriggerRule {
  id: string;
  eventType: string;
  label: string;
  description: string;
  isRequired: boolean;
  enabled: boolean;
  order: number;
}

interface ApprovalStep {
  id: string;
  stepOrder: number;
  stepName: string;
  approverRole: string;
}

interface Terminology {
  eventLabel: string;
  eventLabelPlural: string;
  entityLabel: string;
  revenueLabel: string;
  commissionLabel: string;
  salesPersonLabel: string;
  triggerLabel: string;
}

interface FullConfig {
  industry: string;
  industryLabel: string;
  terminology: Terminology;
  systemFields: FieldDef[];
  customFields: FieldDef[];
  formulaConfig: FormulaConfig;
  approvalSteps: ApprovalStep[];
  triggerRules: TriggerRule[];
}

const USER_ROLES = ["MANAGER", "ADMIN", "FINANCE", "EXECUTIVE", "PAYROLL", "SALES_EXECUTIVE"];

const CALC_TYPES = [
  { value: "GP_PERCENTAGE", label: "% of Gross Profit" },
  { value: "REVENUE_PERCENTAGE", label: "% of Revenue" },
  { value: "FLAT_AMOUNT", label: "Flat Amount per Event" },
  { value: "PLACEMENT_FEE_PERCENTAGE", label: "% of Placement Fee" },
  { value: "ANNUAL_PREMIUM_PERCENTAGE", label: "% of Annual Premium" },
  { value: "CUSTOM", label: "Custom" },
];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "currency", label: "Currency" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "date", label: "Date" },
];

function swap<T>(arr: T[], i: number, j: number): T[] {
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy.map((item, idx) => ({ ...(item as any), displayOrder: idx + 1 }));
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ config }: { config: FullConfig }) {
  const calcLabel = CALC_TYPES.find((c) => c.value === config.formulaConfig.calculationType)?.label ?? config.formulaConfig.calculationType;
  const activeFields = [...config.systemFields, ...config.customFields].filter((f) => f.enabled).length;
  const summary = [
    ["Industry", config.industryLabel],
    ["Event Name", config.terminology.eventLabel],
    ["Entity / Customer", config.terminology.entityLabel],
    ["Revenue Field", config.terminology.revenueLabel],
    ["Commission Label", config.terminology.commissionLabel],
    ["Sales Person Title", config.terminology.salesPersonLabel],
    ["Commission Formula", calcLabel],
    ["Default Rate", `${config.formulaConfig.defaultCommissionPct}%`],
    ["Approval Steps", `${config.approvalSteps.length}`],
    ["Active Fields", `${activeFields}`],
    ["Trigger Rules", `${config.triggerRules.filter((t) => t.enabled).length} active`],
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuration Summary</CardTitle>
          <CardDescription>Current industry settings at a glance — use the other tabs to edit</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            {summary.map(([label, value]) => (
              <div key={label} className="space-y-0.5">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-sm font-semibold text-foreground">{value}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Approval Workflow</p>
            <div className="space-y-2">
              {config.approvalSteps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-semibold shrink-0">{i + 1}</span>
                  <span className="flex-1 text-foreground">{s.stepName}</span>
                  <Badge variant="secondary" className="text-xs">{s.approverRole.replace("_", " ")}</Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Terminology Tab ──────────────────────────────────────────────────────────

function TerminologyTab({ terminology, onChange, onSave, saving }: { terminology: Terminology; onChange: (k: keyof Terminology, v: string) => void; onSave: () => void; saving: boolean }) {
  const fields: { key: keyof Terminology; label: string; placeholder: string }[] = [
    { key: "eventLabel", label: "Event Name (singular)", placeholder: "e.g. Deal, Placement, Policy" },
    { key: "eventLabelPlural", label: "Event Name (plural)", placeholder: "e.g. Deals, Placements, Policies" },
    { key: "entityLabel", label: "Entity / Customer Label", placeholder: "e.g. Customer, Client, Buyer" },
    { key: "revenueLabel", label: "Revenue Field Label", placeholder: "e.g. Contract Value, Sale Price, Placement Fee" },
    { key: "commissionLabel", label: "Commission Label", placeholder: "e.g. Commission, Placement Fee, Agent Commission" },
    { key: "salesPersonLabel", label: "Sales Person Title", placeholder: "e.g. Sales Executive, Recruiter, Agent" },
    { key: "triggerLabel", label: "Trigger Event Description", placeholder: "e.g. Commission earned on final approval" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Terminology</CardTitle>
        <CardDescription>Customise labels to match your industry's language — these labels appear throughout the platform</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`term-${f.key}`}>{f.label}</Label>
              <Input id={`term-${f.key}`} value={terminology[f.key]} onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder} />
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Terminology
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Fields Tab ───────────────────────────────────────────────────────────────

interface NewCustomField {
  label: string;
  fieldType: string;
  required: boolean;
  placeholder: string;
}

const EMPTY_CUSTOM: NewCustomField = { label: "", fieldType: "text", required: false, placeholder: "" };

function FieldRow({ field, index, total, onMove, onToggleEnabled, onToggleRequired, onLabelChange, onDelete }: {
  field: FieldDef; index: number; total: number;
  onMove: (dir: "up" | "down") => void;
  onToggleEnabled: () => void;
  onToggleRequired: () => void;
  onLabelChange: (v: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${field.enabled ? "bg-card border-border" : "bg-muted/30 border-border/50"}`}>
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={() => onMove("up")} disabled={index === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"><ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /></button>
        <button onClick={() => onMove("down")} disabled={index === total - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></button>
      </div>

      <div className="flex-1 min-w-0">
        <Input value={field.label} onChange={(e) => onLabelChange(e.target.value)} className="h-8 text-sm" />
      </div>

      <Badge variant="outline" className="text-xs shrink-0">{field.fieldType}</Badge>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">Req</span>
        <Switch checked={field.required} onCheckedChange={onToggleRequired} disabled={field.isProtected} className="scale-75" />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">On</span>
        {field.isProtected ? (
          <span title="This field is required for calculations and cannot be disabled">
            <Lock className="h-4 w-4 text-amber-500" />
          </span>
        ) : (
          <Switch checked={field.enabled} onCheckedChange={onToggleEnabled} className="scale-75" />
        )}
      </div>

      {onDelete && (
        <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function FieldsTab({ systemFields, customFields, setSystemFields, setCustomFields, onSave, saving }: {
  systemFields: FieldDef[]; customFields: FieldDef[];
  setSystemFields: (f: FieldDef[]) => void; setCustomFields: (f: FieldDef[]) => void;
  onSave: () => void; saving: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState<NewCustomField>(EMPTY_CUSTOM);

  const updateSysField = (i: number, patch: Partial<FieldDef>) => setSystemFields(systemFields.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const updateCusField = (i: number, patch: Partial<FieldDef>) => setCustomFields(customFields.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  const addCustomField = () => {
    if (!newField.label.trim()) return;
    const key = `custom_${Date.now()}`;
    const field: FieldDef = {
      key, label: newField.label.trim(), fieldType: newField.fieldType,
      required: newField.required, enabled: true,
      displayOrder: systemFields.length + customFields.length + 1,
      isProtected: false, systemRole: null,
      placeholder: newField.placeholder || null,
    };
    setCustomFields([...customFields, field]);
    setNewField(EMPTY_CUSTOM);
    setAdding(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Fields</CardTitle>
          <CardDescription>Built-in fields from your industry template. Fields marked with <Lock className="h-3 w-3 inline text-amber-500" /> cannot be disabled as they are required for commission calculations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {systemFields.map((field, i) => (
            <FieldRow
              key={field.key} field={field} index={i} total={systemFields.length}
              onMove={(dir) => setSystemFields(dir === "up" ? swap(systemFields, i, i - 1) : swap(systemFields, i, i + 1))}
              onToggleEnabled={() => updateSysField(i, { enabled: !field.enabled })}
              onToggleRequired={() => updateSysField(i, { required: !field.required })}
              onLabelChange={(v) => updateSysField(i, { label: v })}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Fields</CardTitle>
          <CardDescription>Add extra fields specific to your workflow — these appear on commission event forms</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {customFields.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground py-2">No custom fields yet. Add one below.</p>
          )}
          {customFields.map((field, i) => (
            <FieldRow
              key={field.key} field={field} index={i} total={customFields.length}
              onMove={(dir) => setCustomFields(dir === "up" ? swap(customFields, i, i - 1) : swap(customFields, i, i + 1))}
              onToggleEnabled={() => updateCusField(i, { enabled: !field.enabled })}
              onToggleRequired={() => updateCusField(i, { required: !field.required })}
              onLabelChange={(v) => updateCusField(i, { label: v })}
              onDelete={() => setCustomFields(customFields.filter((_, idx) => idx !== i))}
            />
          ))}

          {adding && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <p className="text-sm font-medium text-foreground">New Custom Field</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Label *</Label>
                  <Input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="e.g. Invoice Number" />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={newField.fieldType} onValueChange={(v) => setNewField({ ...newField, fieldType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Placeholder</Label>
                  <Input value={newField.placeholder} onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })} placeholder="e.g. e.g. INV-2026-001" />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={newField.required} onCheckedChange={(v) => setNewField({ ...newField, required: v })} />
                  <Label>Required field</Label>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setAdding(false); setNewField(EMPTY_CUSTOM); }}>Cancel</Button>
                <Button onClick={addCustomField} disabled={!newField.label.trim()}>Add Field</Button>
              </div>
            </div>
          )}

          {!adding && (
            <Button variant="outline" className="w-full mt-2 gap-2" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add Custom Field
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Fields
        </Button>
      </div>
    </div>
  );
}

// ─── Formula Tab ──────────────────────────────────────────────────────────────

function FormulaTab({ formula, onChange, onSave, saving }: { formula: FormulaConfig; onChange: (patch: Partial<FormulaConfig>) => void; onSave: () => void; saving: boolean }) {
  const isValid = !!formula.calculationType && !!formula.baseField;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Commission Formula</CardTitle>
        <CardDescription>Configure how commissions are calculated for this industry</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Calculation Method</Label>
            <Select value={formula.calculationType} onValueChange={(v) => onChange({ calculationType: v })}>
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>{CALC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Base Calculation Field</Label>
            <Select value={formula.baseField} onValueChange={(v) => onChange({ baseField: v })}>
              <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gross_profit">Gross Profit (Revenue − Cost)</SelectItem>
                <SelectItem value="revenue">Revenue (full amount)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Default Commission %</Label>
            <div className="relative">
              <Input type="number" min={0} max={100} step={0.5} value={formula.defaultCommissionPct} onChange={(e) => onChange({ defaultCommissionPct: parseFloat(e.target.value) || 0 })} className="pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Formula Description</Label>
          <Textarea value={formula.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} placeholder="e.g. Commission is calculated as a percentage of gross profit" />
        </div>
        <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
          <p className="font-medium text-foreground flex items-center gap-2"><Info className="h-4 w-4 text-primary" />Formula Preview</p>
          <p className="text-muted-foreground">
            Commission = <span className="text-foreground font-medium">{formula.defaultCommissionPct}%</span> × <span className="text-foreground font-medium">{formula.baseField === "gross_profit" ? "Gross Profit" : "Revenue"}</span>
          </p>
        </div>
        {!isValid && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Please select a calculation method and base field before saving.</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving || !isValid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Formula
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Workflow Tab ─────────────────────────────────────────────────────────────

function WorkflowTab({ steps, setSteps, onSave, saving }: { steps: ApprovalStep[]; setSteps: (s: ApprovalStep[]) => void; onSave: () => void; saving: boolean }) {
  const canDelete = steps.length > 1;

  const addStep = () => {
    const id = `new-${Date.now()}`;
    setSteps([...steps, { id, stepOrder: steps.length + 1, stepName: "New Approval Step", approverRole: "MANAGER" }]);
  };

  const updateStep = (i: number, patch: Partial<ApprovalStep>) => setSteps(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const moveStep = (i: number, dir: "up" | "down") => {
    const j = dir === "up" ? i - 1 : i + 1;
    const copy = [...steps];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setSteps(copy.map((s, idx) => ({ ...s, stepOrder: idx + 1 })));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval Workflow</CardTitle>
        <CardDescription>Define the approval chain for commission events — at least one step is required</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card">
            <div className="flex flex-col gap-0.5 shrink-0 mt-1">
              <button onClick={() => moveStep(i, "up")} disabled={i === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /></button>
              <button onClick={() => moveStep(i, "down")} disabled={i === steps.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
            <div className="w-7 h-7 rounded-full bg-primary/15 text-primary text-sm font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Step Name</Label>
                <Input value={step.stepName} onChange={(e) => updateStep(i, { stepName: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Approver Role</Label>
                <Select value={step.approverRole} onValueChange={(v) => updateStep(i, { approverRole: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{USER_ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <button onClick={() => setSteps(steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stepOrder: idx + 1 })))} disabled={!canDelete} className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 disabled:cursor-not-allowed mt-0.5 shrink-0" title={canDelete ? "Remove step" : "Cannot remove — minimum 1 step required"}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {!canDelete && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>At least one approval step is required.</AlertDescription>
          </Alert>
        )}

        <Button variant="outline" className="w-full gap-2" onClick={addStep}>
          <Plus className="h-4 w-4" /> Add Approval Step
        </Button>

        <div className="flex justify-end pt-2">
          <Button onClick={onSave} disabled={saving || steps.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Workflow
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Triggers Tab ─────────────────────────────────────────────────────────────

function TriggersTab({ rules, setRules, onSave, saving }: { rules: TriggerRule[]; setRules: (r: TriggerRule[]) => void; onSave: () => void; saving: boolean }) {
  const [adding, setAdding] = useState(false);
  const [newRule, setNewRule] = useState({ eventType: "", label: "", description: "", isRequired: false });

  const updateRule = (i: number, patch: Partial<TriggerRule>) => setRules(rules.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const addRule = () => {
    if (!newRule.label.trim()) return;
    setRules([...rules, { id: `trigger-${Date.now()}`, eventType: newRule.eventType || "CUSTOM", label: newRule.label.trim(), description: newRule.description, isRequired: newRule.isRequired, enabled: true, order: rules.length + 1 }]);
    setNewRule({ eventType: "", label: "", description: "", isRequired: false });
    setAdding(false);
  };

  const moveRule = (i: number, dir: "up" | "down") => {
    const j = dir === "up" ? i - 1 : i + 1;
    const copy = [...rules];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setRules(copy.map((r, idx) => ({ ...r, order: idx + 1 })));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trigger Event Rules</CardTitle>
        <CardDescription>Define events that must occur before commissions are released to wallets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.map((rule, i) => (
          <div key={rule.id} className={`p-4 rounded-lg border transition-colors ${rule.enabled ? "bg-card border-border" : "bg-muted/30 border-border/50"}`}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-0.5 shrink-0 mt-1">
                <button onClick={() => moveRule(i, "up")} disabled={i === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /></button>
                <button onClick={() => moveRule(i, "down")} disabled={i === rules.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input value={rule.label} onChange={(e) => updateRule(i, { label: e.target.value })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Event Type Code</Label>
                    <Input value={rule.eventType} onChange={(e) => updateRule(i, { eventType: e.target.value })} className="h-8" placeholder="e.g. TRANSFER_REGISTERED" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input value={rule.description} onChange={(e) => updateRule(i, { description: e.target.value })} className="h-8" placeholder="Describe when this trigger fires" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={rule.isRequired} onCheckedChange={(v) => updateRule(i, { isRequired: v })} className="scale-75" />
                    <span className="text-xs text-muted-foreground">Required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={rule.enabled} onCheckedChange={(v) => updateRule(i, { enabled: v })} className="scale-75" />
                    <span className="text-xs text-muted-foreground">Enabled</span>
                  </div>
                </div>
              </div>
              {!rule.isRequired && (
                <button onClick={() => setRules(rules.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, order: idx + 1 })))} className="p-1.5 rounded hover:bg-destructive/10 text-destructive shrink-0 mt-0.5">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {rule.isRequired && (
                <span title="Required triggers cannot be deleted"><Lock className="h-4 w-4 text-amber-500 mt-1 shrink-0" /></span>
              )}
            </div>
          </div>
        ))}

        {adding && (
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
            <p className="text-sm font-medium text-foreground">New Trigger Rule</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Label *</Label>
                <Input value={newRule.label} onChange={(e) => setNewRule({ ...newRule, label: e.target.value })} placeholder="e.g. Transfer Registered" />
              </div>
              <div className="space-y-1">
                <Label>Event Type Code</Label>
                <Input value={newRule.eventType} onChange={(e) => setNewRule({ ...newRule, eventType: e.target.value })} placeholder="e.g. TRANSFER_REGISTERED" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Description</Label>
                <Input value={newRule.description} onChange={(e) => setNewRule({ ...newRule, description: e.target.value })} placeholder="When does this trigger fire?" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newRule.isRequired} onCheckedChange={(v) => setNewRule({ ...newRule, isRequired: v })} />
                <Label>Required trigger</Label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={addRule} disabled={!newRule.label.trim()}>Add Trigger</Button>
            </div>
          </div>
        )}

        {!adding && (
          <Button variant="outline" className="w-full gap-2" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add Trigger Rule
          </Button>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Triggers
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IndustryConfigPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<FullConfig | null>(null);

  const [terminology, setTerminology] = useState<Terminology>({ eventLabel: "", eventLabelPlural: "", entityLabel: "", revenueLabel: "", commissionLabel: "", salesPersonLabel: "", triggerLabel: "" });
  const [systemFields, setSystemFields] = useState<FieldDef[]>([]);
  const [customFields, setCustomFields] = useState<FieldDef[]>([]);
  const [formula, setFormula] = useState<FormulaConfig>({ calculationType: "", baseField: "", defaultCommissionPct: 10, description: "" });
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([]);
  const [triggerRules, setTriggerRules] = useState<TriggerRule[]>([]);

  const [savingTerminology, setSavingTerminology] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [savingFormula, setSavingFormula] = useState(false);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [savingTriggers, setSavingTriggers] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/industry-config", { headers: auth() as any });
      if (!res.ok) throw new Error("Failed to load");
      const data: FullConfig = await res.json();
      setConfig(data);
      setTerminology(data.terminology);
      setSystemFields(data.systemFields);
      setCustomFields(data.customFields);
      setFormula(data.formulaConfig);
      setApprovalSteps(data.approvalSteps);
      setTriggerRules(data.triggerRules);
    } catch {
      toast({ title: "Failed to load configuration", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  async function putConfig(body: Record<string, unknown>, setSaving: (v: boolean) => void, label: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/industry-config", {
        method: "PUT",
        headers: auth() as any,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast({ title: `${label} saved` });
    } catch (e: any) {
      toast({ title: `Failed to save ${label.toLowerCase()}`, description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load industry configuration. Please refresh.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Industry Configuration</h1>
          <p className="text-muted-foreground mt-1">Customise how the platform works for your industry</p>
        </div>
        <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1.5">
          <Factory className="h-4 w-4 text-primary" />
          {config.industryLabel}
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview" className="gap-1.5"><Factory className="h-3.5 w-3.5" /><span className="hidden sm:inline">Overview</span></TabsTrigger>
          <TabsTrigger value="terminology" className="gap-1.5"><Languages className="h-3.5 w-3.5" /><span className="hidden sm:inline">Terms</span></TabsTrigger>
          <TabsTrigger value="fields" className="gap-1.5"><ListChecks className="h-3.5 w-3.5" /><span className="hidden sm:inline">Fields</span></TabsTrigger>
          <TabsTrigger value="formula" className="gap-1.5"><Calculator className="h-3.5 w-3.5" /><span className="hidden sm:inline">Formula</span></TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5"><GitBranch className="h-3.5 w-3.5" /><span className="hidden sm:inline">Workflow</span></TabsTrigger>
          <TabsTrigger value="triggers" className="gap-1.5"><Zap className="h-3.5 w-3.5" /><span className="hidden sm:inline">Triggers</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab config={{ ...config, terminology, systemFields, customFields, formulaConfig: formula, approvalSteps, triggerRules }} />
        </TabsContent>

        <TabsContent value="terminology">
          <TerminologyTab
            terminology={terminology}
            onChange={(k, v) => setTerminology((t) => ({ ...t, [k]: v }))}
            onSave={() => putConfig({ terminology }, setSavingTerminology, "Terminology")}
            saving={savingTerminology}
          />
        </TabsContent>

        <TabsContent value="fields">
          <FieldsTab
            systemFields={systemFields} customFields={customFields}
            setSystemFields={setSystemFields} setCustomFields={setCustomFields}
            onSave={() => putConfig({ systemFields, customFields }, setSavingFields, "Fields")}
            saving={savingFields}
          />
        </TabsContent>

        <TabsContent value="formula">
          <FormulaTab
            formula={formula}
            onChange={(patch) => setFormula((f) => ({ ...f, ...patch }))}
            onSave={() => putConfig({ formulaConfig: formula }, setSavingFormula, "Formula")}
            saving={savingFormula}
          />
        </TabsContent>

        <TabsContent value="workflow">
          <WorkflowTab
            steps={approvalSteps} setSteps={setApprovalSteps}
            onSave={() => putConfig({ approvalSteps }, setSavingWorkflow, "Workflow")}
            saving={savingWorkflow}
          />
        </TabsContent>

        <TabsContent value="triggers">
          <TriggersTab
            rules={triggerRules} setRules={setTriggerRules}
            onSave={() => putConfig({ triggerRules }, setSavingTriggers, "Trigger rules")}
            saving={savingTriggers}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation, Redirect } from "wouter";
import {
  useGetOnboardingStatus,
  useCompleteOnboarding,
} from "@workspace/api-client-react";
import { INDUSTRY_CONFIGS } from "@/lib/industry-config";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, ChevronRight, ChevronLeft, Plus, Trash2,
  Monitor, Users, Shield, Car, Home, Building2, PhoneCall, Briefcase,
  Settings, Sparkles, ArrowRight, GripVertical,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuleRow {
  id?: string;
  ruleName: string;
  dealType: string;
  commissionPercentage: number;
}

interface StepRow {
  id?: string;
  stepOrder: number;
  stepName: string;
  approverRole: string;
}

interface InviteRow {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface WizardState {
  industry: string;
  terminology: {
    commissionEventName: string;
    customerLabel: string;
    transactionLabel: string;
    salesPersonLabel: string;
  };
  commissionRules: RuleRow[];
  approvalSteps: StepRow[];
  invites: InviteRow[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRY_ICONS: Record<string, React.ElementType> = {
  IT_CONSULTING:      Monitor,
  RECRUITMENT:        Users,
  INSURANCE:          Shield,
  VEHICLE_DEALERSHIP: Car,
  PROPERTY_SALES:     Home,
  RENTAL_MANAGEMENT:  Building2,
  TELECOM:            PhoneCall,
  SAAS:               Briefcase,
  CUSTOM:             Settings,
};

const DEAL_TYPES = [
  { value: "NET_NEW",    label: "Net New" },
  { value: "RENEWAL",    label: "Renewal" },
  { value: "UPSELL",     label: "Upsell" },
  { value: "CROSS_SELL", label: "Cross-Sell" },
];

const APPROVER_ROLES = [
  { value: "MANAGER",   label: "Manager" },
  { value: "ADMIN",     label: "Admin" },
  { value: "FINANCE",   label: "Finance" },
  { value: "EXECUTIVE", label: "Executive" },
  { value: "PAYROLL",   label: "Payroll" },
];

const INVITE_ROLES = [
  { value: "SALES_EXECUTIVE", label: "Sales Executive" },
  { value: "MANAGER",         label: "Manager" },
  { value: "FINANCE",         label: "Finance" },
  { value: "EXECUTIVE",       label: "Executive" },
  { value: "PAYROLL",         label: "Payroll" },
  { value: "ADMIN",           label: "Admin" },
];

const STEPS = [
  { number: 1, label: "Industry" },
  { number: 2, label: "Terminology" },
  { number: 3, label: "Commission" },
  { number: 4, label: "Approvals" },
  { number: 5, label: "Invite" },
  { number: 6, label: "Complete" },
];

const DEFAULT_RULES: RuleRow[] = [
  { ruleName: "Net New",      dealType: "NET_NEW",    commissionPercentage: 10 },
  { ruleName: "Renewal",      dealType: "RENEWAL",    commissionPercentage: 5 },
  { ruleName: "Upsell",       dealType: "UPSELL",     commissionPercentage: 7 },
  { ruleName: "Cross-Sell",   dealType: "CROSS_SELL", commissionPercentage: 6 },
];

const DEFAULT_STEPS: StepRow[] = [
  { stepOrder: 1, stepName: "Manager Review",    approverRole: "MANAGER" },
  { stepOrder: 2, stepName: "Finance Review",    approverRole: "FINANCE" },
  { stepOrder: 3, stepName: "Director Approval", approverRole: "ADMIN" },
];

// ─── Step Components ──────────────────────────────────────────────────────────

function StepIndustry({
  industry, onChange,
}: { industry: string; onChange: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Confirm your industry template</h2>
        <p className="text-sm text-muted-foreground mt-1">
          We pre-selected this based on your registration. Change it if needed — it shapes terminology, event types, and commission defaults.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {INDUSTRY_CONFIGS.map((cfg) => {
          const Icon = INDUSTRY_ICONS[cfg.id] ?? Settings;
          const selected = industry === cfg.id;
          return (
            <button
              key={cfg.id}
              onClick={() => onChange(cfg.id)}
              className={`flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all duration-150 cursor-pointer
                ${selected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                  : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
                }`}
            >
              <div className={`p-2 rounded-lg ${selected ? "bg-primary/20" : "bg-muted"}`}>
                <Icon className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${selected ? "text-primary" : "text-foreground"}`}>
                  {cfg.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{cfg.eventLabelPlural}</p>
              </div>
              {selected && (
                <CheckCircle2 className="h-4 w-4 text-primary absolute top-3 right-3" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepTerminology({
  industry,
  terminology,
  onChange,
}: {
  industry: string;
  terminology: WizardState["terminology"];
  onChange: (t: WizardState["terminology"]) => void;
}) {
  const cfg = INDUSTRY_CONFIGS.find((c) => c.id === industry) ?? INDUSTRY_CONFIGS[0];

  const fields: Array<{
    key: keyof WizardState["terminology"];
    label: string;
    placeholder: string;
    description: string;
  }> = [
    {
      key: "commissionEventName",
      label: "Commission Event",
      placeholder: cfg.eventLabel,
      description: `What do you call a ${cfg.eventLabel.toLowerCase()}? (e.g. "Deal", "Placement", "Policy")`,
    },
    {
      key: "customerLabel",
      label: "Customer / Client",
      placeholder: cfg.entityLabel,
      description: `What do you call the customer or client? (e.g. "Customer", "Client", "Buyer")`,
    },
    {
      key: "transactionLabel",
      label: "Transaction / Trigger",
      placeholder: "Transaction",
      description: `What do you call a trigger or transaction? (e.g. "Activation", "Transfer", "Deposit")`,
    },
    {
      key: "salesPersonLabel",
      label: "Sales Person",
      placeholder: "Sales Executive",
      description: `What do you call your sales people? (e.g. "Sales Executive", "Agent", "Advisor")`,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Confirm your terminology</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customise the labels used throughout the platform to match your industry language. Leave blank to use the defaults.
        </p>
      </div>
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-sm font-medium">{f.label}</Label>
            <p className="text-xs text-muted-foreground">{f.description}</p>
            <Input
              value={terminology[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...terminology, [f.key]: e.target.value })}
              className="max-w-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCommission({
  rules, onChange,
}: { rules: RuleRow[]; onChange: (r: RuleRow[]) => void }) {
  function add() {
    onChange([...rules, { ruleName: "", dealType: "NET_NEW", commissionPercentage: 10 }]);
  }
  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }
  function update(i: number, field: keyof RuleRow, value: string | number) {
    const updated = rules.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Confirm commission rules</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set the default commission percentages for each deal type. You can adjust these anytime in Company Settings.
        </p>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Rule Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Deal Type</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Commission %</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rules.map((r, i) => (
              <tr key={i} className="bg-card">
                <td className="px-4 py-2">
                  <Input
                    value={r.ruleName}
                    onChange={(e) => update(i, "ruleName", e.target.value)}
                    placeholder="e.g. Net New Standard"
                    className="h-8 text-sm"
                  />
                </td>
                <td className="px-4 py-2">
                  <Select value={r.dealType} onValueChange={(v) => update(i, "dealType", v)}>
                    <SelectTrigger className="h-8 text-sm w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_TYPES.map((dt) => (
                        <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={r.commissionPercentage}
                      onChange={(e) => update(i, "commissionPercentage", parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm w-20"
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No rules yet — add one below.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={add} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Add Rule
      </Button>
    </div>
  );
}

function StepApprovals({
  steps, onChange,
}: { steps: StepRow[]; onChange: (s: StepRow[]) => void }) {
  function add() {
    const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.stepOrder)) + 1 : 1;
    onChange([...steps, { stepOrder: nextOrder, stepName: "", approverRole: "MANAGER" }]);
  }
  function remove(i: number) {
    const updated = steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stepOrder: idx + 1 }));
    onChange(updated);
  }
  function update(i: number, field: keyof StepRow, value: string | number) {
    const updated = steps.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Confirm approval workflow</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define the approval chain for commission events. Each step must be approved before moving to the next.
        </p>
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 shrink-0">
              <GripVertical className="h-4 w-4 text-muted-foreground/40" />
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">{s.stepOrder}</span>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <Input
                  value={s.stepName}
                  onChange={(e) => update(i, "stepName", e.target.value)}
                  placeholder="e.g. Manager Review"
                  className="h-8 text-sm"
                />
              </div>
              <Select value={s.approverRole} onValueChange={(v) => update(i, "approverRole", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVER_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {steps.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm rounded-xl border border-dashed border-border">
            No approval steps yet — add one below.
          </div>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={add} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Add Step
      </Button>
    </div>
  );
}

function StepInvite({
  invites, onChange,
}: { invites: InviteRow[]; onChange: (inv: InviteRow[]) => void }) {
  function add() {
    onChange([...invites, { firstName: "", lastName: "", email: "", role: "SALES_EXECUTIVE" }]);
  }
  function remove(i: number) {
    onChange(invites.filter((_, idx) => idx !== i));
  }
  function update(i: number, field: keyof InviteRow, value: string) {
    const updated = invites.map((inv, idx) => idx === i ? { ...inv, [field]: value } : inv);
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Invite your team</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add team members now, or skip and invite them later from the Users page. Invited users get a temporary password <span className="font-mono text-xs bg-muted px-1 rounded">Incentiq@2024!</span>
        </p>
      </div>
      <div className="space-y-3">
        {invites.map((inv, i) => (
          <div key={i} className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">{INVITE_ROLES.find(r => r.value === inv.role)?.label ?? inv.role}</Badge>
              <Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">First Name</Label>
                <Input value={inv.firstName} onChange={(e) => update(i, "firstName", e.target.value)} placeholder="Jane" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last Name</Label>
                <Input value={inv.lastName} onChange={(e) => update(i, "lastName", e.target.value)} placeholder="Smith" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={inv.email} onChange={(e) => update(i, "email", e.target.value)} type="email" placeholder="jane@company.co.za" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={inv.role} onValueChange={(v) => update(i, "role", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
        {invites.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm rounded-xl border border-dashed border-border">
            No users added yet — you can skip this and invite later.
          </div>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={add} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Add Team Member
      </Button>
    </div>
  );
}

function StepComplete({
  state, onLaunch, isSubmitting,
}: { state: WizardState; onLaunch: () => void; isSubmitting: boolean }) {
  const cfg = INDUSTRY_CONFIGS.find((c) => c.id === state.industry) ?? INDUSTRY_CONFIGS[0];
  const Icon = INDUSTRY_ICONS[cfg.id] ?? Settings;

  const summaryItems = [
    {
      icon: Icon,
      label: "Industry",
      value: cfg.label,
      sub: `${cfg.eventLabelPlural} · ${cfg.commissionMethodLabel}`,
      color: "text-primary",
    },
    {
      icon: Settings,
      label: "Terminology",
      value: Object.values(state.terminology).filter(Boolean).length > 0
        ? `${Object.values(state.terminology).filter(Boolean).length} custom labels`
        : "Using defaults",
      sub: state.terminology.commissionEventName ? `Events called "${state.terminology.commissionEventName}"` : `Events called "${cfg.eventLabel}"`,
      color: "text-indigo-400",
    },
    {
      icon: () => <span className="text-lg font-bold text-emerald-400">%</span>,
      label: "Commission Rules",
      value: `${state.commissionRules.length} rule${state.commissionRules.length !== 1 ? "s" : ""}`,
      sub: state.commissionRules.map((r) => `${r.dealType}: ${r.commissionPercentage}%`).join(" · ") || "No rules",
      color: "text-emerald-400",
    },
    {
      icon: CheckCircle2,
      label: "Approval Workflow",
      value: `${state.approvalSteps.length} step${state.approvalSteps.length !== 1 ? "s" : ""}`,
      sub: state.approvalSteps.map((s) => s.stepName || s.approverRole).join(" → ") || "No steps",
      color: "text-amber-400",
    },
    {
      icon: Users,
      label: "Team Members",
      value: state.invites.length > 0 ? `${state.invites.length} invited` : "None yet",
      sub: state.invites.length > 0
        ? state.invites.slice(0, 3).map((i) => `${i.firstName} ${i.lastName}`).join(", ")
        : "You can invite from the Users page",
      color: "text-blue-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center pt-2">
        <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">You're all set!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review your setup summary below, then launch your dashboard.
        </p>
      </div>

      <div className="space-y-2">
        {summaryItems.map((item, i) => {
          const ItemIcon = item.icon;
          return (
            <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="p-2 rounded-lg bg-muted shrink-0">
                <ItemIcon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{item.label}</span>
                </div>
                <p className="text-sm font-medium text-foreground mt-0.5">{item.value}</p>
                <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        size="lg"
        className="w-full gap-2"
        onClick={onLaunch}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Setting up your workspace…
          </>
        ) : (
          <>
            Launch Dashboard <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: status, isLoading, isError } = useGetOnboardingStatus();
  const completeOnboarding = useCompleteOnboarding();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({
    industry: "IT_CONSULTING",
    terminology: { commissionEventName: "", customerLabel: "", transactionLabel: "", salesPersonLabel: "" },
    commissionRules: DEFAULT_RULES,
    approvalSteps: DEFAULT_STEPS,
    invites: [],
  });

  // Pre-populate from backend status
  useEffect(() => {
    if (!status) return;

    // Redirect non-admin users or completed tenants
    if (status.onboardingStatus === "COMPLETED" || (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN")) {
      setLocation("/dashboard");
      return;
    }

    setState((prev) => ({
      ...prev,
      industry: status.industry ?? prev.industry,
      terminology: {
        commissionEventName: status.terminology?.commissionEventName ?? "",
        customerLabel: status.terminology?.customerLabel ?? "",
        transactionLabel: status.terminology?.transactionLabel ?? "",
        salesPersonLabel: status.terminology?.salesPersonLabel ?? "",
      },
      commissionRules: status.commissionRules && status.commissionRules.length > 0
        ? status.commissionRules
        : DEFAULT_RULES,
      approvalSteps: status.approvalSteps && status.approvalSteps.length > 0
        ? status.approvalSteps.map((s, i) => ({ ...s, stepOrder: s.stepOrder ?? i + 1 }))
        : DEFAULT_STEPS,
    }));
  }, [status, user]);

  async function handleLaunch() {
    try {
      await completeOnboarding.mutateAsync({
        data: {
          industry: state.industry,
          terminology: {
            commissionEventName: state.terminology.commissionEventName || null,
            customerLabel: state.terminology.customerLabel || null,
            transactionLabel: state.terminology.transactionLabel || null,
            salesPersonLabel: state.terminology.salesPersonLabel || null,
          },
          commissionRules: state.commissionRules,
          approvalSteps: state.approvalSteps,
          invites: state.invites.filter(
            (inv) => inv.email && inv.firstName && inv.lastName
          ),
        },
      });
      toast({ title: "Setup complete!", description: "Welcome to Incentiq. Your dashboard is ready." });
      setLocation("/dashboard");
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    }
  }

  function next() { setStep((s) => Math.min(s + 1, STEPS.length)); }
  function prev() { setStep((s) => Math.max(s - 1, 1)); }

  if (!user && !isLoading) return <Redirect to="/login" />;

  if (isError) return <Redirect to="/dashboard" />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading your workspace…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-foreground text-sm">Incentiq Setup</span>
        </div>
        <span className="text-xs text-muted-foreground">Step {step} of {STEPS.length}</span>
      </div>

      {/* Progress */}
      <div className="border-b border-border bg-card px-6 py-3 shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const done = step > s.number;
              const active = step === s.number;
              return (
                <div key={s.number} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-all
                      ${done   ? "bg-primary border-primary text-primary-foreground"
                              : active ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-transparent text-muted-foreground"}`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.number}
                    </div>
                    <span className={`text-[10px] font-medium whitespace-nowrap hidden sm:block
                      ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 mt-[-10px] transition-all ${step > s.number ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <Card className="shadow-sm border-border">
            <CardContent className="pt-6">
              {step === 1 && (
                <StepIndustry
                  industry={state.industry}
                  onChange={(id) => setState((s) => ({ ...s, industry: id }))}
                />
              )}
              {step === 2 && (
                <StepTerminology
                  industry={state.industry}
                  terminology={state.terminology}
                  onChange={(t) => setState((s) => ({ ...s, terminology: t }))}
                />
              )}
              {step === 3 && (
                <StepCommission
                  rules={state.commissionRules}
                  onChange={(r) => setState((s) => ({ ...s, commissionRules: r }))}
                />
              )}
              {step === 4 && (
                <StepApprovals
                  steps={state.approvalSteps}
                  onChange={(steps) => setState((s) => ({ ...s, approvalSteps: steps }))}
                />
              )}
              {step === 5 && (
                <StepInvite
                  invites={state.invites}
                  onChange={(inv) => setState((s) => ({ ...s, invites: inv }))}
                />
              )}
              {step === 6 && (
                <StepComplete
                  state={state}
                  onLaunch={handleLaunch}
                  isSubmitting={completeOnboarding.isPending}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Navigation */}
      {step < 6 && (
        <div className="border-t border-border bg-card px-6 py-4 shrink-0">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={prev}
              disabled={step === 1}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-3">
              {step === 5 && (
                <Button variant="ghost" onClick={next} className="text-muted-foreground">
                  Skip for now
                </Button>
              )}
              <Button onClick={next} className="gap-2">
                {step === 5 ? "Review & Finish" : "Continue"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

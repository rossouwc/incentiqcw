import { useState, useEffect } from "react";
import { useGetTenant } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Globe, Mail, Phone, Save, CalendarDays, Loader2, Factory, AlertTriangle, Trash2, RotateCcw, Users, Plus, Pencil, XCircle, CheckCircle2, UserCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { INDUSTRY_OPTIONS, getIndustryConfig } from "@/lib/industry-config";

function authHeaders() {
  const token = localStorage.getItem("incentiq_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

interface ExtProvider {
  id: string; name: string; contactName?: string; contactEmail?: string;
  providerType?: string; notes?: string; isActive: boolean;
}

export default function CompanySettings() {
  const { data: tenant, isLoading, refetch: refetchTenant } = useGetTenant();
  const { toast } = useToast();
  const { logout } = useAuth();

  // ── Company Profile state ────────────────────────────────────────────────
  const [profileCompanyName, setProfileCompanyName] = useState("");
  const [profileContactName, setProfileContactName] = useState("");
  const [profileContactEmail, setProfileContactEmail] = useState("");
  const [profileContactPhone, setProfileContactPhone] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Payroll config state ─────────────────────────────────────────────────
  const [payrollDay, setPayrollDay] = useState<number>(25);
  const [cutoffDay, setCutoffDay] = useState<number>(20);
  const [loadingPayroll, setLoadingPayroll] = useState(true);
  const [savingPayroll, setSavingPayroll] = useState(false);

  // ── Industry state ───────────────────────────────────────────────────────
  const [industry, setIndustry] = useState<string>("");
  const [savingIndustry, setSavingIndustry] = useState(false);

  // ── Deal Source / Split config state ────────────────────────────────────
  const [splitEnabled, setSplitEnabled]         = useState(false);
  const [splitInternalLabel, setSplitInternalLabel] = useState("Internal Referral");
  const [splitDeductionType, setSplitDeductionType] = useState<"PERCENTAGE" | "FLAT_AMOUNT">("PERCENTAGE");
  const [splitDeductionValue, setSplitDeductionValue] = useState<number>(0);
  const [savingSplit, setSavingSplit]           = useState(false);

  // ── External providers state ─────────────────────────────────────────────
  const [providers, setProviders]               = useState<ExtProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProvider, setEditingProvider]   = useState<ExtProvider | null>(null);
  const [pvName, setPvName]                     = useState("");
  const [pvContact, setPvContact]               = useState("");
  const [pvEmail, setPvEmail]                   = useState("");
  const [pvType, setPvType]                     = useState("");
  const [pvNotes, setPvNotes]                   = useState("");
  const [savingProvider, setSavingProvider]     = useState(false);

  // ── Reset dialog state ───────────────────────────────────────────────────
  const [showReset, setShowReset] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetting, setResetting] = useState(false);

  // ── Delete dialog state ──────────────────────────────────────────────────
  const [showDelete, setShowDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  const companyName = (tenant as any)?.companyName ?? "";

  // Populate profile fields when tenant data loads
  useEffect(() => {
    if (!tenant) return;
    const t = tenant as any;
    setProfileCompanyName(t.companyName ?? "");
    setProfileContactName(t.contactName ?? "");
    setProfileContactEmail(t.contactEmail ?? "");
    setProfileContactPhone(t.contactPhone ?? "");
    setProfileWebsite(t.website ?? "");
  }, [(tenant as any)?.id]);

  useEffect(() => {
    fetch("/api/tenant/payroll-config", { headers: authHeaders() as any })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setPayrollDay(d.payrollDay ?? 25);
          setCutoffDay(d.commissionCutoffDay ?? 20);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPayroll(false));
  }, []);

  useEffect(() => {
    if ((tenant as any)?.industry) setIndustry((tenant as any).industry);
  }, [(tenant as any)?.industry]);

  // Load split config
  useEffect(() => {
    fetch("/api/commission-split-config", { headers: authHeaders() as any })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setSplitEnabled(d.isEnabled ?? false);
        setSplitInternalLabel(d.internalLabel ?? "Internal Referral");
        setSplitDeductionType(d.deductionType ?? "PERCENTAGE");
        setSplitDeductionValue(d.deductionValue ?? 0);
      })
      .catch(() => {});
  }, []);

  // Load external providers
  function loadProviders() {
    setLoadingProviders(true);
    fetch("/api/external-providers?activeOnly=false", { headers: authHeaders() as any })
      .then(r => r.ok ? r.json() : [])
      .then(setProviders)
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false));
  }
  useEffect(() => { loadProviders(); }, []);

  const saveProfile = async () => {
    if (!profileCompanyName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/tenant", {
        method: "PATCH",
        headers: authHeaders() as any,
        body: JSON.stringify({
          companyName:   profileCompanyName,
          contactName:   profileContactName,
          contactEmail:  profileContactEmail,
          contactPhone:  profileContactPhone,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      await refetchTenant();
      toast({ title: "Company profile saved", description: "Your organisation details have been updated." });
    } catch {
      toast({ title: "Failed to save profile", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveIndustry = async () => {
    if (!industry) return;
    setSavingIndustry(true);
    try {
      const res = await fetch("/api/tenant", {
        method: "PATCH",
        headers: authHeaders() as any,
        body: JSON.stringify({ industry }),
      });
      if (!res.ok) throw new Error("Failed");
      const cfg = getIndustryConfig(industry);
      toast({ title: "Industry updated", description: `Platform configured for ${cfg.label} — events now called "${cfg.eventLabel}".` });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingIndustry(false);
    }
  };

  const saveSplitConfig = async () => {
    setSavingSplit(true);
    try {
      const res = await fetch("/api/commission-split-config", {
        method: "PUT",
        headers: authHeaders() as any,
        body: JSON.stringify({
          isEnabled: splitEnabled,
          internalLabel: splitInternalLabel.trim() || "Internal Referral",
          deductionType: splitDeductionType,
          deductionValue: splitDeductionValue,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Deal Source settings saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingSplit(false);
    }
  };

  const openAddProvider = () => {
    setEditingProvider(null);
    setPvName(""); setPvContact(""); setPvEmail(""); setPvType(""); setPvNotes("");
    setShowProviderForm(true);
  };

  const openEditProvider = (p: ExtProvider) => {
    setEditingProvider(p);
    setPvName(p.name); setPvContact(p.contactName ?? ""); setPvEmail(p.contactEmail ?? "");
    setPvType(p.providerType ?? ""); setPvNotes(p.notes ?? "");
    setShowProviderForm(true);
  };

  const saveProvider = async () => {
    if (!pvName.trim()) {
      toast({ title: "Provider name is required", variant: "destructive" }); return;
    }
    setSavingProvider(true);
    try {
      const method = editingProvider ? "PUT" : "POST";
      const url    = editingProvider ? `/api/external-providers/${editingProvider.id}` : "/api/external-providers";
      const res = await fetch(url, {
        method,
        headers: authHeaders() as any,
        body: JSON.stringify({ name: pvName.trim(), contactName: pvContact.trim() || null, contactEmail: pvEmail.trim() || null, providerType: pvType.trim() || null, notes: pvNotes.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: editingProvider ? "Provider updated" : "Provider added" });
      setShowProviderForm(false);
      loadProviders();
    } catch {
      toast({ title: "Failed to save provider", variant: "destructive" });
    } finally {
      setSavingProvider(false);
    }
  };

  const toggleProvider = async (p: ExtProvider) => {
    try {
      const res = await fetch(`/api/external-providers/${p.id}`, {
        method: "PUT",
        headers: authHeaders() as any,
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      loadProviders();
    } catch {
      toast({ title: "Failed to update provider", variant: "destructive" });
    }
  };

  const deleteProvider = async (p: ExtProvider) => {
    try {
      const res = await fetch(`/api/external-providers/${p.id}`, { method: "DELETE", headers: authHeaders() as any });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Provider removed" });
      loadProviders();
    } catch {
      toast({ title: "Failed to remove provider", variant: "destructive" });
    }
  };

  const savePayrollConfig = async () => {
    if (payrollDay < 1 || payrollDay > 28 || cutoffDay < 1 || cutoffDay > 28) {
      toast({ title: "Invalid dates", description: "Day values must be between 1 and 28", variant: "destructive" });
      return;
    }
    setSavingPayroll(true);
    try {
      const res = await fetch("/api/tenant/payroll-config", {
        method: "PATCH",
        headers: authHeaders() as any,
        body: JSON.stringify({ payrollDay, commissionCutoffDay: cutoffDay }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Payroll settings saved", description: `Payroll runs on the ${payrollDay}th, cut-off on the ${cutoffDay}th of each month.` });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingPayroll(false);
    }
  };

  const handleReset = async () => {
    if (resetInput !== "RESET") return;
    setResetting(true);
    try {
      const res = await fetch("/api/tenant/reset-commission-data", {
        method: "POST",
        headers: authHeaders() as any,
        body: JSON.stringify({ confirm: "RESET" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setShowReset(false);
      setResetInput("");
      toast({
        title: "Commission data reset",
        description: "All commission events, wallets and payout data have been cleared.",
      });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteInput.trim() !== companyName.trim()) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/tenant", {
        method: "DELETE",
        headers: authHeaders() as any,
        body: JSON.stringify({ confirm: deleteInput }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      toast({ title: "Account deleted", description: "Your company account has been permanently deleted." });
      setTimeout(() => logout(), 1500);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setDeleting(false);
    }
  };

  const ordinal = (n: number) => ["st", "nd", "rd"][n - 1] ?? "th";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Company Settings</h1>
        <p className="text-muted-foreground">Manage your organisation's profile and configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Basic information about your organisation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input
                        value={profileCompanyName}
                        onChange={e => setProfileCompanyName(e.target.value)}
                        placeholder="Your company name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input
                        value={profileContactName}
                        onChange={e => setProfileContactName(e.target.value)}
                        placeholder="Primary contact name"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        value={profileWebsite}
                        onChange={e => setProfileWebsite(e.target.value)}
                        placeholder="https://yourcompany.co.za"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          value={profileContactEmail}
                          onChange={e => setProfileContactEmail(e.target.value)}
                          placeholder="admin@company.co.za"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          value={profileContactPhone}
                          onChange={e => setProfileContactPhone(e.target.value)}
                          placeholder="+27 11 000 0000"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button className="gap-2" onClick={saveProfile} disabled={savingProfile}>
                      {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Changes
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Commission Defaults</CardTitle>
              <CardDescription>Platform-wide defaults applied to all commission calculations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input value="ZAR (South African Rand)" readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Payment Frequency</Label>
                  <Input value="Monthly" readOnly className="bg-muted cursor-not-allowed" />
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
                Commission basis, rate, and formula are configured per industry in the <span className="font-medium text-foreground">Industry Configuration</span> section below.
              </div>
            </CardContent>
          </Card>

          {/* Industry Configuration */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-primary" />
                Industry Configuration
              </CardTitle>
              <CardDescription>
                Your industry drives field labels, commission methods, event names, and approval workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRY_OPTIONS.map(opt => (
                          <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {industry && (() => {
                    const cfg = getIndustryConfig(industry);
                    return (
                      <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm space-y-2">
                        <p className="font-medium text-foreground">Configuration preview</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span>Event name</span><span className="text-foreground font-medium">{cfg.eventLabel}</span>
                          <span>Entity label</span><span className="text-foreground font-medium">{cfg.entityLabel}</span>
                          <span>Revenue label</span><span className="text-foreground font-medium">{cfg.revenueLabel}</span>
                          <span>Commission method</span><span className="text-foreground font-medium">{cfg.commissionMethodLabel}</span>
                          <span>Trigger</span><span className="text-foreground font-medium col-span-1">{cfg.triggerLabel}</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex justify-end">
                    <Button className="gap-2" onClick={saveIndustry} disabled={savingIndustry}>
                      {savingIndustry ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Industry
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Payroll Settings */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Payroll Settings
              </CardTitle>
              <CardDescription>
                Control when commissions are processed and cut off each month
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingPayroll ? (
                <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Payroll Date (day of month)</Label>
                      <Input
                        type="number" min={1} max={28}
                        value={payrollDay}
                        onChange={e => setPayrollDay(Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Payroll runs on the <span className="font-medium text-foreground">{payrollDay}{ordinal(payrollDay)}</span> of each month.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Commission Cut-off Date (day of month)</Label>
                      <Input
                        type="number" min={1} max={28}
                        value={cutoffDay}
                        onChange={e => setCutoffDay(Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Deals approved after the <span className="font-medium text-foreground">{cutoffDay}{ordinal(cutoffDay)}</span> roll into next month's payroll.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 border border-border p-4 text-sm space-y-1.5">
                    <p className="font-medium text-foreground">How this works</p>
                    <ul className="text-muted-foreground space-y-1 list-disc list-inside text-xs">
                      <li>All deals fully approved on or before the <strong>{cutoffDay}{ordinal(cutoffDay)}</strong> are included in <strong>this month's</strong> payroll run.</li>
                      <li>Any deal approved after the <strong>{cutoffDay}{ordinal(cutoffDay)}</strong> rolls over to <strong>next month's</strong> payroll.</li>
                      <li>On the <strong>{payrollDay}{ordinal(payrollDay)}</strong> of each month, all <em>Payroll Approved</em> commissions are automatically marked as <strong>Paid</strong>.</li>
                    </ul>
                  </div>

                  <div className="flex justify-end">
                    <Button className="gap-2" onClick={savePayrollConfig} disabled={savingPayroll}>
                      {savingPayroll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Payroll Settings
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Deal Source & Commission Split */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Deal Source & Commission Split
              </CardTitle>
              <CardDescription>
                Track how deals are sourced and automatically split commissions with internal referrers or external partners
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Enable toggle + rule config */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Enable Deal Source Tracking</p>
                    <p className="text-xs text-muted-foreground">Show source selector on deal capture forms</p>
                  </div>
                  <Switch
                    checked={splitEnabled}
                    onCheckedChange={setSplitEnabled}
                  />
                </div>

                {splitEnabled && (
                  <div className="space-y-4 pt-2 border-t border-border">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Internal Referral Label</Label>
                      <Input
                        value={splitInternalLabel}
                        onChange={e => setSplitInternalLabel(e.target.value)}
                        placeholder="Internal Referral"
                        className="h-9"
                      />
                      <p className="text-xs text-muted-foreground">Shown on deal forms as the "Internal" source option</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Deduction for Internal Referrals</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={splitDeductionType} onValueChange={(v) => setSplitDeductionType(v as "PERCENTAGE" | "FLAT_AMOUNT")}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                            <SelectItem value="FLAT_AMOUNT">Flat Amount (R)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" min={0}
                          value={splitDeductionValue}
                          onChange={e => setSplitDeductionValue(Number(e.target.value))}
                          placeholder={splitDeductionType === "PERCENTAGE" ? "e.g. 10" : "e.g. 500"}
                          className="h-9"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {splitDeductionType === "PERCENTAGE"
                          ? `${splitDeductionValue || 0}% of the sales rep's commission is deducted and credited to the referrer's wallet on approval.`
                          : `R${(splitDeductionValue || 0).toLocaleString()} is deducted from the sales rep and credited to the referrer on approval.`}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button className="gap-2" onClick={saveSplitConfig} disabled={savingSplit}>
                    {savingSplit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Settings
                  </Button>
                </div>
              </div>

              {/* External provider/partner directory */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">External Providers / Partners</p>
                    <p className="text-xs text-muted-foreground">ISPs, resellers, and referral partners shown in the deal source picker</p>
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={openAddProvider}>
                    <Plus className="h-3.5 w-3.5" /> Add Provider
                  </Button>
                </div>

                {loadingProviders ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : providers.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                    No external providers added yet
                  </div>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                    {providers.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-card hover:bg-muted/30 transition-colors">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          {(p.contactName || p.providerType) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[p.providerType, p.contactName].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${p.isActive ? "text-emerald-600 border-emerald-300" : "text-muted-foreground"}`}
                        >
                          {p.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => openEditProvider(p)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleProvider(p)}
                          className={`transition-colors ${p.isActive ? "text-amber-500 hover:text-amber-600" : "text-emerald-500 hover:text-emerald-600"}`}
                          title={p.isActive ? "Deactivate" : "Reactivate"}
                        >
                          {p.isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProvider(p)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? <Skeleton className="h-20 w-full" /> : (
                <>
                  <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <Building2 className="h-8 w-8 text-primary" />
                    <div>
                      <div className="font-semibold text-foreground">{(tenant as any)?.plan ?? "Growth"}</div>
                      <div className="text-sm text-muted-foreground">Current plan</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Billing cycle</span>
                      <span className="font-medium">Monthly</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Next invoice</span>
                      <span className="font-medium">1 Jul 2026</span>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full">Upgrade Plan</Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="shadow-sm border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">These actions are irreversible. Proceed with caution.</p>

              <Button
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10 gap-2"
                onClick={() => { setResetInput(""); setShowReset(true); }}
              >
                <RotateCcw className="h-4 w-4" />
                Reset All Commission Data
              </Button>

              <Button
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10 gap-2"
                onClick={() => { setDeleteInput(""); setShowDelete(true); }}
              >
                <Trash2 className="h-4 w-4" />
                Delete Company Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Reset Commission Data Dialog ────────────────────────────────────── */}
      <Dialog open={showReset} onOpenChange={(open) => { if (!resetting) setShowReset(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reset All Commission Data
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block">
                This will permanently delete <strong>all commission events, wallets, wallet transactions, payout requests, and notifications</strong> for your company.
              </span>
              <span className="block text-destructive font-medium">
                This cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="reset-confirm">
              Type <span className="font-mono font-bold text-foreground">RESET</span> to confirm
            </Label>
            <Input
              id="reset-confirm"
              value={resetInput}
              onChange={e => setResetInput(e.target.value)}
              placeholder="RESET"
              className="font-mono"
              autoComplete="off"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReset(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetInput !== "RESET" || resetting}
              className="gap-2"
            >
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reset All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Company Account Dialog ───────────────────────────────────── */}
      <Dialog open={showDelete} onOpenChange={(open) => { if (!deleting) setShowDelete(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Company Account
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block">
                This will permanently delete <strong>your entire company account</strong> — all users, all commission data, all settings, and all history. There is no recovery.
              </span>
              <span className="block text-destructive font-medium">
                You will be signed out immediately after deletion.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="delete-confirm">
              Type your company name{" "}
              <span className="font-mono font-bold text-foreground">"{companyName}"</span>{" "}
              to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder={companyName}
              autoComplete="off"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteInput.trim() !== companyName.trim() || !companyName || deleting}
              className="gap-2"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Account Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit External Provider Dialog ─────────────────────────────── */}
      <Dialog open={showProviderForm} onOpenChange={(open) => { if (!savingProvider) setShowProviderForm(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {editingProvider ? "Edit Provider" : "Add External Provider"}
            </DialogTitle>
            <DialogDescription>
              External providers appear in the deal source picker when capturing new deals.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="pv-name">Provider / Company Name <span className="text-destructive">*</span></Label>
              <Input
                id="pv-name"
                value={pvName}
                onChange={e => setPvName(e.target.value)}
                placeholder="e.g. XYZ Referral Partners"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-contact">Contact Name</Label>
                <Input id="pv-contact" value={pvContact} onChange={e => setPvContact(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-email">Contact Email</Label>
                <Input id="pv-email" type="email" value={pvEmail} onChange={e => setPvEmail(e.target.value)} placeholder="jane@xyz.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-type">Provider Type</Label>
              <Input id="pv-type" value={pvType} onChange={e => setPvType(e.target.value)} placeholder="e.g. ISP, Reseller, Broker" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-notes">Notes</Label>
              <Input id="pv-notes" value={pvNotes} onChange={e => setPvNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowProviderForm(false)} disabled={savingProvider}>
              Cancel
            </Button>
            <Button onClick={saveProvider} disabled={!pvName.trim() || savingProvider} className="gap-2">
              {savingProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingProvider ? "Save Changes" : "Add Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

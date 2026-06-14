import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTaxProfile,
  useUpsertTaxProfile,
  useEstimatePAYE,
  getGetTaxProfileQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Calculator, AlertCircle, TrendingUp, ChevronRight,
  BadgePercent, Banknote, Info,
} from "lucide-react";

const ZAR = (v: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(v);
const PCT = (v: number) => `${v.toFixed(1)}%`;

const TAX_YEARS = [2025, 2026];
const CUR_YEAR = new Date().getFullYear() >= 2026 ? 2026 : 2025;

export default function TaxProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading } = useGetTaxProfile();
  const { mutate: saveProfile, isPending: saving } = useUpsertTaxProfile();
  const { mutate: estimate, isPending: estimating } = useEstimatePAYE();

  // ── profile form state ────────────────────────────────────────────────────
  const [form, setForm] = useState({
    monthlySalary:          0,
    annualSalary:           0,
    medicalAidCredits:      0,
    retirementContribution: 0,
    taxYear:                CUR_YEAR,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        monthlySalary:          profile.monthlySalary,
        annualSalary:           profile.annualSalary,
        medicalAidCredits:      profile.medicalAidCredits,
        retirementContribution: profile.retirementContribution,
        taxYear:                profile.taxYear,
      });
    }
  }, [profile]);

  // ── calculator state ──────────────────────────────────────────────────────
  const [calcPayout, setCalcPayout]     = useState("");
  const [calcResult, setCalcResult]     = useState<{
    taxYear: number;
    annualSalary: number;
    commissionPayout: number;
    retirementContribution: number;
    medicalAidCreditAnnual: number;
    taxableIncomeBase: number;
    taxableIncomeWithCommission: number;
    netTaxBase: number;
    netTaxWithCommission: number;
    additionalTax: number;
    estimatedNetPayout: number;
    effectiveRateOnCommission: number;
    primaryRebateApplied: number;
  } | null>(null);

  const num = (s: string) => parseFloat(s.replace(/[^0-9.]/g, "")) || 0;

  function handleFieldChange(field: keyof typeof form, value: string | number) {
    setForm((f) => {
      const next = { ...f, [field]: typeof value === "number" ? value : num(String(value)) };
      if (field === "monthlySalary") next.annualSalary = next.monthlySalary * 12;
      if (field === "annualSalary")  next.monthlySalary = next.annualSalary / 12;
      return next;
    });
  }

  function handleSave() {
    saveProfile(
      { data: form },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetTaxProfileQueryKey() });
          toast({ title: "Tax profile saved", description: "Your tax details have been updated." });
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      },
    );
  }

  function handleEstimate() {
    const payout = num(calcPayout);
    if (payout <= 0) return;
    estimate(
      {
        data: {
          annualSalary:           form.annualSalary,
          commissionPayout:       payout,
          medicalAidCredits:      form.medicalAidCredits,
          retirementContribution: form.retirementContribution,
          taxYear:                form.taxYear,
        },
      },
      {
        onSuccess: (r) => setCalcResult(r),
        onError: () =>
          toast({
            title: "Estimate failed",
            description: "Ensure tax brackets are configured for the selected year.",
            variant: "destructive",
          }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Tax Profile</h1>
        <p className="text-muted-foreground">
          Capture your salary and tax details to estimate the PAYE impact of commission payouts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Profile form ────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Tax Year &amp; Salary</CardTitle>
              <CardDescription>Used to calculate your PAYE bracket</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tax Year</Label>
                  <Select
                    value={String(form.taxYear)}
                    onValueChange={(v) => handleFieldChange("taxYear", parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_YEARS.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y - 1}/{y} (ends Feb {y})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monthly Basic Salary (ZAR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.monthlySalary || ""}
                    onChange={(e) => handleFieldChange("monthlySalary", e.target.value)}
                    placeholder="e.g. 45000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Annual Salary (ZAR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.annualSalary || ""}
                    onChange={(e) => handleFieldChange("annualSalary", e.target.value)}
                    placeholder="e.g. 540000"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Medical Aid Credits (ZAR / month)
                    <span className="text-xs text-muted-foreground">(per beneficiary × R364)</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.medicalAidCredits || ""}
                    onChange={(e) => handleFieldChange("medicalAidCredits", e.target.value)}
                    placeholder="e.g. 728 (2 members)"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Retirement Contribution (ZAR / year)
                    <span className="text-xs text-muted-foreground">(deductible, max 27.5% of income)</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.retirementContribution || ""}
                    onChange={(e) => handleFieldChange("retirementContribution", e.target.value)}
                    placeholder="e.g. 54000"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save Tax Profile"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Calculator ──────────────────────────────────────────────── */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                PAYE Impact Calculator
              </CardTitle>
              <CardDescription>
                Estimate how much additional PAYE tax a commission payout will attract.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Commission Payout Amount (ZAR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={calcPayout}
                    onChange={(e) => { setCalcPayout(e.target.value); setCalcResult(null); }}
                    placeholder="e.g. 25000"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleEstimate}
                    disabled={estimating || !calcPayout || form.annualSalary <= 0}
                    className="gap-2"
                  >
                    <TrendingUp className="h-4 w-4" />
                    {estimating ? "Calculating…" : "Estimate"}
                  </Button>
                </div>
              </div>

              {form.annualSalary <= 0 && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Save your annual salary above first.
                </p>
              )}

              {calcResult && (
                <div className="mt-4 space-y-4">
                  {/* Income summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Taxable Income (base)</p>
                      <p className="font-semibold text-foreground">{ZAR(calcResult.taxableIncomeBase)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Taxable Income (with commission)</p>
                      <p className="font-semibold text-foreground">{ZAR(calcResult.taxableIncomeWithCommission)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Net Annual Tax (base)</p>
                      <p className="font-semibold text-foreground">{ZAR(calcResult.netTaxBase)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Net Annual Tax (with commission)</p>
                      <p className="font-semibold text-foreground">{ZAR(calcResult.netTaxWithCommission)}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Payout breakdown */}
                  <div className="space-y-2">
                    {[
                      { label: "Gross Commission", value: ZAR(calcResult.commissionPayout), icon: Banknote, color: "text-foreground" },
                      { label: `Est. Additional PAYE Tax (${PCT(calcResult.effectiveRateOnCommission)} effective)`, value: `−${ZAR(calcResult.additionalTax)}`, icon: BadgePercent, color: "text-destructive" },
                      { label: "Credits Applied", value: `−${ZAR(calcResult.medicalAidCreditAnnual)} med + ${ZAR(calcResult.primaryRebateApplied)} rebate`, icon: Info, color: "text-muted-foreground", small: true },
                    ].map(({ label, value, icon: Icon, color, small }) => (
                      <div key={label} className="flex items-center justify-between py-1">
                        <span className={`flex items-center gap-2 text-sm ${small ? "text-xs text-muted-foreground" : "text-foreground"}`}>
                          <Icon className={`h-3.5 w-3.5 ${color}`} />
                          {label}
                        </span>
                        <span className={`text-sm font-medium ${color}`}>{value}</span>
                      </div>
                    ))}

                    <Separator />

                    <div className="flex items-center justify-between py-2 bg-primary/10 rounded-lg px-3">
                      <span className="font-semibold text-foreground flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" />
                        Estimated Net Payout
                      </span>
                      <span className="text-lg font-bold text-primary">{ZAR(calcResult.estimatedNetPayout)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Info panel ─────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Disclaimer */}
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-800 dark:text-amber-400 text-sm">Disclaimer</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400/80 leading-relaxed">
                    This is an estimate only and does not replace formal payroll or tax advice. Actual PAYE
                    depends on your full tax profile, including other income, deductions, and directives. Consult
                    a registered tax practitioner for personalised advice.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">How the estimate works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>1. <strong>Monthly income</strong> = (Annual salary ÷ 12) + Commission payout.</p>
              <p>2. <strong>Annualise:</strong> Monthly income × 12, then subtract annual retirement contribution.</p>
              <p>3. <strong>Gross tax</strong> calculated from SARS PAYE brackets for the selected tax year.</p>
              <p>4. <strong>Credits applied:</strong> primary rebate + medical aid credits (monthly × 12).</p>
              <p>5. <strong>Additional PAYE</strong> = (Tax with commission − Tax without) ÷ 12.</p>
              <p>6. <strong>Net payout</strong> = Commission − additional PAYE.</p>
            </CardContent>
          </Card>

          {/* Current year summary */}
          {form.annualSalary > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Your Profile Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { label: "Monthly salary", value: ZAR(form.monthlySalary) },
                  { label: "Annual salary", value: ZAR(form.annualSalary) },
                  { label: "Medical credits p/m", value: ZAR(form.medicalAidCredits) },
                  { label: "Retirement p/a", value: ZAR(form.retirementContribution) },
                  { label: "Tax year", value: `${form.taxYear - 1}/${form.taxYear}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

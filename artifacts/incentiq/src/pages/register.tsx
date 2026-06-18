import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Building2, Briefcase, User, Check, ChevronRight, ChevronLeft,
  Zap, Layers, GitBranch, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { INDUSTRY_OPTIONS, getIndustryConfig } from "@/lib/industry-config";
import { cn } from "@/lib/utils";

// ── Static config ──────────────────────────────────────────────────────────────

const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"];

const INDUSTRY_TRIGGERS: Record<string, string> = {
  IT_CONSULTING:      "Contract Signed or First Invoice Paid",
  RECRUITMENT:        "Candidate Start Date or Client Payment Received",
  INSURANCE:          "Policy Activated and First Premium Collected",
  VEHICLE_DEALERSHIP: "Vehicle Delivered",
  PROPERTY_SALES:     "Transfer Registered",
  RENTAL_MANAGEMENT:  "Lease Signed or First Rental Collected",
  TELECOM:            "Service Activated",
  SAAS:               "Customer Activated",
  CUSTOM:             "Manual Approval",
};

const INDUSTRY_EVENT_NAMES: Record<string, string> = {
  IT_CONSULTING:      "Closed Deal",
  RECRUITMENT:        "Placement",
  INSURANCE:          "Policy Sale",
  VEHICLE_DEALERSHIP: "Vehicle Delivered",
  PROPERTY_SALES:     "Property Transfer",
  RENTAL_MANAGEMENT:  "Lease Signed",
  TELECOM:            "Service Activation",
  SAAS:               "Subscription Activated",
  CUSTOM:             "Custom Commission Event",
};

const INDUSTRY_FIELD_PREVIEWS: Record<string, string[]> = {
  IT_CONSULTING:      ["Customer Name", "Opportunity Name", "Revenue", "Cost of Sale", "Deal Type", "Project Start Date"],
  RECRUITMENT:        ["Client Name", "Candidate Name", "Placement Type", "Start Date", "Placement Fee", "Guarantee Period"],
  INSURANCE:          ["Client Name", "Product Type", "Insurer Name", "Monthly Premium", "Commission Type", "Policy Start Date"],
  VEHICLE_DEALERSHIP: ["Customer Name", "Vehicle Make", "Vehicle Model", "Sale Price", "Cost Price", "Delivery Date"],
  PROPERTY_SALES:     ["Seller Name", "Buyer Name", "Property Address", "Sale Price", "Agency Commission %", "Sale Status"],
  RENTAL_MANAGEMENT:  ["Landlord Name", "Tenant Name", "Property Address", "Monthly Rental", "Lease Term", "Placement Fee Type"],
  TELECOM:            ["Customer Name", "Product Type", "Monthly Contract Value", "Contract Term", "Activation Status", "Activation Date"],
  SAAS:               ["Customer Name", "Product Name", "Subscription Type", "Monthly Recurring Revenue", "Contract Term", "Subscription Status"],
  CUSTOM:             ["Event Title", "Customer Name", "Commission Base Amount", "Commission %", "Event Date", "Notes"],
};

const STEP_DEFS = [
  { number: 1 as const, label: "Company",   Icon: Building2 },
  { number: 2 as const, label: "Industry",  Icon: Briefcase },
  { number: 3 as const, label: "Admin",     Icon: User },
  { number: 4 as const, label: "Confirm",   Icon: Check },
];

// ── Schemas ────────────────────────────────────────────────────────────────────

const companySchema = z.object({
  companyName:        z.string().min(2, "Company name must be at least 2 characters"),
  registrationNumber: z.string().optional(),
  vatNumber:          z.string().optional(),
  industry:           z.string().min(1, "Please select an industry"),
  companySize:        z.string().min(1, "Please select company size"),
  contactName:        z.string().min(2, "Contact person name is required"),
  contactEmail:       z.string().email("Invalid contact email"),
  contactPhone:       z.string().optional(),
});

const adminSchema = z.object({
  firstName:       z.string().min(2, "First name is required"),
  lastName:        z.string().min(2, "Last name is required"),
  email:           z.string().email("Invalid email address"),
  password:        z.string()
    .min(8,    "Minimum 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type CompanyValues = z.infer<typeof companySchema>;
type AdminValues   = z.infer<typeof adminSchema>;

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center mb-8">
      {STEP_DEFS.map((s, i) => (
        <div key={s.number} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
              current === s.number
                ? "border-primary bg-primary text-white shadow-md shadow-primary/30"
                : current > s.number
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-border bg-card text-muted-foreground",
            )}>
              {current > s.number ? <Check className="h-4 w-4" /> : s.number}
            </div>
            <span className={cn(
              "text-[10px] font-medium tracking-wide hidden sm:block",
              current === s.number ? "text-primary" : current > s.number ? "text-green-500" : "text-muted-foreground",
            )}>
              {s.label}
            </span>
          </div>
          {i < STEP_DEFS.length - 1 && (
            <div className={cn(
              "h-0.5 flex-1 mx-2 rounded transition-colors",
              current > s.number ? "bg-green-500" : "bg-border",
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

function ApprovalFlowPreview() {
  const steps = ["Manager", "Finance", "Director"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-foreground">
            {label}
          </div>
          {i < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function IndustryPreview({ industryCode }: { industryCode: string }) {
  const config      = getIndustryConfig(industryCode);
  const eventName   = INDUSTRY_EVENT_NAMES[industryCode] ?? config.eventLabel;
  const trigger     = INDUSTRY_TRIGGERS[industryCode]    ?? config.triggerLabel;
  const fields      = INDUSTRY_FIELD_PREVIEWS[industryCode] ?? [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            {config.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Here's how Incentiq will be configured for your industry. You can customise everything after registration.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-background rounded-lg border border-border p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1">
            <Zap className="h-3 w-3" /> Commission Event
          </p>
          <p className="text-sm font-semibold text-foreground">{eventName}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">What a transaction is called</p>
        </div>
        <div className="bg-background rounded-lg border border-border p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1">
            <Layers className="h-3 w-3" /> Deal Entity
          </p>
          <p className="text-sm font-semibold text-foreground">{config.eventLabel}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Menu item label</p>
        </div>
      </div>

      <div className="bg-background rounded-lg border border-border p-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1">
          <Zap className="h-3 w-3" /> Commission Trigger
        </p>
        <p className="text-sm text-foreground font-medium">{trigger}</p>
      </div>

      {fields.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
            <Layers className="h-3 w-3" /> Typical Fields Captured
          </p>
          <div className="flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <span key={f} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground border border-border">
                {f}
              </span>
            ))}
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-muted-foreground">
              + more…
            </span>
          </div>
        </div>
      )}

      <div className="bg-background rounded-lg border border-border p-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
          Commission Method
        </p>
        <p className="text-sm text-foreground font-medium">{config.commissionMethodLabel}</p>
      </div>

      <div className="bg-background rounded-lg border border-border p-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
          <GitBranch className="h-3 w-3" /> Default Approval Workflow
        </p>
        <ApprovalFlowPreview />
        <p className="text-[11px] text-muted-foreground mt-2">3-step workflow · fully customisable after registration</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Register() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [companyData, setCompanyData] = useState<CompanyValues | null>(null);
  const [adminData, setAdminData]     = useState<AdminValues | null>(null);

  const [, setLocation] = useLocation();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();
  const registerMutation = useRegister();

  const companyForm = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      companyName: "", registrationNumber: "", vatNumber: "",
      industry: "", companySize: "", contactName: "", contactEmail: "", contactPhone: "",
    },
  });

  const adminForm = useForm<AdminValues>({
    resolver: zodResolver(adminSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", confirmPassword: "" },
  });

  const watchedIndustry = companyForm.watch("industry");
  const selectedIndustry = companyData?.industry ?? watchedIndustry;

  const handleStep1 = companyForm.handleSubmit((values) => {
    setCompanyData(values);
    setStep(2);
  });

  const handleStep3 = adminForm.handleSubmit((values) => {
    setAdminData(values);
    setStep(4);
  });

  const handleFinalSubmit = () => {
    if (!companyData || !adminData) return;
    const payload = {
      companyName:        companyData.companyName,
      registrationNumber: companyData.registrationNumber || undefined,
      vatNumber:          companyData.vatNumber || undefined,
      industry:           companyData.industry,
      contactName:        companyData.contactName,
      contactEmail:       companyData.contactEmail,
      contactPhone:       companyData.contactPhone || undefined,
      firstName:          adminData.firstName,
      lastName:           adminData.lastName,
      email:              adminData.email,
      password:           adminData.password,
    };
    registerMutation.mutate({ data: payload as any }, {
      onSuccess: (res) => {
        localStorage.setItem("incentiq_token", res.token);
        queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Account created!", description: `Welcome to Incentiq, ${adminData.firstName}!` });
        setLocation("/onboarding");
      },
      onError: (err: any) => {
        toast({
          title: "Registration failed",
          description: err?.response?.data?.error || err?.message || "An error occurred",
          variant: "destructive",
        });
      },
    });
  };

  const industryLabel = INDUSTRY_OPTIONS.find(o => o.id === selectedIndustry)?.label ?? selectedIndustry;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 py-12">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="bg-sidebar-primary p-2 rounded-lg">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold text-foreground">Incentiq</span>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Card */}
        <div className="bg-card border border-border rounded-xl shadow-lg p-8 space-y-6">

          {/* ── Step 1: Company Details ───────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <h1 className="text-xl font-bold text-foreground">Tell us about your company</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  This sets up your company workspace on Incentiq.
                </p>
              </div>
              <Form {...companyForm}>
                <form onSubmit={handleStep1} className="space-y-4">
                  <FormField
                    control={companyForm.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp (Pty) Ltd" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={companyForm.control}
                      name="registrationNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registration No.</FormLabel>
                          <FormControl>
                            <Input placeholder="2021/123456/07" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={companyForm.control}
                      name="vatNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>VAT Number</FormLabel>
                          <FormControl>
                            <Input placeholder="4710123456" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={companyForm.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Industry <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select industry" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INDUSTRY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={companyForm.control}
                      name="companySize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Size <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Headcount" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {COMPANY_SIZES.map((s) => (
                                <SelectItem key={s} value={s}>{s} employees</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      Primary Contact
                    </p>
                    <div className="space-y-3">
                      <FormField
                        control={companyForm.control}
                        name="contactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Person <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input placeholder="Jane Smith" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={companyForm.control}
                          name="contactEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Email <span className="text-destructive">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="jane@company.co.za" autoComplete="email" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={companyForm.control}
                          name="contactPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Number</FormLabel>
                              <FormControl>
                                <Input placeholder="+27 11 555 0100" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full mt-2">
                    Next — Industry Preview <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </form>
              </Form>
            </>
          )}

          {/* ── Step 2: Industry Preview ──────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Configured for {industryLabel}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Here's how your platform will work out of the box.
                </p>
              </div>

              <IndustryPreview industryCode={selectedIndustry} />

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => setStep(3)}
                >
                  Set up admin <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {/* ── Step 3: Admin User ────────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div>
                <h1 className="text-xl font-bold text-foreground">Set up your admin account</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  This account will have full Company Admin access to Incentiq.
                </p>
              </div>
              <Form {...adminForm}>
                <form onSubmit={handleStep3} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={adminForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Jane" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={adminForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Smith" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={adminForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Email <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="jane@company.co.za" autoComplete="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={adminForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" placeholder="Min 8 chars, 1 uppercase, 1 number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={adminForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" placeholder="Repeat password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setStep(2)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                    <Button type="submit" className="flex-1">
                      Review & Confirm <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </form>
              </Form>
            </>
          )}

          {/* ── Step 4: Confirm & Create ──────────────────────────────────────── */}
          {step === 4 && companyData && adminData && (
            <>
              <div>
                <h1 className="text-xl font-bold text-foreground">Review your details</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Everything look right? Hit create to launch your workspace.
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-background rounded-lg border border-border p-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                    Company
                  </p>
                  <SummaryRow label="Name"           value={companyData.companyName} />
                  <SummaryRow label="Industry"       value={industryLabel} />
                  <SummaryRow label="Size"           value={`${companyData.companySize} employees`} />
                  {companyData.registrationNumber && (
                    <SummaryRow label="Reg. No."     value={companyData.registrationNumber} />
                  )}
                  {companyData.vatNumber && (
                    <SummaryRow label="VAT No."      value={companyData.vatNumber} />
                  )}
                </div>

                <div className="bg-background rounded-lg border border-border p-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                    Contact
                  </p>
                  <SummaryRow label="Name"   value={companyData.contactName} />
                  <SummaryRow label="Email"  value={companyData.contactEmail} />
                  {companyData.contactPhone && (
                    <SummaryRow label="Phone" value={companyData.contactPhone} />
                  )}
                </div>

                <div className="bg-background rounded-lg border border-border p-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                    Admin Account
                  </p>
                  <SummaryRow label="Name"  value={`${adminData.firstName} ${adminData.lastName}`} />
                  <SummaryRow label="Email" value={adminData.email} />
                  <SummaryRow label="Role"  value="Company Admin" />
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest">
                    What happens next
                  </p>
                  {[
                    `Workspace created for ${companyData.companyName}`,
                    `Platform configured for ${industryLabel}`,
                    "Default 3-step approval workflow activated",
                    "Admin account ready to log in",
                    "Invite your team and configure commission rules",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(3)}
                  disabled={registerMutation.isPending}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={handleFinalSubmit}
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Creating workspace…" : "Create Account"}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Sign in link */}
        <div className="text-center text-sm mt-6">
          <span className="text-muted-foreground">Already have an account? </span>
          <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

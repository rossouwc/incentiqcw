import { useGetTenant } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Globe, Mail, Phone, Save } from "lucide-react";

export default function CompanySettings() {
  const { data: tenant, isLoading } = useGetTenant();

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
                      <Input defaultValue={(tenant as any)?.name ?? ""} placeholder="Your company name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Company Slug</Label>
                      <Input defaultValue={(tenant as any)?.slug ?? ""} placeholder="company-slug" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" defaultValue={(tenant as any)?.website ?? ""} placeholder="https://yourcompany.co.za" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" defaultValue={(tenant as any)?.contactEmail ?? ""} placeholder="admin@company.co.za" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" defaultValue={(tenant as any)?.phone ?? ""} placeholder="+27 11 000 0000" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button className="gap-2"><Save className="h-4 w-4" /> Save Changes</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Commission Defaults</CardTitle>
              <CardDescription>Default settings applied to new commission calculations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input defaultValue="ZAR (R)" readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Commission Basis</Label>
                  <Input defaultValue="Gross Profit" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Frequency</Label>
                  <Input defaultValue="Monthly" />
                </div>
                <div className="space-y-2">
                  <Label>Deferred Period (months)</Label>
                  <Input type="number" defaultValue="3" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="gap-2"><Save className="h-4 w-4" /> Save</Button>
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

          <Card className="shadow-sm border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">These actions are irreversible. Proceed with caution.</p>
              <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10">
                Reset All Commission Data
              </Button>
              <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10">
                Delete Company Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, FileText, AlertCircle, CheckCircle2 } from "lucide-react";

export default function TaxProfile() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Tax Profile</h1>
        <p className="text-muted-foreground">Your tax details used for payslip generation and SARS reporting</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Tax profile saved successfully
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Personal Tax Information</CardTitle>
              <CardDescription>Required for IRP5 / IT3(a) generation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input defaultValue={user?.firstName ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input defaultValue={user?.lastName ?? ""} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ID Number / Passport</Label>
                  <Input placeholder="8001015009087" />
                </div>
                <div className="space-y-2">
                  <Label>Tax Reference Number (SARS)</Label>
                  <Input placeholder="e.g. 1234567890" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Residential Address</Label>
                <Input placeholder="123 Main Street, Sandton, Gauteng, 2196" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Status</Label>
                  <Input placeholder="e.g. PAYE, Provisional" />
                </div>
                <div className="space-y-2">
                  <Label>Income Tax Year End</Label>
                  <Input defaultValue="28 February" readOnly className="bg-muted" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="gap-2" onClick={handleSave}><Save className="h-4 w-4" /> Save Tax Profile</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Banking Details</CardTitle>
              <CardDescription>Bank account for commission payouts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input placeholder="e.g. FNB, ABSA, Standard Bank" />
                </div>
                <div className="space-y-2">
                  <Label>Branch Code</Label>
                  <Input placeholder="e.g. 250655" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input type="password" placeholder="••••••••••" />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Input placeholder="Current / Savings" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="gap-2" onClick={handleSave}><Save className="h-4 w-4" /> Save Banking Details</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50">
            <CardContent className="pt-5">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-800 dark:text-amber-400 text-sm">Important</div>
                  <p className="text-sm text-amber-700 dark:text-amber-400/80 mt-1">
                    Ensure your tax reference number is accurate. Incorrect details may delay your IRP5 and commission payouts.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Tax Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "IRP5 – 2025/2026",    status: "Available" },
                { name: "IRP5 – 2024/2025",    status: "Available" },
                { name: "Tax Certificate 2024", status: "Available" },
              ].map((doc) => (
                <div key={doc.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{doc.name}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-primary h-7">Download</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

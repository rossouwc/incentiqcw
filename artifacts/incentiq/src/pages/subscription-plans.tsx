import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Users, Zap, Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 490,
    description: "Perfect for small teams getting started with commission management.",
    icon: Users,
    color: "border-gray-200",
    badge: null,
    limits: { users: 10, rules: 3, integrations: 1 },
    features: ["Up to 10 users", "3 commission rules", "Basic reporting", "Email support", "Wallet management"],
    tenants: 2,
  },
  {
    id: "growth",
    name: "Growth",
    price: 1800,
    description: "For growing sales teams that need advanced workflows.",
    icon: Zap,
    color: "border-primary",
    badge: "Most Popular",
    limits: { users: 50, rules: 20, integrations: 5 },
    features: ["Up to 50 users", "20 commission rules", "Advanced reporting", "Priority support", "Approval workflows", "Payroll export", "Audit logs"],
    tenants: 3,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 4500,
    description: "Unlimited scale for large enterprise sales organisations.",
    icon: Building2,
    color: "border-purple-300",
    badge: "Enterprise",
    limits: { users: -1, rules: -1, integrations: -1 },
    features: ["Unlimited users", "Unlimited rules", "Custom reporting", "Dedicated support", "Custom integrations", "SLA guarantee", "White-labelling", "SSO / SAML"],
    tenants: 2,
  },
];

export default function SubscriptionPlans() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Subscription Plans</h1>
          <p className="text-muted-foreground">Manage pricing tiers available to tenants</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" /> New Plan</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <Card key={plan.id} className={`shadow-sm relative border-2 ${plan.color} hover:shadow-md transition-all`}>
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-3">{plan.badge}</Badge>
              </div>
            )}
            <CardHeader className="pb-2 pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <plan.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">R{plan.price.toLocaleString()}</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <CardDescription className="mt-2">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <span className="text-sm text-muted-foreground">{plan.tenants} active tenant{plan.tenants !== 1 ? "s" : ""}</span>
              </div>
              <hr className="border-border" />
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">Edit</Button>
                <Button size="sm" className="flex-1">Assign</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Plan Comparison</CardTitle>
          <CardDescription>Feature matrix across all subscription tiers</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left font-medium text-muted-foreground">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="px-6 py-4 text-center font-medium">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["Max Users", "Commission Rules", "Approval Workflows", "Payroll Export", "Audit Logs", "Custom Integrations", "Dedicated Support"].map((feature, i) => (
                  <tr key={feature} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-6 py-3.5 text-muted-foreground">{feature}</td>
                    <td className="px-6 py-3.5 text-center">{i === 0 ? "10" : i === 1 ? "3" : i <= 2 ? "—" : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-6 py-3.5 text-center">{i === 0 ? "50" : i === 1 ? "20" : <Check className="h-4 w-4 text-primary mx-auto" />}</td>
                    <td className="px-6 py-3.5 text-center">{i === 0 ? "Unlimited" : <Check className="h-4 w-4 text-primary mx-auto" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

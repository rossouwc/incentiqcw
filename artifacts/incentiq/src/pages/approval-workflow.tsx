import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRight, DollarSign, User, Briefcase, Clock } from "lucide-react";

const WORKFLOW_STAGES = [
  {
    step: 1,
    name: "Deal Submission",
    role: "Sales Executive",
    description: "Sales rep submits a deal with GP, deal type, and commission estimate.",
    icon: Briefcase,
    color: "bg-blue-100 text-blue-600 border-blue-200",
    sla: "Immediate",
  },
  {
    step: 2,
    name: "Manager Review",
    role: "Sales Manager",
    description: "Manager validates the deal data and approves or rejects with comments.",
    icon: User,
    color: "bg-amber-100 text-amber-600 border-amber-200",
    sla: "2 business days",
  },
  {
    step: 3,
    name: "Finance Validation",
    role: "Finance",
    description: "Finance team verifies GP numbers and recalculates commission amount.",
    icon: DollarSign,
    color: "bg-cyan-100 text-cyan-600 border-cyan-200",
    sla: "3 business days",
  },
  {
    step: 4,
    name: "Executive Sign-off",
    role: "Executive",
    description: "Final approval by executive before commission is credited to wallet.",
    icon: CheckCircle2,
    color: "bg-purple-100 text-purple-600 border-purple-200",
    sla: "1 business day",
  },
  {
    step: 5,
    name: "Wallet Credit",
    role: "System",
    description: "Commission is credited to the sales executive's wallet as PENDING_PAYOUT.",
    icon: DollarSign,
    color: "bg-green-100 text-green-600 border-green-200",
    sla: "Automatic",
  },
];

const RULES = [
  { label: "Auto-approve deals under",    value: "R 5,000 GP",      status: "enabled" },
  { label: "Manager escalation SLA",      value: "2 business days", status: "enabled" },
  { label: "Finance review threshold",    value: "R 50,000 GP",     status: "enabled" },
  { label: "Executive review threshold",  value: "R 150,000 GP",    status: "enabled" },
  { label: "Parallel finance + executive",value: "Disabled",        status: "disabled" },
];

export default function ApprovalWorkflow() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Approval Workflow</h1>
          <p className="text-muted-foreground">Configure the commission approval pipeline</p>
        </div>
        <Button>Save Changes</Button>
      </div>

      {/* Visual pipeline */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Approval Pipeline</CardTitle>
          <CardDescription>The sequential stages every deal passes through before commission is paid</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-0 md:gap-0 overflow-x-auto pb-2">
            {WORKFLOW_STAGES.map((stage, idx) => (
              <div key={stage.step} className="flex flex-col md:flex-row items-center gap-0">
                <div className="flex flex-col items-center">
                  <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center ${stage.color}`}>
                    <stage.icon className="h-7 w-7" />
                  </div>
                  <div className="mt-3 text-center max-w-[120px]">
                    <div className="text-sm font-semibold text-foreground">{stage.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{stage.role}</div>
                    <div className="flex items-center justify-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {stage.sla}
                    </div>
                  </div>
                </div>
                {idx < WORKFLOW_STAGES.length - 1 && (
                  <ArrowRight className="h-5 w-5 text-muted-foreground mx-3 md:mx-4 my-4 md:my-0 rotate-90 md:rotate-0 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stage descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {WORKFLOW_STAGES.map((stage) => (
          <Card key={stage.step} className="shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${stage.color}`}>
                  <stage.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">Step {stage.step}: {stage.name}</span>
                    <Badge variant="outline" className="text-xs">{stage.role}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{stage.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rules */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Workflow Rules</CardTitle>
          <CardDescription>Thresholds and automation settings</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {RULES.map((rule, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-6 py-4 text-foreground font-medium">{rule.label}</td>
                  <td className="px-6 py-4 text-muted-foreground">{rule.value}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rule.status === "enabled" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {rule.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

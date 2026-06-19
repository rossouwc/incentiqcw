import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/layout/Layout";
import { ThemeProvider } from "@/hooks/use-theme";
import Login from "@/pages/login";
import Register from "@/pages/register";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Deals from "@/pages/deals";
import Wallet from "@/pages/wallet";

import PlatformDashboard from "@/pages/platform-dashboard";
import Tenants from "@/pages/tenants";
import SubscriptionPlans from "@/pages/subscription-plans";
import PlatformUsers from "@/pages/platform-users";
import AuditLogs from "@/pages/audit-logs";

import Users from "@/pages/users";
import Customers from "@/pages/customers";
import CommissionRules from "@/pages/commission-rules";
import ApprovalWorkflow from "@/pages/approval-workflow";
import CompanySettings from "@/pages/company-settings";
import Reports from "@/pages/reports";

import Payouts from "@/pages/payouts";
import TaxProfile from "@/pages/tax-profile";
import TaxBrackets from "@/pages/tax-brackets";

import TeamDeals from "@/pages/team-deals";
import AllDeals from "@/pages/all-deals";
import Approvals from "@/pages/approvals";

import CommissionValidation from "@/pages/commission-validation";
import FinanceApprovals from "@/pages/finance-approvals";
import PayrollExport from "@/pages/payroll-export";

import FinalApprovals from "@/pages/final-approvals";

import ApprovedPayouts from "@/pages/approved-payouts";
import PayoutHistory from "@/pages/payout-history";
import OnboardingWizard from "@/pages/onboarding";
import IndustryConfig from "@/pages/industry-config";
import Clawbacks from "@/pages/clawbacks";
import ReportsClawbacks from "@/pages/reports-clawbacks";

const queryClient = new QueryClient();

function P({ component: Component }: { component: React.ComponentType }) {
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/onboarding" component={OnboardingWizard} />
      <Route path="/"><Redirect to="/dashboard" /></Route>

      {/* Shared / role-aware */}
      <Route path="/dashboard"><P component={Dashboard} /></Route>
      <Route path="/deals"><P component={Deals} /></Route>
      <Route path="/wallet"><P component={Wallet} /></Route>
      <Route path="/payouts"><P component={Payouts} /></Route>
      <Route path="/reports"><P component={Reports} /></Route>

      {/* Super Admin */}
      <Route path="/platform-dashboard"><P component={PlatformDashboard} /></Route>
      <Route path="/tenants"><P component={Tenants} /></Route>
      <Route path="/subscription-plans"><P component={SubscriptionPlans} /></Route>
      <Route path="/platform-users"><P component={PlatformUsers} /></Route>
      <Route path="/audit-logs"><P component={AuditLogs} /></Route>

      {/* Company Admin */}
      <Route path="/users"><P component={Users} /></Route>
      <Route path="/customers"><P component={Customers} /></Route>
      <Route path="/commission-rules"><P component={CommissionRules} /></Route>
      <Route path="/approval-workflow"><P component={ApprovalWorkflow} /></Route>
      <Route path="/company-settings"><P component={CompanySettings} /></Route>
      <Route path="/industry-config"><P component={IndustryConfig} /></Route>

      {/* Sales Executive */}
      <Route path="/tax-profile"><P component={TaxProfile} /></Route>
      <Route path="/tax-brackets"><P component={TaxBrackets} /></Route>

      {/* Admin */}
      <Route path="/all-deals"><P component={AllDeals} /></Route>

      {/* Manager */}
      <Route path="/team-deals"><P component={TeamDeals} /></Route>
      <Route path="/approvals"><P component={Approvals} /></Route>

      {/* Finance */}
      <Route path="/commission-validation"><P component={CommissionValidation} /></Route>
      <Route path="/finance-approvals"><P component={FinanceApprovals} /></Route>
      <Route path="/payroll-export"><P component={PayrollExport} /></Route>

      {/* Executive */}
      <Route path="/final-approvals"><P component={FinalApprovals} /></Route>

      {/* Payroll */}
      <Route path="/approved-payouts"><P component={ApprovedPayouts} /></Route>
      <Route path="/payout-history"><P component={PayoutHistory} /></Route>

      {/* Clawbacks — role-aware, accessible to all authenticated users */}
      <Route path="/clawbacks"><P component={Clawbacks} /></Route>
      <Route path="/reports-clawbacks"><P component={ReportsClawbacks} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ThemeProvider>
            <Router />
          </ThemeProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

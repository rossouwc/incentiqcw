import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/layout/Layout";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Deals from "@/pages/deals";
import Wallet from "@/pages/wallet";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: any }) {
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground mt-2">This page is under construction.</p>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>

      <Route path="/deals">
        <ProtectedRoute component={Deals} />
      </Route>

      <Route path="/wallet">
        <ProtectedRoute component={Wallet} />
      </Route>

      <Route path="/payouts">
        <ProtectedRoute component={() => <PlaceholderPage title="Payout Requests" />} />
      </Route>

      <Route path="/approvals/pending">
        <ProtectedRoute component={() => <PlaceholderPage title="Pending Approvals" />} />
      </Route>

      <Route path="/approvals/team-deals">
        <ProtectedRoute component={() => <PlaceholderPage title="Team Deals" />} />
      </Route>

      <Route path="/approvals/history">
        <ProtectedRoute component={() => <PlaceholderPage title="Approval History" />} />
      </Route>

      <Route path="/commission-rules">
        <ProtectedRoute component={() => <PlaceholderPage title="Commission Rules" />} />
      </Route>

      <Route path="/users">
        <ProtectedRoute component={() => <PlaceholderPage title="Users" />} />
      </Route>

      <Route path="/reports">
        <ProtectedRoute component={() => <PlaceholderPage title="Reports" />} />
      </Route>

      <Route path="/notifications">
        <ProtectedRoute component={() => <PlaceholderPage title="Notifications" />} />
      </Route>

      <Route path="/audit-logs">
        <ProtectedRoute component={() => <PlaceholderPage title="Audit Logs" />} />
      </Route>

      <Route path="/company-settings">
        <ProtectedRoute component={() => <PlaceholderPage title="Company Settings" />} />
      </Route>

      <Route path="/tax-profile">
        <ProtectedRoute component={() => <PlaceholderPage title="Tax Profile" />} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

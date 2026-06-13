import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import AdminDashboard from "./dashboard-admin";
import SalesDashboard from "./dashboard-sales";
import FinanceDashboard from "./dashboard-finance";
import ManagerDashboard from "./dashboard-manager";
import PlatformDashboard from "./platform-dashboard";

export default function Dashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  switch (user.role) {
    case "SUPER_ADMIN":     return <PlatformDashboard />;
    case "ADMIN":           return <AdminDashboard />;
    case "FINANCE":         return <FinanceDashboard />;
    case "MANAGER":         return <ManagerDashboard />;
    case "SALES_EXECUTIVE":
    default:                return <SalesDashboard />;
  }
}

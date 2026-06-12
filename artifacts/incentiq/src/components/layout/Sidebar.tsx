import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Briefcase, 
  Wallet, 
  CreditCard, 
  FileText, 
  BarChart, 
  CheckSquare, 
  Users, 
  History, 
  Settings, 
  Bell, 
  ShieldAlert, 
  HelpCircle,
  LogOut,
  Sliders
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const MAIN_NAV = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Deals", path: "/deals", icon: Briefcase },
  { name: "My Wallet", path: "/wallet", icon: Wallet },
  { name: "Payout Requests", path: "/payouts", icon: CreditCard },
  { name: "Tax Profile", path: "/tax-profile", icon: FileText },
  { name: "Reports", path: "/reports", icon: BarChart },
];

const APPROVALS_NAV = [
  { name: "Pending Approvals", path: "/approvals/pending", icon: CheckSquare },
  { name: "Team Deals", path: "/approvals/team-deals", icon: Users },
  { name: "Approval History", path: "/approvals/history", icon: History },
];

const MANAGEMENT_NAV = [
  { name: "Commission Rules", path: "/commission-rules", icon: Sliders },
  { name: "Users", path: "/users", icon: Users },
  { name: "Approval Workflow", path: "/company-settings", icon: CheckSquare },
  { name: "Company Settings", path: "/company-settings", icon: Settings },
];

const SUPPORT_NAV = [
  { name: "Notifications", path: "/notifications", icon: Bell },
  { name: "Audit Logs", path: "/audit-logs", icon: ShieldAlert },
  { name: "Help & Support", path: "#", icon: HelpCircle },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const renderNavItems = (items: typeof MAIN_NAV) => {
    return items.map((item) => {
      const isActive = location === item.path || (item.path !== "/dashboard" && location.startsWith(item.path) && item.path !== "#");
      return (
        <Link key={item.name} href={item.path}>
          <div
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
              isActive 
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" 
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60"}`} />
            <span className="text-sm">{item.name}</span>
          </div>
        </Link>
      );
    });
  };

  return (
    <div className="w-64 bg-sidebar flex flex-col h-full border-r border-sidebar-border shadow-sm shrink-0">
      <div className="p-4 flex items-center gap-2 border-b border-sidebar-border">
        <div className="bg-sidebar-primary p-1.5 rounded-md">
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <span className="text-sidebar-foreground font-bold text-lg tracking-tight">Incentiq</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
        <div>
          <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">MAIN</div>
          <div className="space-y-1">{renderNavItems(MAIN_NAV)}</div>
        </div>

        <div>
          <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">APPROVALS</div>
          <div className="space-y-1">{renderNavItems(APPROVALS_NAV)}</div>
        </div>

        {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
          <div>
            <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">MANAGEMENT</div>
            <div className="space-y-1">{renderNavItems(MANAGEMENT_NAV)}</div>
          </div>
        )}

        <div>
          <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">SUPPORT</div>
          <div className="space-y-1">{renderNavItems(SUPPORT_NAV)}</div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-sidebar-border">
            <AvatarImage src={user?.avatarUrl || undefined} />
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground truncate">{user?.firstName} {user?.lastName}</div>
            <div className="text-xs text-sidebar-foreground/60 truncate">{user?.role?.replace('_', ' ')}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

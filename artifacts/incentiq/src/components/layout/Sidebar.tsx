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
  Sliders,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  name: string;
  path: string;
  icon: React.ElementType;
  roles?: string[];
};

const ALL_ROLES = undefined; // visible to everyone

const MAIN_NAV: NavItem[] = [
  { name: "Dashboard",       path: "/dashboard",  icon: LayoutDashboard },
  { name: "Deals",           path: "/deals",       icon: Briefcase,       roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES_EXECUTIVE", "FINANCE", "EXECUTIVE"] },
  { name: "My Wallet",       path: "/wallet",      icon: Wallet,          roles: ["SALES_EXECUTIVE"] },
  { name: "Payout Requests", path: "/payouts",     icon: CreditCard,      roles: ["SALES_EXECUTIVE", "FINANCE", "PAYROLL", "ADMIN", "SUPER_ADMIN"] },
  { name: "Tax Profile",     path: "/tax-profile", icon: FileText,        roles: ["SALES_EXECUTIVE"] },
  { name: "Reports",         path: "/reports",     icon: BarChart,        roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE", "EXECUTIVE", "PAYROLL"] },
];

const APPROVALS_NAV: NavItem[] = [
  { name: "Pending Approvals", path: "/approvals/pending",    icon: CheckSquare, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"] },
  { name: "Team Deals",        path: "/approvals/team-deals", icon: Users,       roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { name: "Approval History",  path: "/approvals/history",    icon: History,     roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"] },
];

const MANAGEMENT_NAV: NavItem[] = [
  { name: "Commission Rules", path: "/commission-rules", icon: Sliders,   roles: ["SUPER_ADMIN", "ADMIN"] },
  { name: "Users",            path: "/users",            icon: Users,     roles: ["SUPER_ADMIN", "ADMIN"] },
  { name: "Company Settings", path: "/company-settings", icon: Settings,  roles: ["SUPER_ADMIN", "ADMIN"] },
  { name: "All Tenants",      path: "/tenants",          icon: Building2, roles: ["SUPER_ADMIN"] },
];

const SUPPORT_NAV: NavItem[] = [
  { name: "Notifications", path: "/notifications", icon: Bell },
  { name: "Audit Logs",    path: "/audit-logs",    icon: ShieldAlert, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { name: "Help & Support",path: "#",              icon: HelpCircle },
];

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN:    { label: "Super Admin",    color: "bg-purple-500/20 text-purple-400" },
  ADMIN:          { label: "Admin",          color: "bg-indigo-500/20 text-indigo-400" },
  MANAGER:        { label: "Manager",        color: "bg-blue-500/20 text-blue-400" },
  FINANCE:        { label: "Finance",        color: "bg-cyan-500/20 text-cyan-400" },
  SALES_EXECUTIVE:{ label: "Sales Exec",     color: "bg-green-500/20 text-green-400" },
  EXECUTIVE:      { label: "Executive",      color: "bg-amber-500/20 text-amber-400" },
  PAYROLL:        { label: "Payroll",        color: "bg-orange-500/20 text-orange-400" },
};

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const role = user?.role ?? "";

  const isVisible = (item: NavItem) => !item.roles || item.roles.includes(role);
  const hasVisibleItems = (items: NavItem[]) => items.some(isVisible);

  const renderNavItems = (items: NavItem[]) =>
    items.filter(isVisible).map((item) => {
      const isActive = location === item.path ||
        (item.path !== "/" && item.path !== "#" && location.startsWith(item.path));
      return (
        <Link key={item.name} href={item.path}>
          <div className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer text-sm ${
            isActive
              ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}>
            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60"}`} />
            <span>{item.name}</span>
          </div>
        </Link>
      );
    });

  const roleInfo = ROLE_LABELS[role] ?? { label: role, color: "bg-muted text-muted-foreground" };

  return (
    <div className="w-64 bg-sidebar flex flex-col h-full border-r border-sidebar-border shadow-sm shrink-0">
      <div className="p-4 flex items-center gap-2.5 border-b border-sidebar-border">
        <div className="bg-sidebar-primary p-1.5 rounded-md">
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <span className="text-sidebar-foreground font-bold text-lg tracking-tight">Incentiq</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        <div>
          <div className="px-3 mb-1.5 text-xs font-semibold text-sidebar-foreground/40 tracking-wider uppercase">Main</div>
          <div className="space-y-0.5">{renderNavItems(MAIN_NAV)}</div>
        </div>

        {hasVisibleItems(APPROVALS_NAV) && (
          <div>
            <div className="px-3 mb-1.5 text-xs font-semibold text-sidebar-foreground/40 tracking-wider uppercase">Approvals</div>
            <div className="space-y-0.5">{renderNavItems(APPROVALS_NAV)}</div>
          </div>
        )}

        {hasVisibleItems(MANAGEMENT_NAV) && (
          <div>
            <div className="px-3 mb-1.5 text-xs font-semibold text-sidebar-foreground/40 tracking-wider uppercase">Management</div>
            <div className="space-y-0.5">{renderNavItems(MANAGEMENT_NAV)}</div>
          </div>
        )}

        <div>
          <div className="px-3 mb-1.5 text-xs font-semibold text-sidebar-foreground/40 tracking-wider uppercase">Support</div>
          <div className="space-y-0.5">{renderNavItems(SUPPORT_NAV)}</div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
            <AvatarFallback className="bg-sidebar-primary/20 text-sidebar-primary text-sm font-semibold">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.firstName} {user?.lastName}
            </div>
            <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${roleInfo.color}`}>
              {roleInfo.label}
            </span>
          </div>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
            onClick={logout}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

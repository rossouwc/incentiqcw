import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetTenant } from "@workspace/api-client-react";
import { getIndustryConfig } from "@/lib/industry-config";
import {
  LayoutDashboard, Briefcase, Wallet, CreditCard, FileText, BarChart,
  CheckSquare, Users, Settings, ShieldAlert, LogOut, Sliders, Building2,
  ClipboardCheck, DollarSign, Package, Receipt, CreditCard as PayCard,
  History, ListChecks, BadgeCheck, Star, UserCog, Percent, Factory,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = { name: string; path: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

function getNavGroups(role: string, dealsLabel = "My Deals", teamDealsLabel = "Team Deals", allDealsLabel = "All Deals"): NavGroup[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [
        {
          label: "Platform",
          items: [
            { name: "Platform Dashboard", path: "/platform-dashboard", icon: LayoutDashboard },
            { name: "Tenants",            path: "/tenants",            icon: Building2 },
            { name: "Subscription Plans", path: "/subscription-plans", icon: Package },
            { name: "Platform Users",     path: "/platform-users",     icon: Users },
            { name: "Audit Logs",         path: "/audit-logs",         icon: ShieldAlert },
          ],
        },
      ];

    case "ADMIN":
      return [
        {
          label: "Company",
          items: [
            { name: "Dashboard",           path: "/dashboard",        icon: LayoutDashboard },
            { name: allDealsLabel,         path: "/all-deals",        icon: Briefcase },
            { name: "Users",               path: "/users",            icon: Users },
            { name: "Customers",           path: "/customers",        icon: Building2 },
            { name: "Commission Rules",    path: "/commission-rules", icon: Sliders },
            { name: "Industry Config",     path: "/industry-config",  icon: Factory },
            { name: "Company Settings",    path: "/company-settings", icon: Settings },
            { name: "Reports",             path: "/reports",          icon: BarChart },
            { name: "PAYE Tax Brackets",   path: "/tax-brackets",     icon: Percent },
          ],
        },
      ];

    case "SALES_EXECUTIVE":
      return [
        {
          label: "My Work",
          items: [
            { name: "My Dashboard",       path: "/dashboard", icon: LayoutDashboard },
            { name: dealsLabel,           path: "/deals",     icon: Briefcase },
            { name: "My Commission Wallet", path: "/wallet",  icon: Wallet },
            { name: "Payout Requests",    path: "/payouts",   icon: CreditCard },
            { name: "Tax Profile",        path: "/tax-profile", icon: FileText },
          ],
        },
      ];

    case "MANAGER":
      return [
        {
          label: "Management",
          items: [
            { name: "Dashboard",         path: "/dashboard",        icon: LayoutDashboard },
            { name: teamDealsLabel,      path: "/team-deals",       icon: Users },
            { name: "Pending Approvals", path: "/approvals",        icon: CheckSquare },
            { name: "Reports",           path: "/reports",          icon: BarChart },
          ],
        },
      ];

    case "FINANCE":
      return [
        {
          label: "Finance",
          items: [
            { name: "Dashboard",                path: "/dashboard",            icon: LayoutDashboard },
            { name: "Commission Validation",    path: "/commission-validation",icon: ListChecks },
            { name: "Pending Finance Approvals",path: "/finance-approvals",    icon: ClipboardCheck },
            { name: "Payout Requests",          path: "/payouts",              icon: DollarSign },
            { name: "Payroll Export",           path: "/payroll-export",       icon: Receipt },
          ],
        },
      ];

    case "EXECUTIVE":
      return [
        {
          label: "Executive",
          items: [
            { name: "Dashboard",       path: "/dashboard",      icon: LayoutDashboard },
            { name: "Final Approvals", path: "/final-approvals",icon: BadgeCheck },
            { name: "Reports",         path: "/reports",        icon: BarChart },
          ],
        },
      ];

    case "PAYROLL":
      return [
        {
          label: "Payroll",
          items: [
            { name: "Dashboard",        path: "/dashboard",        icon: LayoutDashboard },
            { name: "Approved Payouts", path: "/approved-payouts", icon: PayCard },
            { name: "Payroll Export",   path: "/payroll-export",   icon: Receipt },
            { name: "Payout History",   path: "/payout-history",   icon: History },
          ],
        },
      ];

    default:
      return [
        {
          label: "Main",
          items: [{ name: "Dashboard", path: "/dashboard", icon: LayoutDashboard }],
        },
      ];
  }
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN:     { label: "Super Admin",    color: "bg-purple-500/20 text-purple-300" },
  ADMIN:           { label: "Admin",          color: "bg-indigo-500/20 text-indigo-300" },
  MANAGER:         { label: "Manager",        color: "bg-blue-500/20 text-blue-300" },
  FINANCE:         { label: "Finance",        color: "bg-cyan-500/20 text-cyan-300" },
  SALES_EXECUTIVE: { label: "Sales Exec",     color: "bg-green-500/20 text-green-300" },
  EXECUTIVE:       { label: "Executive",      color: "bg-amber-500/20 text-amber-300" },
  PAYROLL:         { label: "Payroll",        color: "bg-orange-500/20 text-orange-300" },
};

export function Sidebar() {
  const [location]        = useLocation();
  const { user, logout }  = useAuth();
  const role              = user?.role ?? "";
  const { data: tenant }  = useGetTenant();
  const industryCode      = (tenant as any)?.industry ?? "IT_CONSULTING";
  const indCfg            = getIndustryConfig(industryCode);

  const dealsLabel    = `My ${indCfg.eventLabelPlural}`;
  const teamLabel     = `Team ${indCfg.eventLabelPlural}`;
  const allLabel      = `All ${indCfg.eventLabelPlural}`;

  const groups    = getNavGroups(role, dealsLabel, teamLabel, allLabel);
  const roleInfo  = ROLE_LABELS[role] ?? { label: role, color: "bg-muted text-muted-foreground" };

  const isActive = (path: string) =>
    location === path || (path !== "/" && location.startsWith(path));

  return (
    <div className="w-64 bg-sidebar flex flex-col h-full border-r border-sidebar-border shadow-sm shrink-0">
      {/* Logo */}
      <div className="px-4 py-3 flex items-center border-b border-sidebar-border">
        <img src="/logo-icon.png" alt="Incentiq" className="h-9 w-auto" />
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-xs font-semibold text-sidebar-foreground/40 tracking-wider uppercase">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link key={item.path} href={item.path}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer text-sm ${
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}>
                      <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60"}`} />
                      <span>{item.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User footer */}
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

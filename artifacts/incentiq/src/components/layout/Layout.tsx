import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { Bell, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN:     { label: "Super Admin",    color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" },
  ADMIN:           { label: "Admin",          color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" },
  MANAGER:         { label: "Manager",        color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  FINANCE:         { label: "Finance",        color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300" },
  SALES_EXECUTIVE: { label: "Sales Executive",color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  EXECUTIVE:       { label: "Executive",      color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  PAYROLL:         { label: "Payroll",        color: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" },
};

function TopHeader() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const roleInfo = ROLE_LABELS[role] ?? { label: role, color: "bg-muted text-muted-foreground" };
  const companyName = "Incentiq";

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-6 gap-4 shrink-0">
      {/* Company name */}
      <div className="flex-1">
        <span className="font-semibold text-foreground text-sm">{companyName}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </Button>

        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 border border-border shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-medium text-foreground leading-tight">
              {user?.firstName} {user?.lastName}
            </span>
            <span className={`inline-block text-[10px] px-1.5 py-0 rounded font-medium leading-4 ${roleInfo.color}`}>
              {roleInfo.label}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopHeader />
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

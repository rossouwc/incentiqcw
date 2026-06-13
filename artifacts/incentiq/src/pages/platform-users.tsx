import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal, Shield, User } from "lucide-react";
import { formatDate } from "@/lib/format";

const USERS = [
  { id: "u1", name: "System Admin",    email: "superadmin@commissionwallet.co.za", role: "SUPER_ADMIN",     tenant: "Platform",      status: "ACTIVE",   createdAt: "2024-01-01T00:00:00Z" },
  { id: "u2", name: "Jane Admin",      email: "admin@techsales.co.za",             role: "ADMIN",           tenant: "TechSales ZA",  status: "ACTIVE",   createdAt: "2024-01-15T00:00:00Z" },
  { id: "u3", name: "Bob Manager",     email: "manager@techsales.co.za",           role: "MANAGER",         tenant: "TechSales ZA",  status: "ACTIVE",   createdAt: "2024-02-01T00:00:00Z" },
  { id: "u4", name: "Alice Sales",     email: "sales@demo.co.za",                  role: "SALES_EXECUTIVE", tenant: "Demo Corp",     status: "ACTIVE",   createdAt: "2024-03-10T00:00:00Z" },
  { id: "u5", name: "Frank Finance",   email: "finance@demo.co.za",                role: "FINANCE",         tenant: "Demo Corp",     status: "ACTIVE",   createdAt: "2024-03-10T00:00:00Z" },
  { id: "u6", name: "Eve Executive",   email: "executive@demo.co.za",              role: "EXECUTIVE",       tenant: "Demo Corp",     status: "ACTIVE",   createdAt: "2024-03-10T00:00:00Z" },
  { id: "u7", name: "Pat Payroll",     email: "payroll@demo.co.za",                role: "PAYROLL",         tenant: "Demo Corp",     status: "ACTIVE",   createdAt: "2024-03-10T00:00:00Z" },
  { id: "u8", name: "Mark Demo",       email: "manager@demo.co.za",                role: "MANAGER",         tenant: "Demo Corp",     status: "INACTIVE", createdAt: "2024-04-01T00:00:00Z" },
];

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:     "bg-purple-100 text-purple-800",
  ADMIN:           "bg-indigo-100 text-indigo-800",
  MANAGER:         "bg-blue-100 text-blue-800",
  FINANCE:         "bg-cyan-100 text-cyan-800",
  SALES_EXECUTIVE: "bg-green-100 text-green-800",
  EXECUTIVE:       "bg-amber-100 text-amber-800",
  PAYROLL:         "bg-orange-100 text-orange-800",
};

export default function PlatformUsers() {
  const [search, setSearch] = useState("");
  const filtered = USERS.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.tenant.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Platform Users</h1>
          <p className="text-muted-foreground">All users across every tenant</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add User</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users",    value: USERS.length,                                            accent: "border-l-primary" },
          { label: "Active",         value: USERS.filter(u => u.status === "ACTIVE").length,         accent: "border-l-emerald-500" },
          { label: "Super Admins",   value: USERS.filter(u => u.role === "SUPER_ADMIN").length,      accent: "border-l-purple-400" },
          { label: "Across Tenants", value: new Set(USERS.map(u => u.tenant)).size,                  accent: "border-l-blue-400" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{s.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">User</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Tenant</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            {u.name}
                            {u.role === "SUPER_ADMIN" && <Shield className="h-3.5 w-3.5 text-purple-500" />}
                          </div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                        {u.role.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{u.tenant}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(u.createdAt)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                    </td>
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

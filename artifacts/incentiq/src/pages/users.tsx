import { useState } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, MoreHorizontal, Shield } from "lucide-react";
import { formatDate } from "@/lib/format";

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:     "bg-purple-100 text-purple-800",
  ADMIN:           "bg-indigo-100 text-indigo-800",
  MANAGER:         "bg-blue-100 text-blue-800",
  FINANCE:         "bg-cyan-100 text-cyan-800",
  SALES_EXECUTIVE: "bg-green-100 text-green-800",
  EXECUTIVE:       "bg-amber-100 text-amber-800",
  PAYROLL:         "bg-orange-100 text-orange-800",
};

export default function Users() {
  const [search, setSearch] = useState("");
  const { data: usersData, isLoading } = useListUsers();
  const users = Array.isArray(usersData) ? usersData : (usersData as any)?.data ?? [];
  const filtered = users.filter((u: any) =>
    !search ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground">Manage your company's users and roles</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Invite User</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users",    value: users.length,                                                  accent: "border-l-primary" },
          { label: "Active",         value: users.filter((u: any) => u.isActive !== false).length,        accent: "border-l-emerald-500" },
          { label: "Sales Reps",     value: users.filter((u: any) => u.role === "SALES_EXECUTIVE").length,accent: "border-l-blue-400" },
          { label: "Managers",       value: users.filter((u: any) => u.role === "MANAGER").length,        accent: "border-l-amber-400" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{s.value}</div>}</CardContent>
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
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Joined</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No users found</td></tr>
                  ) : filtered.map((u: any) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                            {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{u.firstName} {u.lastName}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-800"}`}>
                          {u.role?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{u.createdAt ? formatDate(u.createdAt) : "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.isActive !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                          {u.isActive !== false ? "Active" : "Inactive"}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

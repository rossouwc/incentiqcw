import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Plus, Search, MoreHorizontal, Users, Calendar } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

const TENANTS = [
  { id: "t1", name: "TechSales ZA",   slug: "techsales-za",  plan: "Enterprise", users: 24, status: "ACTIVE",   mrr: 4500,  createdAt: "2024-01-15T00:00:00Z", email: "admin@techsales.co.za" },
  { id: "t2", name: "Demo Corp",       slug: "demo-corp",     plan: "Growth",     users: 12, status: "ACTIVE",   mrr: 1800,  createdAt: "2024-03-02T00:00:00Z", email: "admin@demo.co.za" },
  { id: "t3", name: "FinServ Group",   slug: "finserv",       plan: "Starter",    users: 5,  status: "ACTIVE",   mrr: 490,   createdAt: "2024-04-20T00:00:00Z", email: "admin@finserv.co.za" },
  { id: "t4", name: "SalesForce SA",   slug: "salesforce-sa", plan: "Growth",     users: 18, status: "ACTIVE",   mrr: 1800,  createdAt: "2024-05-10T00:00:00Z", email: "admin@sfsa.co.za" },
  { id: "t5", name: "CommPro Ltd",     slug: "commpro",       plan: "Enterprise", users: 31, status: "INACTIVE", mrr: 0,     createdAt: "2024-02-28T00:00:00Z", email: "admin@commpro.co.za" },
  { id: "t6", name: "Apex Solutions",  slug: "apex",          plan: "Starter",    users: 8,  status: "ACTIVE",   mrr: 490,   createdAt: "2024-06-01T00:00:00Z", email: "admin@apex.co.za" },
];

const PLAN_COLORS: Record<string, string> = {
  Enterprise: "bg-purple-100 text-purple-800",
  Growth:     "bg-blue-100 text-blue-800",
  Starter:    "bg-gray-100 text-gray-800",
};

export default function Tenants() {
  const [search, setSearch] = useState("");
  const filtered = TENANTS.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tenants</h1>
          <p className="text-muted-foreground">Manage all companies on the platform</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add Tenant
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Tenants</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{TENANTS.length}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{TENANTS.filter(t => t.status === "ACTIVE").length}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(TENANTS.reduce((s, t) => s + t.mrr, 0))}</div></CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Company</th>
                  <th className="px-6 py-4 font-medium">Plan</th>
                  <th className="px-6 py-4 font-medium text-right">Users</th>
                  <th className="px-6 py-4 font-medium text-right">MRR</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {t.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[t.plan]}`}>{t.plan}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />{t.users}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(t.mrr)}/mo</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(t.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${t.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {t.status}
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

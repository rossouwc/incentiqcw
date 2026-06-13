import { useListAuditLogs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { useState } from "react";
import { Search, ShieldAlert, User, FileText, Settings } from "lucide-react";

const ACTION_ICONS: Record<string, React.ElementType> = {
  USER_CREATED: User,
  USER_UPDATED: User,
  USER_DELETED: User,
  DEAL_CREATED: FileText,
  DEAL_UPDATED: FileText,
  DEAL_APPROVED: FileText,
  DEAL_REJECTED: FileText,
  SETTINGS_CHANGED: Settings,
};

const ACTION_COLORS: Record<string, string> = {
  USER_CREATED: "bg-green-100 text-green-600",
  USER_DELETED: "bg-red-100 text-red-600",
  DEAL_APPROVED: "bg-blue-100 text-blue-600",
  DEAL_REJECTED: "bg-red-100 text-red-600",
  SETTINGS_CHANGED: "bg-amber-100 text-amber-600",
};

export default function AuditLogs() {
  const [search, setSearch] = useState("");
  const { data: logs, isLoading } = useListAuditLogs({ limit: 50 });

  const filtered = logs?.filter((l: any) =>
    !search ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.actorEmail?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Audit Logs</h1>
          <p className="text-muted-foreground">Full audit trail of all platform events</p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search actions or users..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Action</th>
                    <th className="px-6 py-4 font-medium">Actor</th>
                    <th className="px-6 py-4 font-medium">Resource</th>
                    <th className="px-6 py-4 font-medium">Details</th>
                    <th className="px-6 py-4 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No audit logs found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((log: any) => {
                      const Icon = ACTION_ICONS[log.action] ?? ShieldAlert;
                      const color = ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-600";
                      return (
                        <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className={`p-1.5 rounded-md ${color}`}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <span className="font-medium text-foreground">{log.action?.replace(/_/g, " ")}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">{log.actorEmail ?? "—"}</td>
                          <td className="px-6 py-4 text-muted-foreground">{log.resourceType ?? "—"}</td>
                          <td className="px-6 py-4 text-muted-foreground text-xs max-w-xs truncate">{log.details ?? "—"}</td>
                          <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

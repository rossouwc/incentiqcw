import { useListDeals } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function StatusBadge({ status }: { status: string }) {
  let color = "bg-gray-100 text-gray-800";
  if (status === "EXECUTIVE_APPROVED" || status === "PAID") color = "bg-green-100 text-green-800";
  if (status === "FINANCE_APPROVED") color = "bg-blue-100 text-blue-800";
  if (status === "MANAGER_APPROVED") color = "bg-amber-100 text-amber-800";
  if (status === "PENDING_APPROVAL" || status === "PENDING") color = "bg-yellow-100 text-yellow-800";
  if (status === "REJECTED") color = "bg-red-100 text-red-800";

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function Deals() {
  const { data: dealsData, isLoading } = useListDeals();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Deals</h1>
          <p className="text-muted-foreground">Manage your submitted deals</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Deal
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="w-full h-64" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                  <tr>
                    <th className="px-6 py-4 font-medium">Deal Name</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium text-right">Gross Profit</th>
                    <th className="px-6 py-4 font-medium text-right">Commission</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {dealsData?.data.map((deal) => (
                    <tr key={deal.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4 font-medium text-foreground">{deal.dealName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{deal.dealType.replace('_', ' ')}</td>
                      <td className="px-6 py-4 text-right">{formatCurrency(deal.grossProfit)}</td>
                      <td className="px-6 py-4 text-right font-medium text-primary">{formatCurrency(deal.commission)}</td>
                      <td className="px-6 py-4"><StatusBadge status={deal.status} /></td>
                      <td className="px-6 py-4 text-right text-muted-foreground">{formatDate(deal.createdAt)}</td>
                    </tr>
                  ))}
                  {!dealsData?.data.length && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No deals found. Create a new deal to get started.</td>
                    </tr>
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

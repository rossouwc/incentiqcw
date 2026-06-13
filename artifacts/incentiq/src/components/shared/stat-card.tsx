import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  loading?: boolean;
  valueColor?: string;
}

export function StatCard({ title, value, sub, icon: Icon, accent, loading, valueColor }: StatCardProps) {
  return (
    <Card className={`border-l-4 ${accent} shadow-sm hover:shadow-md transition-all`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-8 w-24 mb-1" />
            {sub !== undefined && <Skeleton className="h-3 w-32" />}
          </>
        ) : (
          <>
            <div className={`text-2xl font-bold ${valueColor ?? "text-foreground"}`}>{value}</div>
            {sub !== undefined && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

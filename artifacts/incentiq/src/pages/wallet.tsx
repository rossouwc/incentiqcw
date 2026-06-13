import { useGetWallet, useListTransactions } from "@workspace/api-client-react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, ArrowRightLeft } from "lucide-react";

export default function Wallet() {
  const { data: wallet, isLoading: isLoadingWallet } = useGetWallet();
  const { data: transactions, isLoading: isLoadingTransactions } = useListTransactions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Wallet</h1>
          <p className="text-muted-foreground">View your balance and transaction history</p>
        </div>
        <Button asChild>
          <a href="/payouts">Request Payout</a>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoadingWallet ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          <>
            <Card className="bg-primary text-primary-foreground border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-primary-foreground/80">Available Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{wallet ? formatCurrency(wallet.available) : '-'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{wallet ? formatCurrency(wallet.pending) : '-'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Deferred Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{wallet ? formatCurrency(wallet.deferred) : '-'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Paid YTD</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{wallet ? formatCurrency(wallet.paidYtd) : '-'}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingTransactions ? (
            <div className="p-6"><Skeleton className="w-full h-64" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium">Description</th>
                    <th className="px-6 py-4 font-medium text-right">Amount</th>
                    <th className="px-6 py-4 font-medium text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions?.map((tx) => (
                    <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-full ${
                            tx.transactionType === 'CREDIT' ? 'bg-green-100 text-green-600' :
                            tx.transactionType === 'DEBIT' ? 'bg-red-100 text-red-600' :
                            tx.transactionType === 'PAYOUT' ? 'bg-blue-100 text-blue-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {tx.transactionType === 'CREDIT' ? <ArrowDownRight className="w-4 h-4" /> :
                             tx.transactionType === 'DEBIT' || tx.transactionType === 'PAYOUT' ? <ArrowUpRight className="w-4 h-4" /> :
                             <ArrowRightLeft className="w-4 h-4" />}
                          </div>
                          <span className="font-medium text-foreground">{tx.transactionType}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{tx.description}</td>
                      <td className={`px-6 py-4 text-right font-medium ${tx.transactionType === 'CREDIT' ? 'text-green-600' : 'text-foreground'}`}>
                        {tx.transactionType === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground">{formatDateTime(tx.createdAt)}</td>
                    </tr>
                  ))}
                  {!transactions?.length && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">No transactions found</td>
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

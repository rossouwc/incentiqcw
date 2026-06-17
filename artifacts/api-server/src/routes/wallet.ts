import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const VIEWER_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"];

function walletToResponse(wallet: any, user?: any) {
  const ytdYear = new Date().getFullYear();
  return {
    id: wallet.id,
    userId: wallet.userId,
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    deferredBalance: wallet.deferredBalance,
    paidOutBalance: wallet.paidOutBalance,
    paidYtd: wallet.paidYtd ?? 0,
    updatedAt: wallet.updatedAt.toISOString(),
    user: user ? {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    } : undefined,
  };
}

function txToResponse(t: any) {
  return {
    id: t.id,
    walletId: t.walletId,
    transactionType: t.transactionType,
    amount: t.amount,
    referenceType: t.referenceType ?? null,
    referenceId: t.referenceId ?? null,
    description: t.description,
    createdAt: t.createdAt.toISOString(),
  };
}

async function getOrCreateWallet(userId: string, tenantId: string) {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { tenantId, userId } });
  }
  return wallet;
}

async function attachPaidYtd(wallet: any, tenantId: string) {
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const paidYtd = await prisma.walletTransaction.aggregate({
    where: {
      walletId: wallet.id,
      transactionType: { in: ["PAYOUT", "PAYOUT_PAID"] },
      createdAt: { gte: ytdStart },
    },
    _sum: { amount: true },
  });
  return { ...wallet, paidYtd: paidYtd._sum.amount ?? 0 };
}

// GET /api/wallet — own wallet
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = await getOrCreateWallet(req.user!.userId, req.user!.tenantId);
    const walletWithYtd = await attachPaidYtd(wallet, req.user!.tenantId);

    // Compute payout breakdown by status from PayoutRequest table
    const payoutBreakdown = await prisma.payoutRequest.groupBy({
      by: ["status"],
      where: { userId: req.user!.userId, tenantId: req.user!.tenantId, status: { in: ["PENDING", "FINANCE_APPROVED", "PAYROLL_APPROVED"] } },
      _sum: { requestedAmount: true },
    });
    const byStatus: Record<string, number> = {};
    for (const row of payoutBreakdown) {
      byStatus[row.status] = row._sum.requestedAmount ?? 0;
    }

    const response = {
      ...walletToResponse(walletWithYtd),
      pendingApprovalAmount: (byStatus["PENDING"] ?? 0) + (byStatus["FINANCE_APPROVED"] ?? 0),
      payrollApprovedAmount: byStatus["PAYROLL_APPROVED"] ?? 0,
    };
    res.json(response);
  } catch (err) {
    logger.error({ err }, "GetWallet error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/wallet/transactions — own transactions, paginated, optional type filter
router.get("/transactions", requireAuth, async (req: Request, res: Response) => {
  const { page = "1", limit = "30", type } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
    if (!wallet) { res.json({ data: [], total: 0, page: 1 }); return; }
    const where: any = { walletId: wallet.id, ...(type && type !== "ALL" && { transactionType: type }) };
    const [txns, total] = await Promise.all([
      prisma.walletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: parseInt(limit) }),
      prisma.walletTransaction.count({ where }),
    ]);
    res.json({ data: txns.map(txToResponse), total, page: parseInt(page) });
  } catch (err) {
    logger.error({ err }, "ListTransactions error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/wallet/deals — deals linked to current user's wallet
router.get("/deals", requireAuth, async (req: Request, res: Response) => {
  try {
    const deals = await prisma.deal.findMany({
      where: { salesExecutiveId: req.user!.userId, tenantId: req.user!.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(deals.map(d => ({
      id: d.id,
      dealName: d.dealName,
      customerName: d.customerName,
      dealType: d.dealType,
      status: d.status,
      calculatedCommission: d.calculatedCommission,
      grossProfit: d.grossProfit,
      submittedAt: d.submittedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "WalletDeals error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/wallet/users — list all wallets in tenant (manager/finance/executive/admin)
router.get("/users", requireAuth, async (req: Request, res: Response) => {
  if (!VIEWER_ROLES.includes(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" }); return;
  }
  try {
    const wallets = await prisma.wallet.findMany({
      where: { tenantId: req.user!.tenantId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } } },
      orderBy: { updatedAt: "desc" },
    });

    const ytdStart = new Date(new Date().getFullYear(), 0, 1);
    const ytdAgg = await prisma.walletTransaction.groupBy({
      by: ["walletId"],
      where: {
        tenantId: req.user!.tenantId,
        transactionType: { in: ["PAYOUT", "PAYOUT_PAID"] },
        createdAt: { gte: ytdStart },
      },
      _sum: { amount: true },
    });
    const ytdMap = Object.fromEntries(ytdAgg.map(r => [r.walletId, r._sum.amount ?? 0]));

    res.json(wallets.map(w => walletToResponse({ ...w, paidYtd: ytdMap[w.id] ?? 0 }, w.user)));
  } catch (err) {
    logger.error({ err }, "ListWallets error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/wallet/users/:userId — view a specific user's wallet
router.get("/users/:userId", requireAuth, async (req: Request, res: Response) => {
  const targetId = req.params.userId as string;
  const isSelf = targetId === req.user!.userId;
  if (!isSelf && !VIEWER_ROLES.includes(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" }); return;
  }
  try {
    const user = await prisma.user.findFirst({ where: { id: targetId, tenantId: req.user!.tenantId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const wallet = await getOrCreateWallet(targetId, req.user!.tenantId);
    const walletWithYtd = await attachPaidYtd(wallet, req.user!.tenantId);
    res.json(walletToResponse(walletWithYtd, user));
  } catch (err) {
    logger.error({ err }, "GetUserWallet error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/wallet/users/:userId/transactions
router.get("/users/:userId/transactions", requireAuth, async (req: Request, res: Response) => {
  const targetId = req.params.userId as string;
  const isSelf = targetId === req.user!.userId;
  if (!isSelf && !VIEWER_ROLES.includes(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" }); return;
  }
  const { page = "1", limit = "30", type } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: targetId } });
    if (!wallet) { res.json({ data: [], total: 0, page: 1 }); return; }
    const where: any = { walletId: wallet.id, ...(type && type !== "ALL" && { transactionType: type }) };
    const [txns, total] = await Promise.all([
      prisma.walletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: parseInt(limit) }),
      prisma.walletTransaction.count({ where }),
    ]);
    res.json({ data: txns.map(txToResponse), total, page: parseInt(page) });
  } catch (err) {
    logger.error({ err }, "ListUserTransactions error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as walletRouter };

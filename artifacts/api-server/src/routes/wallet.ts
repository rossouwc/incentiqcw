import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/wallet  — returns the authenticated user's wallet
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    // Auto-create wallet if missing (e.g. older accounts)
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { tenantId: req.user!.tenantId, userId },
      });
    }
    const ytdStart = new Date(new Date().getFullYear(), 0, 1);
    const paidYtd = await prisma.walletTransaction.aggregate({
      where: { walletId: wallet.id, transactionType: "PAYOUT", createdAt: { gte: ytdStart } },
      _sum: { amount: true },
    });
    res.json({
      id: wallet.id,
      userId: wallet.userId,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      deferredBalance: wallet.deferredBalance,
      paidOutBalance: wallet.paidOutBalance,
      paidYtd: paidYtd._sum.amount ?? 0,
      updatedAt: wallet.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "GetWallet error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/wallet/transactions
router.get("/transactions", requireAuth, async (req: Request, res: Response) => {
  const { page = "1", limit = "20", type } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
    if (!wallet) { res.json([]); return; }
    const where: any = { walletId: wallet.id, ...(type && { transactionType: type }) };
    const [txns, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.walletTransaction.count({ where }),
    ]);
    res.json(txns.map(t => ({
      id: t.id, walletId: t.walletId,
      transactionType: t.transactionType,
      type: t.transactionType,
      amount: t.amount,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "ListTransactions error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as walletRouter };

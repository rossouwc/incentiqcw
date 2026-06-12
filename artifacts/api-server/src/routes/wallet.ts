import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const [creditTxns, payoutTxns, pendingDeals, deferredDeals, paidDeals] = await Promise.all([
      prisma.transaction.aggregate({ where: { userId, tenantId, type: "CREDIT" }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { userId, tenantId, type: "PAYOUT" }, _sum: { amount: true } }),
      prisma.deal.aggregate({ where: { userId, tenantId, status: "PENDING_APPROVAL" }, _sum: { commission: true } }),
      prisma.deal.aggregate({ where: { userId, tenantId, status: "MANAGER_APPROVED" }, _sum: { commission: true } }),
      prisma.deal.aggregate({ where: { userId, tenantId, status: "EXECUTIVE_APPROVED" }, _sum: { commission: true } }),
    ]);

    const ytdStart = new Date(new Date().getFullYear(), 0, 1);
    const paidYtdTxns = await prisma.transaction.aggregate({
      where: { userId, tenantId, type: "PAYOUT", createdAt: { gte: ytdStart } },
      _sum: { amount: true },
    });

    const totalCredits = creditTxns._sum.amount ?? 0;
    const totalPayouts = payoutTxns._sum.amount ?? 0;
    const available = Math.max(0, totalCredits - totalPayouts);
    const pending = pendingDeals._sum.commission ?? 0;
    const deferred = deferredDeals._sum.commission ?? 0;
    const paidYtd = paidYtdTxns._sum.amount ?? 0;

    res.json({ userId, available, pending, deferred, paidYtd });
  } catch (err) {
    logger.error({ err }, "GetWallet error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/transactions", requireAuth, async (req: Request, res: Response) => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const txns = await prisma.transaction.findMany({
      where: { userId: req.user!.userId, tenantId: req.user!.tenantId },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    });
    res.json(txns.map(t => ({
      id: t.id, userId: t.userId, type: t.type, amount: t.amount,
      description: t.description, referenceId: t.referenceId,
      createdAt: t.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "ListTransactions error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as walletRouter };

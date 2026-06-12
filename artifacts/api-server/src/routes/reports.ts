import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/deals", requireAuth, async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const tenantId = req.user!.tenantId;
  const userId = req.user!.role === "SALES_EXECUTIVE" ? req.user!.userId : undefined;
  const where: any = { tenantId, ...(userId && { userId }) };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  try {
    const [total, gp, commission] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.aggregate({ where, _sum: { grossProfit: true } }),
      prisma.deal.aggregate({ where, _sum: { commission: true } }),
    ]);
    const types = ["NET_NEW", "RENEWAL", "UPSELL", "CROSS_SELL"] as const;
    const byType = await Promise.all(
      types.map(t => prisma.deal.aggregate({ where: { ...where, dealType: t }, _sum: { commission: true } })
        .then(r => ({ dealType: t, amount: r._sum.commission ?? 0, percentage: 0 })))
    );
    const totalComm = byType.reduce((s, r) => s + r.amount, 0);
    byType.forEach(r => { r.percentage = totalComm > 0 ? Math.round((r.amount / totalComm) * 100) : 0; });

    const statuses = ["SUBMITTED", "PENDING_APPROVAL", "MANAGER_APPROVED", "FINANCE_APPROVED", "EXECUTIVE_APPROVED", "REJECTED"] as const;
    const byStatus = await Promise.all(
      statuses.map(s => prisma.deal.count({ where: { ...where, status: s } }).then(c => ({ status: s, count: c })))
    );

    res.json({
      totalDeals: total,
      totalGrossProfit: gp._sum.grossProfit ?? 0,
      totalCommission: commission._sum.commission ?? 0,
      byType,
      byStatus,
    });
  } catch (err) {
    logger.error({ err }, "DealsReport error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as reportsRouter };

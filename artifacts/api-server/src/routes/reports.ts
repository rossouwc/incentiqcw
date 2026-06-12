import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/reports/deals
router.get("/deals", requireAuth, async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const tenantId = req.user!.tenantId;
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId,
    ...(isSalesExec && { salesExecutiveId: req.user!.userId }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  };
  try {
    const [total, gpAgg, commAgg, revenueAgg] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.aggregate({ where, _sum: { grossProfit: true }, _avg: { grossProfitPercentage: true } }),
      prisma.deal.aggregate({ where, _sum: { calculatedCommission: true } }),
      prisma.deal.aggregate({ where, _sum: { revenue: true } }),
    ]);

    const types = ["NET_NEW", "RENEWAL", "UPSELL", "CROSS_SELL"] as const;
    const byType = await Promise.all(
      types.map(t => prisma.deal.aggregate({ where: { ...where, dealType: t }, _sum: { calculatedCommission: true }, _count: true })
        .then(r => ({ dealType: t, amount: r._sum.calculatedCommission ?? 0, count: r._count, percentage: 0 })))
    );
    const totalComm = byType.reduce((s, r) => s + r.amount, 0);
    byType.forEach(r => { r.percentage = totalComm > 0 ? Math.round((r.amount / totalComm) * 100) : 0; });

    const statuses = ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "MANAGER_APPROVED", "FINANCE_APPROVED", "EXECUTIVE_APPROVED", "REJECTED", "CANCELLED"] as const;
    const byStatus = await Promise.all(
      statuses.map(s => prisma.deal.count({ where: { ...where, status: s } }).then(c => ({ status: s, count: c })))
    );

    res.json({
      totalDeals: total,
      totalRevenue: revenueAgg._sum.revenue ?? 0,
      totalGrossProfit: gpAgg._sum.grossProfit ?? 0,
      avgGrossProfitPercentage: Math.round((gpAgg._avg.grossProfitPercentage ?? 0) * 100) / 100,
      totalCommission: commAgg._sum.calculatedCommission ?? 0,
      byType,
      byStatus,
    });
  } catch (err) {
    logger.error({ err }, "DealsReport error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as reportsRouter };

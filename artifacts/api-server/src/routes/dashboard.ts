import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/summary", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const [credits, payouts, pending, deferred] = await Promise.all([
      prisma.transaction.aggregate({ where: { userId, tenantId, type: "CREDIT" }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { userId, tenantId, type: "PAYOUT" }, _sum: { amount: true } }),
      prisma.deal.aggregate({ where: { userId, tenantId, status: "PENDING_APPROVAL" }, _sum: { commission: true } }),
      prisma.deal.aggregate({ where: { userId, tenantId, status: "MANAGER_APPROVED" }, _sum: { commission: true } }),
    ]);
    const ytdStart = new Date(new Date().getFullYear(), 0, 1);
    const paidYtd = await prisma.transaction.aggregate({
      where: { userId, tenantId, type: "PAYOUT", createdAt: { gte: ytdStart } },
      _sum: { amount: true },
    });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const available = Math.max(0, (credits._sum.amount ?? 0) - (payouts._sum.amount ?? 0));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    res.json({
      available,
      pending: pending._sum.commission ?? 0,
      deferred: deferred._sum.commission ?? 0,
      paidYtd: paidYtd._sum.amount ?? 0,
      userName: user ? `${user.firstName} ${user.lastName}` : "",
      dateRange: `01 ${start.toLocaleString("en-ZA", { month: "short" })} ${start.getFullYear()} - ${end.getDate()} ${end.toLocaleString("en-ZA", { month: "short" })} ${end.getFullYear()}`,
    });
  } catch (err) {
    logger.error({ err }, "DashboardSummary error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/commission-trend", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const months: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const agg = await prisma.deal.aggregate({
        where: {
          userId, tenantId,
          status: { in: ["EXECUTIVE_APPROVED", "FINANCE_APPROVED", "MANAGER_APPROVED"] },
          createdAt: { gte: start, lte: end },
        },
        _sum: { commission: true },
      });
      months.push({
        month: start.toLocaleString("en-ZA", { month: "short", year: "2-digit" }),
        amount: agg._sum.commission ?? 0,
      });
    }
    res.json(months);
  } catch (err) {
    logger.error({ err }, "CommissionTrend error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/commission-by-type", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const types = ["NET_NEW", "RENEWAL", "UPSELL", "CROSS_SELL"] as const;
    const results = await Promise.all(
      types.map(t =>
        prisma.deal.aggregate({ where: { userId, tenantId, dealType: t }, _sum: { commission: true } })
          .then(r => ({ dealType: t, amount: r._sum.commission ?? 0 }))
      )
    );
    const total = results.reduce((s, r) => s + r.amount, 0);
    res.json(results.map(r => ({
      dealType: r.dealType,
      amount: r.amount,
      percentage: total > 0 ? Math.round((r.amount / total) * 100) : 0,
    })));
  } catch (err) {
    logger.error({ err }, "CommissionByType error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/payout-summary", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { taxRate: true } });
    const taxRate = tenant?.taxRate ?? 0.25;
    const [credits, payouts] = await Promise.all([
      prisma.transaction.aggregate({ where: { userId, tenantId, type: "CREDIT" }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { userId, tenantId, type: "PAYOUT" }, _sum: { amount: true } }),
    ]);
    const totalAvailable = Math.max(0, (credits._sum.amount ?? 0) - (payouts._sum.amount ?? 0));
    const estimatedTax = Math.round(totalAvailable * taxRate * 100) / 100;
    const estimatedNetPayout = totalAvailable - estimatedTax;
    const targetBalance = Math.max(totalAvailable, 65000);
    const payoutPercentage = Math.min(100, Math.round((totalAvailable / targetBalance) * 100));
    res.json({ totalAvailable, estimatedTax, estimatedNetPayout, payoutPercentage });
  } catch (err) {
    logger.error({ err }, "PayoutSummary error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/recent-activity", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const logs = await prisma.auditLog.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const now = new Date();
    res.json(logs.map(l => {
      const diffMs = now.getTime() - l.createdAt.getTime();
      const diffH = Math.floor(diffMs / 3600000);
      const diffD = Math.floor(diffMs / 86400000);
      const timeAgo = diffD > 0 ? `${diffD} day${diffD > 1 ? "s" : ""} ago` : diffH > 0 ? `${diffH} hour${diffH > 1 ? "s" : ""} ago` : "Just now";
      return {
        id: l.id,
        type: l.entity === "Deal" && l.action === "APPROVE" ? "DEAL_APPROVED"
          : l.entity === "Tenant" ? "DEAL_SUBMITTED"
          : "COMMISSION_MOVED",
        message: `${l.action} on ${l.entity} (${l.entityId.slice(0, 8)}...)`,
        timeAgo,
        createdAt: l.createdAt.toISOString(),
      };
    }));
  } catch (err) {
    logger.error({ err }, "RecentActivity error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/my-tasks", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const [pendingApprovals, payoutRequests, approvedForPayroll, infoRequired] = await Promise.all([
      prisma.approval.count({ where: { tenantId, status: "PENDING" } }),
      prisma.payoutRequest.count({ where: { userId, tenantId, status: "PENDING" } }),
      prisma.payoutRequest.count({ where: { userId, tenantId, status: "FINANCE_APPROVED" } }),
      prisma.deal.count({ where: { userId, tenantId, status: "REJECTED" } }),
    ]);
    res.json({ pendingApprovals, payoutRequests, approvedForPayroll, informationRequired: infoRequired });
  } catch (err) {
    logger.error({ err }, "MyTasks error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as dashboardRouter };

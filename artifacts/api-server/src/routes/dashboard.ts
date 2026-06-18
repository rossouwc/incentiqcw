import { Router, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/dashboard/summary
router.get("/summary", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { tenantId, userId },
    });
    const ytdStart = new Date(new Date().getFullYear(), 0, 1);
    const paidYtd = await prisma.walletTransaction.aggregate({
      where: { walletId: wallet.id, transactionType: "PAYOUT", createdAt: { gte: ytdStart } },
      _sum: { amount: true },
    });
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    res.json({
      available: wallet.availableBalance,
      pending: wallet.pendingBalance,
      deferred: wallet.deferredBalance,
      paidYtd: paidYtd._sum.amount ?? 0,
      userName: user ? `${user.firstName} ${user.lastName}` : "",
      dateRange: `01 ${start.toLocaleString("en-ZA", { month: "short" })} ${start.getFullYear()} – ${end.getDate()} ${end.toLocaleString("en-ZA", { month: "short" })} ${end.getFullYear()}`,
    });
  } catch (err) {
    logger.error({ err }, "DashboardSummary error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/commission-trend
router.get("/commission-trend", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";
  try {
    const months: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const agg = await prisma.commissionEvent.aggregate({
        where: {
          tenantId,
          ...(isSales && { salesExecutiveId: userId }),
          approvalStatus: { in: ["EXECUTIVE_APPROVED", "APPROVED"] },
          updatedAt: { gte: start, lte: end },
        },
        _sum: { calculatedCommissionAmount: true },
      });
      months.push({
        month: start.toLocaleString("en-ZA", { month: "short", year: "2-digit" }),
        amount: agg._sum.calculatedCommissionAmount ?? 0,
      });
    }
    res.json(months);
  } catch (err) {
    logger.error({ err }, "CommissionTrend error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/commission-by-type
router.get("/commission-by-type", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";
  try {
    const events = await prisma.commissionEvent.findMany({
      where: {
        tenantId,
        ...(isSales && { salesExecutiveId: userId }),
      },
      select: { eventType: true, calculatedCommissionAmount: true },
    });

    const byType: Record<string, number> = {};
    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] ?? 0) + e.calculatedCommissionAmount;
    }

    const total = Object.values(byType).reduce((s, n) => s + n, 0);
    const results = Object.entries(byType).map(([dealType, amount]) => ({
      dealType,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount);

    if (results.length === 0) {
      res.json([
        { dealType: "NET_NEW", amount: 0, percentage: 0 },
        { dealType: "RENEWAL", amount: 0, percentage: 0 },
        { dealType: "UPSELL", amount: 0, percentage: 0 },
        { dealType: "CROSS_SELL", amount: 0, percentage: 0 },
      ]);
      return;
    }
    res.json(results);
  } catch (err) {
    logger.error({ err }, "CommissionByType error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/payout-summary
router.get("/payout-summary", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const TAX_RATE = 0.25;
  try {
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { tenantId: req.user!.tenantId, userId },
    });
    const available = wallet.availableBalance;
    const estimatedTax = Math.round(available * TAX_RATE * 100) / 100;
    const estimatedNetPayout = available - estimatedTax;
    const targetBalance = Math.max(available, 65000);
    const payoutPercentage = Math.min(100, targetBalance > 0 ? Math.round((available / targetBalance) * 100) : 0);
    res.json({ totalAvailable: available, estimatedTax, estimatedNetPayout, payoutPercentage });
  } catch (err) {
    logger.error({ err }, "PayoutSummary error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/recent-activity
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
      const timeAgo = diffD > 0 ? `${diffD}d ago` : diffH > 0 ? `${diffH}h ago` : "Just now";
      return {
        id: l.id,
        type: l.entityType === "Deal" && l.action === "APPROVE" ? "DEAL_APPROVED"
          : l.action === "CREATE" ? "DEAL_SUBMITTED" : "COMMISSION_MOVED",
        message: `${l.action} on ${l.entityType}`,
        timeAgo,
        createdAt: l.createdAt.toISOString(),
      };
    }));
  } catch (err) {
    logger.error({ err }, "RecentActivity error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/my-tasks
router.get("/my-tasks", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  const role = req.user!.role;

  try {
    if (role === "PAYROLL") {
      const [pendingApprovals, approvedForPayroll] = await Promise.all([
        prisma.payoutRequest.count({ where: { tenantId, status: "PENDING" } }),
        prisma.payoutRequest.count({ where: { tenantId, status: "FINANCE_APPROVED" } }),
      ]);
      return res.json({ pendingApprovals, payoutRequests: 0, approvedForPayroll, informationRequired: 0 });
    }

    const roleToApproverRole: Record<string, UserRole> = {
      MANAGER: UserRole.MANAGER,
      FINANCE: UserRole.FINANCE,
      EXECUTIVE: UserRole.EXECUTIVE,
      ADMIN: UserRole.ADMIN,
      SUPER_ADMIN: UserRole.ADMIN,
    };
    const approverRole = roleToApproverRole[role];

    const [pendingApprovals, payoutRequests, approvedForPayroll, infoRequired] = await Promise.all([
      approverRole
        ? prisma.commissionEventApproval.count({
            where: {
              status: "PENDING",
              approverRole,
              commissionEvent: { tenantId },
            },
          })
        : Promise.resolve(0),
      prisma.payoutRequest.count({ where: { userId, tenantId, status: "PENDING" } }),
      prisma.payoutRequest.count({ where: { userId, tenantId, status: "FINANCE_APPROVED" } }),
      prisma.commissionEvent.count({
        where: { salesExecutiveId: userId, tenantId, approvalStatus: "REJECTED" },
      }),
    ]);
    return res.json({ pendingApprovals, payoutRequests, approvedForPayroll, informationRequired: infoRequired });
  } catch (err) {
    logger.error({ err }, "MyTasks error");
    return res.status(500).json({ error: "Server error" });
  }
});

export { router as dashboardRouter };

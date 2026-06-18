import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtZAR(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildDateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(from) }),
    ...(to   && { lte: new Date(to + "T23:59:59.999Z") }),
  };
}

function allowedRoles(req: Request, roles: string[]) {
  return roles.includes(req.user!.role);
}

// ─── 1. Commission by Month ───────────────────────────────────────────────────
router.get("/commission-by-month", requireAuth, async (req: Request, res: Response) => {
  const { from, to, userId, dealType, status } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";

  const where: any = {
    tenantId,
    ...(isSales && { salesExecutiveId: req.user!.userId }),
    ...(!isSales && userId && { salesExecutiveId: userId }),
    ...(dealType && dealType !== "ALL" && { eventType: dealType }),
    ...(status   && status  !== "ALL" && { approvalStatus: status }),
    ...((from || to) && { createdAt: buildDateFilter(from, to) }),
  };

  try {
    const events = await prisma.commissionEvent.findMany({
      where,
      select: { createdAt: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true, eventType: true },
      orderBy: { createdAt: "asc" },
    });

    const byMonth: Record<string, { month: string; deals: number; commission: number; grossProfit: number; revenue: number }> = {};
    for (const e of events) {
      const key = e.createdAt.toISOString().slice(0, 7);
      if (!byMonth[key]) byMonth[key] = { month: key, deals: 0, commission: 0, grossProfit: 0, revenue: 0 };
      byMonth[key].deals++;
      byMonth[key].commission += e.calculatedCommissionAmount;
      byMonth[key].grossProfit += e.grossProfitAmount ?? 0;
      byMonth[key].revenue += e.revenueAmount ?? 0;
    }

    const rows = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
    const totals = rows.reduce((s, r) => ({
      deals: s.deals + r.deals,
      commission: s.commission + r.commission,
      grossProfit: s.grossProfit + r.grossProfit,
      revenue: s.revenue + r.revenue,
    }), { deals: 0, commission: 0, grossProfit: 0, revenue: 0 });

    res.json({ rows, totals });
  } catch (err) {
    logger.error({ err }, "CommissionByMonth error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 2. Commission by Executive ───────────────────────────────────────────────
router.get("/commission-by-executive", requireAuth, async (req: Request, res: Response) => {
  const { from, to, userId, dealType, status } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";

  const where: any = {
    tenantId,
    ...(isSales && { salesExecutiveId: req.user!.userId }),
    ...(!isSales && userId && { salesExecutiveId: userId }),
    ...(dealType && dealType !== "ALL" && { eventType: dealType }),
    ...(status   && status  !== "ALL" && { approvalStatus: status }),
    ...((from || to) && { createdAt: buildDateFilter(from, to) }),
  };

  try {
    const events = await prisma.commissionEvent.findMany({
      where,
      select: {
        salesExecutiveId: true,
        calculatedCommissionAmount: true,
        grossProfitAmount: true,
        revenueAmount: true,
        salesExecutive: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const byExec: Record<string, { userId: string; name: string; email: string; deals: number; commission: number; grossProfit: number; revenue: number }> = {};
    for (const e of events) {
      const id = e.salesExecutiveId;
      if (!byExec[id]) byExec[id] = {
        userId: id,
        name: `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`,
        email: e.salesExecutive.email,
        deals: 0, commission: 0, grossProfit: 0, revenue: 0,
      };
      byExec[id].deals++;
      byExec[id].commission += e.calculatedCommissionAmount;
      byExec[id].grossProfit += e.grossProfitAmount ?? 0;
      byExec[id].revenue += e.revenueAmount ?? 0;
    }

    const rows = Object.values(byExec).sort((a, b) => b.commission - a.commission);
    const totals = rows.reduce((s, r) => ({
      deals: s.deals + r.deals,
      commission: s.commission + r.commission,
      grossProfit: s.grossProfit + r.grossProfit,
      revenue: s.revenue + r.revenue,
    }), { deals: 0, commission: 0, grossProfit: 0, revenue: 0 });

    res.json({ rows, totals });
  } catch (err) {
    logger.error({ err }, "CommissionByExecutive error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 3. Commission by Deal Type ───────────────────────────────────────────────
router.get("/commission-by-deal-type", requireAuth, async (req: Request, res: Response) => {
  const { from, to, userId, status } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";

  const where: any = {
    tenantId,
    ...(isSales && { salesExecutiveId: req.user!.userId }),
    ...(!isSales && userId && { salesExecutiveId: userId }),
    ...(status && status !== "ALL" && { approvalStatus: status }),
    ...((from || to) && { createdAt: buildDateFilter(from, to) }),
  };

  try {
    const events = await prisma.commissionEvent.findMany({
      where,
      select: { eventType: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true },
    });

    const byType: Record<string, { deals: number; commission: number; grossProfit: number; revenue: number }> = {};
    for (const e of events) {
      if (!byType[e.eventType]) byType[e.eventType] = { deals: 0, commission: 0, grossProfit: 0, revenue: 0 };
      byType[e.eventType].deals++;
      byType[e.eventType].commission += e.calculatedCommissionAmount;
      byType[e.eventType].grossProfit += e.grossProfitAmount ?? 0;
      byType[e.eventType].revenue += e.revenueAmount ?? 0;
    }

    const rows = Object.entries(byType).map(([dealType, r]) => ({ dealType, ...r }));
    const totalComm = rows.reduce((s, r) => s + r.commission, 0);
    const rowsWithPct = rows.map(r => ({ ...r, percentage: totalComm > 0 ? Math.round((r.commission / totalComm) * 100) : 0 }));
    const totals = rows.reduce((s, r) => ({
      deals: s.deals + r.deals, commission: s.commission + r.commission,
      grossProfit: s.grossProfit + r.grossProfit, revenue: s.revenue + r.revenue,
    }), { deals: 0, commission: 0, grossProfit: 0, revenue: 0 });

    res.json({ rows: rowsWithPct, totals });
  } catch (err) {
    logger.error({ err }, "CommissionByDealType error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 4. Pending Approvals ─────────────────────────────────────────────────────
router.get("/pending-approvals", requireAuth, async (req: Request, res: Response) => {
  const { from, to, userId, dealType } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;

  const where: any = {
    tenantId,
    approvalStatus: { in: ["PENDING_APPROVAL", "FINANCE_APPROVED", "EXECUTIVE_APPROVED"] },
    ...(userId   && { salesExecutiveId: userId }),
    ...(dealType && dealType !== "ALL" && { eventType: dealType }),
    ...((from || to) && { createdAt: buildDateFilter(from, to) }),
  };

  try {
    const events = await prisma.commissionEvent.findMany({
      where,
      include: {
        salesExecutive: { select: { firstName: true, lastName: true } },
        approvals: { orderBy: { approvalStep: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = events.map(e => ({
      id: e.id,
      dealName: e.eventTitle,
      customerName: (e.eventDataJson as any)?.customerName ?? (e.eventDataJson as any)?.clientName ?? "—",
      dealType: e.eventType,
      executiveName: `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`,
      revenue: e.revenueAmount ?? 0,
      commission: e.calculatedCommissionAmount,
      status: e.approvalStatus,
      submittedAt: e.submittedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      currentStep: e.approvals.find((a: any) => a.status === "PENDING")?.stepName ?? "—",
    }));

    res.json({ rows, total: rows.length, totalCommission: rows.reduce((s, r) => s + r.commission, 0) });
  } catch (err) {
    logger.error({ err }, "PendingApprovals error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 5. Payout Request Report ─────────────────────────────────────────────────
router.get("/payout-requests", requireAuth, async (req: Request, res: Response) => {
  const { from, to, userId, status } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";

  const where: any = {
    tenantId,
    ...(isSales && { userId: req.user!.userId }),
    ...(!isSales && userId && { userId }),
    ...(status && status !== "ALL" && { status }),
    ...((from || to) && { requestedAt: buildDateFilter(from, to) }),
  };

  try {
    const payouts = await prisma.payoutRequest.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { requestedAt: "desc" },
    });

    const rows = payouts.map(p => ({
      id: p.id,
      employeeName: `${p.user.firstName} ${p.user.lastName}`,
      email: p.user.email,
      payoutMonth: p.payoutMonth,
      requestedAmount: p.requestedAmount,
      status: p.status,
      requestedAt: p.requestedAt.toISOString(),
      approvedAt: p.approvedAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      comments: p.comments ?? "",
      reviewerComments: p.reviewerComments ?? "",
    }));

    const totals = {
      total: rows.length,
      totalAmount: rows.reduce((s, r) => s + r.requestedAmount, 0),
      paid: rows.filter(r => r.status === "PAID").length,
      pending: rows.filter(r => r.status === "PENDING").length,
    };

    res.json({ rows, totals });
  } catch (err) {
    logger.error({ err }, "PayoutRequests error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 6. Payroll Export Report ─────────────────────────────────────────────────
router.get("/payroll-export", requireAuth, async (req: Request, res: Response) => {
  const { from, to, userId, status } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;

  const statusFilter = status && status !== "ALL"
    ? [status]
    : ["FINANCE_APPROVED", "PAYROLL_APPROVED", "PAID"];

  const where: any = {
    tenantId,
    status: { in: statusFilter },
    ...(userId && { userId }),
    ...((from || to) && { requestedAt: buildDateFilter(from, to) }),
  };

  try {
    const payouts = await prisma.payoutRequest.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { requestedAt: "desc" },
    });

    const rows = payouts.map(p => ({
      id: p.id,
      employeeName: `${p.user.firstName} ${p.user.lastName}`,
      email: p.user.email,
      payoutMonth: p.payoutMonth,
      commissionAmount: p.requestedAmount,
      status: p.status,
      approvedAt: p.approvedAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
    }));

    const totals = {
      total: rows.length,
      totalAmount: rows.reduce((s, r) => s + r.commissionAmount, 0),
      uniqueEmployees: new Set(rows.map(r => r.email)).size,
    };

    res.json({ rows, totals });
  } catch (err) {
    logger.error({ err }, "PayrollExportReport error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 7. Wallet Balance Report ─────────────────────────────────────────────────
router.get("/wallet-balances", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";

  const where: any = {
    tenantId,
    ...(isSales && { userId: req.user!.userId }),
    ...(!isSales && userId && { userId }),
  };

  try {
    const wallets = await prisma.wallet.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true, role: true } } },
      orderBy: { paidOutBalance: "desc" },
    });

    const rows = wallets.map(w => ({
      userId: w.userId,
      name: `${w.user.firstName} ${w.user.lastName}`,
      email: w.user.email,
      role: w.user.role,
      availableBalance: w.availableBalance,
      pendingBalance: w.pendingBalance,
      deferredBalance: w.deferredBalance,
      paidOutBalance: w.paidOutBalance,
      totalEarned: w.availableBalance + w.pendingBalance + w.deferredBalance + w.paidOutBalance,
      updatedAt: w.updatedAt.toISOString(),
    }));

    const totals = rows.reduce((s, r) => ({
      availableBalance: s.availableBalance + r.availableBalance,
      pendingBalance: s.pendingBalance + r.pendingBalance,
      deferredBalance: s.deferredBalance + r.deferredBalance,
      paidOutBalance: s.paidOutBalance + r.paidOutBalance,
      totalEarned: s.totalEarned + r.totalEarned,
    }), { availableBalance: 0, pendingBalance: 0, deferredBalance: 0, paidOutBalance: 0, totalEarned: 0 });

    res.json({ rows, totals });
  } catch (err) {
    logger.error({ err }, "WalletBalances error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 8. Audit Trail ───────────────────────────────────────────────────────────
router.get("/audit-trail", requireAuth, async (req: Request, res: Response) => {
  const { from, to, userId } = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;

  const dateFilter = buildDateFilter(from, to);

  try {
    const [txns, auditLogs] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: {
          tenantId,
          ...(dateFilter && { createdAt: dateFilter }),
          ...(userId && { wallet: { userId } }),
        },
        include: { wallet: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.auditLog.findMany({
        where: {
          tenantId,
          ...(userId && { userId }),
          ...(dateFilter && { createdAt: dateFilter }),
        },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

    const walletRows = txns.map(t => ({
      id: t.id,
      type: "WALLET_TRANSACTION",
      category: t.transactionType,
      actor: `${t.wallet.user.firstName} ${t.wallet.user.lastName}`,
      email: t.wallet.user.email,
      description: t.description,
      amount: t.amount,
      referenceType: t.referenceType ?? "",
      referenceId: t.referenceId ?? "",
      createdAt: t.createdAt.toISOString(),
    }));

    const auditRows = auditLogs.map(a => ({
      id: a.id,
      type: "AUDIT_LOG",
      category: a.action,
      actor: `${a.user.firstName} ${a.user.lastName}`,
      email: "",
      description: `${a.entityType} ${a.entityId}`,
      amount: null,
      referenceType: a.entityType,
      referenceId: a.entityId,
      createdAt: a.createdAt.toISOString(),
    }));

    const rows = [...walletRows, ...auditRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "AuditTrail error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Legacy deals summary ─────────────────────────────────────────────────────
router.get("/deals", requireAuth, async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const tenantId = req.user!.tenantId;
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId,
    ...(isSalesExec && { salesExecutiveId: req.user!.userId }),
    ...((from || to) && { createdAt: buildDateFilter(from, to) }),
  };
  try {
    const [total, commAgg, revenueAgg, gpAgg] = await Promise.all([
      prisma.commissionEvent.count({ where }),
      prisma.commissionEvent.aggregate({ where, _sum: { calculatedCommissionAmount: true } }),
      prisma.commissionEvent.aggregate({ where, _sum: { revenueAmount: true } }),
      prisma.commissionEvent.aggregate({ where, _sum: { grossProfitAmount: true } }),
    ]);
    const events = await prisma.commissionEvent.findMany({ where, select: { eventType: true, calculatedCommissionAmount: true } });
    const byTypeMap: Record<string, { amount: number; count: number }> = {};
    for (const e of events) {
      if (!byTypeMap[e.eventType]) byTypeMap[e.eventType] = { amount: 0, count: 0 };
      byTypeMap[e.eventType].amount += e.calculatedCommissionAmount;
      byTypeMap[e.eventType].count++;
    }
    const totalComm = commAgg._sum.calculatedCommissionAmount ?? 0;
    const byType = Object.entries(byTypeMap).map(([dealType, v]) => ({
      dealType,
      amount: v.amount,
      count: v.count,
      percentage: totalComm > 0 ? Math.round((v.amount / totalComm) * 100) : 0,
    }));
    const approvalStatuses = ["DRAFT", "PENDING_APPROVAL", "FINANCE_APPROVED", "EXECUTIVE_APPROVED", "APPROVED", "REJECTED", "CHANGES_REQUESTED"] as const;
    const byStatus = await Promise.all(
      approvalStatuses.map(s => prisma.commissionEvent.count({ where: { ...where, approvalStatus: s } }).then(c => ({ status: s, count: c })))
    );
    res.json({
      totalDeals: total,
      totalRevenue: revenueAgg._sum.revenueAmount ?? 0,
      totalGrossProfit: gpAgg._sum.grossProfitAmount ?? 0,
      avgGrossProfitPercentage: 0,
      totalCommission: totalComm,
      byType, byStatus,
    });
  } catch (err) {
    logger.error({ err }, "DealsReport error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Clawback Reports (8 endpoints) ──────────────────────────────────────────

function clawbackWhere(tenantId: string, isSales: boolean, execId: string, q: Record<string, string | undefined>): any {
  return {
    tenantId,
    ...(isSales  && { salesExecutiveId: execId }),
    ...(!isSales && q.userId && q.userId !== "ALL" && { salesExecutiveId: q.userId }),
    ...(q.status         && q.status         !== "ALL" && { status:         q.status as any }),
    ...(q.recoveryStatus && q.recoveryStatus !== "ALL" && { recoveryStatus: q.recoveryStatus as any }),
    ...(q.reason         && q.reason         !== "ALL" && { reasonCategory: q.reason as any }),
    ...((q.from || q.to) && { createdAt: buildDateFilter(q.from, q.to) }),
  };
}

const cbInclude = {
  salesExecutive:  { select: { firstName: true, lastName: true, email: true } },
  commissionEvent: { select: { eventTitle: true } },
};

router.get("/clawback-summary", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  try {
    const rows = await prisma.commissionClawback.findMany({
      where:  clawbackWhere(tenantId, isSales, req.user!.userId, q),
      select: { status: true, clawbackAmount: true, recoveredAmount: true, outstandingAmount: true },
    });
    const byStatus: Record<string, { status: string; count: number; amount: number; recovered: number; outstanding: number }> = {};
    for (const c of rows) {
      if (!byStatus[c.status]) byStatus[c.status] = { status: c.status, count: 0, amount: 0, recovered: 0, outstanding: 0 };
      byStatus[c.status].count++;
      byStatus[c.status].amount      += Number(c.clawbackAmount);
      byStatus[c.status].recovered   += Number(c.recoveredAmount);
      byStatus[c.status].outstanding += Number(c.outstandingAmount);
    }
    const statusRows = Object.values(byStatus);
    const totals = statusRows.reduce((s, r) => ({ count: s.count + r.count, amount: s.amount + r.amount, recovered: s.recovered + r.recovered, outstanding: s.outstanding + r.outstanding }), { count: 0, amount: 0, recovered: 0, outstanding: 0 });
    res.json({ rows: statusRows, totals });
  } catch (err) { logger.error({ err }, "ClawbackSummary error"); res.status(500).json({ error: "Server error" }); }
});

router.get("/clawback-outstanding", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId,
    outstandingAmount: { gt: 0 },
    status: { in: ["APPROVED", "EXECUTED"] },
    ...(isSales  && { salesExecutiveId: req.user!.userId }),
    ...(!isSales && q.userId && q.userId !== "ALL" && { salesExecutiveId: q.userId }),
    ...(q.reason && q.reason !== "ALL" && { reasonCategory: q.reason }),
    ...((q.from || q.to) && { createdAt: buildDateFilter(q.from, q.to) }),
  };
  try {
    const items = await prisma.commissionClawback.findMany({ where, include: cbInclude, orderBy: { outstandingAmount: "desc" } });
    const rows = items.map(c => ({
      id: c.id,
      eventTitle:       (c.commissionEvent as any).eventTitle,
      executiveName:    `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`,
      executiveEmail:   c.salesExecutive.email,
      reasonCategory:   c.reasonCategory,
      clawbackType:     c.clawbackType,
      clawbackAmount:   Number(c.clawbackAmount),
      recoveredAmount:  Number(c.recoveredAmount),
      outstandingAmount: Number(c.outstandingAmount),
      recoveryStatus:   c.recoveryStatus ?? "PENDING",
      status:           c.status,
      executedAt:       c.executedAt?.toISOString().slice(0, 10) ?? null,
    }));
    const totals = rows.reduce((s, r) => ({ count: s.count + 1, clawbackAmount: s.clawbackAmount + r.clawbackAmount, recoveredAmount: s.recoveredAmount + r.recoveredAmount, outstandingAmount: s.outstandingAmount + r.outstandingAmount }), { count: 0, clawbackAmount: 0, recoveredAmount: 0, outstandingAmount: 0 });
    res.json({ rows, totals });
  } catch (err) { logger.error({ err }, "ClawbackOutstanding error"); res.status(500).json({ error: "Server error" }); }
});

router.get("/clawback-transactions", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId,
    referenceType: "CLAWBACK",
    ...((q.from || q.to) && { createdAt: buildDateFilter(q.from, q.to) }),
    ...(isSales  && { wallet: { userId: req.user!.userId } }),
    ...(!isSales && q.userId && q.userId !== "ALL" && { wallet: { userId: q.userId } }),
  };
  try {
    const txns = await prisma.walletTransaction.findMany({
      where,
      include: { wallet: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const rows = txns.map(t => ({
      id:              t.id,
      date:            t.createdAt.toISOString().slice(0, 10),
      transactionType: t.transactionType,
      executiveName:   `${t.wallet.user.firstName} ${t.wallet.user.lastName}`,
      executiveEmail:  t.wallet.user.email,
      description:     t.description,
      amount:          Number(t.amount),
      referenceId:     t.referenceId ?? "",
    }));
    const totals = { count: rows.length, totalAmount: rows.reduce((s, r) => s + r.amount, 0) };
    res.json({ rows, totals });
  } catch (err) { logger.error({ err }, "ClawbackTransactions error"); res.status(500).json({ error: "Server error" }); }
});

router.get("/clawback-by-executive", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  try {
    const items: any[] = await prisma.commissionClawback.findMany({
      where: clawbackWhere(tenantId, isSales, req.user!.userId, q),
      include: { salesExecutive: { select: { firstName: true, lastName: true, email: true } } },
    });
    const byExec: Record<string, any> = {};
    for (const c of items) {
      const id = c.salesExecutiveId;
      if (!byExec[id]) byExec[id] = { userId: id, name: `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`, email: c.salesExecutive.email, count: 0, amount: 0, recovered: 0, outstanding: 0, active: 0, waived: 0, disputed: 0 };
      byExec[id].count++;
      byExec[id].amount      += Number(c.clawbackAmount);
      byExec[id].recovered   += Number(c.recoveredAmount);
      byExec[id].outstanding += Number(c.outstandingAmount);
      if (["APPROVED","EXECUTED","PENDING_APPROVAL"].includes(c.status)) byExec[id].active++;
      if (c.status === "WAIVED")    byExec[id].waived++;
      if (c.status === "DISPUTED")  byExec[id].disputed++;
    }
    const rows = Object.values(byExec).sort((a, b) => b.amount - a.amount);
    const totals = rows.reduce((s: any, r: any) => ({ count: s.count + r.count, amount: s.amount + r.amount, recovered: s.recovered + r.recovered, outstanding: s.outstanding + r.outstanding }), { count: 0, amount: 0, recovered: 0, outstanding: 0 });
    res.json({ rows, totals });
  } catch (err) { logger.error({ err }, "ClawbackByExecutive error"); res.status(500).json({ error: "Server error" }); }
});

router.get("/clawback-by-industry", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { industry: true, companyName: true } });
    const items = await prisma.commissionClawback.findMany({
      where: clawbackWhere(tenantId, isSales, req.user!.userId, q),
      select: { clawbackType: true, clawbackAmount: true, recoveredAmount: true, outstandingAmount: true, status: true },
    });
    const byType: Record<string, any> = {};
    for (const c of items) {
      const t = c.clawbackType;
      if (!byType[t]) byType[t] = { clawbackType: t, count: 0, amount: 0, recovered: 0, outstanding: 0 };
      byType[t].count++;
      byType[t].amount      += Number(c.clawbackAmount);
      byType[t].recovered   += Number(c.recoveredAmount);
      byType[t].outstanding += Number(c.outstandingAmount);
    }
    const rows = Object.values(byType).sort((a, b) => b.amount - a.amount);
    const totalAmt = rows.reduce((s, r) => s + r.amount, 0);
    const rowsWithPct = rows.map(r => ({ ...r, percentage: totalAmt > 0 ? Math.round((r.amount / totalAmt) * 100) : 0 }));
    const totals = rows.reduce((s: any, r: any) => ({ count: s.count + r.count, amount: s.amount + r.amount, recovered: s.recovered + r.recovered, outstanding: s.outstanding + r.outstanding }), { count: 0, amount: 0, recovered: 0, outstanding: 0 });
    res.json({ rows: rowsWithPct, totals, industry: tenant?.industry ?? "CUSTOM", tenantName: tenant?.companyName ?? "" });
  } catch (err) { logger.error({ err }, "ClawbackByIndustry error"); res.status(500).json({ error: "Server error" }); }
});

router.get("/clawback-by-reason", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  try {
    const items = await prisma.commissionClawback.findMany({
      where: clawbackWhere(tenantId, isSales, req.user!.userId, q),
      select: { reasonCategory: true, clawbackAmount: true, recoveredAmount: true, outstandingAmount: true },
    });
    const byReason: Record<string, any> = {};
    for (const c of items) {
      const r = c.reasonCategory;
      if (!byReason[r]) byReason[r] = { reasonCategory: r, count: 0, amount: 0, recovered: 0, outstanding: 0 };
      byReason[r].count++;
      byReason[r].amount      += Number(c.clawbackAmount);
      byReason[r].recovered   += Number(c.recoveredAmount);
      byReason[r].outstanding += Number(c.outstandingAmount);
    }
    const rows = Object.values(byReason).sort((a, b) => b.amount - a.amount);
    const totalAmt = rows.reduce((s, r) => s + r.amount, 0);
    const rowsWithPct = rows.map(r => ({ ...r, percentage: totalAmt > 0 ? Math.round((r.amount / totalAmt) * 100) : 0 }));
    const totals = rows.reduce((s: any, r: any) => ({ count: s.count + r.count, amount: s.amount + r.amount, recovered: s.recovered + r.recovered, outstanding: s.outstanding + r.outstanding }), { count: 0, amount: 0, recovered: 0, outstanding: 0 });
    res.json({ rows: rowsWithPct, totals });
  } catch (err) { logger.error({ err }, "ClawbackByReason error"); res.status(500).json({ error: "Server error" }); }
});

router.get("/clawback-waived", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId,
    status: "WAIVED",
    ...(isSales  && { salesExecutiveId: req.user!.userId }),
    ...(!isSales && q.userId && q.userId !== "ALL" && { salesExecutiveId: q.userId }),
    ...(q.reason && q.reason !== "ALL" && { reasonCategory: q.reason }),
    ...((q.from || q.to) && { createdAt: buildDateFilter(q.from, q.to) }),
  };
  try {
    const items = await prisma.commissionClawback.findMany({ where, include: cbInclude, orderBy: { createdAt: "desc" } });
    const rows = items.map(c => ({
      id:             c.id,
      eventTitle:     (c.commissionEvent as any).eventTitle,
      executiveName:  `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`,
      executiveEmail: c.salesExecutive.email,
      reasonCategory: c.reasonCategory,
      clawbackType:   c.clawbackType,
      clawbackAmount: Number(c.clawbackAmount),
      waiveReason:    c.waiveReason ?? "",
      createdAt:      c.createdAt.toISOString().slice(0, 10),
    }));
    const totals = { count: rows.length, totalWaived: rows.reduce((s, r) => s + r.clawbackAmount, 0) };
    res.json({ rows, totals });
  } catch (err) { logger.error({ err }, "ClawbackWaived error"); res.status(500).json({ error: "Server error" }); }
});

router.get("/clawback-disputed", requireAuth, async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales  = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId,
    status: "DISPUTED",
    ...(isSales  && { salesExecutiveId: req.user!.userId }),
    ...(!isSales && q.userId && q.userId !== "ALL" && { salesExecutiveId: q.userId }),
    ...(q.reason && q.reason !== "ALL" && { reasonCategory: q.reason }),
    ...((q.from || q.to) && { createdAt: buildDateFilter(q.from, q.to) }),
  };
  try {
    const items = await prisma.commissionClawback.findMany({ where, include: cbInclude, orderBy: { disputedAt: "desc" } });
    const rows = items.map(c => ({
      id:             c.id,
      eventTitle:     (c.commissionEvent as any).eventTitle,
      executiveName:  `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`,
      executiveEmail: c.salesExecutive.email,
      reasonCategory: c.reasonCategory,
      clawbackType:   c.clawbackType,
      clawbackAmount: Number(c.clawbackAmount),
      disputeNote:    c.disputeNote ?? "",
      disputedAt:     c.disputedAt?.toISOString().slice(0, 10) ?? "",
      createdAt:      c.createdAt.toISOString().slice(0, 10),
    }));
    const totals = { count: rows.length, totalDisputed: rows.reduce((s, r) => s + r.clawbackAmount, 0) };
    res.json({ rows, totals });
  } catch (err) { logger.error({ err }, "ClawbackDisputed error"); res.status(500).json({ error: "Server error" }); }
});

// ─── Excel Export ─────────────────────────────────────────────────────────────
router.get("/:type/excel", requireAuth, async (req: Request, res: Response) => {
  const { type } = req.params;
  const query = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Incentiq";
    wb.created = new Date();

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: "FFFFFFFF" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } },
      alignment: { horizontal: "center" },
      border: { bottom: { style: "thin", color: { argb: "FF000000" } } },
    };
    const currencyFmt = 'R #,##0.00';
    const dateFmt = 'yyyy-mm-dd';

    const addHeader = (ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number; numFmt?: string }[]) => {
      ws.columns = cols;
      ws.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });
      ws.getRow(1).height = 20;
    };

    if (type === "commission-by-month") {
      const where: any = { tenantId,
        ...(isSales && { salesExecutiveId: req.user!.userId }),
        ...(query.userId && !isSales && { salesExecutiveId: query.userId }),
        ...(query.dealType && query.dealType !== "ALL" && { eventType: query.dealType }),
        ...(query.status  && query.status  !== "ALL" && { approvalStatus: query.status }),
        ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }),
      };
      const events = await prisma.commissionEvent.findMany({ where, select: { createdAt: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true } });
      const byMonth: Record<string, any> = {};
      for (const e of events) {
        const k = e.createdAt.toISOString().slice(0, 7);
        if (!byMonth[k]) byMonth[k] = { month: k, deals: 0, commission: 0, grossProfit: 0, revenue: 0 };
        byMonth[k].deals++; byMonth[k].commission += e.calculatedCommissionAmount;
        byMonth[k].grossProfit += e.grossProfitAmount ?? 0; byMonth[k].revenue += e.revenueAmount ?? 0;
      }
      const rows = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
      const ws = wb.addWorksheet("Commission by Month");
      addHeader(ws, [
        { header: "Month", key: "month", width: 12 },
        { header: "Deals", key: "deals", width: 10 },
        { header: "Revenue", key: "revenue", width: 18, numFmt: currencyFmt },
        { header: "Gross Profit", key: "grossProfit", width: 18, numFmt: currencyFmt },
        { header: "Commission", key: "commission", width: 18, numFmt: currencyFmt },
      ]);
      rows.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["revenue","grossProfit","commission"].forEach(k => { const c = row.getCell(k); c.numFmt = currencyFmt; });
      });
      const tot = rows.reduce((s: any, r: any) => ({ deals: s.deals+r.deals, revenue: s.revenue+r.revenue, grossProfit: s.grossProfit+r.grossProfit, commission: s.commission+r.commission }), { deals: 0, revenue: 0, grossProfit: 0, commission: 0 });
      const totRow = ws.addRow({ month: "TOTAL", ...tot });
      totRow.font = { bold: true }; totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8FF" } };
      ["revenue","grossProfit","commission"].forEach(k => { const c = totRow.getCell(k); c.numFmt = currencyFmt; });
    }

    else if (type === "commission-by-executive") {
      const where: any = { tenantId,
        ...(isSales && { salesExecutiveId: req.user!.userId }),
        ...(query.userId && !isSales && { salesExecutiveId: query.userId }),
        ...(query.dealType && query.dealType !== "ALL" && { eventType: query.dealType }),
        ...(query.status  && query.status  !== "ALL" && { approvalStatus: query.status }),
        ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }),
      };
      const events = await prisma.commissionEvent.findMany({ where, select: { salesExecutiveId: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true, salesExecutive: { select: { firstName: true, lastName: true, email: true } } } });
      const byExec: Record<string, any> = {};
      for (const e of events) {
        const id = e.salesExecutiveId;
        if (!byExec[id]) byExec[id] = { name: `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`, email: e.salesExecutive.email, deals: 0, commission: 0, grossProfit: 0, revenue: 0 };
        byExec[id].deals++; byExec[id].commission += e.calculatedCommissionAmount;
        byExec[id].grossProfit += e.grossProfitAmount ?? 0; byExec[id].revenue += e.revenueAmount ?? 0;
      }
      const rows = Object.values(byExec).sort((a, b) => b.commission - a.commission);
      const ws = wb.addWorksheet("Commission by Executive");
      addHeader(ws, [
        { header: "Name", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Deals", key: "deals", width: 10 },
        { header: "Revenue", key: "revenue", width: 18, numFmt: currencyFmt },
        { header: "Gross Profit", key: "grossProfit", width: 18, numFmt: currencyFmt },
        { header: "Commission", key: "commission", width: 18, numFmt: currencyFmt },
      ]);
      rows.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["revenue","grossProfit","commission"].forEach(k => { const c = row.getCell(k); c.numFmt = currencyFmt; });
      });
    }

    else if (type === "commission-by-deal-type") {
      const where: any = { tenantId,
        ...(isSales && { salesExecutiveId: req.user!.userId }),
        ...(query.userId && !isSales && { salesExecutiveId: query.userId }),
        ...(query.status && query.status !== "ALL" && { approvalStatus: query.status }),
        ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }),
      };
      const events = await prisma.commissionEvent.findMany({ where, select: { eventType: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true } });
      const byType: Record<string, any> = {};
      for (const e of events) {
        if (!byType[e.eventType]) byType[e.eventType] = { dealType: e.eventType, deals: 0, commission: 0, grossProfit: 0, revenue: 0 };
        byType[e.eventType].deals++; byType[e.eventType].commission += e.calculatedCommissionAmount;
        byType[e.eventType].grossProfit += e.grossProfitAmount ?? 0; byType[e.eventType].revenue += e.revenueAmount ?? 0;
      }
      const rows = Object.values(byType).sort((a, b) => b.commission - a.commission);
      const ws = wb.addWorksheet("Commission by Event Type");
      addHeader(ws, [
        { header: "Event Type", key: "dealType", width: 16 },
        { header: "Events", key: "deals", width: 10 },
        { header: "Revenue", key: "revenue", width: 18, numFmt: currencyFmt },
        { header: "Gross Profit", key: "grossProfit", width: 18, numFmt: currencyFmt },
        { header: "Commission", key: "commission", width: 18, numFmt: currencyFmt },
      ]);
      rows.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["revenue","grossProfit","commission"].forEach(k => { const c = row.getCell(k); c.numFmt = currencyFmt; });
      });
    }

    else if (type === "pending-approvals") {
      const where: any = { tenantId,
        approvalStatus: { in: ["PENDING_APPROVAL","FINANCE_APPROVED","EXECUTIVE_APPROVED"] },
        ...(query.userId && { salesExecutiveId: query.userId }),
        ...(query.dealType && query.dealType !== "ALL" && { eventType: query.dealType }),
        ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }),
      };
      const events = await prisma.commissionEvent.findMany({ where, include: { salesExecutive: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } });
      const ws = wb.addWorksheet("Pending Approvals");
      addHeader(ws, [
        { header: "Event Name", key: "eventTitle", width: 30 },
        { header: "Event Type", key: "eventType", width: 14 },
        { header: "Executive", key: "exec", width: 22 },
        { header: "Revenue", key: "revenue", width: 18, numFmt: currencyFmt },
        { header: "Commission", key: "commission", width: 18, numFmt: currencyFmt },
        { header: "Status", key: "status", width: 22 },
        { header: "Submitted", key: "submittedAt", width: 14 },
      ]);
      events.forEach((e, i) => {
        const row = ws.addRow({ eventTitle: e.eventTitle, eventType: e.eventType, exec: `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`, revenue: e.revenueAmount ?? 0, commission: e.calculatedCommissionAmount, status: e.approvalStatus, submittedAt: e.submittedAt ? e.submittedAt.toISOString().slice(0,10) : "—" });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["revenue","commission"].forEach(k => { const c = row.getCell(k); c.numFmt = currencyFmt; });
      });
    }

    else if (type === "payout-requests") {
      const where: any = { tenantId,
        ...(isSales && { userId: req.user!.userId }),
        ...(!isSales && query.userId && { userId: query.userId }),
        ...(query.status && query.status !== "ALL" && { status: query.status }),
        ...((query.from || query.to) && { requestedAt: buildDateFilter(query.from, query.to) }),
      };
      const payouts = await prisma.payoutRequest.findMany({ where, include: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { requestedAt: "desc" } });
      const ws = wb.addWorksheet("Payout Requests");
      addHeader(ws, [
        { header: "Employee", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Payout Month", key: "payoutMonth", width: 14 },
        { header: "Commission Amount", key: "requestedAmount", width: 20, numFmt: currencyFmt },
        { header: "Status", key: "status", width: 18 },
        { header: "Requested", key: "requestedAt", width: 14 },
        { header: "Approved", key: "approvedAt", width: 14 },
        { header: "Paid", key: "paidAt", width: 14 },
        { header: "Comments", key: "comments", width: 30 },
      ]);
      payouts.forEach((p, i) => {
        const row = ws.addRow({ name: `${p.user.firstName} ${p.user.lastName}`, email: p.user.email, payoutMonth: p.payoutMonth, requestedAmount: p.requestedAmount, status: p.status, requestedAt: p.requestedAt.toISOString().slice(0,10), approvedAt: p.approvedAt ? p.approvedAt.toISOString().slice(0,10) : "—", paidAt: p.paidAt ? p.paidAt.toISOString().slice(0,10) : "—", comments: p.comments ?? "" });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        const c = row.getCell("requestedAmount"); c.numFmt = currencyFmt;
      });
    }

    else if (type === "payroll-export") {
      const statusFilter = query.status && query.status !== "ALL" ? [query.status] : ["FINANCE_APPROVED","PAYROLL_APPROVED","PAID"];
      const where: any = { tenantId, status: { in: statusFilter }, ...(query.userId && { userId: query.userId }), ...((query.from || query.to) && { requestedAt: buildDateFilter(query.from, query.to) }) };
      const payouts = await prisma.payoutRequest.findMany({ where, include: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { requestedAt: "desc" } });
      const ws = wb.addWorksheet("Payroll Export");
      addHeader(ws, [
        { header: "Employee", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Payout Month", key: "payoutMonth", width: 14 },
        { header: "Commission Amount", key: "commissionAmount", width: 20, numFmt: currencyFmt },
        { header: "Status", key: "status", width: 18 },
        { header: "Approved", key: "approvedAt", width: 14 },
        { header: "Paid", key: "paidAt", width: 14 },
        { header: "Reference", key: "id", width: 34 },
      ]);
      payouts.forEach((p, i) => {
        const row = ws.addRow({ name: `${p.user.firstName} ${p.user.lastName}`, email: p.user.email, payoutMonth: p.payoutMonth, commissionAmount: p.requestedAmount, status: p.status, approvedAt: p.approvedAt ? p.approvedAt.toISOString().slice(0,10) : "—", paidAt: p.paidAt ? p.paidAt.toISOString().slice(0,10) : "—", id: p.id });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        const c = row.getCell("commissionAmount"); c.numFmt = currencyFmt;
      });
      const total = payouts.reduce((s, p) => s + p.requestedAmount, 0);
      const totRow = ws.addRow({ name: "TOTAL", commissionAmount: total });
      totRow.font = { bold: true }; totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8FF" } };
      totRow.getCell("commissionAmount").numFmt = currencyFmt;
    }

    else if (type === "wallet-balances") {
      const where: any = { tenantId, ...(query.userId && { userId: query.userId }) };
      const wallets = await prisma.wallet.findMany({ where, include: { user: { select: { firstName: true, lastName: true, email: true, role: true } } }, orderBy: { paidOutBalance: "desc" } });
      const ws = wb.addWorksheet("Wallet Balances");
      addHeader(ws, [
        { header: "Employee", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "role", width: 18 },
        { header: "Available", key: "availableBalance", width: 18, numFmt: currencyFmt },
        { header: "Pending", key: "pendingBalance", width: 18, numFmt: currencyFmt },
        { header: "Deferred", key: "deferredBalance", width: 18, numFmt: currencyFmt },
        { header: "Paid Out", key: "paidOutBalance", width: 18, numFmt: currencyFmt },
        { header: "Total Earned", key: "totalEarned", width: 18, numFmt: currencyFmt },
      ]);
      wallets.forEach((w, i) => {
        const total = w.availableBalance + w.pendingBalance + w.deferredBalance + w.paidOutBalance;
        const row = ws.addRow({ name: `${w.user.firstName} ${w.user.lastName}`, email: w.user.email, role: w.user.role, availableBalance: w.availableBalance, pendingBalance: w.pendingBalance, deferredBalance: w.deferredBalance, paidOutBalance: w.paidOutBalance, totalEarned: total });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["availableBalance","pendingBalance","deferredBalance","paidOutBalance","totalEarned"].forEach(k => { row.getCell(k).numFmt = currencyFmt; });
      });
    }

    else if (type === "audit-trail") {
      const dateFilter = buildDateFilter(query.from, query.to);
      const txns = await prisma.walletTransaction.findMany({ where: { tenantId, ...(dateFilter && { createdAt: dateFilter }), ...(query.userId && { wallet: { userId: query.userId } }) }, include: { wallet: { include: { user: { select: { firstName: true, lastName: true } } } } }, orderBy: { createdAt: "desc" }, take: 1000 });
      const ws = wb.addWorksheet("Audit Trail");
      addHeader(ws, [
        { header: "Date", key: "createdAt", width: 20 },
        { header: "Type", key: "transactionType", width: 22 },
        { header: "Actor", key: "actor", width: 25 },
        { header: "Description", key: "description", width: 40 },
        { header: "Amount", key: "amount", width: 18, numFmt: currencyFmt },
        { header: "Reference", key: "referenceId", width: 34 },
      ]);
      txns.forEach((t, i) => {
        const row = ws.addRow({ createdAt: t.createdAt.toISOString().replace("T"," ").slice(0,19), transactionType: t.transactionType, actor: `${t.wallet.user.firstName} ${t.wallet.user.lastName}`, description: t.description, amount: t.amount, referenceId: t.referenceId ?? "" });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        row.getCell("amount").numFmt = currencyFmt;
      });
    }

    else if (type === "clawback-summary") {
      const where: any = {
        tenantId,
        ...(isSales && { salesExecutiveId: req.user!.userId }),
        ...(!isSales && query.userId && query.userId !== "ALL" && { salesExecutiveId: query.userId }),
        ...(query.status && query.status !== "ALL" && { status: query.status }),
        ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }),
      };
      const rows = await prisma.commissionClawback.findMany({ where, select: { status: true, clawbackAmount: true, recoveredAmount: true, outstandingAmount: true } });
      const byStatus: Record<string, any> = {};
      for (const c of rows) {
        if (!byStatus[c.status]) byStatus[c.status] = { status: c.status, count: 0, amount: 0, recovered: 0, outstanding: 0 };
        byStatus[c.status].count++; byStatus[c.status].amount += Number(c.clawbackAmount); byStatus[c.status].recovered += Number(c.recoveredAmount); byStatus[c.status].outstanding += Number(c.outstandingAmount);
      }
      const statusRows = Object.values(byStatus);
      const ws = wb.addWorksheet("Clawback Summary");
      addHeader(ws, [
        { header: "Status", key: "status", width: 22 },
        { header: "Count", key: "count", width: 10 },
        { header: "Clawback Amount", key: "amount", width: 20, numFmt: currencyFmt },
        { header: "Recovered", key: "recovered", width: 20, numFmt: currencyFmt },
        { header: "Outstanding", key: "outstanding", width: 20, numFmt: currencyFmt },
      ]);
      statusRows.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["amount","recovered","outstanding"].forEach(k => { row.getCell(k).numFmt = currencyFmt; });
      });
      const tot = statusRows.reduce((s: any, r: any) => ({ count: s.count+r.count, amount: s.amount+r.amount, recovered: s.recovered+r.recovered, outstanding: s.outstanding+r.outstanding }), { count:0,amount:0,recovered:0,outstanding:0 });
      const totRow = ws.addRow({ status: "TOTAL", ...tot });
      totRow.font = { bold: true }; totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE8E8" } };
      ["amount","recovered","outstanding"].forEach(k => { totRow.getCell(k).numFmt = currencyFmt; });
    }

    else if (type === "clawback-outstanding") {
      const where: any = { tenantId, outstandingAmount: { gt: 0 }, status: { in: ["APPROVED","EXECUTED"] }, ...(isSales && { salesExecutiveId: req.user!.userId }), ...(!isSales && query.userId && query.userId !== "ALL" && { salesExecutiveId: query.userId }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const items = await prisma.commissionClawback.findMany({ where, include: { salesExecutive: { select: { firstName: true, lastName: true, email: true } }, commissionEvent: { select: { eventTitle: true } } }, orderBy: { outstandingAmount: "desc" } });
      const ws = wb.addWorksheet("Outstanding Recovery");
      addHeader(ws, [
        { header: "Event", key: "event", width: 30 },
        { header: "Executive", key: "exec", width: 25 },
        { header: "Reason", key: "reason", width: 20 },
        { header: "Clawback Amount", key: "clawbackAmount", width: 18, numFmt: currencyFmt },
        { header: "Recovered", key: "recoveredAmount", width: 18, numFmt: currencyFmt },
        { header: "Outstanding", key: "outstandingAmount", width: 18, numFmt: currencyFmt },
        { header: "Recovery Status", key: "recoveryStatus", width: 20 },
        { header: "Status", key: "status", width: 16 },
        { header: "Executed", key: "executedAt", width: 12 },
      ]);
      items.forEach((c, i) => {
        const row = ws.addRow({ event: (c.commissionEvent as any).eventTitle, exec: `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`, reason: c.reasonCategory, clawbackAmount: Number(c.clawbackAmount), recoveredAmount: Number(c.recoveredAmount), outstandingAmount: Number(c.outstandingAmount), recoveryStatus: c.recoveryStatus ?? "PENDING", status: c.status, executedAt: c.executedAt ? c.executedAt.toISOString().slice(0,10) : "—" });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["clawbackAmount","recoveredAmount","outstandingAmount"].forEach(k => { row.getCell(k).numFmt = currencyFmt; });
      });
      const tot = items.reduce((s,c) => ({ clawbackAmount: s.clawbackAmount+Number(c.clawbackAmount), recoveredAmount: s.recoveredAmount+Number(c.recoveredAmount), outstandingAmount: s.outstandingAmount+Number(c.outstandingAmount) }), { clawbackAmount:0,recoveredAmount:0,outstandingAmount:0 });
      const totRow = ws.addRow({ event: "TOTAL", clawbackAmount: tot.clawbackAmount, recoveredAmount: tot.recoveredAmount, outstandingAmount: tot.outstandingAmount });
      totRow.font = { bold: true }; totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE8E8" } };
      ["clawbackAmount","recoveredAmount","outstandingAmount"].forEach(k => { totRow.getCell(k).numFmt = currencyFmt; });
    }

    else if (type === "clawback-transactions") {
      const where: any = { tenantId, referenceType: "CLAWBACK", ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }), ...(isSales && { wallet: { userId: req.user!.userId } }), ...(!isSales && query.userId && query.userId !== "ALL" && { wallet: { userId: query.userId } }) };
      const txns = await prisma.walletTransaction.findMany({ where, include: { wallet: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } }, orderBy: { createdAt: "desc" }, take: 2000 });
      const ws = wb.addWorksheet("Recovery Transactions");
      addHeader(ws, [
        { header: "Date", key: "date", width: 14 },
        { header: "Type", key: "transactionType", width: 24 },
        { header: "Executive", key: "exec", width: 25 },
        { header: "Description", key: "description", width: 40 },
        { header: "Amount", key: "amount", width: 18, numFmt: currencyFmt },
        { header: "Reference", key: "referenceId", width: 34 },
      ]);
      txns.forEach((t, i) => {
        const row = ws.addRow({ date: t.createdAt.toISOString().slice(0,10), transactionType: t.transactionType, exec: `${t.wallet.user.firstName} ${t.wallet.user.lastName}`, description: t.description, amount: Number(t.amount), referenceId: t.referenceId ?? "" });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        row.getCell("amount").numFmt = currencyFmt;
      });
    }

    else if (type === "clawback-by-executive") {
      const where: any = { tenantId, ...(isSales && { salesExecutiveId: req.user!.userId }), ...(!isSales && query.userId && query.userId !== "ALL" && { salesExecutiveId: query.userId }), ...(query.status && query.status !== "ALL" && { status: query.status }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const items = await prisma.commissionClawback.findMany({ where, select: { salesExecutiveId: true, clawbackAmount: true, recoveredAmount: true, outstandingAmount: true, status: true, salesExecutive: { select: { firstName: true, lastName: true, email: true } } } });
      const byExec: Record<string, any> = {};
      for (const c of items) {
        const id = c.salesExecutiveId;
        if (!byExec[id]) byExec[id] = { name: `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`, email: c.salesExecutive.email, count: 0, amount: 0, recovered: 0, outstanding: 0 };
        byExec[id].count++; byExec[id].amount += Number(c.clawbackAmount); byExec[id].recovered += Number(c.recoveredAmount); byExec[id].outstanding += Number(c.outstandingAmount);
      }
      const rows = Object.values(byExec).sort((a, b) => b.amount - a.amount);
      const ws = wb.addWorksheet("Clawback by Executive");
      addHeader(ws, [
        { header: "Executive", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Count", key: "count", width: 10 },
        { header: "Total Amount", key: "amount", width: 18, numFmt: currencyFmt },
        { header: "Recovered", key: "recovered", width: 18, numFmt: currencyFmt },
        { header: "Outstanding", key: "outstanding", width: 18, numFmt: currencyFmt },
      ]);
      rows.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["amount","recovered","outstanding"].forEach(k => { row.getCell(k).numFmt = currencyFmt; });
      });
    }

    else if (type === "clawback-by-industry") {
      const where: any = { tenantId, ...(isSales && { salesExecutiveId: req.user!.userId }), ...(query.status && query.status !== "ALL" && { status: query.status }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const items = await prisma.commissionClawback.findMany({ where, select: { clawbackType: true, clawbackAmount: true, recoveredAmount: true, outstandingAmount: true } });
      const byType: Record<string, any> = {};
      for (const c of items) {
        const t = c.clawbackType;
        if (!byType[t]) byType[t] = { clawbackType: t, count: 0, amount: 0, recovered: 0, outstanding: 0 };
        byType[t].count++; byType[t].amount += Number(c.clawbackAmount); byType[t].recovered += Number(c.recoveredAmount); byType[t].outstanding += Number(c.outstandingAmount);
      }
      const rows = Object.values(byType).sort((a, b) => b.amount - a.amount);
      const ws = wb.addWorksheet("Clawback by Type");
      addHeader(ws, [
        { header: "Clawback Type", key: "clawbackType", width: 22 },
        { header: "Count", key: "count", width: 10 },
        { header: "Total Amount", key: "amount", width: 18, numFmt: currencyFmt },
        { header: "Recovered", key: "recovered", width: 18, numFmt: currencyFmt },
        { header: "Outstanding", key: "outstanding", width: 18, numFmt: currencyFmt },
      ]);
      rows.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["amount","recovered","outstanding"].forEach(k => { row.getCell(k).numFmt = currencyFmt; });
      });
    }

    else if (type === "clawback-by-reason") {
      const where: any = { tenantId, ...(isSales && { salesExecutiveId: req.user!.userId }), ...(query.status && query.status !== "ALL" && { status: query.status }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const items = await prisma.commissionClawback.findMany({ where, select: { reasonCategory: true, clawbackAmount: true, recoveredAmount: true, outstandingAmount: true } });
      const byReason: Record<string, any> = {};
      for (const c of items) {
        const r = c.reasonCategory;
        if (!byReason[r]) byReason[r] = { reasonCategory: r, count: 0, amount: 0, recovered: 0, outstanding: 0 };
        byReason[r].count++; byReason[r].amount += Number(c.clawbackAmount); byReason[r].recovered += Number(c.recoveredAmount); byReason[r].outstanding += Number(c.outstandingAmount);
      }
      const totalAmt = Object.values(byReason).reduce((s: any, r: any) => s + r.amount, 0);
      const rows = Object.values(byReason).sort((a, b) => b.amount - a.amount).map((r: any) => ({ ...r, pct: totalAmt > 0 ? `${Math.round((r.amount/totalAmt)*100)}%` : "0%" }));
      const ws = wb.addWorksheet("Clawback by Reason");
      addHeader(ws, [
        { header: "Reason Category", key: "reasonCategory", width: 28 },
        { header: "Count", key: "count", width: 10 },
        { header: "Total Amount", key: "amount", width: 18, numFmt: currencyFmt },
        { header: "% of Total", key: "pct", width: 12 },
        { header: "Recovered", key: "recovered", width: 18, numFmt: currencyFmt },
        { header: "Outstanding", key: "outstanding", width: 18, numFmt: currencyFmt },
      ]);
      rows.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        ["amount","recovered","outstanding"].forEach(k => { row.getCell(k).numFmt = currencyFmt; });
      });
    }

    else if (type === "clawback-waived") {
      const where: any = { tenantId, status: "WAIVED", ...(isSales && { salesExecutiveId: req.user!.userId }), ...(!isSales && query.userId && query.userId !== "ALL" && { salesExecutiveId: query.userId }), ...(query.reason && query.reason !== "ALL" && { reasonCategory: query.reason }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const items = await prisma.commissionClawback.findMany({ where, include: { salesExecutive: { select: { firstName: true, lastName: true, email: true } }, commissionEvent: { select: { eventTitle: true } } }, orderBy: { createdAt: "desc" } });
      const ws = wb.addWorksheet("Waived Clawbacks");
      addHeader(ws, [
        { header: "Event", key: "event", width: 30 },
        { header: "Executive", key: "exec", width: 25 },
        { header: "Reason Category", key: "reason", width: 22 },
        { header: "Amount Waived", key: "amount", width: 18, numFmt: currencyFmt },
        { header: "Waive Reason", key: "waiveReason", width: 40 },
        { header: "Date", key: "createdAt", width: 12 },
      ]);
      items.forEach((c, i) => {
        const row = ws.addRow({ event: (c.commissionEvent as any).eventTitle, exec: `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`, reason: c.reasonCategory, amount: Number(c.clawbackAmount), waiveReason: c.waiveReason ?? "", createdAt: c.createdAt.toISOString().slice(0,10) });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        row.getCell("amount").numFmt = currencyFmt;
      });
      const totRow = ws.addRow({ event: "TOTAL", amount: items.reduce((s,c) => s + Number(c.clawbackAmount), 0) });
      totRow.font = { bold: true }; totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8FF" } };
      totRow.getCell("amount").numFmt = currencyFmt;
    }

    else if (type === "clawback-disputed") {
      const where: any = { tenantId, status: "DISPUTED", ...(isSales && { salesExecutiveId: req.user!.userId }), ...(!isSales && query.userId && query.userId !== "ALL" && { salesExecutiveId: query.userId }), ...(query.reason && query.reason !== "ALL" && { reasonCategory: query.reason }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const items = await prisma.commissionClawback.findMany({ where, include: { salesExecutive: { select: { firstName: true, lastName: true, email: true } }, commissionEvent: { select: { eventTitle: true } } }, orderBy: { disputedAt: "desc" } });
      const ws = wb.addWorksheet("Disputed Clawbacks");
      addHeader(ws, [
        { header: "Event", key: "event", width: 30 },
        { header: "Executive", key: "exec", width: 25 },
        { header: "Reason Category", key: "reason", width: 22 },
        { header: "Amount", key: "amount", width: 18, numFmt: currencyFmt },
        { header: "Dispute Note", key: "disputeNote", width: 40 },
        { header: "Disputed On", key: "disputedAt", width: 14 },
        { header: "Created", key: "createdAt", width: 12 },
      ]);
      items.forEach((c, i) => {
        const row = ws.addRow({ event: (c.commissionEvent as any).eventTitle, exec: `${c.salesExecutive.firstName} ${c.salesExecutive.lastName}`, reason: c.reasonCategory, amount: Number(c.clawbackAmount), disputeNote: c.disputeNote ?? "", disputedAt: c.disputedAt ? c.disputedAt.toISOString().slice(0,10) : "—", createdAt: c.createdAt.toISOString().slice(0,10) });
        if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
        row.getCell("amount").numFmt = currencyFmt;
      });
    }

    else {
      res.status(400).json({ error: "Unknown report type" }); return;
    }

    const filename = `Incentiq_${type}_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error({ err }, "ExcelExport error");
    if (!res.headersSent) res.status(500).json({ error: "Export failed" });
  }
});

// ─── PDF Export ───────────────────────────────────────────────────────────────
router.get("/:type/pdf", requireAuth, async (req: Request, res: Response) => {
  const { type } = req.params;
  const query = req.query as Record<string, string | undefined>;
  const tenantId = req.user!.tenantId;
  const isSales = req.user!.role === "SALES_EXECUTIVE";

  const REPORT_LABELS: Record<string, string> = {
    "commission-by-month": "Commission Summary by Month",
    "commission-by-executive": "Commission Summary by Sales Executive",
    "commission-by-deal-type": "Commission by Deal Type",
    "pending-approvals": "Pending Approval Report",
    "payout-requests": "Payout Request Report",
    "payroll-export": "Payroll Export Report",
    "wallet-balances": "Wallet Balance Report",
    "audit-trail": "Audit Trail Report",
  };

  try {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const filename = `Incentiq_${type}_${new Date().toISOString().slice(0,10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageW = doc.page.width - 80;
    const typeStr = String(type);
    const title = REPORT_LABELS[typeStr] ?? typeStr;
    const generatedAt = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

    doc.rect(0, 0, doc.page.width, 70).fill("#4F46E5");
    doc.fillColor("white").fontSize(18).font("Helvetica-Bold").text("Incentiq", 40, 18);
    doc.fontSize(11).font("Helvetica").text(title, 40, 42);
    doc.fillColor("#c7d2fe").fontSize(9).text(`Generated: ${generatedAt}`, 40, 57);
    doc.fillColor("black");
    doc.y = 85;

    const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
      const rowH = 20;
      let x = 40;

      doc.rect(x, doc.y, pageW, rowH).fill("#4F46E5");
      headers.forEach((h, i) => {
        doc.fillColor("white").fontSize(8).font("Helvetica-Bold").text(h, x + 4, doc.y + 6, { width: colWidths[i] - 6, align: "left" });
        x += colWidths[i];
      });
      doc.y += rowH;

      rows.forEach((row, ri) => {
        if (doc.y + rowH > doc.page.height - 50) {
          doc.addPage();
          doc.y = 40;
        }
        x = 40;
        const fill = ri % 2 === 0 ? "#F9F9FF" : "#FFFFFF";
        doc.rect(40, doc.y, pageW, rowH).fill(fill);
        row.forEach((cell, i) => {
          doc.fillColor("#1f2937").fontSize(8).font("Helvetica").text(cell, x + 4, doc.y + 6, { width: colWidths[i] - 8, align: i > 1 ? "right" : "left", ellipsis: true });
          x += colWidths[i];
        });
        doc.y += rowH;
      });

      doc.moveTo(40, doc.y).lineTo(40 + pageW, doc.y).strokeColor("#e5e7eb").stroke();
      doc.y += 4;
    };

    if (type === "commission-by-month") {
      const where: any = { tenantId, ...(isSales && { salesExecutiveId: req.user!.userId }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const events = await prisma.commissionEvent.findMany({ where, select: { createdAt: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true } });
      const byMonth: Record<string, any> = {};
      for (const e of events) { const k = e.createdAt.toISOString().slice(0,7); if (!byMonth[k]) byMonth[k] = { month: k, deals: 0, commission: 0, grossProfit: 0, revenue: 0 }; byMonth[k].deals++; byMonth[k].commission += e.calculatedCommissionAmount; byMonth[k].grossProfit += e.grossProfitAmount??0; byMonth[k].revenue += e.revenueAmount??0; }
      const rows = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
      const W = pageW; const cols = [W*0.15, W*0.1, W*0.25, W*0.25, W*0.25];
      drawTable(["Month","Events","Revenue","Gross Profit","Commission"], rows.map(r => [r.month, String(r.deals), fmtZAR(r.revenue), fmtZAR(r.grossProfit), fmtZAR(r.commission)]), cols);
      const tot = rows.reduce((s: any, r: any) => ({ deals: s.deals+r.deals, revenue: s.revenue+r.revenue, grossProfit: s.grossProfit+r.grossProfit, commission: s.commission+r.commission }), { deals:0,revenue:0,grossProfit:0,commission:0 });
      doc.rect(40, doc.y, pageW, 20).fill("#E8E8FF");
      doc.fillColor("#1f2937").fontSize(9).font("Helvetica-Bold").text(`TOTAL  —  ${tot.deals} events  |  ${fmtZAR(tot.revenue)} revenue  |  ${fmtZAR(tot.grossProfit)} GP  |  ${fmtZAR(tot.commission)} commission`, 44, doc.y + 6, { width: pageW - 8 });
      doc.y += 24;
    }

    else if (type === "commission-by-executive") {
      const where: any = { tenantId, ...(isSales && { salesExecutiveId: req.user!.userId }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const events = await prisma.commissionEvent.findMany({ where, select: { salesExecutiveId: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true, salesExecutive: { select: { firstName: true, lastName: true } } } });
      const byExec: Record<string, any> = {};
      for (const e of events) { const id = e.salesExecutiveId; if (!byExec[id]) byExec[id] = { name: `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`, deals: 0, commission: 0, grossProfit: 0, revenue: 0 }; byExec[id].deals++; byExec[id].commission += e.calculatedCommissionAmount; byExec[id].grossProfit += e.grossProfitAmount??0; byExec[id].revenue += e.revenueAmount??0; }
      const rows = Object.values(byExec).sort((a, b) => b.commission - a.commission);
      const W = pageW; const cols = [W*0.3, W*0.1, W*0.2, W*0.2, W*0.2];
      drawTable(["Executive","Events","Revenue","Gross Profit","Commission"], rows.map(r => [r.name, String(r.deals), fmtZAR(r.revenue), fmtZAR(r.grossProfit), fmtZAR(r.commission)]), cols);
    }

    else if (type === "commission-by-deal-type") {
      const where: any = { tenantId, ...(isSales && { salesExecutiveId: req.user!.userId }), ...((query.from || query.to) && { createdAt: buildDateFilter(query.from, query.to) }) };
      const events = await prisma.commissionEvent.findMany({ where, select: { eventType: true, calculatedCommissionAmount: true, grossProfitAmount: true, revenueAmount: true } });
      const byType: Record<string, any> = {};
      for (const e of events) { if (!byType[e.eventType]) byType[e.eventType] = { dealType: e.eventType, deals: 0, commission: 0, grossProfit: 0, revenue: 0 }; byType[e.eventType].deals++; byType[e.eventType].commission += e.calculatedCommissionAmount; byType[e.eventType].grossProfit += e.grossProfitAmount??0; byType[e.eventType].revenue += e.revenueAmount??0; }
      const rows = Object.values(byType).sort((a, b) => b.commission - a.commission);
      const W = pageW; const cols = [W*0.2, W*0.1, W*0.23, W*0.23, W*0.24];
      drawTable(["Event Type","Events","Revenue","Gross Profit","Commission"], rows.map(r => [r.dealType, String(r.deals), fmtZAR(r.revenue), fmtZAR(r.grossProfit), fmtZAR(r.commission)]), cols);
    }

    else if (type === "payout-requests" || type === "payroll-export") {
      const statusFilter = type === "payroll-export" ? (query.status && query.status !== "ALL" ? [query.status] : ["FINANCE_APPROVED","PAYROLL_APPROVED","PAID"]) : undefined;
      const where: any = { tenantId, ...(statusFilter && { status: { in: statusFilter } }), ...(query.status && query.status !== "ALL" && type !== "payroll-export" && { status: query.status }), ...((query.from || query.to) && { requestedAt: buildDateFilter(query.from, query.to) }) };
      const payouts = await prisma.payoutRequest.findMany({ where, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { requestedAt: "desc" } });
      const W = pageW; const cols = [W*0.22, W*0.12, W*0.18, W*0.16, W*0.14, W*0.18];
      drawTable(["Employee","Month","Commission","Status","Requested","Approved"], payouts.map(p => [`${p.user.firstName} ${p.user.lastName}`, p.payoutMonth, fmtZAR(p.requestedAmount), p.status, p.requestedAt.toISOString().slice(0,10), p.approvedAt ? p.approvedAt.toISOString().slice(0,10) : "—"]), cols);
      const total = payouts.reduce((s, p) => s + p.requestedAmount, 0);
      doc.rect(40, doc.y, pageW, 20).fill("#E8E8FF");
      doc.fillColor("#1f2937").fontSize(9).font("Helvetica-Bold").text(`TOTAL  —  ${payouts.length} records  |  ${fmtZAR(total)}`, 44, doc.y + 6, { width: pageW - 8 });
      doc.y += 24;
    }

    else if (type === "wallet-balances") {
      const wallets = await prisma.wallet.findMany({ where: { tenantId }, include: { user: { select: { firstName: true, lastName: true, role: true } } }, orderBy: { paidOutBalance: "desc" } });
      const W = pageW; const cols = [W*0.22, W*0.14, W*0.16, W*0.12, W*0.12, W*0.12, W*0.12];
      drawTable(["Employee","Role","Available","Pending","Deferred","Paid Out","Total Earned"], wallets.map(w => { const tot = w.availableBalance+w.pendingBalance+w.deferredBalance+w.paidOutBalance; return [`${w.user.firstName} ${w.user.lastName}`, w.user.role, fmtZAR(w.availableBalance), fmtZAR(w.pendingBalance), fmtZAR(w.deferredBalance), fmtZAR(w.paidOutBalance), fmtZAR(tot)]; }), cols);
    }

    else if (type === "audit-trail" || type === "pending-approvals") {
      const dateFilter = buildDateFilter(query.from, query.to);
      const txns = await prisma.walletTransaction.findMany({ where: { tenantId, ...(dateFilter && { createdAt: dateFilter }) }, include: { wallet: { include: { user: { select: { firstName: true, lastName: true } } } } }, orderBy: { createdAt: "desc" }, take: 200 });
      const W = pageW; const cols = [W*0.17, W*0.2, W*0.22, W*0.25, W*0.16];
      drawTable(["Date","Type","Actor","Description","Amount"], txns.map(t => [t.createdAt.toISOString().slice(0,10), t.transactionType, `${t.wallet.user.firstName} ${t.wallet.user.lastName}`, t.description, fmtZAR(t.amount)]), cols);
    }

    doc.end();
  } catch (err) {
    logger.error({ err }, "PDFExport error");
    if (!res.headersSent) res.status(500).json({ error: "PDF generation failed" });
  }
});

export { router as reportsRouter };

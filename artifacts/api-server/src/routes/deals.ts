import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const COMM_PCT_FALLBACK: Record<string, number> = { NET_NEW: 10, RENEWAL: 5, UPSELL: 7, CROSS_SELL: 6 };

async function lookupCommissionPct(tenantId: string, salesExecutiveId: string, dealType: string): Promise<number> {
  try {
    const groups = await prisma.commissionRuleGroup.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        OR: [
          { assignToAll: true },
          { members: { some: { userId: salesExecutiveId } } },
        ],
      },
      include: { rules: { include: { rule: true } } },
    });
    for (const group of groups) {
      const match = (group.rules as any[]).find(
        (gr) => gr.rule?.dealType === dealType && gr.rule?.status === "ACTIVE"
      );
      if (match) return match.rule.commissionPercentage;
    }
  } catch (err) {
    logger.warn({ err }, "Commission rule lookup failed, using fallback");
  }
  return COMM_PCT_FALLBACK[dealType] ?? 10;
}

function dealToResponse(d: any) {
  return {
    id: d.id,
    tenantId: d.tenantId,
    salesExecutiveId: d.salesExecutiveId,
    salesExecutiveName: d.salesExecutive
      ? `${d.salesExecutive.firstName} ${d.salesExecutive.lastName}`
      : "",
    customerName: d.customerName,
    dealName: d.dealName,
    dealType: d.dealType,
    contractStartDate: d.contractStartDate?.toISOString() ?? null,
    contractEndDate: d.contractEndDate?.toISOString() ?? null,
    revenue: d.revenue,
    cost: d.cost,
    grossProfit: d.grossProfit,
    grossProfitPercentage: d.grossProfitPercentage,
    commissionPercentage: d.commissionPercentage,
    commission: d.calculatedCommission,
    status: d.status,
    submittedById: d.submittedById ?? null,
    submittedAt: d.submittedAt?.toISOString() ?? null,
    metadata: (d as any).metadata ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// GET /api/deals
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status, dealType, page = "1", limit = "20", salesExecutiveId } =
    req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId: req.user!.tenantId,
    ...(isSalesExec && { salesExecutiveId: req.user!.userId }),
    ...(!isSalesExec && salesExecutiveId && { salesExecutiveId }),
    ...(status && { status }),
    ...(dealType && { dealType }),
  };
  try {
    const [data, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: { salesExecutive: { select: { firstName: true, lastName: true } } },
      }),
      prisma.deal.count({ where }),
    ]);
    res.json({ data: data.map(dealToResponse), total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    logger.error({ err }, "ListDeals error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/deals/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
      include: {
        salesExecutive: { select: { firstName: true, lastName: true } },
        approvalWorkflows: {
          include: { approver: { select: { firstName: true, lastName: true } } },
          orderBy: { approvalLevel: "asc" },
        },
      },
    });
    if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }
    res.json({
      ...dealToResponse(deal),
      approvalWorkflows: ((deal as any).approvalWorkflows as any[]).map((aw) => ({
        id: aw.id,
        approvalLevel: aw.approvalLevel,
        stepName: aw.stepName ?? null,
        approverRole: aw.approverRole,
        approverName: aw.approver ? `${aw.approver.firstName} ${aw.approver.lastName}` : null,
        status: aw.status,
        comments: aw.comments,
        approvedAt: aw.approvedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GetDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/deals — create as DRAFT
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { customerName, dealName, dealType, revenue, cost, contractStartDate, contractEndDate, metadata } =
    req.body;
  if (!customerName || !dealName || !dealType || revenue == null || cost == null) {
    res.status(400).json({ error: "customerName, dealName, dealType, revenue and cost are required" });
    return;
  }
  const rev = parseFloat(revenue);
  const cst = parseFloat(cost);
  const gp = rev - cst;
  const gpPct = rev > 0 ? Math.round((gp / rev) * 10000) / 100 : 0;
  const pct = await lookupCommissionPct(req.user!.tenantId, req.user!.userId, dealType);
  const commission = Math.round(gp * (pct / 100) * 100) / 100;
  try {
    const deal = await prisma.deal.create({
      data: {
        tenantId: req.user!.tenantId,
        salesExecutiveId: req.user!.userId,
        customerName,
        dealName,
        dealType,
        revenue: rev,
        cost: cst,
        grossProfit: gp,
        grossProfitPercentage: gpPct,
        commissionPercentage: pct,
        calculatedCommission: commission,
        status: "DRAFT",
        contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        ...(metadata !== undefined && { metadata }),
      },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });
    // Auto-save customer name for future autocomplete
    await prisma.customer.upsert({
      where: { tenantId_name: { tenantId: req.user!.tenantId, name: customerName } },
      create: { tenantId: req.user!.tenantId, name: customerName },
      update: {},
    });
    await prisma.auditLog.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action: "CREATE",
        entityType: "Deal",
        entityId: deal.id,
        newValue: JSON.stringify({ dealName, status: "DRAFT" }),
      },
    });
    res.status(201).json(dealToResponse(deal));
  } catch (err) {
    logger.error({ err }, "CreateDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/deals/:id
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const { customerName, dealName, dealType, revenue, cost, contractStartDate, contractEndDate, status, metadata } =
    req.body;
  try {
    const existing = await prisma.deal.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Deal not found" }); return; }

    const newRev  = revenue  != null ? parseFloat(revenue)  : existing.revenue;
    const newCost = cost     != null ? parseFloat(cost)     : existing.cost;
    const gp      = newRev - newCost;
    const gpPct   = newRev > 0 ? Math.round((gp / newRev) * 10000) / 100 : 0;
    const newType = dealType ?? existing.dealType;
    let pct = existing.commissionPercentage;
    if (dealType && dealType !== existing.dealType) {
      pct = await lookupCommissionPct(req.user!.tenantId, existing.salesExecutiveId, newType);
    }
    const comm = Math.round(gp * (pct / 100) * 100) / 100;

    const deal = await prisma.deal.update({
      where: { id: req.params.id as string },
      data: {
        ...(customerName !== undefined && { customerName }),
        ...(dealName     !== undefined && { dealName }),
        ...(dealType     !== undefined && { dealType, commissionPercentage: pct }),
        revenue: newRev,
        cost: newCost,
        grossProfit: gp,
        grossProfitPercentage: gpPct,
        calculatedCommission: comm,
        ...(status !== undefined && { status }),
        ...(contractStartDate !== undefined && {
          contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
        }),
        ...(contractEndDate !== undefined && {
          contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        }),
        ...(metadata !== undefined && { metadata }),
      },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action: "UPDATE",
        entityType: "Deal",
        entityId: deal.id,
        oldValue: JSON.stringify({ status: existing.status }),
        newValue: JSON.stringify({ status: deal.status }),
      },
    });
    res.json(dealToResponse(deal));
  } catch (err) {
    logger.error({ err }, "UpdateDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/deals/:id/submit — submit for approval
router.post("/:id/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.deal.findFirst({
      where: {
        id: req.params.id as string,
        tenantId: req.user!.tenantId,
        salesExecutiveId: req.user!.userId,
      },
    });
    if (!existing) { res.status(404).json({ error: "Deal not found" }); return; }
    if (!["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"].includes(existing.status)) {
      res.status(400).json({ error: "Only DRAFT or CHANGES_REQUESTED deals can be submitted for approval" });
      return;
    }

    // Load ApprovalConfig; fall back to default 3-level if none configured
    const configs = await prisma.approvalConfig.findMany({
      where: { tenantId: req.user!.tenantId, isActive: true },
      orderBy: { stepOrder: "asc" },
    });

    const steps =
      configs.length > 0
        ? configs.map((c) => ({
            tenantId: req.user!.tenantId,
            dealId: existing.id,
            approvalLevel: c.stepOrder,
            stepName: c.stepName,
            approverRole: c.approverRole as any,
            approverUserId: c.approverUserId ?? null,
            status: "PENDING" as const,
          }))
        : [
            { tenantId: req.user!.tenantId, dealId: existing.id, approvalLevel: 1, stepName: "Sales Manager Approval", approverRole: "MANAGER" as any, approverUserId: null, status: "PENDING" as const },
            { tenantId: req.user!.tenantId, dealId: existing.id, approvalLevel: 2, stepName: "Finance Approval",        approverRole: "FINANCE" as any, approverUserId: null, status: "PENDING" as const },
            { tenantId: req.user!.tenantId, dealId: existing.id, approvalLevel: 3, stepName: "Executive Approval",     approverRole: "EXECUTIVE" as any, approverUserId: null, status: "PENDING" as const },
          ];

    const deal = await prisma.$transaction(async (tx) => {
      await tx.approvalWorkflow.deleteMany({ where: { dealId: existing.id } });
      await tx.approvalWorkflow.createMany({ data: steps });

      const updatedDeal = await tx.deal.update({
        where: { id: req.params.id as string },
        data: { status: "PENDING_APPROVAL", submittedAt: new Date(), submittedById: req.user!.userId },
        include: { salesExecutive: { select: { firstName: true, lastName: true } } },
      });

      await tx.wallet.upsert({
        where: { userId: req.user!.userId },
        create: {
          tenantId: req.user!.tenantId,
          userId: req.user!.userId,
          pendingBalance: updatedDeal.calculatedCommission,
        },
        update: { pendingBalance: { increment: updatedDeal.calculatedCommission } },
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: req.user!.userId,
          action: "SUBMIT",
          entityType: "Deal",
          entityId: updatedDeal.id,
          oldValue: JSON.stringify({ status: existing.status }),
          newValue: JSON.stringify({ status: "PENDING_APPROVAL" }),
        },
      });

      return updatedDeal;
    });

    // Notify first-level approver(s)
    const firstStep = steps[0];
    if (firstStep.approverUserId) {
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: firstStep.approverUserId,
          title: "New Deal Approval Required",
          message: `${deal.dealName} for ${deal.customerName} requires your approval`,
          type: "DEAL_SUBMITTED",
          readStatus: false,
        },
      });
    } else {
      const roleUsers = await prisma.user.findMany({
        where: { tenantId: req.user!.tenantId, role: firstStep.approverRole, status: "ACTIVE" },
      });
      if (roleUsers.length > 0) {
        await prisma.notification.createMany({
          data: roleUsers.map((u) => ({
            tenantId: req.user!.tenantId,
            userId: u.id,
            title: "New Deal Approval Required",
            message: `${deal.dealName} for ${deal.customerName} requires your approval`,
            type: "DEAL_SUBMITTED" as const,
            readStatus: false,
          })),
        });
      }
    }

    res.json(dealToResponse(deal));
  } catch (err) {
    logger.error({ err }, "SubmitDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/deals/:id
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.deal.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Deal not found" }); return; }
    await prisma.deal.delete({ where: { id: req.params.id as string } });
    await prisma.auditLog.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action: "DELETE",
        entityType: "Deal",
        entityId: existing.id,
        oldValue: JSON.stringify({ dealName: existing.dealName, status: existing.status }),
      },
    });
    res.json({ message: "Deal deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as dealsRouter };

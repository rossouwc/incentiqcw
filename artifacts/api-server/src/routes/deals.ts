/**
 * deals.ts — Compatibility shim
 *
 * All reads and writes are backed by CommissionEvent.  The response shape
 * mirrors the old Deal API so legacy callers (generated hooks, all-deals,
 * team-deals) continue to work without changes.
 *
 * Field mapping (CommissionEvent → Deal shape):
 *   eventTitle                → dealName
 *   eventDataJson.customerName → customerName
 *   eventDataJson.dealType    → dealType  (falls back to eventType)
 *   revenueAmount             → revenue
 *   costAmount                → cost
 *   grossProfitAmount         → grossProfit
 *   commissionPercentage      → commissionPercentage
 *   calculatedCommissionAmount → commission
 *   approvalStatus            → status
 */

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a CommissionEvent row into the legacy Deal response shape. */
function eventToDealResponse(e: any) {
  const data: Record<string, unknown> =
    (e.eventDataJson as Record<string, unknown> | null) ?? {};
  return {
    id:                   e.id,
    tenantId:             e.tenantId,
    salesExecutiveId:     e.salesExecutiveId,
    salesExecutiveName:   e.salesExecutive
      ? `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`
      : "",
    customerName:         (data.customerName as string | undefined) ?? "",
    dealName:             e.eventTitle,
    dealType:             (data.dealType as string | undefined) ?? e.eventType ?? "NET_NEW",
    contractStartDate:    (data.contractStartDate as string | undefined) ?? null,
    contractEndDate:      (data.contractEndDate   as string | undefined) ?? null,
    revenue:              e.revenueAmount,
    cost:                 e.costAmount,
    grossProfit:          e.grossProfitAmount,
    grossProfitPercentage:(data.grossProfitPercentage as number | undefined)
      ?? (e.revenueAmount > 0
        ? Math.round((e.grossProfitAmount / e.revenueAmount) * 10000) / 100
        : 0),
    commissionPercentage: e.commissionPercentage,
    commission:           e.calculatedCommissionAmount,
    status:               e.approvalStatus,
    submittedById:        null,
    submittedAt:          e.submittedAt?.toISOString() ?? null,
    metadata:             e.eventDataJson ?? null,
    createdAt:            e.createdAt.toISOString(),
    updatedAt:            e.updatedAt.toISOString(),
  };
}

const COMM_PCT_FALLBACK: Record<string, number> = {
  NET_NEW: 10, RENEWAL: 5, UPSELL: 7, CROSS_SELL: 6,
};

async function lookupCommissionPct(
  tenantId: string,
  salesExecutiveId: string,
  dealType: string,
): Promise<number> {
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
        (gr) => gr.rule?.dealType === dealType && gr.rule?.status === "ACTIVE",
      );
      if (match) return match.rule.commissionPercentage;
    }
  } catch (err) {
    logger.warn({ err }, "Commission rule lookup failed, using fallback");
  }
  return COMM_PCT_FALLBACK[dealType] ?? 10;
}

// ── GET /api/deals ─────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const {
    status, dealType, page = "1", limit = "20", salesExecutiveId,
  } = req.query as Record<string, string>;

  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: any = {
    tenantId: req.user!.tenantId,
    ...(isSalesExec && { salesExecutiveId: req.user!.userId }),
    ...(!isSalesExec && salesExecutiveId && { salesExecutiveId }),
    ...(status   && { approvalStatus: status }),
    ...(dealType && {
      OR: [
        { eventType: dealType },
        { eventDataJson: { path: ["dealType"], equals: dealType } },
      ],
    }),
  };

  try {
    const [data, total] = await Promise.all([
      prisma.commissionEvent.findMany({
        where,
        skip,
        take:     parseInt(limit),
        orderBy:  { createdAt: "desc" },
        include:  { salesExecutive: { select: { firstName: true, lastName: true } } },
      }),
      prisma.commissionEvent.count({ where }),
    ]);

    res.json({
      data:  data.map(eventToDealResponse),
      total,
      page:  parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    logger.error({ err }, "ListDeals(shim) error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/deals/:id ─────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
      include: {
        salesExecutive: { select: { firstName: true, lastName: true } },
        approvals: { orderBy: { approvalStep: "asc" } },
      },
    });
    if (!event) { res.status(404).json({ error: "Deal not found" }); return; }

    res.json({
      ...eventToDealResponse(event),
      approvalWorkflows: (event.approvals as any[]).map((a) => ({
        id:            a.id,
        approvalLevel: a.approvalStep,
        stepName:      a.stepName ?? null,
        approverRole:  a.approverRole,
        approverName:  null,
        status:        a.status,
        comments:      a.comments,
        approvedAt:    a.approvedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GetDeal(shim) error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/deals — creates a CommissionEvent in DRAFT ───────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const {
    customerName, dealName, dealType, revenue, cost,
    contractStartDate, contractEndDate, metadata,
  } = req.body;

  if (!customerName || !dealName || !dealType || revenue == null || cost == null) {
    res.status(400).json({
      error: "customerName, dealName, dealType, revenue and cost are required",
    });
    return;
  }

  const rev = parseFloat(revenue);
  const cst = parseFloat(cost);
  const gp  = rev - cst;
  const gpPct = rev > 0 ? Math.round((gp / rev) * 10000) / 100 : 0;
  const pct = await lookupCommissionPct(req.user!.tenantId, req.user!.userId, dealType);
  const commission = Math.round(gp * (pct / 100) * 100) / 100;

  const extraMeta = typeof metadata === "object" && metadata !== null ? metadata : {};
  const eventDataJson: Record<string, unknown> = {
    ...extraMeta,
    customerName,
    dealType,
    grossProfitPercentage: gpPct,
    ...(contractStartDate && { contractStartDate }),
    ...(contractEndDate   && { contractEndDate }),
  };

  try {
    const event = await prisma.commissionEvent.create({
      data: {
        tenantId:                   req.user!.tenantId,
        salesExecutiveId:           req.user!.userId,
        eventTitle:                 dealName,
        eventType:                  dealType,
        eventDataJson:              eventDataJson as any,
        revenueAmount:              rev,
        costAmount:                 cst,
        grossProfitAmount:          gp,
        commissionBaseAmount:       gp,
        commissionPercentage:       pct,
        calculatedCommissionAmount: commission,
        triggerStatus:              "NOT_TRIGGERED",
        approvalStatus:             "DRAFT",
        walletStatus:               "PENDING",
      },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });

    await prisma.customer.upsert({
      where:  { tenantId_name: { tenantId: req.user!.tenantId, name: customerName } },
      create: { tenantId: req.user!.tenantId, name: customerName },
      update: {},
    });
    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action:     "CREATE",
        entityType: "CommissionEvent",
        entityId:   event.id,
        newValue:   JSON.stringify({ dealName, status: "DRAFT" }),
      },
    });

    res.status(201).json(eventToDealResponse(event));
  } catch (err) {
    logger.error({ err }, "CreateDeal(shim) error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/deals/:id ───────────────────────────────────────────────────────

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const {
    customerName, dealName, dealType, revenue, cost,
    contractStartDate, contractEndDate, status, metadata,
  } = req.body;

  try {
    const existing = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Deal not found" }); return; }

    const prevData = (existing.eventDataJson as Record<string, unknown> | null) ?? {};
    const newRev  = revenue  != null ? parseFloat(revenue)  : existing.revenueAmount;
    const newCost = cost     != null ? parseFloat(cost)     : existing.costAmount;
    const gp      = newRev - newCost;
    const gpPct   = newRev > 0 ? Math.round((gp / newRev) * 10000) / 100 : 0;
    const newType = dealType ?? prevData.dealType ?? existing.eventType;
    let pct = existing.commissionPercentage;
    if (dealType && dealType !== (prevData.dealType ?? existing.eventType)) {
      pct = await lookupCommissionPct(
        req.user!.tenantId,
        existing.salesExecutiveId,
        newType as string,
      );
    }
    const comm = Math.round(gp * (pct / 100) * 100) / 100;

    const extraMeta =
      typeof metadata === "object" && metadata !== null ? metadata : {};
    const newEventDataJson: Record<string, unknown> = {
      ...prevData,
      ...extraMeta,
      ...(customerName !== undefined && { customerName }),
      ...(dealType     !== undefined && { dealType }),
      grossProfitPercentage: gpPct,
      ...(contractStartDate !== undefined && { contractStartDate: contractStartDate ?? null }),
      ...(contractEndDate   !== undefined && { contractEndDate:   contractEndDate   ?? null }),
    };

    const event = await prisma.commissionEvent.update({
      where: { id: req.params.id as string },
      data: {
        ...(dealName !== undefined && { eventTitle: dealName }),
        ...(dealType !== undefined && { eventType: dealType, commissionPercentage: pct }),
        eventDataJson:              newEventDataJson as any,
        revenueAmount:              newRev,
        costAmount:                 newCost,
        grossProfitAmount:          gp,
        commissionBaseAmount:       gp,
        calculatedCommissionAmount: comm,
        ...(status !== undefined && { approvalStatus: status }),
      },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action:     "UPDATE",
        entityType: "CommissionEvent",
        entityId:   event.id,
        oldValue:   JSON.stringify({ approvalStatus: existing.approvalStatus }),
        newValue:   JSON.stringify({ approvalStatus: event.approvalStatus }),
      },
    });

    res.json(eventToDealResponse(event));
  } catch (err) {
    logger.error({ err }, "UpdateDeal(shim) error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/deals/:id/submit ─────────────────────────────────────────────────

router.post("/:id/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.commissionEvent.findFirst({
      where: {
        id:               req.params.id as string,
        tenantId:         req.user!.tenantId,
        salesExecutiveId: req.user!.userId,
      },
    });
    if (!existing) { res.status(404).json({ error: "Deal not found" }); return; }
    if (existing.approvalStatus !== "DRAFT" && existing.approvalStatus !== "CHANGES_REQUESTED") {
      res.status(400).json({ error: "Only DRAFT or CHANGES_REQUESTED events can be submitted" });
      return;
    }

    const configs = await prisma.approvalConfig.findMany({
      where: { tenantId: req.user!.tenantId, isActive: true },
      orderBy: { stepOrder: "asc" },
    });

    const stepRecords =
      configs.length > 0
        ? configs.map((c, idx) => ({
            tenantId:          req.user!.tenantId,
            commissionEventId: existing.id,
            approvalStep:      c.stepOrder,
            stepName:          c.stepName,
            approverRole:      c.approverRole as any,
            approverUserId:    c.approverUserId ?? null,
            status:            (idx === 0 ? "PENDING" : "WAITING") as any,
          }))
        : [
            { tenantId: req.user!.tenantId, commissionEventId: existing.id, approvalStep: 1, stepName: "Sales Manager Approval", approverRole: "MANAGER" as any, approverUserId: null, status: "PENDING" as any },
            { tenantId: req.user!.tenantId, commissionEventId: existing.id, approvalStep: 2, stepName: "Finance Approval",        approverRole: "FINANCE" as any, approverUserId: null, status: "WAITING" as any },
            { tenantId: req.user!.tenantId, commissionEventId: existing.id, approvalStep: 3, stepName: "Executive Approval",      approverRole: "EXECUTIVE" as any, approverUserId: null, status: "WAITING" as any },
          ];

    await prisma.$transaction(async (tx) => {
      await tx.commissionEventApproval.deleteMany({ where: { commissionEventId: existing.id } });
      await tx.commissionEventApproval.createMany({ data: stepRecords });
      await tx.commissionEvent.update({
        where: { id: existing.id },
        data:  { approvalStatus: "PENDING_APPROVAL", submittedAt: new Date() },
      });
      await tx.wallet.upsert({
        where:  { userId: req.user!.userId },
        create: {
          tenantId:       req.user!.tenantId,
          userId:         req.user!.userId,
          pendingBalance: existing.calculatedCommissionAmount,
        },
        update: { pendingBalance: { increment: existing.calculatedCommissionAmount } },
      });
      await tx.auditLog.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     req.user!.userId,
          action:     "SUBMIT",
          entityType: "CommissionEvent",
          entityId:   existing.id,
          oldValue:   JSON.stringify({ approvalStatus: existing.approvalStatus }),
          newValue:   JSON.stringify({ approvalStatus: "PENDING_APPROVAL" }),
        },
      });
    });

    const updated = await prisma.commissionEvent.findUnique({
      where:   { id: existing.id },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });
    res.json(eventToDealResponse(updated));
  } catch (err) {
    logger.error({ err }, "SubmitDeal(shim) error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/deals/:id ──────────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Deal not found" }); return; }
    await prisma.commissionEvent.delete({ where: { id: req.params.id as string } });
    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action:     "DELETE",
        entityType: "CommissionEvent",
        entityId:   existing.id,
        oldValue:   JSON.stringify({ eventTitle: existing.eventTitle, approvalStatus: existing.approvalStatus }),
      },
    });
    res.json({ message: "Deal deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteDeal(shim) error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as dealsRouter };

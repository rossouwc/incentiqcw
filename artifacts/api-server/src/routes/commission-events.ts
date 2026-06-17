import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getIndustryConfig } from "../industry-config";

const router = Router();

// ── Commission % lookup (mirrors deals.ts logic) ─────────────────────────────

async function lookupCommissionPct(tenantId: string, salesExecutiveId: string): Promise<number> {
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
        (gr) => gr.rule?.status === "ACTIVE"
      );
      if (match) return match.rule.commissionPercentage;
    }
  } catch (err) {
    logger.warn({ err }, "Commission rule lookup failed, using fallback");
  }
  return 10;
}

// ── Financial extraction from eventDataJson ───────────────────────────────────

function extractFinancials(data: Record<string, any>, fieldDefs: any[]) {
  let revenueAmount = 0;
  let costAmount = 0;
  let commissionBaseAmount = 0;
  let commissionPct: number | null = null;

  for (const f of fieldDefs) {
    const raw = data[f.fieldKey];
    if (raw === undefined || raw === null || raw === "") continue;
    const num = parseFloat(String(raw).replace(/[^0-9.-]/g, "")) || 0;
    switch (f.calculationRole) {
      case "REVENUE":          revenueAmount        = num; break;
      case "COST":             costAmount           = num; break;
      case "COMMISSION_BASE":  commissionBaseAmount = num; break;
      case "COMMISSION_PCT":   commissionPct        = num; break;
    }
  }

  const grossProfitAmount = revenueAmount - costAmount;
  if (commissionBaseAmount === 0) {
    commissionBaseAmount = grossProfitAmount > 0 ? grossProfitAmount : revenueAmount;
  }

  return { revenueAmount, costAmount, grossProfitAmount, commissionBaseAmount, commissionPct };
}

// ── Load TenantIndustryConfig with template + field defs ─────────────────────

async function loadTenantConfig(tenantId: string) {
  const tic = await prisma.tenantIndustryConfig.findUnique({
    where: { tenantId },
    include: {
      industryTemplate: {
        include: {
          dealFieldDefinitions: {
            where: { isActive: true },
            orderBy: { displayOrder: "asc" },
          },
        },
      },
    },
  });

  if (tic) {
    return {
      industryCode:       tic.industryTemplate.code,
      industryTemplateId: tic.industryTemplate.id,
      dealEntityName:     tic.dealEntityName,
      commissionEventName: tic.commissionEventName,
      triggerEventName:   tic.triggerEventName,
      fieldDefs:          tic.industryTemplate.dealFieldDefinitions,
    };
  }

  // No TenantIndustryConfig — fall back to tenant.industry code
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const code = tenant?.industry ?? "CUSTOM";
  const template = await prisma.industryTemplate.findUnique({
    where: { code },
    include: {
      dealFieldDefinitions: {
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  return {
    industryCode:       code,
    industryTemplateId: template?.id ?? null,
    dealEntityName:     null,
    commissionEventName: null,
    triggerEventName:   null,
    fieldDefs:          template?.dealFieldDefinitions ?? [],
  };
}

// ── GET /api/commission-events/field-config ───────────────────────────────────
//
// Returns the tenant's industry configuration and DealFieldDefinitions so the
// frontend can render a fully dynamic form without hard-coded field lists.

router.get("/field-config", requireAuth, async (req: Request, res: Response) => {
  try {
    const tc = await loadTenantConfig(req.user!.tenantId);
    const cfg = getIndustryConfig(tc.industryCode);

    res.json({
      industryCode:         tc.industryCode,
      industryTemplateId:   tc.industryTemplateId,
      industryName:         cfg.label,
      dealEntityName:       tc.dealEntityName        ?? cfg.eventLabel,
      commissionEventName:  tc.commissionEventName   ?? cfg.eventLabel,
      triggerEventName:     tc.triggerEventName      ?? cfg.triggerLabel,
      showGP:               cfg.showGP,
      revenueLabel:         cfg.revenueLabel,
      costLabel:            cfg.costLabel,
      commissionMethodLabel: cfg.commissionMethodLabel,
      eventTypes:           cfg.eventTypes,
      fieldDefinitions:     tc.fieldDefs.map((f) => ({
        id:              f.id,
        fieldKey:        f.fieldKey,
        fieldLabel:      f.fieldLabel,
        fieldType:       f.fieldType,
        isRequired:      f.isRequired,
        displayOrder:    f.displayOrder,
        calculationRole: f.calculationRole,
        optionsJson:     f.optionsJson,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GetFieldConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/commission-events ────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId: req.user!.tenantId,
    ...(isSalesExec && { salesExecutiveId: req.user!.userId }),
  };
  try {
    const events = await prisma.commissionEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });
    res.json({
      data: events.map((e) => ({
        id:                        e.id,
        eventTitle:                e.eventTitle,
        eventType:                 e.eventType,
        eventDataJson:             e.eventDataJson,
        revenueAmount:             e.revenueAmount,
        costAmount:                e.costAmount,
        grossProfitAmount:         e.grossProfitAmount,
        commissionBaseAmount:      e.commissionBaseAmount,
        commissionPercentage:      e.commissionPercentage,
        calculatedCommissionAmount: e.calculatedCommissionAmount,
        triggerStatus:             e.triggerStatus,
        approvalStatus:            e.approvalStatus,
        walletStatus:              e.walletStatus,
        submittedAt:               e.submittedAt?.toISOString() ?? null,
        createdAt:                 e.createdAt.toISOString(),
        salesExecutiveName:        e.salesExecutive
          ? `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`
          : "",
      })),
    });
  } catch (err) {
    logger.error({ err }, "ListCommissionEvents error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/commission-events/:id ────────────────────────────────────────────

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
      include: {
        salesExecutive: { select: { firstName: true, lastName: true } },
        approvals: { orderBy: { approvalStep: "asc" } },
      },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id:                        event.id,
      eventTitle:                event.eventTitle,
      eventType:                 event.eventType,
      eventDataJson:             event.eventDataJson,
      revenueAmount:             event.revenueAmount,
      costAmount:                event.costAmount,
      grossProfitAmount:         event.grossProfitAmount,
      commissionBaseAmount:      event.commissionBaseAmount,
      commissionPercentage:      event.commissionPercentage,
      calculatedCommissionAmount: event.calculatedCommissionAmount,
      approvalStatus:            event.approvalStatus,
      triggerStatus:             event.triggerStatus,
      walletStatus:              event.walletStatus,
      submittedAt:               event.submittedAt?.toISOString() ?? null,
      createdAt:                 event.createdAt.toISOString(),
      salesExecutiveName:        event.salesExecutive
        ? `${event.salesExecutive.firstName} ${event.salesExecutive.lastName}`
        : "",
      approvals: (event.approvals as any[]).map((a) => ({
        id:            a.id,
        approvalStep:  a.approvalStep,
        approverRole:  a.approverRole,
        status:        a.status,
        comments:      a.comments,
        approvedAt:    a.approvedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GetCommissionEvent error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events ───────────────────────────────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { eventTitle, eventType, eventDataJson } = req.body;

  if (!eventTitle || !eventType) {
    res.status(400).json({ error: "eventTitle and eventType are required" });
    return;
  }

  try {
    const tc = await loadTenantConfig(req.user!.tenantId);
    const dataMap: Record<string, any> = eventDataJson ?? {};

    const {
      revenueAmount, costAmount, grossProfitAmount,
      commissionBaseAmount, commissionPct: explicitPct,
    } = extractFinancials(dataMap, tc.fieldDefs);

    const commissionPct = explicitPct !== null
      ? explicitPct
      : await lookupCommissionPct(req.user!.tenantId, req.user!.userId);

    const calculatedCommissionAmount =
      Math.round(commissionBaseAmount * (commissionPct / 100) * 100) / 100;

    const event = await prisma.commissionEvent.create({
      data: {
        tenantId:        req.user!.tenantId,
        salesExecutiveId: req.user!.userId,
        ...(tc.industryTemplateId && { industryTemplateId: tc.industryTemplateId }),
        eventTitle,
        eventType,
        eventDataJson: dataMap,
        revenueAmount,
        costAmount,
        grossProfitAmount,
        commissionBaseAmount,
        commissionPercentage:        commissionPct,
        calculatedCommissionAmount,
        triggerStatus:   "PENDING",
        approvalStatus:  "DRAFT",
        walletStatus:    "PENDING",
      },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action:     "CREATE",
        entityType: "CommissionEvent",
        entityId:   event.id,
        newValue:   JSON.stringify({ eventTitle, eventType, approvalStatus: "DRAFT" }),
      },
    });

    res.status(201).json({
      id:                        event.id,
      eventTitle:                event.eventTitle,
      eventType:                 event.eventType,
      approvalStatus:            event.approvalStatus,
      revenueAmount:             event.revenueAmount,
      calculatedCommissionAmount: event.calculatedCommissionAmount,
    });
  } catch (err) {
    logger.error({ err }, "CreateCommissionEvent error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events/:id/submit ────────────────────────────────────

router.post("/:id/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.commissionEvent.findFirst({
      where: {
        id:              req.params.id as string,
        tenantId:        req.user!.tenantId,
        salesExecutiveId: req.user!.userId,
      },
    });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.approvalStatus !== "DRAFT") {
      res.status(400).json({ error: "Only DRAFT events can be submitted" });
      return;
    }

    // Load active TenantApprovalWorkflow
    const workflow = await prisma.tenantApprovalWorkflow.findFirst({
      where: { tenantId: req.user!.tenantId, isActive: true },
    });

    const steps: any[] = workflow?.approvalStepsJson
      ? (workflow.approvalStepsJson as any[]).map((s: any) => ({
          tenantId:         req.user!.tenantId,
          commissionEventId: existing.id,
          approvalStep:     s.step,
          approverRole:     s.approverRole,
          approverUserId:   s.approverUserId ?? null,
          status:           "PENDING",
        }))
      : [
          { tenantId: req.user!.tenantId, commissionEventId: existing.id, approvalStep: 1, approverRole: "MANAGER", approverUserId: null, status: "PENDING" },
          { tenantId: req.user!.tenantId, commissionEventId: existing.id, approvalStep: 2, approverRole: "FINANCE", approverUserId: null, status: "PENDING" },
          { tenantId: req.user!.tenantId, commissionEventId: existing.id, approvalStep: 3, approverRole: "ADMIN",   approverUserId: null, status: "PENDING" },
        ];

    await prisma.$transaction(async (tx) => {
      await tx.commissionEventApproval.deleteMany({ where: { commissionEventId: existing.id } });
      await tx.commissionEventApproval.createMany({ data: steps });
      await tx.commissionEvent.update({
        where: { id: existing.id },
        data: { approvalStatus: "PENDING_APPROVAL", submittedAt: new Date() },
      });
      await tx.wallet.upsert({
        where: { userId: req.user!.userId },
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
          oldValue:   JSON.stringify({ approvalStatus: "DRAFT" }),
          newValue:   JSON.stringify({ approvalStatus: "PENDING_APPROVAL" }),
        },
      });
    });

    res.json({ message: "Submitted for approval" });
  } catch (err) {
    logger.error({ err }, "SubmitCommissionEvent error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/commission-events/:id ─────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!["DRAFT"].includes(existing.approvalStatus)) {
      res.status(400).json({ error: "Only DRAFT events can be deleted" });
      return;
    }
    await prisma.commissionEvent.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteCommissionEvent error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as commissionEventsRouter };

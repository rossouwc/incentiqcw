import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getIndustryConfig } from "../industry-config";
import { calculateCommission } from "../lib/commission-formula";
import { getDefaultWorkflow, parseWorkflowSteps } from "../lib/industry-workflows";
import { getIndustryTriggers } from "../lib/industry-triggers";
import { ApprovalStatus, TriggerStatus } from "@prisma/client";

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
    const [tc, defaultCommissionPct] = await Promise.all([
      loadTenantConfig(req.user!.tenantId),
      lookupCommissionPct(req.user!.tenantId, req.user!.userId),
    ]);
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
      defaultCommissionPct,
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
        stepName:      a.stepName ?? null,
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
    const [tc, commissionPct] = await Promise.all([
      loadTenantConfig(req.user!.tenantId),
      lookupCommissionPct(req.user!.tenantId, req.user!.userId),
    ]);
    const dataMap: Record<string, any> = eventDataJson ?? {};

    const calcResult = calculateCommission(tc.industryCode, dataMap, commissionPct);

    const event = await prisma.commissionEvent.create({
      data: {
        tenantId:        req.user!.tenantId,
        salesExecutiveId: req.user!.userId,
        ...(tc.industryTemplateId && { industryTemplateId: tc.industryTemplateId }),
        eventTitle,
        eventType,
        eventDataJson: dataMap,
        revenueAmount:             calcResult.revenueAmount,
        costAmount:                calcResult.costAmount,
        grossProfitAmount:         calcResult.grossProfitAmount,
        commissionBaseAmount:      calcResult.commissionBaseAmount,
        commissionPercentage:      calcResult.commissionPercentage,
        calculatedCommissionAmount: calcResult.calculatedCommissionAmount,
        triggerStatus:   "NOT_TRIGGERED",
        approvalStatus:  "DRAFT",
        walletStatus:    "PENDING",
      },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
    });

    // Auto-save any customer-like field value for future autocomplete
    const CUSTOMER_KEYS = ["customerName", "clientName", "candidateName", "buyerName", "accountName", "tenantName", "recruiterClient", "partnerName"];
    for (const key of CUSTOMER_KEYS) {
      const customerVal = typeof dataMap[key] === "string" ? (dataMap[key] as string).trim() : null;
      if (customerVal) {
        await prisma.customer.upsert({
          where:  { tenantId_name: { tenantId: req.user!.tenantId, name: customerVal } },
          create: { tenantId: req.user!.tenantId, name: customerVal },
          update: {},
        }).catch(() => {});
        break;
      }
    }

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
        id:               req.params.id as string,
        tenantId:         req.user!.tenantId,
        salesExecutiveId: req.user!.userId,
      },
      include: { industryTemplate: { select: { code: true } } },
    });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.approvalStatus !== "DRAFT") {
      res.status(400).json({ error: "Only DRAFT events can be submitted" });
      return;
    }

    // ── Resolve workflow steps ────────────────────────────────────────────────
    // Priority: industry-specific tenant workflow → generic tenant workflow → code defaults

    const industryCode: string =
      (existing.industryTemplate as any)?.code ?? "CUSTOM";

    // 1. Tenant workflow for this specific industry
    let tenantWorkflow = await prisma.tenantApprovalWorkflow.findFirst({
      where: { tenantId: req.user!.tenantId, isActive: true, industryCode },
    });

    // 2. Generic tenant workflow (no industry code)
    if (!tenantWorkflow) {
      tenantWorkflow = await prisma.tenantApprovalWorkflow.findFirst({
        where: { tenantId: req.user!.tenantId, isActive: true, industryCode: null },
      });
    }

    const resolvedSteps =
      (tenantWorkflow ? parseWorkflowSteps(tenantWorkflow.approvalStepsJson) : null)
      ?? getDefaultWorkflow(industryCode);

    // Build CommissionEventApproval records — first step PENDING, rest WAITING
    const stepRecords = resolvedSteps.map((s, idx) => ({
      tenantId:          req.user!.tenantId,
      commissionEventId: existing.id,
      approvalStep:      s.step,
      stepName:          s.stepName,
      approverRole:      s.approverRole as any,
      approverUserId:    null as string | null,
      status:            (idx === 0 ? ApprovalStatus.PENDING : ApprovalStatus.WAITING),
    }));

    // Build trigger records for this industry + event type
    const industryTriggers = getIndustryTriggers(industryCode, existing.eventType);
    const triggerRecords = industryTriggers.map((t) => ({
      tenantId:          req.user!.tenantId,
      commissionEventId: existing.id,
      triggerEventType:  t.type,
      label:             t.label,
      description:       t.description ?? null,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.commissionEventApproval.deleteMany({ where: { commissionEventId: existing.id } });
      await tx.commissionEventApproval.createMany({ data: stepRecords });

      // Reset and create trigger events
      await tx.commissionEventTrigger.deleteMany({ where: { commissionEventId: existing.id } });
      await tx.commissionEventTrigger.createMany({ data: triggerRecords });

      await tx.commissionEvent.update({
        where: { id: existing.id },
        data: { approvalStatus: "PENDING_APPROVAL", triggerStatus: "NOT_TRIGGERED", submittedAt: new Date() },
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
          oldValue:   JSON.stringify({ approvalStatus: "DRAFT" }),
          newValue:   JSON.stringify({ approvalStatus: "PENDING_APPROVAL", industryCode, triggerCount: triggerRecords.length }),
        },
      });
    });

    // ── Notify first approver(s) ──────────────────────────────────────────────
    const firstStep = resolvedSteps[0];
    if (firstStep) {
      const approverUsers = await prisma.user.findMany({
        where: { tenantId: req.user!.tenantId, role: firstStep.approverRole as any, status: "ACTIVE" },
      });
      if (approverUsers.length > 0) {
        await prisma.notification.createMany({
          data: approverUsers.map((u: any) => ({
            tenantId:   req.user!.tenantId,
            userId:     u.id,
            title:      "Commission Event Requires Your Approval",
            message:    `"${existing.eventTitle}" has been submitted and is awaiting ${firstStep.stepName}.`,
            type:       "DEAL_SUBMITTED",
            readStatus: false,
          })),
        });
      }
    }

    res.json({ message: "Submitted for approval" });
  } catch (err) {
    logger.error({ err }, "SubmitCommissionEvent error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── Wallet credit helper — only fires when BOTH approved AND triggered ─────────

async function checkAndCreditWallet(commissionEventId: string, tenantId: string) {
  const ev = await prisma.commissionEvent.findUnique({
    where: { id: commissionEventId },
  });
  if (!ev) return;
  if (ev.approvalStatus !== "APPROVED") return;
  if (ev.triggerStatus  !== "TRIGGERED") return;
  if (ev.walletStatus   === "CREDITED")  return; // already done

  const wallet = await prisma.wallet.findUnique({ where: { userId: ev.salesExecutiveId } });
  if (!wallet) return;

  const amt = ev.calculatedCommissionAmount;
  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { increment: amt },
        pendingBalance:   { decrement: amt },
      },
    });
    await tx.walletTransaction.create({
      data: {
        tenantId,
        walletId:        wallet.id,
        transactionType: "TRIGGER_RELEASED",
        amount:          amt,
        referenceType:   "COMMISSION_EVENT",
        referenceId:     ev.id,
        description:     `Commission released: ${ev.eventTitle}`,
      },
    });
    await tx.commissionEvent.update({
      where: { id: commissionEventId },
      data:  { walletStatus: "CREDITED" },
    });
    await tx.notification.create({
      data: {
        tenantId,
        userId:     ev.salesExecutiveId,
        title:      "Commission Released to Wallet",
        message:    `R${amt.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} commission for "${ev.eventTitle}" is now available in your wallet.`,
        type:       "WALLET_CREDITED",
        readStatus: false,
      },
    });
  });
}

// ── GET /api/commission-events/:id/triggers ────────────────────────────────────

router.get("/:id/triggers", requireAuth, async (req: Request, res: Response) => {
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }

    const triggers = await prisma.commissionEventTrigger.findMany({
      where:   { commissionEventId: req.params.id as string },
      include: { triggeredBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      triggerStatus: event.triggerStatus,
      triggers: triggers.map((t) => ({
        id:               t.id,
        triggerEventType: t.triggerEventType,
        label:            t.label,
        description:      t.description ?? null,
        status:           t.status,
        notes:            t.notes ?? null,
        triggeredById:    t.triggeredById ?? null,
        triggeredByName:  t.triggeredBy
          ? `${t.triggeredBy.firstName} ${t.triggeredBy.lastName}`
          : null,
        triggeredAt: t.triggeredAt?.toISOString() ?? null,
        createdAt:   t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "GetTriggers error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events/:id/triggers/:triggerId/action ─────────────────

router.post("/:id/triggers/:triggerId/action", requireAuth, async (req: Request, res: Response) => {
  const { action, notes } = req.body as { action?: string; notes?: string };

  if (!action || !["TRIGGER", "WAIVE", "FAIL"].includes(action)) {
    res.status(400).json({ error: "action must be TRIGGER, WAIVE, or FAIL" });
    return;
  }
  if (!["MANAGER", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role)) {
    res.status(403).json({ error: "Not authorised to manage trigger events" });
    return;
  }

  try {
    const trigger = await prisma.commissionEventTrigger.findFirst({
      where: {
        id:               req.params.triggerId as string,
        commissionEventId: req.params.id as string,
        tenantId:         req.user!.tenantId,
      },
    });
    if (!trigger) { res.status(404).json({ error: "Trigger not found" }); return; }

    const newStatus =
      action === "TRIGGER" ? TriggerStatus.TRIGGERED
      : action === "WAIVE" ? TriggerStatus.WAIVED
      : TriggerStatus.FAILED;

    await prisma.commissionEventTrigger.update({
      where: { id: trigger.id },
      data: {
        status:        newStatus,
        notes:         notes ?? null,
        triggeredById: req.user!.userId,
        triggeredAt:   new Date(),
      },
    });

    // Re-read all triggers to compute overall event trigger status
    const allTriggers = await prisma.commissionEventTrigger.findMany({
      where: { commissionEventId: req.params.id as string },
    });

    const anyFailed  = allTriggers.some((t) => t.status === TriggerStatus.FAILED);
    const allResolved = allTriggers.every(
      (t) => t.status === TriggerStatus.TRIGGERED || t.status === TriggerStatus.WAIVED
    );

    let newEventStatus: string | null = null;
    if (anyFailed)    newEventStatus = "FAILED";
    else if (allResolved) newEventStatus = "TRIGGERED";

    if (newEventStatus) {
      await prisma.commissionEvent.update({
        where: { id: req.params.id as string },
        data:  { triggerStatus: newEventStatus },
      });
      if (newEventStatus === "TRIGGERED") {
        await checkAndCreditWallet(req.params.id as string, req.user!.tenantId);
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action:     `TRIGGER_${action}`,
        entityType: "CommissionEventTrigger",
        entityId:   trigger.id,
        newValue:   JSON.stringify({ status: newStatus, notes, triggerId: trigger.id }),
      },
    });

    res.json({ message: "Trigger updated", status: newStatus, eventTriggerStatus: newEventStatus });
  } catch (err) {
    logger.error({ err }, "TriggerAction error");
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

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getIndustryConfig } from "../industry-config";
import { calculateCommission } from "../lib/commission-formula";
import { getDefaultWorkflow } from "../lib/industry-workflows";
import { applyFutureOffsets } from "../lib/recovery-engine";
import { getIndustryTriggers } from "../lib/industry-triggers";
import { ApprovalStatus, TriggerStatus } from "@prisma/client";
import { calculateClawback } from "../lib/clawback-engine";
import type { ClawbackPolicyInput } from "../lib/clawback-engine";

const ZAR = (n: number | { toNumber?: () => number }) =>
  (typeof n === "object" && n.toNumber ? n.toNumber() : Number(n))
    .toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });

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

// Keys already captured by hardcoded form fields — exclude from dynamic fieldDefs
const EXCLUDED_FIELD_KEYS = new Set(["dealType", "eventType"]);

function mergeCustomFields(templateDefs: any[], fieldConfigJson: any): any[] {
  const customFields: any[] = (fieldConfigJson as any)?.customFields ?? [];
  if (!customFields.length) return templateDefs;

  const existingKeys = new Set(templateDefs.map((f) => f.fieldKey));
  const maxOrder = templateDefs.reduce((m, f) => Math.max(m, f.displayOrder ?? 0), 0);

  const extras = customFields
    .filter((cf: any) => cf.enabled !== false && !existingKeys.has(cf.key ?? cf.fieldKey))
    .map((cf: any, i: number) => ({
      id:              `custom-${cf.key ?? cf.fieldKey}`,
      fieldKey:        cf.key ?? cf.fieldKey,
      fieldLabel:      cf.label ?? cf.fieldLabel,
      fieldType:       cf.fieldType ?? cf.type ?? "text",
      isRequired:      cf.required ?? cf.isRequired ?? false,
      displayOrder:    maxOrder + i + 1,
      calculationRole: null,
      optionsJson:     cf.options ?? cf.optionsJson ?? null,
      isActive:        true,
    }));

  return [...templateDefs, ...extras];
}

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
    const templateDefs = tic.industryTemplate.dealFieldDefinitions;
    const merged = mergeCustomFields(templateDefs, tic.fieldConfigJson);
    return {
      industryCode:        tic.industryTemplate.code,
      industryTemplateId:  tic.industryTemplate.id,
      dealEntityName:      tic.dealEntityName,
      commissionEventName: tic.commissionEventName,
      triggerEventName:    tic.triggerEventName,
      fieldDefs:           merged,
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
    industryCode:        code,
    industryTemplateId:  template?.id ?? null,
    dealEntityName:      null,
    commissionEventName: null,
    triggerEventName:    null,
    fieldDefs:           template?.dealFieldDefinitions ?? [],
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
      fieldDefinitions:     tc.fieldDefs
        .filter((f) => !EXCLUDED_FIELD_KEYS.has(f.fieldKey))
        .map((f) => ({
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

// ── GET /api/commission-events/clawback-eligible ──────────────────────────────
// Returns events where commission has already been wallet-credited (paid out)

router.get("/clawback-eligible", requireAuth, async (req: Request, res: Response) => {
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  try {
    const walletTxns = await prisma.walletTransaction.findMany({
      where: {
        transactionType: "COMMISSION_APPROVED",
        wallet: {
          user: {
            tenantId: req.user!.tenantId,
            ...(isSalesExec && { id: req.user!.userId }),
          },
        },
      },
      select: { referenceId: true },
    });
    const eventIds = [...new Set(
      walletTxns.map((t) => t.referenceId).filter(Boolean) as string[]
    )];
    if (eventIds.length === 0) { res.json([]); return; }

    const events = await prisma.commissionEvent.findMany({
      where: { id: { in: eventIds }, tenantId: req.user!.tenantId },
      include: { salesExecutive: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(events.map((e) => {
      const data = (e.eventDataJson as any) ?? {};
      return {
        id:                         e.id,
        eventTitle:                 e.eventTitle,
        calculatedCommissionAmount: e.calculatedCommissionAmount,
        approvalStatus:             e.approvalStatus,
        salesExecutiveName:         e.salesExecutive
          ? `${e.salesExecutive.firstName} ${e.salesExecutive.lastName}`
          : "",
        customerName:               data.customerName    ?? null,
        projectStartDate:           data.projectStartDate ?? null,
        projectEndDate:             data.projectEndDate   ?? null,
      };
    }));
  } catch (err) {
    logger.error({ err }, "ClawbackEligibleEvents error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/commission-events ────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const { approvalStatus, salesExecutiveId: execFilter } = req.query as Record<string, string | undefined>;
  const where: any = {
    tenantId: req.user!.tenantId,
    ...(isSalesExec && { salesExecutiveId: req.user!.userId }),
    ...(!isSalesExec && execFilter && { salesExecutiveId: execFilter }),
    ...(approvalStatus && { approvalStatus }),
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
        sourceType:          (e as any).sourceType ?? "SELF",
        splitReferrerName:   (e as any).splitReferrerName ?? null,
        splitDeductionAmount: (e as any).splitDeductionAmount ?? null,
        editStatus:          (e as any).editStatus ?? "NONE",
        cancellationStatus:  (e as any).cancellationStatus ?? null,
        cancellationReason:  (e as any).cancellationReason ?? null,
        cancellationDate:    (e as any).cancellationDate?.toISOString() ?? null,
        actualEndDate:       (e as any).actualEndDate?.toISOString() ?? null,
        originalContractStartDate: (e as any).originalContractStartDate?.toISOString() ?? null,
        originalContractEndDate:   (e as any).originalContractEndDate?.toISOString() ?? null,
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

    // ── Dynamically resolve post-approval step statuses from wallet/payout ──
    const commApprovedTx = await prisma.walletTransaction.findFirst({
      where: { referenceId: event.id, transactionType: "COMMISSION_APPROVED" },
      select: { walletId: true },
    });
    let payoutApproved = false;
    if (commApprovedTx) {
      const payoutTx = await prisma.walletTransaction.findFirst({
        where: {
          walletId: commApprovedTx.walletId,
          transactionType: { in: ["PAYOUT_REQUESTED", "PAYOUT_PAID"] },
        },
        orderBy: { createdAt: "desc" },
        select: { referenceId: true },
      });
      if (payoutTx?.referenceId) {
        const pr = await prisma.payoutRequest.findUnique({
          where: { id: payoutTx.referenceId },
          select: { status: true },
        });
        payoutApproved = ["PAYROLL_APPROVED", "PAID"].includes(pr?.status ?? "");
      }
    }

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
      sourceType:           (event as any).sourceType ?? "SELF",
      splitReferrerName:    (event as any).splitReferrerName ?? null,
      splitDeductionAmount: (event as any).splitDeductionAmount ?? null,
      editStatus:           (event as any).editStatus ?? "NONE",
      approvals: (event.approvals as any[]).map((a) => {
        let status = a.status as string;
        // Commission paid to wallet → "Confirm Payout amount" (SALES_EXECUTIVE) = done
        if (a.approverRole === "SALES_EXECUTIVE" && commApprovedTx) {
          status = "APPROVED";
        }
        // Payroll step reflects actual payout state
        if (a.approverRole === "PAYROLL") {
          if (payoutApproved)     status = "APPROVED";
          else if (commApprovedTx) status = "PENDING"; // wallet credited → step is now active
        }
        return {
          id:            a.id,
          approvalStep:  a.approvalStep,
          stepName:      a.stepName ?? null,
          approverRole:  a.approverRole,
          status,
          comments:      a.comments,
          approvedAt:    a.approvedAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, "GetCommissionEvent error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events ───────────────────────────────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { eventTitle, eventType, eventDataJson, sourceType, internalReferrerId, externalProviderId, splitReferrerName } = req.body;

  if (!eventTitle || !eventType) {
    res.status(400).json({ error: "eventTitle and eventType are required" });
    return;
  }

  const validSourceTypes = ["SELF", "INTERNAL", "EXTERNAL"];
  const resolvedSourceType = validSourceTypes.includes(sourceType) ? sourceType : "SELF";

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
        sourceType:      resolvedSourceType,
        ...(resolvedSourceType === "INTERNAL" && internalReferrerId && { internalReferrerId }),
        ...(resolvedSourceType === "EXTERNAL" && externalProviderId && { externalProviderId }),
        ...(splitReferrerName && { splitReferrerName: splitReferrerName.trim() }),
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

// ── POST /api/commission-events/:id/edit-start ───────────────────────────────
// Sales exec starts editing a deal that is at Level-1-PENDING or in EDITING state.

router.post("/:id/edit-start", requireAuth, async (req: Request, res: Response) => {
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId, salesExecutiveId: req.user!.userId },
      include: { approvals: { orderBy: { approvalStep: "asc" } } },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }

    // Allow if DRAFT, PENDING_APPROVAL with L1 still PENDING, or already EDITING (accepted amendment)
    const approvals = event.approvals as any[];
    const l1 = approvals.find((a) => a.approvalStep === 1);
    const l1IsPending = l1?.status === "PENDING";

    const canEdit =
      event.approvalStatus === "DRAFT" ||
      (event as any).editStatus === "EDITING" ||
      (event.approvalStatus === "PENDING_APPROVAL" && l1IsPending);

    if (!canEdit) {
      res.status(400).json({ error: "This deal cannot be edited at this stage" }); return;
    }
    if ((event as any).editStatus === "EDITING") {
      // Already in editing — just return success
      res.json({ editStatus: "EDITING" }); return;
    }

    await prisma.commissionEvent.update({
      where: { id: event.id },
      data:  { editStatus: "EDITING" },
    });
    res.json({ editStatus: "EDITING" });
  } catch (err) {
    logger.error({ err }, "EditStart error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events/:id/edit-save ─────────────────────────────────
// Saves updated deal fields and recalculates commission. Clears editStatus.

router.post("/:id/edit-save", requireAuth, async (req: Request, res: Response) => {
  const { eventTitle, eventType, eventDataJson, sourceType, externalProviderId, splitReferrerName } = req.body;
  if (!eventTitle || !eventType) {
    res.status(400).json({ error: "eventTitle and eventType are required" }); return;
  }
  const validSourceTypes = ["SELF", "INTERNAL", "EXTERNAL"];
  const resolvedSourceType: "SELF" | "INTERNAL" | "EXTERNAL" = validSourceTypes.includes(sourceType) ? sourceType : "SELF";
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId, salesExecutiveId: req.user!.userId },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }
    if ((event as any).editStatus !== "EDITING") {
      res.status(400).json({ error: "Deal is not in edit mode — call edit-start first" }); return;
    }

    const [tc, commissionPct, splitCfg] = await Promise.all([
      loadTenantConfig(req.user!.tenantId),
      lookupCommissionPct(req.user!.tenantId, req.user!.userId),
      prisma.commissionSplitConfig.findUnique({ where: { tenantId: req.user!.tenantId } }),
    ]);
    const dataMap: Record<string, any> = eventDataJson ?? {};
    const calcResult = calculateCommission(tc.industryCode, dataMap, commissionPct);

    // Recalculate split deduction for the new sourceType
    let newSplitDeductionAmount: number | null = null;
    if (resolvedSourceType === "INTERNAL" && splitCfg?.isEnabled && (splitCfg.deductionValue ?? 0) > 0) {
      const raw = splitCfg.deductionType === "PERCENTAGE"
        ? calcResult.calculatedCommissionAmount * (Number(splitCfg.deductionValue) / 100)
        : Number(splitCfg.deductionValue);
      newSplitDeductionAmount = Math.min(raw, calcResult.calculatedCommissionAmount);
    }

    // Adjust pending wallet balance for the delta
    const oldCommission = Number(event.calculatedCommissionAmount);
    const newCommission = calcResult.calculatedCommissionAmount;
    const delta = newCommission - oldCommission;

    await prisma.$transaction(async (tx) => {
      await tx.commissionEvent.update({
        where: { id: event.id },
        data: {
          eventTitle,
          eventType,
          eventDataJson:              dataMap,
          revenueAmount:              calcResult.revenueAmount,
          costAmount:                 calcResult.costAmount,
          grossProfitAmount:          calcResult.grossProfitAmount,
          commissionBaseAmount:       calcResult.commissionBaseAmount,
          commissionPercentage:       calcResult.commissionPercentage,
          calculatedCommissionAmount: calcResult.calculatedCommissionAmount,
          editStatus:                 "NONE",
          sourceType:                 resolvedSourceType,
          externalProviderId:         resolvedSourceType === "EXTERNAL" && externalProviderId ? externalProviderId : null,
          splitReferrerName:          resolvedSourceType !== "SELF" && splitReferrerName ? splitReferrerName.trim() : null,
          splitDeductionAmount:       newSplitDeductionAmount,
        },
      });

      // Adjust pending balance on wallet if deal is in-approval
      if (event.approvalStatus !== "DRAFT" && delta !== 0) {
        const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
        if (wallet) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data:  { pendingBalance: Math.max(0, Number(wallet.pendingBalance) + delta) },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     req.user!.userId,
          action:     "UPDATE",
          entityType: "CommissionEvent",
          entityId:   event.id,
          newValue:   JSON.stringify({ eventTitle, eventType, calculatedCommissionAmount: newCommission }),
        },
      });
    });

    res.json({ message: "Saved", calculatedCommissionAmount: newCommission });
  } catch (err) {
    logger.error({ err }, "EditSave error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events/:id/edit-cancel ───────────────────────────────

router.post("/:id/edit-cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId, salesExecutiveId: req.user!.userId },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }
    await prisma.commissionEvent.update({
      where: { id: event.id },
      data:  { editStatus: "NONE" },
    });
    res.json({ editStatus: "NONE" });
  } catch (err) {
    logger.error({ err }, "EditCancel error");
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
    if (existing.approvalStatus !== "DRAFT" && existing.approvalStatus !== "CHANGES_REQUESTED") {
      res.status(400).json({ error: "Only DRAFT or CHANGES_REQUESTED events can be submitted" });
      return;
    }

    // ── Resolve workflow steps ────────────────────────────────────────────────
    // Always use the live ApprovalConfig records the admin has configured.
    // Fall back to code defaults only when no active steps exist at all.

    const industryCode: string =
      (existing.industryTemplate as any)?.code ?? "CUSTOM";

    const liveConfigs = await prisma.approvalConfig.findMany({
      where:   { tenantId: req.user!.tenantId, isActive: true },
      orderBy: { stepOrder: "asc" },
    });

    type ResolvedStep = { step: number; stepName: string; approverRole: string; approverUserId: string | null };
    const resolvedSteps: ResolvedStep[] = liveConfigs.length > 0
      ? liveConfigs.map((c) => ({
          step:          c.stepOrder,
          stepName:      c.stepName,
          approverRole:  c.approverRole as string,
          approverUserId: c.approverUserId ?? null,
        }))
      : getDefaultWorkflow(industryCode).map((s) => ({ ...s, approverUserId: null }));

    // Build CommissionEventApproval records — first step PENDING, rest WAITING
    const stepRecords = resolvedSteps.map((s, idx) => ({
      tenantId:          req.user!.tenantId,
      commissionEventId: existing.id,
      approvalStep:      s.step,
      stepName:          s.stepName,
      approverRole:      s.approverRole as any,
      approverUserId:    s.approverUserId,
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
// Applies any outstanding clawback offsets before crediting the net to wallet.

async function checkAndCreditWallet(commissionEventId: string, tenantId: string) {
  const ev = await prisma.commissionEvent.findUnique({
    where: { id: commissionEventId },
  });
  if (!ev) return;
  if (ev.approvalStatus !== "APPROVED") return;
  if (ev.triggerStatus  !== "TRIGGERED") return;
  if (ev.walletStatus   === "CREDITED")  return; // already done

  // Guard: if commission was already credited via the executive-approval step
  // (COMMISSION_APPROVED tx), just mark walletStatus and skip double-credit.
  const existingCredit = await prisma.walletTransaction.findFirst({
    where: { referenceId: commissionEventId, transactionType: "COMMISSION_APPROVED" },
  });
  if (existingCredit) {
    await prisma.commissionEvent.update({
      where: { id: commissionEventId },
      data:  { walletStatus: "CREDITED" },
    });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId: ev.salesExecutiveId } });
  if (!wallet) return;

  const grossAmt = Number(ev.calculatedCommissionAmount);

  await prisma.$transaction(async (tx) => {
    // ── Step 1: Apply any outstanding clawback future offsets ─────────────────
    const { netAmount, totalDeducted } = await applyFutureOffsets({
      userId:            ev.salesExecutiveId,
      tenantId,
      grossIncoming:     grossAmt,
      walletId:          wallet.id,
      commissionEventId,
      eventTitle:        ev.eventTitle,
      tx,
    });

    // ── Step 2: Credit net commission to wallet ───────────────────────────────
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { increment: netAmount },
        pendingBalance:   { decrement: grossAmt },
      },
    });

    if (netAmount > 0) {
      await tx.walletTransaction.create({
        data: {
          tenantId,
          walletId:        wallet.id,
          transactionType: "TRIGGER_RELEASED",
          amount:          netAmount,
          referenceType:   "COMMISSION_EVENT",
          referenceId:     ev.id,
          description:     totalDeducted > 0
            ? `Commission released: ${ev.eventTitle} (${ZAR(totalDeducted)} offset for clawback recovery)`
            : `Commission released: ${ev.eventTitle}`,
        },
      });
    }

    await tx.commissionEvent.update({
      where: { id: commissionEventId },
      data:  { walletStatus: "CREDITED" },
    });

    await tx.notification.create({
      data: {
        tenantId,
        userId:     ev.salesExecutiveId,
        title:      netAmount > 0 ? "Commission Released to Wallet" : "Commission Applied to Clawback Recovery",
        message:    netAmount > 0
          ? totalDeducted > 0
            ? `${ZAR(netAmount)} of your commission for "${ev.eventTitle}" is now available. ${ZAR(totalDeducted)} was applied to outstanding clawback recovery.`
            : `${ZAR(netAmount)} commission for "${ev.eventTitle}" is now available in your wallet.`
          : `Your commission for "${ev.eventTitle}" (${ZAR(grossAmt)}) was fully applied to outstanding clawback recovery.`,
        type:       "WALLET_CREDITED",
        readStatus: false,
      },
    });
  });
}

// ── Auto-trigger helper ────────────────────────────────────────────────────────
// Fires a specific trigger type for an event (system-side, bypasses role check).
// Returns true if the trigger was found and fired, false if already resolved/absent.

async function autoFireTrigger(
  eventId:     string,
  tenantId:    string,
  triggerType: string,
  notes:       string,
  userId:      string | null = null
): Promise<boolean> {
  const trigger = await prisma.commissionEventTrigger.findFirst({
    where: {
      commissionEventId: eventId,
      tenantId,
      triggerEventType:  triggerType,
      status:            TriggerStatus.NOT_TRIGGERED,
    },
  });
  if (!trigger) return false;

  await prisma.commissionEventTrigger.update({
    where: { id: trigger.id },
    data: {
      status:        TriggerStatus.TRIGGERED,
      notes,
      triggeredById: userId,
      triggeredAt:   new Date(),
    },
  });

  const allTriggers = await prisma.commissionEventTrigger.findMany({
    where: { commissionEventId: eventId },
  });
  const anyFailed   = allTriggers.some((t) => t.status === TriggerStatus.FAILED);
  const allResolved = allTriggers.every(
    (t) => t.status === TriggerStatus.TRIGGERED || t.status === TriggerStatus.WAIVED
  );
  if (anyFailed || allResolved) {
    const newStatus = anyFailed ? "FAILED" : "TRIGGERED";
    await prisma.commissionEvent.update({
      where: { id: eventId },
      data:  { triggerStatus: newStatus },
    });
    if (newStatus === "TRIGGERED") {
      await checkAndCreditWallet(eventId, tenantId);
    }
  }
  return true;
}

// ── GET /api/commission-events/:id/triggers ────────────────────────────────────

router.get("/:id/triggers", requireAuth, async (req: Request, res: Response) => {
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }

    // ── Auto-fire date-based CANDIDATE_STARTED if start date has passed ─────────
    const eventData    = (event.eventDataJson as any) ?? {};
    const startDateStr = eventData.projectStartDate ?? eventData.startDate ?? null;
    if (startDateStr && event.triggerStatus === "NOT_TRIGGERED") {
      const today = new Date().toISOString().split("T")[0];
      if (startDateStr <= today) {
        await autoFireTrigger(
          event.id,
          req.user!.tenantId,
          "CANDIDATE_STARTED",
          `Auto-triggered: project start date ${startDateStr} has been reached`,
          null
        );
        // Re-fetch updated event status
        const updated = await prisma.commissionEvent.findUnique({ where: { id: event.id } });
        if (updated) (event as any).triggerStatus = updated.triggerStatus;
      }
    }

    const triggers = await prisma.commissionEventTrigger.findMany({
      where:   { commissionEventId: req.params.id as string },
      include: { triggeredBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      triggerStatus: (event as any).triggerStatus,
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

// ── GET /api/commission-events/:id/documents ──────────────────────────────────

router.get("/:id/documents", requireAuth, async (req: Request, res: Response) => {
  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }

    const docs = await prisma.commissionDocument.findMany({
      where: { commissionEventId: req.params.id as string, tenantId: req.user!.tenantId },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json(docs.map((d) => ({
      id:               d.id,
      documentType:     d.documentType,
      fileName:         d.fileName,
      fileUrl:          d.fileUrl,
      description:      d.description ?? null,
      uploadedByName:   `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
      uploadedById:     d.uploadedById,
      createdAt:        d.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "ListDocuments error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events/:id/documents ─────────────────────────────────

router.post("/:id/documents", requireAuth, async (req: Request, res: Response) => {
  const { documentType, fileName, fileUrl, description } = req.body;
  if (!fileName || !fileUrl) {
    res.status(400).json({ error: "fileName and fileUrl are required" });
    return;
  }

  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }

    const doc = await prisma.commissionDocument.create({
      data: {
        tenantId:          req.user!.tenantId,
        commissionEventId: req.params.id as string,
        documentType:      documentType ?? "LINK",
        fileName,
        fileUrl,
        description:       description ?? null,
        uploadedById:      req.user!.userId,
      },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });

    // ── Auto-fire CONTRACT_SIGNED trigger when first document is attached ────────
    await autoFireTrigger(
      req.params.id as string,
      req.user!.tenantId,
      "CONTRACT_SIGNED",
      `Auto-triggered: document "${fileName}" attached to deal`,
      req.user!.userId
    );

    res.status(201).json({
      id:             doc.id,
      documentType:   doc.documentType,
      fileName:       doc.fileName,
      fileUrl:        doc.fileUrl,
      description:    doc.description ?? null,
      uploadedByName: `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`,
      uploadedById:   doc.uploadedById,
      createdAt:      doc.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "CreateDocument error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/commission-events/:id/documents/:docId ───────────────────────

router.delete("/:id/documents/:docId", requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = await prisma.commissionDocument.findFirst({
      where: {
        id:                req.params.docId as string,
        commissionEventId: req.params.id as string,
        tenantId:          req.user!.tenantId,
      },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const canDelete =
      doc.uploadedById === req.user!.userId ||
      ["ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
    if (!canDelete) { res.status(403).json({ error: "Forbidden" }); return; }

    await prisma.commissionDocument.delete({ where: { id: doc.id } });
    res.json({ message: "Deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteDocument error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/commission-events/:id/cancel ────────────────────────────────────
// Cancel / terminate a commission event, run the clawback engine, return preview.

router.post("/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  const allowedRoles = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"];
  if (!allowedRoles.includes(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions to cancel events" }); return;
  }

  const { cancellationType, cancellationDate, actualEndDate, cancellationReason, supportingNotes } = req.body;

  if (!cancellationType || !cancellationDate || !actualEndDate || !cancellationReason) {
    res.status(400).json({ error: "cancellationType, cancellationDate, actualEndDate and cancellationReason are required" });
    return;
  }

  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!event) { res.status(404).json({ error: "Commission event not found" }); return; }
    if ((event as any).cancellationStatus === "CANCELLED") {
      res.status(400).json({ error: "This event has already been cancelled" }); return;
    }
    if (event.approvalStatus === "DRAFT") {
      res.status(400).json({ error: "Draft events cannot be cancelled — delete them instead" }); return;
    }

    const parsedCancellationDate = new Date(cancellationDate);
    const parsedActualEndDate    = new Date(actualEndDate);

    if (isNaN(parsedCancellationDate.getTime()) || isNaN(parsedActualEndDate.getTime())) {
      res.status(400).json({ error: "cancellationDate and actualEndDate must be valid ISO dates" }); return;
    }

    // ── Mark event as cancelled ──────────────────────────────────────────────
    const updated = await prisma.commissionEvent.update({
      where: { id: event.id },
      data: {
        cancellationStatus: "CANCELLED",
        cancellationDate:   parsedCancellationDate,
        actualEndDate:      parsedActualEndDate,
        cancellationReason: cancellationReason,
      } as any,
    });

    // ── Load applicable ClawbackPolicy ───────────────────────────────────────
    const industryTemplateId = (event as any).industryTemplateId as string | null;
    let policy: any = null;

    if (industryTemplateId) {
      // Prefer a policy that matches the event type (e.g. Recruitment PERMANENT vs CONTRACT)
      const policies = await prisma.clawbackPolicy.findMany({
        where: { industryTemplateId, isActive: true, isDefault: true },
      });

      if (policies.length === 1) {
        policy = policies[0];
      } else if (policies.length > 1) {
        // Try to match on appliesToEventType
        const matched = policies.find(
          (p: any) => !p.appliesToEventType || p.appliesToEventType === event.eventType,
        );
        policy = matched ?? policies[0];
      }

      // Fallback: any active policy for this industry
      if (!policy) {
        policy = await prisma.clawbackPolicy.findFirst({
          where: { industryTemplateId, isActive: true },
        });
      }
    }

    // ── Run Clawback Calculation Engine ──────────────────────────────────────
    const paidAmount     = event.calculatedCommissionAmount;
    const originalAmount = event.calculatedCommissionAmount;

    // Contract start/end: use event fields, fall back to reasonable defaults
    const contractStart: Date = (event as any).originalContractStartDate
      ?? event.submittedAt
      ?? event.createdAt;
    const contractEnd: Date   = (event as any).originalContractEndDate
      ?? new Date(contractStart.getTime() + 365 * 24 * 60 * 60 * 1000); // 1-year default if unknown

    let policyInput: ClawbackPolicyInput = { clawbackMethod: "NONE" };
    if (policy) {
      let recoveryJson = (policy as any).recoveryMethodPriorityJson;
      if (typeof recoveryJson === "string") {
        try { recoveryJson = JSON.parse(recoveryJson); } catch { recoveryJson = null; }
      }
      policyInput = {
        clawbackMethod:         (policy as any).clawbackMethod as ClawbackPolicyInput["clawbackMethod"],
        noClawbackAfterDays:    (policy as any).noClawbackAfterDays ?? null,
        clawbackWindowDays:     (policy as any).clawbackWindowDays ?? null,
        recoveryMethodPriorityJson: recoveryJson,
        allowPartialRecovery:   (policy as any).allowPartialRecovery ?? true,
      };
    }

    const calculation = calculateClawback({
      commissionEventId:        event.id,
      cancellationReason:       cancellationReason,
      policy:                   policyInput,
      originalCommissionAmount: originalAmount,
      paidCommissionAmount:     paidAmount,
      contractStartDate:        contractStart,
      contractEndDate:          contractEnd,
      actualEndDate:            parsedActualEndDate,
      recoveredAmount:          0,
    });

    // ── Audit log ────────────────────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action:     "COMMISSION_EVENT_CANCELLED",
        entityType: "CommissionEvent",
        entityId:   event.id,
        newValue:   JSON.stringify({ cancellationType, cancellationReason, cancellationDate, actualEndDate }),
      },
    }).catch(() => {});

    res.json({
      event: {
        id:                 updated.id,
        eventTitle:         updated.eventTitle,
        approvalStatus:     updated.approvalStatus,
        cancellationStatus: (updated as any).cancellationStatus,
        cancellationDate:   parsedCancellationDate.toISOString(),
        actualEndDate:      parsedActualEndDate.toISOString(),
        cancellationReason: cancellationReason,
      },
      policy: policy ? {
        id:             (policy as any).id,
        policyName:     (policy as any).policyName,
        clawbackMethod: (policy as any).clawbackMethod,
        clawbackWindowDays:     (policy as any).clawbackWindowDays ?? null,
        noClawbackAfterDays:    (policy as any).noClawbackAfterDays ?? null,
        allowPartialRecovery:   (policy as any).allowPartialRecovery,
        allowWaiver:            (policy as any).allowWaiver,
        requiresApproval:       (policy as any).requiresApproval,
        contractStartUsed:      contractStart.toISOString(),
        contractEndUsed:        contractEnd.toISOString(),
        wasContractEndEstimated: !(event as any).originalContractEndDate,
      } : null,
      calculation: {
        ...calculation,
        contractStartDate: calculation.contractStartDate.toISOString(),
        contractEndDate:   calculation.contractEndDate.toISOString(),
        actualEndDate:     calculation.actualEndDate.toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err }, "CancelCommissionEvent error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as commissionEventsRouter };

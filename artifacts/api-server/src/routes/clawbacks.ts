import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { calculateClawback } from "../lib/clawback-engine";
import type { ClawbackPolicyInput, CommissionComponentInput } from "../lib/clawback-engine";
import { executeRecoveryWaterfall } from "../lib/recovery-engine";
import { getIndustryConfig } from "../industry-config";

const ZAR = (n: number) =>
  n.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function clawbackToResponse(cb: any) {
  const event = cb.commissionEvent ?? {};
  const exec  = cb.salesExecutive ?? {};
  const createdBy = cb.createdBy ?? {};
  const approvedBy = cb.approvedBy ?? {};
  return {
    id:                       cb.id,
    tenantId:                 cb.tenantId,
    commissionEventId:        cb.commissionEventId,
    eventTitle:               event.eventTitle ?? "",
    salesExecutiveId:         cb.salesExecutiveId,
    salesExecutiveName:       exec.firstName ? `${exec.firstName} ${exec.lastName}` : "",
    clawbackType:             cb.clawbackType,
    reasonCategory:           cb.reasonCategory,
    reason:                   cb.reason,
    originalCommissionAmount: Number(cb.originalCommissionAmount),
    clawbackAmount:           Number(cb.clawbackAmount),
    recoveredAmount:          Number(cb.recoveredAmount),
    outstandingAmount:        Number(cb.outstandingAmount),
    proRataFactor:            cb.proRataFactor ? Number(cb.proRataFactor) : null,
    componentDescription:     cb.componentDescription ?? null,
    status:                   cb.status,
    notes:                    cb.notes ?? null,
    waiveReason:              cb.waiveReason ?? null,
    disputeNote:              cb.disputeNote ?? null,
    disputedAt:               cb.disputedAt?.toISOString() ?? null,
    approvedAt:               cb.approvedAt?.toISOString() ?? null,
    executedAt:               cb.executedAt?.toISOString() ?? null,
    createdById:              cb.createdById,
    createdByName:            createdBy.firstName ? `${createdBy.firstName} ${createdBy.lastName}` : "",
    approvedById:             cb.approvedById ?? null,
    approvedByName:           approvedBy.firstName ? `${approvedBy.firstName} ${approvedBy.lastName}` : null,
    createdAt:                cb.createdAt.toISOString(),
    updatedAt:                cb.updatedAt.toISOString(),
    recoveryStatus:           cb.recoveryStatus ?? "PENDING",
    recoveries:               (cb.recoveries ?? []).map((r: any) => ({
      id:             r.id,
      recoveryMethod: r.recoveryMethod,
      amount:         Number(r.amount),
      description:    r.description ?? null,
      referenceId:    r.referenceId ?? null,
      createdAt:      r.createdAt.toISOString(),
    })),
    approvalSteps:            (cb.approvalSteps ?? []).map((s: any) => ({
      id:           s.id,
      stepOrder:    s.stepOrder,
      stepName:     s.stepName,
      approverRole: s.approverRole,
      status:       s.status,
      comments:     s.comments ?? null,
      approvedById: s.approvedById ?? null,
      approvedAt:   s.approvedAt?.toISOString() ?? null,
    })),
    approvalCurrentStep:      cb.approvalCurrentStep ?? null,
    walletPendingTxId:        cb.walletPendingTxId ?? null,
  };
}

const clawbackInclude = {
  commissionEvent: { select: { eventTitle: true, approvalStatus: true, calculatedCommissionAmount: true } },
  salesExecutive:  { select: { firstName: true, lastName: true } },
  createdBy:       { select: { firstName: true, lastName: true } },
  approvedBy:      { select: { firstName: true, lastName: true } },
  recoveries:      true,
  approvalSteps:   { orderBy: { stepOrder: "asc" as const } },
};

// ── GET /api/clawbacks ────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status, eventId, execId } = req.query as Record<string, string | undefined>;
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";

  const where: any = { tenantId: req.user!.tenantId };
  if (isSalesExec)        where.salesExecutiveId = req.user!.userId;
  else if (execId)        where.salesExecutiveId = execId;
  if (status)             where.status = status;
  if (eventId)            where.commissionEventId = eventId;

  try {
    const clawbacks = await prisma.commissionClawback.findMany({
      where,
      include:  clawbackInclude,
      orderBy:  { createdAt: "desc" },
    });
    res.json(clawbacks.map(clawbackToResponse));
  } catch (err) {
    logger.error({ err }, "ListClawbacks error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/clawbacks ────────────────────────────────────────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const allowed = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE", "SALES_EXECUTIVE"];
  if (!allowed.includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const {
    commissionEventId,
    clawbackType,
    reasonCategory,
    reason,
    clawbackAmount,
    proRataFactor,
    componentDescription,
    notes,
  } = req.body;

  if (!commissionEventId || !clawbackType || !reasonCategory || !reason?.trim() || clawbackAmount == null) {
    res.status(400).json({ error: "commissionEventId, clawbackType, reasonCategory, reason and clawbackAmount are required" });
    return;
  }

  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: commissionEventId, tenantId: req.user!.tenantId },
    });
    if (!event) { res.status(404).json({ error: "Commission event not found" }); return; }

    // Sales executives can only create clawbacks for their own events
    if (req.user!.role === "SALES_EXECUTIVE" && event.salesExecutiveId !== req.user!.userId) {
      res.status(403).json({ error: "You can only create clawbacks for your own commission events" }); return;
    }

    const originalAmount = Number(event.calculatedCommissionAmount);
    const cbAmount       = Number(clawbackAmount);
    if (cbAmount <= 0)   { res.status(400).json({ error: "clawbackAmount must be > 0" }); return; }
    if (cbAmount > originalAmount + 0.01) {
      res.status(400).json({ error: `clawbackAmount (${cbAmount}) cannot exceed original commission (${originalAmount})` });
      return;
    }

    const cb = await prisma.commissionClawback.create({
      data: {
        tenantId:                 req.user!.tenantId,
        commissionEventId,
        salesExecutiveId:         event.salesExecutiveId,
        clawbackType,
        reasonCategory,
        reason:                   reason.trim(),
        originalCommissionAmount: originalAmount,
        clawbackAmount:           cbAmount,
        recoveredAmount:          0,
        outstandingAmount:        cbAmount,
        proRataFactor:            proRataFactor != null ? Number(proRataFactor) : null,
        componentDescription:     componentDescription?.trim() ?? null,
        notes:                    notes?.trim() ?? null,
        createdById:              req.user!.userId,
        status:                   "DRAFT",
      },
      include: clawbackInclude,
    });

    // Notify sales exec
    const { industry: createIndustry } = (await prisma.tenant.findUnique({ where: { id: req.user!.tenantId }, select: { industry: true } })) ?? {};
    const { clawbackTerm: createTerm } = getIndustryConfig(createIndustry);
    await prisma.notification.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     event.salesExecutiveId,
        title:      `${createTerm} Created`,
        message:    `A ${createTerm.toLowerCase()} of ${cbAmount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} has been created for "${event.eventTitle}". Reason: ${reason.trim().slice(0, 100)}`,
        type:       "CLAWBACK_CREATED",
        readStatus: false,
      },
    }).catch(() => {});

    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action:     "CLAWBACK_CREATED",
        entityType: "CommissionClawback",
        entityId:   cb.id,
        newValue:   JSON.stringify({ clawbackType, reasonCategory, reason, clawbackAmount: cbAmount }),
      },
    }).catch(() => {});

    res.status(201).json(clawbackToResponse(cb));
  } catch (err) {
    logger.error({ err }, "CreateClawback error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/clawbacks/:id ────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cb = await prisma.commissionClawback.findFirst({
      where:   { id: req.params.id as string, tenantId: req.user!.tenantId },
      include: clawbackInclude,
    });
    if (!cb) { res.status(404).json({ error: "Not found" }); return; }

    const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
    if (isSalesExec && cb.salesExecutiveId !== req.user!.userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    res.json(clawbackToResponse(cb));
  } catch (err) {
    logger.error({ err }, "GetClawback error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/clawbacks/:id ──────────────────────────────────────────────────

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const allowed = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"];
  if (!allowed.includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  try {
    const cb = await prisma.commissionClawback.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!cb) { res.status(404).json({ error: "Not found" }); return; }
    if (!["DRAFT", "DECLINED"].includes(cb.status)) {
      res.status(400).json({ error: "Only DRAFT or DECLINED clawbacks can be edited" }); return;
    }

    const { clawbackType, reasonCategory, reason, clawbackAmount, proRataFactor, componentDescription, notes } = req.body;
    const cbAmount = clawbackAmount != null ? Number(clawbackAmount) : Number(cb.clawbackAmount);

    const updated = await prisma.commissionClawback.update({
      where: { id: cb.id },
      data: {
        ...(clawbackType       && { clawbackType }),
        ...(reasonCategory     && { reasonCategory }),
        ...(reason             && { reason: reason.trim() }),
        clawbackAmount:        cbAmount,
        outstandingAmount:     cbAmount - Number(cb.recoveredAmount),
        ...(proRataFactor != null && { proRataFactor: Number(proRataFactor) }),
        ...(componentDescription != null && { componentDescription: componentDescription.trim() || null }),
        ...(notes != null      && { notes: notes.trim() || null }),
        status:                "DRAFT",
      },
      include: clawbackInclude,
    });
    res.json(clawbackToResponse(updated));
  } catch (err) {
    logger.error({ err }, "UpdateClawback error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/clawbacks/:id ─────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const allowed = ["ADMIN", "SUPER_ADMIN", "MANAGER"];
  if (!allowed.includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  try {
    const cb = await prisma.commissionClawback.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!cb) { res.status(404).json({ error: "Not found" }); return; }
    if (cb.status !== "DRAFT") {
      res.status(400).json({ error: "Only DRAFT clawbacks can be deleted" }); return;
    }
    await prisma.commissionClawback.delete({ where: { id: cb.id } });
    res.json({ message: "Deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteClawback error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/clawbacks/:id/action ────────────────────────────────────────────

router.post("/:id/action", requireAuth, async (req: Request, res: Response) => {
  const { action, recoveryMethod, amount, waiveReason, disputeNote, notes } = req.body as {
    action: string;
    recoveryMethod?: string;
    amount?: number;
    waiveReason?: string;
    disputeNote?: string;
    notes?: string;
  };

  const validActions = ["SUBMIT", "APPROVE", "DECLINE", "WAIVE", "DISPUTE", "EXECUTE", "RECOVER", "REQUEST_CHANGES"];
  if (!action || !validActions.includes(action)) {
    res.status(400).json({ error: `action must be one of: ${validActions.join(", ")}` }); return;
  }

  const managerRoles = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"];

  try {
    const cb = await prisma.commissionClawback.findFirst({
      where:   { id: req.params.id as string, tenantId: req.user!.tenantId },
      include: { ...clawbackInclude, commissionEvent: { select: { eventTitle: true, salesExecutiveId: true, calculatedCommissionAmount: true, approvalStatus: true } } },
    });
    if (!cb) { res.status(404).json({ error: "Not found" }); return; }

    const execId     = cb.salesExecutiveId;
    const eventTitle = (cb.commissionEvent as any).eventTitle as string;
    const actorName  = `${(req.user as any).firstName ?? ""} ${(req.user as any).lastName ?? ""}`.trim() || "Admin";
    const { industry: actionIndustry } = (await prisma.tenant.findUnique({ where: { id: req.user!.tenantId }, select: { industry: true } })) ?? {};
    const { clawbackTerm: cTerm, clawbackTermPlural: cTermPlural } = getIndustryConfig(actionIndustry);

    // ── SUBMIT (DRAFT → PENDING_APPROVAL, multi-step approval) ──────────────
    if (action === "SUBMIT") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT clawbacks can be submitted" }); return; }

      const clawbackAmt = Number(cb.clawbackAmount);

      // Load tenant's ClawbackApprovalConfig (or fall back to sensible defaults)
      const tenantConfigs = await prisma.clawbackApprovalConfig.findMany({
        where:   { tenantId: req.user!.tenantId, isActive: true },
        orderBy: { stepOrder: "asc" },
      });

      type StepDef = { stepOrder: number; stepName: string; approverRole: string };
      let steps: StepDef[];

      if (tenantConfigs.length > 0) {
        steps = tenantConfigs
          .filter(c => c.thresholdAmount == null || clawbackAmt >= Number(c.thresholdAmount))
          .map(c => ({ stepOrder: c.stepOrder, stepName: c.stepName, approverRole: c.approverRole }));
      } else {
        // Default: Finance → Manager; add Executive step if amount > 50 000
        steps = [
          { stepOrder: 1, stepName: "Finance Validation",     approverRole: "FINANCE" },
          { stepOrder: 2, stepName: "Sales Manager Approval", approverRole: "MANAGER" },
        ];
        if (clawbackAmt > 50000) {
          steps.push({ stepOrder: 3, stepName: "Executive Approval", approverRole: "EXECUTIVE" });
        }
      }

      if (steps.length === 0) {
        // All threshold-based steps excluded — auto-approve
        const autoApproved = await prisma.commissionClawback.update({
          where:   { id: cb.id },
          data:    { status: "APPROVED", approvedById: req.user!.userId, approvedAt: new Date(), approvalCurrentStep: 0 },
          include: clawbackInclude,
        });
        res.json(clawbackToResponse(autoApproved)); return;
      }

      // Create CLAWBACK_PENDING wallet transaction so exec sees potential deduction
      let pendingTxId: string | null = null;
      const execWallet = await prisma.wallet.findUnique({ where: { userId: execId } });
      if (execWallet) {
        const pendingTx = await prisma.walletTransaction.create({
          data: {
            tenantId:        req.user!.tenantId,
            walletId:        execWallet.id,
            transactionType: "CLAWBACK_PENDING",
            amount:          clawbackAmt,
            referenceType:   "CLAWBACK",
            referenceId:     cb.id,
            description:     `Potential clawback pending approval: ${eventTitle}`,
          },
        });
        pendingTxId = pendingTx.id;
      }

      // Create approval steps + transition clawback to PENDING_APPROVAL
      await prisma.$transaction([
        ...steps.map(s => prisma.clawbackApprovalStep.create({
          data: {
            tenantId:    req.user!.tenantId,
            clawbackId:  cb.id,
            stepOrder:   s.stepOrder,
            stepName:    s.stepName,
            approverRole: s.approverRole as any,
            status:      "PENDING",
          },
        })),
        prisma.commissionClawback.update({
          where: { id: cb.id },
          data:  {
            status:              "PENDING_APPROVAL",
            approvalCurrentStep: steps[0].stepOrder,
            ...(pendingTxId && { walletPendingTxId: pendingTxId }),
          },
        }),
      ]);

      // Notify first-step approvers
      const firstApprovers = await prisma.user.findMany({
        where:  { tenantId: req.user!.tenantId, role: steps[0].approverRole as any, status: "ACTIVE" },
        select: { id: true },
      });
      await Promise.all(firstApprovers.map(u =>
        prisma.notification.create({
          data: {
            tenantId:   req.user!.tenantId,
            userId:     u.id,
            title:      `${cTerm} Awaiting Review`,
            message:    `A ${cTerm.toLowerCase()} of ${clawbackAmt.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} for "${eventTitle}" requires your review (Step 1: ${steps[0].stepName}).`,
            type:       "CLAWBACK_CREATED",
            readStatus: false,
          },
        }).catch(() => {}),
      ));

      // Notify sales exec of potential deduction
      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     execId,
          title:      `Potential ${cTerm}`,
          message:    `A ${cTerm.toLowerCase()} of ${clawbackAmt.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} for "${eventTitle}" has been submitted for approval and will appear as a potential deduction in your wallet.`,
          type:       "CLAWBACK_CREATED",
          readStatus: false,
        },
      }).catch(() => {});

      const refreshed = await prisma.commissionClawback.findUnique({ where: { id: cb.id }, include: clawbackInclude });
      res.json(clawbackToResponse(refreshed!)); return;
    }

    // ── APPROVE (step-by-step, advances through approval chain) ─────────────
    if (action === "APPROVE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (!["PENDING_APPROVAL", "CHANGES_REQUESTED"].includes(cb.status)) {
        res.status(400).json({ error: "Clawback must be PENDING_APPROVAL or CHANGES_REQUESTED to approve" }); return;
      }

      const currentStepOrder = cb.approvalCurrentStep;
      if (currentStepOrder == null) {
        res.status(400).json({ error: "No active approval step found — re-submit this clawback" }); return;
      }

      const allSteps = await prisma.clawbackApprovalStep.findMany({
        where:   { clawbackId: cb.id },
        orderBy: { stepOrder: "asc" },
      });

      const currentStep = allSteps.find(s => s.stepOrder === currentStepOrder);
      if (!currentStep) { res.status(400).json({ error: "Current approval step record not found" }); return; }

      // Admins/Super-admins can bypass role check; everyone else must match the step role
      const isBypass = ["ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
      if (!isBypass && req.user!.role !== currentStep.approverRole) {
        res.status(403).json({ error: `Step ${currentStepOrder} (${currentStep.stepName}) requires a ${currentStep.approverRole}` }); return;
      }

      // Approve the current step
      await prisma.clawbackApprovalStep.update({
        where: { id: currentStep.id },
        data:  { status: "APPROVED", approvedById: req.user!.userId, approvedAt: new Date(), comments: notes?.trim() ?? null },
      });

      // Find the next PENDING step
      const nextStep = allSteps.find(s => s.stepOrder > currentStepOrder && s.status === "PENDING");

      if (nextStep) {
        // Advance to next step
        await prisma.commissionClawback.update({
          where: { id: cb.id },
          data:  { status: "PENDING_APPROVAL", approvalCurrentStep: nextStep.stepOrder },
        });

        const nextApprovers = await prisma.user.findMany({
          where:  { tenantId: req.user!.tenantId, role: nextStep.approverRole as any, status: "ACTIVE" },
          select: { id: true },
        });
        await Promise.all(nextApprovers.map(u =>
          prisma.notification.create({
            data: {
              tenantId:   req.user!.tenantId,
              userId:     u.id,
              title:      `${cTerm} Awaiting Your Approval`,
              message:    `A ${cTerm.toLowerCase()} of ${Number(cb.clawbackAmount).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} for "${eventTitle}" is at Step ${nextStep.stepOrder}: ${nextStep.stepName}.`,
              type:       "CLAWBACK_STEP_APPROVED",
              readStatus: false,
            },
          }).catch(() => {}),
        ));

        await prisma.notification.create({
          data: {
            tenantId:   req.user!.tenantId,
            userId:     execId,
            title:      `${cTerm} Approval In Progress`,
            message:    `Step ${currentStepOrder} (${currentStep.stepName}) approved. Now pending Step ${nextStep.stepOrder}: ${nextStep.stepName}.`,
            type:       "CLAWBACK_STEP_APPROVED",
            readStatus: false,
          },
        }).catch(() => {});
      } else {
        // All steps done — fully approve clawback
        if (cb.walletPendingTxId) {
          await prisma.walletTransaction.delete({ where: { id: cb.walletPendingTxId } }).catch(() => {});
        }

        await prisma.commissionClawback.update({
          where: { id: cb.id },
          data:  {
            status:           "APPROVED",
            approvedById:     req.user!.userId,
            approvedAt:       new Date(),
            walletPendingTxId: null,
            ...(notes && { notes: notes.trim() }),
          },
        });

        await prisma.notification.create({
          data: {
            tenantId:   req.user!.tenantId,
            userId:     execId,
            title:      `${cTerm} Approved`,
            message:    `Your ${cTerm.toLowerCase()} for "${eventTitle}" has been fully approved. Amount: ${Number(cb.clawbackAmount).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}`,
            type:       "CLAWBACK_APPROVED",
            readStatus: false,
          },
        }).catch(() => {});

        await prisma.auditLog.create({
          data: {
            tenantId:   req.user!.tenantId,
            userId:     req.user!.userId,
            action:     "CLAWBACK_APPROVED",
            entityType: "CommissionClawback",
            entityId:   cb.id,
            newValue:   JSON.stringify({ status: "APPROVED" }),
          },
        }).catch(() => {});
      }

      const refreshed = await prisma.commissionClawback.findUnique({ where: { id: cb.id }, include: clawbackInclude });
      res.json(clawbackToResponse(refreshed!)); return;
    }

    // ── DECLINE → CANCELLED (per spec: rejected = cancelled, no wallet impact) ─
    if (action === "DECLINE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (!["PENDING_APPROVAL", "CHANGES_REQUESTED"].includes(cb.status)) {
        res.status(400).json({ error: "Clawback must be PENDING_APPROVAL or CHANGES_REQUESTED to decline" }); return;
      }

      // Mark current step as REJECTED
      if (cb.approvalCurrentStep != null) {
        await prisma.clawbackApprovalStep.updateMany({
          where: { clawbackId: cb.id, stepOrder: cb.approvalCurrentStep },
          data:  { status: "REJECTED", comments: notes?.trim() ?? null },
        });
      }

      // Remove pending wallet tx — no wallet impact on rejection
      if (cb.walletPendingTxId) {
        await prisma.walletTransaction.delete({ where: { id: cb.walletPendingTxId } }).catch(() => {});
      }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "CANCELLED", walletPendingTxId: null, ...(notes && { notes: notes.trim() }) },
        include: clawbackInclude,
      });

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     execId,
          title:      `${cTerm} Cancelled`,
          message:    `The ${cTerm.toLowerCase()} for "${eventTitle}" has been rejected and cancelled.${notes ? ` Reason: ${notes.trim().slice(0, 100)}` : ""}`,
          type:       "CLAWBACK_CANCELLED",
          readStatus: false,
        },
      }).catch(() => {});

      await prisma.auditLog.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     req.user!.userId,
          action:     "CLAWBACK_CANCELLED",
          entityType: "CommissionClawback",
          entityId:   cb.id,
          newValue:   JSON.stringify({ status: "CANCELLED", notes }),
        },
      }).catch(() => {});

      res.json(clawbackToResponse(updated)); return;
    }

    // ── WAIVE — no recovery, mandatory audit log ──────────────────────────────
    if (action === "WAIVE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (!["APPROVED", "PENDING_APPROVAL", "CHANGES_REQUESTED"].includes(cb.status)) {
        res.status(400).json({ error: "Clawback must be APPROVED, PENDING_APPROVAL, or CHANGES_REQUESTED to waive" }); return;
      }
      if (!waiveReason?.trim()) { res.status(400).json({ error: "waiveReason is required when waiving a clawback" }); return; }

      // Remove pending wallet tx — waived means no deduction
      if (cb.walletPendingTxId) {
        await prisma.walletTransaction.delete({ where: { id: cb.walletPendingTxId } }).catch(() => {});
      }

      // Mark any remaining PENDING steps as WAIVED
      await prisma.clawbackApprovalStep.updateMany({
        where: { clawbackId: cb.id, status: "PENDING" },
        data:  { status: "WAIVED" },
      });

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "WAIVED", waiveReason: waiveReason.trim(), walletPendingTxId: null },
        include: clawbackInclude,
      });

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     execId,
          title:      `${cTerm} Waived`,
          message:    `Your ${cTerm.toLowerCase()} for "${eventTitle}" has been waived. Reason: ${waiveReason.trim().slice(0, 150)}`,
          type:       "CLAWBACK_WAIVED",
          readStatus: false,
        },
      }).catch(() => {});

      // Audit log required per business spec
      await prisma.auditLog.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     req.user!.userId,
          action:     "CLAWBACK_WAIVED",
          entityType: "CommissionClawback",
          entityId:   cb.id,
          newValue:   JSON.stringify({ status: "WAIVED", waiveReason: waiveReason.trim() }),
        },
      });

      res.json(clawbackToResponse(updated)); return;
    }

    // ── DISPUTE — freezes recovery until resolved ─────────────────────────────
    if (action === "DISPUTE") {
      if (!["APPROVED", "PENDING_APPROVAL", "CHANGES_REQUESTED"].includes(cb.status)) {
        res.status(400).json({ error: "Only APPROVED or PENDING_APPROVAL clawbacks can be disputed" }); return;
      }
      const canDispute = cb.salesExecutiveId === req.user!.userId || managerRoles.includes(req.user!.role);
      if (!canDispute) { res.status(403).json({ error: "Forbidden" }); return; }

      // Mark current step as DISPUTED if in approval flow
      if (cb.approvalCurrentStep != null) {
        await prisma.clawbackApprovalStep.updateMany({
          where: { clawbackId: cb.id, stepOrder: cb.approvalCurrentStep },
          data:  { status: "DISPUTED" },
        });
      }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "DISPUTED", disputeNote: disputeNote?.trim() ?? null, disputedAt: new Date() },
        include: clawbackInclude,
      });

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     cb.createdById,
          title:      `${cTerm} Disputed`,
          message:    `${actorName} has disputed the ${cTerm.toLowerCase()} for "${eventTitle}". Recovery is frozen until resolved.${disputeNote ? ` Note: ${disputeNote.trim().slice(0, 100)}` : ""}`,
          type:       "CLAWBACK_DISPUTED",
          readStatus: false,
        },
      }).catch(() => {});

      res.json(clawbackToResponse(updated)); return;
    }

    // ── REQUEST_CHANGES — send back for revision ──────────────────────────────
    if (action === "REQUEST_CHANGES") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "PENDING_APPROVAL") { res.status(400).json({ error: "Only PENDING_APPROVAL clawbacks can have changes requested" }); return; }

      // Mark current step as CHANGES_REQUESTED
      if (cb.approvalCurrentStep != null) {
        await prisma.clawbackApprovalStep.updateMany({
          where: { clawbackId: cb.id, stepOrder: cb.approvalCurrentStep },
          data:  { status: "CHANGES_REQUESTED", comments: notes?.trim() ?? null },
        });
      }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "CHANGES_REQUESTED", ...(notes && { notes: notes.trim() }) },
        include: clawbackInclude,
      });

      // Notify creator
      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     cb.createdById,
          title:      `${cTerm} Changes Requested`,
          message:    `Changes have been requested on the ${cTerm.toLowerCase()} for "${eventTitle}".${notes ? ` Notes: ${notes.trim().slice(0, 100)}` : ""}`,
          type:       "CLAWBACK_CHANGES_REQUESTED",
          readStatus: false,
        },
      }).catch(() => {});

      // Notify sales exec
      if (execId !== cb.createdById) {
        await prisma.notification.create({
          data: {
            tenantId:   req.user!.tenantId,
            userId:     execId,
            title:      `${cTerm} Under Review`,
            message:    `The ${cTerm.toLowerCase()} for "${eventTitle}" requires changes before it can proceed.${notes ? ` Notes: ${notes.trim().slice(0, 100)}` : ""}`,
            type:       "CLAWBACK_CHANGES_REQUESTED",
            readStatus: false,
          },
        }).catch(() => {});
      }

      res.json(clawbackToResponse(updated)); return;
    }

    // ── EXECUTE (APPROVED → EXECUTED) — auto recovery waterfall ─────────────

    if (action === "EXECUTE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "APPROVED") { res.status(400).json({ error: "Only APPROVED clawbacks can be executed" }); return; }

      const tenant = await prisma.tenant.findUnique({
        where:  { id: req.user!.tenantId },
        select: { allowPayrollDeduction: true },
      });
      const outstandingAmt = Number(cb.outstandingAmount);
      const prevRecovered  = Number(cb.recoveredAmount);

      const { newRecovered, newOutstanding, recoveryStatus } =
        await prisma.$transaction(async (tx) => {
          const result = await executeRecoveryWaterfall({
            clawbackId:           cb.id,
            tenantId:             req.user!.tenantId,
            salesExecutiveId:     execId,
            outstandingAmount:    outstandingAmt,
            clawbackAmount:       Number(cb.clawbackAmount),
            recoveredAmount:      prevRecovered,
            eventTitle,
            executedByUserId:     req.user!.userId,
            allowPayrollDeduction: tenant?.allowPayrollDeduction ?? false,
            tx,
          });

          await tx.commissionClawback.update({
            where: { id: cb.id },
            data: {
              status:            "EXECUTED",
              recoveredAmount:   result.newRecovered,
              outstandingAmount: result.newOutstanding,
              recoveryStatus:    result.recoveryStatus as any,
              executedAt:        new Date(),
            },
          });

          return result;
        });

      const walletDeducted = newRecovered - prevRecovered;
      const notifyMsg = newOutstanding === 0
        ? `A ${cTerm.toLowerCase()} of ${ZAR(outstandingAmt)} for "${eventTitle}" has been fully recovered from your wallet.`
        : walletDeducted > 0
        ? `${ZAR(walletDeducted)} has been deducted from your wallet for the ${cTerm.toLowerCase()} on "${eventTitle}". ${ZAR(newOutstanding)} remains and will be offset against future commissions.`
        : `${ZAR(newOutstanding)} ${cTerm.toLowerCase()} on "${eventTitle}" will be recovered from future commission payments.`;

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     execId,
          title:      `${cTerm} Executed`,
          message:    notifyMsg,
          type:       "CLAWBACK_EXECUTED" as any,
          readStatus: false,
        },
      }).catch(() => {});

      await prisma.auditLog.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     req.user!.userId,
          action:     "CLAWBACK_EXECUTED",
          entityType: "CommissionClawback",
          entityId:   cb.id,
          newValue:   JSON.stringify({ recoveryStatus, newRecovered, newOutstanding, walletDeducted }),
        },
      }).catch(() => {});

      const refreshed = await prisma.commissionClawback.findUnique({ where: { id: cb.id }, include: clawbackInclude });
      res.json(clawbackToResponse(refreshed));
      return;
    }

    // ── RECOVER — partial manual recovery on an already EXECUTED clawback ─────
    if (action === "RECOVER") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "EXECUTED") { res.status(400).json({ error: "Only EXECUTED clawbacks can have additional recovery recorded" }); return; }

      const recoverAmount = amount != null ? Number(amount) : Number(cb.outstandingAmount);
      if (recoverAmount <= 0) { res.status(400).json({ error: "amount must be > 0" }); return; }

      const newRecovered    = Number(cb.recoveredAmount) + recoverAmount;
      const newOutstanding  = Math.max(0, Number(cb.clawbackAmount) - newRecovered);

      await prisma.$transaction([
        prisma.clawbackRecovery.create({
          data: {
            tenantId:       req.user!.tenantId,
            clawbackId:     cb.id,
            recoveryMethod: "MANUAL_PAYMENT",
            amount:         recoverAmount,
            description:    notes?.trim() ?? `Additional recovery by ${actorName}`,
            createdById:    req.user!.userId,
          },
        }),
        prisma.commissionClawback.update({
          where: { id: cb.id },
          data:  { recoveredAmount: newRecovered, outstandingAmount: newOutstanding },
        }),
      ]);

      const refreshed = await prisma.commissionClawback.findUnique({ where: { id: cb.id }, include: clawbackInclude });
      res.json(clawbackToResponse(refreshed));
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    logger.error({ err }, "ClawbackAction error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/clawbacks/calculate ─────────────────────────────────────────────
// Pure calculation preview — no DB writes. Returns a full breakdown for review.

router.post("/calculate", requireAuth, async (req: Request, res: Response) => {
  const allowed = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"];
  if (!allowed.includes(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" }); return;
  }

  const {
    commissionEventId,
    cancellationReason,
    policy,
    originalCommissionAmount,
    paidCommissionAmount,
    contractStartDate,
    contractEndDate,
    actualEndDate,
    recoveredAmount,
    fixedAmount,
    manualAmount,
    manualReason,
    commissionComponents,
  } = req.body;

  // Build policy from DB if not supplied inline; supply must include clawbackMethod at minimum
  let resolvedPolicy: ClawbackPolicyInput | null = policy ?? null;

  // If a commissionEventId is supplied and fields are missing, auto-hydrate from DB
  let autoContractStart: Date | undefined;
  let autoContractEnd: Date | undefined;
  let autoPaidAmount: number | undefined;
  let autoOriginalAmount: number | undefined;

  if (commissionEventId) {
    try {
      const event = await prisma.commissionEvent.findFirst({
        where: { id: commissionEventId, tenantId: req.user!.tenantId },
        select: {
          originalContractStartDate: true,
          originalContractEndDate: true,
          actualEndDate: true,
          cancellationDate: true,
          calculatedCommissionAmount: true,
        },
      });
      if (!event) { res.status(404).json({ error: "Commission event not found" }); return; }
      if (event.originalContractStartDate) autoContractStart = event.originalContractStartDate;
      if (event.originalContractEndDate)   autoContractEnd   = event.originalContractEndDate;
      if (event.calculatedCommissionAmount) {
        autoPaidAmount     = Number(event.calculatedCommissionAmount);
        autoOriginalAmount = Number(event.calculatedCommissionAmount);
      }
    } catch (err) {
      logger.error({ err }, "ClawbackCalculate: event fetch error");
      res.status(500).json({ error: "Server error" }); return;
    }
  }

  if (!resolvedPolicy?.clawbackMethod) {
    res.status(400).json({ error: "policy.clawbackMethod is required" }); return;
  }

  const parsedStart  = contractStartDate ? new Date(contractStartDate) : autoContractStart;
  const parsedEnd    = contractEndDate   ? new Date(contractEndDate)   : autoContractEnd;
  const parsedActual = actualEndDate     ? new Date(actualEndDate)     : undefined;

  if (!parsedStart || !parsedEnd || !parsedActual) {
    res.status(400).json({
      error: "contractStartDate, contractEndDate and actualEndDate are required (supply them or reference a commissionEventId with those fields set)",
    }); return;
  }

  const resolvedPaid     = paidCommissionAmount     != null ? Number(paidCommissionAmount)     : (autoPaidAmount     ?? 0);
  const resolvedOriginal = originalCommissionAmount != null ? Number(originalCommissionAmount) : (autoOriginalAmount ?? resolvedPaid);

  const parsedComponents: CommissionComponentInput[] | undefined = Array.isArray(commissionComponents)
    ? (commissionComponents as CommissionComponentInput[])
    : undefined;

  const result = calculateClawback({
    commissionEventId,
    cancellationReason,
    policy: resolvedPolicy,
    originalCommissionAmount: resolvedOriginal,
    paidCommissionAmount:     resolvedPaid,
    contractStartDate:        parsedStart,
    contractEndDate:          parsedEnd,
    actualEndDate:            parsedActual,
    recoveredAmount:          recoveredAmount != null ? Number(recoveredAmount) : 0,
    fixedAmount:              fixedAmount     != null ? Number(fixedAmount)     : undefined,
    manualAmount:             manualAmount    != null ? Number(manualAmount)    : undefined,
    manualReason,
    commissionComponents:     parsedComponents,
  });

  res.json(result);
});

export { router as clawbacksRouter };

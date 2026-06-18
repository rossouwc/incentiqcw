import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { calculateClawback } from "../lib/clawback-engine";
import type { ClawbackPolicyInput, CommissionComponentInput } from "../lib/clawback-engine";

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
    recoveries:               (cb.recoveries ?? []).map((r: any) => ({
      id:             r.id,
      recoveryMethod: r.recoveryMethod,
      amount:         Number(r.amount),
      description:    r.description ?? null,
      referenceId:    r.referenceId ?? null,
      createdAt:      r.createdAt.toISOString(),
    })),
  };
}

const clawbackInclude = {
  commissionEvent: { select: { eventTitle: true, approvalStatus: true, calculatedCommissionAmount: true } },
  salesExecutive:  { select: { firstName: true, lastName: true } },
  createdBy:       { select: { firstName: true, lastName: true } },
  approvedBy:      { select: { firstName: true, lastName: true } },
  recoveries:      true,
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
  const allowed = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE"];
  if (!allowed.includes(req.user!.role)) {
    res.status(403).json({ error: "Only admins and managers can create clawbacks" }); return;
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
    await prisma.notification.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     event.salesExecutiveId,
        title:      "Clawback Created",
        message:    `A commission clawback of ${cbAmount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} has been created for "${event.eventTitle}". Reason: ${reason.trim().slice(0, 100)}`,
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

  const validActions = ["SUBMIT", "APPROVE", "DECLINE", "WAIVE", "DISPUTE", "EXECUTE", "RECOVER"];
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

    // ── SUBMIT (DRAFT → PENDING_APPROVAL) ────────────────────────────────────
    if (action === "SUBMIT") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT clawbacks can be submitted" }); return; }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "PENDING_APPROVAL" },
        include: clawbackInclude,
      });
      res.json(clawbackToResponse(updated)); return;
    }

    // ── APPROVE (PENDING_APPROVAL → APPROVED) ────────────────────────────────
    if (action === "APPROVE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "PENDING_APPROVAL") { res.status(400).json({ error: "Only PENDING_APPROVAL clawbacks can be approved" }); return; }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "APPROVED", approvedById: req.user!.userId, approvedAt: new Date(), ...(notes && { notes: notes.trim() }) },
        include: clawbackInclude,
      });

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     execId,
          title:      "Clawback Approved",
          message:    `Your commission clawback for "${eventTitle}" has been approved. Amount: ${Number(cb.clawbackAmount).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}`,
          type:       "CLAWBACK_APPROVED",
          readStatus: false,
        },
      }).catch(() => {});

      res.json(clawbackToResponse(updated)); return;
    }

    // ── DECLINE (PENDING_APPROVAL → DECLINED) ────────────────────────────────
    if (action === "DECLINE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "PENDING_APPROVAL") { res.status(400).json({ error: "Only PENDING_APPROVAL clawbacks can be declined" }); return; }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "DECLINED", ...(notes && { notes: notes.trim() }) },
        include: clawbackInclude,
      });
      res.json(clawbackToResponse(updated)); return;
    }

    // ── WAIVE (APPROVED → WAIVED) ─────────────────────────────────────────────
    if (action === "WAIVE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (!["APPROVED", "PENDING_APPROVAL"].includes(cb.status)) {
        res.status(400).json({ error: "Clawback must be APPROVED or PENDING_APPROVAL to waive" }); return;
      }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "WAIVED", waiveReason: waiveReason?.trim() ?? null },
        include: clawbackInclude,
      });

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     execId,
          title:      "Clawback Waived",
          message:    `Your commission clawback for "${eventTitle}" has been waived.${waiveReason ? ` Reason: ${waiveReason.trim().slice(0, 100)}` : ""}`,
          type:       "CLAWBACK_WAIVED",
          readStatus: false,
        },
      }).catch(() => {});

      res.json(clawbackToResponse(updated)); return;
    }

    // ── DISPUTE (APPROVED → DISPUTED) ────────────────────────────────────────
    if (action === "DISPUTE") {
      if (cb.status !== "APPROVED") { res.status(400).json({ error: "Only APPROVED clawbacks can be disputed" }); return; }
      // Sales exec can dispute their own; admin/manager can also dispute
      const canDispute = cb.salesExecutiveId === req.user!.userId || managerRoles.includes(req.user!.role);
      if (!canDispute) { res.status(403).json({ error: "Forbidden" }); return; }

      const updated = await prisma.commissionClawback.update({
        where:   { id: cb.id },
        data:    { status: "DISPUTED", disputeNote: disputeNote?.trim() ?? null, disputedAt: new Date() },
        include: clawbackInclude,
      });

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     cb.createdById,
          title:      "Clawback Disputed",
          message:    `${actorName} has disputed the clawback for "${eventTitle}".${disputeNote ? ` Note: ${disputeNote.trim().slice(0, 100)}` : ""}`,
          type:       "CLAWBACK_DISPUTED",
          readStatus: false,
        },
      }).catch(() => {});

      res.json(clawbackToResponse(updated)); return;
    }

    // ── EXECUTE (APPROVED → EXECUTED, apply wallet deduction or future offset) ─

    if (action === "EXECUTE") {
      if (!managerRoles.includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
      if (cb.status !== "APPROVED") { res.status(400).json({ error: "Only APPROVED clawbacks can be executed" }); return; }
      if (!recoveryMethod || !["WALLET_DEDUCTION", "FUTURE_COMMISSION_OFFSET", "PAYROLL_DEDUCTION", "MANUAL_PAYMENT", "WAIVED"].includes(recoveryMethod)) {
        res.status(400).json({ error: "recoveryMethod is required: WALLET_DEDUCTION | FUTURE_COMMISSION_OFFSET | PAYROLL_DEDUCTION | MANUAL_PAYMENT | WAIVED" }); return;
      }

      const totalAmount = Number(cb.outstandingAmount);

      if (recoveryMethod === "WALLET_DEDUCTION") {
        // Deduct from wallet
        const wallet = await prisma.wallet.findUnique({ where: { userId: execId } });
        if (!wallet) { res.status(400).json({ error: "Sales executive has no wallet" }); return; }

        const deductAmount = totalAmount;

        await prisma.$transaction([
          // Deduct from available balance (allow going negative — clawback debt)
          prisma.wallet.update({
            where: { id: wallet.id },
            data:  { availableBalance: Number(wallet.availableBalance) - deductAmount },
          }),
          prisma.walletTransaction.create({
            data: {
              tenantId:       req.user!.tenantId,
              walletId:       wallet.id,
              transactionType: "CLAWBACK_DEDUCTION",
              amount:         deductAmount,
              referenceType:  "CLAWBACK",
              referenceId:    cb.id,
              description:    `Clawback: ${eventTitle}`,
            },
          }),
          prisma.clawbackRecovery.create({
            data: {
              tenantId:       req.user!.tenantId,
              clawbackId:     cb.id,
              recoveryMethod: "WALLET_DEDUCTION",
              amount:         deductAmount,
              description:    `Wallet deduction executed by ${actorName}`,
              createdById:    req.user!.userId,
            },
          }),
          prisma.commissionClawback.update({
            where: { id: cb.id },
            data:  {
              status:           "EXECUTED",
              recoveredAmount:  Number(cb.recoveredAmount) + deductAmount,
              outstandingAmount: 0,
              executedAt:       new Date(),
            },
          }),
        ]);

      } else if (recoveryMethod === "FUTURE_COMMISSION_OFFSET") {
        await prisma.$transaction([
          prisma.clawbackRecovery.create({
            data: {
              tenantId:       req.user!.tenantId,
              clawbackId:     cb.id,
              recoveryMethod: "FUTURE_COMMISSION_OFFSET",
              amount:         totalAmount,
              description:    `Future commission offset. To be deducted from next approved commission.`,
              createdById:    req.user!.userId,
            },
          }),
          prisma.commissionClawback.update({
            where: { id: cb.id },
            data:  { status: "EXECUTED", executedAt: new Date() },
          }),
        ]);

      } else if (recoveryMethod === "MANUAL_PAYMENT" || recoveryMethod === "PAYROLL_DEDUCTION") {
        const manualAmount = amount != null ? Number(amount) : totalAmount;
        await prisma.$transaction([
          prisma.clawbackRecovery.create({
            data: {
              tenantId:       req.user!.tenantId,
              clawbackId:     cb.id,
              recoveryMethod: recoveryMethod as any,
              amount:         manualAmount,
              description:    notes?.trim() ?? `Manual recovery recorded by ${actorName}`,
              createdById:    req.user!.userId,
            },
          }),
          prisma.commissionClawback.update({
            where: { id: cb.id },
            data:  {
              status:           "EXECUTED",
              recoveredAmount:  Number(cb.recoveredAmount) + manualAmount,
              outstandingAmount: Math.max(0, totalAmount - manualAmount),
              executedAt:       new Date(),
            },
          }),
        ]);

      } else if (recoveryMethod === "WAIVED") {
        await prisma.commissionClawback.update({
          where: { id: cb.id },
          data:  { status: "WAIVED", waiveReason: notes?.trim() ?? "Waived during execution", executedAt: new Date() },
        });
      }

      // Notify sales exec
      const notifyType = recoveryMethod === "WAIVED" ? "CLAWBACK_WAIVED" : "CLAWBACK_EXECUTED";
      const notifyMsg  = recoveryMethod === "WALLET_DEDUCTION"
        ? `A clawback of ${totalAmount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} has been deducted from your wallet for "${eventTitle}".`
        : recoveryMethod === "FUTURE_COMMISSION_OFFSET"
        ? `A clawback of ${totalAmount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} for "${eventTitle}" will be offset against your next commission payment.`
        : recoveryMethod === "PAYROLL_DEDUCTION"
        ? `A clawback of ${totalAmount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} for "${eventTitle}" will be deducted via payroll.`
        : recoveryMethod === "MANUAL_PAYMENT"
        ? `A manual recovery of ${(amount ?? totalAmount).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} has been recorded for your clawback on "${eventTitle}".`
        : `The clawback for "${eventTitle}" has been waived.`;

      await prisma.notification.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     execId,
          title:      recoveryMethod === "WAIVED" ? "Clawback Waived" : "Clawback Executed",
          message:    notifyMsg,
          type:       notifyType as any,
          readStatus: false,
        },
      }).catch(() => {});

      await prisma.auditLog.create({
        data: {
          tenantId:   req.user!.tenantId,
          userId:     req.user!.userId,
          action:     `CLAWBACK_EXECUTED`,
          entityType: "CommissionClawback",
          entityId:   cb.id,
          newValue:   JSON.stringify({ recoveryMethod, amount: totalAmount }),
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

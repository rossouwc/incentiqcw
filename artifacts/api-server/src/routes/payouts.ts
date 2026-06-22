import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
const TAX_RATE = 0.25;

function payoutToResponse(p: any) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    userId: p.userId,
    userName: p.user ? `${p.user.firstName} ${p.user.lastName}` : "",
    requestedAmount: p.requestedAmount,
    estimatedTax: p.estimatedTax,
    estimatedNetPayout: p.estimatedNetPayout,
    payoutMonth: p.payoutMonth,
    deferredToMonth: p.deferredToMonth ?? null,
    status: p.status,
    comments: p.comments ?? null,
    reviewerComments: p.reviewerComments ?? null,
    requestedAt: p.requestedAt.toISOString(),
    approvedAt: p.approvedAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    financeApprovedByName: p.financeApprovedBy
      ? `${p.financeApprovedBy.firstName} ${p.financeApprovedBy.lastName}`
      : null,
    payrollApprovedByName: p.payrollApprovedBy
      ? `${p.payrollApprovedBy.firstName} ${p.payrollApprovedBy.lastName}`
      : null,
    payrollApprovedAt: p.payrollApprovedAt?.toISOString() ?? null,
  };
}

// GET /api/payouts
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status, month } = req.query as { status?: string; month?: string };
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const isPayroll = req.user!.role === "PAYROLL";
  const where: any = {
    tenantId: req.user!.tenantId,
    ...(isSalesExec && { userId: req.user!.userId }),
    ...(isPayroll && !status && { status: { in: ["PENDING", "FINANCE_APPROVED", "PAYROLL_APPROVED"] } }),
    ...(isPayroll && status && status !== "ALL" && { status }),
    ...(!isPayroll && status && status !== "ALL" && { status }),
    ...(month && { payoutMonth: month }),
  };
  try {
    const payouts = await prisma.payoutRequest.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true } },
        financeApprovedBy: { select: { firstName: true, lastName: true } },
        payrollApprovedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
    res.json(payouts.map(payoutToResponse));
  } catch (err) {
    logger.error({ err }, "ListPayouts error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/payouts/export — data endpoint for Excel export
router.get("/export", requireAuth, async (req: Request, res: Response) => {
  const { month } = req.query as { month?: string };
  try {
    const payouts = await prisma.payoutRequest.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: { in: ["FINANCE_APPROVED", "PAYROLL_APPROVED"] },
        ...(month && { payoutMonth: month }),
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { requestedAt: "desc" },
    });
    res.json(payouts.map((p) => ({
      id: p.id,
      employeeName: `${p.user.firstName} ${p.user.lastName}`,
      email: p.user.email,
      requestedAmount: p.requestedAmount,
      estimatedTax: p.estimatedTax,
      estimatedNetPayout: p.estimatedNetPayout,
      payoutMonth: p.payoutMonth,
      approvedAt: p.approvedAt?.toISOString() ?? null,
    })));
  } catch (err) {
    logger.error({ err }, "ExportPayouts error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/payouts
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { requestedAmount, amount: amountAlias, payoutMonth: payoutMonthBody, deferredToMonth, comments } = req.body;
  const rawAmount = requestedAmount ?? amountAlias;
  if (!rawAmount || parseFloat(rawAmount) <= 0) {
    res.status(400).json({ error: "Amount must be greater than zero" }); return;
  }
  const amount = parseFloat(rawAmount);
  const now = new Date();
  const currentYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Default payoutMonth to current month
  const payoutMonth = payoutMonthBody || currentYYYYMM;

  // Validate payoutMonth >= current month
  if (payoutMonth < currentYYYYMM) {
    res.status(400).json({ error: "Payout month must be the current or a future month" }); return;
  }

  const estimatedTax = Math.round(amount * TAX_RATE * 100) / 100;
  const estimatedNetPayout = Math.round((amount - estimatedTax) * 100) / 100;

  // Detect deferred: payoutMonth > currentYYYYMM treated as deferred when deferredToMonth supplied
  const isDeferred = !!deferredToMonth;
  const status = isDeferred ? "DEFERRED" : "PENDING";

  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
    if (!wallet || wallet.availableBalance < amount) {
      res.status(400).json({ error: `Insufficient available balance. Available: R${wallet?.availableBalance?.toFixed(2) ?? "0.00"}` }); return;
    }

    const payout = await prisma.payoutRequest.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        requestedAmount: amount,
        estimatedTax,
        estimatedNetPayout,
        payoutMonth,
        deferredToMonth: deferredToMonth ?? null,
        status,
        comments: comments ?? null,
        requestedAt: new Date(),
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Update wallet — available → pending (or deferred)
    if (isDeferred) {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: Math.max(0, wallet.availableBalance - amount),
          deferredBalance: wallet.deferredBalance + amount,
        },
      });
      await prisma.walletTransaction.create({
        data: {
          tenantId: req.user!.tenantId,
          walletId: wallet.id,
          transactionType: "PAYOUT_DEFERRED",
          amount,
          referenceType: "PAYOUT_REQUEST",
          referenceId: payout.id,
          description: `Commission deferred to ${deferredToMonth}`,
        },
      });
    } else {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: Math.max(0, wallet.availableBalance - amount),
        },
      });
      await prisma.walletTransaction.create({
        data: {
          tenantId: req.user!.tenantId,
          walletId: wallet.id,
          transactionType: "PAYOUT_REQUESTED",
          amount,
          referenceType: "PAYOUT_REQUEST",
          referenceId: payout.id,
          description: `Payout requested for ${payoutMonth}`,
        },
      });

      // Notify finance users
      const financeUsers = await prisma.user.findMany({
        where: { tenantId: req.user!.tenantId, role: "FINANCE", status: "ACTIVE" },
      });
      if (financeUsers.length > 0) {
        await prisma.notification.createMany({
          data: financeUsers.map((u) => ({
            tenantId: req.user!.tenantId,
            userId: u.id,
            title: "Payout Request Pending",
            message: `${payout.user.firstName} ${payout.user.lastName} requested R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${payoutMonth}`,
            type: "PAYOUT_REQUESTED" as const,
            readStatus: false,
          })),
        });
      }
    }

    // Notify sales exec
    await prisma.notification.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        title: isDeferred ? "Commission Deferred" : "Payout Request Submitted",
        message: isDeferred
          ? `R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} deferred to ${deferredToMonth}`
          : `Your payout of R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${payoutMonth} is under review`,
        type: "PAYOUT_REQUESTED",
        readStatus: false,
      },
    });

    // ── Update commission event approval steps when payout is requested ───────
    // Find all events whose commission was credited to this wallet and mark
    // the SALES_EXECUTIVE step approved + activate the PAYROLL step.
    if (!isDeferred) {
      const commTxns = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id, transactionType: "COMMISSION_APPROVED" },
        select: { referenceId: true },
      });
      const eventIds = commTxns.map((t) => t.referenceId).filter(Boolean) as string[];
      if (eventIds.length > 0) {
        await prisma.commissionEventApproval.updateMany({
          where: { commissionEventId: { in: eventIds }, approverRole: "SALES_EXECUTIVE", status: "PENDING" },
          data: { status: "APPROVED", approvedAt: new Date() },
        });
        await prisma.commissionEventApproval.updateMany({
          where: { commissionEventId: { in: eventIds }, approverRole: "PAYROLL", status: "WAITING" },
          data: { status: "PENDING" },
        });
        await prisma.commissionEvent.updateMany({
          where: { id: { in: eventIds } },
          data: { walletStatus: "CREDITED" },
        });
      }
    }

    res.status(201).json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "CreatePayout error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/payouts/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const payout = await prisma.payoutRequest.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        financeApprovedBy: { select: { firstName: true, lastName: true } },
        payrollApprovedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!payout) { res.status(404).json({ error: "Payout not found" }); return; }
    res.json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "GetPayout error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/payouts/:id/approval-trail
router.get("/:id/approval-trail", requireAuth, async (req: Request, res: Response) => {
  try {
    const payout = await prisma.payoutRequest.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!payout) { res.status(404).json({ error: "Payout not found" }); return; }

    // Find the wallet for this user
    const wallet = await prisma.wallet.findUnique({ where: { userId: payout.userId } });

    // Find commission event IDs via wallet transactions (COMMISSION_APPROVED credits)
    let commissionEventIds: string[] = [];
    if (wallet) {
      const txns = await prisma.walletTransaction.findMany({
        where: {
          walletId: wallet.id,
          transactionType: "COMMISSION_APPROVED",
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      commissionEventIds = txns.map((t) => t.referenceId).filter(Boolean) as string[];
    }

    // Fetch approval steps for those commission events
    let dealSteps: any[] = [];
    if (commissionEventIds.length > 0) {
      const approvals = await prisma.commissionEventApproval.findMany({
        where: {
          commissionEventId: { in: commissionEventIds },
          status: "APPROVED",
        },
        include: {
          approver: { select: { firstName: true, lastName: true } },
          commissionEvent: { select: { eventTitle: true } },
        },
        orderBy: [{ commissionEventId: "asc" }, { approvalStep: "asc" }],
      });
      dealSteps = approvals.map((a) => ({
        kind: "deal_step" as const,
        stepName: a.stepName ?? a.approverRole,
        approverRole: a.approverRole,
        approverName: a.approver ? `${a.approver.firstName} ${a.approver.lastName}` : null,
        approvedAt: a.approvedAt?.toISOString() ?? null,
        eventTitle: a.commissionEvent?.eventTitle ?? null,
      }));
    }

    res.json({
      dealSteps,
      payout: {
        userName: `${payout.user.firstName} ${payout.user.lastName}`,
        requestedAt: payout.requestedAt.toISOString(),
        status: payout.status,
      },
    });
  } catch (err) {
    logger.error({ err }, "GetPayoutApprovalTrail error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/payouts/:id — finance: approve or reject
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const { status, reviewerComments } = req.body;
  if (!status || !["FINANCE_APPROVED", "REJECTED"].includes(status)) {
    res.status(400).json({ error: "status must be FINANCE_APPROVED or REJECTED" }); return;
  }
  if (!["FINANCE", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role)) {
    res.status(403).json({ error: "Finance role required" }); return;
  }
  try {
    const existing = await prisma.payoutRequest.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Payout not found" }); return; }
    if (!["PENDING"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot update payout with status ${existing.status}` }); return;
    }

    const payout = await prisma.payoutRequest.update({
      where: { id: req.params.id as string },
      data: {
        status,
        reviewerComments: reviewerComments ?? null,
        ...(status === "FINANCE_APPROVED" && {
          approvedAt: new Date(),
          financeApprovedById: req.user!.userId,
        }),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        financeApprovedBy: { select: { firstName: true, lastName: true } },
        payrollApprovedBy: { select: { firstName: true, lastName: true } },
      },
    });

    const wallet = await prisma.wallet.findUnique({ where: { userId: existing.userId } });

    if (status === "REJECTED" && wallet) {
      // Return amount to available
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: wallet.availableBalance + existing.requestedAmount,
        },
      });
      await prisma.walletTransaction.create({
        data: {
          tenantId: req.user!.tenantId,
          walletId: wallet.id,
          transactionType: "CREDIT",
          amount: existing.requestedAmount,
          referenceType: "PAYOUT_REQUEST",
          referenceId: existing.id,
          description: `Payout rejected — funds returned to wallet`,
        },
      });
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: existing.userId,
          title: "Payout Request Rejected",
          message: `Your payout of R${existing.requestedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${existing.payoutMonth} was rejected${reviewerComments ? `: ${reviewerComments}` : ""}`,
          type: "PAYOUT_REJECTED" as any,
          readStatus: false,
        },
      });
    } else if (status === "FINANCE_APPROVED") {
      // Notify payroll users
      const payrollUsers = await prisma.user.findMany({
        where: { tenantId: req.user!.tenantId, role: "PAYROLL", status: "ACTIVE" },
      });
      if (payrollUsers.length > 0) {
        await prisma.notification.createMany({
          data: payrollUsers.map((u) => ({
            tenantId: req.user!.tenantId,
            userId: u.id,
            title: "Payout Ready for Processing",
            message: `${payout.user.firstName} ${payout.user.lastName} — R${existing.requestedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} approved for ${existing.payoutMonth}`,
            type: "PAYOUT_APPROVED" as const,
            readStatus: false,
          })),
        });
      }
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: existing.userId,
          title: "Payout Approved by Finance",
          message: `Your payout of R${existing.requestedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${existing.payoutMonth} has been approved and sent to payroll`,
          type: "PAYOUT_APPROVED",
          readStatus: false,
        },
      });
    }

    res.json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "UpdatePayout error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/payouts/:id/mark-paid — payroll marks as paid
router.post("/:id/mark-paid", requireAuth, async (req: Request, res: Response) => {
  if (!["PAYROLL", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role)) {
    res.status(403).json({ error: "Payroll role required" }); return;
  }
  try {
    const existing = await prisma.payoutRequest.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Payout not found" }); return; }
    if (!["PENDING", "FINANCE_APPROVED", "PAYROLL_APPROVED"].includes(existing.status)) {
      res.status(400).json({ error: "Only PENDING, FINANCE_APPROVED, or PAYROLL_APPROVED payouts can be processed" }); return;
    }

    const isFinalPayment = existing.status === "PAYROLL_APPROVED";
    const newStatus = isFinalPayment ? "PAID" : "PAYROLL_APPROVED";

    const payout = await prisma.payoutRequest.update({
      where: { id: req.params.id as string },
      data: {
        status: newStatus,
        paidAt: isFinalPayment ? new Date() : undefined,
        payrollApprovedById: req.user!.userId,
        payrollApprovedAt: new Date(),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        financeApprovedBy: { select: { firstName: true, lastName: true } },
        payrollApprovedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (isFinalPayment) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: existing.userId } });
      if (wallet) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            paidOutBalance: wallet.paidOutBalance + existing.requestedAmount,
          },
        });
        await prisma.walletTransaction.create({
          data: {
            tenantId: req.user!.tenantId,
            walletId: wallet.id,
            transactionType: "PAYOUT_PAID",
            amount: existing.requestedAmount,
            referenceType: "PAYOUT_REQUEST",
            referenceId: payout.id,
            description: `Payout paid — ${existing.payoutMonth}`,
          },
        });
        // ── Mark PAYROLL approval steps as APPROVED for all events on this wallet ──
        const commTxns = await prisma.walletTransaction.findMany({
          where: { walletId: wallet.id, transactionType: "COMMISSION_APPROVED" },
          select: { referenceId: true },
        });
        const eventIds = commTxns.map((t) => t.referenceId).filter(Boolean) as string[];
        if (eventIds.length > 0) {
          // Advance PAYROLL approval steps
          await prisma.commissionEventApproval.updateMany({
            where: { commissionEventId: { in: eventIds }, approverRole: "PAYROLL", status: { in: ["PENDING", "WAITING"] } },
            data: { status: "APPROVED", approvedAt: new Date() },
          });
          // Advance the overall CommissionEvent status to fully APPROVED
          await prisma.commissionEvent.updateMany({
            where: {
              id:             { in: eventIds },
              approvalStatus: { not: "APPROVED" },
            },
            data: { approvalStatus: "APPROVED" },
          });
        }
      }
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: existing.userId,
          title: "Payout Paid",
          message: `Your commission payout of R${existing.requestedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${existing.payoutMonth} has been paid`,
          type: "PAYOUT_PAID",
          readStatus: false,
        },
      });
    } else {
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: existing.userId,
          title: "Payout Payroll Approved",
          message: `Your payout of R${existing.requestedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${existing.payoutMonth} has been approved by payroll`,
          type: "PAYOUT_PAID",
          readStatus: false,
        },
      });
    }

    res.json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "MarkPaid error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/payouts/process-payroll — auto-mark PAYROLL_APPROVED → PAID when payroll date is reached
router.post("/process-payroll", requireAuth, async (req: Request, res: Response) => {
  if (!["PAYROLL", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role)) {
    res.status(403).json({ error: "Payroll role required" }); return;
  }
  const tenantId = req.user!.tenantId;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const payrollDay = tenant?.payrollDay ?? 25;
    const today = new Date();

    const eligible = await prisma.payoutRequest.findMany({
      where: { tenantId, status: "PAYROLL_APPROVED" },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    let processed = 0;
    for (const p of eligible) {
      const [year, month] = p.payoutMonth.split("-").map(Number);
      const payrollDate = new Date(year, month - 1, payrollDay);
      if (today >= payrollDate) {
        await prisma.payoutRequest.update({
          where: { id: p.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        const wallet = await prisma.wallet.findUnique({ where: { userId: p.userId } });
        if (wallet) {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              paidOutBalance: wallet.paidOutBalance + p.requestedAmount,
            },
          });
          await prisma.walletTransaction.create({
            data: {
              tenantId,
              walletId: wallet.id,
              transactionType: "PAYOUT_PAID",
              amount: p.requestedAmount,
              referenceType: "PAYOUT_REQUEST",
              referenceId: p.id,
              description: `Auto-paid on payroll date — ${p.payoutMonth}`,
            },
          });
        }
        await prisma.notification.create({
          data: {
            tenantId,
            userId: p.userId,
            title: "Payout Paid",
            message: `Your commission payout of R${p.requestedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${p.payoutMonth} has been paid`,
            type: "PAYOUT_PAID",
            readStatus: false,
          },
        });
        processed++;
      }
    }
    res.json({ processed, payrollDay });
  } catch (err) {
    logger.error({ err }, "ProcessPayroll error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as payoutsRouter };

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
    status: p.status,
    requestedAt: p.requestedAt.toISOString(),
    approvedAt: p.approvedAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
  };
}

// GET /api/payouts
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  const isSalesExec = req.user!.role === "SALES_EXECUTIVE";
  const where: any = {
    tenantId: req.user!.tenantId,
    ...(isSalesExec && { userId: req.user!.userId }),
    ...(status && { status }),
  };
  try {
    const payouts = await prisma.payoutRequest.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { requestedAt: "desc" },
    });
    res.json(payouts.map(payoutToResponse));
  } catch (err) {
    logger.error({ err }, "ListPayouts error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/payouts
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { requestedAmount, payoutMonth } = req.body;
  if (!requestedAmount || parseFloat(requestedAmount) <= 0) {
    res.status(400).json({ error: "Valid requestedAmount required" }); return;
  }
  if (!payoutMonth) {
    res.status(400).json({ error: "payoutMonth required (YYYY-MM)" }); return;
  }
  const amount = parseFloat(requestedAmount);
  const estimatedTax = Math.round(amount * TAX_RATE * 100) / 100;
  const estimatedNetPayout = Math.round((amount - estimatedTax) * 100) / 100;
  try {
    // Check wallet has sufficient available balance
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
    if (wallet && wallet.availableBalance < amount) {
      res.status(400).json({ error: "Insufficient available balance" }); return;
    }
    const payout = await prisma.payoutRequest.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        requestedAmount: amount,
        estimatedTax,
        estimatedNetPayout,
        payoutMonth,
        status: "PENDING",
        requestedAt: new Date(),
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Update wallet — move from available to pending
    if (wallet) {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: Math.max(0, wallet.availableBalance - amount),
          pendingBalance: wallet.pendingBalance + amount,
        },
      });
    }

    // Notify finance users
    const financeUsers = await prisma.user.findMany({ where: { tenantId: req.user!.tenantId, role: "FINANCE", status: "ACTIVE" } });
    if (financeUsers.length > 0) {
      await prisma.notification.createMany({
        data: financeUsers.map(u => ({
          tenantId: req.user!.tenantId, userId: u.id,
          title: "Payout Request Pending",
          message: `${payout.user.firstName} ${payout.user.lastName} has requested a payout of R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${payoutMonth}`,
          type: "PAYOUT_REQUESTED" as const, readStatus: false,
        })),
      });
    }
    await prisma.notification.create({
      data: {
        tenantId: req.user!.tenantId, userId: req.user!.userId,
        title: "Payout Request Submitted",
        message: `Your payout of R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${payoutMonth} is under review`,
        type: "PAYOUT_REQUESTED", readStatus: false,
      },
    });
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
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!payout) { res.status(404).json({ error: "Payout not found" }); return; }
    res.json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "GetPayout error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/payouts/:id — finance/admin approve or reject
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status || !["FINANCE_APPROVED", "PAID", "REJECTED"].includes(status)) {
    res.status(400).json({ error: "status must be FINANCE_APPROVED, PAID, or REJECTED" }); return;
  }
  try {
    const existing = await prisma.payoutRequest.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) { res.status(404).json({ error: "Payout not found" }); return; }

    const payout = await prisma.payoutRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(status === "FINANCE_APPROVED" && { approvedAt: new Date() }),
        ...(status === "PAID" && { paidAt: new Date() }),
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const wallet = await prisma.wallet.findUnique({ where: { userId: existing.userId } });

    if (status === "PAID" && wallet) {
      // Deduct from pendingBalance, add to paidOut, create transaction
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBalance: Math.max(0, wallet.pendingBalance - existing.requestedAmount),
          paidOutBalance: wallet.paidOutBalance + existing.requestedAmount,
        },
      });
      await prisma.walletTransaction.create({
        data: {
          tenantId: req.user!.tenantId,
          walletId: wallet.id,
          transactionType: "PAYOUT",
          amount: existing.requestedAmount,
          referenceType: "PAYOUT_REQUEST",
          referenceId: payout.id,
          description: `Payout processed for ${existing.payoutMonth}`,
        },
      });
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId, userId: existing.userId,
          title: "Payout Paid",
          message: `Your payout of R${existing.requestedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} has been paid`,
          type: "PAYOUT_PAID", readStatus: false,
        },
      });
    } else if (status === "REJECTED" && wallet) {
      // Return amount to available
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: wallet.availableBalance + existing.requestedAmount,
          pendingBalance: Math.max(0, wallet.pendingBalance - existing.requestedAmount),
        },
      });
    } else if (status === "FINANCE_APPROVED") {
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId, userId: existing.userId,
          title: "Payout Approved by Finance",
          message: `Your payout request for ${existing.payoutMonth} has been approved and will be processed`,
          type: "PAYOUT_APPROVED", readStatus: false,
        },
      });
    }
    res.json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "UpdatePayout error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as payoutsRouter };

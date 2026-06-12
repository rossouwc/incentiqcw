import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function payoutToResponse(p: any) {
  return {
    id: p.id,
    userId: p.userId,
    userName: p.user ? `${p.user.firstName} ${p.user.lastName}` : "",
    amount: p.amount,
    status: p.status,
    notes: p.notes,
    reviewedBy: p.reviewedBy,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  const where: any = { tenantId: req.user!.tenantId };
  if (req.user!.role === "SALES_EXECUTIVE") where.userId = req.user!.userId;
  if (status) where.status = status;
  try {
    const payouts = await prisma.payoutRequest.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(payouts.map(payoutToResponse));
  } catch (err) {
    logger.error({ err }, "ListPayouts error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { amount, notes } = req.body;
  if (!amount || parseFloat(amount) <= 0) {
    res.status(400).json({ error: "Valid amount required" }); return;
  }
  try {
    const payout = await prisma.payoutRequest.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        amount: parseFloat(amount),
        status: "PENDING",
        notes: notes || null,
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    // Notification
    await prisma.notification.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        title: "Payout Requested",
        message: `Payout request of R${parseFloat(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })} submitted successfully`,
      },
    });
    res.status(201).json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "CreatePayout error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:payoutId", requireAuth, async (req: Request, res: Response) => {
  try {
    const payout = await prisma.payoutRequest.findFirst({
      where: { id: req.params.payoutId, tenantId: req.user!.tenantId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!payout) { res.status(404).json({ error: "Payout not found" }); return; }
    res.json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "GetPayout error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:payoutId", requireAuth, async (req: Request, res: Response) => {
  const { status, notes } = req.body;
  try {
    const payout = await prisma.payoutRequest.update({
      where: { id: req.params.payoutId },
      data: {
        status,
        notes: notes || null,
        reviewedBy: req.user!.userId,
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    // If paid, create payout transaction
    if (status === "PAID") {
      await prisma.transaction.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: payout.userId,
          type: "PAYOUT",
          amount: payout.amount,
          description: `Payout processed`,
          referenceId: payout.id,
        },
      });
    }
    res.json(payoutToResponse(payout));
  } catch (err) {
    logger.error({ err }, "UpdatePayoutStatus error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as payoutsRouter };

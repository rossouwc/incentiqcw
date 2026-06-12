import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function calcCommission(tenantId: string, dealType: string, grossProfit: number) {
  const rates: Record<string, number> = {
    NET_NEW: 0.10, RENEWAL: 0.05, UPSELL: 0.075, CROSS_SELL: 0.06,
  };
  return Math.round(grossProfit * (rates[dealType] ?? 0.10) * 100) / 100;
}

function dealToResponse(deal: any, userName?: string) {
  return {
    id: deal.id,
    tenantId: deal.tenantId,
    userId: deal.userId,
    userName: userName ?? `${deal.user?.firstName ?? ""} ${deal.user?.lastName ?? ""}`.trim(),
    dealName: deal.dealName,
    dealType: deal.dealType,
    grossProfit: deal.grossProfit,
    commission: deal.commission,
    status: deal.status,
    notes: deal.notes,
    closedAt: deal.closedAt ? deal.closedAt.toISOString() : null,
    createdAt: deal.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status, dealType, page = "1", limit = "20" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const where: any = { tenantId: req.user!.tenantId };
    if (req.user!.role === "SALES_EXECUTIVE") where.userId = req.user!.userId;
    if (status) where.status = status;
    if (dealType) where.dealType = dealType;

    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.deal.count({ where }),
    ]);

    res.json({
      data: deals.map(d => dealToResponse(d)),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    logger.error({ err }, "ListDeals error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { dealName, dealType, grossProfit, notes, closedAt } = req.body;
  if (!dealName || !dealType || !grossProfit) {
    res.status(400).json({ error: "dealName, dealType, grossProfit required" }); return;
  }
  try {
    const commission = calcCommission(req.user!.tenantId, dealType, parseFloat(grossProfit));
    const deal = await prisma.deal.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        dealName, dealType,
        grossProfit: parseFloat(grossProfit),
        commission,
        status: "SUBMITTED",
        notes: notes || null,
        closedAt: closedAt ? new Date(closedAt) : null,
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Create approval entry
    await prisma.approval.create({
      data: {
        tenantId: req.user!.tenantId,
        type: "DEAL",
        referenceId: deal.id,
        referenceName: dealName,
        requestedById: req.user!.userId,
        status: "PENDING",
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action: "CREATE",
        entity: "Deal",
        entityId: deal.id,
        metadata: JSON.stringify({ dealName, dealType, grossProfit }),
      },
    });

    res.status(201).json(dealToResponse(deal));
  } catch (err) {
    logger.error({ err }, "CreateDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:dealId", requireAuth, async (req: Request, res: Response) => {
  try {
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.dealId, tenantId: req.user!.tenantId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }
    res.json(dealToResponse(deal));
  } catch (err) {
    logger.error({ err }, "GetDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:dealId", requireAuth, async (req: Request, res: Response) => {
  const { dealName, dealType, grossProfit, notes, status, closedAt } = req.body;
  try {
    const existing = await prisma.deal.findFirst({ where: { id: req.params.dealId, tenantId: req.user!.tenantId } });
    if (!existing) { res.status(404).json({ error: "Deal not found" }); return; }

    let commission = existing.commission;
    if (grossProfit && dealType) commission = calcCommission(req.user!.tenantId, dealType ?? existing.dealType, parseFloat(grossProfit));

    const deal = await prisma.deal.update({
      where: { id: req.params.dealId },
      data: {
        ...(dealName && { dealName }),
        ...(dealType && { dealType }),
        ...(grossProfit && { grossProfit: parseFloat(grossProfit), commission }),
        ...(notes !== undefined && { notes }),
        ...(status && { status }),
        ...(closedAt !== undefined && { closedAt: closedAt ? new Date(closedAt) : null }),
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // If deal becomes approved, add wallet credit
    if (status === "EXECUTIVE_APPROVED" && existing.status !== "EXECUTIVE_APPROVED") {
      await prisma.transaction.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: existing.userId,
          type: "CREDIT",
          amount: deal.commission,
          description: `Commission credited for ${deal.dealName}`,
          referenceId: deal.id,
        },
      });
    }

    res.json(dealToResponse(deal));
  } catch (err) {
    logger.error({ err }, "UpdateDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:dealId", requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.deal.delete({ where: { id: req.params.dealId } });
    res.json({ message: "Deal deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteDeal error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as dealsRouter };

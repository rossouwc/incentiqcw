import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function ruleToResponse(r: any) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    ruleName: r.ruleName,
    dealType: r.dealType,
    commissionPercentage: r.commissionPercentage,
    appliesToRole: r.appliesToRole,
    minGrossProfit: r.minGrossProfit,
    maxGrossProfit: r.maxGrossProfit,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// GET /api/commission-rules
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const rules = await prisma.commissionRule.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { effectiveFrom: "desc" },
    });
    res.json(rules.map(ruleToResponse));
  } catch (err) {
    logger.error({ err }, "ListRules error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/commission-rules — ADMIN+ only
router.post("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { ruleName, dealType, commissionPercentage, appliesToRole, minGrossProfit, maxGrossProfit, effectiveFrom, effectiveTo } = req.body;
  if (!ruleName || !dealType || commissionPercentage == null || !effectiveFrom) {
    res.status(400).json({ error: "ruleName, dealType, commissionPercentage, effectiveFrom required" }); return;
  }
  try {
    const rule = await prisma.commissionRule.create({
      data: {
        tenantId: req.user!.tenantId,
        ruleName,
        dealType,
        commissionPercentage: parseFloat(commissionPercentage),
        appliesToRole: appliesToRole ?? "SALES_EXECUTIVE",
        minGrossProfit: minGrossProfit ? parseFloat(minGrossProfit) : null,
        maxGrossProfit: maxGrossProfit ? parseFloat(maxGrossProfit) : null,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        status: "ACTIVE",
      },
    });
    res.status(201).json(ruleToResponse(rule));
  } catch (err) {
    logger.error({ err }, "CreateRule error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/commission-rules/:id — ADMIN+ only
router.patch("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { ruleName, commissionPercentage, minGrossProfit, maxGrossProfit, effectiveTo, status } = req.body;
  try {
    const rule = await prisma.commissionRule.update({
      where: { id: req.params.id },
      data: {
        ...(ruleName && { ruleName }),
        ...(commissionPercentage != null && { commissionPercentage: parseFloat(commissionPercentage) }),
        ...(minGrossProfit != null && { minGrossProfit: parseFloat(minGrossProfit) }),
        ...(maxGrossProfit != null && { maxGrossProfit: parseFloat(maxGrossProfit) }),
        ...(effectiveTo !== undefined && { effectiveTo: effectiveTo ? new Date(effectiveTo) : null }),
        ...(status && { status }),
      },
    });
    res.json(ruleToResponse(rule));
  } catch (err) {
    logger.error({ err }, "UpdateRule error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/commission-rules/:id — ADMIN+ only
router.delete("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    await prisma.commissionRule.delete({ where: { id: req.params.id } });
    res.json({ message: "Rule deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteRule error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as commissionRulesRouter };

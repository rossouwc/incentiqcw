import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function ruleToResponse(r: any) {
  return {
    id: r.id, tenantId: r.tenantId, name: r.name, dealType: r.dealType,
    rateType: r.rateType, rateValue: r.rateValue, minGrossProfit: r.minGrossProfit,
    maxGrossProfit: r.maxGrossProfit, isActive: r.isActive, createdAt: r.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const rules = await prisma.commissionRule.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: "desc" },
    });
    res.json(rules.map(ruleToResponse));
  } catch (err) {
    logger.error({ err }, "ListRules error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { name, dealType, rateType, rateValue, minGrossProfit, maxGrossProfit } = req.body;
  if (!name || !dealType || !rateType || rateValue === undefined) {
    res.status(400).json({ error: "name, dealType, rateType, rateValue required" }); return;
  }
  try {
    const rule = await prisma.commissionRule.create({
      data: {
        tenantId: req.user!.tenantId, name, dealType, rateType,
        rateValue: parseFloat(rateValue),
        minGrossProfit: minGrossProfit ? parseFloat(minGrossProfit) : null,
        maxGrossProfit: maxGrossProfit ? parseFloat(maxGrossProfit) : null,
      },
    });
    res.status(201).json(ruleToResponse(rule));
  } catch (err) {
    logger.error({ err }, "CreateRule error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:ruleId", requireAuth, async (req: Request, res: Response) => {
  const { name, rateValue, isActive } = req.body;
  try {
    const rule = await prisma.commissionRule.update({
      where: { id: req.params.ruleId },
      data: {
        ...(name && { name }),
        ...(rateValue !== undefined && { rateValue: parseFloat(rateValue) }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(ruleToResponse(rule));
  } catch (err) {
    logger.error({ err }, "UpdateRule error");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:ruleId", requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.commissionRule.delete({ where: { id: req.params.ruleId } });
    res.json({ message: "Rule deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteRule error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as commissionRulesRouter };

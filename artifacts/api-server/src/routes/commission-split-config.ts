import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/commission-split-config — all authenticated users can view
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const config = await prisma.commissionSplitConfig.findUnique({
      where: { tenantId: req.user!.tenantId },
    });
    res.json(config ?? {
      isEnabled:     false,
      internalLabel: "Internal Referral",
      deductionType: "PERCENTAGE",
      deductionValue: 0,
    });
  } catch (err) {
    logger.error({ err }, "GetCommissionSplitConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/commission-split-config — ADMIN only
router.put("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { isEnabled, internalLabel, deductionType, deductionValue } = req.body;

  if (deductionType && !["PERCENTAGE", "FLAT_AMOUNT"].includes(deductionType)) {
    res.status(400).json({ error: "deductionType must be PERCENTAGE or FLAT_AMOUNT" });
    return;
  }
  const value = Number(deductionValue ?? 0);
  if (isNaN(value) || value < 0) {
    res.status(400).json({ error: "deductionValue must be a non-negative number" });
    return;
  }
  if (deductionType === "PERCENTAGE" && value > 100) {
    res.status(400).json({ error: "Percentage deduction cannot exceed 100" });
    return;
  }

  try {
    const config = await prisma.commissionSplitConfig.upsert({
      where:  { tenantId: req.user!.tenantId },
      create: {
        tenantId:      req.user!.tenantId,
        isEnabled:     Boolean(isEnabled),
        internalLabel: internalLabel?.trim() || "Internal Referral",
        deductionType: deductionType ?? "PERCENTAGE",
        deductionValue: value,
      },
      update: {
        ...(isEnabled !== undefined && { isEnabled: Boolean(isEnabled) }),
        ...(internalLabel !== undefined && { internalLabel: internalLabel.trim() || "Internal Referral" }),
        ...(deductionType !== undefined && { deductionType }),
        ...(deductionValue !== undefined && { deductionValue: value }),
      },
    });
    res.json(config);
  } catch (err) {
    logger.error({ err }, "UpdateCommissionSplitConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as commissionSplitConfigRouter };

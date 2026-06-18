import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const adminRoles = ["ADMIN", "SUPER_ADMIN"];

function configToResponse(c: any) {
  return {
    id:              c.id,
    tenantId:        c.tenantId,
    stepOrder:       c.stepOrder,
    stepName:        c.stepName,
    approverRole:    c.approverRole,
    thresholdAmount: c.thresholdAmount ? Number(c.thresholdAmount) : null,
    isActive:        c.isActive,
    createdAt:       c.createdAt.toISOString(),
    updatedAt:       c.updatedAt.toISOString(),
  };
}

// ── GET /api/clawback-approval-config ─────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const configs = await prisma.clawbackApprovalConfig.findMany({
      where:   { tenantId: req.user!.tenantId },
      orderBy: { stepOrder: "asc" },
    });
    res.json(configs.map(configToResponse));
  } catch (err) {
    logger.error({ err }, "ClawbackApprovalConfig GET error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/clawback-approval-config ────────────────────────────────────────
router.post("/", requireAuth, async (req: Request, res: Response) => {
  if (!adminRoles.includes(req.user!.role)) {
    res.status(403).json({ error: "Only admins can configure clawback approval steps" }); return;
  }

  const { stepOrder, stepName, approverRole, thresholdAmount, isActive } = req.body as {
    stepOrder:       number;
    stepName:        string;
    approverRole:    string;
    thresholdAmount?: number | null;
    isActive?:       boolean;
  };

  if (!stepOrder || !stepName || !approverRole) {
    res.status(400).json({ error: "stepOrder, stepName and approverRole are required" }); return;
  }

  const validRoles = ["ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE", "EXECUTIVE", "PAYROLL", "SALES_EXECUTIVE"];
  if (!validRoles.includes(approverRole)) {
    res.status(400).json({ error: `approverRole must be one of: ${validRoles.join(", ")}` }); return;
  }

  try {
    const config = await prisma.clawbackApprovalConfig.create({
      data: {
        tenantId:        req.user!.tenantId,
        stepOrder,
        stepName:        stepName.trim(),
        approverRole:    approverRole as any,
        thresholdAmount: thresholdAmount != null ? thresholdAmount : null,
        isActive:        isActive !== false,
      },
    });
    res.status(201).json(configToResponse(config));
  } catch (err: any) {
    if (err?.code === "P2002") {
      res.status(409).json({ error: `Step order ${stepOrder} already exists for this tenant` }); return;
    }
    logger.error({ err }, "ClawbackApprovalConfig POST error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/clawback-approval-config/:id ───────────────────────────────────
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  if (!adminRoles.includes(req.user!.role)) {
    res.status(403).json({ error: "Only admins can configure clawback approval steps" }); return;
  }

  const { stepName, approverRole, thresholdAmount, isActive } = req.body as {
    stepName?:        string;
    approverRole?:    string;
    thresholdAmount?: number | null;
    isActive?:        boolean;
  };

  try {
    const existing = await prisma.clawbackApprovalConfig.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const config = await prisma.clawbackApprovalConfig.update({
      where: { id: existing.id },
      data: {
        ...(stepName      && { stepName: stepName.trim() }),
        ...(approverRole  && { approverRole: approverRole as any }),
        ...(thresholdAmount !== undefined && { thresholdAmount: thresholdAmount }),
        ...(isActive      !== undefined   && { isActive }),
      },
    });
    res.json(configToResponse(config));
  } catch (err) {
    logger.error({ err }, "ClawbackApprovalConfig PATCH error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/clawback-approval-config/:id ──────────────────────────────────
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  if (!adminRoles.includes(req.user!.role)) {
    res.status(403).json({ error: "Only admins can delete clawback approval steps" }); return;
  }

  try {
    const existing = await prisma.clawbackApprovalConfig.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await prisma.clawbackApprovalConfig.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "ClawbackApprovalConfig DELETE error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as clawbackApprovalConfigRouter };

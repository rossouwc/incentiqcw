import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

function configToResponse(c: any) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    stepOrder: c.stepOrder,
    stepName: c.stepName,
    approverRole: c.approverRole,
    approverUserId: c.approverUserId ?? null,
    approverName: c.approver ? `${c.approver.firstName} ${c.approver.lastName}` : null,
    approverEmail: c.approver?.email ?? null,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const approverInclude = {
  approver: { select: { firstName: true, lastName: true, email: true } },
};

// GET /api/approval-configs
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const configs = await prisma.approvalConfig.findMany({
      where: { tenantId: req.user!.tenantId },
      include: approverInclude,
      orderBy: { stepOrder: "asc" },
    });
    res.json(configs.map(configToResponse));
  } catch (err) {
    logger.error({ err }, "ListApprovalConfigs error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/approval-configs
router.post("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { stepName, approverRole, approverUserId, isActive, stepOrder } = req.body;
  if (!stepName || !approverRole) {
    res.status(400).json({ error: "stepName and approverRole are required" });
    return;
  }
  try {
    // Auto-assign stepOrder if not provided
    let order = stepOrder;
    if (order == null) {
      const last = await prisma.approvalConfig.findFirst({
        where: { tenantId: req.user!.tenantId },
        orderBy: { stepOrder: "desc" },
      });
      order = last ? last.stepOrder + 1 : 1;
    } else {
      // Shift existing steps to make room
      await prisma.approvalConfig.updateMany({
        where: { tenantId: req.user!.tenantId, stepOrder: { gte: order } },
        data: { stepOrder: { increment: 1 } },
      });
    }
    const config = await prisma.approvalConfig.create({
      data: {
        tenantId: req.user!.tenantId,
        stepOrder: order,
        stepName,
        approverRole,
        approverUserId: approverUserId ?? null,
        isActive: isActive !== false,
      },
      include: approverInclude,
    });
    res.status(201).json(configToResponse(config));
  } catch (err) {
    logger.error({ err }, "CreateApprovalConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/approval-configs/:id
router.patch("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { stepName, approverRole, approverUserId, isActive, stepOrder } = req.body;
  try {
    const existing = await prisma.approvalConfig.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Config not found" }); return; }

    // Handle reorder inside a transaction to avoid unique-constraint collisions
    const config = await prisma.$transaction(async (tx) => {
      if (stepOrder != null && stepOrder !== existing.stepOrder) {
        const TEMP = 99999;
        // Park the moving step at a safe temp value
        await tx.approvalConfig.update({ where: { id: existing.id }, data: { stepOrder: TEMP } });

        if (stepOrder > existing.stepOrder) {
          // Moving down: pull the steps above it down by one
          await tx.approvalConfig.updateMany({
            where: { tenantId: req.user!.tenantId, stepOrder: { gt: existing.stepOrder, lte: stepOrder }, id: { not: existing.id } },
            data: { stepOrder: { decrement: 1 } },
          });
        } else {
          // Moving up: push the steps below it up by one (process highest-first to avoid collisions)
          const toShift = await tx.approvalConfig.findMany({
            where: { tenantId: req.user!.tenantId, stepOrder: { gte: stepOrder, lt: existing.stepOrder }, id: { not: existing.id } },
            orderBy: { stepOrder: "desc" },
          });
          for (const row of toShift) {
            await tx.approvalConfig.update({ where: { id: row.id }, data: { stepOrder: row.stepOrder + 1 } });
          }
        }
      }

      return tx.approvalConfig.update({
        where: { id: req.params.id as string },
        data: {
          ...(stepName !== undefined && { stepName }),
          ...(approverRole !== undefined && { approverRole }),
          ...(approverUserId !== undefined && { approverUserId: approverUserId || null }),
          ...(isActive !== undefined && { isActive }),
          ...(stepOrder != null && { stepOrder }),
        },
        include: approverInclude,
      });
    });
    res.json(configToResponse(config));
  } catch (err) {
    logger.error({ err }, "UpdateApprovalConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/approval-configs/:id
router.delete("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.approvalConfig.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Config not found" }); return; }
    await prisma.approvalConfig.delete({ where: { id: req.params.id as string } });
    // Re-normalize stepOrder
    const remaining = await prisma.approvalConfig.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { stepOrder: "asc" },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].stepOrder !== i + 1) {
        await prisma.approvalConfig.update({ where: { id: remaining[i].id }, data: { stepOrder: i + 1 } });
      }
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "DeleteApprovalConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as approvalConfigsRouter };

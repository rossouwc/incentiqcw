import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: req.user!.tenantId },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    });
    res.json(logs.map(l => ({
      id: l.id, tenantId: l.tenantId, userId: l.userId,
      userName: l.user ? `${l.user.firstName} ${l.user.lastName}` : "",
      action: l.action, entity: l.entity, entityId: l.entityId,
      metadata: l.metadata, createdAt: l.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "ListAuditLogs error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as auditRouter };

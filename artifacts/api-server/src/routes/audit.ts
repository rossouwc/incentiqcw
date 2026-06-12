import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/audit-logs
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { page = "1", limit = "20", entityType, action } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where: any = {
    tenantId: req.user!.tenantId,
    ...(entityType && { entityType }),
    ...(action && { action }),
  };
  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({
      data: logs.map(l => ({
        id: l.id,
        tenantId: l.tenantId,
        userId: l.userId,
        userName: l.user ? `${l.user.firstName} ${l.user.lastName}` : "",
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        oldValue: l.oldValue ? JSON.parse(l.oldValue) : null,
        newValue: l.newValue ? JSON.parse(l.newValue) : null,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    logger.error({ err }, "ListAuditLogs error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as auditRouter };

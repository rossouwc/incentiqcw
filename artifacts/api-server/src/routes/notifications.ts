import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function notifToResponse(n: any) {
  return {
    id: n.id, userId: n.userId,
    title: n.title, message: n.message,
    type: n.type,
    readStatus: n.readStatus,
    createdAt: n.createdAt.toISOString(),
  };
}

// GET /api/notifications
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { unread } = req.query as { unread?: string };
  try {
    const notifs = await prisma.notification.findMany({
      where: {
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        ...(unread === "true" && { readStatus: false }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.userId, tenantId: req.user!.tenantId, readStatus: false },
    });
    res.json({ data: notifs.map(notifToResponse), unreadCount });
  } catch (err) {
    logger.error({ err }, "ListNotifications error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", requireAuth, async (req: Request, res: Response) => {
  try {
    const notif = await prisma.notification.update({
      where: { id: req.params.id as string },
      data: { readStatus: true },
    });
    res.json(notifToResponse(notif));
  } catch (err) {
    logger.error({ err }, "MarkRead error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/notifications/read-all
router.post("/read-all", requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, tenantId: req.user!.tenantId, readStatus: false },
      data: { readStatus: true },
    });
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    logger.error({ err }, "ReadAll error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as notificationsRouter };

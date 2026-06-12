import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function notifToResponse(n: any) {
  return {
    id: n.id, userId: n.userId, title: n.title, message: n.message,
    isRead: n.isRead, link: n.link, createdAt: n.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const notifs = await prisma.notification.findMany({
      where: { userId: req.user!.userId, tenantId: req.user!.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(notifs.map(notifToResponse));
  } catch (err) {
    logger.error({ err }, "ListNotifications error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:notificationId/read", requireAuth, async (req: Request, res: Response) => {
  try {
    const notif = await prisma.notification.update({
      where: { id: req.params.notificationId },
      data: { isRead: true },
    });
    res.json(notifToResponse(notif));
  } catch (err) {
    logger.error({ err }, "MarkNotificationRead error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as notificationsRouter };

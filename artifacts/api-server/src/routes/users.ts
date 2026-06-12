import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function userToResponse(user: {
  id: string; tenantId: string; email: string; firstName: string;
  lastName: string; role: string; status: string; avatarUrl: string | null; createdAt: Date;
}) {
  return {
    id: user.id, tenantId: user.tenantId, email: user.email,
    firstName: user.firstName, lastName: user.lastName,
    role: user.role, status: user.status, avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { role, search } = req.query as { role?: string; search?: string };
  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(role && { role: role as any }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users.map(userToResponse));
  } catch (err) {
    logger.error({ err }, "ListUsers error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { email, firstName, lastName, role, password } = req.body;
  if (!email || !firstName || !lastName || !role) {
    res.status(400).json({ error: "Required fields missing" }); return;
  }
  try {
    const hashedPassword = await bcrypt.hash(password || "Incentiq@2024!", 12);
    const user = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        firstName, lastName, role: role as any,
        status: "ACTIVE",
      },
    });
    res.status(201).json(userToResponse(user));
  } catch (err: any) {
    if (err?.code === "P2002") { res.status(409).json({ error: "Email already exists" }); return; }
    logger.error({ err }, "CreateUser error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.userId, tenantId: req.user!.tenantId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userToResponse(user));
  } catch (err) {
    logger.error({ err }, "GetUser error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:userId", requireAuth, async (req: Request, res: Response) => {
  const { firstName, lastName, role, status } = req.body;
  try {
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(role && { role: role as any }),
        ...(status && { status: status as any }),
      },
    });
    res.json(userToResponse(user));
  } catch (err) {
    logger.error({ err }, "UpdateUser error");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.user.delete({ where: { id: req.params.userId } });
    res.json({ message: "User deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteUser error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as usersRouter };

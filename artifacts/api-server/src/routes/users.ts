import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function userToResponse(user: {
  id: string; tenantId: string; email: string; firstName: string;
  lastName: string; role: string; status: string; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: user.id, tenantId: user.tenantId, email: user.email,
    firstName: user.firstName, lastName: user.lastName,
    role: user.role, status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

// GET /api/users
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { role, status, search } = req.query as { role?: string; status?: string; search?: string };
  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(role && { role: role as any }),
        ...(status && { status: status as any }),
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

// POST /api/users
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { email, firstName, lastName, role, password } = req.body;
  if (!email || !firstName || !lastName || !role) {
    res.status(400).json({ error: "email, firstName, lastName, role required" }); return;
  }
  try {
    const passwordHash = await bcrypt.hash(password || "Incentiq@2024!", 12);
    const user = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName, lastName,
        role: role as any,
        status: "ACTIVE",
      },
    });
    // Create wallet if sales executive
    if (role === "SALES_EXECUTIVE") {
      await prisma.wallet.create({ data: { tenantId: req.user!.tenantId, userId: user.id } });
    }
    res.status(201).json(userToResponse(user));
  } catch (err: any) {
    if (err?.code === "P2002") { res.status(409).json({ error: "Email already exists" }); return; }
    logger.error({ err }, "CreateUser error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userToResponse(user));
  } catch (err) {
    logger.error({ err }, "GetUser error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/users/:id
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const { firstName, lastName, role, status } = req.body;
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
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

// DELETE /api/users/:id
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: "User deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteUser error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as usersRouter };

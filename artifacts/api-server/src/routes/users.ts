import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, isSuperAdmin, ADMIN_ROLES } from "../middlewares/auth";
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

const WALLET_ROLES = ["SALES_EXECUTIVE", "EXECUTIVE"];

// GET /api/users
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { role, status, search } = req.query as { role?: string; status?: string; search?: string };
  try {
    const where: any = {
      // SUPER_ADMIN can see all users; others are scoped to their tenant
      ...(!isSuperAdmin(req) && { tenantId: req.user!.tenantId }),
      ...(role && { role: role as any }),
      ...(status && { status: status as any }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }),
    };
    const users = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json(users.map(userToResponse));
  } catch (err) {
    logger.error({ err }, "ListUsers error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/users — ADMIN+ only
router.post("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
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
        passwordHash, firstName, lastName,
        role: role as any,
        status: "ACTIVE",
      },
    });
    if (WALLET_ROLES.includes(role)) {
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
    const where = isSuperAdmin(req)
      ? { id: req.params.id as string }
      : { id: req.params.id as string, tenantId: req.user!.tenantId };
    const user = await prisma.user.findFirst({ where });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userToResponse(user));
  } catch (err) {
    logger.error({ err }, "GetUser error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/users/:id — ADMIN+ only
router.patch("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { firstName, lastName, role, status } = req.body;
  try {
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
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

// PATCH /api/users/:id/retention-bonus — ADMIN+ only
router.patch("/:id/retention-bonus", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") { res.status(400).json({ error: "enabled must be a boolean" }); return; }
  try {
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data:  { retentionBonusEnabled: enabled },
    });
    await prisma.auditLog.create({
      data: { tenantId: req.user!.tenantId, userId: req.user!.userId, action: "UPDATE", entityType: "User", entityId: user.id, newValue: JSON.stringify({ retentionBonusEnabled: enabled }) },
    });
    res.json({ id: user.id, retentionBonusEnabled: user.retentionBonusEnabled });
  } catch (err) {
    logger.error({ err }, "UpdateUserRetentionBonus error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/users/:id — ADMIN+ only
router.delete("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }
    await prisma.user.delete({ where: { id: req.params.id as string } });
    res.json({ message: "User deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteUser error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as usersRouter };

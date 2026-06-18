import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/external-providers — all authenticated users (for autocomplete in deal capture)
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { search, activeOnly } = req.query as { search?: string; activeOnly?: string };
  try {
    const where: any = { tenantId: req.user!.tenantId };
    if (activeOnly !== "false") where.isActive = true;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const providers = await prisma.externalProvider.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json(providers);
  } catch (err) {
    logger.error({ err }, "ListExternalProviders error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/external-providers — ADMIN only
router.post("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { name, contactName, contactEmail, providerType, notes } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const provider = await prisma.externalProvider.create({
      data: {
        tenantId:     req.user!.tenantId,
        name:         name.trim(),
        contactName:  contactName?.trim() ?? null,
        contactEmail: contactEmail?.trim() ?? null,
        providerType: providerType?.trim() ?? null,
        notes:        notes?.trim() ?? null,
      },
    });
    res.status(201).json(provider);
  } catch (err: any) {
    if (err?.code === "P2002") {
      res.status(409).json({ error: "A provider with this name already exists" });
      return;
    }
    logger.error({ err }, "CreateExternalProvider error");
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/external-providers/:id — ADMIN only
router.put("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { name, contactName, contactEmail, providerType, notes, isActive } = req.body;
  try {
    const existing = await prisma.externalProvider.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Provider not found" }); return; }

    const updated = await prisma.externalProvider.update({
      where: { id: req.params.id as string },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(contactName !== undefined && { contactName: contactName?.trim() ?? null }),
        ...(contactEmail !== undefined && { contactEmail: contactEmail?.trim() ?? null }),
        ...(providerType !== undefined && { providerType: providerType?.trim() ?? null }),
        ...(notes !== undefined && { notes: notes?.trim() ?? null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === "P2002") {
      res.status(409).json({ error: "A provider with this name already exists" });
      return;
    }
    logger.error({ err }, "UpdateExternalProvider error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/external-providers/:id — soft delete (ADMIN only)
router.delete("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.externalProvider.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Provider not found" }); return; }

    await prisma.externalProvider.update({
      where: { id: req.params.id as string },
      data:  { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "DeleteExternalProvider error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as externalProvidersRouter };

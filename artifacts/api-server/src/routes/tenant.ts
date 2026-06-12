import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      currency: tenant.currency,
      logoUrl: tenant.logoUrl,
      taxRate: tenant.taxRate,
      createdAt: tenant.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "GetTenant error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/", requireAuth, async (req: Request, res: Response) => {
  const { name, currency, taxRate, logoUrl } = req.body;
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: {
        ...(name && { name }),
        ...(currency && { currency }),
        ...(taxRate !== undefined && { taxRate }),
        ...(logoUrl !== undefined && { logoUrl }),
      },
    });
    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      currency: tenant.currency,
      logoUrl: tenant.logoUrl,
      taxRate: tenant.taxRate,
      createdAt: tenant.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "UpdateTenant error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as tenantRouter };

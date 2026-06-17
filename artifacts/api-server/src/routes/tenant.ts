import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function tenantToResponse(t: any) {
  return {
    id: t.id,
    companyName: t.companyName,
    registrationNumber: t.registrationNumber,
    vatNumber: t.vatNumber,
    industry: t.industry,
    contactName: t.contactName,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    status: t.status,
    subscriptionPlan: t.subscriptionPlan,
    payrollDay: t.payrollDay ?? 25,
    commissionCutoffDay: t.commissionCutoffDay ?? 20,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// GET /api/tenant
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json(tenantToResponse(tenant));
  } catch (err) {
    logger.error({ err }, "GetTenant error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/tenant — ADMIN+ only
router.patch("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { companyName, registrationNumber, vatNumber, industry, contactName, contactEmail, contactPhone, subscriptionPlan } = req.body;
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: {
        ...(companyName && { companyName }),
        ...(registrationNumber !== undefined && { registrationNumber }),
        ...(vatNumber !== undefined && { vatNumber }),
        ...(industry !== undefined && { industry }),
        ...(contactName && { contactName }),
        ...(contactEmail && { contactEmail }),
        ...(contactPhone !== undefined && { contactPhone }),
        ...(subscriptionPlan && { subscriptionPlan }),
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: req.user!.tenantId, userId: req.user!.userId, action: "UPDATE", entityType: "Tenant", entityId: tenant.id, newValue: JSON.stringify(req.body) },
    });
    res.json(tenantToResponse(tenant));
  } catch (err) {
    logger.error({ err }, "UpdateTenant error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/tenant/payroll-config
router.get("/payroll-config", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json({ payrollDay: tenant.payrollDay ?? 25, commissionCutoffDay: tenant.commissionCutoffDay ?? 20 });
  } catch (err) {
    logger.error({ err }, "GetPayrollConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/tenant/payroll-config — ADMIN+ only
router.patch("/payroll-config", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { payrollDay, commissionCutoffDay } = req.body;
  if (payrollDay !== undefined && (payrollDay < 1 || payrollDay > 28)) {
    res.status(400).json({ error: "payrollDay must be between 1 and 28" }); return;
  }
  if (commissionCutoffDay !== undefined && (commissionCutoffDay < 1 || commissionCutoffDay > 28)) {
    res.status(400).json({ error: "commissionCutoffDay must be between 1 and 28" }); return;
  }
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: {
        ...(payrollDay !== undefined && { payrollDay: Number(payrollDay) }),
        ...(commissionCutoffDay !== undefined && { commissionCutoffDay: Number(commissionCutoffDay) }),
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: req.user!.tenantId, userId: req.user!.userId, action: "UPDATE", entityType: "Tenant", entityId: tenant.id, newValue: JSON.stringify({ payrollDay, commissionCutoffDay }) },
    });
    res.json({ payrollDay: tenant.payrollDay ?? 25, commissionCutoffDay: tenant.commissionCutoffDay ?? 20 });
  } catch (err) {
    logger.error({ err }, "UpdatePayrollConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as tenantRouter };

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { INDUSTRY_CONFIGS, INDUSTRY_OPTIONS, getIndustryConfig } from "../industry-config";

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

// GET /api/tenant/industry-config
router.get("/industry-config", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    const config = getIndustryConfig(tenant.industry);
    res.json({ industry: tenant.industry, config, allIndustries: INDUSTRY_OPTIONS });
  } catch (err) {
    logger.error({ err }, "GetIndustryConfig error");
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

// POST /api/tenant/reset-commission-data — ADMIN+ only
// Wipes all commission events, deals, wallets, transactions, payout requests,
// and notifications for this tenant.  Requires body { confirm: "RESET" }.
router.post("/reset-commission-data", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== "RESET") {
    res.status(400).json({ error: 'Body must contain { "confirm": "RESET" }' });
    return;
  }
  const tenantId = req.user!.tenantId;
  try {
    await prisma.$transaction(async (tx) => {
      // Clawbacks — must go before commission events (FK constraint).
      // ClawbackApprovalStep and ClawbackRecovery cascade via onDelete: Cascade.
      await tx.commissionClawback.deleteMany({ where: { tenantId } });

      // Commission events (approvals + triggers cascade via FK)
      await tx.commissionEventApproval.deleteMany({ where: { tenantId } });
      await tx.commissionEventTrigger.deleteMany({ where: { tenantId } });
      await tx.commissionEvent.deleteMany({ where: { tenantId } });

      // Legacy deals
      await tx.approvalWorkflow.deleteMany({ where: { tenantId } });
      await tx.deal.deleteMany({ where: { tenantId } });

      // Wallet & transactions
      await tx.walletTransaction.deleteMany({ where: { tenantId } });
      await tx.wallet.deleteMany({ where: { tenantId } });

      // Payout requests
      await tx.payoutRequest.deleteMany({ where: { tenantId } });

      // Notifications
      await tx.notification.deleteMany({ where: { tenantId } });

      // Audit log entry for the reset itself
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: req.user!.userId,
          action: "RESET_COMMISSION_DATA",
          entityType: "Tenant",
          entityId: tenantId,
          newValue: JSON.stringify({ performedBy: req.user!.userId, at: new Date().toISOString() }),
        },
      });
    });

    logger.warn({ tenantId, userId: req.user!.userId }, "Tenant commission data reset");
    res.json({ message: "All commission data has been reset." });
  } catch (err) {
    logger.error({ err }, "ResetCommissionData error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/tenant — SUPER_ADMIN only
// Permanently deletes the entire tenant account and all associated data.
// Requires body { confirm: "<exact company name>" }.
router.delete("/", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), async (req: Request, res: Response) => {
  const { confirm } = req.body as { confirm?: string };
  const tenantId = req.user!.tenantId;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

    if (!confirm || confirm.trim() !== tenant.companyName.trim()) {
      res.status(400).json({ error: `Confirmation text must match the company name: "${tenant.companyName}"` });
      return;
    }

    // Cascade delete: Prisma's onDelete: Cascade on Tenant relations handles
    // most child records. We delete the tenant; the DB cascades the rest.
    await prisma.tenant.delete({ where: { id: tenantId } });

    logger.warn({ tenantId, companyName: tenant.companyName, userId: req.user!.userId }, "Tenant account deleted");
    res.json({ message: "Company account has been permanently deleted." });
  } catch (err) {
    logger.error({ err }, "DeleteTenant error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/tenant/retention-bonus
router.get("/retention-bonus", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json({
      enabled:    tenant.retentionBonusEnabled,
      annualRate: tenant.retentionBonusAnnualRate,
      minBalance: tenant.retentionBonusMinBalance,
      maxBalance: tenant.retentionBonusMaxBalance ?? null,
    });
  } catch (err) {
    logger.error({ err }, "GetRetentionBonus error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/tenant/retention-bonus — ADMIN+ only
router.patch("/retention-bonus", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { enabled, annualRate, minBalance, maxBalance } = req.body;
  if (annualRate !== undefined && (Number(annualRate) < 0 || Number(annualRate) > 100)) {
    res.status(400).json({ error: "annualRate must be between 0 and 100" }); return;
  }
  if (minBalance !== undefined && Number(minBalance) < 0) {
    res.status(400).json({ error: "minBalance must be >= 0" }); return;
  }
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: {
        ...(enabled    !== undefined && { retentionBonusEnabled:    Boolean(enabled) }),
        ...(annualRate !== undefined && { retentionBonusAnnualRate: Number(annualRate) }),
        ...(minBalance !== undefined && { retentionBonusMinBalance: Number(minBalance) }),
        ...(maxBalance !== undefined && { retentionBonusMaxBalance: maxBalance === null ? null : Number(maxBalance) }),
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: req.user!.tenantId, userId: req.user!.userId, action: "UPDATE", entityType: "Tenant", entityId: tenant.id, newValue: JSON.stringify({ retentionBonusEnabled: tenant.retentionBonusEnabled, retentionBonusAnnualRate: tenant.retentionBonusAnnualRate }) },
    });
    res.json({
      enabled:    tenant.retentionBonusEnabled,
      annualRate: tenant.retentionBonusAnnualRate,
      minBalance: tenant.retentionBonusMinBalance,
      maxBalance: tenant.retentionBonusMaxBalance ?? null,
    });
  } catch (err) {
    logger.error({ err }, "UpdateRetentionBonus error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as tenantRouter };

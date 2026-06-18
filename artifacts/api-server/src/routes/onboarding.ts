import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/onboarding/status
router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      include: { tenantIndustryConfig: true },
    });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

    const rules = await prisma.commissionRule.findMany({
      where: { tenantId: req.user!.tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });

    const approvalSteps = await prisma.approvalConfig.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { stepOrder: "asc" },
    });

    res.json({
      onboardingStatus: tenant.onboardingStatus,
      industry: tenant.industry ?? "IT_CONSULTING",
      terminology: {
        commissionEventName: tenant.tenantIndustryConfig?.commissionEventName ?? null,
        customerLabel: tenant.tenantIndustryConfig?.dealEntityName ?? null,
        transactionLabel: tenant.tenantIndustryConfig?.triggerEventName ?? null,
        salesPersonLabel: tenant.tenantIndustryConfig?.salesPersonName ?? null,
      },
      commissionRules: rules.map((r) => ({
        id: r.id,
        ruleName: r.ruleName,
        dealType: r.dealType,
        commissionPercentage: r.commissionPercentage,
      })),
      approvalSteps: approvalSteps.map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        stepName: s.stepName,
        approverRole: s.approverRole,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GetOnboardingStatus error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/onboarding/complete — ADMIN only
router.post("/complete", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { industry, terminology, commissionRules, approvalSteps, invites } = req.body;
  const tenantId = req.user!.tenantId;

  try {
    // 1. Update tenant industry + onboardingStatus
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(industry && { industry }),
        onboardingStatus: "COMPLETED",
      },
    });

    // 2. Update terminology in TenantIndustryConfig
    if (terminology) {
      const industryCode = industry ?? "IT_CONSULTING";
      const template = await prisma.industryTemplate.findUnique({ where: { code: industryCode } });
      const existingConfig = await prisma.tenantIndustryConfig.findUnique({ where: { tenantId } });

      const configData = {
        ...(template && { industryTemplateId: template.id }),
        commissionEventName: terminology.commissionEventName ?? null,
        dealEntityName: terminology.customerLabel ?? null,
        triggerEventName: terminology.transactionLabel ?? null,
        salesPersonName: terminology.salesPersonLabel ?? null,
        isCustomised: true,
      };

      if (existingConfig) {
        await prisma.tenantIndustryConfig.update({ where: { tenantId }, data: configData });
      } else if (template) {
        await prisma.tenantIndustryConfig.create({
          data: { tenantId, industryTemplateId: template.id, ...configData },
        });
      }
    }

    // 3. Replace commission rules
    if (commissionRules && Array.isArray(commissionRules) && commissionRules.length > 0) {
      await prisma.commissionRule.deleteMany({ where: { tenantId } });
      await prisma.commissionRule.createMany({
        data: commissionRules.map((r: any) => ({
          tenantId,
          ruleName: r.ruleName,
          dealType: r.dealType ?? "NET_NEW",
          commissionPercentage: Number(r.commissionPercentage),
          appliesToRole: "SALES_EXECUTIVE",
          effectiveFrom: new Date("2024-01-01"),
          status: "ACTIVE",
        })),
      });
    }

    // 4. Replace approval workflow steps
    if (approvalSteps && Array.isArray(approvalSteps) && approvalSteps.length > 0) {
      await prisma.approvalConfig.deleteMany({ where: { tenantId } });
      await prisma.approvalConfig.createMany({
        data: approvalSteps.map((s: any, i: number) => ({
          tenantId,
          stepOrder: s.stepOrder ?? i + 1,
          stepName: s.stepName,
          approverRole: s.approverRole,
          isActive: true,
        })),
      });
    }

    // 5. Create invited users
    if (invites && Array.isArray(invites)) {
      for (const invite of invites) {
        if (!invite.email || !invite.firstName || !invite.lastName || !invite.role) continue;
        const email = invite.email.toLowerCase().trim();
        const existing = await prisma.user.findUnique({
          where: { tenantId_email: { tenantId, email } },
        });
        if (existing) continue;
        const passwordHash = await bcrypt.hash("Incentiq@2024!", 12);
        const newUser = await prisma.user.create({
          data: { tenantId, email, firstName: invite.firstName, lastName: invite.lastName, role: invite.role, passwordHash, status: "ACTIVE" },
        });
        if (["SALES_EXECUTIVE", "EXECUTIVE"].includes(invite.role)) {
          await prisma.wallet.create({ data: { tenantId, userId: newUser.id } });
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: req.user!.userId,
        action: "ONBOARDING_COMPLETE",
        entityType: "Tenant",
        entityId: tenantId,
        newValue: JSON.stringify({ industry, terminology }),
      },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "CompleteOnboarding error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as onboardingRouter };

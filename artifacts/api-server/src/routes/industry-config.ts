import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getIndustryConfig } from "../industry-config";

const router = Router();

function buildSystemFields(industryId: string) {
  const cfg = getIndustryConfig(industryId);
  const fields: any[] = [
    { key: "title", label: `${cfg.eventLabel} Name`, fieldType: "text", required: true, enabled: true, displayOrder: 1, isProtected: false, systemRole: null, placeholder: `Enter ${cfg.eventLabel.toLowerCase()} name` },
    { key: "customer", label: cfg.entityLabel, fieldType: "text", required: true, enabled: true, displayOrder: 2, isProtected: false, systemRole: null, placeholder: `Enter ${cfg.entityLabel.toLowerCase()} name` },
    { key: "eventType", label: "Type", fieldType: "select", required: true, enabled: true, displayOrder: 3, isProtected: false, systemRole: null, options: cfg.eventTypes.map((t: any) => t.label) },
    { key: "revenue", label: cfg.revenueLabel, fieldType: "currency", required: true, enabled: true, displayOrder: 4, isProtected: true, systemRole: "revenue", placeholder: "0.00" },
  ];
  if (cfg.costLabel) {
    fields.push({ key: "cost", label: cfg.costLabel, fieldType: "currency", required: !!cfg.showGP, enabled: !!cfg.showGP, displayOrder: 5, isProtected: !!cfg.showGP, systemRole: "cost", placeholder: "0.00" });
  }
  let order = fields.length + 1;
  for (const f of cfg.extraFields) {
    fields.push({ key: f.key, label: f.label, fieldType: f.type, required: f.required, enabled: true, displayOrder: order++, isProtected: false, systemRole: null, placeholder: f.placeholder ?? null, options: f.options ?? null });
  }
  return fields;
}

function buildDefaultFormula(industryId: string) {
  const cfg = getIndustryConfig(industryId);
  return {
    calculationType: cfg.showGP ? "GP_PERCENTAGE" : "REVENUE_PERCENTAGE",
    baseField: cfg.showGP ? "gross_profit" : "revenue",
    defaultCommissionPct: 10,
    description: cfg.commissionMethodLabel,
  };
}

function buildDefaultTerminology(industryId: string, tic: any) {
  const cfg = getIndustryConfig(industryId);
  return {
    eventLabel: cfg.eventLabel,
    eventLabelPlural: cfg.eventLabelPlural,
    entityLabel: tic?.dealEntityName ?? cfg.entityLabel,
    revenueLabel: cfg.revenueLabel,
    commissionLabel: "Commission",
    salesPersonLabel: tic?.salesPersonName ?? "Sales Executive",
    triggerLabel: cfg.triggerLabel,
  };
}

function buildDefaultTriggers(industryId: string) {
  const cfg = getIndustryConfig(industryId);
  return [
    { id: "trigger-default-1", eventType: "FINAL_APPROVAL", label: "Final Approval", description: cfg.triggerLabel, isRequired: true, enabled: true, order: 1 },
  ];
}

const VALID_CALC_TYPES = ["GP_PERCENTAGE", "REVENUE_PERCENTAGE", "FLAT_AMOUNT", "PLACEMENT_FEE_PERCENTAGE", "ANNUAL_PREMIUM_PERCENTAGE", "CUSTOM"];

// GET /api/industry-config
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      include: { tenantIndustryConfig: true },
    });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

    const industryId = tenant.industry ?? "IT_CONSULTING";
    const cfg = getIndustryConfig(industryId);
    const tic = tenant.tenantIndustryConfig as any;

    const defaultTerminology = buildDefaultTerminology(industryId, tic);
    const storedTerminology = tic?.terminologyJson ?? {};
    const terminology = { ...defaultTerminology, ...Object.fromEntries(Object.entries(storedTerminology as Record<string, any>).filter(([, v]) => v != null && v !== "")) };

    const storedFieldConfig = tic?.fieldConfigJson as any ?? null;
    const systemFields = storedFieldConfig?.systemFields ?? buildSystemFields(industryId);
    const customFields = storedFieldConfig?.customFields ?? [];

    const formulaConfig = tic?.formulaConfigJson ?? buildDefaultFormula(industryId);
    const triggerRules = tic?.triggerConfigJson ?? buildDefaultTriggers(industryId);

    const approvalSteps = await prisma.approvalConfig.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { stepOrder: "asc" },
    });

    res.json({
      industry: industryId,
      industryLabel: cfg.label,
      terminology,
      systemFields,
      customFields,
      formulaConfig,
      approvalSteps: approvalSteps.map((s) => ({ id: s.id, stepOrder: s.stepOrder, stepName: s.stepName, approverRole: s.approverRole })),
      triggerRules,
    });
  } catch (err) {
    logger.error({ err }, "GetIndustryConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/industry-config — ADMIN only
router.put("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { terminology, systemFields, customFields, formulaConfig, approvalSteps, triggerRules } = req.body;
  const tenantId = req.user!.tenantId;

  try {
    // Safeguard: revenue field cannot be disabled
    if (systemFields) {
      const revField = (systemFields as any[]).find((f) => f.systemRole === "revenue" || f.key === "revenue");
      if (revField && !revField.enabled) {
        res.status(400).json({ error: "The revenue field cannot be disabled — it is required for commission calculations." });
        return;
      }
      const costField = (systemFields as any[]).find((f) => f.systemRole === "cost" || f.key === "cost");
      if (costField && costField.isProtected && !costField.enabled) {
        res.status(400).json({ error: "The cost field cannot be disabled — it is required for gross profit calculations." });
        return;
      }
    }

    // Safeguard: approval workflow must have at least 1 step
    if (approvalSteps !== undefined && (approvalSteps as any[]).length === 0) {
      res.status(400).json({ error: "The approval workflow must have at least one step." });
      return;
    }

    // Safeguard: formula must be valid
    if (formulaConfig && !VALID_CALC_TYPES.includes(formulaConfig.calculationType)) {
      res.status(400).json({ error: "Invalid formula calculation type." });
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { tenantIndustryConfig: true },
    });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

    const industryId = tenant.industry ?? "IT_CONSULTING";
    const ticData: any = { isCustomised: true };

    if (terminology != null) {
      ticData.terminologyJson = terminology;
      if (terminology.entityLabel) ticData.dealEntityName = terminology.entityLabel;
      if (terminology.salesPersonLabel) ticData.salesPersonName = terminology.salesPersonLabel;
    }
    if (systemFields !== undefined) {
      ticData.fieldConfigJson = { systemFields, customFields: customFields ?? [] };
    }
    if (formulaConfig != null) ticData.formulaConfigJson = formulaConfig;
    if (triggerRules != null) ticData.triggerConfigJson = triggerRules;

    const existingTic = tenant.tenantIndustryConfig;
    if (existingTic) {
      await prisma.tenantIndustryConfig.update({ where: { tenantId }, data: ticData });
    } else {
      const template = await prisma.industryTemplate.findFirst({ where: { code: industryId } });
      if (template) {
        await prisma.tenantIndustryConfig.create({ data: { tenantId, industryTemplateId: template.id, ...ticData } });
      }
    }

    // Update approval steps transactionally
    if (approvalSteps !== undefined) {
      const steps = approvalSteps as any[];
      await prisma.$transaction(async (tx) => {
        await tx.approvalConfig.deleteMany({ where: { tenantId } });
        if (steps.length > 0) {
          await tx.approvalConfig.createMany({
            data: steps.map((s: any, i: number) => ({
              tenantId,
              stepOrder: i + 1,
              stepName: s.stepName,
              approverRole: s.approverRole,
              isActive: true,
            })),
          });
        }
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: req.user!.userId,
        action: "INDUSTRY_CONFIG_UPDATED",
        entityType: "TenantIndustryConfig",
        entityId: tenantId,
        newValue: JSON.stringify({ terminology: !!terminology, fields: !!systemFields, formula: !!formulaConfig, workflow: !!approvalSteps, triggers: !!triggerRules }),
      },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "UpdateIndustryConfig error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as industryConfigRouter };

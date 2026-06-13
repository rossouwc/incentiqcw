import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const DEAL_TYPE_LABELS: Record<string, string> = {
  NET_NEW: "Net New",
  RENEWAL: "Renewal",
  UPSELL: "Upsell",
  CROSS_SELL: "Cross-Sell",
};

function memberToResponse(m: any) {
  return {
    id: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    role: m.user.role,
  };
}

function ruleToResponse(r: any) {
  const rule = r.rule ?? r;
  return {
    id: rule.id,
    dealType: rule.dealType,
    commissionPercentage: rule.commissionPercentage,
    minGrossProfit: rule.minGrossProfit ?? null,
    maxGrossProfit: rule.maxGrossProfit ?? null,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveTo: rule.effectiveTo?.toISOString() ?? null,
    status: rule.status,
  };
}

function groupToResponse(g: any) {
  return {
    id: g.id,
    tenantId: g.tenantId,
    groupName: g.groupName,
    description: g.description ?? null,
    assignToAll: g.assignToAll,
    status: g.status,
    rules: (g.rules ?? []).map(ruleToResponse),
    members: (g.members ?? []).map(memberToResponse),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

const groupInclude = {
  rules: { include: { rule: true } },
  members: {
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      },
    },
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildRuleData(r: any, tenantId: string, groupName: string) {
  return {
    tenantId,
    ruleName: `${groupName} – ${DEAL_TYPE_LABELS[r.dealType] ?? r.dealType}`,
    dealType: r.dealType,
    commissionPercentage: parseFloat(r.commissionPercentage),
    appliesToRole: "SALES_EXECUTIVE",
    minGrossProfit: r.minGrossProfit != null && r.minGrossProfit !== "" ? parseFloat(r.minGrossProfit) : null,
    maxGrossProfit: r.maxGrossProfit != null && r.maxGrossProfit !== "" ? parseFloat(r.maxGrossProfit) : null,
    effectiveFrom: new Date(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
    status: "ACTIVE",
  };
}

// ─── GET /api/commission-rule-groups ─────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const groups = await prisma.commissionRuleGroup.findMany({
      where: { tenantId: req.user!.tenantId },
      include: groupInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json(groups.map(groupToResponse));
  } catch (err) {
    logger.error({ err }, "ListCommissionRuleGroups error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/commission-rule-groups ────────────────────────────────────────
router.post("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { groupName, description, assignToAll, memberUserIds, rules } = req.body;
  if (!groupName) { res.status(400).json({ error: "groupName is required" }); return; }

  try {
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.commissionRuleGroup.create({
        data: {
          tenantId: req.user!.tenantId,
          groupName,
          description: description ?? null,
          assignToAll: !!assignToAll,
          status: "ACTIVE",
          members: {
            create: (!assignToAll && memberUserIds?.length)
              ? memberUserIds.map((id: string) => ({ userId: id }))
              : [],
          },
        },
      });

      for (const r of (rules ?? [])) {
        const rule = await tx.commissionRule.create({ data: buildRuleData(r, g.tenantId, g.groupName) });
        await tx.commissionRuleGroupRule.create({ data: { groupId: g.id, ruleId: rule.id } });
      }

      return tx.commissionRuleGroup.findUnique({ where: { id: g.id }, include: groupInclude });
    });

    res.status(201).json(groupToResponse(group));
  } catch (err) {
    logger.error({ err }, "CreateCommissionRuleGroup error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PATCH /api/commission-rule-groups/:id ───────────────────────────────────
router.patch("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { groupName, description, assignToAll, memberUserIds, rules, status } = req.body;
  const { id } = req.params;

  const existing = await prisma.commissionRuleGroup.findFirst({
    where: { id, tenantId: req.user!.tenantId },
    include: { rules: { select: { ruleId: true } } },
  });
  if (!existing) { res.status(404).json({ error: "Group not found" }); return; }

  try {
    const group = await prisma.$transaction(async (tx) => {
      const effectiveName = groupName ?? existing.groupName;

      await tx.commissionRuleGroup.update({
        where: { id },
        data: {
          ...(groupName !== undefined && { groupName }),
          ...(description !== undefined && { description }),
          ...(assignToAll !== undefined && { assignToAll }),
          ...(status !== undefined && { status }),
        },
      });

      // Replace all rules if provided
      if (rules !== undefined) {
        const existingRuleIds = existing.rules.map((r: any) => r.ruleId);

        // Determine which existing rule IDs are kept (have an id in the new list)
        const keptIds = new Set(
          (rules as any[]).filter(r => r.id).map((r: any) => r.id)
        );

        // Delete rules that are no longer in the list
        const toDelete = existingRuleIds.filter((rid: string) => !keptIds.has(rid));
        if (toDelete.length > 0) {
          await tx.commissionRuleGroupRule.deleteMany({ where: { groupId: id, ruleId: { in: toDelete } } });
          await tx.commissionRule.deleteMany({ where: { id: { in: toDelete } } });
        }

        // Update kept rules or create new ones
        for (const r of (rules as any[])) {
          if (r.id && keptIds.has(r.id)) {
            // Update existing rule
            await tx.commissionRule.update({
              where: { id: r.id },
              data: {
                ruleName: `${effectiveName} – ${DEAL_TYPE_LABELS[r.dealType] ?? r.dealType}`,
                dealType: r.dealType,
                commissionPercentage: parseFloat(r.commissionPercentage),
                minGrossProfit: r.minGrossProfit != null && r.minGrossProfit !== "" ? parseFloat(r.minGrossProfit) : null,
                maxGrossProfit: r.maxGrossProfit != null && r.maxGrossProfit !== "" ? parseFloat(r.maxGrossProfit) : null,
                effectiveFrom: new Date(r.effectiveFrom),
                effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
              },
            });
          } else {
            // Create new rule and link
            const newRule = await tx.commissionRule.create({
              data: buildRuleData(r, req.user!.tenantId, effectiveName),
            });
            await tx.commissionRuleGroupRule.create({ data: { groupId: id, ruleId: newRule.id } });
          }
        }
      }

      // Handle members
      const effectiveAssignToAll = assignToAll !== undefined ? assignToAll : existing.assignToAll;
      if (memberUserIds !== undefined) {
        await tx.commissionRuleGroupMember.deleteMany({ where: { groupId: id } });
        if (!effectiveAssignToAll && memberUserIds.length > 0) {
          await tx.commissionRuleGroupMember.createMany({
            data: memberUserIds.map((uid: string) => ({ groupId: id, userId: uid })),
          });
        }
      } else if (assignToAll === true) {
        await tx.commissionRuleGroupMember.deleteMany({ where: { groupId: id } });
      }

      return tx.commissionRuleGroup.findUnique({ where: { id }, include: groupInclude });
    });

    res.json(groupToResponse(group));
  } catch (err) {
    logger.error({ err }, "UpdateCommissionRuleGroup error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── DELETE /api/commission-rule-groups/:id ──────────────────────────────────
router.delete("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const existing = await prisma.commissionRuleGroup.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    include: { rules: { select: { ruleId: true } } },
  });
  if (!existing) { res.status(404).json({ error: "Group not found" }); return; }

  try {
    const ruleIds = existing.rules.map((r: any) => r.ruleId);
    await prisma.$transaction(async (tx) => {
      await tx.commissionRuleGroup.delete({ where: { id: req.params.id } }); // cascades join records
      if (ruleIds.length > 0) {
        await tx.commissionRule.deleteMany({ where: { id: { in: ruleIds } } });
      }
    });
    res.json({ message: "Group deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteCommissionRuleGroup error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as commissionRuleGroupsRouter };

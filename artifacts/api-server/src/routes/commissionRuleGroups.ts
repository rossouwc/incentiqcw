import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

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
    tenantId: rule.tenantId,
    ruleName: rule.ruleName,
    dealType: rule.dealType,
    commissionPercentage: rule.commissionPercentage,
    appliesToRole: rule.appliesToRole,
    minGrossProfit: rule.minGrossProfit,
    maxGrossProfit: rule.maxGrossProfit,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveTo: rule.effectiveTo?.toISOString() ?? null,
    status: rule.status,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
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
  rules: {
    include: { rule: true },
  },
  members: {
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      },
    },
  },
};

// GET /api/commission-rule-groups
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

// POST /api/commission-rule-groups
router.post("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { groupName, description, assignToAll, ruleIds, memberUserIds } = req.body;
  if (!groupName) {
    res.status(400).json({ error: "groupName is required" });
    return;
  }
  try {
    const group = await prisma.commissionRuleGroup.create({
      data: {
        tenantId: req.user!.tenantId,
        groupName,
        description: description ?? null,
        assignToAll: !!assignToAll,
        status: "ACTIVE",
        rules: {
          create: (ruleIds ?? []).map((id: string) => ({ ruleId: id })),
        },
        members: {
          create: (!assignToAll && memberUserIds?.length)
            ? memberUserIds.map((id: string) => ({ userId: id }))
            : [],
        },
      },
      include: groupInclude,
    });
    res.status(201).json(groupToResponse(group));
  } catch (err) {
    logger.error({ err }, "CreateCommissionRuleGroup error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/commission-rule-groups/:id
router.patch("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { groupName, description, assignToAll, ruleIds, memberUserIds, status } = req.body;
  const { id } = req.params;

  // Verify belongs to tenant
  const existing = await prisma.commissionRuleGroup.findFirst({
    where: { id, tenantId: req.user!.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  try {
    // Use a transaction to replace rules/members if provided
    const group = await prisma.$transaction(async (tx) => {
      await tx.commissionRuleGroup.update({
        where: { id },
        data: {
          ...(groupName !== undefined && { groupName }),
          ...(description !== undefined && { description }),
          ...(assignToAll !== undefined && { assignToAll }),
          ...(status !== undefined && { status }),
        },
      });

      if (ruleIds !== undefined) {
        await tx.commissionRuleGroupRule.deleteMany({ where: { groupId: id } });
        if (ruleIds.length > 0) {
          await tx.commissionRuleGroupRule.createMany({
            data: ruleIds.map((ruleId: string) => ({ groupId: id, ruleId })),
          });
        }
      }

      const effectiveAssignToAll = assignToAll !== undefined ? assignToAll : existing.assignToAll;
      if (memberUserIds !== undefined) {
        await tx.commissionRuleGroupMember.deleteMany({ where: { groupId: id } });
        if (!effectiveAssignToAll && memberUserIds.length > 0) {
          await tx.commissionRuleGroupMember.createMany({
            data: memberUserIds.map((userId: string) => ({ groupId: id, userId })),
          });
        }
      } else if (assignToAll === true) {
        // If switching to assignToAll, clear specific members
        await tx.commissionRuleGroupMember.deleteMany({ where: { groupId: id } });
      }

      return tx.commissionRuleGroup.findUnique({
        where: { id },
        include: groupInclude,
      });
    });

    res.json(groupToResponse(group));
  } catch (err) {
    logger.error({ err }, "UpdateCommissionRuleGroup error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/commission-rule-groups/:id
router.delete("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const existing = await prisma.commissionRuleGroup.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  try {
    await prisma.commissionRuleGroup.delete({ where: { id: req.params.id } });
    res.json({ message: "Group deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteCommissionRuleGroup error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as commissionRuleGroupsRouter };

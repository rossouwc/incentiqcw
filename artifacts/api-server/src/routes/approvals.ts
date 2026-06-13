import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function awToResponse(aw: any) {
  return {
    id: aw.id,
    tenantId: aw.tenantId,
    dealId: aw.dealId,
    dealName: aw.deal?.dealName ?? "",
    customerName: aw.deal?.customerName ?? "",
    calculatedCommission: aw.deal?.calculatedCommission ?? 0,
    salesExecutiveName: aw.deal?.salesExecutive ? `${aw.deal.salesExecutive.firstName} ${aw.deal.salesExecutive.lastName}` : "",
    approvalLevel: aw.approvalLevel,
    approverRole: aw.approverRole,
    approverName: aw.approver ? `${aw.approver.firstName} ${aw.approver.lastName}` : null,
    status: aw.status,
    comments: aw.comments,
    approvedAt: aw.approvedAt?.toISOString() ?? null,
    createdAt: aw.createdAt.toISOString(),
  };
}

// GET /api/approvals — list pending approvals relevant to the caller's role
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  const roleToLevel: Record<string, number> = { MANAGER: 1, FINANCE: 2, ADMIN: 3, SUPER_ADMIN: 3 };
  const level = roleToLevel[req.user!.role];
  try {
    const where: any = {
      tenantId: req.user!.tenantId,
      ...(level && { approvalLevel: level }),
      ...(status && { status }),
      ...(!status && { status: "PENDING" }),
    };
    const approvals = await prisma.approvalWorkflow.findMany({
      where,
      include: {
        deal: {
          select: { dealName: true, customerName: true, calculatedCommission: true, salesExecutive: { select: { firstName: true, lastName: true } } },
        },
        approver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(approvals.map(awToResponse));
  } catch (err) {
    logger.error({ err }, "ListApprovals error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/approvals/deal/:dealId — full approval chain for a deal
router.get("/deal/:dealId", requireAuth, async (req: Request, res: Response) => {
  try {
    const approvals = await prisma.approvalWorkflow.findMany({
      where: { dealId: req.params.dealId, tenantId: req.user!.tenantId },
      include: {
        deal: { select: { dealName: true, customerName: true, calculatedCommission: true, salesExecutive: { select: { firstName: true, lastName: true } } } },
        approver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { approvalLevel: "asc" },
    });
    res.json(approvals.map(awToResponse));
  } catch (err) {
    logger.error({ err }, "GetDealApprovals error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/approvals/:id/action
router.post("/:id/action", requireAuth, async (req: Request, res: Response) => {
  const { action, comments } = req.body;
  if (!action || !["APPROVE", "REJECT"].includes(action)) {
    res.status(400).json({ error: "action must be APPROVE or REJECT" }); return;
  }
  const roleToLevel: Record<string, number> = { MANAGER: 1, FINANCE: 2, ADMIN: 3, SUPER_ADMIN: 3 };
  try {
    const aw: any = await prisma.approvalWorkflow.findUnique({
      where: { id: req.params.id },
      include: { deal: true },
    });
    if (!aw) { res.status(404).json({ error: "Approval not found" }); return; }
    if (aw.tenantId !== req.user!.tenantId) { res.status(403).json({ error: "Forbidden" }); return; }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await prisma.approvalWorkflow.update({
      where: { id: req.params.id },
      data: {
        status: newStatus,
        approverUserId: req.user!.userId,
        comments: comments ?? null,
        approvedAt: action === "APPROVE" ? new Date() : null,
      },
      include: {
        deal: { select: { dealName: true, customerName: true, calculatedCommission: true, salesExecutive: { select: { firstName: true, lastName: true } } } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    if (action === "APPROVE") {
      const level = aw.approvalLevel;
      // Check if this is the final level or advance to next
      const nextLevel = await prisma.approvalWorkflow.findFirst({
        where: { dealId: aw.dealId, approvalLevel: level + 1 },
      });
      if (!nextLevel) {
        // All levels approved → deal fully approved
        const newDealStatus = level >= 3 ? "EXECUTIVE_APPROVED" : level === 2 ? "FINANCE_APPROVED" : "MANAGER_APPROVED";
        const updatedDeal = await prisma.deal.update({
          where: { id: aw.dealId },
          data: { status: newDealStatus },
        });
        // Credit wallet if fully approved
        if (newDealStatus === "EXECUTIVE_APPROVED") {
          const wallet = await prisma.wallet.findUnique({ where: { userId: updatedDeal.salesExecutiveId } });
          if (wallet) {
            await prisma.wallet.update({
              where: { id: wallet.id },
              data: {
                availableBalance: wallet.availableBalance + updatedDeal.calculatedCommission,
                pendingBalance: Math.max(0, wallet.pendingBalance - updatedDeal.calculatedCommission),
              },
            });
            await prisma.walletTransaction.create({
              data: {
                tenantId: req.user!.tenantId,
                walletId: wallet.id,
                transactionType: "CREDIT",
                amount: updatedDeal.calculatedCommission,
                referenceType: "DEAL",
                referenceId: updatedDeal.id,
                description: `Commission approved: ${updatedDeal.dealName}`,
              },
            });
            await prisma.notification.create({
              data: {
                tenantId: req.user!.tenantId,
                userId: updatedDeal.salesExecutiveId,
                title: "Commission Credited",
                message: `R${updatedDeal.calculatedCommission.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} credited for ${updatedDeal.dealName}`,
                type: "WALLET_CREDITED", readStatus: false,
              },
            });
          }
        } else {
          // Update deal status
          await prisma.deal.update({ where: { id: aw.dealId }, data: { status: newDealStatus } });
          // Notify pending balance update
          await prisma.notification.create({
            data: {
              tenantId: req.user!.tenantId,
              userId: aw.deal.salesExecutiveId ?? updatedDeal.salesExecutiveId,
              title: "Deal Progressed",
              message: `Your deal ${aw.deal.dealName} has been approved at level ${level}`,
              type: "DEAL_APPROVED", readStatus: false,
            },
          });
        }
      } else {
        // Advance deal status to intermediate stage
        const interimStatus = level === 1 ? "MANAGER_APPROVED" : "FINANCE_APPROVED";
        await prisma.deal.update({ where: { id: aw.dealId }, data: { status: interimStatus } });
        // pendingBalance already added at submission — no duplicate add here
        await prisma.notification.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: aw.deal.salesExecutiveId,
            title: "Deal Progressed",
            message: `Your deal ${aw.deal.dealName} has been approved at level ${level}`,
            type: "DEAL_APPROVED", readStatus: false,
          },
        });
      }
    } else {
      // Rejected → update deal status and deduct from pendingBalance
      await prisma.deal.update({ where: { id: aw.dealId }, data: { status: "REJECTED" } });
      const wallet = await prisma.wallet.findUnique({ where: { userId: aw.deal.salesExecutiveId } });
      if (wallet) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { pendingBalance: Math.max(0, wallet.pendingBalance - aw.deal.calculatedCommission) },
        });
      }
      // Notify sales exec
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: aw.deal.salesExecutiveId,
          title: "Deal Rejected",
          message: `Your deal ${aw.deal.dealName} was rejected${comments ? `: ${comments}` : ""}`,
          type: "DEAL_REJECTED", readStatus: false,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action,
        entityType: "ApprovalWorkflow",
        entityId: aw.id,
        oldValue: JSON.stringify({ status: aw.status }),
        newValue: JSON.stringify({ status: newStatus, comments }),
      },
    });

    res.json(awToResponse(updated));
  } catch (err) {
    logger.error({ err }, "ActionApproval error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as approvalsRouter };

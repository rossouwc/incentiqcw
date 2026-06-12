import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function approvalToResponse(a: any) {
  return {
    id: a.id,
    type: a.type,
    referenceId: a.referenceId,
    referenceName: a.referenceName,
    requestedBy: a.requestedById,
    requestedByName: a.requestedBy ? `${a.requestedBy.firstName} ${a.requestedBy.lastName}` : "",
    status: a.status,
    reviewedBy: a.reviewedById,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status, type } = req.query as { status?: string; type?: string };
  const where: any = { tenantId: req.user!.tenantId };
  if (status) where.status = status;
  if (type) where.type = type;
  try {
    const approvals = await prisma.approval.findMany({
      where,
      include: { requestedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(approvals.map(approvalToResponse));
  } catch (err) {
    logger.error({ err }, "ListApprovals error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:approvalId/action", requireAuth, async (req: Request, res: Response) => {
  const { action, notes } = req.body;
  if (!action || !["APPROVE", "REJECT"].includes(action)) {
    res.status(400).json({ error: "action must be APPROVE or REJECT" }); return;
  }
  try {
    const approval = await prisma.approval.update({
      where: { id: req.params.approvalId },
      data: {
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedById: req.user!.userId,
        notes: notes || null,
      },
      include: { requestedBy: { select: { firstName: true, lastName: true } } },
    });

    // If deal approval, update deal status
    if (approval.type === "DEAL" && action === "APPROVE") {
      const nextStatus = req.user!.role === "MANAGER"
        ? "MANAGER_APPROVED"
        : req.user!.role === "FINANCE"
        ? "FINANCE_APPROVED"
        : "EXECUTIVE_APPROVED";

      const deal = await prisma.deal.update({
        where: { id: approval.referenceId },
        data: { status: nextStatus },
      });

      // If executive approved, credit wallet
      if (nextStatus === "EXECUTIVE_APPROVED") {
        await prisma.transaction.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: deal.userId,
            type: "CREDIT",
            amount: deal.commission,
            description: `Commission approved for ${deal.dealName}`,
            referenceId: deal.id,
          },
        });
        await prisma.notification.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: deal.userId,
            title: "Commission Credited",
            message: `Commission of R${deal.commission.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${deal.dealName} has been approved and credited to your wallet`,
          },
        });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action: action,
        entity: "Approval",
        entityId: approval.id,
        metadata: JSON.stringify({ notes }),
      },
    });

    res.json(approvalToResponse(approval));
  } catch (err) {
    logger.error({ err }, "ActionApproval error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as approvalsRouter };

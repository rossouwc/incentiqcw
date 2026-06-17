import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const dealInclude = {
  deal: {
    select: {
      dealName: true,
      customerName: true,
      calculatedCommission: true,
      salesExecutiveId: true,
      salesExecutive: { select: { firstName: true, lastName: true } },
    },
  },
};

const approverInclude = {
  approver: { select: { firstName: true, lastName: true } },
};

function awToResponse(aw: any) {
  return {
    id: aw.id,
    tenantId: aw.tenantId,
    dealId: aw.dealId,
    dealName: aw.deal?.dealName ?? "",
    customerName: aw.deal?.customerName ?? "",
    calculatedCommission: aw.deal?.calculatedCommission ?? 0,
    salesExecutiveName: aw.deal?.salesExecutive
      ? `${aw.deal.salesExecutive.firstName} ${aw.deal.salesExecutive.lastName}`
      : "",
    approvalLevel: aw.approvalLevel,
    stepName: aw.stepName ?? null,
    approverRole: aw.approverRole,
    approverUserId: aw.approverUserId ?? null,
    approverName: aw.approver
      ? `${aw.approver.firstName} ${aw.approver.lastName}`
      : null,
    status: aw.status,
    comments: aw.comments ?? null,
    payoutAmount: aw.payoutAmount ? Number(aw.payoutAmount) : null,
    approvedAt: aw.approvedAt?.toISOString() ?? null,
    createdAt: aw.createdAt.toISOString(),
  };
}

async function deductPendingBalance(
  tenantId: string,
  salesExecutiveId: string,
  commission: number,
  dealId: string,
  dealName: string
) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: salesExecutiveId } });
  if (wallet && wallet.pendingBalance > 0) {
    const deduction = Math.min(wallet.pendingBalance, commission);
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { pendingBalance: Math.max(0, wallet.pendingBalance - deduction) },
    });
    await prisma.walletTransaction.create({
      data: {
        tenantId,
        walletId: wallet.id,
        transactionType: "PENDING_COMMISSION_REMOVED",
        amount: deduction,
        referenceType: "DEAL",
        referenceId: dealId,
        description: `Commission reversal: ${dealName}`,
      },
    });
  }
}

async function creditWalletForSalesExec(
  tenantId: string,
  salesExecId: string,
  commission: number,
  dealId: string,
  dealName: string
) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: salesExecId } });
  if (!wallet) return;
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      availableBalance: wallet.availableBalance + commission,
      pendingBalance: Math.max(0, wallet.pendingBalance - commission),
    },
  });
  await prisma.walletTransaction.create({
    data: {
      tenantId,
      walletId: wallet.id,
      transactionType: "COMMISSION_APPROVED",
      amount: commission,
      referenceType: "DEAL",
      referenceId: dealId,
      description: `Commission approved: ${dealName}`,
    },
  });
}

// GET /api/approvals — list approvals relevant to the current user
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status, dealId } = req.query as { status?: string; dealId?: string };
  try {
    const where: any = { tenantId: req.user!.tenantId };

    // Filter by who should see these — either specifically assigned or by role
    if (!["SUPER_ADMIN", "ADMIN"].includes(req.user!.role)) {
      where.OR = [
        { approverUserId: req.user!.userId },
        { approverUserId: null, approverRole: req.user!.role },
      ];
    }

    if (status) where.status = status;
    else where.status = "PENDING";

    if (dealId) where.dealId = dealId;

    const approvals = await prisma.approvalWorkflow.findMany({
      where,
      include: { ...dealInclude, ...approverInclude },
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
      where: { dealId: req.params.dealId as string, tenantId: req.user!.tenantId },
      include: { ...dealInclude, ...approverInclude },
      orderBy: { approvalLevel: "asc" },
    });
    res.json(approvals.map(awToResponse));
  } catch (err) {
    logger.error({ err }, "GetDealApprovals error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/approvals/:id/action — APPROVE | REJECT | REQUEST_CHANGES
router.post("/:id/action", requireAuth, async (req: Request, res: Response) => {
  const { action, comments, payoutAmount } = req.body;
  if (!action || !["APPROVE", "REJECT", "REQUEST_CHANGES"].includes(action)) {
    res.status(400).json({ error: "action must be APPROVE, REJECT, or REQUEST_CHANGES" });
    return;
  }
  if (["REJECT", "REQUEST_CHANGES"].includes(action) && !comments?.trim()) {
    res.status(400).json({ error: "comments are required when rejecting or requesting changes" });
    return;
  }

  try {
    const aw: any = await prisma.approvalWorkflow.findUnique({
      where: { id: req.params.id as string },
      include: { deal: true },
    });
    if (!aw) { res.status(404).json({ error: "Approval not found" }); return; }
    if (aw.tenantId !== req.user!.tenantId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (aw.status !== "PENDING") {
      res.status(400).json({ error: "This approval step has already been actioned" });
      return;
    }

    // Verify current user is authorised to action this step
    const canAction =
      ["SUPER_ADMIN", "ADMIN"].includes(req.user!.role) ||
      aw.approverUserId === req.user!.userId ||
      (!aw.approverUserId && aw.approverRole === req.user!.role);
    if (!canAction) {
      res.status(403).json({ error: "You are not authorised to action this approval step" });
      return;
    }

    // Sales Executive Confirmation step — payout amount is required on approval
    if (action === "APPROVE" && aw.approverRole === "SALES_EXECUTIVE") {
      const amt = Number(payoutAmount);
      if (!payoutAmount || isNaN(amt) || amt <= 0) {
        res.status(400).json({ error: "payoutAmount is required when a Sales Executive Confirmation step is approved" });
        return;
      }
    }

    const newStatus = action === "APPROVE" ? "APPROVED"
      : action === "REJECT" ? "REJECTED"
      : "CHANGES_REQUESTED";

    const updateData: any = {
      status: newStatus,
      approverUserId: req.user!.userId,
      comments: comments ?? null,
      approvedAt: action === "APPROVE" ? new Date() : null,
    };
    if (action === "APPROVE" && aw.approverRole === "SALES_EXECUTIVE" && payoutAmount) {
      updateData.payoutAmount = Number(payoutAmount);
    }

    const updated: any = await prisma.approvalWorkflow.update({
      where: { id: req.params.id as string },
      data: updateData,
      include: { ...dealInclude, ...approverInclude },
    });

    const deal = aw.deal;
    const commission = deal.calculatedCommission as number;
    const salesExecId = deal.salesExecutiveId as string;

    if (action === "APPROVE") {
      // Sales Executive Confirmation step — create payout request
      if (aw.approverRole === "SALES_EXECUTIVE") {
        const amt = Number(payoutAmount);
        const tax = amt * 0.25;
        const net = amt - tax;
        const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
        const cutoffDay = tenant?.commissionCutoffDay ?? 20;
        const now = new Date();
        const isAfterCutoff = now.getDate() > cutoffDay;
        const payoutDate = isAfterCutoff
          ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
          : now;
        const payoutMonth = `${payoutDate.getFullYear()}-${String(payoutDate.getMonth() + 1).padStart(2, "0")}`;
        await prisma.payoutRequest.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: salesExecId,
            requestedAmount: amt,
            estimatedTax: tax,
            estimatedNetPayout: net,
            payoutMonth,
            status: "PENDING",
          },
        });
        await prisma.notification.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: salesExecId,
            title: "Payout Request Created",
            message: `Your payout request of R${amt.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${deal.dealName} has been sent to Payroll for processing.`,
            type: "PAYOUT_REQUESTED",
            readStatus: false,
          },
        });
      }

      const nextStep: any = await prisma.approvalWorkflow.findFirst({
        where: { dealId: aw.dealId, approvalLevel: aw.approvalLevel + 1 },
      });

      if (nextStep) {
        // Determine deal interim status based on the role of the step just approved
        const interimStatus: any =
          aw.approverRole === "MANAGER" ? "MANAGER_APPROVED"
          : aw.approverRole === "FINANCE" ? "FINANCE_APPROVED"
          : aw.approverRole === "EXECUTIVE" ? "EXECUTIVE_APPROVED"
          : aw.approverRole === "SALES_EXECUTIVE" ? "PENDING_PAYROLL"
          : "PENDING_APPROVAL";

        await prisma.deal.update({ where: { id: aw.dealId }, data: { status: interimStatus } });

        // Special handling when the NEXT step is a Sales Executive Confirmation
        if (nextStep.approverRole === "SALES_EXECUTIVE") {
          // Credit the commission to the sales exec's wallet now so they can see it
          await creditWalletForSalesExec(
            req.user!.tenantId, salesExecId, commission, aw.dealId, deal.dealName
          );

          // Assign the step specifically to this deal's sales executive
          await prisma.approvalWorkflow.update({
            where: { id: nextStep.id },
            data: { approverUserId: salesExecId },
          });

          // Notify the sales exec with context to review and confirm payout
          await prisma.notification.create({
            data: {
              tenantId: req.user!.tenantId,
              userId: salesExecId,
              title: "Commission Credited — Action Required",
              message: `R${commission.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} commission for ${deal.dealName} has been credited to your wallet. Please go to Approvals to confirm how much you want paid out this salary cycle.`,
              type: "WALLET_CREDITED",
              readStatus: false,
            },
          });
        } else {
          // Notify next approver(s) normally
          if (nextStep.approverUserId) {
            await prisma.notification.create({
              data: {
                tenantId: req.user!.tenantId,
                userId: nextStep.approverUserId,
                title: "Deal Approval Required",
                message: `${deal.dealName} has been approved at level ${aw.approvalLevel} and requires your review`,
                type: "DEAL_SUBMITTED",
                readStatus: false,
              },
            });
          } else {
            const roleUsers = await prisma.user.findMany({
              where: { tenantId: req.user!.tenantId, role: nextStep.approverRole, status: "ACTIVE" },
            });
            if (roleUsers.length > 0) {
              await prisma.notification.createMany({
                data: roleUsers.map((u: any) => ({
                  tenantId: req.user!.tenantId,
                  userId: u.id,
                  title: "Deal Approval Required",
                  message: `${deal.dealName} is ready for ${nextStep.approverRole} review`,
                  type: "DEAL_SUBMITTED" as const,
                  readStatus: false,
                })),
              });
            }

            // Also notify sales exec of progress (unless they ARE the next step)
            if (nextStep.approverRole !== "SALES_EXECUTIVE") {
              await prisma.notification.create({
                data: {
                  tenantId: req.user!.tenantId,
                  userId: salesExecId,
                  title: "Deal Progressed",
                  message: `Your deal ${deal.dealName} was approved at level ${aw.approvalLevel} — moving to next stage`,
                  type: "DEAL_APPROVED",
                  readStatus: false,
                },
              });
            }
          }
        }

        // Notify payroll when it becomes their turn
        if (nextStep.approverRole === "PAYROLL") {
          const salesExec: any = await prisma.user.findUnique({ where: { id: salesExecId }, select: { firstName: true, lastName: true } });
          const confirmedAmount = aw.approverRole === "SALES_EXECUTIVE" ? Number(payoutAmount) : null;
          const payrollUsers = await prisma.user.findMany({
            where: { tenantId: req.user!.tenantId, role: "PAYROLL", status: "ACTIVE" },
          });
          if (payrollUsers.length > 0) {
            await prisma.notification.createMany({
              data: payrollUsers.map((u: any) => ({
                tenantId: req.user!.tenantId,
                userId: u.id,
                title: "Payout Ready for Processing",
                message: confirmedAmount
                  ? `${salesExec?.firstName ?? "Sales exec"} ${salesExec?.lastName ?? ""} confirmed a payout of R${confirmedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${deal.dealName}. Please review and process.`
                  : `${deal.dealName} is ready for Payroll processing.`,
                type: "PAYOUT_REQUESTED" as const,
                readStatus: false,
              })),
            });
          }
        }
      } else {
        // Final approval step — check if wallet was already credited (by a SALES_EXECUTIVE step)
        const alreadyCredited = await prisma.walletTransaction.findFirst({
          where: { referenceId: aw.dealId, transactionType: "COMMISSION_APPROVED" },
        });

        await prisma.deal.update({ where: { id: aw.dealId }, data: { status: "APPROVED" } });

        if (!alreadyCredited) {
          // No SALES_EXECUTIVE step existed in this chain — credit wallet now
          const wallet = await prisma.wallet.findUnique({ where: { userId: salesExecId } });
          if (wallet) {
            await prisma.wallet.update({
              where: { id: wallet.id },
              data: {
                availableBalance: wallet.availableBalance + commission,
                pendingBalance: Math.max(0, wallet.pendingBalance - commission),
              },
            });
            await prisma.walletTransaction.create({
              data: {
                tenantId: req.user!.tenantId,
                walletId: wallet.id,
                transactionType: "COMMISSION_APPROVED",
                amount: commission,
                referenceType: "DEAL",
                referenceId: aw.dealId,
                description: `Commission approved: ${deal.dealName}`,
              },
            });
          }

          await prisma.notification.create({
            data: {
              tenantId: req.user!.tenantId,
              userId: salesExecId,
              title: "Commission Approved & Credited",
              message: `R${commission.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} has been credited to your wallet for ${deal.dealName}`,
              type: "WALLET_CREDITED",
              readStatus: false,
            },
          });
        } else {
          // Wallet was already credited at the SALES_EXECUTIVE step — just notify approval
          await prisma.notification.create({
            data: {
              tenantId: req.user!.tenantId,
              userId: salesExecId,
              title: "Deal Fully Approved",
              message: `${deal.dealName} has completed all approval stages and is fully approved.`,
              type: "DEAL_APPROVED",
              readStatus: false,
            },
          });
        }
      }
    } else if (action === "REJECT") {
      await prisma.deal.update({ where: { id: aw.dealId }, data: { status: "REJECTED" } });
      await deductPendingBalance(req.user!.tenantId, salesExecId, commission, aw.dealId, deal.dealName);

      // If a payout was already credited (SALES_EXECUTIVE step previously done), reverse it
      const credited = await prisma.walletTransaction.findFirst({
        where: { referenceId: aw.dealId, transactionType: "COMMISSION_APPROVED" },
      });
      if (credited) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: salesExecId } });
        if (wallet) {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: { availableBalance: Math.max(0, wallet.availableBalance - commission) },
          });
          await prisma.walletTransaction.create({
            data: {
              tenantId: req.user!.tenantId,
              walletId: wallet.id,
              transactionType: "PENDING_COMMISSION_REMOVED",
              amount: commission,
              referenceType: "DEAL",
              referenceId: aw.dealId,
              description: `Commission reversed after rejection: ${deal.dealName}`,
            },
          });
        }
      }

      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: salesExecId,
          title: "Deal Rejected",
          message: `Your deal ${deal.dealName} was rejected${comments ? `: ${comments}` : ""}`,
          type: "DEAL_REJECTED",
          readStatus: false,
        },
      });
    } else {
      // REQUEST_CHANGES
      await prisma.deal.update({ where: { id: aw.dealId }, data: { status: "CHANGES_REQUESTED" } });
      await deductPendingBalance(req.user!.tenantId, salesExecId, commission, aw.dealId, deal.dealName);
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: salesExecId,
          title: "Changes Requested on Deal",
          message: `${deal.dealName} has been sent back for changes${comments ? `: ${comments}` : ""}`,
          type: "DEAL_CHANGES_REQUESTED",
          readStatus: false,
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
        newValue: JSON.stringify({ status: newStatus, comments, payoutAmount: payoutAmount ?? null }),
      },
    });

    res.json(awToResponse(updated));
  } catch (err) {
    logger.error({ err }, "ActionApproval error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as approvalsRouter };

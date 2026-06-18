import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── GET /api/change-requests?eventId= ────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { eventId } = req.query as { eventId?: string };
  try {
    const where: any = { tenantId: req.user!.tenantId };
    if (eventId) where.commissionEventId = eventId;

    const requests = await prisma.changeRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: { select: { firstName: true, lastName: true } },
        reviewedBy:  { select: { firstName: true, lastName: true } },
        commissionEvent: { select: { eventTitle: true, approvalStatus: true, salesExecutiveId: true } },
      },
    });

    res.json(requests.map((r) => ({
      id:               r.id,
      commissionEventId: r.commissionEventId,
      eventTitle:       (r.commissionEvent as any).eventTitle ?? "",
      requestedById:    r.requestedById,
      requestedByName:  `${(r.requestedBy as any).firstName} ${(r.requestedBy as any).lastName}`,
      reviewedById:     r.reviewedById ?? null,
      reviewedByName:   r.reviewedBy ? `${(r.reviewedBy as any).firstName} ${(r.reviewedBy as any).lastName}` : null,
      reason:           r.reason,
      reviewNote:       r.reviewNote ?? null,
      status:           r.status,
      createdAt:        r.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "ListChangeRequests error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/change-requests — create a change request ──────────────────────
// Called by the sales exec when L1 has already approved.

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { commissionEventId, reason } = req.body;
  if (!commissionEventId || !reason?.trim()) {
    res.status(400).json({ error: "commissionEventId and reason are required" });
    return;
  }

  try {
    const event = await prisma.commissionEvent.findFirst({
      where: { id: commissionEventId, tenantId: req.user!.tenantId },
      include: { approvals: { orderBy: { approvalStep: "asc" } } },
    });
    if (!event) { res.status(404).json({ error: "Not found" }); return; }

    // Only the sales exec who owns the deal can request an amendment
    if ((event as any).salesExecutiveId !== req.user!.userId && !["ADMIN", "SUPER_ADMIN"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Only allowed when in-approval (not yet fully approved / rejected)
    const inApproval = ["PENDING_APPROVAL", "MANAGER_APPROVED", "FINANCE_APPROVED", "EXECUTIVE_APPROVED"].includes(event.approvalStatus);
    if (!inApproval) {
      res.status(400).json({ error: "Change requests can only be made while a deal is in the approval workflow" });
      return;
    }

    // Must not already have an open change request
    const existing = await prisma.changeRequest.findFirst({
      where: { commissionEventId, status: "PENDING" },
    });
    if (existing) {
      res.status(400).json({ error: "There is already a pending change request for this deal" });
      return;
    }

    // Find the L1 approver step
    const l1Step = (event.approvals as any[]).find((a) => a.approvalStep === 1);
    if (!l1Step) {
      res.status(400).json({ error: "No approval steps found for this deal" });
      return;
    }

    // Create the change request and set editStatus
    const [cr] = await prisma.$transaction([
      prisma.changeRequest.create({
        data: {
          tenantId:         req.user!.tenantId,
          commissionEventId,
          requestedById:    req.user!.userId,
          reason:           reason.trim(),
          status:           "PENDING",
        },
      }),
      prisma.commissionEvent.update({
        where: { id: commissionEventId },
        data:  { editStatus: "CHANGE_REQUESTED" },
      }),
    ]);

    // Notify the L1 approver
    const notifyUserId = l1Step.approverUserId ?? null;
    if (notifyUserId) {
      const requesterName = `${(req.user as any).firstName ?? ""} ${(req.user as any).lastName ?? ""}`.trim() || "Sales Executive";
      await prisma.notification.create({
        data: {
          tenantId:  req.user!.tenantId,
          userId:    notifyUserId,
          title:     "Amendment Requested",
          message:   `${requesterName} has requested an amendment to "${(event as any).eventTitle}": ${reason.trim().slice(0, 120)}`,
          type:      "AMENDMENT_REQUESTED",
          readStatus: false,
        },
      }).catch(() => {});
    }

    res.status(201).json({ id: cr.id, status: cr.status });
  } catch (err) {
    logger.error({ err }, "CreateChangeRequest error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/change-requests/:id/action — ACCEPT or DECLINE ─────────────────
// Called by the L1 approver (or admin).

router.post("/:id/action", requireAuth, async (req: Request, res: Response) => {
  const { action, reviewNote } = req.body;
  if (!action || !["ACCEPT", "DECLINE"].includes(action)) {
    res.status(400).json({ error: "action must be ACCEPT or DECLINE" });
    return;
  }

  try {
    const cr = await prisma.changeRequest.findUnique({
      where: { id: req.params.id as string },
      include: {
        commissionEvent: {
          include: { approvals: { orderBy: { approvalStep: "asc" } } },
        },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!cr) { res.status(404).json({ error: "Not found" }); return; }
    if (cr.tenantId !== req.user!.tenantId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (cr.status !== "PENDING") {
      res.status(400).json({ error: "This change request has already been actioned" }); return;
    }

    const event = cr.commissionEvent as any;
    const approvals = event.approvals as any[];
    const l1Step = approvals.find((a: any) => a.approvalStep === 1);

    // Only the L1 approver or admin can action it
    const canAction =
      ["SUPER_ADMIN", "ADMIN"].includes(req.user!.role) ||
      (l1Step && (l1Step.approverUserId === req.user!.userId || (!l1Step.approverUserId && l1Step.approverRole === req.user!.role)));
    if (!canAction) {
      res.status(403).json({ error: "You are not authorised to action this change request" }); return;
    }

    const reviewerName = `${(req.user as any).firstName ?? ""} ${(req.user as any).lastName ?? ""}`.trim() || "Approver";
    const salesExecId  = event.salesExecutiveId as string;
    const eventTitle   = event.eventTitle as string;
    const eventId      = event.id as string;

    if (action === "ACCEPT") {
      // Reset all approval steps and restart from L1
      await prisma.$transaction([
        // Close the change request
        prisma.changeRequest.update({
          where: { id: cr.id },
          data: { status: "ACCEPTED", reviewedById: req.user!.userId, reviewNote: reviewNote?.trim() ?? null },
        }),
        // Reset all approval steps: L1 → PENDING, rest → WAITING
        ...approvals.map((a: any, i: number) =>
          prisma.commissionEventApproval.update({
            where: { id: a.id },
            data: {
              status:        i === 0 ? "PENDING" : "WAITING",
              approverUserId: i === 0 ? null : null,
              comments:      null,
              approvedAt:    null,
              payoutAmount:  null,
            },
          })
        ),
        // Set event back to PENDING_APPROVAL and editStatus to EDITING
        prisma.commissionEvent.update({
          where: { id: eventId },
          data: {
            approvalStatus: "PENDING_APPROVAL",
            editStatus:     "EDITING",
          },
        }),
      ]);

      // Notify sales exec
      await prisma.notification.create({
        data: {
          tenantId:  req.user!.tenantId,
          userId:    salesExecId,
          title:     "Amendment Accepted",
          message:   `${reviewerName} accepted your amendment request for "${eventTitle}". Please update your deal — the approval will restart from the beginning.`,
          type:      "AMENDMENT_ACCEPTED",
          readStatus: false,
        },
      }).catch(() => {});

    } else {
      // DECLINE — close request and continue existing workflow
      await prisma.$transaction([
        prisma.changeRequest.update({
          where: { id: cr.id },
          data: { status: "DECLINED", reviewedById: req.user!.userId, reviewNote: reviewNote?.trim() ?? null },
        }),
        prisma.commissionEvent.update({
          where: { id: eventId },
          data: { editStatus: "NONE" },
        }),
      ]);

      // Notify sales exec
      await prisma.notification.create({
        data: {
          tenantId:  req.user!.tenantId,
          userId:    salesExecId,
          title:     "Amendment Declined",
          message:   `${reviewerName} declined your amendment request for "${eventTitle}".${reviewNote ? ` Note: ${reviewNote.trim().slice(0, 120)}` : ""} The approval workflow continues.`,
          type:      "AMENDMENT_DECLINED",
          readStatus: false,
        },
      }).catch(() => {});
    }

    res.json({ success: true, action });
  } catch (err) {
    logger.error({ err }, "ChangeRequestAction error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as changeRequestsRouter };

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { generateToken, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function userToResponse(user: {
  id: string; tenantId: string; email: string;
  firstName: string; lastName: string; role: string;
  status: string; createdAt: Date;
}) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const {
    companyName, email, password, firstName, lastName,
    contactPhone, industry, registrationNumber, vatNumber,
    contactName: bodyContactName, contactEmail: bodyContactEmail,
  } = req.body;

  if (!companyName || !email || !password || !firstName || !lastName) {
    res.status(400).json({ error: "companyName, email, password, firstName and lastName are required" });
    return;
  }
  try {
    // Check if email already exists
    const existing = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Resolve contact details — step 1 sends contactName/contactEmail separately from the admin email
    const resolvedContactName  = bodyContactName  || `${firstName} ${lastName}`;
    const resolvedContactEmail = bodyContactEmail || email.toLowerCase().trim();

    const passwordHash = await bcrypt.hash(password, 12);

    const industryCode = industry ?? "CUSTOM";

    const tenant = await prisma.tenant.create({
      data: {
        companyName,
        registrationNumber: registrationNumber ?? null,
        vatNumber: vatNumber ?? null,
        industry: industryCode,
        contactName: resolvedContactName,
        contactEmail: resolvedContactEmail.toLowerCase().trim(),
        contactPhone: contactPhone ?? null,
        status: "ACTIVE",
        subscriptionPlan: "STARTER",
      },
    });

    // Link tenant to IndustryTemplate + create TenantIndustryConfig
    const industryTemplate = await prisma.industryTemplate.findUnique({
      where: { code: industryCode },
    });
    if (industryTemplate) {
      await prisma.tenantIndustryConfig.create({
        data: {
          tenantId:           tenant.id,
          industryTemplateId: industryTemplate.id,
          isCustomised:       false,
        },
      });
    }

    // Create default 3-step TenantApprovalWorkflow
    await prisma.tenantApprovalWorkflow.create({
      data: {
        tenantId:     tenant.id,
        workflowName: "Default Approval Workflow",
        approvalStepsJson: [
          { step: 1, stepName: "Manager Review",    approverRole: "MANAGER", approverUserId: null },
          { step: 2, stepName: "Finance Review",    approverRole: "FINANCE", approverUserId: null },
          { step: 3, stepName: "Director Approval", approverRole: "ADMIN",   approverUserId: null },
        ],
        isActive: true,
      },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName,
        lastName,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    // Seed commission rules
    await prisma.commissionRule.createMany({
      data: [
        { tenantId: tenant.id, ruleName: "Net New Standard",   dealType: "NET_NEW",    commissionPercentage: 10, appliesToRole: "SALES_EXECUTIVE", effectiveFrom: new Date("2024-01-01"), status: "ACTIVE" },
        { tenantId: tenant.id, ruleName: "Renewal Commission",  dealType: "RENEWAL",    commissionPercentage: 5,  appliesToRole: "SALES_EXECUTIVE", effectiveFrom: new Date("2024-01-01"), status: "ACTIVE" },
        { tenantId: tenant.id, ruleName: "Upsell Commission",   dealType: "UPSELL",     commissionPercentage: 7,  appliesToRole: "SALES_EXECUTIVE", effectiveFrom: new Date("2024-01-01"), status: "ACTIVE" },
        { tenantId: tenant.id, ruleName: "Cross-Sell Standard", dealType: "CROSS_SELL", commissionPercentage: 6,  appliesToRole: "SALES_EXECUTIVE", effectiveFrom: new Date("2024-01-01"), status: "ACTIVE" },
      ],
    });

    // Create wallet for admin user
    const wallet = await prisma.wallet.create({
      data: { tenantId: tenant.id, userId: user.id },
    });

    // Seed demo deals & wallet history
    const now = new Date();
    const commPct: Record<string, number> = { NET_NEW: 10, RENEWAL: 5, UPSELL: 7, CROSS_SELL: 6 };
    const months = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"];
    let totalAvailable = 0;
    for (const m of months) {
      const revenue = Math.round((200000 + Math.random() * 400000) * 100) / 100;
      const cost = Math.round(revenue * 0.75 * 100) / 100;
      const gp = revenue - cost;
      const pct = commPct["NET_NEW"];
      const commission = Math.round(gp * (pct / 100) * 100) / 100;
      const dealDate = new Date(`${m}-15`);
      const deal = await prisma.deal.create({
        data: {
          tenantId: tenant.id,
          salesExecutiveId: user.id,
          submittedById: user.id,
          customerName: `Demo Customer ${m}`,
          dealName: `Demo Net New ${m}`,
          dealType: "NET_NEW",
          revenue, cost, grossProfit: gp,
          grossProfitPercentage: Math.round((gp / revenue) * 10000) / 100,
          commissionPercentage: pct,
          calculatedCommission: commission,
          status: "EXECUTIVE_APPROVED",
          submittedAt: dealDate,
          contractStartDate: dealDate,
          contractEndDate: new Date(dealDate.getFullYear() + 1, dealDate.getMonth(), dealDate.getDate()),
          createdAt: dealDate,
        },
      });
      await prisma.walletTransaction.create({
        data: {
          tenantId: tenant.id,
          walletId: wallet.id,
          transactionType: "CREDIT",
          amount: commission,
          referenceType: "DEAL",
          referenceId: deal.id,
          description: `Commission for ${deal.dealName}`,
          createdAt: dealDate,
        },
      });
      totalAvailable += commission;
    }

    // Pending deal
    const pendingRevenue = 800000;
    const pendingCost = 600000;
    const pendingGP = pendingRevenue - pendingCost;
    const pendingComm = Math.round(pendingGP * 0.10 * 100) / 100;
    const pendingDeal = await prisma.deal.create({
      data: {
        tenantId: tenant.id,
        salesExecutiveId: user.id,
        submittedById: user.id,
        customerName: "RST Industries",
        dealName: "New Contract 2024",
        dealType: "NET_NEW",
        revenue: pendingRevenue,
        cost: pendingCost,
        grossProfit: pendingGP,
        grossProfitPercentage: 25,
        commissionPercentage: 10,
        calculatedCommission: pendingComm,
        status: "PENDING_APPROVAL",
        submittedAt: now,
        createdAt: now,
      },
    });

    // Approval workflow for pending deal
    await prisma.approvalWorkflow.createMany({
      data: [
        { tenantId: tenant.id, dealId: pendingDeal.id, approvalLevel: 1, approverRole: "MANAGER", status: "PENDING" },
        { tenantId: tenant.id, dealId: pendingDeal.id, approvalLevel: 2, approverRole: "FINANCE", status: "PENDING" },
        { tenantId: tenant.id, dealId: pendingDeal.id, approvalLevel: 3, approverRole: "ADMIN",   status: "PENDING" },
      ],
    });

    // Update wallet balance
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: Math.round(totalAvailable * 100) / 100,
        pendingBalance: pendingComm,
      },
    });

    // Notifications
    await prisma.notification.createMany({
      data: [
        { tenantId: tenant.id, userId: user.id, title: "Welcome to Incentiq!", message: `Your company ${companyName} has been registered. Demo data has been seeded.`, type: "SYSTEM", readStatus: false },
        { tenantId: tenant.id, userId: user.id, title: "Commission Rules Set Up", message: "4 default commission rules have been configured for your tenant.", type: "SYSTEM", readStatus: false },
      ],
    });

    await prisma.auditLog.create({
      data: { tenantId: tenant.id, userId: user.id, action: "REGISTER", entityType: "Tenant", entityId: tenant.id, newValue: JSON.stringify({ companyName }) },
    });

    const token = generateToken({ userId: user.id, tenantId: tenant.id, role: user.role, email: user.email });
    res.status(201).json({ token, user: userToResponse(user) });
  } catch (err) {
    logger.error({ err }, "Register error");
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
    if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const token = generateToken({ userId: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
    res.json({ token, user: userToResponse(user) });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userToResponse(user));
  } catch (err) {
    logger.error({ err }, "GetMe error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (_req: Request, res: Response) => {
  res.json({ message: "Logged out successfully" });
});

export { router as authRouter };

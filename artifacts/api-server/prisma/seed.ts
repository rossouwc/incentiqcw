import { PrismaClient, UserRole, DealType, DealStatus, TransactionType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo-tenant-001" },
    update: {},
    create: {
      id: "demo-tenant-001",
      companyName: "TechSales ZA (Pty) Ltd",
      registrationNumber: "2021/123456/07",
      vatNumber: "4710123456",
      industry: "Technology",
      contactName: "Sarah Johnson",
      contactEmail: "admin@techsalesza.co.za",
      contactPhone: "+27 11 555 0100",
      status: "ACTIVE",
      subscriptionPlan: "PROFESSIONAL",
    },
  });
  console.log("✅ Tenant created:", tenant.companyName);

  // ─── Users ─────────────────────────────────────────────────────────────────
  const hash = (pw: string) => bcrypt.hashSync(pw, 12);
  const DEFAULT_PW = "Password123!";

  const usersData = [
    { id: "user-admin-001",    firstName: "Sarah",   lastName: "Johnson",   email: "admin@techsalesza.co.za",    role: UserRole.ADMIN,           passwordHash: hash(DEFAULT_PW) },
    { id: "user-manager-001",  firstName: "Michael", lastName: "van Niekerk",email: "manager@techsalesza.co.za", role: UserRole.MANAGER,          passwordHash: hash(DEFAULT_PW) },
    { id: "user-finance-001",  firstName: "Priya",   lastName: "Naidoo",    email: "finance@techsalesza.co.za",  role: UserRole.FINANCE,          passwordHash: hash(DEFAULT_PW) },
    { id: "user-exec-001",     firstName: "James",   lastName: "Ndlovu",    email: "james@techsalesza.co.za",    role: UserRole.SALES_EXECUTIVE,  passwordHash: hash(DEFAULT_PW) },
    { id: "user-exec-002",     firstName: "Nomsa",   lastName: "Dlamini",   email: "nomsa@techsalesza.co.za",    role: UserRole.SALES_EXECUTIVE,  passwordHash: hash(DEFAULT_PW) },
    { id: "user-exec-003",     firstName: "Ruan",    lastName: "Botha",     email: "ruan@techsalesza.co.za",     role: UserRole.SALES_EXECUTIVE,  passwordHash: hash(DEFAULT_PW) },
  ];

  const users: Record<string, any> = {};
  for (const u of usersData) {
    users[u.id] = await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { ...u, tenantId: tenant.id, status: "ACTIVE" },
    });
  }
  console.log("✅ Users created:", Object.keys(users).length);

  // ─── Commission Rules ──────────────────────────────────────────────────────
  const rulesData = [
    { id: "rule-001", ruleName: "Net New Standard",    dealType: DealType.NET_NEW,    commissionPercentage: 10, minGrossProfit: 0,      maxGrossProfit: 100000 },
    { id: "rule-002", ruleName: "Net New Premium",     dealType: DealType.NET_NEW,    commissionPercentage: 12, minGrossProfit: 100001, maxGrossProfit: null   },
    { id: "rule-003", ruleName: "Renewal Commission",  dealType: DealType.RENEWAL,    commissionPercentage: 5,  minGrossProfit: null,   maxGrossProfit: null   },
    { id: "rule-004", ruleName: "Upsell Commission",   dealType: DealType.UPSELL,     commissionPercentage: 7,  minGrossProfit: null,   maxGrossProfit: null   },
    { id: "rule-005", ruleName: "Cross-Sell Standard", dealType: DealType.CROSS_SELL, commissionPercentage: 6,  minGrossProfit: null,   maxGrossProfit: null   },
  ];

  for (const r of rulesData) {
    await prisma.commissionRule.upsert({
      where: { id: r.id },
      update: {},
      create: {
        ...r,
        tenantId: tenant.id,
        appliesToRole: UserRole.SALES_EXECUTIVE,
        effectiveFrom: new Date("2024-01-01"),
        status: "ACTIVE",
      },
    });
  }
  console.log("✅ Commission rules created:", rulesData.length);

  // ─── Wallets ───────────────────────────────────────────────────────────────
  const execIds = ["user-exec-001", "user-exec-002", "user-exec-003"];
  for (const uid of execIds) {
    await prisma.wallet.upsert({
      where: { userId: uid },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: uid,
        availableBalance: 0,
        pendingBalance: 0,
        deferredBalance: 0,
        paidOutBalance: 0,
      },
    });
  }

  // ─── Deals ─────────────────────────────────────────────────────────────────
  type DealSeed = {
    id: string; execId: string; customerName: string; dealName: string; dealType: DealType;
    revenue: number; cost: number; status: DealStatus; createdAt: Date; submittedAt?: Date;
  };

  const dealsData: DealSeed[] = [
    // James's deals
    { id: "deal-001", execId: "user-exec-001", customerName: "ABC Technologies",    dealName: "ERP Cloud Migration",          dealType: DealType.NET_NEW,    revenue: 480000, cost: 360000, status: DealStatus.EXECUTIVE_APPROVED, createdAt: new Date("2024-03-10"), submittedAt: new Date("2024-03-11") },
    { id: "deal-002", execId: "user-exec-001", customerName: "XYZ Solutions",       dealName: "Annual Support Renewal",       dealType: DealType.RENEWAL,    revenue: 180000, cost: 140000, status: DealStatus.FINANCE_APPROVED,   createdAt: new Date("2024-04-02"), submittedAt: new Date("2024-04-03") },
    { id: "deal-003", execId: "user-exec-001", customerName: "LMN Systems",         dealName: "Security Suite Upsell",        dealType: DealType.UPSELL,     revenue: 240000, cost: 180000, status: DealStatus.MANAGER_APPROVED,   createdAt: new Date("2024-05-15"), submittedAt: new Date("2024-05-16") },
    { id: "deal-004", execId: "user-exec-001", customerName: "RST Industries",      dealName: "New Contract 2024",            dealType: DealType.NET_NEW,    revenue: 800000, cost: 600000, status: DealStatus.PENDING_APPROVAL,   createdAt: new Date("2024-06-01"), submittedAt: new Date("2024-06-01") },
    { id: "deal-005", execId: "user-exec-001", customerName: "Quantum Corp",        dealName: "Analytics Platform",           dealType: DealType.CROSS_SELL, revenue: 160000, cost: 120000, status: DealStatus.SUBMITTED,          createdAt: new Date("2024-06-08") },
    // Nomsa's deals
    { id: "deal-006", execId: "user-exec-002", customerName: "First National Bank", dealName: "Banking Cloud Suite",          dealType: DealType.NET_NEW,    revenue: 1200000, cost: 900000, status: DealStatus.EXECUTIVE_APPROVED, createdAt: new Date("2024-02-20"), submittedAt: new Date("2024-02-21") },
    { id: "deal-007", execId: "user-exec-002", customerName: "Shoprite Holdings",   dealName: "Retail Analytics Renewal",     dealType: DealType.RENEWAL,    revenue: 320000,  cost: 240000, status: DealStatus.FINANCE_APPROVED,   createdAt: new Date("2024-04-10"), submittedAt: new Date("2024-04-11") },
    { id: "deal-008", execId: "user-exec-002", customerName: "MTN Group",           dealName: "AI Chatbot Implementation",    dealType: DealType.UPSELL,     revenue: 560000,  cost: 420000, status: DealStatus.PENDING_APPROVAL,   createdAt: new Date("2024-06-05"), submittedAt: new Date("2024-06-06") },
    // Ruan's deals
    { id: "deal-009", execId: "user-exec-003", customerName: "Discovery Health",    dealName: "Insurance Platform",           dealType: DealType.NET_NEW,    revenue: 950000, cost: 700000, status: DealStatus.EXECUTIVE_APPROVED, createdAt: new Date("2024-01-15"), submittedAt: new Date("2024-01-16") },
    { id: "deal-010", execId: "user-exec-003", customerName: "Nedbank",             dealName: "Mobile Banking Renewal",       dealType: DealType.RENEWAL,    revenue: 280000, cost: 210000, status: DealStatus.REJECTED,           createdAt: new Date("2024-03-22"), submittedAt: new Date("2024-03-23") },
    { id: "deal-011", execId: "user-exec-003", customerName: "Transnet SOC",        dealName: "Logistics Management System",  dealType: DealType.NET_NEW,    revenue: 680000, cost: 510000, status: DealStatus.MANAGER_APPROVED,   createdAt: new Date("2024-05-28"), submittedAt: new Date("2024-05-29") },
  ];

  const commPct: Record<DealType, number> = {
    NET_NEW: 10, RENEWAL: 5, UPSELL: 7, CROSS_SELL: 6,
  };

  const createdDeals: Record<string, any> = {};
  for (const d of dealsData) {
    const gp = d.revenue - d.cost;
    const gpPct = d.revenue > 0 ? (gp / d.revenue) * 100 : 0;
    const pct = commPct[d.dealType];
    const commission = Math.round(gp * (pct / 100) * 100) / 100;

    createdDeals[d.id] = await prisma.deal.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id,
        tenantId: tenant.id,
        salesExecutiveId: d.execId,
        submittedById: d.submittedAt ? d.execId : null,
        customerName: d.customerName,
        dealName: d.dealName,
        dealType: d.dealType,
        revenue: d.revenue,
        cost: d.cost,
        grossProfit: gp,
        grossProfitPercentage: Math.round(gpPct * 100) / 100,
        commissionPercentage: pct,
        calculatedCommission: commission,
        status: d.status,
        submittedAt: d.submittedAt ?? null,
        contractStartDate: d.submittedAt ?? null,
        contractEndDate: d.submittedAt ? new Date(d.submittedAt.getFullYear() + 1, d.submittedAt.getMonth(), d.submittedAt.getDate()) : null,
        createdAt: d.createdAt,
      },
    });
  }
  console.log("✅ Deals created:", Object.keys(createdDeals).length);

  // ─── Approval Workflows ────────────────────────────────────────────────────
  const approvedDeals = dealsData.filter(d =>
    [DealStatus.MANAGER_APPROVED, DealStatus.FINANCE_APPROVED, DealStatus.EXECUTIVE_APPROVED, DealStatus.PENDING_APPROVAL].includes(d.status)
  );
  for (const d of approvedDeals) {
    const deal = createdDeals[d.id];
    const statusMap: Record<DealStatus, { l1: string; l2: string; l3: string }> = {
      [DealStatus.PENDING_APPROVAL]:   { l1: "PENDING",  l2: "PENDING",  l3: "PENDING"  },
      [DealStatus.MANAGER_APPROVED]:   { l1: "APPROVED", l2: "PENDING",  l3: "PENDING"  },
      [DealStatus.FINANCE_APPROVED]:   { l1: "APPROVED", l2: "APPROVED", l3: "PENDING"  },
      [DealStatus.EXECUTIVE_APPROVED]: { l1: "APPROVED", l2: "APPROVED", l3: "APPROVED" },
      [DealStatus.DRAFT]: { l1: "PENDING", l2: "PENDING", l3: "PENDING" },
      [DealStatus.SUBMITTED]: { l1: "PENDING", l2: "PENDING", l3: "PENDING" },
      [DealStatus.REJECTED]: { l1: "REJECTED", l2: "PENDING", l3: "PENDING" },
      [DealStatus.CANCELLED]: { l1: "PENDING", l2: "PENDING", l3: "PENDING" },
    };
    const s = statusMap[d.status];
    const levels = [
      { level: 1, role: UserRole.MANAGER,  approver: "user-manager-001", statusStr: s.l1 },
      { level: 2, role: UserRole.FINANCE,  approver: "user-finance-001", statusStr: s.l2 },
      { level: 3, role: UserRole.ADMIN,    approver: "user-admin-001",   statusStr: s.l3 },
    ];
    for (const lv of levels) {
      await prisma.approvalWorkflow.upsert({
        where: { id: `aw-${d.id}-l${lv.level}` },
        update: {},
        create: {
          id: `aw-${d.id}-l${lv.level}`,
          tenantId: tenant.id,
          dealId: deal.id,
          approvalLevel: lv.level,
          approverRole: lv.role,
          approverUserId: lv.statusStr !== "PENDING" ? lv.approver : null,
          status: lv.statusStr as ApprovalStatus,
          approvedAt: lv.statusStr === "APPROVED" ? new Date() : null,
        },
      });
    }
  }
  console.log("✅ Approval workflows created");

  // ─── Wallet Balances & Transactions ───────────────────────────────────────
  const walletCredits: Record<string, { available: number; pending: number; deferred: number; paid: number }> = {
    "user-exec-001": { available: 0, pending: 0, deferred: 0, paid: 0 },
    "user-exec-002": { available: 0, pending: 0, deferred: 0, paid: 0 },
    "user-exec-003": { available: 0, pending: 0, deferred: 0, paid: 0 },
  };

  for (const d of dealsData) {
    if (!walletCredits[d.execId]) continue;
    const deal = createdDeals[d.id];
    const w = walletCredits[d.execId];
    if (d.status === DealStatus.EXECUTIVE_APPROVED) w.available += deal.calculatedCommission;
    else if (d.status === DealStatus.PENDING_APPROVAL || d.status === DealStatus.SUBMITTED) w.pending += deal.calculatedCommission;
    else if (d.status === DealStatus.MANAGER_APPROVED || d.status === DealStatus.FINANCE_APPROVED) w.deferred += deal.calculatedCommission;
  }

  for (const [uid, bal] of Object.entries(walletCredits)) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: uid } });
    if (!wallet) continue;

    // Update balances
    await prisma.wallet.update({
      where: { userId: uid },
      data: {
        availableBalance: Math.round(bal.available * 100) / 100,
        pendingBalance: Math.round(bal.pending * 100) / 100,
        deferredBalance: Math.round(bal.deferred * 100) / 100,
        paidOutBalance: 0,
      },
    });

    // Create transactions for approved deals
    const userDeals = dealsData.filter(d => d.execId === uid && d.status === DealStatus.EXECUTIVE_APPROVED);
    for (const d of userDeals) {
      const deal = createdDeals[d.id];
      await prisma.walletTransaction.upsert({
        where: { id: `wt-${d.id}` },
        update: {},
        create: {
          id: `wt-${d.id}`,
          tenantId: tenant.id,
          walletId: wallet.id,
          transactionType: TransactionType.CREDIT,
          amount: deal.calculatedCommission,
          referenceType: "DEAL",
          referenceId: deal.id,
          description: `Commission for ${deal.dealName} — ${d.customerName}`,
          createdAt: d.submittedAt!,
        },
      });
    }
  }
  console.log("✅ Wallets and transactions updated");

  // ─── Tax Profiles ──────────────────────────────────────────────────────────
  const taxData = [
    { uid: "user-exec-001", monthlySalary: 55000, medical: 1500, retirement: 5500 },
    { uid: "user-exec-002", monthlySalary: 62000, medical: 2250, retirement: 6200 },
    { uid: "user-exec-003", monthlySalary: 48000, medical: 1500, retirement: 4800 },
  ];
  for (const t of taxData) {
    await prisma.taxProfile.upsert({
      where: { userId: t.uid },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: t.uid,
        monthlySalary: t.monthlySalary,
        annualSalary: t.monthlySalary * 12,
        taxYear: 2024,
        medicalAidCredits: t.medical,
        retirementContribution: t.retirement,
      },
    });
  }
  console.log("✅ Tax profiles created");

  // ─── Payout Requests ──────────────────────────────────────────────────────
  await prisma.payoutRequest.upsert({
    where: { id: "pr-001" },
    update: {},
    create: {
      id: "pr-001",
      tenantId: tenant.id,
      userId: "user-exec-001",
      requestedAmount: 25000,
      estimatedTax: 6250,
      estimatedNetPayout: 18750,
      payoutMonth: "2024-06",
      status: "PENDING",
      requestedAt: new Date("2024-06-10"),
    },
  });
  await prisma.payoutRequest.upsert({
    where: { id: "pr-002" },
    update: {},
    create: {
      id: "pr-002",
      tenantId: tenant.id,
      userId: "user-exec-002",
      requestedAmount: 45000,
      estimatedTax: 11250,
      estimatedNetPayout: 33750,
      payoutMonth: "2024-05",
      status: "FINANCE_APPROVED",
      requestedAt: new Date("2024-05-28"),
      approvedAt: new Date("2024-06-02"),
    },
  });
  console.log("✅ Payout requests created");

  // ─── Notifications ─────────────────────────────────────────────────────────
  const notifs = [
    { userId: "user-exec-001", title: "Deal Approved", message: "Your deal 'ERP Cloud Migration' has been fully approved", type: "DEAL_APPROVED", readStatus: false },
    { userId: "user-exec-001", title: "Wallet Credited", message: "Commission of R12,000.00 has been credited to your wallet", type: "WALLET_CREDITED", readStatus: false },
    { userId: "user-exec-001", title: "Payout Request Submitted", message: "Your payout request of R25,000.00 for June 2024 is under review", type: "PAYOUT_REQUESTED", readStatus: true },
    { userId: "user-exec-002", title: "Deal Approved", message: "Your deal 'Banking Cloud Suite' has been fully approved", type: "DEAL_APPROVED", readStatus: false },
    { userId: "user-exec-002", title: "Payout Approved", message: "Your payout request for May 2024 has been approved by Finance", type: "PAYOUT_APPROVED", readStatus: false },
    { userId: "user-manager-001", title: "New Approval Required", message: "RST Industries deal 'New Contract 2024' awaits your approval", type: "DEAL_SUBMITTED", readStatus: false },
    { userId: "user-finance-001", title: "New Approval Required", message: "Payout request from James Ndlovu requires finance review", type: "PAYOUT_REQUESTED", readStatus: false },
  ];
  for (const n of notifs) {
    await prisma.notification.create({
      data: { tenantId: tenant.id, ...n, type: n.type as any },
    });
  }
  console.log("✅ Notifications created");

  // ─── Audit Logs ────────────────────────────────────────────────────────────
  await prisma.auditLog.create({ data: { tenantId: tenant.id, userId: "user-admin-001",   action: "CREATE", entityType: "Tenant", entityId: tenant.id,     newValue: JSON.stringify({ companyName: tenant.companyName }) } });
  await prisma.auditLog.create({ data: { tenantId: tenant.id, userId: "user-exec-001",    action: "SUBMIT", entityType: "Deal",   entityId: "deal-001",    newValue: JSON.stringify({ status: "SUBMITTED" }) } });
  await prisma.auditLog.create({ data: { tenantId: tenant.id, userId: "user-manager-001", action: "APPROVE", entityType: "Deal",  entityId: "deal-001",    oldValue: JSON.stringify({ status: "PENDING_APPROVAL" }), newValue: JSON.stringify({ status: "MANAGER_APPROVED" }) } });
  await prisma.auditLog.create({ data: { tenantId: tenant.id, userId: "user-finance-001", action: "APPROVE", entityType: "Deal",  entityId: "deal-001",    oldValue: JSON.stringify({ status: "MANAGER_APPROVED" }), newValue: JSON.stringify({ status: "FINANCE_APPROVED" }) } });
  await prisma.auditLog.create({ data: { tenantId: tenant.id, userId: "user-admin-001",   action: "APPROVE", entityType: "Deal",  entityId: "deal-001",    oldValue: JSON.stringify({ status: "FINANCE_APPROVED" }), newValue: JSON.stringify({ status: "EXECUTIVE_APPROVED" }) } });
  console.log("✅ Audit logs created");

  console.log("\n🎉 Seed complete!");
  console.log("─────────────────────────────────────────────");
  console.log("Demo login credentials (all use Password123!):");
  console.log("  Admin:           admin@techsalesza.co.za");
  console.log("  Manager:         manager@techsalesza.co.za");
  console.log("  Finance:         finance@techsalesza.co.za");
  console.log("  Sales Exec 1:    james@techsalesza.co.za");
  console.log("  Sales Exec 2:    nomsa@techsalesza.co.za");
  console.log("  Sales Exec 3:    ruan@techsalesza.co.za");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

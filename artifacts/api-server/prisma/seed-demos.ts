/**
 * seed-demos.ts — creates 8 industry demo tenants with full sample data
 * Run: cd artifacts/api-server && npx ts-node --esm prisma/seed-demos.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const hash = (pw: string) => bcrypt.hashSync(pw, 12);
const DEFAULT_PW = "Password123!";

// ─── Industry-specific event data ─────────────────────────────────────────────

type EventSeed = {
  title: string;
  eventType: string;
  customer: string;
  revenue: number;
  cost: number;
  commPct: number;
  meta?: Record<string, string | number>;
};

const DEMO_TENANTS = [
  {
    id: "demo-itcons",
    companyName: "IQ Digital Demo Company",
    industry: "IT_CONSULTING",
    email: "itcons",
    domain: "iqdemo.co.za",
    subscriptionPlan: "PROFESSIONAL",
    commissionCutoffDay: 20,
    events: [
      { title: "Absa Bank – Core Banking Migration",      eventType: "NET_NEW",    customer: "Absa Bank",           revenue: 950000, cost: 712500, commPct: 10 },
      { title: "Standard Bank – Cloud Infrastructure",    eventType: "RENEWAL",    customer: "Standard Bank",       revenue: 420000, cost: 315000, commPct: 5  },
      { title: "Discovery – Data Analytics Platform",     eventType: "NET_NEW",    customer: "Discovery Health",    revenue: 680000, cost: 510000, commPct: 10 },
      { title: "Old Mutual – ERP Implementation",         eventType: "NET_NEW",    customer: "Old Mutual",          revenue: 1200000,cost: 900000, commPct: 10 },
      { title: "Capitec – Mobile App Development",        eventType: "UPSELL",     customer: "Capitec Bank",        revenue: 380000, cost: 285000, commPct: 7  },
      { title: "Nedbank – Cybersecurity Assessment",      eventType: "CROSS_SELL", customer: "Nedbank",             revenue: 260000, cost: 195000, commPct: 6  },
      { title: "FNB – DevOps Transformation",             eventType: "NET_NEW",    customer: "First National Bank", revenue: 820000, cost: 615000, commPct: 10 },
      { title: "Sanlam – BI Dashboard Implementation",    eventType: "RENEWAL",    customer: "Sanlam",              revenue: 310000, cost: 232500, commPct: 5  },
      { title: "Vodacom – IT Support Contract",           eventType: "RENEWAL",    customer: "Vodacom Business",    revenue: 480000, cost: 360000, commPct: 5  },
      { title: "MTN – Network Monitoring System",         eventType: "NET_NEW",    customer: "MTN South Africa",    revenue: 740000, cost: 555000, commPct: 10 },
    ] as EventSeed[],
  },
  {
    id: "demo-recruit",
    companyName: "TalentPro Recruitment Demo",
    industry: "RECRUITMENT",
    email: "recruit",
    domain: "talentprodemo.co.za",
    subscriptionPlan: "PROFESSIONAL",
    commissionCutoffDay: 25,
    events: [
      { title: "Absa Bank – Senior Developer Placement",   eventType: "PERMANENT",  customer: "Absa Bank",         revenue: 180000, cost: 0, commPct: 10, meta: { candidateName: "Sipho Dlamini",    position: "Senior Full-Stack Developer" } },
      { title: "Discovery – Cloud Architect Placement",    eventType: "CONTRACT",   customer: "Discovery Health",  revenue: 95000,  cost: 0, commPct: 10, meta: { candidateName: "Priya Naidoo",     position: "Cloud Solutions Architect" } },
      { title: "Pick n Pay – IT Manager Placement",        eventType: "PERMANENT",  customer: "Pick n Pay",        revenue: 210000, cost: 0, commPct: 10, meta: { candidateName: "Michael Steyn",    position: "IT Manager" } },
      { title: "Woolworths – Data Scientist Placement",    eventType: "PERMANENT",  customer: "Woolworths",        revenue: 195000, cost: 0, commPct: 10, meta: { candidateName: "Zanele Mokoena",   position: "Data Scientist" } },
      { title: "Standard Bank – Security Engineer",        eventType: "CONTRACT",   customer: "Standard Bank",     revenue: 120000, cost: 0, commPct: 10, meta: { candidateName: "Ruan Botha",       position: "Information Security Engineer" } },
      { title: "MTN – Product Manager Placement",          eventType: "PERMANENT",  customer: "MTN South Africa",  revenue: 230000, cost: 0, commPct: 10, meta: { candidateName: "Ayanda Khumalo",   position: "Senior Product Manager" } },
      { title: "Shoprite – DevOps Engineer",               eventType: "PERMANENT",  customer: "Shoprite Holdings", revenue: 165000, cost: 0, commPct: 10, meta: { candidateName: "Ethan Van der Berg",position: "DevOps Engineer" } },
      { title: "Old Mutual – UX Designer Placement",       eventType: "TEMPORARY",  customer: "Old Mutual",        revenue: 72000,  cost: 0, commPct: 10, meta: { candidateName: "Lerato Molefe",    position: "Senior UX Designer" } },
      { title: "Capitec – QA Lead Placement",              eventType: "PERMANENT",  customer: "Capitec Bank",      revenue: 155000, cost: 0, commPct: 10, meta: { candidateName: "James Ndlovu",     position: "QA Test Lead" } },
      { title: "Nedbank – Systems Analyst Placement",      eventType: "PERMANENT",  customer: "Nedbank",           revenue: 145000, cost: 0, commPct: 10, meta: { candidateName: "Fatima Cassim",    position: "Systems Analyst" } },
    ] as EventSeed[],
  },
  {
    id: "demo-insure",
    companyName: "SecureLife Insurance Demo",
    industry: "INSURANCE",
    email: "insure",
    domain: "securelifedemo.co.za",
    subscriptionPlan: "PROFESSIONAL",
    commissionCutoffDay: 20,
    events: [
      { title: "John Smith – Life Policy",           eventType: "LIFE",       customer: "John Smith",       revenue: 84000,  cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-001", insurer: "Liberty Life" } },
      { title: "Mary Johnson – Short-Term Policy",   eventType: "SHORT_TERM", customer: "Mary Johnson",     revenue: 36000,  cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-002", insurer: "Santam" } },
      { title: "Peter Williams – Health Policy",     eventType: "HEALTH",     customer: "Peter Williams",   revenue: 72000,  cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-003", insurer: "Discovery" } },
      { title: "ABC Corp – Commercial Policy",       eventType: "COMMERCIAL", customer: "ABC Corporation",  revenue: 240000, cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-004", insurer: "Hollard" } },
      { title: "Michael Brown – Life Policy",        eventType: "LIFE",       customer: "Michael Brown",    revenue: 120000, cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-005", insurer: "Momentum" } },
      { title: "Linda Wilson – Short-Term Policy",   eventType: "SHORT_TERM", customer: "Linda Wilson",     revenue: 48000,  cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-006", insurer: "OUTsurance" } },
      { title: "David Taylor – Health Policy",       eventType: "HEALTH",     customer: "David Taylor",     revenue: 96000,  cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-007", insurer: "Bonitas" } },
      { title: "Jennifer Anderson – Life Policy",    eventType: "LIFE",       customer: "Jennifer Anderson",revenue: 60000,  cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-008", insurer: "Old Mutual" } },
      { title: "XYZ Ltd – Commercial Policy",        eventType: "COMMERCIAL", customer: "XYZ Holdings",     revenue: 180000, cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-009", insurer: "Absa Insurance" } },
      { title: "Sarah Garcia – Short-Term Policy",   eventType: "SHORT_TERM", customer: "Sarah Garcia",     revenue: 24000,  cost: 0, commPct: 8, meta: { policyNumber: "POL-2025-010", insurer: "King Price" } },
    ] as EventSeed[],
  },
  {
    id: "demo-automax",
    companyName: "AutoMax Dealership Demo",
    industry: "VEHICLE_DEALERSHIP",
    email: "automax",
    domain: "automaxdemo.co.za",
    subscriptionPlan: "PROFESSIONAL",
    commissionCutoffDay: 20,
    events: [
      { title: "Toyota Hilux GD-6 – Lebo Mokoena",   eventType: "NEW",  customer: "Lebo Mokoena",   revenue: 589000, cost: 505000, commPct: 15, meta: { vehicleMake: "Toyota",    vehicleModel: "Hilux GD-6 Double Cab" } },
      { title: "BMW 320d – Cape Town Client",         eventType: "NEW",  customer: "Anthony Venter",  revenue: 820000, cost: 748000, commPct: 15, meta: { vehicleMake: "BMW",       vehicleModel: "320d M Sport" } },
      { title: "VW Polo 1.0 TSI – First-Time Buyer", eventType: "NEW",  customer: "Zanele Dube",     revenue: 348000, cost: 315000, commPct: 15, meta: { vehicleMake: "Volkswagen",vehicleModel: "Polo 1.0 TSI Life" } },
      { title: "Ford Ranger Raptor – Fleet Deal",     eventType: "NEW",  customer: "Mining Logistics Ltd", revenue: 945000, cost: 862000, commPct: 15, meta: { vehicleMake: "Ford",      vehicleModel: "Ranger Raptor V6" } },
      { title: "Hyundai Tucson – Pre-Owned",          eventType: "USED", customer: "Priya Naidoo",    revenue: 420000, cost: 368000, commPct: 15, meta: { vehicleMake: "Hyundai",   vehicleModel: "Tucson 2.0 Elite" } },
      { title: "Mercedes C-Class – Executive Car",    eventType: "NEW",  customer: "David Ferreira",  revenue: 1150000,cost: 1058000,commPct: 15, meta: { vehicleMake: "Mercedes",  vehicleModel: "C 220d AMG Line" } },
      { title: "Kia Sportage – Trade-In Deal",        eventType: "USED", customer: "Nomsa Khumalo",   revenue: 395000, cost: 350000, commPct: 15, meta: { vehicleMake: "Kia",       vehicleModel: "Sportage 1.6T EX" } },
      { title: "Nissan Navara – Company Fleet",       eventType: "NEW",  customer: "SA Construction", revenue: 568000, cost: 518000, commPct: 15, meta: { vehicleMake: "Nissan",    vehicleModel: "Navara 2.5 Pro-4X" } },
      { title: "Audi Q5 – Demo Vehicle",              eventType: "DEMO", customer: "Ruan Botha",      revenue: 780000, cost: 688000, commPct: 15, meta: { vehicleMake: "Audi",      vehicleModel: "Q5 40 TDI quattro" } },
      { title: "Honda CR-V – Family Buyer",           eventType: "USED", customer: "Fatima Cassim",   revenue: 465000, cost: 408000, commPct: 15, meta: { vehicleMake: "Honda",     vehicleModel: "CR-V 1.5T CVT" } },
    ] as EventSeed[],
  },
  {
    id: "demo-propprime",
    companyName: "PrimeProperty Demo",
    industry: "PROPERTY_SALES",
    email: "propprime",
    domain: "primepropdemo.co.za",
    subscriptionPlan: "PROFESSIONAL",
    commissionCutoffDay: 15,
    events: [
      { title: "12 Main Road, Sandton",                  eventType: "RESIDENTIAL",  customer: "John & Mary Smith",      revenue: 4200000, cost: 0, commPct: 5, meta: { propertyAddress: "12 Main Road, Sandton" } },
      { title: "Unit 5, Waterfall City",                 eventType: "COMMERCIAL",   customer: "Tech Startup ZA (Pty)",  revenue: 2800000, cost: 0, commPct: 5, meta: { propertyAddress: "Unit 5, Waterfall City Office Park" } },
      { title: "34 Ocean View Drive, Cape Town",         eventType: "RESIDENTIAL",  customer: "Peter & Sue Anderson",   revenue: 6500000, cost: 0, commPct: 5, meta: { propertyAddress: "34 Ocean View Drive, Camps Bay" } },
      { title: "Block C, Rosebank",                      eventType: "COMMERCIAL",   customer: "Rosebank Investments",   revenue: 9200000, cost: 0, commPct: 5, meta: { propertyAddress: "Block C, Oxford Parks, Rosebank" } },
      { title: "7 Vineyard Estate, Stellenbosch",        eventType: "RESIDENTIAL",  customer: "Andre & Liesel Du Toit", revenue: 8100000, cost: 0, commPct: 5, meta: { propertyAddress: "7 Vineyard Estate, Stellenbosch" } },
      { title: "Industrial Park Unit 8, Germiston",      eventType: "INDUSTRIAL",   customer: "SA Manufacturing Ltd",   revenue: 5400000, cost: 0, commPct: 5, meta: { propertyAddress: "Unit 8, Germiston Industrial Park" } },
      { title: "22 Umhlanga Rocks Drive, KZN",           eventType: "RESIDENTIAL",  customer: "Sipho & Zanele Molefe",  revenue: 3800000, cost: 0, commPct: 5, meta: { propertyAddress: "22 Umhlanga Rocks Drive, Umhlanga" } },
      { title: "Farm Portion 14, Paarl",                 eventType: "AGRICULTURAL", customer: "Boland Farms (Pty) Ltd", revenue: 12000000,cost: 0, commPct: 5, meta: { propertyAddress: "Farm Portion 14, Paarl" } },
      { title: "89 Clifton, Cape Town",                  eventType: "RESIDENTIAL",  customer: "James & Priya Naidoo",   revenue: 18500000,cost: 0, commPct: 5, meta: { propertyAddress: "89 Clifton 4th Beach Road" } },
      { title: "Office Park Suite 201, Midrand",         eventType: "COMMERCIAL",   customer: "Midrand Fintech (Pty)",  revenue: 3200000, cost: 0, commPct: 5, meta: { propertyAddress: "Suite 201, Midrand Business Park" } },
    ] as EventSeed[],
  },
  {
    id: "demo-rentflow",
    companyName: "RentFlow Demo",
    industry: "RENTAL_MANAGEMENT",
    email: "rentflow",
    domain: "rentflowdemo.co.za",
    subscriptionPlan: "STARTER",
    commissionCutoffDay: 20,
    events: [
      { title: "5 Parkland Apartments, Sandton",   eventType: "RESIDENTIAL", customer: "Sipho Dlamini",        revenue: 18500, cost: 0, commPct: 8, meta: { propertyAddress: "Apt 5B, Parkland Apartments, Sandton" } },
      { title: "Unit 3, Commerce Square",          eventType: "COMMERCIAL",  customer: "Digital Agency ZA",    revenue: 45000, cost: 0, commPct: 8, meta: { propertyAddress: "Unit 3, Commerce Square, Century City" } },
      { title: "12 Beachfront Units, Durban",      eventType: "RESIDENTIAL", customer: "Durban Holiday Lets",  revenue: 22000, cost: 0, commPct: 8, meta: { propertyAddress: "12 Beachfront Drive, uMhlanga" } },
      { title: "Office Suite 7, Melrose Arch",     eventType: "COMMERCIAL",  customer: "Consulting Group ZA",  revenue: 68000, cost: 0, commPct: 8, meta: { propertyAddress: "Suite 7, The Piazza, Melrose Arch" } },
      { title: "89 Riverside Complex",             eventType: "RESIDENTIAL", customer: "Zanele Mokoena",       revenue: 14500, cost: 0, commPct: 8, meta: { propertyAddress: "89 Riverside Complex, Centurion" } },
      { title: "Unit 14, Century City",            eventType: "COMMERCIAL",  customer: "E-Commerce Start ZA",  revenue: 38000, cost: 0, commPct: 8, meta: { propertyAddress: "Unit 14, Century City Square" } },
      { title: "23 Greenfields Estate",            eventType: "RESIDENTIAL", customer: "Priya & Raj Naidoo",  revenue: 19800, cost: 0, commPct: 8, meta: { propertyAddress: "23 Greenfields Estate, Pretoria East" } },
      { title: "Warehouse Block A, Germiston",     eventType: "INDUSTRIAL",  customer: "SA Logistics Hub",     revenue: 95000, cost: 0, commPct: 8, meta: { propertyAddress: "Block A, Germiston Warehouse Park" } },
      { title: "45 Seapoint Apartments",           eventType: "RESIDENTIAL", customer: "Ruan Botha",           revenue: 28000, cost: 0, commPct: 8, meta: { propertyAddress: "Apt 45, Seapoint Terrace, Cape Town" } },
      { title: "Studio 7, Braamfontein",           eventType: "RESIDENTIAL", customer: "Yusuf Abrahams",       revenue: 9500,  cost: 0, commPct: 8, meta: { propertyAddress: "Studio 7, The Foundry, Braamfontein" } },
    ] as EventSeed[],
  },
  {
    id: "demo-connectel",
    companyName: "ConnectTel Demo",
    industry: "TELECOM",
    email: "connectel",
    domain: "connecteldemo.co.za",
    subscriptionPlan: "PROFESSIONAL",
    commissionCutoffDay: 20,
    events: [
      { title: "Absa Bank – Business Fibre 1Gbps",        eventType: "BUSINESS", customer: "Absa Bank",          revenue: 288000, cost: 0, commPct: 6, meta: { product: "Business Fibre 1Gbps", contractMonths: 36 } },
      { title: "Discovery – Mobile Fleet (50 lines)",     eventType: "MOBILE",   customer: "Discovery Health",   revenue: 432000, cost: 0, commPct: 6, meta: { product: "Business Mobile Pro", contractMonths: 24 } },
      { title: "Shoprite – IoT POS Systems",              eventType: "IOT",      customer: "Shoprite Holdings",  revenue: 864000, cost: 0, commPct: 6, meta: { product: "IoT POS Connect", contractMonths: 36 } },
      { title: "Standard Bank – Unified Comms",           eventType: "BUSINESS", customer: "Standard Bank",      revenue: 576000, cost: 0, commPct: 6, meta: { product: "Unified Communications Suite", contractMonths: 24 } },
      { title: "Pick n Pay – Fibre Network Upgrade",      eventType: "FIBRE",    customer: "Pick n Pay",         revenue: 360000, cost: 0, commPct: 6, meta: { product: "Enterprise Fibre 10Gbps", contractMonths: 36 } },
      { title: "Capitec – Mobile Banking Lines",          eventType: "MOBILE",   customer: "Capitec Bank",       revenue: 216000, cost: 0, commPct: 6, meta: { product: "Corporate Mobile Data", contractMonths: 24 } },
      { title: "Woolworths – Business Internet",          eventType: "FIBRE",    customer: "Woolworths SA",      revenue: 192000, cost: 0, commPct: 6, meta: { product: "Business Fibre 500Mbps", contractMonths: 24 } },
      { title: "Old Mutual – Fibre Package",              eventType: "FIBRE",    customer: "Old Mutual",         revenue: 144000, cost: 0, commPct: 6, meta: { product: "Business Fibre 200Mbps", contractMonths: 36 } },
      { title: "Nedbank – VoIP Upgrade",                  eventType: "BUSINESS", customer: "Nedbank",            revenue: 480000, cost: 0, commPct: 6, meta: { product: "Cloud PBX & VoIP Suite", contractMonths: 24 } },
      { title: "MTN – Business Mobile Fleet",             eventType: "MOBILE",   customer: "MTN South Africa",   revenue: 720000, cost: 0, commPct: 6, meta: { product: "Enterprise Mobile 100-line", contractMonths: 36 } },
    ] as EventSeed[],
  },
  {
    id: "demo-cloudsuite",
    companyName: "CloudSuite Demo",
    industry: "SAAS",
    email: "cloudsuite",
    domain: "cloutsuitedemo.co.za",
    subscriptionPlan: "ENTERPRISE",
    commissionCutoffDay: 20,
    events: [
      { title: "Absa Bank – Enterprise Suite",         eventType: "NEW_BUSINESS", customer: "Absa Bank",          revenue: 960000,  cost: 0, commPct: 8, meta: { plan: "Enterprise", mrr: 80000 } },
      { title: "Discovery – CRM Platform",             eventType: "EXPANSION",    customer: "Discovery Health",   revenue: 480000,  cost: 0, commPct: 8, meta: { plan: "Growth",     mrr: 40000 } },
      { title: "Pick n Pay – Operations Hub",          eventType: "NEW_BUSINESS", customer: "Pick n Pay",         revenue: 360000,  cost: 0, commPct: 8, meta: { plan: "Business",   mrr: 30000 } },
      { title: "Standard Bank – Analytics Suite",      eventType: "NEW_BUSINESS", customer: "Standard Bank",      revenue: 720000,  cost: 0, commPct: 8, meta: { plan: "Enterprise", mrr: 60000 } },
      { title: "Shoprite – Inventory Manager",         eventType: "RENEWAL",      customer: "Shoprite Holdings",  revenue: 540000,  cost: 0, commPct: 8, meta: { plan: "Enterprise", mrr: 45000 } },
      { title: "Capitec – Customer Portal",            eventType: "NEW_BUSINESS", customer: "Capitec Bank",       revenue: 240000,  cost: 0, commPct: 8, meta: { plan: "Growth",     mrr: 20000 } },
      { title: "Woolworths – HR Platform",             eventType: "EXPANSION",    customer: "Woolworths SA",      revenue: 180000,  cost: 0, commPct: 8, meta: { plan: "Business",   mrr: 15000 } },
      { title: "Old Mutual – Risk Suite",              eventType: "NEW_BUSINESS", customer: "Old Mutual",         revenue: 600000,  cost: 0, commPct: 8, meta: { plan: "Enterprise", mrr: 50000 } },
      { title: "Nedbank – Compliance Tools",           eventType: "RENEWAL",      customer: "Nedbank",            revenue: 420000,  cost: 0, commPct: 8, meta: { plan: "Enterprise", mrr: 35000 } },
      { title: "MTN – Sales Intelligence",             eventType: "EXPANSION",    customer: "MTN South Africa",   revenue: 300000,  cost: 0, commPct: 8, meta: { plan: "Growth",     mrr: 25000 } },
    ] as EventSeed[],
  },
] as const;

// ─── Commission event status distribution ─────────────────────────────────────
// Indices 0-1  → DRAFT
// Indices 2-3  → PENDING_APPROVAL  (Finance step PENDING)
// Indices 4-5  → FINANCE_APPROVED  (Finance APPROVED, Executive PENDING)
// Indices 6-7  → EXECUTIVE_APPROVED (Finance+Exec APPROVED, SalesExec PENDING — wallet credited)
// Indices 8-9  → APPROVED          (all steps APPROVED — fully paid out)

function getApprovalStatus(idx: number): string {
  if (idx < 2)  return "DRAFT";
  if (idx < 4)  return "PENDING_APPROVAL";
  if (idx < 6)  return "FINANCE_APPROVED";
  if (idx < 8)  return "EXECUTIVE_APPROVED";
  return "APPROVED";
}

function calcCommission(ev: EventSeed): number {
  const base = ev.cost > 0 ? (ev.revenue - ev.cost) : ev.revenue;
  return Math.round(base * (ev.commPct / 100) * 100) / 100;
}

// ─── Main seeding function ────────────────────────────────────────────────────

async function seedTenant(cfg: typeof DEMO_TENANTS[number]) {
  const tid = cfg.id;
  console.log(`\n🏢 Seeding ${cfg.companyName}...`);

  // 1 ── Tenant ───────────────────────────────────────────────────────────────
  const existingTenant = await prisma.tenant.findUnique({ where: { id: tid } });
  if (existingTenant) {
    console.log(`  ⏭  Tenant already exists, skipping ${cfg.companyName}`);
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      id:                  tid,
      companyName:         cfg.companyName,
      industry:            cfg.industry,
      contactName:         `${cfg.email.charAt(0).toUpperCase() + cfg.email.slice(1)} Admin`,
      contactEmail:        `admin@${cfg.domain}`,
      contactPhone:        "+27 11 000 0100",
      status:              "ACTIVE",
      subscriptionPlan:    cfg.subscriptionPlan,
      commissionCutoffDay: cfg.commissionCutoffDay,
    },
  });

  // 2 ── Users ────────────────────────────────────────────────────────────────
  const users = {
    admin:    await prisma.user.create({ data: { id: `${tid}-admin`,    tenantId: tid, firstName: "Admin",    lastName: cfg.companyName.split(" ")[0], email: `admin@${cfg.domain}`,    passwordHash: hash(DEFAULT_PW), role: "ADMIN",           status: "ACTIVE" } }),
    manager:  await prisma.user.create({ data: { id: `${tid}-manager`,  tenantId: tid, firstName: "Mike",     lastName: "Manager",   email: `manager@${cfg.domain}`,  passwordHash: hash(DEFAULT_PW), role: "MANAGER",         status: "ACTIVE" } }),
    finance:  await prisma.user.create({ data: { id: `${tid}-finance`,  tenantId: tid, firstName: "Frances",  lastName: "Finance",   email: `finance@${cfg.domain}`,  passwordHash: hash(DEFAULT_PW), role: "FINANCE",         status: "ACTIVE" } }),
    executive:await prisma.user.create({ data: { id: `${tid}-exec`,     tenantId: tid, firstName: "Eddie",    lastName: "Executive", email: `exec@${cfg.domain}`,     passwordHash: hash(DEFAULT_PW), role: "EXECUTIVE",       status: "ACTIVE" } }),
    payroll:  await prisma.user.create({ data: { id: `${tid}-payroll`,  tenantId: tid, firstName: "Pat",      lastName: "Payroll",   email: `payroll@${cfg.domain}`,  passwordHash: hash(DEFAULT_PW), role: "PAYROLL",         status: "ACTIVE" } }),
    sales:    await prisma.user.create({ data: { id: `${tid}-sales`,    tenantId: tid, firstName: "Sam",      lastName: "Sales",     email: `sales@${cfg.domain}`,    passwordHash: hash(DEFAULT_PW), role: "SALES_EXECUTIVE", status: "ACTIVE" } }),
  };
  console.log("  ✅ Users created");

  // 3 ── Wallet ───────────────────────────────────────────────────────────────
  const wallet = await prisma.wallet.create({
    data: { tenantId: tid, userId: users.sales.id, availableBalance: 0, pendingBalance: 0, deferredBalance: 0, paidOutBalance: 0 },
  });

  // 4 ── ApprovalConfig (4 steps: Finance → Executive → SalesExec → Payroll) ─
  await prisma.approvalConfig.createMany({
    data: [
      { tenantId: tid, stepOrder: 1, stepName: "Finance Approval",           approverRole: "FINANCE",         approverUserId: users.finance.id,   isActive: true },
      { tenantId: tid, stepOrder: 2, stepName: "Executive Approval",         approverRole: "EXECUTIVE",       approverUserId: users.executive.id, isActive: true },
      { tenantId: tid, stepOrder: 3, stepName: "Confirm Payout Amount",      approverRole: "SALES_EXECUTIVE", approverUserId: null,               isActive: true },
      { tenantId: tid, stepOrder: 4, stepName: "Payroll Ready",              approverRole: "PAYROLL",         approverUserId: users.payroll.id,   isActive: true },
    ],
    skipDuplicates: true,
  });
  console.log("  ✅ Approval config created");

  // 5 ── Commission Events ────────────────────────────────────────────────────
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const createdEvents: Array<{ id: string; commission: number; status: string }> = [];

  for (let i = 0; i < cfg.events.length; i++) {
    const ev      = cfg.events[i];
    const status  = getApprovalStatus(i);
    const isDraft = status === "DRAFT";
    const commission = calcCommission(ev);
    const gp      = ev.cost > 0 ? ev.revenue - ev.cost : ev.revenue;
    const gpPct   = ev.revenue > 0 ? Math.round((gp / ev.revenue) * 10000) / 100 : 0;
    const submittedAt = isDraft ? null : daysAgo(28 - i * 2);

    const event = await prisma.commissionEvent.create({
      data: {
        tenantId:                  tid,
        salesExecutiveId:          users.sales.id,
        eventTitle:                ev.title,
        eventType:                 ev.eventType,
        eventDataJson:             { customerName: ev.customer, ...(ev.meta ?? {}) },
        revenueAmount:             ev.revenue,
        costAmount:                ev.cost,
        grossProfitAmount:         gp,
        commissionBaseAmount:      gp,
        commissionPercentage:      ev.commPct,
        calculatedCommissionAmount: commission,
        triggerStatus:             "NOT_TRIGGERED",
        approvalStatus:            status,
        walletStatus:              status === "APPROVED" ? "PAID" : status === "EXECUTIVE_APPROVED" ? "CREDITED" : "PENDING",
        submittedAt,
        approvedAt:                status === "APPROVED" ? daysAgo(5) : null,
        createdAt:                 daysAgo(30 - i * 2),
      },
    });
    createdEvents.push({ id: event.id, commission, status });
  }
  console.log("  ✅ Commission events created");

  // 6 ── CommissionEventApproval steps for submitted events ──────────────────
  const approvalDates = {
    finance:   daysAgo(20),
    executive: daysAgo(14),
    salesExec: daysAgo(10),
    payroll:   daysAgo(6),
  };

  for (let i = 0; i < createdEvents.length; i++) {
    const { id: eventId, status } = createdEvents[i];
    if (status === "DRAFT") continue;

    const financeStatus   = status === "PENDING_APPROVAL" ? "PENDING" : "APPROVED";
    const executiveStatus = status === "PENDING_APPROVAL" ? "WAITING"
                          : status === "FINANCE_APPROVED" ? "PENDING"
                          : "APPROVED";
    const salesExecStatus = ["PENDING_APPROVAL","FINANCE_APPROVED"].includes(status) ? "WAITING"
                          : status === "EXECUTIVE_APPROVED" ? "PENDING"
                          : "APPROVED";
    const payrollStatus   = status !== "APPROVED" ? "WAITING" : "APPROVED";

    await prisma.commissionEventApproval.createMany({
      data: [
        {
          tenantId:         tid,
          commissionEventId: eventId,
          approvalStep:     1,
          stepName:         "Finance Approval",
          approverRole:     "FINANCE",
          approverUserId:   financeStatus === "APPROVED" ? users.finance.id   : null,
          status:           financeStatus as any,
          approvedAt:       financeStatus === "APPROVED" ? approvalDates.finance   : null,
        },
        {
          tenantId:         tid,
          commissionEventId: eventId,
          approvalStep:     2,
          stepName:         "Executive Approval",
          approverRole:     "EXECUTIVE",
          approverUserId:   executiveStatus === "APPROVED" ? users.executive.id : null,
          status:           executiveStatus as any,
          approvedAt:       executiveStatus === "APPROVED" ? approvalDates.executive : null,
        },
        {
          tenantId:         tid,
          commissionEventId: eventId,
          approvalStep:     3,
          stepName:         "Confirm Payout Amount",
          approverRole:     "SALES_EXECUTIVE",
          approverUserId:   salesExecStatus === "PENDING" ? users.sales.id
                          : salesExecStatus === "APPROVED" ? users.sales.id : null,
          status:           salesExecStatus as any,
          payoutAmount:     salesExecStatus === "APPROVED" ? createdEvents[i].commission : null,
          approvedAt:       salesExecStatus === "APPROVED" ? approvalDates.salesExec : null,
        },
        {
          tenantId:         tid,
          commissionEventId: eventId,
          approvalStep:     4,
          stepName:         "Payroll Ready",
          approverRole:     "PAYROLL",
          approverUserId:   payrollStatus === "APPROVED" ? users.payroll.id  : null,
          status:           payrollStatus as any,
          approvedAt:       payrollStatus === "APPROVED" ? approvalDates.payroll   : null,
        },
      ],
    });
  }
  console.log("  ✅ Approval steps created");

  // 7 ── Wallet balances ─────────────────────────────────────────────────────
  let pending  = 0;
  let deferred = 0;
  let available = 0;
  let paidOut  = 0;

  for (const ev of createdEvents) {
    if (ev.status === "PENDING_APPROVAL")  pending   += ev.commission;
    if (ev.status === "FINANCE_APPROVED")  deferred  += ev.commission;
    if (ev.status === "EXECUTIVE_APPROVED") available += ev.commission;
    if (ev.status === "APPROVED")           paidOut   += ev.commission;
  }

  await prisma.wallet.update({
    where: { id: wallet.id },
    data:  { pendingBalance: pending, deferredBalance: deferred, availableBalance: available, paidOutBalance: paidOut },
  });

  // 8 ── Wallet transactions ─────────────────────────────────────────────────
  const txns: any[] = [];

  for (const ev of createdEvents) {
    if (ev.status === "PENDING_APPROVAL") {
      txns.push({ tenantId: tid, walletId: wallet.id, transactionType: "PENDING_COMMISSION_ADDED", amount: ev.commission, referenceType: "COMMISSION_EVENT", referenceId: ev.id, description: "Commission pending approval", createdAt: daysAgo(22) });
    }
    if (ev.status === "EXECUTIVE_APPROVED") {
      txns.push({ tenantId: tid, walletId: wallet.id, transactionType: "COMMISSION_APPROVED", amount: ev.commission, referenceType: "COMMISSION_EVENT", referenceId: ev.id, description: "Commission credited to wallet", createdAt: daysAgo(12) });
    }
    if (ev.status === "APPROVED") {
      txns.push({ tenantId: tid, walletId: wallet.id, transactionType: "COMMISSION_APPROVED", amount: ev.commission, referenceType: "COMMISSION_EVENT", referenceId: ev.id, description: "Commission approved", createdAt: daysAgo(10) });
      txns.push({ tenantId: tid, walletId: wallet.id, transactionType: "PAYOUT_PAID",         amount: ev.commission, referenceType: "PAYOUT",           referenceId: ev.id, description: "Payout processed by Payroll",   createdAt: daysAgo(4)  });
    }
  }

  if (txns.length > 0) {
    await prisma.walletTransaction.createMany({ data: txns });
  }
  console.log("  ✅ Wallet balances and transactions set");

  // 9 ── Payout requests ─────────────────────────────────────────────────────
  // One PENDING request from EXECUTIVE_APPROVED events (sales exec confirmed)
  // One PAID request from APPROVED events
  const execApprovedEvents = createdEvents.filter(e => e.status === "EXECUTIVE_APPROVED");
  const approvedEvents      = createdEvents.filter(e => e.status === "APPROVED");

  if (execApprovedEvents.length > 0) {
    const amt = execApprovedEvents.reduce((s, e) => s + e.commission, 0);
    const tax = Math.round(amt * 0.25 * 100) / 100;
    const net = amt - tax;
    const mo  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await prisma.payoutRequest.create({
      data: { tenantId: tid, userId: users.sales.id, requestedAmount: amt, estimatedTax: tax, estimatedNetPayout: net, payoutMonth: mo, status: "PENDING", requestedAt: daysAgo(8) },
    });
  }

  if (approvedEvents.length > 0) {
    const amt = approvedEvents.reduce((s, e) => s + e.commission, 0);
    const tax = Math.round(amt * 0.25 * 100) / 100;
    const net = amt - tax;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mo   = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    await prisma.payoutRequest.create({
      data: {
        tenantId: tid, userId: users.sales.id,
        requestedAmount: amt, estimatedTax: tax, estimatedNetPayout: net,
        payoutMonth: mo, status: "PAID",
        requestedAt: daysAgo(35), approvedAt: daysAgo(20), paidAt: daysAgo(5),
      },
    });
  }
  console.log("  ✅ Payout requests created");

  // 10 ── Welcome notification ────────────────────────────────────────────────
  await prisma.notification.create({
    data: {
      tenantId:   tid,
      userId:     users.admin.id,
      title:      `Welcome to Incentiq — ${cfg.companyName}`,
      message:    `Your ${cfg.industry.replace(/_/g, " ")} demo account is set up with 10 sample commission events, an approval workflow, and wallet data. Explore the platform!`,
      type:       "SYSTEM",
      readStatus: false,
    },
  });

  console.log(`  🎉 ${cfg.companyName} fully seeded`);
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding 8 industry demo tenants...\n");
  for (const cfg of DEMO_TENANTS) {
    await seedTenant(cfg);
  }
  console.log("\n✅ All demo tenants seeded successfully!");
  console.log("\n📋 Login credentials (all use Password123!):");
  for (const cfg of DEMO_TENANTS) {
    console.log(`   ${cfg.companyName.padEnd(35)} admin@${cfg.domain}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

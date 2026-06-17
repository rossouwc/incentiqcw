// ─────────────────────────────────────────────────────────────────────────────
// Commission Formula Engine
// Pure TypeScript – no external dependencies, safe for browser & Node.
// ─────────────────────────────────────────────────────────────────────────────

export type CalculationType =
  | "GP_PERCENTAGE"
  | "REVENUE_PERCENTAGE"
  | "FIXED_AMOUNT"
  | "PLACEMENT_FEE_PERCENTAGE"
  | "ANNUAL_PREMIUM_PERCENTAGE"
  | "MONTHLY_PREMIUM_PERCENTAGE"
  | "VEHICLE_GP_PLUS_PRODUCTS"
  | "PROPERTY_AGENCY_SPLIT"
  | "RENTAL_PLACEMENT_FEE"
  | "CONTRACT_VALUE_PERCENTAGE"
  | "ARR_PERCENTAGE"
  | "CUSTOM";

export interface CalcLineItem {
  label: string;
  value: number;
  isCurrency?: boolean;
  isPct?: boolean;
  isResult?: boolean;
  isIntermediate?: boolean;
}

export interface CalcResult {
  calculationType: CalculationType;
  lineItems: CalcLineItem[];
  revenueAmount: number;
  costAmount: number;
  grossProfitAmount: number;
  commissionBaseAmount: number;
  commissionPercentage: number;
  calculatedCommissionAmount: number;
}

// ── Industry → default calculation type ──────────────────────────────────────

const INDUSTRY_CALC_TYPE: Record<string, CalculationType> = {
  IT_CONSULTING:      "GP_PERCENTAGE",
  RECRUITMENT:        "PLACEMENT_FEE_PERCENTAGE",
  INSURANCE:          "ANNUAL_PREMIUM_PERCENTAGE",
  VEHICLE_DEALERSHIP: "VEHICLE_GP_PLUS_PRODUCTS",
  PROPERTY_SALES:     "PROPERTY_AGENCY_SPLIT",
  RENTAL_MANAGEMENT:  "RENTAL_PLACEMENT_FEE",
  TELECOM:            "CONTRACT_VALUE_PERCENTAGE",
  SAAS:               "ARR_PERCENTAGE",
  CUSTOM:             "CUSTOM",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(data: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = data[k];
    if (v === undefined || v === null || v === "") continue;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
    if (!isNaN(n) && n !== 0) return n;
  }
  return 0;
}

function str(data: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = data[k];
    if (v !== undefined && v !== null && v !== "") return String(v).trim();
  }
  return "";
}

function r2(x: number): number { return Math.round(x * 100) / 100; }

function cur(label: string, value: number, opts?: Partial<CalcLineItem>): CalcLineItem {
  return { label, value: r2(value), isCurrency: true, ...opts };
}
function pct(label: string, value: number, opts?: Partial<CalcLineItem>): CalcLineItem {
  return { label, value: r2(value), isPct: true, ...opts };
}
function result(label: string, value: number): CalcLineItem {
  return { label, value: r2(value), isCurrency: true, isResult: true };
}
function intermediate(label: string, value: number): CalcLineItem {
  return { label, value: r2(value), isCurrency: true, isIntermediate: true };
}

// ── Formula implementations ───────────────────────────────────────────────────

function calcGpPercentage(data: Record<string, unknown>, commPct: number): CalcResult {
  const revenue  = num(data, "revenue", "salePrice", "contractValue");
  const cost     = num(data, "costOfSale", "cost", "costPrice");
  const gp       = r2(revenue - cost);
  const commBase = gp > 0 ? gp : revenue;
  const commission = r2(commBase * commPct / 100);

  return {
    calculationType: "GP_PERCENTAGE",
    lineItems: [
      cur("Revenue",          revenue),
      cur("Cost of Sale",     cost),
      intermediate("Gross Profit",  gp),
      pct("Commission Rate", commPct),
      result("Your Commission", commission),
    ],
    revenueAmount:             revenue,
    costAmount:                cost,
    grossProfitAmount:         gp,
    commissionBaseAmount:      commBase,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcRevenuePercentage(data: Record<string, unknown>, commPct: number): CalcResult {
  const revenue    = num(data, "revenue", "salePrice");
  const commission = r2(revenue * commPct / 100);

  return {
    calculationType: "REVENUE_PERCENTAGE",
    lineItems: [
      cur("Revenue",          revenue),
      pct("Commission Rate", commPct),
      result("Your Commission", commission),
    ],
    revenueAmount:             revenue,
    costAmount:                0,
    grossProfitAmount:         revenue,
    commissionBaseAmount:      revenue,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcFixedAmount(data: Record<string, unknown>, commPct: number): CalcResult {
  const commBase   = num(data, "commissionBaseAmount", "fixedAmount", "revenue");
  const commission = r2(commBase);

  return {
    calculationType: "FIXED_AMOUNT",
    lineItems: [
      cur("Fixed Commission Amount", commBase, { isResult: true }),
    ],
    revenueAmount:             commBase,
    costAmount:                0,
    grossProfitAmount:         commBase,
    commissionBaseAmount:      commBase,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcPlacementFeePercentage(data: Record<string, unknown>, commPct: number): CalcResult {
  const placementType    = str(data, "placementType");
  const isContract       = placementType.toLowerCase() === "contract";

  if (isContract) {
    // Contract: monthly GP
    const billRate = num(data, "monthlyBillRate");
    const cost     = num(data, "monthlyCost");
    const monthlyGP = r2(billRate - cost);
    const commBase  = monthlyGP > 0 ? monthlyGP : billRate;
    const commission = r2(commBase * commPct / 100);

    return {
      calculationType: "PLACEMENT_FEE_PERCENTAGE",
      lineItems: [
        cur("Monthly Bill Rate",      billRate),
        cur("Monthly Cost",           cost),
        intermediate("Monthly Gross Profit",  monthlyGP),
        pct("Commission Rate",        commPct),
        result("Your Commission",     commission),
      ],
      revenueAmount:             billRate,
      costAmount:                cost,
      grossProfitAmount:         monthlyGP,
      commissionBaseAmount:      commBase,
      commissionPercentage:      commPct,
      calculatedCommissionAmount: commission,
    };
  }

  // Permanent: annual salary → placement fee → commission
  const annualSalary         = num(data, "annualSalary");
  const placementFeePct      = num(data, "placementFeePercentage") || 8.33;
  const placementFee         = r2(annualSalary * placementFeePct / 100);
  const effectiveFee         = num(data, "placementFee") || placementFee;
  const commission           = r2(effectiveFee * commPct / 100);

  return {
    calculationType: "PLACEMENT_FEE_PERCENTAGE",
    lineItems: [
      cur("Annual Salary",            annualSalary),
      pct("Placement Fee %",          placementFeePct),
      intermediate("Placement Fee",   effectiveFee),
      pct("Commission Rate",          commPct),
      result("Your Commission",       commission),
    ],
    revenueAmount:             annualSalary,
    costAmount:                0,
    grossProfitAmount:         effectiveFee,
    commissionBaseAmount:      effectiveFee,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcAnnualPremiumPercentage(data: Record<string, unknown>, commPct: number): CalcResult {
  const monthly       = num(data, "monthlyPremium");
  const annual        = r2(monthly * 12);
  const commission    = r2(annual * commPct / 100);

  return {
    calculationType: "ANNUAL_PREMIUM_PERCENTAGE",
    lineItems: [
      cur("Monthly Premium",    monthly),
      intermediate("Annual Premium",   annual),
      pct("Commission Rate",    commPct),
      result("Your Commission", commission),
    ],
    revenueAmount:             annual,
    costAmount:                0,
    grossProfitAmount:         annual,
    commissionBaseAmount:      annual,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcMonthlyPremiumPercentage(data: Record<string, unknown>, commPct: number): CalcResult {
  const monthly    = num(data, "monthlyPremium");
  const commission = r2(monthly * commPct / 100);

  return {
    calculationType: "MONTHLY_PREMIUM_PERCENTAGE",
    lineItems: [
      cur("Monthly Premium",    monthly),
      pct("Commission Rate",    commPct),
      result("Your Commission", commission),
    ],
    revenueAmount:             monthly,
    costAmount:                0,
    grossProfitAmount:         monthly,
    commissionBaseAmount:      monthly,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcVehicleGpPlusProducts(data: Record<string, unknown>, commPct: number): CalcResult {
  const salePrice    = num(data, "salePrice", "revenue");
  const costPrice    = num(data, "costPrice", "cost");
  const vehicleGP    = r2(salePrice - costPrice);
  const vehicleComm  = r2(vehicleGP * commPct / 100);
  const financeComm  = num(data, "financeCommissionAmount");
  const totalComm    = r2(vehicleComm + financeComm);

  const items: CalcLineItem[] = [
    cur("Sale Price",          salePrice),
    cur("Cost Price",          costPrice),
    intermediate("Vehicle Gross Profit",  vehicleGP),
    pct("Commission Rate",     commPct),
    cur("Vehicle Commission",  vehicleComm, { isIntermediate: financeComm > 0 }),
  ];

  if (financeComm > 0) {
    items.push(cur("Finance Commission", financeComm, { isIntermediate: true }));
    items.push(result("Total Commission", totalComm));
  } else {
    items[items.length - 1] = result("Your Commission", vehicleComm);
  }

  return {
    calculationType: "VEHICLE_GP_PLUS_PRODUCTS",
    lineItems: items,
    revenueAmount:             salePrice,
    costAmount:                costPrice,
    grossProfitAmount:         vehicleGP,
    commissionBaseAmount:      vehicleGP,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: totalComm,
  };
}

function calcPropertyAgencySplit(data: Record<string, unknown>, commPct: number): CalcResult {
  const salePrice         = num(data, "salePrice", "revenue");
  const agencyCommPct     = num(data, "agencyCommissionPercentage") || commPct;
  const agencyCommAmount  = r2(salePrice * agencyCommPct / 100);
  const agentSplitPct     = num(data, "agentSplitPercentage") || 50;
  const commission        = r2(agencyCommAmount * agentSplitPct / 100);

  return {
    calculationType: "PROPERTY_AGENCY_SPLIT",
    lineItems: [
      cur("Sale Price",                    salePrice),
      pct("Agency Commission %",           agencyCommPct),
      intermediate("Agency Commission",    agencyCommAmount),
      pct("Agent Split %",                 agentSplitPct),
      result("Your Commission",            commission),
    ],
    revenueAmount:             salePrice,
    costAmount:                0,
    grossProfitAmount:         agencyCommAmount,
    commissionBaseAmount:      agencyCommAmount,
    commissionPercentage:      agentSplitPct,
    calculatedCommissionAmount: commission,
  };
}

function calcRentalPlacementFee(data: Record<string, unknown>, commPct: number): CalcResult {
  const monthly         = num(data, "monthlyRental", "revenue");
  const feeType         = str(data, "placementFeeType");
  const managementPct   = num(data, "managementFeePercentage") || commPct;

  let commBase   = monthly;
  let commission = monthly;
  const items: CalcLineItem[] = [cur("Monthly Rental", monthly)];

  if (feeType.toLowerCase().includes("percentage") || feeType.toLowerCase().includes("annual")) {
    const annual = r2(monthly * 12);
    commBase     = r2(annual * managementPct / 100);
    commission   = commBase;
    items.push(intermediate("Annual Rental", annual));
    items.push(pct("Placement Fee %", managementPct));
    items.push(result("Placement Fee", commission));
  } else if (feeType.toLowerCase().includes("fixed")) {
    const fixed = num(data, "fixedFeeAmount") || monthly;
    commBase  = fixed;
    commission = fixed;
    items.push(result("Fixed Placement Fee", commission));
  } else {
    // Default: one month rental
    items.push(result("Placement Fee (1 Month)", commission));
  }

  return {
    calculationType: "RENTAL_PLACEMENT_FEE",
    lineItems: items,
    revenueAmount:             monthly,
    costAmount:                0,
    grossProfitAmount:         commBase,
    commissionBaseAmount:      commBase,
    commissionPercentage:      managementPct,
    calculatedCommissionAmount: commission,
  };
}

function calcContractValuePercentage(data: Record<string, unknown>, commPct: number): CalcResult {
  const monthly   = num(data, "monthlyContractValue", "revenue");
  const months    = num(data, "contractTermMonths") || 24;
  const tcv       = r2(monthly * months);
  const commission = r2(tcv * commPct / 100);

  return {
    calculationType: "CONTRACT_VALUE_PERCENTAGE",
    lineItems: [
      cur("Monthly Contract Value",  monthly),
      { label: "Contract Term",      value: months, isIntermediate: true },
      intermediate("Total Contract Value",  tcv),
      pct("Commission Rate",         commPct),
      result("Your Commission",      commission),
    ],
    revenueAmount:             monthly,
    costAmount:                0,
    grossProfitAmount:         tcv,
    commissionBaseAmount:      tcv,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcArrPercentage(data: Record<string, unknown>, commPct: number): CalcResult {
  const mrr     = num(data, "monthlyRecurringRevenue", "revenue");
  const months  = num(data, "contractTermMonths") || 12;
  const arr     = r2(mrr * 12);
  const tcv     = r2(mrr * months);
  const commission = r2(arr * commPct / 100);

  return {
    calculationType: "ARR_PERCENTAGE",
    lineItems: [
      cur("Monthly Recurring Revenue",   mrr),
      intermediate("Annual Recurring Revenue (ARR)",  arr),
      intermediate("Total Contract Value",             tcv),
      pct("Commission Rate",             commPct),
      result("Your Commission",          commission),
    ],
    revenueAmount:             mrr,
    costAmount:                0,
    grossProfitAmount:         arr,
    commissionBaseAmount:      arr,
    commissionPercentage:      commPct,
    calculatedCommissionAmount: commission,
  };
}

function calcCustom(data: Record<string, unknown>, commPct: number): CalcResult {
  const customPct  = num(data, "commissionPercentage") || commPct;
  const commBase   = num(data, "commissionBaseAmount", "revenue");
  const commission = r2(commBase * customPct / 100);

  return {
    calculationType: "CUSTOM",
    lineItems: [
      cur("Commission Base",  commBase),
      pct("Commission %",     customPct),
      result("Your Commission", commission),
    ],
    revenueAmount:             commBase,
    costAmount:                0,
    grossProfitAmount:         commBase,
    commissionBaseAmount:      commBase,
    commissionPercentage:      customPct,
    calculatedCommissionAmount: commission,
  };
}

// ── Insurance dispatcher (based on commissionType field) ──────────────────────

function calcInsurance(data: Record<string, unknown>, commPct: number): CalcResult {
  const commType = str(data, "commissionType").toLowerCase();
  if (commType === "ongoing") return calcMonthlyPremiumPercentage(data, commPct);
  if (commType === "hybrid") {
    // Hybrid: upfront portion (annual) + note about ongoing
    return calcAnnualPremiumPercentage(data, commPct);
  }
  return calcAnnualPremiumPercentage(data, commPct); // default Upfront
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function calculateCommission(
  industryCode: string,
  formData: Record<string, unknown>,
  commissionPercentage: number,
  calcTypeOverride?: CalculationType,
): CalcResult {
  const calcType = calcTypeOverride ?? INDUSTRY_CALC_TYPE[industryCode] ?? "CUSTOM";
  const commPct  = commissionPercentage || 10;

  switch (calcType) {
    case "GP_PERCENTAGE":            return calcGpPercentage(formData, commPct);
    case "REVENUE_PERCENTAGE":       return calcRevenuePercentage(formData, commPct);
    case "FIXED_AMOUNT":             return calcFixedAmount(formData, commPct);
    case "PLACEMENT_FEE_PERCENTAGE": return calcPlacementFeePercentage(formData, commPct);
    case "ANNUAL_PREMIUM_PERCENTAGE":
    case "MONTHLY_PREMIUM_PERCENTAGE":
      // Insurance dispatches based on commissionType in formData
      return calcInsurance(formData, commPct);
    case "VEHICLE_GP_PLUS_PRODUCTS": return calcVehicleGpPlusProducts(formData, commPct);
    case "PROPERTY_AGENCY_SPLIT":    return calcPropertyAgencySplit(formData, commPct);
    case "RENTAL_PLACEMENT_FEE":     return calcRentalPlacementFee(formData, commPct);
    case "CONTRACT_VALUE_PERCENTAGE":return calcContractValuePercentage(formData, commPct);
    case "ARR_PERCENTAGE":           return calcArrPercentage(formData, commPct);
    case "CUSTOM":
    default:                         return calcCustom(formData, commPct);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clawback Engine — unit tests (vitest)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { calculateClawback } from "./clawback-engine";
import type { ClawbackCalculationInput, ClawbackPolicyInput } from "./clawback-engine";

// ── Helpers ───────────────────────────────────────────────────────────────────

function d(dateStr: string): Date { return new Date(dateStr); }

function baseInput(overrides: Partial<ClawbackCalculationInput> = {}): ClawbackCalculationInput {
  return {
    paidCommissionAmount:     10_000,
    originalCommissionAmount: 10_000,
    contractStartDate:        d("2024-01-01"),
    contractEndDate:          d("2024-12-31"),   // 365-day term
    actualEndDate:            d("2024-04-01"),   // 91 days active
    policy: { clawbackMethod: "FULL" },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NONE
// ─────────────────────────────────────────────────────────────────────────────

describe("NONE method", () => {
  it("produces zero recoverable amount", () => {
    const r = calculateClawback(baseInput({ policy: { clawbackMethod: "NONE" } }));
    expect(r.recoverableAmount).toBe(0);
    expect(r.earnedCommissionAmount).toBe(10_000);
    expect(r.outstandingRecoveryAmount).toBe(0);
    expect(r.isValid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FULL
// ─────────────────────────────────────────────────────────────────────────────

describe("FULL method", () => {
  it("recovers the entire paid amount", () => {
    const r = calculateClawback(baseInput());
    expect(r.recoverableAmount).toBe(10_000);
    expect(r.earnedCommissionAmount).toBe(0);
    expect(r.outstandingRecoveryAmount).toBe(10_000);
  });

  it("deducts already-recovered amount from outstanding", () => {
    const r = calculateClawback(baseInput({ recoveredAmount: 3_000 }));
    expect(r.recoverableAmount).toBe(10_000);
    expect(r.recoveredAmount).toBe(3_000);
    expect(r.outstandingRecoveryAmount).toBe(7_000);
  });

  it("outstanding cannot go below 0", () => {
    const r = calculateClawback(baseInput({ recoveredAmount: 12_000 }));
    expect(r.outstandingRecoveryAmount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PRO_RATA_BY_TERM
// ─────────────────────────────────────────────────────────────────────────────

describe("PRO_RATA_BY_TERM method", () => {
  const policy: ClawbackPolicyInput = { clawbackMethod: "PRO_RATA_BY_TERM" };

  it("calculates earned ratio correctly (91/365-day term)", () => {
    // contractStart 2024-01-01, contractEnd 2024-12-31, actualEnd 2024-04-01
    // 91 days active / 365 days term  ≈ 24.93%
    const r = calculateClawback(baseInput({ policy }));
    expect(r.originalTermDays).toBe(365);
    expect(r.actualActiveDays).toBe(91);
    expect(r.earnedRatio).toBeCloseTo(91 / 365, 4);
    expect(r.earnedCommissionAmount).toBeCloseTo(10_000 * (91 / 365), 0);
    expect(r.recoverableAmount).toBeCloseTo(10_000 - 10_000 * (91 / 365), 0);
  });

  it("caps denominator at clawbackWindowDays when shorter than term (Telecom 180-day cap)", () => {
    // 6-month telecom contract (182 days), agent leaves on day 45
    const input = baseInput({
      policy: { clawbackMethod: "PRO_RATA_BY_TERM", clawbackWindowDays: 180 },
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-06-29"), // 180 days
      actualEndDate:     d("2024-02-15"), // 45 days active
    });
    const r = calculateClawback(input);
    expect(r.earnedRatio).toBeCloseTo(45 / 180, 4);
    expect(r.recoverableAmount).toBeCloseTo(10_000 * (1 - 45 / 180), 0);
  });

  it("caps denominator when 2-year term but clawbackWindowDays = 365", () => {
    const input = baseInput({
      policy: { clawbackMethod: "PRO_RATA_BY_TERM", clawbackWindowDays: 365 },
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2025-12-31"), // 730-day term
      actualEndDate:     d("2024-07-01"), // 182 days active
    });
    const r = calculateClawback(input);
    // denominator = min(730, 365) = 365
    expect(r.earnedRatio).toBeCloseTo(182 / 365, 4);
    expect(r.recoverableAmount).toBeCloseTo(10_000 * (1 - 182 / 365), 1);
  });

  it("returns zero recoverable when event is within noClawbackAfterDays threshold", () => {
    // If agent/contractor was active for 100 days and noClawbackAfterDays = 90, no clawback
    const input = baseInput({
      policy: { clawbackMethod: "PRO_RATA_BY_TERM", noClawbackAfterDays: 90 },
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-12-31"),
      actualEndDate:     d("2024-04-12"), // 102 days active
    });
    const r = calculateClawback(input);
    expect(r.cappedByNoClawbackWindow).toBe(true);
    expect(r.recoverableAmount).toBe(0);
  });

  it("calculates correctly when actualEndDate equals contractEndDate (full term served)", () => {
    const input = baseInput({
      policy,
      actualEndDate: d("2024-12-31"),
    });
    const r = calculateClawback(input);
    expect(r.earnedRatio).toBe(1);
    expect(r.recoverableAmount).toBe(0);
    expect(r.earnedCommissionAmount).toBe(10_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SLIDING_SCALE
// ─────────────────────────────────────────────────────────────────────────────

describe("SLIDING_SCALE method", () => {
  const slidingPolicy: ClawbackPolicyInput = {
    clawbackMethod: "SLIDING_SCALE",
    noClawbackAfterDays: 90,
    recoveryMethodPriorityJson: {
      method: "SLIDING_SCALE",
      brackets: [
        { fromDay: 0,  toDay: 30,  percentage: 100 },
        { fromDay: 31, toDay: 60,  percentage: 50  },
        { fromDay: 61, toDay: 90,  percentage: 25  },
        { fromDay: 91, toDay: null, percentage: 0  },
      ],
    },
  };

  it("returns 100% clawback for candidate leaving on day 15", () => {
    const input = baseInput({
      policy: slidingPolicy,
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-09-01"),
      actualEndDate:     d("2024-01-16"), // 15 days
    });
    const r = calculateClawback(input);
    expect(r.slidingScalePercent).toBe(100);
    expect(r.recoverableAmount).toBe(10_000);
    expect(r.earnedCommissionAmount).toBe(0);
  });

  it("returns 50% clawback for candidate leaving on day 45", () => {
    const input = baseInput({
      policy: slidingPolicy,
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-09-01"),
      actualEndDate:     d("2024-02-15"), // 45 days
    });
    const r = calculateClawback(input);
    expect(r.slidingScalePercent).toBe(50);
    expect(r.recoverableAmount).toBe(5_000);
  });

  it("returns 25% clawback for candidate leaving on day 70", () => {
    const input = baseInput({
      policy: slidingPolicy,
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-09-01"),
      actualEndDate:     d("2024-03-12"), // 71 days
    });
    const r = calculateClawback(input);
    expect(r.slidingScalePercent).toBe(25);
    expect(r.recoverableAmount).toBe(2_500);
  });

  it("returns 0% clawback when active > noClawbackAfterDays (91+ days)", () => {
    const input = baseInput({
      policy: slidingPolicy,
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-09-01"),
      actualEndDate:     d("2024-04-02"), // 92 days
    });
    const r = calculateClawback(input);
    expect(r.cappedByNoClawbackWindow).toBe(true);
    expect(r.recoverableAmount).toBe(0);
  });

  it("returns validation error when no brackets in policy", () => {
    const input = baseInput({
      policy: { clawbackMethod: "SLIDING_SCALE" },
    });
    const r = calculateClawback(input);
    expect(r.isValid).toBe(false);
    expect(r.validationErrors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPONENT_BASED
// ─────────────────────────────────────────────────────────────────────────────

describe("COMPONENT_BASED method", () => {
  const componentPolicy: ClawbackPolicyInput = { clawbackMethod: "COMPONENT_BASED" };

  it("calculates pro-rata per eligible component and skips ineligible ones", () => {
    const input = baseInput({
      policy: componentPolicy,
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-12-31"), // 365 days
      actualEndDate:     d("2024-04-01"), // 91 days
      commissionComponents: [
        { key: "vehicle_gp",          label: "Vehicle GP",           paidAmount: 5_000, clawbackEligible: true  },
        { key: "finance_commission",  label: "Finance Commission",   paidAmount: 3_000, clawbackEligible: true  },
        { key: "service_plan",        label: "Service Plan",         paidAmount: 2_000, clawbackEligible: false },
      ],
    });
    const r = calculateClawback(input);
    expect(r.componentBreakdown).toHaveLength(3);

    const gp       = r.componentBreakdown!.find(c => c.key === "vehicle_gp")!;
    const finance  = r.componentBreakdown!.find(c => c.key === "finance_commission")!;
    const service  = r.componentBreakdown!.find(c => c.key === "service_plan")!;

    // vehicle_gp: 5000 * (91/365) earned, recoverable = 5000 - earned
    expect(gp.earnedRatio).toBeCloseTo(91 / 365, 4);
    expect(gp.recoverableAmount).toBeCloseTo(5_000 * (1 - 91 / 365), 0);

    // finance_commission: similar
    expect(finance.recoverableAmount).toBeCloseTo(3_000 * (1 - 91 / 365), 0);

    // service_plan: not eligible → 0 recoverable
    expect(service.recoverableAmount).toBe(0);
    expect(service.earnedAmount).toBe(2_000);

    // Total recoverable = gp.recoverable + finance.recoverable + 0
    expect(r.recoverableAmount).toBeCloseTo(
      gp.recoverableAmount + finance.recoverableAmount, 0,
    );
  });

  it("validates that components are required", () => {
    const input = baseInput({ policy: componentPolicy });
    const r = calculateClawback(input);
    expect(r.isValid).toBe(false);
    expect(r.validationErrors.some(e => /commissionComponents/i.test(e))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. FIXED_AMOUNT
// ─────────────────────────────────────────────────────────────────────────────

describe("FIXED_AMOUNT method", () => {
  it("recovers exactly the fixed amount", () => {
    const r = calculateClawback(baseInput({
      policy: { clawbackMethod: "FIXED_AMOUNT" },
      fixedAmount: 2_500,
    }));
    expect(r.recoverableAmount).toBe(2_500);
    expect(r.earnedCommissionAmount).toBe(7_500);
  });

  it("caps fixed amount at paid commission", () => {
    const r = calculateClawback(baseInput({
      policy: { clawbackMethod: "FIXED_AMOUNT" },
      fixedAmount: 15_000,
    }));
    expect(r.recoverableAmount).toBe(10_000);
    expect(r.warnings.some(w => /capped/i.test(w))).toBe(true);
  });

  it("validation error when fixedAmount missing", () => {
    const r = calculateClawback(baseInput({ policy: { clawbackMethod: "FIXED_AMOUNT" } }));
    expect(r.isValid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MANUAL
// ─────────────────────────────────────────────────────────────────────────────

describe("MANUAL method", () => {
  it("recovers exactly the entered amount with reason in notes", () => {
    const r = calculateClawback(baseInput({
      policy: { clawbackMethod: "MANUAL" },
      manualAmount: 4_200,
      manualReason: "Invoice reversal agreed with client",
    }));
    expect(r.recoverableAmount).toBe(4_200);
    expect(r.notes.some(n => n.includes("Invoice reversal agreed with client"))).toBe(true);
  });

  it("caps manual amount at paid commission", () => {
    const r = calculateClawback(baseInput({
      policy: { clawbackMethod: "MANUAL" },
      manualAmount: 99_000,
    }));
    expect(r.recoverableAmount).toBe(10_000);
  });

  it("validation error when manualAmount missing", () => {
    const r = calculateClawback(baseInput({ policy: { clawbackMethod: "MANUAL" } }));
    expect(r.isValid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Date/term calculations
// ─────────────────────────────────────────────────────────────────────────────

describe("Date & term calculations", () => {
  it("counts originalTermDays correctly for a 1-year contract", () => {
    const r = calculateClawback(baseInput());
    expect(r.originalTermDays).toBe(365);
  });

  it("counts actualActiveDays correctly", () => {
    const r = calculateClawback(baseInput({
      contractStartDate: d("2024-01-01"),
      actualEndDate:     d("2024-03-01"), // 60 days
    }));
    expect(r.actualActiveDays).toBe(60);
  });

  it("remainingDays = originalTermDays - actualActiveDays (clamped to 0)", () => {
    const r = calculateClawback(baseInput({
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-12-31"),
      actualEndDate:     d("2024-04-01"), // 91 active
    }));
    expect(r.remainingDays).toBe(365 - 91);
  });

  it("remainingDays is 0 when actualEndDate equals or exceeds contractEndDate", () => {
    const r = calculateClawback(baseInput({
      contractStartDate: d("2024-01-01"),
      contractEndDate:   d("2024-06-30"),
      actualEndDate:     d("2024-12-31"),
    }));
    expect(r.remainingDays).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("Validation", () => {
  it("errors on negative paidCommissionAmount", () => {
    const r = calculateClawback(baseInput({ paidCommissionAmount: -100 }));
    expect(r.isValid).toBe(false);
  });

  it("errors when actualEndDate is before contractStartDate", () => {
    const r = calculateClawback(baseInput({
      contractStartDate: d("2024-06-01"),
      actualEndDate:     d("2024-01-01"),
    }));
    expect(r.isValid).toBe(false);
  });

  it("is valid for a minimal correct FULL input", () => {
    const r = calculateClawback(baseInput());
    expect(r.isValid).toBe(true);
    expect(r.validationErrors).toHaveLength(0);
  });
});

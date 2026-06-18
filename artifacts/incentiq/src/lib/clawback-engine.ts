// ─────────────────────────────────────────────────────────────────────────────
// Clawback Calculation Engine
// Pure TypeScript – no external dependencies, safe for browser & Node.
// ─────────────────────────────────────────────────────────────────────────────

export type ClawbackMethod =
  | "NONE"
  | "FULL"
  | "PRO_RATA_BY_TERM"
  | "SLIDING_SCALE"
  | "COMPONENT_BASED"
  | "FIXED_AMOUNT"
  | "MANUAL";

// ─── Input types ─────────────────────────────────────────────────────────────

export interface SlidingScaleBracket {
  fromDay: number;
  toDay: number | null;
  percentage: number; // clawback percentage of paid amount (e.g. 100 = full clawback)
}

export interface SlidingScaleConfig {
  method: "SLIDING_SCALE";
  brackets: SlidingScaleBracket[];
  recoveryPriority?: string[];
}

export interface CommissionComponentInput {
  key: string;
  label: string;
  paidAmount: number;
  clawbackEligible: boolean;
  /** Optional per-component earned days override (uses global active days if omitted) */
  activeDays?: number;
  /** Optional per-component term days override (uses global term days if omitted) */
  termDays?: number;
}

export interface ClawbackPolicyInput {
  clawbackMethod: ClawbackMethod;
  /** Days from event start after which no clawback is possible */
  noClawbackAfterDays?: number | null;
  /**
   * For PRO_RATA_BY_TERM: the denominator cap (e.g. Telecom = 180 days, not full 24-month term).
   * If null, the full originalTermDays is used.
   * For SLIDING_SCALE: the outer limit of the scale.
   */
  clawbackWindowDays?: number | null;
  /** Raw JSON from ClawbackPolicy.recoveryMethodPriorityJson */
  recoveryMethodPriorityJson?: unknown;
  allowPartialRecovery?: boolean;
}

export interface ClawbackCalculationInput {
  commissionEventId?: string;
  cancellationReason?: string;

  policy: ClawbackPolicyInput;

  originalCommissionAmount: number;
  paidCommissionAmount: number;

  contractStartDate: Date;
  contractEndDate: Date;
  /** Actual date the contract / placement / policy ended */
  actualEndDate: Date;

  /** Already-recovered amount from previous recovery transactions */
  recoveredAmount?: number;

  /** Required when method = FIXED_AMOUNT */
  fixedAmount?: number;

  /** Required when method = MANUAL */
  manualAmount?: number;
  manualReason?: string;

  /** Required when method = COMPONENT_BASED */
  commissionComponents?: CommissionComponentInput[];
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ComponentClawbackBreakdown {
  key: string;
  label: string;
  paidAmount: number;
  clawbackEligible: boolean;
  activeDays: number;
  termDays: number;
  earnedRatio: number;
  earnedAmount: number;
  recoverableAmount: number;
  notes: string;
}

export interface ClawbackCalculationResult {
  // ── Input echo ──────────────────────────────────────────────────────────────
  commissionEventId: string | undefined;
  cancellationReason: string | undefined;
  method: ClawbackMethod;

  // ── Dates ───────────────────────────────────────────────────────────────────
  contractStartDate: Date;
  contractEndDate: Date;
  actualEndDate: Date;

  // ── Term calculations ────────────────────────────────────────────────────────
  originalTermDays: number;
  actualActiveDays: number;
  remainingDays: number;

  // ── Amount calculations ──────────────────────────────────────────────────────
  originalCommissionAmount: number;
  paidCommissionAmount: number;
  earnedCommissionAmount: number;
  recoverableAmount: number;
  recoveredAmount: number;
  outstandingRecoveryAmount: number;

  // ── Method-specific detail ───────────────────────────────────────────────────
  earnedRatio?: number;
  slidingScalePercent?: number;
  matchedBracket?: SlidingScaleBracket;
  componentBreakdown?: ComponentClawbackBreakdown[];

  // ── Policy metadata ──────────────────────────────────────────────────────────
  noClawbackAfterDays: number | null;
  clawbackWindowDays: number | null;
  withinClawbackWindow: boolean;
  cappedByNoClawbackWindow: boolean;

  // ── Human-readable summary ───────────────────────────────────────────────────
  notes: string[];
  warnings: string[];

  /** true when the engine has enough data to produce a reliable figure */
  isValid: boolean;
  validationErrors: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseSlidingScaleConfig(json: unknown): SlidingScaleConfig | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj["brackets"])) return null;
  return obj as unknown as SlidingScaleConfig;
}

function findSlidingBracket(
  brackets: SlidingScaleBracket[],
  activeDays: number,
): SlidingScaleBracket | null {
  for (const bracket of brackets) {
    const from = bracket.fromDay ?? 0;
    const to = bracket.toDay;
    if (activeDays >= from && (to === null || activeDays <= to)) {
      return bracket;
    }
  }
  return null;
}

// ─── Validate inputs ──────────────────────────────────────────────────────────

function validate(input: ClawbackCalculationInput): string[] {
  const errors: string[] = [];

  if (isNaN(input.contractStartDate.getTime()))
    errors.push("contractStartDate is not a valid date.");
  if (isNaN(input.contractEndDate.getTime()))
    errors.push("contractEndDate is not a valid date.");
  if (isNaN(input.actualEndDate.getTime()))
    errors.push("actualEndDate is not a valid date.");
  if (input.paidCommissionAmount < 0)
    errors.push("paidCommissionAmount must be >= 0.");
  if (input.originalCommissionAmount < 0)
    errors.push("originalCommissionAmount must be >= 0.");
  if (
    errors.length === 0 &&
    input.actualEndDate < input.contractStartDate
  )
    errors.push("actualEndDate cannot be before contractStartDate.");

  const m = input.policy.clawbackMethod;

  if (m === "FIXED_AMOUNT") {
    if (input.fixedAmount === undefined || input.fixedAmount < 0)
      errors.push("fixedAmount is required and must be >= 0 for FIXED_AMOUNT method.");
  }
  if (m === "MANUAL") {
    if (input.manualAmount === undefined || input.manualAmount < 0)
      errors.push("manualAmount is required and must be >= 0 for MANUAL method.");
  }
  if (m === "COMPONENT_BASED") {
    if (!input.commissionComponents || input.commissionComponents.length === 0)
      errors.push("commissionComponents are required for COMPONENT_BASED method.");
  }
  if (m === "SLIDING_SCALE") {
    const cfg = parseSlidingScaleConfig(input.policy.recoveryMethodPriorityJson);
    if (!cfg)
      errors.push(
        "SLIDING_SCALE method requires recoveryMethodPriorityJson with a 'brackets' array.",
      );
  }

  return errors;
}

// ─── Main calculation entry point ─────────────────────────────────────────────

export function calculateClawback(
  input: ClawbackCalculationInput,
): ClawbackCalculationResult {
  const validationErrors = validate(input);
  const notes: string[] = [];
  const warnings: string[] = [];

  // Base date/term values (calculate even if invalid so result shape is complete)
  const originalTermDays = daysBetween(input.contractStartDate, input.contractEndDate);
  const actualActiveDays = daysBetween(input.contractStartDate, input.actualEndDate);
  const remainingDays = Math.max(0, originalTermDays - actualActiveDays);

  const {
    clawbackMethod: method,
    noClawbackAfterDays = null,
    clawbackWindowDays = null,
  } = input.policy;

  const recoveredAmount = round2(input.recoveredAmount ?? 0);
  const paidAmount = round2(input.paidCommissionAmount);

  // ── Check no-clawback window ─────────────────────────────────────────────
  let cappedByNoClawbackWindow = false;
  if (noClawbackAfterDays !== null && actualActiveDays >= noClawbackAfterDays) {
    cappedByNoClawbackWindow = true;
    notes.push(
      `No clawback eligible: contract was active for ${actualActiveDays} days, which meets or exceeds the ${noClawbackAfterDays}-day no-clawback threshold.`,
    );
  }

  // ── withinClawbackWindow: is the actual end date still inside the window? ──
  const withinClawbackWindow =
    clawbackWindowDays === null || actualActiveDays <= clawbackWindowDays;
  if (clawbackWindowDays !== null && !withinClawbackWindow) {
    warnings.push(
      `actualActiveDays (${actualActiveDays}) exceeds clawbackWindowDays (${clawbackWindowDays}). Clawback may be limited.`,
    );
  }

  if (originalTermDays === 0 && (method === "PRO_RATA_BY_TERM" || method === "COMPONENT_BASED")) {
    warnings.push(
      "originalTermDays is 0 — contractStartDate and contractEndDate may be identical. Earned ratio defaulted to 1.",
    );
  }

  // ── Blank-out result if capped ────────────────────────────────────────────
  if (cappedByNoClawbackWindow) {
    const zero = buildResult({
      input,
      originalTermDays,
      actualActiveDays,
      remainingDays,
      earnedCommission: paidAmount,
      recoverableAmount: 0,
      recoveredAmount,
      method,
      noClawbackAfterDays,
      clawbackWindowDays,
      withinClawbackWindow,
      cappedByNoClawbackWindow,
      notes,
      warnings,
      validationErrors,
    });
    return zero;
  }

  // ── Calculate by method ───────────────────────────────────────────────────
  let earnedCommission = 0;
  let recoverableAmount = 0;
  let earnedRatio: number | undefined;
  let slidingScalePercent: number | undefined;
  let matchedBracket: SlidingScaleBracket | undefined;
  let componentBreakdown: ComponentClawbackBreakdown[] | undefined;

  switch (method) {
    // ── NONE ──────────────────────────────────────────────────────────────
    case "NONE": {
      earnedCommission = paidAmount;
      recoverableAmount = 0;
      notes.push("Policy method is NONE — no automatic clawback is calculated.");
      break;
    }

    // ── FULL ──────────────────────────────────────────────────────────────
    case "FULL": {
      earnedCommission = 0;
      recoverableAmount = paidAmount;
      notes.push("Full clawback: entire paid commission amount is recoverable.");
      break;
    }

    // ── PRO_RATA_BY_TERM ──────────────────────────────────────────────────
    case "PRO_RATA_BY_TERM": {
      const denominatorDays =
        clawbackWindowDays !== null
          ? Math.min(originalTermDays || clawbackWindowDays, clawbackWindowDays)
          : originalTermDays;

      if (denominatorDays === 0) {
        earnedRatio = 1;
        warnings.push("denominatorDays is 0; earned ratio defaulted to 1 (no clawback).");
      } else {
        // Keep full precision on the ratio; only round the currency amounts below
        earnedRatio = Math.min(actualActiveDays, denominatorDays) / denominatorDays;
      }

      earnedCommission = round2(paidAmount * earnedRatio);
      recoverableAmount = round2(paidAmount - earnedCommission);

      notes.push(
        `Pro-rata: ${actualActiveDays} active days / ${denominatorDays} denominator days = ${(earnedRatio * 100).toFixed(2)}% earned.`,
      );
      if (clawbackWindowDays !== null && originalTermDays > clawbackWindowDays) {
        notes.push(
          `Term denominator capped at clawbackWindowDays (${clawbackWindowDays}) — original term was ${originalTermDays} days.`,
        );
      }
      break;
    }

    // ── SLIDING_SCALE ─────────────────────────────────────────────────────
    case "SLIDING_SCALE": {
      const cfg = parseSlidingScaleConfig(input.policy.recoveryMethodPriorityJson);
      if (!cfg) {
        warnings.push("Sliding scale config missing — defaulting to FULL clawback.");
        recoverableAmount = paidAmount;
        earnedCommission = 0;
        break;
      }

      const bracket = findSlidingBracket(cfg.brackets, actualActiveDays);
      if (!bracket) {
        warnings.push(
          `No matching sliding scale bracket for ${actualActiveDays} active days — defaulting to 0% clawback.`,
        );
        earnedCommission = paidAmount;
        recoverableAmount = 0;
        break;
      }

      matchedBracket = bracket;
      slidingScalePercent = bracket.percentage;
      recoverableAmount = round2(paidAmount * (bracket.percentage / 100));
      earnedCommission = round2(paidAmount - recoverableAmount);

      notes.push(
        `Sliding scale: ${actualActiveDays} active days falls in bracket [${bracket.fromDay}–${bracket.toDay ?? "∞"}] → ${bracket.percentage}% clawback.`,
      );
      break;
    }

    // ── COMPONENT_BASED ───────────────────────────────────────────────────
    case "COMPONENT_BASED": {
      const components = input.commissionComponents ?? [];
      const denominator = originalTermDays > 0 ? originalTermDays : 1;

      componentBreakdown = components.map((c) => {
        if (!c.clawbackEligible) {
          return {
            key: c.key,
            label: c.label,
            paidAmount: c.paidAmount,
            clawbackEligible: false,
            activeDays: actualActiveDays,
            termDays: denominator,
            earnedRatio: 1,
            earnedAmount: c.paidAmount,
            recoverableAmount: 0,
            notes: "Not clawback eligible.",
          };
        }

        const compActiveDays = c.activeDays ?? actualActiveDays;
        const compTermDays =
          c.termDays ?? (clawbackWindowDays !== null ? Math.min(denominator, clawbackWindowDays) : denominator);
        const ratio = compTermDays > 0 ? Math.min(compActiveDays, compTermDays) / compTermDays : 1;
        const earned = round2(c.paidAmount * ratio);
        const recoverable = round2(c.paidAmount - earned);

        return {
          key: c.key,
          label: c.label,
          paidAmount: c.paidAmount,
          clawbackEligible: true,
          activeDays: compActiveDays,
          termDays: compTermDays,
          earnedRatio: ratio,
          earnedAmount: earned,
          recoverableAmount: recoverable,
          notes: `${(ratio * 100).toFixed(2)}% earned (${compActiveDays}/${compTermDays} days).`,
        };
      });

      earnedCommission = round2(
        componentBreakdown.reduce((sum, c) => sum + c.earnedAmount, 0),
      );
      recoverableAmount = round2(
        componentBreakdown.reduce((sum, c) => sum + c.recoverableAmount, 0),
      );

      const eligibleCount = componentBreakdown.filter((c) => c.clawbackEligible).length;
      notes.push(
        `Component-based: ${eligibleCount} of ${components.length} components are clawback eligible.`,
      );
      break;
    }

    // ── FIXED_AMOUNT ──────────────────────────────────────────────────────
    case "FIXED_AMOUNT": {
      const fixed = round2(input.fixedAmount ?? 0);
      recoverableAmount = Math.min(fixed, paidAmount);
      earnedCommission = round2(paidAmount - recoverableAmount);

      notes.push(
        `Fixed amount clawback: R${fixed.toFixed(2)} configured${fixed > paidAmount ? ` (capped to paid amount R${paidAmount.toFixed(2)})` : ""}.`,
      );
      if (fixed > paidAmount) {
        warnings.push(`Configured fixedAmount (${fixed}) exceeds paidCommissionAmount (${paidAmount}); capped.`);
      }
      break;
    }

    // ── MANUAL ────────────────────────────────────────────────────────────
    case "MANUAL": {
      const manual = round2(input.manualAmount ?? 0);
      recoverableAmount = Math.min(manual, paidAmount);
      earnedCommission = round2(paidAmount - recoverableAmount);

      notes.push(
        `Manual clawback: R${manual.toFixed(2)} entered by user` +
          (input.manualReason ? ` — "${input.manualReason}"` : "") +
          (manual > paidAmount ? ` (capped to paid amount R${paidAmount.toFixed(2)})` : "") +
          ".",
      );
      if (manual > paidAmount) {
        warnings.push(`Entered manualAmount (${manual}) exceeds paidCommissionAmount (${paidAmount}); capped.`);
      }
      break;
    }
  }

  return buildResult({
    input,
    originalTermDays,
    actualActiveDays,
    remainingDays,
    earnedCommission,
    recoverableAmount,
    recoveredAmount,
    method,
    earnedRatio,
    slidingScalePercent,
    matchedBracket,
    componentBreakdown,
    noClawbackAfterDays,
    clawbackWindowDays,
    withinClawbackWindow,
    cappedByNoClawbackWindow,
    notes,
    warnings,
    validationErrors,
  });
}

// ─── Result assembler ─────────────────────────────────────────────────────────

interface BuildResultParams {
  input: ClawbackCalculationInput;
  originalTermDays: number;
  actualActiveDays: number;
  remainingDays: number;
  earnedCommission: number;
  recoverableAmount: number;
  recoveredAmount: number;
  method: ClawbackMethod;
  earnedRatio?: number;
  slidingScalePercent?: number;
  matchedBracket?: SlidingScaleBracket;
  componentBreakdown?: ComponentClawbackBreakdown[];
  noClawbackAfterDays: number | null;
  clawbackWindowDays: number | null;
  withinClawbackWindow: boolean;
  cappedByNoClawbackWindow: boolean;
  notes: string[];
  warnings: string[];
  validationErrors: string[];
}

function buildResult(p: BuildResultParams): ClawbackCalculationResult {
  const outstandingRecoveryAmount = round2(
    Math.max(0, p.recoverableAmount - p.recoveredAmount),
  );

  return {
    commissionEventId: p.input.commissionEventId,
    cancellationReason: p.input.cancellationReason,
    method: p.method,

    contractStartDate: p.input.contractStartDate,
    contractEndDate: p.input.contractEndDate,
    actualEndDate: p.input.actualEndDate,

    originalTermDays: p.originalTermDays,
    actualActiveDays: p.actualActiveDays,
    remainingDays: p.remainingDays,

    originalCommissionAmount: round2(p.input.originalCommissionAmount),
    paidCommissionAmount: round2(p.input.paidCommissionAmount),
    earnedCommissionAmount: round2(p.earnedCommission),
    recoverableAmount: round2(p.recoverableAmount),
    recoveredAmount: p.recoveredAmount,
    outstandingRecoveryAmount,

    earnedRatio: p.earnedRatio,
    slidingScalePercent: p.slidingScalePercent,
    matchedBracket: p.matchedBracket,
    componentBreakdown: p.componentBreakdown,

    noClawbackAfterDays: p.noClawbackAfterDays,
    clawbackWindowDays: p.clawbackWindowDays,
    withinClawbackWindow: p.withinClawbackWindow,
    cappedByNoClawbackWindow: p.cappedByNoClawbackWindow,

    notes: p.notes,
    warnings: p.warnings,

    isValid: p.validationErrors.length === 0,
    validationErrors: p.validationErrors,
  };
}

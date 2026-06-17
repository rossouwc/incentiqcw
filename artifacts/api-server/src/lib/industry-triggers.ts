// ─────────────────────────────────────────────────────────────────────────────
// Industry-aware trigger event definitions
// Trigger events control when commission can move to available wallet balance.
// A CommissionEvent's commission is only released when ALL its triggers are
// TRIGGERED or WAIVED, AND the approval chain is also fully approved.
// ─────────────────────────────────────────────────────────────────────────────

export interface TriggerEvent {
  type:         string;
  label:        string;
  description?: string;
}

// ── Trigger definitions per industry (and optional sub-type) ──────────────────
// Key format: "INDUSTRY_CODE" or "INDUSTRY_CODE:EVENT_TYPE"

const TRIGGERS: Record<string, TriggerEvent[]> = {
  // ── IT Consulting ────────────────────────────────────────────────────────────
  IT_CONSULTING: [
    { type: "CONTRACT_SIGNED",   label: "Contract Signed",   description: "Client contract has been signed and returned" },
    { type: "CANDIDATE_STARTED", label: "Candidate Started", description: "Placed candidate has started in the role"      },
  ],

  // ── Recruitment — Permanent ──────────────────────────────────────────────────
  "RECRUITMENT:PERMANENT": [
    { type: "CANDIDATE_STARTED",       label: "Candidate Started",        description: "Candidate has commenced employment"                           },
    { type: "CLIENT_INVOICE_PAID",     label: "Client Invoice Paid",      description: "Client has settled the placement fee invoice"                 },
    { type: "GUARANTEE_PERIOD_PASSED", label: "Guarantee Period Passed",  description: "Guarantee/replacement period has elapsed without replacement claim" },
  ],

  // ── Recruitment — Contract / Temporary ───────────────────────────────────────
  "RECRUITMENT:CONTRACT": [
    { type: "CONTRACT_SIGNED",   label: "Contract Signed",   description: "Contract agreement has been signed by all parties" },
    { type: "CANDIDATE_STARTED", label: "Candidate Started", description: "Contractor has commenced the assignment"           },
  ],
  "RECRUITMENT:TEMPORARY": [
    { type: "CONTRACT_SIGNED",   label: "Contract Signed",   description: "Temp agreement has been executed"       },
    { type: "CANDIDATE_STARTED", label: "Candidate Started", description: "Temp worker has started the assignment" },
  ],

  // ── Insurance ─────────────────────────────────────────────────────────────────
  INSURANCE: [
    { type: "POLICY_ACTIVATED",        label: "Policy Activated",        description: "Insurance policy is active and on risk" },
    { type: "FIRST_PREMIUM_COLLECTED", label: "First Premium Collected", description: "First premium payment has been received" },
  ],

  // ── Vehicle Dealership ────────────────────────────────────────────────────────
  VEHICLE_DEALERSHIP: [
    { type: "VEHICLE_DELIVERED", label: "Vehicle Delivered", description: "Vehicle has been physically handed over to the customer" },
  ],

  // ── Property Sales ────────────────────────────────────────────────────────────
  PROPERTY_SALES: [
    { type: "TRANSFER_REGISTERED", label: "Transfer Registered", description: "Property transfer has been registered at the Deeds Office" },
  ],

  // ── Rental Management ─────────────────────────────────────────────────────────
  RENTAL_MANAGEMENT: [
    { type: "LEASE_SIGNED",           label: "Lease Signed",           description: "Signed lease agreement received from tenant" },
    { type: "FIRST_RENTAL_COLLECTED", label: "First Rental Collected", description: "First month's rental payment received"       },
  ],

  // ── Telecom ───────────────────────────────────────────────────────────────────
  TELECOM: [
    { type: "SERVICE_ACTIVATED", label: "Service Activated", description: "Customer's telecom service is live and active" },
  ],

  // ── SaaS ──────────────────────────────────────────────────────────────────────
  SAAS: [
    { type: "CUSTOMER_ACTIVATED", label: "Customer Activated", description: "Customer account is provisioned and onboarded" },
  ],

  // ── Custom ────────────────────────────────────────────────────────────────────
  CUSTOM: [
    { type: "MANUALLY_APPROVED", label: "Manually Approved", description: "Authorised approver has confirmed the trigger condition" },
  ],
};

// ── Lookup helper ──────────────────────────────────────────────────────────────

/**
 * Returns the trigger events for a given industry + optional event sub-type.
 * Falls back to industry-only, then CUSTOM.
 */
export function getIndustryTriggers(
  industryCode: string,
  eventType?: string | null
): TriggerEvent[] {
  if (eventType) {
    const specific = TRIGGERS[`${industryCode}:${eventType}`];
    if (specific) return specific;
  }
  return TRIGGERS[industryCode] ?? TRIGGERS.CUSTOM;
}

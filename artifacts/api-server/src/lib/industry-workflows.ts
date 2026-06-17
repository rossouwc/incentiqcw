// ─────────────────────────────────────────────────────────────────────────────
// Industry-aware default approval workflows
// Each step maps the descriptive stepName to the closest UserRole enum value.
// ─────────────────────────────────────────────────────────────────────────────

export type ApproverRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "SALES_EXECUTIVE"
  | "FINANCE"
  | "EXECUTIVE"
  | "PAYROLL";

export interface WorkflowStep {
  step:          number;
  stepName:      string;
  approverRole:  ApproverRole;
}

// ── Default workflows per industry ────────────────────────────────────────────

export const DEFAULT_INDUSTRY_WORKFLOWS: Record<string, WorkflowStep[]> = {
  IT_CONSULTING: [
    { step: 1, stepName: "Sales Manager Review",    approverRole: "MANAGER"   },
    { step: 2, stepName: "Finance Review",           approverRole: "FINANCE"   },
    { step: 3, stepName: "Executive Approval",       approverRole: "EXECUTIVE" },
    { step: 4, stepName: "Payroll Processing",       approverRole: "PAYROLL"   },
  ],
  RECRUITMENT: [
    { step: 1, stepName: "Recruitment Manager Review", approverRole: "MANAGER" },
    { step: 2, stepName: "Finance Review",              approverRole: "FINANCE" },
    { step: 3, stepName: "Payroll Processing",          approverRole: "PAYROLL" },
  ],
  INSURANCE: [
    { step: 1, stepName: "Compliance Review",  approverRole: "ADMIN"   },
    { step: 2, stepName: "Finance Review",      approverRole: "FINANCE" },
    { step: 3, stepName: "Payroll Processing",  approverRole: "PAYROLL" },
  ],
  VEHICLE_DEALERSHIP: [
    { step: 1, stepName: "Sales Manager Review",      approverRole: "MANAGER"   },
    { step: 2, stepName: "Dealer Principal Approval",  approverRole: "ADMIN"     },
    { step: 3, stepName: "Finance Review",             approverRole: "FINANCE"   },
    { step: 4, stepName: "Payroll Processing",         approverRole: "PAYROLL"   },
  ],
  PROPERTY_SALES: [
    { step: 1, stepName: "Principal Agent Review", approverRole: "MANAGER" },
    { step: 2, stepName: "Finance Review",          approverRole: "FINANCE" },
    { step: 3, stepName: "Payroll Processing",      approverRole: "PAYROLL" },
  ],
  RENTAL_MANAGEMENT: [
    { step: 1, stepName: "Rental Manager Review", approverRole: "MANAGER" },
    { step: 2, stepName: "Finance Review",          approverRole: "FINANCE" },
    { step: 3, stepName: "Payroll Processing",      approverRole: "PAYROLL" },
  ],
  TELECOM: [
    { step: 1, stepName: "Sales Manager Review",               approverRole: "MANAGER"   },
    { step: 2, stepName: "Operations Activation Confirmation", approverRole: "ADMIN"     },
    { step: 3, stepName: "Finance Review",                     approverRole: "FINANCE"   },
    { step: 4, stepName: "Payroll Processing",                 approverRole: "PAYROLL"   },
  ],
  SAAS: [
    { step: 1, stepName: "Sales Manager Review",                   approverRole: "MANAGER"   },
    { step: 2, stepName: "Customer Success Activation Confirmation", approverRole: "ADMIN"     },
    { step: 3, stepName: "Finance Review",                         approverRole: "FINANCE"   },
    { step: 4, stepName: "Payroll Processing",                     approverRole: "PAYROLL"   },
  ],
  CUSTOM: [
    { step: 1, stepName: "Manager Review",    approverRole: "MANAGER" },
    { step: 2, stepName: "Finance Review",     approverRole: "FINANCE" },
    { step: 3, stepName: "Payroll Processing", approverRole: "PAYROLL" },
  ],
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getDefaultWorkflow(industryCode: string): WorkflowStep[] {
  return DEFAULT_INDUSTRY_WORKFLOWS[industryCode]
    ?? DEFAULT_INDUSTRY_WORKFLOWS.CUSTOM;
}

/**
 * Parse the TenantApprovalWorkflow approvalStepsJson into WorkflowStep[].
 * Supports both old format ({step, approverRole, approverUserId}) and
 * new format ({step, stepName, approverRole, approverUserId}).
 */
export function parseWorkflowSteps(json: unknown): WorkflowStep[] | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  try {
    return (json as any[]).map((s, i) => ({
      step:         s.step        ?? (i + 1),
      stepName:     s.stepName    ?? `Step ${s.step ?? (i + 1)}`,
      approverRole: s.approverRole as ApproverRole,
    }));
  } catch {
    return null;
  }
}

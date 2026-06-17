export interface EventType {
  value: string;
  label: string;
}

export interface ExtraField {
  key: string;
  label: string;
  type: "text" | "currency" | "number" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface IndustryConfig {
  id: string;
  label: string;
  eventLabel: string;
  eventLabelPlural: string;
  entityLabel: string;
  eventTypes: EventType[];
  revenueLabel: string;
  costLabel: string | null;
  showGP: boolean;
  commissionMethodLabel: string;
  triggerLabel: string;
  extraFields: ExtraField[];
}

export const INDUSTRY_CONFIGS: IndustryConfig[] = [
  {
    id: "IT_CONSULTING",
    label: "IT Consulting",
    eventLabel: "Deal",
    eventLabelPlural: "Deals",
    entityLabel: "Customer",
    eventTypes: [
      { value: "NET_NEW",    label: "Net New" },
      { value: "RENEWAL",    label: "Renewal" },
      { value: "UPSELL",     label: "Upsell" },
      { value: "CROSS_SELL", label: "Cross-Sell" },
    ],
    revenueLabel: "Contract Value",
    costLabel: "Cost",
    showGP: true,
    commissionMethodLabel: "Percentage of Gross Profit",
    triggerLabel: "Commission earned on Executive approval",
    extraFields: [],
  },
  {
    id: "RECRUITMENT",
    label: "Recruitment",
    eventLabel: "Placement",
    eventLabelPlural: "Placements",
    entityLabel: "Client",
    eventTypes: [
      { value: "PERMANENT",  label: "Permanent" },
      { value: "CONTRACT",   label: "Contract" },
      { value: "TEMPORARY",  label: "Temporary" },
    ],
    revenueLabel: "Placement Fee",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of Placement Fee",
    triggerLabel: "Commission earned on placement confirmation",
    extraFields: [
      { key: "candidateName", label: "Candidate Name", type: "text", required: true,  placeholder: "e.g. John Smith" },
      { key: "position",      label: "Position / Role", type: "text", required: true,  placeholder: "e.g. Senior Developer" },
    ],
  },
  {
    id: "INSURANCE",
    label: "Insurance",
    eventLabel: "Policy",
    eventLabelPlural: "Policies",
    entityLabel: "Insured / Client",
    eventTypes: [
      { value: "LIFE",       label: "Life" },
      { value: "SHORT_TERM", label: "Short-Term" },
      { value: "HEALTH",     label: "Health" },
      { value: "COMMERCIAL", label: "Commercial" },
    ],
    revenueLabel: "Annual Premium",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of Annual Premium",
    triggerLabel: "Commission earned on policy activation",
    extraFields: [
      { key: "policyNumber", label: "Policy Number",    type: "text", required: false, placeholder: "e.g. POL-2025-001" },
      { key: "insurer",      label: "Insurer / Provider", type: "text", required: false, placeholder: "e.g. Discovery" },
    ],
  },
  {
    id: "VEHICLE_DEALERSHIP",
    label: "Vehicle Dealership",
    eventLabel: "Vehicle Sale",
    eventLabelPlural: "Vehicle Sales",
    entityLabel: "Buyer",
    eventTypes: [
      { value: "NEW",  label: "New Vehicle" },
      { value: "USED", label: "Used Vehicle" },
      { value: "DEMO", label: "Demo Vehicle" },
    ],
    revenueLabel: "Sale Price",
    costLabel: "Cost / Book Value",
    showGP: true,
    commissionMethodLabel: "Percentage of Gross Profit",
    triggerLabel: "Commission earned on sale completion",
    extraFields: [
      { key: "vehicleMake",  label: "Make",  type: "text", required: true, placeholder: "e.g. Toyota" },
      { key: "vehicleModel", label: "Model", type: "text", required: true, placeholder: "e.g. Hilux GD-6" },
    ],
  },
  {
    id: "PROPERTY_SALES",
    label: "Property Sales",
    eventLabel: "Property Sale",
    eventLabelPlural: "Property Sales",
    entityLabel: "Buyer",
    eventTypes: [
      { value: "RESIDENTIAL",  label: "Residential" },
      { value: "COMMERCIAL",   label: "Commercial" },
      { value: "INDUSTRIAL",   label: "Industrial" },
      { value: "AGRICULTURAL", label: "Agricultural" },
    ],
    revenueLabel: "Sale Price",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of Sale Price",
    triggerLabel: "Commission earned on transfer completion",
    extraFields: [
      { key: "propertyAddress", label: "Property Address", type: "text", required: true, placeholder: "e.g. 12 Main St, Sandton" },
    ],
  },
  {
    id: "RENTAL_MANAGEMENT",
    label: "Rental Management",
    eventLabel: "Lease",
    eventLabelPlural: "Leases",
    entityLabel: "Tenant",
    eventTypes: [
      { value: "RESIDENTIAL", label: "Residential" },
      { value: "COMMERCIAL",  label: "Commercial" },
      { value: "INDUSTRIAL",  label: "Industrial" },
    ],
    revenueLabel: "Monthly Rent",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of Monthly Rent",
    triggerLabel: "Commission earned on lease signing",
    extraFields: [
      { key: "propertyAddress", label: "Property Address", type: "text", required: true, placeholder: "e.g. Unit 5, Park Mall" },
    ],
  },
  {
    id: "TELECOM",
    label: "Telecom",
    eventLabel: "Activation",
    eventLabelPlural: "Activations",
    entityLabel: "Customer",
    eventTypes: [
      { value: "MOBILE",   label: "Mobile" },
      { value: "FIBRE",    label: "Fibre" },
      { value: "BUSINESS", label: "Business" },
      { value: "IOT",      label: "IoT" },
    ],
    revenueLabel: "Contract Value",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of Contract Value",
    triggerLabel: "Commission earned on activation confirmation",
    extraFields: [
      { key: "product",        label: "Product / Service",          type: "text",   required: true,  placeholder: "e.g. Fibre 100Mbps" },
      { key: "contractMonths", label: "Contract Duration (months)", type: "number", required: false, placeholder: "e.g. 24" },
    ],
  },
  {
    id: "SAAS",
    label: "SaaS",
    eventLabel: "Subscription",
    eventLabelPlural: "Subscriptions",
    entityLabel: "Company",
    eventTypes: [
      { value: "NEW_BUSINESS", label: "New Business" },
      { value: "EXPANSION",    label: "Expansion" },
      { value: "RENEWAL",      label: "Renewal" },
    ],
    revenueLabel: "Annual Contract Value (ACV)",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of ACV",
    triggerLabel: "Commission earned on subscription start",
    extraFields: [
      { key: "plan", label: "Plan / Tier",              type: "text",     required: false, placeholder: "e.g. Enterprise" },
      { key: "mrr",  label: "Monthly Recurring Revenue", type: "currency", required: false, placeholder: "0.00" },
    ],
  },
  {
    id: "CUSTOM",
    label: "Custom",
    eventLabel: "Event",
    eventLabelPlural: "Events",
    entityLabel: "Client",
    eventTypes: [
      { value: "TYPE_A", label: "Type A" },
      { value: "TYPE_B", label: "Type B" },
      { value: "TYPE_C", label: "Type C" },
    ],
    revenueLabel: "Amount",
    costLabel: "Cost",
    showGP: true,
    commissionMethodLabel: "Configurable",
    triggerLabel: "Commission earned on approval",
    extraFields: [],
  },
];

export const INDUSTRY_OPTIONS = INDUSTRY_CONFIGS.map(c => ({ id: c.id, label: c.label }));

export function getIndustryConfig(industry: string | null | undefined): IndustryConfig {
  return INDUSTRY_CONFIGS.find(c => c.id === industry) ?? INDUSTRY_CONFIGS[0];
}

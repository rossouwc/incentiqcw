export interface EventType {
  value: string;
  label: string;
}

export interface ExtraField {
  key: string;
  label: string;
  type: "text" | "currency" | "number" | "select" | "date";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface IndustryConfig {
  id: string;
  label: string;
  eventLabel: string;
  eventLabelPlural: string;
  newEventLabel: string;
  titleLabel: string;
  customerLabel: string;
  entityLabel: string;
  gpLabel: string;
  commissionLabel: string;
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
    newEventLabel: "New Deal",
    titleLabel: "Deal Name",
    customerLabel: "Customer",
    entityLabel: "Customer",
    gpLabel: "GP",
    commissionLabel: "Commission",
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
    extraFields: [
      { key: "dealDate",          label: "Deal Date",           type: "date", required: true  },
      { key: "contractStartDate", label: "Contract Start Date", type: "date", required: false },
      { key: "contractEndDate",   label: "Contract End Date",   type: "date", required: false },
    ],
  },
  {
    id: "RECRUITMENT",
    label: "Recruitment",
    eventLabel: "Placement",
    eventLabelPlural: "Placements",
    newEventLabel: "New Placement",
    titleLabel: "Candidate",
    customerLabel: "Client",
    entityLabel: "Client",
    gpLabel: "GP",
    commissionLabel: "Commission",
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
      { key: "candidateName",       label: "Candidate Name",           type: "text", required: true,  placeholder: "e.g. John Smith" },
      { key: "position",            label: "Position / Role",           type: "text", required: true,  placeholder: "e.g. Senior Developer" },
      { key: "placementDate",       label: "Placement Date",            type: "date", required: true  },
      { key: "candidateStartDate",  label: "Candidate Start Date",      type: "date", required: false },
      { key: "guaranteeEndDate",    label: "Guarantee Period End Date",  type: "date", required: false },
    ],
  },
  {
    id: "INSURANCE",
    label: "Insurance",
    eventLabel: "Policy",
    eventLabelPlural: "Policies",
    newEventLabel: "New Policy",
    titleLabel: "Client",
    customerLabel: "Product",
    entityLabel: "Insured / Client",
    gpLabel: "GP",
    commissionLabel: "Commission",
    eventTypes: [
      { value: "LIFE",       label: "Life" },
      { value: "SHORT_TERM", label: "Short-Term" },
      { value: "HEALTH",     label: "Health" },
      { value: "COMMERCIAL", label: "Commercial" },
    ],
    revenueLabel: "Premium",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of Annual Premium",
    triggerLabel: "Commission earned on policy activation",
    extraFields: [
      { key: "policyNumber",    label: "Policy Number",        type: "text", required: false, placeholder: "e.g. POL-2025-001" },
      { key: "insurer",         label: "Insurer / Provider",   type: "text", required: false, placeholder: "e.g. Discovery" },
      { key: "inceptionDate",   label: "Policy Inception Date", type: "date", required: true  },
      { key: "renewalDate",     label: "Renewal Date",          type: "date", required: false },
    ],
  },
  {
    id: "VEHICLE_DEALERSHIP",
    label: "Vehicle Dealership",
    eventLabel: "Vehicle Sale",
    eventLabelPlural: "Vehicle Sales",
    newEventLabel: "New Vehicle Sale",
    titleLabel: "Vehicle",
    customerLabel: "Customer",
    entityLabel: "Buyer",
    gpLabel: "Vehicle GP",
    commissionLabel: "Commission",
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
      { key: "vehicleMake",  label: "Make",          type: "text", required: true,  placeholder: "e.g. Toyota" },
      { key: "vehicleModel", label: "Model",         type: "text", required: true,  placeholder: "e.g. Hilux GD-6" },
      { key: "saleDate",     label: "Sale Date",     type: "date", required: true  },
      { key: "deliveryDate", label: "Delivery Date", type: "date", required: false },
    ],
  },
  {
    id: "PROPERTY_SALES",
    label: "Property Sales",
    eventLabel: "Property Sale",
    eventLabelPlural: "Property Sales",
    newEventLabel: "New Property Sale",
    titleLabel: "Property",
    customerLabel: "Buyer",
    entityLabel: "Buyer",
    gpLabel: "GP",
    commissionLabel: "Agent Commission",
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
      { key: "propertyAddress", label: "Property Address", type: "text", required: true,  placeholder: "e.g. 12 Main St, Sandton" },
      { key: "offerDate",       label: "Offer Date",      type: "date", required: true  },
      { key: "transferDate",    label: "Transfer Date",   type: "date", required: false },
      { key: "occupationDate",  label: "Occupation Date", type: "date", required: false },
    ],
  },
  {
    id: "RENTAL_MANAGEMENT",
    label: "Rental Management",
    eventLabel: "Lease",
    eventLabelPlural: "Leases",
    newEventLabel: "New Lease",
    titleLabel: "Property",
    customerLabel: "Tenant",
    entityLabel: "Tenant",
    gpLabel: "GP",
    commissionLabel: "Placement Fee",
    eventTypes: [
      { value: "RESIDENTIAL", label: "Residential" },
      { value: "COMMERCIAL",  label: "Commercial" },
      { value: "INDUSTRIAL",  label: "Industrial" },
    ],
    revenueLabel: "Monthly Rental",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of Monthly Rental",
    triggerLabel: "Commission earned on lease signing",
    extraFields: [
      { key: "propertyAddress", label: "Property Address", type: "text", required: true,  placeholder: "e.g. Unit 5, Park Mall" },
      { key: "leaseStartDate",   label: "Lease Start Date", type: "date", required: true  },
      { key: "leaseEndDate",     label: "Lease End Date",   type: "date", required: false },
    ],
  },
  {
    id: "TELECOM",
    label: "Telecom",
    eventLabel: "Activation",
    eventLabelPlural: "Activations",
    newEventLabel: "New Activation",
    titleLabel: "Product",
    customerLabel: "Customer",
    entityLabel: "Customer",
    gpLabel: "GP",
    commissionLabel: "Commission",
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
      { key: "product",          label: "Product / Service",          type: "text",   required: true,  placeholder: "e.g. Fibre 100Mbps" },
      { key: "contractMonths",   label: "Contract Duration (months)", type: "number", required: false, placeholder: "e.g. 24" },
      { key: "activationDate",   label: "Activation Date",            type: "date",   required: true  },
      { key: "contractEndDate",  label: "Contract End Date",          type: "date",   required: false },
    ],
  },
  {
    id: "SAAS",
    label: "SaaS",
    eventLabel: "Subscription",
    eventLabelPlural: "Subscriptions",
    newEventLabel: "New Subscription",
    titleLabel: "Product",
    customerLabel: "Customer",
    entityLabel: "Company",
    gpLabel: "GP",
    commissionLabel: "Commission",
    eventTypes: [
      { value: "NEW_BUSINESS", label: "New Business" },
      { value: "EXPANSION",    label: "Expansion" },
      { value: "RENEWAL",      label: "Renewal" },
    ],
    revenueLabel: "ARR",
    costLabel: null,
    showGP: false,
    commissionMethodLabel: "Percentage of ARR",
    triggerLabel: "Commission earned on subscription start",
    extraFields: [
      { key: "plan",              label: "Plan / Tier",              type: "text",     required: false, placeholder: "e.g. Enterprise" },
      { key: "mrr",              label: "Monthly Recurring Revenue", type: "currency", required: false, placeholder: "0.00" },
      { key: "subscriptionStart", label: "Subscription Start Date",  type: "date",     required: true  },
      { key: "renewalDate",       label: "Renewal Date",             type: "date",     required: false },
    ],
  },
  {
    id: "CUSTOM",
    label: "Custom",
    eventLabel: "Commission Event",
    eventLabelPlural: "Commission Events",
    newEventLabel: "New Commission Event",
    titleLabel: "Commission Event",
    customerLabel: "Client",
    entityLabel: "Client",
    gpLabel: "GP",
    commissionLabel: "Commission",
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
    extraFields: [
      { key: "eventDate", label: "Event Date", type: "date", required: true  },
      { key: "dueDate",   label: "Due Date",   type: "date", required: false },
    ],
  },
];

export const INDUSTRY_OPTIONS = INDUSTRY_CONFIGS.map(c => ({ id: c.id, label: c.label }));

export function getIndustryConfig(industry: string | null | undefined): IndustryConfig {
  return INDUSTRY_CONFIGS.find(c => c.id === industry) ?? INDUSTRY_CONFIGS[0];
}

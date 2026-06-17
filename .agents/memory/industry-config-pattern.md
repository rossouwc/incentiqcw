---
name: Industry config pattern
description: How industry-based configuration works in Incentiq — file locations, DB pattern, form logic
---

## Rule
Industry config is a static TypeScript module duplicated in both the backend and frontend. The backend exposes it via API; the frontend has its own copy for fast, no-fetch form rendering.

**Why:** Avoids a shared lib package for pure config data while keeping both sides type-safe. A shared lib could be introduced later if configs need to diverge.

## Files
- Backend: `artifacts/api-server/src/industry-config.ts`
- Frontend: `artifacts/incentiq/src/lib/industry-config.ts`
- Both export the same `INDUSTRY_CONFIGS`, `INDUSTRY_OPTIONS`, `getIndustryConfig()` shape.

## API endpoint
`GET /api/tenant/industry-config` — returns `{ industry, config, allIndustries }` for the authenticated tenant.

## DB pattern for non-IT industries
- `Deal.dealType` DB column always receives a valid enum value: `NET_NEW` for non-IT deals
- The actual industry event type is stored in `Deal.metadata.eventType` (string)
- `Deal.metadata` also stores `{ industry: "RECRUITMENT" }` (or similar) and all extra fields from the industry config's `extraFields`
- `Deal.cost` is forced to `0` for non-IT industries (no cost field shown)

## Commission calculation
- IT_CONSULTING + showGP=true: `commission = grossProfit × rate%`
- All others (showGP=false): `commission = revenue × rate%` (GP collapses to revenue since cost=0)
- Rate is always looked up via commission rule groups using `dealType="NET_NEW"` for non-IT

## How to apply
When adding a new industry: add to `INDUSTRY_CONFIGS` in BOTH files, set appropriate `extraFields`, `showGP`, `costLabel`, and `eventTypes`. Keep both files in sync.

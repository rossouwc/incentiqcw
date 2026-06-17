---
name: CommissionEvent Architecture
description: Core architectural direction — platform must be built around a flexible CommissionEvent, not a fixed Deal object.
---

# CommissionEvent Architecture

## The Rule
Do NOT build Incentiq around a fixed `Deal` model. Build it around a flexible **`CommissionEvent`** object.

## What a CommissionEvent represents
Anything that can earn commission:
- IT deal
- Recruitment placement
- Insurance policy
- Vehicle sale
- Property sale
- Rental lease
- Telecom activation
- SaaS subscription
- Custom commission event

## How it adapts
The **tenant's selected industry** controls:
- **Labels** — field names shown in UI (e.g. "Deal Value" vs "Premium" vs "Sale Price")
- **Fields** — which data fields are relevant (e.g. GP% for IT, placement fee for recruitment)
- **Formula** — how commission is calculated
- **Trigger event** — what action starts the commission calculation
- **Approval workflow** — which roles/steps are required

## Implementation guidance
- The current `Deal` model in Prisma should eventually be migrated to `CommissionEvent` (or renamed/extended)
- Industry config should drive the UI rendering, not hardcoded field sets
- The wallet, approval, and payout systems already support this — they just need the source object to be flexible
- More detailed instructions are coming from the user — wait for them before migrating

**Why:** The platform is a multi-tenant SaaS meant for any commission-driven industry. Hardcoding "Deal" with IT-specific fields (revenue, GP, etc.) locks out every other vertical.

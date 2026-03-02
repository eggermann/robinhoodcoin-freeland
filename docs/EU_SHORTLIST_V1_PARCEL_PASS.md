# EU Shortlist v1 — Parcel Pass (Execution Update)

Brand: 🏹 RobinHoodCoin Freeland

## Status
Attempted to convert lane-level shortlist into parcel-level entries (exact lot/price/size).

## What succeeded
- Confirmed live, reachable judicial auction channel for Brandenburg:
  - https://www.zwangsversteigerung.de/amtsgericht/brandenburg

## What blocked parcel extraction
Most commercial listing portals are currently protected by anti-bot / JS challenge layers in this runtime:
- idealista(.pt/.com): blocked (JS challenge)
- ImmoScout24: blocked (anti-robot gate)
- Kyero / RealAdvisor: blocked (challenge pages)

## Practical consequence
- We can keep robust **source-lane** intelligence live.
- Exact **parcel-level** extraction needs one of:
  1) Browser relay/manual extraction run, or
  2) Partner API / export feed access from listing platforms.

## Immediate tactical workaround (recommended)
1. Use Brandenburg auction channel as parcel-level feed candidate (public/legal channel).
2. Run manual browser extraction pass for PT/ES/CH lane pages (20 listings) and ingest into structured JSON.
3. Re-score top 10 with real lot-level fields: exact price, exact area, municipality, zoning signal, seller type.

## Next execution artifact
- `EU_PARCEL_TABLE_V1.json` with 20 parcel-level entries (target), followed by Top 5 DAO vote slate.

# Component fixtures for the unified-feed build

`mtc/`, `cmrl/` and `srr/` are small per-agency feeds. They reproduce the quirks of the real ChennaiGTFS v0.2.0 components:

- CMRL routes and fares have no `agency_id`, and a `fare_rules.route_id` is a single space.
- One fare rule names an unknown zone, and one SRR pathway names a missing stop.
- SRR uses a different column order and has trips whose clock times wrap at midnight: one confirmed across stops, one confirmed within a row, one unconfirmed, one small backwards step, and one trip that genuinely starts after midnight.
- MTC has a `service_id` with a trailing space, and one row whose values are all blank.

`expected-upstream/` is the output of **upstream's own** `merge_unified()` from `ungalsoththu/ChennaiGTFS` `scripts/harmonize_v02.py` at commit `af0742dba777f9657ed6fda2046d6c2a721d630b`, run on these fixtures with Python 3.13. The runner copied the fixtures into a temporary `data/` folder and set the module's `DATA` path to it. Our merge with all fixes disabled must reproduce these files byte for byte (`packages/gtfs/src/build/build.test.ts`).

Do not edit `expected-upstream/` by hand.

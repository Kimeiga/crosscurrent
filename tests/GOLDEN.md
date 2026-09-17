# Original Python reference fixtures

`golden.json` retains sixty twelve-turn transcripts from the original v0.2 Python reference run. Each entry contains the action transcript and a SHA-256 digest of all twelve expected states, in order.

The pre-encoding JSON archive had SHA-256:

`ad7bd9d300bdf742decd8c3c53762d099815ad9604d593a5cfc43b8d56b2fe57`

Each action is three characters: D/S/R for Deploy/Shift/Recall, a hexadecimal rank 1 through d, then front index plus one (zero for Recall). Each turn stores player 0 followed by player 1. Each match is 72 characters.

The expected digest was computed from the original expected states, not from the TypeScript implementation. Canonical serialization is a JSON array of twelve states with object keys sorted alphabetically, no whitespace, and array order preserved. The test independently replays every transcript in the TypeScript engine, canonicalizes the resulting states, and compares the digest. This retains coverage of all 720 reference transitions while avoiding a 194 KB redundant fixture.

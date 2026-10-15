#!/bin/sh
# GOPS search-bot tuning, the protocol used for the Crosscurrent bot: head-to-head duels at 4,000
# iterations, then the chosen settings against fixed baselines. Produces gops-tuning.log. Run from research/sim.
S=./target/release/crosscurrent-sim
B=mctsx:4000
echo "=== rollouts: chance of bidding the card nearest the prize (r), against uniform rollouts"
for r in 0.5 0.8 0.95; do $S match rules=gops a=$B:r$r b=$B games=600 seed=401 2>/dev/null | head -1; done
echo "=== rollouts: head-to-head between biased settings"
$S match rules=gops a=$B:r0.8 b=$B:r0.5 games=600 seed=402 2>/dev/null | head -1
$S match rules=gops a=$B:r0.95 b=$B:r0.8 games=600 seed=403 2>/dev/null | head -1
echo "=== r0.8 against baselines"
for b in prize above random; do $S match rules=gops a=$B:r0.8 b=$b games=400 seed=404 2>/dev/null | head -1; done
$S match rules=gops a=mctsx:1000:r0.8 b=prize games=400 seed=405 2>/dev/null | head -1
echo "=== exploration (g) with r0.8, against the default 0.2"
for g in 0.1 0.3; do $S match rules=gops a=$B:r0.8:g$g b=$B:r0.8 games=600 seed=406 2>/dev/null | head -1; done
echo "=== purification (p) with r0.8, against the default 0.1"
for p in 0.03 0.2 0; do $S match rules=gops a=$B:r0.8:p$p b=$B:r0.8 games=600 seed=407 2>/dev/null | head -1; done
echo "=== purification beyond 0.2 (GOPS, r0.8), against p0.2"
for p in 0.3 0.5; do $S match rules=gops a=$B:r0.8:p$p b=$B:r0.8:p0.2 games=600 seed=408 2>/dev/null | head -1; done
echo "=== p0.2 baseline checks (GOPS)"
for b in prize above; do $S match rules=gops a=$B:r0.8:p0.2 b=$b games=400 seed=409 2>/dev/null | head -1; done
$S match rules=gops a=mctsx:16000:r0.8:p0.2 b=above games=200 seed=410 2>/dev/null | head -1
echo "=== Crosscurrent v0.3: is the default purification still best?"
for p in 0.2 0.05; do $S match rules=base+s234+tbstr a=$B:p$p b=$B games=600 seed=411 2>/dev/null | head -1; done
echo "=== diagnostics: fixed prize order (no chance) against the baselines"
for b in prize above; do $S match rules=gops+asc a=$B:r0.8:p0.2 b=$b games=400 seed=412 2>/dev/null | head -1; done
echo "=== diagnostics: GOPS budget ladder, 400 games each"
$S match rules=gops a=$B:r0.8:p0.2 b=mctsx:1000:r0.8:p0.2 games=400 seed=413 2>/dev/null | head -1
$S match rules=gops a=mctsx:16000:r0.8:p0.2 b=$B:r0.8:p0.2 games=400 seed=414 2>/dev/null | head -1
$S match rules=gops a=mctsx:64000:r0.8:p0.2 b=above games=100 seed=415 2>/dev/null | head -1
echo "=== tuned GOPS bot (r0.8, p0.2) against the baselines by budget"
for n in 1000 16000; do $S match rules=gops a=mctsx:$n:r0.8:p0.2 b=prize games=200 seed=420 2>/dev/null | head -1; done
$S match rules=gops a=mctsx:1000:r0.8:p0.2 b=above games=200 seed=421 2>/dev/null | head -1
$S match rules=gops a=mctsx:64000:r0.8:p0.2 b=prize games=100 seed=422 2>/dev/null | head -1
for n in 1000 4000; do $S match rules=gops a=mctsx:$n:r0.8:p0.2 b=random games=200 seed=423 2>/dev/null | head -1; done

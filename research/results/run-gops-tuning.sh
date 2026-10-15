#!/bin/sh
# GOPS search-bot tuning, the protocol used for the Crosscurrent bot: head-to-head duels at 4,000
# iterations (600 games each), then the winner against fixed baselines. Run from research/sim.
S=./target/release/crosscurrent-sim
B=mctsx:4000
echo "=== rollouts: chance of bidding the card nearest the prize (r), against uniform rollouts"
for r in 0.5 0.8 0.95; do $S match rules=gops a=$B:r$r b=$B games=600 seed=401 | head -1; done
echo "=== rollouts: head-to-head between biased settings"
$S match rules=gops a=$B:r0.8 b=$B:r0.5 games=600 seed=402 | head -1
$S match rules=gops a=$B:r0.95 b=$B:r0.8 games=600 seed=403 | head -1
echo "=== r0.8 against baselines"
for b in prize above random; do $S match rules=gops a=$B:r0.8 b=$b games=400 seed=404 | head -1; done
$S match rules=gops a=mctsx:1000:r0.8 b=prize games=400 seed=405 | head -1
echo "=== exploration (g) with r0.8, against the default 0.2"
for g in 0.1 0.3; do $S match rules=gops a=$B:r0.8:g$g b=$B:r0.8 games=600 seed=406 | head -1; done
echo "=== purification (p) with r0.8, against the default 0.1"
for p in 0.03 0.2 0; do $S match rules=gops a=$B:r0.8:p$p b=$B:r0.8 games=600 seed=407 | head -1; done

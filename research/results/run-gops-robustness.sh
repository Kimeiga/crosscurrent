#!/bin/sh
# Does the Crosscurrent-versus-GOPS gap depend on the bot settings? The 4k-vs-1k pairing again under settings
# other than the tuned ones (untuned uniform rollouts, no purification), and the GOPS settings against the two
# simple GOPS rules. Produces gops-robustness.log. Run from research/sim.
S=./target/release/crosscurrent-sim
echo "=== GOPS, 4k vs 1k under other settings"
$S match rules=gops a=mctsx:4000 b=mctsx:1000 games=1200 seed=901
$S match rules=gops a=mctsx:4000:r0.8 b=mctsx:1000:r0.8 games=1200 seed=902
$S match rules=gops a=mctsx:4000:r0.8:p0 b=mctsx:1000:r0.8:p0 games=1200 seed=903
echo "=== Crosscurrent v0.3, 4k vs 1k under other settings"
$S match rules=base+s234+tbstr a=mctsx:4000:u b=mctsx:1000:u games=1200 seed=904
$S match rules=base+s234+tbstr a=mctsx:4000:p0 b=mctsx:1000:p0 games=1200 seed=905
echo "=== GOPS settings against the simple rules"
for a in mctsx:4000 mctsx:4000:r0.8:p0; do
  for b in prize above; do $S match rules=gops a=$a b=$b games=400 seed=906 2>/dev/null | head -1; done
done

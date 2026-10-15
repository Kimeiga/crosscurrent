#!/bin/sh
# Exact small decks and the effective-moves profile for the GOPS comparison (gops-exact.log, gops-profile.log).
# Run from research/sim.
S=./target/release/crosscurrent-sim
{
  for n in 3 4 5 6; do $S exact rules=gops+n$n; done
  for n in 3 4 5 6; do $S exact rules=gops+asc+n$n; done
  $S exact rules=gops+n7
  $S exact rules=gops+asc+n7
} > ../results/gops-exact.log
{
  echo "=== profile iters=4000"
  $S profile rules=base+s234+tbstr iters=4000 games=60 seed=801
  $S profile rules=gops iters=4000 games=60 seed=802
  $S profile rules=gops+asc iters=4000 games=60 seed=803
  echo "=== profile iters=64000"
  $S profile rules=base+s234+tbstr iters=64000 games=30 seed=804
  $S profile rules=gops iters=64000 games=30 seed=805
} > ../results/gops-profile.log

#!/bin/sh
# Sweep 6: controls missing from the finalist comparison (2/3/4 without a tiebreak; 1/2/3 with the
# total-strength tiebreak) and an independent second batch for the tiebreak candidates. Uses the
# target4 build, which also reports how many games ended level on points and who won them.
S=./target4/release/crosscurrent-sim
while pgrep -f run-sweep5.sh > /dev/null; do sleep 30; done
for v in base+s234 base+tbstr; do
  echo "=== $v"
  $S match rules=$v a=mctsx:4000 b=mctsx:1000 games=1200 seed=601
  $S match rules=$v a=mctsx:16000 b=mctsx:4000 games=600 seed=602
  $S match rules=$v a=mctsx:4000 b=mctsx:4000 games=600 seed=603
  $S final rules=$v policy=mctsx:4000 games=600 seed=604
  $S match rules=$v a=mcts:4000 b=mcts:1000 games=600 seed=605
done
for v in base+s234+tbfinal base+s234+tbstr base+tbfinal; do
  echo "=== $v (second batch)"
  $S match rules=$v a=mctsx:4000 b=mctsx:1000 games=2400 seed=801
  $S match rules=$v a=mctsx:16000 b=mctsx:4000 games=600 seed=802
  $S match rules=$v a=mcts:4000 b=mcts:1000 games=1200 seed=805
done

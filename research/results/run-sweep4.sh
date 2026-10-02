#!/bin/sh
# Sweep 4: 3/4/5 schedule for comparison with 2/3/4.
S=./target3/release/crosscurrent-sim
while pgrep -f run-sweep3.sh > /dev/null; do sleep 30; done
for v in base+cp:4=3,8=4,12=5+tbfinal base+cp:4=3,8=4,12=5+tbstr; do
  echo "=== $v"
  $S match rules=$v a=mctsx:4000 b=mctsx:1000 games=1200 seed=601
  $S match rules=$v a=mctsx:16000 b=mctsx:4000 games=600 seed=602
  $S match rules=$v a=mctsx:4000 b=mctsx:4000 games=600 seed=603
  $S final rules=$v policy=mctsx:4000 games=600 seed=604
  $S match rules=$v a=mcts:4000 b=mcts:1000 games=600 seed=605
done

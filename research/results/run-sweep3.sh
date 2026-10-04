#!/bin/sh
# Sweep 3: finalists with larger samples and a second search family.
S=./target/release/crosscurrent-sim
while pgrep -f run-sweep1b.sh > /dev/null; do sleep 30; done
for v in base base+tbfinal base+s111+tbfinal base+s111+tbstr base+s234+tbfinal base+s234+tbstr; do
  echo "=== $v"
  $S match rules=$v a=mctsx:4000 b=mctsx:1000 games=1200 seed=601
  $S match rules=$v a=mctsx:16000 b=mctsx:4000 games=600 seed=602
  $S match rules=$v a=mctsx:4000 b=mctsx:4000 games=600 seed=603
  $S final rules=$v policy=mctsx:4000 games=600 seed=604
  $S match rules=$v a=mcts:4000 b=mcts:1000 games=600 seed=605
done

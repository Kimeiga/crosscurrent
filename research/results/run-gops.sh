#!/bin/sh
# Head-to-head of Crosscurrent v0.3 and GOPS under one search bot and one protocol. Run from research/sim.
# Each game's bot uses its own tuned settings: Crosscurrent the defaults (tuned on v0.2, rechecked on v0.3 in
# gops-tuning.log), GOPS rollouts that usually bid near the prize and purification 0.2 (gops-tuning.log).
# `gops+asc` reveals the prizes in a fixed known order: the same game without the shuffle.
S=./target/release/crosscurrent-sim
protocol() {
  R=$1; T=$2; SEED=$3
  echo "=== $R"
  $S match rules=$R a=mctsx:4000$T b=mctsx:1000$T games=2400 seed=$SEED
  $S match rules=$R a=mctsx:16000$T b=mctsx:4000$T games=1200 seed=$((SEED + 1))
  $S match rules=$R a=mcts:4000$T b=mcts:1000$T games=1200 seed=$((SEED + 2))
  $S match rules=$R a=mctsx:64000$T b=mctsx:16000$T games=400 seed=$((SEED + 3))
  $S match rules=$R a=mctsx:4000$T b=mctsx:4000$T games=1200 seed=$((SEED + 4))
  $S final rules=$R policy=mctsx:4000$T games=1200 seed=$((SEED + 5))
}
protocol base+s234+tbstr "" 501
protocol gops ":r0.8:p0.2" 601
protocol gops+asc ":r0.8:p0.2" 701

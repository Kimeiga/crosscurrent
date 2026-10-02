#!/bin/sh
# Sweep 2: flat schedules crossed with tiebreaks (screening protocol, larger L1 sample).
S=./target3/release/crosscurrent-sim
for v in base+s111+tbstr base+s111+tbearly base+s111+tbfinal base+tbearly base+s234+tbfinal base+s234+tbstr \
         base+s4x3flat+tbfinal base+s4x3flat+tbstr base+s111+tbstr+norecall base+s111+tbstr+noshift; do
  echo "=== $v"
  $S match rules=$v a=mctsx:4000 b=mctsx:1000 games=600 seed=401
  $S match rules=$v a=mctsx:4000 b=mctsx:4000 games=400 seed=403
  $S final rules=$v policy=mctsx:4000 games=400 seed=404
done

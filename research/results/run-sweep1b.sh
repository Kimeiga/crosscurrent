#!/bin/sh
# Sweep 1b: remaining exploratory variants with the screening protocol, then sweep 2.
S=./target3/release/crosscurrent-sim
for v in base+s124 base+s4x3 base+s6x2 base+s6x2+exnone base+s6inc base+s12inc+exnone base+exnone base+exwin base+exall base+noshift base+norecall base+initlow base+initlow+tbfinal base+inithigh base+initbehind base+initahead; do
  echo "=== $v"
  $S match rules=$v a=mctsx:4000 b=mctsx:1000 games=400 seed=201
  $S match rules=$v a=mctsx:4000 b=mctsx:4000 games=400 seed=203
  $S final rules=$v policy=mctsx:4000 games=400 seed=204
done
sh ../results/run-sweep2.sh

#!/bin/sh
# Variant sweep 1. Same protocol for every variant; uses the initiative-aware build.
S=./target2/release/crosscurrent-sim
while pgrep -f run-base-audit.sh > /dev/null; do sleep 20; done
for v in base base+tbfinal base+tbstr base+s111 base+s111+tbfinal base+s234 base+s124 \
         base+s4x3 base+s6x2 base+s6x2+exnone base+s6inc base+s12inc+exnone \
         base+exnone base+exwin base+exall base+noshift base+norecall \
         base+initlow base+initlow+tbfinal base+inithigh base+initbehind base+initahead; do
  echo "=== $v"
  $S match rules=$v a=mctsx:4000 b=mctsx:1000 games=400 seed=201
  $S match rules=$v a=mctsx:16000 b=mctsx:4000 games=400 seed=202
  $S match rules=$v a=mctsx:4000 b=mctsx:4000 games=400 seed=203
  $S final rules=$v policy=mctsx:4000 games=400 seed=204
  $S match rules=$v a=mctsx:4000 b=random games=200 seed=205
done

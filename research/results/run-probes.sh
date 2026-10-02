#!/bin/sh
# Scripted-strategy probes against the 4,000-iteration search bot under the adopted v0.3 rules.
S=./target4/release/crosscurrent-sim
R=${1:-base+s234+tbstr}
echo "=== probes $R"
for p in onefront highfirst pile mirror deployonly casual lowfirst; do
  $S match rules=$R a=mctsx:4000 b=$p games=200 seed=901
done
$S match rules=$R a=mctsx:16000 b=lowfirst games=200 seed=902
$S match rules=$R a=lowfirst b=casual games=400 seed=903
$S match rules=$R a=tactical b=lowfirst games=400 seed=904

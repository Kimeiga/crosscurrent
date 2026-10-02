#!/bin/sh
# Sweep 5: product difficulty calibration under the adopted rules (Easy, Medium and Hard are
# mctsx:300, mctsx:3000 and mctsx:24000). Usage: sh run-sweep5.sh <rules>, run from research/sim.
S=./target4/release/crosscurrent-sim
R=${1:-base+s234+tbstr}
echo "=== calibration $R"
$S match rules=$R a=mctsx:300 b=random games=400 seed=701
$S match rules=$R a=mctsx:300 b=casual games=400 seed=702
$S match rules=$R a=mctsx:300 b=tactical games=400 seed=703
$S match rules=$R a=mctsx:3000 b=mctsx:300 games=400 seed=704
$S match rules=$R a=mctsx:3000 b=tactical games=400 seed=705
$S match rules=$R a=mctsx:24000 b=mctsx:3000 games=400 seed=706
$S match rules=$R a=mctsx:24000 b=tactical games=200 seed=707

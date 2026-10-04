#!/bin/sh
# Base (v0.2) rules audit. Policies: mctsx = SM-MCTS (regret matching) with exact final turn.
S=./target/release/crosscurrent-sim
$S match rules=base a=mctsx:4000 b=mctsx:1000 games=400 seed=101
$S match rules=base a=mctsx:16000 b=mctsx:4000 games=400 seed=102
$S match rules=base a=mctsx:64000 b=mctsx:16000 games=400 seed=103
$S match rules=base a=mctsx:16000 b=tactical games=400 seed=104
$S match rules=base a=mctsx:16000 b=expert games=400 seed=105
$S match rules=base a=mctsx:16000 b=casual games=400 seed=106
$S match rules=base a=mctsx:16000 b=random games=400 seed=107
$S match rules=base a=mctsx:16000 b=mctsx:16000 games=400 seed=108
$S final rules=base policy=mctsx:16000 games=400 seed=109

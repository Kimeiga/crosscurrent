# Research harness

A Rust simulator used to measure Crosscurrent and rule variants. It has no dependencies beyond the Rust standard library.

```sh
cd research/sim
cargo build --release
S=./target/release/crosscurrent-sim

# Engine checks
node --experimental-transform-types ../scripts/export-transcripts.ts /tmp/transcripts.txt
$S validate file=/tmp/transcripts.txt        # Rust engine == src/engine.ts, transition by transition
$S symmetry rules=base+s111+tbstr             # label-swap invariance and card conservation
cargo build && ./target/debug/crosscurrent-sim selftest   # fast final-turn matrix == full resolution

# Matches: seats alternate, results are for policy A, draws count one half
$S match rules=base+s111+tbstr a=mctsx:16000 b=mctsx:4000 games=400 seed=1
# Final-turn analysis: play to turn 11 with a policy, then solve turn 12 exactly
$S final rules=base+s111+tbstr policy=mctsx:4000 games=400 seed=1
```

`results/` holds the raw logs (`*.log`) and the scripts that produced them (`run-*.sh`). `table.py` turns the screening logs into the markdown table in RESEARCH.md, `finalists.py` pools the finalist runs (sweeps 3, 4 and 6), `to_json.py` exports every measurement for `docs/BENCHMARKS.json`, and `summarize.py` condenses a sweep log into one row per variant.

Each `match` prints the result line, a line on comebacks and order mix, and (from the `target4` build on) how many games ended level on points and how the tiebreak settled them for policy A.

## Rule variants

A variant name is `base` plus `+`-separated modifiers. `base` is the v0.2 rules exactly.

| Modifier | Meaning |
| --- | --- |
| `tbfinal` | Equal points: more total strength at the turn-12 scoring wins |
| `tbstr` | Equal points: more total strength summed over all scorings wins |
| `tbearly` | Equal points: whoever led after the previous scoring, then the one before |
| `tbhand` | Equal points: higher total of cards left in hand |
| `s111`, `s234`, `s124`, `s135` | Points per front at turns 4/8/12 |
| `s4x3`, `s4x3flat` | Scoring on turns 3/6/9/12 worth 1/2/3/4 or 1/1/1/1 |
| `cp:T=P,...` | Any schedule, for example `cp:4=3,8=4,12=5` scores 3, 4 and 5 per front at turns 4, 8 and 12 |
| `s6x2`, `s6inc` | Scoring every second turn, flat or 1–6 |
| `s12`, `s12inc` | Scoring every turn |
| `exnone`, `exwin`, `exall` | No exhaustion; only the front winner exhausts; whole board spent |
| `noshift`, `norecall`, `free`, `noprotect`, `recallnow` | Action and cost variants |
| `majority` | A scoring's points go to whoever wins more fronts there |
| `initlow`, `inithigh` | Sequential turns: the player whose previous order named the lower (higher) card chooses second, after seeing the other order; equal cards stay simultaneous |
| `initbehind`, `initahead` | Sequential turns: the trailing (leading) player chooses second |

## Policies

| Policy | Description |
| --- | --- |
| `random` | Uniform legal orders |
| `deployonly`, `onefront`, `lowfirst`, `highfirst`, `pile`, `mirror` | Fixed scripted styles used to look for dominant simple strategies |
| `casual`, `tactical`, `expert` | Faithful ports of the v0.2 shipped computer levels (one-turn heuristic plus fictitious play) |
| `mcts:N` | Simultaneous-move MCTS with regret matching (outcome sampling), N iterations per decision |
| `mctsx:N` | The same, with the final turn solved exactly as a matrix game |

Tuned defaults: exploration γ = 0.2, final choice samples the average strategy after dropping actions below 10%, rollouts deploy a random card 90% of the time. These were tuned head-to-head on the v0.2 rules (see RESEARCH.md).

## Interpretation

All match results are simulations with particular bots. They are evidence about the rules as played by these algorithms, not proofs about optimal play. The final-turn solver is exact for the position it is given, but the positions come from bot play. See `docs/RESEARCH.md` for the interpretation standard.

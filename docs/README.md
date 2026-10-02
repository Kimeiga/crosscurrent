# Design and Research Documentation

Crosscurrent's source code is only part of the project. These documents preserve the design problem, historical evidence, and standards used to judge future changes.

- [RESEARCH.md](./RESEARCH.md): full research narrative, comparisons with Piquet/Schnapsen/GOPS, Crosscurrent prototype measurements, statistical interpretation, open questions, and novelty caveats.
- [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md): why each major mechanic exists and what problem it is intended to solve.
- [EVALUATION.md](./EVALUATION.md): the measurement framework for rule and AI changes.
- [BENCHMARKS.json](./BENCHMARKS.json): machine-readable historical benchmark numbers.
- [RULES.md](./RULES.md): current rules.
- [../tests/GOLDEN.md](../tests/GOLDEN.md): independent rules-engine reference verification.

The key principle is that **fairness, depth, and low exploitability are different properties**. A symmetric 50/50 self-play result is necessary evidence for some questions but is never sufficient evidence that the game is strategically good.

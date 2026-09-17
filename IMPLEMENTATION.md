# Homepage full-game animation

Scope: replace the single-turn homepage demonstration, keep Play vs AI above the fold, and preserve the live game rules and all three modes.

The repository was initialized from the recovered complete source bundle, with the current deployed App, Table, theme and local mode restored from AppDeploy snapshot `1789675538248`. The homepage adds a complete scripted game rather than modifying gameplay.

The animation renderer and standalone preview use the same TypeScript modules. No video, external animation framework, generated illustration or opacity tween is used. Timeline stages retain all 26 card identities. Rule resolution produces the scoring and cleanup states; presentation interpolation changes only their drawn positions.

Publication to GitHub and publication to AppDeploy are separate. The AppDeploy site must not be described as updated until an actual deployment finishes successfully.

# Crit 5 — A game

## What was the breakthrough that moved the work forward?

The agent conceived Kage Run mechanics
that consisted of sticky/slippery zones and crumbling obstacles that contained a
feature where a section of the zone had to be clean for the gate to open. The
agent could not determine what would fall under a ‘fair’ mechanic design
as it had never played the game before. The agent was merely able to determine
that everything was fully solvable. As a result, the agent was overly generous
in one case and under in the other. Ice runs would end in nothing, with no
possible landing, or else there would be pillar sections that had a one pixel
sweet spot. Similarly, its interpretation of easier difficulty resulted in wiping
sections altogether.

The final puzzle I resolved was the quietest. Some logic prevented spikes from
landing on any platform carrying a target, but once there were six targets spread
over eight platforms, almost no platform per section was usable. There was
no failure state, everything only presented itself in the game.

I eventually learned to stop requesting ‘harder’ difficulties and to simply mark
them down. Each ice run ends in acatch. 'Jump checks' are distributed at a
checkpoint to clear the gate. A spike is placed at an end, never on a target’s
line. All of these are now assertions in 'spec/game-rules.test.ts' and not requests
in a prompt.

Progression is still unsolved. So instead I proposed a shrinking clock, and stricter jumps-per-target ratio as levels progress. So not harder puzzles. It works though, and it is a
proxy.

## What did this work change about who I want to be as a software developer?

I walked in thinking my job was to describe what I wanted with enough precision. This week reminded me of the gap that precision cannot fill. The agent has no felt experience. Anything that exists only in the playing: fairness, rhythm, the point at which hard turns are unfair

All of that has to come from me. I want to capture the taste and code it as constraints the agent can't argue with.

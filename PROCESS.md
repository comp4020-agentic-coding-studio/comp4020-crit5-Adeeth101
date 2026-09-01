# Process overview

## What I made

Kage Run, a wordless endless sticky-ninja game. Drag to send the ninja on a visible arc through targets, stone, ice runs, crumbling ledges, spikes, and gaps. Checkpoints are numbered stages: clear each target with a jump left in reserve and the gate opens.

## The moments that mattered

### Moment 1 — the ice that would not let go

What happened: Landing on the slippery ice and leaving the wall while sliding one frame and then rotating and sliding forever.

Instead of the obvious thing: Instead of the obvious (and simple) fix to widen the collision tolerance (how ice works) or damp the velocity (to make it look correct) I took a different approach and traced the frame order. The wall snapped the ninja to exactly wall.x - radius, which the overlap test considers not overlapping. So, the next frame, the collision resolution and ejection would happen. I added a rule to overcome the ice: having a grip on anything that is not ice takes precedence over what was underneath the ninja.

How I knew: The ninja now parks rotation frozen and ensures Ice Has Sticky Ends, so no ice run can be made to produce the case.

Citation: [`f4e32f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Adeeth101/commit/f4e32f5)

### Moment 2 — writing difficulty down instead of asking for it

What happened: every request for "harder" either turned trivial or brutal.

Instead of the obvious thing: stopped adding prompts and coded the curve — 70s lose 5 a level to a floor of 25, spare jumps from checkpoint 5 6→3, checkpoints 1–4 frozen because they already played well.

How I knew: spec/game-rules.test.ts asserts the opening ramp is unchanged, the curve is monotonic, and every checkpoint gives at least one jump per target plus one for the gate. An unfair section now fails the build.

Citation: [`f4e32f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Adeeth101/commit/f4e32f5)

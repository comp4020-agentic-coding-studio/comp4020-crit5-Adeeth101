# Process overview

## What I built

Kage Run is a wordless endless sticky-ninja game. A pointer drag launches the
ninja along a visible arc through targets, stone surfaces, ice runs, crumble
platforms, spikes and gaps. Checkpoints become distinct numbered levels: every
target must be cleared while one jump remains, then the next level grants a
larger budget and a more inventive route. The run ends in a fall, spike hit, or
spent jump budget and reports checkpoint, target, saved-jump, time and score
statistics.

## The important prompt decisions

The complete user wording is preserved outside this repository in the root
workspace archive: `../prompts/crit-5-verbatim.md`. This repo keeps only the
cleaned decisions that changed the work.

1. **Core loop.** Build a continuous Sticky Ninja Academy-inspired run around
   drag/release trajectory launching, surface-specific movement, target hits,
   checkpoint gates, finite jumps and score pressure. The resulting playable
   first draft, including the focused checkpoint-rule test, is in
   [`f4e32f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Adeeth101/commit/f4e32f5).

2. **Earlier variety.** Make progression visibly faster and introduce multiple
   composed levels early. Add more jumps to pay for denser platforming, timed
   crumble platforms, and an arrow that points toward the nearest live target.
   Levels 1–3 are handcrafted routes; later sections mix those mechanics
   procedurally. This is part of [`f4e32f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Adeeth101/commit/f4e32f5).

3. **Fairness corrections from play.** Ice runs now have sticky catches at both
   ends, vertical blockers leave readable routes, crumble platforms last about
   2.4 seconds, sticky contacts win when ice and a catch overlap, and unlocked
   checkpoint hitboxes are generous. These changes are captured in the same
   implementation commit and protected by the passing build/test loop.

## Verification

`corepack pnpm check` passes strict TypeScript, the Vite production build, and
all 20 tests. The local preview returned HTTP 200 with the current production
bundle after each revision. The student will add the reflection in
`reflections/crit-5.md`.


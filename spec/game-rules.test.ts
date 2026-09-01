import { describe, expect, it } from "vitest";
import {
  canClearCheckpoint,
  FLOOR_CHECKPOINT_SECONDS,
  ICE_SPIKE_RUNWAY,
  formatTime,
  jumpsForCheckpoint,
  MIN_JUMPS_TO_CLEAR,
  OPENING_CHECKPOINT_SECONDS,
  scoreRun,
  secondsForCheckpoint,
  slackForCheckpoint,
  SPIKE_CLEARANCE,
  SPIKE_RUNWAY,
  spikePlacement,
  STARTING_LIVES,
  targetsForCheckpoint,
} from "../gameRules.ts";

describe("checkpoint rule", () => {
  it("opens only after every target is hit with a jump kept in reserve", () => {
    expect(canClearCheckpoint(1, 3)).toBe(false);
    expect(canClearCheckpoint(0, 0)).toBe(false);
    expect(canClearCheckpoint(0, 1)).toBe(true);
  });

  it("raises pressure gradually", () => {
    expect(targetsForCheckpoint(1)).toBe(2);
    expect(targetsForCheckpoint(2)).toBe(3);
    expect(targetsForCheckpoint(7)).toBe(6);
    expect(jumpsForCheckpoint(1)).toBe(8);
  });
});

// Difficulty is the thing this game is least able to judge for itself, so the
// curve is pinned here rather than left to whatever the generator feels like.
describe("difficulty progression", () => {
  const deep = [...Array(24).keys()].map((index) => index + 1);

  it("leaves the opening ramp alone", () => {
    // Checkpoints 1--4 are the part that already plays well; the ramp starts
    // after them, so these budgets are frozen deliberately.
    expect(deep.slice(0, 4).map(jumpsForCheckpoint)).toEqual([8, 9, 10, 11]);
    expect(deep.slice(0, 4).map(slackForCheckpoint)).toEqual([6, 6, 6, 6]);
  });

  it("tightens the jumps-per-target ratio as the run goes deeper", () => {
    expect(slackForCheckpoint(9)).toBeLessThan(slackForCheckpoint(4));
    for (const checkpoint of deep.slice(1)) {
      expect(slackForCheckpoint(checkpoint)).toBeLessThanOrEqual(slackForCheckpoint(checkpoint - 1));
    }
  });

  it("shortens the clock every checkpoint until it bottoms out", () => {
    expect(secondsForCheckpoint(1)).toBe(OPENING_CHECKPOINT_SECONDS);
    for (const checkpoint of deep.slice(1)) {
      expect(secondsForCheckpoint(checkpoint)).toBeLessThanOrEqual(secondsForCheckpoint(checkpoint - 1));
    }
    expect(secondsForCheckpoint(99)).toBe(FLOOR_CHECKPOINT_SECONDS);
  });

  it("never hands out a checkpoint that cannot be cleared", () => {
    // One jump per target, one more to reach the gate: below that the section
    // is unfair rather than hard, however deep the run has gone.
    for (const checkpoint of deep) {
      expect(jumpsForCheckpoint(checkpoint))
        .toBeGreaterThanOrEqual(targetsForCheckpoint(checkpoint) + MIN_JUMPS_TO_CLEAR);
      expect(slackForCheckpoint(checkpoint)).toBeGreaterThanOrEqual(3);
      expect(secondsForCheckpoint(checkpoint)).toBeGreaterThanOrEqual(FLOOR_CHECKPOINT_SECONDS);
    }
  });
});

describe("run score", () => {
  it("values checkpoint progress above the time bonus", () => {
    const quickOpening = scoreRun({ checkpoints: 0, targets: 2, jumpsSaved: 0, elapsedMs: 1_000 });
    const slowCheckpoint = scoreRun({ checkpoints: 1, targets: 2, jumpsSaved: 1, elapsedMs: 120_000 });
    expect(slowCheckpoint).toBeGreaterThan(quickOpening);
    expect(formatTime(65_900)).toBe("1:05");
  });
});

// A spike is the one piece of level furniture that kills on contact, so where
// it may sit is a fairness rule rather than a taste call.
describe("spike placement", () => {
  const wide = { x: 1_000, w: 400 };

  it("keeps a landing at both ends of the platform", () => {
    for (const preferRight of [true, false]) {
      const at = spikePlacement(wide, 60, SPIKE_RUNWAY, undefined, preferRight);
      expect(at).not.toBeNull();
      expect(at!).toBeGreaterThanOrEqual(wide.x + SPIKE_RUNWAY);
      expect(at! + 60).toBeLessThanOrEqual(wide.x + wide.w - SPIKE_RUNWAY);
    }
  });

  it("refuses a platform with no room to land either side", () => {
    expect(spikePlacement({ x: 0, w: 100 }, 60, SPIKE_RUNWAY, undefined, false)).toBeNull();
    expect(spikePlacement({ x: 0, w: 200 }, 54, ICE_SPIKE_RUNWAY, undefined, false)).toBeNull();
  });

  it("takes the end furthest from the platform's target", () => {
    const nearLeft = spikePlacement(wide, 60, SPIKE_RUNWAY, wide.x + 60, false);
    const nearRight = spikePlacement(wide, 60, SPIKE_RUNWAY, wide.x + wide.w - 60, true);
    expect(nearLeft).toBe(wide.x + wide.w - SPIKE_RUNWAY - 60);
    expect(nearRight).toBe(wide.x + SPIKE_RUNWAY);
  });

  it("leaves the platform clean rather than sit under the target's line", () => {
    // A target dead centre leaves no end far enough away to be fair.
    expect(spikePlacement({ x: 0, w: 220 }, 60, SPIKE_RUNWAY, 110, false)).toBeNull();
  });

  it("never puts a spike within the clearance of its target", () => {
    for (let w = 160; w <= 520; w += 20) {
      const platform = { x: 0, w };
      for (let line = 40; line < w - 40; line += 20) {
        for (const preferRight of [true, false]) {
          const at = spikePlacement(platform, 60, SPIKE_RUNWAY, line, preferRight);
          if (at === null) continue;
          expect(Math.abs(at + 30 - line)).toBeGreaterThanOrEqual(SPIKE_CLEARANCE);
        }
      }
    }
  });
});

describe("lives", () => {
  it("gives a run three attempts", () => {
    expect(STARTING_LIVES).toBe(3);
  });
});

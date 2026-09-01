export const MIN_JUMPS_TO_CLEAR = 1;

// The clock the opening checkpoint hands you, and the shortest one the run
// ever hands you however deep it goes.
export const OPENING_CHECKPOINT_SECONDS = 70;
export const FLOOR_CHECKPOINT_SECONDS = 25;

// Attempts a run gets. A death costs one and hands the section back as it was
// found; the last one ends the run.
export const STARTING_LIVES = 3;

// Clear landing a spike must leave at each end of the platform it sits on, and
// the distance it keeps from that platform's target so a clean hit is still a
// clean landing.
export const SPIKE_RUNWAY = 44;
export const ICE_SPIKE_RUNWAY = 84;
export const SPIKE_CLEARANCE = 70;

export interface RunStats {
  checkpoints: number;
  targets: number;
  jumpsSaved: number;
  elapsedMs: number;
}

export function targetsForCheckpoint(checkpoint: number): number {
  return Math.min(6, Math.max(2, checkpoint + 1));
}

/** Jumps beyond one per target: the travel budget a checkpoint hands you on
 *  top of the shots the targets themselves cost.
 *
 *  The first four checkpoints keep the full six, because that opening ramp
 *  reads well as-is. From the fifth it comes off one every second checkpoint,
 *  so the same six targets have to be strung into fewer launches and lines
 *  that used to work as separate hops have to be chained into one. It floors
 *  at three: below that a section stops being solvable rather than hard. */
export function slackForCheckpoint(checkpoint: number): number {
  return Math.max(3, 6 - Math.floor(Math.max(0, checkpoint - 3) / 2));
}

export function jumpsForCheckpoint(checkpoint: number): number {
  return targetsForCheckpoint(checkpoint) + slackForCheckpoint(checkpoint);
}

/** Seconds on the clock for one checkpoint. Five come off each time, down to
 *  a floor that still leaves room to cross a section without dawdling. */
export function secondsForCheckpoint(checkpoint: number): number {
  const allowance = OPENING_CHECKPOINT_SECONDS - (Math.max(1, checkpoint) - 1) * 5;
  return Math.max(FLOOR_CHECKPOINT_SECONDS, allowance);
}

/** Where a spike may sit on a platform, or null if it cannot sit there fairly.
 *
 *  A spike always goes at one end, never the middle, so both approaches keep a
 *  landing; on ice that matters most, because once the ninja is sliding it
 *  cannot launch again until a wall catches it, and the only say it has over
 *  which way it slides is the direction it came down in. When the platform
 *  carries a target the spike takes the far end from it, and gives up entirely
 *  rather than sit under the target's line. */
export function spikePlacement(
  platform: { x: number; w: number },
  spikeWidth: number,
  runway: number,
  targetLine: number | undefined,
  preferRight: boolean,
): number | null {
  const left = platform.x + runway;
  const right = platform.x + platform.w - runway - spikeWidth;
  if (right < left) return null;
  if (targetLine === undefined) return preferRight ? right : left;
  const away = targetLine - platform.x < platform.w / 2 ? right : left;
  return Math.abs(away + spikeWidth / 2 - targetLine) < SPIKE_CLEARANCE ? null : away;
}

export function canClearCheckpoint(targetsRemaining: number, jumpsRemaining: number): boolean {
  return targetsRemaining === 0 && jumpsRemaining >= MIN_JUMPS_TO_CLEAR;
}

export function scoreRun(stats: RunStats): number {
  const progress = stats.checkpoints * 10_000;
  const precision = stats.targets * 450 + stats.jumpsSaved * 650;
  const timePressure = Math.floor(stats.elapsedMs / 1_000) * 12;
  return Math.max(0, progress + precision - timePressure);
}

export function formatTime(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

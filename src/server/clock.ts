/** Source of the current time. Server code never calls `new Date()` for business time. */
export type Clock = {
  now(): Date;
  /** Test support: makes the clock report `target` now and keep ticking from there; null restores system time. */
  set(target: Date | null): void;
};

export function createClock(): Clock {
  let offsetMs = 0;
  return {
    now: () => new Date(Date.now() + offsetMs),
    set: (target) => {
      offsetMs = target ? target.getTime() - Date.now() : 0;
    },
  };
}

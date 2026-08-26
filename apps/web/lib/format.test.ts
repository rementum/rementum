import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatDateTime, relativeTime } from "./format";

// Midday UTC so the calendar day is the same in every timezone the suite might run in.
const noon = "2026-01-15T12:00:00.000Z";

function ago(milliseconds: number): string {
  return new Date(Date.parse(noon) - milliseconds).toISOString();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("relativeTime", () => {
  it("counts up through minutes, hours, and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(noon));
    expect(relativeTime(ago(20_000))).toBe("just now");
    expect(relativeTime(ago(9 * 60_000))).toBe("9m ago");
    expect(relativeTime(ago(3 * 3_600_000))).toBe("3h ago");
    expect(relativeTime(ago(3 * 86_400_000))).toBe("3d ago");
  });

  it("falls back to an absolute date once the gap reaches two weeks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(noon));
    expect(relativeTime(ago(14 * 86_400_000))).toBe("Jan 1, 2026");
  });
});

describe("absolute formatting", () => {
  it("formats a date and a date with a time", () => {
    expect(formatDate(noon)).toBe("Jan 15, 2026");
    expect(formatDateTime(noon)).toMatch(/^Jan 15, 2026, \d{1,2}:\d{2}\s?(AM|PM)$/);
  });
});

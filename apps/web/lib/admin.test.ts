import { describe, expect, it } from "vitest";
import {
  accountStatus,
  accountsHref,
  buildBars,
  formatBytes,
  parsePage,
  parseQuery,
} from "./admin";

describe("parsePage and parseQuery", () => {
  it("falls back to the first page for anything but a positive integer", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parsePage(["4", "9"])).toBe(4);
  });

  it("trims the search and caps it at what the API accepts", () => {
    expect(parseQuery(undefined)).toBe("");
    expect(parseQuery("  ada@example.test ")).toBe("ada@example.test");
    expect(parseQuery(["first", "second"])).toBe("first");
    expect(parseQuery("x".repeat(250))).toHaveLength(200);
  });
});

describe("accountsHref", () => {
  it("keeps the search on every page and drops defaults from the URL", () => {
    expect(accountsHref("", 1)).toBe("/admin/accounts");
    expect(accountsHref("", 3)).toBe("/admin/accounts?page=3");
    expect(accountsHref("ada", 1)).toBe("/admin/accounts?q=ada");
    expect(accountsHref("a&b", 2)).toBe("/admin/accounts?q=a%26b&page=2");
  });
});

describe("accountStatus", () => {
  it("ranks disabled over unverified over active", () => {
    const now = "2026-09-02T12:00:00.000Z";
    expect(accountStatus({ emailVerifiedAt: null, disabledAt: now })).toBe("disabled");
    expect(accountStatus({ emailVerifiedAt: now, disabledAt: now })).toBe("disabled");
    expect(accountStatus({ emailVerifiedAt: null, disabledAt: null })).toBe("unverified");
    expect(accountStatus({ emailVerifiedAt: now, disabledAt: null })).toBe("active");
  });
});

describe("formatBytes", () => {
  it("reports 1024-based units with one decimal past bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(52_428_800)).toBe("50.0 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
    expect(formatBytes(3 * 1024 ** 4)).toBe("3.0 TB");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("buildBars", () => {
  const daily = [
    { date: "2026-08-31", signups: 0, calls: 4 },
    { date: "2026-09-01", signups: 2, calls: 0 },
    { date: "2026-09-02", signups: 1, calls: 8 },
  ];

  it("scales each series against its own busiest day", () => {
    const signups = buildBars(daily, "signups");
    expect(signups.total).toBe(3);
    expect(signups.peak).toBe(2);
    expect(signups.bars.map((bar) => bar.ratio)).toEqual([0, 1, 0.5]);
    const calls = buildBars(daily, "calls");
    expect(calls.total).toBe(12);
    expect(calls.peak).toBe(8);
    expect(calls.bars.map((bar) => bar.ratio)).toEqual([0.5, 0, 1]);
  });

  it("keeps an idle month flat instead of dividing by zero", () => {
    const idle = buildBars(
      daily.map((day) => ({ ...day, calls: 0 })),
      "calls",
    );
    expect(idle.peak).toBe(0);
    expect(idle.total).toBe(0);
    expect(idle.bars.every((bar) => bar.ratio === 0)).toBe(true);
    expect(buildBars([], "signups")).toEqual({ bars: [], total: 0, peak: 0 });
  });
});

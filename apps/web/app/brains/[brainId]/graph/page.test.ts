import { describe, expect, it } from "vitest";

describe("relation graph page", () => {
  it("loads in the server runtime without evaluating the WebGL renderer", async () => {
    const page = await import("./page");

    expect(page.default).toBeTypeOf("function");
  });
});

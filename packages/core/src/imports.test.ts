import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { inspectMarkdownArchive } from "./imports.js";

describe("Markdown archive inspection", () => {
  it("parses frontmatter, daily notes, and wiki links", async () => {
    const zip = new JSZip();
    zip.file(
      "Topics/Architecture.md",
      "---\ntitle: System architecture\ntags: [system]\n---\n# Architecture\n\nLinks to [[Decision]].",
    );
    zip.file("Daily/2026-08-23.md", "# Today\n\nA log entry.");
    const inspection = await inspectMarkdownArchive(
      "00000000-0000-4000-8000-000000000000",
      await zip.generateAsync({ type: "nodebuffer" }),
    );
    expect(inspection.documents).toHaveLength(2);
    expect(inspection.documents.find((doc) => doc.path.startsWith("Daily"))?.kind).toBe("log");
    expect(inspection.preview.unresolvedLinks).toEqual(["Decision"]);
  });

  it("rejects unsafe paths", async () => {
    const zip = new JSZip();
    zip.file("../escape.md", "bad");
    await expect(
      inspectMarkdownArchive(
        "00000000-0000-4000-8000-000000000000",
        await zip.generateAsync({ type: "nodebuffer" }),
      ),
    ).rejects.toThrow(/Unsafe archive path/);
  });
});

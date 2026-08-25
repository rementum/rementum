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

  it("rejects declared expanded content before extraction", async () => {
    const zip = new JSZip();
    zip.file("large.md", "x".repeat(4_096));
    await expect(
      inspectMarkdownArchive(
        "00000000-0000-4000-8000-000000000000",
        await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
        {
          maxArchiveBytes: 1_000_000,
          maxFiles: 10,
          maxFileBytes: 1_024,
          maxExpandedBytes: 2_048,
        },
      ),
    ).rejects.toMatchObject({ code: "expanded_import_too_large", status: 413 });
  });

  it("keeps CRC validation for bounded Markdown entries", async () => {
    const zip = new JSZip();
    zip.file("valid.md", "# Valid\n\nContent");
    await expect(
      inspectMarkdownArchive(
        "00000000-0000-4000-8000-000000000000",
        await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
      ),
    ).resolves.toMatchObject({ documents: [{ path: "valid.md" }] });
  });

  it("rejects a bounded entry whose content does not match its CRC", async () => {
    const zip = new JSZip();
    const content = Buffer.from("# Valid\n\nContent");
    zip.file("valid.md", content);
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    const contentOffset = archive.indexOf(content);
    expect(contentOffset).toBeGreaterThan(0);
    archive[contentOffset] = (archive[contentOffset] ?? 0) ^ 1;

    await expect(
      inspectMarkdownArchive("00000000-0000-4000-8000-000000000000", archive),
    ).rejects.toMatchObject({ code: "invalid_archive", status: 400 });
  });
});

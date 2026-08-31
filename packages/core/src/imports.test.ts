import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { inspectMarkdownArchive } from "./imports.js";

const tightLimits = {
  maxArchiveBytes: 1_000_000,
  maxFiles: 10,
  maxFileBytes: 1_024,
  maxExpandedBytes: 2_048,
};

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
    expect(inspection.preview.unresolvedLinks).toEqual(["decision"]);
    expect(
      inspection.documents.find((doc) => doc.path === "Topics/Architecture.md")?.aliases,
    ).toEqual(["architecture"]);
  });

  it("rejects unsafe paths", async () => {
    for (const path of [
      "../escape.md",
      "nested/../../escape.md",
      "/absolute.md",
      "C:/windows.md",
      "..\\escape.md",
    ]) {
      const zip = new JSZip();
      zip.file(path, "bad");
      await expect(
        inspectMarkdownArchive(
          "00000000-0000-4000-8000-000000000000",
          await zip.generateAsync({ type: "nodebuffer" }),
        ),
        path,
      ).rejects.toThrow(/Unsafe archive path/);
    }
  });

  it("checks an unsafe path even on an entry it would otherwise skip", async () => {
    const zip = new JSZip();
    zip.file("../escape.png", "bad");
    await expect(
      inspectMarkdownArchive(
        "00000000-0000-4000-8000-000000000000",
        await zip.generateAsync({ type: "nodebuffer" }),
      ),
    ).rejects.toThrow(/Unsafe archive path/);
  });

  it("refuses an archive larger than the limit before opening it", async () => {
    await expect(
      inspectMarkdownArchive("00000000-0000-4000-8000-000000000000", Buffer.alloc(2_048), {
        ...tightLimits,
        maxArchiveBytes: 1_024,
      }),
    ).rejects.toMatchObject({ code: "import_too_large", status: 413 });
  });

  it("refuses an archive with more entries than the limit", async () => {
    const zip = new JSZip();
    for (let index = 0; index < 4; index += 1) zip.file(`note-${index}.md`, "# Note");
    await expect(
      inspectMarkdownArchive(
        "00000000-0000-4000-8000-000000000000",
        await zip.generateAsync({ type: "nodebuffer" }),
        { ...tightLimits, maxFiles: 3 },
      ),
    ).rejects.toMatchObject({ code: "too_many_files", status: 413 });
  });

  it("ignores directory entries and anything that is not Markdown", async () => {
    const zip = new JSZip();
    zip.folder("notes");
    zip.file("notes/keep.md", "# Keep");
    zip.file("notes/logo.png", "binary");
    zip.file("notes/data.json", "{}");
    const inspection = await inspectMarkdownArchive(
      "00000000-0000-4000-8000-000000000000",
      await zip.generateAsync({ type: "nodebuffer" }),
    );
    expect(inspection.documents.map((doc) => doc.path)).toEqual(["notes/keep.md"]);
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

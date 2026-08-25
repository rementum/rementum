import path from "node:path";
import type { ArticleKind, ImportPreview } from "@owl-memory/contracts";
import JSZip from "jszip";
import { DomainError } from "./errors.js";
import { parseMarkdownDocument, slugify } from "./markdown.js";

export interface ImportLimits {
  maxArchiveBytes: number;
  maxFiles: number;
  maxFileBytes: number;
  maxExpandedBytes: number;
}

export interface ImportDocument {
  path: string;
  title: string;
  slug: string;
  kind: ArticleKind;
  keywords: string[];
  body: string;
  links: string[];
  warnings: string[];
  checksumInput: Buffer;
}

export interface ImportInspection {
  preview: ImportPreview;
  documents: ImportDocument[];
}

export const defaultImportLimits: ImportLimits = {
  maxArchiveBytes: 100 * 1024 * 1024,
  maxFiles: 5_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxExpandedBytes: 250 * 1024 * 1024,
};

export async function inspectMarkdownArchive(
  brainId: string,
  archive: Buffer,
  limits: ImportLimits = defaultImportLimits,
): Promise<ImportInspection> {
  if (archive.length > limits.maxArchiveBytes) {
    throw new DomainError("import_too_large", "Archive exceeds the 100 MB default limit", 413);
  }
  const zip = await JSZip.loadAsync(archive, {
    checkCRC32: true,
    createFolders: false,
  });
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > limits.maxFiles) {
    throw new DomainError(
      "too_many_files",
      `Archive contains more than ${limits.maxFiles} files`,
      413,
    );
  }
  const documents: ImportDocument[] = [];
  let expandedBytes = 0;
  for (const entry of entries) {
    const originalName = (entry as typeof entry & { unsafeOriginalName?: string })
      .unsafeOriginalName;
    if (originalName) validateArchivePath(originalName);
    const safePath = validateArchivePath(entry.name);
    if (!safePath.toLowerCase().endsWith(".md")) continue;
    const bytes = await entry.async("nodebuffer");
    expandedBytes += bytes.length;
    if (bytes.length > limits.maxFileBytes || expandedBytes > limits.maxExpandedBytes) {
      throw new DomainError(
        "expanded_import_too_large",
        "Expanded Markdown exceeds configured limits",
        413,
      );
    }
    if (bytes.includes(0))
      throw new DomainError("binary_markdown", `${safePath} contains binary data`);
    const fallback = path.basename(safePath, path.extname(safePath));
    const parsed = parseMarkdownDocument(bytes.toString("utf8"), fallback);
    const kind = suggestKind(safePath, fallback);
    const warnings: string[] = [];
    if (!parsed.body) warnings.push("empty-body");
    if (parsed.wikiLinks.length > 100) warnings.push("many-wiki-links");
    documents.push({
      path: safePath,
      title: parsed.title,
      slug: slugify(parsed.title),
      kind,
      keywords: parsed.tags,
      body: parsed.body,
      links: parsed.wikiLinks,
      warnings,
      checksumInput: bytes,
    });
  }
  const known = new Set(documents.flatMap((doc) => [doc.title.toLowerCase(), doc.slug]));
  const unresolved = [
    ...new Set(
      documents.flatMap((doc) =>
        doc.links.filter((link) => !known.has(link.toLowerCase()) && !known.has(slugify(link))),
      ),
    ),
  ].sort();
  return {
    documents,
    preview: {
      brainId,
      files: documents.map((doc) => ({
        path: doc.path,
        title: doc.title,
        suggestedSlug: doc.slug,
        suggestedKind: doc.kind,
        bytes: doc.checksumInput.length,
        links: doc.links,
        warnings: doc.warnings,
      })),
      unresolvedLinks: unresolved,
      totalBytes: expandedBytes,
    },
  };
}

function validateArchivePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized === ".." ||
    /^[a-zA-Z]:\//.test(normalized)
  ) {
    throw new DomainError("unsafe_archive_path", `Unsafe archive path: ${value}`);
  }
  return normalized;
}

function suggestKind(filePath: string, basename: string): ArticleKind {
  const segments = filePath.toLowerCase().split("/");
  const journalFolder = segments.some((segment) =>
    ["daily", "dailies", "journal", "journals"].includes(segment),
  );
  const dated = /^\d{4}-\d{2}-\d{2}(?:[-_ ].*)?$/.test(basename);
  return journalFolder && dated ? "log" : "canonical";
}

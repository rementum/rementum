import path from "node:path";
import { crc32 } from "node:zlib";
import type { ArticleKind, ImportPreview } from "@rementum/contracts";
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

type LoadedZipObject = JSZip.JSZipObject & {
  unsafeOriginalName?: string;
  _data?: { crc32?: number; uncompressedSize?: number };
  internalStream(type: "uint8array"): ZipEntryStream;
};

interface ZipEntryStream {
  on(event: "data", callback: (chunk: Uint8Array) => void): ZipEntryStream;
  on(event: "error", callback: () => void): ZipEntryStream;
  on(event: "end", callback: () => void): ZipEntryStream;
  pause(): ZipEntryStream;
  resume(): ZipEntryStream;
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
    checkCRC32: false,
    createFolders: false,
  });
  const entries = Object.values(zip.files).filter((entry) => !entry.dir) as LoadedZipObject[];
  if (entries.length > limits.maxFiles) {
    throw new DomainError(
      "too_many_files",
      `Archive contains more than ${limits.maxFiles} files`,
      413,
    );
  }
  const markdownEntries: Array<{ entry: LoadedZipObject; path: string }> = [];
  let declaredBytes = 0;
  for (const entry of entries) {
    const originalName = entry.unsafeOriginalName;
    if (originalName) validateArchivePath(originalName);
    const safePath = validateArchivePath(entry.name);
    if (!safePath.toLowerCase().endsWith(".md")) continue;
    const uncompressedSize = entry._data?.uncompressedSize;
    if (
      typeof uncompressedSize !== "number" ||
      !Number.isSafeInteger(uncompressedSize) ||
      uncompressedSize < 0
    ) {
      throw new DomainError("invalid_archive", "Archive entry size is invalid", 400);
    }
    declaredBytes += uncompressedSize;
    if (uncompressedSize > limits.maxFileBytes || declaredBytes > limits.maxExpandedBytes) {
      throw expandedImportTooLarge();
    }
    markdownEntries.push({ entry, path: safePath });
  }

  const documents: ImportDocument[] = [];
  let expandedBytes = 0;
  for (const { entry, path: safePath } of markdownEntries) {
    const bytes = await readEntryBounded(
      entry,
      Math.min(limits.maxFileBytes, limits.maxExpandedBytes - expandedBytes),
    );
    expandedBytes += bytes.length;
    if (bytes.includes(0))
      throw new DomainError("binary_markdown", `${safePath} contains binary data`);
    const fallback = path.basename(safePath, path.extname(safePath));
    let parsed: ReturnType<typeof parseMarkdownDocument>;
    try {
      parsed = parseMarkdownDocument(bytes.toString("utf8"), fallback);
    } catch (error) {
      if (error instanceof DomainError && error.code === "invalid_frontmatter") {
        throw new DomainError(error.code, `${safePath}: ${error.message}`, error.status);
      }
      throw error;
    }
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

async function readEntryBounded(entry: LoadedZipObject, maxBytes: number): Promise<Buffer> {
  const expectedCrc = entry._data?.crc32;
  if (!Number.isInteger(expectedCrc)) {
    throw new DomainError("invalid_archive", "Archive entry checksum is invalid", 400);
  }
  const expectedChecksum = expectedCrc as number;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;
    let checksum = 0;
    let settled = false;
    const stream = entry.internalStream("uint8array");
    const fail = (error: DomainError) => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error);
    };
    stream
      .on("data", (chunk) => {
        if (settled) return;
        const bytes = Buffer.from(chunk);
        bytesRead += bytes.length;
        if (bytesRead > maxBytes) {
          fail(expandedImportTooLarge());
          return;
        }
        checksum = crc32(bytes, checksum);
        chunks.push(bytes);
      })
      .on("error", () =>
        fail(new DomainError("invalid_archive", "Archive entry could not be decompressed", 400)),
      )
      .on("end", () => {
        if (settled) return;
        settled = true;
        if (checksum >>> 0 !== expectedChecksum >>> 0) {
          reject(new DomainError("invalid_archive", "Archive entry checksum does not match", 400));
          return;
        }
        resolve(Buffer.concat(chunks, bytesRead));
      })
      .resume();
  });
}

function expandedImportTooLarge(): DomainError {
  return new DomainError(
    "expanded_import_too_large",
    "Expanded Markdown exceeds configured limits",
    413,
  );
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

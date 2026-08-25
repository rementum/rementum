---
name: brain-import
description: Scope and import Markdown or an Obsidian vault into Owl Memory without creating duplicates or silently promoting content.
---

# Import Markdown knowledge

1. Confirm the target brain and import scope.
2. Use the REST preview endpoint for a ZIP vault, or `import_markdown` for a bounded reviewed batch.
3. Review suggested canonical/log classification, duplicate slugs, unresolved wiki-links, sensitive
   material, and article count before staging.
4. Evergreen topics become canonical articles. Confirm daily/journal classification before using logs.
5. Every import change summary starts with `import:` and carries the original path as a source.
6. Staging sends each imported article body to Owl Memory's configured AI provider to generate its
   routing summary.
7. The import produces staged writes only. List every staged id, conflict, unresolved link, and skipped
   file so the user can finish the batch deliberately.

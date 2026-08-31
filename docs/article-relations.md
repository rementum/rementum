# Article relations

Rementum turns Obsidian-style wiki links in the current Markdown body into navigable article
relations. The body remains canonical: promotion replaces that article's derived wiki-link set,
while manual relations remain a separate set.

## Link syntax

Use an article slug or alias as the target:

```markdown
[[system-architecture]]
[[system-architecture|the design]]
[[system-architecture#Key decisions]]
[[system-architecture#Key decisions|why we chose it]]
```

Targets are normalized with the same lowercase kebab-case rules as article slugs. A label changes
only the rendered text. A heading fragment scrolls to the matching rendered heading. Wiki syntax in
inline code, fenced code, or escaped as `\[[example]]` stays literal.

Resolution is brain-local. A link resolves against the destination's current slug or any reserved
alias. When an article is renamed, its previous slug becomes a permanent alias so existing links do
not break. Alias collisions stop promotion instead of silently redirecting a link.

## Dangling links and backlinks

Unresolved targets are stored rather than discarded. Creating a destination with the matching slug
or alias resolves those links automatically. Until then, the article reader marks the target as
unresolved and maintenance reports it as a broken link. The maintenance candidate resolves itself
on the next scan after the target becomes available.

Each article response includes:

- resolved outgoing wiki and manual relations;
- backlinks from both relation types;
- unresolved wiki targets;
- aliases and whether the current body has been relation-indexed.

Existing articles are indexed by the worker after the database migration. New promotions update
relations in the same transaction as the new article version. If deferred compaction changes a body,
the worker replaces the wiki relations again from the compacted body.

## Manual relations

`set_article_links` manages only explicit manual relations, such as `supports` or `supersedes`. It
never edits body-derived wiki links. Replacing or removing wiki syntax likewise leaves manual
relations intact.

## Graph view

Open **Graph** from a brain to load its complete article and relation graph. Search accepts titles,
current slugs, and aliases. Selecting a node highlights outgoing paths in green, incoming paths in
amber, and fades unrelated topology. The inspector and all-articles list provide the same navigation
without requiring pointer interaction with the canvas.

The graph intentionally has no pagination or server-side cap. Very large brains therefore transfer
all relation metadata when this view opens.

## Import and export

Markdown ZIP imports read frontmatter `aliases` and also reserve the source filename stem as an alias
when it differs from the generated article slug. This preserves ordinary Obsidian filename links.
Exports include the complete alias list in YAML frontmatter so a round trip keeps link routing.

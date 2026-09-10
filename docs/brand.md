# Rementum brand

Rementum pairs reliable memory with forward motion. The identity stays quiet, technical, and
direct. It should read as credible infrastructure without looking clinical or generic.

## Logo

The mark is a custom `R` letterform resting on stacked teal memory layers. The layers point toward
the letter and carry a Memory Teal gradient, so that gradient belongs to the mark. Use the full
wordmark when space allows and the mark alone for favicons, avatars, and compact navigation.

![Rementum wordmark and memory layers](assets/rementum-banner.png){ .rementum-banner }

Keep clear space around the logo equal to the height of the icon. Do not recolor the `R`, redraw
the layers, or add outlines, glows, or shadows to the mark. Keep it upright at its original
proportions. The Memory Teal gradient ramp (`#2F7C68 → #4AA48F → #9EC9C1`) and soft teal glows are
part of the wider design language; reserve them for backdrops, emphasized words, and primary
actions.

Ready files live in [`assets/brand/`](https://github.com/rementum/rementum/tree/main/docs/assets/brand):
the mark, wordmark, and lockup as SVG, plus PNG exports for dark and light backgrounds.

## Color

| Token | Value | Use |
| --- | --- | --- |
| Deep Graphite | `#091514` | Primary background and dark text |
| Memory Teal | `#4AA48F` | Brand accent and interactive emphasis |
| Mist Teal | `#9EC9C1` | Soft accent and secondary structure |
| Ivory | `#F3F5F1` | Primary text on dark surfaces and light canvas |
| Slate Line | `#2B3A37` | Dividers and borders on dark surfaces |

Memory Teal is the accent hue, and Mist Teal supports it. Status colors may signal errors or
warnings, but they do not replace teal in branded actions.

## Typography

Rementum uses Inter for product and documentation copy and JetBrains Mono for commands, metadata,
and identifiers. Headlines use tight spacing and sentence case. Body copy stays compact and
functional.

Both are vendored as variable WOFF2 subsets (Inter 4.1 with `opsz` pinned to 14, JetBrains Mono
2.304, both OFL) so the production image builds without reaching Google Fonts. **A subset must
cover Latin Extended-A, U+0100–U+017F.** Google Fonts' `latin` range stops at U+00FF and excludes
`ğ ı İ ş` and the rest of that block, and a font missing a glyph falls back to a system font
mid-word — so a latin-only subset renders Turkish in two typefaces at once. Regenerate with the
same feature set as the committed file, or unused stylistic sets roughly double the size:

```bash
uvx --from fonttools --with brotli pyftsubset InterVariable.ttf \
  --unicodes="<existing cmap plus U+0100-U+017F>" --flavor=woff2 \
  --layout-features=calt,ccmp,dnom,frac,locl,numr,pnum,tnum \
  --name-IDs=1,2,3,4,5,6 --output-file=apps/web/app/fonts/inter-variable.woff2
```

CJK is deliberately not bundled; `--font-sans` falls through to the system CJK fonts instead of
shipping a multi-megabyte webfont for `zh`.

Display type runs at line-height 0.98, which is tighter than Inter's own 1.21em content box. Text
that is masked with `overflow-hidden` — the hero headline reveals each word from behind its own
line — therefore clips descenders unless the mask adds bottom padding: `g` and `ğ` reach 0.2158em
below the baseline while the line box ends 0.1262em below it, so any such mask needs at least
0.09em of bottom padding, and it must be an `em` value so it scales with the size clamp.

## Voice

- Describe concrete behavior before benefits.
- Prefer short sentences and active verbs.
- Use `brain`, `article`, `canon`, and `staged write` consistently with the product model.
- Keep terms that are English in the source English instead of calquing them. In Turkish that means
  `self-hosted`, not `kendini barındıran`, and the feature names — `Compact Routing Index`,
  `Staged Write Isolation`, `Conflict Resolution Shield`, `Immutable Versioned Canon` — which are
  product vocabulary rather than descriptive prose. Follow what developers actually write in the
  language: Chinese uses the established `自托管`, and translating these headings there is normal.
- Avoid claims about intelligence, magic, or replacing human review.
- Explain security boundaries without euphemisms.

## Translating the "How it works" animation

The animation is a 1920x1080 canvas drawn at fixed coordinates, and most of its text sits in
containers with hard-coded geometry, so a longer translation overflows rather than reflowing. Its
copy lives in the `promo` namespace, and the tightest budgets are the version slabs (the demo
article title at 17px must fit 225px) and the index rows (500px each). English already uses 94% of
the slab budget, so anything appreciably longer than the English wording will not fit; shorten the
translation instead of widening the box.

`hero.headline` is the one array whose length is a property of the language rather than the
layout, so it may be re-split freely. `hero.headlineHighlight` names the word that gets the
gradient — do not assume it is the last one. Turkish ends its sentence on the verb, so the
highlighted word sits mid-sentence there. Every other array maps to fixed geometry and must keep
its length; `get-dictionary.test.ts` enforces both rules.

# Rementum brand

Rementum pairs reliable memory with forward motion. The identity stays quiet, technical, and
direct. The homepage and dashboard use a restrained product interface: readable knowledge, clear surface
hierarchy, and a visible record of change.

## Logo

The mark is a custom `R` letterform resting on stacked teal memory layers. The layers point toward
the letter and carry a Memory Teal gradient, so that gradient belongs to the mark. Use the full
wordmark when space allows and the mark alone for favicons, avatars, and compact navigation.

![Rementum wordmark and memory layers](assets/rementum-banner.png){ .rementum-banner }

Keep clear space around the logo equal to the height of the icon. Do not recolor the `R`, redraw
the layers, or add outlines, glows, or shadows to the mark. Keep it upright at its original
proportions. The Memory Teal gradient ramp (`#2F7C68 → #4AA48F → #9EC9C1`) belongs to the mark
and existing illustrated media. Use solid teal for interface actions and annotations.

Ready files live in [`assets/brand/`](https://github.com/rementum/rementum/tree/main/docs/assets/brand):
the mark, wordmark, and lockup as SVG, plus PNG exports for dark and light backgrounds.

## Color and surfaces

| Token | Value | Use |
| --- | --- | --- |
| Deep Graphite | `#091514` | Dark canvas |
| Memory Teal | `#4AA48F` | Brand accent and dark-theme actions |
| Mineral | `#2F6F5E` | Accessible teal actions on light surfaces |
| Mist Teal | `#9EC9C1` | Supporting structure in the mark and media |
| Ivory | `#F3F5F1` | Default light canvas and dark-theme text |
| Slate Line | `#2B3A37` | Dark dividers and borders |

New visitors see the light theme. A saved light or dark preference takes precedence, including
before the first paint. Both themes use fine structural borders. Light surfaces use subtle layered shadows; dark surfaces
use a low-opacity neutral ring. Reserve deeper shadows for menus and overlays. Status colors
distinguish warnings and errors.

Corner radii follow a 4/6/8/12px scale. Closely nested controls use concentric radii: the outer
radius includes the inner radius and inset. Interactive targets grow to at least 44px for touch.

## Typography

Rementum uses locally hosted Inter for product copy and JetBrains Mono for commands, metadata,
and identifiers. Headlines use sentence case and deliberate line breaks. Functional labels start
at 12px; body text and article titles carry the hierarchy rather than uppercase labels or effects.

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

## Homepage

The slogan is **Your agents need a better memory**. Translate its meaning in localized interfaces.

The five sections are the introduction, how it works, pricing, connection instructions, and footer.
A centered introduction leads into a wide sample workspace: brain index, Markdown article, and
version history. The example stacks on phones and uses the product's Markdown and status rendering
with clearly labelled sample content. Never use private workspace data in marketing.

The homepage always uses public navigation. Signed-in visitors get Dashboard links in the header,
hero, pricing, and footer. Marketing locales retain their canonical routes (`/`, `/tr`, `/zh`);
the page, metadata, and navigation follow the route locale. App pages retain cookie and browser
language preferences.

Explain the lifecycle as Read, Stage, Check, and Promote. The existing illustrated overview is an
optional desktop walkthrough: it loads after **Watch overview** is activated, offers pause and
close controls, pauses when less than 20% visible, the browser tab is hidden, or the window loses
focus (including Alt+Tab), and releases its
renderer when closed, leaving the page, or resized to mobile. SVG playback is capped at 30 frames
per second, including on high refresh rate displays.
It never autoplays on page load, including for visitors who prefer reduced motion. Phones receive
the same written explanation without the undersized animation.

Keep page content visible without JavaScript. Avoid ASCII backgrounds, auroras, sparkle effects,
gradient headlines, typewriter loops, and blur reveals on the homepage and dashboard.
The shared Aurora backdrop is static by default, including on authentication pages.

## Dashboard

Brains occupy the main surface; the 320px review panel sits beside them on wide screens and follows them on smaller
screens. The header always exposes the review count. List view is the default, while saved card/list
and sorting preferences remain respected. Names and descriptions lead; slugs, counts, and update
times support them.

Show conflicts first in the review queue. Counts come from the full per-brain totals, even when
the returned queue is limited. Further returned writes are available through a disclosure, and
a capped queue links to the full per-brain write lists.

Agent setup is expandable in populated workspaces and immediately visible in empty ones.
Other product pages inherit shared typography, surface, and control styling without layout changes.

## Interaction

Navigation and list selection respond immediately. Pointer-pressed action buttons use a 0.96 scale
over 150ms; keyboard and reduced-motion interactions do not move. Clipboard feedback reserves its
label width, announces success or failure, and uses a brief contextual icon transition. Theme changes
snap immediately without animating every surface. No idle dashboard decorations animate.

Language and workspace menus stay within the viewport, support arrow keys, and return focus on
Escape. The language trigger uses EN, TR, or ZH with full language names inside. Mobile app navigation
uses a modal drawer that contains focus, locks background scrolling, closes with Escape, and returns
focus to the menu trigger.

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

The homepage slogan uses `hero.titleA` and `hero.titleB`; translate the meaning and let the
responsive headline wrap naturally. Animation arrays map to fixed geometry and must keep their
lengths; `get-dictionary.test.ts` checks dictionary parity.

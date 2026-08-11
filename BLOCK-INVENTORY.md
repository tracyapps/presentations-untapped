# Marketing block and template inventory

_Initial inventory: August 11, 2026_

This is a provisional, source-backed inventory for the block/template milestone.
No representative PowerPoint or Keynote decks are present in the workspace yet,
so this pass uses the available LU marketing collateral:

- `presentations-untapped--ROUGH-WIRES.pdf`
- `STRAT-ENT-ONESHEET-FrequencyGap-05-11-26-v6.pdf`
- `STRAT-ENT-ONESHEET-PGP-Network-05-29-26-v3.pdf`
- `STRAT-ENT-ONESHEET-SalesKit-Zero-CAC-05-11-26-v6-4.pdf`
- `STRAT-INT-WHITEPAPER-TheFrequencyGap-07-09-26-V1.pdf`
- `STRAT-INT-WHITEPAPER-BowlingAlone-04-20-26-V2 (1).pdf`

Revisit the ranking when marketing supplies actual pitch decks. The current
sources are useful for recurring content patterns, but they do not establish
the full frequency or ordering of pitch-deck slides.

## Prioritized content blocks

| Priority | Pattern | Source evidence | Current coverage | Decision |
|---|---|---|---|---|
| P0 | Timeline / staged process | Frequency Gap uses a horizontal visit timeline; Zero-CAC uses a vertical three-stage flow | Missing | Add one `process` block with horizontal and vertical directions |
| P0 | Metrics / stat row | Zero-CAC presents four headline metrics | Covered | Keep `statCard` plus the existing Stat Row template |
| P0 | Comparison / financial table | Frequency Gap, Zero-CAC, and the Frequency Gap white paper use comparison tables | Covered | Keep `table`; validate with real deck content before specializing |
| P1 | Sectioned narrative | PGP Network and both white papers use repeated heading-and-body sections | Covered compositionally | Use title, tagline, paragraph, group, and columns |
| P1 | Hero / thesis statement | All three one-sheets lead with a title and concise supporting line | Covered | Keep Title & Paragraph and Title templates |
| P1 | Highlight band / takeaway | Frequency Gap and Zero-CAC use full-width emphasized bands | Covered | Use `callout`; no new block needed |
| P2 | Partner/category matrix | PGP Network uses two compact category lists | Covered compositionally | Use Two Columns with titles/lists; consider a template after deck review |
| P2 | Data visualization | Quantitative claims appear, but current sources favor tables and timelines over plotted charts | Basic coverage | Defer chart specialization until a real deck requires it |
| P3 | Pricing comparison | Included in the rough-wire requirements only | Covered | Keep `pricingTable`; do not prioritize further styling yet |

## Prioritized slide templates

| Priority | Template | Composition | Status |
|---|---|---|---|
| P0 | Horizontal Timeline | Title + horizontal process block | Implement in this slice |
| P0 | Vertical Process | Title + vertical process block | Implement in this slice |
| P1 | Key Metrics | Title + row of stat cards | Existing (`Stat Row`) |
| P1 | Image & Narrative | Two columns: image + title/body | Existing (`Image & Text`) |
| P1 | Comparison Table | Title + table | Add after representative decks confirm typical column counts |
| P2 | Partner Ecosystem | Title + two grouped lists | Defer until real decks establish whether categories, logos, or both are required |

## Compatibility checklist for every new block

- Typed defaults in the shared slide document.
- Design and non-editor rendering through `SlideCanvas`.
- Content-only fields in Outline.
- No bespoke library logic: saved snapshots and inserted clones use the shared node.
- Token-based styles that remain readable in both themes.
- No dependency on editor-only behavior, so present/public rendering can reuse it.

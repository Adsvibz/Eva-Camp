# Eva Camp reception interface
Date: 2026-11-13

## Intent and reference lock
Refresh the whole existing Electron reception UI, continuing the user's request for an Apple-inspired, clean desktop application. Preserve bookings, money, identities, backup, print and security behavior. Retain Arabic/English and saved light/dark/system preferences.

Primary references: Apple Human Interface Guidelines for materials, sidebars and layout:
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/design/human-interface-guidelines/sidebars
- https://developer.apple.com/design/human-interface-guidelines/layout

The live design-reference catalog was unavailable. Apple's documentation and the existing app are the source of truth; no catalog results are claimed.

| Decision | Source / reason |
| --- | --- |
| Neutral canvas and opaque reading surfaces | Content stays readable; material effects belong to navigation |
| Single slim sidebar with secondary tools at its foot | Apple sidebar hierarchy, adapted to a Windows reception app |
| Two header actions: search and create | Apple layout guidance; reduce seven competing header buttons |
| Four operational metrics plus a three-column financial summary | Existing dashboard has seven uneven cards; preserve every number |
| System Segoe UI for English, bundled Cairo for Arabic | Windows-native readability and offline font coverage; no Apple font distribution |
| Single token set for light and dark | Replace accumulating hardcoded green/gray overrides |
| Small outlined Lucide icons | Existing dependency, consistent stroke; no new icon package |
| Sticky sheet titles, focus ring and reduced-motion handling | Keyboard access and long-form usability |
| Print templates unchanged | Printed documents have independent layout requirements |

Reject: decorative gradients, large blur on content, imitation macOS window controls, photography in operational screens, new database or financial logic.

## Implementation
1. Replace renderer style.css with shared color, typography, spacing and component rules covering dashboard, tables, forms, calendar, reports, search, payments, guests, declarations, preferences, PIN and lock screens.
2. Rearrange existing header tools into the sidebar; preserve labels and handlers. Add aria-current, horizontal table scroll containers and compact booking summary.
3. Restructure dashboard presentation without changing data queries.
4. Adapt the existing dark-surface assertion and add actual window layout coverage at 1440, 1024 and 800 pixels in English light, English dark and Arabic dark. Capture rendered evidence.
5. Run Windows typecheck, unit suite, packaging, real Electron reception, lock and backup workflows. Inspect screenshots and fix clipping before handoff.

## Review focus
- Long Arabic labels and guest names, mixed direction dates/amounts.
- Narrow windows and high display scaling: no horizontal document overflow or sidebar overlap.
- Modal actions and keyboard focus remain reachable.
- Neutral dark surfaces preserve readability and status distinctions.
- Every existing reception tool remains reachable with its original handler.

## Delivery
Development branch: design/apple-inspired-workspace. Keep the existing v0.1.0 release intact while verifying this redesign. Distribute any subsequent approved release as the single Windows installer evacamp.exe.

# Figma assets — frame 04 (`43:1149`)

Exported from Figma file `rHjTVYYISZzHWvWNeSKaVE` via MCP `get_design_context` on 2026-10-23. Source URLs expire ~7 days after export; these files are the frozen copies.
`04-explore.ref.tsx` references them as `./assets/<file>`. **The node id is authoritative.** The context column comes from walking up from the first `<img>` use, and because Figma puts labels *before* icons it often names the preceding sibling. Open the ref at the listed line to confirm. `f8116.png` is JPEG data despite the extension.

Copy only what a component uses into `frontend/src/assets/figma/`. Never redraw an icon.

## Icons the UI tasks use (verified against the ref)

| use | file | node | where in ref |
|---|---|---|---|
| Brand mark (TopNavBar, T2) | `664bf.svg` | `43:1409` | Header › Brand Logo Anchor |
| Hide / eye-off toggle (StructureTree rows, T7) | `73f19.svg` | `43:1249` | icon of "Hide Healthy" button (label not used, per SPEC) |
| Status dot (BackendBanner / StatusPill, T2/T7) | `1b654.svg` | `46:47` | Agent Panel › Status — Listening |
| Footer disclaimer icon (Footer, T2) | `541d2.svg` | `43:1390` | Footer › Copyright / Clinical Prototyping Disclaimer |

Everything else is optional. Tumor, voice, webcam and diagnosis visuals are out of scope for `/learn`.

## All assets

| file | const in ref | context (closest ‹ outer) | node id | ref line |
|---|---|---|---|---|
| `f8d34.svg` | `imgIcon` | Icon ‹ Tool Call | `45:31` | 59 |
| `f8116.png` | `imgAb6AXuAUzb50BcYwgiJsMxWvN…` | AB6AXuAUzb50BcYWGIJsMXWvNCTn-o1IYGdXMMom90KdaAevvs7f-YLOhJMl3fOkoz1WKp4IvGLQy1aOfzGMYPgDPFsIB3aKICx_vhLxj52p_XaVJgc2_VTX6p8flM1BuBwO0hd4g6A14JwNDFI6qMSFTVbWztWB-gEw2DvRPYt7DM9CoYFVp6brmYILJ0KNJJ_kSofa9zUgLi-SPnFdOXZO8hggyHLqXZhrskg9RBdMhlBE ‹ Simulated Mirrored Webcam Surface ‹ Container | `43:1284` | 467 |
| `9a5ff.svg` | `imgGroup` | Group ‹ SVG ‹ SVG - EXPLODED VECTOR ANATOMICAL COMPOSITION | `43:1157` | 83 |
| `c9c5c.svg` | `imgVector` | Vector ‹ Group ‹ SVG | `43:1167` | 89 |
| `3cddb.svg` | `imgVector1` | Vector ‹ Group ‹ Text | `43:1171` | 103 |
| `d910f.svg` | `imgVector2` | Vector ‹ Group ‹ Text | `43:1172` | 112 |
| `49025.svg` | `imgVector3` | Vector ‹ Group ‹ Text | `43:1173` | 121 |
| `618ef.svg` | `imgVector4` | Vector ‹ Group ‹ Text | `43:1177` | 141 |
| `e20f1.svg` | `imgVector5` | Vector ‹ Group ‹ Text | `43:1178` | 150 |
| `17013.svg` | `imgVector6` | Vector ‹ Group ‹ Text | `43:1179` | 159 |
| `17523.svg` | `imgVector7` | Vector ‹ Group ‹ Text | `43:1183` | 177 |
| `ff7b1.svg` | `imgVector8` | Vector ‹ Group ‹ Text | `43:1184` | 182 |
| `5a41a.svg` | `imgVector9` | Vector ‹ Text ‹ Group | `43:1187` | 193 |
| `b2676.svg` | `imgVector10` | Vector ‹ Group ‹ Text | `43:1189` | 198 |
| `e2c2b.svg` | `imgVector11` | Vector ‹ Group ‹ Text | `43:1190` | 202 |
| `f5424.svg` | `imgVector12` | Vector ‹ Group ‹ Text | `43:1191` | 206 |
| `2fbb4.svg` | `imgVector13` | Vector ‹ Group ‹ Text | `43:1192` | 209 |
| `6a817.svg` | `imgVector14` | Vector ‹ Group ‹ Text | `43:1194` | 214 |
| `ee02d.svg` | `imgVector15` | Vector ‹ Group ‹ Text | `43:1195` | 218 |
| `ab9a4.svg` | `imgVector16` | Vector ‹ Group ‹ Text | `43:1196` | 222 |
| `d102e.svg` | `imgContainer` | Container ‹ Paragraph ‹ Quantitative Caliper Readouts | `43:1222` | 290 |
| `e71a8.svg` | `imgContainer1` | Container ‹ Button - Show Slices Intersection ‹ Button - Brain Opacity: 40 | `43:1244` | 357 |
| `73f19.svg` | `imgContainer2` | Container ‹ Button - Hide Healthy Tissue ‹ Button - Show Slices Intersection | `43:1249` | 369 |
| `82e7a.svg` | `imgContainer3` | Container ‹ Button - Focus Tumor (Active Accent) ‹ Button - Hide Healthy Tissue | `43:1254` | 381 |
| `34538.svg` | `imgContainer4` | Container ‹ Educational Neuroanatomy Notes ‹ Button - Focus Tumor (Active Accent) | `43:1258` | 390 |
| `512e8.svg` | `imgContainer5` | Container ‹ Button ‹ Action Footer | `43:1266` | 417 |
| `5f34c.svg` | `imgContainer6` | Container ‹ Button ‹ Action Footer | `43:1271` | 429 |
| `c8218.svg` | `imgIcon1` | Icon ‹ Agent Avatar ‹ Agent Header | `46:41` | 596 |
| `1b654.svg` | `imgEllipse` | Ellipse ‹ Status — Listening ‹ Title | `46:47` | 609 |
| `9a907.svg` | `imgIcon2` | Icon ‹ Tab — Voice ‹ Mode Tabs | `46:51` | 619 |
| `b4d6b.svg` | `imgIcon3` | Icon ‹ Tab — Script ‹ Tab — Voice | `46:56` | 627 |
| `4ccb1.svg` | `imgIcon4` | Icon ‹ Tab — History ‹ Tab — Script | `46:61` | 635 |
| `c080b.svg` | `imgIcon5` | Icon ‹ Event — Gesture ‹ Conversation Log | `46:95` | 660 |
| `36569.svg` | `imgIcon6` | Icon ‹ Mic Button — Active ‹ Voice Input Bar | `46:133` | 725 |
| `dc9f8.svg` | `imgContainer7` | Container ‹ Overlay ‹ Active Gesture Status Banner (Top Floating Pill) | `43:1341` | 757 |
| `efbae.svg` | `imgContainer8` | Container ‹ Background ‹ Overlay | `43:1348` | 771 |
| `eba67.svg` | `imgContainer9` | Container ‹ VerticalBorder ‹ Background | `43:1352` | 782 |
| `bf6bf.svg` | `imgContainer10` | Container ‹ Background ‹ Button - Tumor Indicator Chip (Vivid Warm Coral Highlighted) | `43:1364` | 816 |
| `0b1b4.svg` | `imgContainer11` | Container ‹ Button ‹ Vertical Divider | `43:1385` | 869 |
| `7e35a.svg` | `imgIcon7` | Icon ‹ Check ‹ Toast — Tumor Placed | `45:134` | 877 |
| `541d2.svg` | `imgContainer12` | Container ‹ Copyright / Clinical Prototyping Disclaimer ‹ Footer | `43:1390` | 898 |
| `a018b.svg` | `imgContainer13` | Container ‹ Link ‹ Links defined by Shared Component JSON | `43:1402` | 924 |
| `664bf.svg` | `imgContainer14` | Container ‹ Brand Logo Anchor ‹ Header | `43:1409` | 941 |
| `5288e.svg` | `imgContainer15` | Container ‹ Trailing Primary Action (Sensitivity: Normal) ‹ Background | `43:1431` | 991 |
| `a607d.svg` | `imgContainer16` | Container ‹ Button ‹ Trailing Icon Actions | `43:1437` | 1005 |
| `f0710.svg` | `imgContainer17` | Container ‹ Button ‹ Trailing Icon Actions | `43:1440` | 1012 |

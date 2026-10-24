# Figma assets

## Frame 04 (`43:1149`)

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


## Frames 01–03 (exported 2026-10-24)

Same rules as frame 04. Refs: `01-upload.ref.tsx` (`43:3`), `02-processing.ref.tsx` (`44:99`), `03-workspace.ref.tsx` (`43:767`). **`03-workspace.ref.tsx` is truncated at 100 KB** (MCP token limit): it stops inside the right column's "ACTION CONTROL DECK", so `77060 79880 76bfc 49072` and the repeated header/footer icons have no use site in the file. Use `03-workspace.png` for everything below line ~900. `8ad8d.png`, `6a58f.png` and `304b1.png` are JPEG data (MRI slice mock-ups, out of scope).

Header/footer icons (`3ad0c 42112 5f73c 030d1 52b59`) repeat in every frame; the existing `TopNavBar`/`Footer` already cover them.

### Icons Milestone B uses (plan `docs/superpowers/plans/2026-10-24-milestone-b-frontend.md`)

| use | file | node | where in ref |
|---|---|---|---|
| Dropzone upload icon (Upload, T3) | `47363.svg` | `44:22` | 01 › Dropzone — Idle › Upload Icon |
| "Browse files" button icon (Upload, T3) | `3f40b.svg` | `44:30` | 01 › Button — Browse files |
| Sample case icon (Upload, T3) | `d5c9a.svg` | `44:84` | 01 › Sample Scan Option |
| Small check / "Uploaded" status (Upload slots, T3) | `f8d34.svg` | `44:228` | 02 › File Meta › Status |
| File icon (Processing job row, T4) | `a6f94.svg` | `44:221` | 02 › File Row |
| Step done check (Processing, T4) | `7e35a.svg` | `44:234` | 02 › Step › State |
| Step running ring (Processing, T4) | `0ee3b.svg` | `44:245` | 02 › Step — Segment tumor › State |
| Arrow right in primary CTA (Results "Place in 3D", T5) | `b1141.svg` | `44:268` | 02 › Button — Open MRI Workspace |

Not used (SPEC conflicts): `8682b.svg` (DICOM folder), `460ba.svg` (privacy lock; card dropped), `85da8.svg` (agent tip mic), all frame-03 agent-panel icons.

### Frame 01 (`43:3`)

| file | const | context (closest ‹ outer) | node | ref line |
|---|---|---|---|---|
| `47363.svg` | `imgIcon` | Icon ‹ Upload Icon ‹ Dropzone — Idle | `44:22` | 60 |
| `3f40b.svg` | `imgIcon1` | Icon ‹ Button — Browse files ‹ Actions | `44:30` | 70 |
| `8682b.svg` | `imgIcon2` | Icon ‹ Button — Choose DICOM folder | `44:35` | 78 |
| `d5c9a.svg` | `imgIcon3` | Icon ‹ Sample Scan Option ‹ Secondary Options | `44:84` | 171 |
| `460ba.svg` | `imgIcon4` | Icon ‹ Privacy Note | `44:93` | 189 |

### Frame 02 (`44:99`)

| file | const | context (closest ‹ outer) | node | ref line |
|---|---|---|---|---|
| `a6f94.svg` | `imgIcon` | Icon ‹ File Icon ‹ File Row | `44:221` | 62 |
| `f8d34.svg` | `imgIcon1` | Icon ‹ Status ‹ File Meta | `44:228` | 73 |
| `7e35a.svg` | `imgIcon2` | Icon ‹ State ‹ Step — Read file & strip patient identifiers | `44:234` | 84 |
| `0ee3b.svg` | `imgState` | State ‹ Step — Segment tumor (UNet-3D) | `44:245` | 107 |
| `85da8.svg` | `imgIcon3` | Icon ‹ Agent Tip ‹ CTA Row | `44:259` | 132 |
| `b1141.svg` | `imgIcon4` | Icon ‹ Button — Open MRI Workspace | `44:268` | 148 |

### Frame 03 (`43:767`, truncated)

| file | const | context (closest ‹ outer) | node | ref line |
|---|---|---|---|---|
| `d8bf0.svg` | `imgContainer` | Container ‹ HorizontalBorder | `43:774` | 72 |
| `3f35e.svg` | `imgIcon1` | Icon ‹ Agent Avatar ‹ Agent Header | `44:274` | 161 |
| `c9605.svg` | `imgEllipse` | Ellipse ‹ Status — Listening | `44:280` | 172 |
| `78c7f.svg` | `imgEllipse1` | Ellipse ‹ Chip — Orchestrator | `44:286` | 186 |
| `61a1b.svg` | `imgEllipse2` | Ellipse ‹ Chip — Spatial UI | `44:292` | 202 |
| `8e97a.svg` | `imgIcon2` | Icon ‹ Tab — Voice | `44:299` | 221 |
| `6179e.svg` | `imgIcon3` | Icon ‹ Tab — Script | `44:304` | 229 |
| `941c5.svg` | `imgIcon4` | Icon ‹ Msg — Vision (system) | `45:128` | 239 |
| `2623b.svg` | `imgIcon5` | Icon ‹ Meta ‹ Bubble | `45:44` | 250 |
| `bfdea.svg` | `imgIcon6` | Icon ‹ Button — Run script | `45:94` | 332 |
| `81241.svg` | `imgIcon7` | Icon ‹ Mic Button — Active | `45:103` | 369 |
| `8ad8d.png` | `imgAb6AXuBpj…` | MRI slice image (JPEG) | `43:886` | 487 |
| `c9b37.svg` | `imgContainer1` | Container ‹ In-canvas HUD telemetry | `43:902` | 534 |
| `e74d7.svg` | `imgContainer2` | Container ‹ Button | `43:916` | 566 |
| `05ed5.svg` | `imgContainer3` | Container ‹ Button | `43:919` | 571 |
| `6a58f.png` | `imgAb6AXuC0W…` | MRI slice image (JPEG) | `43:940` | 623 |
| `304b1.png` | `imgAb6AXuDcn…` | MRI slice image (JPEG) | `43:970` | 694 |
| `c18f8.svg` | `imgContainer4` | Container ‹ Button | `43:984` | 727 |
| `94482.svg` | `imgContainer5` | Container ‹ Button | `43:989` | 739 |
| `e5b0c.svg` | `imgContainer6` | Container ‹ Button | `43:994` | 751 |
| `d8034.svg` | `imgContainer7` | Container | `43:999` | 766 |
| `1dae3.svg` | `imgContainer8` | Container | `43:1049` | 910 |
| `77060.svg` `79880.svg` `76bfc.svg` `49072.svg` | `imgContainer9–12` | past the truncation point | – | – |

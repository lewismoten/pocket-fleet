# Shared semantic palette

Every delivered indexed PNG uses the same color table. The 64 slots include 36 defined roles (including transparency), with the rest reserved. The GIF uses index 64 for its opaque background, outside the sprite palette.

| Index | Role | Customizable group |
|---:|---|---|
| 0 | Transparent | Never drawn |
| 1 / 2 / 3 | Main uniform: base / shadow / highlight | Clothing |
| 4 / 5 / 6 | Uniform trim: base / shadow / highlight | Clothing trim |
| 7 / 8 | Iris or robot eye light: base / shadow | Eyes |
| 9 | Pupil | Usually fixed dark |
| 10 | Eye white | Usually fixed |
| 11 / 12 / 13 | Hair: base / shadow / highlight; also brows | Hair |
| 14 / 15 / 16 | Skin: base / shadow / highlight | Skin |
| 17 | Blush | Blush |
| 18 | Lipstick | Lipstick |
| 19 | Eye shadow | Eye shadow |
| 20 | Outline | Usually fixed dark |
| 21 | White highlight | Usually fixed |
| 22 / 23 | Helmet: base / shadow | Helmet |
| 24 | Visor interior | Usually fixed |
| 25 | Mouth interior | Usually fixed dark |
| 26 | Tongue | Optional |
| 27 | LED/accent light | LED |
| 28 | Chest badge | Badge |
| 29 | Nose | Optional |
| 30 | Inner ear | Optional |
| 31 / 32 / 33 | Orange fur: base / shadow / highlight | Fur |
| 34 / 35 | Cream fur: base / shadow | Fur cream |
| 36–63 | Reserved | Keep unused |

Color index 2 cannot mean both clothing shadow and eye color. Each semantic role gets a distinct entry, even when the entries happen to share the same RGB color.

Set the group together. For blue clothing, for example, update index 1 to the blue base, index 2 to a darker blue, and index 3 to a lighter blue. Keep the shadow/highlight brightness relationships; don't set all three to one flat color unless that is intentional.

Two-tone outfits use the main-uniform group and the trim group independently. Hair shadows and eyebrows follow the hair group. Skin patches follow the skin group. Corgi orange fur, cream markings, and pink inner ears have their own groups. Makeup overlays use 17/18/19 plus transparent pixels, so they can be tinted without affecting skin.

Unused roles still occupy their assigned slot. A robot does not need hair pixels, but its other indexes must not be shifted to fill the gap.

## Indexed sprites versus masks

- **Indexed sprites:** the pixel is a palette index. Changing that entry changes all pixels of that role when rendered. Excellent for limited-palette pixel art.
- **Grayscale masks:** a separate image specifies coverage, often 0–255. Useful for tinting high-color artwork while preserving shading or soft edges.
- **Region/ID maps:** a separate image labels skin, hair, fabric, and so on. More flexible than one mask per region, but requires another lookup.
- **Shader/channel masks:** effects often pack up to four independent masks into RGBA channels. Useful in richer GPU pipelines.

This pack's primary format combines appearance and region labeling in the palette indexes. Runtime masks are unnecessary. The optional masks are supplied for offline editing and compatibility with the RGBA originals.

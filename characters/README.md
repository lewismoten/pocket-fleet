# Pocket Fleet Cadet Asset Pack

Open **preview.html** directly in a browser after unzipping. No server, network, or install is needed. The primary preview recolors by palette index; it does not use masks.

## Start here

- `badges/`: the six original concept cards separated into 320 × 240 PNGs.
- `indexed/CHARACTER/frames/neutral.png`: the default indexed portrait for that character.
- `indexed/CHARACTER/layers/`: separate eyes, eyebrows, mouths, hair/crest options, facial hair, and cosmetics. All use the same 128 × 128 coordinate system.
- `indexed/CHARACTER/cropped/layers/`: tightly cropped versions for efficient partial redraws. Placement offsets are in `indexed_manifest.json`.
- `indexed/CHARACTER/raw_cropped/layers/`: raw `.idx8` equivalents of the cropped layers. The same manifest gives their sizes and offsets.
- `indexed/shared_palette.json` and `shared_palette.rgb565le`: the common table; load it once for the whole crew.
- `indexed/CHARACTER/palette.json`: the exact color table and semantic role for every index.
- `indexed/CHARACTER/palette.rgb565le`: 64 RGB565 entries, little-endian, 128 bytes (identical across all six cadets).
- `indexed/CHARACTER/embedded/frames/`: 96 × 112 indexed portrait PNGs for the badge panel.
- `indexed/CHARACTER/embedded/raw/frames/`: corresponding row-major `.idx8` buffers, 10,752 bytes each. Zero means transparent.
- `indexed/CHARACTER/embedded/cropped/layers/` and `embedded/raw_cropped/layers/`: smaller overlays in the 96 × 112 coordinate system, with their own manifest offsets.
- `characters/`: RGBA equivalents, color examples, original concept portraits, and optional grayscale masks.
- `previews/`: contact sheets.
- `render_indexed.h`: small C++ renderer example with a callback for your display library.

Characters: human, robot, teal alien, corgi, curly-haired human, lilac alien.

## Expressions and customization

Each character has sixteen complete portraits: neutral, blink, look left/right/up/down, small/wide talking mouth, laughter, anger, surprise, sleepiness, two alternate hair/head designs, moustache, and either a beard or a character-specific special expression. Humans have bob and side-part options; the robot has antenna/crest options; the corgi has tuft/floppy-ear options; aliens have tuft/crest options. All characters have twelve eye/expression patches, four brow patches, eight mouth/expression patches, and separate cosmetic patches.

The indexed neutral base and its neutral eye, brow, and mouth overlays reconstruct the neutral frame **pixel for pixel**. The default to overlay is the matching `indexed/.../frames/neutral.png`, not the original concept portrait: the animation sheets were newly generated from those original references.

## Rendering parts

1. Draw the matching character's neutral base once.
2. Apply optional hair/head patch.
3. Apply eyebrows, eyes, and mouth patches at their documented offsets.
4. Apply optional facial hair and cosmetics last.

The patches include some underlying face color so a closed eye can erase an open one. All those face pixels use the same skin palette roles as the base. To clear a cosmetic layer or return from a large facial-hair/head option, restore the affected area from the base and reapply the active overlapping layers. Drawing index zero skips a pixel; it does **not** erase a previous pixel.

Hair/head patches are larger replacement patches rather than isolated strands. Facial-hair patches include matching face background. Features are fitted to each character; they are not universal across species. Animation frames now share one fixed neutral head and body. Facial patches use constant placement boxes and neutral face backgrounds. Alternate hair/head appearances are customization choices, not animation frames.

## Fixed semantic palette

All six characters and every indexed frame/layer share **one 64-slot palette**, with 36 defined semantic entries and 28 reserved slots. Only indexes 0–35 are used by sprites. A 128 × 128 raw portrait uses 16,384 bytes; a 96 × 112 portrait uses 10,752 bytes, plus one shared 128-byte RGB565 palette. This is storage for the sprite, not the display framebuffer. PNG files compress these buffers. No framebuffer or hardware palette capability is assumed.

The renderer looks up RGB565 for each pixel index. Recoloring is changing the lookup table. It affects future redraws; it does not automatically change pixels already sent to the LCD.

The same index always means the same role across characters. Every character uses identical RGB values, with matching uniforms, skin, hair, and eyes. Corgi fur and inner ears have separate material roles. Two entries may intentionally contain the same RGB value but remain different semantic roles. Do not merge them.

See **PALETTE.md** for the complete map and how to recolor shadows/highlights.

## Editing/exporting

Use an indexed-color editor or a script that preserves pixel indexes. Maintain the fixed palette order. Do not use automatic palette sorting, duplicate-color merging, or independent per-image quantization on the final indexed assets. Converting to RGB and back can destroy the role assignments.

The browser's Export preview PNG button creates an RGBA visual preview, not a new indexed source. For firmware, use the provided indexed PNGs/raw buffers and their palette.

The optional masks are black outside and white inside a region. They are useful for editing the RGBA versions; they are not needed to render or recolor the indexed assets. The region labels in this starter pack were derived from generated artwork, so pixel-level palette/mask cleanup may be desirable for final production art.

## Creation and validation

Portrait variants were made with the built-in image-generation tool, then separated and converted into indexed assets and overlay patches. The prompt specified the same character on a transparent 4 × 4 grid: neutral, blink, six gaze/talking variants, four emotions, alternate hair/head shapes, moustache, and beard/special. Palette conversion and cropping are deterministic post-processing.

Validation includes PNG decode, fixed palette and transparency checks, all layer offset bounds, exact neutral reconstruction for all six characters, raw-buffer sizes, and ZIP integrity. The pack has not been tested on a physical CYD.

## Animation and palette correction (version 5)

The initial generated frames drifted in position and shape. This version rebuilds the twelve expression states from one fixed neutral portrait per cadet. Only the eye, eyebrow, and mouth windows may change; all other pixel indexes and the alpha silhouette are identical across those states. Gaze moves the neutral pupil texture inside fixed eye shapes. Talking keeps neutral eyes. Cropped facial overlays have constant offsets and dimensions across their states.

Use `previews/stable_animation.gif` to inspect the corrected animation. Every blink/talking/gaze sequence holds the head, helmet, hair outside the facial windows, body, and badge in place. The GIF is built directly from the shared pixel indexes with a fixed global color table, an opaque background, and disposal mode 2. Decoding it reproduces the source frames pixel for pixel; this is checked in animation_validation.json. Blink and gaze patches are derived from the neutral eyes, keeping their geometry fixed.

## Material and mouth correction (version 5)

Mouth anchors now match the original neutral artwork. The small and wide mouth sprites use fixed geometry at those anchors, with an explicit dark interior and tongue (or a cyan robot display). Neutral mouth removal is limited to its connected feature, preserving the muzzle and chin. Alien scalps and antennae use skin roles; glass and helmet trim use their own material roles. Source material classification reads the original RGB pixels before any palette reduction.

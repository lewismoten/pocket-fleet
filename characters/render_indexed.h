#pragma once
#include <stdint.h>
#include <stddef.h>

// One shared 64-entry RGB565 palette (128 bytes) serves every cadet.
// Raw .idx8 pixels are row-major. RGB565 palette entries are uint16_t values.
// Read palette.rgb565le as little-endian; do not assume file bytes are native
// display transfer order. Let your display driver's drawing API handle that.
// RAM buffer example; adapt reads for a filesystem or PROGMEM as needed.
template <class DrawPixel>
void drawCadetIndexed(const uint8_t* pixels, int width, int height,
                      const uint16_t* palette, int x, int y,
                      DrawPixel drawPixel) {
  for (int row = 0; row < height; ++row) {
    for (int col = 0; col < width; ++col) {
      uint8_t index = pixels[(size_t)row * width + col];
      if (index != 0 && index < 64)
        drawPixel(x + col, y + row, palette[index]);
    }
  }
}

inline uint16_t cadetRGB565(uint8_t r, uint8_t g, uint8_t b) {
  return ((uint16_t)(r >> 3) << 11) | ((uint16_t)(g >> 2) << 5) | (b >> 3);
}

inline void setCadetClothing(uint16_t* palette, uint8_t r, uint8_t g, uint8_t b) {
  palette[1] = cadetRGB565(r, g, b);
  palette[2] = cadetRGB565((uint8_t)(r * 0.65f),
                         (uint8_t)(g * 0.65f), (uint8_t)(b * 0.65f));
  // Move each channel toward white for a safe non-clipping highlight.
  palette[3] = cadetRGB565(r + (255 - r) / 4,
                         g + (255 - g) / 4, b + (255 - b) / 4);
}

// TFT_eSPI-style usage:
// drawCadetIndexed(sprite, 96, 112, palette, 18, 44,
//   [&](int x, int y, uint16_t color) { tft.drawPixel(x, y, color); });
// Batch rows/runs for higher throughput in production. Restore from the base
// before removing an overlay: transparent pixels skip drawing, not erasing.

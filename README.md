![Pocket Fleet: a bridge simulator for browsers, Cheap Yellow Displays and Cardputers](docs/images/social-preview.png)

# Pocket Fleet

A small bridge simulator for one player or a room full of people with browsers, Cheap Yellow Displays (CYDs), and M5 Cardputer ADV devices. A computer hosts fleet state on the local Wi‑Fi; each person can control one or more stations, and a browser can stay open on a projector as the forward view. The browser also runs alone as a static demo.

## Play locally

Requires Node.js 20 or newer. No npm packages are needed for the browser or LAN host.

```sh
npm start
```

Open `http://localhost:8787` for solo play. To play together, enter a fleet name and click **Host**. Leave the fleet lock code empty for an open fleet, or set a 4–8 digit code. Everyone opens `http://YOUR-COMPUTER-LAN-IP:8787` on the same Wi‑Fi and clicks **Find fleets on this host**. This lists fleets on that host; players can choose one and enter its lock code if needed. A five-character fleet ID also supports direct joining. Leave one browser on the projector for the forward view; each person can select a ship and station on their own device. Each newly created ship can have its own optional code even inside an open fleet. Enter that code below the ship selector before switching to a locked ship. `PORT=9000 npm start` changes the port.

A CYD can scan short `🚀` Wi‑Fi names such as `🚀astro-4f`, show signal bars, and request to board a ship on that hotspot. It also accepts legacy `PocketFleet-` names. A password-protected hotspot prompts for its Wi‑Fi password on the CYD. Once connected, the dock screen lists the host's ships, crew occupancy, lock state, and protocol compatibility. A browser lists ships from its current host, but browser pages cannot scan Wi‑Fi or read RSSI; their signal label is deliberately unknown. The [ESP32 Wi‑Fi API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html) supports SoftAP and scanning, and [Espressif specifies a 32-byte SSID field](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/network/esp_wifi.html).

Players begin in personal quarters, where they can choose a species, face, eyes, uniform and accessories for an animated little space cadet, see their record, browse docked ships, and board. The 320×240 room preview matches the CYD layout. Start at Communications → **Request mission**. Helm target selection stays local until **Set course** commits it; Helm can turn, change speed, thrust, tap the on-screen arrow pad for direct up/down/left/right movement, approach, evade, and dock. Helm controls occupy three CYD button pages; tap **PAGE** at top left to turn pages. The forward views share one seeded starfield and show textured planets, rings, caps, nearby moons, ships, and stations. Defense missions spawn raiders on arrival, and ship contacts can hail the bridge with an expressive cadet portrait. The captain can issue Red Alert, Yellow Alert, and Stand Down shipwide. Weapons have one power toggle, separate pulse and torpedo warmup/cooldown meters, and alternating firing sides. Each station keeps its own selected target. Engineering selects a system on a ship diagram and has repair/boost/shield cooldowns. Button taps flash to confirm detection. The **CYD Display Lab** shows one 320×240 station screen, all six plus the forward screen, or the forward screen alone. **CYD-only view** hides the desktop dashboard; `?view=cyd` opens the same view. Everyone aboard can launch a pod. Surviving a ship explosion earns more XP the closer the launch was to the blast. Crew lost aboard return through fleet neural backups, with the loss kept in their records.

Profiles from a LAN host are saved to `.data/profiles.json`. Browser progress also travels in local storage, and the CYD caches a compact profile in onboard flash (ESP32 Preferences) so rank, counters, medals, and recent records can be carried to another local host. On joining, the host merges the larger counters and service records. Fleet rooms themselves are temporary and reset when the server restarts. This is a prototype: profiles are identified by device/browser IDs without account security, and there is no internet matchmaking.

On a CYD bridge, tap the destination name to open the eight-place **Choose course** or **Choose target** list. Picking a row changes only that station's selection; Helm's **Set course** action publishes the chosen course to the fleet.

## GitHub Pages demo

In the repository's GitHub **Settings → Pages**, choose **Deploy from a branch**, your branch, and **/(root)**. The root `index.html` and relative asset paths can be published as a static site without a build step. The Pages version supports solo play with progress saved in that browser. [GitHub's Pages setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) describes the branch setting.

GitHub Pages does not run this Node host. Its HTTPS page also cannot call an HTTP LAN host through normal `fetch()` because browsers block that mixed content ([MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)). For live fleet play with browsers or CYDs, open the page from the local `npm start` host. The host and devices must be on a Wi‑Fi network that allows clients to talk to each other.

## Flash a CYD or M5 Cardputer ADV

### Browser installer

Open [flash.html](flash.html) on the computer with the device plugged in. With `npm start`, use `http://localhost:8787/flash.html`; GitHub Pages also works once the site is published over HTTPS. Use a desktop browser with Web Serial, such as Chrome or Edge. Choose **M5 Cardputer ADV** for the ESP32-S3 keyboard device, **ESP32-3248S035C** for the 3.5-inch capacitive ST7796/GT911 CYD, or **ESP32-2432S028R** for the original 2.8-inch resistive ILI9341/XPT2046 CYD. The larger CYD centers the existing 320×240 controls on its 480×320 display. A plain `http://192.168.x.x` page on another computer is not a secure browser context for Web Serial; run the server on the USB-connected computer or use the HTTPS Pages site. See [ESP Web Tools](https://esphome.github.io/esp-web-tools/) and [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

### Cardputer ADV controls

The Cardputer ADV has its own 240×135 firmware in [cardputer](cardputer/). It boots into personal quarters without scanning Wi‑Fi. Press **Q/E** to choose Start Solo Ship, Dock / Wi‑Fi, or Edit Name; press **Enter** to select. **A/D** changes the species and face in quarters. A solo ship has all six stations, a forward screen, missions, and persistent XP and counters. In the bridge, **Q/E** changes stations, **A/D** changes the selected target, **1–4** activates the shown controls, **V** toggles the forward view, **X** launches an escape pod, and **B** returns to quarters. In engineering, **R** selects a system. At the dock, choose a Wi‑Fi network, type its password if required, then enter the computer host's LAN IP. `🚀` hotspots use their gateway IP automatically. The dock lists host ships; **N** prepares a new fleet and ship on that host. The Cardputer shares the same host API as the CYD and browser. Its solo rules are intentionally smaller than the host's full rules.

Build and package the Cardputer image with `pio run -d cardputer -e cardputer_adv`. The merged image is `web-flash/pocket-fleet-cardputer-adv.bin`. The browser installer uses `web-flash/manifest-cardputer-adv.json`. To flash with PlatformIO, connect the Cardputer ADV and run `pio run -d cardputer -e cardputer_adv -t upload --upload-port YOUR_PORT`; on boards that do not enter download mode automatically, switch power OFF and hold **G0** while connecting USB-C, then release G0. This uses the [M5Stack Cardputer ADV board specification](https://docs.m5stack.com/en/core/Cardputer-Adv) and [M5Stack keyboard library](https://docs.m5stack.com/en/arduino/m5cardputer/keyboard).

The public images contain no local `secrets.h` values. On first start, the CYD opens your quarters without scanning Wi-Fi, and the RGB LED stays off. **Start Solo Ship** opens a local session with supply and combat missions; completed solo missions award XP and save to internal flash. Open **Dock → Connect to Wi-Fi** when you want to find fleets. For ordinary Wi-Fi, enter the LAN IP of the computer running `npm start` on the CYD. To refresh the included browser images after firmware changes, run `pio run -d firmware -e cyd_web` and `pio run -d firmware -e cyd35c_web`. These build with `secrets.h.example` and merge the bootloader, partition table, boot app and application into `web-flash/pocket-fleet-cyd.bin` and `web-flash/pocket-fleet-cyd35c.bin`. Rebuilding the regular `cyd` environment still uses your ignored `secrets.h`.

### PlatformIO upload

Firmware targets the original **ESP32-2432S028R**, a 2.8-inch 320×240 ILI9341 display with XPT2046 resistive touch. The [CYD community board reference](https://github.com/witnessmenow/ESP32-Cheap-Yellow-Display) and [pin map](https://github.com/witnessmenow/ESP32-Cheap-Yellow-Display/blob/main/PINS.md) informed the configuration. The two-USB revision may use an ST7789; change `ILI9341_DRIVER` to `ST7789_DRIVER` in `firmware/platformio.ini` for that board, and check its exact display setup.

1. Install PlatformIO (VS Code extension or CLI).
2. Copy `firmware/include/secrets.h.example` to `firmware/include/secrets.h`. To join a nearby `🚀` hotspot, leave `WIFI_NAME` and `FLEET_HOST` empty; the CYD scans and uses the hotspot gateway. To prepare your own ship, set `WIFI_NAME` and `WIFI_PASSWORD` for an existing network and set `FLEET_HOST` to the computer running `npm start`. Leave `FLEET_CODE` and `SHIP_ID` empty for the dock screen. `HOST_WIFI_PASSWORD` can preconfigure an optional 8+ character password for your CYD's new hotspot.
3. Connect the CYD by USB. Run `pio run -d firmware -t upload` or use PlatformIO's **Upload** button.
4. The CYD opens in quarters. Tap the upper face to change species or lower face to change face shape. Tap **DOCK** to see docked ships. Tap a row to request boarding; locked fleets and ships ask for a numeric code. Tap **PREPARE MY SHIP** to name a ship, optionally set a fleet code and Wi‑Fi password, and broadcast a short `🚀` hotspot. Nearby CYDs can join that hotspot, and a browser can open `http://192.168.4.1:8787`. Tap the station name to rotate stations, the target or system name to select locally, or an action to send it. Tap the bottom strip or hold BOOT for an escape pod. A short BOOT press toggles the forward screen; a double press advances the station. In quarters, short BOOT switches room/dock and double BOOT cycles species.

**CYD hotspot hosting uses the computer as its game host.** The hosting CYD joins the computer's Wi‑Fi, creates a fleet on the Node server, then runs a small HTTP gateway over its own `🚀` SoftAP. Other devices use the CYD hotspot to reach that Node host. The CYD does not run a standalone full fleet server, so the computer and its Wi‑Fi must stay available. The host creates the game seed from Node's crypto RNG and owns mission, movement, combat, and cooldown results; the CYD uses [`esp_random()`](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/random.html) only while Wi‑Fi is active to choose its short hotspot name. Seeded procedural graphics remain deterministic on clients.

The CYD draws primitive graphics directly and uses no SD card, sound, or PSRAM. Active drawing state stays in SRAM; the compact player record uses onboard flash. Its active-low RGB LED indicates normal, yellow and red alerts, crew changes or hits, and pod status. GPIO34 adjusts backlight from relative ambient light; define `LIGHT_SENSOR_INVERTED` in the build flags if your board's LDR direction is reversed. BOOT is GPIO0, so avoid holding it while resetting or powering on. Reset only restarts the board. If touch locations are reversed or offset, adjust the raw ranges and/or `touch.setRotation(1)` in `firmware/src/main.cpp`. Wi‑Fi credentials remain in the ignored `secrets.h`. PlatformIO compiled the firmware successfully for the ESP32-2432S028R configuration, using about 50 KB static RAM and 1.02 MB of its app flash partition. Physical touch calibration and the hotspot gateway still need testing on CYD hardware. Bluetooth inter-host relay remains a future extension.

## Development

```sh
npm test
```

`game.js` is the shared rules module for the browser and Node host. `server.js` is a tiny HTTP API and static server using Node's standard library. `app.js` is the browser interface. The CYD firmware sends compact actions to the host and polls compact state every two seconds. A locked fleet requires its PIN to join and issues a session token for later requests. The local HTTP connection is unencrypted, so use a trusted local network; the lock is a casual room gate rather than internet-grade account security.

## Credits

The cadet artwork in `characters/` was made with an AI image generator from concept portraits, then cleaned up and rebuilt into indexed frames (see `characters/README.md`).

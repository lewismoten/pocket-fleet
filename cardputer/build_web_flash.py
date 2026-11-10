"""Merge Cardputer ADV boot components into one ESP Web Tools image."""

from pathlib import Path
import subprocess

Import("env")


def package(source, target, env):
    project = Path(env.subst("$PROJECT_DIR"))
    build = Path(env.subst("$BUILD_DIR"))
    platform = env.PioPlatform()
    tool = Path(platform.get_package_dir("tool-esptoolpy")) / "esptool.py"
    framework = Path(platform.get_package_dir("framework-arduinoespressif32"))
    boot_app = framework / "tools" / "partitions" / "boot_app0.bin"
    destination = project.parent / "web-flash" / "pocket-fleet-cardputer-adv.bin"
    subprocess.run([
        env.subst("$PYTHONEXE"), str(tool), "--chip", "esp32s3", "merge_bin",
        "-o", str(destination), "--flash_mode", "dio", "--flash_freq", "80m",
        "--flash_size", "8MB", "0x0", str(build / "bootloader.bin"),
        "0x8000", str(build / "partitions.bin"), "0xe000", str(boot_app),
        "0x10000", str(build / "firmware.bin"),
    ], check=True)
    print("Cardputer ADV browser image:", destination)


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", package)

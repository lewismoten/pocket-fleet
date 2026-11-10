"""Package the secret-free CYD build for ESP Web Tools."""

from pathlib import Path
import subprocess

Import("env")


def package_web_flash(source, target, env):
    project = Path(env.subst("$PROJECT_DIR"))
    build = Path(env.subst("$BUILD_DIR"))
    platform = env.PioPlatform()
    tool = Path(platform.get_package_dir("tool-esptoolpy")) / "esptool.py"
    framework = Path(platform.get_package_dir("framework-arduinoespressif32"))
    boot_app = framework / "tools" / "partitions" / "boot_app0.bin"
    name = "pocket-fleet-cyd35c.bin" if env.subst("$PIOENV") == "cyd35c_web" else "pocket-fleet-cyd.bin"
    destination = project.parent / "web-flash" / name
    destination.parent.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        [
            env.subst("$PYTHONEXE"), str(tool), "--chip", "esp32", "merge_bin",
            "-o", str(destination), "--flash_mode", "dio", "--flash_freq", "40m",
            "--flash_size", "4MB", "0x1000", str(build / "bootloader.bin"),
            "0x8000", str(build / "partitions.bin"), "0xe000", str(boot_app),
            "0x10000", str(build / "firmware.bin"),
        ],
        check=True,
    )
    print("Secret-free browser image:", destination)


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", package_web_flash)

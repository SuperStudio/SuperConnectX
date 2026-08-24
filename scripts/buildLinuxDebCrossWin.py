"""Build a Debian package from linux-unpacked on a Windows host.

This is the packaging half of ``npm run build:linux:cross-win``. electron-builder
first downloads Linux Electron and creates ``release/linux-unpacked``; the matching
afterPack hook selects the bundled Linux x64 serialport ELF prebuild. This script
then writes Debian control/data archives directly with Python's standard library.

GNU tar format is intentional. It supports the long node_modules paths used by an
Electron application without emitting POSIX PAX ``x`` headers, which older dpkg
versions reject. This command is a Windows cross-packaging path; the existing
``npm run build:linux`` remains the native Linux release path.
"""

from __future__ import annotations

import io
import json
import lzma
import math
import os
import pathlib
import shutil
import sys
import tarfile
import time
from collections.abc import Iterable


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE_DIR = ROOT / "release"
SOURCE = RELEASE_DIR / "linux-unpacked"
WORK_DIR = RELEASE_DIR / ".linux-deb-cross-win"
PACKAGE_JSON = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
PACKAGE_NAME = str(PACKAGE_JSON["name"])
VERSION = str(PACKAGE_JSON["version"])
AUTHOR = str(PACKAGE_JSON.get("author") or "SuperStudio")
HOMEPAGE = str(PACKAGE_JSON.get("homepage") or "https://github.com/SuperStudio/SuperConnectX")
TARGET = RELEASE_DIR / f"{PACKAGE_NAME}-{VERSION}-linux-x64.deb"
BUILD_TIME = int(time.time())


def ensure_windows_cross_environment() -> None:
    if sys.platform != "win32":
        raise RuntimeError(
            "buildLinuxDebCrossWin.py is only for Windows -> Linux cross packaging; "
            "use `npm run build:linux` inside Linux"
        )
    if not SOURCE.is_dir():
        raise FileNotFoundError(f"linux-unpacked is missing: {SOURCE}")
    if WORK_DIR.parent.resolve() != RELEASE_DIR.resolve():
        raise RuntimeError(f"unsafe work directory: {WORK_DIR}")


def is_elf(path: pathlib.Path) -> bool:
    return path.is_file() and path.read_bytes()[:4] == b"\x7fELF"


def validate_linux_unpacked() -> None:
    executable = SOURCE / "superconnectx"
    serial_binding = (
        SOURCE
        / "resources"
        / "app.asar.unpacked"
        / "node_modules"
        / "@serialport"
        / "bindings-cpp"
        / "build"
        / "Release"
        / "bindings.node"
    )
    cpu_binding = (
        SOURCE
        / "resources"
        / "app.asar.unpacked"
        / "node_modules"
        / "cpu-features"
        / "build"
        / "Release"
        / "cpufeatures.node"
    )
    if not is_elf(executable):
        raise RuntimeError(f"Linux main executable is not ELF: {executable}")
    if not is_elf(serial_binding):
        raise RuntimeError(f"active serialport binding is not ELF: {serial_binding}")
    if cpu_binding.exists():
        raise RuntimeError(f"Windows cpu-features binding must not enter the Linux package: {cpu_binding}")


def normalized_tar_info(info: tarfile.TarInfo) -> tarfile.TarInfo:
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = BUILD_TIME
    if info.isdir():
        info.mode = 0o755
    elif info.isfile():
        relative = info.name.replace("\\", "/")
        if relative.endswith("/chrome-sandbox"):
            info.mode = 0o4755
        elif relative.endswith(("/superconnectx", "/chrome_crashpad_handler", ".sh")):
            info.mode = 0o755
        else:
            info.mode = 0o644
    return info


def tar_info(name: str, *, mode: int, size: int = 0, type_: bytes = tarfile.REGTYPE) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = BUILD_TIME
    info.mode = mode
    info.size = size
    info.type = type_
    return info


def add_bytes(archive: tarfile.TarFile, name: str, payload: bytes, mode: int) -> None:
    archive.addfile(tar_info(name, mode=mode, size=len(payload)), io.BytesIO(payload))


def add_directories(archive: tarfile.TarFile, names: Iterable[str]) -> None:
    for name in names:
        archive.addfile(tar_info(name, mode=0o755, type_=tarfile.DIRTYPE))


def installed_size_kib() -> int:
    total = sum(path.stat().st_size for path in SOURCE.rglob("*") if path.is_file())
    total += (ROOT / "build" / "icon.png").stat().st_size
    return math.ceil(total / 1024)


def control_text() -> bytes:
    content = f"""Package: {PACKAGE_NAME}
Version: {VERSION}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: {AUTHOR}
Installed-Size: {installed_size_kib()}
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0
Recommends: libappindicator3-1
Homepage: {HOMEPAGE}
Description: SuperConnectX - multi-protocol terminal connection utility
 SuperConnectX provides serial, SSH, Telnet and standard MCP integration.
"""
    return content.encode("utf-8")


def desktop_text() -> bytes:
    return b"""[Desktop Entry]
Name=SuperConnectX
Comment=Multi-protocol terminal connection utility
Exec=/opt/superconnectx/superconnectx %U
Terminal=false
Type=Application
Icon=superconnectx
StartupWMClass=superconnectx
Categories=Utility;
"""


def build_control_tar(path: pathlib.Path) -> None:
    with tarfile.open(path, mode="w:xz", format=tarfile.GNU_FORMAT) as archive:
        add_bytes(archive, "./control", control_text(), 0o644)
        add_bytes(
            archive,
            "./postinst",
            (ROOT / "build" / "installer" / "linux-after-install.sh").read_bytes(),
            0o755,
        )
        add_bytes(
            archive,
            "./postrm",
            (ROOT / "build" / "installer" / "linux-after-remove.sh").read_bytes(),
            0o755,
        )


def build_data_tar(path: pathlib.Path) -> None:
    with tarfile.open(path, mode="w:xz", format=tarfile.GNU_FORMAT) as archive:
        add_directories(
            archive,
            (
                "./opt",
                "./usr",
                "./usr/bin",
                "./usr/share",
                "./usr/share/applications",
                "./usr/share/icons",
                "./usr/share/icons/hicolor",
                "./usr/share/icons/hicolor/256x256",
                "./usr/share/icons/hicolor/256x256/apps",
            ),
        )
        archive.add(
            SOURCE,
            arcname="./opt/superconnectx",
            recursive=True,
            filter=normalized_tar_info,
        )

        link = tar_info("./usr/bin/superconnectx", mode=0o777, type_=tarfile.SYMTYPE)
        link.linkname = "/opt/superconnectx/superconnectx"
        archive.addfile(link)

        add_bytes(
            archive,
            "./usr/share/applications/superconnectx.desktop",
            desktop_text(),
            0o644,
        )
        icon = ROOT / "build" / "icon.png"
        archive.add(
            icon,
            arcname="./usr/share/icons/hicolor/256x256/apps/superconnectx.png",
            recursive=False,
            filter=normalized_tar_info,
        )


def raw_tar_types(path: pathlib.Path) -> set[bytes]:
    types: set[bytes] = set()
    with lzma.open(path, "rb") as stream:
        while True:
            header = stream.read(512)
            if not header or header == b"\0" * 512:
                break
            if len(header) != 512:
                raise ValueError(f"truncated tar header in {path}")
            types.add(header[156:157] or b"\0")
            size_field = header[124:136].rstrip(b"\0 ") or b"0"
            size = int(size_field, 8)
            payload_size = ((size + 511) // 512) * 512
            if payload_size:
                stream.seek(payload_size, io.SEEK_CUR)
    return types


def validate_tar_archives(control_tar: pathlib.Path, data_tar: pathlib.Path) -> None:
    for path in (control_tar, data_tar):
        types = raw_tar_types(path)
        if b"x" in types or b"g" in types:
            raise ValueError(f"PAX headers are forbidden in Debian tar archives: {path} ({types})")

    with tarfile.open(control_tar, mode="r:xz") as archive:
        names = {member.name.lstrip("./") for member in archive.getmembers()}
        if not {"control", "postinst", "postrm"}.issubset(names):
            raise ValueError(f"control.tar.xz is incomplete: {names}")

    with tarfile.open(data_tar, mode="r:xz") as archive:
        members = {member.name.lstrip("./"): member for member in archive.getmembers()}
        required = {
            "opt/superconnectx/superconnectx",
            "opt/superconnectx/chrome-sandbox",
            "usr/bin/superconnectx",
            "usr/share/applications/superconnectx.desktop",
            "usr/share/icons/hicolor/256x256/apps/superconnectx.png",
        }
        if not required.issubset(members):
            raise ValueError(f"data.tar.xz is incomplete: {required - members.keys()}")
        sandbox = members["opt/superconnectx/chrome-sandbox"]
        link = members["usr/bin/superconnectx"]
        if sandbox.mode != 0o4755:
            raise ValueError(f"invalid chrome-sandbox mode: {oct(sandbox.mode)}")
        if not link.issym() or link.linkname != "/opt/superconnectx/superconnectx":
            raise ValueError(f"invalid command symlink: {link.linkname}")


def ar_header(name: str, size: int) -> bytes:
    fields = (
        f"{name + '/':<16}"
        f"{BUILD_TIME:<12}"
        f"{0:<6}"
        f"{0:<6}"
        f"{'100644':<8}"
        f"{size:<10}"
        "`\n"
    )
    encoded = fields.encode("ascii")
    if len(encoded) != 60:
        raise ValueError(f"invalid ar header for {name}")
    return encoded


def write_ar_member(output, name: str, payload: bytes | pathlib.Path) -> None:
    size = len(payload) if isinstance(payload, bytes) else payload.stat().st_size
    output.write(ar_header(name, size))
    if isinstance(payload, bytes):
        output.write(payload)
    else:
        with payload.open("rb") as source:
            shutil.copyfileobj(source, output, length=1024 * 1024)
    if size % 2:
        output.write(b"\n")


def write_deb(control_tar: pathlib.Path, data_tar: pathlib.Path) -> None:
    temporary = TARGET.with_suffix(".deb.tmp")
    with temporary.open("wb") as output:
        output.write(b"!<arch>\n")
        write_ar_member(output, "debian-binary", b"2.0\n")
        write_ar_member(output, "control.tar.xz", control_tar)
        write_ar_member(output, "data.tar.xz", data_tar)
    os.replace(temporary, TARGET)


def read_ar_member_names(path: pathlib.Path) -> list[str]:
    names: list[str] = []
    with path.open("rb") as stream:
        if stream.read(8) != b"!<arch>\n":
            raise ValueError("invalid Debian ar header")
        while True:
            header = stream.read(60)
            if not header:
                break
            if len(header) != 60 or header[58:60] != b"`\n":
                raise ValueError("invalid Debian ar member header")
            name = header[:16].decode("ascii").strip().rstrip("/")
            size = int(header[48:58])
            names.append(name)
            stream.seek(size + size % 2, io.SEEK_CUR)
    return names


def main() -> None:
    ensure_windows_cross_environment()
    validate_linux_unpacked()
    if WORK_DIR.exists():
        shutil.rmtree(WORK_DIR)
    WORK_DIR.mkdir(parents=True)
    control_tar = WORK_DIR / "control.tar.xz"
    data_tar = WORK_DIR / "data.tar.xz"
    try:
        build_control_tar(control_tar)
        build_data_tar(data_tar)
        validate_tar_archives(control_tar, data_tar)
        write_deb(control_tar, data_tar)
        members = read_ar_member_names(TARGET)
        expected = ["debian-binary", "control.tar.xz", "data.tar.xz"]
        if members != expected:
            raise ValueError(f"invalid Debian ar member order: {members}")
    finally:
        if WORK_DIR.exists():
            shutil.rmtree(WORK_DIR)
    print(f"cross-win deb: {TARGET} ({TARGET.stat().st_size} bytes), GNU tar without PAX headers")


if __name__ == "__main__":
    main()

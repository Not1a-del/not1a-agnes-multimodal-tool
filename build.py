# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WEB_TOOL = ROOT / "web_tool"
DESKTOP = Path.home() / "Desktop"
PROJECT_NAME = "Not1a_Agnes_多模态工具"
RELEASE_ZIP_NAME = f"{PROJECT_NAME}_GitHub本地服务版.zip"
PACKAGE_ROOT = "Not1a-Agnes-Multimodal-Tool"


def add_file(zipf: zipfile.ZipFile, source: Path, target: str) -> None:
    if source.exists():
        zipf.write(source, target)
        print(f"Added {target}")


def add_tree(zipf: zipfile.ZipFile, source_dir: Path, target_dir: str) -> None:
    if not source_dir.exists():
        return
    for source in sorted(source_dir.rglob("*")):
        if source.is_file():
            relative = source.relative_to(source_dir).as_posix()
            add_file(zipf, source, f"{target_dir}/{relative}")


def build_release_zip() -> Path:
    DESKTOP.mkdir(parents=True, exist_ok=True)
    zip_path = DESKTOP / RELEASE_ZIP_NAME

    root_files = [
        "README.md",
        "CHANGELOG.md",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "LICENSE",
        ".gitignore",
        "build.py",
    ]
    web_files = [
        "index.html",
        "app.js",
        "styles.css",
        "favicon.svg",
        "server.py",
        "start_web_tool.bat",
        "使用教程.txt",
    ]

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for name in root_files:
            add_file(zipf, ROOT / name, f"{PACKAGE_ROOT}/{name}")
        for name in web_files:
            add_file(zipf, WEB_TOOL / name, f"{PACKAGE_ROOT}/web_tool/{name}")
        add_file(zipf, WEB_TOOL / "outputs" / ".gitkeep", f"{PACKAGE_ROOT}/web_tool/outputs/.gitkeep")
        add_tree(zipf, ROOT / ".github", f"{PACKAGE_ROOT}/.github")

    return zip_path


def build() -> None:
    zip_path = build_release_zip()
    print(f"Generated GitHub local-service zip: {zip_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the Not1a Agnes local-service release package.")
    parser.parse_args()
    build()

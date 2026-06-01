# -*- coding: utf-8 -*-
from __future__ import annotations

import base64
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WEB_TOOL = ROOT / "web_tool"
DESKTOP = Path.home() / "Desktop"
PROJECT_NAME = "Not1a_Agnes_多模态工具"
INLINE_HTML_NAME = f"{PROJECT_NAME}_单文件版.html"
RELEASE_ZIP_NAME = f"{PROJECT_NAME}_GitHub本地服务版.zip"
PACKAGE_ROOT = "Not1a-Agnes-Multimodal-Tool"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def build_inline_html() -> Path:
    html = read_text(WEB_TOOL / "index.html")
    css = read_text(WEB_TOOL / "styles.css")
    js = read_text(WEB_TOOL / "app.js")
    favicon_bytes = (WEB_TOOL / "favicon.svg").read_bytes()
    favicon_data_uri = f"data:image/svg+xml;base64,{base64.b64encode(favicon_bytes).decode('utf-8')}"

    html = html.replace(
        '<link rel="icon" type="image/svg+xml" href="./favicon.svg" />',
        f'<link rel="icon" type="image/svg+xml" href="{favicon_data_uri}" />',
    )
    html = html.replace('src="./favicon.svg"', f'src="{favicon_data_uri}"')
    html = html.replace(
        '<link rel="stylesheet" href="./styles.css" />',
        f"<style>\n{css}\n</style>",
    )
    html = html.replace('<script src="./app.js"></script>', f"<script>\n{js}\n</script>")

    DESKTOP.mkdir(parents=True, exist_ok=True)
    out_path = DESKTOP / INLINE_HTML_NAME
    out_path.write_text(html, encoding="utf-8")
    return out_path


def add_file(zipf: zipfile.ZipFile, source: Path, target: str) -> None:
    if source.exists():
        zipf.write(source, target)
        print(f"Added {target}")


def build_release_zip() -> Path:
    DESKTOP.mkdir(parents=True, exist_ok=True)
    zip_path = DESKTOP / RELEASE_ZIP_NAME

    root_files = [
        "README.md",
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

    return zip_path


def build() -> None:
    html_path = build_inline_html()
    zip_path = build_release_zip()
    print(f"Generated single HTML: {html_path}")
    print(f"Generated GitHub local-service zip: {zip_path}")


if __name__ == "__main__":
    build()

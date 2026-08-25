#!/usr/bin/env python3
"""Redact signing tokens from Playwright failure artifacts. Local/CI test helper only."""

from __future__ import annotations

import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path

QUERY = re.compile(r'([?&]token=)[^&\s"\'<>\\]+', re.I)
NAMED = re.compile(r'("(?:token|rawToken|uploadToken|signingToken)"\s*:\s*")[^"]+', re.I)
TEXT_SUFFIXES = {'.md', '.txt', '.json', '.html', '.log', '.xml'}


def redact_text(value: str) -> str:
    return NAMED.sub(r'\1REDACTED', QUERY.sub(r'\1REDACTED', value))


def redact_zip(path: Path) -> None:
    changed = False
    buffer = BytesIO()
    with zipfile.ZipFile(path, 'r') as src, zipfile.ZipFile(
        buffer, 'w', compression=zipfile.ZIP_DEFLATED
    ) as dest:
        for info in src.infolist():
            data = src.read(info.filename)
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                dest.writestr(info, data)
                continue
            next_text = redact_text(text)
            if next_text != text:
                changed = True
            dest.writestr(info, next_text.encode('utf-8'))
    if changed:
        path.write_bytes(buffer.getvalue())


def walk(root: Path) -> None:
    if not root.exists():
        return
    for path in root.rglob('*'):
        if not path.is_file():
            continue
        if path.suffix == '.zip':
            redact_zip(path)
            continue
        if path.suffix not in TEXT_SUFFIXES:
            continue
        original = path.read_text(encoding='utf-8')
        next_text = redact_text(original)
        if next_text != original:
            path.write_text(next_text, encoding='utf-8')


def main() -> int:
    for argument in sys.argv[1:]:
        walk(Path(argument))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

from __future__ import annotations

from urllib import parse as urllib_parse


def build_attachment_content_disposition(file_name: str) -> str:
    normalized = (file_name or "").replace("\r", " ").replace("\n", " ").strip()
    if not normalized:
        normalized = "report.docx"

    ascii_fallback = "".join(char if 32 <= ord(char) < 127 and char not in {'"', "\\"} else "_" for char in normalized)
    ascii_fallback = ascii_fallback.strip(" .")
    if not ascii_fallback:
        ascii_fallback = "report.docx"

    encoded_name = urllib_parse.quote(normalized, safe="")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_name}"


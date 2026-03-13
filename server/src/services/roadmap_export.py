from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from src.core import config
from src.db.edu.schemas import RoadmapExportInfoItem


class RoadmapExportGeneratorError(RuntimeError):
    pass


@dataclass(slots=True)
class RoadmapExportResult:
    file_name: str
    content: bytes


class RoadmapExportService:
    _DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    async def export(
        self,
        *,
        items: list[RoadmapExportInfoItem],
        organization_id: int,
        academic_year: str,
    ) -> RoadmapExportResult:
        content = await asyncio.to_thread(self._generate_document, items)
        safe_year = academic_year.replace("/", "-")
        return RoadmapExportResult(
            file_name=f"roadmap_{organization_id}_{safe_year}.docx",
            content=content,
        )

    def _generate_document(self, items: list[RoadmapExportInfoItem]) -> bytes:
        generate_url = urllib_parse.urljoin(
            config.docx_generator_base_url.rstrip("/") + "/",
            "generate/road_map",
        )
        try:
            payload = [item.model_dump(mode="json") for item in items]
            request_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            generate_request = urllib_request.Request(
                generate_url,
                data=request_body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib_request.urlopen(generate_request, timeout=60) as response:
                raw_response = response.read()
                content_type = response.headers.get("Content-Type", "")
            if self._DOCX_MEDIA_TYPE in content_type:
                return raw_response

            generate_payload = json.loads(raw_response.decode("utf-8"))
            download_url = generate_payload.get("download_url")
            file_id = generate_payload.get("file_id")
            if not isinstance(download_url, str) or not download_url:
                if isinstance(file_id, str) and file_id.strip():
                    download_url = f"/download/{urllib_parse.quote(file_id.strip(), safe='')}"
                else:
                    raise RoadmapExportGeneratorError("DOCX сервис не вернул ссылку на скачивание файла")

            return self._download_document(download_url, file_id if isinstance(file_id, str) else None)

        except RoadmapExportGeneratorError:
            raise
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RoadmapExportGeneratorError(
                f"Ошибка DOCX сервиса ({exc.code}): {detail or exc.reason}"
            ) from exc
        except urllib_error.URLError as exc:
            raise RoadmapExportGeneratorError(
                f"Не удалось подключиться к DOCX сервису: {exc.reason}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise RoadmapExportGeneratorError("DOCX сервис вернул некорректный ответ") from exc

    def _download_document(self, download_url: str, file_id: str | None) -> bytes:
        attempts: list[str] = []
        for url in self._download_candidates(download_url, file_id):
            try:
                with urllib_request.urlopen(url, timeout=60) as response:
                    return response.read()
            except urllib_error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="ignore")
                attempts.append(f"{url} -> HTTP {exc.code}: {detail or exc.reason}")
            except urllib_error.URLError as exc:
                attempts.append(f"{url} -> {exc.reason}")

        joined_attempts = "; ".join(attempts)
        raise RoadmapExportGeneratorError(
            f"Не удалось скачать сформированный DOCX файл: {joined_attempts}"
        )

    def _download_candidates(self, download_url: str, file_id: str | None) -> list[str]:
        base_url = config.docx_generator_base_url.rstrip("/") + "/"
        candidates: list[str] = []

        def push(url: str | None) -> None:
            if url and url not in candidates:
                candidates.append(url)

        normalized_download_url = download_url.strip()
        parsed_download_url = urllib_parse.urlparse(normalized_download_url)

        if parsed_download_url.scheme and parsed_download_url.netloc:
            push(normalized_download_url)

            path_and_query = parsed_download_url.path or ""
            if parsed_download_url.query:
                path_and_query = f"{path_and_query}?{parsed_download_url.query}"
            if path_and_query:
                push(urllib_parse.urljoin(base_url, path_and_query.lstrip("/")))
        else:
            push(urllib_parse.urljoin(base_url, normalized_download_url.lstrip("/")))

        if file_id and file_id.strip():
            push(urllib_parse.urljoin(base_url, f"download/{urllib_parse.quote(file_id.strip(), safe='')}"))

        return candidates

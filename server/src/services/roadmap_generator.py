from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

from src.db.edu.models import RoadmapDirection


@dataclass(slots=True)
class RoadmapEventRow:
    description: str
    execution_dates: str
    responsibles: str
    target_audience: str


class RoadmapDocxGenerator:
    SECTION_ORDER = [
        RoadmapDirection.PROFESSIONAL_EDUCATION,
        RoadmapDirection.PRACTICE_ORIENTED,
        RoadmapDirection.DIAGNOSTIC,
        RoadmapDirection.PARENTS,
        RoadmapDirection.INFORMATIONAL,
    ]

    def __init__(self, template_dir: Path | None = None):
        self.template_dir = template_dir or Path(__file__).resolve().parents[3] / "RoadmapService"

    def generate(self, grouped_rows: dict[RoadmapDirection, list[RoadmapEventRow]]) -> bytes:
        from docx import Document

        template_path = self._resolve_template_path()
        document = Document(str(template_path))
        table = self._find_roadmap_table(document)
        if table is None:
            raise ValueError("Roadmap table was not found in DOCX template")

        self._populate_sections(table, grouped_rows)

        buffer = BytesIO()
        document.save(buffer)
        return buffer.getvalue()

    def _resolve_template_path(self) -> Path:
        explicit_template = self.template_dir / "roadmap_template.docx"
        if explicit_template.exists():
            return explicit_template

        docx_files = sorted(self.template_dir.glob("*.docx"))
        if not docx_files:
            raise FileNotFoundError(f"No .docx files were found in {self.template_dir}")

        for file_path in docx_files:
            lowered = file_path.name.lower()
            if "example" in lowered or "suzorye" in lowered:
                continue
            if "(" in file_path.name and ")" in file_path.name:
                return file_path

        for file_path in docx_files:
            lowered = file_path.name.lower()
            if "example" in lowered or "suzorye" in lowered:
                continue
            return file_path

        return docx_files[0]

    @staticmethod
    def _find_roadmap_table(document: Any):
        for table in document.tables:
            if not table.rows:
                continue
            if len(table.rows[0].cells) >= 5:
                return table
        return None

    @staticmethod
    def _normalize(text: str) -> str:
        return " ".join(text.split())

    def _find_section_row_index(self, table: Any, section_name: str) -> int | None:
        target = self._normalize(section_name)
        for idx, row in enumerate(table.rows):
            if len(row.cells) != 1:
                continue
            if self._normalize(row.cells[0].text) == target:
                return idx
        return None

    def _find_next_section_index(self, table: Any, section_index: int) -> int:
        section_names = {item.value for item in self.SECTION_ORDER}
        for idx in range(section_index + 1, len(table.rows)):
            row = table.rows[idx]
            if len(row.cells) != 1:
                continue
            if self._normalize(row.cells[0].text) in section_names:
                return idx
        return len(table.rows)

    @staticmethod
    def _clear_section_rows(table: Any, section_index: int, next_section_index: int) -> None:
        for idx in range(next_section_index - 1, section_index, -1):
            row = table.rows[idx]
            if len(row.cells) >= 5:
                table._tbl.remove(row._tr)

    @staticmethod
    def _select_template_row_xml(table: Any, section_index: int, next_section_index: int):
        for idx in range(section_index + 1, next_section_index):
            row = table.rows[idx]
            if len(row.cells) >= 5:
                return deepcopy(row._tr)
        return None

    @staticmethod
    def _set_row_values(row: Any, number: str, data: RoadmapEventRow) -> None:
        row.cells[0].text = number
        row.cells[1].text = data.description
        row.cells[2].text = data.execution_dates
        row.cells[3].text = data.responsibles
        row.cells[4].text = data.target_audience

    def _populate_sections(self, table: Any, grouped_rows: dict[RoadmapDirection, list[RoadmapEventRow]]) -> None:
        from docx.table import _Row

        for section in reversed(self.SECTION_ORDER):
            section_index = self._find_section_row_index(table, section.value)
            if section_index is None:
                continue

            next_section_index = self._find_next_section_index(table, section_index)
            template_row_xml = self._select_template_row_xml(table, section_index, next_section_index)
            if template_row_xml is None:
                continue

            self._clear_section_rows(table, section_index, next_section_index)

            insertion_anchor = table.rows[section_index + 1]._tr if section_index + 1 < len(table.rows) else None
            rows = grouped_rows.get(section, [])

            if not rows:
                blank_row_xml = deepcopy(template_row_xml)
                if insertion_anchor is None:
                    table._tbl.append(blank_row_xml)
                else:
                    insertion_anchor.addprevious(blank_row_xml)
                self._set_row_values(_Row(blank_row_xml, table), "", RoadmapEventRow("", "", "", ""))
                continue

            for number, row_data in enumerate(rows, start=1):
                new_row_xml = deepcopy(template_row_xml)
                if insertion_anchor is None:
                    table._tbl.append(new_row_xml)
                else:
                    insertion_anchor.addprevious(new_row_xml)
                self._set_row_values(_Row(new_row_xml, table), f"{number}.", row_data)

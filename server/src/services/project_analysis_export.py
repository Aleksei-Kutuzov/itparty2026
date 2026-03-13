from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core import config
from src.db.edu.models import (
    ClassProfile,
    Event,
    Participation,
    Student,
    StudentAdditionalEducation,
    StudentFirstProfession,
    StudentResearchWork,
)
from src.db.edu.repo import ClassProfileRepository, OrganizationRepository


class ProjectAnalysisExportType(str, Enum):
    CLASS_INFO = "class-info"
    PROFILE_PERFORMANCE = "profile-performance"
    OLYMPIAD = "olympiad"
    APZ_PARTICIPATION = "apz-participation"
    RESEARCH_WORKS = "research-works"
    ADDITIONAL_EDUCATION = "additional-education"
    FIRST_PROFESSION = "first-profession"
    EXTERNAL_CAREER = "external-career"
    GENERAL = "general"


class ProjectAnalysisNotFoundError(RuntimeError):
    pass


class ProjectAnalysisNoDataError(RuntimeError):
    pass


class ProjectAnalysisGeneratorError(RuntimeError):
    pass


@dataclass(slots=True)
class ProjectAnalysisExportResult:
    file_name: str
    content: bytes


class ProjectAnalysisExportService:
    _CLASS_GROUP_DELIMITER = "::"
    _DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    _NO_DATA_TEXT = "Нет данных"
    _EXPORT_UNKNOWN_TEXT = "Не указан"

    def __init__(self, session: AsyncSession):
        self.session = session

    async def export(
        self,
        *,
        export_type: ProjectAnalysisExportType,
        organization_id: int,
        class_name: str,
        period: date,
    ) -> ProjectAnalysisExportResult:
        organization = await OrganizationRepository(self.session).get_by_id(organization_id)
        if organization is None:
            raise ProjectAnalysisNotFoundError("Организация не найдена")

        class_profile = await ClassProfileRepository(self.session).get_by_org_and_name(
            organization_id,
            class_name.strip(),
        )
        if class_profile is None:
            raise ProjectAnalysisNotFoundError("Класс не найден в выбранной организации")

        students = await self._list_students_for_class(organization_id, class_profile)
        payload = await self._build_payload(
            export_type=export_type,
            organization_name=organization.name,
            class_profile=class_profile,
            students=students,
            period=period,
        )
        content = await asyncio.to_thread(self._generate_document, export_type, payload)

        return ProjectAnalysisExportResult(
            file_name=self._build_file_name(export_type, organization.name, class_profile.class_name, period),
            content=content,
        )

    @property
    def media_type(self) -> str:
        return self._DOCX_MEDIA_TYPE

    async def _build_payload(
        self,
        *,
        export_type: ProjectAnalysisExportType,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        builders = {
            ProjectAnalysisExportType.CLASS_INFO: self._build_class_info_payload,
            ProjectAnalysisExportType.PROFILE_PERFORMANCE: self._build_profile_performance_payload,
            ProjectAnalysisExportType.OLYMPIAD: self._build_olympiad_payload,
            ProjectAnalysisExportType.APZ_PARTICIPATION: self._build_apz_participation_payload,
            ProjectAnalysisExportType.RESEARCH_WORKS: self._build_research_works_payload,
            ProjectAnalysisExportType.ADDITIONAL_EDUCATION: self._build_additional_education_payload,
            ProjectAnalysisExportType.FIRST_PROFESSION: self._build_first_profession_payload,
            ProjectAnalysisExportType.EXTERNAL_CAREER: self._build_external_career_payload,
            ProjectAnalysisExportType.GENERAL: self._build_general_payload,
        }
        builder = builders[export_type]
        return await builder(
            organization_name=organization_name,
            class_profile=class_profile,
            students=students,
            period=period,
        )

    def _common_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        return {
            "organization_name": organization_name,
            "class_name": class_profile.class_name,
            "period": datetime.combine(period, datetime.min.time(), tzinfo=timezone.utc).isoformat(),
        }

    async def _build_class_info_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload.update(
            formation_year=class_profile.formation_year,
            students_count=len(students),
        )
        return payload

    async def _build_profile_performance_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        if not students:
            raise ProjectAnalysisNoDataError("Для выбранного класса нет учеников")

        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["students"] = [
            {
                "full_name": student.full_name,
                "avg_score": round(student.average_percent or 0.0, 2),
            }
            for student in students
        ]
        return payload

    async def _build_olympiad_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        records = await self._build_participation_records(
            students=students,
            organization_id=class_profile.organization_id,
            class_name=class_profile.class_name,
            period=period,
            olympiad_only=True,
        )
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = records
        return payload

    async def _build_general_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        class_info = await self._build_class_info_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            students=students,
            period=period,
        )

        try:
            profile_performance = await self._build_profile_performance_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                students=students,
                period=period,
            )
        except ProjectAnalysisNoDataError:
            profile_performance = self._default_profile_performance_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                period=period,
            )

        try:
            olympiad_participation = await self._build_olympiad_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                students=students,
                period=period,
            )
        except ProjectAnalysisNoDataError:
            olympiad_participation = self._default_olympiad_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                period=period,
            )

        try:
            apz_participation = await self._build_apz_participation_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                students=students,
                period=period,
            )
        except ProjectAnalysisNoDataError:
            apz_participation = self._default_apz_participation_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                period=period,
            )

        try:
            research_works = await self._build_research_works_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                students=students,
                period=period,
            )
        except ProjectAnalysisNoDataError:
            research_works = self._default_research_works_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                period=period,
            )

        try:
            additional_education = await self._build_additional_education_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                students=students,
                period=period,
            )
        except ProjectAnalysisNoDataError:
            additional_education = self._default_additional_education_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                period=period,
            )

        try:
            first_profession = await self._build_first_profession_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                students=students,
                period=period,
            )
        except ProjectAnalysisNoDataError:
            first_profession = self._default_first_profession_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                period=period,
            )

        try:
            external_career_events = await self._build_external_career_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                students=students,
                period=period,
            )
        except ProjectAnalysisNoDataError:
            external_career_events = self._default_external_career_payload(
                organization_name=organization_name,
                class_profile=class_profile,
                period=period,
            )

        return {
            "class_info": class_info,
            "profile_performance": profile_performance,
            "olympiad_participation": olympiad_participation,
            "apz_participation": apz_participation,
            "research_works": research_works,
            "additional_education": additional_education,
            "first_profession": first_profession,
            "external_career_events": external_career_events,
        }

    def _default_profile_performance_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["students"] = [{"full_name": self._NO_DATA_TEXT, "avg_score": 0.0}]
        return payload

    def _default_olympiad_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = [
            {
                "full_name": self._NO_DATA_TEXT,
                "events": [
                    {
                        "status": self._NO_DATA_TEXT,
                        "event_name": self._NO_DATA_TEXT,
                        "event_date": [period.isoformat()],
                    }
                ],
            }
        ]
        return payload

    def _default_apz_participation_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        return self._default_olympiad_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )

    def _default_research_works_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = [
            {
                "full_name": self._NO_DATA_TEXT,
                "works": [
                    {
                        "work_title": self._NO_DATA_TEXT,
                        "publication_or_presentation_place": self._NO_DATA_TEXT,
                    }
                ],
            }
        ]
        return payload

    def _default_additional_education_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = [
            {
                "full_name": self._NO_DATA_TEXT,
                "program_name": self._NO_DATA_TEXT,
                "provider_organization": self._NO_DATA_TEXT,
            }
        ]
        return payload

    def _default_first_profession_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = [
            {
                "full_name": self._NO_DATA_TEXT,
                "educational_organization": self._NO_DATA_TEXT,
                "training_program": self._NO_DATA_TEXT,
                "study_period": self._NO_DATA_TEXT,
                "document": self._NO_DATA_TEXT,
            }
        ]
        return payload

    def _default_external_career_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        period: date,
    ) -> dict[str, Any]:
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = [
            {
                "event_date": period.isoformat(),
                "event_name": self._NO_DATA_TEXT,
                "organizer": self._NO_DATA_TEXT,
                "level": self._NO_DATA_TEXT,
                "event_format": self._NO_DATA_TEXT,
                "participants_count": 0,
            }
        ]
        return payload

    async def _build_apz_participation_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        records = await self._build_participation_records(
            students=students,
            organization_id=class_profile.organization_id,
            class_name=class_profile.class_name,
            period=period,
            olympiad_only=False,
        )
        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = records
        return payload

    async def _build_research_works_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        student_ids = [student.id for student in students]
        if not student_ids:
            raise ProjectAnalysisNoDataError("Для выбранного класса нет учеников")

        stmt = (
            select(StudentResearchWork, Student)
            .join(Student, Student.id == StudentResearchWork.student_id)
            .where(StudentResearchWork.student_id.in_(student_ids))
            .order_by(Student.full_name.asc(), StudentResearchWork.created_at.asc())
        )
        rows = list((await self.session.execute(stmt)).all())
        if not rows:
            raise ProjectAnalysisNoDataError("Нет исследовательских работ для выбранного класса")

        grouped: dict[int, dict[str, Any]] = {}
        for work, student in rows:
            record = grouped.setdefault(
                student.id,
                {"full_name": student.full_name, "works": []},
            )
            record["works"].append(
                {
                    "work_title": work.work_title,
                    "publication_or_presentation_place": work.publication_or_presentation_place,
                }
            )

        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = list(grouped.values())
        return payload

    async def _build_additional_education_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        student_ids = [student.id for student in students]
        if not student_ids:
            raise ProjectAnalysisNoDataError("Для выбранного класса нет учеников")

        stmt = (
            select(StudentAdditionalEducation, Student)
            .join(Student, Student.id == StudentAdditionalEducation.student_id)
            .where(StudentAdditionalEducation.student_id.in_(student_ids))
            .order_by(Student.full_name.asc(), StudentAdditionalEducation.created_at.asc())
        )
        rows = list((await self.session.execute(stmt)).all())
        if not rows:
            raise ProjectAnalysisNoDataError("Нет записей по дополнительному образованию для выбранного класса")

        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = [
            {
                "full_name": student.full_name,
                "program_name": entry.program_name,
                "provider_organization": entry.provider_organization,
            }
            for entry, student in rows
        ]
        return payload

    async def _build_first_profession_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        student_ids = [student.id for student in students]
        if not student_ids:
            raise ProjectAnalysisNoDataError("Для выбранного класса нет учеников")

        stmt = (
            select(StudentFirstProfession, Student)
            .join(Student, Student.id == StudentFirstProfession.student_id)
            .where(StudentFirstProfession.student_id.in_(student_ids))
            .order_by(Student.full_name.asc(), StudentFirstProfession.created_at.asc())
        )
        rows = list((await self.session.execute(stmt)).all())
        if not rows:
            raise ProjectAnalysisNoDataError("Нет данных по первой профессии для выбранного класса")

        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = [
            {
                "full_name": student.full_name,
                "educational_organization": entry.educational_organization,
                "training_program": entry.training_program,
                "study_period": entry.study_period,
                "document": entry.document,
            }
            for entry, student in rows
        ]
        return payload

    async def _build_external_career_payload(
        self,
        *,
        organization_name: str,
        class_profile: ClassProfile,
        students: list[Student],
        period: date,
    ) -> dict[str, Any]:
        events = await self._list_class_events(
            organization_id=class_profile.organization_id,
            class_name=class_profile.class_name,
            period=period,
        )
        if not events:
            raise ProjectAnalysisNoDataError("Нет мероприятий для выгрузки по выбранному периоду")

        participations = await self._list_participations(students, class_profile.organization_id)
        participants_count_by_event: dict[int, int] = {}
        for participation in participations:
            participants_count_by_event[participation.event_id] = participants_count_by_event.get(participation.event_id, 0) + 1

        records: list[dict[str, Any]] = []
        for event in events:
            event_range = self._resolve_event_range_for_period(event, period)
            if event_range is None:
                continue
            records.append(
                {
                    "event_date": event_range[0].isoformat(),
                    "event_name": self._normalize_export_text(event.title, self._EXPORT_UNKNOWN_TEXT),
                    "organizer": self._normalize_export_text(event.organizer, self._EXPORT_UNKNOWN_TEXT),
                    "level": self._normalize_export_text(
                        event.event_level,
                        self._EXPORT_UNKNOWN_TEXT,
                        min_length=1,
                    ),
                    "event_format": self._normalize_export_text(event.event_format, self._EXPORT_UNKNOWN_TEXT),
                    "participants_count": (
                        event.participants_count
                        if event.participants_count is not None
                        else participants_count_by_event.get(event.id, 0)
                    ),
                }
            )

        if not records:
            raise ProjectAnalysisNoDataError("Нет мероприятий для выгрузки по выбранному периоду")

        payload = self._common_payload(
            organization_name=organization_name,
            class_profile=class_profile,
            period=period,
        )
        payload["records"] = records
        return payload

    async def _build_participation_records(
        self,
        *,
        students: list[Student],
        organization_id: int,
        class_name: str,
        period: date,
        olympiad_only: bool,
    ) -> list[dict[str, Any]]:
        participations = await self._list_participations(students, organization_id)
        if not participations:
            raise ProjectAnalysisNoDataError("Нет данных по участию для выбранного класса")

        grouped: dict[int, dict[str, Any]] = {}
        for participation in participations:
            student = participation.student
            event = participation.event
            if student is None or event is None:
                continue
            if olympiad_only and not self._is_olympiad_event(event):
                continue
            if not self._event_targets_class(event, class_name):
                continue
            event_range = self._resolve_event_range_for_period(event, period)
            if event_range is None:
                continue

            record = grouped.setdefault(
                student.id,
                {"full_name": student.full_name, "events": []},
            )
            record["events"].append(
                {
                    "status": participation.status or participation.result or participation.participation_type or "Участник",
                    "event_name": event.title,
                    "event_date": [item.isoformat() for item in event_range],
                }
            )

        records = [record for _, record in sorted(grouped.items(), key=lambda item: item[1]["full_name"])]
        if not records:
            if olympiad_only:
                raise ProjectAnalysisNoDataError("Нет олимпиад для выбранного класса и периода")
            raise ProjectAnalysisNoDataError("Нет данных по участию для выбранного класса и периода")
        return records

    async def _list_students_for_class(self, organization_id: int, class_profile: ClassProfile) -> list[Student]:
        stmt = (
            select(Student)
            .where(Student.organization_id == organization_id)
            .order_by(Student.full_name.asc())
        )
        rows = list((await self.session.execute(stmt)).scalars().all())
        return [
            student
            for student in rows
            if student.class_profile_id == class_profile.id
            or self._normalize_student_class_name(student.school_class) == class_profile.class_name
        ]

    async def _list_participations(self, students: list[Student], organization_id: int) -> list[Participation]:
        student_ids = [student.id for student in students]
        if not student_ids:
            return []

        stmt = (
            select(Participation)
            .options(
                selectinload(Participation.student),
                selectinload(Participation.event).selectinload(Event.schedule_dates),
            )
            .join(Student, Student.id == Participation.student_id)
            .join(Event, Event.id == Participation.event_id)
            .where(Participation.student_id.in_(student_ids))
            .where(Event.organization_id == organization_id)
            .order_by(Student.full_name.asc(), Event.starts_at.asc(), Participation.id.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def _list_class_events(
        self,
        *,
        organization_id: int,
        class_name: str,
        period: date,
    ) -> list[Event]:
        period_start, period_end = self._quarter_bounds(period)
        stmt = (
            select(Event)
            .options(selectinload(Event.schedule_dates))
            .where(Event.organization_id == organization_id)
            .order_by(Event.starts_at.asc(), Event.id.asc())
        )
        rows = list((await self.session.execute(stmt)).scalars().all())
        return [
            event
            for event in rows
            if self._event_targets_class(event, class_name)
            and self._event_overlaps_period(event, period_start, period_end)
        ]

    def _generate_document(self, export_type: ProjectAnalysisExportType, payload: dict[str, Any]) -> bytes:
        generate_url = urllib_parse.urljoin(
            config.docx_generator_base_url.rstrip("/") + "/",
            f"generate/{export_type.value}",
        )
        try:
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
                    raise ProjectAnalysisGeneratorError("DOCX сервис не вернул ссылку на скачивание файла")

            return self._download_document(download_url, file_id if isinstance(file_id, str) else None)

        except ProjectAnalysisGeneratorError:
            raise
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ProjectAnalysisGeneratorError(
                f"Ошибка DOCX сервиса ({exc.code}): {detail or exc.reason}"
            ) from exc
        except urllib_error.URLError as exc:
            raise ProjectAnalysisGeneratorError(
                f"Не удалось подключиться к DOCX сервису: {exc.reason}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise ProjectAnalysisGeneratorError("DOCX сервис вернул некорректный ответ") from exc

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
        raise ProjectAnalysisGeneratorError(
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

    def _build_file_name(
        self,
        export_type: ProjectAnalysisExportType,
        organization_name: str,
        class_name: str,
        period: date,
    ) -> str:
        org_part = self._sanitize_filename_part(organization_name)
        class_part = self._sanitize_filename_part(class_name)
        return f"apz_{export_type.value}_{org_part}_{class_part}_{period:%Y%m%d}.docx"

    def _sanitize_filename_part(self, value: str) -> str:
        cleaned = re.sub(r"[^\w.-]+", "_", value.strip(), flags=re.UNICODE)
        cleaned = cleaned.strip("._")
        return cleaned or "report"

    def _normalize_export_text(self, value: str | None, fallback: str, *, min_length: int = 2) -> str:
        normalized = (value or "").strip()
        if len(normalized) >= min_length:
            return normalized
        fallback_normalized = fallback.strip()
        if len(fallback_normalized) >= min_length:
            return fallback_normalized
        return fallback_normalized or "n/a"

    def _normalize_student_class_name(self, school_class: str) -> str:
        return school_class.split(self._CLASS_GROUP_DELIMITER, 1)[0].strip()

    def _is_olympiad_event(self, event: Event) -> bool:
        normalized = " ".join(
            part.strip().lower()
            for part in [event.title, event.event_type, event.description or ""]
            if part and part.strip()
        )
        return "олимпиад" in normalized

    def _event_targets_class(self, event: Event, class_name: str) -> bool:
        normalized_class_name = class_name.strip().lower()
        class_names = self._parse_event_class_names(event.target_class_names, event.target_class_name)
        normalized_targets = [item.lower() for item in class_names]
        if normalized_class_name in normalized_targets:
            return True

        if event.target_audience and normalized_class_name in event.target_audience.lower():
            return True

        return not normalized_targets

    def _parse_event_class_names(self, raw: str | None, fallback: str | None) -> list[str]:
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    cleaned = [str(item).strip() for item in parsed if str(item).strip()]
                    return list(dict.fromkeys(cleaned))
            except json.JSONDecodeError:
                pass

            cleaned = [item.strip() for item in raw.split(",") if item.strip()]
            return list(dict.fromkeys(cleaned))

        if fallback and fallback.strip():
            return [fallback.strip()]
        return []

    def _quarter_bounds(self, period: date) -> tuple[datetime, datetime]:
        year = period.year
        month = period.month
        if 9 <= month <= 11:
            return (
                datetime(year, 9, 1, 0, 0, 0, tzinfo=timezone.utc),
                datetime(year, 11, 30, 23, 59, 59, tzinfo=timezone.utc),
            )
        if month == 12:
            return (
                datetime(year, 12, 1, 0, 0, 0, tzinfo=timezone.utc),
                datetime(year + 1, 2, 28 if not self._is_leap_year(year + 1) else 29, 23, 59, 59, tzinfo=timezone.utc),
            )
        if 1 <= month <= 2:
            return (
                datetime(year - 1, 12, 1, 0, 0, 0, tzinfo=timezone.utc),
                datetime(year, 2, 28 if not self._is_leap_year(year) else 29, 23, 59, 59, tzinfo=timezone.utc),
            )
        if 3 <= month <= 5:
            return (
                datetime(year, 3, 1, 0, 0, 0, tzinfo=timezone.utc),
                datetime(year, 5, 31, 23, 59, 59, tzinfo=timezone.utc),
            )
        return (
            datetime(year, 6, 1, 0, 0, 0, tzinfo=timezone.utc),
            datetime(year, 8, 31, 23, 59, 59, tzinfo=timezone.utc),
        )

    def _is_leap_year(self, year: int) -> bool:
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

    def _event_overlaps_period(self, event: Event, period_start: datetime, period_end: datetime) -> bool:
        if self._ranges_overlap(event.starts_at, event.ends_at, period_start, period_end):
            return True

        for schedule_date in event.schedule_dates:
            schedule_end = schedule_date.ends_at or schedule_date.starts_at
            if self._ranges_overlap(schedule_date.starts_at, schedule_end, period_start, period_end):
                return True
        return False

    def _resolve_event_range_for_period(self, event: Event, period: date) -> tuple[date, ...] | None:
        period_start, period_end = self._quarter_bounds(period)

        for schedule_date in sorted(event.schedule_dates, key=lambda item: item.starts_at):
            schedule_end = schedule_date.ends_at or schedule_date.starts_at
            if self._ranges_overlap(schedule_date.starts_at, schedule_end, period_start, period_end):
                if schedule_end.date() == schedule_date.starts_at.date():
                    return (schedule_date.starts_at.date(),)
                return (schedule_date.starts_at.date(), schedule_end.date())

        if not self._ranges_overlap(event.starts_at, event.ends_at, period_start, period_end):
            return None

        if event.ends_at.date() == event.starts_at.date():
            return (event.starts_at.date(),)
        return (event.starts_at.date(), event.ends_at.date())

    def _ranges_overlap(
        self,
        left_start: datetime,
        left_end: datetime,
        right_start: datetime,
        right_end: datetime,
    ) -> bool:
        return left_start <= right_end and left_end >= right_start

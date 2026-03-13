from __future__ import annotations

import datetime
from datetime import date, timedelta
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class ExportBase(BaseModel):
    """Common fields required for every DOCX export payload."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    organization_name: str = Field(..., min_length=2, max_length=255)
    period: datetime.datetime

    template_path: str



class ClassScopedExportBase(ExportBase):
    class_name: str = Field(..., min_length=1, max_length=20)


class DocClassInfoPayload(ClassScopedExportBase):
    formation_year: int = Field(..., ge=1900, le=2100)
    students_count: int = Field(..., ge=0, le=1000)

    template_path: str = "class_info.docx"


class ProfilePerformanceRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    avg_score: float = Field(..., ge=0.0, le=100.0)


class DocProfilePerformancePayload(ClassScopedExportBase):
    students: list[ProfilePerformanceRow] = Field(..., min_length=1)

    template_path: str = "profile_performance.docx"


class EventParticipationPart(BaseModel):
    status: str = Field(default="Участник", min_length=2, max_length=100)
    event_name: str = Field(..., min_length=2, max_length=255)
    event_date: list[date] # может быть один, а может промежутком как 2 даты

class OlympiadParticipationRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    events: list[EventParticipationPart]



class DocOlympiadParticipationPayload(ClassScopedExportBase):
    records: list[OlympiadParticipationRow] = Field(..., min_length=1)

    template_path: str = "olympiad_participation.docx"

class ApzParticipationRow(OlympiadParticipationRow):
    pass


class DocApzParticipationPayload(ClassScopedExportBase):
    records: list[ApzParticipationRow] = Field(..., min_length=1)
    template_path: str = "apz_participation.docx"

class Work(BaseModel):
    work_title: str = Field(..., min_length=2, max_length=500)
    publication_or_presentation_place: str = Field(..., min_length=2, max_length=500)


class ResearchWorkRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    works: list[Work]
    full_name: str = Field(..., min_length=2, max_length=255)


class DocResearchWorksPayload(ClassScopedExportBase):
    records: list[ResearchWorkRow] = Field(..., min_length=1)
    template_path: str = "research_works.docx"


class AdditionalEducationRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    program_name: str = Field(..., min_length=2, max_length=255)
    provider_organization: str = Field(..., min_length=2, max_length=255)


class DocAdditionalEducationPayload(ClassScopedExportBase):
    records: list[AdditionalEducationRow] = Field(..., min_length=1)

    template_path: str = "additional_education.docx"


class FirstProfessionRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    educational_organization: str = Field(..., min_length=2, max_length=255)
    training_program: str = Field(..., min_length=2, max_length=255)
    study_period: str = Field(..., min_length=2, max_length=100)
    document: str = Field(..., min_length=2, max_length=255)


class DocFirstProfessionPayload(ClassScopedExportBase):
    records: list[FirstProfessionRow] = Field(..., min_length=1)

    template_path: str = "first_profession.docx"


class ExternalCareerEventRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_date: date
    event_name: str = Field(..., min_length=2, max_length=255)
    organizer: str = Field(..., min_length=2, max_length=255)
    level: str = Field(..., min_length=2, max_length=100)
    event_format: str = Field(..., min_length=2, max_length=100)
    participants_count: int = Field(..., ge=0, le=1000)


class DocExternalCareerEventsPayload(ClassScopedExportBase):
    records: list[ExternalCareerEventRow] = Field(..., min_length=1)

    template_path: str = "external_career.docx"

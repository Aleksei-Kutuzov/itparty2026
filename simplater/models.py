from __future__ import annotations

from datetime import date
from pydantic import BaseModel, ConfigDict, Field


class ExportBase(BaseModel):
    """Common fields required for every DOCX export payload."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    organization_name: str = Field(..., min_length=2, max_length=255)


class ClassScopedExportBase(ExportBase):
    """Base for exports that are tied to a specific class."""

    class_name: str = Field(..., min_length=1, max_length=20)


class Doc1ClassInfoPayload(ClassScopedExportBase):
    """1.docx: class overview."""

    formation_year: int = Field(..., ge=1900, le=2100)
    students_count: int = Field(..., ge=0, le=1000)


class Doc2ProfilePerformanceRow(BaseModel):
    """2.docx row: profile subjects performance for a student."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    informatics_avg_score: float = Field(..., ge=0.0, le=5.0)
    physics_avg_score: float = Field(..., ge=0.0, le=5.0)
    mathematics_avg_score: float = Field(..., ge=0.0, le=5.0)


class Doc2ProfilePerformancePayload(ClassScopedExportBase):
    """2.docx: profile subjects performance list."""

    students: list[Doc2ProfilePerformanceRow] = Field(..., min_length=1)


class Doc3OlympiadParticipationRow(BaseModel):
    """3.docx row: olympiad/competition participation."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    status: str = Field(default="Participation", min_length=2, max_length=100)
    event_name: str = Field(..., min_length=2, max_length=255)
    event_date: date


class Doc3OlympiadParticipationPayload(ClassScopedExportBase):
    """3.docx: olympiad and competition participation list."""

    records: list[Doc3OlympiadParticipationRow] = Field(..., min_length=1)


class Doc4AwardRow(BaseModel):
    """4.docx row: student awards."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    result: str = Field(..., min_length=2, max_length=255)
    event_name: str = Field(..., min_length=2, max_length=255)
    event_date: date


class Doc4AwardsPayload(ClassScopedExportBase):
    """4.docx: awards list."""

    records: list[Doc4AwardRow] = Field(..., min_length=1)


class Doc5ApzParticipationRow(BaseModel):
    """5.docx row: APZ event participation."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    status: str = Field(..., min_length=2, max_length=100)
    event_name: str = Field(..., min_length=2, max_length=255)
    event_date: date


class Doc5ApzParticipationPayload(ClassScopedExportBase):
    """5.docx: APZ events participation list."""

    records: list[Doc5ApzParticipationRow] = Field(..., min_length=1)


class Doc6ResearchWorkRow(BaseModel):
    """6.docx row: scientific/research work."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    work_title: str = Field(..., min_length=2, max_length=500)
    publication_or_presentation_place: str = Field(..., min_length=2, max_length=500)


class Doc6ResearchWorksPayload(ClassScopedExportBase):
    """6.docx: scientific/research works list."""

    records: list[Doc6ResearchWorkRow] = Field(..., min_length=1)


class Doc7AdditionalEducationRow(BaseModel):
    """7.docx row: additional education program."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    program_name: str = Field(..., min_length=2, max_length=255)
    provider_organization: str = Field(..., min_length=2, max_length=255)


class Doc7AdditionalEducationPayload(ClassScopedExportBase):
    """7.docx: additional education list."""

    records: list[Doc7AdditionalEducationRow] = Field(..., min_length=1)


class Doc8FirstProfessionRow(BaseModel):
    """8.docx row: first profession training data."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=2, max_length=255)
    educational_organization: str = Field(..., min_length=2, max_length=255)
    training_program: str = Field(..., min_length=2, max_length=255)
    study_period: str = Field(..., min_length=2, max_length=100)
    document: str = Field(..., min_length=2, max_length=255)


class Doc8FirstProfessionPayload(ClassScopedExportBase):
    """8.docx: first profession data list."""

    records: list[Doc8FirstProfessionRow] = Field(..., min_length=1)


class Doc9ExternalCareerEventRow(BaseModel):
    """9.docx row: external career guidance event for class."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_date: date
    event_name: str = Field(..., min_length=2, max_length=255)
    organizer: str = Field(..., min_length=2, max_length=255)
    level: str = Field(..., min_length=2, max_length=100)
    event_format: str = Field(..., min_length=2, max_length=100)
    participants_count: int = Field(..., ge=0, le=1000)


class Doc9ExternalCareerEventsPayload(ClassScopedExportBase):
    """9.docx: external career guidance events list."""

    records: list[Doc9ExternalCareerEventRow] = Field(..., min_length=1)


class ExportBundle(BaseModel):
    """Optional aggregate model when sending all templates in one request."""

    model_config = ConfigDict(extra="forbid")

    doc1: Doc1ClassInfoPayload
    doc2: Doc2ProfilePerformancePayload | None = None
    doc3: Doc3OlympiadParticipationPayload | None = None
    doc4: Doc4AwardsPayload | None = None
    doc5: Doc5ApzParticipationPayload | None = None
    doc6: Doc6ResearchWorksPayload | None = None
    doc7: Doc7AdditionalEducationPayload | None = None
    doc8: Doc8FirstProfessionPayload | None = None
    doc9: Doc9ExternalCareerEventsPayload | None = None

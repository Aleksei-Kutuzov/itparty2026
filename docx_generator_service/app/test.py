import datetime

from models import DocClassInfoPayload, DocProfilePerformancePayload, ProfilePerformanceRow, \
    DocOlympiadParticipationPayload, OlympiadParticipationRow, EventParticipationPart, DocResearchWorksPayload, \
    ResearchWorkRow, Work, DocAdditionalEducationPayload, AdditionalEducationRow, DocFirstProfessionPayload, \
    FirstProfessionRow, DocExternalCareerEventsPayload, ExternalCareerEventRow
from templater import generate_template

# doc1 = DocClassInfoPayload(organization_name="OO", period=datetime.datetime.now(), class_name="12B", formation_year=1999, students_count=39)
# doc2 = DocProfilePerformancePayload(organization_name="Org1", period=datetime.datetime.now(), class_name="12A", students=[ProfilePerformanceRow(full_name="Abs", avg_score=3), ProfilePerformanceRow(full_name="Boo", avg_score=4.5)])
doc3 = DocOlympiadParticipationPayload(
    organization_name="МБОУ СОШ №123",
    period=datetime.datetime.now(),
    class_name="11А",
    records=[
        # Студент с 1 событием
        OlympiadParticipationRow(
            full_name="Алексеев Иван Петрович",
            events=[
                EventParticipationPart(
                    status="Победитель",
                    event_name="Всероссийская олимпиада по математике",
                    event_date=[datetime.date(year=2024, month=3, day=15)]
                )
            ]
        ),

        # Студент с 2 событиями
        OlympiadParticipationRow(
            full_name="Борисова Мария Сергеевна",
            events=[
                EventParticipationPart(
                    status="Призёр",
                    event_name="Региональная олимпиада по физике",
                    event_date=[datetime.date(year=2024, month=2, day=10)]
                ),
                EventParticipationPart(
                    status="Участник",
                    event_name="Школьная олимпиада по химии",
                    event_date=[datetime.date(year=2024, month=1, day=20)]
                )
            ]
        ),

        # Студент с 3 событиями (проверка множественных строк)
        OlympiadParticipationRow(
            full_name="Васильев Дмитрий Александрович",
            events=[
                EventParticipationPart(
                    status="Победитель",
                    event_name="Олимпиада по информатике",
                    event_date=[datetime.date(year=2024, month=4, day=5)]
                ),
                EventParticipationPart(
                    status="Призёр",
                    event_name="Олимпиада по робототехнике",
                    event_date=[
                        datetime.date(year=2024, month=3, day=1),
                        datetime.date(year=2024, month=3, day=3)
                    ]
                ),
                EventParticipationPart(
                    status="Участник",
                    event_name="Конкурс проектов",
                    event_date=[datetime.date(year=2024, month=5, day=12)]
                )
            ]
        ),

        # Студент с 1 событием (проверка последнего в списке)
        OlympiadParticipationRow(
            full_name="Григорьева Елена Владимировна",
            events=[
                EventParticipationPart(
                    status="Призёр",
                    event_name="Олимпиада по биологии",
                    event_date=[
                        datetime.date(year=2024, month=2, day=20),
                        datetime.date(year=2024, month=2, day=25)
                    ]
                )
            ]
        ),
    ]
)

# 4 (5) такое же почти

doc5 = DocResearchWorksPayload(organization_name="ORG", period=datetime.datetime.now(), class_name="4Be", records=[
    ResearchWorkRow(works=[Work(work_title="Title1", publication_or_presentation_place="plase"), Work(work_title="Title2", publication_or_presentation_place="cool plase")], full_name="Admin"),
    ResearchWorkRow(works=[Work(work_title="Title1", publication_or_presentation_place="plase"), Work(work_title="Title2", publication_or_presentation_place="cool plase")], full_name="Admin")
])

doc6 = DocAdditionalEducationPayload(organization_name="ORG", period=datetime.datetime.now(), class_name="4Be", records=[AdditionalEducationRow(full_name="Name1", program_name="pr1", provider_organization="org5")])

doc7 = DocFirstProfessionPayload(organization_name="ORG", period=datetime.datetime.now(), class_name="4Be", records=[FirstProfessionRow(full_name="Fn", educational_organization="Organ", training_program="m5", study_period="patr 2", document="dpl.docx")])

doc8 = DocExternalCareerEventsPayload(organization_name="ORG", period=datetime.datetime.now(), class_name="4Be", records=[ExternalCareerEventRow(event_date=datetime.date(year=2025, month=5, day=7), event_name="EVENTIC", event_format="hackathon", organizer="IT-CUBE", participants_count=5, level="wight")])

generate_template(doc8, "../test_doc8.docx")
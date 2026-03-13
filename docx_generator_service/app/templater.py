from __future__ import annotations

import os
from datetime import date, datetime
from pathlib import Path

from docxtpl import DocxTemplate

from docx_generator_service.app.models import ExportBase


from app import DocGeneral
from app.merger import DocMerger, XMLDocMerger


def date_to_quarter_format(date_obj: datetime) -> str:
    month = date_obj.month
    year = date_obj.year

    if 9 <= month <= 11:
        quarter = 1
        academic_start = year
    elif month == 12:
        quarter = 2
        academic_start = year
    elif 1 <= month <= 2:
        quarter = 2
        academic_start = year - 1
    elif 3 <= month <= 5:
        quarter = 3
        academic_start = year - 1
    else:
        quarter = 4
        academic_start = year - 1

    academic_end = academic_start + 1
    roman_numerals = {1: "I", 2: "II", 3: "III", 4: "IV"}
    return f"{roman_numerals[quarter]} четверть {academic_start}-{academic_end} уч. года"


def date_or_date_delta_to_str(dateobj: list[date]) -> str:
    return "-".join([str(date_el).replace("-", ".") for date_el in dateobj])


def open_template(template_path: str, is_general: bool=False):
    if is_general:
        return DocxTemplate(str(Path(__file__).parent.parent / "templates" / "general" / template_path))
    return DocxTemplate(str(Path(__file__).parent.parent / "templates" / template_path))


def generate_template(data_model: ExportBase, path_to_save: str, is_general: bool=False) -> None:
    template = open_template(data_model.template_path, is_general=is_general)

    context = data_model.model_dump()
    context["period"] = date_to_quarter_format(context["period"])
    for record_index, record in enumerate(context.get("records", [])):
        if event_date := record.get("event_date"):
            context["records"][record_index]["event_date"] = date_or_date_delta_to_str([event_date])

        for event_index, event in enumerate(record.get("events", [])):
            if event_date := event.get("event_date"):
                context["records"][record_index]["events"][event_index]["event_date"] = date_or_date_delta_to_str(event_date)

    flat_records = []
    for record_number, record in enumerate(context.get("records", []), start=1):
        events = record.get("events", [])
        works = record.get("works", [])

        if events:
            for index, event in enumerate(events):
                flat_record = {
                    "full_name": record.get("full_name", ""),
                    "is_first": index == 0,
                    "num": record_number,
                    "status": event.get("status"),
                    "event_name": event.get("event_name"),
                    "event_date": event.get("event_date"),
                }
                for key, value in record.items():
                    if key not in {"events", "full_name"} and key not in flat_record:
                        flat_record[key] = value
                flat_records.append(flat_record)
        elif works:
            for index, work in enumerate(works):
                flat_record = {
                    "full_name": record.get("full_name", ""),
                    "is_first": index == 0,
                    "num": record_number,
                    "work_title": work.get("work_title"),
                    "publication_or_presentation_place": work.get("publication_or_presentation_place"),
                }
                for key, value in record.items():
                    if key not in {"works", "full_name"} and key not in flat_record:
                        flat_record[key] = value
                flat_records.append(flat_record)

    if flat_records:
        context["records"] = flat_records

    template.render(context)
    template.save(path_to_save)


def generate_general_template(data_model: DocGeneral, path_to_save: str):
    prs = ["gen_class_info", "gen_profile_performance", "gen_olympiad_participation",
           "gen_apz_participation", "gen_research_works", "gen_additional_education",
           "gen_first_profession", "gen_external_career_events"]
    i=-1
    generate_template(data_model.class_info, path_to_save+prs[i:=i+1], True)
    generate_template(data_model.profile_performance, path_to_save+prs[i:=i+1], True)
    generate_template(data_model.olympiad_participation, path_to_save+prs[i:=i+1], True)
    generate_template(data_model.apz_participation, path_to_save+prs[i:=i+1], True)
    generate_template(data_model.research_works, path_to_save+prs[i:=i+1], True)
    generate_template(data_model.additional_education, path_to_save+prs[i:=i+1], True)
    generate_template(data_model.first_profession, path_to_save+prs[i:=i+1], True)
    generate_template(data_model.external_career_events, path_to_save+prs[i:=i+1], True)



    xml_merger = XMLDocMerger()
    xml_merger.merge(file_paths=[path_to_save+i for i in prs],
                     output_path=path_to_save,
                     force_table_borders=True)

    for pr in prs:
        os.remove(path_to_save+pr)


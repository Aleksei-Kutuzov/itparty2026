from datetime import datetime, date
from pathlib import Path
from docxtpl import DocxTemplate

from models import ExportBase

def date_to_quarter_format(date_obj: datetime) -> str:
    year = date_obj.year
    month = date_obj.month

    quarter = (month - 1) // 3 + 3
    roman_numerals = {1: 'I', 2: 'II', 3: 'III', 4: 'IV'}
    quarter_roman = roman_numerals[quarter]

    if month >= 9:
        academic_start = year
    else:
        academic_start = year - 1

    academic_end = academic_start + 1
    return f"{quarter_roman} четверть {academic_start}–{academic_end} уч. года"

def date_or_date_delta_to_str(dateobj: list[date]):
    return "-".join([str(date_el).replace("-", ".") for date_el in dateobj])

def open_template(template_path: str):
    return DocxTemplate(str(Path(__file__).parent / "templates" / template_path))

def generate_template(data_model: ExportBase, path_to_save):
    tp = open_template(data_model.template_path)

    context = data_model.model_dump()
    context["period"] = date_to_quarter_format(context["period"])
    for xi, i in enumerate(context.get("records", [])):
        if ed := i.get("event_date"):
            context["records"][xi]["event_date"] = date_or_date_delta_to_str([ed])

        for xj, j in enumerate(i.get("events", [])):
            if ed := j.get("event_date"):
                context["records"][xi]["events"][xj]["event_date"] = date_or_date_delta_to_str(ed)

    flat_records = []
    for x, record in enumerate(context.get("records", []), start=1):
        events = record.get("events", [])
        if len(events):
            for idx, event in enumerate(events):
                flat_record = {
                    'full_name': record.get('full_name', ''),
                    'is_first': idx == 0,
                    'num': x,
                    'status': event.get('status'),
                    'event_name': event.get('event_name'),
                    'event_date': event.get('event_date'),
                }

                for key, value in record.items():
                    if key not in ['events', 'full_name'] and key not in flat_record:
                        flat_record[key] = value
                flat_records.append(flat_record)
        elif len(works := record.get("works", [])):
            for idx, work in enumerate(works):
                flat_record = {
                    'full_name': record.get('full_name', ''),
                    'is_first': idx == 0,
                    'num': x,
                    'work_title': work.get('work_title'),
                    'publication_or_presentation_place': work.get('publication_or_presentation_place'),
                }

                for key, value in record.items():
                    if key not in ['works', 'full_name'] and key not in flat_record:
                        flat_record[key] = value
                flat_records.append(flat_record)

    if len(flat_records):
        context["records"] = flat_records

    tp.render(context)
    tp.save(path_to_save)



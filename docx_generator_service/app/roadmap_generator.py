from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.templater import open_template

class EventResponse(BaseModel):
    event_id: int
    event_type: str
    work_title: str
    execution_dates: str
    responsibles: str
    target_audience: str

class SortedEvents:
    def __init__(self):
        self.professional_education: list[EventResponse] = []
        self.practice_oriented: list[EventResponse] = []
        self.diagnostic: list[EventResponse] = []
        self.working_with_parents: list[EventResponse] = []
        self.integration_direction: list[EventResponse] = []


def sort_events_by_type(events: list[EventResponse]):
    sorted_dict: dict[str, list[EventResponse]] = {
        "professional_education": [],
        "practice_oriented": [],
        "diagnostic": [],
        "working_with_parents": [],
        "integration_direction": []
    }

    # Словарь для сопоставления текстовых значений с ключами словаря
    type_mapping = {
        "Профессиональное просвещение": "professional_education",
        "Практико-ориентированное направление": "practice_oriented",
        "Диагностическое направление": "diagnostic",
        "Работа с родителями": "working_with_parents",
        "Интеграционное направление": "integration_direction"
    }

    for event in events:
        if event.event_type in type_mapping:
            dict_key = type_mapping[event.event_type]
            sorted_dict[dict_key].append(event)
        else:
            print(f"неизвестный тип события: {event.event_type}")

    return sorted_dict


def generate_road_map(data: list[EventResponse], path_to_save: str):
    template = open_template("road_map.docx")

    template.render(content=sort_events_by_type(data))
    template.save(path_to_save)


if __name__ == "__main__":
    test_events = [
        EventResponse(
            event_id=1,
            event_type="Профессиональное просвещение",
            work_title="Семинар по профессиям",
            execution_dates="2023-10-01",
            responsibles="Иванов И.И.",
            target_audience="Старшеклассники"
        ),
        EventResponse(
            event_id=2,
            event_type="Практико-ориентированное направление",
            work_title="Мастер-класс по программированию",
            execution_dates="2023-10-05",
            responsibles="Петров П.П.",
            target_audience="Студенты"
        ),
        EventResponse(
            event_id=3,
            event_type="Диагностическое направление",
            work_title="Тестирование навыков",
            execution_dates="2023-10-10",
            responsibles="Сидоров С.С.",
            target_audience="Выпускники"
        )
    ]

    generate_road_map(test_events, path_to_save="test_road_map.docx")
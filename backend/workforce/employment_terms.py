from __future__ import annotations

from datetime import datetime, timedelta

from django.core.exceptions import ValidationError


CORRESPONDENCE_PROFILES = {
    ("FULL_TIME", "AWARD"): {
        "key": "FULL_TIME_AWARD_TERMS",
        "label": "Full-time employment terms — Award rates",
    },
    ("FULL_TIME", "ABOVE_AWARD"): {
        "key": "FULL_TIME_ABOVE_AWARD_TERMS",
        "label": "Full-time employment terms — Above-award agreed rates",
    },
    ("PART_TIME", "AWARD"): {
        "key": "PART_TIME_AWARD_TERMS",
        "label": "Part-time employment terms — Award rates",
    },
    ("PART_TIME", "ABOVE_AWARD"): {
        "key": "PART_TIME_ABOVE_AWARD_TERMS",
        "label": "Part-time employment terms — Above-award agreed rates",
    },
    ("CASUAL", "AWARD"): {
        "key": "CASUAL_AWARD_TERMS",
        "label": "Casual employment terms — Award rates",
    },
    ("CASUAL", "ABOVE_AWARD"): {
        "key": "CASUAL_ABOVE_AWARD_TERMS",
        "label": "Casual employment terms — Above-award agreed rates",
    },
}

WEEKDAY_LABELS = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}


def correspondence_profile(employment_type: str, pay_basis: str) -> dict[str, str]:
    key = (str(employment_type or "").upper(), str(pay_basis or "").upper())
    try:
        return dict(CORRESPONDENCE_PROFILES[key])
    except KeyError as exc:
        raise ValidationError(
            {"employment_type": "No employment correspondence is configured for these employment terms."}
        ) from exc


def _parse_hhmm(raw, *, field: str):
    try:
        return datetime.strptime(str(raw or ""), "%H:%M").time()
    except ValueError as exc:
        raise ValidationError({field: "Use HH:MM 24-hour time."}) from exc


def _minutes_between(start, end) -> int:
    anchor = datetime(2000, 1, 1)
    start_dt = datetime.combine(anchor.date(), start)
    end_dt = datetime.combine(anchor.date(), end)
    # 00:00 is accepted as midnight at the end of the agreed work day.
    if end.hour == 0 and end.minute == 0 and start_dt.time() != end:
        end_dt += timedelta(days=1)
    if end_dt <= start_dt:
        raise ValidationError(
            {"ordinary_hours_pattern": "Finish time must be after start time; use 00:00 for midnight."}
        )
    return int((end_dt - start_dt).total_seconds() // 60)


def normalise_part_time_pattern(raw_pattern) -> dict:
    if not isinstance(raw_pattern, dict):
        raise ValidationError({"ordinary_hours_pattern": "Part-time ordinary hours must be an object."})

    days = raw_pattern.get("days")
    if not isinstance(days, list) or not days:
        raise ValidationError(
            {"ordinary_hours_pattern": "Part-time employment requires at least one agreed working day."}
        )

    normalised_days = []
    seen_weekdays = set()
    total_minutes = 0

    for index, raw_day in enumerate(days):
        prefix = f"ordinary_hours_pattern.days[{index}]"
        if not isinstance(raw_day, dict):
            raise ValidationError({prefix: "Each working day must be an object."})

        try:
            weekday = int(raw_day.get("weekday"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({prefix: "weekday must be 0 (Monday) through 6 (Sunday)."}) from exc

        if weekday not in WEEKDAY_LABELS:
            raise ValidationError({prefix: "weekday must be 0 (Monday) through 6 (Sunday)."})
        if weekday in seen_weekdays:
            raise ValidationError({prefix: f"{WEEKDAY_LABELS[weekday]} is listed more than once."})
        seen_weekdays.add(weekday)

        start = _parse_hhmm(raw_day.get("start_time"), field=f"{prefix}.start_time")
        end = _parse_hhmm(raw_day.get("end_time"), field=f"{prefix}.end_time")
        if start.hour < 7:
            raise ValidationError(
                {f"{prefix}.start_time": "Pharmacy Award ordinary hours cannot start before 07:00."}
            )
        span_minutes = _minutes_between(start, end)

        if span_minutes > 12 * 60:
            raise ValidationError({prefix: "A part-time ordinary-hours day cannot exceed 12 hours."})

        meal_raw = raw_day.get("meal_break_minutes", 0)
        try:
            meal_minutes = int(meal_raw or 0)
        except (TypeError, ValueError) as exc:
            raise ValidationError({f"{prefix}.meal_break_minutes": "Meal break minutes must be a whole number."}) from exc
        if meal_minutes not in {0, 30, 45, 60}:
            raise ValidationError(
                {f"{prefix}.meal_break_minutes": "Use 0, 30, 45 or 60 minutes."}
            )

        meal_start_raw = raw_day.get("meal_break_start")
        meal_start = None
        if meal_minutes:
            meal_start = _parse_hhmm(meal_start_raw, field=f"{prefix}.meal_break_start")
            anchor = datetime(2000, 1, 1)
            start_dt = datetime.combine(anchor.date(), start)
            end_dt = datetime.combine(anchor.date(), end)
            if end.hour == 0 and end.minute == 0 and start_dt.time() != end:
                end_dt += timedelta(days=1)
            meal_dt = datetime.combine(anchor.date(), meal_start)
            meal_end = meal_dt + timedelta(minutes=meal_minutes)
            if not (start_dt < meal_dt and meal_end < end_dt):
                raise ValidationError(
                    {f"{prefix}.meal_break_start": "Meal break must fall within the agreed start and finish times."}
                )
        elif meal_start_raw not in (None, ""):
            raise ValidationError(
                {f"{prefix}.meal_break_start": "Meal break start must be blank when duration is 0."}
            )

        # Award clause 15 uses paid hours worked (the meal break itself is
        # unpaid) to determine the break entitlement.
        worked_minutes = span_minutes - meal_minutes
        if worked_minutes > 5 * 60 and not meal_minutes:
            raise ValidationError(
                {f"{prefix}.meal_break_minutes": "A 30–60 minute meal break is required when paid work exceeds 5 hours."}
            )
        if worked_minutes >= 456 and meal_start is not None:
            anchor = datetime(2000, 1, 1)
            offset = int(
                (
                    datetime.combine(anchor.date(), meal_start)
                    - datetime.combine(anchor.date(), start)
                ).total_seconds()
                // 60
            )
            if offset < 150 or offset > 300:
                raise ValidationError(
                    {
                        f"{prefix}.meal_break_start": (
                            "For a day of 7.6 hours or more, the meal break must start "
                            "between 2.5 and 5 hours after the agreed start time."
                        )
                    }
                )

        if worked_minutes < 3 * 60:
            raise ValidationError(
                {prefix: "Part-time shifts must provide at least 3 hours of paid work."}
            )

        total_minutes += worked_minutes
        normalised_days.append(
            {
                "weekday": weekday,
                "weekday_label": WEEKDAY_LABELS[weekday],
                "start_time": start.strftime("%H:%M"),
                "end_time": end.strftime("%H:%M"),
                "meal_break_start": meal_start.strftime("%H:%M") if meal_start else None,
                "meal_break_minutes": meal_minutes,
                "ordinary_minutes": worked_minutes,
            }
        )

    if total_minutes >= 38 * 60:
        raise ValidationError(
            {"ordinary_hours_pattern": "Part-time agreed ordinary hours must be less than 38 hours per week."}
        )

    normalised_days.sort(key=lambda day: day["weekday"])
    return {
        "days": normalised_days,
        "weekly_ordinary_minutes": total_minutes,
        "weekly_ordinary_hours": f"{total_minutes / 60:.2f}",
        "variation_must_be_in_writing": True,
        "overtime_above_agreed_hours": True,
        "award_clause": "10.4-10.8",
    }

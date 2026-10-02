"""Travel origin of a shift: parsing the origin out of a message and the suburb out of the origin."""
import re


TRAVEL_ORIGIN_PREFIX = "Traveling from:"
STATE_CODES = {"NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"}
def extract_travel_origin_from_message(message: str | None):
    if not message:
        return "", ""
    lines = message.splitlines()
    filtered = []
    travel_origin = ""
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(TRAVEL_ORIGIN_PREFIX):
            if not travel_origin:
                travel_origin = stripped.replace(TRAVEL_ORIGIN_PREFIX, "", 1).strip()
            continue
        filtered.append(line)
    cleaned = "\n".join(filtered).strip()
    return cleaned, travel_origin


def extract_suburb_from_travel_origin(origin: str | None):
    if not origin:
        return ""
    cleaned = re.sub(r"\s+", " ", origin).strip()
    if not cleaned:
        return ""

    # If the string includes a comma, use the segment after the first comma.
    if "," in cleaned:
        parts = [part.strip() for part in cleaned.split(",") if part.strip()]
        if len(parts) >= 2:
            cleaned = parts[1]
        else:
            cleaned = parts[0]

    # Try to extract suburb from patterns like "Suburb QLD 4214"
    pattern = r"^(.+?)\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{3,4}$"
    match = re.match(pattern, cleaned, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()

    tokens = cleaned.split(" ")
    if tokens and tokens[-1].isdigit():
        tokens = tokens[:-1]
    if tokens and tokens[-1].upper() in STATE_CODES:
        tokens = tokens[:-1]
    return " ".join(tokens).strip()

from enum import Enum


class DataTier(str, Enum):
    LIVE = "live"
    REPORTED = "reported"
    ESTIMATED = "estimated"


SOURCE_LABELS = {
    DataTier.LIVE: "Live",
    DataTier.REPORTED: "Reported",
    DataTier.ESTIMATED: "Estimated",
}


def source_badge(source_type: DataTier, detail: str) -> dict:
    return {
        "source_type": source_type.value,
        "source_label": SOURCE_LABELS[source_type],
        "source_detail": detail,
    }

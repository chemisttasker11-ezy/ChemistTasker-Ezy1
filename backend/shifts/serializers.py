"""Public shifts serializer exports. Implementations live in serialization/.

Keep these imports stable for views, cross-domain consumers and SDK contracts.
Internal serialization modules import their peers directly, never this facade.
"""
from .serialization.slots import (
    ShiftSlotSerializer,
)
from .serialization.shifts import (
    ShiftDescriptionTemplateSerializer,
    ShiftSerializer,
)
from .serialization.interests import (
    ShiftInterestSerializer,
    ShiftRejectionSerializer,
    ShiftSavedSerializer,
)
from .serialization.offers import (
    ShiftCounterOfferSlotSerializer,
    ShiftCounterOfferSerializer,
    ShiftOfferSerializer,
)
from .serialization.projections import (
    MyShiftSerializer,
    SharedShiftSerializer,
    OpenShiftSerializer,
)
from .serialization.worker_requests import (
    WorkerShiftRequestSerializer,
)

__all__ = [
    "ShiftSlotSerializer",
    "ShiftDescriptionTemplateSerializer",
    "ShiftSerializer",
    "ShiftInterestSerializer",
    "ShiftRejectionSerializer",
    "ShiftSavedSerializer",
    "ShiftCounterOfferSlotSerializer",
    "ShiftCounterOfferSerializer",
    "ShiftOfferSerializer",
    "MyShiftSerializer",
    "SharedShiftSerializer",
    "OpenShiftSerializer",
    "WorkerShiftRequestSerializer",
]

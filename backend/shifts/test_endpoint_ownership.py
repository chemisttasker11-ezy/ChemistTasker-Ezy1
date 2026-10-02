from django.test import SimpleTestCase

from client_profile.domains.shifts import browse as legacy_browse
from client_profile.domains.shifts import offers as legacy_offers
from client_profile.domains.shifts import worker_requests as legacy_worker_requests
from shifts import browse, offers, worker_requests


class ShiftEndpointOwnershipTests(SimpleTestCase):
    def test_legacy_endpoint_modules_reexport_shifts_implementations(self):
        self.assertIs(legacy_browse.ShiftDetailViewSet, browse.ShiftDetailViewSet)
        self.assertIs(legacy_browse.PublicShiftViewSet, browse.PublicShiftViewSet)
        self.assertIs(legacy_offers.ShiftOfferViewSet, offers.ShiftOfferViewSet)
        self.assertIs(legacy_offers.ShiftInterestViewSet, offers.ShiftInterestViewSet)
        self.assertIs(
            legacy_worker_requests.WorkerShiftRequestViewSet,
            worker_requests.WorkerShiftRequestViewSet,
        )

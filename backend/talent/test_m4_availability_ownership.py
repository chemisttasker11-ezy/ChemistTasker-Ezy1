"""M4-08: existing private availability endpoint remains per-owner and never adopts posting overnight rules."""
from datetime import timedelta, time

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import BASE, client_for, make_user
from talent.models import UserAvailability


class AvailabilityM4OwnershipTests(TestCase):
    def setUp(self):
        self.day = timezone.localdate() + timedelta(days=15)
        self.worker = make_user("PHARMACIST")
        self.staff = make_user("OTHER_STAFF")
        self.explorer = make_user("EXPLORER")
        self.outside = make_user("OWNER")
        self.url = BASE + "user-availability/"

    def payload(self, **extra):
        return {
            "date": str(self.day), "start_time": "09:00", "end_time": "17:00",
            "is_recurring": True, "recurring_days": [1, 3],
            "recurring_end_date": str(self.day + timedelta(days=21)), **extra,
        }

    def test_anonymous_denied_and_every_role_only_lists_own_rows(self):
        self.assertEqual(client_for().get(self.url).status_code, 401)
        for role in (self.worker, self.staff, self.explorer, self.outside):
            response = client_for(role).post(self.url, self.payload(), format="json")
            self.assertEqual(response.status_code, 201, getattr(response,"data",None))
            row = UserAvailability.objects.get(pk=response.data["id"])
            self.assertEqual(row.user_id, role.pk)
            listing = client_for(role).get(self.url)
            self.assertEqual(listing.status_code, 200, getattr(listing,"data",None))
            records = listing.data["results"] if isinstance(listing.data,dict) else listing.data
            self.assertEqual([item["id"] for item in records], [row.pk])

    def test_foreign_get_patch_put_and_delete_are_404_without_mutation(self):
        entry = UserAvailability.objects.create(
            user=self.worker, date=self.day, start_time=time(9), end_time=time(17),
            notes="owner private data",
        )
        other = client_for(self.staff)
        target = f"{self.url}{entry.pk}/"
        for method, body in (("get",None), ("patch",{"notes":"foreign"}),
                             ("put",self.payload()), ("delete",None)):
            result = getattr(other,method)(target,**({"data":body,"format":"json"} if body else {}))
            self.assertEqual(result.status_code,404,(method,getattr(result,"data",None)))
        entry.refresh_from_db()
        self.assertEqual(entry.notes,"owner private data")
        self.assertEqual(entry.user_id,self.worker.pk)

    def test_existing_open_ended_metadata_patch_but_new_recurring_schedule_requires_end(self):
        for user in (self.worker,self.staff):
            row = UserAvailability.objects.create(
                user=user, date=self.day, start_time=time(9), end_time=time(17),
                is_recurring=True, recurring_days=[1], recurring_end_date=None,
            )
            url = f"{self.url}{row.pk}/"
            client = client_for(user)
            self.assertEqual(client.patch(url,{"notes":"Keep legacy schedule",
                "notify_new_shifts":True},format="json").status_code,200)
            row.refresh_from_db()
            self.assertEqual(row.notes,"Keep legacy schedule")
            self.assertTrue(row.notify_new_shifts)
            self.assertIsNone(row.recurring_end_date)
            self.assertEqual(client.patch(url,{"start_time":"10:00"},format="json").status_code,400)
            self.assertEqual(client.put(url,self.payload(recurring_end_date=None),format="json").status_code,400)
            self.assertEqual(client.post(self.url,self.payload(recurring_end_date=None),format="json").status_code,400)
            self.assertEqual(client.patch(url,{"recurring_end_date":str(self.day+timedelta(days=7))},
                format="json").status_code,200)

    def test_private_clock_times_may_not_cross_midnight_even_when_post_shift_can(self):
        for actor in (self.worker,self.staff,self.explorer):
            result=client_for(actor).post(self.url,self.payload(start_time="22:00",
                end_time="06:00"),format="json")
            self.assertEqual(result.status_code,400,getattr(result,"data",None))
            self.assertFalse(UserAvailability.objects.filter(user=actor).exists())

    def test_valid_integer_weekdays_and_strict_string_rejection_for_roles(self):
        for user in (self.worker,self.staff):
            client=client_for(user)
            result=client.post(self.url,self.payload(),format="json")
            self.assertEqual(result.status_code,201,getattr(result,"data",None))
            item=UserAvailability.objects.get(pk=result.data["id"])
            for invalid in ("1","Mon",True,1.0):
                for method,payload in (("post",self.payload(recurring_days=[invalid])),
                    ("put",self.payload(recurring_days=[invalid])),
                    ("patch",{"recurring_days":[invalid]})):
                    target=self.url if method=="post" else f"{self.url}{item.pk}/"
                    response=getattr(client,method)(target,payload,format="json")
                    self.assertEqual(response.status_code,400,(method,invalid,getattr(response,"data",None)))
                    item.refresh_from_db()
                    self.assertEqual(item.recurring_days,[1,3])

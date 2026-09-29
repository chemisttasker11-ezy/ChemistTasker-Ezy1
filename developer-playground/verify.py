"""Read-only fixture assertions plus real API login smoke checks."""
import os, sys, json
from pathlib import Path
from collections import Counter
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'backend'))
os.environ['DJANGO_SETTINGS_MODULE']='local_settings'
import django
django.setup()
from django.conf import settings
from django.apps import apps
from django.db import transaction
from users.models import User
from client_profile.models import Membership, Pharmacy, ExplorerPost, UserAvailability, Shift, ShiftInterest
from rest_framework.test import APIClient
from marketplace.policy import evaluate_marketplace_access
from django.utils import timezone
data=json.loads((HERE/'data.json').read_text())
assert len(data['pharmacies'])==71
assert Counter(p['kind'] for p in data['pharmacies'])=={'Independent':10,'Owner group':16,'Organisation':45}
assert sorted(Counter(p['organization'] for p in data['pharmacies'] if p['organization']).values())==[10,15,20]
for p in data['pharmacies']:
    assert Membership.objects.filter(pharmacy_id=p['id'],status='ACCEPTED').count()>=9
for role in ['PHARMACIST','INTERN','TECHNICIAN','ASSISTANT','STUDENT']:
    for employment in ['FULL_TIME','PART_TIME','CASUAL','LOCUM','SHIFT_HERO']:
        assert sum(u['subtype']==role and u['employment']==employment for u in data['users'])>=10
for u in data['users']:
    assert (HERE/u['photo']).is_file(),u['photo']
    assert User.objects.filter(id=u['id'],email=u['email']).exists()
active_staff={u['id'] for u in data['users'] if u['role'] in ('PHARMACIST','OTHER_STAFF') and u['status']!='inactive'}
public_staff={u['id'] for u in data['users'] if u['role'] in ('PHARMACIST','OTHER_STAFF') and u['status'] in ('verified','terms_pending')}
staff_posts=set(ExplorerPost.objects.filter(author_user_id__in=active_staff).values_list('author_user_id',flat=True))
staff_calendar=set(UserAvailability.objects.filter(user_id__in=active_staff).values_list('user_id',flat=True))
assert public_staff<=staff_posts,('eligible staff missing Talent posts',len(public_staff-staff_posts))
assert active_staff<=staff_calendar,('staff missing calendar availability',len(active_staff-staff_calendar))
assert not UserAvailability.objects.filter(user__role='EXPLORER').exists()
for role in ('INTERN','STUDENT'):
    assert ExplorerPost.objects.filter(role_title=role,post_kind='AVAILABILITY').count()>=10
    opportunities=Shift.objects.filter(role_needed=role,visibility='PLATFORM',description__contains='Fictional paid')
    assert opportunities.count()==12,(role,opportunities.count())
    assert ShiftInterest.objects.filter(shift__in=opportunities,user__otherstaffonboarding__role_type=role).count()==12,role
    viewer=User.objects.get(username=f'{role.lower()}.full_time.01')
    client=APIClient()
    client.force_authenticate(user=viewer)
    response=client.get('/api/client-profile/public-shifts/',{'roles':role})
    assert response.status_code==200,(role,response.status_code)
    assert response.data['count']>=12,(role,response.data['count'])
assert User.objects.get(email='owner.independent.01@playground.test').check_password(data['password'])
for label,count in data['counts'].items():
    ids=[v for k,v in json.loads((HERE/'record-ids.json').read_text()).items() if k.startswith(label+':')]
    assert apps.get_model(label).objects.filter(pk__in=ids).count()==count,label
results=[]
for key,expected in [('owner.independent.01',200),('pharmacist.locum.01',200),('org.1.staff.01',200),('content.admin',200),('explorer.student.01',200),('pharmacist.locum.09',401)]:
    client=APIClient()
    response=client.post('/api/users/login/',{'email':key+'@playground.test','password':data['password']},format='json',HTTP_X_CLIENT='mobile')
    actual=response.status_code
    results.append({'account':key,'login_status':actual})
    if expected==200:
        assert actual==200,(key,actual,str(response.data)[:500])
        client.credentials(HTTP_AUTHORIZATION='Bearer '+response.data['access'])
        me=client.get('/api/users/me/')
        assert me.status_code==200,(key,me.status_code)
    else:assert actual in (400,401,403),actual
verified=User.objects.get(email='pharmacist.locum.01@playground.test')
pending=User.objects.get(email='pharmacist.locum.04@playground.test')
assert evaluate_marketplace_access(verified).can_trade_personally
assert not evaluate_marketplace_access(pending).can_trade_personally
with transaction.atomic():
    payload={'headline':'Local Talent access check','body':'Synthetic access test.','role_category':'OTHER_STAFF','role_title':'INTERN','post_kind':'AVAILABILITY',
             'availability_days':[{'date':str(timezone.localdate()+__import__('datetime').timedelta(days=14)),'start_time':'09:00','end_time':'15:00'}]}
    for key,expected in [('p01.intern.6',403),('intern.full_time.01',201)]:
        client=APIClient()
        client.force_authenticate(user=User.objects.get(username=key))
        response=client.post('/api/client-profile/explorer-posts/',payload,format='json')
        assert response.status_code==expected,(key,response.status_code,str(response.data)[:500])
    transaction.set_rollback(True)
print(json.dumps({'passed':True,'users':len(data['users']),'pharmacies':71,'image_files':True,'talent_posts':ExplorerPost.objects.count(),'staff_with_calendar':len(staff_calendar),'intern_and_student_opportunities':24,'login_checks':results},indent=2))

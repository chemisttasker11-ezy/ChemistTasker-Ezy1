"""Deterministic, repeatable real-model fixtures for the loopback preview DB.

Run with the existing backend venv. Bulk writes deliberately skip notification
signals. Re-running refreshes fixture records; unrelated records are untouched.
"""
import argparse
import json
import os
import sys
import uuid
from collections import Counter
from datetime import date, time, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
parser = argparse.ArgumentParser()
parser.add_argument('--backend', default=str(ROOT / 'backend'))
args = parser.parse_args()
sys.path.insert(0, args.backend)
os.environ['DJANGO_SETTINGS_MODULE'] = 'local_settings'
import django
django.setup()
from django.conf import settings
from django.db import transaction, connection
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from users.models import User, OrganizationMembership
from client_profile import models as c
from marketplace import models as m
from ethical_marketplace import models as e
from public_hub import models as h
from public_hub.permissions import AREAS

PASSWORD = 'Playground!2026'
NOW = timezone.now()
TODAY = NOW.date()
HASH = make_password(PASSWORD)
counts = Counter()
records = {}
previous_path = HERE / 'record-ids.json'
previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
users, pharmacies, organizations, scenarios = [], [], [], []
user_map, profile_map, pharmacy_map, member_map = {}, {}, {}, {}

def put(model, key, **values):
    label = model._meta.label
    stable = label + ':' + key
    counts[label] += 1
    # UUIDs and integer IDs are stable across subsequent seed runs.
    pk = uuid.uuid5(uuid.NAMESPACE_URL, 'chemisttasker-playground/' + stable) if model._meta.pk.get_internal_type() == 'UUIDField' else 700000 + counts[label]
    obj = model(pk=pk, **values)
    exists = model.objects.filter(pk=pk).exists()
    if exists and previous.get(stable) != str(pk):
        raise RuntimeError(f'Refusing to overwrite an untracked record: {stable} / {pk}')
    if exists:
        fields = {f.attname: getattr(obj, f.attname) for f in model._meta.concrete_fields if not f.primary_key and f.name in values}
        model.objects.filter(pk=pk).update(**fields)
        obj.refresh_from_db()
    else:
        model.objects.bulk_create([obj])
    records[stable] = str(pk)
    return obj

LOCATIONS = [
 ('West End','QLD','4101','Australia/Brisbane',-27.48,153.01),
 ('Parramatta','NSW','2150','Australia/Sydney',-33.81,151.00),
 ('Footscray','VIC','3011','Australia/Melbourne',-37.80,144.90),
 ('Fremantle','WA','6160','Australia/Perth',-32.05,115.75),
 ('Norwood','SA','5067','Australia/Adelaide',-34.92,138.63),
 ('Sandy Bay','TAS','7005','Australia/Hobart',-42.90,147.32),
 ('Braddon','ACT','2612','Australia/Sydney',-35.27,149.13),
 ('Nightcliff','NT','0810','Australia/Darwin',-12.38,130.85),
 ('Toowoomba','QLD','4350','Australia/Brisbane',-27.56,151.95),
 ('Bendigo','VIC','3550','Australia/Melbourne',-36.76,144.28),
]
FIRST = [
 ['Priya','Anika','Meera','Kavya','Nisha','Asha','Divya','Sonia','Riya','Tara','Neha','Pooja'],
 ['Daniel','Ethan','Kevin','Jun','Wei','Alex','Ryan','Andrew','Eric','Jason','David','Leon'],
 ['Emily','Olivia','Charlotte','Grace','Sophie','Amelia','Isla','Lucy','Chloe','Hannah','Emma','Sarah'],
 ['Omar','Adam','Sami','Yusuf','Karim','Rami','Ali','Zaid','Tariq','Amir','Nabil','Hassan'],
 ['Amina','Zara','Imani','Nia','Ada','Fatima','Miriam','Laila','Safiya','Amara','Zuri','Nala'],
 ['Minh','Liam','Adrian','Ben','Nathan','Gabriel','Aaron','Noah','Lucas','Dylan','Samuel','Joshua'],
]
LAST = [
 ['Patel','Shah','Rao','Nair','Singh','Mehta','Iyer','Kapoor','Desai','Joshi','Menon','Sethi','Bose','Kaur','Reddy','Gupta'],
 ['Chen','Wong','Liu','Zhang','Li','Huang','Wu','Lin','Zhou','Xu','Tan','Lam','Cheng','Ho','Ma','Yuen'],
 ['Wilson','Taylor','Brown','Kelly','Murphy','Martin','Thompson','Clarke','Walker','Bennett','Foster','Reed','Evans','Parker','Hughes','Walsh'],
 ['Haddad','Mansour','Khalil','Nasser','Rahman','Saleh','Farah','Aziz','Hamdan','Darwish','Said','Habib','Malik','Hassan','Masri','Karam'],
 ['Okafor','Mensah','Abdi','Kamara','Diallo','Bello','Ndlovu','Osman','Ahmed','Conteh','Mwangi','Traore','Ali','Keita','Hassan','Adeyemi'],
 ['Nguyen','Tran','Pham','Le','Hoang','Vo','Dang','Bui','Do','Huynh','Santos','Reyes','Cruz','Lim','Garcia','Ramos'],
]

def person(key, role, subtype='', employment='', state='verified', business=False):
    if state=='expired' and role!='PHARMACIST': state='pending'
    index = len(users)
    culture = index % 6
    cycle = index // 6
    first, last = FIRST[culture][cycle % 12], LAST[culture][cycle // 12 % 16]
    loc = LOCATIONS[index % len(LOCATIONS)]
    photo_index = (cycle % 2) * 6 + culture
    uniform = 'white' if role in ('OWNER','PHARMACIST') else 'navy' if subtype in ('INTERN','STUDENT') or role == 'EXPLORER' else 'blue'
    if business or role == 'ORG_STAFF':
        uniform = 'business'
        photo = f'business-{culture * 6 + (cycle % 3) * 2 + (0 if culture==3 else culture % 2):02d}.jpg'
    else:
        photo = f'uniform-{photo_index + {"white":0,"blue":12,"navy":24}[uniform]:02d}.jpg'
    active = state != 'inactive'
    verified = state in ('verified','inactive','expired','terms_pending')
    user = put(User,key,email=key+'@playground.test',username=key,first_name=first,last_name=last,role=role,password=HASH,
               is_active=active,is_otp_verified=state!='email_pending',mobile_number=f'000{index:07d}',is_mobile_verified=verified,accepted_terms=True,accepted_terms_at=NOW)
    common = dict(user=user,verified=verified,submitted_for_verification=state!='onboarding_draft',profile_photo='playground/'+photo)
    if role == 'OWNER':
        profile = put(c.OwnerOnboarding,key,**common,phone_number='0000000000',role='PHARMACIST',ahpra_number='DEMO-NOT-A-REGISTRATION',ahpra_verified=verified)
    elif role in ('PHARMACIST','OTHER_STAFF','EXPLORER'):
        common.update(short_bio=f'{first} is a fictional {subtype or role.lower()} based in {loc[0]}. Enjoys team mentoring, community service and clear handovers. Local test profile only.',
                      suburb=loc[0],state=loc[1],postcode=loc[2],street_address='1 Demonstration Lane (fictional)',latitude=loc[4],longitude=loc[5],gov_id_verified=verified,
                      referee1_name='Demo Supervisor',referee1_email='referee@playground.test',referee1_relation='supervisor',referee1_confirmed=verified,
                      referee2_confirmed=verified,open_to_travel=index%3==0,travel_states=['QLD','NSW'] if index%3==0 else [])
        if role == 'PHARMACIST':
            common.update(ahpra_number='DEMO-NOT-A-REGISTRATION',ahpra_verified=verified,ahpra_registration_status='Expired' if state=='expired' else 'Registered' if verified else 'Pending',
                          ahpra_expiry_date=TODAY+timedelta(days=-10 if state=='expired' else 365),payment_preference='ABN' if employment=='LOCUM' else 'TFN',skills=['Dispensing','Patient counselling'])
            profile = put(c.PharmacistOnboarding,key,**common)
        elif role == 'OTHER_STAFF':
            profile = put(c.OtherStaffOnboarding,key,**common,role_type=subtype or 'ASSISTANT',payment_preference='TFN',years_experience='3')
        else:
            profile = put(c.ExplorerOnboarding,key,**common,role_type=subtype or 'CAREER_SWITCHER',interests=['Community pharmacy','Career development'])
    else:
        profile = None
    put(m.IdentityVerification,key,user=user,status='VERIFIED' if verified else 'REJECTED' if state=='rejected' else 'PENDING',assurance_method='LOCAL_SYNTHETIC_AGE_18_PLUS',verified_at=NOW if verified else None)
    if state != 'terms_pending': put(m.MarketplaceTermsAcceptance,key,user=user,version='2026-09')
    row = dict(id=user.id,key=key,name=user.get_full_name(),email=user.email,role=role,subtype=subtype,employment=employment,status=state,
               uniform=uniform,photo='assets/'+photo,location=loc[0]+', '+loc[1],pharmacies=[],admin=[],organization='',content=[])
    users.append(row); user_map[user.id]=row; profile_map[user.id]=profile
    return user

def member(user, pharmacy, role, employment, status='ACCEPTED', admin=None):
    key = f'{user.id}-{pharmacy.id}'
    membership=put(c.Membership,key,user=user,pharmacy=pharmacy,role=role,employment_type=employment,status=status,is_active=status=='ACCEPTED',
                   invited_by=pharmacy.owner.user,job_title=role.replace('_',' ').title(),responded_at=NOW if status!='PENDING' else None)
    user_map[user.id]['pharmacies'].append(pharmacy.id)
    if admin:
        put(c.PharmacyAdmin,key,user=user,pharmacy=pharmacy,membership=membership,admin_level=admin,staff_role=role if role!='CONTACT' else None,created_by=pharmacy.owner.user)
        user_map[user.id]['admin'].append(admin)
    member_map[(user.id,pharmacy.id)]=membership
    return membership

def pharmacy(owner,key,name,kind,org=None):
    index=len(pharmacies); loc=LOCATIONS[index%10]
    obj=put(c.Pharmacy,key,name=name+' [Demo]',owner=profile_map[owner.id],organization=org,email=key+'@playground.test',
            street_address=f'{index+1} Demonstration Lane (fictional)',suburb=loc[0],state=loc[1],postcode=loc[2],latitude=loc[4],longitude=loc[5],timezone=loc[3],
            verified=index%9!=8,abn_verified=index%9!=8,about='Fictional local playground pharmacy. Community care, mentoring and a diverse team.',cover_image='playground/content-0.jpg',
            weekdays_start=time(8,30),weekdays_end=time(18),saturdays_start=time(9),saturdays_end=time(13),sundays_closed=True,
            employment_types=['FULL_TIME','PART_TIME','LOCUM','CASUAL'],roles_needed=['PHARMACIST','INTERN','ASSISTANT','TECHNICIAN','STUDENT'],default_rate_type='FIXED',default_fixed_rate=65,
            rate_weekday=65,rate_saturday=75,rate_sunday=85,rate_public_holiday=110)
    pharmacies.append(dict(id=obj.id,name=obj.name,kind=kind,owner=owner.id,organization=org.id if org else None,location=loc[0]+', '+loc[1],verified=obj.verified,chain=''))
    pharmacy_map[obj.id]=obj
    member(owner,obj,'PHARMACIST','FULL_TIME',admin='OWNER')
    return obj

@transaction.atomic
def seed():
    owners=[]
    for i in range(10):
        owner=person(f'owner.independent.{i+1:02d}','OWNER'); owners.append(owner)
        pharmacy(owner,f'independent-{i}',f'{LOCATIONS[i][0]} Community Pharmacy','Independent')
    for i,size in enumerate([3,4,4,5]):
        owner=person(f'owner.chain.{i+1:02d}','OWNER'); owners.append(owner)
        group=[pharmacy(owner,f'chain-{i}-{j}',f'{["Wattle","Jacaranda","Banksia","Coral"][i]} Care {j+1}','Owner group') for j in range(size)]
        profile=profile_map[owner.id]
        c.OwnerOnboarding.objects.filter(pk=profile.pk).update(chain_pharmacy=True,number_of_pharmacies=size)
        # Mixed linkage: second owner's stores stay unconnected; third has one independent branch.
        if i!=1:
            chain=put(c.Chain,f'chain-{i}',owner=profile,name=f'Demo {i+1} Pharmacy Network',primary_contact_email=owner.email)
            linked=group[:-1] if i==2 else group
            chain.pharmacies.set(linked)
            for row in pharmacies:
                if row['id'] in [p.id for p in linked]:row['chain']=chain.name
    for i,size in enumerate([10,15,20]):
        org=put(c.Organization,f'org-{i}',name=['Southern Cross Pharmacy Collective','Coastal Community Health','Gumtree Regional Pharmacies'][i]+' [Demo]',slug=f'playground-org-{i+1}',about='Fictional pharmacy organisation for local testing.',cover_image='playground/content-0.jpg')
        organizations.append(dict(id=org.id,name=org.name))
        owner=person(f'owner.organisation.{i+1:02d}','OWNER'); owners.append(owner)
        c.OwnerOnboarding.objects.filter(pk=profile_map[owner.id].pk).update(organization=org,number_of_pharmacies=size,chain_pharmacy=True)
        stores=[pharmacy(owner,f'org-{i}-{j}',f'{["Southern Cross","Coastal","Gumtree"][i]} {LOCATIONS[j%10][0]} {j+1}','Organisation',org) for j in range(size)]
        for j in range(10):
            role=['CHIEF_ADMIN','ORG_ADMIN','REGION_ADMIN'][(i*10+j)%3]
            staff=person(f'org.{i+1}.staff.{j+1:02d}','ORG_STAFF',subtype=role,business=True)
            membership=put(OrganizationMembership,f'org-{i}-{j}',user=staff,organization=org,role=role,region='Metro' if j%2==0 else 'Regional',job_title=role.replace('_',' ').title(),admin_level=['OWNER','MANAGER','ROSTER_MANAGER','COMMUNICATION_MANAGER'][j%4])
            if role=='REGION_ADMIN': membership.pharmacies.set(stores[:5])
            user_map[staff.id]['organization']=org.name
    layout=[('PHARMACIST','FULL_TIME','MANAGER'),('PHARMACIST','PART_TIME','ROSTER_MANAGER'),('PHARMACIST','LOCUM',None),('TECHNICIAN','FULL_TIME','COMMUNICATION_MANAGER'),('ASSISTANT','CASUAL',None),('INTERN','FULL_TIME',None),('STUDENT','PART_TIME',None),('CONTACT','CASUAL',None)]
    for p_index, row in enumerate(pharmacies):
        p=pharmacy_map[row['id']]
        crew=[]
        for j,(role,employment,admin) in enumerate(layout):
            state='verified' if j<5 or p_index%4 else 'pending'
            user=person(f'p{p_index+1:02d}.{role.lower()}.{j+1}', 'PHARMACIST' if role=='PHARMACIST' else 'EXPLORER' if role=='CONTACT' else 'OTHER_STAFF',
                        subtype='CAREER_SWITCHER' if role=='CONTACT' else role,employment=employment,state=state)
            crew.append(user); member(user,p,role,employment,admin=admin)
        conversation=put(c.Conversation,f'pharmacy-{p.id}',created_by=p.owner.user,type='GROUP',title=p.name+' team',pharmacy=p)
        for j,u in enumerate([p.owner.user]+crew):put(c.Participant,f'{p.id}-{u.id}',conversation=conversation,membership=member_map[(u.id,p.id)],is_admin=j==0)
        for j,body in enumerate(['Morning team, the updated handover checklist is ready for review.','I can cover the Saturday morning roster. Please confirm the finish time.','Thanks, 9 am to 1 pm. The manager will confirm the roster.']):
            put(c.Message,f'{p.id}-{j}',conversation=conversation,sender=member_map[(crew[j].id,p.id)],body=body)
        post=put(c.PharmacyHubPost,f'pharmacy-{p.id}',pharmacy=p,author_user=p.owner.user,author_membership=member_map[(p.owner.user.id,p.id)],body='Welcome to our local team hub. Please read the handover notes and share your availability for next week.',comment_count=1,reaction_summary={'LIKE':1})
        put(c.PharmacyHubComment,f'pharmacy-{p.id}',post=post,author_user=crew[0],body='Reviewed. I will walk the new starters through the opening checklist.')
        put(c.PharmacyHubReaction,f'pharmacy-{p.id}',post=post,user=crew[1],reaction_type='LIKE')
        for j in range(4):
            shift=put(c.Shift,f'{p.id}-{j}',pharmacy=p,created_by=p.owner.user,role_needed='PHARMACIST',employment_type='LOCUM' if j<2 else 'CASUAL',rate_type='FIXED',fixed_rate=65+j*5,
                      visibility=['PLATFORM','OWNER_CHAIN','FULL_PART_TIME','LOCUM_CASUAL'][j],description=['Saturday locum cover with an experienced technician.','Upcoming leave cover. Paid handover provided.','Regular afternoon roster.','Urgent community pharmacy relief.'][j],is_urgent=j==3,payment_preference='ABN' if j<2 else 'TFN')
            slot=put(c.ShiftSlot,f'{p.id}-{j}',shift=shift,date=TODAY+timedelta(days=[3,7,-4,10][j]),start_time=time(9),end_time=time(17),rate=65+j*5,planned_break_minutes=30)
            if j in (1,2):
                u=crew[2 if j==1 else 0]
                assignment=put(c.ShiftSlotAssignment,f'{p.id}-{j}',shift=shift,slot=slot,slot_date=slot.date,user=u,unit_rate=65+j*5,is_rostered=True,payment_preference_snapshot='ABN' if j==1 else 'TFN')
                if j==1 and p_index<12:put(c.LeaveRequest,f'{p.id}',slot_assignment=assignment,user=u,leave_type=['ANNUAL','SICK','STUDY'][p_index%3],note='Demo leave request for roster testing.',status=['PENDING','APPROVED','REJECTED'][p_index%3])
            else:
                put(c.ShiftInterest,f'{p.id}-{j}',shift=shift,slot=slot,user=crew[2],revealed=True)
                put(c.ShiftOffer,f'{p.id}-{j}',shift=shift,slot=slot,user=crew[2],status='PENDING',offered_rate=70,expires_at=NOW+timedelta(days=2))
        for j in range(3):put(c.UserAvailability,f'{p.id}-{j}',user=crew[2],date=TODAY+timedelta(days=14+j),start_time=time(8),end_time=time(18),notes='Available for local locum cover.')
        put(c.Notification,f'{p.id}',user=crew[0],type='task',title='Review your upcoming roster',body='Your team has new availability and a cover request.',action_url='/dashboard/pharmacist/roster')
    # Ten examples of every clinical role × employment category, including edge states.
    workers=[]
    for role in ['PHARMACIST','INTERN','TECHNICIAN','ASSISTANT','STUDENT']:
        for employment in ['FULL_TIME','PART_TIME','CASUAL','LOCUM','SHIFT_HERO']:
            for j in range(10):
                state=['verified','verified','verified','pending','onboarding_draft','rejected','expired','email_pending','inactive','terms_pending'][j]
                user=person(f'{role.lower()}.{employment.lower()}.{j+1:02d}','PHARMACIST' if role=='PHARMACIST' else 'OTHER_STAFF',subtype=role,employment=employment,state=state)
                p=pharmacy_map[pharmacies[len(workers)%len(pharmacies)]['id']]
                member(user,p,role,employment,status=['ACCEPTED','ACCEPTED','ACCEPTED','PENDING','PENDING','REJECTED','ACCEPTED','PENDING','LEFT','ACCEPTED'][j])
                workers.append(user)
    for subtype in ['STUDENT','JUNIOR','CAREER_SWITCHER']:
        for j in range(10):
            user=person(f'explorer.{subtype.lower()}.{j+1:02d}','EXPLORER',subtype=subtype,state='pending' if j==9 else 'verified')
            loc=LOCATIONS[(user.id-700001)%len(LOCATIONS)]
            days=[{'date':(TODAY+timedelta(days=7+j*3+k*7)).isoformat(),'start_time':'09:00','end_time':'15:00','is_all_day':False} for k in range(3)]
            goal='student placement' if subtype=='STUDENT' else 'junior pharmacy experience' if subtype=='JUNIOR' else 'a pharmacy career transition'
            put(c.ExplorerPost,f'{user.id}',explorer_profile=profile_map[user.id],author_user=user,headline=f'{user.first_name} is seeking {goal} [Demo]',body=f'Seeking a supportive community pharmacy team for {goal}. Available on the listed dates; fictional local test profile.',role_category='EXPLORER',role_title=subtype,work_types=['PLACEMENT','PART_TIME'] if subtype=='STUDENT' else ['CASUAL','PART_TIME'],post_kind='AVAILABILITY',availability_mode='CASUAL_CALENDAR',availability_days=days,location_suburb=loc[0],location_state=loc[1],location_postcode=loc[2],reference_code=f'DEMO{user.id}',is_anonymous=j%3==0)
    # Talent Hub uses ExplorerPost for every candidate role, while the calendar
    # uses UserAvailability. Explorer accounts have only their Talent post.
    talent_candidates=[row for row in users if row['role'] in ('PHARMACIST','OTHER_STAFF') and row['status']!='inactive']
    talent_candidates += [row for row in users if row['role']=='EXPLORER' and row['key'].startswith('p') and row['subtype']=='CAREER_SWITCHER']
    # Remove only fixture-owned Talent posts from the prior snapshot. Rebuilding
    # them avoids retaining public posts for accounts whose access is now blocked.
    for stable,pk in previous.items():
        if stable.startswith('client_profile.ExplorerPost:talent-'):
            c.ExplorerPost.objects.filter(pk=pk,author_user__email__endswith='@playground.test').delete()
    for index,row in enumerate(talent_candidates):
        user=User.objects.get(pk=row['id'])
        loc=next((place for place in LOCATIONS if row['location']==place[0]+', '+place[1]),LOCATIONS[0])
        role=row['subtype'] if row['role']=='OTHER_STAFF' else 'PHARMACIST' if row['role']=='PHARMACIST' else 'CAREER_SWITCHER'
        dates=[TODAY+timedelta(days=7+(index%9)+week*7) for week in range(3)]
        slots=[]
        for week,day in enumerate(dates):
            start,end=('09:00','13:00') if role in ('STUDENT','JUNIOR') or week==2 else ('09:00','17:00')
            slots.append({'date':day.isoformat(),'start_time':start,'end_time':end,'is_all_day':False})
            if row['role']!='EXPLORER':
                put(c.UserAvailability,f'talent-{user.id}-{week}',user=user,date=day,start_time=time.fromisoformat(start),end_time=time.fromisoformat(end),notify_new_shifts=row['status']=='verified',notes=f'Fictional {role.lower().replace("_"," ")} availability for Talent Hub testing.')
        # Internal calendar access does not imply public Talent publishing.
        if row['role']!='EXPLORER' and row['status'] not in ('verified','terms_pending'):
            continue
        if role=='INTERN':
            goal='internship opportunity'; work_types=['FULL_TIME','PART_TIME']
        elif role=='STUDENT':
            goal='student placement'; work_types=['PLACEMENT','PART_TIME']
        elif role=='CAREER_SWITCHER':
            goal='junior pharmacy experience'; work_types=['CASUAL','PART_TIME']
        else:
            goal='pharmacy shifts'; work_types=[row['employment'] if row['employment'] in ('FULL_TIME','PART_TIME','CASUAL') else 'CASUAL']
        put(c.ExplorerPost,f'talent-{user.id}',explorer_profile=profile_map[user.id] if row['role']=='EXPLORER' else None,author_user=user,
            headline=f'{user.first_name}: available for {goal} [Demo]',body=f'{row["name"]} is seeking {goal} near {loc[0]}. The listed dates and times are synthetic and can be used to test enquiries, filters and booking.',
            role_category=row['role'],role_title=role,work_types=work_types,post_kind='AVAILABILITY',availability_mode='CASUAL_CALENDAR',availability_days=slots,
            location_suburb=loc[0],location_state=loc[1],location_postcode=loc[2],open_to_travel=index%4==0,coverage_radius_km=[10,25,40,75][index%4],reference_code=f'DEMO{user.id}',is_anonymous=index%6==0)
    # Public, dated opportunities let intern and student accounts exercise the
    # same search and interest flows as other staff, with their own role filters.
    for role in ('INTERN','STUDENT'):
        seekers=[row for row in talent_candidates if row['subtype']==role and row['status']=='verified']
        for index in range(12):
            p=pharmacy_map[pharmacies[(index*6+(0 if role=='INTERN' else 3))%len(pharmacies)]['id']]
            key=f'talent-{role.lower()}-{index}'
            label='paid intern pharmacist opportunity' if role=='INTERN' else 'paid pharmacy student placement'
            rate=37 if role=='INTERN' else 27
            shift=put(c.Shift,key,pharmacy=p,created_by=p.owner.user,role_needed=role,employment_type='PART_TIME',visibility='PLATFORM',
                min_hourly_rate=rate,max_hourly_rate=rate+3,payment_preference='TFN',description=f'Fictional {label} at {p.name}. Supervised learning and a clear handover are included. Demo dates and pay only.')
            slot=put(c.ShiftSlot,key,shift=shift,date=TODAY+timedelta(days=21+index*3),start_time=time(9),end_time=time(15),rate=rate,planned_break_minutes=30)
            seeker=User.objects.get(pk=seekers[index%len(seekers)]['id'])
            put(c.ShiftInterest,key,shift=shift,slot=slot,user=seeker,revealed=index%3==0)
            if index<3:scenarios.append(dict(area='Talent Hub',name=f'{role.title()} opportunity at {p.name}',state='OPEN_INTEREST',users=[p.owner.user_id,seeker.id],record=str(shift.pk)))
    # Editorial team: ten writers and ten publishers plus the content administrator.
    editor=person('content.admin','EXPLORER',subtype='CAREER_SWITCHER',business=True)
    put(h.ContentAdministrator,'editor',user=editor)
    user_map[editor.id]['content']=['administrator']
    team=[]
    for role in ['writer','publisher']:
        for j in range(10):
            u=person(f'content.{role}.{j+1:02d}','EXPLORER',subtype='CAREER_SWITCHER',business=True)
            for area in AREAS:put(h.ContentAssignment,f'{u.id}-{area}',user=u,area=area,role=role)
            user_map[u.id]['content']=[role]; team.append(u)
    titles=['A calmer morning handover','Welcoming a new pharmacy intern','How our team plans leave cover','A regional locum week','Making space for staff learning','Community connections at the counter','Meet the weekend team','A practical stockroom refresh','Planning a team mentoring session','From student placement to first role']
    for kind in ['blog','news']:
        for j,title in enumerate(titles):
            author=team[j]; status='draft' if j==8 else 'archived' if j==9 else 'published'
            body=f'{title}\n\nThis fictional community pharmacy story is part of the local playground. {author.first_name} and the team are preparing for a busy week with clear handovers, fair cover arrangements and time for learning.\n\n## What the team tried\nThey started with a short morning briefing, checked the roster together and paired new starters with experienced colleagues. Staff shared suggestions in the community hub.\n\n## Next steps\nThe team will review feedback next Friday and update the checklist. This is demonstration content, not clinical advice.'
            article=put(h.Article,f'{kind}-{j}',title=title+' — Demo',slug=f'playground-{kind}-{j+1}',kind=kind,topic=['practice','career','community','industry'][j%4],excerpt='A fictional Australian pharmacy team shares its everyday experience.',body=body,body_document={'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':body}]}]},created_by=author,author_name=author.get_full_name(),status=status,published_at=NOW+timedelta(days=3) if j==7 else NOW-timedelta(days=j+1),featured=j<2,cover_url=f'http://127.0.0.1:8000/media/playground/content-{j%4}.jpg',cover_alt='Fictional Australian pharmacy community scene')
            document=put(h.ContentDocument,f'{kind}-{j}',area=kind,created_by=author,article=article,archived=status=='archived')
            put(h.ContentRevision,f'{kind}-{j}',document=document,payload={'title':article.title,'body':body,'body_document':article.body_document,'kind':kind,'topic':article.topic,'excerpt':article.excerpt},status='draft' if j==8 else 'scheduled' if j==7 else 'published',created_by=author,approved_by=team[10],publish_at=article.published_at)
            for k in range(3):
                comment=put(h.Comment,f'{kind}-{j}-{k}',article=article,author=workers[k],body=['We tried a similar handover and found it helpful.','How did you make time for mentoring during busy hours?','Our team rotates the buddy role each week.'][k],hidden=j==6 and k==2)
                put(h.Reaction,f'{kind}-{j}-{k}',article=article,user=workers[k],kind=['like','insightful','support'][k])
    for hub in c.PharmacyHubPost.PlatformHub.values:
        for j in range(4):
            post=put(c.PharmacyHubPost,f'hub-{hub}-{j}',platform_hub=hub,author_user=editor,body=f'{titles[j]}: welcome to the {hub} community. What helped your team this week? Share a practical tip or a question below. [Fictional playground post]',is_pinned=j==0,comment_count=2,reaction_summary={'LIKE':1,'INSIGHTFUL':1})
            put(c.PharmacyHubAttachment,f'{hub}-{j}',post=post,file=f'playground/content-{j}.jpg',kind='IMAGE')
            for k in range(2):
                put(c.PharmacyHubComment,f'{hub}-{j}-{k}',post=post,author_user=team[k],body=['A short checklist helped us keep handovers consistent.','We paired each new starter with a mentor.'][k])
                put(c.PharmacyHubReaction,f'{hub}-{j}-{k}',post=post,user=team[k],reaction_type=['LIKE','INSIGHTFUL'][k])
        poll=put(c.PharmacyHubPoll,f'{hub}',platform_hub=hub,created_by=editor,question='What would you like in the next team learning session?',closes_at=NOW+timedelta(days=7))
        for j,label in enumerate(['Handover routines','Career development','Team communication']):
            option=put(c.PharmacyHubPollOption,f'{hub}-{j}',poll=poll,label=label,position=j,vote_count=1)
            put(c.PharmacyHubPollVote,f'{hub}-{j}',poll=poll,option=option,user=team[j])
    category=put(m.MarketplaceCategory,'equipment',slug='office-tools',name='Office & tools',context='BOTH',permitted_modes=['SELL','SWAP','FREE'],maximum_buyer_roles=[r[0] for r in User.ROLE_CHOICES],requires_review=False)
    for j in range(32):
        seller=owners[j%len(owners)]; buyer=owners[(j+1)%len(owners)]
        p=next(p for p in pharmacy_map.values() if p.owner.user_id==seller.id)
        exchange_state=m.MarketplaceExchange.State.values[j%8]
        mode=['SELL','SWAP','FREE'][j%3]
        publication='PUBLISHED' if j<24 else m.MarketplaceListing.Publication.values[j%7]
        availability='COMPLETED' if exchange_state=='COMPLETED' else 'RESERVED' if exchange_state in ('ACCEPTED','AWAITING_COMPLETION') else 'AVAILABLE'
        listing=put(m.MarketplaceListing,f'{j}',slug=f'playground-listing-{j}',creator=seller,seller_context='PHARMACY' if j%2==0 else 'PERSONAL',pharmacy=p if j%2==0 else None,
                    category=category,mode=mode,title=['Barcode scanner and label printer','Office chairs and storage shelves'][j%2]+f' — {j+1}',description='Fictional demonstration listing. Clean pre-owned equipment, available after our stockroom refresh. Ask about collection times.',condition='GOOD',amount=120 if mode=='SELL' else 0,desired_swap='Desk organiser or storage tubs' if mode=='SWAP' else '',suburb=p.suburb,state=p.state,postcode=p.postcode,publication_status=publication,availability_status=availability,published_at=NOW-timedelta(days=j%7))
        put(m.ListingAudiencePolicy,f'{j}',listing=listing,allowed_buyer_roles=['OWNER','PHARMACIST','INTERN','TECHNICIAN','ASSISTANT','STUDENT','EXPLORER','JUNIOR','CAREER_SWITCHER'],public_discovery=True,current_circle='PLATFORM' if j%2==0 else None,maximum_circle='PLATFORM' if j%2==0 else None,source_owner_id=p.owner_id if j%2==0 else None,source_organization_id=p.organization_id if j%2==0 else None)
        put(m.ListingDeliveryTerms,f'{j}',listing=listing,method='PICKUP',notes='Weekdays after 3 pm by arrangement.')
        put(m.MarketplaceImage,f'{j}',listing=listing,uploader=seller,original=f'playground/content-{4+j%2}.jpg',derivative=f'playground/content-{4+j%2}.jpg',moderation_status='APPROVED',width=512,height=512,alt_text=listing.title)
        if publication!='PUBLISHED':continue
        ex=put(m.MarketplaceExchange,f'{j}',listing=listing,buyer=buyer,state=exchange_state,proposed_terms={'amount':120 if mode=='SELL' else 0,'collection':'Friday after 3 pm'},agreed_terms={'collection':'Friday 3:30 pm'} if j%8>=2 else {},seller_confirmed=exchange_state=='COMPLETED',buyer_confirmed=exchange_state=='COMPLETED')
        for u,party in [(seller,'SELLER'),(buyer,'BUYER')]:put(m.MarketplaceExchangeParticipant,f'{j}-{party}',exchange=ex,user=u,party_context=party,permissions=['READ','MESSAGE','ACCEPT' if party=='SELLER' else 'PROPOSE'])
        for k,body in enumerate(['Hi, is this still available? We are refreshing our back office.','Yes, you can collect after 3 pm on Friday.','Thanks. I will confirm with our manager.']):put(m.MarketplaceMessage,f'{j}-{k}',exchange=ex,author=buyer if k%2==0 else seller,body=body)
        if availability=='RESERVED':put(m.MarketplaceReservation,f'{j}',listing=listing,exchange=ex,active=True,expires_at=NOW+timedelta(days=3))
        put(m.MarketplaceSavedListing,f'{j}',listing=listing,user=workers[j])
        scenarios.append(dict(area='Marketplace',name=listing.title,state=exchange_state,users=[seller.id,buyer.id],record=str(listing.id)))
    # Ethical premises and permissions: clearly synthetic approvals for local tests.
    for j,row in enumerate(pharmacies):
        p=pharmacy_map[row['id']]; owner=p.owner.user
        status='VERIFIED' if j<20 else e.EthicalPharmacyApproval.Status.values[j%7]
        put(e.EthicalPharmacyApproval,f'{p.id}',pharmacy=p,applicant=owner,accountable_owner=owner,business_phone='0000000000',business_email=owner.email,status=status,review_method='LOCAL_DEMO_ONLY',review_reason='Synthetic fixture; not a real premises approval.',owner_confirmed_at=NOW,checked_at=NOW,due_at=NOW+timedelta(days=180))
    for owner in owners:put(e.EthicalProfessionalAccess,f'{owner.id}',user=owner,status='VERIFIED',professional_basis='LOCAL_DEMO_ONLY',schedules=['S2','S3','S4'],activities=sorted(__import__('ethical_marketplace.policy',fromlist=['CAPABILITIES']).CAPABILITIES),jurisdictions=[l[1] for l in LOCATIONS],verified_at=NOW,expires_at=NOW+timedelta(days=365))
    product=put(e.EthicalProduct,'demo-product',name='DEMO training stock — not for clinical use',strength='Synthetic',form='Demonstration pack',pack_size='1 pack',schedule='S2',classification_provenance='LOCAL SYNTHETIC FIXTURE — not an actual medicine',status='APPROVED',reviewed_by=editor)
    for j,state in enumerate(e.EthicalTransfer.State.values):
        source=pharmacy_map[pharmacies[j]['id']]; destination=pharmacy_map[pharmacies[(j+1)%10]['id']]
        listing=put(e.EthicalListing,f'demo-{j}',pharmacy=source,accountable_owner=source.owner.user,prepared_by=source.owner.user,product=product,mode='FREE',current_circle='PLATFORM_OWNERS',maximum_circle='PLATFORM_OWNERS',scope_owner_id=source.owner_id,status='COMPLETED' if state=='RECEIVED' else 'RESERVED' if state in ['AGREED','AUTHORISED_FOR_DISPATCH','DISPATCHED'] else 'PUBLISHED',published_at=NOW)
        lot=put(e.EthicalStockLot,f'demo-{j}',pharmacy=source,product=product,batch_number=f'DEMO-{j+1:03d}',expiry_date=TODAY+timedelta(days=365),on_hand_quantity=8 if state in ['DISPATCHED','RECEIVED'] else 10,reserved_quantity=2 if state in ['AGREED','AUTHORISED_FOR_DISPATCH'] else 0,source_reference='Local playground',last_reconciled_at=NOW,storage_checks={'demo_only':True})
        put(e.EthicalListingLot,f'demo-{j}',listing=listing,lot=lot,quantity=2)
        transfer=put(e.EthicalTransfer,f'demo-{j}',listing=listing,source_pharmacy=source,destination_pharmacy=destination,requested_by=destination.owner.user,mode='FREE',state=state,terms={'demo_only':True,'collection':'Arrange collection with owner'},legal_basis='LOCAL TEST ONLY — no legal authorisation',source_approved_by=source.owner.user if j>=2 else None,destination_approved_by=destination.owner.user if j>=2 else None,dispatched_at=NOW-timedelta(days=1) if state in ['DISPATCHED','RECEIVED'] else None,received_at=NOW if state=='RECEIVED' else None)
        put(e.EthicalTransferLine,f'demo-{j}',transfer=transfer,lot=lot,quantity=2)
        put(e.EthicalMessage,f'demo-{j}',transfer=transfer,author=destination.owner.user,body='Demonstration request: can you confirm the batch and collection window?')
        scenarios.append(dict(area='Ethical marketplace',name=f'Demo stock transfer {j+1}',state=state,users=[source.owner.user_id,destination.owner.user_id],record=str(transfer.pk)))
    # Published and draft roster periods attach the existing assignments to their week.
    for j,row in enumerate(pharmacies):
        p=pharmacy_map[row['id']]
        slots=list(c.ShiftSlot.objects.filter(shift__pharmacy=p,pk__gte=700001,pk__lte=700284).order_by('pk'))
        for week_index,week in enumerate(sorted({slot.date-timedelta(days=slot.date.weekday()) for slot in slots})):
            period=put(c.RosterPeriod,f'{p.id}-week-{week_index}',pharmacy=p,week_start=week,status='DRAFT' if j%3==0 else 'PUBLISHED',created_by=p.owner.user,published_by=p.owner.user if j%3 else None,published_at=NOW if j%3 else None)
            for slot in slots:
                if slot.date-timedelta(days=slot.date.weekday())==week:c.ShiftSlot.objects.filter(pk=slot.pk).update(roster_period=period)
    # All timestamps and amounts are examples, never a legal or payroll calculation.
    for j in range(12):
        p=pharmacy_map[pharmacies[j]['id']]; u=User.objects.get(pk=next(r['id'] for r in users if r['employment']=='LOCUM' and p.id in r['pharmacies']))
        invoice=put(c.Invoice,f'{j}',user=u,pharmacy=p,pharmacy_name_snapshot=p.name,issuer_first_name=u.first_name,issuer_last_name=u.last_name,issuer_email=u.email,invoice_date=TODAY-timedelta(days=10),due_date=TODAY+timedelta(days=-3 if j%3==1 else 7),subtotal=520,total=520,status=['draft','sent','paid'][j%3])
        put(c.InvoiceLineItem,f'{j}',invoice=invoice,description='Demo locum coverage — 8 hours',quantity=8,unit_price=65,total=520,gst_applicable=False,super_applicable=False,is_manual=True)
    # Advance PostgreSQL sequences so app-created records cannot collide with fixtures.
    from django.core.management.color import no_style
    from django.apps import apps
    models=[apps.get_model(label) for label in counts]
    with connection.cursor() as cursor:
        for sql in connection.ops.sequence_reset_sql(no_style(),models):cursor.execute(sql)
    accepted_staff={uid for (uid,_),membership in member_map.items() if membership.status=='ACCEPTED' and membership.is_active}
    for row in users:
        if row['role'] in ('PHARMACIST','OTHER_STAFF'):
            row['talent_access']='public' if row['status'] in ('verified','terms_pending') else 'internal_only' if row['id'] in accepted_staff else 'pending'
        elif row['role']=='EXPLORER':
            row['talent_access']='explorer_post' if row['key'].startswith('explorer.') or (row['key'].startswith('p') and row['subtype']=='CAREER_SWITCHER') else 'none'
        else:
            row['talent_access']='none'

seed()
previous_path.write_text(json.dumps(records,indent=2))
data=dict(generated=NOW.isoformat(),password=PASSWORD,users=users,pharmacies=pharmacies,organizations=organizations,scenarios=scenarios,counts=dict(counts),
          notes=['All identities, addresses, verification flags and credentials are synthetic.','AI portrait pools are reused across test accounts; uniform and name groups are matched.','Email is captured locally; payment, SMS and external verification integrations are disabled by local_settings.','Re-run seed.py to refresh baseline fixture records. User-created test records remain.'])
(HERE/'data.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
(HERE/'data.js').write_text('window.PLAYGROUND = '+json.dumps(data)+';',encoding='utf-8')
print(json.dumps({'users':len(users),'pharmacies':len(pharmacies),'organizations':len(organizations),'models':dict(counts)},indent=2))

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicApi from '../api';
import exportOwners from '../contracts/applicationExports.json';
import { configureApi } from '../transport/application';
import { camelCaseKeysDeep, buildQuery, toPaginatedList } from '../utils/serialization';
import { mapShift } from './shifts/mappers';
import { leaveRequestMemberships } from '../contracts/workforce';
import { mapMembershipSummary } from './memberships/mappers';
import { mapChatMessage } from './chat/mappers';
import { mapPost } from './pharmacyHub/mappers';
import { fetchOrganizationGroupMembers } from './pharmacyHub/api';
import { getPublicJobBoard } from './shifts/api';
import { getPharmacyAdmins, getPendingPharmacyAdminInvitations } from './organizations/api';
import { createMembershipInviteLinkService } from './memberships/api';
import { startDirectMessageByUser } from './chat/api';
import { attendance } from './attendance/api';
import { financeApi } from './finance/api';

const baseURL = 'https://example.test/api/v1';
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: {'Content-Type':'application/json'} });
function responses(...payloads: unknown[]) {
  const calls: Array<{url:string;init?:RequestInit}> = [];
  const fetchImpl = vi.fn(async (url,init) => {
    calls.push({url:String(url),init});
    if (!payloads.length) throw new Error('Unexpected extra HTTP request.');
    return json(payloads.shift());
  }) as typeof fetch;
  configureApi({baseURL, getToken:()=> 'fixture-token', fetchImpl});
  return calls;
}
afterEach(()=>vi.unstubAllGlobals());

describe('source-backed wire/domain contracts after extraction',()=>{
  it('retains 431 runtime exports after retiring seven unused onboarding/application operations',()=>{
    const modules=import.meta.glob('./**/api.ts',{eager:true});
    const retiredExports = ['createOnboarding', 'getShiftApplications',
      'acceptShiftApplication', 'rejectShiftApplication', 'fetchShiftApplicationsService',
      'acceptShiftApplicationService', 'rejectShiftApplicationService'];
    expect(Object.keys(exportOwners)).toHaveLength(438 - retiredExports.length);
    for (const name of retiredExports) {
      expect(exportOwners).not.toHaveProperty(name);
      expect(publicApi).not.toHaveProperty(name);
    }
    for(const [name,owner] of Object.entries(exportOwners)) {
      const path='./'+owner.replace(/^domains\//,'');
      expect(publicApi[name],name).toBe(modules[path][name]);
      expect(publicApi[name],name).toBeDefined();
    }
  });

  it('preserves public operation identities through the thin facade',()=>{
    expect(publicApi.getPublicJobBoard).toBe(getPublicJobBoard);
    expect(publicApi.getPharmacyAdmins).toBe(getPharmacyAdmins);
    expect(publicApi.createMembershipInviteLinkService).toBe(createMembershipInviteLinkService);
    expect(publicApi.startDirectMessageByUser).toBe(startDirectMessageByUser);
    expect(publicApi.attendance).toBe(attendance);
    expect(publicApi.financeApi).toBe(financeApi);
  });
  it('retains array query values, false, zero, and query omission',()=>{
    expect(buildQuery({pharmacy:4,role:['PHARMACIST','INTERN'],active:false,page:0,none:null})).toBe('?pharmacy=4&role=PHARMACIST&role=INTERN&active=false&page=0');
  });
  it('preserves nullable membership identity and both published key conventions',()=>{
    const row = {id:7,user:null,pharmacy_id:4,role:null,employment_type:null,user_details:null,invited_name:'Fixture Contact',is_active:false};
    const output=mapMembershipSummary(row);
    expect(output).toMatchObject({...row,pharmacyId:4,invitedName:'Fixture Contact',employmentType:null,userDetails:null,email:null});
    expect(row).not.toHaveProperty('userDetails');
  });
  it('maps nested membership names without mutating the raw presentation',()=>{
    const details={id:9,first_name:'Fixture',last_name:'Worker',email:null};
    const row={id:7,user:9,role:'PHARMACIST',user_details:details};
    const output=mapMembershipSummary(row);
    expect(output.user_details).toEqual(details);
    expect(output.userDetails).toMatchObject({id:9,firstName:'Fixture',lastName:'Worker',email:null});
  });
  it('keeps raw public job-board records raw for the client presentation mapper',async()=>{
    const page={count:1,next:null,results:[{id:2,role_needed:'PHARMACIST',pharmacy_detail:null,slots:[]}]};
    responses(page);
    expect(await getPublicJobBoard({organization:3})).toEqual(page);
  });
  it('offers leave only for accepted pharmacy memberships with a membership id',()=>{
    const rows=[{organization_id:1,role:'ORG_ADMIN'},{pharmacy_id:1,role:'OWNER'},{id:3,pharmacy_id:2,role:'PHARMACIST',status:'ACCEPTED',is_active:true},{id:4,pharmacy_id:5,role:'PHARMACIST',status:'PENDING'}];
    expect(leaveRequestMemberships(rows as any)).toEqual([rows[2]]);
  });
  it('preserves role eligibility through public shift mapping',()=>{
    expect(mapShift({id:2,role_needed:'TECHNICIAN',can_apply:false})).toMatchObject({canApply:false});
    expect(mapShift({id:3,role_needed:'PHARMACIST',can_apply:true})).toMatchObject({canApply:true});
  });
  it('keeps mapped shifts and stable nested slot and assignment IDs',()=>{
    const row={id:2,role_needed:'PHARMACIST',pharmacy_detail:null,slots:[{id:5,date:'2026-10-12',start_time:'09:00:00',end_time:'17:00:00'}],slot_assignments:[{id:8,slot_id:5,slot_date:'2026-10-12'}]};
    expect(mapShift(row)).toMatchObject({id:2,roleNeeded:'PHARMACIST',pharmacyDetail:null,slots:[{id:5,startTime:'09:00:00'}],slotAssignments:[{id:8,slotId:5}],allowedEscalationLevels:[]});
  });
  it('keeps authoritative backend pagination links and counts',()=>{
    expect(toPaginatedList({count:70,next:'https://example.test/api/v1/items/?page=2',previous:null,results:[{record_id:3}]},camelCaseKeysDeep)).toEqual({count:70,next:'https://example.test/api/v1/items/?page=2',previous:null,results:[{recordId:3}]});
  });
  it('maps records in a native runtime that does not define File',()=>{
    vi.stubGlobal('File',undefined);
    expect(camelCaseKeysDeep({first_name:'Worker',row_ids:[{slot_id:4}]})).toEqual({firstName:'Worker',rowIds:[{slotId:4}]});
  });
  it('does not serialize Blob/FormData contents as ordinary JSON records',()=>{
    const blob=new Blob(['fixture']); const form=new FormData();form.append('file',blob,'fixture.txt');
    const output=camelCaseKeysDeep({file_data:blob,form_data:form});
    expect(output.fileData).toBe(blob);expect(output.formData).toBe(form);
  });
  it('uses the backend PharmacyAdmin pharmacy query rather than a scalar ignored by buildQuery',async()=>{
    const calls=responses([]);await getPharmacyAdmins({pharmacy:4});
    expect(calls[0].url).toBe(baseURL+'/pharmacy-admins/?pharmacy=4');
  });
  it('retains the pending-invitation membership ID guaranteed by the endpoint queryset',async()=>{
    const row={id:4,membership_id:7,pharmacy_id:9,pharmacy_name:'Fixture Pharmacy',admin_level:'MANAGER',job_title:'',membership_status:'PENDING'};
    responses([row]);expect(await getPendingPharmacyAdminInvitations()).toEqual([row]);
  });
  it('returns the direct invite DTO, not an Axios data wrapper',async()=>{
    responses({id:5,token:'fixture-token',pharmacy:4});
    const result=await createMembershipInviteLinkService({pharmacy:4});
    expect(result.token).toBe('fixture-token');expect(result).not.toHaveProperty('data');
  });
  it('sends a scalar partner user ID for direct chat',async()=>{
    const calls=responses({id:10,type:'DM',title:'Fixture'});
    await startDirectMessageByUser(9);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({partner_user_id:9});
  });
  it('preserves chat message wire field names while mapping nested display identity',()=>{
    const row={id:10,conversation:7,sender:{id:3,user_details:{id:9,first_name:'Fixture',last_name:'Worker',email:null}},body:'Test',created_at:'2026-10-06T00:00:00Z'};
    expect(mapChatMessage(row)).toMatchObject({id:10,conversation:7,sender:{id:3,user_details:{id:9,firstName:'Fixture',lastName:'Worker',email:undefined}},body:'Test'});
  });
  it('preserves a chat message after its sender membership is removed',()=>{
    const row={id:10,conversation:7,sender:null,body:'Test',attachment_url:null,created_at:'2026-10-06T00:00:00Z'};
    expect(mapChatMessage(row)).toMatchObject(row);
  });
  it('retains the PIN pharmacy envelope actually returned by WorkerUpdatePinView',async()=>{
    const data={pharmacies:[{id:4,name:'Fixture Pharmacy',has_pin:true}]};responses(data);
    expect(await attendance.getPinPharmacies()).toEqual(data);
  });
  it('reads organization group member identity from the raw backend fields',async()=>{
    responses([{members:[{membership_id:6,pharmacy_id:4,pharmacy_name:'Fixture Pharmacy',member:{id:6,role:'PHARMACIST',employment_type:'LOCUM',user_details:{id:9,first_name:'Fixture',last_name:'Worker'}}}]}]);
    const result=await fetchOrganizationGroupMembers(3);
    expect(result[0]).toMatchObject({membershipId:6,userId:9,fullName:'Fixture Worker',employmentType:'LOCUM',email:null});
  });
  it('keeps Hub contact email absent in serialized presentation when absent on the wire',()=>{
    const post={id:2,body:'Fixture',author:{id:6,role:'PHARMACIST',employment_type:'LOCUM',user_details:{id:9,first_name:'Fixture',last_name:'Worker'}},attachments:[],comments:[],tagged_members:[],reactions:{},viewer_reaction:null};
    const output=JSON.parse(JSON.stringify(mapPost(post)));
    expect(output.author.userDetails).not.toHaveProperty('email');
  });
  it('preserves the finance decimal response wrapper and array prefill inputs',async()=>{
    const calls=responses({hours:'7.50'},{customer_id:0,source_assignment_ids:[7],lines:[]});
    expect(await financeApi.shiftHours({start:'09:00',end:'17:00'})).toEqual({hours:'7.50'});
    expect(await financeApi.internalPrefill([7])).toMatchObject({customer_id:0,source_assignment_ids:[7]});
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({assignment_ids:[7]});
  });
});

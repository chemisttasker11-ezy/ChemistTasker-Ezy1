// M4-07: actual API facade with real transport and URL policy; no duplicated client HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChemistTaskerApi } from './platformApi';

test('C: post search and page remain on public AllowAny URL, polls independently paginate',async()=>{
  const requests: Array<{url:string;method:string;body:string|null;authorization:string|null}>=[];
  const fakeFetch:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    requests.push({url:url.pathname+url.search,method:init?.method||'GET',
      body:init?.body==null?null:String(init.body),
      authorization:new Headers(init?.headers).get('Authorization')});
    return new Response(JSON.stringify({count:0,next:null,previous:null,results:[]}),{
      status:200,headers:{'Content-Type':'application/json'}});
  };
  const api=createChemistTaskerApi({baseUrl:'https://api.example.test/api/v1/',
    getAuthToken:()=> 'private-secret',fetchImpl:fakeFetch});
  await api.publicContent.listCommunityPosts('pharmacist',{page:2,q:'Roster & work'});
  await api.publicContent.listCommunityPolls('pharmacist',{page:3});
  assert.equal(requests.length,2);
  assert.equal(requests[0].url,
    '/api/v1/public-hub/community/pharmacist/posts/?page=2&q=Roster+%26+work');
  assert.equal(requests[1].url,'/api/v1/public-hub/community/pharmacist/polls/?page=3');
  assert.ok(requests.every(x=>x.authorization===null),'public reads never send bearer');
});
test('C: vote submits option_id via authenticated shared core only',async()=>{
  const calls:Array<{url:string;body:string|null;authorization:string|null}>=[];
  const fakeFetch:typeof fetch=async(input,init)=>{
    calls.push({url:new URL(String(input)).pathname,body:init?.body?String(init.body):null,
      authorization:new Headers(init?.headers).get('Authorization')});
    return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
  };
  const api=createChemistTaskerApi({baseUrl:'https://api.example.test/api/v1/',
    getAuthToken:()=> 'session-secret',fetchImpl:fakeFetch});
  await api.publicContent.voteCommunityPoll(54,113);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'/api/v1/hub/polls/54/vote/');
  assert.equal(calls[0].body,JSON.stringify({option_id:113}));
  assert.equal(calls[0].authorization,'Bearer session-secret');
});

// M4-07: actual API facade with real transport and URL policy; no duplicated client HTTP.
import { it as test } from 'vitest';
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
  assert.ok(requests.every(x=>x.authorization==='Bearer private-secret'),'signed-in public reads send bearer');
  const anonymous=createChemistTaskerApi({baseUrl:'https://api.example.test/api/v1/',fetchImpl:fakeFetch});
  const result=await anonymous.publicContent.listCommunityPosts('public');
  assert.equal(requests[2].authorization,null);
  assert.deepEqual(result.results,[]);
});
test('R: invalid bearer retries a public read once anonymously without refresh or logout',async()=>{
  const headers:Array<string|null>=[];let refreshes=0,logouts=0;
  const api=createChemistTaskerApi({baseUrl:'https://api.example.test/api/v1/',
    getAuthToken:()=> 'expired',refreshAuthToken:()=>{refreshes++;return null;},onAuthFailure:()=>{logouts++;},
    fetchImpl:async(_input,init)=>{const auth=new Headers(init?.headers).get('Authorization');headers.push(auth);
      return auth?new Response('{}',{status:401}):new Response(JSON.stringify({results:[{id:1}]}),{headers:{'Content-Type':'application/json'}});}});
  assert.deepEqual((await api.publicContent.listCommunityPosts('public')).results,[{id:1}]);
  assert.deepEqual(headers,['Bearer expired',null]);
  assert.equal(refreshes,0);assert.equal(logouts,0);
});
test('C: cookie public reads stay cookie-backed; a second 401 stops the bearer fallback',async()=>{
  const calls:Array<{auth:string|null;credentials:RequestCredentials|undefined}>=[];let failures=0;
  const fetchImpl:typeof fetch=async(_input,init)=>{calls.push({auth:new Headers(init?.headers).get('Authorization'),credentials:init?.credentials});
    return new Response('{}',{status:401});};
  const cookie=createChemistTaskerApi({baseUrl:'https://api.example.test/api/v1/',credentials:'include',fetchImpl});
  await assert.rejects(cookie.publicContent.listHubs());
  assert.deepEqual(calls,[{auth:null,credentials:'include'}]);
  calls.length=0;
  const bearer=createChemistTaskerApi({baseUrl:'https://api.example.test/api/v1/',getAuthToken:()=> 'bad',fetchImpl,onAuthFailure:()=>{failures++;}});
  await assert.rejects(bearer.publicContent.listHubs());
  assert.deepEqual(calls.map(x=>x.auth),['Bearer bad',null]);
  assert.equal(failures,0);
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

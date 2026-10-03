import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildWsUrl} from '../src/utils/wsUrl.ts';

const room='/ws/chat/rooms/1/';

test('relative API base resolves against the page origin instead of throwing',()=>{
 assert.equal(buildWsUrl(room,'/api','http://localhost:5173','abc'),'ws://localhost:5173/ws/chat/rooms/1/?ticket=abc');
 assert.equal(buildWsUrl(room,'/api','https://app.example.com','abc'),'wss://app.example.com/ws/chat/rooms/1/?ticket=abc');
});

test('empty API base falls back to the page origin',()=>{
 for(const base of ['',null,undefined])assert.equal(buildWsUrl(room,base,'http://localhost:5173'),'ws://localhost:5173/ws/chat/rooms/1/');
});

test('absolute API base keeps its host and maps http to ws and https to wss',()=>{
 assert.equal(buildWsUrl(room,'http://localhost:8000/api','http://localhost:5173','abc'),'ws://localhost:8000/ws/chat/rooms/1/?ticket=abc');
 assert.equal(buildWsUrl(room,'https://api.example.com/api','https://app.example.com','abc'),'wss://api.example.com/ws/chat/rooms/1/?ticket=abc');
});

test('ticket is URL-encoded and omitted when absent',()=>{
 assert.equal(buildWsUrl(room,'/api','http://localhost:5173','a+b/c='),'ws://localhost:5173/ws/chat/rooms/1/?ticket=a%2Bb%2Fc%3D');
 assert.equal(buildWsUrl(room,'/api','http://localhost:5173',''),'ws://localhost:5173/ws/chat/rooms/1/');
});

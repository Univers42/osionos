/**
 * Issue reports (Report an issue + the Issues panel), devil C221–C224:
 *   * a reporter attaches only their own upload, and a workspace they are not a
 *     live member of is dropped, never an error;
 *   * title, body and every error line reach the database redacted and within the
 *     table's limits;
 *   * scope=all and every PATCH are for staff only (the moderation console's gate).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createIssuesHandler } from '../../scripts/bridge-issues.mjs';
import { redactIssueText } from '../../scripts/bridge-issue-redact.mjs';
import { createStub, call, uid } from './support/issues-postgrest.mjs';

const U1 = uid(1);
const U2 = uid(2);

describe('redact', () => {
  it('redacts', () => {
    const t = redactIssueText('tok eyJaaa.bbb.ccc end Authorization: Bearer abc.def ?token=s3cr3t&x=1 me@example.com');
    assert.ok(t.includes('[jwt]'));
    assert.ok(t.includes('Bearer [redacted]'));
    assert.ok(t.includes('token=[redacted]'));
    assert.ok(t.includes('[email]'));
    assert.equal(redactIssueText('plain text'), 'plain text');
  });
});

describe('POST', () => {
  it('401 no token', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:null, body:{title:'t',body:'b',routeKind:'page'}});
    assert.equal(r.status, 401);
  });
  it('400 unknown key', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', body:{title:'t',body:'b',routeKind:'page',foo:1}});
    assert.equal(r.status, 400);
  });
  it('400 121 title', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', body:{title:'a'.repeat(121),body:'b',routeKind:'page'}});
    assert.equal(r.status, 400);
  });
  it('400 bad routeKind', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', body:{title:'t',body:'b',routeKind:'nope'}});
    assert.equal(r.status, 400);
  });
  it('400 21 errors', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', body:{title:'t',body:'b',routeKind:'page',errors:Array(21).fill('e')}});
    assert.equal(r.status, 400);
  });
  it('400 other user screenshot', async () => {
    const stub = createStub({admin:true});
    const path = `/api/media/uploads/${U2}/` + 'a'.repeat(64) + '.png';
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', body:{title:'t',body:'b',routeKind:'page',screenshotPath:path}});
    assert.equal(r.status, 400);
  });
  it('400 https url screenshot', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', body:{title:'t',body:'b',routeKind:'page',screenshotPath:'https://evil/x.png'}});
    assert.equal(r.status, 400);
  });
  it('drops non-member workspace', async () => {
    const stub = createStub({admin:true, members:[]});
    const ws = uid(9);
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title:'t',body:'b',routeKind:'page',workspaceId:ws}});
    assert.equal(r.status, 201);
    assert.equal(stub.calls.find(c=>c.table==='rpc/osionos_issue_report_create').body.p_workspace, null);
  });
  it('RPC gets redacted text', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title:'hi eyJaaa.bbb.ccc',body:'mail me@example.com',routeKind:'page',errors:['Bearer abc.def']}});
    assert.equal(r.status, 201);
    const rpc = stub.calls.find(c=>c.table==='rpc/osionos_issue_report_create');
    assert.equal(rpc.body.p_title, 'hi [jwt]');
    assert.equal(rpc.body.p_body, 'mail [email]');
    assert.deepEqual(rpc.body.p_errors, ['Bearer [redacted]']);
  });
  it('cap -> 429', async () => {
    const stub = createStub({admin:true, rpcCode:'P0001'});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title:'t',body:'b',routeKind:'page'}});
    assert.equal(r.status, 429);
    assert.equal(r.body.code, 'issue_report_daily_cap');
  });
  it('success no reporter_id', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title:'t',body:'b',routeKind:'page'}});
    assert.equal(r.status, 201);
    assert.equal(r.body.issue.reporter_id, undefined);
    assert.equal(r.body.issue.title, 't');
  });
});

describe('GET', () => {
  it('mine only caller rows', async () => {
    const stub = createStub({admin:true, issues:[
      {id:uid(5), reporter_id:U1, title:'a', status:'open', created_at:'2026-01-02'},
      {id:'i2', reporter_id:U2, title:'b', status:'open', created_at:'2026-01-01'},
    ]});
    const r = await call(createIssuesHandler, stub, {method:'GET', path:'/api/issues', token:'Bearer t', userId:U1, query:'?scope=mine'});
    assert.equal(r.status, 200);
    assert.equal(r.body.issues.length, 1);
    assert.equal(r.body.issues[0].id, uid(5));
  });
  it('all non-staff 403', async () => {
    const stub = createStub({admin:false});
    const r = await call(createIssuesHandler, stub, {method:'GET', path:'/api/issues', token:'Bearer t', userId:U1, query:'?scope=all', isAdmin:false});
    assert.equal(r.status, 403);
  });
  it('all staff reporterName', async () => {
    const stub = createStub({admin:true, issues:[
      {id:uid(5), reporter_id:U1, title:'a', status:'open', created_at:'2026-01-02'},
    ], profiles:[{user_id:U1, display_name:'Alice'}]});
    const r = await call(createIssuesHandler, stub, {method:'GET', path:'/api/issues', token:'Bearer t', userId:U2, query:'?scope=all', isAdmin:true});
    assert.equal(r.status, 200);
    assert.equal(r.body.issues[0].reporterName, 'Alice');
  });
});

describe('PATCH', () => {
  it('non-staff 403', async () => {
    const stub = createStub({admin:false, issues:[{id:uid(5),reporter_id:U1,status:'open',created_at:'x'}]});
    const r = await call(createIssuesHandler, stub, {method:'PATCH', path:'/api/issues/'+uid(5), token:'Bearer t', userId:U1, body:{status:'sent'}, isAdmin:false});
    assert.equal(r.status, 403);
  });
  it('staff sets status and url', async () => {
    const stub = createStub({admin:true, issues:[{id:uid(5),reporter_id:U1,status:'open',created_at:'x'}]});
    const url='https://github.com/o/r/issues/1';
    const r = await call(createIssuesHandler, stub, {method:'PATCH', path:'/api/issues/'+uid(5), token:'Bearer t', userId:U2, body:{status:'sent',githubUrl:url}, isAdmin:true});
    assert.equal(r.status, 200);
    assert.equal(r.body.issue.status, 'sent');
    const row=stub.world.issues[0];
    assert.equal(row.status,'sent');
    assert.equal(row.github_url,url);
  });
  it('bad githubUrl 400', async () => {
    const stub = createStub({admin:true, issues:[{id:uid(5),reporter_id:U1,status:'open',created_at:'x'}]});
    const r = await call(createIssuesHandler, stub, {method:'PATCH', path:'/api/issues/'+uid(5), token:'Bearer t', userId:U2, body:{githubUrl:'https://evil.example/x'}, isAdmin:true});
    assert.equal(r.status, 400);
  });
});

describe('the table limits hold before the database sees the row', () => {
  it('tabs and CRLF in the body are normalised, a newline in the title is refused', async () => {
    const stub = createStub({admin:true});
    const ok = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title:'t',body:'at\tline 3\r\nnext',routeKind:'page'}});
    assert.equal(ok.status, 201);
    assert.equal(stub.calls.find(c=>c.table==='rpc/osionos_issue_report_create').body.p_body, 'at  line 3\nnext');
    const bad = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title:'two\nlines',body:'b',routeKind:'page'}});
    assert.equal(bad.status, 400);
  });
  it('a control character in the user agent is refused', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title:'t',body:'b',routeKind:'page',userAgent:'UA\u0000x'}});
    assert.equal(r.status, 400);
  });
  it('a redaction that lengthens the title is cut back to 120', async () => {
    const stub = createStub({admin:true});
    const title = 'x'.repeat(110) + ' Bearer a';
    const r = await call(createIssuesHandler, stub, {method:'POST', path:'/api/issues', token:'Bearer t', userId:U1, body:{title,body:'b',routeKind:'page'}});
    assert.equal(r.status, 201);
    assert.equal(stub.calls.find(c=>c.table==='rpc/osionos_issue_report_create').body.p_title.length, 120);
  });
  it('the list asks for 50 rows when no limit is given, and never more than 100', async () => {
    const stub = createStub({admin:true});
    await call(createIssuesHandler, stub, {method:'GET', path:'/api/issues', token:'Bearer t', userId:U1, query:'?scope=mine'});
    await call(createIssuesHandler, stub, {method:'GET', path:'/api/issues', token:'Bearer t', userId:U1, query:'?scope=mine&limit=5000'});
    const limits = stub.calls.filter(c=>c.table==='osionos_issue_reports').map(c=>new URLSearchParams(c.query).get('limit'));
    assert.deepEqual(limits, ['50', '100']);
  });
  it('PATCH of a missing report is a 404', async () => {
    const stub = createStub({admin:true});
    const r = await call(createIssuesHandler, stub, {method:'PATCH', path:'/api/issues/'+uid(7), token:'Bearer t', userId:U2, body:{status:'closed'}, isAdmin:true});
    assert.equal(r.status, 404);
  });
});

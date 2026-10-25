import assert from 'node:assert/strict';

export const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export const CONFIG = {
	baasUrl: 'http://baas.test',
	serviceKey: 'svc-key',
	allowedOrigin: '*',
	appSessionSecret: 'test-app-session-secret',
};
const reply = (rows, status = 200) => ({
	ok: status < 400,
	status,
	text: async () => (rows === '' ? '' : JSON.stringify(rows)),
});
function eqOf(v){ return String(v ?? '').replace(/^eq\./,''); }

const SHAPES = [
  { logical:'admin', method:'GET', table:'osionos_bridge_identities', keys:['user_id','select','limit'], fixed:{select:'is_admin',limit:'1'},
    run:(world,p)=> [{is_admin: (world.admin??true)}] },
  { logical:'membership', method:'GET', table:'osionos_workspace_members', keys:['workspace_id','user_id','select','limit'], fixed:{select:'role,permissions',limit:'1'},
    run:(world,p)=> (world.members||[]).filter(r=>r.workspace_id===eqOf(p.workspace_id)&&r.user_id===eqOf(p.user_id)).map(r=>({role:r.role??'member',permissions:r.permissions??[]})) },
  { logical:'list', method:'GET', table:'osionos_issue_reports', keys:null, fixed:{},
    matchKeys:true,
    run:(world,p)=> {
       // return world.issues filtered by reporter if present
       let rows = world.issues||[];
       const reporter = p.reporter_id ? eqOf(p.reporter_id) : null;
       if (reporter) rows = rows.filter(r=>r.reporter_id===reporter);
       if (p.status) { const st=eqOf(p.status); rows=rows.filter(r=>r.status===st);}
       return rows;
    }},
  { logical:'profiles', method:'GET', table:'osionos_profiles', keys:['user_id','select'], fixed:{select:'user_id,display_name'},
    run:(world,p)=> (world.profiles||[]).filter(r=> (p.user_id||'').includes(r.user_id)) },
  { logical:'rpc', method:'POST', table:'rpc/osionos_issue_report_create', keys:[], fixed:{},
    run:(world,p,body)=> {
       if (world.rpcCode) { return {code:world.rpcCode, hint: world.rpcHint, message:'cap'}; }
       const row = { id:'11111111-2222-4333-8444-555555555555', reporter_id: body.p_reporter, workspace_id: body.p_workspace, title: body.p_title, body: body.p_body, route_kind: body.p_route_kind, app_version: body.p_app_version, user_agent: body.p_user_agent, errors: body.p_errors, screenshot_path: body.p_screenshot_path, status:'open', created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-01T00:00:00Z' };
       world.issues = world.issues||[]; world.issues.push(row);
       return [row];
    }},
  { logical:'patch', method:'PATCH', table:'osionos_issue_reports', keys:['id'], fixed:{},
    run:(world,p,body)=> {
       const id=eqOf(p.id);
       const row=(world.issues||[]).find(r=>r.id===id);
       if(!row) return [];
       Object.assign(row,body); return [row];
    }},
];

function matches(shape, method, table, params) {
  if (shape.method!==method || shape.table!==table) return false;
  if (shape.keys===null) return true; // loose for list
  const names=[...params.keys()].sort((a, b) => a.localeCompare(b));
  const expected=[...shape.keys].sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(names)!==JSON.stringify(expected)) return false;
  return Object.entries(shape.fixed).every(([k,v])=> params.get(k)===v);
}

export function createStub(world={}, opts={}) {
  const store={ issues:[], profiles:[], members:[], ...world };
  if (opts.rpcCode) { store.rpcCode=opts.rpcCode; store.rpcHint=opts.rpcHint||'issue_report_daily_cap'; }
  const calls=[]; const violations=[];
  const fetchImpl=async (url,init={})=>{
    const parsed=new URL(url);
    const method=init.method||'GET';
    const table=parsed.pathname.replace('/rest/v1/','');
    const record={method,table,query:parsed.search,body:init.body?JSON.parse(init.body):undefined};
    calls.push(record);
    const shape=SHAPES.find(c=>matches(c,method,table,parsed.searchParams));
    if(!shape){ const m=`undeclared ${method} ${table}${parsed.search}`; violations.push(m); throw new Error(m);}
    const params=Object.fromEntries(parsed.searchParams);
    const result=shape.run(store,params,record.body);
    // if RPC cap, return 400
    if (shape.logical==='rpc' && store.rpcCode) {
      return reply({code:store.rpcCode,hint:store.rpcHint,message:'cap'},400);
    }
    if (shape.logical==='patch' && (!result || result.length===0)) {
      return reply([],200);
    }
    return reply(result);
  };
  return {fetchImpl,calls,violations,world:store};
}

export async function call(handlerFactory, stub, opts={}) {
  const handler=handlerFactory({config:CONFIG, verifySession:()=>({userId: opts.userId||uid(1), isAdmin: opts.isAdmin||false}), fetchImpl:stub.fetchImpl, env:{}});
  const request={method:opts.method||'GET', headers: opts.token?{authorization:opts.token}:{}, [Symbol.asyncIterator]: async function*(){ if (opts.body!==undefined) yield JSON.stringify(opts.body); } };
  const captured={};
  const response={writeHead:(s,h)=>{captured.status=s;captured.headers=h||{};}, end:(t)=>{captured.text=t||''; try{captured.body=JSON.parse(captured.text);}catch{captured.body=null;}}};
  const url=new URL(`http://bridge.test${opts.path||'/api/issues'}${opts.query||''}`);
  const handled=await handler(url,request,response);
  captured.handled=handled;
  return captured;
}

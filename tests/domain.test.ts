import {before,beforeEach,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {command,slots,getState,enrichTokens,orderedQueue,publicDisplay} from '../src/lib/domain';
import {hashPassword,verifyPassword,sessionUser,createSession} from '../src/lib/auth';
import {runJobs} from '../src/lib/jobs';
import type {DB} from '../src/lib/db';
import type {User,Department,Token,Counter,Service} from '../src/lib/types';
let pg:PGlite;let db:DB;let dept:string,service:string,otherService:string,counter:string,counter2:string;
let customer:User,other:User,staff:User,staff2:User,admin:User,outsider:User;
const now=new Date('2030-01-07T04:00:00.000Z'); // 09:00 Asia/Karachi
const start='2030-01-07T05:00:00.000Z';
const commandAt=(u:User,a:string,p:unknown,when=now,key=randomUUID())=>command(u,a,p,key,when);
before(async()=>{pg=new PGlite();await pg.exec(await readFile('database/001_initial.sql','utf8'));await pg.exec(await readFile('database/002_service_snapshots.sql','utf8'));
  const adapter=(p:Pick<PGlite,'query'>):DB=>({query:async<T>(sql:string,values?:unknown[])=>{const result=await p.query(sql,values);return {rows:result.rows as T[]};}});
  db=adapter(pg);globalThis.queueTestDB=Object.assign(db,{transaction:<R>(fn:(db:DB)=>Promise<R>)=>pg.transaction(tx=>fn(adapter(tx as Pick<PGlite,'query'>)))});
});
beforeEach(async()=>{await pg.exec('TRUNCATE departments,users,services,counters,appointments,tokens,events,notifications,requests,closures,token_sequences,sessions,auth_attempts,password_resets CASCADE');
  dept=randomUUID();const otherDept=randomUUID();service=randomUUID();otherService=randomUUID();counter=randomUUID();counter2=randomUUID();
  await db.query("INSERT INTO departments(id,name,capacity,workdays) VALUES($1,'Student Affairs',1,'{1,2,3,4,5,6,7}'),($2,'Other office',1,'{1,2,3,4,5,6,7}')",[dept,otherDept]);
  async function user(name:string,role:User['role'],department_id:string|null):Promise<User>{const id=randomUUID();await db.query('INSERT INTO users(id,name,email,password_hash,role,department_id) VALUES($1,$2,$3,$4,$5,$6)',[id,name,`${id}@test.local`,hashPassword('TestPassword123!'),role,department_id]);return {id,name,email:`${id}@test.local`,phone:'',role,department_id,active:true};}
  customer=await user('Customer','CUSTOMER',null);other=await user('Other Customer','CUSTOMER',null);staff=await user('Staff','STAFF',dept);staff2=await user('Second Staff','STAFF',dept);admin=await user('Admin','ADMIN',null);outsider=await user('Outside manager','MANAGER',otherDept);
  await db.query("INSERT INTO services(id,department_id,name,duration,prefix) VALUES($1,$3,'Verification',10,'DV'),($2,$3,'Registration',20,'NR')",[service,otherService,dept]);
  await db.query("INSERT INTO counters(id,department_id,name,staff_id,service_ids) VALUES($1,$3,'Counter 1',$4,$6),($2,$3,'Counter 2',$5,$6)",[counter,counter2,dept,staff.id,staff2.id,[service,otherService]]);
});
after(async()=>{globalThis.queueTestDB=undefined;await pg.close();});
test('capacity remains safe when two customers compete for the final place',async()=>{
  const results=await Promise.allSettled([commandAt(customer,'book',{serviceId:service,start}),commandAt(other,'book',{serviceId:service,start})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.query('SELECT * FROM appointments')).rows.length,1);
});
test('shared department capacity protects overlapping services of different lengths',async()=>{
  await commandAt(customer,'book',{serviceId:otherService,start});await assert.rejects(()=>commandAt(other,'book',{serviceId:service,start:'2030-01-07T05:10:00.000Z'}),/full or unavailable/);
});
test('failed reschedule rolls back the original reservation',async()=>{
  const a=await commandAt(customer,'book',{serviceId:service,start}) as {id:string};await commandAt(other,'book',{serviceId:service,start:'2030-01-07T06:00:00.000Z'});
  await assert.rejects(()=>commandAt(customer,'reschedule',{appointmentId:a.id,start:'2030-01-07T06:00:00.000Z'}));const row=(await db.query<{status:string}>('SELECT status FROM appointments WHERE id=$1',[a.id])).rows[0];assert.equal(row.status,'CONFIRMED');
});
test('idempotent booking and duplicate check-in create one appointment and token',async()=>{
  const key=randomUUID();const a=await commandAt(customer,'book',{serviceId:service,start},now,key) as {id:string};const repeat=await commandAt(customer,'book',{serviceId:service,start},now,key);assert.deepEqual(repeat,a);
  const checkin=new Date('2030-01-07T04:55:00.000Z');await commandAt(customer,'checkin',{appointmentId:a.id},checkin);await commandAt(customer,'checkin',{appointmentId:a.id},checkin);assert.equal((await db.query('SELECT * FROM tokens')).rows.length,1);
});
test('appointment is not callable before its scheduled eligibility time',async()=>{
  const a=await commandAt(customer,'book',{serviceId:service,start}) as {id:string};await commandAt(customer,'checkin',{appointmentId:a.id},new Date('2030-01-07T04:55:00.000Z'));await assert.rejects(()=>commandAt(staff,'call',{counterId:counter},new Date('2030-01-07T04:56:00.000Z')),/No eligible/);
});
test('parallel call-next cannot assign the same visitor twice',async()=>{
  await commandAt(customer,'join',{serviceId:service});const results=await Promise.allSettled([commandAt(staff,'call',{counterId:counter}),commandAt(staff2,'call',{counterId:counter2})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.query("SELECT * FROM tokens WHERE status='CALLED'")).rows.length,1);
});
test('full appointment journey completes linked record, counter, notification and audit',async()=>{
  const a=await commandAt(customer,'book',{serviceId:service,start}) as {id:string};const checkin=new Date(start);const t=await commandAt(customer,'checkin',{appointmentId:a.id},checkin) as {id:string};await commandAt(staff,'call',{counterId:counter},checkin);await commandAt(staff,'start',{tokenId:t.id},new Date('2030-01-07T05:02:00Z'));await commandAt(staff,'complete',{tokenId:t.id},new Date('2030-01-07T05:12:00Z'));
  assert.equal((await db.query<{status:string}>('SELECT status FROM appointments WHERE id=$1',[a.id])).rows[0].status,'COMPLETED');assert.equal((await db.query<{status:string}>('SELECT status FROM counters WHERE id=$1',[counter])).rows[0].status,'AVAILABLE');assert.ok((await db.query('SELECT * FROM events')).rows.length>=4);assert.ok((await db.query('SELECT * FROM notifications')).rows.length>=3);
});
test('duplicate active tokens and invalid service transitions are rejected',async()=>{
  const t=await commandAt(customer,'join',{serviceId:service}) as {id:string};await assert.rejects(()=>commandAt(customer,'join',{serviceId:service}),/maximum number/);await assert.rejects(()=>commandAt(staff,'complete',{tokenId:t.id}),/Start service/);
});
test('skip, recall and no-show response windows preserve a coherent queue',async()=>{
  const t=await commandAt(customer,'join',{serviceId:service}) as {id:string};await commandAt(staff,'call',{counterId:counter});await assert.rejects(()=>commandAt(staff,'miss',{tokenId:t.id}),/response window/);await commandAt(staff,'skip',{tokenId:t.id});await commandAt(staff,'recall',{tokenId:t.id});assert.equal((await db.query<{status:string}>('SELECT status FROM tokens WHERE id=$1',[t.id])).rows[0].status,'WAITING');await commandAt(staff,'call',{counterId:counter});await commandAt(staff,'miss',{tokenId:t.id},new Date(now.getTime()+4*60000));assert.equal((await db.query<{status:string}>('SELECT status FROM tokens WHERE id=$1',[t.id])).rows[0].status,'MISSED');
});
test('customer ownership and departmental staff permissions are enforced',async()=>{
  const a=await commandAt(customer,'book',{serviceId:service,start}) as {id:string};await assert.rejects(()=>commandAt(other,'cancel',{appointmentId:a.id}),/not your appointment/);await assert.rejects(()=>commandAt(outsider,'counterStatus',{counterId:counter,status:'CLOSED'}),/access to this department/);await assert.rejects(()=>commandAt(customer,'call',{counterId:counter}),/Staff access/);
});
test('paused counters change estimates and no capacity returns null',async()=>{
  await commandAt(customer,'join',{serviceId:service});await commandAt(other,'join',{serviceId:service});const tokens=(await db.query<Token>('SELECT * FROM tokens ORDER BY created_at,id')).rows;const departments=(await db.query<Department>('SELECT * FROM departments')).rows;const services=(await db.query<Service>('SELECT * FROM services')).rows;let counters=(await db.query<Counter>('SELECT * FROM counters')).rows;
  const estimate=enrichTokens(tokens,departments,services,counters,'Asia/Karachi',now);assert.equal(estimate[1].estimated_wait,5);await commandAt(staff2,'counterStatus',{counterId:counter2,status:'BREAK'});counters=(await db.query<Counter>('SELECT * FROM counters')).rows;assert.equal(enrichTokens(tokens,departments,services,counters,'Asia/Karachi',now)[1].estimated_wait,10);await commandAt(staff,'counterStatus',{counterId:counter,status:'CLOSED'});counters=(await db.query<Counter>('SELECT * FROM counters')).rows;assert.equal(enrichTokens(tokens,departments,services,counters,'Asia/Karachi',now)[1].estimated_wait,null);
});
test('walk-in fairness eventually precedes appointment priority',async()=>{
  const d=(await db.query<Department>('SELECT * FROM departments WHERE id=$1',[dept])).rows[0];const base={status:'WAITING',eligible_at:now.toISOString(),created_at:now.toISOString()} as Token;
  const walk={...base,id:randomUUID(),appointment_id:null,created_at:new Date(now.getTime()-31*60000).toISOString()};const appointment={...base,id:randomUUID(),appointment_id:randomUUID()};assert.equal(orderedQueue([appointment,walk],d,now)[0].id,walk.id);
});
test('scheduled jobs expire unchecked-in bookings and send reminder once',async()=>{
  const a=await commandAt(customer,'book',{serviceId:service,start}) as {id:string};await runJobs(new Date('2030-01-07T04:30:00Z'));await runJobs(new Date('2030-01-07T04:31:00Z'));assert.equal((await db.query("SELECT * FROM notifications WHERE title='Appointment reminder'")).rows.length,1);await runJobs(new Date('2030-01-07T05:11:00Z'));assert.equal((await db.query<{status:string}>('SELECT status FROM appointments WHERE id=$1',[a.id])).rows[0].status,'MISSED');
});
test('breaks, closures, and booking horizon remove invalid slots',async()=>{
  const available=await slots(service,'2030-01-07',db,now);assert.ok(available.length>0);assert.ok(!available.some(s=>s.start==='2030-01-07T08:00:00.000Z'));assert.equal((await slots(service,'2031-01-07',db,now)).length,0);await commandAt(admin,'closure',{department_id:dept,day:'2030-01-07',reason:'Holiday'});assert.equal((await slots(service,'2030-01-07',db,now)).length,0);
});
test('state and public display never expose another customer’s private details',async()=>{
  await commandAt(customer,'join',{serviceId:service});await commandAt(other,'join',{serviceId:service});const state=await getState(customer,'2030-01-07');assert.ok(state.tokens.every(t=>t.user_id===customer.id));assert.equal(state.users.length,0);assert.equal(state.events.length,0);assert.ok(state.counters.every(c=>c.staff_id===null));const publicData=JSON.stringify(await publicDisplay());assert.ok(!publicData.includes(customer.email));assert.ok(!publicData.includes('user_id'));
});
test('password hashing and opaque sessions reject wrong credentials and inactive users',async()=>{
  const hash=hashPassword('LongTestPassword123!');assert.ok(verifyPassword('LongTestPassword123!',hash));assert.ok(!verifyPassword('wrong',hash));const token=await createSession(db,customer.id);assert.equal((await sessionUser(token,db))?.id,customer.id);assert.equal(await sessionUser('bad',db),null);await db.query('UPDATE users SET active=false WHERE id=$1',[customer.id]);assert.equal(await sessionUser(token,db),null);
});

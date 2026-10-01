import {config} from 'dotenv';config({path:'.env.local',quiet:true});config({quiet:true});
import {Pool,type QueryResultRow} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {DateTime} from 'luxon';
import assert from 'node:assert/strict';
import {command} from '../src/lib/domain';
import {hashPassword} from '../src/lib/auth';
import type {DB} from '../src/lib/db';
import type {User} from '../src/lib/types';

// Hosted verification uses a brand-new schema, never application tables.
const schema=`queueflow_verify_${randomUUID().replaceAll('-','')}`;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});
let created=false;
async function isolated<R>(fn:(db:DB)=>Promise<R>,lock=false):Promise<R>{const client=await pool.connect();try{await client.query('BEGIN');await client.query(`SET LOCAL search_path TO ${schema}`);if(lock)await client.query('SELECT id FROM settings WHERE id=1 FOR UPDATE');const value=await fn(client);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
const db:DB={query:<T extends QueryResultRow>(sql:string,values?:unknown[])=>isolated(async client=>{const result=await client.query<T>(sql,values);return {rows:result.rows??[]};})};
async function verify(){assert.ok(process.env.DATABASE_URL,'DATABASE_URL is required.');await pool.query(`CREATE SCHEMA ${schema}`);created=true;globalThis.queueTestDB=Object.assign(db,{transaction:<R>(fn:(db:DB)=>Promise<R>)=>isolated(fn,true)});
  await isolated(async client=>{await client.query(await readFile('database/001_initial.sql','utf8'));await client.query(await readFile('database/002_service_snapshots.sql','utf8'));});
  const dept=randomUUID(),service=randomUUID(),counter=randomUUID(),counter2=randomUUID();const now=DateTime.now().setZone('Asia/Karachi').startOf('day').plus({hours:9}).toJSDate();const starts=DateTime.fromJSDate(now).plus({days:1,hours:1}).toUTC().toISO()!;
  await db.query("INSERT INTO departments(id,name,capacity,workdays) VALUES($1,'Isolated verification',1,'{1,2,3,4,5,6,7}')",[dept]);
  async function account(role:User['role']):Promise<User>{const user:User={id:randomUUID(),name:`Verification ${role}`,email:`${randomUUID()}@test.local`,phone:'',role,department_id:role==='STAFF'?dept:null,active:true};await db.query('INSERT INTO users(id,name,email,password_hash,role,department_id) VALUES($1,$2,$3,$4,$5,$6)',[user.id,user.name,user.email,hashPassword(randomUUID()),role,user.department_id]);return user;}
  const a=await account('CUSTOMER'),b=await account('CUSTOMER'),c=await account('CUSTOMER'),staff=await account('STAFF'),staff2=await account('STAFF');
  await db.query("INSERT INTO services(id,department_id,name,duration,prefix) VALUES($1,$2,'Verification',10,'VT')",[service,dept]);await db.query("INSERT INTO counters(id,department_id,name,staff_id,service_ids) VALUES($1,$3,'Test counter 1',$4,$6),($2,$3,'Test counter 2',$5,$6)",[counter,counter2,dept,staff.id,staff2.id,[service]]);
  const run=(u:User,action:string,input:unknown)=>command(u,action,input,randomUUID(),now);
  const bookings=await Promise.allSettled([run(a,'book',{serviceId:service,start:starts}),run(b,'book',{serviceId:service,start:starts})]);assert.equal(bookings.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.query('SELECT * FROM appointments')).rows.length,1);console.log('PASS hosted PostgreSQL: last-place booking is exclusive across pooled connections.');
  const winner=bookings[0].status==='fulfilled'?a:b;const first=(await db.query<{id:string}>('SELECT id FROM appointments')).rows[0];const later=DateTime.fromISO(starts).plus({hours:1}).toISO()!;await run(c,'book',{serviceId:service,start:later});await assert.rejects(()=>run(winner,'reschedule',{appointmentId:first.id,start:later}));assert.equal((await db.query<{status:string}>('SELECT status FROM appointments WHERE id=$1',[first.id])).rows[0].status,'CONFIRMED');console.log('PASS hosted PostgreSQL: failed reschedule preserves original booking.');
  const token=await run(a,'join',{serviceId:service}) as {id:string};const calls=await Promise.allSettled([run(staff,'call',{counterId:counter}),run(staff2,'call',{counterId:counter2})]);assert.equal(calls.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.query("SELECT * FROM tokens WHERE status='CALLED'")).rows.length,1);console.log('PASS hosted PostgreSQL: one visitor cannot be claimed by competing counters.');
  const caller=calls[0].status==='fulfilled'?staff:staff2;await run(caller,'start',{tokenId:token.id});await run(caller,'complete',{tokenId:token.id});assert.equal((await db.query<{status:string}>('SELECT status FROM tokens WHERE id=$1',[token.id])).rows[0].status,'COMPLETED');console.log('PASS hosted PostgreSQL: complete service lifecycle persists correctly.');
}
verify().catch(()=>{console.error('Hosted verification failed. Check connection/schema permissions; credentials are not logged.');process.exitCode=1;}).finally(async()=>{globalThis.queueTestDB=undefined;if(created&&/^queueflow_verify_[a-f0-9]{32}$/.test(schema)){await pool.query(`DROP SCHEMA ${schema} CASCADE`);console.log('Removed only the isolated verification schema; application data was preserved.');}await pool.end();});

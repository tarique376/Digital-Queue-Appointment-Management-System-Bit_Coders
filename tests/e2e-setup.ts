import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/lib/auth';
import path from 'node:path';
export default async function globalSetup(){
  const dir=path.resolve('.test-db/browser');await mkdir(dir,{recursive:true});const db=new PGlite(dir);
  const exists=(await db.query("SELECT tablename FROM pg_tables WHERE tablename='settings'")).rows.length;
  if(!exists){await db.exec(await readFile('database/001_initial.sql','utf8'));await db.exec(await readFile('database/002_service_snapshots.sql','utf8'));}
  await db.exec('TRUNCATE departments,users,services,counters,appointments,tokens,events,notifications,requests,closures,token_sequences,sessions,auth_attempts,password_resets CASCADE');
  const d=randomUUID(),d2=randomUUID(),s=randomUUID(),staff=randomUUID(),staff2=randomUUID();
  await db.query("INSERT INTO departments(id,name,opens,closes,break_start,break_end,workdays,capacity) VALUES($1,'Student Affairs','00:00','23:59','23:57','23:58','{1,2,3,4,5,6,7}',2),($2,'Examination Office','00:00','23:59','23:57','23:58','{1,2,3,4,5,6,7}',2)",[d,d2]);
  for(const [id,name,email,role,dept] of [[randomUUID(),'Demo Customer','customer@queueflow.local','CUSTOMER',null],[randomUUID(),'Alex Morgan','admin@queueflow.local','ADMIN',null],[randomUUID(),'Sam Taylor','manager@queueflow.local','MANAGER',d],[staff,'Riley Chen','staff@queueflow.local','STAFF',d],[staff2,'Jordan Lee','staff2@queueflow.local','STAFF',d]]){await db.query('INSERT INTO users(id,name,email,password_hash,role,department_id) VALUES($1,$2,$3,$4,$5,$6)',[id,name,email,hashPassword('BrowserTestPassword123!'),role,dept]);}
  await db.query("INSERT INTO services(id,department_id,name,duration,prefix) VALUES($1,$2,'Document verification',10,'DV'),($3,$2,'Document collection',5,'DC'),($4,$5,'Examination queries',15,'EX')",[s,d,randomUUID(),randomUUID(),d2]);
  const ids=(await db.query<{id:string}>('SELECT id FROM services WHERE department_id=$1',[d])).rows.map(s=>s.id);
  await db.query("INSERT INTO counters(id,department_id,name,staff_id,service_ids,shift_start,shift_end) VALUES($1,$2,'Counter 01',$3,$4,'00:00','23:59'),($5,$2,'Counter 02',$6,$4,'00:00','23:59')",[randomUUID(),d,staff,ids,randomUUID(),staff2]);
  await db.close();
}

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const userA = "00000000-0000-4000-8000-000000000001",
  userB = "00000000-0000-4000-8000-000000000002";
const taskA = "10000000-0000-4000-8000-000000000001",
  projectB = "20000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610260001_initial.sql", "utf8"),
  );
  await db.exec(
    `insert into auth.users values ('${userA}'),('${userB}');insert into public.profiles(user_id) values ('${userA}'),('${userB}');insert into projects(id,user_id,name) values ('${projectB}','${userB}','private');insert into tasks(id,user_id,title) values ('${taskA}','${userA}','private A');`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
async function asUser<T>(id: string, query: () => Promise<T>) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
  try {
    return await query();
  } finally {
    await db.exec("reset role");
  }
}
describe("actual PostgreSQL migration and RLS", () => {
  it("users see only their tasks", async () => {
    expect(
      (await asUser(userA, () => db.query("select * from tasks"))).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(userB, () => db.query("select * from tasks"))).rows,
    ).toHaveLength(0);
  });
  it("forbids forged ownership", async () => {
    await expect(
      asUser(userB, () =>
        db.exec(
          `insert into tasks(user_id,title) values ('${userA}','forged')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("forbids associating another user project", async () => {
    await expect(
      asUser(userA, () =>
        db.exec(
          `update tasks set project_id='${projectB}' where id='${taskA}'`,
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it("prevents clients from manipulating reminder jobs and subscriptions", async () => {
    await expect(
      asUser(userA, () =>
        db.exec(
          `insert into reminder_jobs(task_id,user_id,scheduled_at) values('${taskA}','${userA}',now())`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(userA, () => db.query("select * from claim_reminder_jobs(10)")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(userA, () =>
        db.exec(
          `insert into push_subscriptions(endpoint,user_id,keys) values ('https://evil.test','${userA}','{}')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("claims enabled future-since-opt-in jobs once, skips completed tasks and disabled profiles", async () => {
    await db.exec(
      `update profiles set reminders_enabled=true where user_id='${userA}';update tasks set reminder_at=now()+interval '1 second' where id='${taskA}';insert into reminder_jobs(task_id,user_id,scheduled_at) select id,user_id,reminder_at from tasks where id='${taskA}';update reminder_jobs set scheduled_at=now()-interval '1 second';update tasks set reminder_at=(select scheduled_at from reminder_jobs where task_id=tasks.id);`,
    );
    // Before enabled_at: no retrospective notification.
    expect(
      (await db.query("select * from claim_reminder_jobs(10)")).rows,
    ).toHaveLength(0);
    await db.exec(
      `update profiles set reminders_enabled=false where user_id='${userA}';update reminder_jobs set scheduled_at=now();update tasks set reminder_at=(select scheduled_at from reminder_jobs where task_id=tasks.id);`,
    );
    expect(
      (await db.query("select * from claim_reminder_jobs(10)")).rows,
    ).toHaveLength(0);
    await db.exec(
      `update profiles set reminders_enabled=true where user_id='${userA}';update reminder_jobs set scheduled_at=now();update tasks set reminder_at=(select scheduled_at from reminder_jobs where task_id=tasks.id),status='done';`,
    );
    expect(
      (await db.query("select * from claim_reminder_jobs(10)")).rows,
    ).toHaveLength(0);
    await db.exec(`update tasks set status='todo' where id='${taskA}';`);
    expect(
      (await db.query("select * from claim_reminder_jobs(10)")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from claim_reminder_jobs(10)")).rows,
    ).toHaveLength(0);
  });
});

import { timingSafeEqual } from "node:crypto";
import {
  adminClient,
  reminderAvailability,
  sendPush,
  unavailable,
} from "@/lib/services/reminder-server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!reminderAvailability()) return unavailable();
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return Response.json({ error: "אין הרשאה" }, { status: 401 });
  try {
    const db = adminClient();
    const { data: jobs, error } = await db.rpc("claim_reminder_jobs", {
      batch_size: 10,
    });
    if (error) throw error;
    let sent = 0,
      failed = 0,
      skipped = 0;
    for (const job of jobs ?? []) {
      // Recheck flags immediately before dispatch; a previously claimed job cannot bypass a user opt-out.
      if (!reminderAvailability()) break;
      const [profile, task, subscriptions] = await Promise.all([
        db
          .from("profiles")
          .select("reminders_enabled,reminders_enabled_at")
          .eq("user_id", job.user_id)
          .single(),
        db
          .from("tasks")
          .select("title,status,reminder_at")
          .eq("id", job.task_id)
          .single(),
        db
          .from("push_subscriptions")
          .select("endpoint,keys")
          .eq("user_id", job.user_id),
      ]);
      if (profile.error || task.error || subscriptions.error)
        throw new Error("Unable to load reminder dependencies");
      if (
        !profile.data?.reminders_enabled ||
        task.data?.status === "done" ||
        !task.data?.reminder_at ||
        new Date(task.data.reminder_at).getTime() !==
          new Date(job.scheduled_at).getTime() ||
        new Date(job.scheduled_at) < new Date(profile.data.reminders_enabled_at)
      ) {
        await db
          .from("reminder_jobs")
          .update({ state: "skipped" })
          .eq("id", job.id);
        skipped++;
        continue;
      }
      const outcomes = await Promise.allSettled(
        (subscriptions.data ?? []).map(async (subscription) => {
          try {
            await sendPush(subscription, {
              title: "מסלול · הגיע הזמן",
              body: task.data.title,
              taskId: job.task_id,
              tag: `task-${job.task_id}-${job.scheduled_at}`,
            });
          } catch (e) {
            if ((e as { statusCode?: number }).statusCode === 410)
              await db
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", subscription.endpoint);
            throw e;
          }
        }),
      );
      const delivered = outcomes.some((o) => o.status === "fulfilled");
      await db
        .from("reminder_jobs")
        .update({
          state: delivered ? "sent" : "failed",
          last_error: delivered
            ? null
            : "Push delivery failed or no subscriptions",
        })
        .eq("id", job.id);
      if (delivered) sent++;
      else failed++;
    }
    return Response.json({ sent, failed, skipped });
  } catch {
    return Response.json({ error: "הפעלת התזכורות נכשלה" }, { status: 503 });
  }
}

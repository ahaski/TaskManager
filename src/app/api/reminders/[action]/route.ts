import { z } from "zod";
import {
  authenticate,
  reminderAvailability,
  unavailable,
  validPushEndpoint,
  sendPush,
} from "@/lib/services/reminder-server";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  if (!reminderAvailability()) return unavailable();
  try {
    const identity = await authenticate(request);
    if (!identity)
      return Response.json({ error: "נדרשת התחברות" }, { status: 401 });
    const { db, user } = identity;
    const { action } = await context.params;
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("reminders_enabled,reminders_enabled_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.reminders_enabled)
      return Response.json(
        { error: "התזכורות כבויות בחשבון" },
        { status: 409 },
      );
    if (action === "subscribe") {
      const subscription = z
        .object({
          endpoint: z.url().max(2048),
          keys: z.object({
            p256dh: z.string().min(20).max(256),
            auth: z.string().min(10).max(256),
          }),
        })
        .parse(await request.json());
      if (!validPushEndpoint(subscription.endpoint))
        return Response.json({ error: "ספק Push אינו נתמך" }, { status: 400 });
      const { adminClient } = await import("@/lib/services/reminder-server");
      const { error } = await adminClient()
        .from("push_subscriptions")
        .upsert(
          { ...subscription, user_id: user.id },
          { onConflict: "endpoint" },
        );
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (action === "schedule") {
      const { task_id } = z
        .object({ task_id: z.uuid() })
        .parse(await request.json());
      const { data: task, error } = await db
        .from("tasks")
        .select("id,reminder_at,status")
        .eq("id", task_id)
        .eq("user_id", user.id)
        .single();
      if (error)
        return Response.json({ error: "המשימה אינה זמינה" }, { status: 404 });
      if (
        !task.reminder_at ||
        new Date(task.reminder_at) <= new Date() ||
        task.status === "done"
      )
        return Response.json(
          { error: "יש לבחור תזכורת עתידית למשימה פתוחה" },
          { status: 400 },
        );
      // Service-role queue mutations are restricted to this authenticated, ownership-checked path.
      const { adminClient } = await import("@/lib/services/reminder-server");
      const { error: queueError } = await adminClient()
        .from("reminder_jobs")
        .upsert(
          {
            task_id: task.id,
            user_id: user.id,
            scheduled_at: task.reminder_at,
            state: "queued",
            attempted_at: null,
            last_error: null,
          },
          { onConflict: "task_id" },
        );
      if (queueError) throw queueError;
      return Response.json({ ok: true });
    }
    if (action === "test") {
      const { data, error } = await db
        .from("push_subscriptions")
        .select("endpoint,keys")
        .eq("user_id", user.id);
      if (error) throw error;
      if (!data?.length)
        return Response.json(
          { error: "לא נרשם מכשיר להתראות" },
          { status: 409 },
        );
      const results = await Promise.allSettled(
        data.map((subscription) =>
          sendPush(subscription, {
            title: "מסלול · התראת ניסיון",
            body: "הכול מוכן לצעד הבא שלך.",
            tag: "maslul-test",
          }),
        ),
      );
      if (results.every((r) => r.status === "rejected"))
        return Response.json(
          { error: "שליחת ההתראה נכשלה. בדוק הרשאות וחיבור Push." },
          { status: 502 },
        );
      return Response.json({ ok: true });
    }
    return Response.json({ error: "הפעולה אינה קיימת" }, { status: 404 });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "בקשה לא תקינה"
            : "שירות התזכורות אינו זמין כרגע",
      },
      { status: e instanceof z.ZodError ? 400 : 503 },
    );
  }
}

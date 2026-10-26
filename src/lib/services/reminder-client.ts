import { getSupabase } from "../data/repository";
import type { Task } from "../models";
export async function reminderRequest(path: string, body?: unknown) {
  const { data } = await getSupabase().auth.getSession();
  const response = await fetch(`/api/reminders/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "שירות התזכורות אינו זמין");
  return result;
}
export class ReminderService {
  async schedule(task: Task) {
    await reminderRequest("schedule", { task_id: task.id });
  }
}
export async function enablePush(
  publicKey: string,
  activate: () => Promise<void>,
) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error("הדפדפן אינו תומך בהתראות Push");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("לא ניתנה הרשאה להתראות");
  await activate();
  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
  const bytes = Uint8Array.from(
    atob((publicKey + padding).replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await reminderRequest("subscribe", subscription.toJSON());
}

import { reminderAvailability } from "@/lib/services/reminder-server";
export const dynamic = "force-dynamic";
export function GET() {
  const available = reminderAvailability();
  return Response.json({
    available,
    publicKey: available ? process.env.VAPID_PUBLIC_KEY : "",
  });
}

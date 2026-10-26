import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  sendPush: vi.fn(),
  adminClient: vi.fn(),
}));
vi.mock("../src/lib/services/reminder-server", () => ({
  reminderAvailability: () => true,
  authenticate: mocks.authenticate,
  sendPush: mocks.sendPush,
  adminClient: mocks.adminClient,
  validPushEndpoint: (url: string) =>
    url.startsWith("https://fcm.googleapis.com/"),
}));
import { POST } from "../src/app/api/reminders/[action]/route";
function request(action: string, body: object = {}) {
  return POST(
    new Request("http://localhost/api/reminders/" + action, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ action }) },
  );
}
function db(profileEnabled: boolean, taskFound = true) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { reminders_enabled: profileEnabled },
            error: null,
          }),
          eq: () => ({
            single: async () => ({
              data: null,
              error: taskFound ? null : new Error("Not found"),
            }),
          }),
        }),
      }),
    }),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe("authenticated reminder API permissions", () => {
  it("requires a verified user", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect((await request("subscribe")).status).toBe(401);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
  it("blocks every action when user opted out even if system is on", async () => {
    mocks.authenticate.mockResolvedValue({
      user: { id: "owner" },
      db: db(false),
    });
    for (const action of ["subscribe", "schedule", "test"])
      expect((await request(action)).status).toBe(409);
    expect(mocks.sendPush).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it("rejects arbitrary subscription destinations", async () => {
    mocks.authenticate.mockResolvedValue({
      user: { id: "owner" },
      db: db(true),
    });
    expect(
      (
        await request("subscribe", {
          endpoint: "https://127.0.0.1/push",
          keys: { p256dh: "x".repeat(30), auth: "x".repeat(20) },
        })
      ).status,
    ).toBe(400);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it("cannot schedule a task inaccessible through RLS", async () => {
    mocks.authenticate.mockResolvedValue({
      user: { id: "owner" },
      db: db(true, false),
    });
    expect(
      (
        await request("schedule", {
          task_id: "00000000-0000-4000-8000-000000000001",
        })
      ).status,
    ).toBe(404);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
});

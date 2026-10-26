import { describe, it, expect, vi } from "vitest";
import { TaskService, ProjectService } from "../src/lib/services/tasks";
import { defaultSettings, type Task, type Snapshot } from "../src/lib/models";
import type { Repository } from "../src/lib/data/repository";
import { wallTimeToISO, toWallTime } from "../src/lib/utils";
import {
  reminderAvailability,
  validPushEndpoint,
} from "../src/lib/services/reminder-server";
import { POST } from "../src/app/api/reminders/[action]/route";
import { GET } from "../src/app/api/reminders/cron/route";
const owner = "00000000-0000-4000-8000-000000000001";
function memory() {
  const state: Snapshot = {
    tasks: [],
    projects: [],
    settings: defaultSettings,
  };
  const repo: Repository = {
    load: async () => state,
    saveTask: async (task) => {
      state.tasks = [task, ...state.tasks.filter((t) => t.id !== task.id)];
    },
    deleteTask: async (id) => {
      state.tasks = state.tasks.filter((t) => t.id !== id);
    },
    saveProject: async (project) => {
      state.projects = [project];
    },
    saveSettings: async (s) => {
      state.settings = s;
    },
  };
  return { state, repo };
}
describe("TaskService isolation and persistence", () => {
  it("creates with title only, edits, completes, and deletes", async () => {
    const { state, repo } = memory();
    const service = new TaskService(repo, owner);
    const { task } = await service.save({ title: "משימה ראשונה" });
    expect(task.status).toBe("todo");
    expect(task.reminder_at).toBeNull();
    const edited = await service.save(
      { ...task, title: "עודכנה", status: "done" },
      task,
    );
    expect(state.tasks).toHaveLength(1);
    expect(edited.task.title).toBe("עודכנה");
    expect(state.tasks[0].status).toBe("done");
    await service.remove(edited.task);
    expect(state.tasks).toEqual([]);
  });
  it("persists the task even if notifications throw", async () => {
    const { repo, state } = memory();
    const schedule = vi.fn().mockRejectedValue(new Error("Push outage"));
    const service = new TaskService(repo, owner, { schedule });
    const result = await service.save({
      title: "אסור לאבד אותי",
      reminder_at: new Date(Date.now() + 60000).toISOString(),
    });
    expect(state.tasks[0].title).toBe("אסור לאבד אותי");
    expect(result.warning).toContain("נשמרה");
    expect(schedule).toHaveBeenCalledOnce();
  });
  it("does not call notifications for a task without a reminder", async () => {
    const { repo } = memory();
    const schedule = vi.fn();
    await new TaskService(repo, owner, { schedule }).save({
      title: "ללא התראה",
    });
    expect(schedule).not.toHaveBeenCalled();
  });
  it("runs without any reminder service, including remembered reminder values", async () => {
    const { repo, state } = memory();
    await new TaskService(repo, owner).save({
      title: "כבוי",
      reminder_at: new Date().toISOString(),
    });
    expect(state.tasks).toHaveLength(1);
  });
  it("does not dispatch if persistence fails", async () => {
    const { repo } = memory();
    repo.saveTask = vi.fn().mockRejectedValue(new Error("DB offline"));
    const schedule = vi.fn();
    await expect(
      new TaskService(repo, owner, { schedule }).save({
        title: "בדיקה",
        reminder_at: new Date().toISOString(),
      }),
    ).rejects.toThrow("DB offline");
    expect(schedule).not.toHaveBeenCalled();
  });
  it("rejects empty titles and editing another owner", async () => {
    const { repo } = memory();
    const service = new TaskService(repo, owner);
    await expect(service.save({ title: "  " })).rejects.toThrow();
    await expect(
      service.save({ title: "x" }, { user_id: "other" } as Task),
    ).rejects.toThrow("הרשאה");
  });
  it("creates and archives projects", async () => {
    const { repo, state } = memory();
    const projects = new ProjectService(repo, owner);
    const p = await projects.save({ name: "הבית שלי" });
    await projects.save({ ...p, archived: true }, p);
    expect(state.projects[0].archived).toBe(true);
  });
});
describe("server feature gate", () => {
  it.each(["false", "", undefined])(
    "is unavailable with REMINDERS_ENABLED=%s",
    async (value) => {
      vi.stubEnv("REMINDERS_ENABLED", value);
      expect(reminderAvailability()).toBe(false);
      const request = new Request("http://localhost/api/reminders/subscribe", {
        method: "POST",
        body: "invalid",
      });
      for (const action of ["subscribe", "test", "schedule"]) {
        const response = await POST(request, {
          params: Promise.resolve({ action }),
        });
        expect(response.status).toBe(503);
      }
      expect(
        (await GET(new Request("http://localhost/api/reminders/cron"))).status,
      ).toBe(503);
      vi.unstubAllEnvs();
    },
  );
  it("requires configuration even when system flag is true", () => {
    vi.stubEnv("REMINDERS_ENABLED", "true");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(reminderAvailability()).toBe(false);
    vi.unstubAllEnvs();
  });
  it("rejects private or arbitrary push endpoints", () => {
    expect(validPushEndpoint("https://127.0.0.1/push")).toBe(false);
    expect(validPushEndpoint("https://fcm.googleapis.com.evil.test/push")).toBe(
      false,
    );
    expect(validPushEndpoint("https://fcm.googleapis.com/push")).toBe(true);
  });
});
describe("IANA time and daylight saving", () => {
  it("round trips a Jerusalem wall time", () => {
    const result = wallTimeToISO("2026-10-26T09:00", "Asia/Jerusalem");
    expect(result).toBe("2026-10-26T07:00:00.000Z");
    expect(toWallTime(result, "Asia/Jerusalem")).toBe("2026-10-26T09:00");
  });
  it("rejects nonexistent DST wall times", () => {
    expect(() => wallTimeToISO("2026-03-27T02:30", "Asia/Jerusalem")).toThrow(
      "שעון קיץ",
    );
  });
});

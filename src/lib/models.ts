import { z } from "zod";
export const statuses = ["todo", "progress", "waiting", "done"] as const;
export const priorities = ["low", "normal", "high", "urgent"] as const;
export type Status = (typeof statuses)[number];
export type Priority = (typeof priorities)[number];
export const statusLabels: Record<Status, string> = {
  todo: "לביצוע",
  progress: "בתהליך",
  waiting: "בהמתנה",
  done: "הושלם",
};
export const priorityLabels: Record<Priority, string> = {
  low: "נמוכה",
  normal: "רגילה",
  high: "גבוהה",
  urgent: "דחופה",
};
export const taskInput = z.object({
  title: z.string().trim().min(1, "יש להזין כותרת").max(200),
  description: z.string().max(10000).default(""),
  project_id: z.uuid().nullable().default(null),
  status: z.enum(statuses).default("todo"),
  priority: z.enum(priorities).default("normal"),
  due_at: z.iso.datetime().nullable().default(null),
  reminder_at: z.iso.datetime().nullable().default(null),
  subtasks: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(500),
        done: z.boolean(),
      }),
    )
    .max(100)
    .default([]),
  comments: z
    .array(
      z.object({
        id: z.uuid(),
        text: z.string().trim().min(1).max(3000),
        created_at: z.iso.datetime(),
      }),
    )
    .max(500)
    .default([]),
});
export type TaskInput = z.input<typeof taskInput>;
export type Task = z.output<typeof taskInput> & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};
export const projectInput = z.object({
  name: z.string().trim().min(1, "יש להזין שם לפרויקט").max(120),
  description: z.string().max(3000).default(""),
  color: z.enum(["indigo", "teal", "amber", "rose"]).default("indigo"),
  archived: z.boolean().default(false),
});
export type ProjectInput = z.input<typeof projectInput>;
export type Project = z.output<typeof projectInput> & {
  id: string;
  user_id: string;
  created_at: string;
};
export type Settings = {
  name: string;
  timezone: string;
  theme: "light" | "dark";
  reminders_enabled: boolean;
  reminders_enabled_at: string | null;
};
export const defaultSettings: Settings = {
  name: "",
  timezone: "Asia/Jerusalem",
  theme: "light",
  reminders_enabled: false,
  reminders_enabled_at: null,
};
export type Snapshot = {
  tasks: Task[];
  projects: Project[];
  settings: Settings;
};

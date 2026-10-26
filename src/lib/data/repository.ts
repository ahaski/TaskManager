import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  defaultSettings,
  type Snapshot,
  type Task,
  type Project,
  type Settings,
} from "../models";
export interface Repository {
  load(): Promise<Snapshot>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  saveProject(project: Project): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
}
const key = "maslul.local.v1";
export class LocalRepository implements Repository {
  private read(): Snapshot {
    const raw = localStorage.getItem(key);
    return raw
      ? JSON.parse(raw)
      : { tasks: [], projects: [], settings: { ...defaultSettings } };
  }
  private write(data: Snapshot) {
    localStorage.setItem(key, JSON.stringify(data));
  }
  async load() {
    return this.read();
  }
  async saveTask(task: Task) {
    const data = this.read();
    data.tasks = [task, ...data.tasks.filter((t) => t.id !== task.id)];
    this.write(data);
  }
  async deleteTask(id: string) {
    const data = this.read();
    data.tasks = data.tasks.filter((t) => t.id !== id);
    this.write(data);
  }
  async saveProject(project: Project) {
    const data = this.read();
    data.projects = [
      project,
      ...data.projects.filter((p) => p.id !== project.id),
    ];
    this.write(data);
  }
  async saveSettings(settings: Settings) {
    const data = this.read();
    data.settings = settings;
    this.write(data);
  }
}
export const cloudConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
let client: SupabaseClient | null = null;
export function getSupabase() {
  if (!cloudConfigured) throw new Error("חיבור Supabase לא הוגדר");
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
export class SupabaseRepository implements Repository {
  constructor(
    private db: SupabaseClient,
    private userId: string,
  ) {}
  async load(): Promise<Snapshot> {
    const [tasks, projects, profile] = await Promise.all([
      this.db
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false }),
      this.db
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false }),
      this.db
        .from("profiles")
        .select("*")
        .eq("user_id", this.userId)
        .maybeSingle(),
    ]);
    for (const r of [tasks, projects, profile]) if (r.error) throw r.error;
    return {
      tasks: tasks.data ?? [],
      projects: projects.data ?? [],
      settings: { ...defaultSettings, ...(profile.data ?? {}) },
    };
  }
  async saveTask(task: Task) {
    const { error } = await this.db.from("tasks").upsert(task);
    if (error) throw error;
  }
  async deleteTask(id: string) {
    const { error } = await this.db.from("tasks").delete().eq("id", id);
    if (error) throw error;
  }
  async saveProject(project: Project) {
    const { error } = await this.db.from("projects").upsert(project);
    if (error) throw error;
  }
  async saveSettings(s: Settings) {
    const { name, timezone, theme, reminders_enabled, reminders_enabled_at } =
      s;
    const { error } = await this.db
      .from("profiles")
      .upsert({
        user_id: this.userId,
        name,
        timezone,
        theme,
        reminders_enabled,
        reminders_enabled_at,
      });
    if (error) throw error;
  }
}

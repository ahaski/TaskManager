import {
  taskInput,
  projectInput,
  type Task,
  type TaskInput,
  type Project,
  type ProjectInput,
} from "../models";
import type { Repository } from "../data/repository";
export interface ReminderPort {
  schedule(task: Task): Promise<void>;
}
// Core persistence succeeds before any optional side effect. AI adapters can reuse this service later.
export class TaskService {
  constructor(
    private repository: Repository,
    private userId: string,
    private reminders?: ReminderPort,
  ) {}
  async save(input: TaskInput, existing?: Task) {
    if (existing && existing.user_id !== this.userId)
      throw new Error("אין הרשאה");
    const task: Task = {
      ...taskInput.parse(input),
      id: existing?.id ?? crypto.randomUUID(),
      user_id: this.userId,
      created_at: existing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await this.repository.saveTask(task);
    let warning: string | undefined;
    if (task.reminder_at && this.reminders) {
      try {
        await this.reminders.schedule(task);
      } catch {
        warning = "המשימה נשמרה, אך התזכורת לא הופעלה. ניתן לנסות שוב בהמשך.";
      }
    }
    return { task, warning };
  }
  async remove(task: Task) {
    if (task.user_id !== this.userId) throw new Error("אין הרשאה");
    await this.repository.deleteTask(task.id);
  }
}
export class ProjectService {
  constructor(
    private repository: Repository,
    private userId: string,
  ) {}
  async save(input: ProjectInput, existing?: Project) {
    if (existing && existing.user_id !== this.userId)
      throw new Error("אין הרשאה");
    const project: Project = {
      ...projectInput.parse(input),
      id: existing?.id ?? crypto.randomUUID(),
      user_id: this.userId,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    await this.repository.saveProject(project);
    return project;
  }
}

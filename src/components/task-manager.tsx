"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  LayoutDashboard,
  CheckCheck,
  FolderKanban,
  Settings as SettingsIcon,
  Plus,
  Search,
  ArrowUpLeft,
  MoreHorizontal,
  CalendarDays,
  Check,
  Clock,
  ArrowRight,
  LayoutGrid,
  List,
  Sun,
  Moon,
  LogOut,
  X,
  Trash2,
  ChevronLeft,
  Bell,
  BellOff,
  Layers,
  Archive,
  Download,
  GripVertical,
  FolderOpen,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  cloudConfigured,
  getSupabase,
  LocalRepository,
  SupabaseRepository,
  type Repository,
} from "@/lib/data/repository";
import { TaskService, ProjectService } from "@/lib/services/tasks";
import {
  ReminderService,
  enablePush,
  reminderRequest,
} from "@/lib/services/reminder-client";
import {
  defaultSettings,
  statuses,
  priorities,
  statusLabels,
  priorityLabels,
  type Task,
  type TaskInput,
  type Project,
  type Settings,
  type Snapshot,
  type Status,
} from "@/lib/models";
import { cn, dayKey, formatDate, toWallTime, wallTimeToISO } from "@/lib/utils";

type Page = "dashboard" | "tasks" | "projects" | "settings";
const nav = [
  { id: "dashboard", label: "סקירה כללית", icon: LayoutDashboard },
  { id: "tasks", label: "המשימות שלי", icon: CheckCheck },
  { id: "projects", label: "פרויקטים", icon: FolderKanban },
  { id: "settings", label: "הגדרות", icon: SettingsIcon },
] as const;
const empty: Snapshot = { tasks: [], projects: [], settings: defaultSettings };
const localUser = "00000000-0000-4000-8000-000000000001";
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="modal"
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="סגירה"
        >
          <X size={20} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
function Auth({ onLocal }: { onLocal: () => void }) {
  const [signUp, setSignUp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const auth = getSupabase().auth;
      const credentials = {
        email: String(data.get("email")),
        password: String(data.get("password")),
      };
      const result = signUp
        ? await auth.signUp(credentials)
        : await auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (signUp && !result.data.session)
        setError("בדוק את תיבת הדואר לאישור ההרשמה.");
    } catch {
      setError("לא ניתן להתחבר. בדוק את הפרטים וחיבור Supabase.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-icon">
            <Layers />
          </span>
          מסלול<span className="brand-dot">.</span>
        </div>
        <h1>מקום אחד לכל מה שחשוב</h1>
        <p>פחות עומס. יותר עשייה.</p>
        <form onSubmit={submit}>
          <label>
            דוא״ל
            <input
              dir="ltr"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </label>
          <label>
            סיסמה
            <input
              dir="ltr"
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete={signUp ? "new-password" : "current-password"}
            />
          </label>
          <Button disabled={busy}>
            {busy ? "מתחברים…" : signUp ? "יצירת חשבון" : "כניסה לחשבון"}
          </Button>
        </form>
        <p role="status">{error}</p>
        <Button variant="ghost" onClick={() => setSignUp(!signUp)}>
          {signUp ? "כבר יש לך חשבון? כניסה" : "אין לך חשבון? הרשמה"}
        </Button>
        <Button variant="outline" onClick={onLocal}>
          התנסות מקומית ללא חשבון
        </Button>
        <small>במצב מקומי הנתונים נשמרים בדפדפן הזה בלבד.</small>
      </div>
    </main>
  );
}
export function TaskManager() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [userId, setUserId] = useState(localUser);
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [local, setLocal] = useState(!cloudConfigured);
  const [data, setData] = useState<Snapshot>(empty);
  const [page, setPage] = useState<Page>("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [sort, setSort] = useState("created");
  const [view, setView] = useState<"list" | "board">("list");
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [projectEditing, setProjectEditing] = useState<
    Project | null | undefined
  >(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [archived, setArchived] = useState(false);
  const [reminderConfig, setReminderConfig] = useState({
    available: false,
    publicKey: "",
  });
  const settings = data.settings;
  useEffect(() => {
    if (local) {
      setRepo(new LocalRepository());
      setUserId(localUser);
      setAuthReady(true);
      return;
    }
    if (!cloudConfigured) return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError("לא ניתן לבדוק התחברות");
      if (data.session) {
        setUserId(data.session.user.id);
        setRepo(new SupabaseRepository(supabase, data.session.user.id));
      } else setRepo(null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setRepo(
          session ? new SupabaseRepository(supabase, session.user.id) : null,
        );
        if (session) setUserId(session.user.id);
        setAuthReady(true);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, [local]);
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    setLoading(true);
    setError("");
    repo
      .load()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch(() => {
        if (alive)
          setError(
            "טעינת הנתונים נכשלה. הנתונים לא הוחלפו. בדוק חיבור ומיגרציות ונסה שוב.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [repo]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    fetch("/api/reminders/status")
      .then((r) => r.json())
      .then(setReminderConfig)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task");
    if (id && data.tasks.length) {
      const task = data.tasks.find((t) => t.id === id);
      if (task) {
        setEditing(task);
        const url = new URL(window.location.href);
        url.searchParams.delete("task");
        window.history.replaceState(null, "", url);
      }
    }
  }, [data.tasks]);
  const service = useMemo(
    () =>
      repo
        ? new TaskService(
            repo,
            userId,
            !local && settings.reminders_enabled && reminderConfig.available
              ? new ReminderService()
              : undefined,
          )
        : null,
    [repo, userId, local, settings.reminders_enabled, reminderConfig.available],
  );
  const active = data.tasks.filter((t) => t.status !== "done");
  const today = dayKey(new Date(), settings.timezone);
  const overdue = active.filter(
    (t) => t.due_at && new Date(t.due_at) < new Date(),
  );
  const todayTasks = active.filter(
    (t) => t.due_at && dayKey(t.due_at, settings.timezone) === today,
  );
  const completed = data.tasks.filter((t) => t.status === "done");
  const filtered = useMemo(() => {
    let tasks = data.tasks.filter(
      (t) =>
        (!search ||
          `${t.title} ${t.description}`
            .toLocaleLowerCase("he")
            .includes(search.toLocaleLowerCase("he"))) &&
        (statusFilter === "all" || t.status === statusFilter) &&
        (priorityFilter === "all" || t.priority === priorityFilter) &&
        (projectFilter === "all" || t.project_id === projectFilter) &&
        (timeFilter === "all" ||
          (t.status !== "done" &&
            t.due_at &&
            (timeFilter === "overdue"
              ? new Date(t.due_at) < new Date()
              : dayKey(t.due_at, settings.timezone) === today))),
    );
    return tasks.sort((a, b) =>
      sort === "due"
        ? (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999")
        : sort === "priority"
          ? priorities.indexOf(b.priority) - priorities.indexOf(a.priority)
          : sort === "status"
            ? statuses.indexOf(a.status) - statuses.indexOf(b.status)
            : b.created_at.localeCompare(a.created_at),
    );
  }, [
    data.tasks,
    search,
    statusFilter,
    priorityFilter,
    projectFilter,
    timeFilter,
    sort,
    settings.timezone,
    today,
  ]);
  async function saveTask(input: TaskInput, existing?: Task) {
    if (!service) return false;
    setBusy(true);
    try {
      const { task, warning } = await service.save(input, existing);
      setData((d) => ({
        ...d,
        tasks: [task, ...d.tasks.filter((t) => t.id !== task.id)],
      }));
      setToast(
        warning ??
          (existing ? "השינויים נשמרו" : "המשימה נוספה. צעד קטן קדימה!"),
      );
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "שמירת המשימה נכשלה");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(task: Task, status: Status) {
    await saveTask({ ...task, status }, task);
  }
  async function saveSettings(s: Settings) {
    if (!repo) return false;
    setBusy(true);
    try {
      await repo.saveSettings(s);
      setData((d) => ({ ...d, settings: s }));
      setToast("ההגדרות נשמרו");
      return true;
    } catch {
      setToast("שמירת ההגדרות נכשלה");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openTasks(filter?: string) {
    setPage("tasks");
    setStatusFilter("all");
    setPriorityFilter(filter === "urgent" ? "urgent" : "all");
    setTimeFilter(filter === "today" || filter === "overdue" ? filter : "all");
  }
  async function saveProject(
    input: {
      name: string;
      description: string;
      color: Project["color"];
      archived: boolean;
    },
    existing?: Project,
  ) {
    if (!repo) return;
    setBusy(true);
    try {
      const p = await new ProjectService(repo, userId).save(input, existing);
      setData((d) => ({
        ...d,
        projects: [p, ...d.projects.filter((x) => x.id !== p.id)],
      }));
      setProjectEditing(undefined);
      setToast("הפרויקט נשמר");
    } catch {
      setToast("שמירת הפרויקט נכשלה");
    } finally {
      setBusy(false);
    }
  }
  if (!authReady) return <main className="loading">טוענים את מסלול…</main>;
  if (!repo) return <Auth onLocal={() => setLocal(true)} />;
  const greeting = new Intl.DateTimeFormat("he-IL", {
    timeZone: settings.timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date());
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <span className="brand-icon">
            <Layers size={24} />
          </span>
          מסלול<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          סביבת העבודה שלי <span>אישי</span>
        </div>
        <nav aria-label="ניווט ראשי">
          {nav.map((item) => (
            <button
              key={item.id}
              className={cn("nav-item", page === item.id && "active")}
              onClick={() => {
                setPage(item.id);
                if (item.id === "tasks") {
                  setProjectFilter("all");
                  setTimeFilter("all");
                }
              }}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.id === "tasks" && <small>{active.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-projects">
          <div className="section-eyebrow">
            הפרויקטים שלי
            <button
              aria-label="הוספת פרויקט"
              onClick={() => setProjectEditing(null)}
            >
              <Plus size={16} />
            </button>
          </div>
          {data.projects
            .filter((p) => !p.archived)
            .slice(0, 5)
            .map((p) => (
              <button
                className="project-nav"
                key={p.id}
                onClick={() => {
                  openTasks();
                  setProjectFilter(p.id);
                }}
              >
                <span className={`project-dot ${p.color}`} />
                {p.name}
              </button>
            ))}
          {!data.projects.length && (
            <p className="muted small">פרויקטים גדולים מתחילים בצעד קטן.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="focus-card">
            <span>מרחב לעשות סדר.</span>
            <p>כל צעד קטן מקדם אותך.</p>
            <div className="focus-art">
              <i />
              <i />
              <i />
              <Check size={16} />
            </div>
          </div>
          <button className="profile" onClick={() => setPage("settings")}>
            <span className="avatar">{settings.name?.slice(0, 1) || "א"}</span>
            <span>
              <strong>{settings.name || "המרחב שלי"}</strong>
              <small>{local ? "מצב מקומי" : "חשבון אישי"}</small>
            </span>
            <MoreHorizontal size={20} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            סביבת העבודה <ChevronLeft size={14} />{" "}
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className={cn("connection", local && "local")}>
              {local ? "שמירה בדפדפן" : "מחובר לענן"}
            </span>
            <button
              aria-label="הגדרות תזכורות"
              className="icon-button"
              onClick={() => setPage("settings")}
            >
              {settings.reminders_enabled && reminderConfig.available ? (
                <Bell size={19} />
              ) : (
                <BellOff size={19} />
              )}
            </button>
            <span className="avatar avatar-small">
              {settings.name?.slice(0, 1) || "א"}
            </span>
          </div>
        </header>
        <main className="main-content">
          {local && (
            <div className="local-banner">
              <span>
                <span className="live-dot" />
                מצב מקומי · הנתונים נשמרים במכשיר הזה בלבד. מומלץ לייצא גיבוי
                בהגדרות.
              </span>
              {cloudConfigured && (
                <button
                  onClick={() => {
                    setLocal(false);
                    setRepo(null);
                  }}
                >
                  כניסה לענן <ArrowUpLeft size={14} />
                </button>
              )}
            </div>
          )}
          {error ? (
            <div className="error-panel" role="alert">
              <h2>לא הצלחנו לטעון את הנתונים</h2>
              <p>{error}</p>
              <Button
                onClick={() =>
                  setRepo(
                    local
                      ? new LocalRepository()
                      : new SupabaseRepository(getSupabase(), userId),
                  )
                }
              >
                ניסיון נוסף
              </Button>
            </div>
          ) : loading ? (
            <p role="status">טוענים את סביבת העבודה…</p>
          ) : (
            <>
              {page === "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">קצת סדר, הרבה שקט</div>
                      <h1>
                        {Number(greeting) < 12
                          ? "בוקר טוב"
                          : Number(greeting) < 18
                            ? "צהריים טובים"
                            : "ערב טוב"}
                        {settings.name ? `, ${settings.name}` : ""}{" "}
                        <span className="greeting-dot">☀</span>
                      </h1>
                      <p>
                        זה המקום לראות את התמונה הגדולה, ולהתקדם במשימה הבאה.
                      </p>
                    </div>
                    <Button onClick={() => setEditing(null)}>
                      <Plus size={18} />
                      משימה חדשה
                    </Button>
                  </div>
                  <div className="date-line">
                    <CalendarDays size={15} />
                    {new Intl.DateTimeFormat("he-IL", {
                      timeZone: settings.timezone,
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }).format(new Date())}
                  </div>
                  <section className="stats-grid" aria-label="סיכום משימות">
                    {[
                      {
                        label: "משימות להיום",
                        value: todayTasks.length,
                        icon: CalendarDays,
                        tone: "indigo",
                        filter: "today",
                        hint: "מתמקדים במה שחשוב היום",
                      },
                      {
                        label: "משימות בתהליך",
                        value: active.filter((t) => t.status === "progress")
                          .length,
                        icon: Clock,
                        tone: "amber",
                        filter: "progress",
                        hint: "דברים טובים כבר קורים",
                      },
                      {
                        label: "משימות באיחור",
                        value: overdue.length,
                        icon: Clock,
                        tone: "rose",
                        filter: "overdue",
                        hint: "נחזור אליהן בקצב שלך",
                      },
                      {
                        label: "משימות שהושלמו",
                        value: completed.length,
                        icon: CheckCheck,
                        tone: "teal",
                        filter: "done",
                        hint: "כל הכבוד על ההתקדמות",
                      },
                    ].map((s) => (
                      <button
                        className="stat-card"
                        key={s.label}
                        onClick={() => {
                          openTasks(s.filter);
                          if (s.filter === "progress" || s.filter === "done")
                            setStatusFilter(s.filter);
                        }}
                      >
                        <div className="stat-top">
                          <span>{s.label}</span>
                          <span className={`stat-icon ${s.tone}`}>
                            <s.icon size={20} />
                          </span>
                        </div>
                        <div className="stat-number">
                          {s.value.toLocaleString("he-IL")}
                          <ArrowUpLeft size={17} />
                        </div>
                        <small>{s.hint}</small>
                      </button>
                    ))}
                  </section>
                  <div className="dashboard-columns">
                    <section className="panel today-panel">
                      <div className="panel-header">
                        <div>
                          <h2>
                            על הפרק היום{" "}
                            <span className="count">{todayTasks.length}</span>
                          </h2>
                          <p>מקום טוב להתחיל ממנו</p>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => openTasks("today")}
                        >
                          כל המשימות <ArrowUpLeft size={15} />
                        </button>
                      </div>
                      <div>
                        {todayTasks.length ? (
                          todayTasks.slice(0, 5).map((t) => taskRow(t, true))
                        ) : (
                          <div className="empty-state">
                            <span className="empty-icon">
                              <CalendarDays size={28} />
                            </span>
                            <h3>יש מקום לדברים החשובים</h3>
                            <p>
                              אין משימות עם יעד להיום. אפשר לבחור את הצעד הבא
                              שלך.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditing(null)}
                            >
                              <Plus size={16} />
                              הוספת משימה
                            </Button>
                          </div>
                        )}
                      </div>
                      <button
                        className="add-task-row"
                        onClick={() => setEditing(null)}
                      >
                        <Plus size={16} />
                        הוספת משימה חדשה
                      </button>
                    </section>
                    <section className="panel projects-overview">
                      <div className="panel-header">
                        <div>
                          <h2>הפרויקטים שלך</h2>
                          <p>צעד אחר צעד, רואים התקדמות</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="כל הפרויקטים"
                          onClick={() => setPage("projects")}
                        >
                          <ArrowUpLeft size={19} />
                        </button>
                      </div>
                      {data.projects
                        .filter((p) => !p.archived)
                        .slice(0, 3)
                        .map((p) => projectCard(p, true))}
                      {!data.projects.filter((p) => !p.archived).length && (
                        <div className="empty-state">
                          <span className="empty-icon">
                            <FolderOpen size={28} />
                          </span>
                          <h3>מרעיון לפרויקט</h3>
                          <p>רכז משימות סביב מטרה משותפת.</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setProjectEditing(null)}
                          >
                            <Plus size={16} />
                            פרויקט ראשון
                          </Button>
                        </div>
                      )}
                    </section>
                  </div>
                  <section className="panel all-tasks-panel">
                    <div className="panel-header">
                      <div>
                        <h2>
                          המשימות שלי{" "}
                          <span className="count">{active.length}</span>
                        </h2>
                        <p>מה שעוד מחכה לצעד הבא שלך</p>
                      </div>
                      <button className="text-link" onClick={() => openTasks()}>
                        לכל המשימות <ArrowUpLeft size={15} />
                      </button>
                    </div>
                    {active.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>שם המשימה</th>
                              <th>פרויקט</th>
                              <th>סטטוס</th>
                              <th>עדיפות</th>
                              <th>תאריך יעד</th>
                              <th>
                                <span className="sr-only">עריכה</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {active.slice(0, 5).map((t) => taskTableRow(t))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-inline">
                        <CheckCheck size={22} />
                        <p>הראש פנוי. המשימה הבאה מתחילה כאן.</p>
                        <button
                          className="text-link"
                          onClick={() => setEditing(null)}
                        >
                          יצירת משימה <Plus size={15} />
                        </button>
                      </div>
                    )}
                  </section>
                  <div className="dashboard-bottom">
                    <section className="panel compact-panel">
                      <h2>
                        <span className="priority-dot urgent" />
                        משימות דחופות{" "}
                        <span className="count">
                          {active.filter((t) => t.priority === "urgent").length}
                        </span>
                      </h2>
                      {active
                        .filter((t) => t.priority === "urgent")
                        .slice(0, 3)
                        .map((t) => taskRow(t, true))}
                      {!active.some((t) => t.priority === "urgent") && (
                        <p className="muted">אין משימות דחופות. אפשר לנשום.</p>
                      )}
                    </section>
                    <section className="panel compact-panel">
                      <h2>
                        <span className="status-dot waiting" />
                        בהמתנה{" "}
                        <span className="count">
                          {active.filter((t) => t.status === "waiting").length}
                        </span>
                      </h2>
                      {active
                        .filter((t) => t.status === "waiting")
                        .slice(0, 3)
                        .map((t) => taskRow(t, true))}
                      {!active.some((t) => t.status === "waiting") && (
                        <p className="muted">אין משימות שממתינות כרגע.</p>
                      )}
                    </section>
                    <section className="panel compact-panel">
                      <h2>
                        <Check size={17} />
                        הושלמו לאחרונה
                      </h2>
                      {completed
                        .sort((a, b) =>
                          b.updated_at.localeCompare(a.updated_at),
                        )
                        .slice(0, 3)
                        .map((t) => taskRow(t, true))}
                      {!completed.length && (
                        <p className="muted">ההצלחות הקטנות שלך יופיעו כאן.</p>
                      )}
                    </section>
                  </div>
                </>
              )}
              {page === "tasks" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">בקצב שלך</div>
                      <h1>
                        {projectFilter !== "all"
                          ? data.projects.find((p) => p.id === projectFilter)
                              ?.name
                          : "המשימות שלי"}
                      </h1>
                      <p>כל הפרטים במקום אחד. כל צעד בשליטה שלך.</p>
                    </div>
                    <Button onClick={() => setEditing(null)}>
                      <Plus size={18} />
                      משימה חדשה
                    </Button>
                  </div>
                  <div className="tasks-toolbar">
                    <div className="search-input">
                      <Search size={18} />
                      <input
                        aria-label="חיפוש משימות"
                        placeholder="חיפוש משימה…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="view-toggle">
                      <Button
                        variant={view === "list" ? "outline" : "ghost"}
                        size="icon"
                        aria-label="תצוגת רשימה"
                        aria-pressed={view === "list"}
                        onClick={() => setView("list")}
                      >
                        <List size={18} />
                      </Button>
                      <Button
                        variant={view === "board" ? "outline" : "ghost"}
                        size="icon"
                        aria-label="תצוגת Kanban"
                        aria-pressed={view === "board"}
                        onClick={() => setView("board")}
                      >
                        <LayoutGrid size={18} />
                      </Button>
                    </div>
                  </div>
                  <div className="filter-bar">
                    <select
                      aria-label="סינון סטטוס"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">כל הסטטוסים</option>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {statusLabels[s]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="סינון עדיפות"
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                    >
                      <option value="all">כל העדיפויות</option>
                      {priorities.map((p) => (
                        <option key={p} value={p}>
                          {priorityLabels[p]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="סינון פרויקט"
                      value={projectFilter}
                      onChange={(e) => setProjectFilter(e.target.value)}
                    >
                      <option value="all">כל הפרויקטים</option>
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.archived ? " (בארכיון)" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="סינון תאריך"
                      value={timeFilter}
                      onChange={(e) => setTimeFilter(e.target.value)}
                    >
                      <option value="all">כל התאריכים</option>
                      <option value="today">להיום</option>
                      <option value="overdue">באיחור</option>
                    </select>
                    <select
                      aria-label="מיון משימות"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="created">נוצרו לאחרונה</option>
                      <option value="due">לפי תאריך יעד</option>
                      <option value="priority">לפי עדיפות</option>
                      <option value="status">לפי סטטוס</option>
                    </select>
                    <span className="muted small">
                      {filtered.length} משימות
                    </span>
                  </div>
                  {view === "list" ? (
                    <section className="panel">
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>שם המשימה</th>
                              <th>פרויקט</th>
                              <th>סטטוס</th>
                              <th>עדיפות</th>
                              <th>תאריך יעד</th>
                              <th>פעולות</th>
                            </tr>
                          </thead>
                          <tbody>{filtered.map((t) => taskTableRow(t))}</tbody>
                        </table>
                      </div>
                      {!filtered.length && (
                        <div className="empty-state">
                          <Search size={28} />
                          <h3>
                            {data.tasks.length
                              ? "לא נמצאו משימות מתאימות"
                              : "הצעד הראשון מתחיל כאן"}
                          </h3>
                          <p>
                            {data.tasks.length
                              ? "אפשר לשנות את הסינון או לחפש משהו אחר."
                              : "אפשר להתחיל מכותרת בלבד, ולהוסיף פרטים בהמשך."}
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => setEditing(null)}
                          >
                            <Plus size={16} />
                            משימה חדשה
                          </Button>
                        </div>
                      )}
                    </section>
                  ) : (
                    <div className="kanban">
                      {statuses.map((s) => (
                        <section
                          className="kanban-column"
                          key={s}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const t = data.tasks.find(
                              (t) =>
                                t.id === e.dataTransfer.getData("text/plain"),
                            );
                            if (t && !busy) void changeStatus(t, s);
                          }}
                        >
                          <h2>
                            <span className={`status-dot ${s}`} />
                            {statusLabels[s]}
                            <span className="count">
                              {filtered.filter((t) => t.status === s).length}
                            </span>
                          </h2>
                          {filtered
                            .filter((t) => t.status === s)
                            .map((t) => (
                              <article
                                key={t.id}
                                className="kanban-card"
                                draggable={!busy}
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("text/plain", t.id)
                                }
                              >
                                <div className="kanban-card-top">
                                  <span
                                    className={`priority-badge ${t.priority}`}
                                  >
                                    {priorityLabels[t.priority]}
                                  </span>
                                  <GripVertical size={16} />
                                </div>
                                <button
                                  className="task-title"
                                  onClick={() => setEditing(t)}
                                >
                                  {t.title}
                                </button>
                                {t.description && (
                                  <p className="card-description">
                                    {t.description}
                                  </p>
                                )}
                                <small>
                                  {
                                    data.projects.find(
                                      (p) => p.id === t.project_id,
                                    )?.name
                                  }
                                </small>
                                <div className="kanban-card-bottom">
                                  <span
                                    className={cn(
                                      "small",
                                      t.due_at &&
                                        new Date(t.due_at) < new Date() &&
                                        t.status !== "done" &&
                                        "overdue",
                                    )}
                                  >
                                    {formatDate(t.due_at, settings.timezone)}
                                  </span>
                                  <select
                                    aria-label={`סטטוס ${t.title}`}
                                    value={t.status}
                                    disabled={busy}
                                    onChange={(e) =>
                                      void changeStatus(
                                        t,
                                        e.target.value as Status,
                                      )
                                    }
                                  >
                                    {statuses.map((x) => (
                                      <option key={x} value={x}>
                                        {statusLabels[x]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </article>
                            ))}
                          <button
                            className="add-task-row"
                            onClick={() =>
                              setEditing({ ...newTask(), status: s } as Task)
                            }
                          >
                            <Plus size={15} />
                            הוספת משימה
                          </button>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
              {page === "projects" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">מטרות גדולות. צעדים קטנים.</div>
                      <h1>הפרויקטים שלי</h1>
                      <p>המשימות, ההתקדמות והתמונה המלאה של כל פרויקט.</p>
                    </div>
                    <Button onClick={() => setProjectEditing(null)}>
                      <Plus size={18} />
                      פרויקט חדש
                    </Button>
                  </div>
                  <div className="tabs">
                    <button
                      className={!archived ? "selected" : ""}
                      onClick={() => setArchived(false)}
                    >
                      פרויקטים פעילים
                    </button>
                    <button
                      className={archived ? "selected" : ""}
                      onClick={() => setArchived(true)}
                    >
                      <Archive size={15} />
                      ארכיון
                    </button>
                  </div>
                  <div className="project-grid">
                    {data.projects
                      .filter((p) => p.archived === archived)
                      .map((p) => (
                        <div className="panel project-full" key={p.id}>
                          {projectCard(p, false)}
                          <p className="project-description">
                            {p.description ||
                              "כל המשימות של הפרויקט, במקום אחד."}
                          </p>
                          <div className="project-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setProjectEditing(p)}
                            >
                              עריכת פרויקט
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void saveProject(
                                  { ...p, archived: !p.archived },
                                  p,
                                )
                              }
                            >
                              <Archive size={14} />
                              {p.archived ? "שחזור" : "ארכוב"}
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                  {!data.projects.filter((p) => p.archived === archived)
                    .length && (
                    <div className="panel empty-state">
                      <FolderOpen size={36} />
                      <h3>
                        {archived ? "הארכיון ריק" : "מקום למטרה הבאה שלך"}
                      </h3>
                      <p>פרויקט מחבר את כל הצעדים בדרך למטרה אחת.</p>
                      {!archived && (
                        <Button onClick={() => setProjectEditing(null)}>
                          <Plus size={16} />
                          פרויקט חדש
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
              {page === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">בדיוק כמו שנוח לך</div>
                      <h1>הגדרות</h1>
                      <p>המרחב שלך, ההעדפות שלך.</p>
                    </div>
                  </div>
                  <SettingsPanel
                    settings={settings}
                    local={local}
                    busy={busy}
                    config={reminderConfig}
                    save={saveSettings}
                    notify={setToast}
                  />
                  <section className="panel settings-card">
                    <h2>הנתונים שלך</h2>
                    <p>
                      {local
                        ? "הנתונים נשמרים בדפדפן הזה בלבד. ניקוי נתוני הדפדפן ימחק אותם."
                        : "הנתונים נשמרים בחשבון Supabase שלך עם הפרדה בין משתמשים."}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([JSON.stringify(data, null, 2)], {
                            type: "application/json",
                          }),
                        );
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `maslul-${today}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={16} />
                      ייצוא גיבוי
                    </Button>
                    {!local && (
                      <Button
                        variant="ghost"
                        onClick={() => void getSupabase().auth.signOut()}
                      >
                        <LogOut size={16} />
                        יציאה מהחשבון
                      </Button>
                    )}
                  </section>
                  <section className="panel settings-card">
                    <h2>אינטגרציות</h2>
                    <p>מקום לחיבורים עתידיים. אין שירותי AI פעילים בגרסה זו.</p>
                    <span className="neutral-badge">בהמשך הדרך</span>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="app-footer">
            <Layers size={13} />
            מסלול · יותר בהירות, פחות עומס<span>צעד אחד בכל פעם.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="ניווט בנייד">
        {nav.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "active" : ""}
            onClick={() => setPage(n.id)}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
          <button aria-label="סגירת הודעה" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {editing !== undefined && (
        <TaskEditor
          task={editing}
          projects={data.projects}
          timezone={settings.timezone}
          reminderAvailable={
            !local && settings.reminders_enabled && reminderConfig.available
          }
          busy={busy}
          defaultProject={projectFilter === "all" ? null : projectFilter}
          onClose={() => setEditing(undefined)}
          onSave={async (input) => {
            if (
              await saveTask(
                input,
                editing && data.tasks.some((t) => t.id === editing.id)
                  ? editing
                  : undefined,
              )
            )
              setEditing(undefined);
          }}
          onDelete={
            editing && data.tasks.some((t) => t.id === editing.id)
              ? () => setConfirmDelete(editing)
              : undefined
          }
        />
      )}
      {projectEditing !== undefined && (
        <Modal
          title={projectEditing ? "עריכת פרויקט" : "פרויקט חדש"}
          onClose={() => setProjectEditing(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void saveProject(
                {
                  name: String(f.get("name")),
                  description: String(f.get("description")),
                  color: String(f.get("color")) as Project["color"],
                  archived: projectEditing?.archived ?? false,
                },
                projectEditing ?? undefined,
              );
            }}
          >
            <label>
              שם הפרויקט
              <input
                name="name"
                defaultValue={projectEditing?.name}
                maxLength={120}
                required
                autoFocus
                placeholder="על מה נעבוד?"
              />
            </label>
            <label>
              תיאור
              <textarea
                name="description"
                defaultValue={projectEditing?.description}
                maxLength={3000}
                placeholder="כמה מילים על המטרה"
              />
            </label>
            <label>
              צבע
              <select
                name="color"
                defaultValue={projectEditing?.color ?? "indigo"}
              >
                <option value="indigo">סגול</option>
                <option value="teal">ירוק</option>
                <option value="amber">כתום</option>
                <option value="rose">ורוד</option>
              </select>
            </label>
            <div className="modal-footer">
              <Button type="submit" disabled={busy}>
                שמירת פרויקט
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setProjectEditing(undefined)}
              >
                ביטול
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="למחוק את המשימה?" onClose={() => setConfirmDelete(null)}>
          <p>המשימה ״{confirmDelete.title}״ וכל פרטיה יימחקו לצמיתות.</p>
          <div className="modal-footer">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await service?.remove(confirmDelete);
                  setData((d) => ({
                    ...d,
                    tasks: d.tasks.filter((t) => t.id !== confirmDelete.id),
                  }));
                  setEditing(undefined);
                  setConfirmDelete(null);
                  setToast("המשימה נמחקה");
                } catch {
                  setToast("המחיקה נכשלה");
                } finally {
                  setBusy(false);
                }
              }}
            >
              מחיקת משימה
            </Button>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              ביטול
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
  function newTask(): Task {
    return {
      id: "",
      user_id: userId,
      created_at: "",
      updated_at: "",
      title: "",
      description: "",
      project_id: projectFilter === "all" ? null : projectFilter,
      status: "todo",
      priority: "normal",
      due_at: null,
      reminder_at: null,
      subtasks: [],
      comments: [],
    };
  }
  function taskRow(t: Task, compact = false) {
    const project = data.projects.find((p) => p.id === t.project_id);
    return (
      <div className={cn("task-row", compact && "compact")} key={t.id}>
        <button
          className={cn("task-check", t.status === "done" && "checked")}
          aria-label={
            t.status === "done" ? `פתיחה מחדש: ${t.title}` : `השלמת ${t.title}`
          }
          disabled={busy}
          onClick={() =>
            void changeStatus(t, t.status === "done" ? "todo" : "done")
          }
        >
          {t.status === "done" && <Check size={13} />}
        </button>
        <button className="task-row-main" onClick={() => setEditing(t)}>
          <strong className={t.status === "done" ? "strike" : ""}>
            {t.title}
          </strong>
          <small>
            {project && (
              <>
                <span className={`project-dot ${project.color}`} />
                {project.name}
                <span>·</span>
              </>
            )}
            {formatDate(t.due_at, settings.timezone)}
          </small>
        </button>
        <span className={`priority-badge ${t.priority}`}>
          {priorityLabels[t.priority]}
        </span>
      </div>
    );
  }
  function taskTableRow(t: Task) {
    const p = data.projects.find((p) => p.id === t.project_id);
    return (
      <tr key={t.id}>
        <td>
          <div className="table-title">
            <button
              className={cn("task-check", t.status === "done" && "checked")}
              aria-label={`השלמת ${t.title}`}
              disabled={busy}
              onClick={() =>
                void changeStatus(t, t.status === "done" ? "todo" : "done")
              }
            >
              {t.status === "done" && <Check size={13} />}
            </button>
            <button
              className={cn("task-title", t.status === "done" && "strike")}
              onClick={() => setEditing(t)}
            >
              {t.title}
            </button>
            {t.subtasks.length > 0 && (
              <small className="muted">
                {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
              </small>
            )}
          </div>
        </td>
        <td>
          {p ? (
            <span className="table-project">
              <span className={`project-dot ${p.color}`} />
              {p.name}
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td>
          <select
            className={`status-select ${t.status}`}
            aria-label={`סטטוס ${t.title}`}
            value={t.status}
            disabled={busy}
            onChange={(e) => void changeStatus(t, e.target.value as Status)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select
            className={`priority-select ${t.priority}`}
            aria-label={`עדיפות ${t.title}`}
            value={t.priority}
            disabled={busy}
            onChange={(e) =>
              void saveTask(
                { ...t, priority: e.target.value as Task["priority"] },
                t,
              )
            }
          >
            {priorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <span
            className={cn(
              "table-date",
              t.due_at &&
                new Date(t.due_at) < new Date() &&
                t.status !== "done" &&
                "overdue",
            )}
          >
            {t.due_at && <CalendarDays size={13} />}{" "}
            {formatDate(t.due_at, settings.timezone)}
          </span>
        </td>
        <td>
          <button
            className="icon-button"
            aria-label={`עריכת ${t.title}`}
            onClick={() => setEditing(t)}
          >
            <MoreHorizontal size={18} />
          </button>
        </td>
      </tr>
    );
  }
  function projectCard(p: Project, compact: boolean) {
    const tasks = data.tasks.filter((t) => t.project_id === p.id);
    const done = tasks.filter((t) => t.status === "done").length;
    const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const late = tasks.filter(
      (t) => t.status !== "done" && t.due_at && new Date(t.due_at) < new Date(),
    ).length;
    return (
      <button
        className={cn("project-summary", compact && "compact")}
        key={p.id}
        onClick={() => {
          openTasks();
          setProjectFilter(p.id);
        }}
      >
        <div className="project-summary-top">
          <span className={`project-icon ${p.color}`}>
            <FolderKanban size={19} />
          </span>
          <strong>{p.name}</strong>
          <ArrowUpLeft size={17} />
        </div>
        <div className="progress-label">
          <span>
            {done} מתוך {tasks.length} משימות הושלמו
          </span>
          <strong>{percent}%</strong>
        </div>
        <div className="progress-track">
          <span className={p.color} style={{ width: `${percent}%` }} />
        </div>
        {late > 0 && <small className="overdue">{late} משימות באיחור</small>}
      </button>
    );
  }
}

function TaskEditor({
  task,
  projects,
  timezone,
  reminderAvailable,
  busy,
  defaultProject,
  onSave,
  onClose,
  onDelete,
}: {
  task: Task | null;
  projects: Project[];
  timezone: string;
  reminderAvailable: boolean;
  busy: boolean;
  defaultProject: string | null;
  onSave: (input: TaskInput) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [subtasks, setSubtasks] = useState(task?.subtasks ?? []);
  const [comments, setComments] = useState(task?.comments ?? []);
  const [subtask, setSubtask] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const pendingSub = subtask.trim()
        ? [
            ...subtasks,
            { id: crypto.randomUUID(), title: subtask.trim(), done: false },
          ]
        : subtasks;
      const pendingComments = comment.trim()
        ? [
            ...comments,
            {
              id: crypto.randomUUID(),
              text: comment.trim(),
              created_at: new Date().toISOString(),
            },
          ]
        : comments;
      await onSave({
        title: String(f.get("title")),
        description: String(f.get("description")),
        project_id: String(f.get("project")) || null,
        status: String(f.get("status")) as Task["status"],
        priority: String(f.get("priority")) as Task["priority"],
        due_at: wallTimeToISO(String(f.get("due")), timezone),
        reminder_at: reminderAvailable
          ? wallTimeToISO(String(f.get("reminder") ?? ""), timezone)
          : (task?.reminder_at ?? null),
        subtasks: pendingSub,
        comments: pendingComments,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "התאריך אינו תקין");
    }
  }
  return (
    <Modal title={task?.id ? "פרטי משימה" : "משימה חדשה"} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          כותרת המשימה <span className="required">*</span>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={task?.title}
            placeholder="מה הצעד הבא שלך?"
            autoFocus
          />
        </label>
        <label>
          תיאור
          <textarea
            name="description"
            maxLength={10000}
            defaultValue={task?.description}
            placeholder="פרטים שחשוב לזכור…"
            rows={3}
          />
        </label>
        <div className="form-grid">
          <label>
            פרויקט
            <select
              name="project"
              defaultValue={task?.project_id ?? defaultProject ?? ""}
            >
              <option value="">ללא פרויקט</option>
              {projects
                .filter((p) => !p.archived || p.id === task?.project_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            סטטוס
            <select name="status" defaultValue={task?.status ?? "todo"}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            עדיפות
            <select name="priority" defaultValue={task?.priority ?? "normal"}>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {priorityLabels[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            תאריך ושעת יעד
            <input
              dir="ltr"
              name="due"
              type="datetime-local"
              defaultValue={toWallTime(task?.due_at ?? null, timezone)}
            />
          </label>
        </div>
        <p className="field-hint">
          השעות לפי {timezone}. ניתן לשמור משימה גם ללא תאריך יעד.
        </p>
        {reminderAvailable ? (
          <label>
            תזכורת
            <input
              dir="ltr"
              type="datetime-local"
              name="reminder"
              defaultValue={toWallTime(task?.reminder_at ?? null, timezone)}
            />
          </label>
        ) : (
          <div className="reminder-note">
            <BellOff size={15} />
            התזכורות כבויות. שמירת המשימה אינה תלויה בהן.
            {task?.reminder_at && " התזכורת הקיימת נשמרת ללא שליחה."}
          </div>
        )}
        <div className="editor-section">
          <h3>
            תתי־משימות{" "}
            <span className="count">
              {subtasks.filter((s) => s.done).length}/{subtasks.length}
            </span>
          </h3>
          {subtasks.map((s) => (
            <div className="subtask-row" key={s.id}>
              <input
                type="checkbox"
                aria-label={s.title}
                checked={s.done}
                onChange={(e) =>
                  setSubtasks((items) =>
                    items.map((x) =>
                      x.id === s.id ? { ...x, done: e.target.checked } : x,
                    ),
                  )
                }
              />
              <span className={s.done ? "strike" : ""}>{s.title}</span>
              <button
                type="button"
                aria-label={`מחיקת תת משימה ${s.title}`}
                onClick={() =>
                  setSubtasks((items) => items.filter((x) => x.id !== s.id))
                }
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="inline-input">
            <input
              aria-label="תת משימה חדשה"
              placeholder="הוספת צעד קטן…"
              maxLength={500}
              value={subtask}
              onChange={(e) => setSubtask(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="הוספת תת משימה"
              disabled={!subtask.trim()}
              onClick={() => {
                setSubtasks((s) => [
                  ...s,
                  {
                    id: crypto.randomUUID(),
                    title: subtask.trim(),
                    done: false,
                  },
                ]);
                setSubtask("");
              }}
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>
        <div className="editor-section">
          <h3>הערות</h3>
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <p>{c.text}</p>
              <small>{formatDate(c.created_at, timezone)}</small>
            </div>
          ))}
          <textarea
            aria-label="הערה חדשה"
            placeholder="מחשבה, עדכון או משהו לזכור…"
            maxLength={3000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        {task?.created_at && (
          <p className="field-hint">
            נוצרה: {formatDate(task.created_at, timezone)} · עדכון:{" "}
            {formatDate(task.updated_at, timezone)}
          </p>
        )}
        {error && (
          <p role="alert" className="overdue">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <Button disabled={busy} type="submit">
            {busy ? "שומרים…" : "שמירת משימה"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              className="delete-action"
              onClick={onDelete}
            >
              <Trash2 size={16} />
              מחיקה
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function SettingsPanel({
  settings,
  local,
  busy,
  config,
  save,
  notify,
}: {
  settings: Settings;
  local: boolean;
  busy: boolean;
  config: { available: boolean; publicKey: string };
  save: (s: Settings) => Promise<boolean>;
  notify: (s: string) => void;
}) {
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [permission, setPermission] = useState("");
  useEffect(() => {
    setPermission(
      "Notification" in window ? Notification.permission : "unsupported",
    );
  }, []);
  const zones = Array.from(
    new Set([
      "Asia/Jerusalem",
      "UTC",
      settings.timezone,
      ...Intl.supportedValuesOf("timeZone"),
    ]),
  );
  async function toggle() {
    setNotificationBusy(true);
    try {
      if (settings.reminders_enabled) {
        await save({ ...settings, reminders_enabled: false });
      } else {
        if (!config.available || local)
          throw new Error("מערכת התזכורות אינה זמינה כרגע");
        let activated = false;
        try {
          await enablePush(config.publicKey, async () => {
            if (
              !(await save({
                ...settings,
                reminders_enabled: true,
                reminders_enabled_at: new Date().toISOString(),
              }))
            ) {
              throw new Error("לא ניתן לשמור את הפעלת התזכורות");
            }
            activated = true;
          });
        } catch (error) {
          if (activated) await save({ ...settings, reminders_enabled: false });
          throw error;
        }
        setPermission(Notification.permission);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "לא ניתן להפעיל תזכורות");
    } finally {
      setNotificationBusy(false);
    }
  }
  return (
    <>
      <section className="panel settings-card">
        <h2>פרטים אישיים</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              ...settings,
              name: String(f.get("name")),
              timezone: String(f.get("timezone")),
            });
          }}
        >
          <label>
            השם שלך
            <input
              name="name"
              defaultValue={settings.name}
              maxLength={100}
              placeholder="איך לקרוא לך?"
            />
          </label>
          <div className="form-grid">
            <label>
              שפה
              <select disabled>
                <option>עברית</option>
              </select>
            </label>
            <label>
              אזור זמן
              <select
                name="timezone"
                defaultValue={settings.timezone}
                dir="ltr"
              >
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
          </div>
          <Button disabled={busy} type="submit">
            שמירת פרטים
          </Button>
        </form>
      </section>
      <section className="panel settings-card">
        <h2>מראה האפליקציה</h2>
        <div className="theme-options">
          <button
            aria-pressed={settings.theme === "light"}
            className={settings.theme === "light" ? "selected" : ""}
            onClick={() => void save({ ...settings, theme: "light" })}
          >
            <Sun size={20} />
            מצב בהיר
          </button>
          <button
            aria-pressed={settings.theme === "dark"}
            className={settings.theme === "dark" ? "selected" : ""}
            onClick={() => void save({ ...settings, theme: "dark" })}
          >
            <Moon size={20} />
            מצב כהה
          </button>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="settings-row">
          <div>
            <h2>הפעלת תזכורות</h2>
            <p>תוספת קטנה, רק אם היא מתאימה לך.</p>
          </div>
          <button
            role="switch"
            aria-label="הפעלת תזכורות"
            aria-checked={settings.reminders_enabled}
            disabled={
              busy ||
              notificationBusy ||
              (!settings.reminders_enabled && (!config.available || local))
            }
            className={cn("switch", settings.reminders_enabled && "on")}
            onClick={() => void toggle()}
          >
            <span />
          </button>
        </div>
        <div className="reminder-note">
          <BellOff size={18} />
          {!config.available || local
            ? "מערכת התזכורות אינה זמינה כרגע. כל פעולות ניהול המשימות זמינות כרגיל."
            : settings.reminders_enabled
              ? "התזכורות פעילות. ניתן להגדיר זמן תזכורת בתוך כל משימה."
              : "התזכורות כבויות. לא תתבצע הרשמה או שליחת התראות."}
        </div>
        <p className="field-hint">
          הרשאת דפדפן:{" "}
          {permission === "granted"
            ? "מאושרת"
            : permission === "denied"
              ? "חסומה — אפשר לשנות בהגדרות האתר בדפדפן"
              : permission === "unsupported"
                ? "לא נתמכת"
                : "טרם התבקשה"}
          . ב־iPhone נדרשת התקנה למסך הבית ודפדפן תומך.
        </p>
        <p className="field-hint">
          הפעלה מחדש לא תשלח תזכורות ישנות. לאחר כיבוי, הגדרות התזכורות נשמרות
          ללא שליחה.
        </p>
        <Button
          variant="outline"
          disabled={
            !settings.reminders_enabled ||
            !config.available ||
            local ||
            notificationBusy
          }
          onClick={async () => {
            setNotificationBusy(true);
            try {
              await reminderRequest("test");
              notify("התראת ניסיון נשלחה לשירות Push");
            } catch (e) {
              notify(
                e instanceof Error ? e.message : "שליחת התראת ניסיון נכשלה",
              );
            } finally {
              setNotificationBusy(false);
            }
          }}
        >
          <Bell size={16} />
          שליחת התראת ניסיון
        </Button>
      </section>
    </>
  );
}

import {
  AlertCircle,
  ArrowLeft,
  Bug,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Inbox,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { useI18n } from "../hooks/I18nContext";
import { supabase } from "../lib/supabase";
import "./AdminSupportPage.css";

type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportKind = "question" | "bug";
type StatusFilter = "all" | SupportStatus;
type KindFilter = "all" | SupportKind;

interface AdminSupportTicket {
  ticket_id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  kind: SupportKind;
  subject: string;
  message: string;
  status: SupportStatus;
  admin_reply: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface TicketCounts {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  bugs: number;
  questions: number;
}

interface AdminSupportPageProps {
  userId: string;
  userEmail?: string;
}

const EMPTY_COUNTS: TicketCounts = {
  total: 0,
  open: 0,
  inProgress: 0,
  resolved: 0,
  closed: 0,
  bugs: 0,
  questions: 0,
};

const COPY = {
  en: {
    title: "Support inbox",
    subtitle: "Review requests, reply to users, and keep the queue moving.",
    admin: "Admin",
    back: "Back to Pinly",
    refresh: "Refresh",
    accessChecking: "Checking admin access…",
    accessDenied: "Admin access required",
    accessDeniedBody:
      "This account cannot view customer support requests. Access is controlled by the Pinly admin role in Supabase.",
    loadError: "The support queue could not be loaded.",
    total: "All tickets",
    open: "New",
    inProgress: "In progress",
    resolved: "Resolved",
    closed: "Closed",
    filters: "Queue",
    requestType: "Request type",
    all: "All",
    question: "Questions",
    bug: "Bug reports",
    search: "Search subject, message, user, or ticket ID",
    noTickets: "No tickets match these filters.",
    selectTicket: "Select a ticket to view the request and reply.",
    requester: "Requester",
    created: "Created",
    technicalContext: "Technical context",
    activeSpace: "Active space",
    route: "Page",
    viewport: "Viewport",
    browser: "Browser",
    language: "Language",
    reply: "Reply to user",
    replyPlaceholder: "Write a clear response for the user…",
    status: "Status",
    save: "Save response",
    saving: "Saving…",
    saved: "Ticket updated. The user will see the latest response in Pinly.",
    saveError: "Could not update this ticket. Please try again.",
    replyRequired: "Add a reply before resolving or closing this ticket.",
    chars: "characters",
    live: "Live queue",
  },
  vi: {
    title: "Hộp thư hỗ trợ",
    subtitle: "Xem yêu cầu, phản hồi người dùng và xử lý ticket tập trung.",
    admin: "Quản trị viên",
    back: "Về Pinly",
    refresh: "Làm mới",
    accessChecking: "Đang kiểm tra quyền admin…",
    accessDenied: "Cần quyền quản trị viên",
    accessDeniedBody:
      "Tài khoản này không thể xem yêu cầu hỗ trợ của khách hàng. Quyền truy cập được kiểm soát bằng role admin trong Supabase.",
    loadError: "Không tải được danh sách hỗ trợ.",
    total: "Tất cả ticket",
    open: "Mới",
    inProgress: "Đang xử lý",
    resolved: "Đã giải quyết",
    closed: "Đã đóng",
    filters: "Hàng đợi",
    requestType: "Loại yêu cầu",
    all: "Tất cả",
    question: "Câu hỏi",
    bug: "Báo cáo lỗi",
    search: "Tìm tiêu đề, nội dung, người dùng hoặc mã ticket",
    noTickets: "Không có ticket phù hợp với bộ lọc.",
    selectTicket: "Chọn một ticket để xem nội dung và phản hồi.",
    requester: "Người gửi",
    created: "Ngày gửi",
    technicalContext: "Thông tin kỹ thuật",
    activeSpace: "Space đang dùng",
    route: "Trang",
    viewport: "Màn hình",
    browser: "Trình duyệt",
    language: "Ngôn ngữ",
    reply: "Phản hồi người dùng",
    replyPlaceholder: "Nhập phản hồi rõ ràng cho người dùng…",
    status: "Trạng thái",
    save: "Lưu phản hồi",
    saving: "Đang lưu…",
    saved: "Đã cập nhật ticket. Người dùng sẽ thấy phản hồi mới nhất trong Pinly.",
    saveError: "Chưa thể cập nhật ticket. Vui lòng thử lại.",
    replyRequired: "Hãy nhập phản hồi trước khi giải quyết hoặc đóng ticket.",
    chars: "ký tự",
    live: "Đang cập nhật trực tiếp",
  },
} as const;

const STATUS_OPTIONS: SupportStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

function normalizeCounts(value: unknown): TicketCounts {
  const data = (value ?? {}) as Record<string, unknown>;
  return {
    total: Number(data.total ?? 0),
    open: Number(data.open ?? 0),
    inProgress: Number(data.inProgress ?? 0),
    resolved: Number(data.resolved ?? 0),
    closed: Number(data.closed ?? 0),
    bugs: Number(data.bugs ?? 0),
    questions: Number(data.questions ?? 0),
  };
}

function getContextText(context: Record<string, unknown>, key: string) {
  const value = context[key];
  return typeof value === "string" && value.trim() ? value : "—";
}

function getViewportText(context: Record<string, unknown>) {
  const viewport = context.viewport;
  if (!viewport || typeof viewport !== "object") return "—";
  const data = viewport as Record<string, unknown>;
  const width = Number(data.width);
  const height = Number(data.height);
  return Number.isFinite(width) && Number.isFinite(height)
    ? `${width} × ${height}`
    : "—";
}

export function AdminSupportPage({
  userId,
  userEmail,
}: AdminSupportPageProps) {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const copy = COPY[lang];
  const access = useAdminAccess(userId);
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [counts, setCounts] = useState<TicketCounts>(EMPTY_COUNTS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<SupportStatus>("open");
  const [replyDraft, setReplyDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [livePulse, setLivePulse] = useState(0);
  const detailRef = useRef<HTMLElement>(null);

  const statusLabel = useCallback(
    (status: SupportStatus) => {
      if (status === "in_progress") return copy.inProgress;
      if (status === "resolved") return copy.resolved;
      if (status === "closed") return copy.closed;
      return copy.open;
    },
    [copy],
  );

  const loadDashboard = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    const [ticketResult, countResult] = await Promise.all([
      supabase.rpc("admin_list_support_tickets", {
        p_status: null,
        p_kind: null,
        p_search: null,
        p_limit: 200,
        p_offset: 0,
      }),
      supabase.rpc("admin_support_ticket_counts"),
    ]);

    if (ticketResult.error || countResult.error) {
      setError(ticketResult.error?.message ?? countResult.error?.message ?? copy.loadError);
    } else {
      const rows = (ticketResult.data ?? []) as AdminSupportTicket[];
      setTickets(rows);
      setCounts(normalizeCounts(countResult.data));
      setSelectedTicketId((current) =>
        current && rows.some((ticket) => ticket.ticket_id === current)
          ? current
          : null,
      );
    }
    setLoading(false);
  }, [copy.loadError]);

  useEffect(() => {
    if (!access.isAdmin) return;
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [access.isAdmin, loadDashboard]);

  useEffect(() => {
    if (!access.isAdmin) return;
    const channel = supabase
      .channel("admin-support-tickets-dashboard")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_tickets",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setLivePulse((value) => value + 1);
          }
          void loadDashboard(false);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [access.isAdmin, loadDashboard]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (kindFilter !== "all" && ticket.kind !== kindFilter) return false;
      if (!query) return true;
      return [
        ticket.ticket_id,
        ticket.subject,
        ticket.message,
        ticket.user_email ?? "",
        ticket.user_name ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [kindFilter, search, statusFilter, tickets]);

  const selectedTicket = useMemo(
    () =>
      tickets.find((ticket) => ticket.ticket_id === selectedTicketId) ?? null,
    [selectedTicketId, tickets],
  );

  const replyChanged = selectedTicket
    ? replyDraft.trim() !== (selectedTicket.admin_reply ?? "")
    : false;
  const statusChanged = selectedTicket
    ? statusDraft !== selectedTicket.status
    : false;
  const formDirty = replyChanged || statusChanged;

  function openTicket(ticket: AdminSupportTicket) {
    setSelectedTicketId(ticket.ticket_id);
    setStatusDraft(ticket.status);
    setReplyDraft(ticket.admin_reply ?? "");
    setSaveError(null);
    setSaveSuccess(false);
    setLivePulse(0);
    if (window.matchMedia("(max-width: 720px)").matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
      });
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket || saving || !formDirty) return;
    if (
      (statusDraft === "resolved" || statusDraft === "closed") &&
      replyDraft.trim().length === 0
    ) {
      setSaveError(copy.replyRequired);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const { error: updateError } = await supabase.rpc(
      "admin_update_support_ticket",
      {
        p_ticket_id: selectedTicket.ticket_id,
        p_status: statusDraft,
        p_admin_reply: replyDraft.trim() || null,
      },
    );

    if (updateError) {
      setSaveError(updateError.message || copy.saveError);
    } else {
      setSaveSuccess(true);
      await loadDashboard(false);
    }
    setSaving(false);
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  if (access.loading) {
    return (
      <main className="admin-support-state">
        <Logo size={48} />
        <Loader2 size={26} className="admin-support-spinner" />
        <p>{copy.accessChecking}</p>
      </main>
    );
  }

  if (!access.isAdmin) {
    return (
      <main className="admin-support-state admin-support-denied">
        <Logo size={48} />
        <ShieldAlert size={42} />
        <h1>{copy.accessDenied}</h1>
        <p>{copy.accessDeniedBody}</p>
        <Button leadingIcon={<ArrowLeft size={16} />} onClick={() => navigate("/")}>
          {copy.back}
        </Button>
      </main>
    );
  }

  return (
    <div className="admin-support-page">
      <header className="admin-support-header">
        <div className="admin-support-brand">
          <Logo size={38} />
          <div>
            <span>Pinly Admin</span>
            <h1>{copy.title}</h1>
          </div>
        </div>
        <p>{copy.subtitle}</p>
        <div className="admin-support-header-actions">
          <span className="admin-support-identity">
            <UserRound size={15} />
            <span>
              <small>{copy.admin}</small>
              <strong>{userEmail ?? userId.slice(0, 8)}</strong>
            </span>
          </span>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw size={15} />}
            loading={loading}
            onClick={() => void loadDashboard()}
          >
            {copy.refresh}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<ArrowLeft size={15} />}
            onClick={() => navigate("/settings")}
          >
            {copy.back}
          </Button>
        </div>
      </header>

      <section className="admin-support-metrics" aria-label={copy.filters}>
        <button
          type="button"
          className={statusFilter === "all" ? "active" : ""}
          aria-pressed={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          <Inbox size={18} />
          <span>{copy.total}</span>
          <strong>{counts.total}</strong>
        </button>
        <button
          type="button"
          className={statusFilter === "open" ? "active" : ""}
          aria-pressed={statusFilter === "open"}
          onClick={() => setStatusFilter("open")}
        >
          <AlertCircle size={18} />
          <span>{copy.open}</span>
          <strong>{counts.open}</strong>
        </button>
        <button
          type="button"
          className={statusFilter === "in_progress" ? "active" : ""}
          aria-pressed={statusFilter === "in_progress"}
          onClick={() => setStatusFilter("in_progress")}
        >
          <Clock3 size={18} />
          <span>{copy.inProgress}</span>
          <strong>{counts.inProgress}</strong>
        </button>
        <button
          type="button"
          className={statusFilter === "resolved" ? "active" : ""}
          aria-pressed={statusFilter === "resolved"}
          onClick={() => setStatusFilter("resolved")}
        >
          <CheckCircle2 size={18} />
          <span>{copy.resolved}</span>
          <strong>{counts.resolved}</strong>
        </button>
      </section>

      {error && (
        <div className="admin-support-error" role="alert">
          <AlertCircle size={17} /> {copy.loadError}
        </div>
      )}

      <main className="admin-support-layout">
        <aside className="admin-support-filters">
          <div className="admin-support-panel-title">
            <span>{copy.filters}</span>
            <span className="admin-support-live">
              <i /> {copy.live}
            </span>
          </div>

          <nav className="admin-support-status-nav" aria-label={copy.status}>
            {(["all", ...STATUS_OPTIONS] as StatusFilter[]).map((status) => {
              const label = status === "all" ? copy.all : statusLabel(status);
              const count =
                status === "all"
                  ? counts.total
                  : status === "in_progress"
                    ? counts.inProgress
                    : counts[status];
              return (
                <button
                  type="button"
                  key={status}
                  className={statusFilter === status ? "active" : ""}
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  <span>{label}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </nav>

          <label className="admin-support-kind-filter">
            <span>{copy.requestType}</span>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as KindFilter)}
            >
              <option value="all">{copy.all}</option>
              <option value="question">{copy.question}</option>
              <option value="bug">{copy.bug}</option>
            </select>
          </label>
        </aside>

        <section className="admin-support-queue">
          <div className="admin-support-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.search}
              aria-label={copy.search}
            />
            {livePulse > 0 && (
              <span className="admin-support-new-badge">+{livePulse}</span>
            )}
          </div>

          <div className="admin-support-ticket-list">
            {loading && tickets.length === 0 ? (
              <div className="admin-support-list-state">
                <Loader2 size={24} className="admin-support-spinner" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="admin-support-list-state">
                <Inbox size={28} />
                <p>{copy.noTickets}</p>
              </div>
            ) : (
              filteredTickets.map((ticket) => (
                <button
                  type="button"
                  key={ticket.ticket_id}
                  className={`admin-support-ticket-row ${
                    selectedTicketId === ticket.ticket_id ? "active" : ""
                  }`}
                  onClick={() => openTicket(ticket)}
                >
                  <span className={`admin-support-kind kind-${ticket.kind}`}>
                    {ticket.kind === "bug" ? <Bug size={15} /> : <MessageCircle size={15} />}
                  </span>
                  <span className="admin-support-ticket-copy">
                    <strong>{ticket.subject}</strong>
                    <small>{ticket.user_name || ticket.user_email || ticket.user_id}</small>
                    <span>{ticket.message}</span>
                  </span>
                  <span className="admin-support-ticket-meta">
                    <i className={`status-${ticket.status}`}>{statusLabel(ticket.status)}</i>
                    <time>{formatDate(ticket.created_at)}</time>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section ref={detailRef} className="admin-support-detail">
          {!selectedTicket ? (
            <div className="admin-support-detail-empty">
              <CircleHelp size={42} />
              <p>{copy.selectTicket}</p>
            </div>
          ) : (
            <>
              <header className="admin-support-detail-header">
                <div>
                  <span className={`admin-support-kind-label kind-${selectedTicket.kind}`}>
                    {selectedTicket.kind === "bug" ? copy.bug : copy.question}
                  </span>
                  <h2>{selectedTicket.subject}</h2>
                  <code>#{selectedTicket.ticket_id.slice(0, 8).toUpperCase()}</code>
                </div>
                <span className={`admin-support-detail-status status-${selectedTicket.status}`}>
                  {statusLabel(selectedTicket.status)}
                </span>
              </header>

              <div className="admin-support-request-meta">
                <span>
                  <UserRound size={15} />
                  <span>
                    <small>{copy.requester}</small>
                    <strong>{selectedTicket.user_name || selectedTicket.user_email || "—"}</strong>
                    {selectedTicket.user_name && selectedTicket.user_email && (
                      <em>{selectedTicket.user_email}</em>
                    )}
                  </span>
                </span>
                <span>
                  <Clock3 size={15} />
                  <span>
                    <small>{copy.created}</small>
                    <strong>{formatDate(selectedTicket.created_at)}</strong>
                  </span>
                </span>
              </div>

              <article className="admin-support-message">
                {selectedTicket.message}
              </article>

              <details className="admin-support-context">
                <summary>{copy.technicalContext}</summary>
                <dl>
                  <div><dt>{copy.route}</dt><dd>{getContextText(selectedTicket.context, "route")}</dd></div>
                  <div><dt>{copy.activeSpace}</dt><dd>{getContextText(selectedTicket.context, "active_space_id")}</dd></div>
                  <div><dt>{copy.viewport}</dt><dd>{getViewportText(selectedTicket.context)}</dd></div>
                  <div><dt>{copy.language}</dt><dd>{getContextText(selectedTicket.context, "language")}</dd></div>
                  <div className="wide"><dt>{copy.browser}</dt><dd>{getContextText(selectedTicket.context, "user_agent")}</dd></div>
                </dl>
              </details>

              <form className="admin-support-reply-form" onSubmit={handleSave}>
                <div className="admin-support-reply-grid">
                  <label>
                    <span>{copy.status}</span>
                    <select
                      value={statusDraft}
                      onChange={(event) => {
                        setStatusDraft(event.target.value as SupportStatus);
                        setSaveError(null);
                        setSaveSuccess(false);
                      }}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{statusLabel(status)}</option>
                      ))}
                    </select>
                  </label>
                  <span className="admin-support-reply-count">
                    {replyDraft.length}/4000 {copy.chars}
                  </span>
                </div>
                <label className="admin-support-reply-field">
                  <span>{copy.reply}</span>
                  <textarea
                    value={replyDraft}
                    onChange={(event) => {
                      setReplyDraft(event.target.value);
                      setSaveError(null);
                      setSaveSuccess(false);
                    }}
                    placeholder={copy.replyPlaceholder}
                    maxLength={4000}
                    rows={8}
                    disabled={saving}
                  />
                </label>
                {saveError && <p className="admin-support-form-error"><AlertCircle size={15} />{saveError}</p>}
                {saveSuccess && <p className="admin-support-form-success"><CheckCircle2 size={15} />{copy.saved}</p>}
                <Button
                  type="submit"
                  loading={saving}
                  disabled={!formDirty || saving}
                  leadingIcon={<MessageCircle size={16} />}
                >
                  {saving ? copy.saving : copy.save}
                </Button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

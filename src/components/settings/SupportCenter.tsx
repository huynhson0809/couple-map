import {
  Bug,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../hooks/I18nContext";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";
import { SegmentedControl } from "../ui/SegmentedControl";

export type SupportView = "faq" | "contact" | "bug";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketKind = "question" | "bug";

interface SupportTicket {
  id: string;
  kind: TicketKind;
  subject: string;
  status: TicketStatus;
  admin_reply: string | null;
  created_at: string;
}

interface TicketDraft {
  subject: string;
  message: string;
}

interface SupportCenterProps {
  initialView: SupportView;
  userId: string;
  userEmail?: string;
  activeSpaceId?: string;
  onClose: () => void;
}

const FAQS = [
  ["support.faqSpaceLimitQ", "support.faqSpaceLimitA"],
  ["support.faqInviteQ", "support.faqInviteA"],
  ["support.faqPlanQ", "support.faqPlanA"],
  ["support.faqPrivacyQ", "support.faqPrivacyA"],
  ["support.faqDeleteQ", "support.faqDeleteA"],
] as const;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function fetchRecentTickets(userId: string) {
  return supabase
    .from("support_tickets")
    .select("id, kind, subject, status, admin_reply, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
}

export function SupportCenter({
  initialView,
  userId,
  userEmail,
  activeSpaceId,
  onClose,
}: SupportCenterProps) {
  const { lang, t } = useI18n();
  const [view, setView] = useState<SupportView>(initialView);
  const [drafts, setDrafts] = useState<Record<"contact" | "bug", TicketDraft>>({
    contact: { subject: "", message: "" },
    bug: { subject: "", message: "" },
  });
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchRecentTickets(userId).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setTicketsError(true);
        setTickets([]);
      } else {
        setTickets((data ?? []) as SupportTicket[]);
      }
      setTicketsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, submitting]);

  function updateDraft(field: keyof TicketDraft, value: string) {
    if (view === "faq") return;
    setDrafts((current) => ({
      ...current,
      [view]: { ...current[view], [field]: value },
    }));
    setSubmitError(null);
    setSubmittedTicketId(null);
  }

  function statusLabel(status: TicketStatus) {
    if (status === "in_progress") return t("support.statusInProgress");
    if (status === "resolved") return t("support.statusResolved");
    if (status === "closed") return t("support.statusClosed");
    return t("support.statusOpen");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === "faq" || submitting) return;

    const draft = drafts[view];
    const subject = draft.subject.trim();
    const message = draft.message.trim();
    if (subject.length < 3) {
      setSubmitError(t("support.validationSubject"));
      return;
    }
    if (message.length < 20) {
      setSubmitError(t("support.validationMessage"));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmittedTicketId(null);
    try {
      const kind: TicketKind = view === "bug" ? "bug" : "question";
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: userId,
          kind,
          subject,
          message,
          context: {
            route: window.location.pathname,
            language: lang,
            active_space_id: activeSpaceId ?? null,
            user_agent: navigator.userAgent,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          },
        })
        .select("id")
        .single();

      if (error) throw error;
      setSubmittedTicketId(data.id);
      setDrafts((current) => ({
        ...current,
        [view]: { subject: "", message: "" },
      }));
      const recent = await fetchRecentTickets(userId);
      if (recent.error) {
        setTicketsError(true);
      } else {
        setTicketsError(false);
        setTickets((recent.data ?? []) as SupportTicket[]);
      }
    } catch (error) {
      const messageText = getErrorMessage(error);
      setSubmitError(
        messageText.includes("support_rate_limit") ||
          messageText.includes("support_daily_limit")
          ? t("support.rateLimitError")
          : t("support.submitError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const activeDraft = view === "faq" ? null : drafts[view];
  const formTitle =
    view === "bug" ? t("support.bugTitle") : t("support.contactTitle");
  const formHint =
    view === "bug" ? t("support.bugHint") : t("support.contactHint");

  const modal = (
    <div
      className="support-center-overlay lg-overlay-backdrop"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <section
        className="support-center-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-center-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="support-center-header">
          <span className="support-center-header-icon" aria-hidden="true">
            <CircleHelp size={22} />
          </span>
          <div>
            <h2 id="support-center-title">{t("support.modalTitle")}</h2>
            <p>{t("support.modalHint")}</p>
          </div>
          <button
            type="button"
            className="support-center-close"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("support.close")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <SegmentedControl
          value={view}
          label={t("support.modalTitle")}
          className="support-center-tabs"
          options={[
            {
              value: "faq",
              label: (
                <>
                  <CircleHelp size={14} /> {t("support.tabFaq")}
                </>
              ),
            },
            {
              value: "contact",
              label: (
                <>
                  <MessageCircle size={14} /> {t("support.tabContact")}
                </>
              ),
            },
            {
              value: "bug",
              label: (
                <>
                  <Bug size={14} /> {t("support.tabBug")}
                </>
              ),
            },
          ]}
          onChange={(nextView) => {
            setView(nextView);
            setSubmitError(null);
            setSubmittedTicketId(null);
          }}
        />

        <div className="support-center-content">
          {view === "faq" ? (
            <div className="support-faq-list">
              {FAQS.map(([questionKey, answerKey]) => (
                <details className="support-faq-item" key={questionKey}>
                  <summary>
                    <span>{t(questionKey)}</span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </summary>
                  <p>{t(answerKey)}</p>
                </details>
              ))}
            </div>
          ) : (
            <form className="support-ticket-form" onSubmit={handleSubmit}>
              <div className="support-ticket-form-heading">
                <h3>{formTitle}</h3>
                <p>{formHint}</p>
              </div>

              {submittedTicketId && (
                <div className="support-submit-success" role="status">
                  <CheckCircle2 size={20} aria-hidden="true" />
                  <span>
                    <strong>{t("support.submitSuccess")}</strong>
                    <small>
                      {t("support.ticketReference")}: #
                      {submittedTicketId.slice(0, 8).toUpperCase()}
                    </small>
                  </span>
                </div>
              )}

              <label className="support-field">
                <span>{t("support.subject")}</span>
                <input
                  value={activeDraft?.subject ?? ""}
                  onChange={(event) => updateDraft("subject", event.target.value)}
                  placeholder={t("support.subjectPlaceholder")}
                  maxLength={120}
                  disabled={submitting}
                  autoFocus
                />
              </label>

              <label className="support-field">
                <span>{t("support.message")}</span>
                <textarea
                  value={activeDraft?.message ?? ""}
                  onChange={(event) => updateDraft("message", event.target.value)}
                  placeholder={
                    view === "bug"
                      ? t("support.bugMessagePlaceholder")
                      : t("support.contactMessagePlaceholder")
                  }
                  maxLength={4000}
                  rows={6}
                  disabled={submitting}
                />
              </label>

              {view === "bug" && (
                <p className="support-technical-note">
                  {t("support.technicalNote")}
                </p>
              )}
              {userEmail && (
                <p className="support-account-note">
                  {t("support.accountEmail")}: <strong>{userEmail}</strong>
                </p>
              )}
              {submitError && <p className="error small">{submitError}</p>}

              <Button
                type="submit"
                loading={submitting}
                disabled={submitting}
                leadingIcon={<Send size={16} />}
                className="support-submit-button"
              >
                {submitting ? t("support.submitting") : t("support.submit")}
              </Button>
            </form>
          )}

          <div className="support-recent">
            <div className="support-recent-heading">
              <h3>{t("support.recent")}</h3>
              <Clock3 size={16} aria-hidden="true" />
            </div>
            {ticketsLoading ? (
              <p className="muted small">{t("support.loading")}</p>
            ) : ticketsError ? (
              <p className="muted small">{t("support.loadError")}</p>
            ) : tickets.length === 0 ? (
              <p className="muted small">{t("support.recentEmpty")}</p>
            ) : (
              <div className="support-ticket-list">
                {tickets.map((ticket) => (
                  <details className="support-ticket-item" key={ticket.id}>
                    <summary>
                      <span className="support-ticket-summary">
                        <strong>{ticket.subject}</strong>
                        <small>
                          #{ticket.id.slice(0, 8).toUpperCase()} ·{" "}
                          {new Date(ticket.created_at).toLocaleDateString(
                            lang === "vi" ? "vi-VN" : "en-US",
                          )}
                        </small>
                      </span>
                      <span
                        className={`support-ticket-status status-${ticket.status}`}
                      >
                        {statusLabel(ticket.status)}
                      </span>
                    </summary>
                    <div className="support-ticket-detail">
                      <span>
                        {ticket.kind === "bug"
                          ? t("settings.supportReportBug")
                          : t("settings.supportContact")}
                      </span>
                      {ticket.admin_reply ? (
                        <p>
                          <strong>{t("support.adminReply")}</strong>
                          {ticket.admin_reply}
                        </p>
                      ) : (
                        <p>{t("support.waitingReply")}</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}

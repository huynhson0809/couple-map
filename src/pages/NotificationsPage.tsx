import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, MessageCircle, Flame, Heart, MapPin } from 'lucide-react'
import { useNotificationFeed } from '../hooks/useNotificationFeed'
import { useCoupleCtx } from '../hooks/CoupleContext'
import { useI18n } from '../hooks/I18nContext'
import type { AppNotification } from '../types'

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
}

function notifIcon(type: AppNotification['type']) {
  switch (type) {
    case 'new_pin': return <MapPin size={18} />
    case 'reaction': return <Heart size={18} />
    case 'comment': return <MessageCircle size={18} />
    case 'streak_reminder': return <Flame size={18} />
    case 'streak_complete': return <Flame size={18} />
    case 'streak_broken': return <Flame size={18} />
    default: return <Bell size={18} />
  }
}

function notifColor(type: AppNotification['type']) {
  switch (type) {
    case 'new_pin': return '#ff676d'
    case 'reaction': return '#e91e63'
    case 'comment': return '#2196f3'
    case 'streak_reminder': return '#ff9800'
    case 'streak_complete': return '#4caf50'
    case 'streak_broken': return '#f44336'
    default: return '#666'
  }
}

export function NotificationsPage() {
  const { profile } = useCoupleCtx()
  const { t } = useI18n()
  const navigate = useNavigate()
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchMore,
    markAsRead,
    markAllAsRead,
  } = useNotificationFeed(profile?.id)
  const listRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (!listRef.current || loading || !hasMore) return
    const el = listRef.current
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchMore()
    }
  }, [loading, hasMore, fetchMore])

  function handleNotifClick(n: AppNotification) {
    if (!n.read) markAsRead(n.id)
    const pinId = n.data?.pin_id as string | undefined
    if (pinId && ['new_pin', 'reaction', 'comment'].includes(n.type)) {
      navigate('/timeline', { state: { openPinId: pinId } })
    } else if (n.type === 'streak_reminder' || n.type === 'streak_broken') {
      navigate('/wishlist')
    }
  }

  return (
    <div className="page page-notifications" ref={listRef} onScroll={handleScroll}>
      <header className="page-header">
        <h1>{t('nav.notifications')}</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            className="notif-mark-all-btn"
            onClick={markAllAsRead}
          >
            <CheckCheck size={16} />
            <span>Đánh dấu tất cả đã đọc</span>
          </button>
        )}
      </header>

      {notifications.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-emoji">🔔</div>
          <p className="muted">Chưa có thông báo nào</p>
        </div>
      )}

      <div className="notif-list">
        {notifications.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`notif-item ${n.read ? '' : 'unread'}`}
            onClick={() => handleNotifClick(n)}
          >
            <span className="notif-item-icon" style={{ background: `${notifColor(n.type)}14`, color: notifColor(n.type) }}>
              {notifIcon(n.type)}
            </span>
            <span className="notif-item-content">
              <span className="notif-item-title">{n.title}</span>
              {n.body && <span className="notif-item-body">{n.body}</span>}
              <span className="notif-item-time">{timeAgo(n.created_at)}</span>
            </span>
            {!n.read && <span className="notif-item-dot" />}
          </button>
        ))}
        {loading && <div className="notif-loading">Đang tải...</div>}
      </div>
    </div>
  )
}

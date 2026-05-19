import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { usePinsCtx } from '../hooks/PinsContext'
import { useCoupleCtx } from '../hooks/CoupleContext'
import { useI18n } from '../hooks/I18nContext'
import { getImageUrl } from '../lib/cloudinary'
import { CATEGORIES, getCategory } from '../lib/categories'
import type { Pin } from '../types'

function monthKey(d: string, lang: string) {
  const dt = new Date(d)
  return dt.toLocaleDateString(lang === 'vi' ? 'vi-VN' : undefined, {
    year: 'numeric',
    month: 'long',
  })
}

export function TimelinePage() {
  const { pins } = usePinsCtx()
  const { profile, partner } = useCoupleCtx()
  const { t, lang } = useI18n()
  const navigate = useNavigate()

  const [filter, setFilter] = useState<string | null>(null)

  const filteredPins = useMemo(() => {
    if (!filter) return pins
    return pins.filter((p) => p.category === filter)
  }, [pins, filter])

  const usedCategories = useMemo(() => {
    const ids = new Set<string>()
    pins.forEach((p) => p.category && ids.add(p.category))
    return CATEGORIES.filter((c) => ids.has(c.id))
  }, [pins])

  const grouped = useMemo(() => {
    const groups: Record<string, Pin[]> = {}
    filteredPins.forEach((p) => {
      const k = monthKey(p.created_at, lang)
      const arr = groups[k] ?? (groups[k] = [])
      arr.push(p)
    })
    return Object.entries(groups)
  }, [filteredPins, lang])

  function flyToPin(p: Pin) {
    navigate('/', { state: { flyTo: { lat: p.lat, lng: p.lng, pinId: p.id } } })
  }

  if (pins.length === 0) {
    return (
      <div className="page empty-state">
        <div className="empty-emoji">📍</div>
        <h2>{t('timeline.empty')}</h2>
        <p className="muted">{t('timeline.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="page page-timeline">
      <header className="page-header">
        <h1>{t('timeline.title')}</h1>
        <p className="muted">
          {filteredPins.length} {t('timeline.memoriesShared')}
        </p>
      </header>

      {usedCategories.length > 0 && (
        <div className="filter-row">
          <button
            className={`filter-chip ${filter === null ? 'active' : ''}`}
            onClick={() => setFilter(null)}
          >
            {lang === 'vi' ? 'Tất cả' : 'All'} ({pins.length})
          </button>
          {usedCategories.map((c) => {
            const count = pins.filter((p) => p.category === c.id).length
            const active = filter === c.id
            return (
              <button
                key={c.id}
                className={`filter-chip ${active ? 'active' : ''}`}
                style={active ? { background: c.color, borderColor: c.color, color: 'white' } : undefined}
                onClick={() => setFilter(active ? null : c.id)}
              >
                <span className="emoji">{c.emoji}</span>
                <span>{c.label}</span>
                <span className="filter-count">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {grouped.map(([month, items]) => (
        <section key={month} className="timeline-month">
          <h3 className="month-label">{month}</h3>
          <div className="timeline-list">
            {items.map((p) => {
              const cover = p.images?.[0]?.cloudinary_url
              const cat = getCategory(p.category)
              const who =
                p.created_by === profile?.id
                  ? profile?.display_name ?? t('common.you')
                  : partner?.display_name ?? t('common.partner')
              return (
                <button key={p.id} className="timeline-card" onClick={() => flyToPin(p)}>
                  {cover ? (
                    <img src={getImageUrl(cover, 200)} alt="" className="timeline-thumb" />
                  ) : (
                    <div className="timeline-thumb empty">{cat?.emoji ?? '📷'}</div>
                  )}
                  <div className="timeline-content">
                    <div className="timeline-title-row">
                      <span className="timeline-title">{p.title}</span>
                      {cat && (
                        <span
                          className="category-badge sm"
                          style={{ background: `${cat.color}1a`, color: cat.color }}
                        >
                          {cat.emoji} {cat.label}
                        </span>
                      )}
                    </div>
                    {p.note && <div className="timeline-note">{p.note}</div>}
                    <div className="timeline-meta">
                      <MapPin size={12} /> {p.city ?? '—'} · {who} ·{' '}
                      {new Date(p.created_at).toLocaleDateString(
                        lang === 'vi' ? 'vi-VN' : undefined,
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

import { MapPin, Globe2, Sparkles, CalendarHeart, Plane, Star } from 'lucide-react'
import { useCoupleCtx } from '../hooks/CoupleContext'
import { usePinsCtx } from '../hooks/PinsContext'
import { useStats } from '../hooks/useStats'
import { useI18n } from '../hooks/I18nContext'

export function StatsPage() {
  const { couple, partner, profile } = useCoupleCtx()
  const { pins } = usePinsCtx()
  const { t, lang } = useI18n()
  const s = useStats(pins, couple)

  return (
    <div className="page page-stats">
      <header className="page-header">
        <h1>{t('stats.title')}</h1>
        <p className="muted">
          {profile?.display_name ?? t('common.you')} & {partner?.display_name ?? t('common.them')}
        </p>
      </header>

      <div className="stat-grid">
        <StatCard icon={<Sparkles />} value={s.totalPins} label={t('stats.memories')} color="#e24b4a" />
        <StatCard icon={<MapPin />} value={s.cities} label={t('stats.cities')} color="#378add" />
        <StatCard icon={<Globe2 />} value={s.countries} label={t('stats.countries')} color="#9333ea" />
        <StatCard
          icon={<CalendarHeart />}
          value={s.daysTogether ?? '—'}
          label={t('stats.daysTogether')}
          color="#ec4899"
        />
        <StatCard
          icon={<Plane />}
          value={`${s.farthestKm} km`}
          label={t('stats.farthest')}
          color="#f59e0b"
        />
        <StatCard
          icon={<Star />}
          value={
            s.firstPin
              ? new Date(s.firstPin.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : undefined)
              : '—'
          }
          label={t('stats.firstMemory')}
          color="#10b981"
        />
      </div>

      {s.cityList.length > 0 && (
        <section className="stat-section">
          <h3>{t('stats.placesBeen')}</h3>
          <div className="chip-row">
            {s.cityList.map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode
  value: React.ReactNode
  label: string
  color: string
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${color}1a`, color }}>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

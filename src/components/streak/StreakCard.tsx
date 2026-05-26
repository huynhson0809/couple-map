import { CheckCircle2, Flame, Link2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useI18n } from '../../hooks/I18nContext'
import type { User } from '../../types'

function initial(name: string | null | undefined, fallback: string) {
  return (name?.trim()?.[0] || fallback).toUpperCase()
}

function weekIndexFromIso(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`)
  const sundayFirst = date.getUTCDay()
  return (sundayFirst + 6) % 7
}

function weekStartFromIso(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - weekIndexFromIso(isoDate))
  return date.toISOString().slice(0, 10)
}

function isSameWeek(a: string, b: string) {
  return weekStartFromIso(a) === weekStartFromIso(b)
}

interface StreakCardProps {
  currentCount: number
  bestCount: number
  todayDate: string
  lastCompletedDate: string | null
  todayCompleted: boolean
  youPosted: boolean
  partnerPosted: boolean
  atRisk: boolean
  loading?: boolean
  profile: User | null
  partner: User | null
}

export function StreakCard({
  currentCount,
  bestCount,
  todayDate,
  lastCompletedDate,
  todayCompleted,
  youPosted,
  partnerPosted,
  atRisk,
  loading,
  profile,
  partner,
}: StreakCardProps) {
  const { t, lang } = useI18n()
  const weekLabels = lang === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const todayIndex = weekIndexFromIso(todayDate)
  const lastCompletedIndex =
    lastCompletedDate && isSameWeek(todayDate, lastCompletedDate)
      ? weekIndexFromIso(lastCompletedDate)
      : -1
  const activeIndex = todayCompleted ? todayIndex : lastCompletedIndex
  const markerIndex = activeIndex >= 0 ? activeIndex : todayIndex
  const markerPercent = `${(markerIndex / 6) * 100}%`
  const progressPercent = activeIndex >= 0 ? `${(activeIndex / 6) * 100}%` : '0%'
  const weekRailStyle = {
    '--streak-week-progress': progressPercent,
    '--streak-week-today': markerPercent,
  } as CSSProperties
  const pendingToday = !loading && !todayCompleted && currentCount > 0

  const status = loading
    ? t('streak.loading')
    : todayCompleted
      ? t('streak.completed')
      : youPosted && !partnerPosted
        ? t('streak.partnerMissing')
        : !youPosted && partnerPosted
          ? t('streak.youMissing')
          : currentCount > 0
            ? t('streak.bothMissing')
            : t('streak.startToday')

  return (
    <section className={`streak-card ${todayCompleted ? 'complete' : atRisk ? 'risk' : 'idle'}`}>
      <div className="streak-card-shine" aria-hidden="true" />
      <div className="streak-copy">
        <div className="streak-kicker">
          <Flame size={15} fill="currentColor" />
          <span>{t('streak.title')}</span>
        </div>
        <div className="streak-count">
          <strong>{currentCount}</strong>
          <span>{t('streak.days')}</span>
        </div>
        <p>{status}</p>
        {pendingToday && <span className="streak-pending">{t('streak.pendingToday')}</span>}
      </div>

      <div className="streak-chain" aria-label={status}>
        <div className={`streak-person ${youPosted ? 'posted' : ''}`}>
          <span>{initial(profile?.display_name, 'Y')}</span>
          <small>{t('common.you')}</small>
        </div>
        <div className={`streak-link ${todayCompleted ? 'complete' : youPosted || partnerPosted ? 'half' : ''}`}>
          {todayCompleted ? <CheckCircle2 size={20} /> : <Link2 size={20} />}
        </div>
        <div className={`streak-person ${partnerPosted ? 'posted' : ''}`}>
          <span>{initial(partner?.display_name, 'P')}</span>
          <small title={partner?.display_name ?? t('common.partner')}>
            {partner?.display_name ?? t('common.partner')}
          </small>
        </div>
      </div>

      <div className="streak-week" style={weekRailStyle}>
        <div className="streak-week-days" aria-hidden="true">
          {weekLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className={`${index === todayIndex && todayCompleted ? 'today' : ''} ${index <= activeIndex ? 'active' : ''}`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="streak-week-track" aria-hidden="true">
          <span className="streak-week-fill" />
          <span className={`streak-week-marker ${todayCompleted ? 'complete' : 'waiting'}`}>
            {todayCompleted && <CheckCircle2 size={15} />}
          </span>
        </div>
      </div>

      <p className="streak-howto">{t('streak.howTo')}</p>

      <div className="streak-best">
        {t('streak.best')} <strong>{bestCount}</strong>
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, MapPin, Search, Check, Sparkles, Globe2, CalendarHeart, Plane, X, Compass, Undo2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCoupleCtx } from '../hooks/CoupleContext'
import { useBucket } from '../hooks/useBucket'
import { useI18n } from '../hooks/I18nContext'
import { useStreak } from '../hooks/useStreak'
import { useStatsApi } from '../hooks/useStatsApi'
import { Button } from '../components/ui/Button'
import { BottomSheet } from '../components/ui/BottomSheet'
import { StreakCard } from '../components/streak/StreakCard'
import { searchPlaces, type PlaceSearchResult } from '../lib/placeSearch'

export function WishlistPage() {
  const { user } = useAuth()
  const { couple, profile, partner } = useCoupleCtx()
  const { items, addItem, removeItem, markDone, markDream } = useBucket(couple?.id, user?.id)
  const { t } = useI18n()
  const streak = useStreak(couple, profile?.id ?? user?.id)
  const { stats } = useStatsApi(couple?.id, couple)
  const navigate = useNavigate()

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PlaceSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statDetail, setStatDetail] = useState<'cities' | 'countries' | null>(null)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const language = 'vi'
        const results = await searchPlaces(query, { language })
        setResults(results.slice(0, 6))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [query])

  function resetForm() {
    setTitle('')
    setQuery('')
    setResults([])
    setSelected(null)
    setError(null)
  }

  function openAdd() {
    resetForm()
    setAdding(true)
  }

  function closeAdd() {
    setAdding(false)
    resetForm()
  }

  async function handleSave() {
    if (!selected) {
      setError(t('wish.pickFirst'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const lat = parseFloat(selected.lat)
      const lng = parseFloat(selected.lon)
      await addItem({
        title: title.trim() || selected.display_name.split(',')[0],
        lat,
        lng,
      })
      closeAdd()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const dreams = items.filter((b) => b.status === 'dream')
  const done = items.filter((b) => b.status === 'done')

  return (
    <div className="page page-wishlist">
      <header className="page-header">
        <h1>{t('wish.title')}</h1>
        <p className="muted">{t('wish.subtitle')}</p>
      </header>

      {!streak.error && (
        <StreakCard
          currentCount={streak.currentCount}
          bestCount={streak.bestCount}
          todayDate={streak.todayDate}
          lastCompletedDate={streak.lastCompletedDate}
          todayCompleted={streak.todayCompleted}
          youPosted={streak.youPosted}
          partnerPosted={streak.partnerPosted}
          atRisk={streak.atRisk}
          loading={streak.loading}
          profile={profile}
          partner={partner}
        />
      )}

      <section className="stats-panel" aria-label={t('stats.title')}>
        <div className="stats-panel-header">
          <span>{t('stats.title')}</span>
          <small>{stats.totalPins} {t('stats.memories')}</small>
        </div>
        <div className="stat-grid">
          <div className="stat-card stat-card-coral">
            <div className="stat-icon"><Sparkles size={20} /></div>
            <div className="stat-value">{stats.totalPins}</div>
            <div className="stat-label">{t('stats.memories')}</div>
          </div>
          <button
            type="button" className="stat-card stat-card-blue clickable"
            onClick={() => setStatDetail('cities')}
          >
            <div className="stat-icon"><MapPin size={20} /></div>
            <div className="stat-value">{stats.cities}</div>
            <div className="stat-label">{t('stats.cities')}</div>
          </button>
          <button
            type="button" className="stat-card stat-card-purple clickable"
            onClick={() => setStatDetail('countries')}
          >
            <div className="stat-icon"><Globe2 size={20} /></div>
            <div className="stat-value">{stats.countries}</div>
            <div className="stat-label">{t('stats.countries')}</div>
          </button>
          <div className="stat-card stat-card-rose">
            <div className="stat-icon"><CalendarHeart size={20} /></div>
            <div className="stat-value">{stats.daysTogether ?? '—'}</div>
            <div className="stat-label">{t('stats.daysTogether')}</div>
          </div>
          <div className="stat-card stat-card-amber">
            <div className="stat-icon"><Plane size={20} /></div>
            <div className="stat-value">{stats.farthestKm} km</div>
            <div className="stat-label">{t('stats.farthest')}</div>
          </div>
        </div>
      </section>

      {statDetail && createPortal(
        <div className="stat-detail-overlay" onClick={() => setStatDetail(null)}>
          <div className="stat-detail-sheet wish-stat-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="stat-detail-header">
              <h3>{statDetail === 'cities' ? t('stats.cities') : t('stats.countries')}</h3>
              <button type="button" className="stat-detail-close" onClick={() => setStatDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="stat-detail-list">
              {(statDetail === 'cities' ? stats.cityList : stats.countryList).length === 0 && (
                <p className="muted stat-detail-empty">Chưa có dữ liệu</p>
              )}
              {(statDetail === 'cities' ? stats.cityList : stats.countryList).map((item, i) => (
                <div key={`${item}-${i}`} className="stat-detail-item">
                  <span className="stat-detail-rank">{i + 1}</span>
                  <span className="stat-detail-item-main">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      <Button onClick={openAdd} leadingIcon={<Plus size={18} />} className="wish-add-btn">
        {t('wish.add')}
      </Button>

      {dreams.length === 0 && done.length === 0 ? (
        <div className="empty-state wish-empty-state">
          <div className="empty-emoji">🌍</div>
          <p className="muted">{t('wish.empty')}</p>
        </div>
      ) : (
        <>
          {dreams.length > 0 && (
            <section className="wish-section">
              <h3>{t('wish.dreaming')} ({dreams.length})</h3>
              <div className="stack">
                {dreams.map((b) => (
                  <div key={b.id} className="wish-card">
                    <div className="wish-icon" aria-hidden="true">
                      <Compass size={18} />
                    </div>
                    <div className="wish-body">
                      <div className="wish-card-kicker">{t('wish.dreaming')}</div>
                      <div className="wish-title">{b.title}</div>
                      <button
                        type="button"
                        className="wish-map-btn"
                        onClick={() =>
                          navigate('/', { state: { flyTo: { lat: b.lat, lng: b.lng } } })
                        }
                      >
                        <MapPin size={13} aria-hidden="true" /> {t('wish.showOnMap')}
                      </button>
                    </div>
                    <div className="wish-actions">
                      <button
                        type="button"
                        className="icon-btn done-btn"
                        onClick={() => markDone(b.id)}
                        title={t('wish.markVisited')}
                        aria-label={t('wish.markVisited')}
                        aria-pressed={false}
                      >
                        <Check size={18} />
                      </button>
                      <button type="button" className="icon-btn" onClick={() => removeItem(b.id)} title={t('wish.delete')} aria-label={t('wish.delete')}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section className="wish-section">
              <h3>{t('wish.visited')} ({done.length})</h3>
              <div className="stack">
                {done.map((b) => (
                  <div key={b.id} className="wish-card done">
                    <div className="wish-icon" aria-hidden="true">
                      <Check size={18} />
                    </div>
                    <div className="wish-body">
                      <div className="wish-card-kicker">{t('wish.visited')}</div>
                      <div className="wish-title">{b.title}</div>
                      <button
                        type="button"
                        className="wish-map-btn"
                        onClick={() =>
                          navigate('/', { state: { flyTo: { lat: b.lat, lng: b.lng } } })
                        }
                      >
                        <MapPin size={13} aria-hidden="true" /> {t('wish.showOnMap')}
                      </button>
                    </div>
                    <div className="wish-actions">
                      <button
                        type="button"
                        className="icon-btn done-btn active"
                        onClick={() => markDream(b.id)}
                        title={t('wish.markDreaming')}
                        aria-label={t('wish.markDreaming')}
                        aria-pressed={true}
                      >
                        <Undo2 size={17} />
                      </button>
                      <button type="button" className="icon-btn" onClick={() => removeItem(b.id)} title={t('wish.delete')} aria-label={t('wish.delete')}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <BottomSheet open={adding} onClose={closeAdd} title={t('wish.adding')}>
        <div className="wish-form">
          <div>
            <div className="field-label">{t('wish.search')}</div>
            <div className="search-input">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder={t('wish.searchPlaceholder')}
                value={query}
                onChange={(e) => {
                  const next = e.target.value
                  setQuery(next)
                  setSelected(null)
                  if (!next.trim()) setResults([])
                }}
                autoFocus
              />
            </div>
            {searching && <div className="muted small" style={{ marginTop: 6 }}>{t('wish.searching')}</div>}
            {!selected && results.length > 0 && (
              <div className="search-results">
                {results.map((r, i) => (
                  <button
                    key={`${r.lat}-${r.lon}-${i}`}
                    type="button"
                    className="search-result"
                    onClick={() => {
                      setSelected(r)
                      setQuery(r.display_name.split(',')[0])
                    }}
                  >
                    <MapPin size={14} />
                    <span>{r.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="selected-place">
              <MapPin size={16} aria-hidden="true" />
              <div className="selected-place-copy">
                <div className="selected-name">{selected.display_name.split(',')[0]}</div>
                <div className="muted small">{selected.display_name}</div>
              </div>
              <button
                type="button"
                className="selected-place-clear"
                onClick={() => {
                  setSelected(null)
                  setQuery('')
                  setResults([])
                  setError(null)
                }}
                aria-label={t('common.cancel')}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div>
            <div className="field-label">{t('wish.nickname')}</div>
            <input
              type="text"
              placeholder={t('wish.nicknamePh')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {error && <p className="error">{error}</p>}

          <div className="row">
            <Button type="button" variant="secondary" onClick={closeAdd} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={busy || !selected}
              className="wish-submit-btn"
              style={{ flex: 1 }}
            >
              {busy ? t('wish.saving') : t('wish.addToList')}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

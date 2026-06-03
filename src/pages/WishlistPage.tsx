import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, MapPin, Search, Check, Sparkles, Globe2, CalendarHeart, Plane } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCoupleCtx } from '../hooks/CoupleContext'
import { usePinsCtx } from '../hooks/PinsContext'
import { useBucket } from '../hooks/useBucket'
import { useI18n } from '../hooks/I18nContext'
import { useStreak } from '../hooks/useStreak'
import { useStats } from '../hooks/useStats'
import { Button } from '../components/ui/Button'
import { BottomSheet } from '../components/ui/BottomSheet'
import { StreakCard } from '../components/streak/StreakCard'
import { searchPlaces, type PlaceSearchResult } from '../lib/placeSearch'

export function WishlistPage() {
  const { user } = useAuth()
  const { couple, profile, partner } = useCoupleCtx()
  const { pins } = usePinsCtx()
  const { items, addItem, removeItem, markDone, markDream } = useBucket(couple?.id, user?.id)
  const { t } = useI18n()
  const streak = useStreak(couple, profile?.id ?? user?.id)
  const stats = useStats(pins, couple)
  const navigate = useNavigate()

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PlaceSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ff5a5f1a', color: '#ff5a5f' }}><Sparkles size={20} /></div>
          <div className="stat-value">{stats.totalPins}</div>
          <div className="stat-label">{t('stats.memories')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#378add1a', color: '#378add' }}><MapPin size={20} /></div>
          <div className="stat-value">{stats.cities}</div>
          <div className="stat-label">{t('stats.cities')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#9333ea1a', color: '#9333ea' }}><Globe2 size={20} /></div>
          <div className="stat-value">{stats.countries}</div>
          <div className="stat-label">{t('stats.countries')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ff4d571a', color: '#ff4d57' }}><CalendarHeart size={20} /></div>
          <div className="stat-value">{stats.daysTogether ?? '—'}</div>
          <div className="stat-label">{t('stats.daysTogether')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f59e0b1a', color: '#f59e0b' }}><Plane size={20} /></div>
          <div className="stat-value">{stats.farthestKm} km</div>
          <div className="stat-label">{t('stats.farthest')}</div>
        </div>
      </div>

      <Button onClick={openAdd} style={{ width: '100%' }}>
        <Plus size={18} /> {t('wish.add')}
      </Button>

      {dreams.length === 0 && done.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 32 }}>
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
                    <div className="wish-icon">★</div>
                    <div className="wish-body">
                      <div className="wish-title">{b.title}</div>
                      <button
                        className="link-btn small"
                        onClick={() =>
                          navigate('/', { state: { flyTo: { lat: b.lat, lng: b.lng } } })
                        }
                      >
                        <MapPin size={12} /> {t('wish.showOnMap')}
                      </button>
                    </div>
                    <div className="wish-actions">
                      <button
                        className="icon-btn done-btn"
                        onClick={() => markDone(b.id)}
                        title={t('wish.markVisited')}
                        aria-label={t('wish.markVisited')}
                        aria-pressed={false}
                      >
                        <Check size={18} />
                      </button>
                      <button className="icon-btn" onClick={() => removeItem(b.id)} title={t('wish.delete')} aria-label={t('wish.delete')}>
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
                    <div className="wish-icon">
                      <Check size={18} />
                    </div>
                    <div className="wish-body">
                      <div className="wish-title">{b.title}</div>
                    </div>
                    <div className="wish-actions">
                      <button
                        className="icon-btn done-btn active"
                        onClick={() => markDream(b.id)}
                        title={t('wish.markDreaming')}
                        aria-label={t('wish.markDreaming')}
                        aria-pressed={true}
                      >
                        <Check size={18} />
                      </button>
                      <button className="icon-btn" onClick={() => removeItem(b.id)} title={t('wish.delete')} aria-label={t('wish.delete')}>
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
              <MapPin size={16} />
              <div>
                <div className="selected-name">{selected.display_name.split(',')[0]}</div>
                <div className="muted small">{selected.display_name}</div>
              </div>
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

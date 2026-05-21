import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { List } from 'react-window'
import { MapPin, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { usePinsCtx } from '../hooks/PinsContext'
import { useCoupleCtx } from '../hooks/CoupleContext'
import { useI18n } from '../hooks/I18nContext'
import { useCategoriesCtx } from '../hooks/CategoriesContext'
import { useTimelinePins } from '../hooks/useTimelinePins'
import { getImageUrl } from '../lib/cloudinary'
import { BottomSheet } from '../components/ui/BottomSheet'
import { PinDetail } from '../components/pins/PinDetail'
import type { Pin } from '../types'

function monthKey(d: string, lang: string) {
  const dt = new Date(d)
  return dt.toLocaleDateString(lang === 'vi' ? 'vi-VN' : undefined, {
    year: 'numeric',
    month: 'long',
  })
}

function useDebouncedValue(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}

type TimelineRow =
  | { type: 'month'; id: string; label: string }
  | { type: 'pin'; id: string; pin: Pin }

interface TimelineRowProps {
  rows: TimelineRow[]
  lang: string
  profileId?: string
  profileName: string
  partnerName: string
  favoritesLabel: string
  getCategory: ReturnType<typeof useCategoriesCtx>['getCategory']
  openPinDetail: (pin: Pin) => void
}

function TimelineRowItem({
  index,
  style,
  rows,
  lang,
  profileId,
  profileName,
  partnerName,
  favoritesLabel,
  getCategory,
  openPinDetail,
}: TimelineRowProps & { index: number; style: CSSProperties }) {
  const row = rows[index]
  if (!row) return null

  if (row.type === 'month') {
    return (
      <div style={style} className="timeline-virtual-row month-row">
        <h3 className="month-label">{row.label}</h3>
      </div>
    )
  }

  const p = row.pin
  const cover = p.images?.[0]?.cloudinary_url
  const cat = getCategory(p.category)
  const who = p.created_by === profileId ? profileName : partnerName

  return (
    <div style={style} className="timeline-virtual-row pin-row">
      <div className={`timeline-card ${p.is_favorite ? 'favorite' : ''}`}>
        <button type="button" className="timeline-card-open" onClick={() => openPinDetail(p)}>
          {cover ? (
            <img
              src={getImageUrl(cover, 180, 70)}
              alt=""
              className="timeline-thumb"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          ) : (
            <div className="timeline-thumb empty">{cat?.emoji ?? '📷'}</div>
          )}
          <div className={`timeline-content ${p.is_favorite ? 'has-favorite-action' : ''}`}>
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
              {new Date(p.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : undefined)}
            </div>
          </div>
        </button>
        {p.is_favorite && (
          <span className="timeline-favorite-toggle" aria-hidden="true">
            <Star size={12} fill="currentColor" /> {favoritesLabel}
          </span>
        )}
      </div>
    </div>
  )
}

export function TimelinePage() {
  const { pins: livePins, deletePin } = usePinsCtx()
  const { couple, profile, partner } = useCoupleCtx()
  const { t, lang } = useI18n()
  const { allCategories, getCategory } = useCategoriesCtx()
  const navigate = useNavigate()

  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [creatorFilter, setCreatorFilter] = useState<string>('all')
  const [addressFilter, setAddressFilter] = useState('')
  const [draftCategoryFilters, setDraftCategoryFilters] = useState<string[]>([])
  const [draftFavoriteOnly, setDraftFavoriteOnly] = useState(false)
  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo, setDraftDateTo] = useState('')
  const [draftCreatorFilter, setDraftCreatorFilter] = useState<string>('all')
  const [draftAddressFilter, setDraftAddressFilter] = useState('')
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const filterPopoverRef = useRef<HTMLDivElement | null>(null)
  const debouncedAddressFilter = useDebouncedValue(addressFilter)

  const timelineFilters = useMemo(
    () => ({
      categoryIds: categoryFilters,
      favoriteOnly,
      dateFrom,
      dateTo,
      creatorId: creatorFilter,
      address: debouncedAddressFilter,
    }),
    [categoryFilters, creatorFilter, dateFrom, dateTo, debouncedAddressFilter, favoriteOnly],
  )

  const {
    pins: timelinePins,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useTimelinePins(couple?.id, timelineFilters)

  const favoriteCount = livePins.filter((p) => p.is_favorite).length

  const usedCategories = useMemo(() => {
    const ids = new Set<string>()
    livePins.forEach((p) => p.category && ids.add(p.category))
    return allCategories.filter((c) => ids.has(c.id))
  }, [allCategories, livePins])

  const rows = useMemo(() => {
    const groups: Record<string, Pin[]> = {}
    timelinePins.forEach((p) => {
      const k = monthKey(p.created_at, lang)
      const arr = groups[k] ?? (groups[k] = [])
      arr.push(p)
    })
    return Object.entries(groups).flatMap<TimelineRow>(([month, items]) => [
      { type: 'month', id: `month-${month}`, label: month },
      ...items.map((pin) => ({ type: 'pin' as const, id: pin.id, pin })),
    ])
  }, [timelinePins, lang])

  const listHeight = Math.max(1, rows.reduce((height, row) => height + (row.type === 'month' ? 44 : 112), 0))

  function flyToPin(p: Pin) {
    setSelectedPin(null)
    navigate('/', {
      state: {
        flyTo: {
          lat: p.lat,
          lng: p.lng,
          pinId: p.id,
          openDetail: false,
        },
      },
    })
  }

  function openPinDetail(p: Pin) {
    setSelectedPin(p)
  }

  function clearAdvancedFilters() {
    setCategoryFilters([])
    setFavoriteOnly(false)
    setDateFrom('')
    setDateTo('')
    setCreatorFilter('all')
    setAddressFilter('')
    setDraftCategoryFilters([])
    setDraftFavoriteOnly(false)
    setDraftDateFrom('')
    setDraftDateTo('')
    setDraftCreatorFilter('all')
    setDraftAddressFilter('')
  }

  function toggleDraftCategory(categoryId: string) {
    setDraftCategoryFilters((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    )
  }

  function syncDraftFilters() {
    setDraftCategoryFilters(categoryFilters)
    setDraftFavoriteOnly(favoriteOnly)
    setDraftDateFrom(dateFrom)
    setDraftDateTo(dateTo)
    setDraftCreatorFilter(creatorFilter)
    setDraftAddressFilter(addressFilter)
  }

  function applyDraftFilters() {
    setCategoryFilters(draftCategoryFilters)
    setFavoriteOnly(draftFavoriteOnly)
    setDateFrom(draftDateFrom)
    setDateTo(draftDateTo)
    setCreatorFilter(draftCreatorFilter)
    setAddressFilter(draftAddressFilter)
    setFiltersOpen(false)
  }

  const hasAdvancedFilters =
    categoryFilters.length > 0 ||
    favoriteOnly ||
    !!dateFrom ||
    !!dateTo ||
    creatorFilter !== 'all' ||
    !!addressFilter.trim()
  const activeFilterCount =
    categoryFilters.length +
    (favoriteOnly ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (creatorFilter !== 'all' ? 1 : 0) +
    (addressFilter.trim() ? 1 : 0)

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore || loading || loadingMore) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore()
      },
      { rootMargin: '360px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore, loading, loadingMore, rows.length])

  useEffect(() => {
    if (!filtersOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && filterPopoverRef.current?.contains(target)) return
      setFiltersOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [filtersOpen])

  if (!loading && total === 0 && !hasAdvancedFilters) {
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
          {total} {t('timeline.memoriesShared')}
        </p>
      </header>

      <div className="timeline-filter-popover" ref={filterPopoverRef}>
        <div className="timeline-filter-summary">
          <button
            type="button"
            className={`timeline-filter-toggle ${filtersOpen ? 'active' : ''}`}
            onClick={() => {
              setFiltersOpen((open) => {
                if (!open) syncDraftFilters()
                return !open
              })
            }}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={16} />
            <span>{lang === 'vi' ? 'Bộ lọc' : 'Filters'}</span>
            {activeFilterCount > 0 && <span className="timeline-filter-count">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button type="button" className="timeline-filter-reset" onClick={() => {
              clearAdvancedFilters()
            }}>
              <X size={14} /> {t('timeline.clearFilters')}
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="timeline-filter-panel">
            {(usedCategories.length > 0 || favoriteCount > 0) && (
              <div className="filter-row">
                <button
                  type="button"
                  className={`filter-chip ${draftCategoryFilters.length === 0 && !draftFavoriteOnly ? 'active' : ''}`}
                  onClick={() => {
                    setDraftCategoryFilters([])
                    setDraftFavoriteOnly(false)
                  }}
                >
                  {lang === 'vi' ? 'Tất cả' : 'All'} ({livePins.length})
                </button>
                {favoriteCount > 0 && (
                  <button
                    type="button"
                    className={`filter-chip favorite-filter ${draftFavoriteOnly ? 'active' : ''}`}
                    onClick={() => setDraftFavoriteOnly((value) => !value)}
                  >
                    <Star size={14} fill="currentColor" />
                    <span>{t('timeline.favorites')}</span>
                    <span className="filter-count">{favoriteCount}</span>
                  </button>
                )}
                {usedCategories.map((c) => {
                  const count = livePins.filter((p) => p.category === c.id).length
                  const active = draftCategoryFilters.includes(c.id)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      className={`filter-chip category-filter ${active ? 'active' : ''}`}
                      style={active ? ({ '--tag-active-bg': c.color } as React.CSSProperties) : undefined}
                      onClick={() => toggleDraftCategory(c.id)}
                    >
                      <span className="emoji">{c.emoji}</span>
                      <span>{c.label}</span>
                      <span className="filter-count">{count}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="timeline-advanced-filters">
              <div className="timeline-filter-field">
                <label>{t('timeline.fromDate')}</label>
                <div className="timeline-date-input">
                  <input
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                    aria-label={t('timeline.fromDate')}
                  />
                  {!draftDateFrom && <span className="timeline-date-placeholder">dd/mm/yyyy</span>}
                </div>
              </div>
              <div className="timeline-filter-field">
                <label>{t('timeline.toDate')}</label>
                <div className="timeline-date-input">
                  <input
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                    aria-label={t('timeline.toDate')}
                  />
                  {!draftDateTo && <span className="timeline-date-placeholder">dd/mm/yyyy</span>}
                </div>
              </div>
              <div className="timeline-filter-field">
                <label>{t('timeline.creator')}</label>
                <select value={draftCreatorFilter} onChange={(e) => setDraftCreatorFilter(e.target.value)}>
                  <option value="all">{t('timeline.creatorAll')}</option>
                  {profile && (
                    <option value={profile.id}>
                      {profile.display_name ?? t('common.you')}
                    </option>
                  )}
                  {partner && (
                    <option value={partner.id}>
                      {partner.display_name ?? t('common.partner')}
                    </option>
                  )}
                </select>
              </div>
              <div className="timeline-filter-field address">
                <label>{t('timeline.address')}</label>
                <div className="timeline-address-filter">
                  <Search size={14} />
                  <input
                    type="search"
                    value={draftAddressFilter}
                    onChange={(e) => setDraftAddressFilter(e.target.value)}
                    placeholder={t('timeline.addressPlaceholder')}
                  />
                </div>
              </div>
            </div>
            <div className="timeline-filter-actions">
              <button type="button" className="timeline-filter-search-btn" onClick={applyDraftFilters}>
                <Search size={15} />
                <span>{lang === 'vi' ? 'Tìm kiếm' : 'Search'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="timeline-empty-filter">
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="timeline-empty-filter">
          <p>{lang === 'vi' ? 'Đang tải kỷ niệm...' : 'Loading memories...'}</p>
        </div>
      )}

      {!loading && timelinePins.length === 0 && (
        <div className="timeline-empty-filter">
          <p>{t('timeline.noResults')}</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <List<TimelineRowProps>
          className="timeline-virtual-list"
          rowComponent={TimelineRowItem}
          rowCount={rows.length}
          rowHeight={(index, props) => (props.rows[index]?.type === 'month' ? 44 : 112)}
          rowProps={{
            rows,
            lang,
            profileId: profile?.id,
            profileName: profile?.display_name ?? t('common.you'),
            partnerName: partner?.display_name ?? t('common.partner'),
            favoritesLabel: t('timeline.favorites'),
            getCategory,
            openPinDetail,
          }}
          overscanCount={6}
          defaultHeight={listHeight}
          style={{ height: listHeight, overflow: 'visible' }}
        />
      )}
      {hasMore && <div ref={loadMoreRef} className="timeline-load-sentinel" aria-hidden="true" />}
      <div className="timeline-bottom-spacer" aria-hidden="true" />
      {loadingMore && (
        <div className="timeline-loading-more">
          {lang === 'vi' ? 'Đang tải thêm...' : 'Loading more...'}
        </div>
      )}
      <BottomSheet
        open={!!selectedPin}
        onClose={() => setSelectedPin(null)}
        title={t('pin.memory')}
      >
        {selectedPin && (
          <PinDetail
            pin={timelinePins.find((p) => p.id === selectedPin.id) ?? livePins.find((p) => p.id === selectedPin.id) ?? selectedPin}
            currentUserId={profile?.id}
            currentUserName={profile?.display_name ?? null}
            onShowOnMap={flyToPin}
            onDelete={async (id) => {
              await deletePin(id)
              setSelectedPin(null)
            }}
            onUpdated={() => {
              refresh()
              setSelectedPin(null)
            }}
            onFavoriteUpdated={(updated) => {
              setSelectedPin(updated)
              refresh()
            }}
          />
        )}
      </BottomSheet>
    </div>
  )
}

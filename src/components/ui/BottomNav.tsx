import { NavLink } from 'react-router-dom'
import { Map, Clock, BarChart3, Flame, Settings } from 'lucide-react'
import { useI18n } from '../../hooks/I18nContext'

export function BottomNav() {
  const { t } = useI18n()
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <Map size={22} />
        <span>{t('nav.map')}</span>
      </NavLink>
      <NavLink to="/timeline" className={({ isActive }) => (isActive ? 'active' : '')}>
        <Clock size={22} />
        <span>{t('nav.timeline')}</span>
      </NavLink>
      <NavLink to="/wishlist" className={({ isActive }) => (isActive ? 'active' : '')}>
        <Flame size={22} />
        <span>{t('nav.wishlist')}</span>
      </NavLink>
      <NavLink to="/stats" className={({ isActive }) => (isActive ? 'active' : '')}>
        <BarChart3 size={22} />
        <span>{t('nav.stats')}</span>
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
        <Settings size={22} />
        <span>{t('nav.settings')}</span>
      </NavLink>
    </nav>
  )
}

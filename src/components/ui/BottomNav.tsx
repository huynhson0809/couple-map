import { NavLink } from "react-router-dom";
import { Map, Clock, Bell, Flame, Settings } from "lucide-react";
import { useI18n } from "../../hooks/I18nContext";
import { useNotifFeed } from "../../hooks/NotificationFeedContext";

export function BottomNav() {
  const { t } = useI18n();
  const { unreadCount } = useNotifFeed();
  return (
    <nav className="bottom-nav lg-bottom-nav" aria-label="Primary">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `lg-bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <Map size={22} />
        <span>{t("nav.map")}</span>
      </NavLink>
      <NavLink
        to="/timeline"
        className={({ isActive }) =>
          `lg-bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <Clock size={22} />
        <span>{t("nav.timeline")}</span>
      </NavLink>
      <NavLink
        to="/wishlist"
        className={({ isActive }) =>
          `lg-bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <Flame size={22} />
        <span>{t("nav.wishlist")}</span>
      </NavLink>
      <NavLink
        to="/notifications"
        className={({ isActive }) =>
          `lg-bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <span className="nav-icon-wrap">
          <Bell size={22} />
          {unreadCount > 0 && (
            <span className="nav-badge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
        <span>{t("nav.notifications")}</span>
      </NavLink>
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `lg-bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <Settings size={22} />
        <span>{t("nav.settings")}</span>
      </NavLink>
    </nav>
  );
}

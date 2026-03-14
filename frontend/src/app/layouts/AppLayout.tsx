import { type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../../api";
import apzLogoRound from "../../assets/apz-logo-round.png";
import { useAutoRefresh } from "../../shared/hooks/useAutoRefresh";
import { Button } from "../../shared/ui/Button";
import { PENDING_APPROVALS_UPDATED_EVENT } from "../../shared/constants/verification";
import { useAuth } from "../providers/AuthProvider";

type NavItem = {
  to: string;
  label: string;
  pendingCount?: number;
};

export const AppLayout = ({ children }: PropsWithChildren) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const fullName = [user?.last_name, user?.first_name].filter(Boolean).join(" ");
  const organizationName = user?.organization_name ?? "-";
  const canSeePendingApprovals = user?.role === "admin" || user?.role === "organization";

  const loadPendingApprovalsCount = async () => {
    if (!canSeePendingApprovals) {
      setPendingApprovalsCount(0);
      return;
    }

    try {
      const count =
        user?.role === "admin"
          ? (await api.admin.listPendingOrganizations()).length
          : (await api.organization.listPendingCurators()).length;
      setPendingApprovalsCount(count);
    } catch {
      setPendingApprovalsCount(0);
    }
  };

  useEffect(() => {
    const refreshPendingApprovalsCount = () => {
      void loadPendingApprovalsCount();
    };

    void loadPendingApprovalsCount();
    window.addEventListener(PENDING_APPROVALS_UPDATED_EVENT, refreshPendingApprovalsCount);

    return () => {
      window.removeEventListener(PENDING_APPROVALS_UPDATED_EVENT, refreshPendingApprovalsCount);
    };
  }, [canSeePendingApprovals, user?.role]);

  useAutoRefresh(() => loadPendingApprovalsCount(), {
    enabled: canSeePendingApprovals,
  });

  useEffect(() => {
    setIsNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 980px)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setIsNavigationOpen(false);
      }
    };

    document.body.style.overflow = isNavigationOpen && mediaQuery.matches ? "hidden" : "";
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      document.body.style.overflow = "";
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [isNavigationOpen]);

  const navItems = useMemo(() => {
    const baseItems: NavItem[] = [
      { to: "/dashboard", label: "Статистика" },
      ...(user?.role === "admin" || user?.role === "organization" ? [{ to: "/roadmap", label: "Дорожная карта" }] : []),
      { to: "/events", label: "Мероприятия" },
      { to: "/students", label: "Ученики" },
      ...(user?.role === "admin" || user?.role === "organization" || user?.role === "curator"
        ? [{ to: "/project-analysis", label: 'Анализ по проекту "Ракеты АПЗ"' }]
        : []),
    ];

    if (user?.role === "admin" || user?.role === "organization") {
      baseItems.push({ to: "/users/verification", label: "Подтверждения", pendingCount: pendingApprovalsCount });
    }

    baseItems.push({ to: "/profile", label: "Профиль" });
    return baseItems;
  }, [pendingApprovalsCount, user?.role]);

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-topbar__menu"
          onClick={() => setIsNavigationOpen((previous) => !previous)}
          aria-expanded={isNavigationOpen}
          aria-controls="app-sidebar"
          aria-label="Toggle navigation"
        >
          <span className="mobile-topbar__menu-line" />
          <span className="mobile-topbar__menu-line" />
          <span className="mobile-topbar__menu-line" />
        </button>
        <div className="mobile-topbar__brand">
          <img src={apzLogoRound} alt="" aria-hidden="true" />
          <div>
            <strong>{fullName || user?.email}</strong>
            <span>{organizationName}</span>
          </div>
        </div>
      </header>

      <button
        type="button"
        className={isNavigationOpen ? "sidebar-backdrop sidebar-backdrop--visible" : "sidebar-backdrop"}
        onClick={() => setIsNavigationOpen(false)}
        aria-label="Close navigation"
        tabIndex={isNavigationOpen ? 0 : -1}
      />

      <aside id="app-sidebar" className={isNavigationOpen ? "sidebar sidebar--open" : "sidebar"}>
        <div className="sidebar__top">
          <div className="sidebar__brand">
          <img src={apzLogoRound} alt="АПЗ" />
          <div>
            <strong>АПЗ: В Движении</strong>
            <span>Управление образовательными данными</span>
          </div>
          </div>
          <button type="button" className="sidebar__close" onClick={() => setIsNavigationOpen(false)} aria-label="Close navigation">
            ×
          </button>
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsNavigationOpen(false)}
              className={({ isActive }) => (isActive ? "nav-link nav-link--active" : "nav-link")}
            >
              <span className="nav-link__text">{item.label}</span>
              {item.pendingCount ? (
                <span className="nav-link__badge" aria-label={`Ожидают подтверждения: ${item.pendingCount}`}>
                  {item.pendingCount}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__profile">
          <p className="sidebar__name">{fullName || user?.email}</p>
          <p className="sidebar__org">{organizationName}</p>
          <Button variant="ghost" onClick={logout} fullWidth>
            Выйти
          </Button>
        </div>
      </aside>

      <main className="page-main">{children ?? <Outlet />}</main>
    </div>
  );
};

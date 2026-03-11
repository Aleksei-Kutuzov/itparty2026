import type { PropsWithChildren } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import apzLogoRound from "../../assets/apz-logo-round.png";
import { Button } from "../../shared/ui/Button";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/events", label: "Мероприятия" },
  { to: "/students", label: "Ученики" },
  { to: "/reports", label: "Отчеты" },
  { to: "/profile", label: "Профиль" },
];

export const AppLayout = ({ children }: PropsWithChildren) => {
  const { logout, user, orgProfile } = useAuth();
  const fullName = [user?.last_name, user?.first_name].filter(Boolean).join(" ");
  const organizationName = orgProfile?.organization_name ?? user?.organization_name;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img src={apzLogoRound} alt="АПЗ" />
          <div>
            <strong>АПЗ / IT Хакатон 2026</strong>
            <span>Трек «Веб-разработка»</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "nav-link nav-link--active" : "nav-link")}>
              {item.label}
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

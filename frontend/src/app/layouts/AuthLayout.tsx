import type { PropsWithChildren } from "react";
import apzLogoPrime from "../../assets/apz-logo-prime.png";

export const AuthLayout = ({ children }: PropsWithChildren) => (
  <div className="auth-shell">
    <div className="auth-shell__glow auth-shell__glow--one" />
    <div className="auth-shell__glow auth-shell__glow--two" />
    <div className="auth-shell__content">
      <aside className="auth-panel">
        <img src={apzLogoPrime} alt="Логотип АПЗ" className="auth-panel__logo" />
        <h1>АПЗ: В Движении</h1>
        <p>Информационная система мероприятий для администраций АПЗ и образовательных организаций.</p>
        <ul>
          <li>Единый календарь и управление мероприятиями</li>
          <li>Карточки учеников с рейтингами, конкурсами и олимпиадами</li>
          <li>Отчеты и выгрузки по участникам</li>
        </ul>
      </aside>
      <section className="auth-form-wrap">{children}</section>
    </div>
  </div>
);

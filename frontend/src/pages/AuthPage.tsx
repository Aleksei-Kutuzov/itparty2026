import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthLayout } from "../app/layouts/AuthLayout";
import { useAuth } from "../app/providers/AuthProvider";
import { isMockApi } from "../api";
import { mockMeta } from "../api/mockApi";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Notice } from "../shared/ui/Notice";
import { SegmentedControl } from "../shared/ui/SegmentedControl";

type Mode = "login" | "register";

type LoginForm = {
  email: string;
  password: string;
};

type RegisterForm = {
  email: string;
  password: string;
  confirmPassword: string;
  first_name: string;
  last_name: string;
  patronymic: string;
  organization_name: string;
  position: string;
};

const defaultLogin: LoginForm = {
  email: "",
  password: "",
};

const defaultRegister: RegisterForm = {
  email: "",
  password: "",
  confirmPassword: "",
  first_name: "",
  last_name: "",
  patronymic: "",
  organization_name: "",
  position: "",
};

const loginFormId = "auth-login-form";
const registerFormId = "auth-register-form";

export const AuthPage = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [loginForm, setLoginForm] = useState<LoginForm>(defaultLogin);
  const [registerForm, setRegisterForm] = useState<RegisterForm>(defaultRegister);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formsHeight, setFormsHeight] = useState<number | null>(null);

  const loginFormRef = useRef<HTMLFormElement>(null);
  const registerFormRef = useRef<HTMLFormElement>(null);

  const navigate = useNavigate();
  const { user, login, register } = useAuth();

  const demoHint = useMemo(() => {
    if (!isMockApi) {
      return null;
    }

    return mockMeta.demoAccounts.map((account) => `${account.role}: ${account.email} / ${account.password}`).join(" | ");
  }, []);

  const measureFormHeight = (form: HTMLFormElement | null): number | null => {
    if (!form) {
      return null;
    }

    const fields = form.querySelector<HTMLElement>(".auth-form__fields");
    if (!fields) {
      return form.scrollHeight;
    }

    return Math.ceil(fields.scrollHeight);
  };

  useEffect(() => {
    const activeForm = mode === "login" ? loginFormRef.current : registerFormRef.current;
    const nextHeight = measureFormHeight(activeForm);
    if (nextHeight !== null) {
      setFormsHeight(nextHeight);
    }
  }, [mode]);

  useEffect(() => {
    const updateHeight = () => {
      const activeForm = mode === "login" ? loginFormRef.current : registerFormRef.current;
      const nextHeight = measureFormHeight(activeForm);
      if (nextHeight !== null) {
        setFormsHeight(nextHeight);
      }
    };

    updateHeight();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateHeight);

      const loginFields = loginFormRef.current?.querySelector<HTMLElement>(".auth-form__fields");
      const registerFields = registerFormRef.current?.querySelector<HTMLElement>(".auth-form__fields");

      if (loginFields) observer.observe(loginFields);
      if (registerFields) observer.observe(registerFields);
    }

    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [mode]);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      await login(loginForm.email.trim(), loginForm.password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить вход");
    } finally {
      setPending(false);
    }
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    if (registerForm.password !== registerForm.confirmPassword) {
      setPending(false);
      setError("Пароли не совпадают");
      return;
    }

    try {
      const email = registerForm.email.trim();
      await register({
        email,
        password: registerForm.password,
        first_name: registerForm.first_name.trim(),
        last_name: registerForm.last_name.trim(),
        patronymic: registerForm.patronymic.trim() || null,
        organization_name: registerForm.organization_name.trim(),
        position: registerForm.position.trim() || null,
      });
      if (isMockApi) {
        setSuccess("Регистрация выполнена, вход выполнен автоматически");
        navigate("/dashboard", { replace: true });
      } else {
        setSuccess("Заявка отправлена. Вход будет доступен после подтверждения администратором.");
        setMode("login");
        setLoginForm({ email, password: "" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить регистрацию");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout>
      <Card title="Вход в систему" subtitle="Сотрудники школ и ОО">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "login", label: "Вход" },
            { value: "register", label: "Регистрация" },
          ]}
        />

        {error ? <Notice tone="error" text={error} /> : null}
        {success ? <Notice tone="success" text={success} /> : null}
        {demoHint ? <Notice tone="info" text={`Mock-доступ: ${demoHint}`} /> : null}

        <div className="auth-forms-stack-wrap">
          <div className="auth-forms-stack" style={formsHeight ? { height: `${formsHeight}px` } : undefined}>
            <form
              id={loginFormId}
              ref={loginFormRef}
              className={`auth-form auth-form--login ${mode === "login" ? "auth-form--active" : ""}`}
              onSubmit={submitLogin}
              aria-hidden={mode !== "login"}
            >
              <fieldset className="auth-form__fieldset" disabled={mode !== "login"}>
                <div className="auth-form__fields">
                  <Input
                    label="Email"
                    type="email"
                    required
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                  <Input
                    label="Пароль"
                    type="password"
                    required
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </div>
              </fieldset>
            </form>

            <form
              id={registerFormId}
              ref={registerFormRef}
              className={`auth-form auth-form--register ${mode === "register" ? "auth-form--active" : ""}`}
              onSubmit={submitRegister}
              aria-hidden={mode !== "register"}
            >
              <fieldset className="auth-form__fieldset" disabled={mode !== "register"}>
                <div className="auth-form__fields auth-form__fields--two">
                  <Input
                    label="Фамилия"
                    required
                    value={registerForm.last_name}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  />
                  <Input
                    label="Имя"
                    required
                    value={registerForm.first_name}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  />
                  <Input
                    label="Отчество"
                    value={registerForm.patronymic}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, patronymic: event.target.value }))}
                  />
                  <Input
                    label="Должность"
                    value={registerForm.position}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, position: event.target.value }))}
                  />
                  <Input
                    label="Организация (ОО)"
                    required
                    value={registerForm.organization_name}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, organization_name: event.target.value }))}
                  />
                  <Input
                    label="Email"
                    type="email"
                    required
                    value={registerForm.email}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                  <Input
                    label="Пароль"
                    type="password"
                    required
                    minLength={8}
                    value={registerForm.password}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                  <Input
                    label="Подтверждение пароля"
                    type="password"
                    required
                    minLength={8}
                    value={registerForm.confirmPassword}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                  />
                </div>
              </fieldset>
            </form>
          </div>

          <div className="auth-forms-actions">
            <Button type="submit" form={mode === "login" ? loginFormId : registerFormId} fullWidth disabled={pending}>
              {mode === "login" ? (pending ? "Вход..." : "Войти") : pending ? "Регистрация..." : "Зарегистрироваться"}
            </Button>
          </div>
        </div>
      </Card>
    </AuthLayout>
  );
};

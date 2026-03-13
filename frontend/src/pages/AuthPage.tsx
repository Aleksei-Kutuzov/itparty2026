import { FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { AuthLayout } from "../app/layouts/AuthLayout";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Notice } from "../shared/ui/Notice";
import { Select } from "../shared/ui/Select";
import { SegmentedControl } from "../shared/ui/SegmentedControl";
import type { RegistrationOrganizationOption } from "../types/models";

type Mode = "login" | "register-organization" | "register-employee";

type LoginForm = {
  email: string;
  password: string;
};

type RegisterOrganizationForm = {
  email: string;
  password: string;
  confirmPassword: string;
  first_name: string;
  last_name: string;
  patronymic: string;
  organization_name: string;
  position: string;
};

type RegisterEmployeeForm = {
  email: string;
  password: string;
  confirmPassword: string;
  first_name: string;
  last_name: string;
  patronymic: string;
  position: string;
  organization_id: string;
};

const defaultLogin: LoginForm = {
  email: "",
  password: "",
};

const defaultRegisterOrganization: RegisterOrganizationForm = {
  email: "",
  password: "",
  confirmPassword: "",
  first_name: "",
  last_name: "",
  patronymic: "",
  organization_name: "",
  position: "",
};

const defaultRegisterEmployee: RegisterEmployeeForm = {
  email: "",
  password: "",
  confirmPassword: "",
  first_name: "",
  last_name: "",
  patronymic: "",
  position: "",
  organization_id: "",
};

const loginFormId = "auth-login-form";
const registerOrganizationFormId = "auth-register-organization-form";
const registerEmployeeFormId = "auth-register-employee-form";

const subtitleByMode: Record<Mode, string> = {
  login: "Для сотрудников школ и образовательных организаций",
  "register-organization": "Отдельная регистрация образовательной организации",
  "register-employee": "Отдельная регистрация сотрудника в подтвержденную ОО",
};

export const AuthPage = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [loginForm, setLoginForm] = useState<LoginForm>(defaultLogin);
  const [organizationRegisterForm, setOrganizationRegisterForm] =
    useState<RegisterOrganizationForm>(defaultRegisterOrganization);
  const [employeeRegisterForm, setEmployeeRegisterForm] = useState<RegisterEmployeeForm>(defaultRegisterEmployee);
  const [registrationOrganizations, setRegistrationOrganizations] = useState<RegistrationOrganizationOption[]>([]);
  const [registrationOrganizationsLoading, setRegistrationOrganizationsLoading] = useState(false);
  const [registrationOrganizationsLoaded, setRegistrationOrganizationsLoaded] = useState(false);
  const [registrationOrganizationsError, setRegistrationOrganizationsError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formsHeight, setFormsHeight] = useState<number | null>(null);

  const loginFormRef = useRef<HTMLFormElement>(null);
  const registerOrganizationFormRef = useRef<HTMLFormElement>(null);
  const registerEmployeeFormRef = useRef<HTMLFormElement>(null);

  const navigate = useNavigate();
  const { user, login, registerCurator, registerOrganization } = useAuth();

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

  const getFormByMode = (targetMode: Mode): HTMLFormElement | null => {
    if (targetMode === "login") {
      return loginFormRef.current;
    }
    if (targetMode === "register-organization") {
      return registerOrganizationFormRef.current;
    }
    return registerEmployeeFormRef.current;
  };

  useEffect(() => {
    const nextHeight = measureFormHeight(getFormByMode(mode));
    if (nextHeight !== null) {
      setFormsHeight(nextHeight);
    }
  }, [mode]);

  useEffect(() => {
    const updateHeight = () => {
      const nextHeight = measureFormHeight(getFormByMode(mode));
      if (nextHeight !== null) {
        setFormsHeight(nextHeight);
      }
    };

    updateHeight();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateHeight);

      [loginFormRef.current, registerOrganizationFormRef.current, registerEmployeeFormRef.current].forEach((form) => {
        const fields = form?.querySelector<HTMLElement>(".auth-form__fields");
        if (fields) {
          observer?.observe(fields);
        }
      });
    }

    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "register-employee" || registrationOrganizationsLoaded || registrationOrganizationsLoading) {
      return;
    }

    let ignore = false;

    const loadRegistrationOrganizations = async () => {
      setRegistrationOrganizationsLoading(true);
      setRegistrationOrganizationsError(null);

      try {
        const rows = await api.auth.listRegistrationOrganizations();
        if (ignore) {
          return;
        }

        setRegistrationOrganizations(rows);
        setRegistrationOrganizationsLoaded(true);
      } catch (err) {
        if (ignore) {
          return;
        }

        setRegistrationOrganizationsError(
          err instanceof Error ? err.message : "Не удалось загрузить список подтвержденных ОО",
        );
      } finally {
        if (!ignore) {
          setRegistrationOrganizationsLoading(false);
        }
      }
    };

    void loadRegistrationOrganizations();

    return () => {
      ignore = true;
    };
  }, [mode, registrationOrganizationsLoaded, registrationOrganizationsLoading]);

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

  const submitOrganizationRegister = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    if (organizationRegisterForm.password !== organizationRegisterForm.confirmPassword) {
      setPending(false);
      setError("Пароли не совпадают");
      return;
    }

    try {
      const email = organizationRegisterForm.email.trim();
      await registerOrganization({
        email,
        password: organizationRegisterForm.password,
        first_name: organizationRegisterForm.first_name.trim(),
        last_name: organizationRegisterForm.last_name.trim(),
        patronymic: organizationRegisterForm.patronymic.trim() || null,
        organization_name: organizationRegisterForm.organization_name.trim(),
        position: organizationRegisterForm.position.trim() || null,
      });

      setSuccess("Заявка ОО отправлена. Вход будет доступен после подтверждения администратором.");
      setMode("login");
      setLoginForm({ email, password: "" });
      setOrganizationRegisterForm(defaultRegisterOrganization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить регистрацию");
    } finally {
      setPending(false);
    }
  };

  const submitEmployeeRegister = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    if (!employeeRegisterForm.organization_id) {
      setPending(false);
      setError("Выберите образовательную организацию");
      return;
    }

    if (employeeRegisterForm.password !== employeeRegisterForm.confirmPassword) {
      setPending(false);
      setError("Пароли не совпадают");
      return;
    }

    try {
      const email = employeeRegisterForm.email.trim();
      await registerCurator({
        email,
        password: employeeRegisterForm.password,
        first_name: employeeRegisterForm.first_name.trim(),
        last_name: employeeRegisterForm.last_name.trim(),
        patronymic: employeeRegisterForm.patronymic.trim() || null,
        position: employeeRegisterForm.position.trim() || null,
        organization_id: Number(employeeRegisterForm.organization_id),
      });

      setSuccess("Заявка сотрудника отправлена. Вход будет доступен после подтверждения вашей ОО.");
      setMode("login");
      setLoginForm({ email, password: "" });
      setEmployeeRegisterForm(defaultRegisterEmployee);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить регистрацию сотрудника");
    } finally {
      setPending(false);
    }
  };

  const submitFormId =
    mode === "login" ? loginFormId : mode === "register-organization" ? registerOrganizationFormId : registerEmployeeFormId;
  const employeeRegistrationLocked =
    mode === "register-employee" &&
    (registrationOrganizationsLoading ||
      registrationOrganizationsError !== null ||
      (registrationOrganizationsLoaded && registrationOrganizations.length === 0));
  const registrationOrganizationOptions = [
    {
      value: "",
      label: registrationOrganizationsLoading
        ? "Загрузка списка ОО..."
        : registrationOrganizations.length === 0
          ? "Нет подтвержденных ОО"
          : "Выберите ОО",
    },
    ...registrationOrganizations.map((organization) => ({
      value: String(organization.id),
      label: organization.name,
    })),
  ];

  let submitButtonLabel = "Войти";
  if (mode === "login") {
    submitButtonLabel = pending ? "Вход..." : "Войти";
  } else if (mode === "register-organization") {
    submitButtonLabel = pending ? "Регистрация..." : "Отправить заявку ОО";
  } else {
    submitButtonLabel = pending ? "Регистрация..." : "Отправить заявку сотрудника";
  }

  return (
    <AuthLayout>
      <Card title="Вход в систему" subtitle={subtitleByMode[mode]}>
        <SegmentedControl
          value={mode}
          onChange={(nextMode) => {
            setMode(nextMode);
            setError(null);
          }}
          options={[
            { value: "login", label: "Вход" },
            { value: "register-organization", label: "Регистрация ОО" },
            { value: "register-employee", label: "Регистрация сотрудника" },
          ]}
        />

        {error ? <Notice tone="error" text={error} /> : null}
        {success ? <Notice tone="success" text={success} /> : null}
        {mode === "register-employee" && registrationOrganizationsError ? (
          <Notice tone="error" text={registrationOrganizationsError} />
        ) : null}
        {mode === "register-employee" &&
        !registrationOrganizationsLoading &&
        registrationOrganizationsLoaded &&
        registrationOrganizations.length === 0 ? (
          <Notice
            tone="info"
            text="Пока нет подтвержденных ОО. Сначала должна зарегистрироваться и пройти подтверждение сама организация."
          />
        ) : null}

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
              id={registerOrganizationFormId}
              ref={registerOrganizationFormRef}
              className={`auth-form auth-form--register ${mode === "register-organization" ? "auth-form--active" : ""}`}
              onSubmit={submitOrganizationRegister}
              aria-hidden={mode !== "register-organization"}
            >
              <fieldset className="auth-form__fieldset" disabled={mode !== "register-organization"}>
                <div className="auth-form__fields auth-form__fields--two">
                  <p className="auth-form__note">
                    Для ОО создается отдельная заявка, которую затем подтверждает администратор.
                  </p>
                  <Input
                    label="Фамилия"
                    required
                    value={organizationRegisterForm.last_name}
                    onChange={(event) =>
                      setOrganizationRegisterForm((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                  />
                  <Input
                    label="Имя"
                    required
                    value={organizationRegisterForm.first_name}
                    onChange={(event) =>
                      setOrganizationRegisterForm((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                  />
                  <Input
                    label="Отчество"
                    value={organizationRegisterForm.patronymic}
                    onChange={(event) =>
                      setOrganizationRegisterForm((prev) => ({ ...prev, patronymic: event.target.value }))
                    }
                  />
                  <Input
                    label="Должность"
                    value={organizationRegisterForm.position}
                    onChange={(event) =>
                      setOrganizationRegisterForm((prev) => ({ ...prev, position: event.target.value }))
                    }
                  />
                  <Input
                    label="Организация (ОО)"
                    required
                    value={organizationRegisterForm.organization_name}
                    onChange={(event) =>
                      setOrganizationRegisterForm((prev) => ({ ...prev, organization_name: event.target.value }))
                    }
                  />
                  <Input
                    label="Email"
                    type="email"
                    required
                    value={organizationRegisterForm.email}
                    onChange={(event) => setOrganizationRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                  <Input
                    label="Пароль"
                    type="password"
                    required
                    minLength={8}
                    value={organizationRegisterForm.password}
                    onChange={(event) =>
                      setOrganizationRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                  />
                  <Input
                    label="Подтверждение пароля"
                    type="password"
                    required
                    minLength={8}
                    value={organizationRegisterForm.confirmPassword}
                    onChange={(event) =>
                      setOrganizationRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                  />
                </div>
              </fieldset>
            </form>

            <form
              id={registerEmployeeFormId}
              ref={registerEmployeeFormRef}
              className={`auth-form auth-form--register ${mode === "register-employee" ? "auth-form--active" : ""}`}
              onSubmit={submitEmployeeRegister}
              aria-hidden={mode !== "register-employee"}
            >
              <fieldset className="auth-form__fieldset" disabled={mode !== "register-employee"}>
                <div className="auth-form__fields auth-form__fields--two">
                  <p className="auth-form__note">
                    Сотрудник привязывается к уже подтвержденной ОО и ожидает подтверждение этой организации.
                  </p>
                  <Input
                    label="Фамилия"
                    required
                    value={employeeRegisterForm.last_name}
                    onChange={(event) => setEmployeeRegisterForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  />
                  <Input
                    label="Имя"
                    required
                    value={employeeRegisterForm.first_name}
                    onChange={(event) => setEmployeeRegisterForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  />
                  <Input
                    label="Отчество"
                    value={employeeRegisterForm.patronymic}
                    onChange={(event) =>
                      setEmployeeRegisterForm((prev) => ({ ...prev, patronymic: event.target.value }))
                    }
                  />
                  <Input
                    label="Должность"
                    value={employeeRegisterForm.position}
                    onChange={(event) => setEmployeeRegisterForm((prev) => ({ ...prev, position: event.target.value }))}
                  />
                  <Select
                    label="Организация (ОО)"
                    required
                    value={employeeRegisterForm.organization_id}
                    options={registrationOrganizationOptions}
                    onChange={(event) =>
                      setEmployeeRegisterForm((prev) => ({ ...prev, organization_id: event.target.value }))
                    }
                  />
                  <Input
                    label="Email"
                    type="email"
                    required
                    value={employeeRegisterForm.email}
                    onChange={(event) => setEmployeeRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                  <Input
                    label="Пароль"
                    type="password"
                    required
                    minLength={8}
                    value={employeeRegisterForm.password}
                    onChange={(event) => setEmployeeRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                  <Input
                    label="Подтверждение пароля"
                    type="password"
                    required
                    minLength={8}
                    value={employeeRegisterForm.confirmPassword}
                    onChange={(event) =>
                      setEmployeeRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                  />
                </div>
              </fieldset>
            </form>
          </div>

          <div className="auth-forms-actions">
            <Button type="submit" form={submitFormId} fullWidth disabled={pending || employeeRegistrationLocked}>
              {submitButtonLabel}
            </Button>
          </div>
        </div>
      </Card>
    </AuthLayout>
  );
};

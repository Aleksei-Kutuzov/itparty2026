import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthPage } from "../pages/AuthPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EventsPage } from "../pages/EventsPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ProjectAnalysisPage } from "../pages/ProjectAnalysisPage";
import { RoadmapPage } from "../pages/RoadmapPage";
import { StudentsPage } from "../pages/StudentsPage";
import { UserVerificationPage } from "../pages/UserVerificationPage";
import { AppLayout } from "./layouts/AppLayout";
import { useAuth } from "./providers/AuthProvider";
import { StatusView } from "../shared/ui/StatusView";

const ProtectedRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <StatusView state="loading" title="Проверяем сессию" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
};

const PublicRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <StatusView state="loading" title="Инициализация системы" />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AuthPage />;
};

export const App = () => (
  <Routes>
    <Route path="/auth" element={<PublicRoute />} />

    <Route element={<ProtectedRoutes />}>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/roadmap" element={<RoadmapPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/students" element={<StudentsPage />} />
      <Route path="/project-analysis" element={<ProjectAnalysisPage />} />
      <Route path="/users/verification" element={<UserVerificationPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>

    <Route path="*" element={<Navigate to="/auth" replace />} />
  </Routes>
);

import { Link } from "react-router-dom";
import { Card } from "../shared/ui/Card";

export const NotFoundPage = () => (
  <Card title="Страница не найдена" subtitle="Запрошенный раздел отсутствует или был перемещен.">
    <Link to="/dashboard" className="btn btn--primary">
      Перейти в Dashboard
    </Link>
  </Card>
);

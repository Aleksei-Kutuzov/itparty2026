import type { ApiLayer } from "./contracts";
import { mockApi } from "./mockApi";
import { realApi } from "./realApi";

const useMock = String(import.meta.env.VITE_USE_MOCK_API ?? "false").toLowerCase() === "true";

export const api: ApiLayer = useMock ? mockApi : realApi;
export const isMockApi = useMock;

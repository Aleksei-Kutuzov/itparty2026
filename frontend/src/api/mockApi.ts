import type { ApiLayer } from "./contracts";
import { realApi } from "./realApi";

export const mockApi: ApiLayer = realApi;

export const mockMeta = {
  demoAccounts: [],
};

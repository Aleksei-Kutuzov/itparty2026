import { useEffect, useRef } from "react";

type Options = {
  enabled?: boolean;
  intervalMs?: number;
  refreshOnFocus?: boolean;
};

export const useAutoRefresh = (
  callback: () => void | Promise<void>,
  { enabled = true, intervalMs = 15000, refreshOnFocus = true }: Options = {},
) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const run = () => {
      void callbackRef.current();
    };

    const timerId = window.setInterval(run, intervalMs);
    const handleFocus = () => run();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    if (refreshOnFocus) {
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      window.clearInterval(timerId);
      if (refreshOnFocus) {
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [enabled, intervalMs, refreshOnFocus]);
};

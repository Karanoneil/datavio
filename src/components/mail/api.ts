"use client";

import { useCallback, useEffect, useState } from "react";
import { useMailStore } from "../../store/mail";

export interface MailStatus {
  database: "postgres" | "sqlite" | null;
  databaseError?: string;
  publicBaseUrl: string;
  publicBaseUrlFromEnv: boolean;
  adminTokenRequired: boolean;
}

/** fetch() for the mail admin APIs: adds the admin token and turns error bodies into thrown messages. */
export function useMailApi() {
  const token = useMailStore((s) => s.adminToken);
  return useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(token ? { "x-mail-token": token } : {}), ...(init.headers ?? {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      return data as T;
    },
    [token]
  );
}

/** Server storage/link settings; loaded once per mount. */
export function useMailStatus() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/mail/status")
      .then((r) => r.json())
      .then((s: MailStatus) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

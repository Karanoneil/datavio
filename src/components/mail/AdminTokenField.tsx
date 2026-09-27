"use client";

import { KeyRound } from "lucide-react";
import { useMailStore } from "../../store/mail";
import { TextInput } from "./ui";

/** Input for MAIL_ADMIN_TOKEN. Kept in memory for this tab only. */
export function AdminTokenField({ required }: { required?: boolean }) {
  const token = useMailStore((s) => s.adminToken);
  const setToken = useMailStore((s) => s.setAdminToken);
  if (!required && !token) return null;
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <KeyRound className="h-3.5 w-3.5 flex-none text-slate-400" />
      <span className="flex-none text-xs font-semibold text-slate-600">Admin token</span>
      <TextInput type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="MAIL_ADMIN_TOKEN" className="py-1" />
    </label>
  );
}

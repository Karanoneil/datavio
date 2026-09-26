"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { CheckResult, DeliverabilityReport } from "../../lib/mail/types";

const ICONS = {
  pass: <CheckCircle2 className="h-4 w-4 flex-none text-emerald-500" />,
  info: <Info className="h-4 w-4 flex-none text-sky-500" />,
  warn: <AlertTriangle className="h-4 w-4 flex-none text-amber-500" />,
  fail: <XCircle className="h-4 w-4 flex-none text-rose-500" />,
};

export function CheckRow({ check }: { check: CheckResult }) {
  return (
    <div className="flex gap-2.5 px-3 py-2.5">
      {ICONS[check.severity]}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700">{check.title}</p>
        <p className="mt-0.5 break-words text-[11px] leading-snug text-slate-500">{check.detail}</p>
      </div>
    </div>
  );
}

const ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };
const LABELS: Record<CheckResult["category"], string> = { compliance: "Legal & compliance", authentication: "Authentication", technical: "Technical", subject: "Subject line", content: "Content" };

export function DeliverabilityPanel({ report }: { report: DeliverabilityReport }) {
  const fails = report.checks.filter((c) => c.severity === "fail").length;
  const warns = report.checks.filter((c) => c.severity === "warn").length;
  const color = report.score >= 85 && !fails ? "text-emerald-600" : report.score >= 65 ? "text-amber-600" : "text-rose-600";
  const groups = (Object.keys(LABELS) as CheckResult["category"][])
    .map((cat) => ({ cat, items: report.checks.filter((c) => c.category === cat).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className={`text-3xl font-bold tabular-nums ${color}`}>{report.score}</div>
        <div className="text-xs text-slate-500">
          <p className="font-semibold text-slate-700">Inbox readiness</p>
          <p>
            {fails} blocking · {warns} to improve. Weighted toward what mailbox providers enforce (authentication, unsubscribe, identity), not word lists.
          </p>
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.cat}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{LABELS[g.cat]}</p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {g.items.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

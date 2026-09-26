"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import type { Recipient } from "../../lib/mail/types";
import { useMailStore } from "../../store/mail";
import { SAMPLE_RECIPIENT, useCampaign } from "./useCampaign";

export function EmailPreview() {
  const recipients = useMailStore((s) => s.recipients);
  const senderName = useMailStore((s) => s.compliance.senderName);
  const brandName = useMailStore((s) => s.brief.brandName);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [who, setWho] = useState(0);
  const sampleList: Recipient[] = recipients.length ? recipients.slice(0, 25) : [SAMPLE_RECIPIENT];
  const recipient = sampleList[Math.min(who, sampleList.length - 1)];
  const { previewHtml, subject, copy, isDraft, products } = useCampaign(recipient);
  const firstName = recipient.firstName || "there";
  const inboxSubject = subject.replace(/\{\{\s*first_name\s*(?:\|([^}]*))?\}\}/gi, (_m, fb) => recipient.firstName || fb || "");

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          {(["desktop", "mobile"] as const).map((d) => (
            <button key={d} onClick={() => setDevice(d)} aria-pressed={device === d} className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${device === d ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}>
              {d === "desktop" ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
              {d === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          Preview as
          <select value={who} onChange={(e) => setWho(Number(e.target.value))} className="max-w-[180px] rounded border border-slate-200 px-1.5 py-0.5 text-[11px]">
            {sampleList.map((r, i) => (
              <option key={r.email + i} value={i}>
                {r.firstName || r.email}
                {r.interest ? ` · ${r.interest}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Inbox row: what people actually see before they open */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-bold text-slate-800">{senderName || brandName || "Your Store"}</span>
          <span className="ml-auto flex-none text-[11px] text-slate-400">9:41 AM</span>
        </div>
        <p className="truncate text-sm font-semibold text-slate-700">{inboxSubject || "(no subject)"}</p>
        <p className="truncate text-xs text-slate-400">{copy.preheader.replace(/\{\{[^}]*\}\}/g, firstName)}</p>
        {isDraft && products.length > 0 && <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-500">Draft copy. Generate on the last step for tailored AI writing.</p>}
      </div>

      <div className="flex flex-1 justify-center overflow-auto bg-slate-100 p-4">
        {products.length === 0 ? (
          <p className="self-center text-center text-sm text-slate-400">Connect a catalog to see your email here.</p>
        ) : (
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            sandbox=""
            className="h-full min-h-[640px] rounded-lg border border-slate-200 bg-white shadow-sm transition-all"
            style={{ width: device === "mobile" ? 375 : 680 }}
          />
        )}
      </div>
    </div>
  );
}

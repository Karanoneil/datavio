"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookUser, Eye, LayoutDashboard, Mail, PencilLine, RotateCcw } from "lucide-react";
import { EmailPreview } from "../../components/mail/EmailPreview";
import { StepAudience } from "../../components/mail/StepAudience";
import { StepBrief } from "../../components/mail/StepBrief";
import { StepCatalog } from "../../components/mail/StepCatalog";
import { StepCompliance } from "../../components/mail/StepCompliance";
import { StepReview } from "../../components/mail/StepReview";
import { StepTheme } from "../../components/mail/StepTheme";
import { Button } from "../../components/mail/ui";
import { MAIL_STEPS, useMailStore } from "../../store/mail";

export default function MailStudio() {
  const step = useMailStore((s) => s.step);
  const setStep = useMailStore((s) => s.setStep);
  const reset = useMailStore((s) => s.reset);
  const idx = MAIL_STEPS.findIndex((s) => s.id === step);
  const [showPreview, setShowPreview] = useState(false);
  // The store restores from localStorage on the client; render after mount so server and client HTML match.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className="h-screen bg-slate-50" />;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Mail className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-base font-bold text-slate-800">
            Datavio <span className="font-medium text-slate-400">Mail</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button className="lg:hidden" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Start a new campaign? Your current brief, theme and copy will be cleared.")) reset();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">New campaign</span>
          </Button>
          <Link href="/mail/contacts" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <BookUser className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Contacts</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <LayoutDashboard className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Dashboards</span>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className={`${showPreview ? "hidden" : "flex"} min-h-0 w-full flex-1 flex-col border-slate-200 bg-white lg:flex lg:w-[520px] lg:flex-none lg:border-r`}>
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 py-2" aria-label="Wizard steps">
            {MAIL_STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                aria-current={s.id === step ? "step" : undefined}
                className={`flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  s.id === step ? "bg-indigo-600 text-white" : i < idx ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-50"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${s.id === step ? "bg-white/20" : "bg-slate-100"}`}>{i + 1}</span>
                {s.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-5">
            {step === "brief" && <StepBrief />}
            {step === "catalog" && <StepCatalog />}
            {step === "theme" && <StepTheme />}
            {step === "audience" && <StepAudience />}
            {step === "compliance" && <StepCompliance />}
            {step === "review" && <StepReview />}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <Button variant="ghost" onClick={() => setStep(MAIL_STEPS[Math.max(0, idx - 1)].id)} disabled={idx === 0}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            {idx < MAIL_STEPS.length - 1 && (
              <Button variant="primary" onClick={() => setStep(MAIL_STEPS[idx + 1].id)}>
                Next: {MAIL_STEPS[idx + 1].label} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </aside>

        <main className={`${showPreview ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-hidden lg:flex`}>
          <EmailPreview />
        </main>
      </div>
    </div>
  );
}

function noopSubscribe() {
  return () => {};
}

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { GOAL_LAYOUT } from "../lib/mail/themes";
import type { Brief, CatalogSelection, Compliance, EmailCopy, Product, Recipient, ThemeChoice } from "../lib/mail/types";

export type MailStep = "brief" | "catalog" | "theme" | "audience" | "compliance" | "review";

export const MAIL_STEPS: { id: MailStep; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "catalog", label: "Catalog" },
  { id: "theme", label: "Theme" },
  { id: "audience", label: "Audience" },
  { id: "compliance", label: "Compliance" },
  { id: "review", label: "Review" },
];

interface MailState {
  step: MailStep;
  brief: Brief;
  catalog: Product[];
  catalogSource: string;
  selection: CatalogSelection;
  theme: ThemeChoice;
  compliance: Compliance;
  recipients: Recipient[];
  recipientsSource: string;
  suppressed: string[];
  copy: EmailCopy | null;
  copySource: "ai" | "rules" | null;
  copyNotes: string[];
  subjectIndex: number;

  setStep: (s: MailStep) => void;
  setBrief: (b: Partial<Brief>) => void;
  setCatalog: (products: Product[], source: string) => void;
  setSelection: (s: Partial<CatalogSelection>) => void;
  setTheme: (t: Partial<ThemeChoice>) => void;
  setCompliance: (c: Partial<Compliance>) => void;
  setRecipients: (r: Recipient[], source: string) => void;
  setSuppressed: (emails: string[]) => void;
  setCopy: (copy: EmailCopy | null, source?: "ai" | "rules", notes?: string[]) => void;
  updateCopy: (c: Partial<EmailCopy>) => void;
  setSubjectIndex: (i: number) => void;
  reset: () => void;
}

const initial = {
  step: "brief" as MailStep,
  brief: { brandName: "", goal: "new_arrivals", problemStatement: "", audienceDescription: "", offer: "", language: "en" } as Brief,
  catalog: [] as Product[],
  catalogSource: "",
  selection: { strategy: "auto", category: "", manualIds: [], maxProducts: 4 } as CatalogSelection,
  theme: { presetId: "clean", tone: "friendly", layout: "hero_grid", brandColor: "", logoUrl: "", occasion: "" } as ThemeChoice,
  compliance: {
    senderName: "",
    senderEmail: "",
    replyTo: "",
    postalAddress: "",
    unsubscribeUrl: "",
    preferencesUrl: "",
    privacyUrl: "",
    region: "global",
    consentBasis: "unknown",
    usesTrackingPixel: false,
  } as Compliance,
  recipients: [] as Recipient[],
  recipientsSource: "",
  suppressed: [] as string[],
  copy: null as EmailCopy | null,
  copySource: null as "ai" | "rules" | null,
  copyNotes: [] as string[],
  subjectIndex: 0,
};

export const useMailStore = create<MailState>()(
  persist(
    (set) => ({
      ...initial,
      setStep: (step) => set({ step }),
      setBrief: (b) =>
        set((s) => {
          const brief = { ...s.brief, ...b };
          // Changing the goal suggests a matching layout, but only if the user hasn't picked one yet.
          const theme = b.goal && s.theme.layout === GOAL_LAYOUT[s.brief.goal] ? { ...s.theme, layout: GOAL_LAYOUT[b.goal] } : s.theme;
          return { brief, theme };
        }),
      setCatalog: (catalog, catalogSource) => set((s) => ({ catalog, catalogSource, selection: { ...s.selection, manualIds: [], category: "" } })),
      setSelection: (sel) => set((s) => ({ selection: { ...s.selection, ...sel } })),
      setTheme: (t) => set((s) => ({ theme: { ...s.theme, ...t } })),
      setCompliance: (c) => set((s) => ({ compliance: { ...s.compliance, ...c } })),
      setRecipients: (recipients, recipientsSource) => set({ recipients, recipientsSource }),
      setSuppressed: (suppressed) => set({ suppressed }),
      setCopy: (copy, copySource, copyNotes) => set({ copy, copySource: copySource ?? null, copyNotes: copyNotes ?? [], subjectIndex: 0 }),
      updateCopy: (c) => set((s) => (s.copy ? { copy: { ...s.copy, ...c } } : {})),
      setSubjectIndex: (subjectIndex) => set({ subjectIndex }),
      reset: () => set(initial),
    }),
    {
      name: "datavio-mail",
      storage: createJSONStorage(() => localStorage),
      // Recipient lists are personal data: keep them in memory only, never in browser storage.
      partialize: (s) => ({
        step: s.step,
        brief: s.brief,
        catalog: s.catalog.slice(0, 500),
        catalogSource: s.catalogSource,
        selection: s.selection,
        theme: s.theme,
        compliance: s.compliance,
        copy: s.copy,
        copySource: s.copySource,
        copyNotes: s.copyNotes,
        subjectIndex: s.subjectIndex,
      }),
    }
  )
);

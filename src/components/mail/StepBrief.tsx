"use client";

import { GOALS } from "../../lib/mail/themes";
import { useMailStore } from "../../store/mail";
import { Field, OptionCards, Section, Select, TextArea, TextInput } from "./ui";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
];

export function StepBrief() {
  const brief = useMailStore((s) => s.brief);
  const setBrief = useMailStore((s) => s.setBrief);

  return (
    <div className="space-y-6">
      <Section title="What are you trying to solve?" description="A sentence or two in plain words. The AI writes toward this, not toward a generic template.">
        <Field label="Brand / store name">
          <TextInput value={brief.brandName} onChange={(e) => setBrief({ brandName: e.target.value })} placeholder="e.g. Northtrail Outfitters" />
        </Field>
        <Field label="Problem statement" hint="E.g. 'Our subscribers ignore generic newsletters; we want to show runners the new trail range without sounding salesy.'">
          <TextArea rows={3} value={brief.problemStatement} onChange={(e) => setBrief({ problemStatement: e.target.value })} placeholder="What should this email achieve, and what hasn't worked before?" />
        </Field>
      </Section>

      <Section title="Campaign goal">
        <OptionCards value={brief.goal} onChange={(goal) => setBrief({ goal })} options={GOALS.map((g) => ({ id: g.id, label: g.label, hint: g.hint }))} />
      </Section>

      <Section title="Who is it for?">
        <Field label="Audience" hint="Who they are and what they care about. Used to pick tone and product angles.">
          <TextInput value={brief.audienceDescription} onChange={(e) => setBrief({ audienceDescription: e.target.value })} placeholder="e.g. Weekend trail runners, 25–45, value durability over trends" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Offer (optional)" hint="Only real offers. The AI won't invent discounts.">
            <TextInput value={brief.offer} onChange={(e) => setBrief({ offer: e.target.value })} placeholder="e.g. 15% off with code TRAIL15 until Sunday" />
          </Field>
          <Field label="Language">
            <Select value={brief.language} onChange={(e) => setBrief({ language: e.target.value })}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>
    </div>
  );
}

"use client";

import { LAYOUTS, THEME_PRESETS, TONES } from "../../lib/mail/themes";
import { useMailStore } from "../../store/mail";
import { Field, OptionCards, Section, TextInput } from "./ui";

export function StepTheme() {
  const theme = useMailStore((s) => s.theme);
  const setTheme = useMailStore((s) => s.setTheme);

  return (
    <div className="space-y-6">
      <Section title="Visual theme" description="Email-safe fonts and table layouts only, so it looks the same in Gmail, Outlook and Apple Mail.">
        <OptionCards
          columns={3}
          value={theme.presetId}
          onChange={(presetId) => setTheme({ presetId })}
          options={THEME_PRESETS.map((p) => ({ id: p.id, label: p.name, hint: p.description, swatch: [p.background, p.surface, p.accent, p.text] }))}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Brand colour (optional)" hint="Overrides the theme accent. Button text switches to black/white for contrast.">
            <div className="flex gap-2">
              <input type="color" aria-label="Pick brand colour" value={/^#[0-9a-f]{6}$/i.test(theme.brandColor) ? theme.brandColor : "#6366f1"} onChange={(e) => setTheme({ brandColor: e.target.value })} className="h-9 w-10 flex-none cursor-pointer rounded border border-slate-200" />
              <TextInput value={theme.brandColor} onChange={(e) => setTheme({ brandColor: e.target.value })} placeholder="#1f8a5b" />
            </div>
          </Field>
          <Field label="Logo URL (optional)" hint="Hosted PNG/JPG over https. SVG isn't supported in Gmail or Outlook.">
            <TextInput value={theme.logoUrl} onChange={(e) => setTheme({ logoUrl: e.target.value })} placeholder="https://yourstore.com/logo.png" />
          </Field>
        </div>
      </Section>

      <Section title="Voice">
        <OptionCards columns={3} value={theme.tone} onChange={(tone) => setTheme({ tone })} options={TONES.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))} />
        <Field label="Occasion or theme (optional)" hint="Seasonal hook the copy can reference, e.g. 'first cold weekend of autumn', 'Diwali', 'back to school'.">
          <TextInput value={theme.occasion} onChange={(e) => setTheme({ occasion: e.target.value })} placeholder="e.g. Autumn trail season" />
        </Field>
      </Section>

      <Section title="Layout">
        <OptionCards value={theme.layout} onChange={(layout) => setTheme({ layout })} options={LAYOUTS.map((l) => ({ id: l.id, label: l.label, hint: l.hint }))} />
      </Section>
    </div>
  );
}

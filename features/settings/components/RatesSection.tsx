"use client";

import { useId } from "react";
import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";
import { Section } from "./Section";

function NumberField({
  label,
  hint,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-label uppercase tracking-[0.06em] text-text-tertiary"
      >
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="min-h-[40px] w-24 rounded-lg bg-surface-muted px-3 text-sm tabular-nums text-text-primary transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {suffix && <span className="text-caption text-text-tertiary">{suffix}</span>}
      </div>
      {hint && <p className="mt-1.5 text-caption leading-snug text-text-tertiary">{hint}</p>}
    </div>
  );
}

export function RatesSection() {
  const { settings, updateRates, update } = useWorkspaceSettings();

  return (
    <Section
      title="Labour rates & estimate defaults"
      description="Used by the estimator. Per-line markup, overhead, and waste can still be tuned per quote. These are the starting points."
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          label="Design rate"
          hint="Pre-work: site visits, design meetings, estimating"
          suffix="$ / hour"
          value={settings.labourRates.designRate}
          onChange={(n) => updateRates({ designRate: n })}
        />
        <NumberField
          label="Shop rate"
          hint="Assembly, in-shop deficiencies, loading time"
          suffix="$ / hour"
          value={settings.labourRates.shopRate}
          onChange={(n) => updateRates({ shopRate: n })}
        />
        <NumberField
          label="Install rate"
          hint="On-site install, on-site deficiencies, travel time"
          suffix="$ / hour"
          value={settings.labourRates.installRate}
          onChange={(n) => updateRates({ installRate: n })}
        />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-border-faint pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          label="Default overhead %"
          hint="Applied workshop-wide on direct cost"
          suffix="%"
          step={0.5}
          value={settings.defaultOverheadPct}
          onChange={(n) => update({ defaultOverheadPct: n })}
        />
        <NumberField
          label="Default markup %"
          hint="Seeds new estimator lines. Each line can be tuned individually"
          suffix="%"
          step={1}
          value={settings.defaultMarkupPct}
          onChange={(n) => update({ defaultMarkupPct: n })}
        />
        <NumberField
          label="Gas / mile"
          hint="Delivery calculator. CRA-aligned (about $0.55)"
          suffix="$ / mile"
          step={0.05}
          value={settings.defaultGasRatePerMile}
          onChange={(n) => update({ defaultGasRatePerMile: n })}
        />
      </div>
    </Section>
  );
}

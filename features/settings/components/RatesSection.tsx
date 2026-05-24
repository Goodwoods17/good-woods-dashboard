"use client";

import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";

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
  return (
    <div>
      <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-24 px-2 py-1 text-sm border border-border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent tabular-nums"
        />
        {suffix && (
          <span className="text-xs text-text-tertiary">{suffix}</span>
        )}
      </div>
      {hint && (
        <p className="mt-1 text-xs text-text-tertiary leading-snug">{hint}</p>
      )}
    </div>
  );
}

export function RatesSection() {
  const { settings, updateRates, update } = useWorkspaceSettings();

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">
          Labour rates &amp; estimate defaults
        </h2>
        <p className="mt-0.5 text-xs text-text-tertiary">
          Used by the estimator. Per-line markup, overhead %, and waste % can
          still be tweaked per quote — these are the starting points.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 p-5">
        <NumberField
          label="Design rate"
          hint="Pre-work — site visits, design meetings, estimating"
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
      <div className="border-t border-border grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 p-5">
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
          hint="Delivery calculator. CRA-aligned ~$0.55"
          suffix="$ / mile"
          step={0.05}
          value={settings.defaultGasRatePerMile}
          onChange={(n) => update({ defaultGasRatePerMile: n })}
        />
      </div>
    </section>
  );
}

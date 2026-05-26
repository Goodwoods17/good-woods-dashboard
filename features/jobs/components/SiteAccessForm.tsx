"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@shared/lib/utils";
import {
  PET_TYPE_LABELS,
  SITE_CONTACT_ROLE_LABELS,
  type PetType,
  type SiteAccess,
  type SiteContactRole,
} from "@shared/lib/types";

/**
 * Shared form for the SiteAccess shape. Used by /jobs/new (inside a
 * collapsible "Site & access (optional)" card) and by JobDetail
 * OverviewTab (as a permanent card). One source of truth for the
 * field layout + copy.
 *
 * Callers manage their own commit timing:
 *   - /jobs/new: hold local state, write on form submit.
 *   - OverviewTab: write-on-blur via updateJob() to match the existing
 *     blocker/nextStep pattern in that tab.
 */
export function SiteAccessForm({
  value,
  onChange,
}: {
  value: SiteAccess;
  onChange: (next: SiteAccess) => void;
}) {
  function patch(part: Partial<SiteAccess>) {
    onChange({ ...value, ...part });
  }
  function patchPet(part: Partial<NonNullable<SiteAccess["pet"]>>) {
    onChange({ ...value, pet: { ...value.pet, ...part } });
  }
  function patchSiteContact(part: Partial<NonNullable<SiteAccess["siteContact"]>>) {
    onChange({ ...value, siteContact: { ...value.siteContact, ...part } });
  }

  const installAddress = value.installAddress?.trim() ?? "";
  const mapsHref = installAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(installAddress)}`
    : null;

  return (
    <div className="space-y-5">
      <Section title="Codes & access">
        <Field label="Install address" hint="Where the install happens. Leave blank if same as billing.">
          <TextInput
            value={value.installAddress ?? ""}
            onChange={(v) => patch({ installAddress: v || null })}
            placeholder="1042 Yates St, Victoria BC"
          />
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-xs text-accent hover:text-accent-active transition-colors duration-fast"
            >
              Open in Google Maps
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
            </a>
          )}
        </Field>
        <Row3>
          <Field label="Buzzer">
            <TextInput
              value={value.buzzerCode ?? ""}
              onChange={(v) => patch({ buzzerCode: v || null })}
              placeholder="217"
              mono
            />
          </Field>
          <Field label="Door code">
            <TextInput
              value={value.doorCode ?? ""}
              onChange={(v) => patch({ doorCode: v || null })}
              placeholder="4127"
              mono
            />
          </Field>
          <Field label="Lockbox">
            <TextInput
              value={value.lockboxCode ?? ""}
              onChange={(v) => patch({ lockboxCode: v || null })}
              placeholder="8932"
              mono
            />
          </Field>
        </Row3>
      </Section>

      <Section title="Parking & building">
        <Field label="Parking notes" hint="Driveway, side street, parkade clearance, loading dock window.">
          <Textarea
            value={value.parkingNotes ?? ""}
            onChange={(v) => patch({ parkingNotes: v || null })}
            placeholder="Park in driveway. Low garage clearance 6'8.&quot;"
            rows={2}
          />
        </Field>
        <Field label="Building access notes" hint="Strata stuff: elevator booking, quiet hours, super's contact, key fob.">
          <Textarea
            value={value.buildingAccessNotes ?? ""}
            onChange={(v) => patch({ buildingAccessNotes: v || null })}
            placeholder="Elevator booking required via super, 24h notice. Quiet hours after 5pm."
            rows={2}
          />
        </Field>
        <Row2>
          <Field label="Elevator required">
            <Toggle
              value={Boolean(value.elevatorRequired)}
              onChange={(v) => patch({ elevatorRequired: v })}
              onLabel="Yes, booking needed"
              offLabel="No"
            />
          </Field>
          {value.elevatorRequired && (
            <Field label="Elevator window">
              <TextInput
                value={value.elevatorWindow ?? ""}
                onChange={(v) => patch({ elevatorWindow: v || null })}
                placeholder="9am to 3pm, Mon to Fri"
              />
            </Field>
          )}
        </Row2>
      </Section>

      <Section title="On-site contact">
        <p className="text-xs text-text-tertiary">
          Backup person if the payer isn't on-site. (The payer + homeowner contacts already carry their own phone and email on the client record.)
        </p>
        <Row3>
          <Field label="Name">
            <TextInput
              value={value.siteContact?.name ?? ""}
              onChange={(v) => patchSiteContact({ name: v || null })}
              placeholder="Janet Reilly"
            />
          </Field>
          <Field label="Phone">
            <TextInput
              value={value.siteContact?.phone ?? ""}
              onChange={(v) => patchSiteContact({ phone: v || null })}
              placeholder="(250) 555 0182"
              type="tel"
            />
          </Field>
          <Field label="Role">
            <Segmented
              value={value.siteContact?.role ?? null}
              onChange={(v) => patchSiteContact({ role: v as SiteContactRole | null })}
              options={[
                { value: null, label: "None" },
                ...(Object.entries(SITE_CONTACT_ROLE_LABELS) as [SiteContactRole, string][]).map(
                  ([v, label]) => ({ value: v, label })
                ),
              ]}
              compact
            />
          </Field>
        </Row3>
      </Section>

      <Section title="Pet">
        <Row3>
          <Field label="Type">
            <Segmented
              value={value.pet?.type ?? null}
              onChange={(v) => patchPet({ type: v as PetType | null })}
              options={[
                { value: null, label: "None" },
                ...(Object.entries(PET_TYPE_LABELS) as [PetType, string][]).map(
                  ([v, label]) => ({ value: v, label })
                ),
              ]}
              compact
            />
          </Field>
          {value.pet?.type && (
            <>
              <Field label="Name">
                <TextInput
                  value={value.pet?.name ?? ""}
                  onChange={(v) => patchPet({ name: v || null })}
                  placeholder="Rex"
                />
              </Field>
              <Field label="Note">
                <TextInput
                  value={value.pet?.note ?? ""}
                  onChange={(v) => patchPet({ note: v || null })}
                  placeholder="Treats OK. Afraid of men."
                />
              </Field>
            </>
          )}
        </Row3>
      </Section>

      <Section title="Day-of prep">
        <Field label="Floor protection" hint="What the installer brings: runners, drop cloths, shoe covers.">
          <TextInput
            value={value.floorProtection ?? ""}
            onChange={(v) => patch({ floorProtection: v || null })}
            placeholder="Hardwood throughout. Please use runners + shoe covers."
          />
        </Field>
        <Row2>
          <Field label="Demo required">
            <Toggle
              value={Boolean(value.demoRequired)}
              onChange={(v) => patch({ demoRequired: v })}
              onLabel="Yes, hauling out old cabs"
              offLabel="No"
            />
          </Field>
          {value.demoRequired && (
            <Field label="Demo scope">
              <TextInput
                value={value.demoScope ?? ""}
                onChange={(v) => patch({ demoScope: v || null })}
                placeholder="Upper cabinets + island. Keep lowers."
              />
            </Field>
          )}
        </Row2>
        <Field label="Existing-space photos" hint="Drive folder link. Installer scrolls before arriving.">
          <TextInput
            value={value.photosUrl ?? ""}
            onChange={(v) => patch({ photosUrl: v || null })}
            placeholder="https://drive.google.com/drive/folders/..."
          />
        </Field>
      </Section>

      <Section title="Comms">
        <Field label="Best contact window" hint="When to reach the client about scheduling.">
          <TextInput
            value={value.bestContactWindow ?? ""}
            onChange={(v) => patch({ bestContactWindow: v || null })}
            placeholder="Evenings only. No calls before 9am."
          />
        </Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-caption text-text-tertiary mt-1">{hint}</span>}
    </label>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function Row3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full text-sm bg-white border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast",
        mono && "font-mono tabular-nums"
      )}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-sm bg-white border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-none leading-relaxed"
    />
  );
}

function Toggle({
  value,
  onChange,
  onLabel,
  offLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface-muted p-1">
      <ToggleBtn active={!value} onClick={() => onChange(false)}>
        {offLabel}
      </ToggleBtn>
      <ToggleBtn active={value} onClick={() => onChange(true)}>
        {onLabel}
      </ToggleBtn>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-fast",
        active ? "bg-ink-pill text-white" : "text-text-secondary hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string | null>({
  value,
  onChange,
  options,
  compact,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-full bg-surface-muted p-1",
        compact ? "" : ""
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={String(opt.value ?? "null")}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-fast",
              active
                ? "bg-ink-pill text-white"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

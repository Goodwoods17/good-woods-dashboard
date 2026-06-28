"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Owner-only "Account & tax-code mapping" settings panel (QBO S4, issue #150).
 *
 * Two jobs: map each local cost-code/category → a QBO expense AccountRef, and —
 * the headline — auto-suggest the per-company GST/PST QBO TaxCodeRefs by name so
 * the owner confirms them in one click. Mappings persist via
 * `/api/invoices/qbo/mappings` into the central `quickbooks_links` table; the
 * panel also surfaces the unmapped-state signal that feeds the block-until-mapped
 * sync gate.
 *
 * Renders only when NEXT_PUBLIC_INVOICES_QBO_ENABLED is on (gated by the parent
 * SettingsView). Degrades gracefully: when QBO isn't connected yet the GET
 * reports not_connected and we show a clear "connect first" state.
 */

type QboAccount = { id: string; name: string; accountType: string; active: boolean };
type QboTaxCode = { id: string; name: string; active: boolean };
type TaxSuggestion = {
  localType: "GST" | "PST";
  suggestedQboId: string | null;
  suggestedQboName: string | null;
  mappedQboId: string | null;
};
type AccountRequirement = {
  localId: string;
  mappedQboId: string | null;
};
type UnmappedState = {
  unmappedAccounts: string[];
  unmappedTaxes: string[];
  fullyMapped: boolean;
};

type MappingPayload = {
  ok: true;
  accounts: QboAccount[];
  taxCodes: QboTaxCode[];
  accountByLocal: Record<string, string>;
  taxByLocal: Record<string, string>;
  accountRequirements: AccountRequirement[];
  taxSuggestions: TaxSuggestion[];
  unmapped: UnmappedState;
};

type Phase =
  | { kind: "loading" }
  | { kind: "not_connected" }
  | { kind: "error" }
  | { kind: "ready"; data: MappingPayload };

export function QboMappingPanel() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Local edits to the tax selects, keyed by local tax type.
  const [taxChoice, setTaxChoice] = useState<Record<string, string>>({});
  // Local edits to the account selects, keyed by local cost-code/category key.
  const [accountChoice, setAccountChoice] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices/qbo/mappings", { cache: "no-store" });
      if (res.status === 400 || res.status === 503) {
        setPhase({ kind: "not_connected" });
        return;
      }
      if (!res.ok) {
        setPhase({ kind: "error" });
        return;
      }
      const data = (await res.json()) as MappingPayload;
      setPhase({ kind: "ready", data });
      // Seed the tax selects from the persisted mapping or the suggestion.
      const taxSeed: Record<string, string> = {};
      for (const s of data.taxSuggestions) {
        taxSeed[s.localType] = s.mappedQboId ?? s.suggestedQboId ?? "";
      }
      setTaxChoice(taxSeed);
      // Seed the account selects from each requirement's persisted mapping.
      const acctSeed: Record<string, string> = {};
      for (const a of data.accountRequirements) {
        acctSeed[a.localId] = a.mappedQboId ?? "";
      }
      setAccountChoice(acctSeed);
    } catch {
      setPhase({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveTax = useCallback(
    async (localType: string) => {
      const qboId = taxChoice[localType];
      if (!qboId) return;
      setSavingKey(`tax:${localType}`);
      setNotice(null);
      try {
        const res = await fetch("/api/invoices/qbo/mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "taxcode", localId: localType, qboId }),
        });
        if (res.ok) {
          setNotice(`${localType} tax code saved.`);
          await load();
        } else {
          setNotice("Could not save the mapping.");
        }
      } finally {
        setSavingKey(null);
      }
    },
    [taxChoice, load]
  );

  const saveAccount = useCallback(
    async (localId: string) => {
      const qboId = accountChoice[localId];
      if (!qboId) return;
      setSavingKey(`account:${localId}`);
      setNotice(null);
      try {
        const res = await fetch("/api/invoices/qbo/mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "account", localId, qboId }),
        });
        if (res.ok) {
          setNotice(`Account mapping saved.`);
          await load();
        } else {
          setNotice("Could not save the mapping.");
        }
      } finally {
        setSavingKey(null);
      }
    },
    [accountChoice, load]
  );

  if (phase.kind === "loading") {
    return (
      <div data-testid="qbo-mapping-panel">
        <p className="text-sm text-text-tertiary" data-testid="qbo-mapping-loading">
          Loading mappings…
        </p>
      </div>
    );
  }

  if (phase.kind === "not_connected") {
    return (
      <div data-testid="qbo-mapping-panel">
        <p
          className="rounded-lg bg-status-blocked-soft px-4 py-3 text-sm text-status-blocked"
          data-testid="qbo-mapping-not-connected"
        >
          Connect your QuickBooks company above first, then map your expense accounts and the
          GST/PST tax codes here.
        </p>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div data-testid="qbo-mapping-panel">
        <p className="text-sm text-status-blocked" data-testid="qbo-mapping-error">
          Couldn&apos;t load the QuickBooks mappings.
        </p>
      </div>
    );
  }

  const { data } = phase;

  return (
    <div data-testid="qbo-mapping-panel" className="space-y-5">
      <p className="text-sm leading-relaxed text-text-secondary">
        Canadian GST/PST tax codes are assigned per QuickBooks company, so we look them up in your
        connected company and suggest a match by name. Confirm each one below.
      </p>

      {/* Gate status — the block-until-mapped signal. */}
      {data.unmapped.fullyMapped ? (
        <p
          className="inline-flex items-center gap-2 text-sm text-status-on-track"
          data-testid="qbo-mapping-gate"
          data-gate="ready"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          All accounts and tax codes are mapped — ready to sync.
        </p>
      ) : (
        <p
          className="inline-flex items-center gap-2 text-sm text-status-blocked"
          data-testid="qbo-mapping-gate"
          data-gate="blocked"
        >
          <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {data.unmapped.unmappedTaxes.length} tax code(s) and{" "}
          {data.unmapped.unmappedAccounts.length} account(s) still need mapping.
        </p>
      )}

      {/* GST/PST wizard. */}
      <div className="space-y-3" data-testid="qbo-tax-wizard">
        {data.taxSuggestions.map((s) => (
          <div
            key={s.localType}
            className="flex flex-wrap items-center gap-3"
            data-testid={`qbo-tax-row-${s.localType}`}
          >
            <span className="w-12 text-sm font-medium text-text-primary">{s.localType}</span>
            <select
              aria-label={`${s.localType} tax code`}
              data-testid={`qbo-tax-select-${s.localType}`}
              value={taxChoice[s.localType] ?? ""}
              onChange={(e) => setTaxChoice((prev) => ({ ...prev, [s.localType]: e.target.value }))}
              className="min-w-[12rem] rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
            >
              <option value="">— choose a QuickBooks tax code —</option>
              {data.taxCodes
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            {s.mappedQboId ? (
              <span className="text-xs text-status-on-track">mapped</span>
            ) : s.suggestedQboName ? (
              <span className="text-xs text-text-tertiary">suggested: {s.suggestedQboName}</span>
            ) : null}
            <button
              type="button"
              data-testid={`qbo-tax-save-${s.localType}`}
              onClick={() => saveTax(s.localType)}
              disabled={savingKey === `tax:${s.localType}` || !taxChoice[s.localType]}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary transition-colors duration-fast hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ))}
      </div>

      {/* Expense-account mapping: each local cost-code/category → a QB account.
          This is what clears the block-until-mapped push gate (#187). */}
      <div className="space-y-2" data-testid="qbo-account-wizard">
        <h3 className="text-sm font-medium text-text-primary">Expense accounts</h3>
        <p className="text-xs text-text-tertiary">
          Map each cost-code on your posted invoices to a QuickBooks expense account. Subtrade lines
          book to your subcontractor account; material lines to materials.
        </p>
        {data.accountRequirements.length === 0 ? (
          <p className="text-sm text-text-tertiary" data-testid="qbo-accounts-none">
            No expense accounts need mapping yet — they appear here once you post an invoice.
          </p>
        ) : (
          data.accountRequirements.map((a) => (
            <div
              key={a.localId}
              className="flex flex-wrap items-center gap-3"
              data-testid={`qbo-account-row-${a.localId}`}
            >
              <span className="min-w-[10rem] text-sm font-medium text-text-primary">
                {a.localId}
              </span>
              <select
                aria-label={`Expense account for ${a.localId}`}
                data-testid={`qbo-account-select-${a.localId}`}
                value={accountChoice[a.localId] ?? ""}
                onChange={(e) =>
                  setAccountChoice((prev) => ({ ...prev, [a.localId]: e.target.value }))
                }
                className="min-w-[14rem] rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
              >
                <option value="">— choose a QuickBooks account —</option>
                {data.accounts
                  .filter((acct) => acct.active)
                  .map((acct) => (
                    <option key={acct.id} value={acct.id}>
                      {acct.name}
                    </option>
                  ))}
              </select>
              {a.mappedQboId ? (
                <span
                  className="text-xs text-status-on-track"
                  data-testid={`qbo-account-mapped-${a.localId}`}
                >
                  mapped
                </span>
              ) : null}
              <button
                type="button"
                data-testid={`qbo-account-save-${a.localId}`}
                onClick={() => saveAccount(a.localId)}
                disabled={savingKey === `account:${a.localId}` || !accountChoice[a.localId]}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary transition-colors duration-fast hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          ))
        )}
        <p className="text-xs text-text-tertiary" data-testid="qbo-accounts-count">
          {data.accounts.length} QuickBooks account(s) available.
        </p>
      </div>

      {notice && (
        <p className="text-xs text-text-tertiary" data-testid="qbo-mapping-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

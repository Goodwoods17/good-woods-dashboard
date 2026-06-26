import type { FormInstanceField } from "@shared/lib/types";

/**
 * Conditional-visibility logic for form fields (issue #66, P3 slice 1).
 *
 * A field can carry `config.showWhen` to conditionally hide itself until a
 * trigger field above it satisfies a condition. Pure (no React, no Supabase)
 * so every operator is unit-testable under the node vitest env.
 *
 * v1 constraints (locked 2026-06-26):
 *   - Single condition, single trigger field.
 *   - Trigger must appear ABOVE the dependent field (prevents cycles — enforced
 *     in the builder's trigger dropdown, not here).
 *   - Hidden fields keep their stored value but are excluded from completion +
 *     progress (callers are responsible for that gate).
 */

/** The operators supported in v1. */
export type ShowWhenOperator = "equals" | "not_equals" | "is_checked" | "is_not_checked";

/** The condition stored in `field.config.showWhen`. */
export type ShowWhenCondition = {
  /** id of the trigger FormInstanceField that must appear above this field. */
  fieldId: string;
  operator: ShowWhenOperator;
  /** Only used by `equals` / `not_equals`; ignored for boolean operators. */
  value?: unknown;
};

/**
 * Returns `true` when the given field should be rendered.
 *
 * Rules:
 *   1. No `showWhen` in config → always visible.
 *   2. Trigger field not found in `allFields` → visible (graceful forward-compat).
 *   3. Otherwise evaluate the operator against the trigger's current answer.
 *
 * For `is_checked` / `is_not_checked`: a yes_no trigger uses its `value`
 * ("yes" = checked); a checkbox trigger uses its `checked` boolean.
 */
export function isFieldVisible(field: FormInstanceField, allFields: FormInstanceField[]): boolean {
  const cfg = field.config as Record<string, unknown>;
  const condition = cfg?.showWhen as ShowWhenCondition | undefined;

  // Rule 1: no condition → always show.
  if (!condition || !condition.fieldId) return true;

  const trigger = allFields.find((f) => f.id === condition.fieldId);

  // Rule 2: trigger missing → visible (graceful).
  if (!trigger) return true;

  const { operator } = condition;

  if (operator === "equals") {
    return trigger.value === condition.value;
  }

  if (operator === "not_equals") {
    return trigger.value !== condition.value;
  }

  // For boolean operators, "checked" means:
  //   - checkbox: checked === true
  //   - yes_no: value === "yes"
  // Any other type: falls back to the `checked` boolean.
  function isTriggerChecked(): boolean {
    if (trigger!.type === "yes_no") {
      return trigger!.value === "yes";
    }
    return trigger!.checked === true;
  }

  if (operator === "is_checked") {
    return isTriggerChecked();
  }

  if (operator === "is_not_checked") {
    return !isTriggerChecked();
  }

  // Unknown operator — default to visible (forward-compat).
  return true;
}

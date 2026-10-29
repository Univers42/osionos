/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PermissionPicker.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The permission half of the create form. Every option is read from the catalog the
// bridge served, so the picker can never offer what the bridge would refuse.

import React from "react";

import type { PatCatalog, TokenForm } from "./patModel";

const boxClass = "accent-[var(--osio-accent)]";
const legendClass = "text-sm font-medium text-[var(--osio-fg-default)]";

function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const Choice: React.FC<{ label: string; checked: boolean; onChange: () => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)]">
    <input type="checkbox" checked={checked} onChange={onChange} className={boxClass} />
    {label}
  </label>
);

export const PermissionPicker: React.FC<{
  form: TokenForm;
  catalog: PatCatalog;
  classicScopes: string[];
  attributes: string[];
  scopeLabel: (scope: string) => string;
  onChange: (patch: Partial<TokenForm>) => void;
}> = ({ form, catalog, classicScopes, attributes, scopeLabel, onChange }) => {
  if (form.kind === "classic") {
    return (
      <fieldset className="space-y-1">
        <legend className={legendClass}>Scopes</legend>
        {classicScopes.map((scope) => <Choice key={scope} label={scopeLabel(scope)} checked={form.scopes.includes(scope)} onChange={() => onChange({ scopes: toggled(form.scopes, scope) })} />)}
        <p className="text-sm leading-[18px] text-[var(--osio-fg-muted)]">Reading pages includes their content. For metadata only, use a fine-grained token.</p>
      </fieldset>
    );
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="token-resource" className={legendClass}>Resource</label>
        <select id="token-resource" value={form.resource} onChange={(event) => onChange({ resource: event.target.value, attributes: [] })} className="block h-[var(--osio-field-h)] rounded-[var(--osio-field-radius)] border border-[var(--osio-field-border)] bg-[var(--osio-field-bg)] px-2 text-sm text-[var(--osio-fg-default)]">
          {Object.keys(catalog.resources).map((resource) => <option key={resource} value={resource}>{resource}</option>)}
        </select>
      </div>
      <fieldset className="space-y-1">
        <legend className={legendClass}>Fields</legend>
        <div className="grid grid-cols-2 gap-x-3">
          {attributes.map((attribute) => <Choice key={attribute} label={attribute} checked={form.attributes.includes(attribute)} onChange={() => onChange({ attributes: toggled(form.attributes, attribute) })} />)}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className={legendClass}>Access</legend>
        {catalog.permissions.map((permission) => <Choice key={permission} label={permission} checked={form.permissions.includes(permission)} onChange={() => onChange({ permissions: toggled(form.permissions, permission) })} />)}
      </fieldset>
    </div>
  );
};

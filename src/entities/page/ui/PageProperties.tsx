/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageProperties.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 23:07:11 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

import type { PagePropertyEntry } from '../model/types';

export type PageProperty = PagePropertyEntry;

interface PagePropertiesProps {
  properties: PageProperty[];
  onChangeProperty?: (key: string, value: PageProperty['value']) => void;
}

/**
 * Optional page properties bar (like osionos's database-page properties).
 * Only renders when the page has properties attached.
 */
export const PageProperties: React.FC<PagePropertiesProps> = ({
  properties,
  onChangeProperty,
}) => {
  if (properties.length === 0) return null;

  return (
    <div className="osionos-page-properties">
      {properties.map((prop) => (
        <div key={prop.key} className="osionos-page-property-row">
          <span className="osionos-page-property-label">{prop.label}</span>
          <span className="osionos-page-property-value">
            <PagePropertyValue property={prop} onChangeProperty={onChangeProperty} />
          </span>
        </div>
      ))}
    </div>
  );
};

const PagePropertyValue: React.FC<{
  property: PageProperty;
  onChangeProperty?: (key: string, value: PageProperty['value']) => void;
}> = ({ property, onChangeProperty }) => {
  if (!onChangeProperty) return <>{stringValue(property.value)}</>;

  if (property.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        aria-label={property.key}
        checked={Boolean(property.value)}
        onChange={(event) => onChangeProperty(property.key, event.target.checked)}
        className="h-4 w-4 accent-[var(--osio-accent)]"
      />
    );
  }

  if (property.type === 'select' && property.options?.length) {
    return (
      <select
        aria-label={property.key}
        name={property.key}
        value={stringValue(property.value)}
        onChange={(event) => onChangeProperty(property.key, event.target.value)}
        className="w-full bg-transparent outline-none text-sm text-[var(--osio-fg-default)]"
      >
        {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (property.type === 'relation') {
    const values = Array.isArray(property.value) ? property.value : [];
    return (
      <div className="osionos-page-property-relations">
        {values.length ? values.map((value) => <span key={value}>{value}</span>) : <em>No relations</em>}
      </div>
    );
  }

  return (
    <input
      aria-label={property.key}
      name={property.key}
      autoComplete="off"
      type={propertyInputType(property.type)}
      value={stringValue(property.value)}
      onChange={(event) => onChangeProperty(property.key, property.type === 'number' ? Number(event.target.value) : event.target.value)}
      className="w-full bg-transparent outline-none text-sm text-[var(--osio-fg-default)]"
    />
  );
};

function propertyInputType(type: PageProperty['type']): React.HTMLInputTypeAttribute {
  if (type === 'date') return 'date';
  if (type === 'url') return 'url';
  if (type === 'number') return 'number';
  return 'text';
}

function stringValue(value: PageProperty['value']): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value == null) return '';
  return String(value);
}


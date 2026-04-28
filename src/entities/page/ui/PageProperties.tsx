/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageProperties.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 18:19:49 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

export interface PageProperty {
  key: string;
  label: string;
  value: string;
  type?: 'text' | 'date' | 'select' | 'url';
}

interface PagePropertiesProps {
  properties: PageProperty[];
  onChangeProperty?: (key: string, value: string) => void;
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
            {onChangeProperty ? (
              <input
                type="text"
                value={prop.value}
                onChange={(e) => onChangeProperty(prop.key, e.target.value)}
                className="w-full bg-transparent outline-none text-sm text-[var(--color-ink)]"
              />
            ) : (
              prop.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

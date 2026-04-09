/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageProperties.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
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
 * Optional page properties bar (like Notion's database-page properties).
 * Only renders when the page has properties attached.
 */
export const PageProperties: React.FC<PagePropertiesProps> = ({
  properties,
  onChangeProperty,
}) => {
  if (properties.length === 0) return null;

  return (
    <div className="notion-page-properties">
      {properties.map((prop) => (
        <div key={prop.key} className="notion-page-property-row">
          <span className="notion-page-property-label">{prop.label}</span>
          <span className="notion-page-property-value">
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

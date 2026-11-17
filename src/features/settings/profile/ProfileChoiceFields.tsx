/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileChoiceFields.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The profile fields that are a choice first: pronouns (presets, "Custom" reveals a 40
 * character input) and location (country select plus an optional city). Both write the
 * profile's existing single string, so the save path and the validators do not change.
 */

import React, { useState } from 'react';

import { Input, Select } from '@/shared/ui';
import { FieldFrame } from './PublicProfileFields';
import { composeLocation, countryOptions, parseLocation, type Place } from './countries';
import { PRONOUN_CUSTOM, PRONOUN_MAX, PRONOUN_PRESETS, pronounSelection } from './pronounChoices';

interface ChoiceProps {
  value: string;
  error?: string | null;
  onChange: (value: string) => void;
}

export const PronounsField: React.FC<ChoiceProps> = ({ value, error, onChange }) => {
  // "Custom" chosen with nothing typed yet has no value to derive the select from.
  const [customChosen, setCustomChosen] = useState(false);
  const derived = pronounSelection(value).choice;
  const choice = derived === '' && customChosen ? PRONOUN_CUSTOM : derived;

  const pick = (next: string) => {
    setCustomChosen(next === PRONOUN_CUSTOM);
    onChange(next === PRONOUN_CUSTOM ? '' : next);
  };

  return (
    <FieldFrame id="profile-pronouns" label="Pronouns" hint={`Pick one, or choose Custom (up to ${PRONOUN_MAX} characters).`} error={error}>
      {(aria) => (
        <div className="space-y-2">
          <Select {...aria} value={choice} onChange={(event) => pick(event.target.value)}>
            <option value="">Not shown</option>
            {PRONOUN_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
            <option value={PRONOUN_CUSTOM}>Custom</option>
          </Select>
          {choice === PRONOUN_CUSTOM && (
            <Input id="profile-pronouns-custom" aria-label="Custom pronouns" maxLength={PRONOUN_MAX} value={value} onChange={(event) => onChange(event.target.value)} />
          )}
        </div>
      )}
    </FieldFrame>
  );
};

export const LocationField: React.FC<ChoiceProps> = ({ value, error, onChange }) => {
  const [place, setPlace] = useState<Place>(() => parseLocation(value));
  const [seen, setSeen] = useState(value);
  // Typing "Paris, France" in the city box must not be re-split under the cursor, so only a
  // value that is not what the boxes already say (discard, a saved version) resets them.
  if (value !== seen) {
    setSeen(value);
    if (composeLocation(place) !== value) setPlace(parseLocation(value));
  }

  const change = (patch: Partial<Place>) => {
    const next = { ...place, ...patch };
    setPlace(next);
    onChange(composeLocation(next));
  };

  return (
    <FieldFrame id="profile-location" label="Location" hint="Country and an optional city, up to 120 characters together." error={error}>
      {(aria) => (
        <div className="space-y-2">
          <Select {...aria} value={place.country} onChange={(event) => change({ country: event.target.value })}>
            <option value="">Not shown</option>
            {countryOptions().map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
          </Select>
          <Input id="profile-city" aria-label="City" autoComplete="address-level2" value={place.city} onChange={(event) => change({ city: event.target.value })} />
        </div>
      )}
    </FieldFrame>
  );
};

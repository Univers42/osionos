/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   countries.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Countries for the location field: ISO 3166-1 alpha-2 codes named by the runtime
 * (`Intl.DisplayNames`), and the parse / compose pair between them and the profile's single
 * `location` column, which keeps holding "City, Country" or "Country".
 *
 * Caveat: parsing recognises a country only as the text after the last comma (or the whole
 * text) written exactly as the runtime names it, case aside. Older free text such as
 * "New York, NY" or "UK" stays whole in the city box, so it is never lost or rewritten; it
 * just is not matched to a country. Names follow the browser's ICU data, English.
 */

export const LOCATION_MAX = 120;

const CODES = `
  AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ
  BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR
  IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC
  CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO
  EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF
  GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY
  HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM
  JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY
  LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX
  FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI
  NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH
  PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC
  WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS
  SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK
  TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU
  VE VN VG VI WF EH YE ZM ZW
`.split(/\s+/).filter(Boolean);

export interface CountryOption {
  code: string;
  name: string;
}

export interface Place {
  /** An ISO code, or "" for none. */
  country: string;
  city: string;
}

let cached: CountryOption[] | null = null;
let byName: Map<string, string> | null = null;

export function countryOptions(): CountryOption[] {
  if (cached) return cached;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  cached = CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, "en"));
  byName = new Map(cached.map((option) => [option.name.toLowerCase(), option.code]));
  return cached;
}

function countryName(code: string): string {
  return countryOptions().find((option) => option.code === code)?.name ?? "";
}

export function composeLocation({ country, city }: Place): string {
  return [city.trim(), countryName(country)].filter(Boolean).join(", ");
}

export function locationFits(place: Place): boolean {
  return composeLocation(place).length <= LOCATION_MAX;
}

export function parseLocation(text: string): Place {
  const value = text.trim();
  countryOptions();
  const whole = byName?.get(value.toLowerCase());
  if (whole) return { country: whole, city: "" };
  const cut = value.lastIndexOf(",");
  const tail = cut < 0 ? undefined : byName?.get(value.slice(cut + 1).trim().toLowerCase());
  return tail ? { country: tail, city: value.slice(0, cut).trim() } : { country: "", city: value };
}

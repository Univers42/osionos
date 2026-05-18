/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** @file index.ts — Public barrel for the dbms adapter package. */

export type {
  DbSourceType,
  DbRecord,
  DbFieldSchema,
  DbEntitySchema,
  DbConnectionConfig,
  DbAdapter,
} from './types.ts';

export { DbMemoCache } from './DbMemoCache.ts';
export { inferSchema } from './inferSchema.ts';
export { JsonDbAdapter } from './JsonDbAdapter.ts';
export { CsvDbAdapter } from './CsvDbAdapter.ts';
export { MongoDbAdapter } from './MongoDbAdapter.ts';
export { PostgresDbAdapter } from './PostgresDbAdapter.ts';
export { createAdapter, configFromEnv, createActiveAdapter } from './DbAdapterFactory.ts';

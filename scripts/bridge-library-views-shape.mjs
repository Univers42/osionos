/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-library-views-shape.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The shape a stored Library view may have. An admin's views are rendered by every
 * member's client, so the record is a closed allowlist taken from the kit's ViewConfig
 * (src/shared/notion-database-sys/packages/contract-types/src/index.ts): an unknown key
 * anywhere is refused, never dropped. View automations, dashboards and widgets are not
 * part of it: a shared view stores layout, it never carries something that runs.
 * The same check runs on read, so a row written around the bridge is not trusted either.
 */

export const LIBRARY_DB_ID = 'workspace-library';
export const MAX_VIEWS = 40;
export const MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 6;
const MAX_STRING = 2000;
const MAX_ARRAY = 200;

// tests/canvas/library-views-shape-parity.test.ts holds these equal to the kit's lists.
export const VIEW_TYPES = ['table', 'board', 'calendar', 'timeline', 'gallery', 'list', 'chart', 'feed', 'map'];
export const FILTER_OPERATORS = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'is_before', 'is_after', 'is_on_or_before', 'is_on_or_after', 'is_between', 'is_relative_to_today', 'is_checked', 'is_not_checked'];
export const SETTINGS_KEYS = [
	'icon', 'showTitle', 'showPageIcon', 'wrapContent', 'loadLimit', 'openPagesIn', 'tableStyle', 'showVerticalLines',
	'showRowNumbers', 'manualRowOrder', 'columnWidths', 'columnCalculations', 'columnOrder', 'colorColumns', 'cardPreview',
	'cardSize', 'cardLayout', 'galleryLayout', 'wrapPageTitles', 'showCalendarBy', 'showCalendarAs', 'showWeekends',
	'weekStartsOn', 'showWeekNumbers', 'showTimelineBy', 'timelineEndBy', 'separateStartEndDates', 'showTable', 'zoomLevel',
	'fitMedia', 'chartType', 'xAxisProperty', 'xAxisSort', 'xAxisOmitZero', 'xAxisTitle', 'yAxisProperty', 'yAxisAggregation',
	'yAxisGroupBy', 'yAxisRange', 'yAxisRangeMin', 'yAxisRangeMax', 'yAxisTitle', 'yAxisCumulative', 'xAxisDateBucket',
	'chartHeight', 'gradientFill', 'donutCenterValue', 'colorByValue', 'hiddenGroups', 'manualGroupOrder', 'showReferenceLine',
	'referenceLineValue', 'colorPalette', 'showLegend', 'showGridLines', 'showDataLabels', 'roundedBars', 'smoothLine',
	'showDataSourceTitle', 'viewIcon', 'calendarMode', 'wrapProperties', 'showAuthorByline', 'mapBy', 'mapDisplayMode',
	'mapSizeBy', 'responsiveLayout', 'tabDisplay', 'groupLayout', 'collapsedGroupIds', 'locked', 'conditionalColors',
];

const VIEW_ID = /^v-[A-Za-z0-9_-]{1,64}$/;
const VIEW_KEYS = new Set(['id', 'databaseId', 'name', 'type', 'filters', 'filterConjunction', 'sorts', 'grouping', 'subGrouping', 'visibleProperties', 'settings']);
const FILTER_KEYS = new Set(['id', 'propertyId', 'operator', 'value']);
const SORT_KEYS = new Set(['id', 'propertyId', 'direction']);
const GROUPING_KEYS = new Set(['propertyId', 'hiddenGroups', 'sort']);
const SUBGROUPING_KEYS = new Set(['propertyId']);
const SETTINGS = new Set(SETTINGS_KEYS);
const TYPES = new Set(VIEW_TYPES);
const OPERATORS = new Set(FILTER_OPERATORS);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Caveat: a denylist of the schemes a renderer could act on (javascript:, data:, a URL).
// A string naming another scheme ("mailto:") passes, and so does plain text that happens to
// start like one ("Data: notes" is refused). Renderers must still treat these as text.
const URL_LIKE = /^\s*(?:(?:javascript|vbscript|data|file|blob|https?|ftp)\s*:|\/\/)/i;

export class LibraryViewsShapeError extends Error {
	constructor(path, message) {
		super(`${path}: ${message}`);
		this.path = path;
	}
}

const refuse = (path, message) => { throw new LibraryViewsShapeError(path, message); };
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
	&& Object.getPrototypeOf(value) === Object.prototype;

function checkValue(value, path, depth) {
	if (depth > MAX_DEPTH) refuse(path, `nested deeper than ${MAX_DEPTH}`);
	if (value === null || typeof value === 'boolean') return;
	if (typeof value === 'number') { if (!Number.isFinite(value)) refuse(path, 'not a finite number'); return; }
	if (typeof value === 'string') {
		if (value.length > MAX_STRING) refuse(path, `longer than ${MAX_STRING} characters`);
		if (URL_LIKE.test(value)) refuse(path, 'a link is not a view setting');
		return;
	}
	if (Array.isArray(value)) {
		if (value.length > MAX_ARRAY) refuse(path, `more than ${MAX_ARRAY} items`);
		value.forEach((item, index) => checkValue(item, `${path}[${index}]`, depth + 1));
		return;
	}
	if (!isPlainObject(value)) refuse(path, 'not JSON');
	for (const [key, item] of Object.entries(value)) {
		if (FORBIDDEN_KEYS.has(key)) refuse(path, `the key ${key} is not allowed`);
		checkValue(item, `${path}.${key}`, depth + 1);
	}
}

function checkRecord(value, keys, path, depth) {
	if (!isPlainObject(value)) refuse(path, 'must be an object');
	for (const key of Object.keys(value)) if (!keys.has(key)) refuse(path, `${key} is not a view field`);
	checkValue(value, path, depth);
}

function checkText(value, path, max) {
	if (typeof value !== 'string' || value.length > max) refuse(path, `must be a string of at most ${max} characters`);
}

function checkList(value, path, max, each) {
	if (!Array.isArray(value) || value.length > max) refuse(path, `must be a list of at most ${max}`);
	value.forEach((item, index) => each(item, `${path}[${index}]`));
}

function checkView(id, view, path) {
	if (FORBIDDEN_KEYS.has(id) || !VIEW_ID.test(id)) refuse(path, 'not a view id');
	checkRecord(view, VIEW_KEYS, path, 1);
	if (view.id !== id) refuse(`${path}.id`, 'must equal its key');
	if (view.databaseId !== LIBRARY_DB_ID) refuse(`${path}.databaseId`, 'must be the Library');
	checkText(view.name, `${path}.name`, 120);
	if (!TYPES.has(view.type)) refuse(`${path}.type`, 'not a view type');
	if (view.filterConjunction !== 'and' && view.filterConjunction !== 'or') refuse(`${path}.filterConjunction`, 'must be and/or');
	checkList(view.filters, `${path}.filters`, 50, (filter, at) => {
		checkRecord(filter, FILTER_KEYS, at, 2);
		checkText(filter.id, `${at}.id`, 64);
		checkText(filter.propertyId, `${at}.propertyId`, 128);
		if (!OPERATORS.has(filter.operator)) refuse(`${at}.operator`, 'not a filter operator');
	});
	checkList(view.sorts, `${path}.sorts`, 20, (sort, at) => {
		checkRecord(sort, SORT_KEYS, at, 2);
		checkText(sort.id, `${at}.id`, 64);
		checkText(sort.propertyId, `${at}.propertyId`, 128);
		if (sort.direction !== 'asc' && sort.direction !== 'desc') refuse(`${at}.direction`, 'must be asc/desc');
	});
	checkList(view.visibleProperties, `${path}.visibleProperties`, 60, (item, at) => checkText(item, at, 128));
	if (view.grouping !== undefined) checkRecord(view.grouping, GROUPING_KEYS, `${path}.grouping`, 2);
	if (view.subGrouping !== undefined) checkRecord(view.subGrouping, SUBGROUPING_KEYS, `${path}.subGrouping`, 2);
	checkRecord(view.settings, SETTINGS, `${path}.settings`, 2);
}

/** The validated copy of `views`, or a LibraryViewsShapeError naming the first bad path. */
export function parseLibraryViews(views) {
	if (!isPlainObject(views)) refuse('views', 'must be an object');
	const entries = Object.entries(views);
	if (entries.length > MAX_VIEWS) refuse('views', `more than ${MAX_VIEWS} views`);
	for (const [id, view] of entries) checkView(id, view, `views.${id}`);
	const text = JSON.stringify(views);
	if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) refuse('views', `larger than ${MAX_BYTES} bytes`);
	return JSON.parse(text);
}

/** What a reader gets from a stored record: each view that still passes, the rest dropped. */
export function readStoredLibraryViews(stored) {
	if (!isPlainObject(stored)) return {};
	const views = {};
	let bytes = 0;
	for (const [id, view] of Object.entries(stored).slice(0, MAX_VIEWS)) {
		try {
			checkView(id, view, `views.${id}`);
			bytes += Buffer.byteLength(JSON.stringify(view), 'utf8');
			if (bytes > MAX_BYTES) break;
			views[id] = view;
		} catch (error) {
			if (!(error instanceof LibraryViewsShapeError)) throw error;
		}
	}
	return views;
}

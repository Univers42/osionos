/**
 * Terminal utility helpers: ANSI stripping, callout colors/icons.
 */

import { C } from './terminalAnsi';

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replaceAll(/\x1b\[[0-9;]*m/g, '');
}

export function getCalloutColor(kind: string): string {
  switch (kind) {
    case 'warning': case 'caution': return C.calloutWarn;
    case 'danger': case 'error': return C.calloutError;
    case 'tip': case 'success': return C.calloutTip;
    default: return C.calloutInfo;
  }
}
export function getCalloutIcon(kind: string): string {
  switch (kind) {
    case 'warning': case 'caution': return '⚠';
    case 'danger': case 'error': return '✖';
    case 'tip': case 'success': return '✔';
    case 'note': return 'ℹ';
    case 'info': return 'ℹ';
    default: return '▪';
  }
}

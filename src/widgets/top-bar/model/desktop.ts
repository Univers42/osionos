/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   desktop.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Desktop-shell detection + window-control bindings. Electron exposes
 * `window.osionosDesktop` (preload bridge: minimize/toggleMaximize/close);
 * Tauri exposes `window.__TAURI__`. On the plain web both are undefined and
 * the top bar hides its window controls (see WindowControls).
 */

export interface WindowControlBridge {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}

interface TauriWindowApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
}

interface TauriGlobal {
  window?: { getCurrentWindow: () => TauriWindowApi };
}

function electronBridge(): WindowControlBridge | null {
  return (globalThis as unknown as { osionosDesktop?: WindowControlBridge }).osionosDesktop ?? null;
}

function tauriGlobal(): TauriGlobal | null {
  return (globalThis as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

/** True when running inside the Electron or Tauri desktop shell. */
export function isDesktop(): boolean {
  return electronBridge() !== null || tauriGlobal()?.window != null;
}

/** Window min/max/close callbacks for the active shell, or null on the web. */
export function windowControls(): WindowControlBridge | null {
  const electron = electronBridge();
  if (electron) return electron;
  const tauri = tauriGlobal();
  if (tauri?.window) {
    const current = () => tauri.window!.getCurrentWindow();
    return {
      minimize: () => { void current().minimize(); },
      toggleMaximize: () => { void current().toggleMaximize(); },
      close: () => { void current().close(); },
    };
  }
  return null;
}

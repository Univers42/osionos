declare module 'csv-parse/sync' {
  export function parse(input: string | Buffer, options?: Record<string, unknown>): unknown[];
}

declare module 'mongodb' {
  export type Document = Record<string, unknown>;

  export interface Collection {
    find(filter?: Document): { toArray(): Promise<Document[]> };
    findOne(filter: Document): Promise<Document | null>;
    findOneAndUpdate(filter: Document, update: Document, options?: Document): Promise<Document | null>;
    insertOne(document: Document): Promise<{ insertedId: unknown }>;
    deleteOne(filter: Document): Promise<{ deletedCount?: number }>;
    updateOne(filter: Document, update: Document): Promise<{ modifiedCount?: number }>;
    updateMany(filter: Document, update: Document): Promise<{ modifiedCount?: number }>;
  }

  export interface Db {
    collection(name: string): Collection;
    command(command: Document): Promise<Document>;
    listCollections(): { toArray(): Promise<Array<{ name: string }>> };
  }

  export class MongoClient {
    constructor(uri: string);
    connect(): Promise<void>;
    close(): Promise<void>;
    db(name: string): Db;
  }
}

declare module 'pg' {
  namespace pg {
    interface QueryResult<TRow = unknown> {
      rows: TRow[];
    }

    interface PoolClient {
      release(): void;
    }

    interface PoolOptions {
      connectionString?: string;
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      database?: string;
      max?: number;
      idleTimeoutMillis?: number;
    }

    class Pool {
      constructor(options?: PoolOptions);
      connect(): Promise<PoolClient>;
      end(): Promise<void>;
      query<TRow = unknown>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
    }
  }

  const pg: { Pool: typeof pg.Pool };
  export = pg;
}

declare module 'leaflet' {
  export interface IconOptions {
    iconUrl?: string;
    iconRetinaUrl?: string;
    shadowUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
    shadowSize?: [number, number];
  }

  export interface DivIconOptions {
    className?: string;
    html?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  }

  export interface DivIcon { [option: string]: unknown }
  export interface Icon { [option: string]: unknown }
  export interface LayerGroup {
    clearLayers(): this;
    addTo(map: Map): this;
    addLayer(layer: unknown): this;
  }
  export interface LeafletPoint { x: number; y: number }
  export interface LatLngBounds { pad(ratio: number): LatLngBounds }
  export interface Map {
    remove(): void;
    setView(center: [number, number], zoom: number): this;
    fitBounds(bounds: unknown, options?: Record<string, unknown>): this;
    flyTo(center: [number, number], zoom?: number, options?: Record<string, unknown>): this;
    flyToBounds(bounds: LatLngBounds, options?: Record<string, unknown>): this;
    getZoom(): number;
    getSize(): LeafletPoint;
    getPanes(): { overlayPane: HTMLElement };
    project(latlng: [number, number], zoom: number): LeafletPoint;
    latLngToContainerPoint(latlng: [number, number]): LeafletPoint;
    containerPointToLayerPoint(point: [number, number]): LeafletPoint;
    on(events: string, handler: (...args: unknown[]) => void): this;
    off(events: string, handler: (...args: unknown[]) => void): this;
    once(events: string, handler: (...args: unknown[]) => void): this;
  }

  export class Marker {
    options: { icon?: Icon };
    static prototype: { options: { icon?: Icon } };
  }

  export interface LeafletMarker {
    addTo(group: LayerGroup): LeafletMarker;
    bindPopup(content: string, options?: Record<string, unknown>): LeafletMarker;
    on(events: string, handler: (...args: unknown[]) => void): LeafletMarker;
    openPopup(): LeafletMarker;
    closePopup(): LeafletMarker;
  }

  export function icon(options: IconOptions): Icon;
  export function divIcon(options: DivIconOptions): DivIcon;
  export function map(element: HTMLElement, options?: Record<string, unknown>): Map;
  export function tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: Map): unknown };
  export function layerGroup(): LayerGroup;
  export function marker(position: [number, number], options?: Record<string, unknown>): LeafletMarker;
  export function circleMarker(position: [number, number], options?: Record<string, unknown>): LeafletMarker;
  export function latLngBounds(points: Array<[number, number]>): LatLngBounds;
  export const DomUtil: { setPosition(el: HTMLElement, point: LeafletPoint): void };
  export const control: {
    zoom(options?: Record<string, unknown>): { addTo(map: Map): unknown };
    attribution(options?: Record<string, unknown>): {
      addAttribution(html: string): { addTo(map: Map): unknown };
      addTo(map: Map): unknown;
    };
  };
}

declare module 'vite-plugin-wasm' {
  import type { Plugin } from 'vite';
  export default function wasm(): Plugin;
}

declare module 'vscode' {
  export interface Disposable {
    dispose(): unknown;
  }

  export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
  }

  export interface ExtensionContext {
    subscriptions: Disposable[];
    globalState: Memento;
  }

  export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string): boolean;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
    update(section: string, value: unknown, target?: ConfigurationTarget): Thenable<void>;
  }

  export enum ConfigurationTarget {
    Global = 1,
  }

  export const commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
    executeCommand(command: string, ...args: unknown[]): Thenable<unknown>;
  };
  export const workspace: {
    onDidChangeConfiguration(listener: (event: ConfigurationChangeEvent) => unknown): Disposable;
    getConfiguration(section?: string): WorkspaceConfiguration;
  };
  export const window: {
    showQuickPick<T extends { label: string }>(items: readonly T[], options?: Record<string, unknown>): Thenable<T | undefined>;
    showInputBox(options?: { prompt?: string; value?: string; validateInput?: (value: string) => string | null | undefined }): Thenable<string | undefined>;
    showInformationMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;
    showErrorMessage(message: string): Thenable<string | undefined>;
  };
  export const env: {
    appRoot: string;
  };
}
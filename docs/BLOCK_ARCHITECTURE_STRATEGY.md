# Osionos — Block Architecture Strategy

## Documento de estrategia técnica para la migración del modelo de bloques

**Proyecto:** Prismatica / Osionos (ft_transcendence)
**Equipo:** dlesieur, danfern3, serjimen, esettes, vjan-nie (Univers42)
**Fecha:** Abril 2026
**Versión:** 1.0

---

## Tabla de contenidos

1. [Contexto y motivación](#1-contexto-y-motivación)
2. [Análisis comparativo: Osionos vs Notion](#2-análisis-comparativo-osionos-vs-notion)
3. [Auditoría de deuda técnica actual](#3-auditoría-de-deuda-técnica-actual)
4. [Puntos de flaqueo de Notion que podemos superar](#4-puntos-de-flaqueo-de-notion-que-podemos-superar)
5. [Optimización del markengine y su integración con el UI engine](#5-optimización-del-markengine-y-su-integración-con-el-ui-engine)
6. [Evaluación de estrategias alternativas](#6-evaluación-de-estrategias-alternativas)
7. [Plan de implementación: Estrategia A — Normalización total](#7-plan-de-implementación-estrategia-a--normalización-total)
8. [Checklist de validación](#8-checklist-de-validación)

---

## 1. Contexto y motivación

Osionos es un editor de bloques Notion-inspired con 19+ tipos de bloque, slash commands, detección de markdown shortcuts, drag-and-drop, y un backend Fastify + MongoDB. El proyecto aspira a la flexibilidad y polimorfismo de Notion, pero tomando decisiones propias donde el enfoque de Notion tenga debilidades.

El problema central es que **no tenemos una jerarquía clara de bloques padres e hijos**. El modelo actual es un array plano de bloques por página, con la única excepción del toggle block que maneja hijos como caso especial. Esto bloquea funcionalidades fundamentales: indentación estructural, sub-tareas, anidamiento genérico, y collaborative editing.

Este documento presenta un análisis exhaustivo del estado actual, identifica todos los puntos de deuda técnica, compara nuestro enfoque con el de Notion (identificando sus propias debilidades), y cierra con un plan de implementación completo para la migración a un modelo normalizado.

### Fuentes de referencia

- Artículo oficial de Notion: *"The data model behind Notion's flexibility"* (Mayo 2021)
- Código fuente del repositorio osionos (revisión completa de Abril 2026)
- Documentación interna: `TOGGLE_IMPLEMENTATION_NOTES.md`, `SHELL_UI_LAYOUT.md`

---

## 2. Análisis comparativo: Osionos vs Notion

### 2.1 — El modelo de datos de Notion

Notion implementa un modelo donde absolutamente todo es un **bloque** con cinco atributos fundamentales:

- **`id`** — UUID v4 único
- **`type`** — Define cómo se renderiza (paragraph, heading, to_do, toggle, page, etc.)
- **`properties`** — Bag de datos específicos del tipo. El más común es `title` (texto del bloque). Desacoplados del tipo: hacer "Turn Into" solo cambia `type`, las properties persisten
- **`content`** — Array ordenado de IDs de bloques hijos (punteros "hacia abajo"). Define la posición y orden de renderizado
- **`parent`** — ID del bloque padre (puntero "hacia arriba"). Usado exclusivamente para permisos

Este modelo forma un **render tree** donde la indentación no es visual sino estructural: indentar un bloque lo mueve al array `content` de su hermano anterior. Las páginas son bloques cuyo `content` se renderiza en una vista nueva en vez de indentado.

Las mutaciones se expresan como **operaciones** agrupadas en **transacciones** que se aplican localmente de inmediato (optimistic update), se persisten en una cola (TransactionQueue en IndexedDB/SQLite), y se envían al servidor via `/saveTransactions`. El servidor valida permisos y coherencia con un modelo "before/after" antes de confirmar.

### 2.2 — El modelo actual de Osionos

Nuestro modelo tiene estas características:

- **Bloques como entidad plana dentro de una página.** `usePageStore` gestiona un `Record<string, PageEntry[]>` donde cada `PageEntry` tiene un array `content: Block[]`. Los bloques tienen `id`, `type`, `content` (texto, no hijos), y propiedades específicas del tipo (`checked`, `language`, `tableData`, etc.) todas al mismo nivel
- **Jerarquía ad-hoc.** Solo el toggle block tiene `children: Block[]`. Los hijos son objetos completos embebidos, no referencias por ID
- **Mutaciones tree-wide.** Cada operación (indent, outdent, move) clona el árbol completo con `cloneBlocks()` y muta in-place con `splice`. Complejidad O(n) por operación
- **Pipeline de edición centralizado.** `usePlaygroundBlockEditor` opera solo sobre bloques de nivel de página. No soporta subárboles

### 2.3 — Tabla de semejanzas y diferencias

| Aspecto | Notion | Osionos | Alineación |
|---------|--------|---------|------------|
| Todo es un bloque | Sí — páginas, texto, listas, embeds son bloques | Sí — 19+ tipos, páginas son contenedores de bloques | ✅ Alineados |
| Tipo + properties desacoplados | `type` define rendering; `properties` persisten independiente del tipo | Todas las properties están en la interfaz base `Block` con index signature | ⚠️ Parcial — necesita discriminated unions |
| Array de hijos como IDs | `content: string[]` referencia IDs de bloques hijos | `children?: Block[]` embebe objetos completos (solo toggle) | ❌ Divergente |
| Puntero al padre | `parent: string` para permisos | No existe a nivel de modelo | ❌ Ausente |
| Store normalizado | RecordCache indexado por ID, lookup O(1) | Array plano `Block[]`, lookup O(n) con `.find()` | ❌ Divergente |
| Slash commands | Menú `/` genera bloques del tipo seleccionado | `SlashCommandMenu` + `changeBlockType` | ✅ Alineados |
| Markdown shortcuts | Convierte prefijos a tipos de bloque | `detectBlockType()` en markengine (AST-first) | ✅ Alineados (nosotros más avanzado) |
| "Turn Into" | Cambia `type`, preserva properties y content/hijos | `changeBlockType` existe pero no preserva hijos | ⚠️ Parcial |
| Transacciones atómicas | Operaciones agrupadas en transacciones con validación server-side | Mutaciones individuales, debounce 500ms para persistencia | ❌ Divergente |
| Optimistic updates | Aplica localmente → persiste en cola → envía a server | Auto-save con debounce, fallback offline | ⚠️ Espíritu similar |
| Indentación estructural | Mover bloque al `content` del hermano anterior | `applyBlockIndent` existe en helpers pero limitado al array plano | ⚠️ Parcial |
| Rendering recursivo | Cada bloque con `content` renderiza sus hijos con el mismo componente | Solo toggle renderiza hijos con `BlockEditor`; resto es plano | ❌ Solo toggle |

---

## 3. Auditoría de deuda técnica actual

### 3.1 — CRÍTICO: La interfaz `Block` es un god-type con index signature

**Archivo:** `entities/block/model/types.ts`

```typescript
export interface Block {
  id: string;
  type: BlockType;
  content: string;           // ← Colisión semántica: "content" es texto, no hijos
  children?: Block[];        // ← Objetos embebidos, no referencias
  checked?: boolean;
  language?: string;
  color?: string;
  collapsed?: boolean;
  tableData?: string[][];
  databaseId?: string;
  viewId?: string;
  [key: string]: unknown;    // ← Anula todo el tipado estricto
}
```

**Problemas concretos:**

1. **`[key: string]: unknown`** permite cualquier propiedad sin error de compilación. Un `heading_1` acepta `block.tableData = [["foo"]]` sin quejarse. Contradice directamente el principio de "strict typing, no `any`" y SonarQube no puede detectar propiedades fantasma
2. **Todas las propiedades específicas de tipo** (`checked`, `language`, `tableData`, `databaseId`, `viewId`) viven al mismo nivel. Un `paragraph` tiene `checked?: boolean` en su tipo aunque nunca lo use. Cada nuevo tipo de bloque requiere modificar la interfaz base — violación del principio Open/Closed
3. **`content: string`** colisiona semánticamente con el `content: string[]` de Notion (array de IDs hijos). Si migramos, hay que renombrar
4. **`children?: Block[]`** embebe objetos completos en vez de referenciar IDs. Hace que cada mutación requiera deep clone y que la serialización a BD sea costosa

### 3.2 — CRÍTICO: Deep clone en cada mutación del árbol

**Archivo:** `store/pageStore.helpers.ts`

```typescript
function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => ({
    ...block,
    children: block.children ? cloneBlocks(block.children) : undefined,
  }));
}
```

Cada operación de `applyBlockIndent`, `applyBlockOutdent`, y `applyBlockMove` clona el árbol completo antes de mutar. Complejidad: O(n) donde n es el número total de bloques (incluyendo todos los hijos recursivamente).

Peor aún, las funciones de mutación (`insertBlockIntoTree`, `indentBlockInTree`) **mutan in-place con `splice`** después del clone. Este patrón es frágil: si alguna ruta de código olvida clonar primero, se corrompe el estado de Zustand. Además, `insertBlockIntoTree` devuelve `boolean` para indicar éxito, lo cual significa que un fallo de inserción no genera error — simplemente no pasa nada, silenciosamente.

**Impacto:** Con 50 bloques en una página, cada Tab (indent) clona 50 objetos. Con 200 bloques (una página rica), clona 200. Con el modelo normalizado, la misma operación modificaría 2 arrays de IDs: O(1).

### 3.3 — ALTO: `BlockEditor.tsx` es un switch monolítico de 775 líneas

**Archivo:** `features/block-editor/ui/BlockEditor.tsx`

Un solo `switch(block.type)` renderiza 18+ tipos de bloque. Además incluye inline:

- `TableBlockEditor` con su propio estado de context menu (~200 líneas)
- Code editor con language picker, delete confirmation dialog, mermaid preview
- Portales para context menus y dialogs

SonarQube marcará cognitive complexity alta en la función del componente principal. Pero el problema real es de mantenibilidad: cada nuevo tipo de bloque con UI especial (como ya pasó con `TodoBlockEditor` y `ToggleBlockEditor`) requiere añadir más lógica al switch.

### 3.4 — ALTO: `ReadOnlyBlock.tsx` duplica el switch del editor

**Archivo:** `entities/block/ui/ReadOnlyBlock.tsx`

Tiene el mismo switch con 18+ cases, con ligeras variaciones de estilo. Incluye inline `ToggleBlockReadOnly` y `TableBlockReadOnly` (~100 líneas cada uno). Si se añade un tipo nuevo y se olvida uno de los dos switches, el bloque se renderiza como párrafo silenciosamente (caso `default`).

**Riesgo:** Dos switches paralelos que deben mantenerse sincronizados manualmente. N archivos × M tipos = N×M puntos de fallo.

### 3.5 — MEDIO: `useSlashSelect` busca bloques con `.find()` en array raíz

**Archivo:** `features/slash-commands/useSlashSelect.ts`

```typescript
const block = content.find((b) => b.id === blockId);
```

O(n) y solo busca en el nivel raíz. Si el bloque activo está dentro de un toggle (es un child), **no lo encuentra**. Esta es otra manifestación del modelo plano que limita dónde funcionan los features.

### 3.6 — MEDIO: Numbered list counter como variable mutable reimplementada

**Archivos:** `PlaygroundPageEditor.tsx` y `PageBlocksRenderer.tsx`

```typescript
let numberedCounter = 0;
const numberedIndex = block.type === "numbered_list" ? ++numberedCounter : 0;
if (block.type !== "numbered_list") numberedCounter = 0;
```

Implementado dos veces (editor y read-only), depende del orden de iteración, y se rompe con bloques anidados (un `numbered_list` hijo de un toggle tendría su propio contexto de numeración, pero el counter es del scope del padre).

### 3.7 — MEDIO: Focus management acoplado al DOM

**Archivos:** `ToggleBlockEditor.tsx`, `useSlashSelect.ts`

```typescript
// ToggleBlockEditor
function focusBySelector(selector: string, cursorEnd = false): void {
  setTimeout(() => {
    const el = document.querySelector(selector) as HTMLElement | null;
    // ...
  }, FOCUS_DELAY_MS);
}

// useSlashSelect
export function repositionCursor(blockId: string, _content: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`);
    // ...
  }, 30);
}
```

Dos implementaciones distintas del mismo patrón, ambas usando `document.querySelector` con selectores hardcodeados y `setTimeout` con delays mágicos (30ms). Esto acopla la lógica del editor al DOM real, hace que los tests sean difíciles, y es frágil ante cambios de markup. El ref registry existente (`registerBlockRef`) debería ser la única API de focus.

### 3.8 — BAJO: El campo `color` de callout no es un color

**Archivo:** `BlockEditor.tsx`, `CalloutBlockReadOnly.tsx`

```typescript
const icon = block.color || "💡";
const colors = CALLOUT_COLORS[icon] || { /* defaults */ };
```

El campo `color` almacena un emoji (💡, ⚠️, etc.), no un color. `CALLOUT_COLORS` mapea emojis a clases de Tailwind. La propiedad debería llamarse `icon` o `calloutIcon` para que el modelo sea auto-documentado.

### 3.9 — BAJO: `PlaygroundPageEditor` pasa `blocks` array a través de toda la jerarquía

Cada `EditableBlock` recibe el array `blocks` completo solo para que los handlers puedan pasarlo de vuelta al hook. Esto es prop-drilling innecesario que un store normalizado elimina: cada componente lee el bloque que necesita directamente del store por ID.

---

## 4. Puntos de flaqueo de Notion que podemos superar

### 4.1 — Properties sin tipado fuerte → Discriminated unions en compile-time

Notion usa un bag genérico de properties donde el tipo del bloque define cómo se interpretan en runtime. Al hacer "Turn Into", las properties del tipo anterior se ignoran pero **no se eliminan**. Un bloque que fue `to_do → heading → code → paragraph` arrastra `checked`, `language`, y propiedades de todos los tipos anteriores indefinidamente (data bloat).

**Nuestra ventaja:** TypeScript permite discriminated unions que validan en compile-time:

```typescript
// Base compartida por todos los bloques
interface BlockBase {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  createdAt: number;
  updatedAt: number;
}

// Cada tipo define sus properties exactas
interface ParagraphBlock extends BlockBase {
  type: 'paragraph';
  properties: { text: string };
}

interface TodoBlock extends BlockBase {
  type: 'to_do';
  properties: { text: string; checked: boolean };
}

interface CodeBlock extends BlockBase {
  type: 'code';
  properties: { text: string; language: string };
}

interface CalloutBlock extends BlockBase {
  type: 'callout';
  properties: { text: string; icon: string };
}

// Union discriminada — TypeScript infiere el tipo correcto en switch
type Block = ParagraphBlock | TodoBlock | CodeBlock | CalloutBlock | /* ... */;
```

Con esto, `block.properties.checked` solo es accesible si `block.type === 'to_do'`. El compilador protege contra accesos inválidos. "Turn Into" se convierte en una función explícita que mapea properties de un tipo a otro:

```typescript
function transformBlock(block: Block, newType: BlockType): Block {
  const base = { id: block.id, parentId: block.parentId, childrenIds: block.childrenIds };
  const text = getBlockText(block); // Extrae text de cualquier tipo

  switch (newType) {
    case 'to_do':
      return { ...base, type: 'to_do', properties: { text, checked: false } };
    case 'code':
      return { ...base, type: 'code', properties: { text, language: 'plaintext' } };
    // ... cada tipo define exactamente qué properties inicializa
  }
}
```

Sin basura residual, con validación en compile-time.

### 4.2 — Puntero `parent` duplicado y desincronizable → `parentId` derivado

Notion mantiene dos fuentes de verdad para la relación padre-hijo: el array `content` (descendente) y el campo `parent` (ascendente). El artículo admite que "se espejan mutuamente, salvo algunos edge cases que estamos arreglando". Dos fuentes de verdad para la misma relación siempre divergen eventualmente.

**Nuestra ventaja:** Con un store normalizado donde la fuente de verdad es `childrenIds`, podemos **derivar** el parent como un índice invertido calculado una sola vez y actualizado reactivamente:

```typescript
// Selector derivado — no se almacena, se computa
function buildParentIndex(blocks: Record<string, Block>): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const [id, block] of Object.entries(blocks)) {
    for (const childId of block.childrenIds) {
      parentOf.set(childId, id);
    }
  }
  return parentOf;
}

// En el store, memoizado:
const parentIndex = useMemo(() => buildParentIndex(blocks), [blocks]);

// Uso: encontrar todos los ancestros para permisos
function getAncestors(blockId: string, parentIndex: Map<string, string>): string[] {
  const ancestors: string[] = [];
  let current = parentIndex.get(blockId);
  while (current) {
    ancestors.push(current);
    current = parentIndex.get(current);
  }
  return ancestors;
}
```

Una sola fuente de verdad (`childrenIds`), cero riesgo de desincronización. Si necesitamos traversal ascendente (permisos, breadcrumbs), derivamos la cadena de ancestros del índice invertido.

### 4.3 — Notion permite referencias múltiples (DAG) → Nosotros: árbol estricto

El artículo de Notion dice que inicialmente permitieron que un bloque estuviera en múltiples arrays `content`. Esto creó un DAG (directed acyclic graph) en vez de un árbol, lo cual rompió el sistema de permisos porque la herencia se volvió ambigua.

**Nuestra ventaja:** Si definimos como invariante que un bloque solo puede estar en un `childrenIds`, nuestro modelo es un **árbol estricto**, no un DAG. Beneficios:

- **Permisos:** Cada bloque tiene exactamente un ancestro. La cadena de herencia es unívoca
- **Undo/redo:** Cada operación tiene un padre bien definido. Las inversas son deterministas
- **Consistencia:** Un bloque no puede "desaparecer" de una vista mientras sigue visible en otra
- **Simplicidad de implementación:** No necesitamos resolver ambigüedades de multi-parent

Para casos donde un usuario quiera "reutilizar" un bloque en dos lugares, el patrón correcto es un **synced block** (referencia explícita, no multi-parent implícito). Esto lo podemos implementar como un tipo de bloque especial `synced_reference` que apunta a otro bloque pero no lo posee.

### 4.4 — Notion no tiene AST-first markdown → Nuestro markengine es un diferenciador

El markengine de Notion es un detector de shortcuts simple que convierte prefijos a tipos de bloque. El nuestro es un motor AST con dos pasadas (block → inline), múltiples renderers (HTML, React, Terminal), y detección de shortcuts integrada en el parser.

Esto nos permite capacidades que Notion no tiene de forma nativa:

- **Paste inteligente:** Markdown completo del clipboard → conversión a árbol de bloques en una sola operación (ya tenemos `parseMarkdownToBlocks`)
- **Export fiel:** Árbol de bloques → markdown sin pérdida de información estructural
- **Validación de contenido inline** a nivel de AST (detectar links rotos, markdown malformado) sin tocar el DOM
- **Live preview en edición:** Mostrar `**bold**` con estilo bold mientras el usuario escribe (como Obsidian), sin convertir a HTML
- **Extensibilidad:** Nuevos formatos inline (e.g., LaTeX, mentions, dates) se añaden como nodos del AST, no como regex en el renderer

> **Este es el activo técnico más valioso del proyecto y debe ser prioridad en la optimización.**

---

## 5. Optimización del markengine y su integración con el UI engine

### 5.1 — Estado actual del pipeline

`markengine.ts` exporta 5 funciones del submodule via `markengine/shortcuts`:

- `BLOCK_SHORTCUTS` — Mapa de prefijos markdown a tipos de bloque
- `detectBlockType()` — Detecta si el texto empieza con un shortcut
- `getCalloutIconForKind()` — Mapea tipo de callout a emoji
- `parseInlineMarkdown()` — Convierte texto con markdown inline a HTML string
- `parseMarkdownToBlocks()` — Convierte markdown completo a `Block[]`

El flujo actual tiene dos paths separados y desconectados:

```
INPUT PATH:
  keystroke → handleBlockChange() → detectBlockType() → changeBlockType()
  (Transforma el tipo del bloque basado en el prefijo)

OUTPUT PATH:
  block.content → parseInlineMarkdown() → dangerouslySetInnerHTML
  (Renderiza bold, italic, links en el HTML final)
```

### 5.2 — Problemas identificados

#### P1: `detectBlockType` se ejecuta en cada keystroke sin early-return

Cada carácter que el usuario escribe pasa por el detector de shortcuts. Aunque la complejidad individual es baja (O(k) donde k es la longitud del prefijo más largo), se puede optimizar con un early-return basado en el primer carácter:

```typescript
const SHORTCUT_FIRST_CHARS = new Set(['#', '-', '*', '1', '2', '3', '4', '5', '6', '7', '8', '9', '>', '/', '`', '[']);

function detectBlockType(text: string): BlockDetection | null {
  // Early return: si el primer carácter no puede iniciar un shortcut, no hay nada que detectar
  if (!text || !SHORTCUT_FIRST_CHARS.has(text[0])) return null;
  // ... resto de la detección
}
```

#### P2: `parseInlineMarkdown` se llama en el render path sin cache

En `ReadOnlyBlock`, cada bloque parsea su contenido en cada re-render:

```typescript
function renderInlineMarkdown(content: string) {
  if (!content) return null;
  return { __html: parseInlineMarkdown(content) };
}
```

Con una página de 100 bloques, un cambio en un solo bloque re-parsea los 100 si no hay memoización adecuada (depende de la estructura de renders del padre). Con el store normalizado + React.memo, solo el bloque que cambió debería re-parsear.

**Solución recomendada:** Cachear el HTML parseado como propiedad derivada. Cuando `properties.text` cambia, se recalcula el inline HTML una vez y se almacena:

```typescript
// En un selector memoizado del store o en un cache externo
const inlineHtmlCache = new Map<string, string>();

function getInlineHtml(blockId: string, text: string): string {
  const cached = inlineHtmlCache.get(blockId);
  // Invalidar solo cuando el texto cambia (comparación rápida)
  if (cached !== undefined && cachedTextMap.get(blockId) === text) return cached;
  const html = parseInlineMarkdown(text);
  inlineHtmlCache.set(blockId, html);
  cachedTextMap.set(blockId, text);
  return html;
}
```

#### P3: Los dos paths (input/output) no comparten contexto

El detector de shortcuts no sabe qué inline markdown hay en el bloque. El renderer no sabe qué shortcuts están activos. Esto impide features como:

- Mostrar el markdown raw con decoraciones (estilo Obsidian) en vez de convertir a HTML
- Validar el contenido inline mientras el usuario escribe
- Ofrecer autocompletado contextual basado en el AST

#### P4: El pipeline no es bidireccional

No hay forma nativa de serializar un árbol de bloques de vuelta a markdown. `parseMarkdownToBlocks` convierte MD → Blocks, pero no existe `blocksToMarkdown`. Esto limita el export y el copy/paste entre aplicaciones.

### 5.3 — Pipeline unificado propuesto

```
┌─────────────────────────────────────────────────────────┐
│                    MARKENGINE PIPELINE                    │
│                                                           │
│  INPUT STAGE                                              │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Raw Text  │───▶│ detectShort- │───▶│ BlockType +  │   │
│  │ (keystroke)│    │ cut()        │    │ cleanedText  │   │
│  └───────────┘    └──────────────┘    └──────────────┘   │
│                                                           │
│  PARSING STAGE (shared AST)                               │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Text with │───▶│ parseInline  │───▶│ Inline AST   │   │
│  │ markdown  │    │ ToAST()      │    │ (tokens)     │   │
│  └───────────┘    └──────────────┘    └──────────────┘   │
│                           │                               │
│  OUTPUT STAGE             │                               │
│              ┌────────────┼────────────┐                  │
│              ▼            ▼            ▼                   │
│  ┌──────────────┐ ┌────────────┐ ┌──────────────┐        │
│  │ renderToHTML  │ │ renderTo-  │ │ renderTo-    │        │
│  │ (read-only)   │ │ React()    │ │ Markdown()   │        │
│  └──────────────┘ │ (editable) │ │ (export)     │        │
│                    └────────────┘ └──────────────┘        │
│                                                           │
│  IMPORT/EXPORT STAGE                                      │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Markdown  │───▶│ parseMarkdown│───▶│ Block[]      │   │
│  │ (paste/   │    │ ToBlocks()   │    │ (normalized) │   │
│  │  import)  │    └──────────────┘    └──────────────┘   │
│  └───────────┘                                            │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Block     │───▶│ serializeTo  │───▶│ Markdown     │   │
│  │ tree      │    │ Markdown()   │    │ (export)     │   │
│  └───────────┘    └──────────────┘    └──────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

**El AST es la representación intermedia común.** Todos los renderers consumen el mismo AST. Esto permite:

1. **Renderizar a HTML** para read-only (actual)
2. **Renderizar a React** con decoraciones para el editor (futuro — estilo Obsidian, mostrando `**text**` con negrita sin eliminar los asteriscos)
3. **Serializar a Markdown** para export (nuevo)
4. **Cachear el AST** en vez del HTML final, y generar el output apropiado según el contexto

### 5.4 — Integración con el editor recursivo

Cuando el hook de editor sea recursivo (opera sobre un subárbol), el markengine debe recibir **contexto del subárbol**:

```typescript
interface MarkengineContext {
  depth: number;           // Nivel de anidamiento
  parentType: BlockType;   // Tipo del bloque padre
  siblingTypes: BlockType[]; // Tipos de los hermanos
}

function detectBlockType(text: string, context?: MarkengineContext): BlockDetection | null {
  // Ejemplo: no permitir heading dentro de un toggle child
  if (context?.parentType === 'toggle' && isHeadingShortcut(text)) return null;
  // Ejemplo: ajustar el nivel de heading según la profundidad
  // ...
}
```

Esto también habilita que el **slash menu funcione en cualquier nivel** del árbol. El menú solo necesita saber el `parentId` del bloque actual para insertar el nuevo bloque como hermano en el `childrenIds` del padre.

### 5.5 — Paste pipeline mejorado

Con `parseMarkdownToBlocks` y el modelo normalizado:

```
Clipboard (markdown)
  → parseMarkdownToBlocks()
  → Block[] con childrenIds correctos
  → batchInsertBlocks(parentId, afterBlockId, blocks)
  → Store actualizado atómicamente
```

Y el export simétrico:

```
Select blocks (by IDs)
  → traverse childrenIds recursivamente
  → serializeToMarkdown(blocks)
  → Clipboard / archivo .md
```

Esto da **copy/paste de subárboles completos** preservando la jerarquía, algo que en Notion funciona pero requiere su formato propietario. Nosotros lo hacemos con markdown estándar.

### 5.6 — Plan de acción para el markengine

| Fase | Tarea | Prioridad | Esfuerzo |
|------|-------|-----------|----------|
| M1 | Early-return en `detectBlockType` basado en primer carácter | P0 | Bajo |
| M2 | Cache de inline HTML por blockId (invalidar cuando text cambia) | P0 | Bajo |
| M3 | `serializeToMarkdown()` — export de bloques a markdown | P1 | Medio |
| M4 | Contexto de subárbol para `detectBlockType` y slash menu | P1 | Medio |
| M5 | Pipeline de paste mejorado con `parseMarkdownToBlocks` + batch insert | P1 | Medio |
| M6 | `parseInlineToAST()` como paso intermedio (AST → renderers múltiples) | P2 | Alto |
| M7 | Renderer React con decoraciones (live markdown preview en editor) | P2 | Alto |

---

## 6. Evaluación de estrategias alternativas

### Estrategia A: Normalización total (RECOMENDADA)

**Modelo:**
```typescript
// Store normalizado
blocks: Record<string, Block>  // Mapa plano, lookup O(1)
rootBlockIds: string[]          // Orden de bloques top-level de la página

// Cada bloque tiene
childrenIds: string[]  // Referencias por ID, no objetos embebidos
// parentId se deriva del índice invertido, no se almacena
```

**Ventajas:**
- Lookup O(1) por ID
- Mutaciones atómicas: mover un bloque = modificar 2 arrays de IDs
- Compatible con CRDT/OT para real-time (operaciones sobre campos específicos)
- Renders parciales: solo el bloque que cambió se re-renderiza (React.memo + blockId selector)
- Serialización directa a MongoDB (cada bloque es un documento)
- Elimina `cloneBlocks()` completamente

**Desventajas:**
- Migración es el mayor coste: reescribir `pageStore.helpers.ts`, adaptar renderers, migrar seed data
- Más indirección en rendering (leer del store por ID en vez de recibir prop)

**Esfuerzo estimado:** 3-4 sprints

### Estrategia B: Árbol embebido mejorado (status quo con parches)

Mantener `children: Block[]` pero generalizar el patrón del toggle a todos los bloques.

**Ventajas:** Menos refactoring inmediato

**Desventajas:**
- `cloneBlocks()` sigue siendo O(n)
- No hay lookup O(1) sin construir Map en cada operación
- El real-time requiere enviar árboles enteros
- Cada feature futuro (indent genérico, sub-tareas) será significativamente más costoso

**Veredicto:** Deuda técnica compuesta. Cada semana que pasa hace la migración futura más cara.

### Estrategia C: Hybrid (puente de migración)

Normalizado en store, materializado para render:

```typescript
// Store: normalizado
blocks: Record<string, Block>

// Selector derivado: materializado para renderers legacy
const blockTree = useMemo(() => materializeTree(blocks, rootIds), [blocks, rootIds]);
```

**Ventajas:** Permite migración incremental. Los renderers existentes pueden consumir el árbol materializado mientras se refactorizan uno a uno.

**Desventajas:** Dos representaciones a mantener durante la transición. El materializado es O(n) en cada cambio (mitigable con memoización selectiva).

**Veredicto:** Útil como fase intermedia de la Estrategia A, no como destino final.

### Decisión

**Implementar Estrategia A**, usando Estrategia C como mecanismo de transición durante las fases intermedias para no bloquear el desarrollo de features en paralelo.

---

## 7. Plan de implementación: Estrategia A — Normalización total

### Fase 0: Preparación (1 sprint)

**Objetivo:** Establecer los tipos y la base del nuevo store sin romper nada existente.

#### 0.1 — Definir discriminated unions para Block

Crear `entities/block/model/types.next.ts` (convive con el actual hasta la migración):

```typescript
// ─── Base compartida ──────────────────────────────────────
interface BlockBase {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── Tipos con properties exactas ─────────────────────────
interface ParagraphBlock extends BlockBase {
  type: 'paragraph';
  properties: { text: string };
}

interface Heading1Block extends BlockBase {
  type: 'heading_1';
  properties: { text: string };
}

// ... heading_2 a heading_6 siguen el mismo patrón

interface BulletedListBlock extends BlockBase {
  type: 'bulleted_list';
  properties: { text: string };
}

interface NumberedListBlock extends BlockBase {
  type: 'numbered_list';
  properties: { text: string };
}

interface TodoBlock extends BlockBase {
  type: 'to_do';
  properties: { text: string; checked: boolean };
}

interface ToggleBlock extends BlockBase {
  type: 'toggle';
  properties: { text: string; collapsed: boolean };
}

interface CodeBlock extends BlockBase {
  type: 'code';
  properties: { text: string; language: string };
}

interface QuoteBlock extends BlockBase {
  type: 'quote';
  properties: { text: string };
}

interface CalloutBlock extends BlockBase {
  type: 'callout';
  properties: { text: string; icon: string };
}

interface DividerBlock extends BlockBase {
  type: 'divider';
  properties: Record<string, never>;  // Sin properties
}

interface TableBlock extends BlockBase {
  type: 'table_block';
  properties: { data: string[][] };
}

interface DatabaseInlineBlock extends BlockBase {
  type: 'database_inline';
  properties: { databaseId: string; viewId: string };
}

interface DatabaseFullPageBlock extends BlockBase {
  type: 'database_full_page';
  properties: { databaseId: string; viewId: string };
}

// ─── Union discriminada ───────────────────────────────────
type Block =
  | ParagraphBlock
  | Heading1Block
  | Heading2Block
  | Heading3Block
  | Heading4Block
  | Heading5Block
  | Heading6Block
  | BulletedListBlock
  | NumberedListBlock
  | TodoBlock
  | ToggleBlock
  | CodeBlock
  | QuoteBlock
  | CalloutBlock
  | DividerBlock
  | TableBlock
  | DatabaseInlineBlock
  | DatabaseFullPageBlock;

// ─── Helpers de tipo ──────────────────────────────────────
type BlockType = Block['type'];

/** Extrae el texto de cualquier bloque que tenga text */
function getBlockText(block: Block): string {
  if ('text' in block.properties) return block.properties.text;
  return '';
}
```

#### 0.2 — Definir la interfaz del store normalizado

Crear `store/useBlockStore.ts` (nuevo store separado de `usePageStore`):

```typescript
interface BlockStoreState {
  /** Mapa de todos los bloques cargados, indexado por ID */
  blocks: Record<string, Block>;

  /** IDs de bloques raíz por página */
  pageRootIds: Record<string, string[]>;  // pageId → blockId[]

  /** Índice invertido derivado: blockId → parentId */
  parentIndex: Map<string, string>;

  // ─── Operaciones atómicas ────────────────────────────
  setBlocks: (pageId: string, blocks: Record<string, Block>, rootIds: string[]) => void;
  updateBlockProperties: (blockId: string, updates: Partial<Block['properties']>) => void;
  changeBlockType: (blockId: string, newType: BlockType) => void;
  insertBlock: (parentId: string, afterBlockId: string | null, block: Block) => void;
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, newParentId: string, afterBlockId: string | null) => void;
  indentBlock: (blockId: string) => void;
  outdentBlock: (blockId: string) => void;
}
```

#### 0.3 — Escribir función de migración de datos

```typescript
/** Convierte el modelo legacy (Block[] embebido) al modelo normalizado */
function normalizeBlockTree(
  legacyBlocks: LegacyBlock[],
  parentId: string | null = null,
): { blocks: Record<string, Block>; rootIds: string[] } {
  const blocks: Record<string, Block> = {};
  const rootIds: string[] = [];

  for (const legacy of legacyBlocks) {
    const childrenIds: string[] = [];

    // Recursión: normalizar children
    if (legacy.children?.length) {
      const nested = normalizeBlockTree(legacy.children, legacy.id);
      Object.assign(blocks, nested.blocks);
      childrenIds.push(...nested.rootIds);
    }

    // Convertir a nuevo formato
    blocks[legacy.id] = {
      id: legacy.id,
      type: legacy.type,
      parentId,
      childrenIds,
      properties: extractProperties(legacy),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Block;

    rootIds.push(legacy.id);
  }

  return { blocks, rootIds };
}
```

### Fase 1: Store normalizado (1 sprint)

**Objetivo:** Implementar `useBlockStore` con todas las operaciones atómicas.

#### 1.1 — Implementar operaciones atómicas

Todas las operaciones trabajan sobre `Record<string, Block>`:

```typescript
// Insert: añadir bloque al mapa + actualizar childrenIds del padre
insertBlock: (parentId, afterBlockId, block) => {
  set((s) => {
    const parent = s.blocks[parentId];
    const idx = afterBlockId
      ? parent.childrenIds.indexOf(afterBlockId) + 1
      : parent.childrenIds.length;
    const newChildrenIds = [...parent.childrenIds];
    newChildrenIds.splice(idx, 0, block.id);

    return {
      blocks: {
        ...s.blocks,
        [block.id]: block,
        [parentId]: { ...parent, childrenIds: newChildrenIds },
      },
    };
  });
}

// Move: quitar del padre actual + añadir al nuevo padre
moveBlock: (blockId, newParentId, afterBlockId) => {
  set((s) => {
    const oldParentId = s.parentIndex.get(blockId);
    if (!oldParentId) return s;

    const oldParent = s.blocks[oldParentId];
    const newParent = s.blocks[newParentId];

    const oldChildren = oldParent.childrenIds.filter((id) => id !== blockId);
    const newChildren = [...newParent.childrenIds];
    const idx = afterBlockId
      ? newChildren.indexOf(afterBlockId) + 1
      : newChildren.length;
    newChildren.splice(idx, 0, blockId);

    return {
      blocks: {
        ...s.blocks,
        [oldParentId]: { ...oldParent, childrenIds: oldChildren },
        [newParentId]: { ...newParent, childrenIds: newChildren },
        [blockId]: { ...s.blocks[blockId], parentId: newParentId },
      },
    };
  });
}

// Indent: mover al childrenIds del hermano anterior
indentBlock: (blockId) => {
  const parentId = get().parentIndex.get(blockId);
  if (!parentId) return;

  const parent = get().blocks[parentId];
  const idx = parent.childrenIds.indexOf(blockId);
  if (idx <= 0) return; // No hay hermano anterior

  const prevSiblingId = parent.childrenIds[idx - 1];
  get().moveBlock(blockId, prevSiblingId, null); // Mover al final del hermano anterior
}
```

#### 1.2 — Implementar índice invertido (`parentIndex`)

```typescript
// Middleware de Zustand que recalcula el parentIndex después de cada set
const recomputeParentIndex = (blocks: Record<string, Block>): Map<string, string> => {
  const index = new Map<string, string>();
  for (const [id, block] of Object.entries(blocks)) {
    for (const childId of block.childrenIds) {
      index.set(childId, id);
    }
  }
  return index;
};
```

#### 1.3 — Adaptar `usePageStore` para coexistir

Durante la transición, `usePageStore` sigue gestionando la lista de páginas, recents, y la comunicación con la API. `useBlockStore` gestiona los bloques. La función `fetchPageContent` normaliza los bloques recibidos del backend y los inyecta en `useBlockStore`.

### Fase 2: Renderers recursivos (1-2 sprints)

**Objetivo:** Reemplazar los switches monolíticos por un registry de renderers recursivo.

#### 2.1 — Block renderer registry

```typescript
// entities/block/ui/blockRenderers.ts
type BlockRendererProps = {
  blockId: string;
  pageId: string;
  mode: 'edit' | 'readonly';
};

const BLOCK_RENDERERS: Record<BlockType, React.FC<BlockRendererProps>> = {
  paragraph: ParagraphRenderer,
  heading_1: HeadingRenderer,
  heading_2: HeadingRenderer,
  // ... headings comparten renderer con prop de nivel
  to_do: TodoRenderer,
  toggle: ToggleRenderer,
  code: CodeRenderer,
  callout: CalloutRenderer,
  quote: QuoteRenderer,
  bulleted_list: BulletedListRenderer,
  numbered_list: NumberedListRenderer,
  divider: DividerRenderer,
  table_block: TableRenderer,
  database_inline: DatabaseRenderer,
  database_full_page: DatabaseRenderer,
};

/** Componente recursivo genérico */
const BlockRenderer: React.FC<BlockRendererProps> = React.memo(({ blockId, pageId, mode }) => {
  const block = useBlockStore((s) => s.blocks[blockId]);
  if (!block) return null;

  const Renderer = BLOCK_RENDERERS[block.type] ?? ParagraphRenderer;

  return (
    <div data-block-id={blockId}>
      <Renderer blockId={blockId} pageId={pageId} mode={mode} />
      {block.childrenIds.length > 0 && (
        <BlockChildren blockId={blockId} pageId={pageId} mode={mode} />
      )}
    </div>
  );
});

/** Renderiza los hijos con indentación según el tipo del padre */
const BlockChildren: React.FC<BlockRendererProps> = React.memo(({ blockId, pageId, mode }) => {
  const childrenIds = useBlockStore((s) => s.blocks[blockId]?.childrenIds ?? []);
  const parentType = useBlockStore((s) => s.blocks[blockId]?.type);

  return (
    <div className={getIndentClassName(parentType)}>
      {childrenIds.map((childId) => (
        <BlockRenderer key={childId} blockId={childId} pageId={pageId} mode={mode} />
      ))}
    </div>
  );
});
```

#### 2.2 — Eliminar duplicación ReadOnly/Editable

Con el registry, el `mode` prop determina si se renderiza editable o read-only. Un solo registry, un solo punto de mantenimiento. Añadir un nuevo tipo de bloque = un nuevo renderer en el mapa.

### Fase 3: Hook de editor recursivo (1 sprint)

**Objetivo:** Reemplazar `usePlaygroundBlockEditor` por un hook que opera sobre cualquier subárbol.

#### 3.1 — Nuevo `useBlockEditor`

```typescript
function useBlockEditor(blockId: string, pageId: string) {
  const block = useBlockStore((s) => s.blocks[blockId]);
  const parentId = useBlockStore((s) => s.parentIndex.get(blockId));
  const siblingIds = useBlockStore((s) => {
    const pid = s.parentIndex.get(blockId);
    return pid ? s.blocks[pid]?.childrenIds ?? [] : s.pageRootIds[pageId] ?? [];
  });

  const handleChange = useCallback((text: string) => {
    useBlockStore.getState().updateBlockProperties(blockId, { text });
  }, [blockId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Enter: insertar nuevo bloque como hermano (en el childrenIds del padre)
    // Backspace en vacío: eliminar bloque y focus al anterior
    // Tab: indent (moveBlock al hermano anterior)
    // Shift+Tab: outdent (moveBlock al abuelo)
    // Arrow Up/Down: navegar entre hermanos
    // Todos operan sobre el subárbol local, no sobre "la página entera"
  }, [blockId, parentId, siblingIds]);

  // Slash menu y markdown shortcuts funcionan en CUALQUIER nivel
  const handleSlashSelect = useCallback((type: BlockType, calloutIcon?: string) => {
    // changeBlockType o insertBlock, funciona igual en root o en children
  }, [blockId]);

  return { handleChange, handleKeyDown, handleSlashSelect };
}
```

#### 3.2 — Focus registry centralizado

Reemplazar todos los `document.querySelector` y `setTimeout` por un registry de refs:

```typescript
const blockRefRegistry = new Map<string, HTMLElement>();

function registerBlockRef(blockId: string, el: HTMLElement | null) {
  if (el) blockRefRegistry.set(blockId, el);
  else blockRefRegistry.delete(blockId);
}

function focusBlock(blockId: string, position: 'start' | 'end' = 'start') {
  const el = blockRefRegistry.get(blockId);
  if (!el) return;
  const editable = el.querySelector('[contenteditable]') as HTMLElement | null;
  if (!editable) return;
  editable.focus();
  // Set cursor position...
}
```

### Fase 4: Integración del markengine (1 sprint)

**Objetivo:** Optimizar y unificar el pipeline del markengine con el nuevo modelo.

#### 4.1 — Early-return en `detectBlockType`

Implementar el filtro por primer carácter (Tarea M1 de la sección 5.6).

#### 4.2 — Cache de inline HTML

Implementar cache por blockId con invalidación por cambio de texto (Tarea M2).

#### 4.3 — Contexto de subárbol

Pasar `MarkengineContext` al detector para que respete restricciones de anidamiento (Tarea M4).

#### 4.4 — `serializeToMarkdown()`

Implementar la función de export que traversa `childrenIds` recursivamente y genera markdown con indentación correcta (Tarea M3).

#### 4.5 — Paste pipeline con `parseMarkdownToBlocks`

Conectar el paste handler al normalizador + batch insert (Tarea M5).

### Fase 5: "Turn Into" robusto + cleanup (1 sprint)

**Objetivo:** Cerrar la migración con "Turn Into" que preserve hijos y limpiar código legacy.

#### 5.1 — `transformBlock()` tipado

La función mapea properties explícitamente entre tipos, sin residuos:

```typescript
function transformBlock(block: Block, newType: BlockType): Block {
  const base: BlockBase = {
    id: block.id,
    parentId: block.parentId,
    childrenIds: block.childrenIds, // Se preservan siempre
    createdAt: block.createdAt,
    updatedAt: Date.now(),
  };
  const text = getBlockText(block);

  switch (newType) {
    case 'paragraph':
      return { ...base, type: 'paragraph', properties: { text } };
    case 'to_do':
      return { ...base, type: 'to_do', properties: { text, checked: false } };
    case 'code':
      return { ...base, type: 'code', properties: { text, language: 'plaintext' } };
    case 'toggle':
      return { ...base, type: 'toggle', properties: { text, collapsed: false } };
    case 'callout':
      return { ...base, type: 'callout', properties: { text, icon: '💡' } };
    case 'divider':
      return { ...base, type: 'divider', properties: {} as Record<string, never> };
    // ... resto de tipos
  }
}
```

`childrenIds` se preserva automáticamente. Los hijos de un toggle que se convierte en heading siguen existiendo — el heading simplemente los renderiza indentados.

#### 5.2 — Eliminar código legacy

- Borrar `pageStore.helpers.ts` (funciones de clone, tree traversal, mutation)
- Borrar la interfaz `Block` legacy con index signature
- Borrar los switches monolíticos en `BlockEditor.tsx` y `ReadOnlyBlock.tsx`
- Consolidar focus management en el registry centralizado
- Eliminar `ToggleBlockEditor` como caso especial (el toggle usa el renderer genérico + `BlockChildren`)

### Diagrama de fases y dependencias

```
Fase 0 ──▶ Fase 1 ──▶ Fase 2 ──▶ Fase 3 ──▶ Fase 5
(Tipos)    (Store)     (Render)   (Editor)   (Cleanup)
                          │          │
                          ▼          ▼
                       Fase 4 (Markengine)
                       (puede ejecutarse en paralelo con Fase 2-3)
```

### Resumen de esfuerzo por fase

| Fase | Descripción | Sprint | Dependencias | Riesgo |
|------|-------------|--------|--------------|--------|
| **0** | Tipos + migrador de datos | 1 | Ninguna | Bajo |
| **1** | `useBlockStore` normalizado | 1 | Fase 0 | Medio |
| **2** | Renderers recursivos + registry | 1-2 | Fase 1 | Medio |
| **3** | Hook de editor recursivo | 1 | Fase 1, Fase 2 | Alto |
| **4** | Markengine optimizado | 1 | Fase 1 (parcial) | Medio |
| **5** | Turn Into + cleanup legacy | 1 | Todas | Bajo |

**Total estimado:** 6-7 sprints (con posibilidad de paralelizar Fase 4 con Fases 2-3).

---

## 8. Checklist de validación

Antes de considerar cada fase completa, verificar:

### Calidad de código
- [ ] `make lint` pasa con `--max-warnings=0`
- [ ] TypeScript strict sin errores
- [ ] SonarQube: sin code smells nuevos, cognitive complexity controlada
- [ ] Sin `any`, sin `[key: string]: unknown`, sin implicit returns
- [ ] Constantes nombradas para todos los valores mágicos

### Funcionalidad
- [ ] Todos los 19 tipos de bloque se renderizan correctamente (edit + readonly)
- [ ] Slash commands funcionan en root y en children de cualquier bloque
- [ ] Markdown shortcuts funcionan en root y en children
- [ ] Indent/outdent funciona para todos los tipos de bloque
- [ ] "Turn Into" preserva hijos y propiedades relevantes
- [ ] Drag-and-drop funciona entre niveles del árbol
- [ ] Numbered list counter se reinicia correctamente en cada contexto
- [ ] Focus management funciona sin `setTimeout` hardcodeados

### Rendimiento
- [ ] Lookup de bloque por ID es O(1)
- [ ] Mutaciones de indent/outdent/move son O(1) sobre arrays de IDs
- [ ] Re-render de un bloque individual no re-renderiza sus hermanos (React.memo)
- [ ] `parseInlineMarkdown` se cachea y solo se recalcula cuando el texto cambia

### Compatibilidad
- [ ] Seed data legacy se migra correctamente al modelo normalizado
- [ ] La API del backend acepta el nuevo formato de bloques (o hay adapter)
- [ ] Offline mode funciona con el store normalizado
- [ ] El real-time WebSocket puede enviar operaciones granulares (no árboles completos)

---

*Documento generado como guía estratégica para el equipo Prismatica. Todas las decisiones deben ser revisadas y validadas por el equipo antes de la implementación.*

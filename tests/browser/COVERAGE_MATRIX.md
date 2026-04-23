# Browser Coverage Matrix

Objetivo: mantener cobertura explícita `30/30` sobre la lista funcional del editor, aunque algunos escenarios fallen legítimamente mientras la implementación no cumpla el comportamiento esperado.

| Punto | Área | Cobertura principal |
| --- | --- | --- |
| 1 | Menú slash | `specs/blockCreation.mjs` |
| 2 | Atajos markdown | `specs/blockCreation.mjs` |
| 3 | Indentación / desindentación | `specs/indentation.mjs` |
| 4 | Reglas de indentación por tipo | `specs/indentation.mjs`, `specs/categoryRegistry.mjs` |
| 5 | Enter en bloques estándar | `specs/editingBehavior.mjs` |
| 6 | Continuación automática de listas | `specs/editingBehavior.mjs` |
| 7 | Enter en bloques contenedor | `specs/editingBehavior.mjs` |
| 8 | Backspace / Delete en vacíos | `specs/editingBehavior.mjs` |
| 9 | Promoción de hijos al borrar padre | `specs/containersAndPaste.mjs` |
| 10 | Menú contextual de bloque | `specs/contextMenu.mjs` |
| 11 | Drag and drop | `specs/dragAndDrop.mjs` |
| 12 | Toggle | `specs/containersAndPaste.mjs`, `specs/contextMenu.mjs`, `specs/focusManagement.mjs` |
| 13 | Callout contenedor | `specs/containersAndPaste.mjs`, `specs/editingBehavior.mjs` |
| 14 | Quote contenedor | `specs/containersAndPaste.mjs`, `specs/editingBehavior.mjs` |
| 15 | Renderizado en solo lectura | `specs/harnessCoverage.mjs` |
| 16 | Pegado de contenido | `specs/containersAndPaste.mjs` |
| 17 | Toolbar flotante | `specs/inlineToolbar.mjs` |
| 18 | Color de texto | `specs/inlineToolbar.mjs` |
| 19 | Highlight / color de fondo | `specs/inlineToolbar.mjs` |
| 20 | Formatos inline | `specs/inlineToolbar.mjs` |
| 21 | Enlaces inline | `specs/inlineToolbar.mjs` |
| 22 | Slash desde selección | `specs/inlineToolbar.mjs` |
| 23 | Icono de página | `specs/assets.mjs` |
| 24 | Icono de callout | `specs/assets.mjs` |
| 25 | Cover de página | `specs/assets.mjs` |
| 26 | Bloques de media | `specs/assets.mjs`, `specs/harnessCoverage.mjs` |
| 27 | Registro de categorías | `specs/categoryRegistry.mjs` |
| 28 | Gestión de foco | `specs/focusManagement.mjs` |
| 29 | Persistencia local | `specs/persistenceAndQuality.mjs` |
| 30 | Calidad técnica de integración | `specs/persistenceAndQuality.mjs` |

# Task Specification: [Feature / Bugfix / Refactor Name]

## 1. Context & Objective
[Breve explicación técnica de qué se necesita hacer, por qué, y criterios de aceptación]

## 2. Files to Modify / Create (Exclusively)
1. `src/path/to/FileA.ts`
2. `tests/canvas/FileA.test.ts`

> **Nota**: Queda estrictamente prohibido modificar archivos fuera de esta lista.

## 3. Implementation Details & Contracts
- **Interfaces / Types**:
  ```typescript
  // Exact signatures or schemas
  ```
- **Behavior**:
  - [Detalle 1]
  - [Detalle 2]

## 4. TDD & Done-When Criteria
1. Test en ROJO escrito y verificado primero.
2. `bash scripts/docker-run.sh quality` sale con código 0.
3. Pruebas afectadas pasan 100%:
   ```bash
   bash scripts/docker-run.sh test-canvas tests/canvas/FileA.test.ts
   ```
4. Build de producción sin errores:
   ```bash
   bash scripts/docker-run.sh build
   ```

# Plan de refactoring architecture Node.js / MongoDB

Date: 2026-04-28

## Hypothèses raisonnables

- L’application actuelle est surtout un client React/Vite offline-first.
- Le backend Node.js/Fastify mentionné dans certaines docs n’existe pas encore dans le workspace courant: il n’y a pas de dossier `packages/`.
- MongoDB est initialisé via Docker et un script `mongosh`, mais l’application frontend parle à une API externe configurable via `VITE_API_URL`.
- Le refactoring doit donc être progressif: d’abord centraliser les contrats de données, ensuite extraire les services client, puis seulement créer/brancher une API Node si nécessaire.

## Analyse de l’existant

### Points positifs

- Les types métier principaux existent déjà côté frontend:
  - `PageEntry`, `PageStore` dans `src/entities/page/model/types.ts`
  - `Block`, `BlockType` dans `src/entities/block/model/types.ts`
  - `StaticPersona`, `Workspace`, `UserSession` dans `src/entities/user/model/types.ts`
- Les appels HTTP passent majoritairement par `src/shared/api/client.ts`.
- La persistance offline est déjà isolée en partie dans des stores Zustand.
- MongoDB possède déjà un script d’initialisation avec collections, validateurs et index.

### Points critiques

1. **Modèles dispersés**
   - Les structures MongoDB sont définies dans `docker/services/mongodb/tools/init-collections.js`.
   - Les types applicatifs sont dans `src/entities/**/model/types.ts`.
   - Les payloads API sont implicites dans les stores et services.
   - Risque: divergence entre frontend, API et MongoDB.

2. **Logique métier dans les stores**
   - `src/store/pageStore.actions.ts` mélange:
     - règles d’accès,
     - appels API,
     - mutation Zustand,
     - logique page/tree,
     - fallback offline.
   - `src/features/auth/model/useUserStore.ts` mélange:
     - session,
     - login/signup,
     - workspace CRUD,
     - localStorage,
     - fallback offline.

3. **Accès réseau dispersé**
   - `api` est centralisé, mais les endpoints sont codés directement dans plusieurs fichiers:
     - `/api/pages`
     - `/api/pages/all`
     - `/api/pages/:id/config`
     - `/api/workspaces/:id/config`
     - `/api/auth/login`
   - Risque: contrats API non documentés et difficiles à changer.

4. **MongoDB trop éclaté pour certains cas**
   - `pageConfigurations`, `pageConnections`, `pageActionEvents`, `pageImportExports`, `pageVersions` sont tous séparés.
   - Ce n’est pas forcément mauvais, mais pour les lectures fréquentes du settings/page tree, certaines données peuvent être embedded dans `pages` ou `workspaceConfigurations`.

5. **Documentation en avance sur le code**
   - `docker/services/node/README.md` décrit un monorepo `packages/types`, `packages/core`, `packages/api` qui n’existe pas dans le workspace actuel.
   - Risque: onboarding confus.

6. **Validation partielle**
   - MongoDB a des validateurs JSON Schema, mais ils restent permissifs sur `config: { bsonType: 'object' }`.
   - Il n’y a pas encore de validation runtime côté API/client pour les payloads métier.

## Architecture cible proposée

Objectif: une architecture simple, modulaire, compatible avec l’existant.

```text
src/
  app/
  modules/
    auth/
      auth.types.ts
      auth.schema.ts
      auth.api.ts
      auth.service.ts
    user/
      user.types.ts
      user.schema.ts
      user.api.ts
      user.service.ts
    workspace/
      workspace.types.ts
      workspace.schema.ts
      workspace.api.ts
      workspace.service.ts
      workspace.store.ts
    page/
      page.types.ts
      page.schema.ts
      page.api.ts
      page.service.ts
      page.store.ts
    block/
      block.types.ts
      block.schema.ts
      block.service.ts
    settings/
      settings.types.ts
      settings.schema.ts
      settings.service.ts
  shared/
    api/
      client.ts
      errors.ts
    database/
      mongo.schema.ts
      mongo.indexes.ts
      collections.ts
    validation/
      validators.ts
    utils/
    constants/
```

Si un vrai backend Node est ajouté ensuite:

```text
server/
  src/
    modules/
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.model.ts
        auth.schema.ts
      page/
        page.routes.ts
        page.controller.ts
        page.service.ts
        page.model.ts
        page.schema.ts
      workspace/
        workspace.routes.ts
        workspace.controller.ts
        workspace.service.ts
        workspace.model.ts
        workspace.schema.ts
    shared/
      database/
        mongo.ts
      http/
        errors.ts
      validation/
```

## Responsabilités attendues

### `*.schema.ts`

- Validation runtime des données entrantes.
- Source de vérité applicative.
- À terme: Zod côté frontend/API ou Mongoose côté backend.

### `*.types.ts`

- Types TypeScript dérivés ou alignés avec les schemas.
- Aucune logique métier.

### `*.api.ts`

- Appels HTTP uniquement.
- Pas de mutation Zustand.
- Pas de logique métier complexe.

### `*.service.ts`

- Règles métier:
  - permissions,
  - duplication page,
  - archive/restore,
  - normalisation payload,
  - fallback offline.

### `*.store.ts`

- État UI/application.
- Appelle les services.
- Ne connaît pas les chemins HTTP ni les détails Mongo.

## Centralisation des données

### Noms de champs à harmoniser

| Actuel | Recommandé | Raison |
|---|---|---|
| `_id` côté frontend | `id` dans le domaine, `_id` uniquement Mongo | éviter de propager un détail Mongo partout |
| `ownerId` | `ownerId` | OK, garder |
| `memberIds` | `memberIds` | OK, garder |
| `parentPageId` | `parentPageId` | OK, garder |
| `workspaceId` | `workspaceId` | OK, garder |
| `config` générique | champs typés ou sous-documents validés | éviter les objets opaques |

### Exemple de schema applicatif minimal

```ts
export type PageVisibility = 'private' | 'shared' | 'public';

export interface PageDocument {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  icon?: string;
  cover?: string;
  visibility: PageVisibility;
  collaborators: Array<{ userId: string; role: 'viewer' | 'editor' | 'owner' }>;
  parentPageId?: string | null;
  archivedAt?: string | null;
  content: BlockDocument[];
  settings: PageSettingsDocument;
  createdAt: string;
  updatedAt: string;
}
```

### MongoDB: embedding recommandé

Pour une app type Notion, optimiser les lectures fréquentes:

```text
pages
  _id
  workspaceId
  ownerId
  title
  tree metadata
  content[]
  settings { font, smallText, fullWidth, locked, notifications }
  analyticsSummary { views, actions, copies }
```

Collections séparées à garder:

```text
pageActionEvents      # audit/log volumineux
pageVersions          # historique potentiellement lourd
workspaceChannels     # si requêtes fréquentes par workspace/type
```

À éviter:

```text
pageConfigurations + pageConnections + pageImportExports
```

si ces données sont toujours lues avec la page. Dans ce cas, les embedder dans `pages.settings` est plus simple.

## Avant / après critique

### Avant

Un store déclenche directement l’API et modifie l’état:

```ts
const page = await api.post<PageEntry>('/api/pages', payload, jwt);
set((s) => ({ pages: { ...s.pages, [workspaceId]: [...s.pages[workspaceId], page] } }));
```

### Après

Le store délègue:

```ts
const page = await pageService.createPage({ workspaceId, title, parentPageId });
pageStoreActions.addPageToState(page);
```

Avec séparation:

```ts
// page.api.ts
export function createPageRequest(payload: CreatePageInput, jwt: string) {
  return api.post<PageDto>('/api/pages', payload, jwt);
}

// page.service.ts
export async function createPage(input: CreatePageInput) {
  const validInput = validateCreatePageInput(input);
  const page = await pageApi.createPageRequest(validInput, authService.requireJwt());
  return mapPageDtoToDomain(page);
}
```

## Plan d’action progressif

### Étape 1 — Inventaire et contrats

- Créer `src/modules/*/*.types.ts` en ré-exportant les types existants.
- Créer `src/modules/*/*.schema.ts` avec validations simples.
- Ne pas déplacer les stores tout de suite.
- Vérification: `npm run typecheck`.

### Étape 2 — API client par module

- Extraire les endpoints codés en dur vers:
  - `src/modules/auth/auth.api.ts`
  - `src/modules/page/page.api.ts`
  - `src/modules/workspace/workspace.api.ts`
- Les stores continuent à fonctionner, mais n’appellent plus `api.*` directement.
- Vérification: build + tests e2e smoke.

### Étape 3 — Services métier

- Extraire les règles de `pageStore.actions.ts` vers `page.service.ts`:
  - création,
  - duplication,
  - archive,
  - restore,
  - permissions.
- Extraire auth/workspace de `useUserStore.ts` vers `auth.service.ts` et `workspace.service.ts`.
- Vérification: tests ciblés sur page CRUD offline + online mock.

### Étape 4 — Mongo schemas centralisés

- Extraire les schemas du script Mongo vers `src/shared/database/mongo.schema.ts`.
- Générer ou importer ces schemas dans le script d’init si possible.
- Harmoniser `pageConfigurations` et `workspaceConfigurations`.
- Vérification: démarrage Docker Mongo sur volume neuf.

### Étape 5 — Backend Node réel si nécessaire

- Créer `server/src/modules` ou `packages/api` seulement si l’API actuelle doit vivre dans ce repo.
- Choisir un seul pattern:
  - Fastify + Mongo driver + Zod, simple et léger.
  - ou Fastify + Mongoose, si besoin de modèles riches/middleware.
- Vérification: tests API avec base Mongo de test.

## Bonnes pratiques MongoDB appliquées

- Embedding pour les données lues avec la page: settings, permissions simples, résumé analytics.
- Collections séparées pour les flux volumineux: versions, action events.
- Duplication contrôlée acceptable:
  - `workspaceName` snapshot dans certains logs,
  - `pageTitle` snapshot dans `pageVersions`,
  - `ownerName` snapshot dans vues admin.
- Index orientés lectures fréquentes:
  - `pages: { workspaceId: 1, parentPageId: 1, archivedAt: 1 }`
  - `pages: { workspaceId: 1, updatedAt: -1 }`
  - `pageActionEvents: { pageId: 1, createdAt: -1 }`
  - `workspaceChannels: { workspaceId: 1, parentChannelId: 1 }`

## Règles de qualité à appliquer

- Une fonction = une intention claire.
- Aucun endpoint écrit directement dans les stores.
- Aucun accès Mongo dans les controllers.
- Aucun controller avec de la logique métier.
- Un module peut dépendre de `shared`, pas l’inverse.
- Les migrations/refactors se font par petits commits vérifiables.

## Définition de réussite

- `npm run typecheck` passe.
- `npm run build` passe.
- Les tests e2e smoke passent.
- Les stores n’importent plus directement `api` sauf pendant la période de migration.
- Les schemas Mongo et les types applicatifs ne divergent plus.
- Un nouveau développeur peut trouver en moins de 30 secondes:
  - le modèle page,
  - le service page,
  - les endpoints page,
  - les validateurs page.
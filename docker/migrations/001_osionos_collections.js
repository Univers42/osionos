/**
 * Migration: 001_osionos_collections.js
 * Creates osionos collections and indexes in a BaaS-managed MongoDB.
 *
 * Run via Prismatica schema-service:
 *   POST /schema/v1/apply { engine: "mongodb", migration: "001_osionos_collections" }
 *
 * Or apply manually:
 *   mongosh "mongodb://..." --file docker/migrations/001_osionos_collections.js
 */

const OSIONOS_DB = 'playground_db';

const collectionSchemas = {
  pageConfigurations: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'pageId', 'config'],
      properties: {
        userId: { bsonType: 'string' },
        pageId: { bsonType: 'string' },
        config: { bsonType: 'object' },
        cssTokens: { bsonType: ['object', 'null'] },
        analytics: { bsonType: ['object', 'null'] },
        notifications: { bsonType: ['object', 'null'] },
        connections: { bsonType: ['array', 'null'] },
        updatedAt: { bsonType: ['date', 'string'] },
      },
    },
  },
  pageVersions: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'pageId', 'title', 'content', 'createdAt'],
      properties: {
        userId: { bsonType: 'string' },
        pageId: { bsonType: 'string' },
        title: { bsonType: 'string' },
        label: { bsonType: ['string', 'null'] },
        content: { bsonType: 'array' },
        createdAt: { bsonType: ['date', 'string'] },
      },
    },
  },
  pageActionEvents: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'pageId', 'action', 'createdAt'],
      properties: {
        userId: { bsonType: 'string' },
        pageId: { bsonType: 'string' },
        action: { bsonType: 'string' },
        metadata: { bsonType: ['object', 'null'] },
        createdAt: { bsonType: ['date', 'string'] },
      },
    },
  },
  pageConnections: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'pageId', 'name', 'status'],
      properties: {
        userId: { bsonType: 'string' },
        pageId: { bsonType: 'string' },
        name: { bsonType: 'string' },
        status: { enum: ['connected', 'disabled'] },
        updatedAt: { bsonType: ['date', 'string'] },
      },
    },
  },
  pageImportExports: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'pageId', 'direction', 'createdAt'],
      properties: {
        userId: { bsonType: 'string' },
        pageId: { bsonType: 'string' },
        direction: { enum: ['import', 'export'] },
        fileName: { bsonType: ['string', 'null'] },
        createdAt: { bsonType: ['date', 'string'] },
      },
    },
  },
  workspaceConfigurations: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'workspaceId', 'config'],
      properties: {
        userId: { bsonType: 'string' },
        workspaceId: { bsonType: 'string' },
        config: { bsonType: 'object' },
        appearance: { bsonType: ['object', 'null'] },
        channels: { bsonType: ['array', 'null'] },
        updatedAt: { bsonType: ['date', 'string'] },
      },
    },
  },
  workspaceChannels: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['workspaceId', 'name', 'type', 'visibility'],
      properties: {
        workspaceId: { bsonType: 'string' },
        parentChannelId: { bsonType: ['string', 'null'] },
        name: { bsonType: 'string' },
        type: { enum: ['text', 'thread', 'forum', 'audio', 'video', 'stage', 'archive', 'agent'] },
        visibility: { enum: ['workspace', 'members'] },
        memberIds: { bsonType: ['array', 'null'] },
        createdAt: { bsonType: ['date', 'string'] },
        updatedAt: { bsonType: ['date', 'string'] },
      },
    },
  },
  workspaceThemeTokens: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['workspaceId', 'themeName', 'tokens'],
      properties: {
        workspaceId: { bsonType: 'string' },
        themeName: { bsonType: 'string' },
        tokens: { bsonType: 'object' },
        updatedAt: { bsonType: ['date', 'string'] },
      },
    },
  },
};

const collections = [
  'tasks',
  'contacts',
  'content',
  'inventory',
  'projects',
  'products',
  'users',
  'workspaces',
  'pageConfigurations',
  'pageVersions',
  'pageActionEvents',
  'pageConnections',
  'pageImportExports',
  'workspaceConfigurations',
  'workspaceChannels',
  'workspaceThemeTokens',
];

const indexes = [
  ['tasks', { status: 1 }],
  ['tasks', { priority: 1 }],
  ['tasks', { assignee: 1 }],
  ['contacts', { company: 1 }],
  ['contacts', { stage: 1 }],
  ['contacts', { email: 1 }, { unique: true, sparse: true }],
  ['content', { status: 1 }],
  ['content', { publish_date: 1 }],
  ['inventory', { category: 1 }],
  ['inventory', { serial_number: 1 }, { unique: true, sparse: true }],
  ['projects', { status: 1 }],
  ['projects', { priority: 1 }],
  ['products', { category: 1 }],
  ['products', { price: 1 }],
  ['products', { sku: 1 }, { unique: true, sparse: true }],
  ['users', { email: 1 }, { unique: true }],
  ['workspaces', { ownerId: 1 }],
  ['workspaces', { memberIds: 1 }],
  ['pageConfigurations', { userId: 1, pageId: 1 }, { unique: true }],
  ['pageVersions', { userId: 1, pageId: 1, createdAt: -1 }],
  ['pageActionEvents', { userId: 1, pageId: 1, createdAt: -1 }],
  ['pageActionEvents', { action: 1 }],
  ['pageConnections', { userId: 1, pageId: 1, name: 1 }, { unique: true }],
  ['pageImportExports', { userId: 1, pageId: 1, createdAt: -1 }],
  ['workspaceConfigurations', { userId: 1, workspaceId: 1 }, { unique: true }],
  ['workspaceChannels', { workspaceId: 1, name: 1 }],
  ['workspaceChannels', { workspaceId: 1, type: 1 }],
  ['workspaceChannels', { workspaceId: 1, parentChannelId: 1 }],
  ['workspaceChannels', { workspaceId: 1, memberIds: 1 }],
  ['workspaceThemeTokens', { workspaceId: 1, themeName: 1 }, { unique: true }],
];

async function ensureCollections(database) {
  const existingCollections = await database.listCollections({}, { nameOnly: true }).toArray();
  const existingNames = new Set(existingCollections.map(collection => collection.name));

  for (const name of collections) {
    const schema = collectionSchemas[name];
    if (!existingNames.has(name)) {
      await database.createCollection(name, schema ? { validator: schema } : undefined);
    } else if (schema) {
      await database.command({ collMod: name, validator: schema });
    }
  }
}

async function ensureIndexes(database) {
  for (const [collectionName, keys, options] of indexes) {
    await database.collection(collectionName).createIndex(keys, options ?? {});
  }
}

module.exports = {
  up: async db => {
    const database = db.getSiblingDB(OSIONOS_DB);

    await ensureCollections(database);
    await ensureIndexes(database);

    return {
      status: 'ok',
      collections: collections.length,
      indexes: indexes.length,
    };
  },

  down: async db => {
    const database = db.getSiblingDB(OSIONOS_DB);

    for (const name of collections) {
      await database.collection(name).drop().catch(() => undefined);
    }

    return {
      status: 'ok',
      dropped: collections.length,
    };
  },

  version: '001',
  description: 'Initial osionos collection setup',
  author: 'dlesieur',
  created: '2026-05-05',
};
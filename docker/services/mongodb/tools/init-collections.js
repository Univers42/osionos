/* global db, print, process */
// init-collections.js — Creates collections and indexes on first MongoDB startup.
// Runs automatically when placed in /docker-entrypoint-initdb.d/.

const dbName = process.env.MONGO_INITDB_DATABASE || 'osionos_db';
const database = db.getSiblingDB(dbName);

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

collections.forEach(name => {
  if (!database.getCollectionNames().includes(name)) {
    const schema = collectionSchemas[name];
    database.createCollection(name, schema ? { validator: schema } : undefined);
    print(`  ✔ Created collection: ${name}`);
  } else if (collectionSchemas[name]) {
    database.runCommand({ collMod: name, validator: collectionSchemas[name] });
    print(`  ✔ Validated collection schema: ${name}`);
  }
});

// ── Indexes ──
database.tasks.createIndex({ status: 1 });
database.tasks.createIndex({ priority: 1 });
database.tasks.createIndex({ assignee: 1 });

database.contacts.createIndex({ company: 1 });
database.contacts.createIndex({ stage: 1 });
database.contacts.createIndex({ email: 1 }, { unique: true, sparse: true });

database.content.createIndex({ status: 1 });
database.content.createIndex({ publish_date: 1 });

database.inventory.createIndex({ category: 1 });
database.inventory.createIndex(
  { serial_number: 1 },
  { unique: true, sparse: true },
);

database.projects.createIndex({ status: 1 });
database.projects.createIndex({ priority: 1 });

database.products.createIndex({ category: 1 });
database.products.createIndex({ price: 1 });
database.products.createIndex({ sku: 1 }, { unique: true, sparse: true });

database.users.createIndex({ email: 1 }, { unique: true });
database.workspaces.createIndex({ ownerId: 1 });
database.workspaces.createIndex({ memberIds: 1 });
database.pageConfigurations.createIndex({ userId: 1, pageId: 1 }, { unique: true });
database.pageVersions.createIndex({ userId: 1, pageId: 1, createdAt: -1 });
database.pageActionEvents.createIndex({ userId: 1, pageId: 1, createdAt: -1 });
database.pageActionEvents.createIndex({ action: 1 });
database.pageConnections.createIndex({ userId: 1, pageId: 1, name: 1 }, { unique: true });
database.pageImportExports.createIndex({ userId: 1, pageId: 1, createdAt: -1 });
database.workspaceConfigurations.createIndex({ userId: 1, workspaceId: 1 }, { unique: true });
database.workspaceChannels.createIndex({ workspaceId: 1, name: 1 });
database.workspaceChannels.createIndex({ workspaceId: 1, type: 1 });
database.workspaceChannels.createIndex({ workspaceId: 1, parentChannelId: 1 });
database.workspaceChannels.createIndex({ workspaceId: 1, memberIds: 1 });
database.workspaceThemeTokens.createIndex({ workspaceId: 1, themeName: 1 }, { unique: true });

try {
  const seedPath = '/docker-entrypoint-initdb.d/seedUsers.json';
  const seed = JSON.parse(cat(seedPath));

  if (Array.isArray(seed.users) && database.users.countDocuments() === 0) {
    database.users.insertMany(seed.users.map(user => ({ ...user, createdAt: new Date() })));
    print(`  ✔ Seeded users: ${seed.users.length}`);
  }

  if (Array.isArray(seed.workspaces) && database.workspaces.countDocuments() === 0) {
    database.workspaces.insertMany(seed.workspaces.map(workspace => ({ ...workspace, createdAt: new Date() })));
    print(`  ✔ Seeded workspaces: ${seed.workspaces.length}`);
  }

  if (Array.isArray(seed.pageConfigurations) && seed.pageConfigurations.length > 0 && database.pageConfigurations.countDocuments() === 0) {
    database.pageConfigurations.insertMany(seed.pageConfigurations);
    print(`  ✔ Seeded page configurations: ${seed.pageConfigurations.length}`);
  }
} catch (error) {
  print(`  ⚠ Seed users skipped: ${error.message}`);
}

print(`[init] MongoDB "${dbName}" initialized — ${collections.length} collections ready.`);

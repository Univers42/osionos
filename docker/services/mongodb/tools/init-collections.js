/* global db, print, process */
// init-collections.js — Creates collections and indexes on first MongoDB startup.
// Runs automatically when placed in /docker-entrypoint-initdb.d/.

const dbName = process.env.MONGO_INITDB_DATABASE || 'notion_db';
const database = db.getSiblingDB(dbName);

const collections = ['tasks', 'contacts', 'content', 'inventory', 'projects', 'products'];

collections.forEach(name => {
  if (!database.getCollectionNames().includes(name)) {
    database.createCollection(name);
    print(`  ✔ Created collection: ${name}`);
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

print(`[init] MongoDB "${dbName}" initialized — ${collections.length} collections ready.`);

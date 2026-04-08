/* global db, print, process */
// init-collections.js — Creates collections and indexes on first MongoDB startup.
// Runs automatically when placed in /docker-entrypoint-initdb.d/.

const dbName = process.env.MONGO_INITDB_DATABASE || 'notion_db';
db = db.getSiblingDB(dbName);

const collections = ['tasks', 'contacts', 'content', 'inventory', 'projects', 'products'];

collections.forEach(name => {
  if (!db.getCollectionNames().includes(name)) {
    db.createCollection(name);
    print(`  ✔ Created collection: ${name}`);
  }
});

// ── Indexes ──
db.tasks.createIndex({ status: 1 });
db.tasks.createIndex({ priority: 1 });
db.tasks.createIndex({ assignee: 1 });

db.contacts.createIndex({ company: 1 });
db.contacts.createIndex({ stage: 1 });
db.contacts.createIndex({ email: 1 }, { unique: true, sparse: true });

db.content.createIndex({ status: 1 });
db.content.createIndex({ publish_date: 1 });

db.inventory.createIndex({ category: 1 });
db.inventory.createIndex({ serial_number: 1 }, { unique: true, sparse: true });

db.projects.createIndex({ status: 1 });
db.projects.createIndex({ priority: 1 });

db.products.createIndex({ category: 1 });
db.products.createIndex({ price: 1 });
db.products.createIndex({ sku: 1 }, { unique: true, sparse: true });

print(`[init] MongoDB "${dbName}" initialized — ${collections.length} collections ready.`);

/**
 * init/init.js
 *
 * First-boot MongoDB initialization script.
 * Executed automatically by the official mongo Docker image when /data/db is empty.
 *
 * Responsibilities:
 *   1. Create one database per application
 *   2. Create a dedicated user with readWrite on that database only
 *   3. Never grant cluster-wide or admin roles to application users
 *
 * Credentials come from container environment variables (see .env / docker-compose.yml).
 * Root credentials are created by the image via MONGO_INITDB_ROOT_* — do not use root
 * from applications.
 *
 * NOTE: Re-running this script on an already-initialized volume has no effect.
 *        Use scripts/create-user.sh to add databases/users later.
 */

(function () {
  "use strict";

  /**
   * Require a non-empty environment variable or abort initialization.
   * Failing fast prevents silent creation of users with empty passwords.
   */
  function requireEnv(name) {
    const value = process.env[name];
    if (!value || String(value).trim() === "") {
      throw new Error(
        `Missing required environment variable: ${name}. ` +
          `Copy .env.example to .env and set strong passwords before first start.`
      );
    }
    if (String(value).startsWith("CHANGE_ME")) {
      throw new Error(
        `Refusing to initialize with placeholder password in ${name}. ` +
          `Replace CHANGE_ME_* values in .env with secrets from: openssl rand -base64 32`
      );
    }
    return String(value);
  }

  /**
   * Create (or ensure) a database and a scoped application user.
   * Creating a user implicitly creates the database.
   */
  function provisionAppDatabase({ nameEnv, userEnv, passwordEnv }) {
    const dbName = requireEnv(nameEnv);
    const username = requireEnv(userEnv);
    const password = requireEnv(passwordEnv);

    const appDb = db.getSiblingDB(dbName);

    // Idempotent-ish for first boot: drop leftover user if a partial init retried
    // (data dir would normally be wiped on failed first boot, but be defensive).
    const existing = appDb.getUser(username);
    if (existing) {
      print(`[init] User '${username}' already exists on '${dbName}' — skipping createUser`);
    } else {
      appDb.createUser({
        user: username,
        pwd: password,
        roles: [{ role: "readWrite", db: dbName }],
      });
      print(`[init] Created user '${username}' with readWrite on '${dbName}'`);
    }

    // Ensure the database is visible (empty DB markers help operators / Compass)
    appDb.createCollection("_init");
    appDb.getCollection("_init").insertOne({
      initializedAt: new Date(),
      purpose: "Bootstrap marker — safe to delete after first deploy",
    });

    print(`[init] Database '${dbName}' ready`);
  }

  print("[init] Starting application database provisioning...");

  const apps = [
    {
      nameEnv: "OPMS_DB_NAME",
      userEnv: "OPMS_DB_USER",
      passwordEnv: "OPMS_DB_PASSWORD",
    },
    {
      nameEnv: "CRM_DB_NAME",
      userEnv: "CRM_DB_USER",
      passwordEnv: "CRM_DB_PASSWORD",
    },
    {
      nameEnv: "WEBSITE_DB_NAME",
      userEnv: "WEBSITE_DB_USER",
      passwordEnv: "WEBSITE_DB_PASSWORD",
    },
    {
      nameEnv: "INVENTORY_DB_NAME",
      userEnv: "INVENTORY_DB_USER",
      passwordEnv: "INVENTORY_DB_PASSWORD",
    },
    {
      nameEnv: "ANALYTICS_DB_NAME",
      userEnv: "ANALYTICS_DB_USER",
      passwordEnv: "ANALYTICS_DB_PASSWORD",
    },
    {
      nameEnv: "POWERAPP_DB_NAME",
      userEnv: "POWERAPP_DB_USER",
      passwordEnv: "POWERAPP_DB_PASSWORD",
    },
  ];

  apps.forEach(provisionAppDatabase);

  print("[init] All application databases and users provisioned successfully.");
  print("[init] Reminder: application connection strings must use app users, never root.");
})();

import { MongoClient } from "mongodb";

export function getMongoConfig() {
  const rootUser = process.env.MONGO_ROOT_USERNAME || "admin";
  const rootPass = process.env.MONGO_ROOT_PASSWORD || "c54236c530bc4f9b686cc17c4534e5db72a18da1cee851a5";
  const internalHost = process.env.MONGO_HOST || "mongodb";
  const port = process.env.MONGO_PORT || "27017";
  const publicHost = process.env.PUBLIC_MONGO_HOST || "127.0.0.1";

  return { rootUser, rootPass, internalHost, publicHost, port };
}

export async function createConnectedClient(dbName: string = "admin"): Promise<MongoClient> {
  const { rootUser, rootPass, internalHost, port } = getMongoConfig();

  const hostsToTry = Array.from(new Set([internalHost, "127.0.0.1", "localhost"]));

  let lastError: any = null;

  for (const host of hostsToTry) {
    const uri = `mongodb://${rootUser}:${encodeURIComponent(rootPass)}@${host}:${port}/${dbName}?authSource=admin&directConnection=true`;
    try {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
      await client.connect();
      return client;
    } catch (err: any) {
      lastError = err;
      if (
        err.message?.includes("ENOTFOUND") ||
        err.message?.includes("ECONNREFUSED") ||
        err.code === "ENOTFOUND" ||
        err.code === "ECONNREFUSED"
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Failed to connect to MongoDB on any target host");
}

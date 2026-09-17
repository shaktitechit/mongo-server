import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { cookies } from "next/headers";
import { createConnectedClient, getMongoConfig } from "@/lib/mongo";
import { verifySessionToken } from "@/lib/jwt";

export async function GET() {
  const { rootUser, rootPass, publicHost, port } = getMongoConfig();

  // Read current user session from cookies for database scoping
  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  let client: MongoClient | null = null;
  try {
    client = await createConnectedClient("admin");

    const adminDb = client.db("admin");
    const dbsResult = await adminDb.command({ listDatabases: 1 });

    // Dynamically fetch all registered users across all databases from system.users
    let systemUsers: any[] = [];
    try {
      systemUsers = await adminDb.collection("system.users").find().toArray();
    } catch {
      // Fallback
    }

    let databaseStats = await Promise.all(
      (dbsResult.databases || []).map(async (dbInfo: any) => {
        try {
          const db = client!.db(dbInfo.name);
          const stats = await db.command({ dbStats: 1 });
          const collections = await db.listCollections().toArray();

          // Find registered user for this database dynamically
          const userDoc = systemUsers.find((u) => u.db === dbInfo.name);
          const appUser = userDoc
            ? userDoc.user
            : (dbInfo.name === "admin" ? rootUser : `${dbInfo.name}_user`);

          const envPass = process.env[`${dbInfo.name.toUpperCase().replace(/-/g, "_")}_DB_PASSWORD`];
          const appPass = envPass || (dbInfo.name === "admin" ? rootPass : null);

          // Build dynamic connection URIs with 127.0.0.1 for local host compatibility
          const maskedConn = appUser
            ? `mongodb://${appUser}:••••••••@${publicHost}:${port}/${dbInfo.name}?authSource=${dbInfo.name === "admin" ? "admin" : dbInfo.name}&directConnection=true`
            : `mongodb://${rootUser}:••••••••@${publicHost}:${port}/${dbInfo.name}?authSource=admin&directConnection=true`;

          const unmaskedConn = appPass
            ? `mongodb://${appUser}:${encodeURIComponent(appPass)}@${publicHost}:${port}/${dbInfo.name}?authSource=${dbInfo.name === "admin" ? "admin" : dbInfo.name}&directConnection=true`
            : (dbInfo.name === "admin"
                ? `mongodb://${rootUser}:${encodeURIComponent(rootPass)}@${publicHost}:${port}/admin?authSource=admin&directConnection=true`
                : `mongodb://${appUser || dbInfo.name + "_user"}:<PASSWORD>@${publicHost}:${port}/${dbInfo.name}?authSource=${dbInfo.name}&directConnection=true`);

          return {
            name: dbInfo.name,
            sizeOnDisk: dbInfo.sizeOnDisk || 0,
            empty: dbInfo.empty || false,
            collectionsCount: stats.collections || collections.length,
            objectsCount: stats.objects || 0,
            dataSize: stats.dataSize || 0,
            storageSize: stats.storageSize || 0,
            indexesCount: stats.indexes || 0,
            appUser,
            appPassword: appPass,
            connectionString: maskedConn,
            unmaskedConnectionString: unmaskedConn,
          };
        } catch {
          return {
            name: dbInfo.name,
            sizeOnDisk: dbInfo.sizeOnDisk || 0,
            empty: dbInfo.empty || false,
            collectionsCount: 0,
            objectsCount: 0,
            dataSize: 0,
            storageSize: 0,
            indexesCount: 0,
            appUser: null,
            appPassword: null,
            connectionString: "",
            unmaskedConnectionString: "",
          };
        }
      })
    );

    // Apply database isolation scoping if user is an APP_USER
    if (session && !session.isSuperAdmin && session.allowedDbs && !session.allowedDbs.includes("*")) {
      databaseStats = databaseStats.filter((db) => session.allowedDbs.includes(db.name));
    }

    return NextResponse.json({
      success: true,
      totalDatabases: databaseStats.length,
      databases: databaseStats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch databases" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}

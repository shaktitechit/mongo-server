import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { createConnectedClient, getMongoConfig } from "@/lib/mongo";

export async function GET() {
  const { host } = getMongoConfig() as any;

  let client: MongoClient | null = null;
  try {
    client = await createConnectedClient("admin");

    const adminDb = client.db("admin");
    const pingRes = await adminDb.command({ ping: 1 });
    const serverStatus = await adminDb.command({ serverStatus: 1 });
    let replStatus: any = null;
    try {
      replStatus = await adminDb.command({ replSetGetStatus: 1 });
    } catch {
      // replSet status might fail if not initiated
    }

    // Fetch exact database sizes and storage stats across all databases
    let totalSizeOnDiskBytes = 0;
    let totalDataSizeBytes = 0;
    let totalStorageSizeBytes = 0;
    let totalIndexesSizeBytes = 0;
    let totalObjectsCount = 0;
    let databasesSummary: any[] = [];

    try {
      const listDbs = await adminDb.command({ listDatabases: 1 });
      if (listDbs.databases) {
        databasesSummary = await Promise.all(
          listDbs.databases.map(async (dbInfo: any) => {
            totalSizeOnDiskBytes += dbInfo.sizeOnDisk || 0;
            try {
              const db = client!.db(dbInfo.name);
              const stats = await db.command({ dbStats: 1 });
              totalDataSizeBytes += stats.dataSize || 0;
              totalStorageSizeBytes += stats.storageSize || 0;
              totalIndexesSizeBytes += stats.indexSize || 0;
              totalObjectsCount += stats.objects || 0;
              return {
                name: dbInfo.name,
                sizeOnDiskMB: Number(((dbInfo.sizeOnDisk || 0) / (1024 * 1024)).toFixed(2)),
                dataSizeMB: Number(((stats.dataSize || 0) / (1024 * 1024)).toFixed(2)),
                storageSizeMB: Number(((stats.storageSize || 0) / (1024 * 1024)).toFixed(2)),
                objectsCount: stats.objects || 0,
              };
            } catch {
              return {
                name: dbInfo.name,
                sizeOnDiskMB: Number(((dbInfo.sizeOnDisk || 0) / (1024 * 1024)).toFixed(2)),
                dataSizeMB: 0,
                storageSizeMB: 0,
                objectsCount: 0,
              };
            }
          })
        );
      }
    } catch (err) {
      console.error("Failed to fetch detailed db stats", err);
    }

    const dataSizeMB = Number((totalSizeOnDiskBytes / (1024 * 1024)).toFixed(2));
    const uncompressedDataSizeMB = Number((totalDataSizeBytes / (1024 * 1024)).toFixed(2));
    const storageSizeMB = Number((totalStorageSizeBytes / (1024 * 1024)).toFixed(2));
    const indexesSizeMB = Number((totalIndexesSizeBytes / (1024 * 1024)).toFixed(2));

    return NextResponse.json({
      success: true,
      status: pingRes.ok === 1 ? "HEALTHY" : "UNHEALTHY",
      version: serverStatus.version,
      uptimeSeconds: serverStatus.uptime,
      connections: serverStatus.connections,
      replicaSet: replStatus ? {
        set: replStatus.set,
        myState: replStatus.myState,
        stateStr: replStatus.members?.find((m: any) => m.self)?.stateStr || "PRIMARY",
        membersCount: replStatus.members?.length || 1,
      } : {
        set: "rs0",
        stateStr: "PRIMARY",
        membersCount: 1
      },
      memory: {
        residentMB: serverStatus.mem?.resident || 0,
        virtualMB: serverStatus.mem?.virtual || 0,
      },
      network: serverStatus.network || { bytesIn: 0, bytesOut: 0 },
      opcounters: serverStatus.opcounters || {},
      dataSizeMB,
      uncompressedDataSizeMB,
      storageSizeMB,
      indexesSizeMB,
      totalObjectsCount,
      databasesSummary,
      host: serverStatus.host || "127.0.0.1",
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      status: "OFFLINE",
      error: error.message || "Failed to connect to MongoDB",
    }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
  }
}

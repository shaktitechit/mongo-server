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
      opcounters: serverStatus.opcounters || {},
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

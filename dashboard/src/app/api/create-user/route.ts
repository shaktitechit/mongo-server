import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { createConnectedClient } from "@/lib/mongo";

export async function POST(req: Request) {
  try {
    const { database, username, password } = await req.json();

    if (!database || !username || !password) {
      return NextResponse.json(
        { success: false, error: "Database name, username, and password are required" },
        { status: 400 }
      );
    }

    let client: MongoClient | null = null;
    try {
      client = await createConnectedClient(database);

      const appDb = client.db(database);

      // Create collection marker to materialize DB
      await appDb.createCollection("_init");
      await appDb.collection("_init").insertOne({
        createdVia: "MongoDB Ops Console Dashboard",
        createdAt: new Date(),
      });

      // Create user with readWrite role
      await appDb.command({
        createUser: username,
        pwd: password,
        roles: [{ role: "readWrite", db: database }],
      });

      return NextResponse.json({
        success: true,
        message: `Database '${database}' created and user '${username}' granted readWrite privileges.`,
      });
    } finally {
      if (client) {
        await client.close();
      }
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create database/user" },
      { status: 500 }
    );
  }
}

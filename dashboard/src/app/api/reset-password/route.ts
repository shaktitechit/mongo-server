import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { createConnectedClient, getMongoConfig } from "@/lib/mongo";

export async function POST(req: Request) {
  try {
    const { database, username, password } = await req.json();

    if (!database || !username || !password) {
      return NextResponse.json(
        { success: false, error: "Database name, username, and new password are required" },
        { status: 400 }
      );
    }

    const { publicHost, port } = getMongoConfig();

    let client: MongoClient | null = null;
    try {
      client = await createConnectedClient(database);

      const targetDb = client.db(database);

      try {
        await targetDb.command({
          updateUser: username,
          pwd: password,
        });

        return NextResponse.json({
          success: true,
          message: `Password for user '${username}' on database '${database}' reset successfully.`,
          connectionString: database === "admin"
            ? `mongodb://${username}:${encodeURIComponent(password)}@${publicHost}:${port}/${database}?authSource=admin`
            : `mongodb://${username}:${encodeURIComponent(password)}@${publicHost}:${port}/${database}?authSource=${database}`,
        });
      } catch (updateErr: any) {
        if (
          updateErr.codeName === "UserNotFound" ||
          updateErr.message?.includes("UserNotFound") ||
          updateErr.message?.includes("not found")
        ) {
          const defaultRoles = database === "admin" 
            ? [{ role: "root", db: "admin" }]
            : [{ role: "readWrite", db: database }];

          await targetDb.command({
            createUser: username,
            pwd: password,
            roles: defaultRoles,
          });

          return NextResponse.json({
            success: true,
            message: `User '${username}' did not exist on database '${database}'. Created user with new password and granted permissions.`,
            connectionString: `mongodb://${username}:${encodeURIComponent(password)}@${publicHost}:${port}/${database}?authSource=${database}`,
          });
        }
        throw updateErr;
      }
    } finally {
      if (client) {
        await client.close();
      }
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reset password" },
      { status: 500 }
    );
  }
}

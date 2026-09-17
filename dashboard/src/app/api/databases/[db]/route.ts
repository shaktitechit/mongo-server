import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { cookies } from "next/headers";
import { createConnectedClient } from "@/lib/mongo";
import { verifySessionToken } from "@/lib/jwt";

const PROTECTED_DATABASES = ["admin", "config", "local"];

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ db: string }> }
) {
  const { db: dbName } = await params;

  if (!dbName) {
    return NextResponse.json(
      { success: false, error: "Database name is required." },
      { status: 400 }
    );
  }

  // 1. Authenticate user session
  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Session token missing or invalid." },
      { status: 401 }
    );
  }

  // 2. Super Admin Authorization Check
  if (!session.isSuperAdmin) {
    return NextResponse.json(
      { success: false, error: "Forbidden. Only Super Admin can delete databases." },
      { status: 403 }
    );
  }

  // 3. System Database Protection Check
  if (PROTECTED_DATABASES.includes(dbName.toLowerCase())) {
    return NextResponse.json(
      { success: false, error: `System database '${dbName}' cannot be deleted.` },
      { status: 400 }
    );
  }

  let client: MongoClient | null = null;
  try {
    client = await createConnectedClient("admin");
    const targetDb = client.db(dbName);

    // Drop database
    await targetDb.dropDatabase();

    // Optionally drop registered user associated with database
    try {
      const adminDb = client.db("admin");
      await adminDb.command({ dropUser: `${dbName}_user` });
    } catch {
      // User might not exist or already dropped
    }

    return NextResponse.json({
      success: true,
      message: `Database '${dbName}' has been permanently dropped.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || `Failed to delete database '${dbName}'` },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}

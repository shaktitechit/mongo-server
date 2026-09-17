import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { createConnectedClient } from "@/lib/mongo";

export async function GET(req: Request, { params }: { params: Promise<{ db: string }> }) {
  const { db: dbName } = await params;
  let client: MongoClient | null = null;

  try {
    client = await createConnectedClient(dbName);
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();

    const collectionDetails = await Promise.all(
      collections.map(async (col) => {
        try {
          const stats = await db.command({ collStats: col.name });
          const indexes = await db.collection(col.name).indexes();
          return {
            name: col.name,
            type: col.type || "collection",
            count: stats.count || 0,
            sizeBytes: stats.size || 0,
            storageSizeBytes: stats.storageSize || 0,
            totalIndexSizeBytes: stats.totalIndexSize || 0,
            indexesCount: indexes.length,
            indexes: indexes.map((idx) => ({ name: idx.name, key: idx.key })),
          };
        } catch {
          const count = await db.collection(col.name).countDocuments();
          return {
            name: col.name,
            type: col.type || "collection",
            count: count,
            sizeBytes: 0,
            storageSizeBytes: 0,
            totalIndexSizeBytes: 0,
            indexesCount: 1,
            indexes: [],
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      database: dbName,
      totalCollections: collectionDetails.length,
      collections: collectionDetails.sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch collections" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ db: string }> }) {
  const { db: dbName } = await params;
  let client: MongoClient | null = null;

  try {
    const { name } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "Collection name is required" }, { status: 400 });
    }

    client = await createConnectedClient(dbName);
    const db = client.db(dbName);
    await db.createCollection(name);

    return NextResponse.json({
      success: true,
      message: `Collection '${name}' created successfully in database '${dbName}'.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create collection" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ db: string }> }) {
  const { db: dbName } = await params;
  let client: MongoClient | null = null;

  try {
    const { collection } = await req.json();
    if (!collection) {
      return NextResponse.json({ success: false, error: "Collection name is required" }, { status: 400 });
    }

    client = await createConnectedClient(dbName);
    const db = client.db(dbName);
    await db.collection(collection).drop();

    return NextResponse.json({
      success: true,
      message: `Collection '${collection}' dropped from database '${dbName}'.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to drop collection" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}

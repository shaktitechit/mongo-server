import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import { EJSON } from "bson";

import { createConnectedClient } from "@/lib/mongo";

function normalizeBsonTypes(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // Preserve existing BSON ObjectId & Date instances directly
  if (obj instanceof ObjectId || (obj && (obj as any)._bsontype === "ObjectId")) {
    return obj;
  }
  if (obj instanceof Date || (obj && (obj as any)._bsontype === "Date")) {
    return obj;
  }

  if (typeof obj === "object") {
    // 1. Direct $oid object: { $oid: "60d5ec49f1b2c81234567890" }
    if (obj.$oid && typeof obj.$oid === "string" && ObjectId.isValid(obj.$oid)) {
      return new ObjectId(obj.$oid);
    }
    // 2. Direct $date object: { $date: "..." }
    if (obj.$date) {
      return new Date(typeof obj.$date === "number" ? obj.$date : obj.$date);
    }

    if (Array.isArray(obj)) {
      return obj.map(normalizeBsonTypes);
    }

    // 3. Plain object properties
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = normalizeBsonTypes(value);
    }

    // Handle _id string conversion if it's a valid 24-char hex string
    if (typeof result._id === "string" && ObjectId.isValid(result._id)) {
      result._id = new ObjectId(result._id);
    }

    return result;
  }

  return obj;
}

function parseEJSONInput(input: any): any {
  if (input === null || input === undefined) return input;
  let parsed = input;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return {};
    try {
      parsed = EJSON.parse(trimmed);
    } catch {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
  } else if (typeof input === "object") {
    try {
      parsed = EJSON.deserialize(input);
    } catch {
      parsed = input;
    }
  }

  return normalizeBsonTypes(parsed);
}

export async function POST(req: Request, { params }: { params: Promise<{ db: string }> }) {
  const { db: dbName } = await params;
  let client: MongoClient | null = null;

  try {
    const body = await req.json();
    const action = body.action || "find";
    const collectionName = body.collection;

    if (!collectionName) {
      return NextResponse.json({ success: false, error: "Collection name is required" }, { status: 400 });
    }

    client = await createConnectedClient(dbName);
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    // 1. FIND QUERY
    if (action === "find") {
      let filter = {};
      let sort = {};
      let projection = {};
      const limit = Math.min(Math.max(parseInt(body.limit || "25", 10), 1), 500);
      const skip = Math.max(parseInt(body.skip || "0", 10), 0);

      if (body.filter) {
        filter = parseEJSONInput(body.filter);
      }
      if (body.sort) {
        sort = parseEJSONInput(body.sort);
      }
      if (body.projection) {
        projection = parseEJSONInput(body.projection);
      }

      const totalCount = await col.countDocuments(filter);
      const docs = await col.find(filter).project(projection).sort(sort).skip(skip).limit(limit).toArray();

      // Serialize with EJSON to preserve ObjectIds, Dates, and BSON types
      const serializedDocs = docs.map((d) => EJSON.serialize(d, { relaxed: true }));

      return NextResponse.json({
        success: true,
        collection: collectionName,
        totalCount,
        limit,
        skip,
        documents: serializedDocs,
      });
    }

    // 2. INSERT DOCUMENT
    if (action === "insert") {
      if (!body.document) {
        return NextResponse.json({ success: false, error: "Document payload is required" }, { status: 400 });
      }

      const parsedDoc = parseEJSONInput(body.document);

      if (Array.isArray(parsedDoc)) {
        const result = await col.insertMany(parsedDoc);
        return NextResponse.json({
          success: true,
          message: `Inserted ${result.insertedCount} documents cleanly.`,
          insertedIds: result.insertedIds,
        });
      } else {
        const result = await col.insertOne(parsedDoc);
        return NextResponse.json({
          success: true,
          message: `Document inserted cleanly with _id: ${result.insertedId}`,
          insertedId: result.insertedId,
        });
      }
    }

    // 3. UPDATE DOCUMENT
    if (action === "update") {
      if (!body.filter || !body.update) {
        return NextResponse.json({ success: false, error: "Filter and Update payloads are required" }, { status: 400 });
      }

      let parsedFilter = parseEJSONInput(body.filter);
      let parsedUpdate = parseEJSONInput(body.update);

      // Sanitize parsedUpdate to remove _id from $set or top-level payload to prevent immutable _id field errors
      const hasAtomicOps = Object.keys(parsedUpdate).some((k) => k.startsWith("$"));
      if (!hasAtomicOps) {
        if (parsedUpdate && typeof parsedUpdate === "object") {
          delete parsedUpdate._id;
        }
        parsedUpdate = { $set: parsedUpdate };
      } else if (parsedUpdate.$set && typeof parsedUpdate.$set === "object") {
        delete parsedUpdate.$set._id;
      }
      if (parsedUpdate && typeof parsedUpdate === "object") {
        delete parsedUpdate._id;
      }

      let result = await col.updateOne(parsedFilter, parsedUpdate);

      // Fallback matching: if matchedCount is 0, try alternate _id representation (string vs ObjectId)
      if (result.matchedCount === 0 && parsedFilter._id) {
        if (parsedFilter._id instanceof ObjectId || (parsedFilter._id && parsedFilter._id._bsontype === "ObjectId")) {
          const stringFilter = { ...parsedFilter, _id: parsedFilter._id.toString() };
          result = await col.updateOne(stringFilter, parsedUpdate);
        } else if (typeof parsedFilter._id === "string" && ObjectId.isValid(parsedFilter._id)) {
          const oidFilter = { ...parsedFilter, _id: new ObjectId(parsedFilter._id) };
          result = await col.updateOne(oidFilter, parsedUpdate);
        }
      }

      if (result.matchedCount === 0) {
        return NextResponse.json({
          success: false,
          error: "No document matched the specified filter (matchedCount: 0). Document was not updated.",
          matchedCount: 0,
          modifiedCount: 0,
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: `Matched ${result.matchedCount} document(s), modified ${result.modifiedCount} document(s).`,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });
    }

    // 4. DELETE DOCUMENT
    if (action === "delete") {
      if (!body.filter) {
        return NextResponse.json({ success: false, error: "Filter payload is required for deletion" }, { status: 400 });
      }

      let parsedFilter = parseEJSONInput(body.filter);

      let result = await col.deleteOne(parsedFilter);

      // Fallback matching for delete
      if (result.deletedCount === 0 && parsedFilter._id) {
        if (parsedFilter._id instanceof ObjectId || (parsedFilter._id && parsedFilter._id._bsontype === "ObjectId")) {
          const stringFilter = { ...parsedFilter, _id: parsedFilter._id.toString() };
          result = await col.deleteOne(stringFilter);
        } else if (typeof parsedFilter._id === "string" && ObjectId.isValid(parsedFilter._id)) {
          const oidFilter = { ...parsedFilter, _id: new ObjectId(parsedFilter._id) };
          result = await col.deleteOne(oidFilter);
        }
      }

      if (result.deletedCount === 0) {
        return NextResponse.json({
          success: false,
          error: "No document matched the specified filter (deletedCount: 0). Document was not deleted.",
          deletedCount: 0,
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${result.deletedCount} document(s).`,
        deletedCount: result.deletedCount,
      });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Document operation failed" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}

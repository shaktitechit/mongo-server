import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import { EJSON } from "bson";

import { createConnectedClient } from "@/lib/mongo";

function normalizeBsonTypes(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof ObjectId || (obj && (obj as any)._bsontype === "ObjectId")) {
    return obj;
  }
  if (obj instanceof Date || (obj && (obj as any)._bsontype === "Date")) {
    return obj;
  }

  if (typeof obj === "object") {
    if (obj.$oid && typeof obj.$oid === "string" && ObjectId.isValid(obj.$oid)) {
      return new ObjectId(obj.$oid);
    }
    if (obj.$date) {
      return new Date(typeof obj.$date === "number" ? obj.$date : obj.$date);
    }

    if (Array.isArray(obj)) {
      return obj.map(normalizeBsonTypes);
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = normalizeBsonTypes(value);
    }

    if (typeof result._id === "string" && ObjectId.isValid(result._id)) {
      result._id = new ObjectId(result._id);
    }

    return result;
  }

  return obj;
}

function parseShellQuery(str: string): any {
  if (!str || !str.trim()) return {};

  // Replace ObjectId("...") and ISODate("...") shell constructs with EJSON equivalents
  const preprocessed = str
    .replace(/ObjectId\s*\(\s*["']([a-fA-F0-9]{24})["']\s*\)/g, '{"$oid":"$1"}')
    .replace(/ISODate\s*\(\s*["']([^"']+)["']\s*\)/g, '{"$date":"$1"}');

  try {
    const parsed = EJSON.parse(preprocessed);
    return normalizeBsonTypes(parsed);
  } catch {
    try {
      const parsed = JSON.parse(preprocessed);
      return normalizeBsonTypes(parsed);
    } catch {
      return preprocessed;
    }
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ db: string }> }) {
  const { db: dbName } = await params;
  let client: MongoClient | null = null;

  try {
    const { code, command } = await req.json();
    const queryStr = (code || command || "").trim();

    if (!queryStr) {
      return NextResponse.json({ success: false, error: "Query code or command is required" }, { status: 400 });
    }

    client = await createConnectedClient(dbName);
    const db = client.db(dbName);
    const startTime = Date.now();

    let result: any = null;

    // Direct JSON command parsing (e.g., { ping: 1 } or { dbStats: 1 })
    if (queryStr.startsWith("{") && queryStr.endsWith("}")) {
      const parsedCmd = parseShellQuery(queryStr);
      result = await db.command(parsedCmd);
    } else {
      // Helper parser for mongosh syntax like db.collection.find(...)
      const findMatch = queryStr.match(/^db\.([a-zA-Z0-9_.-]+)\.find\(([\s\S]*)\)$/);
      const aggMatch = queryStr.match(/^db\.([a-zA-Z0-9_.-]+)\.aggregate\(([\s\S]*)\)$/);
      const countMatch = queryStr.match(/^db\.([a-zA-Z0-9_.-]+)\.count\(([\s\S]*)\)$/);
      const statsMatch = queryStr.match(/^db\.stats\(\)$/);

      if (findMatch) {
        const colName = findMatch[1];
        const argStr = findMatch[2].trim();
        let filter = {};
        if (argStr) {
          filter = parseShellQuery(argStr);
        }
        result = await db.collection(colName).find(filter).limit(100).toArray();
      } else if (aggMatch) {
        const colName = aggMatch[1];
        const argStr = aggMatch[2].trim();
        let pipeline: any[] = [];
        if (argStr) {
          pipeline = parseShellQuery(argStr);
        }
        result = await db.collection(colName).aggregate(pipeline).toArray();
      } else if (countMatch) {
        const colName = countMatch[1];
        const argStr = countMatch[2].trim();
        let filter = {};
        if (argStr) {
          filter = parseShellQuery(argStr);
        }
        result = { count: await db.collection(colName).countDocuments(filter) };
      } else if (statsMatch) {
        result = await db.command({ dbStats: 1 });
      } else {
        return NextResponse.json({
          success: false,
          error: "Unsupported query syntax. Supported formats:\n- db.collection.find({ ... })\n- db.collection.aggregate([ ... ])\n- db.collection.count({ ... })\n- db.stats()\n- Raw JSON command: { ping: 1 }",
        }, { status: 400 });
      }
    }

    const executionTimeMs = Date.now() - startTime;
    const serializedResult = EJSON.serialize(result, { relaxed: true });

    return NextResponse.json({
      success: true,
      database: dbName,
      executionTimeMs,
      result: serializedResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Query execution failed" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}

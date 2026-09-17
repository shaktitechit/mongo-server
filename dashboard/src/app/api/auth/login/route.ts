import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { getMongoConfig } from "@/lib/mongo";
import { signSessionToken } from "@/lib/jwt";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required" },
        { status: 400 }
      );
    }

    const { internalHost, port } = getMongoConfig();
    const hostsToTry = Array.from(new Set([internalHost, "127.0.0.1", "localhost"]));

    let authenticated = false;
    let role: "SUPER_ADMIN" | "APP_USER" = "APP_USER";
    let authDb = "admin";
    let allowedDbs: string[] = [];
    let isSuperAdmin = false;

    // 1. First attempt to authenticate as Root / Admin on "admin" database
    for (const host of hostsToTry) {
      const uri = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/admin?authSource=admin&directConnection=true`;
      try {
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        await client.close();

        authenticated = true;
        role = "SUPER_ADMIN";
        authDb = "admin";
        allowedDbs = ["*"];
        isSuperAdmin = true;
        break;
      } catch {
        // Continue
      }
    }

    // 2. If admin auth fails, attempt to authenticate on application databases
    if (!authenticated) {
      const candidateDbs = ["opms", "crm", "website", "inventory", "analytics", "powerapp", "reporting", "ajit", "analytics_v2"];
      for (const targetDb of candidateDbs) {
        for (const host of hostsToTry) {
          const uri = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${targetDb}?authSource=${targetDb}&directConnection=true`;
          try {
            const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
            await client.connect();
            await client.db(targetDb).command({ ping: 1 });
            await client.close();

            authenticated = true;
            role = "APP_USER";
            authDb = targetDb;
            allowedDbs = [targetDb];
            isSuperAdmin = false;
            break;
          } catch {
            // Continue
          }
        }
        if (authenticated) break;
      }
    }

    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Sign JWT session token with database scope
    const token = await signSessionToken({
      username,
      role,
      db: authDb,
      allowedDbs,
      isSuperAdmin,
    });

    const response = NextResponse.json({
      success: true,
      message: "Login successful",
      user: { username, role, db: authDb, allowedDbs, isSuperAdmin },
    });

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: "dashboard_session",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Authentication failed" },
      { status: 500 }
    );
  }
}

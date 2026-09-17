import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/jwt";

const execAsync = promisify(exec);

function getBackupsDir() {
  if (fs.existsSync("/backups")) return "/backups";
  return path.resolve(process.cwd(), "../backups");
}

export async function GET() {
  const backupsDir = getBackupsDir();
  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  try {
    if (!fs.existsSync(backupsDir)) {
      return NextResponse.json({ success: true, backups: [] });
    }

    const files = fs.readdirSync(backupsDir);
    let backupFiles = files
      .filter((file) => file.endsWith(".archive.gz") || file.endsWith(".archive.gz.gpg"))
      .map((file) => {
        const filePath = path.join(backupsDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          sizeBytes: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
          createdAt: stats.birthtime || stats.mtime,
          isEncrypted: file.endsWith(".gpg"),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Filter backups list for scoped app users
    if (session && !session.isSuperAdmin && session.db) {
      backupFiles = backupFiles.filter(
        (b) => b.filename.includes(`_${session.db}_`) || b.filename.includes("full")
      );
    }

    return NextResponse.json({ success: true, backups: backupFiles });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list backups" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("dashboard_session")?.value;
    const session = token ? await verifySessionToken(token) : null;

    const body = await req.json();
    const action = body.action || "backup"; // "backup" | "verify" | "restore" | "delete"
    const backupsDir = getBackupsDir();

    const host = process.env.MONGO_HOST || "mongodb";
    const port = host === "mongodb" ? "27017" : (process.env.MONGO_PORT || "27020");
    const user = process.env.MONGO_ROOT_USERNAME || "admin";
    const pass = process.env.MONGO_ROOT_PASSWORD || "";

    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // 1. CREATE BACKUP (Cluster / Database / Collection Level)
    if (action === "backup") {
      const stamp = new Date().toISOString().replace(/[:.-]/g, "").slice(0, 15) + "Z";
      const targetDb = session && !session.isSuperAdmin ? session.db : body.db;
      const targetCollection = body.collection;

      let prefix = "mongodb_full";
      if (targetDb && targetCollection) {
        prefix = `mongodb_${targetDb}_${targetCollection}`;
      } else if (targetDb) {
        prefix = `mongodb_${targetDb}`;
      }

      const label = body.label ? `_${body.label.replace(/[^a-zA-Z0-9._-]/g, "_")}` : "";
      const archiveName = `${prefix}_${stamp}${label}.archive.gz`;
      const archivePath = path.join(backupsDir, archiveName);

      const dbFlag = targetDb ? `--db="${targetDb}"` : "";
      const colFlag = targetDb && targetCollection ? `--collection="${targetCollection}"` : "";

      const cmd = `mongodump --host="${host}" --port="${port}" --username="${user}" --password="${pass}" --authenticationDatabase=admin ${dbFlag} ${colFlag} --gzip --archive="${archivePath}"`;

      const { stdout, stderr } = await execAsync(cmd);
      return NextResponse.json({
        success: true,
        message: `Backup '${archiveName}' created successfully.`,
        filename: archiveName,
        output: stdout || stderr,
      });
    }

    // 2. VERIFY BACKUP SNAPSHOT
    if (action === "verify") {
      if (!body.filename) {
        return NextResponse.json({ success: false, error: "Filename is required" }, { status: 400 });
      }
      const archivePath = path.join(backupsDir, path.basename(body.filename));
      if (!fs.existsSync(archivePath)) {
        return NextResponse.json({ success: false, error: `File not found: ${body.filename}` }, { status: 404 });
      }

      const cmd = `mongorestore --host="${host}" --port="${port}" --username="${user}" --password="${pass}" --authenticationDatabase=admin --gzip --archive="${archivePath}" --dryRun`;

      const { stdout, stderr } = await execAsync(cmd);
      return NextResponse.json({
        success: true,
        message: `Verification complete for '${body.filename}'`,
        output: stdout || stderr,
      });
    }

    // 3. DELETE BACKUP ARCHIVE
    if (action === "delete") {
      if (session && !session.isSuperAdmin) {
        return NextResponse.json(
          { success: false, error: "Forbidden. Only super admins can delete backup files." },
          { status: 403 }
        );
      }
      if (!body.filename) {
        return NextResponse.json({ success: false, error: "Filename is required" }, { status: 400 });
      }
      const archivePath = path.join(backupsDir, path.basename(body.filename));
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
        return NextResponse.json({
          success: true,
          message: `Backup archive '${body.filename}' deleted successfully.`,
        });
      }
      return NextResponse.json({ success: false, error: `File not found: ${body.filename}` }, { status: 404 });
    }

    // 4. RESTORE BACKUP (Preserving System Users & Support Collection Scope)
    if (action === "restore") {
      if (!body.filename) {
        return NextResponse.json({ success: false, error: "Filename is required" }, { status: 400 });
      }
      const archivePath = path.join(backupsDir, path.basename(body.filename));
      if (!fs.existsSync(archivePath)) {
        return NextResponse.json({ success: false, error: `File not found: ${body.filename}` }, { status: 404 });
      }

      const targetDb = session && !session.isSuperAdmin ? session.db : body.db;
      const targetCollection = body.collection;

      let nsFlags = "";
      if (targetDb && targetCollection) {
        nsFlags = `--nsInclude="${targetDb}.${targetCollection}"`;
      } else if (targetDb) {
        nsFlags = `--nsInclude="${targetDb}.*"`;
      } else if (session && !session.isSuperAdmin && session.db) {
        nsFlags = `--nsInclude="${session.db}.*"`;
      }

      // ALWAYS exclude system.users and admin.system.* to preserve database users & passwords!
      const excludeSystemFlags = `--nsExclude="*.system.users" --nsExclude="admin.system.*"`;

      const cmd = `mongorestore --host="${host}" --port="${port}" --username="${user}" --password="${pass}" --authenticationDatabase=admin ${nsFlags} ${excludeSystemFlags} --gzip --archive="${archivePath}" --drop`;

      const { stdout, stderr } = await execAsync(cmd);
      return NextResponse.json({
        success: true,
        message: `Restore complete from '${body.filename}' (system users preserved).`,
        output: stdout || stderr,
      });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Operation failed" },
      { status: 500 }
    );
  }
}

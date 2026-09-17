import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getBackupsDir() {
  if (fs.existsSync("/backups")) return "/backups";
  return path.resolve(process.cwd(), "../backups");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "Filename query parameter is required" }, { status: 400 });
  }

  const safeFilename = path.basename(filename);
  const backupsDir = getBackupsDir();
  const filePath = path.join(backupsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: `Backup file '${safeFilename}' not found` }, { status: 404 });
  }

  const fileStream = fs.createReadStream(filePath);
  const stats = fs.statSync(filePath);

  return new Response(fileStream as any, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Content-Length": stats.size.toString(),
    },
  });
}

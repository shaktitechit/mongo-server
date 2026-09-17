import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getBackupsDir() {
  if (fs.existsSync("/backups")) return "/backups";
  return path.resolve(process.cwd(), "../backups");
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    const safeFilename = path.basename(file.name);
    if (!safeFilename.endsWith(".archive.gz") && !safeFilename.endsWith(".archive.gz.gpg")) {
      return NextResponse.json(
        { success: false, error: "Invalid backup extension. File must end in .archive.gz or .archive.gz.gpg" },
        { status: 400 }
      );
    }

    const backupsDir = getBackupsDir();
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const destPath = path.join(backupsDir, safeFilename);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    fs.writeFileSync(destPath, buffer);

    return NextResponse.json({
      success: true,
      message: `Backup archive '${safeFilename}' uploaded successfully (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
      filename: safeFilename,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to upload backup" },
      { status: 500 }
    );
  }
}

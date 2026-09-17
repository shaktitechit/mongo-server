import { NextResponse } from "next/server";

export async function GET() {
  const exporterUrl = process.env.EXPORTER_URL || "http://127.0.0.1:9216/metrics";

  try {
    const res = await fetch(exporterUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Exporter returned status ${res.status}`);
    }

    const text = await res.text();
    const lines = text.split("\n");

    const metrics: Record<string, number> = {};

    for (const line of lines) {
      if (line.startsWith("#") || !line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const metricName = parts[0];
        const metricValue = parseFloat(parts[1]);
        if (!isNaN(metricValue)) {
          metrics[metricName] = metricValue;
        }
      }
    }

    return NextResponse.json({
      success: true,
      scrapedAt: new Date().toISOString(),
      rawMetricsCount: Object.keys(metrics).length,
      metrics: {
        activeConnections: metrics['mongodb_connections{state="current"}'] || 0,
        availableConnections: metrics['mongodb_connections{state="available"}'] || 200,
        residentMemoryMB: Math.round((metrics['mongodb_memory{type="resident"}'] || 0)),
        virtualMemoryMB: Math.round((metrics['mongodb_memory{type="virtual"}'] || 0)),
        opInsert: metrics['mongodb_op_counters_total{type="insert"}'] || 0,
        opQuery: metrics['mongodb_op_counters_total{type="query"}'] || 0,
        opUpdate: metrics['mongodb_op_counters_total{type="update"}'] || 0,
        opDelete: metrics['mongodb_op_counters_total{type="delete"}'] || 0,
        opGetmore: metrics['mongodb_op_counters_total{type="getmore"}'] || 0,
        opCommand: metrics['mongodb_op_counters_total{type="command"}'] || 0,
        assertsRegular: metrics['mongodb_asserts_total{type="regular"}'] || 0,
        assertsWarning: metrics['mongodb_asserts_total{type="warning"}'] || 0,
        assertsMsg: metrics['mongodb_asserts_total{type="msg"}'] || 0,
        assertsUser: metrics['mongodb_asserts_total{type="user"}'] || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to scrape exporter metrics",
        metrics: {
          activeConnections: 5,
          availableConnections: 195,
          residentMemoryMB: 120,
          virtualMemoryMB: 1024,
          opInsert: 142,
          opQuery: 840,
          opUpdate: 210,
          opDelete: 12,
          opGetmore: 45,
          opCommand: 1250,
          assertsRegular: 0,
          assertsWarning: 0,
          assertsMsg: 0,
          assertsUser: 0,
        },
      }
    );
  }
}

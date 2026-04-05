const mongoose = require('mongoose');

const routeStats = new Map();
let startedAt = Date.now();
let dbPingHistory = [];
let dbAccessStats = {
  checks: 0,
  totalLatencyMs: 0,
  minLatencyMs: 0,
  maxLatencyMs: 0,
  failures: 0
};

const totals = {
  calls: 0,
  requestBytes: 0,
  responseBytes: 0,
  totalDurationMs: 0,
  success2xx: 0,
  client4xx: 0,
  server5xx: 0
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function recordApiCall({ routePath, method, durationMs, requestBytes, responseBytes, statusCode }) {
  const key = `${method.toUpperCase()} ${routePath}`;
  const safeDuration = toNumber(durationMs);
  const safeReq = toNumber(requestBytes);
  const safeRes = toNumber(responseBytes);

  totals.calls += 1;
  totals.requestBytes += safeReq;
  totals.responseBytes += safeRes;
  totals.totalDurationMs += safeDuration;

  if (statusCode >= 200 && statusCode < 300) totals.success2xx += 1;
  else if (statusCode >= 400 && statusCode < 500) totals.client4xx += 1;
  else if (statusCode >= 500) totals.server5xx += 1;

  const current = routeStats.get(key) || {
    routePath,
    method: method.toUpperCase(),
    calls: 0,
    requestBytes: 0,
    responseBytes: 0,
    totalDurationMs: 0,
    success2xx: 0,
    client4xx: 0,
    server5xx: 0,
    lastStatusCode: 0,
    lastCalledAt: null
  };

  current.calls += 1;
  current.requestBytes += safeReq;
  current.responseBytes += safeRes;
  current.totalDurationMs += safeDuration;
  current.lastStatusCode = statusCode;
  current.lastCalledAt = new Date().toISOString();

  if (statusCode >= 200 && statusCode < 300) current.success2xx += 1;
  else if (statusCode >= 400 && statusCode < 500) current.client4xx += 1;
  else if (statusCode >= 500) current.server5xx += 1;

  routeStats.set(key, current);
}

function bytesPerSecond(totalBytes, uptimeSeconds) {
  if (!uptimeSeconds || uptimeSeconds <= 0) return 0;
  return totalBytes / uptimeSeconds;
}

function formatDbState(readyState) {
  switch (readyState) {
    case 0:
      return 'disconnected';
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'unknown';
  }
}

async function measureDbLatency() {
  const state = mongoose.connection.readyState;
  if (state !== 1 || !mongoose.connection.db) {
    return { ok: false, latencyMs: 0, reason: 'not-connected' };
  }

  const started = process.hrtime.bigint();
  try {
    await mongoose.connection.db.admin().ping();
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    return { ok: true, latencyMs: Number(latencyMs.toFixed(2)) };
  } catch (err) {
    return { ok: false, latencyMs: 0, reason: 'ping-failed' };
  }
}

function recordDbLatencySample(sample) {
  const nowIso = new Date().toISOString();
  dbPingHistory.push({
    timestamp: nowIso,
    latencyMs: sample.ok ? sample.latencyMs : null,
    ok: !!sample.ok
  });

  if (dbPingHistory.length > 120) {
    dbPingHistory = dbPingHistory.slice(dbPingHistory.length - 120);
  }

  dbAccessStats.checks += 1;
  if (!sample.ok) {
    dbAccessStats.failures += 1;
    return;
  }

  dbAccessStats.totalLatencyMs += sample.latencyMs;
  if (dbAccessStats.minLatencyMs === 0 || sample.latencyMs < dbAccessStats.minLatencyMs) {
    dbAccessStats.minLatencyMs = sample.latencyMs;
  }
  if (sample.latencyMs > dbAccessStats.maxLatencyMs) {
    dbAccessStats.maxLatencyMs = sample.latencyMs;
  }
}

async function getPublicInfoSnapshot() {
  const dbLatencySample = await measureDbLatency();
  recordDbLatencySample(dbLatencySample);

  const now = Date.now();
  const uptimeSeconds = Math.max(1, Math.floor((now - startedAt) / 1000));
  const avgLatencyMs = totals.calls ? totals.totalDurationMs / totals.calls : 0;
  const totalNetworkBytes = totals.requestBytes + totals.responseBytes;
  const successfulDbChecks = Math.max(0, dbAccessStats.checks - dbAccessStats.failures);
  const avgDbLatency = successfulDbChecks > 0
    ? Number((dbAccessStats.totalLatencyMs / successfulDbChecks).toFixed(2))
    : 0;

  const routeUsage = Array.from(routeStats.values())
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 25)
    .map((r) => ({
      routePath: r.routePath,
      method: r.method,
      calls: r.calls,
      requestBytes: r.requestBytes,
      responseBytes: r.responseBytes,
      averageLatencyMs: r.calls ? Number((r.totalDurationMs / r.calls).toFixed(2)) : 0,
      success2xx: r.success2xx,
      client4xx: r.client4xx,
      server5xx: r.server5xx,
      lastStatusCode: r.lastStatusCode,
      lastCalledAt: r.lastCalledAt
    }));

  return {
    generatedAt: new Date().toISOString(),
    uptimeSeconds,
    server: {
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    },
    database: {
      state: formatDbState(mongoose.connection.readyState),
      readyState: mongoose.connection.readyState,
      latencyMs: dbLatencySample.ok ? dbLatencySample.latencyMs : null,
      access: {
        checks: dbAccessStats.checks,
        failures: dbAccessStats.failures,
        averageLatencyMs: avgDbLatency,
        minLatencyMs: dbAccessStats.minLatencyMs,
        maxLatencyMs: dbAccessStats.maxLatencyMs,
        history: dbPingHistory
      }
    },
    traffic: {
      totalCalls: totals.calls,
      requestBytes: totals.requestBytes,
      responseBytes: totals.responseBytes,
      totalNetworkBytes,
      avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      requestBytesPerSecond: Number(bytesPerSecond(totals.requestBytes, uptimeSeconds).toFixed(2)),
      responseBytesPerSecond: Number(bytesPerSecond(totals.responseBytes, uptimeSeconds).toFixed(2)),
      networkBytesPerSecond: Number(bytesPerSecond(totalNetworkBytes, uptimeSeconds).toFixed(2)),
      statusBuckets: {
        success2xx: totals.success2xx,
        client4xx: totals.client4xx,
        server5xx: totals.server5xx
      }
    },
    routeUsage
  };
}

function resetMetrics() {
  routeStats.clear();
  startedAt = Date.now();
  dbPingHistory = [];
  dbAccessStats = {
    checks: 0,
    totalLatencyMs: 0,
    minLatencyMs: 0,
    maxLatencyMs: 0,
    failures: 0
  };
  totals.calls = 0;
  totals.requestBytes = 0;
  totals.responseBytes = 0;
  totals.totalDurationMs = 0;
  totals.success2xx = 0;
  totals.client4xx = 0;
  totals.server5xx = 0;
}

module.exports = {
  recordApiCall,
  getPublicInfoSnapshot,
  resetMetrics
};

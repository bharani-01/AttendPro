function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRate(bytesPerSecond) {
    return `${formatBytes(bytesPerSecond)}/s`;
}

function formatDateTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString();
}

function statusBadge(dbState) {
    if (dbState === 'connected') return '<span class="status-dot status-ok"></span>Connected';
    if (dbState === 'connecting') return '<span class="status-dot status-warn"></span>Connecting';
    return '<span class="status-dot status-bad"></span>Disconnected';
}

function ajaxJson(url, method = 'GET') {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function onReadyStateChange() {
            if (xhr.readyState !== 4) return;

            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText || '{}'));
                } catch (err) {
                    reject(new Error('Invalid JSON response'));
                }
                return;
            }

            reject(new Error(`Request failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
    });
}

let isLoadingInfo = false;
let advancedModeEnabled = false;

function drawDbLatencyGraph(history = []) {
    const canvas = document.getElementById('dbLatencyCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pad = 28;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fcfdff';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#d1dbe9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(w - pad, pad);
    ctx.stroke();

    const points = history.filter((p) => p && p.ok && Number.isFinite(p.latencyMs));
    if (!points.length) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px sans-serif';
        ctx.fillText('No DB latency samples yet', pad + 8, h / 2);
        return;
    }

    const maxY = Math.max(5, ...points.map((p) => p.latencyMs));
    const minY = 0;
    const spanY = Math.max(1, maxY - minY);

    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${maxY.toFixed(1)} ms`, 4, pad + 4);
    ctx.fillText('0 ms', 8, h - pad + 2);

    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();

    points.forEach((p, idx) => {
        const x = pad + (idx * (w - 2 * pad)) / Math.max(1, points.length - 1);
        const y = h - pad - ((p.latencyMs - minY) / spanY) * (h - 2 * pad);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = points[points.length - 1];
    const lx = pad + ((points.length - 1) * (w - 2 * pad)) / Math.max(1, points.length - 1);
    const ly = h - pad - ((last.latencyMs - minY) / spanY) * (h - 2 * pad);
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
}

async function loadInfo() {
    if (isLoadingInfo) return;
    isLoadingInfo = true;

    try {
        const data = await ajaxJson('/api/info/metrics');

        const kpis = [
            { label: 'Total API Calls', value: String(data.traffic.totalCalls) },
            { label: 'Total Request Data', value: formatBytes(data.traffic.requestBytes) },
            { label: 'Total Response Data', value: formatBytes(data.traffic.responseBytes) },
            { label: 'Total Network Data', value: formatBytes(data.traffic.totalNetworkBytes) },
            { label: 'Network Speed', value: formatRate(data.traffic.networkBytesPerSecond) },
            { label: 'Avg API Latency', value: `${data.traffic.avgLatencyMs} ms` },
        ];

        const kpiGrid = document.getElementById('kpiGrid');
        kpiGrid.innerHTML = kpis.map((k) => `
            <div class="kpi-card">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value mono">${k.value}</div>
            </div>
        `).join('');

        const runtimeMeta = document.getElementById('runtimeMeta');
        runtimeMeta.innerHTML = `
            <p><strong>Database:</strong> ${statusBadge(data.database.state)}</p>
            <p><strong>DB Latency (current):</strong> <span class="mono">${data.database.latencyMs == null ? 'N/A' : `${data.database.latencyMs} ms`}</span></p>
            <p><strong>Uptime:</strong> <span class="mono">${data.uptimeSeconds}s</span></p>
            <p><strong>Node:</strong> <span class="mono">${data.server.nodeVersion}</span></p>
            <p><strong>Environment:</strong> <span class="mono">${data.server.environment}</span></p>
            <p><strong>Generated At:</strong> <span class="mono">${formatDateTime(data.generatedAt)}</span></p>
        `;

        const dbAdvancedMeta = document.getElementById('dbAdvancedMeta');
        const dbAccess = data.database?.access || {};
        if (dbAdvancedMeta) {
            dbAdvancedMeta.innerHTML = `
                <div class="panel" style="margin-bottom:0;">
                    <h4 style="margin-bottom: 8px;">DB Access Stats</h4>
                    <p><strong>Checks:</strong> <span class="mono">${dbAccess.checks || 0}</span></p>
                    <p><strong>Failures:</strong> <span class="mono">${dbAccess.failures || 0}</span></p>
                    <p><strong>Avg Latency:</strong> <span class="mono">${dbAccess.averageLatencyMs || 0} ms</span></p>
                    <p><strong>Min/Max:</strong> <span class="mono">${dbAccess.minLatencyMs || 0} / ${dbAccess.maxLatencyMs || 0} ms</span></p>
                </div>
            `;
        }

        if (advancedModeEnabled) {
            drawDbLatencyGraph(dbAccess.history || []);
        }

        const routesBody = document.getElementById('routesBody');
        const rows = data.routeUsage || [];

        if (!rows.length) {
            routesBody.innerHTML = '<tr><td colspan="8">No API traffic captured yet.</td></tr>';
            return;
        }

        routesBody.innerHTML = rows.map((r) => `
            <tr>
                <td class="mono">${r.method} ${r.routePath}</td>
                <td>${r.calls}</td>
                <td>${formatBytes(r.requestBytes)}</td>
                <td>${formatBytes(r.responseBytes)}</td>
                <td>${r.averageLatencyMs} ms</td>
                <td>${r.success2xx}/${r.client4xx}/${r.server5xx}</td>
                <td>${r.lastStatusCode}</td>
                <td>${formatDateTime(r.lastCalledAt)}</td>
            </tr>
        `).join('');
    } catch (error) {
        const runtimeMeta = document.getElementById('runtimeMeta');
        runtimeMeta.innerHTML = `<p><strong>Live update error:</strong> <span class="mono">${error.message}</span></p>`;
    } finally {
        isLoadingInfo = false;
    }
}

async function resetMetrics() {
    await ajaxJson('/api/info/metrics/reset', 'POST');
    await loadInfo();
}

document.getElementById('refreshBtn').addEventListener('click', loadInfo);
document.getElementById('resetBtn').addEventListener('click', resetMetrics);
document.getElementById('advancedBtn').addEventListener('click', async () => {
    advancedModeEnabled = !advancedModeEnabled;
    const wrap = document.getElementById('advancedWrap');
    const btn = document.getElementById('advancedBtn');
    if (advancedModeEnabled) {
        wrap.classList.add('active');
        btn.textContent = 'Basic Mode';
    } else {
        wrap.classList.remove('active');
        btn.textContent = 'Advanced Mode';
    }
    await loadInfo();
});

loadInfo();
setInterval(loadInfo, 1000);

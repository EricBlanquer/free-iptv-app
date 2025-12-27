<?php
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Free IPTV - Logs</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Consolas', 'Monaco', monospace; background: #080810; color: #eee; margin: 0; padding: 20px; }
        h1 { color: #00d4ff; margin-bottom: 20px; }
        .controls { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .controls input, .controls select { padding: 8px 12px; border: 1px solid #333; border-radius: 4px; background: #0c1025; color: #eee; }
        .controls input { width: 200px; }
        .controls button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .btn-clear { background: #ff4757; color: #fff; }
        .stats { color: #888; font-size: 14px; margin-left: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #0c1025; padding: 10px; text-align: left; position: sticky; top: 0; z-index: 10; }
        td { padding: 8px 10px; border-bottom: 1px solid #333; vertical-align: top; }
        tr:hover { background: #0c1025; }
        tr:hover .btn-copy { opacity: 1; }
        .time { color: #888; white-space: nowrap; width: 150px; }
        .actions { width: 40px; text-align: center; }
        .msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        th:nth-child(1) { width: 150px; }
        th:nth-child(3) { width: 40px; }
        .msg-http { color: #2ed573; }
        .msg-key { color: #ff6b81; }
        .msg-action { color: #70a1ff; }
        .msg-tmdb { color: #ffa502; }
        .msg-player { color: #a29bfe; }
        .msg-error { color: #ff4757; font-weight: bold; }
        .msg-subtitle { color: #1dd1a1; }
        .msg-cache { color: #fdcb6e; }
        .msg-init { color: #74b9ff; }
        .msg-screen { color: #fd79a8; }
        .btn-copy { background: #333; border: none; color: #888; cursor: pointer; padding: 4px 8px; border-radius: 3px; opacity: 0; transition: opacity 0.2s; }
        .btn-copy:hover { background: #444; color: #fff; }
        .btn-copy.copied { background: #2ed573; color: #000; opacity: 1; }
        .empty { text-align: center; padding: 40px; color: #888; }
        .loading { text-align: center; padding: 40px; color: #00d4ff; }
        .toast { position: fixed; bottom: 20px; right: 20px; background: #2ed573; color: #000; padding: 12px 20px; border-radius: 4px; font-weight: bold; display: none; }
        @media (max-width: 768px) {
            .controls { flex-direction: column; }
            .controls input, .controls select { width: 100%; }
            .stats { margin-left: 0; }
        }
    </style>
</head>
<body>
    <h1>📋 Free IPTV Logs</h1>

    <div class="controls">
        <select id="filter-type">
            <option value="">All types</option>
            <option value="http">HTTP</option>
            <option value="key">KEY</option>
            <option value="action">ACTION</option>
            <option value="tmdb">TMDB</option>
            <option value="player">PLAYER</option>
            <option value="subtitle">SUBTITLE</option>
            <option value="error">ERROR</option>
            <option value="cache">CACHE</option>
            <option value="init">INIT</option>
            <option value="screen">SCREEN</option>
        </select>

        <input type="text" id="filter-text" placeholder="Search text...">
        <input type="text" id="filter-exclude" placeholder="Exclude..." value="Buffering">

        <select id="filter-sort">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
        </select>

        <button type="button" class="btn-clear" onclick="clearLogs()">Clear logs</button>

        <span class="stats" id="stats">0 entries</span>
    </div>

    <table>
        <thead>
            <tr>
                <th>Time</th>
                <th>Message</th>
                <th class="actions"></th>
            </tr>
        </thead>
        <tbody id="log-body">
            <tr><td colspan="3" class="loading">Loading...</td></tr>
        </tbody>
    </table>

    <div class="toast" id="toast">Copied!</div>

    <script>
        var allLogs = [];
        var lastLogId = 0;
        var refreshTimer = null;

        function loadLogs(incremental) {
            var url = 'logs-api.php';
            if (incremental && lastLogId > 0) {
                url += '?since=' + lastLogId;
            }
            fetch(url)
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var total = data.total || 0;
                    // Detect log file was cleared (total < lastLogId)
                    if (total < lastLogId) {
                        allLogs = data.logs || [];
                        lastLogId = 0;
                        loadLogs(false);
                        return;
                    }
                    if (incremental && lastLogId > 0) {
                        // Append new logs
                        allLogs = allLogs.concat(data.logs || []);
                    }
                    else {
                        // Full reload
                        allLogs = data.logs || [];
                    }
                    lastLogId = total;
                    applyFilters();
                    scheduleRefresh();
                })
                .catch(function(e) {
                    document.getElementById('log-body').innerHTML = '<tr><td colspan="3" class="empty">Error loading logs</td></tr>';
                });
        }

        function applyFilters() {
            var type = document.getElementById('filter-type').value;
            var text = document.getElementById('filter-text').value.toLowerCase();
            var exclude = document.getElementById('filter-exclude').value.toLowerCase();
            var sort = document.getElementById('filter-sort').value;

            var filtered = allLogs.filter(function(log) {
                var msgLower = log.msg.toLowerCase();
                if (text && msgLower.indexOf(text) === -1) return false;
                if (exclude && msgLower.indexOf(exclude) !== -1) return false;
                if (type) {
                    var msg = log.msg;
                    if (type === 'http' && msg.indexOf('HTTP') !== 0) return false;
                    if (type === 'key' && msg.indexOf('KEY') !== 0) return false;
                    if (type === 'action' && msg.indexOf('ACTION') !== 0) return false;
                    if (type === 'tmdb' && msg.indexOf('TMDB') !== 0) return false;
                    if (type === 'player' && msg.indexOf('PLAYER') !== 0) return false;
                    if (type === 'subtitle' && msg.indexOf('SUBTITLE') !== 0) return false;
                    if (type === 'error' && msg.indexOf('ERROR') !== 0) return false;
                    if (type === 'cache' && msg.indexOf('CACHE') !== 0) return false;
                    if (type === 'init' && msg.indexOf('INIT') !== 0) return false;
                    if (type === 'screen' && msg.indexOf('SCREEN') !== 0) return false;
                }
                return true;
            });

            if (sort === 'desc') {
                filtered = filtered.slice().reverse();
            }

            renderLogs(filtered);
            document.getElementById('stats').textContent = filtered.length + ' entries';
        }

        function renderLogs(logs) {
            var tbody = document.getElementById('log-body');
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="empty">No logs found</td></tr>';
                return;
            }

            var html = '';
            logs.forEach(function(log, i) {
                var msgClass = 'msg';
                var msg = log.msg;
                if (msg.indexOf('HTTP') === 0) msgClass += ' msg-http';
                else if (msg.indexOf('KEY') === 0) msgClass += ' msg-key';
                else if (msg.indexOf('ACTION') === 0) msgClass += ' msg-action';
                else if (msg.indexOf('TMDB') === 0) msgClass += ' msg-tmdb';
                else if (msg.indexOf('PLAYER') === 0) msgClass += ' msg-player';
                else if (msg.indexOf('SUBTITLE') === 0) msgClass += ' msg-subtitle';
                else if (msg.indexOf('CACHE') === 0) msgClass += ' msg-cache';
                else if (msg.indexOf('INIT') === 0) msgClass += ' msg-init';
                else if (msg.indexOf('SCREEN') === 0) msgClass += ' msg-screen';
                else if (msg.indexOf('ERR') === 0) msgClass += ' msg-error';

                html += '<tr>' +
                    '<td class="time">' + escapeHtml(log.time) + '</td>' +
                    '<td class="' + msgClass + '">' + escapeHtml(log.msg) + '</td>' +
                    '<td class="actions"><button class="btn-copy" onclick="copyLog(this, ' + i + ')" title="Copy">📋</button></td>' +
                    '</tr>';
            });
            tbody.innerHTML = html;

            // Store logs for copy
            tbody.dataset.logs = JSON.stringify(logs);
        }

        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function copyLog(btn, index) {
            var tbody = document.getElementById('log-body');
            var logs = JSON.parse(tbody.dataset.logs || '[]');
            var log = logs[index];
            if (!log) return;

            var fullLog = '[' + log.time + '] [' + log.device + '] ' + log.msg;
            navigator.clipboard.writeText(fullLog).then(function() {
                btn.classList.add('copied');
                btn.textContent = '✓';
                setTimeout(function() {
                    btn.classList.remove('copied');
                    btn.textContent = '📋';
                }, 1500);
            });
        }

        function clearLogs() {
            if (!confirm('Clear all logs?')) return;
            fetch('logs-api.php?clear=1')
                .then(function() {
                    allLogs = [];
                    lastLogId = 0;
                    loadLogs(false);
                });
        }

        function scheduleRefresh() {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(function() { loadLogs(true); }, 3000);
        }

        document.getElementById('filter-type').addEventListener('change', applyFilters);
        document.getElementById('filter-sort').addEventListener('change', applyFilters);
        document.getElementById('filter-text').addEventListener('input', applyFilters);
        document.getElementById('filter-exclude').addEventListener('input', applyFilters);

        // Initial load
        loadLogs(false);
    </script>
</body>
</html>

#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import base64
import hmac
import ipaddress
import socket
import subprocess
import sys
import asyncio
import hashlib
import json
import os
import tempfile
import threading
import time
import re
import signal
import traceback
import urllib.request
import xml.sax.saxutils
from pathlib import Path

PRIVATE_NETWORKS = [
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('169.254.0.0/16'),
    ipaddress.ip_network('::1/128'),
    ipaddress.ip_network('fc00::/7'),
]

FREEBOX_ALLOWED_IPS = [
    ipaddress.ip_address('192.168.1.1'),
]

TTS_PARAM_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-+%.,]+$')
MAX_TTS_TEXT_LENGTH = 5000


def _validate_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for info in addr_infos:
        addr = ipaddress.ip_address(info[4][0])
        if addr in FREEBOX_ALLOWED_IPS:
            continue
        for network in PRIVATE_NETWORKS:
            if addr in network:
                return False
    return True


THREAD_DUMP_DIR = Path('/var/log/stream-proxy')
THREAD_DUMP_MAX_FILES = 20


def _thread_dump(reason='manual'):
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
    header = f'THREAD DUMP ({reason}) - {timestamp}'
    lines = ['', '=' * 60, header, '=' * 60]
    for thread_id, stack in sys._current_frames().items():
        thread_name = 'unknown'
        for t in threading.enumerate():
            if t.ident == thread_id:
                thread_name = t.name
                break
        lines.append(f'\nThread {thread_id} ({thread_name}):')
        lines.append(''.join(traceback.format_stack(stack)))
    lines.append('=' * 60 + '\n')
    output = '\n'.join(lines)
    print(output)
    try:
        THREAD_DUMP_DIR.mkdir(parents=True, exist_ok=True)
        fname = THREAD_DUMP_DIR / f'dump_{time.strftime("%Y%m%d_%H%M%S")}_{reason.replace(" ", "_").replace(":", "")[:40]}.txt'
        fname.write_text(output)
        dumps = sorted(THREAD_DUMP_DIR.glob('dump_*.txt'))
        for old in dumps[:-THREAD_DUMP_MAX_FILES]:
            try:
                old.unlink()
            except OSError:
                pass
    except Exception as ex:
        print(f'[THREAD DUMP] failed to write file: {ex}', file=sys.stderr)


def _thread_dump_handler(signum, frame):
    _thread_dump(reason=f'signal {signum}')


signal.signal(signal.SIGUSR1, _thread_dump_handler)


def _shutdown_handler(signum, frame):
    print(f'[SHUTDOWN] Received signal {signum}, saving state...')
    _save_state()
    print('[SHUTDOWN] State saved, exiting.')
    os._exit(0)


signal.signal(signal.SIGTERM, _shutdown_handler)
signal.signal(signal.SIGINT, _shutdown_handler)

CPU_CHECK_INTERVAL = 60
CPU_THRESHOLD_PERCENT = 30
CPU_ALERT_COOLDOWN = 300
MEM_LOG_INTERVAL_TICKS = 10
MEM_ALERT_THRESHOLD_MB = 300
MEM_ALERT_COOLDOWN = 1800
THREAD_KILL_THRESHOLD = 200
THREAD_DUMP_THRESHOLDS = (30, 60, 100, 150)
MEM_KILL_THRESHOLD_MB = 1500
WATCHDOG_NOTIFY_INTERVAL = 20


def _sd_notify(message):
    try:
        socket_path = os.environ.get('NOTIFY_SOCKET')
        if not socket_path:
            return
        if socket_path.startswith('@'):
            socket_path = '\0' + socket_path[1:]
        import socket as _socket
        sock = _socket.socket(_socket.AF_UNIX, _socket.SOCK_DGRAM)
        try:
            sock.connect(socket_path)
            sock.sendall(message.encode())
        finally:
            sock.close()
    except Exception:
        pass


def _read_rss_mb():
    try:
        with open('/proc/self/status') as f:
            for line in f:
                if line.startswith('VmRSS:'):
                    return int(line.split()[1]) / 1024
    except OSError:
        pass
    return 0


def _sd_notify_loop():
    while True:
        try:
            _sd_notify('WATCHDOG=1')
        except Exception as ex:
            print(f'[NOTIFY] error: {ex}', file=sys.stderr)
        time.sleep(WATCHDOG_NOTIFY_INTERVAL)


def _cpu_watchdog():
    import resource
    prev_cpu = resource.getrusage(resource.RUSAGE_SELF)
    prev_time = time.monotonic()
    last_alert = 0
    last_mem_alert = 0
    consecutive_high = 0
    tick = 0
    dumped_thresholds = set()
    while True:
        try:
            time.sleep(CPU_CHECK_INTERVAL)
            tick += 1
            now = time.monotonic()
            curr_cpu = resource.getrusage(resource.RUSAGE_SELF)
            dt = now - prev_time
            cpu_used = (curr_cpu.ru_utime - prev_cpu.ru_utime) + (curr_cpu.ru_stime - prev_cpu.ru_stime)
            cpu_percent = (cpu_used / dt) * 100 if dt > 0 else 0
            prev_cpu = curr_cpu
            prev_time = now
            rss_mb = _read_rss_mb()
            thread_count = threading.active_count()
            lock_acquired = vm_download_lock.acquire(timeout=5)
            if lock_acquired:
                try:
                    dl_active = sum(1 for d in vm_downloads.values() if d['status'] == 'downloading')
                    dl_uploading = sum(1 for d in vm_downloads.values() if d['status'] == 'uploading')
                    dl_total = len(vm_downloads)
                    dl_queued = len(vm_download_queue)
                finally:
                    vm_download_lock.release()
            else:
                print('[WATCHDOG] vm_download_lock contention >5s, skipping download stats', file=sys.stderr)
                dl_active = dl_uploading = dl_total = dl_queued = -1
            if tick % MEM_LOG_INTERVAL_TICKS == 0:
                print(f'[WATCHDOG] mem={rss_mb:.0f}MB threads={thread_count} dl_total={dl_total} active={dl_active} uploading={dl_uploading} queued={dl_queued} cpu={cpu_percent:.1f}%')
            for threshold in THREAD_DUMP_THRESHOLDS:
                if thread_count >= threshold and threshold not in dumped_thresholds:
                    print(f'[WATCHDOG] Thread count crossed {threshold} (now {thread_count}) - capturing dump')
                    _thread_dump(reason=f'watchdog: threads={thread_count}')
                    dumped_thresholds.add(threshold)
            if thread_count < THREAD_DUMP_THRESHOLDS[0]:
                dumped_thresholds.clear()
            if thread_count > THREAD_KILL_THRESHOLD or rss_mb > MEM_KILL_THRESHOLD_MB:
                print(f'[WATCHDOG] FATAL leak detected: threads={thread_count} mem={rss_mb:.0f}MB - dumping and exiting for systemd restart', file=sys.stderr)
                _thread_dump(reason=f'watchdog: KILL threads={thread_count} mem={rss_mb:.0f}MB')
                try:
                    _save_state()
                except Exception:
                    pass
                os._exit(1)
            if rss_mb > MEM_ALERT_THRESHOLD_MB and (now - last_mem_alert) > MEM_ALERT_COOLDOWN:
                print(f'[WATCHDOG] High memory: {rss_mb:.0f}MB threads={thread_count} dl_total={dl_total} active={dl_active} uploading={dl_uploading} queued={dl_queued}')
                _thread_dump(reason=f'watchdog: MEM {rss_mb:.0f}MB')
                last_mem_alert = now
            if cpu_percent > CPU_THRESHOLD_PERCENT:
                consecutive_high += 1
                if consecutive_high >= 3 and (now - last_alert) > CPU_ALERT_COOLDOWN:
                    print(f'[WATCHDOG] High CPU detected: {cpu_percent:.1f}% (>{CPU_THRESHOLD_PERCENT}% for {consecutive_high} checks)')
                    _thread_dump(reason=f'watchdog: CPU {cpu_percent:.1f}%')
                    last_alert = now
                    consecutive_high = 0
            else:
                consecutive_high = 0
        except Exception as ex:
            print(f'[WATCHDOG] crashed: {ex}', file=sys.stderr)
            traceback.print_exc()
            time.sleep(5)

def _generate_silence_mp3(duration_ms: int) -> bytes:
    """Generate silent MP3 frames matching Edge-TTS output format.
    MPEG2 Layer3 48kbps 24000Hz mono: frame size = 288 bytes, duration = 24ms."""
    SILENT_FRAME = b'\xff\xf3\x44\x00' + b'\x00' * 284
    frames_needed = max(1, int(duration_ms / 24) + 1)
    return SILENT_FRAME * frames_needed

TTS_CACHE_DIR = Path(tempfile.gettempdir()) / "tts_cache"
TTS_CACHE_DIR.mkdir(exist_ok=True)

AZURE_SPEECH_KEY = None
AZURE_SPEECH_REGION = None

def load_azure_config():
    global AZURE_SPEECH_KEY, AZURE_SPEECH_REGION
    script_dir = Path(__file__).parent
    candidates = [script_dir / ".azure_speech", Path.home() / ".azure_speech"]
    AZURE_CONFIG_FILE = None
    for c in candidates:
        if c.exists():
            AZURE_CONFIG_FILE = c
            break
    if AZURE_CONFIG_FILE:
        try:
            config = json.loads(AZURE_CONFIG_FILE.read_text())
            AZURE_SPEECH_KEY = config.get('key')
            AZURE_SPEECH_REGION = config.get('region')
            if AZURE_SPEECH_KEY and AZURE_SPEECH_REGION:
                print(f'[Azure] Loaded config: region={AZURE_SPEECH_REGION}')
                return True
        except Exception as ex:
            print(f'[Azure] Failed to load config: {ex}', file=sys.stderr)
    return False

MAX_CACHE_SIZE_MB = 500
MAX_CACHE_AGE_DAYS = 30

VOICES_CACHE = None
VOICES_CACHE_FILE = TTS_CACHE_DIR / "voices_cache.json"

TEMP_DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "iptv-downloads"
TEMP_DOWNLOAD_DIR.mkdir(exist_ok=True)
FREEBOX_APP_ID = 'org.nicefree.iptv'
FREEBOX_TRANSFER_TIMEOUT = 3600

vm_downloads = {}
vm_download_counter = 0
vm_download_lock = threading.Lock()
vm_download_queue = []
vm_provider_limits = {}
STATE_FILE = TEMP_DOWNLOAD_DIR / 'state.json'

def _save_state():
    try:
        with vm_download_lock:
            entries = []
            for dl in vm_downloads.values():
                entries.append({
                    'id': dl['id'],
                    'name': dl['name'],
                    'status': dl['status'],
                    'rx_bytes': dl['rx_bytes'],
                    'size': dl['size'],
                    '_filepath': dl.get('_filepath', ''),
                    '_host': dl.get('_host', ''),
                    '_url': dl.get('_url', ''),
                    '_freebox_host': dl.get('_freebox_host', ''),
                    '_freebox_app_token': dl.get('_freebox_app_token', ''),
                })
            queue = [(dl_id, url, str(fp), fn) for dl_id, url, fp, fn in vm_download_queue]
            state = {
                'counter': vm_download_counter,
                'downloads': entries,
                'queue': queue,
                'provider_limits': vm_provider_limits,
            }
        tmp = STATE_FILE.with_suffix('.tmp')
        tmp.write_text(json.dumps(state))
        tmp.replace(STATE_FILE)
    except Exception as ex:
        print(f'[DL] Failed to save state: {ex}', file=sys.stderr)

def _load_and_resume_state():
    global vm_download_counter, vm_downloads, vm_download_queue, vm_provider_limits
    if not STATE_FILE.exists():
        for f in TEMP_DOWNLOAD_DIR.glob('dl_*'):
            try:
                f.unlink()
                print(f'[DL] Cleaned up orphan temp file: {f.name}')
            except OSError:
                pass
        return
    try:
        state = json.loads(STATE_FILE.read_text())
    except Exception:
        return
    vm_download_counter = state.get('counter', 0)
    vm_provider_limits = state.get('provider_limits', {})
    tracked_files = set()
    resumed_count = 0
    for entry in state.get('downloads', []):
        dl_id = entry['id']
        filepath = Path(entry['_filepath']) if entry.get('_filepath') else None
        status = entry['status']
        if status in ('downloading', 'queued'):
            entry['status'] = 'queued'
            existing_bytes = 0
            if filepath and filepath.exists():
                existing_bytes = filepath.stat().st_size
            entry['rx_bytes'] = existing_bytes
            entry['rx_rate'] = 0
            entry['_proc'] = None
            vm_downloads[dl_id] = entry
            if entry.get('_url') and filepath:
                tracked_files.add(filepath)
                vm_download_queue.append((dl_id, entry['_url'], filepath, entry['name']))
                print(f'[DL] Resuming queued: #{dl_id} {entry["name"]} (existing={existing_bytes} bytes)')
                resumed_count += 1
        elif status == 'uploading':
            if filepath and filepath.exists():
                entry['rx_bytes'] = 0
                entry['rx_rate'] = 0
                entry['_proc'] = None
                vm_downloads[dl_id] = entry
                tracked_files.add(filepath)
                print(f'[DL] Resuming Freebox transfer: #{dl_id} {entry["name"]}')
                resumed_count += 1
                thread = threading.Thread(
                    target=_freebox_transfer,
                    args=(dl_id, filepath, entry['name'], entry),
                    daemon=True
                )
                thread.start()
            else:
                print(f'[DL] Temp file missing, skipping: #{dl_id} {entry["name"]}')
        elif status == 'error':
            entry['rx_rate'] = 0
            entry['_proc'] = None
            vm_downloads[dl_id] = entry
    for dl_id, url, fp_str, fn in state.get('queue', []):
        if dl_id not in vm_downloads:
            continue
        already_queued = any(q[0] == dl_id for q in vm_download_queue)
        if not already_queued:
            vm_download_queue.append((dl_id, url, Path(fp_str), fn))
    for f in TEMP_DOWNLOAD_DIR.glob('dl_*'):
        if f not in tracked_files and f != STATE_FILE:
            try:
                f.unlink()
                print(f'[DL] Cleaned up orphan temp file: {f.name}')
            except OSError:
                pass
    if vm_download_queue:
        thread = threading.Thread(target=_process_download_queue, daemon=True)
        thread.start()
    if resumed_count:
        print(f'[DL] Resumed {resumed_count} downloads from saved state')
    try:
        STATE_FILE.unlink()
    except OSError:
        pass

def _freebox_api(host, method, path, data=None, session_token=None):
    url = f'http://{host}{path}'
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    if session_token:
        req.add_header('X-Fbx-App-Auth', session_token)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())

def _freebox_get_challenge(host):
    result = _freebox_api(host, 'GET', '/api/v4/login/')
    return result['result']['challenge']

def _freebox_open_session(host, app_token):
    challenge = _freebox_get_challenge(host)
    password = hmac.new(app_token.encode(), challenge.encode(), hashlib.sha1).hexdigest()
    result = _freebox_api(host, 'POST', '/api/v4/login/session/', {
        'app_id': FREEBOX_APP_ID,
        'password': password,
    })
    if not result.get('success'):
        raise Exception(f"Freebox auth failed: {result.get('msg', 'unknown')}")
    return result['result']['session_token']

FREEBOX_WS_CHUNK_SIZE = 512 * 1024  # 512 KB (Freebox doc example size)

def _freebox_ws_upload(host, session_token, filepath, filename, entry, dl_id):
    import websocket
    dirname = base64.b64encode('/USB4/Téléchargements/'.encode('utf-8')).decode()
    file_size = filepath.stat().st_size
    ws_url = f'ws://{host}/api/v4/ws/upload'
    ws = websocket.create_connection(ws_url, timeout=60, header=[f'X-Fbx-App-Auth: {session_token}'])
    try:
        start_msg = json.dumps({
            'action': 'upload_start',
            'dirname': dirname,
            'filename': filename,
            'size': file_size,
            'force': 'overwrite',
        })
        ws.send(start_msg)
        resp = json.loads(ws.recv())
        if not resp.get('success', True) if 'success' in resp else False:
            raise Exception(f"Upload start failed: {resp}")
        print(f'[DL] Freebox WS upload started: {filename} ({file_size} bytes)')
        sent = 0
        t0 = time.time()
        with open(filepath, 'rb') as f:
            while True:
                with vm_download_lock:
                    if entry.get('status') == 'stopped':
                        ws.send(json.dumps({'action': 'upload_cancel'}))
                        return False
                chunk = f.read(FREEBOX_WS_CHUNK_SIZE)
                if not chunk:
                    break
                ws.send_binary(chunk)
                sent += len(chunk)
                with vm_download_lock:
                    entry['rx_bytes'] = sent
                    entry['size'] = file_size
        elapsed = time.time() - t0
        speed_mb = (sent / 1048576) / elapsed if elapsed > 0 else 0
        print(f'[DL] Freebox WS upload sent {sent} bytes in {elapsed:.1f}s ({speed_mb:.1f} MB/s), finalizing...')
        ws.settimeout(0.1)
        try:
            while True:
                ws.recv()
        except Exception:
            pass
        ws.settimeout(300)
        ws.send(json.dumps({'action': 'upload_finalize'}))
        resp_data = ws.recv()
        resp = json.loads(resp_data) if isinstance(resp_data, str) else json.loads(resp_data.decode())
        complete = resp.get('complete', False)
        cancelled = resp.get('cancelled', False)
        if cancelled:
            print(f'[DL] Freebox upload cancelled: {filename}')
            return False
        print(f'[DL] Freebox upload completed: {filename} ({sent} bytes)')
        return True
    finally:
        ws.close()

def _cleanup_temp(dl_id, filepath):
    try:
        if filepath.exists():
            filepath.unlink()
            print(f'[DL] Temp file removed: {filepath.name}')
    except OSError:
        pass
    with vm_download_lock:
        vm_downloads.pop(dl_id, None)
    _save_state()

def _freebox_transfer(dl_id, filepath, filename, entry):
    freebox_host = entry.get('_freebox_host', 'mafreebox.freebox.fr')
    app_token = entry.get('_freebox_app_token', '')
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            session_token = _freebox_open_session(freebox_host, app_token)
            success = _freebox_ws_upload(freebox_host, session_token, filepath, filename, entry, dl_id)
            if success:
                _cleanup_temp(dl_id, filepath)
                return
            _cleanup_temp(dl_id, filepath)
            return
        except Exception as ex:
            print(f'[DL] Freebox transfer error (attempt {attempt}/{max_retries}): {ex}', file=sys.stderr)
            if attempt < max_retries:
                time.sleep(10)
            else:
                with vm_download_lock:
                    entry['status'] = 'error'
                _save_state()

def _get_provider_host(url):
    return urlparse(url).hostname or 'unknown'

def _get_active_count_for_host(host):
    return sum(1 for d in vm_downloads.values() if d['status'] == 'downloading' and d.get('_host') == host)

def _process_download_queue():
    while True:
        launched = False
        with vm_download_lock:
            for i, (dl_id, url, filepath, filename) in enumerate(vm_download_queue):
                host = _get_provider_host(url)
                max_conn = vm_provider_limits.get(host, 1)
                if _get_active_count_for_host(host) < max_conn:
                    vm_download_queue.pop(i)
                    vm_downloads[dl_id]['status'] = 'downloading'
                    launched = True
                    break
        if launched:
            _run_download(dl_id, url, filepath, filename)
        else:
            return

def _download_worker(dl_id, url, filepath, filename):
    _run_download(dl_id, url, filepath, filename)
    _process_download_queue()

MAX_RETRIES = 5
RETRY_DELAY = 10

def _run_download(dl_id, url, filepath, filename):
    entry = vm_downloads[dl_id]
    size = 0
    try:
        head_result = subprocess.run(
            ['curl', '-4', '-sS', '-L', '-i', '-r', '0-0', '--', url],
            capture_output=True, timeout=30
        )
        for line in head_result.stdout.decode('utf-8', errors='ignore').split('\r\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                key_lower = key.strip().lower()
                if key_lower == 'content-range':
                    match = re.search(r'/(\d+)', value)
                    if match:
                        size = int(match.group(1))
                elif key_lower == 'content-length' and size == 0:
                    size = int(value.strip())
    except Exception:
        pass
    with vm_download_lock:
        if entry['status'] == 'stopped':
            return
        entry['size'] = size
        entry['status'] = 'downloading'
    for attempt in range(MAX_RETRIES + 1):
        with vm_download_lock:
            if entry['status'] == 'stopped':
                return
        cmd = ['curl', '-4', '-sS', '-L', '-o', str(filepath), '--', url]
        if filepath.exists() and filepath.stat().st_size > 0:
            cmd = ['curl', '-4', '-sS', '-L', '-C', '-', '-o', str(filepath), '--', url]
            if attempt > 0:
                print(f'[DL] Retry {attempt}/{MAX_RETRIES}: {filename}')
            else:
                print(f'[DL] Resuming {filename} from {filepath.stat().st_size} bytes')
        elif attempt > 0:
            print(f'[DL] Retry {attempt}/{MAX_RETRIES}: {filename}')
        proc = subprocess.Popen(cmd)
        with vm_download_lock:
            entry['_proc'] = proc
        prev_bytes = 0
        prev_time = time.time()
        while proc.poll() is None:
            time.sleep(1)
            try:
                current_bytes = filepath.stat().st_size
            except OSError:
                current_bytes = 0
            now = time.time()
            dt = now - prev_time
            rate = int((current_bytes - prev_bytes) / dt) if dt > 0 else 0
            with vm_download_lock:
                entry['rx_bytes'] = current_bytes
                entry['rx_rate'] = rate
            prev_bytes = current_bytes
            prev_time = now
        retcode = proc.returncode
        if retcode == 0:
            break
        if attempt < MAX_RETRIES:
            with vm_download_lock:
                if entry['status'] == 'stopped':
                    return
                entry['rx_rate'] = 0
            time.sleep(RETRY_DELAY)
    try:
        final_bytes = filepath.stat().st_size
    except OSError:
        final_bytes = 0
    with vm_download_lock:
        if retcode == 0:
            has_freebox = bool(entry.get('_freebox_app_token'))
            if has_freebox:
                entry['status'] = 'uploading'
                entry['rx_bytes'] = 0
                entry['rx_rate'] = 0
                entry['size'] = final_bytes
                entry['_proc'] = None
                print(f'[DL] Downloaded to temp: {filename} ({final_bytes} bytes)')
            else:
                del vm_downloads[dl_id]
                print(f'[DL] Completed: {filename} ({final_bytes} bytes)')
        else:
            entry['rx_bytes'] = final_bytes
            entry['rx_rate'] = 0
            entry['_proc'] = None
            entry['status'] = 'error'
            print(f'[DL] Error after {MAX_RETRIES} retries (rc={retcode}): {filename}', file=sys.stderr)
            _save_state()
            return
    _save_state()
    if retcode == 0 and has_freebox:
        thread = threading.Thread(target=_freebox_transfer, args=(dl_id, filepath, filename, entry), daemon=True)
        thread.start()

COUNTRY_NAMES = {
    'AF': 'Afghanistan', 'AL': 'Albanie', 'DZ': 'Algérie', 'AR': 'Argentine',
    'AM': 'Arménie', 'AU': 'Australie', 'AT': 'Autriche', 'AZ': 'Azerbaïdjan',
    'BH': 'Bahreïn', 'BD': 'Bangladesh', 'BE': 'Belgique', 'BA': 'Bosnie',
    'BR': 'Brésil', 'BG': 'Bulgarie', 'MM': 'Birmanie', 'CA': 'Canada',
    'CL': 'Chili', 'CN': 'Chine', 'CO': 'Colombie', 'HR': 'Croatie',
    'CY': 'Chypre', 'CZ': 'Tchéquie', 'DK': 'Danemark', 'EC': 'Équateur',
    'EG': 'Égypte', 'EE': 'Estonie', 'ET': 'Éthiopie', 'FI': 'Finlande',
    'FR': 'France', 'GE': 'Géorgie', 'DE': 'Allemagne', 'GH': 'Ghana',
    'GR': 'Grèce', 'HK': 'Hong Kong', 'HU': 'Hongrie', 'IS': 'Islande',
    'IN': 'Inde', 'ID': 'Indonésie', 'IQ': 'Irak', 'IE': 'Irlande',
    'IL': 'Israël', 'IT': 'Italie', 'JP': 'Japon', 'JO': 'Jordanie',
    'KZ': 'Kazakhstan', 'KE': 'Kenya', 'KR': 'Corée du Sud', 'KW': 'Koweït',
    'LV': 'Lettonie', 'LB': 'Liban', 'LY': 'Libye', 'LT': 'Lituanie',
    'MK': 'Macédoine', 'MY': 'Malaisie', 'ML': 'Mali', 'MT': 'Malte',
    'MX': 'Mexique', 'MA': 'Maroc', 'NL': 'Pays-Bas', 'NZ': 'Nouvelle-Zélande',
    'NG': 'Nigeria', 'NO': 'Norvège', 'OM': 'Oman', 'PK': 'Pakistan',
    'PE': 'Pérou', 'PH': 'Philippines', 'PL': 'Pologne', 'PT': 'Portugal',
    'QA': 'Qatar', 'RO': 'Roumanie', 'RU': 'Russie', 'SA': 'Arabie Saoudite',
    'RS': 'Serbie', 'SG': 'Singapour', 'SK': 'Slovaquie', 'SI': 'Slovénie',
    'ZA': 'Afrique du Sud', 'ES': 'Espagne', 'LK': 'Sri Lanka', 'SE': 'Suède',
    'CH': 'Suisse', 'SY': 'Syrie', 'TW': 'Taïwan', 'TZ': 'Tanzanie',
    'TH': 'Thaïlande', 'TN': 'Tunisie', 'TR': 'Turquie', 'UA': 'Ukraine',
    'AE': 'Émirats', 'GB': 'Royaume-Uni', 'US': 'États-Unis',
    'UZ': 'Ouzbékistan', 'VE': 'Venezuela', 'VN': 'Vietnam', 'YE': 'Yémen',
}

def cleanup_cache():
    now = time.time()
    max_age = MAX_CACHE_AGE_DAYS * 24 * 3600
    files = []
    total_size = 0
    for f in TTS_CACHE_DIR.glob("*.mp3"):
        try:
            stat = f.stat()
            age = now - stat.st_mtime
            if age > max_age:
                f.unlink()
            else:
                files.append((f, stat.st_mtime, stat.st_size))
                total_size += stat.st_size
        except:
            pass
    max_size = MAX_CACHE_SIZE_MB * 1024 * 1024
    if total_size > max_size:
        files.sort(key=lambda x: x[1])
        while total_size > max_size * 0.8 and files:
            f, _, size = files.pop(0)
            try:
                f.unlink()
                total_size -= size
            except:
                pass

async def fetch_voices():
    global VOICES_CACHE
    if VOICES_CACHE:
        return VOICES_CACHE
    if VOICES_CACHE_FILE.exists():
        try:
            VOICES_CACHE = json.loads(VOICES_CACHE_FILE.read_text())
            return VOICES_CACHE
        except:
            pass
    import edge_tts
    voices = await edge_tts.list_voices()
    voices_by_lang = {}
    for v in voices:
        locale = v['Locale']
        lang = locale.split('-')[0]
        country = locale.split('-')[1] if '-' in locale else ''
        if lang not in voices_by_lang:
            voices_by_lang[lang] = []
        name = v['ShortName'].split('-')[-1].replace('Neural', '')
        gender = 'F' if v['Gender'] == 'Female' else 'M'
        styles = v.get('StyleList', [])
        voice_data = {
            'id': v['ShortName'],
            'name': name,
            'gender': gender,
            'country': country,
            'locale': locale,
        }
        if styles:
            voice_data['styles'] = styles
        voices_by_lang[lang].append(voice_data)
    for lang in voices_by_lang:
        voices_by_lang[lang].sort(key=lambda x: ('Multilingual' in x['name'], x['country'], x['name']))
    VOICES_CACHE = voices_by_lang
    try:
        VOICES_CACHE_FILE.write_text(json.dumps(voices_by_lang))
    except:
        pass
    return voices_by_lang

def get_voices_sync():
    return asyncio.run(fetch_voices())

def get_default_voice(lang: str) -> str:
    voices = get_voices_sync()
    lang_voices = voices.get(lang, voices.get('en', []))
    return lang_voices[0]['id'] if lang_voices else 'en-US-JennyNeural'

def _validate_tts_param(value):
    if value is None:
        return True
    return bool(TTS_PARAM_PATTERN.match(value))


def generate_tts_azure(text: str, lang: str = "fr", voice: str = None, rate: str = None, volume: str = None, pitch: str = None) -> bytes:
    import azure.cognitiveservices.speech as speechsdk
    if not voice:
        locale = lang if '-' in lang else f"{lang}-{lang.upper()}"
        voice = f"{locale}-RemyMultilingualNeural" if lang == "fr" else f"{locale}-JennyMultilingualNeural"
    locale = '-'.join(voice.split('-')[:2])
    safe_text = xml.sax.saxutils.escape(text, {'"': '&quot;', "'": '&apos;'})
    rate_attr = f' rate="{xml.sax.saxutils.escape(rate)}"' if rate else ''
    volume_attr = f' volume="{xml.sax.saxutils.escape(volume)}"' if volume else ''
    pitch_attr = f' pitch="{xml.sax.saxutils.escape(pitch)}"' if pitch else ''
    prosody_attrs = rate_attr + volume_attr + pitch_attr
    if prosody_attrs:
        text_block = f'<prosody{prosody_attrs}>{safe_text}</prosody>'
    else:
        text_block = safe_text
    ssml = (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{locale}">'
        f'<voice name="{voice}">'
        f'<lang xml:lang="{locale}">{text_block}</lang>'
        f'</voice></speak>'
    )
    speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
    speech_config.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3)
    synth = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
    result = synth.speak_ssml_async(ssml).get()
    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        return result.audio_data
    cancellation = result.cancellation_details
    raise Exception(f"Azure TTS failed: {cancellation.reason} - {cancellation.error_details}")

_cleanup_counter = 0

async def generate_tts(text: str, lang: str = "fr", voice: str = None, rate: str = None, volume: str = None, pitch: str = None, engine: str = None) -> bytes:
    global _cleanup_counter
    import edge_tts
    if not voice:
        voices = await fetch_voices()
        lang_voices = voices.get(lang, voices.get('en', []))
        voice = lang_voices[0]['id'] if lang_voices else 'en-US-JennyNeural'
    use_azure = engine == 'azure' and AZURE_SPEECH_KEY and AZURE_SPEECH_REGION
    cache_key = hashlib.md5(f"{'azure' if use_azure else 'edge'}:{voice}:{rate}:{volume}:{pitch}:{text}".encode()).hexdigest()
    cache_file = TTS_CACHE_DIR / f"{cache_key}.mp3"
    if cache_file.exists():
        return cache_file.read_bytes()
    tts_text = re.sub(r'\b([A-Z])\.\s*', r'\1 ', text)
    audio_data = None
    if use_azure:
        try:
            audio_data = generate_tts_azure(tts_text, lang, voice, rate, volume, pitch)
            print(f'[TTS] Azure generated {len(audio_data)} bytes')
        except Exception as ex:
            print(f'[TTS] Azure failed, falling back to Edge-TTS: {ex}', file=sys.stderr)
    if not audio_data:
        kwargs = {}
        if rate:
            kwargs['rate'] = rate
        if volume:
            kwargs['volume'] = volume
        if pitch:
            kwargs['pitch'] = pitch
        communicate = edge_tts.Communicate(tts_text, voice, **kwargs)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
    if audio_data:
        cache_file.write_bytes(audio_data)
        _cleanup_counter += 1
        if _cleanup_counter >= 100:
            _cleanup_counter = 0
            cleanup_cache()
    return audio_data

class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 300
    close_connection = True

    def setup(self):
        super().setup()
        self.connection.settimeout(self.timeout)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/tts":
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        params = parse_qs(parsed.query)
        url = params.get("url", [None])[0]
        if not url:
            self.send_error(400, "Missing url parameter")
            return
        if not _validate_url(url):
            self.send_error(403, "URL not allowed")
            return
        cmd = ["curl", "-4", "-sS", "-L", "-i", "-r", "0-0", "--", url]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            headers = {}
            status_code = 200
            content_length = None
            for line in result.stdout.decode("utf-8", errors="ignore").split("\r\n"):
                if line.startswith("HTTP/"):
                    parts = line.split()
                    if len(parts) >= 2:
                        code = int(parts[1])
                        if code == 206:
                            status_code = 200
                        elif code < 400:
                            status_code = code
                elif ":" in line:
                    key, value = line.split(":", 1)
                    key_lower = key.strip().lower()
                    headers[key_lower] = value.strip()
                    if key_lower == "content-range":
                        match = re.search(r'/(\d+)', value)
                        if match:
                            content_length = match.group(1)
            self.send_response(status_code)
            if content_length:
                self.send_header("Content-Length", content_length)
            elif "content-length" in headers:
                self.send_header("Content-Length", headers["content-length"])
            if "content-type" in headers:
                self.send_header("Content-Type", headers["content-type"])
            elif ".mkv" in url:
                self.send_header("Content-Type", "video/x-matroska")
            elif ".mp4" in url:
                self.send_header("Content-Type", "video/mp4")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
        except Exception as e:
            self.send_error(500, str(e))

    def _is_private_request(self):
        if self.headers.get('CF-Connecting-IP'):
            return False
        client_ip = self.client_address[0]
        try:
            addr = ipaddress.ip_address(client_ip)
            return any(addr in net for net in PRIVATE_NETWORKS)
        except ValueError:
            return False

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/tts':
            self._handle_tts(parsed)
            return

        if parsed.path == '/voices':
            self._handle_voices(parsed)
            return

        # Block non-TTS routes from public (Cloudflare tunnel)
        if not self._is_private_request():
            self.send_error(403, 'Public access restricted to TTS only')
            return

        if parsed.path == '/download':
            self._handle_download(parsed)
            return

        if parsed.path == '/downloads':
            self._handle_downloads()
            return

        if parsed.path == '/download/cancel':
            self._handle_download_cancel(parsed)
            return

        if parsed.path == '/status':
            self._handle_status()
            return

        params = parse_qs(parsed.query)
        url = params.get('url', [None])[0]
        transcode = params.get('transcode', [None])[0]

        if not url:
            self.send_error(400, 'Missing url parameter')
            return

        if not _validate_url(url):
            self.send_error(403, 'URL not allowed')
            return

        range_header = self.headers.get('Range', '')
        is_live = '.ts' in url or '/live/' in url

        if transcode == 'mp4' and is_live:
            self._transcode_stream(url)
            return

        cmd = ['curl', '-4', '-sS', '-L', '-i']
        if range_header:
            cmd.extend(['-H', f'Range: {range_header}'])
        cmd.extend(['--', url])

        proc = None
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

            status_code = 200
            headers = {}
            buffer = b''
            remaining = b''

            while True:
                chunk = proc.stdout.read(4096)
                if not chunk:
                    break
                buffer += chunk
                separator_pos = buffer.find(b'\r\n\r\n')
                if separator_pos == -1:
                    continue

                header_bytes = buffer[:separator_pos + 4]
                remaining = buffer[separator_pos + 4:]

                header_text = header_bytes.decode('utf-8', errors='ignore')
                current_status = None
                current_headers = {}

                for line in header_text.split('\r\n'):
                    if line.startswith('HTTP/'):
                        parts = line.split()
                        if len(parts) >= 2:
                            current_status = int(parts[1])
                    elif ':' in line:
                        key, value = line.split(':', 1)
                        current_headers[key.strip().lower()] = value.strip()

                if current_status:
                    status_code = current_status
                    headers = current_headers

                if current_status and current_status < 300 or current_status >= 400:
                    break
                buffer = remaining

            self.send_response(status_code)

            if 'content-range' in headers:
                self.send_header('Content-Range', headers['content-range'])
            if 'content-length' in headers:
                self.send_header('Content-Length', headers['content-length'])
            else:
                self.send_header('Connection', 'close')

            if is_live:
                self.send_header('Content-Type', 'video/mp2t')
            elif '.mkv' in url:
                self.send_header('Content-Type', 'video/x-matroska')
            elif '.mp4' in url:
                self.send_header('Content-Type', 'video/mp4')
            elif 'content-type' in headers:
                self.send_header('Content-Type', headers['content-type'])
            else:
                self.send_header('Content-Type', 'application/octet-stream')

            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Access-Control-Allow-Origin', '*')
            content_type = headers.get('content-type', '')
            if content_type.startswith('image/') or any(url.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()

            if remaining:
                try:
                    self.wfile.write(remaining)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    return
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break
        except Exception as e:
            print(f'Error: {e}', file=sys.stderr)
        finally:
            if proc is not None:
                try:
                    proc.terminate()
                    proc.wait(timeout=5)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass

    def _handle_tts(self, parsed):
        params = parse_qs(parsed.query)
        text = params.get('text', [''])[0]
        lang = params.get('lang', ['fr'])[0]
        voice = params.get('voice', [None])[0]
        rate = params.get('rate', [None])[0]
        volume = params.get('volume', [None])[0]
        pitch = params.get('pitch', [None])[0]
        engine = params.get('engine', [None])[0]

        pad_ms = int(params.get('pad', [0])[0])

        if not text:
            self.send_error(400, "Missing 'text' parameter")
            return

        if len(text) > MAX_TTS_TEXT_LENGTH:
            self.send_error(400, f"Text too long (max {MAX_TTS_TEXT_LENGTH} characters)")
            return

        for param_name, param_value in [('voice', voice), ('rate', rate), ('volume', volume), ('pitch', pitch)]:
            if not _validate_tts_param(param_value):
                self.send_error(400, f"Invalid {param_name} parameter")
                return

        try:
            audio = asyncio.run(generate_tts(text, lang, voice, rate, volume, pitch, engine))
            if pad_ms > 0:
                audio = _generate_silence_mp3(pad_ms) + audio
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', len(audio))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(audio)
            print(f'[TTS] Generated {len(audio)} bytes for lang={lang} voice={voice} engine={engine or "edge"}')
        except Exception as e:
            print(f'[TTS] Error: {e}', file=sys.stderr)
            self.send_error(500, str(e))

    def _handle_voices(self, parsed):
        params = parse_qs(parsed.query)
        lang = params.get('lang', [None])[0]
        try:
            voices = get_voices_sync()
            if lang:
                lang_code = lang.split('-')[0]
                lang_voices = voices.get(lang_code, [])
                result = {
                    'lang': lang_code,
                    'voices': lang_voices,
                    'countries': COUNTRY_NAMES
                }
            else:
                result = {
                    'voices': voices,
                    'countries': COUNTRY_NAMES
                }
            response = json.dumps(result).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(response))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response)
        except Exception as e:
            print(f'[VOICES] Error: {e}', file=sys.stderr)
            self.send_error(500, str(e))

    def _handle_download(self, parsed):
        global vm_download_counter
        params = parse_qs(parsed.query)
        url = params.get('url', [None])[0]
        filename = params.get('filename', [None])[0]
        max_conn = params.get('max', [None])[0]
        freebox_host = params.get('freebox_host', [None])[0]
        freebox_app_token = params.get('freebox_app_token', [None])[0]
        vm_host = params.get('vm_host', [None])[0]
        if not url or not filename:
            self._send_json({'success': False, 'msg': 'Missing url or filename parameter'})
            return
        if not _validate_url(url):
            self._send_json({'success': False, 'msg': 'URL not allowed'})
            return
        host = _get_provider_host(url)
        if max_conn:
            try:
                vm_provider_limits[host] = int(max_conn)
            except ValueError:
                self._send_json({'success': False, 'msg': 'Invalid max parameter'})
                return
        should_queue = False
        with vm_download_lock:
            vm_download_counter += 1
            dl_id = vm_download_counter
            filepath = TEMP_DOWNLOAD_DIR / f'dl_{dl_id}_{filename}'
            limit = vm_provider_limits.get(host, 1)
            active = _get_active_count_for_host(host)
            should_queue = active >= limit
            entry = {
                'id': dl_id,
                'name': filename,
                'status': 'queued' if should_queue else 'downloading',
                'rx_bytes': 0,
                'size': 0,
                'rx_rate': 0,
                '_proc': None,
                '_filepath': str(filepath),
                '_host': host,
                '_url': url,
            }
            if freebox_app_token:
                entry['_freebox_host'] = freebox_host or 'mafreebox.freebox.fr'
                entry['_freebox_app_token'] = freebox_app_token
            vm_downloads[dl_id] = entry
            if should_queue:
                vm_download_queue.append((dl_id, url, filepath, filename))
        _save_state()
        if should_queue:
            print(f'[DL] Queued #{dl_id}: {filename} (host={host} active={active} max={limit})')
        else:
            thread = threading.Thread(target=_download_worker, args=(dl_id, url, filepath, filename), daemon=True)
            thread.start()
            print(f'[DL] Started #{dl_id}: {filename} (host={host})')
        self._send_json({'success': True, 'result': {'id': dl_id}})

    def _handle_downloads(self):
        with vm_download_lock:
            result = []
            for dl in vm_downloads.values():
                result.append({
                    'id': dl['id'],
                    'name': dl['name'],
                    'status': dl['status'],
                    'rx_bytes': dl['rx_bytes'],
                    'size': dl['size'],
                    'rx_rate': dl['rx_rate'],
                })
        self._send_json({'success': True, 'result': result})

    def _handle_download_cancel(self, parsed):
        params = parse_qs(parsed.query)
        dl_id_str = params.get('id', [None])[0]
        if not dl_id_str:
            self._send_json({'success': False, 'msg': 'Missing id parameter'})
            return
        try:
            dl_id = int(dl_id_str)
        except ValueError:
            self._send_json({'success': False, 'msg': 'Invalid id parameter'})
            return
        with vm_download_lock:
            entry = vm_downloads.get(dl_id)
            if not entry:
                self._send_json({'success': False, 'msg': 'Download not found'})
                return
            was_uploading = entry.get('status') == 'uploading'
            proc = entry.get('_proc')
            was_active = proc is not None
            if proc:
                try:
                    proc.kill()
                except OSError:
                    pass
            if was_uploading:
                entry['status'] = 'stopped'
            else:
                if was_active:
                    filepath = Path(entry['_filepath'])
                    if filepath.exists():
                        try:
                            filepath.unlink()
                        except OSError:
                            pass
                vm_download_queue[:] = [(did, u, fp, fn) for did, u, fp, fn in vm_download_queue if did != dl_id]
                del vm_downloads[dl_id]
        print(f'[DL] Cancelled #{dl_id}')
        _save_state()
        self._send_json({'success': True})

    def _handle_status(self):
        threads = []
        for t in threading.enumerate():
            stack = sys._current_frames().get(t.ident)
            frames = traceback.format_stack(stack) if stack else []
            top_frame = frames[-1].strip() if frames else ''
            threads.append({
                'name': t.name,
                'daemon': t.daemon,
                'top_frame': top_frame,
            })
        import resource
        rusage = resource.getrusage(resource.RUSAGE_SELF)
        with vm_download_lock:
            active_downloads = sum(1 for d in vm_downloads.values() if d['status'] == 'downloading')
            queued_downloads = len(vm_download_queue)
        status = {
            'uptime_seconds': int(time.time() - _start_time),
            'threads': len(threads),
            'thread_details': threads,
            'active_downloads': active_downloads,
            'queued_downloads': queued_downloads,
            'cpu_user_seconds': round(rusage.ru_utime, 1),
            'cpu_system_seconds': round(rusage.ru_stime, 1),
            'max_rss_mb': round(rusage.ru_maxrss / 1024, 1),
        }
        self._send_json(status)

    def _send_json(self, data):
        response = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(response))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(response)

    def _transcode_stream(self, url):
        if not _validate_url(url):
            self.send_error(403, 'URL not allowed')
            return
        cmd = [
            'ffmpeg', '-i', url,
            '-c:v', 'copy', '-c:a', 'aac',
            '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+faststart',
            '-'
        ]
        proc = None
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            self.send_response(200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break
        except Exception as e:
            print(f'Transcode error: {e}', file=sys.stderr)
        finally:
            if proc is not None:
                try:
                    proc.terminate()
                    proc.wait(timeout=5)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass

    def log_message(self, format, *args):
        print(f'[PROXY] {args[0]}')

if __name__ == '__main__':
    _start_time = time.time()
    load_azure_config()
    notify_thread = threading.Thread(target=_sd_notify_loop, name='sd-notify', daemon=True)
    notify_thread.start()
    _sd_notify('READY=1')
    _load_and_resume_state()
    print('Cleaning up old TTS cache...')
    cleanup_cache()
    print('Fetching available voices from Microsoft...')
    voices = get_voices_sync()
    print(f'Available TTS languages: {", ".join(sorted(voices.keys()))}')
    print(f'Total voices: {sum(len(v) for v in voices.values())}')
    watchdog = threading.Thread(target=_cpu_watchdog, name='cpu-watchdog', daemon=True)
    watchdog.start()
    server = ThreadingHTTPServer(('0.0.0.0', 8889), ProxyHandler)
    server.daemon_threads = True
    server.request_queue_size = 64
    print(f'Stream proxy with TTS running on port 8889')
    print(f'TTS cache: {TTS_CACHE_DIR} (max {MAX_CACHE_SIZE_MB}MB, {MAX_CACHE_AGE_DAYS} days)')
    server.serve_forever()

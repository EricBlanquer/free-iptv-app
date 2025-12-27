#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import subprocess
import sys
import asyncio
import hashlib
import json
import tempfile
import time
import re
from pathlib import Path

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

def generate_tts_azure(text: str, lang: str = "fr", voice: str = None, rate: str = None, volume: str = None, pitch: str = None) -> bytes:
    import azure.cognitiveservices.speech as speechsdk
    if not voice:
        locale = lang if '-' in lang else f"{lang}-{lang.upper()}"
        voice = f"{locale}-RemyMultilingualNeural" if lang == "fr" else f"{locale}-JennyMultilingualNeural"
    locale = '-'.join(voice.split('-')[:2])
    rate_attr = f' rate="{rate}"' if rate else ''
    volume_attr = f' volume="{volume}"' if volume else ''
    pitch_attr = f' pitch="{pitch}"' if pitch else ''
    prosody_attrs = rate_attr + volume_attr + pitch_attr
    if prosody_attrs:
        text_block = f'<prosody{prosody_attrs}>{text}</prosody>'
    else:
        text_block = text
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
        cmd = ["curl", "-4", "-sS", "-L", "-i", "-r", "0-0", url]
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

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/tts':
            self._handle_tts(parsed)
            return

        if parsed.path == '/voices':
            self._handle_voices(parsed)
            return

        params = parse_qs(parsed.query)
        url = params.get('url', [None])[0]
        transcode = params.get('transcode', [None])[0]

        if not url:
            self.send_error(400, 'Missing url parameter')
            return

        range_header = self.headers.get('Range', '')
        is_live = '.ts' in url or '/live/' in url

        if transcode == 'mp4' and is_live:
            self._transcode_stream(url)
            return

        cmd = ['curl', '-4', '-sS', '-L', '-i']
        if range_header:
            cmd.extend(['-H', f'Range: {range_header}'])
        cmd.append(url)

        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            status_code = 200
            headers = {}

            while True:
                header_bytes = b''
                while True:
                    byte = proc.stdout.read(1)
                    if not byte:
                        break
                    header_bytes += byte
                    if header_bytes.endswith(b'\r\n\r\n'):
                        break

                if not header_bytes:
                    break

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
            proc.terminate()
            proc.wait()
        except Exception as e:
            print(f'Error: {e}', file=sys.stderr)

    def _handle_tts(self, parsed):
        params = parse_qs(parsed.query)
        text = params.get('text', [''])[0]
        lang = params.get('lang', ['fr'])[0]
        voice = params.get('voice', [None])[0]
        rate = params.get('rate', [None])[0]
        volume = params.get('volume', [None])[0]
        pitch = params.get('pitch', [None])[0]
        engine = params.get('engine', [None])[0]

        if not text:
            self.send_error(400, "Missing 'text' parameter")
            return

        try:
            audio = asyncio.run(generate_tts(text, lang, voice, rate, volume, pitch, engine))
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

    def _transcode_stream(self, url):
        cmd = [
            'ffmpeg', '-i', url,
            '-c:v', 'copy', '-c:a', 'aac',
            '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+faststart',
            '-'
        ]
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
            proc.terminate()
            proc.wait()
        except Exception as e:
            print(f'Transcode error: {e}', file=sys.stderr)

    def log_message(self, format, *args):
        print(f'[PROXY] {args[0]}')

if __name__ == '__main__':
    load_azure_config()
    print('Cleaning up old TTS cache...')
    cleanup_cache()
    print('Fetching available voices from Microsoft...')
    voices = get_voices_sync()
    print(f'Available TTS languages: {", ".join(sorted(voices.keys()))}')
    print(f'Total voices: {sum(len(v) for v in voices.values())}')
    server = ThreadingHTTPServer(('0.0.0.0', 8889), ProxyHandler)
    print(f'Stream proxy with TTS running on port 8889')
    print(f'TTS cache: {TTS_CACHE_DIR} (max {MAX_CACHE_SIZE_MB}MB, {MAX_CACHE_AGE_DAYS} days)')
    server.serve_forever()

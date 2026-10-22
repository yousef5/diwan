#!/usr/bin/env python3
"""Engine spike: does WhatsApp Web work on WebKitGTK 4.1 (= what Tauri 2 uses on Linux)?
Usage: wk_spike.py <data_dir> <ua: webkit|chrome|safari> <shot.png>
Loads web.whatsapp.com in an isolated profile, waits, then prints a JSON feature report."""
import json, os, sys, time
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, WebKit2, GLib

data_dir, ua_kind, shot = sys.argv[1], sys.argv[2], sys.argv[3]
UAS = {
    "chrome": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "safari": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
}

mgr = WebKit2.WebsiteDataManager(base_data_directory=data_dir, base_cache_directory=data_dir + "/cache")
ctx = WebKit2.WebContext.new_with_website_data_manager(mgr)
view = WebKit2.WebView.new_with_context(ctx)
s = view.get_settings()
for prop in ("enable-media-stream", "enable-webrtc", "enable-mediasource", "enable-encrypted-media",
             "enable-webaudio", "enable-developer-extras", "javascript-can-access-clipboard"):
    try:
        s.set_property(prop, True)
    except Exception as e:
        print("no setting", prop, e, file=sys.stderr)
if ua_kind in UAS:
    s.set_user_agent(UAS[ua_kind])

win = Gtk.Window(title="nexus-spike")
win.set_default_size(1100, 760)
win.add(view)
win.show_all()
t0 = time.time()
view.load_uri("https://web.whatsapp.com")

PROBE = r"""
(() => {
  const v = document.createElement('video'), a = document.createElement('audio');
  const MR = window.MediaRecorder;
  const txt = (document.body && document.body.innerText || '').slice(0, 400);
  return JSON.stringify({
    title: document.title,
    ua: navigator.userAgent,
    hasQR: !!document.querySelector('canvas[aria-label], [data-ref] canvas, canvas'),
    unsupported: /not supported|unsupported|update (your )?browser|غير مدعوم/i.test(txt),
    text: txt.replace(/\s+/g, ' '),
    mediaRecorder: !!MR,
    rec_ogg_opus: MR ? MR.isTypeSupported('audio/ogg;codecs=opus') : null,
    rec_webm_opus: MR ? MR.isTypeSupported('audio/webm;codecs=opus') : null,
    rec_mp4_aac: MR ? MR.isTypeSupported('audio/mp4') : null,
    play_mp4_h264: v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
    play_ogg_opus: a.canPlayType('audio/ogg; codecs="opus"'),
    play_mpeg: a.canPlayType('audio/mpeg'),
    webrtc: typeof RTCPeerConnection === 'function',
    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    notification: typeof Notification === 'function' ? Notification.permission : 'none',
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: !!window.indexedDB,
    wasm: typeof WebAssembly === 'object',
    sab: typeof SharedArrayBuffer === 'function',
    webgl: !!document.createElement('canvas').getContext('webgl'),
  });
})()
"""

def rss_mb():
    """RSS of the WebKit helper processes this spike spawned (children of this pid)."""
    me, tot = str(os.getpid()), 0
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            st = open(f"/proc/{pid}/status").read()
            ppid = st.split("PPid:")[1].split()[0]
            if ppid == me:
                tot += int(st.split("VmRSS:")[1].split()[0])
        except Exception:
            pass
    return round(tot / 1024)

def probe():
    def done(obj, res):
        try:
            val = obj.evaluate_javascript_finish(res)
            report = json.loads(val.to_string())
        except Exception as e:
            report = {"error": str(e)}
        report["seconds"] = round(time.time() - t0, 1)
        report["webkit_rss_mb"] = rss_mb()
        report["ua_kind"] = ua_kind
        print(json.dumps(report, ensure_ascii=False, indent=1))
        snap()
    view.evaluate_javascript(PROBE, -1, None, None, None, done)
    return False

def snap():
    def got(obj, res):
        try:
            surf = obj.get_snapshot_finish(res)
            surf.write_to_png(shot)
        except Exception as e:
            print("snapshot failed", e, file=sys.stderr)
        Gtk.main_quit()
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, got)

GLib.timeout_add_seconds(int(os.environ.get("WAIT", "20")), probe)
GLib.timeout_add_seconds(60, Gtk.main_quit)
Gtk.main()

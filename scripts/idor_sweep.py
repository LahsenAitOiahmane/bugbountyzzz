#!/usr/bin/env python3
"""
idor_sweep.py - rate-limited access-control replay harness.

Deliberately NOT a vulnerability scanner. It replays ONE endpoint you have already
chosen, against a short list of object identifiers, at a hard-capped request rate,
then groups the responses so the outlier stands out.

Built for BI.ZONE programs, which ban automated scanning tools and cap traffic at
5 requests/second. This tool enforces that cap itself and refuses to go faster.

Usage
-----
    python3 idor_sweep.py \
        --url 'https://lk.sogaz.ru/api/v1/policies/{id}' \
        --ids 555001,555002,555003,555004 \
        --baseline 555004 \
        --cookie 'SESSION=...' \
        --header 'X-BIZONE-BUG-BOUNTY: l27sen' \
        --delay 0.25 \
        --out ./evidence/lk-policies

Put {id} wherever the object identifier goes - in the URL, in the body, or both.

Output
------
    <out>/<id>.body      raw response body
    <out>/<id>.headers   raw response headers
    <out>/responses.csv  timestamped log (status, size, hash, elapsed)
    <out>/manifest.json  the exact command and parameters, for your report

Exit codes: 0 completed, 1 usage error, 2 no responses recorded.
"""

import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

MIN_DELAY = 0.2  # 5 requests/second, hard ceiling
MAX_SNIPPET = 400


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not follow redirects - a redirect to /login is itself a signal."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def parse_ids(args):
    ids = []
    if args.ids:
        ids.extend(x.strip() for x in args.ids.split(",") if x.strip())
    if args.id_range:
        lo, hi = args.id_range.split("-", 1)
        ids.extend(str(n) for n in range(int(lo), int(hi) + 1))
    if args.from_file:
        with open(args.from_file, "r", encoding="utf-8") as fh:
            ids.extend(
                line.strip()
                for line in fh
                if line.strip() and not line.lstrip().startswith("#")
            )
    seen, ordered = set(), []
    for item in ids:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def parse_headers(raw):
    headers = {}
    for item in raw or []:
        if ":" not in item:
            sys.exit("bad --header (expected 'Name: value'): %s" % item)
        name, _, value = item.partition(":")
        headers[name.strip()] = value.strip()
    return headers


def build_request(args, headers, ident):
    url = args.url.replace("{id}", urllib.parse.quote(ident, safe=""))
    body = None
    if args.data:
        body = args.data.replace("{id}", ident).encode("utf-8")
    elif args.method.upper() in ("POST", "PUT", "PATCH"):
        body = b""
    req = urllib.request.Request(url, data=body, method=args.method.upper())
    for name, value in headers.items():
        req.add_header(name, value)
    if args.cookie:
        req.add_header("Cookie", args.cookie)
    return req, url


def fetch(opener, req, timeout):
    started = time.time()
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers), time.time() - started, None
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp else b""
        return exc.code, body, dict(exc.headers or {}), time.time() - started, None
    except Exception as exc:  # noqa: BLE001
        return None, b"", {}, time.time() - started, "%s: %s" % (type(exc).__name__, exc)


def snippet(body):
    try:
        text = body.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return "<binary>"
    text = " ".join(text.split())
    return text[:MAX_SNIPPET] + ("..." if len(text) > MAX_SNIPPET else "")


def main():
    ap = argparse.ArgumentParser(
        description="Rate-limited IDOR replay harness. Replays one endpoint against a "
                    "short list of IDs and highlights outliers.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--url", required=True, help="URL template containing {id}")
    ap.add_argument("--ids", help="comma-separated identifiers")
    ap.add_argument("--range", dest="id_range", help="inclusive numeric range, e.g. 1000-1010")
    ap.add_argument("--from-file", help="file of identifiers, one per line (# = comment)")
    ap.add_argument("--baseline", help="the identifier that legitimately belongs to you")
    ap.add_argument("--method", default="GET", help="HTTP method (default GET)")
    ap.add_argument("--data", help="request body template; may contain {id}")
    ap.add_argument("--cookie", help="Cookie header value for the session under test")
    ap.add_argument("--header", action="append", help="extra header 'Name: value' (repeatable)")
    ap.add_argument("--delay", type=float, default=0.25,
                    help="seconds between requests; floor of 0.2 enforced (default 0.25)")
    ap.add_argument("--timeout", type=float, default=20.0, help="per-request timeout in seconds")
    ap.add_argument("--out", default="./idor-evidence", help="evidence output directory")
    ap.add_argument("--dry-run", action="store_true", help="print planned requests, send nothing")
    args = ap.parse_args()

    ids = parse_ids(args)
    if not ids:
        sys.exit("no identifiers given: use --ids, --range or --from-file")
    if args.delay < MIN_DELAY:
        print("[!] --delay %.3f is below the 0.2s floor (5 req/s cap). Using 0.2s."
              % args.delay)
        args.delay = MIN_DELAY

    headers = parse_headers(args.header)

    print("=" * 68)
    print("idor_sweep - rate-limited access-control replay")
    print("=" * 68)
    print("target      : %s" % args.url)
    print("method      : %s" % args.method.upper())
    print("identifiers : %d" % len(ids))
    print("rate        : 1 request per %.2fs (~%.1f req/s)" % (args.delay, 1.0 / args.delay))
    print("baseline    : %s" % (args.baseline or "(none)"))
    print()
    print("Confirm this endpoint is inside the program's declared scope and that")
    print("you are using accounts you registered yourself. The program forbids")
    print("automated scanning and post-exploitation; this tool does neither.")
    print("=" * 68)

    if args.dry_run:
        print("\n[dry-run] planned requests:")
        for ident in ids:
            req, url = build_request(args, headers, ident)
            tag = "  <- baseline" if ident == args.baseline else ""
            print("  %-6s %s %s%s" % (args.method.upper(), url, tag, ""))
        return 0

    os.makedirs(args.out, exist_ok=True)
    opener = urllib.request.build_opener(NoRedirect)

    records = []
    for index, ident in enumerate(ids):
        if index:
            time.sleep(args.delay)
        req, url = build_request(args, headers, ident)
        status, body, rheaders, elapsed, error = fetch(opener, req, args.timeout)

        digest = hashlib.sha256(body).hexdigest()[:16]
        label = "baseline" if ident == args.baseline else ""
        if error:
            print("  %-14s ERROR  %s" % (ident, error))
        else:
            print("  %-14s %-4s %8d bytes  %6.0f ms  %s" %
                  (ident, status, len(body), elapsed * 1000, label))

        with open(os.path.join(args.out, "%s.body" % ident), "wb") as fh:
            fh.write(body)
        with open(os.path.join(args.out, "%s.headers" % ident), "w", encoding="utf-8") as fh:
            for key, value in rheaders.items():
                fh.write("%s: %s\n" % (key, value))

        records.append({
            "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "identifier": ident,
            "url": url,
            "status": "" if status is None else status,
            "size": len(body),
            "sha256_16": digest,
            "elapsed_ms": round(elapsed * 1000),
            "is_baseline": "yes" if ident == args.baseline else "",
            "error": error or "",
            "snippet": snippet(body),
        })

    csv_path = os.path.join(args.out, "responses.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)

    manifest = {
        "tool": "idor_sweep.py",
        "run_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "url_template": args.url,
        "method": args.method.upper(),
        "body_template": args.data or "",
        "extra_headers": headers,
        "baseline": args.baseline or "",
        "identifiers": ids,
        "delay_seconds": args.delay,
        "note": "Replay harness for manual IDOR testing; not an automated scanner.",
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)

    print("\n" + "-" * 68)
    print("response groups (status, size) - the outlier is your lead")
    print("-" * 68)

    groups = defaultdict(list)
    for rec in records:
        key = ("ERR" if rec["error"] else rec["status"], rec["size"])
        groups[key].append(rec["identifier"])

    ordered = sorted(groups.items(), key=lambda kv: len(kv[1]), reverse=True)
    for key, members in ordered:
        status, size = key
        tag = "  <-- majority" if members is ordered[0][1] else ""
        print("  status=%-4s size=%-8s n=%-3d %s%s" %
              (status, size, len(members), ",".join(members[:8]) + ("..." if len(members) > 8 else ""), tag))

    majority = set(ordered[0][1]) if ordered else set()
    outliers = [r for r in records if r["identifier"] not in majority]

    if outliers:
        print("\n" + "-" * 68)
        print("OUTLIERS - inspect these first")
        print("-" * 68)
        baseline_hash = next(
            (r["sha256_16"] for r in records if r["identifier"] == args.baseline), None
        )
        for rec in outliers:
            print("\n  id=%s  status=%s  size=%s  %s" %
                  (rec["identifier"], rec["status"], rec["size"], rec["timestamp_utc"]))
            if baseline_hash and rec["sha256_16"] == baseline_hash:
                print("    NOTE: body is byte-identical to your own baseline object.")
                print("          The server is probably ignoring the identifier - not an IDOR.")
            print("    %s" % (rec["snippet"] or "<empty>"))
    else:
        print("\n  No outliers - every identifier produced a comparable response.")
        print("  If all were 403/404, access control is enforced here. Move on.")

    print("\n" + "-" * 68)
    print("evidence : %s" % os.path.abspath(args.out))
    print("log      : %s" % os.path.abspath(csv_path))
    print("-" * 68)
    print("Reminder: the report needs timestamps and the account IDs you tested with.")
    print("Keep all evidence inside the report itself - external hosting breaches rules.")

    return 0 if records else 2


if __name__ == "__main__":
    sys.exit(main())

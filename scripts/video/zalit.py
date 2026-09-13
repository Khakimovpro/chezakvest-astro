#!/usr/bin/env python3
"""Upload HLS assets with public ACL and immutable segment cache headers."""
from __future__ import annotations
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import boto3

ROOT = Path(__file__).resolve().parents[2]
BUCKET = "che-za-kvest-videos"
S3 = boto3.session.Session().client("s3", endpoint_url="https://storage.yandexcloud.net", region_name="ru-central1")

def upload(path: Path, key: str):
    suffix = path.suffix.lower()
    S3.upload_file(str(path), BUCKET, key, ExtraArgs={
        "ACL": "public-read",
        "ContentType": "application/vnd.apple.mpegurl" if suffix == ".m3u8" else "video/mp2t",
        "CacheControl": "no-cache" if suffix == ".m3u8" else "public, max-age=31536000, immutable",
    })
    return key

def main(slugs: list[str]):
    root = ROOT / "scripts/video/hls"
    files = [(path, f"hls/{path.relative_to(root).as_posix()}") for slug in slugs for path in (root / slug).rglob("*") if path.is_file()]
    if not files: raise SystemExit("no HLS files selected")
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(upload, path, key) for path, key in files]
        for future in as_completed(futures): future.result()
    print(f"uploaded {len(files)} objects")

if __name__ == "__main__":
    os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
    main(sys.argv[1:])

#!/usr/bin/env python3
"""Create the public HLS bucket and its browser CORS policy, idempotently."""
from __future__ import annotations

import os
from botocore.exceptions import ClientError
import boto3

BUCKET = "che-za-kvest-videos"
ENDPOINT = "https://storage.yandexcloud.net"
REGION = "ru-central1"


def client():
    # boto3 uses the existing default AWS profile. Credentials never enter logs.
    return boto3.session.Session().client("s3", endpoint_url=ENDPOINT, region_name=REGION)


def main():
    s3 = client()
    try:
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION})
        print(f"created {BUCKET}")
    except ClientError as error:
        if error.response["Error"].get("Code") not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            raise
        print(f"exists {BUCKET}")

    s3.put_bucket_cors(Bucket=BUCKET, CORSConfiguration={"CORSRules": [{
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["Content-Length", "Content-Range"],
        "MaxAgeSeconds": 86400,
    }]})
    print("CORS GET/HEAD configured; objects are public-read during upload")


if __name__ == "__main__":
    os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
    main()

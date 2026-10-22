#!/usr/bin/env python3
"""The captions of COCO val 2017 (AI-A1).

The annotations of COCO are one zip of 241 MB, and the spike needs the
captions of the validation set: the safe side of the guard. The zip is read
over HTTP with range requests, so that only the entry of the captions of the
validation set is fetched, and not the whole zip.

usage: fetch-coco-captions.py --zip <url> --entry annotations/captions_val2017.json
                              --dest <file>
"""

import argparse
import hashlib
import io
import os
import urllib.request
import zipfile

UA = {"User-Agent": "curl/8.5.0"}
CHUNK = 4 << 20


class RemoteFile(io.RawIOBase):
    """A file that lives on a server, read with range requests.

    The read of the zip asks for the whole entry at once, so the request is
    cut into pieces of a few MB: the connection of the host goes through Tor
    and it is cut without warning, and a piece of a few MB is a piece that
    arrives.
    """

    def __init__(self, url):
        self.url = url
        self.position = 0
        self.length = self._size()

    def _request(self, start, end):
        request = urllib.request.Request(
            self.url, headers={**UA, "Range": f"bytes={start}-{end}"}
        )
        with urllib.request.urlopen(request, timeout=180) as response:
            return response.read()

    def _size(self):
        request = urllib.request.Request(self.url, headers=UA, method="HEAD")
        with urllib.request.urlopen(request, timeout=60) as response:
            return int(response.headers.get("content-length", 0))

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=os.SEEK_SET):
        if whence == os.SEEK_SET:
            self.position = offset
        elif whence == os.SEEK_CUR:
            self.position += offset
        else:
            self.position = self.length + offset
        return self.position

    def read(self, size=-1):
        if size is None or size < 0:
            size = self.length - self.position
        out = bytearray()
        while len(out) < size:
            start = self.position + len(out)
            end = min(start + CHUNK, self.position + size, self.length) - 1
            if end < start:
                break
            data = self._request(start, end)
            if not data:
                break
            out += data
        self.position += len(out)
        return bytes(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    parser.add_argument("--entry", required=True)
    parser.add_argument("--dest", required=True)
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.dest), exist_ok=True)
    remote = RemoteFile(args.zip)
    with zipfile.ZipFile(remote) as archive:
        with archive.open(args.entry) as source:
            data = source.read()
    with open(args.dest, "wb") as out:
        out.write(data)
    print(f"  the captions: {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
    main()

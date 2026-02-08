#!/usr/bin/env python3
"""
Radica Software Symbol Downloader

Downloads IEC 60617 electrical symbols from Radica Software (Siemens) symbol library.
Symbols are available at: https://symbols.radicasoftware.com

Usage:
    python download_symbols.py --symbol "normally-open-contact" --stencil 229
    python download_symbols.py --list-stencil 229
    python download_symbols.py --batch symbols.json

License Note:
    Radica Software symbols are provided by Siemens. Check their terms of use
    before using in commercial projects.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin
import urllib.request
import urllib.error

# Base URLs
SYMBOLS_BASE = "https://symbols-electrical.getvecta.com"
CATALOG_BASE = "https://symbols.radicasoftware.com"

# Known stencils (IEC symbol categories)
STENCILS = {
    229: "single-line-symbols",
    # Add more stencils as discovered
}

# Symbol variants - many IEC symbols have multiple valid representations
# Key: canonical name, Value: list of variant IDs/names
SYMBOL_VARIANTS = {
    "normally-open-contact": [
        {"id": 12, "stencil": 229, "variant": "standard"},
        # Add more variants as discovered
    ],
    "normally-close-contact": [
        {"id": 13, "stencil": 229, "variant": "standard"},
    ],
    "contactor-3p": [
        {"id": 0, "stencil": 229, "variant": "standard"},
    ],
    "circuit-breaker-3p": [
        {"id": 1, "stencil": 229, "variant": "standard"},
    ],
}


def download_file(url: str, output_path: Path, verbose: bool = True) -> bool:
    """Download a file from URL to local path."""
    try:
        if verbose:
            print(f"  Downloading: {url}")

        req = urllib.request.Request(
            url,
            headers={"User-Agent": "fusionCad-SymbolDownloader/1.0"}
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read()

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(content)

        if verbose:
            print(f"  Saved: {output_path}")
        return True

    except urllib.error.HTTPError as e:
        print(f"  HTTP Error {e.code}: {url}", file=sys.stderr)
        return False
    except urllib.error.URLError as e:
        print(f"  URL Error: {e.reason}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  Error: {e}", file=sys.stderr)
        return False


def build_symbol_url(stencil_id: int, symbol_id: int, symbol_slug: str,
                     file_format: str = "svg", hash_code: str = "") -> str:
    """
    Build the download URL for a symbol.

    URL pattern: https://symbols-electrical.getvecta.com/stencil_229/12_normally-open-contact.{hash}.svg

    Note: The hash code is required but changes. We try common patterns or
    fetch the catalog page to extract it.
    """
    # If we don't have a hash, use a placeholder that often works
    if not hash_code:
        # Try fetching without hash first (some endpoints work)
        hash_code = "svg"  # This won't work, we need the real hash

    filename = f"{symbol_id}_{symbol_slug}.{hash_code}.{file_format}"
    return f"{SYMBOLS_BASE}/stencil_{stencil_id}/{filename}"


def fetch_symbol_hash(stencil_id: int, symbol_id: int, symbol_slug: str) -> Optional[str]:
    """
    Fetch the symbol's hash code from the catalog page.
    The hash is embedded in the download links on the symbol detail page.
    """
    catalog_url = f"{CATALOG_BASE}/{stencil_id}/{STENCILS.get(stencil_id, 'symbols')}/{symbol_id}/{symbol_slug}"

    try:
        req = urllib.request.Request(
            catalog_url,
            headers={"User-Agent": "fusionCad-SymbolDownloader/1.0"}
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8')

        # Look for the SVG URL pattern in the HTML
        # Pattern: stencil_229/12_normally-open-contact.{hash}.svg
        pattern = rf'stencil_{stencil_id}/{symbol_id}_{re.escape(symbol_slug)}\.([a-f0-9]+)\.svg'
        match = re.search(pattern, html)

        if match:
            return match.group(1)

        return None

    except Exception as e:
        print(f"  Could not fetch hash: {e}", file=sys.stderr)
        return None


def download_symbol(stencil_id: int, symbol_id: int, symbol_slug: str,
                    output_dir: Path, formats: list[str] = None,
                    variant_name: str = "standard") -> dict:
    """
    Download a symbol in multiple formats.

    Returns dict with download status and paths.
    """
    if formats is None:
        formats = ["svg"]  # Default to SVG only

    print(f"\nDownloading: {symbol_slug} (stencil {stencil_id}, id {symbol_id})")

    # First, fetch the hash code from the catalog page
    hash_code = fetch_symbol_hash(stencil_id, symbol_id, symbol_slug)

    if not hash_code:
        print(f"  Warning: Could not find hash code, trying alternative methods...")
        # Try common hash patterns or hardcoded values
        hash_code = "c42afc019b"  # Example hash, won't work for all symbols

    result = {
        "symbol": symbol_slug,
        "stencil_id": stencil_id,
        "symbol_id": symbol_id,
        "variant": variant_name,
        "hash": hash_code,
        "files": {},
        "success": False
    }

    for fmt in formats:
        url = f"{SYMBOLS_BASE}/stencil_{stencil_id}/{symbol_id}_{symbol_slug}.{hash_code}.{fmt}"

        # Create output filename
        safe_name = symbol_slug.replace("-", "_")
        if variant_name != "standard":
            safe_name = f"{safe_name}_{variant_name}"
        output_file = output_dir / fmt / f"{safe_name}.{fmt}"

        if download_file(url, output_file):
            result["files"][fmt] = str(output_file)
            result["success"] = True
        else:
            result["files"][fmt] = None

    return result


def list_stencil_symbols(stencil_id: int) -> list[dict]:
    """
    List all symbols in a stencil by scraping the catalog page.

    Returns list of symbol dicts with id, slug, and name.
    """
    stencil_name = STENCILS.get(stencil_id, "symbols")
    catalog_url = f"{CATALOG_BASE}/{stencil_id}/{stencil_name}"

    print(f"Fetching symbol list from: {catalog_url}")

    try:
        req = urllib.request.Request(
            catalog_url,
            headers={"User-Agent": "fusionCad-SymbolDownloader/1.0"}
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8')

        # Parse symbol links from HTML
        # Pattern: href="/{stencil_id}/{stencil_name}/{symbol_id}/{symbol_slug}"
        pattern = rf'href="/{stencil_id}/{re.escape(stencil_name)}/(\d+)/([^"]+)"'
        matches = re.findall(pattern, html)

        symbols = []
        seen = set()

        for symbol_id, symbol_slug in matches:
            key = (symbol_id, symbol_slug)
            if key not in seen:
                seen.add(key)
                symbols.append({
                    "id": int(symbol_id),
                    "slug": symbol_slug,
                    "stencil_id": stencil_id
                })

        # Sort by ID
        symbols.sort(key=lambda x: x["id"])

        print(f"Found {len(symbols)} symbols in stencil {stencil_id}")
        return symbols

    except Exception as e:
        print(f"Error fetching stencil: {e}", file=sys.stderr)
        return []


def download_batch(symbols_file: Path, output_dir: Path, formats: list[str]) -> list[dict]:
    """
    Download multiple symbols defined in a JSON file.

    JSON format:
    [
        {"stencil": 229, "id": 12, "slug": "normally-open-contact"},
        {"stencil": 229, "id": 13, "slug": "normally-close-contact"}
    ]
    """
    with open(symbols_file) as f:
        symbols = json.load(f)

    results = []
    for sym in symbols:
        result = download_symbol(
            stencil_id=sym["stencil"],
            symbol_id=sym["id"],
            symbol_slug=sym["slug"],
            output_dir=output_dir,
            formats=formats,
            variant_name=sym.get("variant", "standard")
        )
        results.append(result)

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Download IEC 60617 symbols from Radica Software"
    )

    parser.add_argument(
        "--symbol", "-s",
        help="Symbol slug (e.g., 'normally-open-contact')"
    )
    parser.add_argument(
        "--stencil", "-t",
        type=int,
        default=229,
        help="Stencil ID (default: 229 for single-line symbols)"
    )
    parser.add_argument(
        "--id", "-i",
        type=int,
        help="Symbol ID within the stencil"
    )
    parser.add_argument(
        "--list-stencil", "-l",
        type=int,
        help="List all symbols in a stencil"
    )
    parser.add_argument(
        "--batch", "-b",
        type=Path,
        help="JSON file with list of symbols to download"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=Path("./downloaded"),
        help="Output directory (default: ./downloaded)"
    )
    parser.add_argument(
        "--format", "-f",
        action="append",
        choices=["svg", "png", "dxf", "dwg", "jpg"],
        help="File format(s) to download (default: svg)"
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="Download all symbols from the specified stencil"
    )

    args = parser.parse_args()

    # Default to SVG format
    formats = args.format or ["svg"]
    output_dir = args.output

    # List stencil symbols
    if args.list_stencil:
        symbols = list_stencil_symbols(args.list_stencil)
        for sym in symbols:
            print(f"  {sym['id']:3d}: {sym['slug']}")

        # Save to JSON for batch download
        list_file = output_dir / f"stencil_{args.list_stencil}_symbols.json"
        list_file.parent.mkdir(parents=True, exist_ok=True)
        with open(list_file, "w") as f:
            json.dump(symbols, f, indent=2)
        print(f"\nSymbol list saved to: {list_file}")
        return

    # Download all from stencil
    if args.all:
        symbols = list_stencil_symbols(args.stencil)
        results = []
        for sym in symbols:
            result = download_symbol(
                stencil_id=sym["stencil_id"],
                symbol_id=sym["id"],
                symbol_slug=sym["slug"],
                output_dir=output_dir,
                formats=formats
            )
            results.append(result)

        # Save results
        results_file = output_dir / "download_results.json"
        with open(results_file, "w") as f:
            json.dump(results, f, indent=2)

        success_count = sum(1 for r in results if r["success"])
        print(f"\nDownloaded {success_count}/{len(results)} symbols")
        print(f"Results saved to: {results_file}")
        return

    # Batch download from JSON
    if args.batch:
        results = download_batch(args.batch, output_dir, formats)

        results_file = output_dir / "download_results.json"
        with open(results_file, "w") as f:
            json.dump(results, f, indent=2)

        success_count = sum(1 for r in results if r["success"])
        print(f"\nDownloaded {success_count}/{len(results)} symbols")
        return

    # Single symbol download
    if args.symbol and args.id is not None:
        result = download_symbol(
            stencil_id=args.stencil,
            symbol_id=args.id,
            symbol_slug=args.symbol,
            output_dir=output_dir,
            formats=formats
        )

        if result["success"]:
            print(f"\nSuccess! Files saved to: {output_dir}")
        else:
            print(f"\nFailed to download symbol", file=sys.stderr)
            sys.exit(1)
        return

    # No valid command
    parser.print_help()


if __name__ == "__main__":
    main()

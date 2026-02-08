#!/usr/bin/env python3
"""
SVG to fusionCad Symbol Converter

Converts downloaded SVG symbols to fusionCad's JSON+SVG path format.
Handles multiple variants per symbol type (important for IEC 60617 compliance).

Usage:
    python convert_to_fusioncad.py --input downloaded/svg/normally_open_contact.svg
    python convert_to_fusioncad.py --input downloaded/svg --output symbols.json
    python convert_to_fusioncad.py --input downloaded/svg --category "Control" --output iec_symbols.ts

Output Formats:
    - JSON: For runtime import
    - TypeScript: For static symbol library inclusion
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET


@dataclass
class Pin:
    """Symbol pin definition."""
    id: str
    x: float
    y: float
    direction: str = "left"  # left, right, top, bottom


@dataclass
class SymbolVariant:
    """A single variant of a symbol (different visual representation)."""
    variant_id: str  # e.g., "iec-standard", "ansi", "simplified"
    svg_path: str
    description: str = ""


@dataclass
class SymbolDefinition:
    """Complete symbol definition with optional variants."""
    id: str  # e.g., "normally-open-contact"
    name: str  # Human-readable: "Normally Open Contact"
    category: str  # e.g., "Control", "Power", "Terminal"
    width: float
    height: float
    pins: list[Pin] = field(default_factory=list)
    svg_path: str = ""  # Default/primary variant path

    # Multi-variant support - key feature for IEC 60617
    variants: list[SymbolVariant] = field(default_factory=list)

    # Metadata
    source: str = "radica-software"
    iec_reference: str = ""  # e.g., "IEC 60617-7:2012, Symbol 07-13-01"
    tags: list[str] = field(default_factory=list)


def parse_svg_viewbox(svg_root: ET.Element) -> tuple[float, float, float, float]:
    """Extract viewBox dimensions from SVG root."""
    viewbox = svg_root.get("viewBox", "0 0 100 100")
    parts = viewbox.split()

    if len(parts) == 4:
        return tuple(float(p) for p in parts)

    # Fallback to width/height attributes
    width = float(svg_root.get("width", "100").replace("px", ""))
    height = float(svg_root.get("height", "100").replace("px", ""))
    return (0, 0, width, height)


def extract_svg_paths(svg_root: ET.Element, namespace: dict) -> list[str]:
    """
    Extract all path 'd' attributes from SVG.
    Handles SVGs with <symbol>/<use> pattern by only extracting from <symbol> if present.
    """
    paths = []
    seen = set()  # Deduplicate paths

    # Check if there's a <symbol> element - if so, only extract from there
    has_symbol = False
    for elem in svg_root.iter():
        if elem.tag.endswith("symbol"):
            has_symbol = True
            for path in elem.iter():
                if path.tag.endswith("path"):
                    d = path.get("d")
                    if d and d not in seen:
                        paths.append(d)
                        seen.add(d)

    # If no symbol, extract from all path elements
    if not has_symbol:
        for elem in svg_root.iter():
            if elem.tag.endswith("path"):
                d = elem.get("d")
                if d and d not in seen:
                    paths.append(d)
                    seen.add(d)

    return paths


def normalize_svg_path(paths: list[str], min_x: float, min_y: float,
                       scale: float = 1.0) -> str:
    """
    Combine and normalize SVG paths.
    Adjusts coordinates to start from (0,0) and optionally scales.
    """
    if not paths:
        return ""

    combined = " ".join(paths)

    if min_x == 0 and min_y == 0 and scale == 1.0:
        return combined

    # Parse and adjust path coordinates
    # This is a simplified adjustment - handles common path commands
    def adjust_coords(match):
        cmd = match.group(1)
        coords = match.group(2).strip()

        if not coords:
            return cmd

        # Split coordinates
        parts = re.split(r'[,\s]+', coords)
        adjusted = []

        i = 0
        while i < len(parts):
            try:
                x = float(parts[i])
                if cmd.isupper():  # Absolute coordinates
                    x = (x - min_x) * scale

                if i + 1 < len(parts):
                    y = float(parts[i + 1])
                    if cmd.isupper():
                        y = (y - min_y) * scale
                    adjusted.append(f"{x:.2f},{y:.2f}".rstrip('0').rstrip('.'))
                    i += 2
                else:
                    adjusted.append(f"{x:.2f}".rstrip('0').rstrip('.'))
                    i += 1
            except ValueError:
                adjusted.append(parts[i])
                i += 1

        return cmd + " ".join(adjusted)

    # Match path commands with their coordinates
    pattern = r'([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)'
    result = re.sub(pattern, adjust_coords, combined)

    return result


def infer_pins_from_svg(viewbox: tuple, paths: list[str]) -> list[Pin]:
    """
    Attempt to infer pin positions from SVG geometry.

    For electrical symbols, pins are typically at:
    - Top center, bottom center (vertical symbols)
    - Left center, right center (horizontal symbols)
    - Endpoints of the main path

    This is a heuristic - manual adjustment may be needed.
    """
    min_x, min_y, width, height = viewbox

    pins = []

    # Check if symbol is more vertical or horizontal
    if height > width * 1.5:
        # Vertical symbol (like a contact or switch)
        pins.append(Pin(id="1", x=width/2, y=0, direction="top"))
        pins.append(Pin(id="2", x=width/2, y=height, direction="bottom"))
    elif width > height * 1.5:
        # Horizontal symbol
        pins.append(Pin(id="1", x=0, y=height/2, direction="left"))
        pins.append(Pin(id="2", x=width, y=height/2, direction="right"))
    else:
        # Square-ish - default to top/bottom
        pins.append(Pin(id="1", x=width/2, y=0, direction="top"))
        pins.append(Pin(id="2", x=width/2, y=height, direction="bottom"))

    return pins


def slug_to_name(slug: str) -> str:
    """Convert slug to human-readable name."""
    return " ".join(word.capitalize() for word in slug.split("-"))


def parse_svg_file(svg_path: Path) -> Optional[SymbolDefinition]:
    """Parse an SVG file and create a SymbolDefinition."""
    try:
        # Parse SVG
        tree = ET.parse(svg_path)
        root = tree.getroot()

        # Handle namespace
        ns = {"svg": "http://www.w3.org/2000/svg"}

        # Extract viewBox
        viewbox = parse_svg_viewbox(root)
        min_x, min_y, vb_width, vb_height = viewbox

        # Calculate actual dimensions (accounting for negative viewBox)
        width = vb_width
        height = vb_height

        # Extract paths
        paths = extract_svg_paths(root, ns)

        if not paths:
            print(f"  Warning: No paths found in {svg_path}", file=sys.stderr)
            return None

        # Normalize path (adjust to 0,0 origin)
        svg_path_str = normalize_svg_path(paths, min_x, min_y)

        # Infer pins
        pins = infer_pins_from_svg((0, 0, width, height), paths)

        # Generate ID and name from filename
        stem = svg_path.stem.replace("_", "-")
        symbol_id = stem.lower()
        name = slug_to_name(stem)

        return SymbolDefinition(
            id=symbol_id,
            name=name,
            category="Imported",  # Can be overridden
            width=width,
            height=height,
            pins=pins,
            svg_path=svg_path_str,
            variants=[],  # Single variant for now
            source="radica-software",
            tags=[symbol_id.replace("-", " ")]
        )

    except ET.ParseError as e:
        print(f"  XML Parse Error: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Error parsing {svg_path}: {e}", file=sys.stderr)
        return None


def convert_directory(input_dir: Path, category: str = "Imported") -> list[SymbolDefinition]:
    """Convert all SVG files in a directory."""
    symbols = []

    svg_files = list(input_dir.glob("*.svg"))
    print(f"Found {len(svg_files)} SVG files in {input_dir}")

    for svg_file in svg_files:
        print(f"  Converting: {svg_file.name}")
        symbol = parse_svg_file(svg_file)
        if symbol:
            symbol.category = category
            symbols.append(symbol)

    return symbols


def export_json(symbols: list[SymbolDefinition], output_path: Path):
    """Export symbols to JSON format."""

    def serialize(obj):
        if isinstance(obj, (SymbolDefinition, Pin, SymbolVariant)):
            return asdict(obj)
        return obj

    data = [serialize(s) for s in symbols]

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Exported {len(symbols)} symbols to {output_path}")


def export_typescript(symbols: list[SymbolDefinition], output_path: Path):
    """Export symbols to TypeScript format for static inclusion."""

    lines = [
        "/**",
        " * Auto-generated IEC 60617 symbols from Radica Software",
        " * Source: https://symbols.radicasoftware.com",
        " * ",
        " * DO NOT EDIT MANUALLY - regenerate with convert_to_fusioncad.py",
        " */",
        "",
        "import { registerSymbol, type SymbolCategory } from './iec-symbols';",
        "",
    ]

    for symbol in symbols:
        # Generate TypeScript constant
        const_name = symbol.id.upper().replace("-", "_")

        lines.append(f"// {symbol.name}")
        lines.append(f"registerSymbol('{symbol.id}', {{")
        lines.append(f"  name: '{symbol.name}',")
        lines.append(f"  category: '{symbol.category}' as SymbolCategory,")
        lines.append(f"  width: {symbol.width},")
        lines.append(f"  height: {symbol.height},")
        lines.append(f"  svgPath: '{symbol.svg_path}',")

        # Pins
        if symbol.pins:
            lines.append("  pins: [")
            for pin in symbol.pins:
                lines.append(f"    {{ id: '{pin.id}', x: {pin.x}, y: {pin.y}, direction: '{pin.direction}' }},")
            lines.append("  ],")

        # Variants (important for IEC compliance!)
        if symbol.variants:
            lines.append("  variants: [")
            for variant in symbol.variants:
                lines.append(f"    {{ variantId: '{variant.variant_id}', svgPath: '{variant.svg_path}', description: '{variant.description}' }},")
            lines.append("  ],")

        lines.append("});")
        lines.append("")

    with open(output_path, "w") as f:
        f.write("\n".join(lines))

    print(f"Exported {len(symbols)} symbols to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert SVG symbols to fusionCad format"
    )

    parser.add_argument(
        "--input", "-i",
        type=Path,
        required=True,
        help="Input SVG file or directory"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        help="Output file (JSON or TypeScript based on extension)"
    )
    parser.add_argument(
        "--category", "-c",
        default="Imported",
        help="Symbol category (e.g., 'Control', 'Power', 'Terminal')"
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "ts", "typescript"],
        default="json",
        help="Output format (default: json)"
    )

    args = parser.parse_args()

    # Determine output format
    output_format = args.format
    if args.output and args.output.suffix == ".ts":
        output_format = "ts"
    elif args.output and args.output.suffix == ".json":
        output_format = "json"

    # Convert symbols
    if args.input.is_file():
        symbol = parse_svg_file(args.input)
        if symbol:
            symbol.category = args.category
            symbols = [symbol]
        else:
            print("Failed to parse SVG file", file=sys.stderr)
            sys.exit(1)
    elif args.input.is_dir():
        symbols = convert_directory(args.input, args.category)
    else:
        print(f"Input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    if not symbols:
        print("No symbols converted", file=sys.stderr)
        sys.exit(1)

    # Export
    if args.output:
        if output_format in ("ts", "typescript"):
            export_typescript(symbols, args.output)
        else:
            export_json(symbols, args.output)
    else:
        # Print to stdout as JSON
        def serialize(obj):
            if isinstance(obj, (SymbolDefinition, Pin, SymbolVariant)):
                return asdict(obj)
            return obj

        print(json.dumps([serialize(s) for s in symbols], indent=2))


if __name__ == "__main__":
    main()

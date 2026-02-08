# Radica Software Symbol Downloader & Converter

Automation tooling for downloading IEC 60617 electrical symbols from [Radica Software](https://symbols.radicasoftware.com) (Siemens) and converting them to fusionCad's JSON+SVG format.

## Features

- **Download symbols** from Radica Software's IEC symbol library
- **Multiple formats**: SVG, PNG, DXF, DWG
- **Batch download**: Download multiple symbols from a JSON list
- **Multi-variant support**: IEC 60617 symbols often have multiple valid representations
- **Convert to fusionCad**: Generate JSON or TypeScript symbol definitions

## Prerequisites

- Python 3.10+
- Internet connection

## Usage

### 1. List Available Symbols

```bash
# List all symbols in stencil 229 (Single Line Symbols)
python download_symbols.py --list-stencil 229
```

This saves a JSON file with all symbol IDs and slugs.

### 2. Download a Single Symbol

```bash
# Download "normally-open-contact" (ID 12 in stencil 229)
python download_symbols.py --symbol "normally-open-contact" --id 12 --stencil 229
```

### 3. Download All Symbols from a Stencil

```bash
# Download all 50+ symbols from stencil 229
python download_symbols.py --all --stencil 229 --format svg
```

### 4. Batch Download

Create a `symbols.json` file:

```json
[
  {"stencil": 229, "id": 12, "slug": "normally-open-contact", "variant": "standard"},
  {"stencil": 229, "id": 13, "slug": "normally-close-contact", "variant": "standard"},
  {"stencil": 229, "id": 0, "slug": "contactor-3p", "variant": "standard"}
]
```

Then run:

```bash
python download_symbols.py --batch symbols.json --format svg
```

### 5. Convert to fusionCad Format

```bash
# Convert a single SVG
python convert_to_fusioncad.py --input downloaded/svg/normally_open_contact.svg

# Convert entire directory to JSON
python convert_to_fusioncad.py --input downloaded/svg --output symbols.json --category "Control"

# Convert to TypeScript for static inclusion
python convert_to_fusioncad.py --input downloaded/svg --output iec-symbols.ts --category "Control"
```

## Symbol Variants

IEC 60617 allows multiple valid representations for many symbols. For example, a normally open contact can be drawn as:

1. **Standard IEC**: Two vertical lines with gap and bridge
2. **Simplified**: Angled line representation
3. **ANSI/IEEE**: Different proportions

fusionCad supports storing multiple variants per symbol type. The converter handles this via the `variants` field:

```typescript
registerSymbol('normally-open-contact', {
  name: 'Normally Open Contact',
  svgPath: 'M10 0v15 M5 15l5 20v15',  // Default variant
  variants: [
    { variantId: 'iec-standard', svgPath: '...', description: 'IEC 60617 standard' },
    { variantId: 'simplified', svgPath: '...', description: 'Simplified representation' },
  ],
});
```

## Output Structure

```
downloaded/
├── svg/
│   ├── normally_open_contact.svg
│   ├── normally_close_contact.svg
│   └── ...
├── png/
├── dxf/
├── download_results.json
└── stencil_229_symbols.json
```

## Known Stencils

| ID  | Name | Description |
|-----|------|-------------|
| 229 | single-line-symbols | Basic IEC symbols (contacts, switches, breakers) |

More stencils can be discovered by browsing https://symbols.radicasoftware.com

## License

The downloaded symbols are from Radica Software (Siemens). Check their terms of use before using in commercial projects.

The tooling scripts in this folder are part of fusionCad and follow the project's license.

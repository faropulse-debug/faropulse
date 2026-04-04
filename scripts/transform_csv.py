"""
transform_csv.py — Transforma un CSV del sistema POS a formato Supabase.

Replica exactamente la lógica de mapVentas / mapItems en excelProcessor.ts.

Uso:
  python scripts/transform_csv.py ventas input.csv output.csv \\
      --org-id <uuid> --location-id <uuid>

  python scripts/transform_csv.py items input.csv output.csv \\
      --org-id <uuid> --location-id <uuid>

Opciones:
  --encoding   Encoding del CSV de entrada (default: utf-8-sig, maneja BOM)
  --delimiter  Separador de columnas (default: auto-detect entre , y ;)
  --dry-run    Muestra las primeras 5 filas transformadas sin escribir el archivo
"""

import argparse
import csv
import math
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


# ─── normalizeHeader (igual que en uploadValidator.ts) ───────────────────────

def normalize_header(h: str) -> str:
    """
    trim → strip diacritics → lowercase → espacios→underscore
    'Tipo Zona' → 'tipo_zona'
    'Obs. Promoción' → 'obs._promocion'
    'Apellidoynombre' → 'apellidoynombre'
    'Nro. Caja' → 'nro._caja'
    """
    s = h.strip()
    # Strip diacritics (NFD + remove combining marks)
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r'\s+', '_', s)
    return s


# ─── Converters (mirrors excelProcessor.ts) ──────────────────────────────────

def to_str(v) -> str | None:
    if v is None or str(v).strip() == '':
        return None
    return str(v).strip()


def to_num(v) -> float | None:
    """Parses standard numeric strings. Comma as decimal separator."""
    if v is None or str(v).strip() == '':
        return None
    s = str(v).strip().replace(',', '.').replace(' ', '')
    try:
        n = float(s)
        return None if math.isnan(n) else n
    except ValueError:
        return None


def to_money(v) -> float | None:
    """
    Parses Argentine monetary format: '$12.500,00' → 12500.0
    Rule: if comma present → dots are thousand separators (remove), comma=decimal.
          if no comma → parse as-is (standard dot decimal).
    Also handles US format '$52,350.00' correctly via the same rule
    (comma present → dots removed (none), comma→dot → '52.350.00' ← wait, see below).

    US '$52,350.00':
      comma present → remove dots: '$52,350.00' → no dots → '$52,350.00'
      replace comma with dot → '52.350.00' ← two dots, float() would fail.
    So US format won't parse cleanly. Use --us-money flag to swap the logic.
    """
    if v is None or str(v).strip() == '':
        return None
    s = str(v).strip().replace('$', '').replace(' ', '')
    if s == '':
        return None
    if ',' in s:
        # Argentine: dots=thousands, comma=decimal
        s = s.replace('.', '').replace(',', '.')
    try:
        n = float(s)
        return None if math.isnan(n) else n
    except ValueError:
        return None


def to_money_us(v) -> float | None:
    """
    US format: '$52,350.00' (comma=thousands, dot=decimal).
    Strip $ and commas, parse dot as decimal.
    """
    if v is None or str(v).strip() == '':
        return None
    s = str(v).strip().replace('$', '').replace(',', '').replace(' ', '')
    if s == '':
        return None
    try:
        n = float(s)
        return None if math.isnan(n) else n
    except ValueError:
        return None


def to_num_comma(v) -> float | None:
    """Quantities with comma as decimal separator: '1,00' → 1.0"""
    if v is None or str(v).strip() == '':
        return None
    s = str(v).strip().replace(' ', '').replace(',', '.')
    try:
        n = float(s)
        return None if math.isnan(n) else n
    except ValueError:
        return None


_DDMM_RE = re.compile(
    r'^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$'
)

def parse_flex_date(v) -> datetime | None:
    """
    Accepts:
      DD/MM/YYYY
      DD/MM/YYYY HH:MM
      DD/MM/YYYY HH:MM:SS
      YYYY-MM-DD
      YYYY-MM-DDTHH:MM
      ISO 8601 with Z
    Returns timezone-aware datetime (UTC).
    """
    if v is None or str(v).strip() == '':
        return None
    s = str(v).strip()
    m = _DDMM_RE.match(s)
    if m:
        day, month, year, time_part = m.groups()
        time_part = time_part or '00:00:00'
        if len(time_part) == 5:
            time_part += ':00'
        iso = f'{year}-{month.zfill(2)}-{day.zfill(2)}T{time_part}'
        try:
            return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    # Try ISO / any other format Python understands
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return datetime.strptime(s.rstrip('Z'), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def to_date(v) -> str | None:
    """Returns 'YYYY-MM-DD' or None."""
    d = parse_flex_date(v)
    return d.strftime('%Y-%m-%d') if d else None


def to_timestamp(v) -> str | None:
    """Returns ISO 8601 with Z suffix (timestamptz) or None."""
    d = parse_flex_date(v)
    return d.strftime('%Y-%m-%dT%H:%M:%SZ') if d else None


def to_hora(v) -> str | None:
    """
    Converts to 'HH:MM'.
    Accepts:
      'HH:MM' or 'HH:MM:SS'        → truncated to 'HH:MM'
      Excel day-fraction (0.4375)   → '10:30'
      Integer hour 0-23 ('20')      → '20:00'  (POS CSV export format)
    """
    if v is None or str(v).strip() == '':
        return None
    s = str(v).strip()
    if re.match(r'^\d{1,2}:\d{2}', s):
        return s[:5]
    s_norm = s.replace(',', '.')
    try:
        n = float(s_norm)
        if 0 <= n < 1:
            # Excel day-fraction: 0.4375 → 10:30
            total_mins = round(n * 1440)
            hh = total_mins // 60
            mm = total_mins % 60
            return f'{hh:02d}:{mm:02d}'
        if n == int(n) and 0 <= int(n) <= 23:
            # Plain hour integer from CSV: 20 → '20:00'
            return f'{int(n):02d}:00'
    except ValueError:
        pass
    return s  # fallback: return as-is


def to_int(v) -> int | None:
    """Converts to int, returning None (→ empty CSV cell) if empty or unparseable."""
    n = to_num(v)
    return int(n) if n is not None else None


def to_bool(v) -> bool | None:
    if v is None or str(v).strip() == '':
        return None
    s = str(v).lower().strip()
    if s in ('s', 'si', 'sí', 'true', '1'):
        return True
    if s in ('n', 'no', 'false', '0'):
        return False
    return None


# ─── Row mappers ──────────────────────────────────────────────────────────────

def map_ventas(row: dict, org_id: str, location_id: str,
               money_fn=to_money) -> dict:
    """
    Mirrors mapVentas() in excelProcessor.ts.
    Row keys must already be normalized via normalize_header().
    """
    return {
        'org_id':          org_id,
        'location_id':     location_id,
        'external_id':     to_str(row.get('numero')),
        'sucursal':        to_str(row.get('sucursal')),
        'fecha':           to_date(row.get('fecha')),
        'fecha_inicio':    to_timestamp(row.get('fecha_inicio')),
        'fecha_cierre':    to_timestamp(row.get('fecha_cierre')),
        'fecha_caja':      to_date(row.get('fecha_caja')),
        'hora':            to_int(row.get('hora')),
        # In CSV export, totals arrive as "$52,350.00" (formatted string) → use money_fn.
        # In Excel upload, cells are plain numbers → to_num handles them fine.
        'total':           money_fn(row.get('total')),
        'descuento':       money_fn(row.get('descuento')),
        'recargo':         to_int(row.get('recargo')),
        'comensales':      to_int(row.get('comensales')),
        'cantidad_documentos': to_int(row.get('cantidad_documentos')),
        'tipo_documento':  to_str(row.get('tipo_documento')),
        'formas_pago':     to_str(row.get('formas_pago')),
        'camarero':        to_str(row.get('camarero')),
        'camarero_nombre': to_str(row.get('camarero_nombre')),
        'obs_promocion':   to_str(row.get('obs._promocion')),
        'promocion':       to_str(row.get('promocion')),
        'cliente':         to_str(row.get('cliente')),
        'tipo_zona':       to_str(row.get('tipo_zona')),
        'zona':            to_str(row.get('zona')),
        'punto_venta':     to_str(row.get('punto_venta')),
        'turno':           to_str(row.get('turno')),
        'usuario':         to_str(row.get('usuario')),
        'tipo_sucursal':   to_str(row.get('tipo_sucursal')),
    }


def map_items(row: dict, org_id: str, location_id: str,
              money_fn=to_money) -> dict:
    """
    Mirrors mapItems() in excelProcessor.ts.
    Row keys must already be normalized via normalize_header().
    """
    return {
        'org_id':                  org_id,
        'location_id':             location_id,
        'external_id':             to_str(row.get('numero')),
        'numero_ticket':           to_str(row.get('numero')),
        'sucursal':                to_str(row.get('sucursal')),
        'punto_venta':             to_str(row.get('punto_venta')),
        'camarero':                to_int(row.get('camarero')),
        'camarero_nombre':         to_str(row.get('camarero_nombre')),
        'apellido_nombre':         to_str(row.get('apellidoynombre')),
        'tipo_documento':          to_str(row.get('tipo_documento')),
        'tipo_sucursal':           to_str(row.get('tipo_sucursal')),
        'tipo_zona':               to_str(row.get('tipo_zona')),
        'zona':                    to_str(row.get('zona')),
        'zona_id':                 to_int(row.get('zona_id')),
        'turno':                   to_str(row.get('turno')),
        'familia':                 to_str(row.get('familia')),
        'subfamilia':              to_str(row.get('subfamilia')),
        'descripcion':             to_str(row.get('descripcion')),
        'marca':                   to_str(row.get('marca')),
        'codigo':                  to_int(row.get('codigo')),
        'es_variacion':            to_str(row.get('es_variacion')),
        'dia_caja':                to_str(row.get('dia_caja')),
        'mes_caja':                to_str(row.get('mes_caja')),
        'anio_caja':               to_str(row.get('anio_caja')),
        'nro_caja':                to_int(row.get('nro._caja')),
        'hora_item':               to_int(row.get('hora_item')),
        'fecha_documento':         to_date(row.get('fecha_documento')),
        'fecha_caja':              to_date(row.get('fecha_caja')),
        'fecha_inicio':            to_timestamp(row.get('fecha_inicio')),
        'fecha_cierre':            to_timestamp(row.get('fecha_cierre')),
        'fecha_item':              to_timestamp(row.get('fecha_item')),
        'cantidad':                to_num_comma(row.get('cantidad')),
        'precio_unitario':         money_fn(row.get('precio_unitario')),
        'precio_total':            money_fn(row.get('precio_total')),
        'descuento_item':          money_fn(row.get('descuento_item')),
        'recargo_item':            money_fn(row.get('recargo_item')),
        'descuento_global':        money_fn(row.get('descuento_global')),
        'recargo_global':          money_fn(row.get('recargo_global')),
        'promocion':               to_str(row.get('promocion')),
        'observaciones_promocion': to_str(row.get('observaciones_promocion')),
    }


# ─── CSV I/O ──────────────────────────────────────────────────────────────────

def detect_delimiter(path: Path, encoding: str) -> str:
    with open(path, newline='', encoding=encoding) as f:
        sample = f.read(4096)
    semicolons = sample.count(';')
    commas = sample.count(',')
    return ';' if semicolons > commas else ','


def read_csv(path: Path, encoding: str, delimiter: str) -> list[dict]:
    with open(path, newline='', encoding=encoding) as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        rows = list(reader)
    # Normalize all keys
    normalized = []
    for row in rows:
        normalized.append({normalize_header(k): v for k, v in row.items()})
    return normalized


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        print('No rows to write.', file=sys.stderr)
        return
    fieldnames = list(rows[0].keys())
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Transforma CSV del POS al formato de Supabase (FARO).',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('table', choices=['ventas', 'items'],
                        help='Tipo de tabla destino')
    parser.add_argument('input',  type=Path, help='CSV de entrada')
    parser.add_argument('output', type=Path, help='CSV de salida (listo para Supabase)')
    parser.add_argument('--org-id',      required=True, help='UUID de la organización')
    parser.add_argument('--location-id', required=True, help='UUID del local')
    parser.add_argument('--encoding',    default='utf-8-sig',
                        help='Encoding del CSV (default: utf-8-sig)')
    parser.add_argument('--delimiter',   default=None,
                        help='Separador de columnas (default: auto-detect)')
    parser.add_argument('--us-money',    action='store_true',
                        help='Formato monetario US ($52,350.00) en vez de argentino ($52.350,00)')
    parser.add_argument('--dry-run',     action='store_true',
                        help='Muestra primeras 5 filas transformadas sin escribir')
    args = parser.parse_args()

    if not args.input.exists():
        sys.exit(f'Error: archivo no encontrado: {args.input}')

    # Auto-detect delimiter if not specified
    delimiter = args.delimiter or detect_delimiter(args.input, args.encoding)
    print(f'Delimiter: {repr(delimiter)}', file=sys.stderr)

    # Read
    rows = read_csv(args.input, args.encoding, delimiter)
    print(f'Filas leídas: {len(rows)}', file=sys.stderr)
    if rows:
        print(f'Headers normalizados: {list(rows[0].keys())}', file=sys.stderr)

    # Map
    money_fn = to_money_us if args.us_money else to_money
    mapper = map_ventas if args.table == 'ventas' else map_items
    mapped = [mapper(r, args.org_id, args.location_id, money_fn) for r in rows]

    # Dry run
    if args.dry_run:
        import json
        print('\n--- Primeras 5 filas transformadas ---')
        for row in mapped[:5]:
            print(json.dumps(row, ensure_ascii=False, default=str))
        print(f'\nTotal: {len(mapped)} filas (no se escribió ningún archivo)')
        return

    # Warn about nulls in key columns
    null_ids = sum(1 for r in mapped if not r.get('external_id'))
    if null_ids:
        print(f'⚠  {null_ids} filas sin external_id (columna "numero" vacía o ausente)',
              file=sys.stderr)

    if args.table == 'ventas':
        null_fecha = sum(1 for r in mapped if not r.get('fecha'))
        if null_fecha:
            print(f'⚠  {null_fecha} filas con fecha inválida o vacía', file=sys.stderr)

    # Write
    write_csv(args.output, mapped)
    print(f'OK: {len(mapped)} filas escritas en {args.output}')


if __name__ == '__main__':
    main()

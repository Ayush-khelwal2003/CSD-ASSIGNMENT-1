"""
KML/KMZ Contour Parser
Extracts contour line features and elevation metadata from KML or KMZ files.
Supports elevation from: <name>, <ExtendedData>, <description>, coordinate Z.
"""

import re
import zipfile
import io
from collections import Counter
import xml.etree.ElementTree as ET
from typing import Any


def parse_contour_file(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Parse a KML or KMZ buffer and return features + metadata."""
    ext = filename.rsplit('.', 1)[-1].lower()
    if ext == 'kmz':
        kml_bytes = _extract_kml_from_kmz(file_bytes)
    elif ext == 'kml':
        kml_bytes = file_bytes
    else:
        raise ValueError(f"Unsupported file format: {filename}. Use .kml or .kmz")

    return _parse_kml(kml_bytes)


# ─── KMZ extraction ─────────────────────────────────────────────────────────

def _extract_kml_from_kmz(kmz_bytes: bytes) -> bytes:
    try:
        with zipfile.ZipFile(io.BytesIO(kmz_bytes)) as z:
            kml_names = [n for n in z.namelist() if n.lower().endswith('.kml')]
            if not kml_names:
                raise ValueError("No KML file found inside KMZ archive")
            # Prefer root-level or doc.kml
            preferred = [n for n in kml_names if '/' not in n or n.lower() == 'doc.kml']
            target = preferred[0] if preferred else kml_names[0]
            return z.read(target)
    except zipfile.BadZipFile:
        raise ValueError("Failed to open KMZ: not a valid ZIP archive")


# ─── KML parsing ────────────────────────────────────────────────────────────

def _parse_kml(kml_bytes: bytes) -> dict[str, Any]:
    kml_str = kml_bytes.decode('utf-8', errors='replace')

    # Remove XML namespaces and prefixes completely
    kml_str = re.sub(r'xmlns(?::\w+)?="[^"]*"', '', kml_str)
    kml_str = re.sub(r'</?[\w-]+:', '<', kml_str)  # strip namespace prefixes like <gx:MultiGeometry> or </gx:MultiGeometry>
    kml_str = re.sub(r'\s[\w-]+:', ' ', kml_str)   # strip attribute prefixes

    try:
        root = ET.fromstring(kml_str)
    except ET.ParseError as e:
        raise ValueError(f"Malformed KML XML: {e}")

    contour_features = []

    for placemark in root.iter('Placemark'):
        feature = _extract_feature(placemark)
        if feature and feature['geometry']['type'] == 'LineString':
            contour_features.append(feature)

    if not contour_features:
        raise ValueError(
            "No contour lines found in the KML file. "
            "Ensure the file contains LineString geometries with elevation data."
        )

    features_with_elev = [f for f in contour_features if f['properties']['elevation'] is not None]
    if not features_with_elev:
        raise ValueError(
            "No elevation information found. "
            "Elevation must be in <name>, <description>, <ExtendedData>, or coordinate Z."
        )

    # ── Metadata ──────────────────────────────────────────────────────────
    elevations = sorted(f['properties']['elevation'] for f in features_with_elev)
    unique_elevs = sorted(set(elevations))

    all_coords = [c for f in features_with_elev for c in f['geometry']['coordinates']]
    lngs = [c[0] for c in all_coords]
    lats = [c[1] for c in all_coords]

    # Infer most common contour interval
    diffs = [round(unique_elevs[i+1] - unique_elevs[i], 4)
             for i in range(len(unique_elevs) - 1) if unique_elevs[i+1] > unique_elevs[i]]
    contour_interval = Counter(diffs).most_common(1)[0][0] if diffs else 1.0

    return {
        'features': features_with_elev,
        'metadata': {
            'contourCount': len(features_with_elev),
            'minElevation': elevations[0],
            'maxElevation': elevations[-1],
            'uniqueElevations': len(unique_elevs),
            'contourInterval': contour_interval,
            'bounds': {
                'minLng': min(lngs),
                'maxLng': max(lngs),
                'minLat': min(lats),
                'maxLat': max(lats),
            }
        }
    }


def _extract_feature(placemark: ET.Element) -> dict | None:
    linestring = placemark.find('LineString')
    if linestring is None:
        return None

    coords_elem = linestring.find('coordinates')
    if coords_elem is None or not coords_elem.text:
        return None

    coords = _parse_coordinates(coords_elem.text.strip())
    if len(coords) < 2:
        return None

    elevation = _extract_elevation(placemark, coords)

    return {
        'type': 'Feature',
        'properties': {
            'elevation': elevation,
            'name': _get_text(placemark, 'name'),
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': coords,
        }
    }


def _parse_coordinates(text: str) -> list[list[float]]:
    """Parse 'lng,lat[,alt] ...' into [[lng, lat], ...]."""
    coords = []
    for token in text.split():
        parts = token.split(',')
        if len(parts) >= 2:
            try:
                lng, lat = float(parts[0]), float(parts[1])
                if -180 <= lng <= 180 and -90 <= lat <= 90:
                    coords.append([lng, lat])
            except ValueError:
                continue
    return coords


def _extract_elevation(placemark: ET.Element, coords: list) -> float | None:
    """Try multiple sources to extract elevation. Same priority as Node.js version."""

    # 1. <name> tag — most common for contour KML exports
    name = _get_text(placemark, 'name')
    if name:
        val = _try_float(name)
        if val is not None:
            return val

    # 2. <ExtendedData> / <SimpleData> with elev/alt/height/contour/z attribute
    for sd in placemark.iter('SimpleData'):
        attr = sd.get('name', '')
        if re.search(r'elev|alt|height|contour|z', attr, re.I):
            val = _try_float(sd.text or '')
            if val is not None:
                return val

    # 3. <description> — look for patterns like "elevation=275" or bare number
    desc = _get_text(placemark, 'description')
    if desc:
        m = re.search(r'(?:elevation|elev|altitude|alt|height|contour)\s*[=:]\s*(-?[\d.]+)', desc, re.I)
        if m:
            val = _try_float(m.group(1))
            if val is not None:
                return val
        m2 = re.match(r'^(-?[\d.]+)\s*$', desc)
        if m2:
            val = _try_float(m2.group(1))
            if val is not None:
                return val

    return None


def _get_text(element: ET.Element, tag: str) -> str | None:
    """Get direct-child text content."""
    child = element.find(tag)
    if child is not None and child.text:
        return child.text.strip()
    return None


def _try_float(s: str) -> float | None:
    """Parse a float from string, return None if invalid or out of range."""
    try:
        val = float(s.strip())
        if 0 <= val <= 9000:   # reasonable global elevation range (m)
            return val
    except (ValueError, AttributeError):
        pass
    return None

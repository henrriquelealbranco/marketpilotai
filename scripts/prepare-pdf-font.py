"""Optional asset regeneration. Runtime/build use the committed TTF without Python.

Requires fontTools with WOFF2/Brotli support. Source is the same locally bundled
Inter as the web. Instancing avoids variable WOFF2 subsetting errors in PDFKit.
"""
from pathlib import Path
from shutil import copyfile
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1]
source = root / 'node_modules/@fontsource-variable/inter'
target = root / 'apps/api/assets/fonts'
target.mkdir(parents=True, exist_ok=True)
font = TTFont(source / 'files/inter-latin-wght-normal.woff2')
font = instantiateVariableFont(font, {'wght': 400}, inplace=True)
font.flavor = None
font.save(target / 'Inter-Regular.ttf')
copyfile(source / 'LICENSE', target / 'LICENSE')
print('Prepared static Inter with its SIL Open Font License.')

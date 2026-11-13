"""Read-only verification of inputs/model; updates only this outfit's report."""
from pathlib import Path
import base64, hashlib, io, json, sys

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[2]
sys.path.insert(0, str(WORKSPACE / '.tools/psd-export'))
from PIL import Image
import numpy as np

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
protected = read(ROOT / 'protected-input-hashes.json')
changed = [p for p, h in protected.items() if not (WORKSPACE / p).is_file() or sha(WORKSPACE / p) != h]
assert not changed, changed
art = read(ROOT / 'validation.json')
for p, h in art['source_hashes'].items():
    assert sha(Path(p)) == h, p
report_path = ROOT / 'rig-validation/validation.json'
report = read(report_path)
structure = report['structure']
source = ROOT.parents[1] / 'iki-ready/mikan-auto-rig-v3.iki'
variant = ROOT / 'mikan-gothic-blouse-v1.iki'
body_path = ROOT / 'body-gothic-blouse.png'
assert sha(source) == structure['source_sha256']
assert sha(variant) == structure['variant_sha256']
assert sha(body_path) == structure['body_png_sha256']
old, new = read(source), read(variant)
assert old['name'] != new['name']
decode = lambda model: Image.open(io.BytesIO(base64.b64decode(model['textures'][1]['source'].split(',')[1]))).convert('RGBA')
texture = decode(new)
body = Image.open(body_path)
assert body.size == (1280, 1280) and body.mode == 'RGBA'
assert texture.size == (899, 864)
assert np.array_equal(np.array(texture), np.array(body.crop((164, 416, 1063, 1280))))
assert np.array_equal(np.array(texture)[:, :, 3], np.array(decode(old))[:, :, 3])
new['name'] = old['name']
new['textures'][1]['source'] = old['textures'][1]['source']
assert new == old
original_body = np.array(Image.open(ROOT / 'body-original-v3.png').convert('RGBA'))
current_body = np.array(body)
mask = np.array(Image.open(ROOT / 'target-blouse-mask.png').convert('L')) > 0
assert np.array_equal(original_body[:, :, 3], current_body[:, :, 3])
assert np.array_equal(original_body[~mask], current_body[~mask])
assert not report['render']['failed_textures']
assert not report['render']['fold_offenders'] and not report['render']['physics_offenders']
assert len(report['render']['matched_pixels']) == 25
assert all(all(check.values()) for check in report['render']['matched_pixels'].values())
assert report['motion']['parameter_traces_identical']
assert all(not failures for failures in report['motion']['failed_textures'].values())
with Image.open(ROOT / 'rig-validation/physics-preview.webp') as animation:
    assert animation.n_frames == 144
report['final_verification'] = {
    'protected_files_checked': len(protected), 'changed_protected_files': changed,
    'source_artwork_hashes_verified': True, 'delivered_model_hash_verified': True,
    'embedded_body_matches_crop': True, 'full_canvas_alpha_identical': True,
    'pixels_outside_clothing_identical': True, 'only_name_and_body_texture_changed': True,
    'animated_preview_frames': 144, 'model_bytes': variant.stat().st_size,
    'live_application_picker_tested': False,
}
report['visual_assessment'] = {
    'basis': 'Inspected neutral, pose, garment, facial, gaze, desktop-size sheets and sampled physics frames.',
    'blocking': [],
    'acceptable': ['Mild softened cloth extension at inner underarms and cuffs, chiefly visible enlarged.',
                   'Ruffles compressed above existing shorts; cuff frills and ribbon ends contained by original silhouette.',
                   'Lace backed with dark cloth to preserve alpha; decorative elements use existing body deformation.'],
    'pre_existing': ['Underarm cutout edges and hair showing through.', 'Extreme facial and mouth crossfade limitations of v3.'],
    'manual_next_step': 'Select the delivered model through the existing custom outfit picker and assess live desktop appearance.',
}
report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report['final_verification'], indent=2))

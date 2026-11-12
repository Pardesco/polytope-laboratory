import base64
from copy import deepcopy
import io
import json
from pathlib import Path
import pytest
from PIL import Image
from engine.server import dispatch
from engine.generators import regular
from engine.formats import save_project, load_file
from engine.material_effects_state import validate_material_effects
from engine.material_environment import validate_environment_asset
from engine.geometry import GeometryError
from engine.nets import unfold
from engine.net_printing import pack_net

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/material-environment.json').read_text())


def imported(encoded=None, model=None):
    return dispatch(
        {
            'op': 'material-environment',
            'model': model or regular('cube'),
            'params': {'pngBase64': encoded or FIXTURE['pngBase64']},
        }
    )


def test_native_import_normalizes_pixels_and_preserves_source():
    model = regular('cube')
    before = deepcopy(model)
    asset = imported(model=model)
    assert model == before
    assert (asset['width'], asset['height']) == (32, 16)
    with Image.open(io.BytesIO(base64.b64decode(FIXTURE['pngBase64']))) as source:
        with Image.open(io.BytesIO(base64.b64decode(asset['base64']))) as normalized:
            assert source.convert('RGBA').tobytes() == normalized.tobytes()
    assert validate_environment_asset(asset) == asset


@pytest.mark.parametrize('mode', ['reflection', 'refraction'])
def test_environment_roundtrip_keeps_assets_camera_source_and_print_pages(tmp_path, mode):
    model = regular('cube')
    view = {
        'materialEffects': {
            'reflection': 'image',
            'environmentAsset': imported(),
            'environmentMode': mode,
            'refractiveIndex': 1.7,
            'reflectivity': 0.8,
        },
        'camera': {'position': [4, 3, 5], 'target': [0, 0, 0]},
    }
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [{'model': model, 'view': view, 'notes': 'Portable environment'}]}],
    }
    before = deepcopy(project)
    target = tmp_path / 'environment.polyproj'
    save_project(target, project)
    restored = load_file(target)['project']
    state = restored['documents'][0]['states'][0]
    assert state['view'] == view
    assert state['model']['vertices'] == model['vertices']
    assert project == before
    # Paper output is source face colors/content, not a camera-dependent optical bake.
    assert pack_net(unfold(state['model']))['pages'] == pack_net(unfold(model))['pages']
    assert 'data:image' not in pack_net(unfold(state['model']))['pages'][0]['svg']


@pytest.mark.parametrize(
    'mutation',
    [
        lambda a: a.update(width=30),
        lambda a: a.update(height=True),
        lambda a: a.update(url='file:///image.png'),
        lambda a: a.update(base64='invalid'),
        lambda a: a.update(mime='image/jpeg'),
        lambda a: a.update(width=2048, height=1024),
    ],
)
def test_project_rejects_forged_asset_records(mutation):
    asset = imported()
    mutation(asset)
    with pytest.raises(GeometryError):
        validate_material_effects({'reflection': 'image', 'environmentAsset': asset})


@pytest.mark.parametrize('dimensions', [(16, 16), (32, 8), (2048, 1024)])
def test_import_rejects_non_panorama_or_oversize_decodes(dimensions):
    buffer = io.BytesIO()
    Image.new('RGB', dimensions).save(buffer, format='PNG')
    with pytest.raises(GeometryError, match='2:1'):
        imported(base64.b64encode(buffer.getvalue()).decode('ascii'))


def test_import_rejects_corrupt_bytes_missing_asset_and_4d():
    raw = bytearray(base64.b64decode(FIXTURE['pngBase64']))
    raw[-1] ^= 1
    with pytest.raises(GeometryError, match='checksum'):
        imported(base64.b64encode(raw).decode('ascii'))
    with pytest.raises(GeometryError, match='3D'):
        imported(model=regular('tesseract'))
    with pytest.raises(GeometryError, match='Import'):
        validate_material_effects({'reflection': 'image'})
    with pytest.raises(GeometryError):
        imported('a' * (6 * 1024 * 1024))

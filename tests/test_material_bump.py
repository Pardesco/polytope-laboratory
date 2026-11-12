import base64
from copy import deepcopy
import io
import json
from pathlib import Path
import pytest
from PIL import Image, PngImagePlugin
from engine.server import dispatch
from engine.generators import regular
from engine.formats import save_project, load_file, validate_project
from engine.material_effects_state import validate_material_effects
from engine.material_bump import validate_bump_asset
from engine.geometry import GeometryError
from engine.nets import unfold
from engine.net_printing import pack_net

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/material-bump.json').read_text())


def imported(encoded=None, model=None, params=None):
    return dispatch(
        {
            'op': 'material-bump',
            'model': model or regular('cube'),
            'params': params if params is not None else {'pngBase64': encoded or FIXTURE['pngBase64']},
        }
    )


def png(image, metadata=False):
    buffer = io.BytesIO()
    info = PngImagePlugin.PngInfo()
    if metadata:
        info.add_text('Description', 'Must not survive normalization')
    image.save(buffer, format='PNG', pnginfo=info)
    return base64.b64encode(buffer.getvalue()).decode('ascii')


def test_native_decoded_height_oracle_and_metadata_removal():
    model = regular('cube')
    before = deepcopy(model)
    asset = imported(model=model)
    assert model == before
    assert (asset['width'], asset['height']) == (16, 8)
    with Image.open(io.BytesIO(base64.b64decode(asset['base64']))) as image:
        assert image.mode == 'RGBA'
        assert image.tobytes() == bytes(c for y in range(8) for x in range(16) for c in (12 * x + 8 * y,) * 3 + (255,))
        # Central differences: d(height)/du = 192/255; image top faces +Y.
        for x in range(1, 15):
            assert (image.getpixel((x + 1, 3))[0] - image.getpixel((x - 1, 3))[0]) / 255 * 8 == pytest.approx(192 / 255)
        assert (image.getpixel((3, 2))[0] - image.getpixel((3, 4))[0]) / 255 * 4 == pytest.approx(-64 / 255)
        decorated = png(image, metadata=True)
    assert imported(decorated) == asset
    assert validate_bump_asset(asset) == asset


def test_grayscale_transparency_preserves_samples_without_premultiplication():
    image = Image.new('RGBA', (2, 2))
    image.putdata([(10, 10, 10, 0), (90, 90, 90, 64), (200, 200, 200, 128), (255, 255, 255, 255)])
    with Image.open(io.BytesIO(base64.b64decode(imported(png(image))['base64']))) as result:
        assert result.tobytes() == image.tobytes()


def test_project_file_roundtrip_retains_asset_camera_owner_and_print_output(tmp_path):
    model = regular('cube')
    view = {
        'materialEffects': {'bump': 'image', 'bumpAsset': imported(), 'bumpStrength': 0.07, 'bumpFrequency': 2},
        'camera': {'position': [4, 3, 5], 'target': [0, 0, 0]},
        'coordinateUnit': 'mm',
    }
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [{'model': model, 'view': view, 'notes': 'Portable bump'}]}],
    }
    before = deepcopy(project)
    target = tmp_path / 'bump.polyproj'
    save_project(target, project)
    state = load_file(target)['project']['documents'][0]['states'][0]
    assert state['view'] == view
    assert state['model']['vertices'] == model['vertices']
    assert state['model']['faces'] == model['faces']
    assert project == before
    assert pack_net(unfold(state['model']))['pages'] == pack_net(unfold(model))['pages']
    # A forged asset must fail project adoption too, including when currently off.
    project['documents'][0]['states'][0]['view']['materialEffects']['bumpAsset']['width'] = 12
    with pytest.raises(GeometryError):
        validate_project(project)


@pytest.mark.parametrize(
    'mutation',
    [
        lambda a: a.update(width=12),
        lambda a: a.update(height=True),
        lambda a: a.update(base64='invalid'),
        lambda a: a.update(url='file:///map.png'),
        lambda a: a.update(mime='image/jpeg'),
    ],
)
def test_saved_record_refuses_forgery(mutation):
    asset = imported()
    mutation(asset)
    with pytest.raises(GeometryError):
        validate_material_effects({'bump': 'none', 'bumpAsset': asset})


@pytest.mark.parametrize(
    'image',
    [
        Image.new('L', (1, 4)),
        Image.new('L', (513, 4)),
        Image.new('RGB', (2, 2), (127, 127, 255)),
        Image.new('I;16', (2, 2)),
    ],
)
def test_unsupported_size_normal_map_and_16bit_refused(image):
    with pytest.raises(GeometryError):
        imported(png(image))


def test_crc_base64_domain_and_params_refused():
    raw = bytearray(base64.b64decode(FIXTURE['pngBase64']))
    raw[-1] ^= 1
    with pytest.raises(GeometryError, match='checksum'):
        imported(base64.b64encode(raw).decode('ascii'))
    for params in [
        {},
        {'pngBase64': 'bad!'},
        {'pngBase64': 'A' * (6 * 1024 * 1024)},
        {'url': 'https://example.com/map.png'},
    ]:
        with pytest.raises(GeometryError):
            imported(params=params)
    with pytest.raises(GeometryError, match='3D'):
        imported(model=regular('tesseract'))
    with pytest.raises(GeometryError, match='Import'):
        validate_material_effects({'bump': 'image'})


def test_noncanonical_metadata_cannot_be_smuggled_into_a_saved_asset():
    asset = imported()
    with Image.open(io.BytesIO(base64.b64decode(asset['base64']))) as image:
        asset['base64'] = png(image, metadata=True)
    with pytest.raises(GeometryError, match='normalized'):
        validate_bump_asset(asset)

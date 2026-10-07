import hashlib

import pytest

from engine.formats import export_off, load_file
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.server import dispatch


def fixture(tmp_path):
    model=regular('cube')
    rows=export_off(model).splitlines()
    rows[1]='8 6 13'
    source=tmp_path/'original.off'
    raw=b'\xef\xbb\xbf'+('\r\n'.join(rows)+'\r\n').encode()
    source.write_bytes(raw)
    return model,source,raw


def test_native_copy_operation_preserves_original_and_records_byte_provenance(tmp_path):
    model,source,raw=fixture(tmp_path)
    destination=tmp_path/'copy.off'
    result=dispatch({'op':'library-edge-count-copy','params':{'source_path':str(source),'output_path':str(destination)}})
    assert source.read_bytes()==raw
    assert result['correction']['sourceFileSha256']==hashlib.sha256(raw).hexdigest()
    assert result['correction']['derivedEdges']==12
    assert identity(load_file(destination)['model'])==identity(model)
    assert b'\r\n' in destination.read_bytes()


def test_copy_operation_refuses_original_or_existing_destination(tmp_path):
    _,source,raw=fixture(tmp_path)
    with pytest.raises(GeometryError,match='separate corrected copy'):
        dispatch({'op':'library-edge-count-copy','params':{'source_path':str(source),'output_path':str(source)}})
    destination=tmp_path/'existing.off';destination.write_bytes(b'Keep this file')
    with pytest.raises(FileExistsError):
        dispatch({'op':'library-edge-count-copy','params':{'source_path':str(source),'output_path':str(destination)}})
    assert source.read_bytes()==raw and destination.read_bytes()==b'Keep this file'

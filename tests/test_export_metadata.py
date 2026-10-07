import json
from copy import deepcopy
from engine.generators import regular
from engine.export_context import prepare_export
from engine.formats import export_model

def test_project_metadata_json_export_preserves_source_and_physical_units():
    source=regular('cube');original=deepcopy(source)
    metadata={'title':'Research cube','author':'Randall','custom':{'reference':7}}
    prepared=prepare_export(source,'json','mm','cm',document_metadata=metadata,notes='Source notes')
    exported=json.loads(export_model(prepared['model'],'json'))
    assert exported['metadata']['documentMetadata']==metadata
    assert exported['metadata']['documentNotes']=='Source notes'
    assert exported['metadata']['coordinateUnits']=='cm'
    assert exported['edges']==source['edges'] and exported['faces']==source['faces']
    assert source==original

def test_boundary_export_reports_metadata_loss():
    prepared=prepare_export(regular('cube'),'off',document_metadata={'title':'Research cube'},notes='Source notes')
    assert any('Project metadata and notes' in loss for loss in prepared['report']['losses'])

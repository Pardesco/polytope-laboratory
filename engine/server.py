"""JSON-lines engine protocol and CLI. One isolated process per desktop job."""
import json
import hashlib
import os
import sys
from pathlib import Path

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.generators import CATALOG, generate
from engine.catalog import get_catalog
from engine.regular4d_validation import regular4d_metadata, validate_catalog_regular4d
from engine.geometry import hull, analyze, validate, GeometryError
from engine.analysis_cache import analysis_cache
from engine.operations import dual, truncate, section, vertex_figure, extrude, transform, signed_symmetry, measure
from engine.expressions import evaluate, exact_orientation
from engine.expression_batch import dispatch_expression_batch
from engine.sphere_projection import dispatch_sphere_projection
from engine.element_label_presets import dispatch_element_labels
from engine.formats import load_file, save_project, validate_project, export_model, atomic_write, repair_off_edge_count, MAX_FILE_BYTES
from engine.library import index_library
from engine.library_audit import compile_audit_index
from engine.nets import extract_entity, net_svg, fold_net
from engine.visible_surface import visible_surface
from engine.generalized_nets import unfold_source as unfold, edit_source_net as edit_net, reconstruct_source_net as reconstruct_net
from engine.faceting import facet
from engine.rational import rational_hull, rational_dual
from engine.symmetry import geometric_symmetry
from engine.element_types import element_types
from engine.cell_nets import cell_net,edit_cell_net
from engine.net_printing import pack_net
from engine.incidence_dual import incidence_dual
from engine.measurements import entity_measure,entity_info,dihedrals,align_section
from engine.information_panel import information_panel
from engine.view_orientation import orient_entity
from engine.symmetry_orientation import symmetry_orientation
from engine.compounds import add_models, extract_component, remove_component
from engine.add_dual import add_dual
from engine.cell_facing import classify_cells
from engine.export_context import prepare_export, scale_reference, export_options, require_export_format
from engine.tours import validate_tour
from engine.face_blending import analyze_coincidences, remove_coincident_pairs, blend_faces
from engine.planar_union import blend_regions
from engine.compound_blending import merge_compound
from engine.edge_subdivision import subdivide_edges
from engine.w12_workflow import dispatch_w12
from engine.products import polygon_prism
from engine.prisms import polyhedron_prism
from engine.layer_join_workflow import run_layer_join
from engine.segmentotopes import analyze_strict_segmentotope


def dispatch(request):
    if type(request) is not dict:
        raise GeometryError('Native requests require a JSON object.')
    op = request.get('op')
    if op == 'live-construction-preview':
        from engine.live_constructions import preview_construction
        return preview_construction(request, dispatch)
    if op=='verify-dual-tour':
        from engine.dual_morph_tour import dispatch_verify_dual_tour
        return dispatch_verify_dual_tour(request)
    if op in ('subdivide-faces','conway','axis-zonohedron','add-zones','symmetry-axes'): return dispatch_w12(request)
    if op == 'stellation-cell-graph':
        from engine.stellation_cells import dispatch_stellation_cells
        return dispatch_stellation_cells(request)
    if op == 'element-label-presets': return dispatch_element_labels(request)
    if op in ('vertex-figure-candidates','construct-from-vertex-figure'):
        from engine.vertex_figure_construction_workflow import dispatch_vertex_figure_construction
        return dispatch_vertex_figure_construction(request)
    if op in ('net-reinforcement','net-measurements','net-reinforcement-pages'):
        from engine.net_reinforcement_workflow import dispatch_reinforcement
        return dispatch_reinforcement(request)
    if op in ('net-reinforcement-parts','net-measurement-export'):
        from engine.net_fabrication import dispatch_fabrication
        return dispatch_fabrication(request)
    if op in ('generalized-density-info','generalized-density-restore'):
        from engine.generalized_density import dispatch_density
        return dispatch_density(request)
    if op in ('coincident-edge-qualify','coincident-edge-net','coincident-edge-edit','coincident-edge-pages','coincident-edge-fold','coincident-edge-restore'):
        from engine.coincident_edge_workflow import dispatch_assembly
        return dispatch_assembly(request)
    if op in ('prepare-dual-morph','evaluate-dual-morph'):
        from engine.dual_morph import dispatch_dual_morph
        return dispatch_dual_morph(request)
    if op == 'facet-diagram':
        from engine.faceting_diagram_workflow import dispatch_diagram
        return dispatch_diagram(request)
    if op == 'facet-diagram-adopt':
        from engine.faceting_diagram_edit import dispatch_diagram_adopt
        return dispatch_diagram_adopt(request)
    if op in ('facet-candidates','facet-search','facet-adopt'):
        from engine.automatic_faceting_workflow import dispatch_faceting
        return dispatch_faceting(request)
    if op == 'expression-batch': return dispatch_expression_batch(request)
    if op == 'regular4d-validate':
        if set(request)-{'op','params','model','id'} or type(request.get('params')) is not dict or set(request['params'])!={'key'}:
            raise GeometryError('Regular4D validation requires source geometry and exactly params.key.')
        return validate_catalog_regular4d(request.get('model'), request['params']['key'])
    if op == 'source-zonohedron':
        from engine.source_zonohedron_workflow import dispatch_source_zonohedron
        return dispatch_source_zonohedron(request)
    if op in ('spring-relaxation','spring-relaxation-preview'):
        from engine.spring_workflow import dispatch_spring
        return dispatch_spring(request)
    if op == 'cell':
        from engine.cell_attributes import dispatch_cell
        return dispatch_cell(request)
    if op == 'place-at-faces':
        from engine.face_placement_workflow import dispatch_placement
        return dispatch_placement(request)
    if op == 'convex-core-4d':
        from engine.convex_core4d_workflow import dispatch_convex_core4d
        return dispatch_convex_core4d(request)
    if op == 'attach-at-faces':
        from engine.augmentation_workflow import dispatch_attachment
        return dispatch_attachment(request)
    if op == 'face-surgery':
        from engine.face_surgery import dispatch_surgery
        return dispatch_surgery(request)
    if op == 'triangular-geodesic':
        from engine.triangular_geodesic_workflow import dispatch_geodesic
        return dispatch_geodesic(request)
    if op in ('incidence-truncate','incidence-truncate-preview'):
        from engine.incidence_truncation import dispatch_incidence_truncation
        return dispatch_incidence_truncation(request)
    if op in ('exact-surface-section','exact-surface-section-preview'):
        from engine.exact_surface_sections import dispatch_exact_section
        return dispatch_exact_section(request)
    if op in ('geometry-fit','geometry-fit-preview'):
        from engine.geometric_fitting import dispatch_geometry_fit
        return dispatch_geometry_fit(request)
    if op == 'geometry-fit-deviation':
        from engine.condition_fitting import near_miss_deviation
        return near_miss_deviation(request.get('model'))
    if op == 'expand-runcinate':
        from engine.static_expansion import dispatch_static_expansion
        return dispatch_static_expansion(request)
    if op == 'projective-incidence-dual':
        from engine.projective_incidence_dual import dispatch_projective
        return dispatch_projective(request)
    if op == 'sphere-project': return dispatch_sphere_projection(request)
    if op == 'convex-core':
        from engine.convex_core_workflow import dispatch_convex_core
        return dispatch_convex_core(request)
    params = dict(request.get('params') or {})
    model = request.get('model')
    if op == 'uniform-compound':
        from engine.uniform_compounds import uniform_compound
        return uniform_compound(**params)
    if op == 'visible-surface': return visible_surface(model, **params)
    if op == 'reflect-source':
        from engine.source_reflection import dispatch_source_reflection
        return dispatch_source_reflection(request)
    if op in ('coincidic-compare','coincidic-record','coincidic-compound'):
        from engine.coincidic_regiments import dispatch_arrangement
        return dispatch_arrangement(request)
    if op == 'catalog': return get_catalog()
    if op == 'coxeter-build':
        from engine.coxeter_builder import build_coxeter
        return build_coxeter(**params)
    if op == 'polychoron-relationships':
        from engine.polychoron_relationships import dispatch_relationships
        return dispatch_relationships(request)
    if op == 'generate':
        result = generate(**params)
        if params.get('kind') == 'regular':
            labels = regular4d_metadata(params.get('key','tesseract'))
            if labels: result.setdefault('metadata', {}).update(labels)
        return result
    if op == 'hull': return hull(params['points'], params.get('name','Convex hull'))
    if op == 'rational-hull': return rational_hull(**params)
    if op == 'rational-dual': return rational_dual(model, **params)
    if op == 'analyze': return analysis_cache.resolve(model,analyze)
    if op == 'element-types': return element_types(model,**params)
    if op == 'information-panel': return information_panel(model,**params)
    if op == 'validate': return validate(model)
    if op == 'validate-project': return validate_project(params['project'])
    if op == 'entity-orientation': return orient_entity(model, **params)
    if op == 'symmetry-orientation': return symmetry_orientation(model, **params)
    if op == 'compound-add': return add_models(model, params['other'])
    if op == 'add-dual': return add_dual(model, **params)
    if op == 'compound-drop': return remove_component(model, params['component_id'])
    if op == 'compound-component': return extract_component(model, params['component_id'])
    if op == 'face-coincidences': return analyze_coincidences(model, **params)
    if op == 'remove-coincident-pairs': return remove_coincident_pairs(model, **params)
    if op == 'blend-faces': return blend_faces(model, **params)
    if op == 'blend-regions': return blend_regions(model, **params)
    if op == 'merge-compound': return merge_compound(model, **params)
    if op == 'pseudo-uniform':
        from engine.pseudo_uniform import pseudo_uniform
        return pseudo_uniform(model, **params)
    if op == 'subdivide-edges': return subdivide_edges(model, **params)
    if op == 'polygon-prism':
        from engine.construction_finalization import finalize_construction
        version = request.get('algorithmVersion', '0.2.0')
        if version not in ('0.1.0', '0.2.0'):
            raise GeometryError('Unsupported polygon-prism algorithm version.')
        result = polygon_prism(model, **params)
        # Recorded 0.13 histories retain their original generalized semantics.
        # Current recipes additionally attach ownership and qualify convexity.
        return result if version == '0.1.0' else finalize_construction(result)
    if op == 'polyhedron-prism':
        from engine.construction_finalization import finalize_construction
        return finalize_construction(polyhedron_prism(model, **params))
    if op in ('convex-layer-join', 'fit-strict-layer-join'):
        if request.get('algorithmVersion', '0.1.0') != '0.1.0':
            raise GeometryError('Unsupported layer-join algorithm version.')
        return run_layer_join(model, params, fit=op == 'fit-strict-layer-join')
    if op == 'analyze-strict-segmentotope':
        if set(params) - {'tolerance'}:
            raise GeometryError('Strict segmentotope analysis accepts only tolerance.')
        return analyze_strict_segmentotope(model, **params)
    if op == 'validate-tour': return validate_tour(params['tour'])
    if op == 'load-tour':
        path=Path(params['path'])
        if path.stat().st_size>MAX_FILE_BYTES:raise GeometryError('Tour exceeds the 128 MiB limit.')
        raw=path.read_bytes()
        if len(raw)>MAX_FILE_BYTES:raise GeometryError('Tour grew beyond the 128 MiB limit.')
        return validate_tour(json.loads(raw.decode('utf-8-sig')))
    if op == 'save-tour':
        tour=validate_tour(params['tour'])
        atomic_write(params['path'],json.dumps(tour,ensure_ascii=False,allow_nan=False,separators=(',',':')))
        return {'path':params['path']}
    if op == 'prepare-export': return prepare_export(model, **params)
    if op == 'prepare-view-export':
        from engine.interchange import prepare_view_export
        return prepare_view_export(model, **params)
    if op == 'prepare-printable-export':
        from engine.printable_export import prepare_printable
        return prepare_printable(model, **params)
    if op == 'export-options': return export_options(model)
    if op == 'scale-reference': return scale_reference(model, **params)
    if op == 'recipe-run':
        from engine.recipes import run_recipe, replay_document, branch_recipe
        return run_recipe(params['document'], params['operation'], params['parameters'], dispatch, params.get('label'))
    if op == 'recipe-branch':
        from engine.recipes import run_recipe, replay_document, branch_recipe
        return branch_recipe(params['document'], params['parameters'], dispatch, params.get('target'))
    if op == 'recipe-replay':
        from engine.recipes import run_recipe, replay_document, branch_recipe
        return replay_document(params['document'], dispatch, params.get('target'))
    if op == 'cell-facing': return classify_cells(model, **params)
    if op == 'dual': return dual(model, **params)
    if op == 'incidence-dual': return incidence_dual(model, **params)
    if op == 'truncate': return truncate(model, **params)
    if op == 'section': return section(model, **params)
    if op == 'vertex-figure': return vertex_figure(model, **params)
    if op == 'extrude': return extrude(model, **params)
    if op == 'transform': return transform(model, **params)
    if op == 'symmetry':
        method=params.pop('method','geometric')
        if method=='geometric':return geometric_symmetry(model,**params)
        if method=='signed-axis':
            if params:raise GeometryError('Signed-axis symmetry does not accept geometric subgroup/frame options.')
            return signed_symmetry(model)
        raise GeometryError('Symmetry method must be geometric or signed-axis.')
    if op == 'measure': return measure(model, **params)
    if op == 'entity-measure': return entity_measure(model, **params)
    if op == 'entity-info': return entity_info(model, **params)
    if op == 'dihedral': return dihedrals(model, **params)
    if op == 'align-section': return align_section(model, **params)
    if op == 'expression': return evaluate(params['expression'])
    if op == 'orientation': return exact_orientation(params['points'])
    if op == 'facet': return facet(model, **params)
    if op == 'arrangement':
        from engine.stellation import arrangement, arrangement_diagram, region_union, enumerate_unions
        return arrangement(model, **params)
    if op == 'arrangement-diagram':
        from engine.stellation import arrangement, arrangement_diagram, region_union, enumerate_unions
        return arrangement_diagram(**params)
    if op == 'stellation-union':
        from engine.stellation import arrangement, arrangement_diagram, region_union, enumerate_unions
        return region_union(source=model, **params)
    if op == 'stellation-enumerate':
        from engine.stellation import arrangement, arrangement_diagram, region_union, enumerate_unions
        return enumerate_unions(source=model, **params)
    if op == 'stellation-diagram-data':
        from engine.stellation_diagrams import diagram_data,enumerate_supported,make_base as stellation_make_base
        return diagram_data(source=model,**params)
    if op == 'stellation-supported-enumerate':
        from engine.stellation_diagrams import diagram_data,enumerate_supported,make_base as stellation_make_base
        return enumerate_supported(source=model,**params)
    if op == 'stellation-miller-enumerate':
        from engine.miller_stellations import enumerate_miller
        return enumerate_miller(source=model,**params)
    if op == 'stellation-make-base':
        from engine.stellation_diagrams import diagram_data,enumerate_supported,make_base as stellation_make_base
        return stellation_make_base(source=model,**params)
    if op == 'element-content-describe':
        from engine.element_content_workflow import describe_content
        if type(params) is not dict or set(params) - {'document', 'reference_edge_mm'} or 'document' not in params:
            raise GeometryError('Content description requires its source-bound document.')
        return describe_content(model, **params)
    if op == 'net':
        result = unfold(model, **params)
        result['svg'] = net_svg(result)
        return result
    if op == 'net-edit':
        result=edit_net(model,**params)
        result['svg']=net_svg(result)
        return result
    if op == 'net-fold':
        net=params.pop('net')
        return fold_net(reconstruct_net(model,net),**params)
    if op=='cell-net':return cell_net(model,**params)
    if op=='cell-net-edit':return edit_cell_net(model,**params)
    if op=='net-pack':return pack_net(reconstruct_net(model,params.pop('net')),**params)
    if op == 'load': return load_file(params['path'])
    if op == 'save': return save_project(params['path'], params['project'])
    if op == 'export':
        require_export_format(model, params['format'])
        if params['format']=='obj':
            from engine.interchange import export_obj_result
            return export_obj_result(model, params.get('path'))
        text = export_model(model, params['format'])
        if params.get('path'):
            atomic_write(params['path'], text)
            return {'path': params['path'], 'bytes': len(text.encode('utf-8'))}
        return {'text': text}
    if op == 'library':
        return index_library(**params)
    if op == 'library-audit-index':
        return compile_audit_index(params['report_path'], params['output_path'])
    if op == 'library-edge-count-copy':
        source=Path(params['source_path'])
        if source.stat().st_size>MAX_FILE_BYTES:raise GeometryError('Source exceeds the 128 MiB import limit.')
        destination=Path(params['output_path'])
        if destination.resolve()==source.resolve():raise GeometryError('Choose a separate corrected copy; source files cannot be overwritten.')
        raw=source.read_bytes()
        if len(raw)>MAX_FILE_BYTES:raise GeometryError('Source grew beyond the 128 MiB import limit.')
        text=raw.decode('utf-8-sig')
        result=repair_off_edge_count(text,source.stem)
        result['correction']['sourceFileSha256']=hashlib.sha256(raw).hexdigest()
        # Exclusive creation also closes a race after the native Save Copy check.
        with destination.open('x',encoding='utf-8',newline='') as stream:
            stream.write(result['text']);stream.flush();os.fsync(stream.fileno())
        return {'path':str(destination),'correction':result['correction']}
    raise GeometryError(f'Unknown operation: {op}')


def main():
    from engine.input_limits import parse_json
    from engine.request_stream import bounded_lines, correlation_id, response_line
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    if os.environ.get('POLYTOPE_STARTUP_PROFILE') == '1':
        print('POLYTOPE_ENGINE_READY', file=sys.stderr, flush=True)
    for line in bounded_lines(sys.stdin.buffer):
        if line is None:
            print(json.dumps({'id':None,'ok':False,'error':'Request exceeds the 128 MiB UTF-8 resource limit.'}), flush=True)
            continue
        request, text = {}, None
        try:
            text = line.decode('utf-8')
            request = parse_json(text)
            result = dispatch(request)
            output = {'id': correlation_id(request), 'ok': True, 'result': result}
        except Exception as exc:
            if not request and text is not None:
                # Strict parsing refused the record (e.g. NaN); still answer the caller's request id.
                try: request = json.loads(text)
                except Exception: request = {}
            correlation = correlation_id(request)
            output = {'id': correlation, 'ok': False, 'error': str(exc), 'type': type(exc).__name__}
        print(response_line(output),flush=True)


if __name__ == '__main__':
    main()

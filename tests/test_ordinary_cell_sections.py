from collections import Counter
from copy import deepcopy
from pathlib import Path
import os,runpy,sys,tempfile,unittest
from unittest.mock import patch
import numpy as np
ROOT=Path(os.environ.get('POLYTOPE_TEST_ROOT',Path(__file__).resolve().parents[1]));sys.path.insert(0,str(ROOT))
from engine import server,element_annotations as content
from engine.ordinary_cell_sections import ordinary_cell_section
from engine.cell_section_regions import planar_regions,triangulate_holes
from engine.geometry import GeometryError,identity,validate
from engine.generators import regular
from engine.operations import section
from engine.recipes import run_recipe,replay_document
from engine.formats import save_project,load_file
from engine.generalized_nets import _shell_geometry
h=runpy.run_path(str(ROOT/'tests/test_incidence_dual_4d.py'));literal=h['literal_concave_4d_boundary'];color=h['color_source']
other=runpy.run_path(str(ROOT/'tests/test_concave_cell_nets.py'))

def product_source(vertices,faces,name):
    # Literal product incidence, without any hull/generator/importer.
    edges=sorted({tuple(sorted(E)) for F in faces for E in zip(F,F[1:]+F[:1])});lookup={E:i for i,E in enumerate(edges)};n=len(vertices);nf=len(faces)
    result={'id':name,'name':name,'dimension':4,'embeddingDimension':4,'interpretation':'generalized-complex',
        'vertices':[P+[w] for w in (-1,1) for P in vertices],
        'edges':[list(E) for E in edges]+[[v+n for v in E] for E in edges]+[[v,v+n] for v in range(n)],
        'faces':deepcopy(faces)+[[v+n for v in F] for F in faces]+[[a,b,b+n,a+n] for a,b in edges],
        'cells':[list(range(nf)),list(range(nf,2*nf))]+[[f,f+nf]+[2*nf+lookup[tuple(sorted(E))] for E in zip(F,F[1:]+F[:1])] for f,F in enumerate(faces)],
        'metadata':{},'numeric':{'mode':'float64-approximate','certified':False}}
    result['fingerprint']=identity(result);result['validation']=validate(result);assert result['validation']['passed'];return color(result)

def disjoint_source():
    polygon=[[0,0],[3,0],[3,3],[2,3],[2,1],[1,1],[1,3],[0,3]];n=len(polygon)
    return product_source([[x,y,z] for z in (-1,1) for x,y in polygon],[list(range(n-1,-1,-1)),list(range(n,2*n))]+[[i,(i+1)%n,(i+1)%n+n,i+n] for i in range(n)],'Literal U-prism x interval')

def hole_source():
    ring=[[0,0],[4,0],[4,4],[0,4],[1,1],[3,1],[3,3],[1,3]]
    quads=[[i,(i+1)%4,(i+1)%4+4,i+4] for i in range(4)]
    faces=[Q[::-1] for Q in quads]+[[v+8 for v in Q] for Q in quads]+[[i,(i+1)%4,(i+1)%4+8,i+8] for i in range(4)]+[[i+4,i+12,(i+1)%4+12,(i+1)%4+4] for i in range(4)]
    return product_source([[x,y,z] for z in (-1,1) for x,y in ring],faces,'Literal rectangular ring prism x interval')

def volume(model):
    points,normals,_=_shell_geometry(model);return abs(sum(float(points[F[0]]@N)*np.linalg.norm(np.sum(np.cross(points[F],np.roll(points[F],-1,axis=0)),axis=0))/6 for F,N in zip(model['faces'],normals)))

class OrdinaryCellSectionSanity(unittest.TestCase):
    def closed(self,result,source):
        model=result['model'];P=np.asarray(model['vertices']);sourceP=np.asarray(source['vertices']);basis=np.asarray(result['basis']);origin=np.asarray(result['origin'])
        world=origin+P@basis.T;self.assertTrue(np.allclose(world@np.asarray(result['normal']),result['offset']))
        for point,refs in zip(world,result['sourceReferences']):
            for ref in refs:
                expected=sourceP[ref['vertex']] if 'vertex' in ref else sourceP[source['edges'][ref['edge']][0]]+ref['parameter']*(sourceP[source['edges'][ref['edge']][1]]-sourceP[source['edges'][ref['edge']][0]])
                self.assertTrue(np.allclose(point,expected))
        incidence=Counter(tuple(sorted(E)) for F in model['faces'] for E in zip(F,F[1:]+F[:1]));self.assertEqual(set(incidence),{tuple(sorted(E)) for E in model['edges']});self.assertTrue(all(n==2 for n in incidence.values()))
        for i,record in enumerate(result['faceSourceReferences']):self.assertEqual(model['metadata']['offColors']['faces'][i],source['metadata']['offColors']['cells'][record['cell']])
        for region in result['cellSectionRegions']:
            self.assertTrue(all(result['faceSourceReferences'][f]['cell']==region['sourceCell'] for f in region['outputFaces']))
        return model

    def test_literal_concave_caps_dimple_and_generalized_tesseract_complete_metrics(self):
        dimple=color(other['dented_prism']());tess=regular('tesseract');tess['interpretation']='generalized-complex';tess['fingerprint']=identity(tess);color(tess)
        for source,expectedVolume in ((color(literal()),10.),(dimple,.1),(tess,8.)):
            before=deepcopy(source)
            with self.subTest(name=source['name']),patch('engine.geometry.hull',side_effect=AssertionError('No hull')):
                result=ordinary_cell_section(source);model=self.closed(result,source);self.assertAlmostEqual(volume(model),expectedVolume,places=7);self.assertEqual(source,before)
                self.assertTrue(all(np.linalg.matrix_rank(np.asarray(model['vertices'])[F]-np.asarray(model['vertices'])[F[0]],1e-8)==2 for F in model['faces']))
                if expectedVolume==10.:
                    caps=[R for R in result['cellSectionRegions'] if len(R['outer'])==6];self.assertEqual(len(caps),2);self.assertTrue(all(abs(R['area']-5)<1e-8 for R in caps))
                self.assertEqual(section(source)['model']['faces'],[],'Existing explicit surface path stays curves for an ordinary transverse section.')

    def test_disjoint_cell_regions_holes_tangent_coplanar_and_empty_sections(self):
        source=disjoint_source();result=ordinary_cell_section(source,[0,1,0,0],2);self.closed(result,source)
        caps=[R for R in result['cellSectionRegions'] if R['sourceCell'] in (0,1)];self.assertEqual(len(caps),4);self.assertTrue(all(abs(R['area']-2)<1e-8 for R in caps))
        self.assertAlmostEqual(sum(R['area'] for R in result['cellSectionRegions']),32.,places=7)
        source=hole_source();before=deepcopy(source);result=ordinary_cell_section(source,[0,0,1,0],0);model=self.closed(result,source)
        holed=[R for R in result['cellSectionRegions'] if R.get('holes')];self.assertEqual(len(holed),2)
        for R in holed:
            self.assertEqual(len(R['holes']),1);self.assertEqual(len(R['outputFaces']),8);self.assertAlmostEqual(R['area'],12.,places=7)
            # The center of the literal hole is not in any emitted triangle;
            # full region area is 16-4, not its convex rectangle's 16.
            world=np.asarray(result['origin'])+np.asarray(model['vertices'])@np.asarray(result['basis']).T
            for f in R['outputFaces']:
                triangle=world[model['faces'][f],:2];a,b,c=triangle;target=np.asarray([2.,2.]);D=np.column_stack((b-a,c-a));uv=np.linalg.solve(D,target-a)
                self.assertFalse(min(uv)>-1e-8 and sum(uv)<1+1e-8)
        self.assertEqual(len(model['vertices'])-len(model['edges'])+len(model['faces']),0);self.assertEqual(source,before)
        source=color(literal());cap=ordinary_cell_section(source,[0,0,0,1],-1);self.assertTrue(any(R.get('coplanarCell') for R in cap['cellSectionRegions']));self.assertAlmostEqual(volume(cap['model']),10.,places=7)
        tangent=ordinary_cell_section(source,[1,1,1,1],-1.);self.assertEqual(tangent['status'],'degenerate');self.assertEqual(tangent['affineDimension'],0);self.assertEqual(len(tangent['intersection']),1);self.assertEqual(tangent['model']['edges'],[]);self.assertEqual(tangent['model']['faces'],[]);self.assertTrue(all(R['vertex']==0 for R in tangent['sourceReferences'][0]))
        self.assertEqual(ordinary_cell_section(source,[0,0,0,1],3)['status'],'empty')

    def test_native_history_save_open_source_metadata_annotations_and_wrong_domains(self):
        source=color(literal());annotations=content.set_text(content.new_document(source),source,'cell',0,'Original source cell label')
        settings={'version':1,'enabled':False,'method':'expansion','center':None,'radius':1.,'ratio':.25,'duration':2.,'loop':False}
        state={'model':source,'view':{'coordinateUnit':'cm','derivedMode':'cell-section','elementAnnotations':annotations,'dualMorph':settings},'notes':'Retain source notes'}
        document={'id':'source','cursor':0,'states':[state]};before=deepcopy(document);parameters={'normal':[0,0,0,1],'offset':0,'fill_rule':'nonzero','section_domain':'ordinary-cells'}
        result=run_recipe(document,'section',parameters,server.dispatch,'Promote ordinary 4D cell section');derived=result['states'][1]
        self.assertEqual(document,before);self.assertEqual(derived['notes'],state['notes']);self.assertEqual(derived['view']['coordinateUnit'],'cm');self.assertNotIn('dualMorph',derived['view']);self.assertEqual(derived['view']['derivedMode'],'face')
        self.assertEqual(derived['view']['elementAnnotations']['entries'],[]);self.assertEqual(derived['view']['elementContentDetached'][-1]['document']['entries'],annotations['entries'])
        replay=replay_document(result,server.dispatch);self.assertEqual(replay['states'][0]['model'],derived['model'])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'ordinary-cell-section.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[result]});opened=load_file(path)['project']['documents'][0]
        self.assertEqual(opened['states'][1]['model'],derived['model']);self.assertEqual(opened['states'][0]['model'],source);self.assertEqual(replay_document(opened,server.dispatch)['states'][0]['model'],derived['model'])
        changed=deepcopy(result);changed['operationHistory']['nodes'][-1]['sourceSnapshotHash']='a'*64
        with self.assertRaises(GeometryError):replay_document(changed,server.dispatch)
        for normal in ([0]*4,[0,0,1], [0,False,0,1]):
            with self.assertRaises(GeometryError):ordinary_cell_section(source,normal)
        wrong=deepcopy(source);wrong['cells'].pop();wrong['fingerprint']=identity(wrong)
        with self.assertRaises(GeometryError):ordinary_cell_section(wrong)
        crossing=other['dented_prism']();crossing['vertices'][4][0]=-.2;crossing['vertices'][9][0]=-.2;crossing['fingerprint']=identity(crossing);crossing['validation']=validate(crossing)
        self.assertTrue(crossing['validation']['passed'],'Rank/incidence alone does not resolve ordinary filled-cell geometry.')
        with self.assertRaisesRegex(GeometryError,'crossing|touching|overlap'):ordinary_cell_section(crossing)
        with self.assertRaises(GeometryError):ordinary_cell_section(regular('cube'))
        with self.assertRaises(GeometryError):section(source,section_domain='invented')

if __name__=='__main__':unittest.main()

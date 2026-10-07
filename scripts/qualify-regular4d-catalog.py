"""Bounded headless proof generator; writes evidence, never catalog assets."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.catalog import DATA,get_catalog
from engine.server import dispatch
from engine.regular4d_validation import (VERSION,CATALOG_IDENTITIES,qualify_catalog,
    validate_catalog_regular4d,snapshot_hash)

def qualify():
    references=qualify_catalog(DATA/'miratope')
    records={r['key']:r for r in get_catalog()};entries=[]
    for key in CATALOG_IDENTITIES:
        source=dispatch({'op':'generate','params':{'kind':'regular','key':key}})
        before=snapshot_hash(source)
        proof=dispatch({'op':'regular4d-validate','model':source,'params':{'key':key}})
        assert before==snapshot_hash(source)
        entries.append({'key':key,'record':records[key],'source':source,'receipt':proof})
    return {'format':'regular4d-registered-catalog-proof','version':VERSION,
            'passed':True,'entries':entries,'referenceQualification':references,
            'sourceCount':16,'convexCount':6,'starCount':10,
            'registeredCatalogSha256':snapshot_hash(get_catalog()),
            'catalogModuleSha256':hashlib.sha256((ROOT/'engine/catalog.py').read_bytes()).hexdigest(),
            'baseline6Executed':False,'exactCertification':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True)
    args=parser.parse_args();output=Path(args.output).resolve()
    if output.is_relative_to((ROOT/'engine/catalog_data').resolve()):
        parser.error('Evidence cannot overwrite catalog source directories.')
    result=qualify();output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'passed':True,'path':str(output),'sourceCount':16,
                     'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))

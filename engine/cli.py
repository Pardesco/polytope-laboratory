"""Command-line construction and inspection using the same desktop engine."""
import argparse
import json
from pathlib import Path
from .server import dispatch
from .formats import export_model, atomic_write, parse_off


def main():
    parser=argparse.ArgumentParser(prog='polytope',description='Headless Polytope Laboratory')
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('catalog')
    gen=sub.add_parser('generate');gen.add_argument('key');gen.add_argument('-o','--output',type=Path)
    inspect=sub.add_parser('inspect');inspect.add_argument('file',type=Path)
    request=sub.add_parser('request');request.add_argument('file',type=Path,help='JSON operation request; result printed as JSON')
    args=parser.parse_args()
    if args.command=='catalog': result=dispatch({'op':'catalog'})
    elif args.command=='generate':
        result=dispatch({'op':'generate','params':{'kind':'regular','key':args.key}})
        if args.output:
            format='off' if args.output.suffix.lower()=='.off' else 'json'
            atomic_write(args.output,export_model(result,format))
            print(str(args.output));return
    elif args.command=='inspect':
        text=args.file.read_text(encoding='utf-8-sig')
        model=parse_off(text,args.file.stem) if args.file.suffix.lower()=='.off' else json.loads(text)
        result=dispatch({'op':'analyze','model':model})
    else: result=dispatch(json.loads(args.file.read_text(encoding='utf-8')))
    print(json.dumps(result,ensure_ascii=False,allow_nan=False,indent=2))


if __name__=='__main__':
    main()

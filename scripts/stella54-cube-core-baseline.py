"""Owned Stella5.4 scratch session: literal cube OFF import/core/export.

This never opens an installed catalog model, changes license/upgrade settings,
or saves a Stella scene. Export destinations are new files in this workspace.
Only the freshly spawned process is driven and closed.
"""
import ctypes
from ctypes import wintypes
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

import numpy as np
import win32con as WC
import win32gui as G
import win32process as P

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.formats import parse_off
EXE = Path(r'C:\Program Files (x86)\Stella4D\Stella4D.exe')
EXPECTED = 'e56977ded0a791da1003ab85a38177923ee08e2502419292dc7bcd0b9d8e0a4d'
U = ctypes.WinDLL('user32', use_last_error=True)
U.SendMessageTimeoutW.argtypes = [wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM,wintypes.UINT,wintypes.UINT,ctypes.POINTER(ctypes.c_size_t)]
U.SendMessageTimeoutW.restype = wintypes.LPARAM
U.GetAncestor.argtypes=[wintypes.HWND,wintypes.UINT]
U.GetAncestor.restype=wintypes.HWND
U.IsWindowUnicode.argtypes=[wintypes.HWND]
U.IsWindowUnicode.restype=wintypes.BOOL


class GUIThreadInfo(ctypes.Structure):
    _fields_=[('cbSize',wintypes.DWORD),('flags',wintypes.DWORD),
        ('hwndActive',wintypes.HWND),('hwndFocus',wintypes.HWND),
        ('hwndCapture',wintypes.HWND),('hwndMenuOwner',wintypes.HWND),
        ('hwndMoveSize',wintypes.HWND),('hwndCaret',wintypes.HWND),
        ('rcCaret',wintypes.RECT)]


U.GetGUIThreadInfo.argtypes=[wintypes.DWORD,ctypes.POINTER(GUIThreadInfo)]
U.GetGUIThreadInfo.restype=wintypes.BOOL


def window_record(hwnd):
    thread,pid=P.GetWindowThreadProcessId(hwnd)
    return {'handle':hwnd,'title':G.GetWindowText(hwnd),
        'class':G.GetClassName(hwnd),'id':G.GetDlgCtrlID(hwnd),
        'visible':bool(G.IsWindowVisible(hwnd)),
        'enabled':bool(G.IsWindowEnabled(hwnd)),
        'parent':G.GetParent(hwnd),'owner':G.GetWindow(hwnd,WC.GW_OWNER),
        'root':int(U.GetAncestor(hwnd,2) or 0),
        'rootOwner':int(U.GetAncestor(hwnd,3) or 0),
        'thread':thread,'pid':pid,'unicode':bool(U.IsWindowUnicode(hwnd))}


def thread_record(hwnd):
    thread,pid=P.GetWindowThreadProcessId(hwnd)
    info=GUIThreadInfo();info.cbSize=ctypes.sizeof(info)
    if not U.GetGUIThreadInfo(thread,ctypes.byref(info)):
        return {'thread':thread,'pid':pid,'error':ctypes.get_last_error()}
    fields=('hwndActive','hwndFocus','hwndCapture','hwndMenuOwner','hwndMoveSize','hwndCaret')
    # No activation, foreground change, attached input queues or global input.
    return {'thread':thread,'pid':pid,'flags':info.flags,
        **{key:int(getattr(info,key) or 0) for key in fields}}


def windows(pid, parent=None):
    result=[]
    def visit(hwnd,_):
        if P.GetWindowThreadProcessId(hwnd)[1]==pid:
            result.append(window_record(hwnd))
        return True
    (G.EnumWindows if parent is None else lambda callback,arg:G.EnumChildWindows(parent,callback,arg))(visit,None)
    return result


def snapshot(pid):
    result=windows(pid)
    for window in result:
        if window['visible']:
            window['children']=windows(pid,window['handle'])
            window['guiThread']=thread_record(window['handle'])
    return result


def wait_until(predicate, seconds=15):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=predicate()
        if value:return value
        time.sleep(.08)
    raise RuntimeError('Timed out waiting for owned reference workflow.')


def send(hwnd,message,wparam=0,lparam=0):
    response=ctypes.c_size_t()
    if not U.SendMessageTimeoutW(hwnd,message,wparam,lparam,2,3000,ctypes.byref(response)):
        raise RuntimeError('Owned reference window did not answer within3seconds.')
    return response.value


def visible_dialogs(pid):
    return [w for w in windows(pid) if w['visible'] and w['class']=='#32770']


def dialog(pid, fragment):
    return next((w for w in visible_dialogs(pid) if fragment.lower() in w['title'].lower()),None)


def owned_descendant(pid,root,hwnd):
    if (not hwnd or not G.IsWindow(hwnd) or P.GetWindowThreadProcessId(hwnd)[1]!=pid
            or hwnd!=root and not G.IsChild(root,hwnd)):
        raise RuntimeError('Reference control/notification target is outside its owned dialog.')


def click(hwnd,control,proof=None):
    pid=P.GetWindowThreadProcessId(hwnd)[1]
    button=G.GetDlgItem(hwnd,control)
    if not button or G.GetClassName(button) != 'Button':
        matches=[w for w in windows(pid,hwnd)
                 if w['id']==control and w['class']=='Button' and w['visible']]
        if len(matches)!=1:raise RuntimeError(f'Ambiguous reference button{control}.')
        button=matches[0]['handle']
    owned_descendant(pid,hwnd,button)
    parent=G.GetParent(button)
    owned_descendant(pid,hwnd,parent)
    action={'dialog':hwnd,'requestedId':control,'button':window_record(button),
        'notificationParent':window_record(parent),'guiThread':thread_record(parent)}
    if proof is not None:proof.setdefault('buttonActions',[]).append(action)
    if not G.IsWindowEnabled(button):raise RuntimeError(f'Reference button{control} is disabled.')
    if not G.IsWindowEnabled(parent):raise RuntimeError('Reference notification parent is disabled.')
    if control == 1:
        if '--queued-button-click' in sys.argv:
            # A posted button message executes through the dialog's regular
            # queue and standard Button procedure, including focus changes.
            # Previous receipts prove the dialog is active but focus remains
            # in the filename Edit after synthetic parent notifications.
            if action['guiThread'].get('hwndActive') != hwnd:
                raise RuntimeError('Queued button click requires the observed active owned dialog.')
            action['method']='Posted BM_CLICK through owned active Button procedure'
            G.PostMessage(button,WC.BM_CLICK,0,0)
            return
        # BN_CLICKED is delivered to the actual button parent, which can differ
        # from an Explorer dialog's outer/custom-hook window. Do not infer the
        # receiver from the common ID1 shared by FolderView and the OK button.
        action['method']='WM_COMMAND/BN_CLICKED to actual button parent'
        action['response']=send(parent,WC.WM_COMMAND,
            G.GetDlgCtrlID(button)|(WC.BN_CLICKED<<16),button)
        return
    action['method']='BM_CLICK to verified owned button'
    send(button,WC.BM_CLICK)


def combo_record(hwnd):
    """Bounded read-only combobox selection; these messages are system-marshalled.

    CB_GETLBTEXT is below WM_USER. Do not send CDM_* pointer payloads across
    processes: custom messages above WM_USER require explicit remote marshalling.
    """
    result={'control':window_record(hwnd),
        'selected':ctypes.c_ssize_t(send(hwnd,WC.CB_GETCURSEL)).value,'items':[]}
    count=send(hwnd,WC.CB_GETCOUNT)
    if count>64:
        result['unsupportedCount']=count;return result
    for index in range(count):
        length=send(hwnd,WC.CB_GETLBTEXTLEN,index)
        if length>4096:
            result['items'].append({'index':index,'unsupportedLength':length});continue
        text=ctypes.create_unicode_buffer(length+1)
        response=send(hwnd,WC.CB_GETLBTEXT,index,ctypes.addressof(text))
        result['items'].append({'index':index,'text':text.value,'response':response})
    return result


def choose_file(pid,window,target,kind,proof):
    wait_until(lambda:dialog(pid,kind))
    dlg=dialog(pid,kind)
    proof['dialogs'].append({'stage':kind,'windows':snapshot(pid)})
    children=windows(pid,dlg['handle'])
    proof.setdefault('fileDialogDiagnostics',[]).append({'stage':kind,
        'dialog':window_record(dlg['handle']),'guiThread':thread_record(dlg['handle']),
        'filters':[combo_record(c['handle']) for c in children
            if c['id']==1136 and c['class']=='ComboBox' and c['visible']]})
    # Classic Explorer dialogs wrap their filename Edit inside ComboBoxEx1148.
    combo=next((c for c in children if c['id']==1148 and c['class'] in ('ComboBoxEx32','ComboBox')),None)
    edits=windows(pid,combo['handle']) if combo else children
    edit=next((c for c in edits if c['class']=='Edit' and c['visible']),None)
    if not edit:
        edit=next((c for c in children if c['class']=='Edit' and c['id'] in (1152,1148)),None)
    if not edit:raise RuntimeError('Filename Edit could not be identified safely.')
    owned_descendant(pid,dlg['handle'],edit['handle'])
    parent=G.GetParent(edit['handle']);owned_descendant(pid,dlg['handle'],parent)
    G.SetWindowText(edit['handle'],str(target))
    if G.GetWindowText(edit['handle'])!=str(target):raise RuntimeError('Filename text did not bind the intended workspace path.')
    proof.setdefault('filenameBindings',[]).append({'stage':kind,'target':str(target),
        'targetExists':target.exists(),'edit':window_record(edit['handle']),
        'notificationParent':window_record(parent)})
    # A programmatic edit can bypass the dialog's own change bookkeeping. Send
    # only its genuine EN_CHANGE to the verified parent before the owned OK.
    send(parent,WC.WM_COMMAND,G.GetDlgCtrlID(edit['handle'])|(WC.EN_CHANGE<<16),edit['handle'])
    proof['dialogs'].append({'stage':kind+'-filename-bound','windows':snapshot(pid)})
    click(dlg['handle'],1,proof)
    time.sleep(.35)
    proof['dialogs'].append({'stage':kind+'-after-click','windows':snapshot(pid)})
    wait_until(lambda:not G.IsWindowVisible(dlg['handle']) if G.IsWindow(dlg['handle']) else True)
    time.sleep(.35)


def export_off(pid,main,target,proof):
    assert not target.exists() and target.resolve().is_relative_to(ROOT/'artifacts')
    G.PostMessage(main,WC.WM_COMMAND,32922,0)
    wait_until(lambda:dialog(pid,'Export Options') or dialog(pid,'Save'))
    options=dialog(pid,'Export Options')
    if options:
        proof['dialogs'].append({'stage':'export-options','windows':snapshot(pid)})
        click(options['handle'],1618,proof)  # Default model orientation.
        click(options['handle'],1066,proof)  # Only faces with holes; cube has none.
        for ident in (1067,1224,1225):
            button=G.GetDlgItem(options['handle'],ident)
            if button:
                send(button,WC.BM_SETCHECK,WC.BST_UNCHECKED,0)
        click(options['handle'],1,proof)
    choose_file(pid,main,target,'Save',proof)
    wait_until(lambda:target.exists() and target.stat().st_size>0)
    proof['exports'].append({'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})


def cube_observation(path):
    model=parse_off(path.read_text(encoding='utf-8-sig'))
    points=np.array(model['vertices'])
    counts=[len(model[k]) for k in ('vertices','edges','faces','cells')]
    if counts!=[8,12,6,0]:raise AssertionError('Reference cube counts differ:'+str(counts))
    lengths=[float(np.linalg.norm(points[b]-points[a])) for a,b in model['edges']]
    if not np.allclose(lengths,2,rtol=0,atol=1e-5):raise AssertionError('Reference cube edge length differs from literal2.')
    distances=sorted(float(np.linalg.norm(a-b)) for i,a in enumerate(points) for b in points[:i])
    expected=sorted([2.0]*12+[2*np.sqrt(2)]*12+[2*np.sqrt(3)]*4)
    if not np.allclose(distances,expected,rtol=0,atol=1e-5):raise AssertionError('Reference corner metric differs from literal cube.')
    if not np.allclose(points.mean(axis=0),0,rtol=0,atol=1e-5):raise AssertionError('Reference cube center differs.')
    return {'counts':counts,'edgeLengths':lengths,'pairDistances':distances,
            'center':points.mean(axis=0).tolist(),'faceLengths':list(map(len,model['faces'])),
            'scope':'Literal cube metric/counts only; orientation and colors are not certified'}


def main():
    before=hashlib.sha256(EXE.read_bytes()).hexdigest()
    assert before==EXPECTED
    folder=Path(tempfile.mkdtemp(prefix='stella54-cube-core-',dir=ROOT/'artifacts'))
    source=folder/'literal-cube.off'
    source.write_text('OFF\n8 6 12\n-1 -1 -1\n-1 -1 1\n-1 1 -1\n-1 1 1\n1 -1 -1\n1 -1 1\n1 1 -1\n1 1 1\n4 0 1 3 2\n4 4 6 7 5\n4 0 4 5 1\n4 2 3 7 6\n4 0 2 6 4\n4 1 5 7 3\n',encoding='utf-8')
    proof={'version':'installed Stella4D5.4','recordedUtc':datetime.now(timezone.utc).isoformat(),
        'passed':False,'scope':'Owned literal cube import/export and default-center convex-core metric observation; not Stella6 or general core conformance',
        'executable':str(EXE),'executableSha256':before,'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'dialogs':[],'exports':[],'commands':[],'registrationOrUpgradeCommandsSent':0}
    process=subprocess.Popen([str(EXE)],cwd=EXE.parent,creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    proof['pid']=process.pid
    main_window=None
    try:
        found=wait_until(lambda:next((w for w in windows(process.pid) if w['visible'] and G.GetMenu(w['handle'])),None),25)
        main_window=found['handle']
        time.sleep(1)
        if visible_dialogs(process.pid):raise RuntimeError('Unexpected startup dialog; no licensing command will be sent.')
        proof['commands'].append({'commandId':57601,'purpose':'Open newly created literal cube only'})
        G.PostMessage(main_window,WC.WM_COMMAND,57601,0)
        choose_file(process.pid,main_window,source,'Open',proof)
        if visible_dialogs(process.pid):raise RuntimeError('Unexpected cube import options; record before further commands.')
        imported=folder/'imported-cube.off'
        export_off(process.pid,main_window,imported,proof)
        proof['importObservation']=cube_observation(imported)
        proof['commands'].append({'commandId':33374,'purpose':'Default-center convex core of literal cube'})
        G.PostMessage(main_window,WC.WM_COMMAND,33374,0)
        time.sleep(.7)
        if visible_dialogs(process.pid):raise RuntimeError('Unexpected core dialog; no inferred options will be accepted.')
        core=folder/'cube-core.off'
        export_off(process.pid,main_window,core,proof)
        proof['coreObservation']=cube_observation(core)
        proof['passed']=True
    except Exception as exc:
        proof['error']=str(exc)
        proof['failureWindows']=snapshot(process.pid)
    finally:
        # Cancel owned scratch dialogs; never interact with another process.
        for dlg in visible_dialogs(process.pid):
            cancel=G.GetDlgItem(dlg['handle'],2)
            if cancel:send(cancel,WC.BM_CLICK)
        if main_window and G.IsWindow(main_window):G.PostMessage(main_window,WC.WM_CLOSE,0,0)
        deadline=time.monotonic()+5
        while process.poll() is None and time.monotonic()<deadline:
            for dlg in visible_dialogs(process.pid):
                content=' '.join(w['title'] for w in windows(process.pid,dlg['handle'])).lower()
                if 'save' in content and G.GetDlgItem(dlg['handle'],7):click(dlg['handle'],7)
            time.sleep(.1)
        proof['processExited']=process.poll() is not None
        if not proof['processExited']:proof['cleanupPendingPid']=process.pid
        proof['executableUnchanged']=hashlib.sha256(EXE.read_bytes()).hexdigest()==before
        proof['inputUnchanged']=hashlib.sha256(source.read_bytes()).hexdigest()==proof['inputSha256']
        proof['passed']=proof['passed'] and proof['processExited'] and proof['executableUnchanged'] and proof['inputUnchanged']
        (folder/'result.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
        print('Stella5.4 literal cube/core observation:',folder,'PASS' if proof['passed'] else 'INCOMPLETE')
        if proof.get('error'):print(proof['error'])
    return 0 if proof['passed'] else 1


if __name__=='__main__':raise SystemExit(main())

"""Launch the available legacy reference and record visible window/menu metadata.

No construction, model opening, export, registration or upgrade command is sent.
Only our freshly created process receives a graceful close request afterwards.
"""
import ctypes as C
from ctypes import wintypes as W
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
EXE = Path(r'C:\Program Files (x86)\Stella4D\Stella4D.exe')
EXPECTED = 'e56977ded0a791da1003ab85a38177923ee08e2502419292dc7bcd0b9d8e0a4d'
U = C.WinDLL('user32', use_last_error=True)
ENUM = C.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
U.EnumWindows.argtypes = [ENUM, W.LPARAM]
U.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
U.GetWindowTextW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
U.GetClassNameW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
U.GetMenu.argtypes = [W.HWND]
U.GetMenu.restype = W.HMENU
U.GetSubMenu.argtypes = [W.HMENU, C.c_int]
U.GetSubMenu.restype = W.HMENU
U.GetMenuItemCount.argtypes = [W.HMENU]
U.GetMenuItemID.argtypes = [W.HMENU, C.c_int]
U.GetMenuItemID.restype = W.UINT
U.GetMenuStringW.argtypes = [W.HMENU, W.UINT, W.LPWSTR, C.c_int, W.UINT]
U.IsWindowVisible.argtypes = [W.HWND]
U.PostMessageW.argtypes = [W.HWND, W.UINT, W.WPARAM, W.LPARAM]


def text(hwnd, class_name=False):
    buffer = C.create_unicode_buffer(512)
    (U.GetClassNameW if class_name else U.GetWindowTextW)(hwnd, buffer, len(buffer))
    return buffer.value


def windows(pid):
    result = []
    @ENUM
    def visit(hwnd, _):
        owner = W.DWORD()
        U.GetWindowThreadProcessId(hwnd, C.byref(owner))
        if owner.value == pid:
            result.append({'handle': int(hwnd), 'title': text(hwnd),
                           'class': text(hwnd, True), 'visible': bool(U.IsWindowVisible(hwnd))})
        return True
    U.EnumWindows(visit, 0)
    return result


def menu_items(menu, path=(), depth=0):
    if not menu or depth > 12:
        return []
    result = []
    count = U.GetMenuItemCount(menu)
    if not 0 <= count <= 4096:
        raise RuntimeError(f'Menu item resource bound exceeded: {count}.')
    for position in range(count):
        buffer = C.create_unicode_buffer(512)
        U.GetMenuStringW(menu, position, buffer, len(buffer), 0x400)
        child = U.GetSubMenu(menu, position)
        label = buffer.value
        if child:
            result.extend(menu_items(child, path + (label,), depth + 1))
        else:
            result.append({'path': list(path), 'label': label,
                           'commandId': U.GetMenuItemID(menu, position)})
    if len(result) > 8192:
        raise RuntimeError('Menu traversal resource bound exceeded.')
    return result


def main():
    before = hashlib.sha256(EXE.read_bytes()).hexdigest()
    assert before == EXPECTED, 'Installed executable differs from inspected5.4 reference.'
    folder = Path(tempfile.mkdtemp(prefix='stella54-session-', dir=ROOT/'artifacts'))
    result = {'recordedUtc': datetime.now(timezone.utc).isoformat(),
              'executable': str(EXE), 'executableSha256': before,
              'version': '5.4, 10th May 2014', 'passed': False,
              'scope': 'Actual launch and visible window/menu metadata only; no mathematical output conformance',
              'constructionCommandsSent': 0, 'registrationOrUpgradeCommandsSent': 0}
    process = subprocess.Popen([str(EXE)], cwd=EXE.parent, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    result['pid'] = process.pid
    main_windows = []
    try:
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline and process.poll() is None:
            main_windows = windows(process.pid)
            if any(window['visible'] and U.GetMenu(window['handle']) for window in main_windows):
                break
            time.sleep(.1)
        # Initial dialogs can appear after the main window is created.
        time.sleep(1)
        result['windows'] = windows(process.pid)
        result['menus'] = []
        for window in result['windows']:
            menu = U.GetMenu(window['handle'])
            if window['visible'] and menu and U.GetMenuItemCount(menu) >= 0:
                result['menus'].extend(menu_items(menu))
        result['menuCount'] = len(result['menus'])
        result['dialogTitles'] = [window['title'] for window in result['windows'] if window['class'] == '#32770' and window['visible']]
        result['passed'] = bool(result['menus'])
    finally:
        # This process was launched by this inspector; existing sessions are untouched.
        for window in windows(process.pid):
            menu = U.GetMenu(window['handle'])
            if window['visible'] and menu and U.GetMenuItemCount(menu) >= 0:
                U.PostMessageW(window['handle'], 0x10, 0, 0)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            result['cleanupPendingPid'] = process.pid
        result['processExited'] = process.poll() is not None
        result['executableUnchanged'] = hashlib.sha256(EXE.read_bytes()).hexdigest() == before
        (folder/'result.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
        print('Installed5.4 actual window/menu observation:', folder)
        print('Visible dialogs:', result.get('dialogTitles', []))
        print('Menus:', result.get('menuCount', 0), 'Process exited:', result['processExited'])
    return 0 if result['passed'] and result['executableUnchanged'] else 1


if __name__ == '__main__':
    raise SystemExit(main())

// Observe native Windows visibility and foreground ownership independently of
// Electron. The monitor itself has no window and never changes foreground focus.
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs/promises');

const command=String.raw`
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class PolytopeHiddenWatch {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  public delegate void WinEventProc(IntPtr hook,uint kind,IntPtr hwnd,int objectId,int childId,uint thread,uint time);
  [StructLayout(LayoutKind.Sequential)] struct Point {public int x,y;}
  [StructLayout(LayoutKind.Sequential)] struct Msg {public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public Point point;public uint privateData;}
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint first,uint last,IntPtr module,WinEventProc callback,uint process,uint thread,uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
  [DllImport("user32.dll")] static extern bool PeekMessage(out Msg message,IntPtr hwnd,uint first,uint last,uint flags);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Msg message);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Msg message);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref int length);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static string Image;
  public static long Checks;
  public static long Violations;
  public static double MaximumScanMs;
  public static double MaximumSampleGapMs;
  public static long ForegroundEvents;
  public static long ShowEvents;
  public static bool EventHooksArmed;
  static IntPtr ForegroundHook,ShowHook;
  static readonly WinEventProc EventCallback=OnEvent;
  static long LastSample;
  public static readonly List<string> Samples=new List<string>();
  public static readonly HashSet<int> Observed=new HashSet<int>();
  static bool Owned(uint pid) {
    if (pid==0) return false;
    IntPtr process=OpenProcess(0x1000,false,pid);
    if (process==IntPtr.Zero) return false;
    try {
      StringBuilder name=new StringBuilder(32768);int length=name.Capacity;
      if (!QueryFullProcessImageName(process,0,name,ref length)) return false;
      bool own=String.Equals(name.ToString(),Image,StringComparison.OrdinalIgnoreCase);
      if (own) Observed.Add((int)pid);
      return own;
    } finally {CloseHandle(process);}
  }
  static void Record(string kind,IntPtr hwnd,uint pid) {
    Violations++;
    if (Samples.Count<32) Samples.Add(kind+" hwnd="+hwnd.ToInt64()+" pid="+pid);
  }
  static void OnEvent(IntPtr hook,uint kind,IntPtr hwnd,int objectId,int childId,uint thread,uint time) {
    if (kind==3) ForegroundEvents++;
    else if (kind==0x8002) ShowEvents++;
    if (hwnd==IntPtr.Zero || (kind==0x8002 && (objectId!=0 || childId!=0 || GetAncestor(hwnd,2)!=hwnd))) return;
    uint pid;GetWindowThreadProcessId(hwnd,out pid);
    if (Owned(pid)) Record(kind==3?"foreground-event":"top-level-show-event",hwnd,pid);
  }
  public static void ArmEvents() {
    ForegroundHook=SetWinEventHook(3,3,IntPtr.Zero,EventCallback,0,0,0);
    ShowHook=SetWinEventHook(0x8002,0x8002,IntPtr.Zero,EventCallback,0,0,0);
    EventHooksArmed=ForegroundHook!=IntPtr.Zero && ShowHook!=IntPtr.Zero;
    if (!EventHooksArmed) {DisarmEvents();throw new InvalidOperationException("Native visibility event hooks could not be armed.");}
  }
  public static void PumpEvents() {
    Msg message;while(PeekMessage(out message,IntPtr.Zero,0,0,1)) {TranslateMessage(ref message);DispatchMessage(ref message);}
  }
  public static void DisarmEvents() {
    PumpEvents();if (ForegroundHook!=IntPtr.Zero) UnhookWinEvent(ForegroundHook);if (ShowHook!=IntPtr.Zero) UnhookWinEvent(ShowHook);
  }
  public static void Check() {
    long start=Stopwatch.GetTimestamp();
    if (LastSample!=0) MaximumSampleGapMs=Math.Max(MaximumSampleGapMs,(start-LastSample)*1000.0/Stopwatch.Frequency);
    LastSample=start;
    Checks++;
    EnumWindows(delegate(IntPtr hwnd,IntPtr data) {
      if (IsWindowVisible(hwnd)) {
        uint pid;GetWindowThreadProcessId(hwnd,out pid);
        if (Owned(pid)) Record("visible",hwnd,pid);
      }
      return true;
    },IntPtr.Zero);
    IntPtr foreground=GetForegroundWindow();
    uint foregroundPid;GetWindowThreadProcessId(foreground,out foregroundPid);
    if (Owned(foregroundPid)) Record("foreground",foreground,foregroundPid);
    MaximumScanMs=Math.Max(MaximumScanMs,(Stopwatch.GetTimestamp()-start)*1000.0/Stopwatch.Frequency);
  }
}
'@
[PolytopeHiddenWatch]::Image=$env:POLYTOPE_HIDDEN_WATCH_IMAGE
[PolytopeHiddenWatch]::ArmEvents()
[PolytopeHiddenWatch]::Check()
$started=[DateTime]::UtcNow.ToString('o')
Write-Output 'WATCH_ARMED'
while (-not [IO.File]::Exists($env:POLYTOPE_HIDDEN_WATCH_STOP)) {
  [PolytopeHiddenWatch]::PumpEvents()
  [PolytopeHiddenWatch]::Check()
  [Threading.Thread]::Sleep(10)
}
[PolytopeHiddenWatch]::Check()
[PolytopeHiddenWatch]::DisarmEvents()
$result=@{image=[PolytopeHiddenWatch]::Image;startedUtc=$started;finishedUtc=[DateTime]::UtcNow.ToString('o');pollIntervalMs=10;maximumScanMs=[PolytopeHiddenWatch]::MaximumScanMs;maximumSampleGapMs=[PolytopeHiddenWatch]::MaximumSampleGapMs;checks=[PolytopeHiddenWatch]::Checks;violations=[PolytopeHiddenWatch]::Violations;eventHooksArmed=[PolytopeHiddenWatch]::EventHooksArmed;observedForegroundEvents=[PolytopeHiddenWatch]::ForegroundEvents;observedShowEvents=[PolytopeHiddenWatch]::ShowEvents;samples=@([PolytopeHiddenWatch]::Samples);visibleOrForegroundOwnerPids=@([PolytopeHiddenWatch]::Observed);scope='Native top-level HWND visibility/foreground polling plus WinEvent show/foreground hooks for this exact executable image. Notifications can be delayed; combine with source window-policy guards. No foreground rendering performance claim.'}
[IO.File]::WriteAllText($env:POLYTOPE_HIDDEN_WATCH_EVIDENCE,($result|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
`;

async function startHiddenWindowWatch({executablePath,evidencePath}) {
  if(process.platform!=='win32')throw Error('Native HWND monitoring requires Windows.');
  const image=path.resolve(executablePath),evidence=path.resolve(evidencePath),stop=evidence+'.stop';
  await fs.mkdir(path.dirname(evidence),{recursive:true});
  // A unique evidence path prevents an earlier stop marker ending this watch.
  try { await fs.access(stop);throw Error('Use a fresh watcher evidence path.'); }
  catch(error){if(error.code!=='ENOENT')throw error;}
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{
    windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
      POLYTOPE_HIDDEN_WATCH_IMAGE:image,POLYTOPE_HIDDEN_WATCH_EVIDENCE:evidence,
      POLYTOPE_HIDDEN_WATCH_STOP:stop}});
  let output='',errors='';child.stderr.on('data',chunk=>errors+=chunk);
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Native window watcher did not arm: '+errors)),15000);
    const finish=()=>{clearTimeout(timeout);resolve();};
    child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('WATCH_ARMED'))finish();});
    exited.then(code=>{if(!output.includes('WATCH_ARMED')){clearTimeout(timeout);reject(Error('Native window watcher exited '+code+': '+errors));}},reject);
  }).catch(error=>{child.kill();throw error;});
  return {
    async stop(){
      await fs.writeFile(stop,'stop');
      const code=await exited;
      if(code!==0)throw Error('Native window watcher failed '+code+': '+errors);
      return JSON.parse(await fs.readFile(evidence,'utf8'));
    }
  };
}
module.exports={startHiddenWindowWatch};

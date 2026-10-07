import {createMemories,normalizeMemories,storeMemory,retrieveMemoryEntry,swapMemory,clearMemory} from './model-memories.mjs';

export class MemoryControls {
  constructor(context){
    this.context=context;this.busy=false;this.syncGeneration=0;this.derivedAvailable=false;
    const shelf=document.querySelector('.workspace-shelf');if(!shelf)throw new Error('Memories require the workspace shelf.');
    this.details=document.createElement('details');this.details.id='memories-settings';this.details.className='workspace-disclosure';
    this.details.innerHTML=`<summary>Memories</summary><div class="settings-body" id="memory-controls">
      <label>Slot <select id="memory-slot" aria-label="Model memory slot"></select></label>
      <label>Source <select id="memory-source" aria-label="Model memory source"><option value="base">Model</option><option value="derived">Derived</option></select></label>
      <div class="memory-actions"><button id="memory-store">Store</button><button id="memory-open">Open</button><button id="memory-swap">Swap</button><button id="memory-clear">Clear</button></div></div>`;
    if(typeof context.addStates==='function'){const button=document.createElement('button');button.id='memory-add';button.textContent='Add';this.details.querySelector('.memory-actions').append(button);}
    const history=shelf.querySelector('#history-settings');if(history)shelf.insertBefore(this.details,history);else shelf.append(this.details);
    this.nodes=Object.fromEntries([...this.details.querySelectorAll('[id]')].map(node=>[node.id.replace('memory-',''),node]));
    const panel=this.nodes.controls;panel.style.width='min(380px, 100%)';panel.style.display='grid';panel.style.gap='10px';
    const row=this.details.querySelector('.memory-actions');row.style.display='flex';row.style.gap='6px';for(const button of row.children)button.style.flex='1';
    for(let slot=1;slot<=9;slot++)this.nodes.slot.add(new Option(`${slot}: Empty`,String(slot)));
    const wrap=fn=>context.guard?context.guard(fn):async(...args)=>{try{return await fn(...args);}catch(error){context.setStatus?.(error.message);}};
    this.actions={store:wrap(slot=>this.store(slot)),open:wrap(slot=>this.open(slot)),swap:wrap(slot=>this.swap(slot)),clear:wrap(slot=>this.clear(slot)),add:wrap(slot=>this.add(slot))};
    for(const action of ['store','open','swap','clear','add'])if(this.nodes[action])this.nodes[action].onclick=()=>this.actions[action]();
    this.nodes.slot.onchange=()=>this.sync();this.nodes.source.onchange=()=>this.sync();
    this.keyHandler=event=>this.onKey(event);document.addEventListener('keydown',this.keyHandler);
    this.sync();
  }
  selectedSlot(){return Number(this.nodes.slot.value);}
  bank(project=this.context.getProject()){
    if(!project)throw new Error('Open a project before using model memories.');
    const bank=normalizeMemories(project.memories);project.memories=bank;return bank;
  }
  sync(){
    const generation=++this.syncGeneration,project=this.context.getProject(),state=this.context.getState();
    let bank,error;try{if(project)bank=this.bank(project);}catch(caught){error=caught;this.context.setStatus?.(caught.message);}
    if(bank)for(let index=0;index<9;index++){const entry=bank.slots[index];this.nodes.slot.options[index].textContent=`${index+1}: ${entry?(entry.state.model.name||'Unnamed model'):'Empty'}`;}
    this.derivedAvailable=false;
    const update=()=>{
      const unavailable=this.busy||this.context.isExporting?.()||!bank||!state||!!error;
      const occupied=!!bank?.slots[this.selectedSlot()-1];
      this.nodes.slot.disabled=!!unavailable;this.nodes.source.disabled=!!unavailable;
      this.nodes.source.options[1].disabled=!this.derivedAvailable;
      this.nodes.store.disabled=!!unavailable||(this.nodes.source.value==='derived'&&!this.derivedAvailable);
      this.nodes.open.disabled=!!unavailable||!occupied;this.nodes.swap.disabled=!!unavailable||!occupied||(this.nodes.source.value==='derived'&&!this.derivedAvailable);
      this.nodes.clear.disabled=!!unavailable||!occupied;
      if(this.nodes.add){this.nodes.add.disabled=!!unavailable||!occupied||(this.nodes.source.value==='derived'&&!this.derivedAvailable);this.nodes.add.title=`Add memory ${this.selectedSlot()} to the selected source model`;}
      this.nodes.store.title=`Store in memory ${this.selectedSlot()} (Ctrl+Alt+${this.selectedSlot()})`;
      this.nodes.open.title=`Open memory ${this.selectedSlot()} (Alt+${this.selectedSlot()})`;
      this.nodes.swap.title=`Swap with memory ${this.selectedSlot()} (Alt+Shift+${this.selectedSlot()})`;
    };
    update();
    if(state&&this.context.getDerivedState){
      try{
        const derived=this.context.getDerivedState();
        if(derived&&typeof derived.then==='function')derived.then(value=>{if(generation!==this.syncGeneration)return;this.derivedAvailable=!!value;update();}).catch(caught=>{if(generation===this.syncGeneration)this.context.setStatus?.(caught.message);});
        else{this.derivedAvailable=!!derived;update();}
      }catch(caught){this.context.setStatus?.(caught.message);}
    }
  }
  assertCurrent(project,state){
    if(this.context.getProject()!==project||this.context.getState()!==state)throw new Error('Source document changed while the memory action ran. Repeat it from the desired model.');
    if(this.context.isExporting?.())throw new Error('Finish or cancel animation export before changing model memories.');
  }
  async capture(project,state){
    const target=this.nodes.source.value;
    const captured=target==='derived'?await this.context.getDerivedState?.():state;
    this.assertCurrent(project,state);
    if(!captured)throw new Error('The derived model is unavailable. Choose Model or evaluate a derived view first.');
    const source=await this.context.getSource?.(target)||{};this.assertCurrent(project,state);
    return {state:captured,source};
  }
  async operate(fn){
    if(this.busy)throw new Error('A model memory action is already running.');
    const project=this.context.getProject(),state=this.context.getState();
    if(!project||!state)throw new Error('Open a model before using model memories.');
    this.assertCurrent(project,state);this.busy=true;this.sync();
    try{return await fn(project,state);}finally{this.busy=false;this.sync();}
  }
  async store(slot=this.selectedSlot()){
    return this.operate(async(project,state)=>{const captured=await this.capture(project,state),bank=storeMemory(this.bank(project),slot,captured.state,captured.source);this.assertCurrent(project,state);project.memories=bank;this.nodes.slot.value=String(slot);this.context.markDirty();this.context.setStatus?.(`Stored ${captured.state.model.name||'model'} in memory ${slot}.`);});
  }
  async open(slot=this.selectedSlot()){
    return this.operate(async(project,state)=>{const entry=retrieveMemoryEntry(this.bank(project),slot);this.assertCurrent(project,state);await this.context.restoreState(entry.state,`Open memory ${slot}`);if(this.context.getProject()!==project)throw new Error('Project changed while opening the memory.');this.nodes.slot.value=String(slot);this.context.setStatus?.(`Opened memory ${slot}: ${entry.state.model.name||'model'}.`);});
  }
  async swap(slot=this.selectedSlot()){
    return this.operate(async(project,state)=>{
      const captured=await this.capture(project,state),originalBank=this.bank(project);
      // Build and validate replacement first, but publish only after the
      // authoritative restore succeeds. Failures keep the original memory.
      const swapped=swapMemory(originalBank,slot,captured.state,captured.source);this.assertCurrent(project,state);
      await this.context.restoreState(swapped.state,`Swap memory ${slot}`);
      if(this.context.getProject()!==project)throw new Error('Project changed while swapping the memory.');
      if(project.memories!==originalBank)throw new Error('Model memories changed while the swap ran. The replacement was discarded.');
      project.memories=swapped.memories;this.nodes.slot.value=String(slot);this.context.markDirty();this.context.setStatus?.(`Swapped with memory ${slot}: ${swapped.state.model.name||'model'}.`);
    });
  }
  async clear(slot=this.selectedSlot()){
    return this.operate(async(project,state)=>{const bank=clearMemory(this.bank(project),slot);this.assertCurrent(project,state);project.memories=bank;this.nodes.slot.value=String(slot);this.context.markDirty();this.context.setStatus?.(`Cleared memory ${slot}.`);});
  }
  async add(slot=this.selectedSlot()){
    return this.operate(async(project,state)=>{
      if(typeof this.context.addStates!=='function')throw new Error('Model addition is unavailable.');
      const originalBank=this.bank(project),entry=retrieveMemoryEntry(originalBank,slot),captured=await this.capture(project,state);
      // Both inputs are detached and representation-validated. Native addition
      // owns geometry validation and the independent result document.
      const current=retrieveMemoryEntry(storeMemory(createMemories(),1,captured.state,captured.source),1).state;
      this.assertCurrent(project,state);
      if(project.memories!==originalBank)throw new Error('Model memories changed while addition ran. Repeat the action.');
      await this.context.addStates(current,entry.state,`Add memory ${slot}`);
      if(this.context.getProject()!==project)throw new Error('Project changed while adding the memory.');
      this.nodes.slot.value=String(slot);this.context.setStatus?.(`Added memory ${slot}: ${entry.state.model.name||'model'}.`);
    });
  }
  onKey(event){
    if(event.defaultPrevented||event.repeat||event.metaKey||!event.altKey||this.busy||this.context.isExporting?.()||event.getModifierState?.('AltGraph'))return;
    const target=event.target;if(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')||document.querySelector('dialog[open]'))return;
    const match=/^Digit([1-9])$/.exec(event.code||'')||/^([1-9])$/.exec(event.key||'');if(!match)return;
    const action=event.ctrlKey?(event.shiftKey?null:'store'):(event.shiftKey?'swap':'open');if(!action)return;
    event.preventDefault();this.actions[action](Number(match[1]));
  }
  destroy(){this.syncGeneration++;document.removeEventListener('keydown',this.keyHandler);this.details.remove();}
}

import {NumericEntry} from './numeric-entry.mjs';

/** Manual workspace inputs share one source owner from expression to publication. */
export class WorkspaceNumericControls {
  constructor(context){
    this.context=context;
    this.entry=new NumericEntry(context);
  }
  input(id){return this.context.getInput(id);}
  scalar(id,domain={}){return {text:this.input(id).value,...domain};}
  cancel(){this.entry.cancel();}
  async edit(ids,fields,publish,validate){
    const originals=ids.map(id=>[id,this.input(id),this.input(id).value]);
    return this.entry.run(fields,async(values,verify,job)=>{
      const current=()=>{
        verify();
        if(originals.some(([id,node,value])=>this.input(id)!==node||node.value!==value))
          throw Error('The numeric target fields changed. Repeat the edit.');
      };
      current();return publish(values,current,job);
    },{validate});
  }
  section(nextVertex=false){
    const dimension=this.context.getState().model.dimension;
    const view=this.context.getState().view;
    const target=JSON.stringify([view.sectionNormal,view.sectionOffset,view.sectionAlignment??null,view.entity]);
    return this.edit(['section-normal','section-depth','entity-id'],{
      normal:{...this.scalar('section-normal'),kind:'vector',length:dimension,nonzero:true},
      depth:this.scalar('section-depth'),
    },async({normal,depth},verify)=>{
      const current=this.context.getState(),v=current.view;
      if(JSON.stringify([v.sectionNormal,v.sectionOffset,v.sectionAlignment??null,v.entity])!==target)
        throw Error('Section settings changed. Repeat the edit.');
      let offset=depth;
      if(nextVertex){
        const length=Math.hypot(...normal);
        const events=[...new Set(current.model.vertices.map(p=>p.reduce((sum,x,i)=>sum+x*normal[i]/length,0)).sort((a,b)=>a-b))];
        offset=events.find(value=>value>depth+1e-7)??events[0];
      }
      const entity=Number(this.input('entity-id').value);
      if(!Number.isSafeInteger(entity)||entity<0)throw Error('Choose a nonnegative integer entity index.');
      verify();v.sectionNormal=[...normal];v.sectionOffset=offset;delete v.sectionAlignment;v.entity=entity;
      this.input('section-depth').value=String(offset);this.input('section-offset').value=String(offset);
      this.context.markDirty();await this.context.refreshDerived();
    });
  }
  incidenceDual(){
    const model=this.context.getState().model,dimension=model.embeddingDimension??model.dimension;
    if(![3,4].includes(model.dimension)||dimension!==model.dimension)throw Error('Incidence dual requires an intrinsic 3D or 4D source.');
    const center=this.input('incidence-dual-center').value.trim();
    return this.edit(['incidence-dual-center','incidence-dual-radius'],{
      radius:this.scalar('incidence-dual-radius',{min:0,exclusiveMin:true}),
      ...(center?{center:{text:center,kind:'vector',length:dimension}}:{}),
    },({radius,center},verify,{signal})=>this.context.commit('incidence-dual',{
      radius,...center?{center:[...center]}:{},
    },'Construct incidence dual',{signal,verifyPublication:verify}));
  }
  operation(operation,id,label,domain,parameter){
    return this.edit([id],{value:this.scalar(id,domain)},({value},verify,{signal})=>
      this.context.commit(operation,{[parameter]:value},label,{signal,verifyPublication:verify}),
    ({value})=>{if(operation==='transform'&&parameter==='scale'&&value===0)throw Error('Intrinsic scale must be nonzero.');});
  }
  referenceScale(){
    return this.edit(['reference-edge','reference-length'],{
      length:this.scalar('reference-length',{min:0,exclusiveMin:true}),
    },({length},verify,{signal})=>{
      const index=Number(this.input('reference-edge').value),count=this.context.getState().model.edges.length;
      if(!Number.isSafeInteger(index)||index<0||index>=count)throw Error('Choose an existing reference edge index.');
      return this.context.commit('scale-reference',{index,desired_length:length},'Scale to reference edge',
        {signal,verifyPublication:verify});
    });
  }
  generator(){
    const kind=this.input('generator').value,fields={},ids=['generator'];
    if(['polygon','prism','antiprism','pyramid','duoprism'].includes(kind)){
      fields.n=this.scalar('generator-n',{integer:true,min:3,max:200});ids.push('generator-n');
    }
    if(kind==='duoprism'){fields.m=this.scalar('generator-m',{integer:true,min:3,max:200});ids.push('generator-m');}
    if(['prism','antiprism','pyramid'].includes(kind)){
      fields.height=this.scalar('generator-m',{min:0,exclusiveMin:true});ids.push('generator-m');
    }
    if(kind==='waterman'){fields.radiusSquared=this.scalar('generator-m',{integer:true,min:2,max:400});ids.push('generator-m');}
    if(kind==='block'){fields.sizes={...this.scalar('block-sizes',{min:0,exclusiveMin:true}),kind:'vector',length:[3,4]};ids.push('block-sizes');}
    if(!Object.keys(fields).length)throw Error('Choose a supported generator.');
    return this.edit(ids,fields,(values,verify,{signal,source})=>
      this.context.generate(kind,values,'Generate '+kind,{signal,verifyPublication:verify,sourceSnapshot:source}),
    values=>{if(kind==='duoprism'&&values.n*values.m>4000)throw Error('Duoprism limit is 4,000 product vertices.');});
  }
  wythoff(){
    const family=this.input('coxeter-family').value,mask=this.input('coxeter-rings').value.trim(),text=this.input('coxeter-weights').value.trim();
    const rank={A3:3,B3:3,H3:3,A4:4,B4:4,F4:4,H4:4}[family];
    if(!rank||!new RegExp(`^[01]{${rank}}$`).test(mask)||!mask.includes('1'))
      throw Error('Use a nonempty ring mask matching the Coxeter family rank.');
    // An omitted vector still passes through the same immutable owner and
    // workspace fence. Inactive ring weights are exactly zero.
    return this.edit(['coxeter-family','coxeter-rings','coxeter-weights'],{
      weights:{text:text||[...mask].join(', '),kind:'vector',length:rank,min:0},
    },({weights},verify,{signal,source})=>this.context.generate('wythoff',{
      family,rings:[...mask].map(Number),...text?{weights:[...weights]}:{},
    },'Wythoff '+family,{signal,verifyPublication:verify,sourceSnapshot:source}),
    ({weights})=>{if(weights.some((value,i)=>(value>0)!==(mask[i]==='1')))
      throw Error('Positive weights must match the selected rings; inactive weights must be zero.');});
  }
  hull(exact=false){
    const id=exact?'rational-points':'hull-points',operation=exact?'rational-hull':'hull';
    return this.edit([id],{points:{...this.scalar(id),kind:'rows',length:[2,3,4],mode:exact?'rational':'real'}},
      async({points},verify,{signal})=>{
        const label=exact?'Exact rational hull':'Point-cloud hull';
        const result=await this.context.run(operation,{points:points.map(row=>[...row])},null,label,{signal});
        verify();this.context.addDocument(result,label);return result;
      },({points})=>{
        if(exact&&(points.length<3||points.length>32))throw Error('Exact hull input is limited to 3–32 points.');
      });
  }
}

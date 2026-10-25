/** Read-only reports belong to a selected source and one output channel. */
export class ModelReports {
  constructor(context){this.context=context;this.channels=new Map();}
  invalidate(channel){if(channel===undefined)this.channels.clear();else this.channels.delete(channel);}
  begin(channels,{getTarget=()=>null}={}){
    const c=this.context,project=c.getProject(),document=c.getDocument(),state=c.getState(),model=state?.model;
    if(!model||!document)throw Error('Choose a model before checking geometry.');
    const ticket={project,document,state,model,signature:JSON.stringify(model),getTarget,target:JSON.stringify(getTarget())};
    for(const channel of channels)this.channels.set(channel,ticket);
    return ticket;
  }
  owns(ticket,channel){return this.channels.get(channel)===ticket;}
  current(ticket,channel){
    const c=this.context;
    return this.owns(ticket,channel)&&c.getProject()===ticket.project&&c.getDocument()===ticket.document&&c.getState()===ticket.state&&ticket.state.model===ticket.model&&JSON.stringify(ticket.model)===ticket.signature&&JSON.stringify(ticket.getTarget())===ticket.target;
  }
}

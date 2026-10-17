import React from 'react';
import {render,screen} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {AnamnesisWizard} from './AnamnesisWizard';
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));

it('removes a stale descendant when its ancestor becomes hidden without deleting answers',()=>{
    const field=(id,parent)=>({id,label:id,type:'text',...(parent?{conditional_logic:{field_id:parent,operator:'equals',value:'yes'}}:{})});
    const template={sections:[{id:'s',title:'Questions',fields:[field('root'),field('parent','root'),field('child','parent')]}]};
    const props={template,content:{root:'yes',parent:'yes',child:'preserved'},renderField:f=><span key={f.id}>{f.label}</span>};
    const {rerender}=render(<AnamnesisWizard {...props}/>);
    expect(screen.getByText('child',{exact:true})).toBeInTheDocument();
    const content={...props.content,root:'no'};
    rerender(<AnamnesisWizard {...props} content={content}/>);
    expect(screen.queryByText('parent',{exact:true})).not.toBeInTheDocument();
    expect(screen.queryByText('child',{exact:true})).not.toBeInTheDocument();
    expect(content.child).toBe('preserved');
});

// Calendar Clock and Folder Plus supplied by the user, AnimateIcons / Lucide.
// Author: Avijit Dey (@avijit07x). MIT; see THIRD-PARTY-NOTICES.md.
"use client";
import React,{forwardRef,useCallback,useImperativeHandle,useRef} from 'react';
import type {HTMLAttributes} from 'react';
import {LazyMotion,domMin,m,useAnimation,useReducedMotion} from 'motion/react';
import type {Variants} from 'motion/react';
import {createRoot} from 'react-dom/client';
import {FilesIcon,EllipsisIcon,MoonStarIcon,MonitorIcon,PresentationIcon,ChartNoAxesCombinedIcon,SearchIcon,SlidersHorizontalIcon,SquarePenIcon,PlusIcon,ArrowUpIcon,CopyIcon,ThumbsUpIcon,ThumbsDownIcon,GitBranchIcon} from '@animateicons/react/lucide';
export interface AnimatedIconHandle{startAnimation:()=>void;stopAnimation:()=>void}
interface Props extends Omit<HTMLAttributes<HTMLDivElement>,'color'|'onDrag'|'onDragStart'|'onDragEnd'|'onAnimationStart'|'onAnimationEnd'|'onAnimationIteration'>{size?:number;duration?:number;isAnimated?:boolean;color?:string}
// cn only joins the single base class and the caller's class in these icons.
const cn=(...values:(string|undefined)[])=>values.filter(Boolean).join(' ');
export const CalendarClockIcon=forwardRef<AnimatedIconHandle,Props>(({onMouseEnter,onMouseLeave,className,size=24,duration=1,isAnimated=true,color,...props},ref)=>{
 const controls=useAnimation(),reduced=useReducedMotion(),isControlled=useRef(false);
 useImperativeHandle(ref,()=>{isControlled.current=true;return{startAnimation:()=>reduced?controls.start('normal'):controls.start('animate'),stopAnimation:()=>controls.start('normal')};});
 const handleEnter=useCallback((e?:React.MouseEvent<HTMLDivElement>)=>{if(!isAnimated||reduced)return;if(!isControlled.current)controls.start('animate');else onMouseEnter?.(e as any);},[controls,reduced,isAnimated,onMouseEnter]);
 const handleLeave=useCallback((e:React.MouseEvent<HTMLDivElement>)=>{if(!isControlled.current)controls.start('normal');else onMouseLeave?.(e as any);},[controls,onMouseLeave]);
 const bodyVariants:Variants={normal:{pathLength:1,opacity:1},animate:{pathLength:[0,1],opacity:[0,1],transition:{duration:.5*duration,ease:[.16,1,.3,1]}}};
 const hangerVariants:Variants={normal:{pathLength:1,opacity:1},animate:(i:number)=>({pathLength:[0,1],opacity:[0,1],transition:{duration:.3*duration,delay:i*.08*duration,ease:[.16,1,.3,1]}})};
 const headerVariants:Variants={normal:{scaleX:1,opacity:1},animate:{scaleX:[0,1],opacity:[0,1],transition:{duration:.4*duration,delay:.28*duration,ease:[.16,1,.3,1]}}};
 const dialVariants:Variants={normal:{scale:1,opacity:1},animate:{scale:[0,1.08,1],opacity:[0,1,1],transition:{duration:.45*duration,delay:.4*duration,times:[0,.6,1],ease:[.34,1.4,.64,1]}}};
 const handsVariants:Variants={normal:{rotate:0,opacity:1},animate:{rotate:[-40,12,0],opacity:[0,1,1],transition:{duration:.5*duration,delay:.6*duration,times:[0,.6,1],ease:[.34,1.4,.64,1]}}};
 return <LazyMotion features={domMin} strict><m.div className={cn('inline-flex items-center justify-center',className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} {...props} style={{color,...props.style}}><m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal">
  <m.path d="M8 2v4" custom={0} variants={hangerVariants}/><m.path d="M16 2v4" custom={1} variants={hangerVariants}/><m.path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" variants={bodyVariants}/><m.path d="M3 10h5" variants={headerVariants} style={{transformBox:'view-box',originX:'3px',originY:'10px'}}/><m.circle cx="16" cy="16" r="6" variants={dialVariants} style={{transformBox:'view-box',originX:'16px',originY:'16px'}}/><m.path d="M16 14v2.2l1.6 1" variants={handsVariants} style={{transformBox:'view-box',originX:'16px',originY:'16px'}}/>
 </m.svg></m.div></LazyMotion>;
});
CalendarClockIcon.displayName='CalendarClockIcon';
export const FolderPlusIcon=forwardRef<AnimatedIconHandle,Props>(({onMouseEnter,onMouseLeave,className,size=24,duration=1,isAnimated=true,color,...props},ref)=>{
 const controls=useAnimation(),reduced=useReducedMotion(),isControlled=useRef(false);
 useImperativeHandle(ref,()=>{isControlled.current=true;return{startAnimation:()=>reduced?controls.start('normal'):controls.start('animate'),stopAnimation:()=>controls.start('normal')};});
 const handleEnter=useCallback((e?:React.MouseEvent<HTMLDivElement>)=>{if(!isAnimated||reduced)return;if(!isControlled.current)controls.start('animate');else onMouseEnter?.(e as any);},[controls,reduced,isAnimated,onMouseEnter]);
 const handleLeave=useCallback((e?:React.MouseEvent<HTMLDivElement>)=>{if(!isControlled.current)controls.start('normal');else onMouseLeave?.(e as any);},[controls,onMouseLeave]);
 const folderVariants:Variants={normal:{y:0},animate:{y:[0,-1.2,.4,0],transition:{duration:.6*duration,ease:'easeInOut',times:[0,.35,.7,1]}}};
 const plusVariants:Variants={normal:{rotate:0,scale:1,transition:{duration:0}},animate:{rotate:[0,90],scale:[1,1.2,1],transition:{duration:.5*duration,ease:'easeInOut'}}};
 return <LazyMotion features={domMin} strict><m.div className={cn('inline-flex items-center justify-center',className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} {...props} style={{color,...props.style}}><m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal"><m.g variants={folderVariants}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><m.path d="M12 10v6M9 13h6" variants={plusVariants} style={{transformBox:'view-box',originX:'12px',originY:'13px'}}/></m.g></m.svg></m.div></LazyMotion>;
});
FolderPlusIcon.displayName='FolderPlusIcon';

// User-supplied PlugZap artwork and Motion timing.
export const PlugZapIcon=forwardRef<AnimatedIconHandle,Props>(({onMouseEnter,onMouseLeave,className,size=24,duration=1,isAnimated=true,color,...props},ref)=>{
 const controls=useAnimation(),reduced=useReducedMotion(),isControlled=useRef(false);
 useImperativeHandle(ref,()=>{isControlled.current=true;return{startAnimation:()=>reduced?controls.start('normal'):controls.start('animate'),stopAnimation:()=>controls.start('normal')};});
 const handleEnter=useCallback((e?:React.MouseEvent<HTMLDivElement>)=>{if(!isAnimated||reduced)return;if(!isControlled.current)controls.start('animate');else onMouseEnter?.(e as any);},[controls,reduced,isAnimated,onMouseEnter]);
 const handleLeave=useCallback((e?:React.MouseEvent<HTMLDivElement>)=>{if(!isControlled.current)controls.start('normal');else onMouseLeave?.(e as any);},[controls,onMouseLeave]);
 const plugVariants:Variants={normal:{x:0,y:0},animate:{x:[0,1.5,-.4,0],y:[0,-1.5,.4,0],transition:{duration:.6*duration,ease:'easeInOut',times:[0,.35,.7,1]}}};
 const zapVariants:Variants={normal:{opacity:1,scale:1},animate:{opacity:[1,.25,1,.5,1],scale:[1,1.2,1,1.1,1],transition:{duration:.5*duration,ease:'easeInOut',delay:.15*duration}}};
 return <LazyMotion features={domMin} strict><m.div className={cn('inline-flex items-center justify-center',className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} {...props} style={{color,...props.style}}><m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal"><m.g variants={plugVariants}><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="m2 22 3-3"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/></m.g><m.path d="m18 3-4 4h6l-4 4" variants={zapVariants} style={{transformBox:'view-box',originX:'17px',originY:'7px'}}/></m.svg></m.div></LazyMotion>;
});
PlugZapIcon.displayName='PlugZapIcon';

// User-supplied Sina database artwork and Motion timing.
export const DatabaseIcon=forwardRef<AnimatedIconHandle,Props>(({onMouseEnter,onMouseLeave,className,size=24,duration=1,isAnimated=true,color,...props},ref)=>{
 const controls=useAnimation(),reduced=useReducedMotion(),isControlled=useRef(false);
 useImperativeHandle(ref,()=>{isControlled.current=true;return{startAnimation:()=>reduced?controls.start('normal'):controls.start('animate'),stopAnimation:()=>controls.start('normal')};});
 const handleEnter=useCallback((e?:React.MouseEvent<HTMLDivElement>)=>{if(!isAnimated||reduced)return;if(!isControlled.current)controls.start('animate');else onMouseEnter?.(e as any);},[controls,reduced,isAnimated,onMouseEnter]);
 const handleLeave=useCallback((e?:React.MouseEvent<HTMLDivElement>)=>{if(!isControlled.current)controls.start('normal');else onMouseLeave?.(e as any);},[controls,onMouseLeave]);
 const recordVariants:Variants={normal:{y:0,opacity:0},animate:{y:[-11,0,.6,0],opacity:[0,1,1,0,0],transition:{y:{duration:.8*duration,times:[0,.4,.5,1],ease:['easeIn','easeOut','easeInOut']},opacity:{duration:.8*duration,times:[0,.1,.4,.5,1],ease:'easeInOut'}}}};
 const lidVariants:Variants={normal:{y:0},animate:{y:[0,0,1,-.3,0],transition:{duration:.8*duration,ease:'easeInOut',times:[0,.4,.58,.8,1]}}};
 const ringVariants:Variants={normal:{y:0},animate:{y:[0,0,1.4,-.35,0],transition:{duration:.8*duration,ease:'easeInOut',times:[0,.45,.63,.84,1]}}};
 const bodyVariants:Variants={normal:{scaleY:1},animate:{scaleY:[1,1,.96,1.01,1],transition:{duration:.8*duration,ease:'easeInOut',times:[0,.4,.6,.82,1]}}};
 return <LazyMotion features={domMin} strict><m.div className={cn('inline-flex items-center justify-center',className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} {...props} style={{color,...props.style}}><m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal"><m.ellipse cx="12" cy="5" rx="4" ry="1.3" variants={recordVariants}/><m.ellipse cx="12" cy="5" rx="9" ry="3" variants={lidVariants}/><m.g variants={bodyVariants} style={{transformBox:'view-box',originX:'12px',originY:'22px'}}><path d="M3 5V19A9 3 0 0 0 21 19V5"/></m.g><m.path d="M3 12A9 3 0 0 0 21 12" variants={ringVariants}/></m.svg></m.div></LazyMotion>;
});
DatabaseIcon.displayName='DatabaseIcon';

export function mountAnimatedIcons(){
 if(typeof document.querySelectorAll!=='function'||typeof MutationObserver==='undefined')return()=>{};
 const cron='.wtg9ga_root .wtg9ga_panelRow:is([aria-label="Schedules"],[aria-label="Automation tasks" i])';
 const add='.wtg9ga_root .GAkraW_iconButton[aria-label="Add workspace" i]';
 const bindings=[
  {selector:cron,Component:CalendarClockIcon,target:'.wtg9ga_panelGlyph'},
  {selector:add,Component:FolderPlusIcon},
  {selector:'.wtg9ga_root .wtg9ga_panelRow[aria-label="Artifacts"]',Component:FilesIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_panelRow[aria-label="Plugins"]',Component:PlugZapIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_panelRow[aria-label="Sina"]',Component:DatabaseIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_panelRow[aria-haspopup="menu"]',Component:EllipsisIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_panelRow[aria-label="Dreamer"]',Component:MoonStarIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_panelRow:is([aria-label*="Power BI"],[aria-label*="PowerBI"])',Component:ChartNoAxesCombinedIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_panelRow[aria-label*="Desktop"]',Component:MonitorIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_panelRow[aria-label*="Whiteboard"]',Component:PresentationIcon,target:'.wtg9ga_panelGlyph'},
  {selector:'.wtg9ga_root .wtg9ga_newSession',Component:SquarePenIcon,inline:'.wtg9ga_newSessionContent'},
  {selector:'.wtg9ga_root .GAkraW_searchButton',Component:SearchIcon},
  {selector:'.wtg9ga_root .GAkraW_iconButton[aria-label="View options" i]',Component:SlidersHorizontalIcon},
  {selector:'.GRgSLq_root .GRgSLq_add',Component:PlusIcon},
  // Never cover a live Stop button or the host's sending spinner.
  {selector:'.GRgSLq_root .GRgSLq_primary:is([aria-label="Send" i],[aria-label="Send message" i]):not([data-sending])',Component:ArrowUpIcon},
  // Native copied checkmarks and filled feedback states remain host-owned.
  {selector:'._1KfHza_actions ._1KfHza_action[aria-label^="Copy" i]',Component:CopyIcon},
  {selector:'._1KfHza_actions .Hyy-Wa_action[aria-label="Good response" i][aria-pressed="false"]',Component:ThumbsUpIcon},
  {selector:'._1KfHza_actions .Hyy-Wa_action[aria-label="Bad response" i][aria-pressed="false"]',Component:ThumbsDownIcon},
  {selector:'._1KfHza_actions ._1KfHza_action[aria-label="Branch into a new conversation"]:not([data-unavailable]):not([aria-disabled="true"])',Component:GitBranchIcon}
 ];
 const selector=bindings.map(binding=>binding.selector).join(',');
 type Binding=typeof bindings[number];
 const mounted=new Map<HTMLButtonElement,{target:HTMLElement;node:HTMLElement;inlineParent?:HTMLElement;binding:Binding;root:ReturnType<typeof createRoot>;start:()=>void;stop:()=>void}>();
 let frame=0,disposed=false;
 const remove=(button:HTMLButtonElement,entry:ReturnType<typeof mounted.get>)=>{
  if(!entry)return;
  button.removeEventListener('pointerenter',entry.start);button.removeEventListener('pointerleave',entry.stop);
  button.removeEventListener('focus',entry.start);button.removeEventListener('blur',entry.stop);
  entry.root.unmount();entry.node.remove();entry.target.classList.remove('shell-animated-host');
  if(entry.inlineParent){entry.target.remove();entry.inlineParent.classList.remove('shell-inline-icon-parent');}
  mounted.delete(button);
 };
 const scan=()=>{
  frame=0;if(disposed)return;
  for(const[button,entry]of mounted)if(!button.isConnected||!entry.node.isConnected||!button.matches(entry.binding.selector))remove(button,entry);
  for(const button of document.querySelectorAll<HTMLButtonElement>(selector)){
   if(mounted.has(button))continue;
   const binding=bindings.find(binding=>button.matches(binding.selector))!;
   let inlineParent:HTMLElement|undefined;
   let target:HTMLElement|null=binding.target?button.querySelector<HTMLElement>(binding.target):button;
   if(binding.inline){
    inlineParent=button.querySelector<HTMLElement>(binding.inline)??undefined;
    if(!inlineParent)continue;
    target=document.createElement('span');target.className='shell-inline-icon-host';
    inlineParent.classList.add('shell-inline-icon-parent');inlineParent.prepend(target);
   }
   if(!target)continue;
   const node=document.createElement('span');node.className='shell-animated-mount';node.setAttribute('aria-hidden','true');
   target.classList.add('shell-animated-host');target.append(node);
   const root=createRoot(node),ref=React.createRef<AnimatedIconHandle>();
   const start=()=>{if(!button.disabled&&button.getAttribute('aria-disabled')!=='true')ref.current?.startAnimation();};
   const stop=()=>ref.current?.stopAnimation();
   root.render(React.createElement(binding.Component as React.ComponentType<any>,{size:20,duration:1,ref}));
   button.addEventListener('pointerenter',start);button.addEventListener('pointerleave',stop);
   button.addEventListener('focus',start);button.addEventListener('blur',stop);
   mounted.set(button,{target,node,root,start,stop,binding,inlineParent});
  }
 };
 const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(scan);};
 const observer=new MutationObserver(records=>{
  if(records.some(record=>record.target instanceof Element&&record.target.closest('.wtg9ga_root,.GRgSLq_root,._1KfHza_actions')||[...record.addedNodes].some(node=>node instanceof Element&&(node.matches('.wtg9ga_root,.GRgSLq_root,._1KfHza_actions')||node.querySelector('.wtg9ga_root,.GRgSLq_root,._1KfHza_actions')))))schedule();
 });
 observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-label','data-sending','disabled','aria-pressed','data-active','data-unavailable','aria-disabled']});scan();
 return()=>{disposed=true;observer.disconnect();cancelAnimationFrame(frame);for(const[button,entry]of mounted)remove(button,entry);};
}

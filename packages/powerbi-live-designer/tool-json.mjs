/** Canonical agent output: omit absent optional object fields, reject data JSON would lose. */
export function toolJson(value) {
  const ancestors=new Set();let nodes=0;
  const invalid=(path,reason)=>{throw Object.assign(new TypeError(`Power BI tool output at ${path}: ${reason}. Inspect task status before repeating any operation.`),{code:'PLUGIN_OUTPUT_INVALID'});};
  function visit(item,path,depth){
    if(++nodes>100000||depth>128)invalid(path,'output exceeds the JSON safety budget');
    if(item===null||typeof item==='string'||typeof item==='boolean')return item;
    if(typeof item==='number'){if(!Number.isFinite(item))invalid(path,'non-finite number');return Object.is(item,-0)?0:item;}
    if(typeof item!=='object')invalid(path,'unsupported '+typeof item);
    if(ancestors.has(item))invalid(path,'circular reference');
    const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
    if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)invalid(path,'expected plain JSON data');
    const keys=Reflect.ownKeys(item);
    if(keys.some(key=>typeof key!=='string'))invalid(path,'symbol property');
    ancestors.add(item);
    try{
      if(array){
        if(keys.length!==item.length+1)invalid(path,'sparse array or extra array properties');
        const output=[];
        for(let i=0;i<item.length;i++){const field=Object.getOwnPropertyDescriptor(item,String(i));if(!field||!('value' in field)||!field.enumerable)invalid(path+'['+i+']','expected a dense data array');output.push(visit(field.value,path+'['+i+']',depth+1));}
        return output;
      }
      const output={};
      for(const key of keys){const field=Object.getOwnPropertyDescriptor(item,key);if(!field.enumerable||!('value' in field))invalid(path+'.'+key,'expected an enumerable data property');
        if(field.value===undefined)continue;
        Object.defineProperty(output,key,{value:visit(field.value,path+'.'+key,depth+1),enumerable:true,writable:true,configurable:true});
      }
      return output;
    }finally{ancestors.delete(item);}
  }
  return visit(value,'$',0);
}

export function jsonTool(definition){
  const execute=definition.execute;
  return {...definition,execute(...args){
    const result=execute.apply(this,args);
    return result instanceof Promise?result.then(toolJson):toolJson(result);
  }};
}

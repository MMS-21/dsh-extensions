import path from 'node:path';
import os from 'node:os';
export function dshProfilePath(...parts){
  return path.join(process.env.DSH_PROFILE_DIR||path.join(os.homedir(),'.dsh','profiles','desktop'),...parts);
}
export function dshRuntimeRoot(){
  const root=process.env.DSH_RUNTIME_ROOT||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Programs','DeepSeek Harness','resources','app.asar','dsh');
  return root.replaceAll('\\','/').replace(/\/$/,'')+'/';
}


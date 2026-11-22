import {createHash} from 'node:crypto';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {connectModel, mutationAcknowledged, readTableCount} from './model-refresh.mjs';
import {withMicrosoftMcp} from './microsoft-mcp.mjs';

export function validateRefreshTables(tables) {
  if (!Array.isArray(tables) || tables.length < 1 || tables.length > 20
      || tables.some(table => typeof table !== 'string' || !table.trim() || table.length > 200)
      || new Set(tables).size !== tables.length) {
    throw Error('Select between 1 and 20 distinct tables from the open model.');
  }
}

export async function listModelTables(project, withMcp = withMicrosoftMcp, resolveInstance) {
  return withMcp(async api => {
    const {inventory} = await connectModel(api, project, [], resolveInstance);
    return inventory.map(table => table.name).filter(name => typeof name === 'string');
  });
}

export async function refreshModelTables({
  project, tables, journalDir, record, signal,
  withMcp = withMicrosoftMcp, resolveInstance,
}) {
  validateRefreshTables(tables);
  return withMcp(async api => {
    signal?.throwIfAborted();
    const {connectionName, target} = await connectModel(api, project, tables, resolveInstance);
    const key = createHash('sha256').update(JSON.stringify(target)).digest('hex');
    mkdirSync(journalDir, {recursive:true});
    const lock = join(journalDir, `${key}.pending`);
    try {
      writeFileSync(lock, JSON.stringify({project,tables,startedAt:new Date().toISOString()}), {flag:'wx'});
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      throw Error('This open Power BI model already has a refresh in progress or an unresolved outcome. Check Desktop before retrying.');
    }
    const completed = [];
    const observations = [];
    let pendingTable;
    try {
      for (const table of tables) {
        signal?.throwIfAborted();
        record('dispatch', table);
        pendingTable = table;
        mutationAcknowledged(await api.call('table_operations', {request:{
          connectionName, operation:'RefreshWithXMLA', references:[{name:table}], refreshType:'Full',
        }}));
        completed.push(table);
        pendingTable = undefined;
        record('refreshed', table);
      }
      for (const table of tables) {
        signal?.throwIfAborted();
        observations.push({table,rowCount:await readTableCount(api, connectionName, table)});
      }
      record('verified');
      return {ok:true, project, completed, observations};
    } catch (error) {
      const outcome = pendingTable ? 'unknown' : completed.length === tables.length ? 'verification-incomplete' : 'stopped';
      record(outcome, pendingTable);
      return {
        ok:false, project, outcome, completed, observations, ...(pendingTable ? {pendingTable} : {}),
        error: pendingTable ? 'Power BI did not confirm the refresh of this table. Check Desktop and do not retry the operation blindly.'
          : 'The operation stopped before all row counts could be verified. Check the completed tables and Desktop before trying again.',
        code:error.code ?? 'DIRECT_REFRESH_FAILED',
      };
    } finally {
      if (!pendingTable) rmSync(lock, {force:true});
    }
  });
}

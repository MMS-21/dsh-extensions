import {createNormalizer} from './openui-validate-core.js';
import schema from '../lib/dashboard-schema.json' with {type:'json'};
import schemaV2 from '../lib/dashboard-v2-schema.json' with {type:'json'};

export const normalizeDashboardUi = createNormalizer(schema, 'Dashboard', {
  library: 'dashboard',
  libraryVersion: 'dsh-openui-dashboard-1',
});

export const normalizeDashboardV2Ui = createNormalizer(schemaV2, 'Dashboard', {
  library: 'dashboard-v2',
  libraryVersion: 'dsh-openui-dashboard-2',
});

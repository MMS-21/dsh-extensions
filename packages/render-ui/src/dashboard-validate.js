import {createNormalizer} from './openui-validate-core.js';
import schema from '../lib/dashboard-schema.json' with {type:'json'};

export const normalizeDashboardUi = createNormalizer(schema, 'Dashboard', {
  library: 'dashboard',
  libraryVersion: 'dsh-openui-dashboard-1',
});

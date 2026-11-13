import {createNormalizer} from './openui-validate-core.js';
import schema from '../lib/openui-schema.json' with {type:'json'};

export const normalizeOpenUi = createNormalizer(schema, 'Stack', {libraryVersion:'dsh-openui-1'});

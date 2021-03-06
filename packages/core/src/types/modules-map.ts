import { NormalizedModuleMetadata } from '../models/normalized-module-metadata';
import { ModuleType } from './module-type';
import { ModuleWithParams } from './module-with-params';

export type ModulesMap = Map<ModuleType | ModuleWithParams, NormalizedModuleMetadata>;
export type ModulesMapId = Map<string, ModuleType | ModuleWithParams>;

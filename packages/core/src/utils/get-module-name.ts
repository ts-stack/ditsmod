import { ModuleType } from '../types/module-type';
import { ModuleWithParams } from '../types/module-with-params';
import { isModuleWithParams } from './type-guards';

export function getModuleName(modOrObject: ModuleType | ModuleWithParams): string {
  return isModuleWithParams(modOrObject) ? modOrObject.module.name : modOrObject.name;
}

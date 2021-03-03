import { reflector } from '@ts-stack/di';

import { Module } from '../decorators/module';
import { RootModule } from '../decorators/root-module';
import { ModuleMetadata } from '../types/module-metadata';
import { ModuleType } from '../types/module-type';
import { ModuleWithParams } from '../types/module-with-params';
import { checkModuleMetadata } from './check-module-metadata';
import { getModuleName } from './get-module-name';
import { mergeArrays } from './merge-arrays-options';
import { isModule, isModuleWithParams, isRootModule } from './type-guards';

export function getModuleMetadata<T extends ModuleMetadata>(
  modOrObject: ModuleType | ModuleWithParams,
  isRoot?: boolean
): ModuleMetadata {
  const typeGuard = isRoot ? isRootModule : (m: ModuleMetadata) => isModule(m) || isRootModule(m);

  if (isModuleWithParams(modOrObject)) {
    const modWitParams = modOrObject;
    const modMetadata: T = reflector.annotations(modWitParams.module).find(typeGuard) as T;
    const modName = getModuleName(modWitParams.module);
    checkModuleMetadata(modMetadata, modName, isRoot);

    const Metadata = isRoot ? RootModule : Module;
    const metadata = new Metadata(modMetadata);
    metadata.providersPerApp = mergeArrays(modMetadata.providersPerApp, modWitParams.providersPerApp);
    metadata.providersPerMod = mergeArrays(modMetadata.providersPerMod, modWitParams.providersPerMod);
    metadata.providersPerReq = mergeArrays(modMetadata.providersPerReq, modWitParams.providersPerReq);
    return metadata;
  } else {
    return reflector.annotations(modOrObject).find(typeGuard);
  }
}
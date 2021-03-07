import { format } from 'util';
import { Injectable, resolveForwardRef } from '@ts-stack/di';

import { ModuleType } from '../types/module-type';
import { ModuleWithParams } from '../types/module-with-params';
import { checkModuleMetadata } from '../utils/check-module-metadata';
import { getModuleName } from '../utils/get-module-name';
import { getModuleMetadata } from '../utils/get-module-metadata';
import { isModuleWithParams, isProvider } from '../utils/type-guards';
import { NormalizedModuleMetadata } from '../models/normalized-module-metadata';
import { ModuleMetadata } from '../types/module-metadata';
import { Logger } from '../types/logger';

type MapId = string | number | ModuleType | ModuleWithParams;
type MapType = Map<MapId, NormalizedModuleMetadata>;

@Injectable()
export class ModuleManager {
  #map: MapType = new Map();

  constructor(protected log: Logger) {}

  scanRootModule(module: ModuleType | ModuleWithParams<any>) {
    const metadata = this.scanModule(module);
    this.#map.delete(module);
    return this.#map.set('root', metadata);
  }

  scanModule(modOrObj: ModuleType | ModuleWithParams<any>) {
    if (!Object.isFrozen(modOrObj)) {
      Object.freeze(modOrObj);
    }

    const metadata = this.normalizeMetadata(modOrObj);
    [...metadata.importsModules, ...metadata.importsWithParams, ...metadata.exportsModules].forEach((impOrExp) => {
      this.scanModule(impOrExp);
    });

    type ImpOrExp = Exclude<keyof NormalizedModuleMetadata, 'id'>;
    const group: ImpOrExp[] = ['importsModules', 'importsWithParams', 'exportsModules', 'exportsProviders'];

    group.forEach((prop) => {
      if (!metadata[prop]?.length) {
        delete metadata[prop];
      }
    });

    const id = metadata.id || modOrObj;
    this.#map.set(id, metadata);
    return metadata;
  }

  getModules() {
    return this.#map;
  }

  /**
   * If `inputModule` added, returns `true`, otherwise - returns `false`.
   *
   * @param inputModule Module to be added.
   * @param targetModuleId Module ID to which the input module will be added.
   */
  addImport(inputModule: ModuleType | ModuleWithParams, targetModuleId: string | number = 'root'): boolean {
    const target = this.#map.get(targetModuleId);
    const warn =
      `The module with ID "${format(inputModule)}" has already been imported ` +
      `into "${format(targetModuleId)}"`;
    if (!target) {
      const modName = getModuleName(inputModule);
      const msg = `Failed adding ${modName} to "imports" array: target module with ID "${targetModuleId}" not found.`;
      throw new Error(msg);
    }

    if (isModuleWithParams(inputModule)) {
      if (!target.importsWithParams) {
        target.importsWithParams = [];
      }
      if (target.importsWithParams.find((imp) => imp === inputModule)) {
        this.log.warn(warn);
        return false;
      } else {
        target.importsWithParams.push(inputModule);
      }
    } else {
      if (!target.importsModules) {
        target.importsModules = [];
      }
      if (target.importsModules.find((imp) => imp === inputModule)) {
        this.log.warn(warn);
        return false;
      } else {
        target.importsModules.push(inputModule);
      }
    }
    this.scanModule(inputModule);
    return true;
  }

  /**
   * @param inputModuleId Module to be removed or its module ID.
   * If the module have ID, then you must use this ID here.
   *
   * @param targetModuleId Module ID from where the module will be removed.
   */
  removeImport(inputModuleId: MapId, targetModuleId: string | number = 'root'): boolean {
    const metadata = this.#map.get(inputModuleId);
    const warn = `Module with ID "${format(inputModuleId)}" not found`;
    if (!metadata) {
      this.log.warn(warn);
      return false;
    }
    this.#map.delete(inputModuleId);

    const target = this.#map.get(targetModuleId);
    if (!target) {
      const modName = getModuleName(metadata.module);
      const msg = `Failed removing ${modName} from "imports" array: target module with ID "${targetModuleId}" not found.`;
      throw new Error(msg);
    }
    if (isModuleWithParams(metadata.module)) {
      if (!target.importsWithParams) {
        this.log.warn(warn);
        return false;
      }
      const index = target.importsWithParams.findIndex((imp) => imp === metadata.module);
      target.importsWithParams.splice(index, 1);
    } else {
      if (!target.importsModules) {
        this.log.warn(warn);
        return false;
      }
      const index = target.importsModules.findIndex((imp) => imp === metadata.module);
      target.importsModules.splice(index, 1);
    }
    return true;
  }

  /**
   * Freezes original module metadata and returns normalized module metadata.
   */
  protected normalizeMetadata(mod: ModuleType | ModuleWithParams) {
    const modMetadata = getModuleMetadata(mod);
    const modName = getModuleName(mod);
    checkModuleMetadata(modMetadata, modName);

    /**
     * Setting initial properties of metadata.
     */
    const metadata = new NormalizedModuleMetadata();
    metadata.module = mod;
    /**
     * `ngMetadataName` is used only internally and is hidden from the public API.
     */
    metadata.ngMetadataName = (modMetadata as any).ngMetadataName;

    if (modMetadata.id) {
      metadata.id = modMetadata.id;
      this.log.debug(`${modName} has been assigned an ID: "${metadata.id}".`);
    }

    modMetadata.imports?.forEach((imp) => {
      imp = resolveForwardRef(imp);
      if (isModuleWithParams(imp)) {
        metadata.importsWithParams.push(imp);
      } else {
        metadata.importsModules.push(imp);
      }
    });

    modMetadata.exports?.forEach((exp) => {
      exp = resolveForwardRef(exp);
      if (isProvider(exp)) {
        metadata.exportsProviders.push(exp);
      } else {
        metadata.exportsModules.push(exp);
      }
    });

    const group: Exclude<keyof ModuleMetadata, 'id' | 'imports' | 'exports'>[] = [
      'controllers',
      'providersPerApp',
      'providersPerMod',
      'providersPerReq',
      'extensions',
    ];

    group.forEach((prop) => {
      if (modMetadata[prop]?.length) {
        metadata[prop] = this.normalizeArray(modMetadata[prop]);
      } else {
        delete metadata[prop];
      }
    });

    return metadata;
  }

  protected normalizeArray(arr: any[]) {
    return (arr || []).slice().map(resolveForwardRef);
  }
}
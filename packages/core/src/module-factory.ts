import { Injectable, ReflectiveInjector, reflector } from '@ts-stack/di';

import { NormalizedModuleMetadata } from './models/normalized-module-metadata';
import { ProvidersMetadata } from './models/providers-metadata';
import { Counter } from './services/counter';
import { defaultExtensions } from './services/default-extensions';
import { defaultProvidersPerReq } from './services/default-providers-per-req';
import { ModuleManager } from './services/module-manager';
import { ControllerAndMethodMetadata } from './types/controller-and-method-metadata';
import { ExtensionMetadata } from './types/extension-metadata';
import { GuardItem } from './types/guard-item';
import { MethodMetadata } from './types/method-metadata';
import { ModuleType } from './types/module-type';
import { ModuleWithParams } from './types/module-with-params';
import { NormalizedGuard } from './types/normalized-guard';
import { NodeReqToken, NodeResToken } from './types/server-options';
import { ServiceProvider } from './types/service-provider';
import { getDuplicates } from './utils/get-duplicates';
import { getModule } from './utils/get-module';
import { getTokensCollisions } from './utils/get-tokens-collisions';
import { getUniqProviders } from './utils/get-uniq-providers';
import { NormalizedProvider, normalizeProviders } from './utils/ng-utils';
import { throwProvidersCollisionError } from './utils/throw-providers-collision-error';
import { isController, isExtensionProvider, isRootModule } from './utils/type-guards';

/**
 * - imports and exports global providers;
 * - merges global and local providers;
 * - checks on providers collisions;
 * - collects module and controllers metadata.
 */
@Injectable()
export class ModuleFactory {
  protected moduleName: string;
  protected prefixPerMod: string;
  protected guardsPerMod: NormalizedGuard[];
  /**
   * Module metadata.
   */
  protected meta: NormalizedModuleMetadata;
  protected allExportedProvidersPerMod: ServiceProvider[] = [];
  protected allExportedProvidersPerReq: ServiceProvider[] = [];
  protected exportedProvidersPerMod: ServiceProvider[] = [];
  protected exportedProvidersPerReq: ServiceProvider[] = [];
  protected globalProviders: ProvidersMetadata;
  protected extensionMetadataMap = new Map<ModuleType | ModuleWithParams, ExtensionMetadata>();
  #moduleManager: ModuleManager;

  constructor(protected injectorPerApp: ReflectiveInjector, protected counter: Counter) {}

  /**
   * Called only by `@RootModule` before called `ModuleFactory#boostrap()`.
   *
   * @param globalProviders Contains providersPerApp for now.
   */
  exportGlobalProviders(moduleManager: ModuleManager, globalProviders: ProvidersMetadata) {
    this.#moduleManager = moduleManager;
    const meta = moduleManager.getMetadata('root', true);
    this.moduleName = meta.name;
    this.meta = meta;
    this.globalProviders = globalProviders;
    this.importProviders(meta, true);
    this.checkProvidersCollisions(true);

    return {
      providersPerMod: this.allExportedProvidersPerMod,
      providersPerReq: this.allExportedProvidersPerReq,
    };
  }

  /**
   * Bootstraps a module.
   *
   * @param modOrObj Module that will bootstrapped.
   */
  bootstrap(
    globalProviders: ProvidersMetadata,
    prefixPerMod: string,
    modOrObj: ModuleType | ModuleWithParams,
    moduleManager: ModuleManager,
    guardsPerMod?: NormalizedGuard[]
  ) {
    const meta = moduleManager.getMetadata(modOrObj, true);
    this.#moduleManager = moduleManager;
    this.globalProviders = globalProviders;
    this.prefixPerMod = prefixPerMod || '';
    this.moduleName = meta.name;
    this.guardsPerMod = guardsPerMod || [];
    this.quickCheckMetadata(meta);
    this.meta = meta;
    this.importModules();
    this.mergeProviders(meta);

    const injectorPerMod = this.injectorPerApp.resolveAndCreateChild(this.meta.providersPerMod);
    const mod = getModule(meta.module);
    injectorPerMod.resolveAndInstantiate(mod); // Only check DI resolvable
    const controllersMetadata = this.getControllersMetadata();

    return this.extensionMetadataMap.set(modOrObj, {
      prefixPerMod,
      guardsPerMod: this.guardsPerMod,
      moduleMetadata: this.meta,
      controllersMetadata,
    });
  }

  protected mergeProviders(moduleMetadata: NormalizedModuleMetadata) {
    const duplicatesProvidersPerMod = getDuplicates([
      ...this.globalProviders.providersPerMod,
      ...this.meta.providersPerMod,
    ]);
    const globalProvidersPerMod = isRootModule(moduleMetadata) ? [] : this.globalProviders.providersPerMod;
    this.meta.providersPerMod = [
      ...globalProvidersPerMod.filter((p) => !duplicatesProvidersPerMod.includes(p)),
      ...this.allExportedProvidersPerMod,
      ...this.meta.providersPerMod,
    ];

    const duplicatesProvidersPerReq = getDuplicates([
      ...this.globalProviders.providersPerReq,
      ...this.meta.providersPerReq,
    ]);
    const globalProvidersPerReq = isRootModule(moduleMetadata)
      ? defaultProvidersPerReq
      : this.globalProviders.providersPerReq;
    this.meta.providersPerReq = [
      ...globalProvidersPerReq.filter((p) => !duplicatesProvidersPerReq.includes(p)),
      ...this.allExportedProvidersPerReq,
      ...this.meta.providersPerReq,
    ];
  }

  protected quickCheckMetadata(meta: NormalizedModuleMetadata) {
    if (
      !isRootModule(meta as any) &&
      !meta.providersPerApp.length &&
      !meta.controllers.length &&
      !meta.exportsProviders.length &&
      !meta.exportsModules.length &&
      !meta.extensions.length
    ) {
      const msg =
        `Importing ${this.moduleName} failed: this module should have "providersPerApp"` +
        ' or some controllers, or exports, or extensions.';
      throw new Error(msg);
    }

    const { providersPerApp, providersPerMod, providersPerReq } = meta;
    const providers = [...providersPerApp, ...providersPerMod, ...defaultExtensions];
    const extensionsTokens = normalizeProviders(providers).map((np) => np.provide);
    const extensionsTokensPerReq = normalizeProviders(providersPerReq).map((np) => np.provide);
    meta.extensions.forEach((Ext, i) => {
      if (!isExtensionProvider(Ext)) {
        const msg =
          `Importing ${this.moduleName} failed: Extensions with array index "${i}" ` +
          'must be a class with init() method.';
        throw new TypeError(msg);
      }
      if (extensionsTokensPerReq.includes(Ext)) {
        const msg = `Importing ${this.moduleName} failed: Extensions "${Ext.name}" cannot be includes in the "providersPerReq" array.`;
        throw new Error(msg);
      }
      if (!extensionsTokens.includes(Ext)) {
        const msg =
          `Importing ${this.moduleName} failed: Extensions "${Ext.name}" must be includes in ` +
          '"providersPerApp" or "providersPerMod" array.';
        throw new Error(msg);
      }
    });
  }

  protected importModules() {
    for (const imp of this.meta.importsModules) {
      const meta = this.#moduleManager.getMetadata(imp, true);
      this.importProviders(meta, true);
      const moduleFactory = this.injectorPerApp.resolveAndInstantiate(ModuleFactory) as ModuleFactory;
      const extensionMetadataMap = moduleFactory.bootstrap(
        this.globalProviders,
        this.prefixPerMod,
        imp,
        this.#moduleManager,
        this.guardsPerMod
      );
      this.extensionMetadataMap = new Map([...this.extensionMetadataMap, ...extensionMetadataMap]);
    }
    for (const imp of this.meta.importsWithParams) {
      const meta = this.#moduleManager.getMetadata(imp, true);
      this.importProviders(meta, true);
      const prefixPerMod = [this.prefixPerMod, imp.prefix].filter((s) => s).join('/');
      const normalizedGuardsPerMod = this.normalizeGuards(imp.guards);
      this.checkGuardsPerMod(normalizedGuardsPerMod);
      const guardsPerMod = [...this.guardsPerMod, ...normalizedGuardsPerMod];
      const moduleFactory = this.injectorPerApp.resolveAndInstantiate(ModuleFactory) as ModuleFactory;
      const extensionMetadataMap = moduleFactory.bootstrap(
        this.globalProviders,
        prefixPerMod,
        imp,
        this.#moduleManager,
        guardsPerMod
      );
      this.extensionMetadataMap = new Map([...this.extensionMetadataMap, ...extensionMetadataMap]);
    }
    this.checkProvidersCollisions();
  }

  protected normalizeGuards(guards: GuardItem[]) {
    return (guards || []).map((item) => {
      if (Array.isArray(item)) {
        return { guard: item[0], params: item.slice(1) } as NormalizedGuard;
      } else {
        return { guard: item } as NormalizedGuard;
      }
    });
  }

  protected checkGuardsPerMod(guards: NormalizedGuard[]) {
    for (const Guard of guards.map((n) => n.guard)) {
      const type = typeof Guard?.prototype.canActivate;
      if (type != 'function') {
        throw new TypeError(
          `Import ${this.moduleName} with guards failed: Guard.prototype.canActivate must be a function, got: ${type}`
        );
      }
    }
  }

  /**
   * Recursively imports providers.
   *
   * @param metadata Module metadata from where exports providers.
   */
  protected importProviders(metadata: NormalizedModuleMetadata, isStarter?: boolean) {
    const { exportsModules, exportsProviders, providersPerMod, providersPerReq } = metadata;

    for (const mod of exportsModules) {
      const meta = this.#moduleManager.getMetadata(mod, true);
      // Reexported module
      this.importProviders(meta);
    }

    for (const provider of exportsProviders) {
      const normProvider = normalizeProviders([provider])[0];
      const foundProvider = this.findAndSetProvider(provider, normProvider, providersPerMod, providersPerReq);
      if (!foundProvider) {
        const providerName = normProvider.provide.name || normProvider.provide;
        throw new Error(
          `Exported ${providerName} from ${metadata.name} ` +
            'should includes in "providersPerMod" or "providersPerReq", ' +
            'or in some "exports" of imported modules. ' +
            'Tip: "providersPerApp" no need exports, they are automatically exported.'
        );
      }
    }

    this.mergeWithAllExportedProviders(isStarter);
  }

  protected mergeWithAllExportedProviders(isStarter: boolean) {
    let perMod = this.exportedProvidersPerMod;
    let perReq = this.exportedProvidersPerReq;
    this.exportedProvidersPerMod = [];
    this.exportedProvidersPerReq = [];

    if (!isStarter) {
      /**
       * Removes duplicates of providers inside each child modules.
       */
      perMod = getUniqProviders(perMod);
      perReq = getUniqProviders(perReq);
    }

    this.allExportedProvidersPerMod.push(...perMod);
    this.allExportedProvidersPerReq.push(...perReq);
  }

  protected findAndSetProvider(
    provider: ServiceProvider,
    normProvider: NormalizedProvider,
    providersPerMod: ServiceProvider[],
    providersPerReq: ServiceProvider[]
  ) {
    if (hasProviderIn(providersPerMod)) {
      this.exportedProvidersPerMod.push(provider);
      return true;
    } else if (hasProviderIn(providersPerReq)) {
      this.exportedProvidersPerReq.push(provider);
      return true;
    }

    return false;

    function hasProviderIn(providers: ServiceProvider[]) {
      const normProviders = normalizeProviders(providers);
      return normProviders.some((p) => p.provide === normProvider.provide);
    }
  }

  /**
   * This method should called before call `this.mergeProviders()`.
   *
   * @param isGlobal Indicates that need find collision for global providers.
   */
  protected checkProvidersCollisions(isGlobal?: boolean) {
    const tokensPerApp = normalizeProviders(this.globalProviders.providersPerApp).map((np) => np.provide);

    const declaredTokensPerMod = normalizeProviders(this.meta.providersPerMod).map((np) => np.provide);
    const exportedNormProvidersPerMod = normalizeProviders(this.allExportedProvidersPerMod);
    const exportedTokensPerMod = exportedNormProvidersPerMod.map((np) => np.provide);
    const multiTokensPerMod = exportedNormProvidersPerMod.filter((np) => np.multi).map((np) => np.provide);
    let duplExpTokensPerMod = getDuplicates(exportedTokensPerMod).filter((d) => !multiTokensPerMod.includes(d));
    if (isGlobal) {
      const rootExports = this.meta.exportsProviders;
      const rootTokens = normalizeProviders(rootExports).map((np) => np.provide);
      duplExpTokensPerMod = duplExpTokensPerMod.filter((d) => !rootTokens.includes(d));
    } else {
      duplExpTokensPerMod = duplExpTokensPerMod.filter((d) => !declaredTokensPerMod.includes(d));
    }
    duplExpTokensPerMod = getTokensCollisions(duplExpTokensPerMod, this.allExportedProvidersPerMod);
    const tokensPerMod = [...declaredTokensPerMod, ...exportedTokensPerMod];

    const declaredTokensPerReq = normalizeProviders(this.meta.providersPerReq).map((np) => np.provide);
    const exportedNormalizedPerReq = normalizeProviders(this.allExportedProvidersPerReq);
    const exportedTokensPerReq = exportedNormalizedPerReq.map((np) => np.provide);
    const multiTokensPerReq = exportedNormalizedPerReq.filter((np) => np.multi).map((np) => np.provide);
    let duplExpPerReq = getDuplicates(exportedTokensPerReq).filter((d) => !multiTokensPerReq.includes(d));
    if (isGlobal) {
      const rootExports = this.meta.exportsProviders;
      const rootTokens = normalizeProviders(rootExports).map((np) => np.provide);
      duplExpPerReq = duplExpPerReq.filter((d) => !rootTokens.includes(d));
    } else {
      duplExpPerReq = duplExpPerReq.filter((d) => !declaredTokensPerReq.includes(d));
    }
    duplExpPerReq = getTokensCollisions(duplExpPerReq, this.allExportedProvidersPerReq);

    const mixPerApp = tokensPerApp.filter((p) => {
      if (exportedTokensPerMod.includes(p) && !declaredTokensPerMod.includes(p)) {
        return true;
      }
      return exportedTokensPerReq.includes(p) && !declaredTokensPerReq.includes(p);
    });

    const defaultTokens = normalizeProviders([...defaultProvidersPerReq]).map((np) => np.provide);
    const mergedTokens = [...defaultTokens, ...tokensPerMod, NodeReqToken, NodeResToken];
    const mixPerModOrReq = mergedTokens.filter((p) => {
      return exportedTokensPerReq.includes(p) && !declaredTokensPerReq.includes(p);
    });

    const collisions = [...duplExpTokensPerMod, ...duplExpPerReq, ...mixPerApp, ...mixPerModOrReq];
    if (collisions.length) {
      throwProvidersCollisionError(this.moduleName, collisions);
    }
  }

  protected getControllersMetadata() {
    const arrControllerMetadata: ControllerAndMethodMetadata[] = [];
    for (const controller of this.meta.controllers) {
      const ctrlDecorValues = reflector.annotations(controller);
      if (!ctrlDecorValues.find(isController)) {
        throw new Error(
          `Collecting controller's metadata failed: class "${controller.name}" does not have the "@Controller()" decorator`
        );
      }
      const controllerMetadata: ControllerAndMethodMetadata = { controller, ctrlDecorValues, methods: {} };
      const propMetadata = reflector.propMetadata(controller);
      for (const methodName in propMetadata) {
        const methodDecorValues = propMetadata[methodName];
        const methodId = this.counter.incrementCtrlMethodId();
        controllerMetadata.methods[methodName] = methodDecorValues.map<MethodMetadata>((decoratorValue) => {
          const decoratorId = this.counter.incrementCtrlDecoratorId();
          return { methodId, decoratorId, value: decoratorValue };
        });
      }
      arrControllerMetadata.push(controllerMetadata);
    }

    return arrControllerMetadata;
  }
}

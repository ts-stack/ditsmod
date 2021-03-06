import { ReflectiveInjector, ResolvedReflectiveProvider } from '@ts-stack/di';

import { RouteMetadata } from '../decorators/route';
import { ControllerType } from './controller-type';
import { NormalizedGuard } from './normalized-guard';

export interface RouteData {
  controller: ControllerType;
  /**
   * The controller's method name.
   */
  methodName: string;
  route: RouteMetadata;
  /**
   * Resolved providers per request.
   */
  providers: ResolvedReflectiveProvider[];
  /**
   * Injector per a module.
   */
  injector: ReflectiveInjector;
  /**
   * Need or not parse body.
   */
  parseBody: boolean;
  /**
   * An array of DI tokens used to look up `CanActivate()` handlers,
   * in order to determine if the current user is allowed to activate the controller.
   * By default, any user can activate.
   */
  guards: NormalizedGuard[];
}

/**
 * All properties of this class are initialized with `null`.
 */
export interface PreRouteData extends RouteData {
  /**
   * During application initialization, this ID increments with each controller method.
   */
  methodId: number;
  /**
   * This ID is unique per the application. During application initialization, it increments
   * with each decorator assigned to the controller method.
   */
  decoratorId: number;
}

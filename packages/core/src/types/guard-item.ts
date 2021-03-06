import { Type } from '@ts-stack/di';

import { CanActivate } from './can-activate';

export type GuardItem = Type<CanActivate> | [Type<CanActivate>, any, ...any[]];

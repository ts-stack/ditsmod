import { RootModule } from '@ditsmod/core';

import { SomeModule } from './modules/routed/some/some.module';
import { DefaultsModule } from './modules/services/defaults/defaults.module';

@RootModule({
  imports: [SomeModule],
  exports: [DefaultsModule]
})
export class AppModule {}

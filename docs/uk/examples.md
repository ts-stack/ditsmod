# Приклади застосунків

Тека [examples][100] містить приклади застосування Ditsmod для типових випадків.
Їх зручніше проглядати, якщо клонувати репозиторій Ditsmod
та встановити npm залежності:

```bash
git clone git@github.com:ditsmod/ditsmod.git ditsmod/ditsmod
cd ditsmod/ditsmod
npm i
```

Після чого можете запустити один із застосунків, експерементувати з ними,
і зразу бачити результат.

Кожен приклад має README.md, де коротко описано основні його особливості.

## 1-hello-world

Самий простий приклад, де є кореневий модуль, один контролер та один маршрут.

Перевірити роботу прикладу можна так, з першого терміналу:

```bash
npm run start1
```

З другого терміналу:

```bash
curl -isS localhost:8080
```

## 2-controller-error-handler

Ditsmod в ядрі оголошує клас `ControllerErrorHandler` на рівні HTTP-запиту та використовує DI щоб
отримати інстанс цього класу для обробки помилок, що виникають під час роботи контролерів.
Початково, цей клас робить мінімальну обробку помилок:

```ts
class ControllerErrorHandler {
  constructor(private res: Response, private log: Logger) {}

  handleError(err: Error) {
    const { message } = err;
    this.log.error({ err });
    if (!this.res.nodeRes.headersSent) {
      this.res.sendJson({ error: { message } }, Status.INTERNAL_SERVER_ERROR);
    }
  }
}
```

У прикладі `2-controller-error-handler` показано варіант впровадження інтерфейсу
`ControllerErrorHandler` у класі `MyControllerErrorHandler`. Зверніть увагу,
що `ControllerErrorHandler` спочатку оголошується в кореневому модулі в масиві `providersPerReq`,
а потім експортується з підміною його на `MyControllerErrorHandler`.

Коли ви експортуєте певний провайдер з кореневого модуля, тим самим ви збільшуєте область
його видимості для DI на весь застосунок.

Але чому відбувається оголошення саме в масиві `providersPerReq`? - Через те, що в конструкторі
запитується провайдер `Response` на рівні запиту. Якщо б ви оголосили `ControllerErrorHandler`
в масиві `providersPerApp`, DI використовував би [інжектор][101] на рівні застосунку, і саме через це
він би не побачив провайдерів на рівні запиту.

Перевірити роботу прикладу можна так, з першого терміналу:

```bash
npm run start2
```

З другого терміналу:

```bash
curl -isS localhost:8080
curl -isS localhost:8080/throw-error
```

## 3-route-guards

У цьому прикладі, в кореневий модуль імпортується `SomeModule`, де є контролер із захищеними
маршрутами. Захист даних маршрутів відбуваєтья за допомогою [гардів (guards)][103].
Ці гарди знаходяться в `AuthModule`, а сам модуль експортується без імпорту. Еспорт модулів
стосується виключно збільшення області видимості провайдерів для DI. Не має сенсу експортувати
модулі, якщо ви не збираєтесь збільшувати область видимості оголошених в них провайдерів.

Разом із тим, якщо ви робите [експорт певного модуля із кореневого модуля][102], область видимості
його провайдерів може збільшитись на весь застосунок. Саме це і відбувається у модулі `AuthModule`.

В `SomeController` показано два варіанти використання гардів. Перший варіант без аргументів:

```ts
@Route('GET', 'unauth', [AuthGuard])
throw401Error() {
  this.res.send('some secret');
}
```

Другий варіант з аргументами:

```ts
@Route('GET', 'forbidden', [[PermissionsGuard, Permission.canActivateAdministration]])
throw403Error() {
  this.res.send('some secret');
}
```

Перевірити роботу прикладу можна так, з першого терміналу:

```bash
npm run start3
```

З другого терміналу:

```bash
curl -isS localhost:8080
curl -isS localhost:8080/unauth
curl -isS localhost:8080/forbidden
```

## 4-logger

У цьому прикладі, показано як можна в одному застосунку мати відразу чотири логера:

- `DefaultLogger`;
- [bunyan][6];
- [pino][7];
- [winston][5];

На практиці такий приклад наврядчи може знадобитись, але в ньому демонструється робота
ієрархічної архітектури DI, правила експорту/імпорту провайдерів, механізм підміни by default
логера та by default конфігурації для логера.

У `PinoModule`, `BunyanModule` та `WinstonModule` зроблено підміни by default логера, причому зроблено це в
масиві `providersPerMod`. І саме тому контролери в цих модулях будуть використовувати відповідно
pino, bunyan та winston.

Тут варто звернути увагу, що в конструкторах будь-яких класів використовується by default логер у
якості [токена][104], а DI вже підставляє для різних контролерів різні логери.

```ts
import { Controller, Logger, Response, Route } from '@ditsmod/core';

// ...
constructor(private res: Response, private log: Logger) {}
// ...
```

Перевірити роботу прикладу можна так, з першого терміналу:

```bash
npm run start4
```

З другого терміналу:

```bash
curl -isS localhost:8080
curl -isS localhost:8080/pino
curl -isS localhost:8080/winston
```

## 5-nested-routes

Простий приклад, як можна використовувати префікси на рівні застосунку та на рівні модуля.

Перевірити роботу прикладу можна так, з першого терміналу:

```bash
npm run start5
```

З другого терміналу:

```bash
curl -isS localhost:8080/api/admin
curl -isS localhost:8080/api/user
```

## 6-body-parser

Перевірити роботу прикладу можна так, з першого терміналу:

```bash
npm run start6
```

З другого терміналу:

```bash
curl -isS localhost:8080 -d '{"one":1}' -H 'content-type: application/json'
```

[5]: https://github.com/winstonjs/winston
[6]: https://github.com/trentm/node-bunyan
[7]: https://github.com/pinojs/pino

[100]: https://github.com/ditsmod/core/tree/master/examples
[101]: ./README.md#інжектори-di
[102]: ./README.md#експорт-провайдерів-із-кореневого-модуля
[103]: ./README.md#guards
[104]: ./README.md#токени-di

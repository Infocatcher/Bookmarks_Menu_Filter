﻿#### Bookmarks Menu Filter: История изменений

`+` - добавлено<br>
`-` - удалено<br>
`x` - исправлено<br>
`*` - улучшено<br>

##### master/HEAD
`x` Исправлена обработка уже удаленных меню.<br>
`*` Небольшие внутренние улучшения.<br>
`*` Улучшена производительность при запуске: код для обработки меню перемещен в отдельный лениво загружаемый файл (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/7">#7</a>).<br>
`*` Улучшена производительность при запуске: вспомогательные функции перемещены в отдельный лениво загружаемый файл (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/8">#8</a>).<br>
`*` Улучшена совместимость с мультипроцессным режимом (Electrolysis aka e10s) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/9">#9</a>).<br>
`x` Исправлена совместимость с Firefox 51+ (SyntaxError: non-generator method definitions may not contain yield).<br>
`x` Исправлена совместимость с будущими версиями Firefox: прекращено использование Array generics вида `Array.forEach()` (<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1222547">bug 1222547</a>).<br>
`x` Исправлена совместимость с будущими версиями Firefox: прекращено использование legacy generators (<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1083482">bug 1083482</a>).<br>
`x` Исправлена совместимость с будущими версиями Firefox: прекращено использование `Date.prototype.toLocaleFormat()` в отладочных логах (<em>extensions.bookmarksMenuFilter.debug</em> = true) (<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=818634">bug 818634</a>).<br>
`x` Исправлена обработка клавиши Escape в Pale Moon и Basilisk.<br>
`*` Улучшена производительность при запуске: код для обработки настроек перемещен в отдельный лениво загружаемый файл (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/10">#10</a>).<br>

##### 0.1.0a38 (2014-06-30)
`x` Исправлено определение встроенных приватных окон в SeaMonkey (было изменено в релизной версии).<br>
`x` Ввод текста больше не обрабатывается, если открыто контекстное меню (для поддержки клавишей доступа) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/4">#4</a>).<br>
`x` Восстановлена совместимость с Firefox 3.6 и более старыми версиями (nsITimer.init() не обрабатывает функции).<br>
`x` Добавлена остановка фильтрации, если меню было закрыто (и меню закладок больше не помечаются как загруженные).<br>
`*` Увеличена скорость фильтрации: теперь используется nsIThread.dispatch() вместо nsITimer.init().<br>
`x` Исправлена загрузка настроек по умолчанию в Gecko 2 и 3.<br>
`+` Добавлена локализация в Gecko 2 - 7.<br>
`*` Список открытых меню теперь проверяется на наличие уже закрытых для исправления возможных проблем.<br>
`x` Исправлена обработка сочетаний клавиш при нажатом CapsLock.<br>
`+` Добавлена возможность отмены/повторения (Ctrl+Z и Ctrl+Shift+Z, Ctrl+Y) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/5">#5</a>).<br>
`+` Добавлена поддержка правил замены для поиска трудных для ввода символов (настройка <em>extensions.bookmarksMenuFilter.replacements</em>) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/6">#6</a>).<br>

##### 0.1.0a37 (2013-11-04)
`*` Увеличены значения по умолчанию для настроек <em>filterMaxLevel</em> и <em>filter*Delay</em>.<br>
`x` Некоторые исправления для Mac OS X (теперь лучше, но все еще не работает корректно).<br>
`x` Добавлено удаление всплывающей подсказки из закрывающегося окна для предотвращения утечек памяти (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/3">#3</a>).<br>
`*` Добавлена остановка всех операций после клика по всплывающей подсказке (на случай возникновения проблем).<br>
`x` Исправлена обработка клавиши Escape в Firefox 25+.<br>

##### 0.1.0a36 (2013-04-19)
`*` Добавлена подсветка индикатора специального типа, если пользователь ввел некорректное регулярное выражение (и добавлено отображение текста ошибки в подсказке).<br>
`x` Обработчик всплывающих меню завершается, если открытое меню отсутствует или уже закрыто.<br>
`*` Теперь в функцию nsIClipboardHelper.copyString() передается документ-источник для пооконного приватного режима.<br>
`+` Добавлено определение приватных окон в последних версиях SeaMonkey (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/1">#1</a>).<br>
`*` Реализована асинхронная фильтрация для улучшения обработки большого количества закладок (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/2">#2</a>).<br>
`+` Добавлена поддержка расширения <a href="https://addons.mozilla.org/addon/history-submenus-2/">History Submenus Ⅱ</a>.<br>

##### 0.1.0a35 (2013-01-06)
`*` Опубликовано на GitHub.<br>
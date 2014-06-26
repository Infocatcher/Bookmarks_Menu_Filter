﻿#### Bookmarks Menu Filter: Changelog

`+` - added<br>
`-` - deleted<br>
`x` - fixed<br>
`*` - improved<br>

##### master/HEAD
`x` Correctly detect built-in private windows in SeaMonkey (was changed in released version).<br>
`x` Don't handle input, if opened context menu (to not break accesskeys) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/4">#4</a>).<br>
`x` Restored compatibility with Firefox 3.6 and older (nsITimer.init() doesn't accept functions).<br>
`x` Correctly stop filtration, if popup was closed (and don't mark bookmark menus as loaded).<br>
`*` Improved filtration speed: now used nsIThread.dispatch() instead of nsITimer.init().<br>
`x` Correctly load default preferences in Gecko 2 and 3.<br>
`+` Added localization in Gecko 2 - 7.<br>
`*` Check list of opened popups for already closed to fix possible problems.<br>

##### 0.1.0a37 (2013-11-04)
`*` Increased default values for <em>filterMaxLevel</em> and <em>filter*Delay</em> preferences.<br>
`x` Some fixes for Mac OS X (better now, but still doesn't work correctly).<br>
`x` Remove tooltip from closing window to avoid memory leaks (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/3">#3</a>).<br>
`*` Stop all operations after click on tooltip (to solve possible problems).<br>
`x` Correctly handle Escape key in Firefox 25+.<br>

##### 0.1.0a36 (2013-04-19)
`*` Highlight special type indicator, if user enters invalid regular expression (and show error message in hint).<br>
`x` Destroy popup handler, if no opened popup or popup is already closed.<br>
`*` Pass source document to nsIClipboardHelper.copyString() for per-window private browsing.<br>
`+` Detect private browser windows in latest SeaMonkey (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/1">#1</a>).<br>
`*` Implemented asynchronous filtration to better work with large bookmarks number (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/2">#2</a>).<br> 
`+` Added support for <a href="https://addons.mozilla.org/addon/history-submenus-2/">History Submenus Ⅱ</a> extension.<br>

##### 0.1.0a35 (2013-01-06)
`*` Published on GitHub.<br>
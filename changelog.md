#### Bookmarks Menu Filter: Changelog

`+` - added<br>
`-` - deleted<br>
`x` - fixed<br>
`*` - improved<br>

##### master/HEAD
`x` Correctly handle already deleted menus.<br>
`*` Small internal enhancements.<br>
`*` Improved startup performance: code around menus handling was moved into lazily loaded separate file (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/7">#7</a>).<br>
`*` Improved startup performance: utilities functions was moved into lazily loaded separate file (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/8">#8</a>).<br>
`*` Improved compatibility with multi-process mode (Electrolysis aka e10s) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/9">#9</a>).<br>
`x` Fixed compatibility with Firefox 51+ (SyntaxError: non-generator method definitions may not contain yield).<br>
`x` Fixed compatibility with future Firefox versions: don't use Array generics like `Array.forEach()` (<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1222547">bug 1222547</a>).<br>
`x` Fixed compatibility with future Firefox versions: don't use legacy generators (<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1083482">bug 1083482</a>).<br>
`x` Fixed compatibility with future Firefox versions: don't use deprecated `Date.prototype.toLocaleFormat()` in debug logs (<em>extensions.bookmarksMenuFilter.debug</em> = true) (<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=818634">bug 818634</a>).<br>
`x` Correctly handle Escape key in Pale Moon and Basilisk.<br>
`*` Improved startup performance: code for preferences was moved into lazily loaded separate file (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/10">#10</a>).<br>

##### 0.1.0a38 (2014-06-30)
`x` Correctly detect built-in private windows in SeaMonkey (was changed in released version).<br>
`x` Don't handle input, if opened context menu (to not break accesskeys) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/4">#4</a>).<br>
`x` Restored compatibility with Firefox 3.6 and older (nsITimer.init() doesn't accept functions).<br>
`x` Correctly stop filtration, if popup was closed (and don't mark bookmark menus as loaded).<br>
`*` Improved filtration speed: now used nsIThread.dispatch() instead of nsITimer.init().<br>
`x` Correctly load default preferences in Gecko 2 and 3.<br>
`+` Added localization in Gecko 2 - 7.<br>
`*` Check list of opened popups for already closed to fix possible problems.<br>
`x` Fixed hotkeys handling with pressed CapsLock.<br>
`+` Added undo/redo ability (Ctrl+Z and Ctrl+Shift+Z, Ctrl+Y) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/5">#5</a>).<br>
`+` Added support for replacement rules to find hard-to-input symbols (<em>extensions.bookmarksMenuFilter.replacements</em> preference) (<a href="https://github.com/Infocatcher/Bookmarks_Menu_Filter/issues/6">#6</a>).<br>

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
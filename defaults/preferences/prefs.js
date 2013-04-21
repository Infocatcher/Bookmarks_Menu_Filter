pref("extensions.bookmarksMenuFilter.debug", false);

pref("extensions.bookmarksMenuFilter.checkFoldersLabels", true);
pref("extensions.bookmarksMenuFilter.filterMaxLevel", 15);
pref("extensions.bookmarksMenuFilter.filterFirstDelay", 300);
pref("extensions.bookmarksMenuFilter.filterMinDelay", 100);
pref("extensions.bookmarksMenuFilter.minPanelWidth", 120);

pref("extensions.bookmarksMenuFilter.altCloseMenu", false);
pref("extensions.bookmarksMenuFilter.doubleAltCloseMenu", true);
pref("extensions.bookmarksMenuFilter.doubleAltCloseMenu.maxDelay", 450);
pref("extensions.bookmarksMenuFilter.hackForRecentTagsMenu", true); // Emulate DOM_VK_HOME keypress

// HKEY_CURRENT_USER\Control Panel\Desktop\MenuShowDelay and ui.submenuDelay
pref("extensions.bookmarksMenuFilter.submenuDelay", 450);

// Space-separated lists:
pref("extensions.bookmarksMenuFilter.prefix.matchCase", "-");
pref("extensions.bookmarksMenuFilter.prefix.regExp", "/");
pref("extensions.bookmarksMenuFilter.prefix.asIs", "\" ' =");
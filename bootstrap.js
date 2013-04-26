const WINDOW_LOADED = -1;
const WINDOW_CLOSED = -2;

const LOG_PREFIX = "[Bookmarks Menu Filter] ";
var rootURI;

if(!("Services" in this))
	Components.utils.import("resource://gre/modules/Services.jsm");

function install(params, reason) {
	try {
		Services.strings.flushBundles(); // https://bugzilla.mozilla.org/show_bug.cgi?id=719376
	}
	catch(e) {
		Components.utils.reportError(e);
	}
}
function uninstall(params, reason) {
}
function startup(params, reason) {
	rootURI = params && params.resourceURI
		? params.resourceURI.spec
		: new Error().fileName
			.replace(/^.* -> /, "")
			.replace(/[^\/]+$/, "");

	if(
		Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0
		&& "addBootstrappedManifestLocation" in Components.manager
	)
		Components.manager.addBootstrappedManifestLocation(params.installPath);

	windowsObserver.init(reason);
}
function shutdown(params, reason) {
	if(
		Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0
		&& "addBootstrappedManifestLocation" in Components.manager
	)
		Components.manager.removeBootstrappedManifestLocation(params.installPath);

	windowsObserver.destroy(reason);
	if(reason != APP_SHUTDOWN) //?
		destroyTimers();

	_log("shutdown()");
}

var windowsObserver = {
	initialized: false,
	init: function(reason) {
		if(this.initialized)
			return;
		this.initialized = true;

		this.windows.forEach(function(window) {
			this.initWindow(window, reason);
		}, this);
		Services.ww.registerNotification(this);

		if(reason != APP_STARTUP)
			prefs.init();
	},
	destroy: function(reason) {
		if(!this.initialized)
			return;
		this.initialized = false;

		this.windows.forEach(function(window) {
			this.destroyWindow(window, reason);
		}, this);
		Services.ww.unregisterNotification(this);

		if(reason != APP_SHUTDOWN)
			this.unloadStyles();
		prefs.destroy();

		for(var p in this._handlers) {
			var eh = this._handlers[p];
			_log("!!! Not yet destroyed handler #" + p + " " + eh.window.location);
			eh.destroy(reason);
		}
		this._windows = { __proto__: null };
		this._handlers = { __proto__: null };
	},

	observe: function(subject, topic, data) {
		if(topic == "domwindowopened")
			subject.addEventListener("DOMContentLoaded", this, false);
		else if(topic == "domwindowclosed")
			this.destroyWindow(subject, WINDOW_CLOSED);
	},

	handleEvent: function(e) {
		if(e.type == "DOMContentLoaded") {
			var window = e.originalTarget.defaultView;
			window.removeEventListener("DOMContentLoaded", this, false);
			_log("DOMContentLoaded " + window.location.href.substr(0, 255));
			this.initWindow(window, WINDOW_LOADED);
		}
	},

	_currentId: -1,
	_windows: { __proto__: null },
	_handlers: { __proto__: null },
	getWindowIndex: function(win) {
		var ws = this._windows;
		for(var p in ws)
			if(ws[p] === win)
				return p;
		return -1;
	},

	initWindow: function(window, reason) {
		if(reason == WINDOW_LOADED) {
			if(!this.isTargetWindow(window))
				return;
			prefs.delayedInit();
		}
		var indx = this.getWindowIndex(window);
		if(indx != -1) // Window already initialized
			return;
		var eh = new EventHandler(window);
		eh.init(reason);
		var i = ++this._currentId;
		this._handlers[i] = eh;
		this._windows[i] = window;
		//_log("initWindow() #" + i + " " + window.location);
	},
	destroyWindow: function(window, reason) {
		window.removeEventListener("DOMContentLoaded", this, false); // Window can be closed before DOMContentLoaded
		if(reason == WINDOW_CLOSED && !this.isTargetWindow(window))
			return;
		var indx = this.getWindowIndex(window);
		if(indx == -1) // Nothing to destroy
			return;
		var eh = this._handlers[indx];
		eh.destroy(reason);
		delete this._handlers[indx];
		delete this._windows[indx];
		_log("destroyWindow() #" + indx + " " + window.location);
	},
	get isSeaMonkey() {
		delete this.isSeaMonkey;
		return this.isSeaMonkey = Services.appinfo.name == "SeaMonkey";
	},
	get windows() {
		var windows = [];
		var ws = Services.wm.getEnumerator(this.isSeaMonkey ? null : "navigator:browser");
		while(ws.hasMoreElements()) {
			var window = ws.getNext();
			if(this.isTargetWindow(window))
				windows.push(window);
		}
		return windows;
	},
	isTargetWindow: function(window) {
		var winType = window.document.documentElement.getAttribute("windowtype");
		return winType == "navigator:browser"
			|| winType == "navigator:private"; // SeaMonkey >= 2.19a1 (2013-03-27)
	},

	_stylesLoaded: false,
	loadStyles: function(window) {
		if(this._stylesLoaded)
			return;
		this._stylesLoaded = true;
		var sss = this.sss;
		var cssURI = this.cssURI = this.makeCSSURI(window);
		if(!sss.sheetRegistered(cssURI, sss.USER_SHEET))
			sss.loadAndRegisterSheet(cssURI, sss.USER_SHEET);
	},
	unloadStyles: function() {
		if(!this._stylesLoaded)
			return;
		this._stylesLoaded = false;
		var sss = this.sss;
		if(sss.sheetRegistered(this.cssURI, sss.USER_SHEET))
			sss.unregisterSheet(this.cssURI, sss.USER_SHEET);
	},
	get sss() {
		delete this.sss;
		return this.sss = Components.classes["@mozilla.org/content/style-sheet-service;1"]
			.getService(Components.interfaces.nsIStyleSheetService);
	},
	makeCSSURI: function(window) {
		var s = window.document.documentElement.style;
		var boxShadow = "boxShadow" in s && "box-shadow"
			|| "MozBoxShadow" in s && "-moz-box-shadow";
		var hasBoxShadow = !!boxShadow;
		if(!boxShadow)
			boxShadow = "-moz-box-shadow";
		var cssStr = '\
			@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");\n\
			@-moz-document url("chrome://browser/content/browser.xul"),\n\
				url("chrome://navigator/content/navigator.xul") {\n\
				#bookmarksMenuFilter {\n\
					margin: 0 !important;\n\
					padding: 0 !important;\n\
				}\n\
				#bookmarksMenuFilter-tooltipBox {\n\
					padding: 2px !important;\n\
				}\n\
				#bookmarksMenuFilter-value {\n\
					-moz-appearance: textfield !important;\n\
					margin: 0 !important;\n\
					padding: 0 !important;\n\
				}\n\
				#bookmarksMenuFilter-flags {\n\
					/*opacity: 0.6;*/\n\
					color: grayText !important;\n\
					font-size: 90%;\n\
					margin: 0 3px !important;\n\
					padding: 0 !important;\n\
				}\n\
				#bookmarksMenuFilter-count {\n\
					margin: 0 1px 0 3px !important;\n\
					-moz-margin-start: 3px !important;\n\
					-moz-margin-end: 1px !important;\n\
					padding: 0 !important;\n\
				}\n\
				#bookmarksMenuFilter-hint {\n\
					white-space: pre;\n\
					margin: 0 !important;\n\
					padding: 0 2px 2px !important;\n\
					color: grayText !important;\n\
					font-size: 90%;\n\
				}\n\
				.bookmarksMenuFilter-notFound #bookmarksMenuFilter-value {\n\
					' + boxShadow + ': 0 0 0 1em #f66 inset;\n\
					color: white;\n\
				}\n\
				.bookmarksMenuFilter-busy #bookmarksMenuFilter-count {\n\
					color: grayText !important;\n\
				}\n\
				.bookmarksMenuFilter-invalidRegExp #bookmarksMenuFilter-flags {\n\
					color: red !important;\n\
				}\n\
				[' + EventHandler.prototype.attrHidden + '="true"] {\n\
					display: none !important;\n\
				}' + (
					hasBoxShadow
						? ""
						: '\n\
				.bookmarksMenuFilter-notFound #bookmarksMenuFilter-value {\n\
					color: infotext !important;\n\
					outline: 1px solid #f66;\n\
					outline-offset: -1px;\n\
				}'
				) + '\n\
			}';
		return Services.io.newURI("data:text/css," + encodeURIComponent(cssStr), null, null);
	},

	get bundle() {
		try {
			var bundle = Services.strings.createBundle("chrome://bookmarksmenufilter/locale/bmf.properties");
		}
		catch(e) {
			Components.utils.reportError(e);
		}
		delete this.bundle;
		return this.bundle = bundle;
	},
	getLocalized: function(sid) {
		try {
			return this.bundle.GetStringFromName(sid);
		}
		catch(e) {
			Components.utils.reportError(e);
		}
		return "Can't get localized string for \"" + sid + "\"\nGecko 4.0 - 7.0?";
	}
};

var prefs = {
	ns: "extensions.bookmarksMenuFilter.",
	initialized: false,
	init: function() {
		if(this.initialized)
			return;
		this.initialized = true;

		//~ todo: add new condition when https://bugzilla.mozilla.org/show_bug.cgi?id=564675 will be fixed
		if(Services.vc.compare(Services.appinfo.platformVersion, "4.0a1") >= 0)
			this.loadDefaultPrefs();
		Services.prefs.addObserver(this.ns, this, false);
	},
	delayedInit: function() {
		if(!this.initialized)
			timer(this.init, this, 100);
	},
	destroy: function() {
		if(!this.initialized)
			return;
		this.initialized = false;

		Services.prefs.removeObserver(this.ns, this);
	},
	observe: function(subject, topic, pName) {
		if(topic == "nsPref:changed")
			this._cache[pName.substr(this.ns.length)] = this.getPref(pName);
	},

	loadDefaultPrefs: function() {
		var defaultBranch = Services.prefs.getDefaultBranch("");
		var prefsFile = rootURI + "defaults/preferences/prefs.js";
		Services.scriptloader.loadSubScript(prefsFile, {
			prefs: this,
			pref: function(pName, val) {
				this.prefs.setPref(pName, val, defaultBranch);
			}
		});
	},

	_cache: { __proto__: null },
	get: function(pName, defaultVal) {
		return pName in this._cache
			? this._cache[pName]
			: (this._cache[pName] = this.getPref(this.ns + pName, defaultVal));
	},
	set: function(pName, val) {
		return this.setPref(this.ns + pName, val);
	},
	getPref: function(pName, defaultVal, prefBranch) {
		var ps = prefBranch || Services.prefs;
		switch(ps.getPrefType(pName)) {
			case ps.PREF_STRING: return ps.getComplexValue(pName, Components.interfaces.nsISupportsString).data;
			case ps.PREF_INT:    return ps.getIntPref(pName);
			case ps.PREF_BOOL:   return ps.getBoolPref(pName);
			default:             return defaultVal;
		}
	},
	setPref: function(pName, val, prefBranch) {
		var ps = prefBranch || Services.prefs;
		var pType = ps.getPrefType(pName);
		var isNew = pType == ps.PREF_INVALID;
		var vType = typeof val;
		if(pType == ps.PREF_BOOL || isNew && vType == "boolean")
			ps.setBoolPref(pName, val);
		else if(pType == ps.PREF_INT || isNew && vType == "number")
			ps.setIntPref(pName, val);
		else if(pType == ps.PREF_STRING || isNew) {
			var ss = Components.interfaces.nsISupportsString;
			var str = Components.classes["@mozilla.org/supports-string;1"]
				.createInstance(ss);
			str.data = val;
			ps.setComplexValue(pName, ss, str);
		}
		return this;
	}
};

function EventHandler(window) {
	this.window = window;
	this._popups = []; // All opened popups
}
EventHandler.prototype = {
	wo: windowsObserver,

	_currentPopup: null,
	_filterPopup: null,
	_hasInputWatcher: false,
	_filterLast: 0,
	_filterScheduled: false,
	_filterTimer: 0,
	_filterProxyTimer: 0,
	_showFilterTimer: 0,
	_showFilterRetryTimer: 0,
	_selectBMNodeTimer: 0,

	_lastMouseover: 0,
	_mouseoverNode: null,

	_ignoreActivation: false,
	_activeNode: null,
	_lastActiveNode: null,
	_ignoreActivationTimer: 0,

	init: function(reason) {
		this.window.addEventListener("popupshowing", this, false);
	},
	destroy: function(reason) {
		var window = this.window;
		window.removeEventListener("popupshowing", this, false);
		this.destroyInputWatcher();
		if(reason != APP_SHUTDOWN && reason != WINDOW_CLOSED) {
			var document = window.document;
			this.showNodes(document);
			this.cleanPopups(document);
			Array.slice(
				document.getElementsByAttribute(this.attrLoaded, "true")
			).forEach(function(node) {
				node.removeAttribute(this.attrLoaded);
			}, this);
			if("_tt" in this) {
				this._tt.parentNode.removeChild(this._tt);
				delete this._tt;
			}
		}
		_log("EventHandler.destroy() " + window.location);
	},
	handleEvent: function(e) {
		switch(e.type) {
			case "popupshowing":
			case "popuphiding":       this.popupHandler(e);      break;
			case "keydown":           this.keyDownHandler(e);    break;
			case "keypress":          this.keyPressHandler(e);   break;
			case "mouseover":         this.mouseOverHandler(e);  break;
			case "DOMMenuItemActive": this.itemActiveHandler(e);
		}
	},
	stopEvent: function(e) {
		e.preventDefault();
		e.stopPropagation();
	},

	popupHandler: function(e) {
		var popup = e.target;
		if(this.pIgnorePopup in popup) {
			// We can't prevent popup - "popup.open = true" doesn't work for popups inside closed popup
			//e.preventDefault();
			return;
		}
		if(!this.isPlacesPopup(popup))
			return;
		if("defaultPrevented" in e ? e.defaultPrevented : e.getPreventDefault())
			return; // Someone block popup
		if(e.type == "popupshowing")
			this.popupShowingHandler(e);
		else if(e.type == "popuphiding")
			this.popupHidingHandler(e);
	},
	popupShowingHandler: function(e) {
		_log("Opened places popup");
		var popup = e.target;

		this._currentPopup = popup;
		this._popups.push(popup);
		_log("Popups count: " + this._popups.length);

		if(
			this.pFilter in popup
			&& (
				popup.parentNode.getAttribute("query") == "true"
				|| /(?:^|\s)history-submenu(?:\s|$)/.test(popup.parentNode.className)
			)
		) {
			// Refilter dynamically generated popups
			//~ todo: improve fix for "recent tags" menu
			_log("Opened query popup");
			var filter = popup[this.pFilter];
			if(
				Array.some(
					popup.getElementsByTagName("menu"),
					function(menu) {
						return menu.getAttribute("tagContainer") == "true";
					}
				)
			) {
				_log("*** Bugs with recent tags menu, wait...");
				popup.collapsed = true;
				timer(function() {
					popup.collapsed = false;
					_log('*** Refilter recent tags menu: "' + filter + '"');
					this.filterBookmarksProxy(popup, filter);
					if(prefs.get("hackForRecentTagsMenu")) {
						_log("Emulate DOM_VK_HOME for recent tags menu");
						var document = popup.ownerDocument;
						var evt = document.createEvent("KeyboardEvent");
						evt.initKeyEvent(
							"keypress", true /*bubbles*/, true /*cancelable*/, document.defaultView,
							false /*ctrlKey*/, false /*altKey*/, false /*shiftKey*/, false /*metaKey*/,
							evt.DOM_VK_HOME /*keyCode*/, 0 /*charCode*/
						);
						popup.dispatchEvent(evt);
					}
				}, this, 0);
			}
			else {
				_log('*** Refilter query popup: "' + filter + '"');
				this.filterBookmarksProxy(popup, filter);
			}
		}

		if(this.pFilter in popup) {
			cancelTimer(this._showFilterTimer);
			this.showFilter();
		}

		this.initInputWatcher();
	},
	popupHidingHandler: function(e) {
		_log("Closed places popup");
		var popup = e.target;

		var indx = this._popups.indexOf(popup);
		if(indx != -1)
			this._popups.splice(indx, 1);
		else
			_log(
				"Warning: closed popup not found in this._popups, label: "
				+ popup.parentNode.getAttribute("label")
			);

		_log("Popups count: " + this._popups.length);

		var clear = true;
		if(this._popups.length) {
			for(var mp = popup.parentNode; mp && "localName" in mp; mp = mp.parentNode) {
				if(
					mp.localName == "menupopup"
					&& this.pFilter in mp
					&& this._popups.indexOf(mp) != -1 //???
				) {
					clear = false;
					_log(
						"Has parent menu with filter, don't restore: "
						+ popup.parentNode.getAttribute("label")
					);
					break;
				}
			}
		}
		if(clear) {
			timer(function() {
				this.showNodes(popup);
				this.cleanPopups(popup.parentNode);
			}, this, 0);
		}

		if(!this._popups.length) {
			this.destroyInputWatcher();
			return;
		}

		var filterOpened = this.filterOpen;
		if(this._filterPopup == popup) { //~ todo: show filter if parent is filtered
			this.hideFilter();
			filterOpened = false;
		}

		if(this._currentPopup != popup)
			return;
		this._currentPopup = null;

		for(var mp = popup.parentNode; mp && "localName" in mp; mp = mp.parentNode) {
			if(
				mp.localName == "menupopup"
				&& mp.state == "open" || mp.state == "showing"
				&& this.isPlacesPopup(mp)
			) {
				if(!this._currentPopup)
					this._currentPopup = mp;
				if(!filterOpened && this.pFilter in mp) {
					filterOpened = true;
					//this.showFilter(false, mp, mp[this.pFilter]);
					_log("_mouseoverNode: " + (this._mouseoverNode && this._mouseoverNode.localName));
					var submenuDelay = prefs.get("submenuDelay", 450);
					if(
						this._lastMouseover
						&& Date.now() - this._lastMouseover < submenuDelay
						&& this._mouseoverNode.localName == "menu"
					) {
						_log("Wait for submenu...");
						// Wait, may be another submenu will be opened soon
						cancelTimer(this._showFilterTimer);
						this._showFilterTimer = timer(function() {
							this.showFilter(false, mp, mp[this.pFilter]);
						}, this, submenuDelay);
					}
					else {
						this.showFilter(false, mp, mp[this.pFilter]);
					}
				}
				if(this._currentPopup && filterOpened)
					break;
			}
		}
		if(!this._currentPopup) // D'oh...
			this._currentPopup = this._popups[this._popups.length - 1];

		//if(this.pFilter in mp)
		//	this.showFilter();
	},

	initInputWatcher: function() {
		if(this._hasInputWatcher)
			return;
		this._hasInputWatcher = true;
		var window = this.window;
		window.addEventListener("keydown", this, true);
		window.addEventListener("keypress", this, true);
		window.addEventListener("popuphiding", this, false);
		window.addEventListener("mouseover", this, true);
		window.addEventListener("DOMMenuItemActive", this, true);
		this.wo.loadStyles(window);
		_log("initInputWatcher()");
	},
	destroyInputWatcher: function() {
		if(!this._hasInputWatcher)
			return;
		this._hasInputWatcher = false;
		var window = this.window;
		window.removeEventListener("keydown", this, true);
		window.removeEventListener("keypress", this, true);
		window.removeEventListener("popuphiding", this, false);
		window.removeEventListener("mouseover", this, true);
		window.removeEventListener("DOMMenuItemActive", this, true);

		this._popups.forEach(function(p) {
			delete p[this.pFilter];
			delete p[this.pCount];
			this.showNodes(p);
		}, this);

		cancelTimer(this._filterTimer);
		cancelTimer(this._filterProxyTimer);
		cancelTimer(this._showFilterTimer);
		cancelTimer(this._showFilterRetryTimer);
		cancelTimer(this._selectBMNodeTimer);
		cancelTimer(this._ignoreActivationTimer);
		this.hideFilter();
		this._currentPopup = null;
		this._popups = [];
		this._lastMouseover = 0;
		this._mouseoverNode = null;
		this._activeNode = this._lastActiveNode = null;
		this._ignoreActivation = false;
		_log("destroyInputWatcher()");
	},

	mouseOverHandler: function(e) {
		var trg = e.target;
		if(
			trg.namespaceURI == this.XULNS
			&& trg.localName.indexOf("menu") != -1
		) {
			this._lastMouseover = Date.now();
			this._mouseoverNode = trg;
		}
	},
	itemActiveHandler: function(e) {
		var trg = e.target;
		if(!this._ignoreActivation && trg.parentNode == this._currentPopup)
			this._lastActiveNode = trg;
		this._activeNode = trg;
	},

	pFilter:      "__bookmarksMenuFilter",
	pCount:       "__bookmarksMenuFilter_count",
	pIgnorePopup: "__bookmarksMenuFilter_ignorePopup",
	get _filter() {
		if(this._currentPopup && this.pFilter in this._currentPopup)
			return this._currentPopup[this.pFilter];
		return "";
	},
	set _filter(val) {
		if(this._currentPopup)
			this._currentPopup[this.pFilter] = val;
	},
	get _lastCount() {
		if(this._currentPopup && this.pCount in this._currentPopup)
			return this._currentPopup[this.pCount];
		return 0;
	},
	set _lastCount(val) {
		if(this._currentPopup)
			this._currentPopup[this.pCount] = val;
	},

	_lastAlt: 0,
	keyDownHandler: function(e) {
		if(e.keyCode == e.DOM_VK_ALT && this.filterOpen) {
			if(
				prefs.get("altCloseMenu")
				|| prefs.get("doubleAltCloseMenu")
					&& Date.now() - this._lastAlt < prefs.get("doubleAltCloseMenu.maxDelay")
			)
				return;
			this._lastAlt = Date.now();
			this.stopEvent(e);
			_log("Prevent Alt key to use Alt+Shift in any order");
		}
	},
	keyPressHandler: function(e) {
		var curPopup = this._currentPopup;
		if(!curPopup) {
			_log("*** keyPressHandler: something wrong, this._currentPopup are " + curPopup);
			this.destroyInputWatcher();
			return;
		}
		if(curPopup.state == "closed" || curPopup.state == "hiding") {
			_log("*** NoScript? Popup are closed, but we don't receive popuphiding event");
			this.destroyInputWatcher();
			return;
		}

		var isEscape = e.keyCode == e.DOM_VK_ESCAPE;
		if(isEscape && (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey))
			return; // Allow hide popup
		if(isEscape && this.filterOpen && !this._filter) {
			this.stopEvent(e);
			this.hideFilter();
			if(curPopup) {
				delete curPopup[this.pFilter];
				delete curPopup[this.pCount];
				this.showNodes(curPopup);
				this.cleanPopups(curPopup.parentNode);
			}
			return;
		}

		if(e.keyCode == e.DOM_VK_F1 && this.filterOpen) {
			this.stopEvent(e);
			this.toggleHint();
			return;
		}

		var chr = String.fromCharCode(e.charCode);
		if(e.ctrlKey || e.metaKey) {
			var isOwnHotkey = true;
			switch(chr) {
				case "x": var cut             = true; break;
				case "c": var copy            = true; break;
				case "v": var paste           = true; break;
				case "i": var toggleMatchCase = true; break;
				case "a": var toggleAsIs      = true; break;
				case "r": var toggleRegExp    = true; break;
				default: isOwnHotkey = false;
			}
		}

		var isBackspace = e.keyCode == e.DOM_VK_BACK_SPACE;
		var resetFilter = (isEscape || cut) && this._filter;
		if(
			!isBackspace
			&& !resetFilter
			&& !isOwnHotkey
			&& (
				!chr
				|| chr == "\x00"
				|| isEscape
				|| e.ctrlKey || e.altKey || e.metaKey
			)
		)
			return;

		var prevFilter = this._filter;
		if(copy || cut) {
			Components.classes["@mozilla.org/widget/clipboardhelper;1"]
				.getService(Components.interfaces.nsIClipboardHelper)
				.copyString(prevFilter, this.window.content.document);
		}

		if(resetFilter)
			this._filter = "";
		else if(paste)
			this._filter += this.window.readFromClipboard && this.window.readFromClipboard() || "";
		else if(isBackspace && (e.ctrlKey || e.metaKey))
			this._filter = this._filter.replace(this.delLastWordPattern, "");
		else if(isBackspace)
			this._filter = this._filter.slice(0, -1);
		else if(toggleMatchCase)
			this._filter = this.togglePrefix(this._filter, "matchCase");
		else if(toggleRegExp)
			this._filter = this.togglePrefix(this._filter, "regExp");
		else if(toggleAsIs)
			this._filter = this.togglePrefix(this._filter, "asIs");
		else if(!copy)
			this._filter += chr;

		this.stopEvent(e);
		//_log("keyPressHandler() " + chr);
		this.showFilter(true /*ignoreNotFound*/); // This should be fast... show as typed
		if(!prevFilter && this._filter)
			this.filterBookmarksDelay();
		else
			this.filterBookmarksProxy();
	},
	get delLastWordPattern() {
		var delimiters = "\\u0000-\\u002f:-@\\[-`\\{-\\u00a0"
			+ "\\uff01-\\uff0f\\uff1a-\\uff20\\uff3b-\\uff40\\uff5b-\\uff5e"; // Fullwidth
		var pattern = new RegExp(
			"(?:^%d|%w|%w%d)$"
				.replace(/%d/g, "["  + delimiters + "]+")
				.replace(/%w/g, "[^" + delimiters + "]+")
		);
		return setProperty(this, "delLastWordPattern", pattern);
	},

	attrLoaded: "bookmarksMenuFilter_subfoldersLoaded",

	prefixes: { //~ todo: cache ?
		get matchCase() { return prefs.get("prefix.matchCase", "").split(/\s+/); },
		get regExp()    { return prefs.get("prefix.regExp",    "").split(/\s+/); },
		get asIs()      { return prefs.get("prefix.asIs",      "").split(/\s+/); },
		__proto__: null
	},
	parsePrefixes: function(filter) {
		var out = {
			has: false,
			prefix: "",
			filter: filter,
			matchCase: false,
			regExp: false,
			asIs: false
		};

		if(!/^(\S+)\s+/.test(filter))
			return out;
		var prefix = out.prefix = RegExp.$1;
		out.filter = RegExp.rightContext;
		for(var type in this.prefixes) {
			var tmp = prefix.replace(new RegExp(this.getPrefixPattern(type)), "");
			if(tmp != prefix) {
				prefix = tmp;
				out[type] = true;
			}
		}
		if(!prefix) {
			out.has = true;
			if(out.regExp && out.asIs)
				out.asIs = false;
		}
		else { // Wrong prefix
			out.prefix = "";
			out.filter = filter;
			for(var type in this.prefixes)
				out[type] = false;
		}
		return out;
	},
	getPrefixPattern: function(type) {
		return this.prefixes[type].map(this.escapeRegExp).join("|");
	},
	escapeRegExp: function(str) {
		return str.replace(/[\\\/.^$+*?|()\[\]{}]/g, "\\$&");
	},
	togglePrefix: function(filter, type) {
		var flags = this.parsePrefixes(filter);
		if(flags[type])
			return filter.replace(new RegExp(this.getPrefixPattern(type)), "").replace(/^\s+/, "");
		var prefix = this.prefixes[type][0];
		if(!prefix)
			return filter;
		prefix = flags.prefix + prefix;
		if(type == "regExp")
			prefix = prefix.replace(new RegExp(this.getPrefixPattern("asIs")), "");
		else if(type == "asIs")
			prefix = prefix.replace(new RegExp(this.getPrefixPattern("regExp")), "");
		return prefix + " " + flags.filter;
	},

	filterBookmarksDelay: function(popup, s) {
		if(this._filterScheduled)
			return;
		this._filterScheduled = true;
		this._filterTimer = timer(function() {
			this._filterScheduled = false;
			this.filterBookmarks(popup, s);
		}, this, prefs.get("filterFirstDelay", 300));
	},
	filterBookmarksProxy: function(popup, filterString, noStats) {
		//~ todo: check noStats usage... argument can be removed ?
		if(this._filterScheduled)
			return;
		var now = Date.now();
		var delay = this._filterLast + prefs.get("filterMinDelay", 100) - now;
		if(delay > 0) {
			_log("filterBookmarksProxy => wait " + delay);
			this._filterScheduled = true;
			this._filterProxyTimer = timer(function() {
				this._filterScheduled = false;
				this.filterBookmarks(popup, filterString, noStats);
			}, this, delay);
			return;
		}
		this._filterLast = now;
		this.filterBookmarks(popup, filterString, noStats);
		this._filterLast = Date.now();
	},
	_lastRegExpError: null,
	filterBookmarks: function(popup, filterString, noStats) {
		var regularFilter = !popup;
		if(regularFilter) {
			popup = this._currentPopup;
			filterString = this._filter;
		}
		var filter = filterString;

		//if(!popup)
		//	return;

		_log("filterBookmarks: \"" + filterString + "\"");

		var flags = this.parsePrefixes(filter);
		if(flags.has)
			filter = flags.filter;

		this.showFilterFlags(flags);

		var matcher = null; // Match any

		if(filter) {
			if(flags.asIs) {
				if(!flags.matchCase)
					filter = filter.toLowerCase();
				matcher = flags.matchCase
					? function(s) {
						return s.indexOf(filter) != -1;
					}
					: function(s) {
						return s.toLowerCase().indexOf(filter) != -1;
					};
			}
			else if(flags.regExp) {
				try {
					var pattern = new RegExp(filter, "m" + (flags.matchCase ? "" : "i"));
					matcher = function(s) {
						return pattern.test(s);
					};
				}
				catch(e) {
					if(e != this._lastRegExpError) {
						this._lastRegExpError = "" + e;
						Components.utils.reportError(e);
					}
					this.updateHintDelay(e + "\n" + this.defaultHint);
					matcher = function(s) {
						return false;
					};
				}
			}
			else { // Default: treat spaces as "and"
				filter = filter.replace(/^\s+|\s+$/g, "");
				if(!flags.matchCase)
					filter = filter.toLowerCase();
				var tokens = filter.split(/\s+/);
				matcher = function(s) {
					if(!flags.matchCase)
						s = s.toLowerCase();
					return !tokens.some(function(token) {
						return s.indexOf(token) == -1;
					});
				};
			}
		}

		if(flags.has)
			this.ttSetClass("bookmarksMenuFilter-invalidRegExp", flags.regExp && !pattern);
		if(!flags.regExp || pattern)
			this.updateHintDelay();

		regularFilter && !noStats && this.showFilter(true /*ignoreNotFound*/);
		if(!this._filterInProgress)
			this.filterBookmarksPopup(popup, filterString, matcher, false, popup);
		else {
			this.stopFilter(true);
			timer(function() {
				this.filterBookmarksPopup(popup, filterString, matcher, false, popup);
			}, this);
		}
		//regularFilter && !noStats && this.showFilter();
	},
	_filterAsyncTimer: 0,
	_filterRestore: [],
	__filterInProgress: false,
	get _filterInProgress() {
		return this.__filterInProgress;
	},
	set _filterInProgress(inProgress) {
		if(inProgress == this.__filterInProgress)
			return;
		this.__filterInProgress = inProgress;
		this.ttSetClass("bookmarksMenuFilter-busy", inProgress);
	},
	filterBookmarksPopup: function(/* see arguments for filterBookmarksPopupWorker */) {
		this._filterInProgress = true;
		var worker = this.filterBookmarksPopupWorker;
		var gen = worker.apply(this, arguments);
		worker.__generator = gen;
		gen.next();
	},
	filterBookmarksPopupWorker: function worker(popup, filterString, matcher, linear, parentPopup, callback, _level) {
		var _gen = worker.__generator;
		worker.__generator = null;
		var firstCall = _level === undefined; // First internal call
		if(firstCall) {
			_level = 1;
			this._lastCount = 0;
			cancelTimer(this._ignoreActivationTimer);
			this._ignoreActivation = true;
		}
		else if(++_level > prefs.get("filterMaxLevel", 15)) {
			_log("filterMaxLevel reached, stop filtering");
			//return true;
			return;
		}

		var childs = Array.slice(popup.childNodes);
		var hasVisible = false;

		for(var i = 0, l = childs.length; i < l; ++i) {
			var node = childs[i];
			var hide = false;
			if(this.isBookmark(node)) {
				if(matcher) {
					var text = this.getBookmarkText(node);
					if(text && !matcher(text))
						hide = true;
				}
				if(!hide) {
					hasVisible = true;
					++this._lastCount;
					//if(
					//	++this._lastCount % 10 == 0
					//	&& popup == this._filterPopup
					//)
					//	this.updateFilterCount();
				}
				//~ todo: implement linear mode ?
			}
			else if(node.localName == "menu" && this.isBookmarkItem(node)) {
				var mp = node.menupopup || node.getElementsByTagName("menupopup")[0];
				var load = !mp.hasAttribute(this.attrLoaded)
					|| node.getElementsByAttribute("query", "true").length > 0;
				var prevCount = this._lastCount;

				if(load) {
					// We should simulate popupshowing to trigger built-in bookmarks loader
					//_log("Load bookmarks tree");
					mp[this.pIgnorePopup] = true;
					node.collapsed = true;
					node.open = true;

					var _this = this;
					var restoreNode = function() {
						node.open = false;
						node.collapsed = false;
						delete mp[_this.pIgnorePopup];
					};
					this._filterRestore.push(restoreNode);
				}
				var subMatcher = matcher && prefs.get("checkFoldersLabels", true) && matcher(node.getAttribute("label"))
					? null
					: matcher;

				//if(!this.filterBookmarksPopup(mp, filterString, subMatcher, linear, parentPopup, _level))
				//	hide = true;
				//else
				//	hasVisible = true;
				this._filterAsyncTimer = timer(function() {
					this.filterBookmarksPopup(mp, filterString, subMatcher, linear, parentPopup, function(_hasVisible) {
						if(_hasVisible)
							hasVisible = true;
						else
							hide = true;
						_gen.next();
					}, _level);
				}, this);
				yield;

				if(load) {
					restoreNode();
					this._filterRestore = this._filterRestore.filter(function(f) {
						return f != restoreNode;
					});
					Array.forEach(
						node.getElementsByTagName("menupopup"),
						function(node) {
							node.setAttribute(this.attrLoaded, "true");
						},
						this
					);
				}
				mp[this.pFilter] = filterString;
				mp[this.pCount] = this._lastCount - prevCount;
			}

			if(hide)
				this.hideNode(node);
			else if(node.hasAttribute(this.attrHidden))
				this.showNode(node);
		}

		//if(firstCall) {
		//	popup[this.pFilter] = filterString;
		//	popup[this.pCount] = this._lastCount; // ?
		//}

		// Hide nested separators
		var hasVisibleSibling = false;
		function hideNestedSeparators(node) {
			if(node.localName == "menuseparator") {
				if(!hasVisibleSibling)
					this.hideNode(node);
				else if(this.canBeVisible(node))
					hasVisibleSibling = false;
			}
			else if(this.canBeVisible(node)) {
				hasVisibleSibling = true;
				return true;
			}
			return false;
		}

		childs.forEach(hideNestedSeparators, this);
		hasVisibleSibling = false;
		childs.reverse().some(hideNestedSeparators, this);

		if(firstCall) {
			cancelTimer(this._selectBMNodeTimer);
			this._selectBMNodeTimer = timer(function() {
				var lastActive = this._lastActiveNode;
				if(lastActive && (lastActive.parentNode != popup || !this.isNodeVisible(lastActive)))
					lastActive = null;
				if(lastActive && this._activeNode == lastActive) // Nothing to do :)
					return;
				_log("restoreActiveItem: " + (lastActive ? lastActive.getAttribute("label") : "<first>"));
				this.restoreActiveItem(popup, lastActive);
			}, this, 0);
			this._ignoreActivationTimer = timer(function() {
				this._ignoreActivation = false;
			}, this, 50);

			this.stopFilterDelay();
			this.showFilterDelay();

			this._filterInProgress = false;
		}
		else {
			this.showFilterDelay(true /*ignoreNotFound*/); // Ajust position
		}

		//return hasVisible;
		callback && callback.call(this, hasVisible);
		yield;
	},
	stopFilter: function(restart) {
		cancelTimer(this._filterAsyncTimer);
		this.stopFilterDelay();
		if(!restart)
			this._filterInProgress = false;
		this._filterRestore.forEach(function(f) {
			try {
				f();
			}
			catch(e) {
				Components.utils.reportError(e);
			}
		});
		this._filterRestore.length = 0;
	},
	restoreActiveItem: function(popup, item) {
		var document = popup.ownerDocument;
		var window = document.defaultView;
		function keypress(key) {
			var evt = document.createEvent("KeyboardEvent");
			evt.initKeyEvent(
				"keypress", true /*bubbles*/, true /*cancelable*/, window,
				false /*ctrlKey*/, false /*altKey*/, false /*shiftKey*/, false /*metaKey*/,
				evt[key], 0 /*charCode*/
			);
			popup.dispatchEvent(evt);
		};
		var first = true;
		Array.some(
			popup.childNodes,
			function(node) {
				var nn = node.nodeName;
				if(nn != "menu" && nn != "menuitem" || !this.isNodeVisible(node))
					return false;
				keypress(first ? "DOM_VK_HOME" : "DOM_VK_DOWN");
				first = false;
				var stop = item ? node == item : this.isBookmarkItem(node);
				if(stop)
					this._activeNode = this._lastActiveNode = node;
				return stop;
			},
			this
		);
	},
	getBookmarkText: function(mi) {
		//~ todo: add prefs like search.title and search.url ?
		var texts = [];
		var label = mi.getAttribute("label");
		label && texts.push(label);
		var uri = mi._placesNode && mi._placesNode.uri || mi.node && mi.node.uri;
		uri && texts.push(uri);
		//~ todo: get description ?
		return texts.join("\n");
	},

	XULNS: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
	parseXULFromString: function(xul) {
		xul = xul.replace(/>\s+</g, "><");
		return new this.window.DOMParser()
			.parseFromString(xul, "application/xml")
			.documentElement;
	},
	get tt() {
		var tt = this._tt = this.window.document.documentElement.appendChild(this.parseXULFromString('\
			<tooltip xmlns="' + this.XULNS + '"\
				id="bookmarksMenuFilter"\
				noautohide="true"\
				orient="horizontal"\
				onpopuphiding="return this.__allowHide;"\
				onclick="this.realHidePopup();">\
				<vbox id="bookmarksMenuFilter-tooltipBox" flex="1">\
					<hbox id="bookmarksMenuFilter-filterBox" align="center" flex="1">\
						<label id="bookmarksMenuFilter-value" flex="1" crop="center" />\
						<label id="bookmarksMenuFilter-flags" />\
						<label id="bookmarksMenuFilter-count" />\
					</hbox>\
					<description id="bookmarksMenuFilter-hint" flex="1" hidden="true"></description>\
				</vbox>\
			</tooltip>'
		));
		tt.__allowHide = false;
		tt.realHidePopup = function() {
			this.__allowHide = true;
			this.hidePopup();
			this.__allowHide = false;
		};
		function e(id) {
			return tt.getElementsByAttribute("id", "bookmarksMenuFilter-" + id)[0];
		}
		tt._filter = e("filterBox");
		tt._value  = e("value");
		tt._flags  = e("flags");
		tt._count  = e("count");
		tt._hint   = e("hint");
		return setProperty(this, "tt", tt);
	},
	get filterOpen() {
		return this.tt.state == "open";
	},
	// Be careful: we check only for indexOf() to increase performance!
	ttAddClass: function(clss) {
		var tt = this.tt;
		var c = tt.className;
		if(c.indexOf(clss) == -1)
			tt.className = (c ? c + " " : "") + clss;
	},
	ttRemoveClass: function(clss) {
		var tt = this.tt;
		var c = tt.className;
		if(c.indexOf(clss) != -1) {
			tt.className = c
				.replace(clss, "")
				.replace(/ +/, " ")
				.replace(/^ | $/g, "");
		}
	},
	ttSetClass: function(clss, add) {
		if(add)
			this.ttAddClass(clss);
		else
			this.ttRemoveClass(clss);
	},
	_showFilterScheduled: false,
	_showFilterDelayTimer: 0,
	showFilterDelay: function() {
		if(this._showFilterScheduled)
			return;
		this._showFilterScheduled = true;
		var args = arguments;
		this._showFilterDelayTimer = timer(function() {
			this._showFilterScheduled = false;
			this.showFilter.apply(this, args);
		}, this, 70);
	},
	stopFilterDelay: function() {
		cancelTimer(this._showFilterDelayTimer);
		this._showFilterScheduled = false;
	},
	showFilter: function(ignoreNotFound, popup, s, _noRetry) {
		popup = popup || this._currentPopup;
		s = s || this._filter;
		var tt = this.tt;
		//_log("showFilter : " + (popup[this.pFilter] || ""));
		tt._value.setAttribute("value", popup[this.pFilter] || " ");
		var count = popup[this.pCount] || 0;
		tt._count.setAttribute("value", count);

		var notFound = !count && s;
		//_log("!!! showFilter: count: " + count + ", notFound: " + notFound + ", ignore: " + ignoreNotFound);
		if(!notFound || !ignoreNotFound)
			this.ttSetClass("bookmarksMenuFilter-notFound", notFound);

		var w = Math.max(prefs.get("minPanelWidth", 120), popup.boxObject.width);
		var trgPopup = this._filterPopup;
		this._filterPopup = popup;

		if(Services.vc.compare(Services.appinfo.platformVersion, "2.0a1pre") < 0) {
			if(
				tt.boxObject.width != w
				|| trgPopup != popup
				|| tt.boxObject.screenY != popup.boxObject.screenY - tt.boxObject.height
			) {
				_log("!!! Legacy: reshow tooltip");
				tt.realHidePopup();
				tt.style.width = w + "px";
			}
			else
				_log("!!! Legacy: openPopup()");
			this.window.setTimeout(function() {
				tt.openPopup(popup, "before_start");
			}, 0);
			return;
		}

		var y = popup.boxObject.screenY - tt.boxObject.height;
		_log("showFilter() y: " + y);
		if(y < 0) {
			var maxOverlap = 8;
			// Allow higher overlap, if first popup items isn't bookmark items:
			for(var ch = popup.firstChild; ch; ch = ch.nextSibling) {
				if(!this.isNodeVisible(ch))
					continue;
				if(this.isBookmarkItem(ch))
					break;
				maxOverlap += ch.boxObject.height;
			}
			if(y >= -maxOverlap) {
				_log("showFilter() y -> 0, allow overlap");
				y = 0; // Allow overlap, but show on top
			}
		}

		if(trgPopup != popup)
			_log("Switch to another popup");
		if(tt.boxObject.screenY != popup.boxObject.screenY - tt.boxObject.height)
			_log("Changed popup screenY");

		if(y < 0 && !_noRetry) { //~ todo: first bookmark in this case only partially visible
			this._showFilterRetryTimer = timer(function() {
				_log("showFilter() Retry...");
				this.showFilter(ignoreNotFound, popup, s, true);
			}, this, 10);
		}
		if(trgPopup != popup || y < 0) {
			_log("showFilter(): reshow tooltip to make it topmost...");
			tt.realHidePopup(); // We need this to make tooltip topmost!
		}

		if(tt.boxObject.width != w) {
			_log("Update popup width: " + tt.boxObject.width + " -> " + w);
			tt.style.width = w + "px";
		}

		if(tt.state == "closed" || tt.state == "hiding") {
			tt.openPopup(popup, "before_start");
			if(y >= 0 && tt.boxObject.screenY != y) {
				_log("Tooltip below popup? Allow small overlap and fix tooltip position");
				tt.moveTo(tt.boxObject.screenX, y);
			}
		}
		else {
			var x = Math.max(0, popup.boxObject.screenX);
			var y = Math.max(0, y);
			if(
				trgPopup != popup
				|| tt.boxObject.screenX != x
				|| tt.boxObject.screenY != y
			)
				tt.moveTo(x, y);
		}

		//if(tt.boxObject.width != w) {
		//	_log("!!! Fix tooltip width");
		//	tt.sizeTo(w, tt.boxObject.height);
		//}
	},
	updateFilterCount: function() {
		this.tt._count.setAttribute("value", this._lastCount || 0);
	},
	hideFilter: function() {
		_log("hideFilter()");
		this.tt.realHidePopup();
		this.stopFilter();
	},
	showFilterFlags: function(flags) {
		var flagsStr = "";
		if(flags.regExp)
			flagsStr = "/r/" + (flags.matchCase ? "" : "i");
		else if(flags.asIs)
			flagsStr = '"a ' + (flags.matchCase ? "B" : "b") + '"';
		else if(flags.matchCase)
			flagsStr = "i\u2260I"; // "not equal to" symbol

		var f = this.tt._flags;
		if(f.getAttribute("value") != flagsStr) {
			f.setAttribute("value", flagsStr);
			f.hidden = !flagsStr;
		}
	},
	get defaultHint() {
		return setProperty(this, "defaultHint", this.wo.getLocalized("hint"));
	},
	toggleHint: function(show) {
		var tt = this.tt;
		var hint = tt._hint;
		if(show === undefined)
			show = hint.hidden;
		if(show) {
			if(!hint.textContent)
				hint.textContent = this.defaultHint;
			var bo = tt.boxObject;
			var x = bo.screenX, y = bo.screenY;
		}
		hint.hidden = !show;
		if(show) {
			// Hack to make tooltip topmost:
			tt.realHidePopup();
			this.showFilter();
			tt.moveTo(x, y); // Restore position
		}
		else {
			// Move tooltip, if needed
			this.showFilter();
		}
	},
	_updateHintTimer: 0,
	updateHintDelay: function(text) {
		this.window.clearTimeout(this._updateHintTimer);
		this._updateHintTimer = this.window.setTimeout(function(_this) {
			_this.updateHint(text);
		}, 40, this);
	},
	updateHint: function(text) {
		var hint = this.tt._hint;
		if(!text)
			text = this.defaultHint;
		if(hint.textContent == text)
			return;
		hint.textContent = text;
		if(this.filterOpen)
			this.showFilter();
	},

	attrHidden: "_bookmarksmenufilter_hidden",
	hideNode: function(node) {
		//node.hidden = true;
		node.setAttribute(this.attrHidden, "true");
	},
	showNode: function(node) {
		//node.hidden = false;
		node.removeAttribute(this.attrHidden);
	},
	showNodes: function(parent) {
		_log(
			"showNodes: "
			+ (
				parent.parentNode && "getAttribute" in parent.parentNode
					? '"' + parent.parentNode.getAttribute("label") + '"'
					: parent
			)
		);
		Array.slice(
			parent.getElementsByAttribute(this.attrHidden, "true")
		).forEach(function(node) {
			this.showNode(node);
		}, this);
	},
	cleanPopups: function(parent) {
		Array.forEach(
			parent.getElementsByTagName("menupopup"),
			function(mp) {
				delete mp[this.pFilter];
				delete mp[this.pCount];
			},
			this
		);
	},

	isNodeVisible: function(node) {
		var bo = node.boxObject;
		return bo.height > 0 && bo.width > 0;
	},
	canBeVisible: function(node) {
		// For nodes in closed popups
		//return !node.hasAttribute(this.attrHidden)
		//	&& !node.hidden
		//	&& !node.collapsed;
		var cs = node.ownerDocument.defaultView.getComputedStyle(node, null);
		return cs.display != "none" && cs.visibility != "collapse";
	},
	isPlacesPopup: function(node) {
		return node.getAttribute("placespopup") == "true"
			|| node.getAttribute("type") == "places";
	},
	isBookmarkItem: function(node) {
		// "history-submenu" - https://addons.mozilla.org/addon/history-submenus-2/
		return /(?:^|\s)(?:bookmark-item|history-submenu)(?:\s|$)/.test(node.className);
	},
	isBookmark: function(node) {
		return node.localName == "menuitem" && this.isBookmarkItem(node);
	}
};

var _timers = { __proto__: null };
var _timersCounter = 0;
function timer(callback, context, delay, args) {
	var id = ++_timersCounter;
	var timer = _timers[id] = Components.classes["@mozilla.org/timer;1"]
		.createInstance(Components.interfaces.nsITimer);
	timer.init({
		observe: function(subject, topic, data) {
			delete _timers[id];
			callback.apply(context, args);
		}
	}, delay || 0, timer.TYPE_ONE_SHOT);
	return id;
}
function cancelTimer(id) {
	if(id in _timers) {
		_timers[id].cancel();
		delete _timers[id];
	}
}
function destroyTimers() {
	for(var id in _timers)
		_timers[id].cancel();
	_timers = { __proto__: null };
	_timersCounter = 0;
}

function setProperty(o, p, v) {
	setProperty = "defineProperty" in Object
		? function(o, p, v) {
			Object.defineProperty(o, p, {
				value: v,
				enumerable: true,
				writable: true
			});
			return v;
		}
		: function(o, p, v) {
			o.__defineGetter__(p, function() {
				return v;
			});
			return v;
		};
	return setProperty.apply(this, arguments);
}

// Be careful, loggers always works until prefs aren't initialized
// (and if "debug" preference has default value)
function ts() {
	var d = new Date();
	var ms = d.getMilliseconds();
	return d.toLocaleFormat("%M:%S:") + "000".substr(String(ms).length) + ms + " ";
}
function _log(s) {
	if(!prefs.get("debug", true))
		return;
	var msg = LOG_PREFIX + ts() + s;
	Services.console.logStringMessage(msg);
	dump(msg + "\n");
}
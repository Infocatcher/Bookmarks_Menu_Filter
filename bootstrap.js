const WINDOW_LOADED = -1;
const WINDOW_CLOSED = -2;

const LOG_PREFIX = "[Bookmarks Menu Filter] ";
var rootURI = "chrome://bookmarksmenufilter/content/";
var platformVersion;

if(!("Services" in this))
	Components.utils.import("resource://gre/modules/Services.jsm");

this.__defineGetter__("EventHandler", function() {
	delete this.EventHandler;
	_log("Load popupHandler.js");
	Services.scriptloader.loadSubScript(rootURI + "popupHandler.js", this, "UTF-8");
	return EventHandler;
});

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
	platformVersion = parseFloat(Services.appinfo.platformVersion);
	if(platformVersion >= 2 && platformVersion < 10) {
		rootURI = params && params.resourceURI
			? params.resourceURI.spec
			: new Error().fileName
				.replace(/^.* -> /, "")
				.replace(/[^\/]+$/, "");
	}

	if(
		platformVersion < 10
		&& "addBootstrappedManifestLocation" in Components.manager
	)
		Components.manager.addBootstrappedManifestLocation(params.installPath);

	bmFilter.init(reason);
}
function shutdown(params, reason) {
	if(
		platformVersion < 10
		&& "addBootstrappedManifestLocation" in Components.manager
	)
		Components.manager.removeBootstrappedManifestLocation(params.installPath);

	bmFilter.destroy(reason);
	if(reason != APP_SHUTDOWN) //?
		destroyTimers();

	_log("shutdown()");
}

var bmFilter = {
	initialized: false,
	init: function(reason) {
		if(this.initialized)
			return;
		this.initialized = true;

		for(var window in this.windows)
			this.initWindow(window, reason);
		Services.ww.registerNotification(this);

		if(reason != APP_STARTUP)
			prefs.init();
	},
	destroy: function(reason) {
		if(!this.initialized)
			return;
		this.initialized = false;

		for(var window in this.windows)
			this.destroyWindow(window, reason);
		Services.ww.unregisterNotification(this);

		if(reason != APP_SHUTDOWN)
			this.unloadStyles();
		prefs.destroy();

		for(var p in this._handlers) {
			var eh = this._handlers[p];
			_log("!!! Not yet destroyed handler #" + p + " " + eh.window.location);
			eh.destroy(reason);
		}
		this._handlers = { __proto__: null };
	},

	observe: function(subject, topic, data) {
		if(topic == "domwindowopened")
			subject.addEventListener("load", this, false);
		else if(topic == "domwindowclosed")
			this.destroyWindow(subject, WINDOW_CLOSED);
	},
	handleEvent: function(e) {
		if(e.type == "load") {
			var window = e.currentTarget;
			window.removeEventListener("load", this, false);
			this.initWindow(window, WINDOW_LOADED);
		}
	},
	prefChanged: function(pName, pVal) {
		if(pName == "replacements")
			this.initReplacements();
	},

	_currentId: -1,
	_handlers: { __proto__: null },
	getWindowIndex: function(window) {
		if("_bookmarksMenuFilterId" in window)
			return window._bookmarksMenuFilterId;
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
		window._bookmarksMenuFilterId = i;
		//_log("initWindow() #" + i + " " + window.location);
	},
	destroyWindow: function(window, reason) {
		window.removeEventListener("load", this, false); // Window can be closed before "load" event
		if(reason == WINDOW_CLOSED && !this.isTargetWindow(window))
			return;
		var indx = this.getWindowIndex(window);
		if(indx == -1) // Nothing to destroy
			return;
		var eh = this._handlers[indx];
		eh.destroy(reason);
		delete this._handlers[indx];
		delete window._bookmarksMenuFilterId;
		_log("destroyWindow() #" + indx + " " + window.location);
	},
	get isSeaMonkey() {
		delete this.isSeaMonkey;
		return this.isSeaMonkey = Services.appinfo.name == "SeaMonkey";
	},
	get windows() {
		var isSeaMonkey = this.isSeaMonkey;
		var ws = Services.wm.getEnumerator(isSeaMonkey ? null : "navigator:browser");
		while(ws.hasMoreElements()) {
			var window = ws.getNext();
			if(!isSeaMonkey || this.isTargetWindow(window))
				yield window;
		}
	},
	isTargetWindow: function(window) {
		// Note: we don't have "windowtype" attribute for private windows in SeaMonkey 2.19+
		var loc = window.location.href;
		return loc == "chrome://browser/content/browser.xul"
			|| loc == "chrome://navigator/content/navigator.xul";
	},

	applyReplacements: function(s) {
		return this.initReplacements().apply(this, arguments);
	},
	initReplacements: function() {
		_log("initReplacements()");
		var replacements = this._replacements = [];
		try {
			var data = JSON.parse(prefs.get("replacements", "{}"));
		}
		catch(e) {
			Components.utils.reportError(e);
		}
		function appendFilter(find, replacement) {
			try {
				replacements.push([new RegExp(find, "g"), replacement]);
			}
			catch(e) {
				Components.utils.reportError(e);
			}
		}
		if(data) for(var find in data) {
			var replacement = data[find];
			appendFilter(find, replacement);
			var findUpper = find.toUpperCase();
			if(findUpper != find)
				appendFilter(findUpper, replacement.toUpperCase());
		}
		return this.applyReplacements = replacements.length
			? this._applyReplacements
			: this._applyReplacementsDummy;
	},
	_applyReplacements: function(s) {
		this._replacements.forEach(function(o) {
			s = s.replace(o[0], o[1]);
		});
		return s;
	},
	_applyReplacementsDummy: function(s) {
		return s;
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

	get locale() {
		delete this.locale;
		return this.locale = Components.classes["@mozilla.org/chrome/chrome-registry;1"]
			.getService(Components.interfaces.nsIXULChromeRegistry)
			.getSelectedLocale("global");
	},
	get bundle() {
		var test = platformVersion >= 2 && platformVersion < 8 ? "hint" : "";
		function createBundle(uri, test) {
			try {
				var bundle = Services.strings.createBundle(uri);
				if(bundle && test) try {
					bundle.GetStringFromName(test);
				}
				catch(e2) {
					return null;
				}
			}
			catch(e) {
			}
			return bundle;
		}
		delete this.bundle;
		return this.bundle = createBundle("chrome://bookmarksmenufilter/locale/bmf.properties", test)
			|| createBundle(rootURI + "locale/" + this.locale + "/bmf.properties", test)
			|| createBundle(rootURI + "locale/en-US/bmf.properties", test);
	},
	getLocalized: function(sid) {
		try {
			return this.bundle.GetStringFromName(sid);
		}
		catch(e) {
			Components.utils.reportError(e);
		}
		return "Can't get localized string for \"" + sid + "\"\nGecko 2.0 - 7.0?";
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
		if(platformVersion >= 2)
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
		if(topic != "nsPref:changed")
			return;
		var shortName = pName.substr(this.ns.length);
		var pVal = this.getPref(pName);
		this._cache[shortName] = pVal;
		bmFilter.prefChanged(shortName, pVal);
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

function delay(callback, context) {
	var tm = Services.tm;
	var DISPATCH_NORMAL = Components.interfaces.nsIThread.DISPATCH_NORMAL;
	delay = function(callback, context) {
		// Note: dispatch(function() { ... }) works only in Firefox 4+
		tm.mainThread.dispatch({run: function() {
			callback.call(context);
		}}, DISPATCH_NORMAL);
	}
	delay.apply(this, arguments);
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
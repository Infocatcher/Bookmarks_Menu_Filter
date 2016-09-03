const WINDOW_LOADED = -1;
const WINDOW_CLOSED = -2;

const LOG_PREFIX = "[Bookmarks Menu Filter] ";
var rootURI = "chrome://bookmarksmenufilter/content/";
var platformVersion;

if(!("Services" in this))
	Components.utils.import("resource://gre/modules/Services.jsm");

this.__defineGetter__("PopupHandler", function() {
	delete this.PopupHandler;
	_log("Load popupHandler.js");
	Services.scriptloader.loadSubScript(rootURI + "popupHandler.js", this, "UTF-8");
	return PopupHandler;
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
	get ut() {
		_log("Load utils.js");
		var scope = {};
		Services.scriptloader.loadSubScript(rootURI + "utils.js", scope, "UTF-8");
		delete this.ut;
		return this.ut = scope.bmUtils;
	},

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
			this.ut.unloadStyles();
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
		switch(e.type) {
			case "load":         this.loadHandler(e);         break;
			case "popupshowing": this.popupShowingHandler(e);
		}
	},
	loadHandler: function(e) {
		var window = e.currentTarget;
		window.removeEventListener("load", this, false);
		this.initWindow(window, WINDOW_LOADED);
	},
	popupShowingHandler: function(e) {
		var popup = e.target;
		if(!this.isPlacesPopup(popup))
			return;
		var window = e.currentTarget;
		window.removeEventListener(e.type, this, true);
		var indx = this.getWindowIndex(window);
		if(indx != -1) // Window already initialized
			return;
		var i = ++this._currentId;
		this._handlers[i] = new PopupHandler(window);
		window._bookmarksMenuFilterId = i;
	},
	isPlacesPopup: function(node) {
		return node.getAttribute("placespopup") == "true"
			|| node.getAttribute("type") == "places"
			|| node.getAttribute("context") == "placesContext"; // Mac OS
	},
	prefChanged: function(pName, pVal) {
		if(pName == "replacements")
			this.ut.initReplacements();
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
		window.addEventListener("popupshowing", this, true);
		//_log("initWindow() #" + i + " " + window.location);
	},
	destroyWindow: function(window, reason) {
		window.removeEventListener("load", this, false); // Window can be closed before "load" event
		if(reason == WINDOW_CLOSED && !this.isTargetWindow(window))
			return;
		window.removeEventListener("popupshowing", this, true);
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
		var windows = [];
		var isSeaMonkey = this.isSeaMonkey;
		var ws = Services.wm.getEnumerator(isSeaMonkey ? null : "navigator:browser");
		while(ws.hasMoreElements()) {
			var window = ws.getNext();
			if(!isSeaMonkey || this.isTargetWindow(window))
				windows.push(window);
		}
		return windows;
	},
	isTargetWindow: function(window) {
		// Note: we don't have "windowtype" attribute for private windows in SeaMonkey 2.19+
		var loc = window.location.href;
		return loc == "chrome://browser/content/browser.xul"
			|| loc == "chrome://navigator/content/navigator.xul";
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
		var prefs = this;
		Services.scriptloader.loadSubScript(prefsFile, {
			pref: function(pName, val) {
				var pType = defaultBranch.getPrefType(pName);
				if(pType != defaultBranch.PREF_INVALID && pType != prefs.getValueType(val)) {
					Components.utils.reportError(
						LOG_PREFIX + 'Changed preference type for "' + pName
						+ '", old value will be lost!'
					);
					defaultBranch.deleteBranch(pName);
				}
				prefs.setPref(pName, val, defaultBranch);
			}
		});
	},

	_cache: { __proto__: null },
	get: function(pName, defaultVal) {
		var cache = this._cache;
		return pName in cache
			? cache[pName]
			: (cache[pName] = this.getPref(this.ns + pName, defaultVal));
	},
	set: function(pName, val) {
		return this.setPref(this.ns + pName, val);
	},
	getPref: function(pName, defaultVal, prefBranch) {
		var ps = prefBranch || Services.prefs;
		switch(ps.getPrefType(pName)) {
			case ps.PREF_BOOL:   return ps.getBoolPref(pName);
			case ps.PREF_INT:    return ps.getIntPref(pName);
			case ps.PREF_STRING: return ps.getComplexValue(pName, Components.interfaces.nsISupportsString).data;
		}
		return defaultVal;
	},
	setPref: function(pName, val, prefBranch) {
		var ps = prefBranch || Services.prefs;
		var pType = ps.getPrefType(pName);
		if(pType == ps.PREF_INVALID)
			pType = this.getValueType(val);
		switch(pType) {
			case ps.PREF_BOOL:   ps.setBoolPref(pName, val); break;
			case ps.PREF_INT:    ps.setIntPref(pName, val);  break;
			case ps.PREF_STRING:
				var ss = Components.interfaces.nsISupportsString;
				var str = Components.classes["@mozilla.org/supports-string;1"]
					.createInstance(ss);
				str.data = val;
				ps.setComplexValue(pName, ss, str);
		}
		return this;
	},
	getValueType: function(val) {
		switch(typeof val) {
			case "boolean": return Services.prefs.PREF_BOOL;
			case "number":  return Services.prefs.PREF_INT;
		}
		return Services.prefs.PREF_STRING;
	}
};

var _timers = { __proto__: null };
var _timersCounter = 0;
function timer(callback, context, delay, args) {
	var Timer = timer._Timer || (timer._Timer = Components.Constructor("@mozilla.org/timer;1", "nsITimer"));
	var id = ++_timersCounter;
	var tmr = _timers[id] = new Timer();
	tmr.init({
		observe: function(subject, topic, data) {
			delete _timers[id];
			callback.apply(context, args);
		}
	}, delay || 0, tmr.TYPE_ONE_SHOT);
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
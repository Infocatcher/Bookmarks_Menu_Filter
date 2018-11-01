const WINDOW_LOADED = -1;
const WINDOW_CLOSED = -2;

const LOG_PREFIX = "[Bookmarks Menu Filter] ";
var rootURI = "chrome://bookmarksmenufilter/content/";
var platformVersion;
var global = this;

if(!("Services" in this))
	Components.utils.import("resource://gre/modules/Services.jsm");

this.__defineGetter__("PopupHandler", function() {
	delete this.PopupHandler;
	_log("Load popupHandler.js");
	Services.scriptloader.loadSubScript(rootURI + "popupHandler.js", this, "UTF-8");
	return PopupHandler;
});
this.__defineGetter__("prefs", function() {
	delete this.prefs;
	Services.console.logStringMessage("bmf: " + ts() + "load prefs.js\n" + new Error().stack);
	Services.scriptloader.loadSubScript(rootURI + "prefs.js", this, "UTF-8");
	return prefs;
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
	Services.console.logStringMessage("bmf: " + ts() + "startup");
	platformVersion = parseFloat(Services.appinfo.platformVersion);
	if(Services.appinfo.name == "Pale Moon" || Services.appinfo.name == "Basilisk")
		platformVersion = platformVersion >= 4.1 ? 56 : 28;

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
		Services.scriptloader.loadSubScript(rootURI + "utils.js", global, "UTF-8");
		delete this.ut;
		return this.ut = bmUtils;
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
			prefs; // Force load
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

		for(var p in this._handlers) {
			var eh = this._handlers[p];
			_log("!!! Not yet destroyed handler #" + p + " " + eh.window.location);
			eh.destroy(reason);
		}
		this._handlers = { __proto__: null };

		"prefsLoaded" in global && prefs.destroy();
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
		if(this.handlerKey in window) // Already initialized
			return;
		var id = window[this.handlerKey] = ++this._currentId;
		this._handlers[id] = new PopupHandler(window);
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
	handlerKey: "_bookmarksMenuFilterId",

	initWindow: function(window, reason) {
		if(reason == WINDOW_LOADED) {
			if(!this.isTargetWindow(window))
				return;
			if(!("prefsLoaded" in global)) timer(function() {
				prefs;
			}, this, 1500);
		}
		window.addEventListener("popupshowing", this, true);
		//_log("initWindow() #" + i + " " + window.location);
	},
	destroyWindow: function(window, reason) {
		window.removeEventListener("load", this, false); // Window can be closed before "load" event
		if(reason == WINDOW_CLOSED && !this.isTargetWindow(window))
			return;
		window.removeEventListener("popupshowing", this, true);
		if(!(this.handlerKey in window)) // Nothing to destroy
			return;
		var id = window[this.handlerKey];
		var eh = this._handlers[id];
		eh.destroy(reason);
		delete this._handlers[id];
		delete window[this.handlerKey];
		_log("destroyWindow() #" + id + " " + window.location);
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
	return d.toTimeString().replace(/^.*\d+:(\d+:\d+).*$/, "$1") + ":" + "000".substr(("" + ms).length) + ms + " ";
}
function _log(s) {
	if(!prefs.get("debug", true))
		return;
	var msg = LOG_PREFIX + ts() + s;
	Services.console.logStringMessage(msg);
	dump(msg + "\n");
}
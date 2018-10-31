function PopupHandler(window) {
	this.window = window;
	this._popups = []; // All opened popups
	this.init();
}
PopupHandler.prototype = {
	bmf: bmFilter,

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
	undo: { // Global!
		storage: [""],
		limit: 50,
		pos: undefined
	},

	init: function() {
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
			Array.prototype.slice.call(
				document.getElementsByAttribute(this.attrLoaded, "true")
			).forEach(function(node) {
				node.removeAttribute(this.attrLoaded);
			}, this);
		}
		if(reason != APP_SHUTDOWN) {
			if("_tt" in this) {
				this._tt.parentNode.removeChild(this._tt);
				delete this._tt;
			}
		}
		_log("PopupHandler.destroy() " + window.location);
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
		var popup = e.target;
		_log("Opened places popup: " + popup.parentNode.getAttribute("label"));

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
				Array.prototype.some.call(
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
						this.dispatchKeyEvent(popup, "DOM_VK_HOME");
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
	popupHidingHandler: function(e, _isFake) {
		var popup = e.target;
		_log("Closed places popup: " + popup.parentNode.getAttribute("label"));

		var indx = this._popups.indexOf(popup);
		if(indx != -1)
			this._popups.splice(indx, 1);
		else {
			_log(
				"Warning: closed popup not found in this._popups, label: "
				+ popup.parentNode.getAttribute("label")
			);
		}

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

		if(!_isFake) {
			if(this._checkForClosedPopupsTimer)
				cancelTimer(this._checkForClosedPopupsTimer);
			this._checkForClosedPopupsTimer = timer(function() {
				this._checkForClosedPopupsTimer = 0;
				this.checkForClosedPopups();
			}, this, 250);
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
					//this.showFilter(false, mp);
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
							this.showFilter(false, mp);
						}, this, submenuDelay);
					}
					else {
						this.showFilter(false, mp);
					}
					this.updateUndoStorage(mp[this.pFilter]);
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
	_checkForClosedPopupsTimer: 0,
	checkForClosedPopups: function() {
		var closedPopups = this._popups.filter(function(popup) {
			return !this.inDocument(popup) || popup.state == "closed";
		}, this);
		if(!closedPopups.length) {
			_log("checkForClosedPopups(): OK");
			return;
		}
		closedPopups.forEach(function(popup) {
			var label = popup.parentNode && popup.parentNode.getAttribute("label");
			_log("*** checkForClosedPopups(): found closed or removed popup in this._popups: " + label);
			this.popupHidingHandler({ target: popup }, true);
		}, this);
	},
	inDocument: function(node) {
		var doc = node.ownerDocument;
		if(doc && "contains" in doc) // Firefox 9+
			return doc.contains(node);
		return doc && !!(doc.compareDocumentPosition(node) & doc.DOCUMENT_POSITION_CONTAINED_BY);
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
		else if(
			e.keyCode == e.DOM_VK_ESCAPE
			&& !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
			&& this.filterOpen
			&& !this.contextMenuOpened
			&& platformVersion >= 25
		) {
			// See https://bugzilla.mozilla.org/show_bug.cgi?id=501496
			_log("Stop keydown event for Escape key");
			this.stopEvent(e); // This also stops "keypress" in Firefox 25+
			this.keyPressHandler(e);
		}
	},
	keyPressHandler: function(e) {
		var curPopup = this._currentPopup;
		if(!curPopup) {
			_log("*** keyPressHandler(): something wrong, this._currentPopup is " + curPopup);
			this.destroyInputWatcher();
			return;
		}
		if(
			(curPopup.state == "closed" || curPopup.state == "hiding")
			&& Services.appinfo.OS != "Darwin"
		) {
			_log("*** NoScript? Popup is closed, but we don't receive popuphiding event");
			this.destroyInputWatcher();
			return;
		}
		if(this.contextMenuOpened)
			return;

		var curFilter = this._filter;
		var newFilter = curFilter;
		var curFilterEmpty = !curFilter.trim();
		var isEscape = e.keyCode == e.DOM_VK_ESCAPE;
		if(isEscape && (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey)) {
			_log("Escape pressed with modifier key, ignore (and allow hide popup)");
			return; // Allow hide popup
		}
		if(isEscape && this.filterOpen && curFilterEmpty) {
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
			switch(chr.toLowerCase()) {
				case "x": var cut             = true; break;
				case "c": var copy            = true; break;
				case "v": var paste           = true; break;
				case "i": var toggleMatchCase = true; break;
				case "a": var toggleAsIs      = true; break;
				case "r": var toggleRegExp    = true; break;
				case "y": var redo            = true; break;
				case "z":
					if(e.shiftKey)
						var redo = true;
					else
						var undo = true;
				break;
				default: isOwnHotkey = false;
			}
		}

		var isBackspace = e.keyCode == e.DOM_VK_BACK_SPACE;
		var resetFilter = (isEscape || cut) && curFilter;
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
		) {
			_log("Unsupported hotkey, ignore");
			return;
		}

		var changed = true;
		if(copy || cut) {
			_log("Hotkey: " + (copy ? "copy" : "cut"));
			// Note: document argument was removed in Firefox 41+
			// see https://bugzilla.mozilla.org/show_bug.cgi?id=1166840
			var srcDoc = this.window.content && this.window.content.document || this.window.document;
			curFilter && Components.classes["@mozilla.org/widget/clipboardhelper;1"]
				.getService(Components.interfaces.nsIClipboardHelper)
				.copyString(curFilter, srcDoc);
		}

		if(resetFilter)
			newFilter = "";
		else if(paste)
			newFilter += this.window.readFromClipboard && this.window.readFromClipboard() || "";
		else if(isBackspace && (e.ctrlKey || e.metaKey))
			newFilter = newFilter.replace(this.delLastWordPattern, "");
		else if(isBackspace)
			newFilter = newFilter.slice(0, -1);
		else if(toggleMatchCase)
			newFilter = this.togglePrefix(newFilter, "matchCase");
		else if(toggleRegExp)
			newFilter = this.togglePrefix(newFilter, "regExp");
		else if(toggleAsIs)
			newFilter = this.togglePrefix(newFilter, "asIs");
		else if(undo || redo) {
			var us = this.undo.storage;
			var up = this.undo.pos;
			var pos = up == undefined
				? redo ? -1     : us.length - 2
				: redo ? up + 1 : up - 1;
			if(pos >= 0 && pos < us.length && us[pos] != curFilter) {
				newFilter = us[pos];
				this.undo.pos = pos;
			}
			else {
				changed = false;
			}
		}
		else if(!copy && !cut)
			newFilter += chr;

		if(!undo && !redo)
			this.updateUndoStorage(newFilter);

		var newFilterEmpty = !newFilter.trim();
		if(curFilterEmpty && newFilterEmpty && this.filterOpen)
			changed = false;

		this.stopEvent(e);
		_log("keyPressHandler(): \"" + chr + "\"");
		if(!changed) {
			_log("keyPressHandler(): filter isn't changed");
			return;
		}
		this._filter = newFilter;
		this.showFilter(true /*ignoreNotFound*/); // This should be fast... show as typed
		if(curFilterEmpty && !newFilterEmpty)
			this.filterBookmarksDelay();
		else
			this.filterBookmarksProxy();
	},
	updateUndoStorage: function(newFilter) {
		var us = this.undo.storage;
		var up = this.undo.pos;
		var oldFilter = up == undefined
			? us[us.length - 1] || ""
			: us[up];
		if(newFilter != oldFilter) {
			if(up != undefined) {
				us.length = up + 1;
				this.undo.pos = undefined;
			}
			us.push(newFilter);
			while(us.length > this.undo.limit)
				us.shift();
		}
	},
	get contextMenuOpened() {
		var curPopup = this._currentPopup;
		var doc = curPopup && curPopup.ownerDocument;
		return doc && doc.popupNode && Array.prototype.some.call(
			doc.getElementsByTagName("menupopup"),
			function(popup) {
				if(popup.state != "open")
					return false;
				_log("Opened context menu: " + popup.id);
				return true;
			}
		);
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
			_log("filterBookmarksProxy() => wait " + delay);
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
			//if(!popup)
			//	return;
			filterString = this._filter;
		}
		var filter = filterString;

		_log("filterBookmarks(): \"" + filterString + "\"");

		var flags = this.parsePrefixes(filter);
		if(flags.has)
			filter = flags.filter;
		filter = this.bmf.ut.applyReplacements(filter);

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
				filter = filter.trim();
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
		if(inProgress)
			this._filterStart = Date.now();
		else if(this._filterStart)
			_log("Filter duration: " + (Date.now() - this._filterStart) + " ms");
		this.ttSetClass("bookmarksMenuFilter-busy", inProgress);
	},
	filterBookmarksPopup: function(/* see arguments for filterBookmarksPopupWorker */) {
		this._filterInProgress = true;
		var worker = this.filterBookmarksPopupWorker;
		var gen = worker.apply(this, arguments);
		worker.__generator = gen;
		gen.next();
	},
	get filterBookmarksPopupWorker() {
		var o = this.__proto__ || Object.getPrototypeOf(this);
		delete o.filterBookmarksPopupWorker;
		var legacy = platformVersion < 26 ? "-legacy" : "";
		Services.scriptloader.loadSubScript(rootURI + "gen" + legacy + ".js", o, "UTF-8");
		return o.filterBookmarksPopupWorker;
	},
	stopFilter: function(restart) {
		cancelTimer(this._filterAsyncTimer);
		this.stopFilterDelay();
		if(!restart)
			this._filterInProgress = false;
		this._filterRestore.forEach(function(fn) {
			try {
				fn();
			}
			catch(e) {
				Components.utils.reportError(e);
			}
		});
		this._filterRestore.length = 0;
	},
	restoreActiveItem: function(popup, item) {
		_log("restoreActiveItem(): " + popup.parentNode.getAttribute("label"));
		var document = popup.ownerDocument;
		var window = document.defaultView;
		var first = true;
		Array.prototype.some.call(
			popup.childNodes,
			function(node) {
				var nn = node.nodeName;
				if(nn != "menu" && nn != "menuitem" || !this.isNodeVisible(node))
					return false;
				this.dispatchKeyEvent(popup, first ? "DOM_VK_HOME" : "DOM_VK_DOWN");
				first = false;
				var stop = item ? node == item : this.isBookmarkItem(node);
				if(stop)
					this._activeNode = this._lastActiveNode = node;
				return stop;
			},
			this
		);
	},
	dispatchKeyEvent: function(target, keyName) {
		var document = target.ownerDocument;
		var window = document.defaultView;
		function dispatchKeyEvent(type) {
			var evt = document.createEvent("KeyboardEvent");
			evt.initKeyEvent(
				"type", true /*bubbles*/, true /*cancelable*/, window,
				false /*ctrlKey*/, false /*altKey*/, false /*shiftKey*/, false /*metaKey*/,
				evt[keyName], 0 /*charCode*/
			);
			target.dispatchEvent(evt);
		}
		//dispatchKeyEvent("keydown");
		dispatchKeyEvent("keypress");
		//dispatchKeyEvent("keyup");
	},
	getBookmarkText: function(mi) {
		//~ todo: add prefs like search.title and search.url ?
		var texts = [];
		var label = mi.getAttribute("label");
		label && texts.push(label);
		var uri = mi._placesNode && mi._placesNode.uri || mi.node && mi.node.uri;
		uri && texts.push(uri);
		//~ todo: get description ?
		return this.bmf.ut.applyReplacements(texts.join("\n"));
	},
	getBookmarkMenuText: function(menu) {
		return this.bmf.ut.applyReplacements(menu.getAttribute("label") || "");
	},

	XULNS: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
	parseXULFromString: function(xul) {
		xul = xul.replace(/>\s+</g, "><");
		var dp = new this.window.DOMParser();
		if("forceEnableXULXBL" in dp) // Firefox 61+
			dp.forceEnableXULXBL();
		return dp.parseFromString(xul, "application/xml").documentElement;
	},
	get tt() {
		var window = this.window;
		this.bmf.ut.loadStyles(window);
		var document = window.document;
		var popupSet = document.getElementById("mainPopupSet") || document.documentElement;
		var tt = this._tt = popupSet.appendChild(this.parseXULFromString('\
			<tooltip xmlns="' + this.XULNS + '"\
				id="bookmarksMenuFilter"\
				noautohide="true"\
				orient="horizontal"\
				onpopuphiding="return this.__allowHide;"\
				onclick="this.stop();">\
				<vbox id="bookmarksMenuFilter-tooltipBox" flex="1">\
					<hbox id="bookmarksMenuFilter-filterBox" align="center" flex="1">\
						<label id="bookmarksMenuFilter-value" flex="1" crop="center" />\
						<label id="bookmarksMenuFilter-flags" hidden="true" />\
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
		var _this = this;
		tt.stop = function() {
			this.realHidePopup(); // Force hide even if something went wrong
			if(!_this._hasInputWatcher)
				return;
			// Wrong things may happens... so user should be able to stop all operations
			_log("Click on tooltip => destroyInputWatcher()");
			_this.destroyInputWatcher();
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
	showFilter: function(ignoreNotFound, popup, _noRetry) {
		popup = popup || this._currentPopup;
		if(!popup) {
			_log("showFilter(): looks like popup is closed, nothing to do");
			return;
		}
		var curFilter = popup[this.pFilter] || "";
		var tt = this.tt;
		//_log("showFilter : " + curFilter);
		tt._value.value = curFilter || " ";
		var count = popup[this.pCount] || 0;
		tt._count.value = count;

		var notFound = !count && curFilter;
		//_log("!!! showFilter: count: " + count + ", notFound: " + notFound + ", ignore: " + ignoreNotFound);
		if(!notFound || !ignoreNotFound)
			this.ttSetClass("bookmarksMenuFilter-notFound", notFound);

		var w = Math.max(prefs.get("minPanelWidth", 120), popup.boxObject.width);
		var trgPopup = this._filterPopup;
		this._filterPopup = popup;

		if(this._hideFilterTimer) {
			this.window.clearTimeout(this._hideFilterTimer);
			this._hideFilterTimer = 0;
		}

		if(platformVersion < 2) {
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
		//_log("showFilter() y: " + y);
		if(y < 0) {
			var maxOverlap = 12;
			// Allow higher overlap, if first popup items isn't bookmark items:
			for(var ch = popup.firstChild; ch; ch = ch.nextSibling) {
				if(!this.isNodeVisible(ch))
					continue;
				if(this.isBookmarkItem(ch))
					break;
				maxOverlap += ch.boxObject.height;
			}
			if(y >= -maxOverlap) {
				_log("showFilter(): set y = 0, allow overlap");
				y = 0; // Allow overlap, but show on top
			}
		}

		if(trgPopup != popup)
			_log("Switch to another popup");
		if(tt.boxObject.screenY != popup.boxObject.screenY - tt.boxObject.height)
			_log("Changed popup screenY");

		if(y < 0 && !_noRetry) { //~ todo: first bookmark in this case only partially visible
			this._showFilterRetryTimer = timer(function() {
				_log("showFilter(): retry...");
				this.showFilter(ignoreNotFound, popup, true);
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
			else if(tt.boxObject.screenX < -4 || tt.boxObject.screenY < -4) {
				_log("Tooltip not in the screen, move it right/down");
				tt.moveTo(
					Math.max(-4, tt.boxObject.screenX),
					Math.max(-4, tt.boxObject.screenY)
				);
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
	_hideFilterTimer: 0,
	hideFilter: function() {
		_log("hideFilter()");
		//this.tt.realHidePopup();
		// May work wrong without delay in Firefox 3.6: Alt, Alt -> menus closes, but not tooltip
		this._hideFilterTimer = this.window.setTimeout(function(_this) {
			_this._hideFilterTimer = 0;
			_this.tt.realHidePopup();
		}, 0, this);
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
		if(f.value != flagsStr) {
			f.value = flagsStr;
			f.hidden = !flagsStr;
		}
	},
	get defaultHint() {
		return setProperty(this, "defaultHint", this.bmf.ut.getLocalized("hint"));
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
		node.setAttribute(this.attrHidden, "true");
	},
	showNode: function(node) {
		node.removeAttribute(this.attrHidden);
	},
	showNodes: function(parent) {
		_log(
			"showNodes(): " + (
				parent.parentNode && "getAttribute" in parent.parentNode
					? '"' + parent.parentNode.getAttribute("label") + '"'
					: parent
			)
		);
		Array.prototype.slice.call(
			parent.getElementsByAttribute(this.attrHidden, "true")
		).forEach(function(node) {
			this.showNode(node);
		}, this);
	},
	cleanPopups: function(parent) {
		Array.prototype.forEach.call(
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
		return this.bmf.isPlacesPopup(node);
	},
	isBookmarkItem: function(node) {
		// "history-submenu" - https://addons.mozilla.org/addon/history-submenus-2/
		return /(?:^|\s)(?:bookmark-item|history-submenu)(?:\s|$)/.test(node.className);
	},
	isBookmark: function(node) {
		return node.localName == "menuitem" && this.isBookmarkItem(node);
	}
};

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
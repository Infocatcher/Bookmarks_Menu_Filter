var bmUtils = {
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
				[' + PopupHandler.prototype.attrHidden + '="true"] {\n\
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
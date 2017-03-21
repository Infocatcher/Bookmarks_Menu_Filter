// See popupHandler.js: will be loaded into PopupHandler.prototype

var filterBookmarksPopupWorker = function* worker(popup, filterString, matcher, linear, parentPopup, callback, _level) {
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
		return;
	}

	var childs = Array.prototype.slice.call(popup.childNodes);
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
				//	this.tt._count.value = this._lastCount || 0;
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
			var subMatcher = matcher
				&& prefs.get("checkFoldersLabels", true)
				&& matcher(this.getBookmarkMenuText(node))
				? null
				: matcher;

			this._filterAsyncTimer = delay(function() {
				if(!this._currentPopup) {
					_gen.next();
					return;
				}
				this.filterBookmarksPopup(mp, filterString, subMatcher, linear, parentPopup, function(_hasVisible) {
					if(_hasVisible)
						hasVisible = true;
					else
						hide = true;
					_gen.next();
				}, _level);
			}, this);
			yield 0;

			if(load) {
				restoreNode();
				this._filterRestore = this._filterRestore.filter(function(f) {
					return f != restoreNode;
				});
				this._currentPopup && Array.prototype.forEach.call(
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
		if(this._currentPopup) {
			this._selectBMNodeTimer = timer(function() {
				var lastActive = this._lastActiveNode;
				if(lastActive && (lastActive.parentNode != popup || !this.isNodeVisible(lastActive)))
					lastActive = null;
				if(lastActive && this._activeNode == lastActive) // Nothing to do :)
					return;
				_log("restoreActiveItem(): " + (lastActive ? lastActive.getAttribute("label") : "<first>"));
				this.restoreActiveItem(popup, lastActive);
			}, this, 0);
			this._ignoreActivationTimer = timer(function() {
				this._ignoreActivation = false;
			}, this, 50);
		}
		else {
			this._ignoreActivation = false;
		}

		this.stopFilterDelay();
		if(this._currentPopup)
			this.showFilterDelay();

		this._filterInProgress = false;
	}
	else {
		if(this._currentPopup)
			this.showFilterDelay(true /*ignoreNotFound*/); // Adjust position
	}

	callback && callback.call(this, hasVisible);
	yield 0;
};
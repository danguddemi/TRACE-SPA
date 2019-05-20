///////////////////////////////////////
// INITIALIZATION
///////////////////////////////////////

/**
 * Functionality for scaling, showing by media query, and navigation between multiple pages on a single page.
 * Code subject to change.
 **/

if (window.console == null) {
	window['console'] = {
		log: function() {}
	};
} // some browsers do not set
var Application = function() {
	// event constants
	this.NAVIGATION_CHANGE = 'viewChange';
	this.VIEW_NOT_FOUND = 'viewNotFound';
	this.STATE_NOT_FOUND = 'stateNotFound';
	this.APPLICATION_COMPLETE = 'applicationComplete';
	this.SIZE_STATE_NAME = 'data-is-view-scaled';

	this.currentQuery = { index: 0, rule: null, mediaText: null, id: null };
	this.inclusionQuery = '(min-width: 0px)';
	this.exclusionQuery = 'none and (min-width: 99999px)';
	this.LastModifiedDateLabelName = 'LastModifiedDateLabel';
	this.pageRefreshedName = 'showPageRefreshedNotification';
	this.prefix = '--web-';
	this.applicationStylesheet = null;
	this.mediaQueryDictionary = {};
	this.statesDictionary = {};
	this.states = [];
	this.views = {};
	this.viewIds = [];
	this.viewQueries = {};
	this.viewScale = 1;
	this.numberOfViews = 0;
	this.verticalPadding = 0;
	this.horizontalPadding = 0;
	this.stateName = null;

	// view settings
	this.showUpdateNotification = false;
	this.showNavigationControls = false;
	this.scaleViewsToFit = false;
	this.scaleToFitOnDoubleClick = false;
	this.actualSizeOnDoubleClick = false;
	this.scaleViewsOnResize = false;
	this.navigationOnKeypress = false;
	this.showViewName = false;
	this.enableDeepLinking = true;
	this.refreshPageForChanges = false;
	this.showRefreshNotifications = true;

	// view controls
	this.scaleViewSlider = null;
	this.lastModifiedLabel = null;
	this.supportsPopState = false; // window.history.pushState!=null;
	this.initialized = false;

	// refresh properties
	this.lastModifiedDate = null;
	this.refreshRequest = null;
	this.refreshDuration = 2000;
	this.refreshInterval = null;
	this.refreshContent = null;
	this.refreshContentSize = null;
	this.refreshCheckContent = false;
	this.refreshCheckContentSize = false;

	var self = this;

	self.initialize = function(event) {
		var view = self.getVisibleView();
		self.collectViews();
		self.collectMediaQueries();
		self.setViewOptions(view);

		// sometimes the body size is 0 so we call this now and again later
		if (self.initialized) {
			window.addEventListener(
				self.NAVIGATION_CHANGE,
				self.viewChangeHandler
			);
			window.addEventListener('keyup', self.keypressHandler);
			window.addEventListener('keypress', self.keypressHandler);
			window.addEventListener('resize', self.resizeHandler);
			window.document.addEventListener(
				'dblclick',
				self.doubleClickHandler
			);

			if (self.supportsPopState) {
				window.addEventListener('popstate', self.popStateHandler);
			} else {
				window.addEventListener('hashchange', self.hashChangeHandler);
			}

			// we are ready to go
			window.dispatchEvent(new Event(self.APPLICATION_COMPLETE));
		}

		if (self.initialized == false) {
			if (self.showNavigationControls || self.singlePageApplication) {
				self.syncronizeViewToURL();
			}

			if (self.refreshPageForChanges) {
				self.setupRefreshForChanges();
			}

			self.initialized = true;
		}

		if (self.scaleViewsToFit) {
			self.viewScale = self.scaleViewToFit();

			if (self.viewScale < 0) {
				setTimeout(self.scaleViewToFit, 500);
			}
		} else {
			self.viewScale = self.getViewScaleValue(view);
			self.updateSliderValue(self.viewScale);
		}

		if (self.showUpdateNotification) {
			self.showNotification();
		}

		//"addEventListener" in window ? null : window.addEventListener = window.attachEvent;
		//"addEventListener" in document ? null : document.addEventListener = document.attachEvent;
	};

	///////////////////////////////////////
	// AUTO REFRESH
	///////////////////////////////////////

	self.setupRefreshForChanges = function() {
		self.refreshRequest = new XMLHttpRequest();

		if (!self.refreshRequest) {
			return false;
		}

		// get document start values immediately
		self.requestRefreshUpdate();
	};

	/**
	 * Attempt to check the last modified date by the headers
	 * or the last modified property from the byte array
	 * (BETA)
	 **/
	self.requestRefreshUpdate = function() {
		var url = document.location.href;
		var protocol = window.location.protocol;
		var method;

		try {
			if (self.refreshCheckContentSize) {
				self.refreshRequest.open('HEAD', url, true);
			} else if (self.refreshCheckContent) {
				self.refreshContent = document.documentElement.outerHTML;
				self.refreshRequest.open('GET', url, true);
				self.refreshRequest.responseType = 'text';
			} else {
				// get page last modified date for the first call to compare to later
				if (self.lastModifiedDate == null) {
					// File system does not send headers in FF so get blob if possible
					if (protocol == 'file:') {
						self.refreshRequest.open('GET', url, true);
						self.refreshRequest.responseType = 'blob';
					} else {
						self.refreshRequest.open('HEAD', url, true);
						self.refreshRequest.responseType = 'blob';
					}

					self.refreshRequest.onload = self.refreshOnLoadOnceHandler;

					// In some browsers (Chrome & Safari) this error occurs at send:
					//
					// Chrome - Access to XMLHttpRequest at 'file:///index.html' from origin 'null'
					// has been blocked by CORS policy:
					// Cross origin requests are only supported for protocol schemes:
					// http, data, chrome, chrome-extension, https.
					//
					// Safari - XMLHttpRequest cannot load file:///Users/user/Public/index.html. Cross origin requests are only supported for HTTP.
					//
					// Solution is to run a local server, set local permissions or test in another browser
					self.refreshRequest.send(null);

					// In MS browsers the following behavior occurs possibly due to an AJAX call to check last modified date:
					//
					// DOM7011: The code on this page disabled back and forward caching.
				} else {
					self.refreshRequest = new XMLHttpRequest();
					self.refreshRequest.onreadystatechange =
						self.refreshHandler;
					self.refreshRequest.ontimeout = function() {
						console.log("Couldn't find page to check for updates");
					};

					var method;
					if (protocol == 'file:') {
						method = 'GET';
					} else {
						method = 'HEAD';
					}

					//refreshRequest.open('HEAD', url, true);
					self.refreshRequest.open(method, url, true);
					self.refreshRequest.responseType = 'blob';
					self.refreshRequest.send(null);
				}
			}
		} catch (error) {
			console.log('Refresh failed for the following reason:');
			console.log(error);
		}
	};

	self.refreshHandler = function() {
		var contentSize;

		try {
			if (self.refreshRequest.readyState === XMLHttpRequest.DONE) {
				if (
					self.refreshRequest.status === 2 ||
					self.refreshRequest.status === 200
				) {
					var pageChanged = false;

					self.updateLastModifiedLabel();

					if (self.refreshCheckContentSize) {
						var lastModifiedHeader = self.refreshRequest.getResponseHeader(
							'Last-Modified'
						);
						contentSize = self.refreshRequest.getResponseHeader(
							'Content-Length'
						);
						//lastModifiedDate = refreshRequest.getResponseHeader("Last-Modified");
						var headers = self.refreshRequest.getAllResponseHeaders();
						var hasContentHeader =
							headers.indexOf('Content-Length') != -1;

						if (hasContentHeader) {
							contentSize = self.refreshRequest.getResponseHeader(
								'Content-Length'
							);

							// size has not been set yet
							if (self.refreshContentSize == null) {
								self.refreshContentSize = contentSize;
								// exit and let interval call this method again
								return;
							}

							if (contentSize != self.refreshContentSize) {
								pageChanged = true;
							}
						}
					} else if (self.refreshCheckContent) {
						if (
							self.refreshRequest.responseText !=
							self.refreshContent
						) {
							pageChanged = true;
						}
					} else {
						lastModifiedHeader = self.getLastModified(
							self.refreshRequest
						);

						if (self.lastModifiedDate != lastModifiedHeader) {
							pageChanged = true;
						}
					}

					if (pageChanged) {
						clearInterval(self.refreshInterval);
						self.refreshUpdatedPage();
						return;
					}
				} else {
					console.log('There was a problem with the request.');
				}
			}
		} catch (error) {
			//console.log('Caught Exception: ' + error);
		}
	};

	self.refreshOnLoadOnceHandler = function(event) {
		// get the last modified date
		if (self.refreshRequest.response) {
			self.lastModifiedDate = self.getLastModified(self.refreshRequest);

			if (self.lastModifiedDate != null) {
				if (self.refreshInterval == null) {
					self.refreshInterval = setInterval(
						self.requestRefreshUpdate,
						self.refreshDuration
					);
				}
			} else {
				console.log('Could not get last modified date from the server');
			}
		}
	};

	self.refreshUpdatedPage = function() {
		if (self.showRefreshNotifications) {
			var date = new Date().setTime(new Date().getTime() + 10000);
			document.cookie =
				encodeURIComponent(self.pageRefreshedName) +
				'=true' +
				'; max-age=6000;' +
				' path=/';
		}

		document.location.reload(true);
	};

	self.showNotification = function(duration) {
		var notificationID = self.pageRefreshedName + 'ID';
		var notification = document.getElementById(notificationID);
		if (duration == null) duration = 4000;

		if (notification != null) {
			return;
		}

		notification = document.createElement('div');
		notification.id = notificationID;
		notification.textContent = 'PAGE UPDATED';
		var styleRule = '';
		styleRule =
			'position: fixed; padding: 7px 16px 6px 16px; font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; left: 50%;';
		styleRule +=
			'top: 20px; background-color: rgba(0,0,0,.5); border-radius: 12px; color:rgb(235, 235, 235); transition: all 2s linear;';
		styleRule +=
			'transform: translateX(-50%); letter-spacing: .5px; filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, .1))';
		notification.setAttribute('style', styleRule);

		notification.className = 'PageRefreshedClass';

		document.body.appendChild(notification);

		setTimeout(function() {
			notification.style.opacity = '0';
			notification.style.filter =
				'drop-shadow( 0px 0px 0px rgba(0,0,0, .5))';
			setTimeout(function() {
				notification.parentNode.removeChild(notification);
			}, duration);
		}, duration);

		document.cookie =
			encodeURIComponent(self.pageRefreshedName) + '=; max-age=1; path=/';
	};

	/**
	 * Get the last modified date from the header
	 * or file object after request has been received
	 **/
	self.getLastModified = function(request) {
		var date;

		// file protocol - FILE object with last modified property
		if (request.response && request.response.lastModified) {
			date = request.response.lastModified;
		}

		// http protocol - check headers
		if (date == null) {
			date = request.getResponseHeader('Last-Modified');
		}

		return date;
	};

	self.updateLastModifiedLabel = function() {
		var labelValue = '';

		if (self.lastModifiedLabel == null) {
			self.lastModifiedLabel = document.getElementById(
				'LastModifiedLabel'
			);
		}

		if (self.lastModifiedLabel) {
			var seconds = parseInt(
				((new Date().getTime() - Date.parse(document.lastModified)) /
					1000 /
					60) *
					100 +
					''
			);
			var minutes = 0;
			var hours = 0;

			if (seconds < 60) {
				seconds = Math.floor(seconds / 10) * 10;
				labelValue = seconds + ' seconds';
			} else {
				minutes = parseInt(seconds / 60 + '');

				if (minutes > 60) {
					hours = parseInt(seconds / 60 / 60 + '');
					labelValue += hours == 1 ? ' hour' : ' hours';
				} else {
					labelValue = minutes + '';
					labelValue += minutes == 1 ? ' minute' : ' minutes';
				}
			}

			if (seconds < 10) {
				labelValue = 'Updated now';
			} else {
				labelValue = 'Updated ' + labelValue + ' ago';
			}

			if (self.lastModifiedLabel.firstElementChild) {
				self.lastModifiedLabel.firstElementChild.textContent = labelValue;
			} else if ('textContent' in self.lastModifiedLabel) {
				self.lastModifiedLabel.textContent = labelValue;
			}
		}
	};

	self.getShortString = function(string, length) {
		if (length == null) length = 30;
		string =
			string != null
				? string.substr(0, length).replace(/\n/g, '')
				: '[String is null]';
		return string;
	};

	self.getShortNumber = function(value, places) {
		if (places == null || places < 1) places = 3;
		value = Math.round(value * Math.pow(10, places)) / Math.pow(10, places);
		return value;
	};

	///////////////////////////////////////
	// NAVIGATION CONTROLS
	///////////////////////////////////////

	self.updateViewLabel = function() {
		var viewNavigationLabel = document.getElementById(
			'ViewNavigationLabel'
		);
		var view = self.getVisibleView();
		var viewIndex = view ? self.getViewIndex(view) : -1;
		var viewName = view
			? self.getViewPreferenceValue(view, self.prefix + 'view-name')
			: null;
		var viewId = view ? view.id : null;

		if (viewNavigationLabel && view) {
			if (viewName && viewName.indexOf('"') != -1) {
				viewName = viewName.replace(/"/g, '');
			}

			if (self.showViewName) {
				viewNavigationLabel.textContent = viewName;
				self.setTooltip(
					viewNavigationLabel,
					viewIndex + 1 + ' of ' + self.numberOfViews
				);
			} else {
				viewNavigationLabel.textContent =
					viewIndex + 1 + ' of ' + self.numberOfViews;
				self.setTooltip(viewNavigationLabel, viewName);
			}
		}
	};

	self.updateURL = function(view) {
		view = view == null ? self.getVisibleView() : view;
		var viewId = view ? view.id : null;
		var viewFragment = view ? '#' + viewId : null;

		if (viewId && self.enableDeepLinking) {
			if (self.supportsPopState == false) {
				self.setFragment(viewId);
			} else {
				if (viewFragment != window.location.hash) {
					if (window.location.hash == null) {
						window.history.replaceState(
							{ name: viewId },
							null,
							viewFragment
						);
					} else {
						window.history.pushState(
							{ name: viewId },
							null,
							viewFragment
						);
					}
				}
			}
		}
	};

	self.setFragment = function(value) {
		window.location.hash = '#' + value;
	};

	self.setTooltip = function(element, value) {
		// setting the tooltip in edge causes a page crash on hover
		if (/Edge/.test(navigator.userAgent)) {
			return;
		}

		if ('title' in element) {
			element.title = value;
		}
	};

	self.getStylesheetRules = function(styleSheet) {
		if (styleSheet) return styleSheet.cssRules || styleSheet.rules;

		return (
			document.styleSheets[0]['cssRules'] ||
			document.styleSheets[0]['rules']
		);
	};

	/**
	 * If single page application hide all of the views except first
	 **/
	self.hideViews = function(selectIndex) {
		var rules = self.getStylesheetRules();
		var queryIndex = 0;
		var numberOfRules = rules != null ? rules.length : 0;

		// loop through rules and hide media queries except selected
		for (var i = 0; i < numberOfRules; i++) {
			var rule = rules[i];

			if (rule.media != null) {
				if (queryIndex == selectIndex) {
					self.currentQuery.mediaText = rule.conditionText;
					self.currentQuery.index = selectIndex;
					self.currentQuery.rule = rule;
					self.enableMediaQuery(rule);
				} else {
					self.disableMediaQuery(rule);
				}

				queryIndex++;
			}
		}

		self.numberOfViews = queryIndex;
		self.updateViewLabel();
		self.updateURL();

		self.dispatchViewChange();

		var view = self.getVisibleView();
		var viewIndex = view ? self.getViewIndex(view) : -1;

		return viewIndex == selectIndex ? view : null;
	};

	self.showView = function(view) {
		var id = view ? view.id : null;
		var query = id ? self.mediaQueryDictionary[id] : null;
		var display = null;

		if (query) {
			self.enableMediaQuery(query);
			if (view == null) view = self.getVisibleView();
			self.setViewOptions(view);
		} else if (id) {
			display = window.getComputedStyle(view).getPropertyValue('display');
			if (display == '' || display == 'none') {
				view.style.display = 'block';
			}
		}
	};

	self.setViewOptions = function(view) {
		if (view) {
			self.scaleViewsToFit = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'scale-to-fit'
			);
			self.scaleToFitOnDoubleClick = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'scale-on-double-click'
			);
			self.actualSizeOnDoubleClick = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'actual-size-on-double-click'
			);
			self.scaleViewsOnResize = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'scale-on-resize'
			);
			self.navigationOnKeypress = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'navigate-on-keypress'
			);
			self.showViewName = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'show-view-name'
			);
			self.refreshPageForChanges = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'refresh-for-changes'
			);
			self.showNavigationControls = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'show-navigation-controls'
			);
			self.scaleViewSlider = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'show-scale-controls'
			);
			self.enableDeepLinking = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'enable-deep-linking'
			);
			self.singlePageApplication = self.getViewPreferenceBoolean(
				view,
				self.prefix + 'application'
			);
			self.showUpdateNotification =
				document.cookie != ''
					? document.cookie.indexOf(self.pageRefreshedName) != -1
					: false;

			if (self.scaleViewsToFit) {
				var newScaleValue = self.scaleViewToFit();

				if (newScaleValue < 0) {
					setTimeout(self.scaleViewToFit, 500);
				}
			} else {
				self.viewScale = self.getViewScaleValue(view);
				self.updateSliderValue(self.viewScale);
			}
		}
	};

	self.previousView = function(event) {
		var rules = self.getStylesheetRules();
		var view = self.getVisibleView();
		var index = view ? self.getViewIndex(view) : -1;
		var prevQueryIndex =
			index != -1 ? index - 1 : self.currentQuery.index - 1;
		var queryIndex = 0;
		var numberOfRules = rules != null ? rules.length : 0;

		if (event) {
			event.stopImmediatePropagation();
		}

		if (prevQueryIndex < 0) {
			return;
		}

		// loop through rules and hide media queries except selected
		for (var i = 0; i < numberOfRules; i++) {
			var rule = rules[i];

			if (rule.media != null) {
				if (queryIndex == prevQueryIndex) {
					self.currentQuery.mediaText = rule.conditionText;
					self.currentQuery.index = prevQueryIndex;
					self.currentQuery.rule = rule;
					self.enableMediaQuery(rule);
					self.updateViewLabel();
					self.updateURL();
					self.dispatchViewChange();
				} else {
					self.disableMediaQuery(rule);
				}

				queryIndex++;
			}
		}
	};

	self.nextView = function(event) {
		var rules = self.getStylesheetRules();
		var view = self.getVisibleView();
		var index = view ? self.getViewIndex(view) : -1;
		var nextQueryIndex =
			index != -1 ? index + 1 : self.currentQuery.index + 1;
		var queryIndex = 0;
		var numberOfRules = rules != null ? rules.length : 0;
		var numberOfMediaQueries = self.getNumberOfMediaRules();

		if (event) {
			event.stopImmediatePropagation();
		}

		if (nextQueryIndex >= numberOfMediaQueries) {
			return;
		}

		// loop through rules and hide media queries except selected
		for (var i = 0; i < numberOfRules; i++) {
			var rule = rules[i];

			if (rule.media != null) {
				if (queryIndex == nextQueryIndex) {
					self.currentQuery.mediaText = rule.conditionText;
					self.currentQuery.index = nextQueryIndex;
					self.currentQuery.rule = rule;
					self.enableMediaQuery(rule);
					self.updateViewLabel();
					self.updateURL();
					self.dispatchViewChange();
				} else {
					self.disableMediaQuery(rule);
				}

				queryIndex++;
			}
		}
	};

	self.enableMediaQuery = function(rule) {
		try {
			rule.media.mediaText = self.inclusionQuery;
		} catch (error) {
			//self.log(error);
			rule.conditionText = self.inclusionQuery;
		}
	};

	self.disableMediaQuery = function(rule) {
		try {
			rule.media.mediaText = self.exclusionQuery;
		} catch (error) {
			rule.conditionText = self.exclusionQuery;
		}
	};

	self.dispatchViewChange = function() {
		try {
			var event = new Event(self.NAVIGATION_CHANGE);
			window.dispatchEvent(event);
		} catch (error) {
			// In IE 11: Object doesn't support this action
		}
	};

	self.getNumberOfMediaRules = function() {
		var rules = self.getStylesheetRules();
		var numberOfQueries = 0;

		for (var i = 0; i < rules.length; i++) {
			if (rules[i].media != null) {
				numberOfQueries++;
			}
		}
		return numberOfQueries;
	};

	/////////////////////////////////////////
	// VIEW SCALE
	/////////////////////////////////////////

	self.sliderChangeHandler = function(event) {
		var value = event.currentTarget.value / 100;
		var view = self.getVisibleView();
		self.setViewScaleValue(view, value, false, true);
	};

	self.updateSliderValue = function(scale) {
		var slider = document.getElementById('ViewZoomSliderInput');
		var tooltip = parseInt(scale * 100 + '') + '%';
		var inputType;

		if (slider) {
			slider['value'] = scale * 100;
			inputType = slider.getAttributeNS(null, 'type');

			if (inputType != 'range') {
				// input range is not supported
				slider.style.display = 'none';
			}

			self.setTooltip(slider, tooltip);
		}
	};

	self.viewChangeHandler = function(event) {
		var view = self.getVisibleView();
		var matrix = view ? getComputedStyle(view).transform : null;

		if (matrix) {
			self.viewScale = self.getViewScaleValue(view);

			var scaleNeededToFit = self.getViewFitToViewportScale(view);
			var isViewLargerThanViewport = scaleNeededToFit < 1;

			// scale large view to fit if scale to fit is enabled
			//if (isViewLargerThanViewport && scaleViewsToFit) {
			if (self.scaleViewsToFit) {
				//setViewScaleValue(view, scale, true);
				self.scaleViewToFit();
			} else {
				self.updateSliderValue(self.viewScale);
			}
		}
	};

	self.getViewScaleValue = function(view) {
		var matrix = getComputedStyle(view).transform;

		if (matrix) {
			var matrixArray = matrix.replace('matrix(', '').split(',');
			var scaleX = parseFloat(matrixArray[0]);
			var scaleY = parseFloat(matrixArray[3]);
			var scale = Math.min(scaleX, scaleY);
		}

		return scale;
	};

	self.getViewTranslateYValue = function(view) {
		var matrix = getComputedStyle(view).transform;

		if (matrix) {
			var matrixArray = matrix.replace('matrix(', '').split(',');
			var translateY = parseFloat(matrixArray[5]);
		}

		return translateY;
	};

	self.getViewTop = function(view) {
		var top = getComputedStyle(view).top;

		return top;
	};

	self.setViewScaleValue = function(
		view,
		desiredScale,
		scaleViewToFit,
		centerVertically
	) {
		var transform = getComputedStyle(view).transform;
		var scaleNeededToFit = self.getViewFitToViewportScale(view);
		var isViewLargerThanViewport = scaleNeededToFit < 1;
		var shrunkToFit = false;

		if (scaleViewToFit && isViewLargerThanViewport) {
			desiredScale = scaleNeededToFit;
			shrunkToFit = true;
		}

		if (isNaN(desiredScale)) {
			desiredScale = 1;
		}

		desiredScale = self.getShortNumber(desiredScale);

		self.updateSliderValue(desiredScale);

		transform = self.getCSSPropertyValueForElement(view.id, 'transform');

		if (transform != null) {
			var horizontalCenter = transform.indexOf('translateX') != -1;
			var verticalCenter = transform.indexOf('translateY') != -1;
			var horizontalAndVerticalCenter =
				(horizontalCenter && verticalCenter) ||
				transform.indexOf('translate(') != -1;
			var topPosition = null;
			var leftPosition = null;
			var translateY = null;
			var translateX = '-50%';
			var centerForNavigation =
				self.showNavigationControls != null && self.scaleViewsToFit;

			//if (horizontalAndVerticalCenter || horizontalCenter || verticalCenter) {
			if (horizontalAndVerticalCenter || centerForNavigation) {
				translateX = '-50%';

				// if view is smaller than viewport or center vertically is true then center vertically
				if (shrunkToFit || centerVertically) {
					translateX = '-50%';
					translateY = '-50%';
					topPosition = '50%';
					leftPosition = '50%';
				} else {
					translateX = '0';
					translateY = '0';
					topPosition = '0';
					leftPosition = '0';
				}

				view.style.transform =
					'translateX(' +
					translateX +
					') translateY(' +
					translateY +
					') scale(' +
					desiredScale +
					')';

				if (view.style.top != topPosition) {
					view.style.top = topPosition + '';
				}

				if (view.style.left != leftPosition) {
					view.style.left = leftPosition + '';
				}
				//view.style.transform = "translate(-50%,-50%) scale(" + desiredScale + ")";
			} else if (horizontalCenter) {
				translateY = shrunkToFit ? '-50%' : '0%';
				view.style.transform =
					'translateY(' +
					translateY +
					') translateX(-50%) scale(' +
					desiredScale +
					')';

				// this next function needs work
				//topPosition = getVerticallyCenteredTopValue(view);

				if (shrunkToFit) {
					view.style.top = '50%';
				} else {
					view.style.top = '0';
				}
			} else if (verticalCenter) {
				view.style.transform =
					'translateY(-50%) scale(' + desiredScale + ')';
			} else {
				view.style.transform = 'scale(' + desiredScale + ')';
			}

			if (desiredScale != 1) {
				// attempt to anchor to the top as scaled up
				//view.style.top = null;
			}
		}

		if (shrunkToFit) {
			return scaleNeededToFit;
		}

		return desiredScale;
	};

	self.getVerticallyCenteredTopValue = function(view) {
		var originalTransform = view.style.transform;
		var originalTop = view.style.top;
		var transform = null;

		view.style.transform = 'translateY(-50%)' + originalTransform;
		view.style.top = '50%';
		var translateY = self.getViewTranslateYValue(view);
		view.style.transform = originalTransform;
		view.style.top = originalTop;
		return translateY;
	};

	self.getViewFitToViewportScale = function(view) {
		var availableWidth =
			window.innerWidth ||
			document.documentElement.clientWidth ||
			document.body.clientWidth;
		var availableHeight =
			window.innerHeight ||
			document.documentElement.clientHeight ||
			document.body.clientHeight;
		var elementWidth = parseFloat(getComputedStyle(view, 'style').width);
		var elementHeight = parseFloat(getComputedStyle(view, 'style').height);
		var newScale = 1;

		availableWidth -= self.horizontalPadding;
		availableHeight -= self.verticalPadding;

		if (elementWidth > availableWidth || elementHeight > availableHeight) {
			newScale = Math.min(
				availableHeight / elementHeight,
				availableWidth / elementWidth
			);
		}

		return newScale;
	};

	self.keypressHandler = function(event) {
		var rightKey = 39;
		var leftKey = 37;

		// listen for both events
		if (event.type == 'keypress') {
			window.removeEventListener('keyup', self.keypressHandler);
		} else {
			window.removeEventListener('keypress', self.keypressHandler);
		}

		if (self.showNavigationControls) {
			if (self.navigationOnKeypress) {
				if (event.keyCode == rightKey) {
					self.nextView();
				}
				if (event.keyCode == leftKey) {
					self.previousView();
				}
			}
		} else if (self.navigationOnKeypress) {
			if (event.keyCode == rightKey) {
				self.nextView();
			}
			if (event.keyCode == leftKey) {
				self.previousView();
			}
		}
	};

	///////////////////////////////////
	// GENERAL FUNCTIONS
	///////////////////////////////////

	self.getViewById = function(id) {
		id = id ? id.replace('#', '') : '';
		var view =
			self.viewIds.indexOf(id) != -1 && document.getElementById(id);
		return view;
	};

	self.getViewIds = function() {
		var viewIds = self.getViewPreferenceValue(
			document.body,
			self.prefix + 'view-ids'
		);
		var viewId = null;

		viewIds = viewIds != null && viewIds != '' ? viewIds.split(',') : [];

		if (viewIds.length == 0) {
			viewId = self.getViewPreferenceValue(
				document.body,
				self.prefix + 'view-id'
			);
			viewIds = viewId ? [viewId] : [];
		}

		return viewIds;
	};

	self.getApplicationStylesheet = function() {
		var stylesheetId = self.getViewPreferenceValue(
			document.body,
			self.prefix + 'stylesheet-id'
		);
		self.applicationStylesheet = document.getElementById(
			'applicationStylesheet'
		);
		return self.applicationStylesheet.sheet;
	};

	self.getViewQueries = function() {
		var stylesheetId = self.getViewPreferenceValue(
			document.body,
			self.prefix + 'stylesheet-id'
		);
		var viewIds = self.getViewIds();
	};

	self.getVisibleView = function() {
		var viewIds = self.getViewIds();

		try {
			//var rules = self.getStylesheetRules();
			//var styleSheet = self.getApplicationStylesheet();
			/*
            viewIds = rules[1].selectorText.split(/\,?\s+?#/);
            if (viewIds[0]=="*") {
                viewIds = rules[2].selectorText.split(/\,?\s+?#/);
            }
            */
		} catch (error) {
			console.log(
				'For the page functionality to work the first two style declarations must be the generated ones.'
			);
			return;
		}

		for (var i = 0; i < viewIds.length; i++) {
			var viewId = viewIds[i].replace(/[\#?\.?](.*)/, '$' + '1');
			var view = document.getElementById(viewId);
			var postName = '_Class';

			if (view == null && viewId && viewId.lastIndexOf(postName) != -1) {
				view = document.getElementById(viewId.replace(postName, ''));
			}

			if (view) {
				var display = window.getComputedStyle(view).display;

				if (display == 'block') {
					return view;
				}
			}
		}

		return null;
	};

	self.getViewIndex = function(view) {
		var viewIds = self.getViewIds();
		var id = view ? view.id : null;
		var index = id && viewIds ? viewIds.indexOf(id) : -1;

		return index;
	};

	self.syncronizeViewToURL = function() {
		var fragment = window.location.hash;
		var view = self.getViewById(fragment);
		var index = view ? self.getViewIndex(view) : 0;
		if (index == -1) index = 0;
		var currentView = self.hideViews(index);

		if (self.supportsPopState && currentView) {
			if (fragment == null) {
				window.history.replaceState(
					{ name: currentView.id },
					null,
					'#' + currentView.id
				);
			} else {
				window.history.pushState(
					{ name: currentView.id },
					null,
					'#' + currentView.id
				);
			}
		}
		return view;
	};

	self.getViewPreferenceBoolean = function(view, property) {
		var value = window.getComputedStyle(view).getPropertyValue(property);
		var type = typeof value;

		if (
			value == 'true' ||
			(type == 'string' && value.indexOf('true') != -1)
		) {
			return true;
		}

		return false;
	};

	self.getViewPreferenceValue = function(view, property) {
		var value = window.getComputedStyle(view).getPropertyValue(property);
		if (value === undefined) {
			return null;
		}

		value = value.replace(/^[\s"]*(.*?)[\s"]*$/, '$1');
		return value;
	};

	self.getCSSPropertyValueForElement = function(id, property) {
		var styleSheets = document.styleSheets;
		var numOfStylesheets = styleSheets.length;
		var values = [];
		var selectorIDText = '#' + id;
		var selectorClassText = '.' + id + '_Class';
		var value;

		for (var i = 0; i < numOfStylesheets; i++) {
			var styleSheet = styleSheets[i];
			var cssRules = self.getStylesheetRules(styleSheet);
			var numOfCSSRules = cssRules.length;
			var cssRule;

			for (var j = 0; j < numOfCSSRules; j++) {
				cssRule = cssRules[j];

				if (cssRule.media) {
					var mediaRules = cssRule.cssRules;
					var numOfMediaRules = mediaRules ? mediaRules.length : 0;

					for (var k = 0; k < numOfMediaRules; k++) {
						var mediaRule = mediaRules[k];

						if (
							mediaRule.selectorText == selectorIDText ||
							mediaRule.selectorText == selectorClassText
						) {
							if (
								mediaRule.style &&
								property in mediaRule.style
							) {
								value = mediaRule.style.getPropertyValue(
									property
								);
								//console.log(property+":" + value);
								values.push(value);
							}
						}
					}
				} else {
					if (
						cssRule.selectorText == selectorIDText ||
						cssRule.selectorText == selectorClassText
					) {
						if (cssRule.style && property in cssRule.style) {
							value = cssRule.style.getPropertyValue(property);
							//console.log(property+":" + value);
							values.push(value);
						}
					}
				}
			}
		}

		return values.pop();
	};

	self.collectViews = function() {
		var viewIds = self.getViewIds();

		for (let index = 0; index < viewIds.length; index++) {
			const id = viewIds[index];
			const view = self.getViewById(id);
			self.views[id] = view;
		}

		self.viewIds = viewIds;
	};

	self.collectMediaQueries = function() {
		var viewIds = self.getViewIds();
		var styleSheet = self.getApplicationStylesheet();
		var cssRules = self.getStylesheetRules(styleSheet);
		var numOfCSSRules = cssRules.length;
		var cssRule;
		var id = null;
		var selectorIDText = '#' + id;
		var selectorClassText = '.' + id + '_Class';

		for (var j = 0; j < numOfCSSRules; j++) {
			cssRule = cssRules[j];

			if (cssRule.media) {
				var mediaRules = cssRule.cssRules;
				var numOfMediaRules = mediaRules ? mediaRules.length : 0;

				for (var k = 0; k < numOfMediaRules; k++) {
					var mediaRule = mediaRules[k];
					var mediaId = null;

					if (k < 2) {
						mediaId = mediaRule.selectorText.replace(
							/[#|\s|*]?/g,
							''
						);

						if (viewIds.indexOf(mediaId) != -1) {
							self.mediaQueryDictionary[mediaId] = cssRule;
							self.addState(mediaId, cssRule);
							break;
						}
					} else {
						break;
					}
				}
			} else {
				if (
					cssRule.selectorText == selectorIDText ||
					cssRule.selectorText == selectorClassText
				) {
					continue;
				}
			}
		}
	};

	self.addState = function(name, cssRule) {
		var state = { name: name, rule: cssRule };
		self.states.push(name);
		self.statesDictionary[name] = state;
	};

	self.hasState = function(name) {
		if (self.states.indexOf(name) != -1) {
			return true;
		}
		return false;
	};

	self.goToState = function(name, maintainPreviousState) {
		var state = self.statesDictionary[name];

		if (state) {
			if (
				maintainPreviousState == false ||
				maintainPreviousState == null
			) {
				self.hideViews();
			}
			self.enableMediaQuery(state.rule);
			self.updateViewLabel();
			self.updateURL();
		} else {
			var event = new Event(self.STATE_NOT_FOUND);
			self.stateName = name;
			window.dispatchEvent(event);
		}
	};

	self.resizeHandler = function(event) {
		if (self.scaleViewsOnResize) {
			self.scaleViewToFit();
		}
	};

	self.preventDoubleClick = function(event) {
		event.stopImmediatePropagation();
	};

	self.hashChangeHandler = function(event) {
		var fragment = window.location.hash
			? window.location.hash.replace('#', '')
			: '';
		var view = self.getViewById(fragment);

		if (view) {
			self.hideViews();
			self.showView(view);
			self.updateViewLabel();
		} else {
			window.dispatchEvent(new Event(self.VIEW_NOT_FOUND));
		}
	};

	self.popStateHandler = function(event) {
		var state = event.state;
		var fragment = state ? state.name : window.location.hash;
		var view = self.getViewById(fragment);

		if (view) {
			self.hideViews();
			self.showView(view);
			self.updateViewLabel();
		} else {
			window.dispatchEvent(new Event(self.VIEW_NOT_FOUND));
		}
	};

	self.doubleClickHandler = function(event) {
		var view = self.getVisibleView();
		var scaleValue = self.getViewScaleValue(view);
		var scaleNeededToFit = self.getViewFitToViewportScale(view);

		// Three scenarios
		// - scale to fit on double click
		// - set scale to actual size on double click
		// - switch between scale to fit and actual page size

		// if scale and actual size enabled then switch between
		if (self.scaleToFitOnDoubleClick && self.actualSizeOnDoubleClick) {
			var isViewScaled = view.getAttributeNS(null, self.SIZE_STATE_NAME);
			var isScaled = false;

			// if scale is not 1 then view needs scaling
			if (scaleNeededToFit != 1) {
				// if current scale is at 1 it is at actual size
				// scale it to fit
				if (scaleValue == 1) {
					self.scaleViewToFit();
					isScaled = true;
				} else {
					// scale is not at 1 so switch to actual size
					self.scaleViewToActualSize();
					isScaled = false;
				}
			} else {
				// view is smaller than viewport
				// so scale to fit() is scale actual size
				// actual size and scaled size are the same
				// but call scale to fit to retain centering
				self.scaleViewToFit();
				isScaled = false;
			}

			view.setAttributeNS(null, SIZE_STATE_NAME, isScaled + '');
			isViewScaled = view.getAttributeNS(null, SIZE_STATE_NAME);
		} else if (self.scaleToFitOnDoubleClick) {
			self.scaleViewToFit();
		} else if (self.actualSizeOnDoubleClick) {
			self.scaleViewToActualSize();
		}
	};

	self.scaleViewToFit = function() {
		var view = self.getVisibleView();
		return self.setViewScaleValue(view, 1, true, true);
	};

	self.scaleViewToActualSize = function() {
		var view = self.getVisibleView();
		self.setViewScaleValue(view, 1);
	};

	self.onloadHandler = function(event) {
		self.initialize();
	};

	self.getStackArray = function(error) {
		var value = '';

		if (error == null) {
			try {
				error = new Error('Stack');
			} catch (e) {}
		}

		if ('stack' in error) {
			value = error.stack;
			var methods = value.match(/\\n/gm);

			var newArray = methods
				? methods.map(function(value, index, array) {
						value = value.replace('at ', '');
						return value;
				  })
				: null;

			if (newArray && newArray[0] == 'getStackTrace') {
				newArray.shift();
			}
			if (newArray && newArray[0] == 'getStackArray') {
				newArray.shift();
			}
			if (newArray && newArray[0] == 'getFunctionName') {
				newArray.shift();
			}
			if (newArray && newArray[0] == 'object') {
				newArray.shift();
			}
			if (newArray && newArray[0] == 'log') {
				newArray.shift();
			}

			return newArray;
		}

		return null;
	};

	this.log = function(value) {
		console.log.apply(this, [value]);
	};

	// initialize on load
	// sometimes the body size is 0 so we call this now and again later
	window.addEventListener('load', self.onloadHandler);
	window.document.addEventListener('DOMContentLoaded', self.onloadHandler);
};

var application = new Application();
window.application = application;

function layerModel(options, parent) {
	var self = this;

	// properties
	self.id = options.id;
	self.name = options.name;
	self.url = options.url;
	self.type = options.type;
	self.utfurl = options.utfurl || false; 
    self.legend = options.legend || false;
    self.legendVisibility = ko.observable(false);
    
	// is the layer visible?
	self.active = ko.observable(false);

    self.activeSublayer = ko.observable(false);

	self.subLayers = [];

	// add sublayers if they exist
	if (options.subLayers) {	
		$.each(options.subLayers, function (i, layer_options) {
			var subLayer = new layerModel(layer_options, self);
			app.viewModel.layerIndex[subLayer.id] = subLayer;
			self.subLayers.push(subLayer);
		});
	}

	// save a ref to the parent, if it exists
	if (parent) {
		self.parent = parent;
		self.fullName = self.parent.name + " (" + self.name + ")";

	} else {
    	self.fullName = self.name;
	}
    

    self.toggleLegendVisibility = function() {
        var layer = this;
        layer.legendVisibility(!layer.legendVisibility());
    }

	self.deactivateLayer = function () {
		var layer = this;
		app.viewModel.activeLayers.remove(layer);
		layer.active(false);
        
        app.setLayerVisibility(layer, false);
        
        if (layer.activeSublayer()) {
        	layer.activeSublayer().deactivateLayer();
        	layer.activeSublayer(false);
        }

	};

	self.activateLayer = function () {
		var layer = this;
        //factor out the following into an addLayerToMap function in map.js
		app.addLayerToMap(layer);
		// add it to the top of the active layers
		app.viewModel.activeLayers.unshift(layer);
		// set the active flag
		layer.active(true);

		// save reference in parent layer
		if (layer.parent) {
			layer.parent.activeSublayer(layer);
		}
	};

	self.toggleActive = function () {
		var layer = this;
		if (layer.active()) {
			// layer is active
			layer.deactivateLayer();
			if (layer.parent) {
				// layer has a parent
				// turn off the parent shell layer
				layer.parent.active(false);
				layer.parent.activeSublayer(false);

			}
		} else {
			// layer has a parent
			if (layer.parent) {
				// toggle sibling layers
				if (layer.parent.type === 'radio' && layer.parent.activeSublayer()) {
					// only allow one sublayer on at a time
					layer.parent.activeSublayer().deactivateLayer();
				}
				// turn on the parent
				layer.parent.active(true);
			}
			if (layer.subLayers.length) {
				// layer has sublayer, activate first layer
				layer.subLayers[0].activateLayer();
				layer.active(true);
			} else {
				// otherwise just activate the layer
				layer.activateLayer();
			}

		}
	};

	self.raiseLayer = function (layer, event) {
		var current = app.viewModel.activeLayers.indexOf(layer);
		if (current === 0) {
			// already at top
			return;
		}
		$(event.target).closest('tr').fadeOut('fast', function () {
			app.viewModel.activeLayers.remove(layer);
			app.viewModel.activeLayers.splice(current - 1, 0, layer);
		});

	};

	self.lowerLayer = function (layer, event) {
		var current = app.viewModel.activeLayers.indexOf(layer);
		if (current === app.viewModel.activeLayers().length) {
			// already at top
			return;
		}
		$(event.target).closest('tr').fadeOut('fast', function () {
			app.viewModel.activeLayers.remove(layer);
			app.viewModel.activeLayers.splice(current + 1, 0, layer);
		});
	};

	self.isTopLayer = function (layer) {
		return app.viewModel.activeLayers.indexOf(layer) === 0;
	};

	self.isBottomLayer = function (layer) {
		return app.viewModel.activeLayers.indexOf(layer) === app.viewModel.activeLayers().length - 1;
	}

	// remove the layer dropdrown menu
	self.closeMenu = function (layer, event) {
		$(event.target).closest('.btn-group').removeClass('open');

	}

	return self;
}

function themeModel(name, layers) {
	var self = this;

	self.name = name;

	// array of layers
	self.layers = layers;

	self.setActiveTheme = function (theme) {
		if (self.isActiveTheme(theme)) {
			app.viewModel.activeTheme(null);
		} else {
			app.viewModel.activeTheme(theme);
		}
	};

	self.isActiveTheme = function (theme) {
		return app.viewModel.activeTheme() === theme;
	};

	return self;
}

function bookmarkModel($popover) {
	var self = this;
	// name of the bookmark
	self.bookmarkName = ko.observable();

	// list of bookmarks
	self.bookmarksList = ko.observableArray();

	// load state from bookmark
	self.loadBookmark = function (bookmark) {
		// save the restore state
		app.restoreState = app.getState();
		
		app.loadState(bookmark.state);

		// show the alert for resting state
		app.viewModel.error("restoreState");
		$('#bookmark-popover').hide();

	}

	self.restoreState = function () {
		// hide the error
		app.viewModel.error(null);
		// restore the state
		app.loadState(app.restoreState);
	}

	self.removeBookmark = function (bookmark) {
		self.bookmarksList.remove(bookmark);
		$('#bookmark-popover').hide();
		// store the bookmarks
		self.storeBookmarks();
	}

	// handle the bookmark submit
	self.saveBookmark = function () {
		// add to the list of bookmarks
		self.bookmarksList.unshift({
			state: app.getState(),
			name: self.bookmarkName()
		});
		$('#bookmark-popover').hide();
		// store the bookmarks
		self.storeBookmarks();
	};

	// get the url from a bookmark
	self.getUrl = function (bookmark) {
		return "#" + $.param(bookmark.state);
	};

	// store the bookmarks to local storage or server
	self.storeBookmarks = function () {
		localStorage.setItem("marco-bookmarks", JSON.stringify(self.bookmarksList()));
	};

	// method for loading existing bookmarks
	self.getBookmarks = function () {
		var existingBookmarks = localStorage.getItem("marco-bookmarks");
		if (existingBookmarks) {
			self.bookmarksList = ko.observableArray(JSON.parse(existingBookmarks));
		}
	}

	self.cancel = function () {
		$('#bookmark-popover').hide();
	}

	// load the bookmarks
	self.getBookmarks();

	return self;
}


function viewModel() {
	var self = this;

	// list of active layermodels
	self.activeLayers = ko.observableArray();

	// reference to active theme model
	self.activeTheme = ko.observable();

	// list of theme models
	self.themes = [];

	// index for filter autocomplete and lookups
	self.layerIndex = {};

	// viewmodel for bookmarks
	self.bookmarks = new bookmarkModel();

	// set the error type
	// can be one of:
	// 	restoreState
	self.error = ko.observable();
    self.clearError = function () {
    	self.error(null);
    };

    //show Legend by default
    self.showLegend = ko.observable(false);
    self.toggleLegend = function () {
    	self.showLegend(! self.showLegend());
    	app.map.render('map');
    };

	// show bookmark stuff
	self.showBookmarks = function (self, event) {
		var $button = $(event.target),
			$popover = $('#bookmark-popover');

		if ($popover.is(":visible")) {
			$popover.hide();
		} else {
			self.bookmarks.bookmarkName(null);
			//TODO: move all this into bookmarks model
			// hide the popover if already visible
			$popover.show().position({
				"my": "right middle",
				"at": "left middle",
				"of": $button
			});

		}
	};


	// show coords info in pointer
	self.showPointerInfo = ko.observable(false);
	self.togglePointerInfo = function () {
		self.showPointerInfo(!self.showPointerInfo());
	};


	// load layers from fixture or the server
	self.loadLayers = function (data) {

		// load layers
		$.each(data.layers, function (i, layer) {
			var layerViewModel = new layerModel(layer);
			self.layerIndex[layer.id] = layerViewModel;
		});

		// load themes
		$.each(data.themes, function (i, theme) {
			var layers = [];
			$.each(theme.layers, function (j, layer_id) {
				// create a layerModel and add it to the list of layers
				layers.push(self.layerIndex[layer_id]);
			});
			self.themes.push(new themeModel(theme.name, layers));
		});
	};

	// handle the search form
	self.searchTerm = ko.observable();
	self.layerSearch = function () {
			
	};

	// do this stuff when the active layers change
	self.activeLayers.subscribe(function () {
		// initial index
		var index = 300;
		app.state.activeLayers = [];
		self.showLegend(false);
		$.each(self.activeLayers(), function (i, layer) {
			// set the zindex on the openlayers layer
			// layers at the beginning of activeLayers
			// are above those that are at the end
			// also save the layer state
            app.setLayerZIndex(layer, index);
			index--;
			if (layer.legend) {
				self.showLegend(true);
			}
		});

		// update the url hash
		app.updateUrl();
	});
    

	return self;
}
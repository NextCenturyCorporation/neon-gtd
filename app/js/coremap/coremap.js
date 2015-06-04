'use strict';
/*
 * Copyright 2013 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var coreMap = coreMap || {};

/**
 * Creates a new map component.
 * @class Map
 * @namespace coreMap

 * @param {String} elementId id of a div or span which the map component will replace.
 * @param {Object} opts A collection of optional key/value pairs used for configuration parameters:
 * <ul>
 *     <li>data - An array of data to display in the map</li>
 *     <li>width - The width of the map in pixels.</li>
 *     <li>height - The height of the map in pixels.</li>
 *     <li>latitudeMapping {function | String} - A way to map the data element to latitude.
 *     This could be a string name for a simple mapping or a function for a more complex one.</li>
 *     <li>longitudeMapping {function | String} - A way to map the data element to longitude.
 *     This could be a string name for a simple mapping or a function for a more complex one.</li>
 *     <li>sizeMapping {function | String} - A way to map the data element to size.
 *     This could be a string name for a simple mapping or a function for a more complex one.</li>
 *     <li>categoryMapping {function | String} - A way to map the data element to color.
 *     This could be a string name for a simple mapping or a function for a more complex one.</li>
 *     <li>defaultLayer {String} - The layer to display by default.
 *
 * </ul>
 *
 * @constructor
 *
 * @example
 *     var data = [
 *                 {"latitude": "50", "longitude": -100},
 *                 {"latitude": "-20", "longitude": 130
 *                ];
 *     var map = new coreMap.Map('map');
 *     map.setData(data);
 *     map.draw();
 *
 * @example
 *     var opts = {
 *            data: {[50,30,5], [20,-120,10]},
 *            latitudeMapping: function(element){ return element[0]; },
 *            longitudeMapping: function(element){ return element[1]; },
 *            sizeMapping: function(element){ return element[2]; }
 *                };
 *     var map = new coreMap.Map('map', opts);
 *     map.draw();
 *
 **/

coreMap.Map = function(elementId, opts) {
    opts = opts || {};

    this.elementId = elementId;
    this.selector = $("#" + elementId);

    // mapping of categories to colors
    this.colors = {};

    this.latitudeMapping = opts.latitudeMapping || coreMap.Map.DEFAULT_LATITUDE_MAPPING;
    this.longitudeMapping = opts.longitudeMapping || coreMap.Map.DEFAULT_LONGITUDE_MAPPING;
    this.sizeMapping = opts.sizeMapping || coreMap.Map.DEFAULT_SIZE_MAPPING;

    this.categoryMapping = opts.categoryMapping;
    this.onZoomRect = opts.onZoomRect;

    //this.colorScale = d3.scale.category20();
    this.colorRange = [
        '#39b54a',
        '#C23333',
        '#3662CC',
        "#ff7f0e",
        "#9467bd",
        "#8c564b",
        "#e377c2",
        "#7f7f7f",
        "#bcbd22",
        "#17becf",
        "#98df8a",
        "#ff9896",
        "#aec7e8",
        "#ffbb78",
        "#c5b0d5",
        "#c49c94",
        "#f7b6d2",
        "#c7c7c7",
        "#dbdb8d",
        "#9edae5"
    ];
    this.colorScale = d3.scale.ordinal().range(this.colorRange);
    this.responsive = true;

    if(opts.responsive === false) {
        this.responsive = false;
    }

    if(this.responsive) {
        this.resizeOnWindowResize();
    } else {
        this.width = opts.width || coreMap.Map.DEFAULT_WIDTH;
        this.height = opts.height || coreMap.Map.DEFAULT_HEIGHT;
    }

    this.selectableLayers = [];
    this.selectControls = [];

    this.defaultLayer = (opts.defaultLayer === coreMap.Map.HEATMAP_LAYER) ? coreMap.Map.HEATMAP_LAYER : coreMap.Map.POINTS_LAYER;

    this.initializeMap();
    this.setupLayers();
    this.setupControls();
    this.resetZoom();
};

coreMap.Map.DEFAULT_WIDTH = 1024;
coreMap.Map.DEFAULT_HEIGHT = 680;
coreMap.Map.MIN_HEIGHT = 200;
coreMap.Map.MIN_WIDTH = 200;
coreMap.Map.MIN_RADIUS = 3;
coreMap.Map.MAX_RADIUS = 13;
coreMap.Map.BOX_COLOR = "#39b54a";
coreMap.Map.BOX_WIDTH = 2;
coreMap.Map.BOX_OPACITY = 1;

coreMap.Map.SOURCE_PROJECTION = new OpenLayers.Projection("EPSG:4326");
coreMap.Map.DESTINATION_PROJECTION = new OpenLayers.Projection("EPSG:900913");

coreMap.Map.POINTS_LAYER = 'points';
coreMap.Map.HEATMAP_LAYER = 'heatmap';
coreMap.Map.CLUSTER_LAYER = 'cluster';

/**
 * Simple close handler to be called if a popup is closed.
 * @param Object evet A close event.
 * @private
 * @method onPopupClose
 */

var onPopupClose = function() {
    this.map.selectControl.unselect(this.feature);
};

coreMap.Map.prototype.resetSelectControl = function(layer) {
    // We remove the control before resetting the selectable layers
    // partly because select controls interfere with the behavior or map.removeLayer()
    // if they are active and contain multiple layers when one is removed.
    this.selectControl.deactivate();
    this.map.removeControl(this.selectControl);
    this.selectControl.setLayer(_.values(this.selectableLayers));
    this.map.addControl(this.selectControl);
    this.selectControl.activate();
};

coreMap.Map.prototype.addLayer = function(layer) {
    this.map.addLayer(layer);
    if(layer.CLASS_NAME === "coreMap.Map.Layer.PointsLayer")  {
        this.selectableLayers[layer.id] = layer;
        this.resetSelectControl();
    }
};

coreMap.Map.prototype.removeLayer = function(layer) {
    this.map.removeLayer(layer);
    if(this.selectableLayers[layer.id]) {
        this.resetSelectControl();
    }
};

/**
 * Draws the map data
 * @method draw
 * @deprecated
 */
coreMap.Map.prototype.draw = function() {
    // DEPRECATED.
};

/**
 * Resets the map. This clears all the data, zooms all the way out and centers the map.
 * @method reset
 */

coreMap.Map.prototype.reset = function() {
    this.map.selectControl.unSelectAll();
    this.setData([]);
    this.draw();
    this.resetZoom();
};

/**
 * Resets the map to zoom level 1 centered on latitude/longitude 0.0/0.0.
 * @method resetZoom
 */

coreMap.Map.prototype.resetZoom = function() {
    this.map.zoomToMaxExtent();
    this.map.setCenter(new OpenLayers.LonLat(0, 0), 1);
};

/**
 * Sets the map's data.
 * @param mapData the data to be set. This should be an array of points. The points may be specified
 * in any way, This component uses the mapping objects to map each array element to latitude, longitude, size and color.
 * @param {Array} An array of data objects to plot
 * @method setData
 */

coreMap.Map.prototype.setData = function(mapData) {
    this.data = mapData;
    this.updateRadii();
};

/**
 * Registers a listener for a particular map event.
 * @param {String} type A map event type.
 * @param {Object} obj An object that the listener should be registered on.
 * @param {Function} listener A function to be called when the event occurs.
 * @method register
 */

coreMap.Map.prototype.register = function(type, obj, listener) {
    this.map.events.register(type, obj, listener);
};

coreMap.Map.prototype.toggleCaching = function() {
    this.caching = !this.caching;
    if(this.caching) {
        this.cacheReader.deactivate();
        this.cacheWriter.activate();
    } else {
        this.cacheReader.activate();
        this.cacheWriter.deactivate();
    }
};

// clear the LocaleStorage used by the browser to store data for this.
coreMap.Map.prototype.clearCache = function() {
    OpenLayers.Control.CacheWrite.clearCache();
};

/**
 * Initializes the map.
 * @method initializeMap
 */

coreMap.Map.prototype.initializeMap = function() {
    OpenLayers.ProxyHost = "proxy.cgi?url=";
    $('#' + this.elementId).css({
        width: this.width,
        height: this.height
    });
    this.map = new OpenLayers.Map(this.elementId);
    this.configureFilterOnZoomRectangle();
};

coreMap.Map.prototype.configureFilterOnZoomRectangle = function() {
    var me = this;
    var control = new OpenLayers.Control();
    // this is copied from the OpenLayers.Control.ZoomBox, but that doesn't provide a way to hook in, so we had to copy
    // it here to provide a callback after zooming
    OpenLayers.Util.extend(control, {
        draw: function() {
            // this Key Handler is works in conjunctions with the Box handler below.  It detects when the user
            // has depressed the shift key and tells the map to update its sizing.  This is a work around for
            // zoomboxes being drawn in incorrect locations.  If any dom element higher in the page than a
            // map changes height to reposition the map, the next time a user tries to draw a rectangle, it does
            // not appear under the mouse cursor.  Rather, it is incorrectly drawn in proportion to the
            // height change in other dom elements.  This forces a the map to recalculate its size on the key event
            // that occurs just prior to the zoombox being drawn.  This may also trigger on other random shift-clicks
            // but does not appears performant enough in a map that displays a few hundred thousand points.
            this.keyHandler = new OpenLayers.Handler.Keyboard(control, {
                keydown: function(event) {
                    if(event.keyCode === 16 && !this.waitingForShiftUp) {
                        this.map.updateSize();
                        this.waitingForShiftUp = true;
                    }
                },
                keyup: function(event) {
                    if(event.keyCode === 16 && this.waitingForShiftUp) {
                        this.waitingForShiftUp = false;
                    }
                }
            });
            this.keyHandler.activate();

            // this Handler.Box will intercept the shift-mousedown
            // before Control.MouseDefault gets to see it
            this.box = new OpenLayers.Handler.Box(control, {
                done: this.notice
            }, {
                keyMask: OpenLayers.Handler.MOD_SHIFT
            });
            this.box.activate();
        },

        notice: function(position) {
            if(position instanceof OpenLayers.Bounds) {
                var bounds;
                var targetCenterPx = position.getCenterPixel();
                if(!this.out) {
                    var minXY = this.map.getLonLatFromPixel({
                        x: position.left,
                        y: position.bottom
                    });
                    var maxXY = this.map.getLonLatFromPixel({
                        x: position.right,
                        y: position.top
                    });
                    bounds = new OpenLayers.Bounds(minXY.lon, minXY.lat,
                        maxXY.lon, maxXY.lat);
                } else {
                    var pixWidth = position.right - position.left;
                    var pixHeight = position.bottom - position.top;
                    var zoomFactor = Math.min((this.map.size.h / pixHeight),
                        (this.map.size.w / pixWidth));
                    var extent = this.map.getExtent();
                    var center = this.map.getLonLatFromPixel(targetCenterPx);
                    var xmin = center.lon - (extent.getWidth() / 2) * zoomFactor;
                    var xmax = center.lon + (extent.getWidth() / 2) * zoomFactor;
                    var ymin = center.lat - (extent.getHeight() / 2) * zoomFactor;
                    var ymax = center.lat + (extent.getHeight() / 2) * zoomFactor;
                    bounds = new OpenLayers.Bounds(xmin, ymin, xmax, ymax);
                }
                // always zoom in/out
                var lastZoom = this.map.getZoom();
                var size = this.map.getSize();
                var centerPx = {
                    x: size.w / 2,
                    y: size.h / 2
                };
                var zoom = this.map.getZoomForExtent(bounds);
                var oldRes = this.map.getResolution();
                var newRes = this.map.getResolutionForZoom(zoom);
                if(oldRes === newRes) {
                    this.map.setCenter(this.map.getLonLatFromPixel(targetCenterPx));
                } else {
                    var zoomOriginPx = {
                        x: (oldRes * targetCenterPx.x - newRes * centerPx.x) /
                            (oldRes - newRes),
                        y: (oldRes * targetCenterPx.y - newRes * centerPx.y) /
                            (oldRes - newRes)
                    };
                    this.map.zoomTo(zoom, zoomOriginPx);
                }
                if(lastZoom === this.map.getZoom() && this.alwaysZoom === true) {
                    this.map.zoomTo(lastZoom + (this.out ? -1 : 1));
                }
                if(me.onZoomRect) {
                    // switch destination and source here since we're projecting back into lat/lon
                    me.onZoomRect.call(me, bounds.transform(coreMap.Map.DESTINATION_PROJECTION, coreMap.Map.SOURCE_PROJECTION));
                }
            }
        }
    });
    this.map.addControl(control);
};

coreMap.Map.prototype.createSelectControl =  function(layer) {
    var me = this;
    var onFeatureSelect = function(feature) {
        XDATA.userALE.log({
            activity: "show",
            action: "click",
            elementId: "map",
            elementType: "tooltip",
            elementGroup: "map_group",
            source: "user",
            tags: ["map", "tooltip"]
        });
        var text = '<div><table class="table table-striped table-condensed">';
        var attributes;

        // If we're on a cluster layer and have a cluster of 1, just show the attributes of the 1 item.
        if(feature.cluster && feature.cluster.length === 1) {
            attributes = feature.cluster[0].attributes;
        } else {
            attributes = feature.attributes;
        }

        for(var key in attributes) {
            if(Object.prototype.hasOwnProperty.call(attributes, key)) {
                text += '<tr><th>' + _.escape(key) + '</th><td>' + _.escape(attributes[key]) + '</td>';
            }
        }
        text += '</table></div>';

        me.featurePopup = new OpenLayers.Popup.FramedCloud("Data",
            feature.geometry.getBounds().getCenterLonLat(),
            null,
            text,
            null,
            false,
            onPopupClose);
        me.map.addPopup(me.featurePopup);
    };

    var onFeatureUnselect = function(feature) {
        XDATA.userALE.log({
            activity: "hide",
            action: "click",
            elementId: "map",
            elementType: "tooltip",
            elementGroup: "map_group",
            source: "user",
            tags: ["map", "tooltip"]
        });

        if(me.featurePopup) {
            me.map.removePopup(me.featurePopup);
            me.featurePopup.destroy();
            me.featurePopup = null;
        }
    };

    return new OpenLayers.Control.SelectFeature(layer, {
        autoActivate: true,
        onSelect: onFeatureSelect,
        onUnselect: onFeatureUnselect
    });
};

/**
 * Initializes the map layers and adds the base layer.
 * @method setupLayers
 */

coreMap.Map.prototype.setupLayers = function() {
    var baseLayer = new OpenLayers.Layer.OSM("OSM", null, {
        wrapDateLine: false
    });
    this.map.addLayer(baseLayer);

    // lets clients draw boxes on the map
    this.boxLayer = new OpenLayers.Layer.Boxes('Filter Box', {
        visibility: true,
        displayInLayerSwitcher: false
    });
    this.map.addLayer(this.boxLayer);
};

coreMap.Map.prototype.setupControls = function() {
    this.zoomControl = new OpenLayers.Control.Zoom({
        autoActivate: true
    });
    this.switcher = new OpenLayers.Control.LayerSwitcher({
        autoActivate: true,
        ascending: false
    });

    // Create a cache reader and writer.  Use default reader
    // settings to read from cache first.
    this.cacheReader = new OpenLayers.Control.CacheRead({
        autoActivate: false
    });

    this.cacheWriter = new OpenLayers.Control.CacheWrite({
        autoActivate: false,
        imageFormat: "image/png",
        eventListeners: {
            cachefull: function() {
                alert("Cache Full.  Re-enable caching to clear the cache and start building a new set");
                this.toggleCaching();
            }
        }
    });

    this.selectControl = this.createSelectControl([]);
    this.map.addControls([
        this.zoomControl, this.switcher,
        this.cacheReader, this.cacheWriter, this.selectControl
    ]);
}

/**
 * Draws a box with the specified bounds
 * @param {Object} bounds An object with 4 parameters, left, bottom, right and top
 * @return {Object} The object representing the box so it can be removed
 */
coreMap.Map.prototype.drawBox = function(bounds) {
    var box = new OpenLayers.Marker.Box(
        new OpenLayers.Bounds(bounds.left, bounds.bottom, bounds.right, bounds.top)
        .transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION),
            coreMap.Map.BOX_COLOR, coreMap.Map.BOX_WIDTH);
    box.div.style.opacity = coreMap.Map.BOX_OPACITY;
    this.boxLayer.addMarker(box);
    return box;
};

/**
 * Removes the box that was added with drawBox
 * @param box
 */
coreMap.Map.prototype.removeBox = function(box) {
    this.boxLayer.removeMarker(box);
};

/**
 * Zooms to the specified bounding rectangle
 * @param {Object} bounds An object with 4 parameters, left, bottom, right and top
 */
coreMap.Map.prototype.zoomToBounds = function(bounds) {
    var boundsObject = new OpenLayers.Bounds(bounds.left, bounds.bottom, bounds.right, bounds.top);
    this.map.zoomToExtent(boundsObject.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION));
};

/**
 * Resize the map to its element size. Adjust the heatmap canvas to match.  This should be called
 * when the window resizes on the containing element resizes
 */
coreMap.Map.prototype.resizeToElement = function() {
    this.width = Math.max(this.selector.width() || coreMap.Map.MIN_WIDTH);
    this.height = Math.max(this.selector.height() || coreMap.Map.MIN_HEIGHT);
    this.selector.css({
        width: this.width + 'px',
        height: this.height + 'px'
    });

    // The map may resize multiple times if a browser resize event is triggered.  In this case,
    // openlayers elements may have updated before our this method.  In that case, calling
    // updateSize() is a no-op and will not recenter or redraw our heatmap layer.  To get around
    // this we shift the view by a pixel and recenter.
    if(this.width !== this.map.getSize().w || this.height !== this.map.getSize().h) {
        this.map.updateSize();
    } else {
        this.map.pan(1, 1);
        this.map.setCenter(this.map.getCachedCenter());
    }
};

/**
 * Add a resize listener on the window to redraw the map
 * @method redrawOnResize
 */
coreMap.Map.prototype.resizeOnWindowResize = function() {
    var me = this;
    $(window).resize(function() {
        setTimeout(me.resizeToElement(), 1000);
    });
};

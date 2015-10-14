
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
 *     <li>width - The width of the map in pixels.</li>
 *     <li>height - The height of the map in pixels.</li>
 *     <li>onZoomRect - A zoom handler that will be called when the user selects an area to which
 *     to zoom and a zoom rectangle is displayed.<li>
 * </ul>
 *
 * @constructor
 *
 * @example
 *     var map = new coreMap.Map('map');
 *
 * @example
 *     var opts = {
 *            latitudeMapping: function(element){ return element[0]; },
 *            longitudeMapping: function(element){ return element[1]; },
 *            sizeMapping: function(element){ return element[2]; }
 *     };
 *     var map = new coreMap.Map('map', opts);
 *
 **/

coreMap.Map = function(elementId, opts) {
    opts = opts || {};

    this.elementId = elementId;
    this.selector = $("#" + elementId);
    this.onZoomRect = opts.onZoomRect;
    this.responsive = opts.responsive;
    this.popupsService = {};

    if(this.responsive) {
        this.resizeOnWindowResize();
    } else {
        this.width = opts.width || coreMap.Map.DEFAULT_WIDTH;
        this.height = opts.height || coreMap.Map.DEFAULT_HEIGHT;
    }

    this.selectableLayers = [];
    this.selectControls = [];
    this.initializeMap();
    this.setupLayers();
    this.setupControls();
    this.resetZoom();
};

coreMap.Map.DEFAULT_WIDTH = 1024;
coreMap.Map.DEFAULT_HEIGHT = 680;
coreMap.Map.MIN_HEIGHT = 200;
coreMap.Map.MIN_WIDTH = 200;
coreMap.Map.BOX_COLOR = "#f20101";
coreMap.Map.BOX_WIDTH = 4;
coreMap.Map.BOX_OPACITY = 0.9;

coreMap.Map.SOURCE_PROJECTION = new OpenLayers.Projection("EPSG:4326");
coreMap.Map.DESTINATION_PROJECTION = new OpenLayers.Projection("EPSG:900913");

coreMap.Map.POINTS_LAYER = 'points';
coreMap.Map.HEATMAP_LAYER = 'heatmap';
coreMap.Map.CLUSTER_LAYER = 'cluster';
coreMap.Map.NODE_LAYER = 'node';

// Dark Background Color = #242426
coreMap.Map.DARK_MAP_TILES = "http://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png";
// Light Background Color = #CDD2D4
coreMap.Map.LIGHT_MAP_TILES = "http://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png";

/**
 * Resets the select control by temporarily removing it from the map
 * before syncing to the current list of selectable layers.
 * @method removeLayer
 */
coreMap.Map.prototype.resetSelectControl = function() {
    // We remove the control before resetting the selectable layers
    // partly because select controls interfere with the behavior or map.removeLayer()
    // if they are active and contain multiple layers when one is removed.
    this.selectControl.deactivate();
    this.map.removeControl(this.selectControl);
    this.selectControl.setLayer(_.values(this.selectableLayers));
    this.map.addControl(this.selectControl);
    this.selectControl.activate();
};

/**
 * Adds a layer to the map and the layer select control if it's a
 * layer type supported by the control.
 * @param {Object} An OpenLayers layer object or variant.
 * @method addLayer
 */
coreMap.Map.prototype.addLayer = function(layer) {
    this.map.addLayer(layer);
    if(layer.CLASS_NAME === "coreMap.Map.Layer.PointsLayer" || layer.CLASS_NAME === "coreMap.Map.Layer.SelectedPointsLayer")  {
        this.selectableLayers[layer.id] = layer;
        this.resetSelectControl();
    }
};

/**
 * Returns layer from the map with the given property.
 * @param {String} property The name of the property to get the layer by.
 * @param {String | Object} value The value of the property for the OpenLayers layer object to search for.
 * @method getLayer
 * @return {Object} An OpenLayers layer object or variant or undefined if no layer with the given property value exists.
 */
coreMap.Map.prototype.getLayerBy = function(property, value) {
    var layers = this.map.getLayersBy(property, value);
    return layers.length ? layers[0] : undefined;
};

/**
 * Sets the visibility for a layer from the map with the given name.
 * @param {String} id The id of an OpenLayers layer.
 * @param {String} visibility The new visibility setting for the OpenLayers layer.
 * @method setLayerVisibility
 * @return {Object} An OpenLayers layer object or variant.
 */
coreMap.Map.prototype.setLayerVisibility = function(id, visibility) {
    var layer = this.getLayerBy("id", id);

    if(layer) {
        layer.setVisibility(visibility);
    }
};

/**
 * Removes a layer from the map and updates the select controls to
 * clean up any spurious layer popups.
 * @param {Object} An OpenLayers layer object or variant.
 * @method removeLayer
 */
coreMap.Map.prototype.removeLayer = function(layer) {
    this.map.removeLayer(layer);

    // Remove events that aren't destroyed on Heatmap Layer
    if(layer.CLASS_NAME === "coreMap.Map.Layer.HeatmapLayer") {
        this.unregister("zoomend", layer);
        this.unregister("moveend", layer);
    }

    if(this.selectableLayers[layer.id]) {
        this.resetSelectControl();
    }
};

/**
 * Resets the map. This clears all selection popups, zooms all the way out and centers the map.
 * @method reset
 */

coreMap.Map.prototype.reset = function() {
    this.map.selectControl.unSelectAll();
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
 * Registers a listener for a particular map event.
 * @param {String} type A map event type.
 * @param {Object} obj An object that the listener should be registered on.
 * @param {Function} listener A function to be called when the event occurs.
 * @method register
 */

coreMap.Map.prototype.register = function(type, obj, listener) {
    this.map.events.register(type, obj, listener);
};

/**
 * Unregisters a listener for a particular map event.
 * @param {String} type A map event type.
 * @param {Object} obj An object that the listener should be registered on.
 * @method unregister
 */

coreMap.Map.prototype.unregister = function(type, object) {
    for(var i = 0; i < this.map.events.listeners[type].length; i++) {
        var eventObj = this.map.events.listeners[type][i].obj;

        if(eventObj.id === object.id) {
            this.map.events.unregister(type, eventObj, this.map.events.listeners[type][i].func);
        }
    }
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

/**
 * Clear the LocaleStorage used by the browser to store data for this.
 */
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
    this.map.events.fallThrough = true;
    this.map.layerContainerDiv.style.removeProperty("z-index");
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
        var text;

        // If we're on a cluster layer, show specific fields, if defined
        if(feature.cluster && feature.layer.clusterPopupFields.length) {
            text = '<div><table class="table table-striped table-condensed table-bordered">';
            text += '<tr>';

            for(var i = 0; i < feature.layer.clusterPopupFields.length; i++) {
                text += '<th>' + feature.layer.clusterPopupFields[i] + '</th>';
            }

            text += '</tr>';

            for(i = 0; i < feature.cluster.length; i++) {
                text += '<tr>';

                for(var j = 0; j < feature.layer.clusterPopupFields.length; j++) {
                    var field = feature.layer.clusterPopupFields[j];
                    if(Object.prototype.hasOwnProperty.call(feature.cluster[i].attributes, field)) {
                        text += '<td>' + feature.cluster[i].attributes[field] + '</td>';
                    } else {
                        text += '<td></td>';
                    }
                }

                text += '</tr>';
            }
            text += '</table></div>';
        } else {
            var attributes;
            text = '<div><table class="table table-striped table-condensed">';

            // If we're on a cluster layer and have a cluster of 1, just show the attributes of the 1 item.
            if(feature.cluster && feature.cluster.length === 1) {
                attributes = feature.cluster[0].attributes;
            } else {
                attributes = feature.attributes;
            }

            Object.keys(attributes).forEach(function(attribute) {
                text += '<tr><th>' + _.escape(attribute) + '</th><td>' + attributes[attribute] + '</td>';
            });
            text += '</table></div>';
        }

        me.featurePopup = new OpenLayers.Popup.FramedCloud("Data",
            feature.geometry.getBounds().getCenterLonLat(),
            null,
            text,
            null,
            true,
            onFeatureUnselect);
        me.featurePopup.events.remove("click");
        me.map.addPopup(me.featurePopup, true);

        $(".olFramedCloudPopupContent td").linky(feature.layer.linkyConfig);

        if(me.popupsService.links && feature.layer.linksSource) {
            var key = me.popupsService.links.generatePointKey(attributes[feature.layer.latitudeMapping], attributes[feature.layer.longitudeMapping]);
            var tooltip = "latitude " + attributes[feature.layer.latitudeMapping] + ", longitude " + attributes[feature.layer.longitudeMapping];
            var link = me.popupsService.links.createLinkHtml(key, feature.layer.linksSource, tooltip);
            $("#" + me.elementId).find(".olPopupCloseBox").after("<div class='btn btn-default links-popup-button'>" + link + "</div>");
        }
    };

    var onFeatureUnselect = function() {
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
    var baseLayer = new OpenLayers.Layer.OSM("OSM", coreMap.Map.LIGHT_MAP_TILES, {
        attribution:  "Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.",
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
    this.map.addControls([this.zoomControl, this.cacheReader, this.cacheWriter, this.selectControl]);
};

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
 * Resize the map to its element size. This should be called
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
    // openlayers elements may have updated before this method.  In that case, calling
    // updateSize() is a no-op and will not recenter or redraw layers that render based upon
    // the current map extent.  To get around this we shift the view by a pixel and recenter.
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

/**
 * Reorders the given OpenLayers layers starting at the index of the first of the given layers.
 * @param {Array} layers
 * @method reorderLayers
 */
coreMap.Map.prototype.reorderLayers = function(layers) {
    if(!layers.length) {
        return;
    }

    var map = this.map;
    var startIndex = map.getLayerIndex(layers[0]);
    layers.forEach(function(layer) {
        startIndex = Math.min(startIndex, map.getLayerIndex(layer));
    });
    layers.forEach(function(layer) {
        map.setLayerIndex(layer, startIndex++);
    });
};

/**
 * Checks if all attributes in the given layer exist in the data
 * @param {Array} data Array of objects containing the layer data
 * @param {Object} layer OpenLayers layer for the data
 * @return {Boolean} True if all attributes in layer exist in the data, false otherwise.
 * @method doAttributesExist
 */
coreMap.Map.prototype.doAttributesExist = function(data, layer) {
    var allExist = true;

    _.forEach(data, function(el) {
        // Check for undefined because a value could exist in the layer and just be false.
        if(layer.areValuesInDataElement(el) === undefined) {
            allExist = false;
        }
    });

    return allExist;
};

'use strict';
/*
 * Copyright 2015 Next Century Corporation
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

coreMap.Map.Layer = coreMap.Map.HeatmapLayer || {};
/**
 * This module extends an OpenLayers 2 heatmap based upon the Heatmapjs
 * library (http://www.patrick-wied.at/static/heatmapjs/).
 *
 * @namespace coreMap.Map.Layer
 * @class HeatmapLayer
 * @constructor
 */
coreMap.Map.Layer.HeatmapLayer = OpenLayers.Class(OpenLayers.Layer.Heatmap, {
    CLASS_NAME: "coreMap.Map.Layer.HeatmapLayer",
    data: [],
    latitudeMapping: '',
    longitudeMapping: '',
    sizeMapping: '',
    gradients: [],

    /**
     * Override the OpenLayers Contructor
     */
    initialize: function(name, map, baseLayer, options) {
        var gradient = coreMap.Map.Layer.HeatmapLayer.DEFAULT_GRADIENT;
        if(options && options.gradients) {
            if(options.gradients.length === 2) {
                gradient = {
                    0: options.gradients[0],
                    1: options.gradients[1]
                };
            }
            if(options.gradients.length === 3) {
                gradient = {
                    0.33: options.gradients[0],
                    0.66: options.gradients[1],
                    1: options.gradients[2]
                };
            }
            if(options.gradients.length === 4) {
                gradient = {
                    0.25: options.gradients[0],
                    0.50: options.gradients[1],
                    0.75: options.gradients[2],
                    1: options.gradients[3]
                };
            }
            if(options.gradients.length === 5) {
                gradient = {
                    0.2: options.gradients[0],
                    0.4: options.gradients[1],
                    0.6: options.gradients[2],
                    0.8: options.gradients[3],
                    1: options.gradients[4]
                };
            }
        }

        var heatmapOptions = {
            visible: true,
            radius: coreMap.Map.Layer.HeatmapLayer.DEFAULT_RADIUS,
            minOpacity: (options && options.minOpacity) ? options.minOpacity : coreMap.Map.Layer.HeatmapLayer.DEFAULT_MIN_OPACITY,
            maxOpacity: (options && options.maxOpacity) ? options.maxOpacity : coreMap.Map.Layer.HeatmapLayer.DEFAULT_MAX_OPACITY,
            blur: (options && options.blur) ? options.blur : coreMap.Map.Layer.HeatmapLayer.DEFAULT_BLUR,
            gradient: gradient
        };
        heatmapOptions.maxOpacity = Math.max(heatmapOptions.minOpacity, heatmapOptions.maxOpacity);

        var extendOptions = options || {};
        extendOptions.baseLayer = false;
        extendOptions.projection = new OpenLayers.Projection("EPSG:4326");
        extendOptions.opacity = 0.3;

        // Call the super constructor, you will have to define the variables geometry, attributes and style
        var args = [name, map, baseLayer, heatmapOptions, extendOptions];
        OpenLayers.Layer.Heatmap.prototype.initialize.apply(this, args);

        // Let OpenLayers know the display of this layer is not scale-dependent by setting "always in range"
        // to true.  We want the later to be active at any map scale.
        this.alwaysInRange = true;

        // When we are added to a map, add a resize handler on the map so we know when to rerender
        // our canvas.
        this.events.register('added', this, function() {
            var me = this;

            this.resizeHandler = function() {
                me.heatmap._renderer.setDimensions(this.getSize().w, this.getSize().h);
                if(me.data.length) {
                    me.updateLayer();
                }
            };
            this.map.events.register('updatesize', this.map, this.resizeHandler);
        });

        // When we are removed from a map, clean up our resize handler.
        this.events.register('removed', this, function(event) {
            event.map.events.unregister('updatesize', event.map, this.resizeHandler);
        });
    },
    destroy: function() {
        // for now, nothing special to do here.
        OpenLayers.Layer.Heatmap.prototype.destroy.apply(this, arguments);
    }
});

/**
 * Checks if the mappings exist in the data element
 * @param {Object} element An element of the data array.
 * @return {Boolean} True if element contains all the mappings, false otherwise
 * @method areValuesInDataElement
 */
coreMap.Map.Layer.HeatmapLayer.prototype.areValuesInDataElement = function(element) {
    if(neon.helpers.getValues(element, this.latitudeMapping).length && neon.helpers.getValues(element, this.longitudeMapping).length) {
        return true;
    }

    return false;
};

coreMap.Map.Layer.HeatmapLayer.prototype.setData = function(data, limit) {
    this.data = data;
    this.updateFeatures(limit);
};

/**
 * Creates a point to be added to the heatmap layer.
 * @param {Number} size The size value of the data element.
 * @param {Number} longitude The longitude value of the data element
 * @param {Number} latitude The latitude value of the data element.
 * @return {Object} an object containing the location and value for the heatmap.
 * @method createHeatmapDataPoint
 */
coreMap.Map.Layer.HeatmapLayer.prototype.createHeatmapDataPoint = function(size, longitude, latitude) {
    var point = new OpenLayers.LonLat(longitude, latitude);

    return {
        lonlat: point,
        value: size
    };
};

coreMap.Map.Layer.HeatmapLayer.prototype.updateFeatures = function(limit) {
    var mapData = [];

    // Extra fields to collect in addition to the longitude & latitude (X & Y) fields.
    var fields = {
        size: this.sizeMapping
    };

    var points = neon.helpers.getPoints(this.data, this.longitudeMapping, this.latitudeMapping, fields);
    this.pointTotal = points.length;
    this.pointLimit = limit;

    var me = this;

    // Use the helper function to collect the longitude & latitude (X & Y) coordinates from the data for the points.
    points.slice(0, limit).forEach(function(point) {
        if($.isNumeric(point.x) && $.isNumeric(point.y)) {
            // If the size field contains an array of numbers, arbitrarily take the smallest.
            // TODO What should be the default value of the size?  Currently it looks like undefined is acceptable.
            var size = _.isArray(point.size) ? point.size.sort()[0] : point.size;
            mapData.push(me.createHeatmapDataPoint(size, point.x, point.y));
        }
    });

    this.setDataSet({
        max: 1,
        data: mapData
    });
};

coreMap.Map.Layer.HeatmapLayer.DEFAULT_BLUR = 0.85;
coreMap.Map.Layer.HeatmapLayer.DEFAULT_LATITUDE_MAPPING = "latitude";
coreMap.Map.Layer.HeatmapLayer.DEFAULT_LONGITUDE_MAPPING = "longitude";
coreMap.Map.Layer.HeatmapLayer.DEFAULT_MAX_OPACITY = 0.8;
coreMap.Map.Layer.HeatmapLayer.DEFAULT_MIN_OPACITY = 0.3;
coreMap.Map.Layer.HeatmapLayer.DEFAULT_RADIUS = 10;

coreMap.Map.Layer.HeatmapLayer.DEFAULT_GRADIENT = {
    0.2: "blue",
    0.4: "green",
    0.6: "yellow",
    0.8: "orange",
    1.0: "red"
};

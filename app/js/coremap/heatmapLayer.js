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

    /**
     * Override the OpenLayers Contructor
     */
    initialize: function(name, map, baseLayer, options) {
        // Override the style for our specialization.
        var heatmapOptions = {
            visible: true,
            radius: coreMap.Map.Layer.HeatmapLayer.DEFAULT_RADIUS,
            minOpacity: coreMap.Map.Layer.HeatmapLayer.DEFAULT_MIN_OPACITY,
            maxOpacity: coreMap.Map.Layer.HeatmapLayer.DEFAULT_MAX_OPACITY,
            blur: coreMap.Map.Layer.HeatmapLayer.DEFAULT_BLUR,
            valueField: coreMap.Map.Layer.HeatmapLayer.DEFAULT_INTENSITY_MAPPING
        };
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
                me.updateLayer();
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
 * Gets a value from a data element using a mapping string or function.
 * @param {String | Function} mapping The mapping from data element object to value.
 * @param {Object} element An element of the data array.
 * @return The value in the data element.
 * @method getValueFromDataElement
 */
coreMap.Map.Layer.HeatmapLayer.prototype.getValueFromDataElement = function(mapping, element) {
    if(typeof mapping === 'function') {
        return mapping.call(this, element);
    }
    return element[mapping];
};

coreMap.Map.Layer.HeatmapLayer.prototype.setData = function(data) {
    this.data = data;
    this.updateFeatures();
};

/**
 * Creates a point to be added to the heatmap layer.
 * @param {Object} element One data element of the map's data array.
 * @param {number} longitude The longitude value of the data element
 * @param {number} latitude The latitude value of the data element.
 * @return {Object} an object containing the location and count for the heatmap.
 * @method createHeatmapDataPoint
 */
coreMap.Map.Layer.HeatmapLayer.prototype.createHeatmapDataPoint = function(element, longitude, latitude) {
    var count = this.getValueFromDataElement(this.sizeMapping, element);
    var point = new OpenLayers.LonLat(longitude, latitude);

    return {
        lonlat: point,
        count: count
    };
};

coreMap.Map.Layer.HeatmapLayer.prototype.updateFeatures = function() {
    var mapData = [];
    var me = this;
    _.each(this.data, function(element) {
        var longitude = me.getValueFromDataElement(me.longitudeMapping, element);
        var latitude = me.getValueFromDataElement(me.latitudeMapping, element);

        if($.isNumeric(latitude) && $.isNumeric(longitude)) {
            mapData.push(me.createHeatmapDataPoint(element, longitude, latitude));
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
coreMap.Map.Layer.HeatmapLayer.DEFAULT_INTENSITY_MAPPING = "count";

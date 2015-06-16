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

coreMap.Map.Layer = coreMap.Map.Layer || {};
/**
 * This module extend an OpenLayers 2 Vector Layer to create a map layer of points.  Each point
 * can is made from a data array that is passed in via setData() and can be colored by a
 * category field in the data array or sized by a particular field in each point's data array
 * By default, all points are displayed.  However, the layer can be configured to cluster points.
 * Visually, this will collect points within a certain pixel range of one another and display
 * a count bubble representing the number of points in a given area.  As a user zoom's in on a map,
 * the bubbles may begin to separate.
 *
 * @namespace coreMap.Map.Layer
 * @class PointsLayer
 * @constructor
 */
coreMap.Map.Layer.PointsLayer = OpenLayers.Class(OpenLayers.Layer.Vector, {
    CLASS_NAME: "coreMap.Map.Layer.PointsLayer",
    colors: {},
    data: [],
    latitudeMapping: '',
    longitudeMapping: '',
    sizeMapping: '',
    defaultColor: '',
    colorMapping: '',
    categoryMapping: '',
    cluster: false,

    /**
     * Override the OpenLayers Contructor
     */
    initialize: function(name, options) {
        // Override the style for our specialization.
        var me = this;
        var extendOptions = options || {};
        extendOptions.styleMap = (options.cluster) ? this.createClusterStyle() : this.createPointsStyleMap();

        // Set the clustering strategy if necessary.
        if(options.cluster) {
            var ClusterClass = new OpenLayers.Class(OpenLayers.Strategy.Cluster, {
                attribute: null,
                shouldCluster: function(cluster, feature) {
                    var clusterVal = cluster.cluster[0].attributes[me.categoryMapping];
                    var featureVal = feature.attributes[me.categoryMapping];
                    var superProto = OpenLayers.Strategy.Cluster.prototype;
                    return (clusterVal === featureVal && superProto.shouldCluster.apply(this, arguments));
                },
                CLASS_NAME: "OpenLayers.Strategy.AttributeCluster"
            });
            extendOptions.strategies = [
                new ClusterClass({
                    distance: 40,
                    attribute: this.categoryMapping
                })
            ];
        }

        // Call the super constructor, you will have to define the variables geometry, attributes and style
        var args = [name, extendOptions];
        OpenLayers.Layer.Vector.prototype.initialize.apply(this, args);

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
        this.visibility = true;
        this.colorScale = d3.scale.ordinal().range(this.colorRange);
    },

    createClusterStyle: function() {
        var layer = this;
        var clusterPointStyle = new OpenLayers.Style({
            label: "${count}",
            fillColor: "${fillColor}",
            fillOpacity: 0.8,
            strokeOpacity: 0.8,
            strokeWidth: "${strokeWidth}",
            pointRadius: "${radius}"
        }, {
            context: {
                strokeWidth: function(feature) {
                    return (feature.cluster.length > 1) ? 2 : 1;
                },
                fillColor: function(feature) {
                    return (layer.calculateColor(feature.cluster[0].attributes));
                },
                radius: function(feature) {
                    var digits = 1;
                    var count = feature.cluster.length;
                    while((count = count / 10) >= 1) {
                        digits++;
                    }
                    return 5 + (5 * digits);
                },
                count: function(feature) {
                    return feature.cluster.length;
                }
            }
        });
        return new OpenLayers.StyleMap({
            default: clusterPointStyle
        });
    },

    createPointsStyleMap: function() {
        return new OpenLayers.StyleMap(OpenLayers.Util.applyDefaults({
                fillColor: "#00FF00",
                fillOpacity: 0.8,
                strokeOpacity: 0.8,
                strokeWidth: 1,
                pointRadius: 4
            },
            OpenLayers.Feature.Vector.style["default"]
        ));
    }
});

/**
 * Calculate the desired color of a point.
 * @param {Object} element One data element of the map's data array.
 * @return {String} The color
 * @method calculateColor
 */
coreMap.Map.Layer.PointsLayer.prototype.calculateColor = function(element) {
    var category = this.getValueFromDataElement(this.categoryMapping, element);
    var color;

    if(category) {
        color = this.colorScale(category);
    } else {
        category = '(Uncategorized)';
        color = this.defaultColor || coreMap.Map.Layer.PointsLayer.DEFAULT_COLOR;
    }

    // store the color in the registry so we know the color/category mappings
    if(!(this.colors.hasOwnProperty(category))) {
        this.colors[category] = color;
    }

    return color;
};

/**
 * Calculate the radius of the largest element in the data
 * @return {number} The maximum value in the data
 * @method calculateMaxRadius
 */
coreMap.Map.Layer.PointsLayer.prototype.calculateMaxRadius = function() {
    var me = this;
    return d3.max(me.data, function(el) {
        return me.getValueFromDataElement(me.sizeMapping, el);
    });
};

/**
 * Calculate the radius of the smallest element in the data
 * @return {number} The minimum value in the data
 * @method calculateMinRadius
 */
coreMap.Map.Layer.PointsLayer.prototype.calculateMinRadius = function() {
    var me = this;
    return d3.min(me.data, function(el) {
        return me.getValueFromDataElement(me.sizeMapping, el);
    });
};

/**
 * Calculate the desired radius of a point.  This will be a proporation of the
 * allowed coreMap.Map.Layer.PointsLayer.MIN_RADIUS and coreMap.Map.Layer.PointsLayer.MAX_RADIUS values.
 * @param {Object} element One data element of the map's data array.
 * @return {number} The radius
 * @method calculateRadius
 */
coreMap.Map.Layer.PointsLayer.prototype.calculateRadius = function(element) {
    var dataVal = this.getValueFromDataElement(this.sizeMapping, element);
    var percentOfDataRange = (dataVal - this.minRadius) / this._dataRadiusDiff;
    return coreMap.Map.Layer.PointsLayer.MIN_RADIUS + (percentOfDataRange * this._baseRadiusDiff);
};

/**
 * Creates a point to be added to the points layer, styled appropriately.
 * @param {Object} element One data element of the map's data array.
 * @param {number} longitude The longitude value of the data element
 * @param {number} latitude The latitude value of the data element.
 * @return {OpenLayers.Feature.Vector} the point to be added.
 * @method createPoint
 */
coreMap.Map.Layer.PointsLayer.prototype.createPoint = function(element, longitude, latitude) {
    var point = new OpenLayers.Geometry.Point(longitude, latitude);
    point.data = element;
    point.transform(coreMap.Map.Layer.PointsLayer.SOURCE_PROJECTION, coreMap.Map.Layer.PointsLayer.DESTINATION_PROJECTION);

    var feature = new OpenLayers.Feature.Vector(point);
    feature.style = this.stylePoint(element);
    feature.attributes = element;
    return feature;
};

/**
 * Creates the style object for a point
 * @param {String} color The color of the point
 * @param {number} radius The radius of the point
 * @return {OpenLayers.Symbolizer.Point} The style object
 * @method createPointStyleObject
 */
coreMap.Map.Layer.PointsLayer.prototype.createPointStyleObject = function(color, radius) {
    color = color || coreMap.Map.Layer.PointsLayer.DEFAULT_COLOR;
    radius = radius || coreMap.Map.Layer.PointsLayer.MIN_RADIUS;

    return new OpenLayers.Symbolizer.Point({
        fillColor: color,
        fillOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
        strokeOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
        strokeWidth: coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_WIDTH,
        stroke: coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_COLOR,
        pointRadius: radius
    });
};

/**
 * Gets a value from a data element using a mapping string or function.
 * @param {String | Function} mapping The mapping from data element object to value.
 * @param {Object} element An element of the data array.
 * @return The value in the data element.
 * @method getValueFromDataElement
 */
coreMap.Map.Layer.PointsLayer.prototype.getValueFromDataElement = function(mapping, element) {
    if(typeof mapping === 'function') {
        return mapping.call(this, element);
    }
    return element[mapping];
};

/**
 * Styles the data element based on the size and color.
 * @param {Object} element One data element of the map's data array.
 * @return {OpenLayers.Symbolizer.Point} The style object
 * @method stylePoint
 */
coreMap.Map.Layer.PointsLayer.prototype.stylePoint = function(element) {
    var radius = this.calculateRadius(element);
    var color = this.calculateColor(element);

    return this.createPointStyleObject(color, radius);
};

coreMap.Map.Layer.PointsLayer.prototype.setData = function(data) {
    this.data = data;
    this.updateRadii();
    this.updateFeatures();
};

coreMap.Map.Layer.PointsLayer.prototype.updateFeatures = function() {
    var mapData = [];
    var me = this;
    _.each(this.data, function(element) {
        var longitude = me.getValueFromDataElement(me.longitudeMapping, element);
        var latitude = me.getValueFromDataElement(me.latitudeMapping, element);

        if($.isNumeric(latitude) && $.isNumeric(longitude)) {
            mapData.push(me.createPoint(element, longitude, latitude));
        }
    });
    //this.removeAllFeatures();
    this.destroyFeatures();
    this.addFeatures(mapData);
};

/**
 * Updates the internal min/max radii values for the point layer.  These values are simply
 * the minimum and maximum values of the sizeMapping in the current data set.  They will be
 * mapped linearly to the range of allowed sizes between coreMap.Map.Layer.PointsLayer.MIN_RADIUS and
 * coreMap.Map.Layer.PointsLayer.MAX_RADIUS.  This function should be called after new data is set to ensure
 * correct display.
 * @method updateRadii
 */
coreMap.Map.Layer.PointsLayer.prototype.updateRadii = function() {
    this.minRadius = this.calculateMinRadius();
    this.maxRadius = this.calculateMaxRadius();
    this._baseRadiusDiff = coreMap.Map.Layer.PointsLayer.MAX_RADIUS - coreMap.Map.Layer.PointsLayer.MIN_RADIUS;
    this._dataRadiusDiff = this.maxRadius - this.minRadius;
};

coreMap.Map.Layer.PointsLayer.DEFAULT_LATITUDE_MAPPING = "latitude";
coreMap.Map.Layer.PointsLayer.DEFAULT_LONGITUDE_MAPPING = "longitude";
coreMap.Map.Layer.PointsLayer.DEFAULT_SIZE_MAPPING = "count_";

coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY = 0.8;
coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_WIDTH = 1;
coreMap.Map.Layer.PointsLayer.DEFAULT_COLOR = "#00ff00";
coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_COLOR = "#ffffff";
coreMap.Map.Layer.PointsLayer.MIN_RADIUS = 3;
coreMap.Map.Layer.PointsLayer.MAX_RADIUS = 13;

// TODO: Keep these here or move back into coreMap?
coreMap.Map.Layer.PointsLayer.SOURCE_PROJECTION = new OpenLayers.Projection("EPSG:4326");
coreMap.Map.Layer.PointsLayer.DESTINATION_PROJECTION = new OpenLayers.Projection("EPSG:900913");

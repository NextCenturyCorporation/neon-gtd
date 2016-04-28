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
    database: '',
    table: '',
    latitudeMapping: '',
    longitudeMapping: '',
    sizeMapping: '',
    defaultColor: '',
    categoryMapping: '',
    dateMapping: '',
    applyTransientDateFilter: false,
    gradient: false,
    cluster: false,
    linkyConfig: {
        mentions: false,
        hashtags: false,
        urls: false,
        linkTo: "twitter"
    },
    clusterPopupFields: [],
    linksSource: "",

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
            this.ClusterClass = new OpenLayers.Class(OpenLayers.Strategy.Cluster, {
                attribute: null,
                shouldCluster: function(cluster, feature) {
                    var clusterValue = neon.helpers.getValues(cluster.cluster[0].attributes, me.categoryMapping);
                    var featureValue = neon.helpers.getValues(feature.attributes, me.categoryMapping);
                    var superProto = OpenLayers.Strategy.Cluster.prototype;
                    return (_.isEqual(clusterValue, featureValue) && superProto.shouldCluster.apply(this, arguments));
                },
                CLASS_NAME: "OpenLayers.Strategy.AttributeCluster"
            });
            this.clusterStrategy = new this.ClusterClass({
                distance: coreMap.Map.Layer.PointsLayer.DEFAULT_CLUSTER_DISTANCE,
                attribute: this.categoryMapping
            });
            extendOptions.strategies = [this.clusterStrategy];
        } else {
            // Set a default date filter strategy.
            this.dateFilter = new OpenLayers.Filter.Comparison({
                type: OpenLayers.Filter.Comparison.BETWEEN,
                property: options.dateMapping || coreMap.Map.Layer.PointsLayer.DEFAULT_DATE_MAPPING,
                lowerBoundary: new Date("2015-05-10 00:00:00.000Z"),
                upperBoundary: new Date("2015-05-16 00:00:00.000Z")
            });
            this.dateFilterStrategy = new OpenLayers.Strategy.Filter({});
            extendOptions.strategies = [this.dateFilterStrategy];
            this.dateFilterStrategy.deactivate();
        }

        // Call the super constructor, you will have to define the variables geometry, attributes and style
        var args = [name, extendOptions];
        OpenLayers.Layer.Vector.prototype.initialize.apply(this, args);

        this.colors = this.options.colors || {};

        if(Object.keys(this.colors).length) {
            this.hasColorsConfigured = true;
        }

        this.visibility = true;
        this.colorScale = d3.scale.ordinal().range(neonColors.LIST);
    },

    createClusterStyle: function() {
        var layer = this;
        var clusterPointStyle = new OpenLayers.Style({
            label: "${count}",
            fillColor: "${fillColor}",
            fillOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
            strokeOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
            strokeWidth: "${strokeWidth}",
            pointRadius: "${radius}",
            cursor: coreMap.Map.Layer.PointsLayer.DEFAULT_CURSOR
        }, {
            context: {
                strokeWidth: function(feature) {
                    return coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_WIDTH ? ((feature.cluster.length > 1) ? 2 : 1) : 0;
                },
                fillColor: function(feature) {
                    return (layer.calculateColor(feature.cluster[0].attributes));
                },
                radius: function(feature) {
                    // Here, we are basing the size of the cluster on the number of
                    // digits in the total feature count.
                    var count = feature.cluster.length;
                    var digits = Math.log10(count);
                    digits = (digits >= 1) ? digits : 1;
                    return Math.floor(5 + (5 * digits));
                },
                count: function(feature) {
                    return feature.cluster.length;
                }
            }
        });
        var clusterPointStyleSelect = new OpenLayers.Style({
            label: "${count}",
            fillColor: coreMap.Map.Layer.PointsLayer.DEFAULT_SELECT_COLOR,
            fillOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_SELECT_OPACITY,
            strokeOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
            strokeWidth: "${strokeWidth}",
            pointRadius: "${radius}",
            cursor: coreMap.Map.Layer.PointsLayer.DEFAULT_CURSOR
        }, {
            context: {
                strokeWidth: function(feature) {
                    return coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_WIDTH ? ((feature.cluster.length > 1) ? 2 : 1) : 0;
                },
                radius: function(feature) {
                    // Here, we are basing the size of the cluster on the number of
                    // digits in the total feature count.
                    var count = feature.cluster.length;
                    var digits = Math.log10(count);
                    digits = (digits >= 1) ? digits : 1;
                    return Math.floor(5 + (5 * digits)) * 1.5;
                },
                count: function(feature) {
                    return feature.cluster.length;
                }
            }
        });

        return new OpenLayers.StyleMap({
            default: clusterPointStyle,
            select: clusterPointStyleSelect
        });
    },

    createPointsStyleMap: function() {
        var layer = this;
        var pointStyle = new OpenLayers.Style({
            fillColor: "${fillColor}",
            fillOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
            strokeOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
            strokeWidth: coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_WIDTH,
            stroke: coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_COLOR,
            pointRadius: "${radius}",
            cursor: coreMap.Map.Layer.PointsLayer.DEFAULT_CURSOR
        }, {
            context: {
                fillColor: function(feature) {
                    return (layer.calculateColor(feature.attributes) || neonColors.DEFAULT);
                },
                radius: function(feature) {
                    return (layer.calculateRadius(feature.attributes) || coreMap.Map.Layer.PointsLayer.MIN_RADIUS);
                }
            }
        });
        var pointStyleSelect = new OpenLayers.Style({
            fillColor: coreMap.Map.Layer.PointsLayer.DEFAULT_SELECT_COLOR,
            fillOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_SELECT_OPACITY,
            strokeOpacity: coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY,
            strokeWidth: coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_WIDTH,
            stroke: coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_COLOR,
            pointRadius: "${radius}",
            cursor: coreMap.Map.Layer.PointsLayer.DEFAULT_CURSOR
        }, {
            context: {
                radius: function(feature) {
                    return (layer.calculateRadius(feature.attributes) || coreMap.Map.Layer.PointsLayer.MIN_RADIUS) * 1.5;
                }
            }
        });

        return new OpenLayers.StyleMap({
            default: pointStyle,
            select: pointStyleSelect
        });
    }
});

/**
 * Calculate the desired color of a point.
 * @param {Object} element One data element of the map's data array.
 * @return {String} The color
 * @method calculateColor
 */
coreMap.Map.Layer.PointsLayer.prototype.calculateColor = function(element) {
    // TODO How should we handle array fields that contain multiple colors?
    var category = neon.helpers.getValues(element, this.categoryMapping)[0];
    var color;

    if(this.colors[category]) {
        color = this.colors[category];
    } else if(this.hasColorsConfigured) {
        color = this.colors[""] || neonColors.DEFAULT;
    } else if(category && this.gradient && _.isDate(category)) {
        color = "#" + this.rainbow.colourAt(category.getTime());
    } else if(category && !this.gradient) {
        color = this.colorScale(category);
    } else {
        category = '(Uncategorized)';
        color = this.defaultColor || neonColors.DEFAULT;
    }

    // Save the color in the registry so we know the color/category mappings
    if(!this.colors[category]) {
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
    return d3.max(me.data, function(item) {
        var values = neon.helpers.getValues(item, me.sizeMapping).sort();
        return values.length ? values[values.length-1] : null;
    });
};

/**
 * Calculate the radius of the smallest element in the data
 * @return {number} The minimum value in the data
 * @method calculateMinRadius
 */
coreMap.Map.Layer.PointsLayer.prototype.calculateMinRadius = function() {
    var me = this;
    return d3.min(me.data, function(item) {
        var values = neon.helpers.getValues(item, me.sizeMapping).sort();
        return values.length ? values[0] : null;
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
    var zoomLevel = this.map.zoom;
    // If the size field contains an array of numbers, arbitrarily take the smallest.
    var size = neon.helpers.getValues(element, this.sizeMapping);
    var dataVal = _.isArray(size) ? size.sort()[0] : size;
    var percentOfDataRange = (dataVal - this.minRadius) / this._dataRadiusDiff;
    var radius = coreMap.Map.Layer.PointsLayer.MIN_RADIUS + (percentOfDataRange * this._baseRadiusDiff) || coreMap.Map.Layer.PointsLayer.MIN_RADIUS;
    return radius * (zoomLevel / 2);
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
    point.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);

    var feature = new OpenLayers.Feature.Vector(point);
    feature.attributes = element;

    if(this.cluster) {
        feature.dataElements = element;
    }

    return feature;
};

/**
 * Checks if the mappings exist in the data element
 * @param {Object} element An element of the data array.
 * @return {Boolean} True if element contains all the mappings, false otherwise
 * @method areValuesInDataElement
 */
coreMap.Map.Layer.PointsLayer.prototype.areValuesInDataElement = function(element) {
    if(neon.helpers.getValues(element, this.latitudeMapping).length && neon.helpers.getValues(element, this.longitudeMapping).length) {
        return true;
    }

    return false;
};

coreMap.Map.Layer.PointsLayer.prototype.setData = function(data, limit) {
    this.data = data;
    if(this.gradient) {
        this.updateGradient();
    }
    this.updateRadii();
    this.updateFeatures(limit);
    if(this.dateFilterStrategy) {
        this.dateFilterStrategy.setFilter();
    }
    return this.colors;
};

coreMap.Map.Layer.PointsLayer.prototype.setDateFilter = function(filterBounds) {
    if(this.dateMapping && this.applyTransientDateFilter && filterBounds && filterBounds.start && filterBounds.end) {
        // Update the filter
        this.dateFilter.lowerBoundary = filterBounds.start;
        this.dateFilter.upperBoundary = filterBounds.end;
        this.dateFilterStrategy.setFilter(this.dateFilter);
    } else {
        // Clear the filter
        this.dateFilterStrategy.setFilter();
    }
};

/**
 * Creates a date gradient mapping to use for coloring the points
 * @method updateGradient
 */
coreMap.Map.Layer.PointsLayer.prototype.updateGradient = function() {
    this.rainbow = new Rainbow();

    // Check if category mapping is valid date before creating gradient
    if(_.isString(this.categoryMapping) && this.data.length) {
        var category = neon.helpers.getValues(this.data[0], this.categoryMapping);
        if(category.length && !isNaN(new Date(category[0]))) {
            var startDate = new Date(category[0]);
            var endDate = new Date(category[0]);

            var categoryMapping = this.categoryMapping;

            this.data.forEach(function(item) {
                var dates = neon.helpers.getValues(item, categoryMapping).sort(function(a, b) {
                    return new Date(a).getTime() - new Date(b).getTime();
                });
                if(dates.length) {
                    startDate = startDate.getTime() < dates[0].getTime() ? startDate : dates[0];
                    endDate = endDate.getTime() > dates[dates.length - 1].getTime() ? endDate : dates[dates.length - 1];
                }
            });

            this.rainbow.setNumberRange(startDate.getTime(), endDate.getTime() + (startDate.getTime() === endDate.getTime() ? 1 : 0));
        }
    }
};

coreMap.Map.Layer.PointsLayer.prototype.updateFeatures = function(limit) {
    var mapData = [];

    // Extra fields to collect in addition to the longitude & latitude (X & Y) fields.
    var fields = {
        date: this.dateMapping || coreMap.Map.Layer.PointsLayer.DEFAULT_DATE_MAPPING
    };

    var points = neon.helpers.getPoints(this.data, this.longitudeMapping, this.latitudeMapping, fields);
    this.pointTotal = points.length;
    this.pointLimit = limit;

    var me = this;

    // Use the helper function to collect the longitude & latitude (X & Y) coordinates from the data for the points.
    points.slice(0, limit).forEach(function(point) {
        if($.isNumeric(point.x) && $.isNumeric(point.y)) {
            // If the date field contains an array of dates, arbitrarily take the earliest.
            var date = _.isArray(point.date) && point.date.length ? point.date.sort(function(a, b) {
                return new Date(a).getTime() - new Date(b).getTime();
            })[0] : (point.date || "none");

            var pointFeature = me.createPoint(point.data, point.x, point.y);

            // Note: The date mapping must be on the top level of attributes in order for filtering to work.
            // This means even if the date is in to.date, keep the date at the top level with key "to.date" instead
            // of in the object "to".
            pointFeature.attributes[fields.date] = new Date(date);

            // Save the latitude and longitude of the point in the feature itself because the latitude and longitude in the feature attributes may be arrays of multiple values.
            // Used in the point's popup.
            pointFeature.lon = point.x;
            pointFeature.lat = point.y;

            mapData.push(pointFeature);
        }
    });

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

coreMap.Map.Layer.PointsLayer.DEFAULT_CLUSTER_DISTANCE = 40;
coreMap.Map.Layer.PointsLayer.DEFAULT_LATITUDE_MAPPING = "latitude";
coreMap.Map.Layer.PointsLayer.DEFAULT_LONGITUDE_MAPPING = "longitude";
coreMap.Map.Layer.PointsLayer.DEFAULT_DATE_MAPPING = "date";
coreMap.Map.Layer.PointsLayer.DEFAULT_OPACITY = 0.8;
coreMap.Map.Layer.PointsLayer.DEFAULT_SELECT_OPACITY = 1;
coreMap.Map.Layer.PointsLayer.DEFAULT_SELECT_COLOR = "#88d292";
coreMap.Map.Layer.PointsLayer.DEFAULT_SIZE_MAPPING = "count_";
coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_WIDTH = 0;
coreMap.Map.Layer.PointsLayer.DEFAULT_STROKE_COLOR = "#ffffff";
coreMap.Map.Layer.PointsLayer.MIN_RADIUS = 2;
coreMap.Map.Layer.PointsLayer.MAX_RADIUS = 8;
coreMap.Map.Layer.PointsLayer.DEFAULT_CURSOR = "pointer";

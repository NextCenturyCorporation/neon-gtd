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
coreMap.Map.Layer.NodeLayer = OpenLayers.Class(OpenLayers.Layer.Vector, {
    CLASS_NAME: "coreMap.Map.Layer.NodeLayer",
    baseLineWidthDiff: 0,
    baseRadiusDiff: 0,
    edges: [],
    edgeWeightMapping: '',
    categoryMapping: '',
    latitudeMapping: '',
    lineColor: '',
    lineWidthDiff: 0,
    longitudeMapping: '',
    maxNodeRadius: 0,
    minNodeRadius: 0,
    maxLineWidth: 0,
    minLineWidth: 0,
    nodeColor: '',
    nodeRadiusDiff: 0,
    nodeWeightMapping: '',

    /**
     * Override the OpenLayers Contructor
     */
    initialize: function(name, options) {
        // Override the style for our specialization.
        var extendOptions = options || {};
        extendOptions.styleMap = this.createNodeStyleMap();

        // Call the super constructor, you will have to define the variables geometry, attributes and style
        var args = [name, extendOptions];
        OpenLayers.Layer.Vector.prototype.initialize.apply(this, args);

        this.visibility = true;
    },

    createNodeStyleMap: function() {
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
 * Calculate the desired radius of a point.  This will be a proporation of the
 * allowed coreMap.Map.Layer.NodeLayer.MIN_RADIUS and coreMap.Map.Layer.NodeLayer.MAX_RADIUS values.
 * @param {Object} element One data element of the map's data array.
 * @return {number} The radius
 * @method calculateNodeRadius
 */
coreMap.Map.Layer.NodeLayer.prototype.calculateNodeRadius = function(element) {
    var dataVal = this.getValueFromDataElement(this.weightMapping, element);
    var percentOfDataRange = (dataVal - this.minNodeRadius) / this.nodeRadiusDiff;
    return coreMap.Map.Layer.NodeLayer.MIN_RADIUS + (percentOfDataRange * this.baseRadiusDiff);
};

/**
 * Calculate the desired width of an edge.  This will be a proporation of the
 * allowed coreMap.Map.Layer.NodeLayer.MIN_RADIUS and coreMap.Map.Layer.NodeLayer.MAX_RADIUS values.
 * @param {Object} element One data element of the map's data array.
 * @return {number} The width
 * @method calculateLineWidth
 */
coreMap.Map.Layer.NodeLayer.prototype.calculateLineWidth = function(weight) {
    var percentOfDataRange = (weight - this.minLineWidth) / this.lineWidthDiff;
    return coreMap.Map.Layer.NodeLayer.MIN_LINE_WIDTH + (percentOfDataRange * this.baseLineWidthDiff);
};

/**
 * Creates a point to be added to the Node layer, styled appropriately.
 * @param {Object} element One data element of the map's data array.
 * @return {OpenLayers.Feature.Vector} the point to be added.
 * @method createNode
 */
coreMap.Map.Layer.NodeLayer.prototype.createNode = function(element) {
    var point = new OpenLayers.Geometry.Point(
        this.getValueFromDataElement(this.longitudeMapping, element),
        this.getValueFromDataElement(this.latitudeMapping, element)
    );
    point.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);

    var feature = new OpenLayers.Feature.Vector(point);
    feature.style = this.styleNode(element);
    feature.attributes = element;
    return feature;
};

/**
 * Creates the style object for a point using the given hex color value and radius in pixels.
 * @param {String} color The color of the point
 * @param {number} radius The radius of the point
 * @return {OpenLayers.Symbolizer.Point} The style object
 * @method createNodeStyleObject
 */
coreMap.Map.Layer.NodeLayer.prototype.createNodeStyleObject = function(color, radius) {
    color = color || coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR;
    radius = radius || coreMap.Map.Layer.NodeLayer.MIN_RADIUS;

    return new OpenLayers.Symbolizer.Point({
        fillColor: color,
        fillOpacity: coreMap.Map.Layer.NodeLayer.DEFAULT_OPACITY,
        strokeOpacity: coreMap.Map.Layer.NodeLayer.DEFAULT_OPACITY,
        strokeWidth: coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_WIDTH,
        stroke: coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_COLOR,
        pointRadius: radius
    });
};

/**
 * Creates the style object for an edge line with the given hex color and width in pixels.
 * @param {String} color The color of the edge
 * @param {number} width The width of the node edge, the line between nodes
 * @return {OpenLayers.Symbolizer.Line} The style object
 * @method createLineStyleObject
 */
coreMap.Map.Layer.NodeLayer.prototype.createLineStyleObject = function(color, width) {
    color = color || coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR;

    return new OpenLayers.Symbolizer.Line({
        strokeColor: color || coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_COLOR,
        strokeOpacity: coreMap.Map.Layer.NodeLayer.DEFAULT_OPACITY,
        strokeWidth: width || coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_WIDTH,
        strokeLinecap: "butt"
    });
};

/**
 * Creates a weighted line to be added to the Node layer, styled appropriately.  The weight
 * determines the thickness of the line.
 * @param {Array<Number>} pt1 The [latitude, longitude] pair of the source node
 * @param {Array<Number>} pt2 The [latitude, longitude] pair of the target node
 * @param {Number} weight The weight of the line.  This will be compared to other
 * datapoints to calculate an appropriate line width for rendering.
 * @return {OpenLayers.Feature.Vector} the line to be added.
 * @method createWeightedLine
 */
coreMap.Map.Layer.NodeLayer.prototype.createWeightedLine = function(pt1, pt2, weight) {
    var wt = this.calculateLineWidth(weight);
    var point1 = new OpenLayers.Geometry.Point(pt1[0], pt1[1]);
    var point2 = new OpenLayers.Geometry.Point(pt2[0], pt2[1]);

    var line = new OpenLayers.Geometry.LineString([point1, point2]);
    line.transform(coreMap.Map.SOURCE_PROJECTION,
        coreMap.Map.DESTINATION_PROJECTION);

    var featureLine = new OpenLayers.Feature.Vector(line);
    featureLine.style = this.createLineStyleObject(this.lineColor || coreMap.Map.Layer.NodeLayer.DEFAULT_LINE_COLOR, wt);

    return featureLine;
};

/**
 * Gets a value from a data element using a mapping string or function.
 * @param {String | Function} mapping The mapping from data element object to value.
 * @param {Object} element An element of the data array.
 * @return The value in the data element.
 * @method getValueFromDataElement
 */
coreMap.Map.Layer.NodeLayer.prototype.getValueFromDataElement = function(mapping, element) {
    if(typeof mapping === 'function') {
        return mapping.call(this, element);
    }
    return element[mapping];
};

/**
 * Checks if the mappings exist in the data element
 * @param {Object} element An element of the data array.
 * @return {Boolean} True if element contains all the mappings, false otherwise
 * @method areValuesInDataElement
 */
coreMap.Map.Layer.NodeLayer.prototype.areValuesInDataElement = function(element) {
    if(element[this.sourceMapping] && element[this.targetMapping] && element[this.weightMapping]) {

        if(element[this.sourceMapping][this.latitudeMapping] && element[this.sourceMapping][this.longitudeMapping] &&
            element[this.targetMapping][this.latitudeMapping] && element[this.targetMapping][this.longitudeMapping]) {

            return true;
        }
    }

    return false;
};

/**
 * Styles the data element based on the size and color.
 * @param {Object} element One data element of the map's data array.
 * @return {OpenLayers.Symbolizer.Point} The style object
 * @method styleNode
 */
coreMap.Map.Layer.NodeLayer.prototype.styleNode = function(element) {
    var radius = this.calculateNodeRadius(element) || coreMap.Map.Layer.NodeLayer.MIN_RADIUS;
    var color = this.nodeColor || coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR;

    return this.createNodeStyleObject(color, radius);
};

coreMap.Map.Layer.NodeLayer.prototype.setData = function(edges) {
    this.edges = edges;
    this.updateFeatures();
};

/**
 * Calculate the new node radius and line width outer bounds based upon the current edge data.
 * @method calculateSizes
 */
coreMap.Map.Layer.NodeLayer.prototype.calculateSizes = function() {
    var me = this;
    this.minNodeRadius = this.minLineWidth = Number.MAX_VALUE;
    this.maxNodeRadius = this.maxLineWidth = Number.MIN_VALUE;
    _.each(this.edges, function(element) {
        var src = me.getValueFromDataElement(me.sourceMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE, element);
        var tgt = me.getValueFromDataElement(me.targetMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET, element);
        var weight = me.getValueFromDataElement(me.weightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, element);
        var srcWeight = me.getValueFromDataElement(me.weightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, src);
        var tgtWeight = me.getValueFromDataElement(me.weightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, tgt);

        me.minNodeRadius = _.min([me.minNodeRadius, srcWeight, tgtWeight]);
        me.maxNodeRadius = _.max([me.maxNodeRadius, srcWeight, tgtWeight]);
        me.minLineWidth = _.min([me.minLineWidth, weight]);
        me.maxLineWidth = _.max([me.maxLineWidth, weight]);
    });

    this.nodeRadiusDiff = this.maxNodeRadius - this.minNodeRadius;
    this.lineWidthDiff = this.maxLineWidth - this.minLineWidth;
    this.baseRadiusDiff = coreMap.Map.Layer.NodeLayer.MAX_RADIUS - coreMap.Map.Layer.NodeLayer.MIN_RADIUS;
    this.baseLineWidthDiff = coreMap.Map.Layer.NodeLayer.MAX_LINE_WIDTH - coreMap.Map.Layer.NodeLayer.MIN_LINE_WIDTH;
};

/**
 * Tells the layer to update its graphics based upon the current data associated with the layer.
 * @method updateFeatures
 */
coreMap.Map.Layer.NodeLayer.prototype.updateFeatures = function() {
    var me = this;
    var lines = [];
    var nodes = {};

    this.destroyFeatures();

    // Initialize the weighted values.
    this.calculateSizes(this.edges);
    _.each(this.edges, function(element) {
        var src = me.getValueFromDataElement(me.sourceMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE, element);
        var tgt = me.getValueFromDataElement(me.targetMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET, element);
        var weight = me.getValueFromDataElement(me.weightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, element);

        var pt1 = [
            me.getValueFromDataElement(me.longitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_LONGITUDE_MAPPING, src),
            me.getValueFromDataElement(me.latitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_LATITUDE_MAPPING, src)
        ];

        var pt2 = [
            me.getValueFromDataElement(me.longitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_LONGITUDE_MAPPING, tgt),
            me.getValueFromDataElement(me.latitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_LATITUDE_MAPPING, tgt)
        ];

        // If the line has substance, render it.
        if(weight > 0) {
            lines.push(me.createWeightedLine(pt1, pt2, weight));
        }

        // Add the nodes to the node list if necesary.
        if(!nodes[pt1]) {
            nodes[pt1] = me.createNode(src);
        }

        if(!nodes[pt2]) {
            nodes[pt2] = me.createNode(tgt);
        }
    });

    this.addFeatures(lines);
    this.addFeatures(_.values(nodes));
};

coreMap.Map.Layer.NodeLayer.DEFAULT_LATITUDE_MAPPING = "latitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_LONGITUDE_MAPPING = "longitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING = "wgt";
coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE = "from";
coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET = "to";

coreMap.Map.Layer.NodeLayer.DEFAULT_OPACITY = 0.8;
coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_WIDTH = 1;
coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR = "#00ff00";
coreMap.Map.Layer.NodeLayer.DEFAULT_LINE_COLOR = "#ffff00";
coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_COLOR = "#777";
coreMap.Map.Layer.NodeLayer.MIN_RADIUS = 3;
coreMap.Map.Layer.NodeLayer.MAX_RADIUS = 13;
coreMap.Map.Layer.NodeLayer.MIN_LINE_WIDTH = 1;
coreMap.Map.Layer.NodeLayer.MAX_LINE_WIDTH = 13;


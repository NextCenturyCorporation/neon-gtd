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
    weightMapping: '',

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
    var percentOfDataRange = 0;

    // If there was some variance in edge weights/widths, calculate the percentage of max difference for this weight.
    // Otherwise, we'll default to the minimum line width.
    if(this.lineWidthDiff) {
        percentOfDataRange = (weight - this.minLineWidth) / this.lineWidthDiff;
    }

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
 * Creates the style object for arrow lines with the given hex color and width in pixels.
 * @param {String} color The color of the arrow
 * @param {Number} width The width of the arrow lines
 * @param {Number} angle The angle of rotation to set the arrow in the right direction
 * @param {Object} element An element of the data array.
 * @return {OpenLayers.Symbolizer.Point} The style object
 * @method createArrowStyleObject
 */
coreMap.Map.Layer.NodeLayer.prototype.createArrowStyleObject = function(color, width, angle, element) {
    var radius = Math.ceil(this.calculateNodeRadius(element) || coreMap.Map.Layer.NodeLayer.MIN_RADIUS);

    var arrowWidth = radius + 7;
    if(radius % 2 === 0) {
        arrowWidth += 1;
    }

    OpenLayers.Renderer.symbol.arrow = [0,0, 0,arrowWidth, (arrowWidth / 2),(arrowWidth - 7), arrowWidth,arrowWidth, 0,arrowWidth];

    color = color || coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR;

    return new OpenLayers.Symbolizer.Point({
        strokeColor: color || coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_COLOR,
        fillColor: color || coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_COLOR,
        strokeOpacity: 0,
        strokeWidth: 1,
        graphicName: "arrow",
        pointRadius: (width || coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_WIDTH) * 2,
        rotation: angle,
        strokeLinecap: "round"
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
 * Creates a weighted arrow tip to be added to the Node layer, styled appropriately.  The weight
 * determines the thickness of the arrow lines.
 * @param {Array<Number>} pt1 The [latitude, longitude] pair of the source node
 * @param {Array<Number>} pt2 The [latitude, longitude] pair of the target node
 * @param {Number} weight The weight of the arrow lines. This will be compared to other
 * datapoints to calculate an appropriate line width for rendering.
 * @param {Object} element An element of the data array.
 * @return {OpenLayers.Feature.Vector} the arrow to be added.
 * @method createWeightedArrow
 */
coreMap.Map.Layer.NodeLayer.prototype.createWeightedArrow = function(pt1, pt2, weight, element) {
    var wt = this.calculateLineWidth(weight);

    var angle = this.calculateAngle(pt1[0], pt1[1], pt2[0], pt2[1]);

    var point = new OpenLayers.Geometry.Point(pt2[0], pt2[1]);
    point.transform(coreMap.Map.SOURCE_PROJECTION,
        coreMap.Map.DESTINATION_PROJECTION);

    var featureArrow = new OpenLayers.Feature.Vector(point);
    featureArrow.style = this.createArrowStyleObject(this.lineColor || coreMap.Map.Layer.NodeLayer.DEFAULT_LINE_COLOR, wt, angle, element);

    return featureArrow;
};

/**
 * Calculates the angle between two points
 * @param {Number} x1 Longitude of starting point
 * @param {Number} y1 Latitude of starting point
 * @param {Number} x2 Longitude of ending point
 * @param {Number} y2 Latitude of ending point
 * @return {Number} The angle between the points
 * @method calculateAngle
 */
coreMap.Map.Layer.NodeLayer.prototype.calculateAngle = function(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;

    // Calculates the angle between vector and x axis
    var angle = Math.atan(dy / dx) * 180 / Math.PI;

    var rotation = 0;

    // Gets angle rotation according to vector direction
    if((dx >= 0 && dy >= 0) || (dx >= 0 && dy < 0)) {
        rotation = 90;
    } else if((dx < 0 && dy >= 0) || (dx < 0 && dy < 0)) {
        rotation = -90;
    }

    return (rotation - angle);
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
        var weight = me.getValueFromDataElement(me.weightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, element) || 1;
        var srcWeight = me.getValueFromDataElement(me.weightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, src) || 1;
        var tgtWeight = me.getValueFromDataElement(me.weightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, tgt) || 1;

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
    var arrows = [];

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
            arrows.push(me.createWeightedArrow(pt1, pt2, weight, tgt));
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
    this.addFeatures(arrows);
    this.addFeatures(_.values(nodes));
};

coreMap.Map.Layer.NodeLayer.DEFAULT_LATITUDE_MAPPING = "latitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_LONGITUDE_MAPPING = "longitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING = "wgt";
coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE = "from";
coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET = "to";

coreMap.Map.Layer.NodeLayer.DEFAULT_ARROW_POINT_RADIUS = 5;
coreMap.Map.Layer.NodeLayer.DEFAULT_OPACITY = 1;
coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_WIDTH = 1;
coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR = "#00ff00";
coreMap.Map.Layer.NodeLayer.DEFAULT_LINE_COLOR = "#ffff00";
coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_COLOR = "#777";
coreMap.Map.Layer.NodeLayer.MIN_RADIUS = 3;
coreMap.Map.Layer.NodeLayer.MAX_RADIUS = 13;
coreMap.Map.Layer.NodeLayer.MIN_LINE_WIDTH = 1;
coreMap.Map.Layer.NodeLayer.MAX_LINE_WIDTH = 13;


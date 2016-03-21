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
    dateMapping: '',
    lineDefaultColor: '',
    lineColors: {},
    lineWidthDiff: 0,
    nodeMapping: '',
    lineMapping: '',
    lineWeightMapping: '',
    maxNodeRadius: 0,
    minNodeRadius: 0,
    maxLineWidth: 0,
    minLineWidth: 0,
    nodeDefaultColor: '',
    nodeColors: {},
    nodeRadiusDiff: 0,
    nodeWeightMapping: '',
    sourceLatitudeMapping: '',
    sourceLongitudeMapping: '',
    targetLatitudeMapping: '',
    targetLongitudeMapping: '',

    /**
     * Override the OpenLayers Contructor
     */
    initialize: function(name, options) {
        // Override the style for our specialization.
        var extendOptions = options || {};
        extendOptions.styleMap = this.createNodeStyleMap();

        // Set a default date filter strategy.  Use date.now for the default values;
        // This will be overridden before use.
        this.dateFilter = new OpenLayers.Filter.Comparison({
            type: OpenLayers.Filter.Comparison.BETWEEN,
            property: options.dateMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_DATE_MAPPING,
            lowerBoundary: Date.now(),
            upperBoundary: Date.now()
        });
        this.dateFilterStrategy = new OpenLayers.Strategy.Filter({});
        extendOptions.strategies = [this.dateFilterStrategy];

        // Call the super constructor, you will have to define the variables geometry, attributes and style
        var args = [name, extendOptions];
        OpenLayers.Layer.Vector.prototype.initialize.apply(this, args);

        this.nodeColors = this.options.nodeColors || {};
        this.lineColors = this.options.lineColors || {};

        this.dateFilterStrategy.deactivate();
        this.visibility = true;
        this.colorScale = d3.scale.ordinal().range(neonColors.LIST);
        this.getNestedValue = neon.helpers.getNestedValue;
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
 * @param {Object} weight The size of the node.
 * @return {Number} The radius
 * @method calculateNodeRadius
 */
coreMap.Map.Layer.NodeLayer.prototype.calculateNodeRadius = function(weight) {
    var percentOfDataRange = (weight - this.minNodeRadius) / this.nodeRadiusDiff;
    return coreMap.Map.Layer.NodeLayer.MIN_RADIUS + (percentOfDataRange * this.baseRadiusDiff);
};

/**
 * Calculate the desired width of an edge.  This will be a proporation of the
 * allowed coreMap.Map.Layer.NodeLayer.MIN_RADIUS and coreMap.Map.Layer.NodeLayer.MAX_RADIUS values.
 * @param {Number} weight The size of the line.
 * @return {Number} The width
 * @method calculateLineWidth
 */
coreMap.Map.Layer.NodeLayer.prototype.calculateLineWidth = function(weight) {
    var percentOfDataRange = 0;

    // If there was some variance in edge weights/widths, calculate the percentage of max difference for this weight.
    // Otherwise, we'll default to the minimum line width.
    if(this.lineWidthDiff) {
        percentOfDataRange = (weight - this.minLineWidth) / this.lineWidthDiff;
    }

    var lineWidth = coreMap.Map.Layer.NodeLayer.MIN_LINE_WIDTH + (percentOfDataRange * this.baseLineWidthDiff);
    return lineWidth;
};

/**
 * Creates a point to be added to the Node layer, styled appropriately.
 * @param {Object} element One data element of the map's data array.
 * @param {Number} nodeWeight The size of the node.
 * @param {String} nodeMappingElement The color of the node.
 * @param {Array<Number>} pt The [longitude, latitude] pair of the node.
 * @return {OpenLayers.Feature.Vector} the point to be added.
 * @method createNode
 */
coreMap.Map.Layer.NodeLayer.prototype.createNode = function(element, nodeWeight, nodeMappingElement, pt) {
    var point = new OpenLayers.Geometry.Point(pt[0], pt[1]);
    point.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);

    var feature = new OpenLayers.Feature.Vector(point);
    feature.style = this.styleNode(nodeWeight, nodeMappingElement);
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
coreMap.Map.Layer.NodeLayer.prototype.createNodeStyleObject = function(nodeMappingElement, radius) {
    radius = radius || coreMap.Map.Layer.NodeLayer.MIN_RADIUS;

    var color;

    if(nodeMappingElement) {
        color = this.colorScale(nodeMappingElement);
    } else {
        nodeMappingElement = '(Uncategorized)';
        color = this.nodeDefaultColor || coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR;
    }

    // store the color in the registry so we know the color/category mappings
    if(!(this.nodeColors.hasOwnProperty(nodeMappingElement))) {
        this.nodeColors[nodeMappingElement] = color;
    }

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
coreMap.Map.Layer.NodeLayer.prototype.createLineStyleObject = function(lineMappingElement, width) {
    //color = color || coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR;
    var color;

    if(lineMappingElement) {
        color = this.colorScale(lineMappingElement);
    } else {
        lineMappingElement = '(Uncategorized)';
        color = this.lineDefaultColor || coreMap.Map.Layer.NodeLayer.DEFAULT_LINE_COLOR;
    }

    // store the color in the registry so we know the color/category mappings
    if(!(this.lineColors.hasOwnProperty(lineMappingElement))) {
        this.lineColors[lineMappingElement] = color;
    }

    return new OpenLayers.Symbolizer.Line({
        strokeColor: color,
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
 * @param {Object} nodeWeight The size of the node.
 * @return {OpenLayers.Symbolizer.Point} The style object
 * @method createArrowStyleObject
 */
coreMap.Map.Layer.NodeLayer.prototype.createArrowStyleObject = function(lineMappingElement, width, angle, nodeWeight) {
    var radius = Math.ceil(this.calculateNodeRadius(nodeWeight) || coreMap.Map.Layer.NodeLayer.MIN_RADIUS);

    var arrowWidth = radius + 7;
    if(radius % 2 === 0) {
        arrowWidth += 1;
    }

    OpenLayers.Renderer.symbol.arrow = [0,0, 0,arrowWidth, (arrowWidth / 2),(arrowWidth - 7), arrowWidth,arrowWidth, 0,arrowWidth];

    var color;

    if(lineMappingElement) {
        color = this.colorScale(lineMappingElement);
    } else {
        lineMappingElement = '(Uncategorized)';
        color = this.lineDefaultColor || coreMap.Map.Layer.NodeLayer.DEFAULT_LINE_COLOR;
    }

    // store the color in the registry so we know the color/category mappings
    if(!(this.lineColors.hasOwnProperty(lineMappingElement))) {
        this.lineColors[lineMappingElement] = color;
    }

    return new OpenLayers.Symbolizer.Point({
        strokeColor: color,
        fillColor: color,
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
 * @param {Array<Number>} pt1 The [longitude, latitude] pair of the source node
 * @param {Array<Number>} pt2 The [longitude, latitude] pair of the target node
 * @param {Number} weight The weight of the line.  This will be compared to other
 * datapoints to calculate an appropriate line width for rendering.
 * @param {String} lineMappingElement The color of the line.
 * @return {OpenLayers.Feature.Vector} the line to be added.
 * @method createWeightedLine
 */
coreMap.Map.Layer.NodeLayer.prototype.createWeightedLine = function(pt1, pt2, weight, lineMappingElement) {
    var wt = this.calculateLineWidth(weight);
    var point1 = new OpenLayers.Geometry.Point(pt1[0], pt1[1]);
    var point2 = new OpenLayers.Geometry.Point(pt2[0], pt2[1]);

    var line = new OpenLayers.Geometry.LineString([point1, point2]);
    line.transform(coreMap.Map.SOURCE_PROJECTION,
        coreMap.Map.DESTINATION_PROJECTION);

    var featureLine = new OpenLayers.Feature.Vector(line);
    featureLine.style = this.createLineStyleObject(lineMappingElement, wt);
    featureLine.attributes.weight = weight;

    return featureLine;
};

/**
 * Creates a weighted arrow tip to be added to the Node layer, styled appropriately.  The weight
 * determines the thickness of the arrow lines.
 * @param {Array<Number>} pt1 The [longitude, latitude] pair of the source node
 * @param {Array<Number>} pt2 The [longitude, latitude] pair of the target node
 * @param {Number} weight The weight of the arrow lines. This will be compared to other
 * datapoints to calculate an appropriate line width for rendering.
 * @param {Number} nodeWeight The weight of the nodes.
 * @param {String} lineMappingElement The color of the line.
 * @return {OpenLayers.Feature.Vector} the arrow to be added.
 * @method createWeightedArrow
 */
coreMap.Map.Layer.NodeLayer.prototype.createWeightedArrow = function(pt1, pt2, weight, nodeWeight, lineMappingElement) {
    var wt = this.calculateLineWidth(weight);
    wt = (wt < coreMap.Map.Layer.NodeLayer.MIN_ARROW_POINT_RADIUS) ?
        coreMap.Map.Layer.NodeLayer.MIN_ARROW_POINT_RADIUS : wt;
    var angle = this.calculateAngle(pt1[0], pt1[1], pt2[0], pt2[1]);

    var point = new OpenLayers.Geometry.Point(pt2[0], pt2[1]);
    point.transform(coreMap.Map.SOURCE_PROJECTION,
        coreMap.Map.DESTINATION_PROJECTION);

    var featureArrow = new OpenLayers.Feature.Vector(point);
    featureArrow.style = this.createArrowStyleObject(lineMappingElement, wt, angle, nodeWeight);

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
    return this.getNestedValue(element, mapping);
};

/**
 * Checks if the mappings exist in the data element
 * @param {Object} element An element of the data array.
 * @return {Boolean} True if element contains all the mappings, false otherwise
 * @method areValuesInDataElement
 */
coreMap.Map.Layer.NodeLayer.prototype.areValuesInDataElement = function(element) {
    if(this.getValueFromDataElement(this.sourceLatitudeMapping, element) !== undefined &&
        this.getValueFromDataElement(this.sourceLongitudeMapping, element) !== undefined &&
        this.getValueFromDataElement(this.targetLatitudeMapping, element) !== undefined &&
        this.getValueFromDataElement(this.targetLongitudeMapping, element) !== undefined) {
        return true;
    }

    return false;
};

/**
 * Styles the data element based on the size and color.
 * @param {Number} weight The size of the node to style.
 * @param {String} nodeMappingElement The color of the node.
 * @return {OpenLayers.Symbolizer.Point} The style object
 * @method styleNode
 */
coreMap.Map.Layer.NodeLayer.prototype.styleNode = function(weight, nodeMappingElement) {
    var radius = this.calculateNodeRadius(weight) || coreMap.Map.Layer.NodeLayer.MIN_RADIUS;

    return this.createNodeStyleObject(nodeMappingElement, radius);
};

coreMap.Map.Layer.NodeLayer.prototype.setData = function(edges) {
    this.edges = edges;
    this.updateFeatures();
    this.dateFilterStrategy.setFilter();
    return {
        lineColors: this.lineColors,
        nodeColors: this.nodeColors
    };
};

coreMap.Map.Layer.NodeLayer.prototype.setDateFilter = function(filterBounds) {
    if(this.dateMapping && filterBounds && filterBounds.start && filterBounds.end) {
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
 * Calculate the new node radius and line width outer bounds based upon the current edge data.
 * @method calculateSizes
 */
coreMap.Map.Layer.NodeLayer.prototype.calculateSizes = function() {
    var me = this;
    this.minNodeRadius = this.minLineWidth = Number.MAX_VALUE;
    this.maxNodeRadius = this.maxLineWidth = Number.MIN_VALUE;
    _.each(this.edges, function(element) {
        var lineWeight = me.getValueFromDataElement(me.lineWeightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, element) || 1;
        var nodeWeight = me.getValueFromDataElement(me.nodeWeightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, element) || 1;

        me.minNodeRadius = _.min([me.minNodeRadius, nodeWeight]);
        me.maxNodeRadius = _.max([me.maxNodeRadius, nodeWeight]);
        me.minLineWidth = _.min([me.minLineWidth, lineWeight]);
        me.maxLineWidth = _.max([me.maxLineWidth, lineWeight]);
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
        var lineWeight = me.getValueFromDataElement(me.lineWeightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, element);
        var nodeWeight = me.getValueFromDataElement(me.nodeWeightMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING, element);
        var date = 'none';
        var dateMapping = me.dateMapping || coreMap.Map.Layer.PointsLayer.DEFAULT_DATE_MAPPING;
        var key = '';

        if(me.getValueFromDataElement(dateMapping, element)) {
            date = new Date(me.getValueFromDataElement(dateMapping, element));
        }

        var pt1 = [
            me.getValueFromDataElement(me.sourceLongitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE_LONGITUDE_MAPPING, element),
            me.getValueFromDataElement(me.sourceLatitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE_LATITUDE_MAPPING, element)
        ];

        var pt2 = [
            me.getValueFromDataElement(me.targetLongitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET_LONGITUDE_MAPPING, element),
            me.getValueFromDataElement(me.targetLatitudeMapping || coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET_LATITUDE_MAPPING, element)
        ];

        // Note: The date mappings must be on the top level of each attributes in order for filtering to work.
        // This means even if the date is in to.date, keep the date at the top level with key "to.date" instead
        // of in the object "to".

        var lineMappingElement = me.getValueFromDataElement(me.lineMapping, element);
        var line = me.createWeightedLine(pt1, pt2, lineWeight, lineMappingElement);
        line.attributes[dateMapping] = date;
        lines.push(line);

        var arrow = me.createWeightedArrow(pt1, pt2, lineWeight, nodeWeight, lineMappingElement);
        arrow.attributes[dateMapping] = date;
        arrows.push(arrow);

        // Add the nodes to the node list if necesary.
        var nodeMappingElement;
        key = pt1 + date;
        if(!nodes[key]) {
            nodeMappingElement = me.getValueFromDataElement(me.nodeMapping, element);
            nodes[key] = me.createNode(element, nodeWeight, nodeMappingElement, pt1);
            nodes[key].attributes[dateMapping] = date;
        }

        key = pt2 + date;
        if(!nodes[key]) {
            nodeMappingElement = me.getValueFromDataElement(me.nodeMapping, element);
            nodes[key] = me.createNode(element, nodeWeight, nodeMappingElement, pt2);
            nodes[key].attributes[dateMapping] = date;
        }
    });

    this.addFeatures(lines);
    this.addFeatures(arrows);
    this.addFeatures(_.values(nodes));
};

coreMap.Map.Layer.NodeLayer.DEFAULT_WEIGHT_MAPPING = "wgt";
coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE_LATITUDE_MAPPING = "from.latitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE_LONGITUDE_MAPPING = "from.longitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET_LATITUDE_MAPPING = "to.latitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET_LONGITUDE_MAPPING = "to.longitude";
coreMap.Map.Layer.NodeLayer.DEFAULT_DATE_MAPPING = "date";

coreMap.Map.Layer.NodeLayer.DEFAULT_OPACITY = 1;
coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_WIDTH = 1;
coreMap.Map.Layer.NodeLayer.DEFAULT_COLOR = "#00ff00";
coreMap.Map.Layer.NodeLayer.DEFAULT_LINE_COLOR =  "#888888";
coreMap.Map.Layer.NodeLayer.DEFAULT_STROKE_COLOR = "#777";
coreMap.Map.Layer.NodeLayer.MIN_RADIUS = 5;
coreMap.Map.Layer.NodeLayer.MAX_RADIUS = 13;
coreMap.Map.Layer.NodeLayer.MIN_ARROW_POINT_RADIUS = 5;
coreMap.Map.Layer.NodeLayer.MIN_LINE_WIDTH = 1;
coreMap.Map.Layer.NodeLayer.MAX_LINE_WIDTH = 13;

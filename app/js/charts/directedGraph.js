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
charts.DirectedGraph = function(rootElement, selector, opts) {
    opts = opts || {};
    this.rootElement = rootElement;
    this.chartSelector = selector;
    this.element = d3.select(rootElement).select(selector);

    this.tooltip = d3.select(rootElement)
        .append("div")
        .attr("class", "graph-tooltip")
        .style("opacity", 0);
    this.svgId = "directed-svg-" + (opts.uniqueId ? opts.uniqueId : uuid());

    this.calculateHeight = opts.calculateHeight;
    this.calculateWidth = opts.calculateWidth;
    this.getNodeSize = function(nodeData) {
        if(opts.getNodeSize) {
            if(_.isFunction(opts.getNodeSize)) {
                return opts.getNodeSize(nodeData);
            }
            return opts.getNodeSize;
        }
        return this.DEFAULT_NODE_SIZE;
    };
    this.getNodeColor = function(nodeData) {
        if(opts.getNodeColor) {
            if(_.isFunction(opts.getNodeColor)) {
                return opts.getNodeColor(nodeData);
            }
            return opts.getNodeColor;
        }
        return this.DEFAULT_NODE_COLOR;
    };
    this.getNodeText = function(nodeData) {
        if(opts.getNodeText) {
            if(_.isFunction(opts.getNodeText)) {
                return opts.getNodeText(nodeData);
            }
            return opts.getNodeText;
        }
        return "";
    };
    this.getNodeTooltip = function(nodeData) {
        if(opts.getNodeTooltip) {
            if(_.isFunction(opts.getNodeTooltip)) {
                return opts.getNodeTooltip(nodeData);
            }
            return opts.getNodeTooltip;
        }
        return nodeData.name || nodeData.id || "";
    };
    this.getLinkSize = function(linkData) {
        if(opts.getLinkSize) {
            if(_.isFunction(opts.getLinkSize)) {
                return opts.getLinkSize(linkData);
            }
            return opts.getLinkSize;
        }
        return this.DEFAULT_LINK_SIZE;
    };
    this.nodeClickHandler = opts.nodeClickHandler;
    this.nodeShiftClickHandler = opts.nodeShiftClickHandler;
    this.nodeDoubleClickHandler = opts.nodeDoubleClickHandler;
};

charts.DirectedGraph.prototype.DEFAULT_WIDTH = 600;
charts.DirectedGraph.prototype.DEFAULT_HEIGHT = 350;

charts.DirectedGraph.prototype.DEFAULT_NODE_COLOR = "black";
charts.DirectedGraph.prototype.DEFAULT_NODE_SIZE = 10;
charts.DirectedGraph.prototype.DEFAULT_NODE_STROKE_COLOR = "black";
charts.DirectedGraph.prototype.DEFAULT_NODE_STROKE_SIZE = 0;
charts.DirectedGraph.prototype.DEFAULT_NODE_TEXT_COLOR = "black";
charts.DirectedGraph.prototype.DEFAULT_LINK_SIZE = 2;
charts.DirectedGraph.prototype.DEFAULT_LINK_STROKE_COLOR = "#999999";
charts.DirectedGraph.prototype.DEFAULT_LINK_STROKE_OPACITY = 0.5;

charts.DirectedGraph.prototype.updateGraph = function(data) {
    var me = this;
    me.data = data;

    // Reset element here because it may not get set correctly in the constructor due to an odd race
    // condition issue with angularjs setting the graph's id using $scope.uniqueId.
    me.element = d3.select(me.rootElement).select(me.chartSelector);

    var nodes = data.nodes;

    var height = me.getRenderHeight();
    var width = me.getRenderWidth();

    me.clearSVG();

    me.svg = me.element
    .append("svg")
        .attr("id", me.svgId)
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("pointer-events", "all")
    .call(d3.behavior.zoom().on("zoom", me.handleZoom));

    // Create the definition for the arrowhead markers to be added to the end of each link.
    me.svg.append("svg:defs").selectAll("marker")
        .data(["end"])
        .enter().append("svg:marker")
        .attr("id", String)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 10)
        .attr("refY", 0)
        .attr("markerWidth", 10)
        .attr("markerHeight", 10)
        .attr("orient", "auto")
        .style("fill", me.DEFAULT_LINK_STROKE_COLOR)
        .append("svg:path")
        .attr("d", "M0,-5L10,0L0,5");

    me.vis = me.svg.append('svg:g');

    var force = d3.layout.force()
        .charge(-300)
        .linkDistance(100)
        .size([width, height])
        .gravity(0.05);

    force.nodes(data.nodes);

    var link;
    if(data.links) {
        force.links(data.links);

        link = me.vis.selectAll(".link")
            .data(data.links)
            .enter().append("line")
            .attr("class", "link")
            .attr("marker-end", "url(#end)")
            .style("stroke", me.DEFAULT_LINK_STROKE_COLOR)
            .style("stroke-opacity", me.DEFAULT_LINK_STROKE_OPACITY)
            .style("stroke-width", me.getLinkSize);
    }

    var node = me.vis.selectAll(".node")
        .data(nodes)
        .enter().append("g")
        .attr("class", "node")
        .call(force.drag);

    node.append("circle")
        .attr("r", me.getNodeSize)
        .style("fill", me.getNodeColor)
        .style("stroke", me.DEFAULT_NODE_STROKE_COLOR)
        .style("stroke-width", me.DEFAULT_NODE_STROKE_SIZE);

    node.append("text")
        .attr("dy", "5px")
        .style("fill", me.DEFAULT_NODE_TEXT_COLOR)
        .style("text-anchor", "middle")
        .text(me.getNodeText);

    // The index of the force layout tick.
    var index = 1;
    // Whether the node data has been fixed.
    var fixed = false;

    force.on("tick", function(event) {
        index = (event.alpha === 0.099 ? 1 : ++index);

        if(link) {
            link.attr("x1", function(linkData) {
                    return linkData.source.x;
                })
                .attr("y1", function(linkData) {
                    return linkData.source.y;
                })
                .attr("x2", function(linkData) {
                    // Ensure the line ends at the radius of the target node so the arrowhead is not drawn under the node.
                    var targetSize = me.getNodeSize(linkData.target);
                    var length = Math.sqrt(Math.pow(linkData.target.y - linkData.source.y, 2) + Math.pow(linkData.target.x - linkData.source.x, 2));
                    var scale = (length - targetSize) / length;
                    var offset = (linkData.target.x - linkData.source.x) - (linkData.target.x - linkData.source.x) * scale;
                    return linkData.target.x - offset;
                    return linkData.target.x;
                })
                .attr("y2", function(linkData) {
                    // Ensure the line ends at the radius of the target node so the arrowhead is not drawn under the node.
                    var targetSize = me.getNodeSize(linkData.target);
                    var length = Math.sqrt(Math.pow(linkData.target.y - linkData.source.y, 2) + Math.pow(linkData.target.x - linkData.source.x, 2));
                    var scale = (length - targetSize) / length;
                    var offset = (linkData.target.y - linkData.source.y) - (linkData.target.y - linkData.source.y) * scale;
                    return linkData.target.y - offset;
                    return linkData.target.y;
                });
        }

        node.attr("transform", function(nodeData) {
            return "translate(" + (nodeData.x) + "," + (nodeData.y) + ")";
        });

        // Fix the node data once the force layout has passed a specified alpha threshold or after a specified number of ticks.
        if(!fixed && (event.alpha < 0.025 || index > 250)) {
            fixed = true;
            // Set the fixed property to true to stop the force layout from moving nodes automatically.  They will only be movable through user dragging.
            node.each(function(nodeData) {
                nodeData.fixed = true;
            });
        }
    });

    if(nodes.length) {
        force.start();
    }

    node.on('dblclick', function(nodeData) {
        if(me.nodeDoubleClickHandler) {
            me.nodeDoubleClickHandler(nodeData);
        }
    }).on("click", function(nodeData) {
        if(d3.event.shiftKey && me.nodeShiftClickHandler) {
            me.nodeShiftClickHandler(nodeData);
        } else if(me.nodeClickHandler) {
            me.nodeClickHandler(nodeData);
        }
    }).on("mouseover", function(nodeData) {
        var parentOffset = $(me.rootElement).offset();

        me.tooltip.transition().duration(200).style("opacity", 0.9)
            .style("left", (d3.event.pageX - parentOffset.left + 10) + "px")
            .style("top", (d3.event.pageY - parentOffset.top - 20) + "px");

        me.tooltip.html(me.getNodeTooltip(nodeData));
    }).on("mouseout", function() {
        me.tooltip.transition().duration(500).style("opacity", 0);
    });
};

charts.DirectedGraph.prototype.redraw = function() {
    if(this.data) {
        this.updateGraph(this.data);
    }
};

charts.DirectedGraph.prototype.handleZoom = function() {
    $(this).children("g").attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
};

charts.DirectedGraph.prototype.clearSVG = function() {
    var svg = d3.select("#" + this.svgId);
    if(svg) {
        svg.remove();
    }
};

charts.DirectedGraph.prototype.getRenderWidth = function() {
    if(this.calculateWidth) {
        return this.calculateWidth();
    }
    if($(this.element[0]).width() !== 0) {
        return $(this.element[0]).width();
    }
    return charts.BarChart.DEFAULT_WIDTH;
};

charts.DirectedGraph.prototype.getRenderHeight = function() {
    if(this.calculateHeight) {
        return this.calculateHeight();
    }
    if($(this.element[0]).height() !== 0) {
        return $(this.element[0]).height();
    }
    return charts.BarChart.DEFAULT_HEIGHT;
};

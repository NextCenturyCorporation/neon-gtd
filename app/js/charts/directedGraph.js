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
charts.DirectedGraph = function(rootElement, selector, options) {
    this.rootElement = rootElement;
    this.chartSelector = selector;
    this.oldData = {
        nodes: [],
        links: []
    };

    this.tooltip = d3.select(rootElement)
        .append("div")
        .attr("class", "graph-tooltip")
        .style("opacity", 0);

    this.initializeGraphOptions(options || {});
    this.initializeGraphElement();
};

charts.DirectedGraph.prototype.initializeGraphOptions = function(options) {
    this.getRenderWidth = function() {
        if(options.getWidth) {
            if(_.isFunction(options.getWidth)) {
                return options.getWidth();
            }
            return options.getWidth;
        }
        if($(this.element[0]).width() !== 0) {
            return $(this.element[0]).width();
        }
        return this.DEFAULT_WIDTH;
    };

    this.getRenderHeight = function() {
        if(options.getHeight) {
            if(_.isFunction(options.getHeight)) {
                return options.getHeight();
            }
            return options.getHeight;
        }
        if($(this.element[0]).height() !== 0) {
            return $(this.element[0]).height();
        }
        return this.DEFAULT_HEIGHT;
    };

    this.getNodeSize = function(nodeData) {
        if(options.getNodeSize) {
            if(_.isFunction(options.getNodeSize)) {
                return options.getNodeSize(nodeData);
            }
            return options.getNodeSize;
        }
        return this.DEFAULT_NODE_SIZE;
    };

    this.getNodeColor = function(nodeData) {
        if(options.getNodeColor) {
            if(_.isFunction(options.getNodeColor)) {
                return options.getNodeColor(nodeData);
            }
            return options.getNodeColor;
        }
        return this.DEFAULT_NODE_COLOR;
    };

    this.getNodeText = function(nodeData) {
        if(options.getNodeText) {
            if(_.isFunction(options.getNodeText)) {
                return options.getNodeText(nodeData);
            }
            return options.getNodeText;
        }
        return "";
    };

    this.getNodeTooltip = function(nodeData) {
        if(options.getNodeTooltip) {
            if(_.isFunction(options.getNodeTooltip)) {
                return options.getNodeTooltip(nodeData);
            }
            return options.getNodeTooltip;
        }
        return nodeData.name || nodeData.id || "";
    };

    this.getLinkSize = function(linkData) {
        if(options.getLinkSize) {
            if(_.isFunction(options.getLinkSize)) {
                return options.getLinkSize(linkData);
            }
            return options.getLinkSize;
        }
        return this.DEFAULT_LINK_SIZE;
    };

    this.getNodeKeyFunction = options.getNodeKey;
    this.getLinkKeyFunction = options.getLinkKey;

    this.nodeClickHandler = function(nodeData) {
        if(d3.event.shiftKey && options.nodeShiftClickHandler) {
            options.nodeShiftClickHandler(nodeData);
        } else if(options.nodeClickHandler) {
            options.nodeClickHandler(nodeData);
        }
    };

    this.nodeDoubleClickHandler = function(nodeData) {
        if(options.nodeDoubleClickHandler) {
            options.nodeDoubleClickHandler(nodeData);
        }
    };
};

charts.DirectedGraph.prototype.initializeGraphElement = function() {
    var me = this;

    // Reset element here because it may not get set correctly in the constructor due to an odd race
    // condition issue with angularjs setting the graph's id using $scope.uniqueId.
    me.element = d3.select(me.rootElement).select(me.chartSelector);

    var height = me.getRenderHeight();
    var width = me.getRenderWidth();

    var svg = me.element.select(".directed-graph-svg");
    if(svg) {
        svg.remove();
    }

    me.svg = me.element.append("svg")
        .attr("class", "directed-graph-svg")
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

    me.forceLayout = d3.layout.force()
        .charge(-300)
        .linkDistance(100)
        .size([width, height])
        .gravity(0.05);

    me.forceLayoutNodes = me.forceLayout.nodes();
    me.forceLayoutLinks = me.forceLayout.links();
};

charts.DirectedGraph.prototype.updateGraphData = function(newData) {
    var i;

    newData.nodes = newData.nodes || [];
    newData.links = newData.links || [];

    // Update the data saved in the D3 force layout nodes.
    for(i = 0; i < Math.min(this.oldData.nodes.length, newData.nodes.length); ++i) {
        this.forceLayoutNodes[i] = newData.nodes[i];
    }

    // Add or remove D3 force layout nodes as necessary.
    if(this.oldData.nodes.length < newData.nodes.length) {
        for(i = this.oldData.nodes.length; i < newData.nodes.length; ++i) {
            this.forceLayoutNodes.push(newData.nodes[i]);
        }
    } else if(this.oldData.nodes.length > newData.nodes.length) {
        this.forceLayoutNodes.splice(newData.nodes.length, this.oldData.nodes.length);
    }

    // Update the data saved in the D3 force layout links.
    for(i = 0; i < Math.min(this.oldData.nodes.length, newData.links.length); ++i) {
        this.forceLayoutLinks[i] = newData.links[i];
    }

    // Add or remove D3 force layout links as necessary.
    if(this.oldData.links.length < newData.links.length) {
        for(i = this.oldData.links.length; i < newData.links.length; ++i) {
            this.forceLayoutLinks.push(newData.links[i]);
        }
    } else if(this.oldData.links.length > newData.links.length) {
        this.forceLayoutLinks.splice(newData.links.length, this.oldData.links.length);
    }
};

charts.DirectedGraph.prototype.updateGraph = function(newData) {
    var me = this;
    me.tooltip.style("opacity", 0);
    me.updateGraphData(newData);

    var lineElements;
    if(newData.links) {
        // Update the data saved in the D3 line elements.
        lineElements = me.vis.selectAll(".link").data(newData.links, me.getLinkKeyFunction);

        // Add new D3 line elements for new data as necessary.
        lineElements.enter().append("line").attr("class", "link");

        // Remove old data saved in the D3 line elements.
        lineElements.exit().remove();

        // Update the styling for all D3 line elements.
        lineElements.attr("marker-end", "url(#end)")
            .style("stroke", me.DEFAULT_LINK_STROKE_COLOR)
            .style("stroke-opacity", me.DEFAULT_LINK_STROKE_OPACITY)
            .style("stroke-width", me.getLinkSize);
    }

    // Update the data saved in the D3 circle elements.
    var circleElements = me.vis.selectAll(".node").data(newData.nodes, me.getNodeKeyFunction);

    // Add new D3 circle elements for new data as necessary.
    circleElements.enter().append("circle").attr("class", "node").call(me.forceLayout.drag)
        .on("click", me.nodeClickHandler)
        .on('dblclick', me.nodeDoubleClickHandler)
        .on("mouseover", me.createMouseoverHandler(me))
        .on("mouseout", me.createMouseoutHandler(me));

    // Remove old data saved in the D3 circle elements.
    circleElements.exit().remove();

    // Update the styling for all D3 circle elements.
    circleElements.attr("r", me.getNodeSize)
        .style("fill", me.getNodeColor)
        .style("stroke", me.DEFAULT_NODE_STROKE_COLOR)
        .style("stroke-width", me.DEFAULT_NODE_STROKE_SIZE);

    // Update the data saved in the D3 text elements.
    var textElements = me.vis.selectAll(".node-text").data(newData.nodes, me.getNodeKeyFunction);

    // Add new D3 text elements for new data as necessary.
    textElements.enter().append("text").attr("class", "node-text").call(me.forceLayout.drag)
        .on("click", me.nodeClickHandler)
        .on('dblclick', me.nodeDoubleClickHandler)
        .on("mouseover", me.createMouseoverHandler(me))
        .on("mouseout", me.createMouseoutHandler(me));

    // Remove old data saved in the D3 text elements.
    textElements.exit().remove();

    // Update the styling for all D3 text elements.
    textElements.attr("dy", "5px")
        .style("fill", me.DEFAULT_NODE_TEXT_COLOR)
        .style("text-anchor", "middle")
        .text(me.getNodeText);

    // The index of the force layout tick.
    var index = 1;
    // Whether the node data has been fixed.
    var fixed = false;

    circleElements.each(function(nodeData) {
        nodeData.fixed = false;
    });

    me.forceLayout.on("tick", function(event) {
        index = (event.alpha === 0.099 ? 1 : ++index);

        if(lineElements) {
            lineElements.attr("x1", me.getLinkStartXFunction(me))
                .attr("y1", me.getLinkStartYFunction(me))
                .attr("x2", me.getLinkEndXFunction(me))
                .attr("y2", me.getLinkEndYFunction(me));
        }

        //circleElements.each(me.getCollisionFunction());

        circleElements.attr("transform", function(nodeData) {
            return "translate(" + (nodeData.x) + "," + (nodeData.y) + ")";
        });

        textElements.attr("transform", function(nodeData) {
            return "translate(" + (nodeData.x) + "," + (nodeData.y) + ")";
        });

        // Fix the node data once the force layout has passed a specified alpha threshold or after a specified number of ticks.
        if(!fixed && (event.alpha < 0.025 || index > 250)) {
            fixed = true;
            // Set the fixed property to true to stop the force layout from moving nodes automatically.  They will only be movable through user dragging.
            circleElements.each(function(nodeData) {
                nodeData.fixed = true;
            });
        }
    });

    if(newData.nodes.length) {
        me.forceLayout.start();
    }

    // Save the data for future redraws.
    me.oldData = {
        nodes: newData.nodes,
        links: newData.links
    };
};

charts.DirectedGraph.prototype.redraw = function() {
    if(this.oldData) {
        this.updateGraph(this.oldData);
    }
};

charts.DirectedGraph.prototype.handleZoom = function() {
    $(this).children("g").attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
};

charts.DirectedGraph.prototype.createMouseoverHandler = function(me) {
    return function(nodeData) {
        var parentOffset = $(me.rootElement).offset();
        me.tooltip.transition().duration(200).style("opacity", 0.9)
            .style("left", (d3.event.pageX - parentOffset.left + 10) + "px")
            .style("top", (d3.event.pageY - parentOffset.top - 20) + "px");
        me.tooltip.html(me.getNodeTooltip(nodeData));
    };
};

charts.DirectedGraph.prototype.createMouseoutHandler = function(me) {
    return function() {
        me.tooltip.transition().duration(500).style("opacity", 0);
    };
};

charts.DirectedGraph.prototype.getLinkStartXFunction = function(me) {
    return function(linkData) {
        // Ensure the line starts at the radius of the source node so the line does not overlap the node.
        var sourceSize = me.getNodeSize(linkData.source);
        var length = Math.sqrt(Math.pow(linkData.source.y - linkData.target.y, 2) + Math.pow(linkData.source.x - linkData.target.x, 2));
        var scale = (length - sourceSize) / length;
        var offset = (linkData.source.x - linkData.target.x) - (linkData.source.x - linkData.target.x) * scale;
        return linkData.source.x - offset;
    };
};

charts.DirectedGraph.prototype.getLinkEndXFunction = function(me) {
    return function(linkData) {
        // Ensure the line ends at the radius of the target node so the arrowhead does not overlap the node.
        var targetSize = me.getNodeSize(linkData.target);
        var length = Math.sqrt(Math.pow(linkData.target.y - linkData.source.y, 2) + Math.pow(linkData.target.x - linkData.source.x, 2));
        var scale = (length - targetSize) / length;
        var offset = (linkData.target.x - linkData.source.x) - (linkData.target.x - linkData.source.x) * scale;
        return linkData.target.x - offset;
    };
};

charts.DirectedGraph.prototype.getLinkStartYFunction = function(me) {
    return function(linkData) {
        // Ensure the line starts at the radius of the source node so the line does not overlap the node.
        var sourceSize = me.getNodeSize(linkData.source);
        var length = Math.sqrt(Math.pow(linkData.source.y - linkData.target.y, 2) + Math.pow(linkData.source.x - linkData.target.x, 2));
        var scale = (length - sourceSize) / length;
        var offset = (linkData.source.y - linkData.target.y) - (linkData.source.y - linkData.target.y) * scale;
        return linkData.source.y - offset;
    };
};

charts.DirectedGraph.prototype.getLinkEndYFunction = function(me) {
    return function(linkData) {
        // Ensure the line ends at the radius of the target node so the arrowhead does not overlap the node.
        var targetSize = me.getNodeSize(linkData.target);
        var length = Math.sqrt(Math.pow(linkData.target.y - linkData.source.y, 2) + Math.pow(linkData.target.x - linkData.source.x, 2));
        var scale = (length - targetSize) / length;
        var offset = (linkData.target.y - linkData.source.y) - (linkData.target.y - linkData.source.y) * scale;
        return linkData.target.y - offset;
    };
};

charts.DirectedGraph.prototype.getCollisionFunction = function() {
    var me = this;
    var quadtree = d3.geom.quadtree(this.forceLayoutNodes);
    return function(d) {
        var r = 2 * me.getNodeSize(d) + 1;
        var nx1 = d.x - r;
        var nx2 = d.x + r;
        var ny1 = d.y - r;
        var ny2 = d.y + r;
        quadtree.visit(function(quad, x1, y1, x2, y2) {
            if(quad.point && (quad.point !== d)) {
                var x = d.x - quad.point.x;
                var y = d.y - quad.point.y;
                var l = Math.sqrt(x * x + y * y);
                if(l < r) {
                    l = (l - r) / l * 0.5;
                    d.x -= x *= l;
                    d.y -= y *= l;
                    quad.point.x += x;
                    quad.point.y += y;
                }
            }
            return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
        });
    };
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

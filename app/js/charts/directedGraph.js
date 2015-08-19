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

    if(opts.doubleClickHandler) {
        this.doubleClickHandler = opts.doubleClickHandler;
    }

    if(opts.shiftClickHandler) {
        this.shiftClickHandler = opts.shiftClickHandler;
    }

    if(opts.clickHandler) {
        this.clickHandler = opts.clickHandler;
    }

    this.calculateHeight = opts.calculateHeight;
    this.calculateWidth = opts.calculateWidth;
};

charts.DirectedGraph.prototype.DEFAULT_WIDTH = 600;
charts.DirectedGraph.prototype.DEFAULT_HEIGHT = 350;

charts.DirectedGraph.prototype.updateGraph = function(data) {
    var me = this;
    me.data = data;

    // Reset element here because it may not get set correctly in the constructor due to an odd race
    // condition issue with angularjs setting the graph's id using $scope.uniqueId.
    me.element = d3.select(me.rootElement).select(me.chartSelector);

    var nodes = data.nodes;

    var height = me.getRenderHeight();
    var width = me.getRenderWidth();

    var color = d3.scale.category10();

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

    me.svg.append("svg:defs").selectAll("marker")
        .data(["end"])      // Different link/path types can be defined here
        .enter().append("svg:marker")    // This section adds in the arrows
        .attr("id", String)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 15)
        .attr("refY", 0)
        .attr("markerWidth", 10)
        .attr("markerHeight", 10)
        .attr("orient", "auto")
        .attr("class", "arrowhead")
        .append("svg:path")
        .attr("d", "M0,-5L10,0L0,5");

    me.vis = me.svg
    .append('svg:g');

    var force = d3.layout.force()
        .charge(-300)
        .linkDistance(100)
        .size([width, height])
        .gravity(0.05);

    force
    .nodes(data.nodes);

    var link;
    if(data.links) {
        force.links(data.links);

        link = me.vis.selectAll(".link")
            .data(data.links)
            .enter().append("line")
            .attr("class", "link")
            .attr("marker-end", "url(#end)")
            .style("stroke-width", function(d) {
                return Math.sqrt(d.value);
            });
    }

    var node = me.vis.selectAll(".node")
        .data(nodes)
        .enter().append("g")
        .attr("class", "node")
        .append("circle")
        .attr("r", 5)
        .style("fill", function(d) {
            return color(d.group);
        })
        .call(force.drag);

    // The index of the force layout tick.
    var index = 1;
    // Whether the node data has been fixed (doesn't move unless dragged by the user).
    var fixed = false;

    var fixNodeData = function() {
        if(fixed) {
            return;
        }
        fixed = true;
        node.each(function(data) {
            data.fixed = true;
        });
    };

    force.on("tick", function(event) {
        index = (event.alpha === 0.099 ? 1 : ++index);

        if(link) {
            link.attr("x1", function(d) {
                    return d.source.x;
                })
                .attr("y1", function(d) {
                    return d.source.y;
                })
                .attr("x2", function(d) {
                    return d.target.x;
                })
                .attr("y2", function(d) {
                    return d.target.y;
                });
        }

        node.attr("cx", function(d) {
                return d.x ? d.x : 0;
            })
            .attr("cy", function(d) {
                return d.y ? d.y : 0;
            });

        if(event.alpha < 0.025 || index > 250) {
            fixNodeData();
        }
    });

    if(nodes.length) {
        force.start();
    }

    node.on('dblclick', function(d) {
        fixNodeData();
        if(me.doubleClickHandler) {
            me.doubleClickHandler(d);
        }
    }).on("click", function(d) {
        fixNodeData();
        if(d3.event.shiftKey && me.shiftClickHandler) {
            me.shiftClickHandler(d);
        } else if(me.clickHandler) {
            me.clickHandler(d);
        }
    }).on("mouseover", function(d) {
        var parentOffset = $(me.rootElement).offset();

        me.tooltip.transition()
            .duration(200)
            .style("opacity", 0.9);

        me.tooltip.html(d.name)
            .style("left", (d3.event.pageX - parentOffset.left + 10) + "px")
            .style("top", (d3.event.pageY - parentOffset.top - 20) + "px");
    }).on("mouseout", function() {
        me.tooltip.transition()
        .duration(500)
        .style("opacity", 0);
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

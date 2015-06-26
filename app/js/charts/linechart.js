'use strict';
/*
 * Copyright 2013 Next Century Corporation
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

charts.LineChart = function(rootElement, selector, opts) {
    opts = opts || {};
    this.chartSelector = selector;
    this.element = d3.select(rootElement).select(selector);

    this.xAttribute = opts.x;
    this.yAttribute = opts.y;
    this.margin = $.extend({}, charts.LineChart.DEFAULT_MARGIN, opts.margin || {});

    this.brush = undefined;
    this.brushHandler = undefined;

    // The old extent of the brush saved on brushstart.
    this.oldExtent = [];

    // The data index over which the user is currently hovering changed on mousemove and mouseout.
    this.dataIndex = -1;

    this.xDomain = [];

    this.hiddenSeries = [];

    this.colors = [];
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
    this.colorScale = d3.scale.ordinal().range(this.colorRange);

    this.categories = [];

    if(opts.responsive) {
        this.redrawOnResize();
    }
    return this;
};

charts.LineChart.DEFAULT_HEIGHT = 300;
charts.LineChart.DEFAULT_WIDTH = 600;
charts.LineChart.DEFAULT_MARGIN = {
    top: 20,
    bottom: 20,
    left: 0,
    right: 0
};
charts.LineChart.DEFAULT_STYLE = {};

charts.LineChart.prototype.determineWidth = function(element) {
    if(this.userSetWidth) {
        return this.userSetWidth;
    } else if($(element[0]).width() !== 0) {
        return $(element[0]).width();
    }
    return charts.LineChart.DEFAULT_WIDTH;
};

charts.LineChart.prototype.determineHeight = function(element) {
    if(this.userSetHeight) {
        return this.userSetHeight;
    } else if($(element[0]).height() !== 0) {
        return $(element[0]).height();
    }
    return charts.LineChart.DEFAULT_HEIGHT;
};

charts.LineChart.prototype.categoryForItem = function(item) {
    if(typeof this.xAttribute === 'function') {
        return this.xAttribute.call(this, item);
    }

    return item[this.xAttribute];
};

charts.LineChart.prototype.createCategories = function(data) {
    var me = this;
    return _.chain(data)
        .map(function(item) {
            return me.categoryForItem(item);
        })
        .unique()
        .filter(function(item) {
            return !_.isNull(item) && !_.isUndefined(item);
        })
        .sort(charts.LineChart.sortComparator)
        .value();
};

charts.LineChart.sortComparator = function(a, b) {
    if(a instanceof Date && b instanceof Date) {
        return charts.LineChart.compareValues(a.getTime(), b.getTime());
    }
    return charts.LineChart.compareValues(a, b);
};

charts.LineChart.compareValues = function(a, b) {
    if(a < b) {
        return -1;
    }
    if(a > b) {
        return 1;
    }
    return 0;
};

charts.LineChart.prototype.drawChart = function() {
    var me = this;

    $(this.element[0]).empty();

    me.height = me.determineHeight(me.element);
    me.width = me.determineWidth(me.element);

    me.svg = me.element.append("svg")
        .attr("width", me.width)
        .attr("height", me.height)
    .append("g")
        .attr("transform", "translate(" + me.margin.left + "," + me.margin.top + ")");
};

charts.LineChart.prototype.calculateColor = function(seriesObject) {
    var color = this.colorScale(seriesObject.series);
    var hidden = this.hiddenSeries.indexOf(seriesObject.series) >= 0 ? true : false;
    var index = -1;

    for(var i = this.colors.length - 1; i > -1; i--) {
        if(this.colors[i].series === seriesObject.series) {
            index = i;
        }
    }

    var colorObject = {
        color: color,
        series: seriesObject.series,
        total: seriesObject.total,
        min: seriesObject.min,
        max: seriesObject.max,
        data: seriesObject.data,
        hidden: hidden
    };

    // store the color in the registry so we know the color/series mappings
    if(index >= 0) {
        this.colors[index] = colorObject;
    } else {
        this.colors.push(colorObject);
    }

    return color;
};

charts.LineChart.prototype.getColorMappings = function() {
    var me = this;

    // convert to an array that is in alphabetical order for consistent iteration order
    // var sortedColors = [];
    // for (key in this.colors) {
    //     var color = me.colors[key];
    //     sortedColors.push({ 'color': color, 'series': key});
    // }

    return me.colors;
};

charts.LineChart.prototype.drawLines = function(opts) {
    /* jshint loopfunc:true */
    var me = this;
    var i = 0;

    if(!($.isArray(opts))) {
        opts = [opts];
    }

    me.data = opts;

    var fullDataSet = [];
    //get list of all data
    for(i = 0; i < opts.length; i++) {
        this.calculateColor(opts[i]);
        if(this.hiddenSeries.indexOf(opts[i].series) === -1) {
            fullDataSet = fullDataSet.concat(opts[i].data);
        }
    }

    me.x = d3.time.scale.utc()
    .range([0, (me.width - (me.margin.left + me.margin.right))], 0.25);

    me.xDomain = d3.extent(fullDataSet, function(d) {
        return d[me.xAttribute];
    });
    me.x.domain(me.xDomain);

    var xAxis = d3.svg.axis()
        .scale(me.x)
        .orient("bottom")
        .ticks(Math.round(me.width / 100));

    me.svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + (me.height - (me.margin.top + me.margin.bottom)) + ")")
        .call(xAxis);

    me.y = d3.scale.linear().range([(me.height - (me.margin.top + me.margin.bottom)), 0]);

    var yAxis = d3.svg.axis()
        .scale(me.y)
        .orient("right")
        .ticks(3);

    // Use lowest value or 0 for Y-axis domain, whichever is less (e.g. if negative)
    var minY = d3.min(fullDataSet, function(d) {
        return d[me.yAttribute];
    });
    minY = minY < 0 ? minY : 0;
    me.y.domain([minY, d3.max(fullDataSet, function(d) {
        return d[me.yAttribute];
    })]);

    var gridLines = me.svg.append("g").attr("class", "gridLines");

    gridLines.selectAll("line.horizontalGrid").data(me.y.ticks(3)).enter()
        .append("line")
            .attr({
                class: "horizontalGrid",
                x1: me.margin.right,
                x2: me.width,
                y1: function(d) {
                    return me.y(d);
                },
                y2: function(d) {
                    return me.y(d);
                }
            });

    // Hover line.
    var hoverLineGroup = me.svg.append("g")
        .attr("class", "hover-line");
    var hoverLine = hoverLineGroup
        .append("line")
            .attr("x1", 10).attr("x2", 10)
            .attr("y1", 0).attr("y2", me.height);
    // Add a date to appear on hover.
    hoverLineGroup.append('text')
        .attr("class", "hover-text hover-date")
        .attr('y', me.height + 20);

    // Hide hover line by default.
    hoverLineGroup.style("opacity", 1e-6);

    var cls;
    var data;
    var line;
    var hoverSeries = [];
    var hoverCircles = {};
    for(i = (opts.length - 1); i > -1; i--) {
        if(this.hiddenSeries.indexOf(opts[i].series) >= 0) {
            continue;
        }
        cls = (opts[i].series ? " " + opts[i].series : "");
        data = opts[i].data;

        hoverSeries.push(
            hoverLineGroup.append('text')
                .attr("class", "hover-text")
                .attr('y', me.height + 20)
        );

        var color = this.calculateColor(opts[i]);

        me.x.ticks().map(function(bucket) {
            return _.find(data, {
                date: bucket
            }) || {
                date: bucket,
                value: 0
            };
        });

        data.forEach(function(d) {
            d.date = d[me.xAttribute];
        });

        data = data.sort(function(a, b) {
            if(a.date < b.date) {
                return -1;
            } else if(a.date === b.date) {
                return 0;
            } else {
                return 1;
            }
        });

        line = d3.svg.line()
        .x(function(d) {
            return me.x(d.date);
        })
        .y(function(d) {
            return me.y(d[me.yAttribute]);
        });

        me.svg.append("path")
            .datum(data)
            .attr("class", "line" + cls)
            .attr("d", line)
            .attr("stroke", color);

        if(data.length < 40) {
            var func = function(d) {
                return me.x(d.date);
            };
            if(data.length === 1) {
                func = me.width / 2;
            }

            // Hide circle if point is a 0
            var isZero = function(d) {
                if(d[me.yAttribute] === 0) {
                    return 0;
                } else {
                    return 1;
                }
            };

            me.svg.selectAll("dot")
                .data(data)
            .enter().append("circle")
                .attr("class", "dot dot-empty")
                .attr("fill-opacity", isZero)
                .attr("stroke-opacity", isZero)
                .attr("stroke", color)
                .attr("r", 4)
                .attr("cx", func)
                .attr("cy", function(d) {
                    return me.y(d[me.yAttribute]);
                });
        }

        hoverCircles[opts[i].series] =
            me.svg.append("circle")
                .attr("class", "dot dot-hover")
                .attr("stroke", color)
                .attr("fill", color)
                .attr("stroke-opacity", 0)
                .attr("fill-opacity", 0)
                .attr("r", 4)
                .attr("cx", 0)
                .attr("cy", 0);
    }

    me.svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

    var tick = $(this.element).find('.x.axis').find('.tick.major').first();
    if(tick.length !== 0) {
        var transform = tick.attr('transform');
        var parts  = /translate\(\s*([^\s,)]+)[ ,]([^\s,)]+)/.exec(transform);
        var firstX = parseInt(parts[1]);
        var threshold = (tick[0].getBBox().width / 2);

        if(firstX < threshold) {
            tick.find('text').css('text-anchor', 'start');
        }

        tick = $(this.element).find('.x.axis').find('.tick.major').last();
        transform = tick.attr('transform');
        parts  = /translate\(\s*([^\s,)]+)[ ,]([^\s,)]+)/.exec(transform);
        firstX = parseInt(parts[1]);
        threshold = me.width - (tick[0].getBBox().width / 2);

        if(firstX > threshold) {
            tick.find('text').css('text-anchor', 'end');
        }
    }

    // Add mouseover events.
    this.element.on("mousemove", function() {
        if(opts && opts.length > 0) {
            var mouse_x = d3.mouse(this)[0];
            var graph_x = me.x.invert(mouse_x);
            var format = d3.time.format.utc('%e %B %Y');
            var numFormat = d3.format("0,000.00");
            var html = '';
            var bisect;
            var dataIndex;
            var dataIndexLeft;
            var dataDate;
            var dataDateLeft;
            var closerIndex;
            var closerDate;

            if(opts[0].data.length > 1) {
                bisect = d3.bisector(function(d) {
                    return d[me.xAttribute];
                }).right;
                dataIndex = bisect(opts[0].data, graph_x);
                // Adjust for out of range mouse events; Typical during a resize and some orientations.
                dataIndex = (dataIndex < opts[0].data.length) ? dataIndex : (opts[0].data.length - 1);
                dataDate = opts[0].data[dataIndex][me.xAttribute];
                closerDate = dataDate;
                closerIndex = dataIndex;
                me.dataIndex = dataIndex;

                if(dataIndex > 0) {
                    dataIndexLeft = (dataIndex - 1);
                    dataDateLeft = opts[0].data[dataIndexLeft][me.xAttribute];
                    var compare = ((me.x(dataDate) - me.x(dataDateLeft)) / 2) + me.x(dataDateLeft);
                    if(mouse_x < compare) {
                        closerDate = dataDateLeft;
                        closerIndex = dataIndexLeft;
                    }
                }
            } else {
                closerIndex = 0;
                closerDate = opts[0].data[closerIndex][me.xAttribute];
            }

            html = '<span class="tooltip-date">' + format(closerDate) + '</span>';

            for(var i = 0; i < opts.length; i++) {
                if(me.hiddenSeries.indexOf(opts[i].series) >= 0) {
                    continue;
                }
                var color = me.calculateColor(opts[i]);
                var xPos = me.x(closerDate);
                if(opts[i].data.length === 1) {
                    xPos = me.width / 2;
                }

                hoverCircles[opts[i].series]
                    .attr("stroke-opacity", 1)
                    .attr("fill-opacity", 1)
                    .attr("cx", xPos)
                    .attr("cy", me.y(opts[i].data[closerIndex].value));

                html += ('<span style="color: ' + color + '">' + opts[i].series + ": " +
                    numFormat(Math.round(opts[i].data[closerIndex].value * 100) / 100) + '</span>');
            }

            if(opts[0].data.length === 1) {
                hoverLine.attr("x1", me.width / 2).attr("x2", me.width / 2);
            } else {
                hoverLine.attr("x1", me.x(closerDate)).attr("x2", me.x(closerDate));
            }

            hoverLineGroup.style("opacity", 1);

            $("#tooltip-container").html(html);
            $("#tooltip-container").show();

            d3.select("#tooltip-container")
                .style("top", (d3.event.pageY)  + "px")
                .style("left", (d3.event.pageX + 15) + "px");
            XDATA.userALE.log({
                activity: "show",
                action: "mousemove",
                elementId: "linechart",
                elementType: "tooltip",
                elementSub: "linechart",
                elementGroup: "chart_group",
                source: "user",
                tags: ["tooltip", "linechart"]
            });
        }
    }).on("mouseout", function() {
        hoverLineGroup.style("opacity", 1e-6);
        me.svg.selectAll("circle.dot-hover")
            .attr("stroke-opacity", 0)
            .attr("fill-opacity", 0);
        me.dataIndex = -1;
        $("#tooltip-container").hide();
        XDATA.userALE.log({
                activity: "hide",
                action: "mouseout",
                elementId: "linechart",
                elementType: "tooltip",
                elementSub: "linechart",
                elementGroup: "chart_group",
                source: "user",
                tags: ["tooltip", "linechart"]
            });
    });
};

/**
 * Returns a function that runs the given brush handler using the extent from the D3 brush in the given linechart and logs the event.
 * @param {Object} linechart
 * @param {Function} brushHandler
 * @method runBrushHandler
 * @return {Function}
 */
charts.LineChart.prototype.runBrushHandler = function(linechart, brushHandler) {
    return function() {
        XDATA.userALE.log({
            activity: "select",
            action: "dragend",
            elementId: "linechart-brush",
            elementType: "canvas",
            elementSub: "linechart-brush",
            elementGroup: "chart_group",
            source: "user",
            tags: ["linechart", "brush"]
        });

        // If the user clicks on a date inside the brush without moving the brush, change the brush to contain only that date.
        if(linechart.dataIndex >= 0 && linechart.oldExtent[0]) {
            var extent = linechart.brush.extent();
            if(linechart.oldExtent[0].toDateString() === extent[0].toDateString() && linechart.oldExtent[1].toDateString() === extent[1].toDateString()) {
                var startDate = linechart.data[0].data[linechart.dataIndex].date;
                var endDate = linechart.data[0].data.length === linechart.dataIndex + 1 ? linechart.xDomain[1] : linechart.data[0].data[linechart.dataIndex + 1].date;
                linechart.brush.extent([startDate, endDate]);
            }
        }

        if(brushHandler) {
            brushHandler(linechart.brush.extent());
        }
    };
};

/**
 * Sets the brush handler function for this line chart to run the given function and log the event.
 * @param {Function} brushHandler
 * @method setBrushHandler
 */
charts.LineChart.prototype.setBrushHandler = function(brushHandler) {
    this.brushHandler = brushHandler;
    if(this.brush) {
        this.brush.on("brushend", this.runBrushHandler(this, this.brushHandler));
    }
};

/**
 * Draws the brush:  the highlighted filtered area.  Used the corresponding function in the timeline chart for reference.
 * @method drawBrush
 */
charts.LineChart.prototype.drawBrush = function() {
    var me = this;

    this.brush = d3.svg.brush().x(this.x).on("brush", function() {
        me.drawBrushMasks(this, me.brush);
    });

    if(this.brushHandler) {
        this.brush.on("brushstart", function() {
            me.oldExtent = me.brush.extent();
            XDATA.userALE.log({
                activity: "select",
                action: "dragstart",
                elementId: "linechart-brush",
                elementType: "canvas",
                elementSub: "linechart-brush",
                elementGroup: "chart_group",
                source: "user",
                tags: ["linechart", "brush"]
            });
        });
        this.brush.on("brushend", this.runBrushHandler(this, this.brushHandler));
    }

    var d3Brush = this.svg.append("g").attr("class", "brush");

    d3Brush.append("rect")
        .attr("x", this.width + this.margin.right)
        .attr("y", -6)
        .attr("width", this.width)
        .attr("height", this.height + 7)
        .attr("class", "mask mask-east");

    d3Brush.append("rect")
        .attr("x", this.width + this.margin.left)
        .attr("y", -6)
        .attr("width", this.width)
        .attr("height", this.height + 7)
        .attr("class", "mask mask-west");

    d3Brush.call(this.brush);

    d3Brush.selectAll("rect").attr("y", -6).attr("height", this.height + 7);

    d3Brush.selectAll(".e").append("rect")
        .attr("y", -6)
        .attr("width", 1)
        .attr("height", this.height + 6)
        .attr("class", "resize-divider");

    d3Brush.selectAll(".w").append("rect")
        .attr("x", -1)
        .attr("y", -6)
        .attr("width", 1)
        .attr("height", this.height + 6)
        .attr("class", "resize-divider");

    var height = this.height;
    d3Brush.selectAll(".resize").append("path").attr("d", function(d) {
        var e = +(d === "e");
        var x = e ? 1 : -1;
        var y = height / 3;
        return "M" + (0.5 * x) + "," + y +
            "A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6) +
            "V" + (2 * y - 6) +
            "A6,6 0 0 " + e + " " + (0.5 * x) + "," + (2 * y) +
            "Z" +
            "M" + (2.5 * x) + "," + (y + 8) +
            "V" + (2 * y - 8) +
            "M" + (4.5 * x) + "," + (y + 8) +
            "V" + (2 * y - 8);
    });
};

/**
 * Draws the brush masks:  the grayed unfiltered areas outside the brush.  Used the corresponding function in the timeline chart for reference.
 * @param {Object} element
 * @param {Object} brush
 * @method drawBrushMasks
 */
charts.LineChart.prototype.drawBrushMasks = function(element, brush) {
    if(d3.event) {
        var timeFunction = d3.time.day.utc;
        var oldExtent = brush.extent();
        var newExtent;

        if(!oldExtent[0] || !oldExtent[1]) {
            return;
        }

        if(d3.event.mode === "move") {
            var startDay = timeFunction.round(oldExtent[0]);
            var range = timeFunction.range(oldExtent[0], oldExtent[1]);
            var endDay = timeFunction.offset(startDay, range.length);
            newExtent = [startDay, endDay];
        } else {
            newExtent = oldExtent.map(timeFunction.round);

            if(newExtent[0] >= newExtent[1]) {
                newExtent[0] = timeFunction.floor(oldExtent[0]);
                newExtent[1] = timeFunction.ceil(oldExtent[1]);
            }
        }

        if(newExtent[0] < newExtent[1]) {
            d3.select(element).call(brush.extent(newExtent));
        }
    }

    var brushElement = $(element);
    var extentX = brushElement.find(".extent").attr("x");
    var extentWidth = brushElement.find(".extent").attr("width");
    var width = parseInt(brushElement.find(".mask-west").attr("width").replace("px", ""), 10);

    if(extentWidth === "0" || !extentWidth) {
        brushElement.find(".mask-west").attr("x", (0 - (width + 50)));
        brushElement.find(".mask-east").attr("x", (width + 50));
    } else {
        brushElement.find(".mask-west").attr("x", (parseFloat(extentX) - width));
        brushElement.find(".mask-east").attr("x", (parseFloat(extentX) + parseFloat(extentWidth)));
    }
};

/**
 * Clears the D3 brush.
 * @method clearBrush
 */
charts.LineChart.prototype.clearBrush = function() {
    this.brush.clear();
    d3.select(this.element).select(".brush").call(this.brush);
};

/**
 * Renders the given brush extent.
 * @param {Array} extent
 * @method renderBrushExtent
 */
charts.LineChart.prototype.renderBrushExtent = function(extent) {
    if(!extent) {
        this.clearBrush();
        return;
    }

    var brushElement = this.svg.select(".brush");
    brushElement.call(this.brush.extent(extent));
    this.drawBrushMasks(brushElement[0][0], this.brush);
};

charts.LineChart.prototype.toggleSeries = function(series) {
    var index = this.hiddenSeries.indexOf(series);
    var activity = '';
    if(index >= 0) {
        this.hiddenSeries.splice(index, 1);
        activity = 'show';
    } else {
        this.hiddenSeries.push(series);
        activity = 'hide';
    }

    if(this.data && this.hiddenSeries.length >= this.data.length) {
        this.hiddenSeries.splice(0);
    }

    this.draw();

    return activity;
};

/**
 * Draws this line chart.  Sets its data to the new data if given.
 * @param {Array} data (Optional)
 * @method draw
 */
charts.LineChart.prototype.draw = function(data) {
    var extent = this.brush ? this.brush.extent() : undefined;
    this.drawChart();
    if(data) {
        this.data = data;
    }
    if(this.data) {
        this.drawLines(this.data);
    }
    this.drawBrush();
    if(extent) {
        this.renderBrushExtent(extent);
    }
};

charts.LineChart.prototype.redrawOnResize = function() {
    var me = this;

    function drawChart() {
        me.draw();
    }

    // Debounce is needed because browser resizes fire this resize even multiple times.
    // Cache the handler so we can remove it from the window on destroy.
    me.resizeHandler = _.debounce(drawChart, 10);
    $(window).resize(me.resizeHandler);
};

charts.LineChart.prototype.destroy = function() {
    $(window).off('resize', this.resizeHandler);
    $(this.element[0]).empty();
};

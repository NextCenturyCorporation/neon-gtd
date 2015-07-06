'use strict';
/*
 * Copyright 2014 Next Century Corporation
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
charts = charts || {};
/**
 * This directive adds a timeline chart to the DOM using the D3 library.
 * The timeline will scale its x-axis labels based upon the amount of time covered in
 * the data to be plotted.  The timeline uses an area plot to show the change in values over time
 * on a broad scale.  It is meant for relative analysis and not detailed analysis.  To that end,
 * y-axis labels are not displayed by default.
 *
 * This class is modeled after portions of the <a href="http://bl.ocks.org/mbostock/1667367#index.html">Focus
 * + Context via Brushing</a> D3 JS example.
 *
 * @class charts.TimelineSelectorChart
 * @constructor
 */
charts.TimelineSelectorChart = function(element, configuration) {
    // Create a default data set when we have no records to display.  It defaults to a year from present day.
    var DEFAULT_DATA = [
        {
            date: new Date(Date.now()),
            value: 0
        },
        {
            date: new Date(Date.now() + 31536000000),
            value: 0
        }
    ];

    // Cache our element.
    this.element = element;
    this.d3element = d3.select(element);
    this.baseHeight = 250;
    this.brushHandler = undefined;
    this.data = DEFAULT_DATA;
    this.primarySeries = false;
    this.granularity = 'day';
    this.dateFormats = {
        year: '%Y',
        month: '%b %Y',
        day: '%d-%b-%Y',
        hour: '%d-%b-%Y %H:%M'
    };
    this.TOOLTIP_ID = 'tooltip';
    this.xDomain = [];

    // The old extent of the brush saved on brushstart.
    this.oldExtent = [];

    // The data index over which the user is currently hovering changed on mousemove and mouseout.
    this.dataIndex = -1;

    var self = this; // for internal d3 functions

    /**
     * Initializes the internal attributes of the chart.  A configuration object can be provided to
     * override defaults.
     * @param {Object} configuration
     * @param {Number} configuration.height
     * @param {Object} configuration.marginFocus Margin overrides for each side on the focus chart
     * @param {Number} configuration.marginFocus.bottom
     * @param {Number} configuration.marginFocus.left
     * @param {Number} configuration.marginFocus.right
     * @param {Number} configuration.marginFocus.top
     * @param {Object} configuration.marginContext Margin overrides for each side on the context chart
     * @param {Number} configuration.marginContext.bottom
     * @param {Number} configuration.marginContext.left
     * @param {Number} configuration.marginContext.right
     * @param {Number} configuration.marginContext.top
     * @param {Number} configuration.width
     * @return charts.TimelineSelectorChart
     * @method configure
     */
    this.configure = function(configuration) {
        this.config = configuration || {};
        this.config.marginFocus = this.config.marginFocus || {
            top: 0,
            right: 15,
            bottom: this.baseHeight,
            left: 15
        };
        this.config.marginContext = this.config.marginContext || {
            top: 22,
            right: 15,
            bottom: 18,
            left: 15
        };
        this.granularity = this.config.granularity || this.granularity;
        this.redrawOnResize();

        return this;
    };

    this.determineWidth = function(element) {
        if(this.config.width) {
            return this.config.width;
        } else if($(element[0]).width() !== 0) {
            return ($(element[0]).width());
        }
        return 1000;
    };

    this.determineHeight = function(element) {
        if(this.config.height) {
            return this.config.height;
        } else if($(element[0]).height() !== 0) {
            return ($(element[0]).height());
        }
        return 40;
    };

    /**
     * Since the default brush handlers return no data, this will allow client code to assign a handler to the brush end event.
     * This function wraps that handler and injects the current brush extent into its arguments.
     * @param {Object} timeline This timeline chart.
     * @param {Function} handler A brush handler.  The extent date objects will be passed to the handler as an array in a single argument
     * @return {Function}
     * @method wrapBrushHandler
     * @private
     */
    var wrapBrushHandler = function(timeline, handler) {
        return function() {
            if(timeline.brush) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "dragend",
                    elementId: "timeline-brush",
                    elementType: "canvas",
                    elementSub: "timeline-brush",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["timeline", "brush"]
                });

                // If the user clicks on a date inside the brush without moving the brush, change the brush to contain only that date.
                if(timeline.dataIndex >= 0 && timeline.oldExtent[0]) {
                    var extent = timeline.brush.extent();
                    if(timeline.oldExtent[0].toDateString() === extent[0].toDateString() && timeline.oldExtent[1].toDateString() === extent[1].toDateString()) {
                        var startDate = timeline.data[0].data[timeline.dataIndex].date;
                        var endDate = timeline.data[0].data.length === timeline.dataIndex + 1 ? timeline.xDomain[1] : timeline.data[0].data[timeline.dataIndex + 1].date;
                        timeline.brush.extent([startDate, endDate]);
                    }
                }

                if(handler) {
                    handler(timeline.brush.extent());
                }
            }
        };
    };

    /**
     * Adds a brush end handler to the timeline chart.
     * @param {function} handler A brush handler.  The extent date objects will be passed to the handler as an array in a single argument
     * @method addBrushHandler
     */
    this.addBrushHandler = function(handler) {
        if(typeof(handler) === 'function') {
            this.brushHandler = handler;
            if(this.brush) {
                this.brush.on("brushend", wrapBrushHandler(this, handler));
            }
        }
    };

    /**
     * Clears the brush from the timeline.
     * @method clearBrush
     */
    this.clearBrush = function() {
        this.brush.clear();
        d3.select(this.element).select('.brush').call(this.brush);
        if(this.data.length && this.data[0].data) {
            this.render(this.data);
        }
    };

    /**
     * Updates the positions of the east and west timeline masks for unselected areas
     * @method updateMask
     */
    this.updateMask = function() {
        var brush = self.brush;

        // Snap brush
        if(d3.event) {
            var timeFunction = d3.time[self.granularity].utc;

            var extent0 = brush.extent();
            var extent1;

            if(typeof extent0[0] === 'undefined' || typeof extent0[1] === 'undefined') {
                d3.select(this).call(brush.clear());
            } else {
                // if dragging, preserve the width of the extent
                if(d3.event.mode === "move") {
                    var d0 = timeFunction.round(extent0[0]);
                    var range = timeFunction.range(extent0[0], extent0[1]);
                    var d1 = timeFunction.offset(d0, range.length);
                    extent1 = [d0, d1];
                } else {
                    extent1 = extent0.map(timeFunction.round);

                    // if empty when rounded, use floor & ceil instead
                    if(extent1[0] >= extent1[1]) {
                        extent1[0] = timeFunction.floor(extent0[0]);
                        extent1[1] = timeFunction.ceil(extent0[1]);
                    }
                }

                if(extent1[0] < extent1[1]) {
                    d3.select(".brush").call(brush.extent(extent1));
                }
            }
        }

        // Update mask
        var brushElement = $(".brush");
        var xPos = brushElement.find('.extent').attr('x');

        var extentWidth = brushElement.find('.extent').attr('width');
        var width = parseInt(brushElement.find('.mask-west').attr('width').replace('px', ''), 10);

        // If brush extent has been cleared, reset mask positions
        if(extentWidth === "0" || extentWidth === 0 || extentWidth === undefined) {
            brushElement.find('.mask-west').attr('x', (0 - (width + 50)));
            brushElement.find('.mask-east').attr('x', width + 50);
        } else {
            // Otherwise, update mask positions to new extent location
            brushElement.find('.mask-west').attr('x', parseFloat(xPos) - width);
            brushElement.find('.mask-east').attr('x', parseFloat(xPos) + parseFloat(extentWidth));
        }

        updateFocusChart();
    };

    /**
     * Shows/Hides the focus graph
     * @param {boolean} showFocus Set to true to show the focus graph. False otherwise.
     * @method toggleFocus
     */
    this.toggleFocus = function(showFocus) {
        if(showFocus) {
            this.configure({
                marginFocus: {
                    top: 22,
                    right: 15,
                    bottom: 99,
                    left: 15
                },
                marginContext: {
                    top: 185,
                    right: 15,
                    bottom: 18,
                    left: 15
                }
            });
        } else {
            this.configure();
        }

        if(this.data.length && this.data[0].data) {
            this.redrawChart();
        }
    };

    /**
     * This will re-render the control with the given values.  This is a costly method and calls to it should be minimized
     * where possible.  Also, it is destructive in that the entire chart and associated time selector brush are recreated.
     * Currently, this has the side effect of removing any brush handlers that were previously added.  Handlers should be
     * reattached after this renders.
     * @param {Array} values An array of objects that consiste of a date and value field
     * @param {Date} values.date A date which will make up a value for the x-axis
     * @param {Number} values.value A number which will be plotted on the y-axis
     * @method render
     */
    this.render = function(values) {
        var me = this;
        var i = 0;
        this.width = this.determineWidth(this.d3element) - this.config.marginFocus.left - this.config.marginFocus.right;
        // Depending on the granularity, the bars are not all the same width (months are different
        // lengths). But this is accurate enough to place tick marks and make other calculations.
        this.approximateBarWidth = 0;

        $(this.d3element[0]).css("height", (this.baseHeight * values.length));
        this.heightFocus = (this.baseHeight - (this.config.marginFocus.top) - this.config.marginFocus.bottom);
        var heightContext = (this.baseHeight - (this.config.marginContext.top) - this.config.marginContext.bottom);
        var svgHeight = this.determineHeight(this.d3element);

        var fullDataSet = [];
        if(values && values.length > 0) {
            this.data = values;
            // Get list of all data to calculate min/max and domain
            for(i = 0; i < values.length; i++) {
                fullDataSet = fullDataSet.concat(values[i].data);
                if(values[i].data && !this.approximateBarWidth) {
                    this.approximateBarWidth = (this.width / values[i].data.length);
                }
            }
        }

        // Setup the axes and their scales.
        this.xFocus = d3.time.scale.utc().range([0, this.width]);
        this.xContext = d3.time.scale.utc().range([0, this.width]);

        // Save the brush as an instance variable to allow interaction on it by client code.
        this.brush = d3.svg.brush().x(this.xContext).on("brush", this.updateMask);

        if(this.brushHandler) {
            this.brush.on("brushstart", function() {
                me.oldExtent = me.brush.extent();
                XDATA.userALE.log({
                    activity: "select",
                    action: "dragstart",
                    elementId: "timeline-brush",
                    elementType: "canvas",
                    elementSub: "timeline-brush",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["timeline", "brush"]
                });
            });
            this.brush.on("brushend", wrapBrushHandler(this, this.brushHandler));
        }

        function resizePath(d) {
            var e = +(d === "e");
            var x = e ? 1 : -1;
            var y = heightContext / 3;
            return "M" + (0.5 * x) + "," + y +
                "A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6) +
                "V" + (2 * y - 6) +
                "A6,6 0 0 " + e + " " + (0.5 * x) + "," + (2 * y) +
                "Z" +
                "M" + (2.5 * x) + "," + (y + 8) +
                "V" + (2 * y - 8) +
                "M" + (4.5 * x) + "," + (y + 8) +
                "V" + (2 * y - 8);
        }

        var xMin = d3.min(fullDataSet.map(function(d) {
            return d.date;
        }));
        var xMax = d3.max(fullDataSet.map(function(d) {
            return d3.time[me.granularity].utc.offset(d.date, 1);
        }));

        this.xDomain = [xMin, xMax];
        this.xFocus.domain(this.xDomain);
        this.xContext.domain(this.xDomain);

        this.xAxisFocus = d3.svg.axis().scale(this.xFocus).orient("bottom");
        var xAxisContext = d3.svg.axis().scale(this.xContext).orient("bottom");

        // We don't want the ticks to be too close together, so calculate the most ticks that
        // comfortably fit on the timeline
        var maximumNumberOfTicks = Math.round(this.width / 100);
        // We don't want to have more ticks than buckets (e.g., monthly buckets with daily ticks
        // look funny)
        var minimumTickRange = d3.time[this.granularity].utc.range;
        if(this.xFocus.ticks(minimumTickRange).length < maximumNumberOfTicks) {
            // There's enough room to do one tick per bucket
            this.xAxisFocus.ticks(minimumTickRange);
            xAxisContext.ticks(minimumTickRange);
        } else {
            // One tick per bucket at this granularity is too many; let D3 figure out tick spacing.
            // Note that D3 may give us a few more ticks than we specify if it feels like it.
            this.xAxisFocus.ticks(maximumNumberOfTicks);
            xAxisContext.ticks(maximumNumberOfTicks);
        }

        // Clear the old contents by replacing innerhtml.
        d3.select(this.element).html('');

        // Append our chart graphics
        this.svg = d3.select(this.element)
            .attr("class", "timeline-selector-chart")
            .append("svg")
            .attr("height", svgHeight + this.config.marginFocus.left + this.config.marginFocus.right)
            .attr("width", this.width + this.config.marginFocus.left + this.config.marginFocus.right);

        this.svg.append("defs").append("clipPath")
            .attr("id", "clip")
            .append("rect")
            .attr("width", this.width - this.config.marginFocus.left - this.config.marginFocus.right)
            .attr("height", svgHeight);

        var context = this.svg.append("g")
            .attr("class", "context")
            .attr("transform", "translate(" + this.config.marginContext.left + "," + this.config.marginContext.top + ")");

        context.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + heightContext + ")")
            .call(xAxisContext);

        context.selectAll('.major text')
            .attr('transform', 'translate(' + (this.approximateBarWidth / 2) + ',0)');

        context.selectAll('.major line')
            .attr('transform', 'translate(' + (this.approximateBarWidth / 2) + ',0)');

        // Render a series
        var seriesPos = 0;
        var createSeries = function(series) {
            var xOffset = me.approximateBarWidth / 2;
            if(series.type === 'bar') {
                xOffset = 0;
            }

            var focus = me.svg.append("g")
                .attr("class", "focus-" + series.name)
                .attr("transform", "translate(" + me.config.marginFocus.left + "," + me.config.marginFocus.top + ")");

            // Prevents the x-axis from being shown
            if(me.config.marginFocus.bottom === me.baseHeight) {
                focus.attr("display", "none");
            }

            focus.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + me.heightFocus + ")")
                .call(me.xAxisFocus);

            focus.selectAll('.major text')
                .attr('transform', 'translate(' + (me.approximateBarWidth / 2) + ',0)');

            focus.selectAll('.major line')
                .attr('transform', 'translate(' + (me.approximateBarWidth / 2) + ',0)');

            var focusContainer = focus.append("g")
                .attr("class", series.name)
                .attr("transform", "translate(" + xOffset + "," + ((me.heightFocus + (me.config.marginFocus.top * 2) + me.config.marginFocus.bottom) * seriesPos) + ")")
                .on('mousemove', function() {
                    var mouseLocation = d3.mouse(this);
                    var graph_x = me.xFocus.invert(mouseLocation[0]);

                    var bisect = d3.bisector(function(d) {
                        return d.date;
                    }).right;
                    var dataIndex = bisect(values[0].data, graph_x) - 1;
                    if(dataIndex >= 0 && dataIndex < values[0].data.length) {
                        showTooltip(values[0].data[dataIndex], d3.event);
                    }
                })
                .on('mouseout', function() {
                    hideTooltip();
                });

            var axis = me.drawFocusChart(series);
            var yFocus = axis.y;
            var yAxis = axis.yAxis;
            var yContext = d3.scale.linear().range([heightContext, 0]);
            yContext.domain(yFocus.domain());
            
            var contextContainer;

            // Only had context timeline on first chart (for when there are multiple charts)
            if(series.name === me.primarySeries.name) {
                contextContainer = context.append("g")
                    .attr("class", series.name)
                    .attr("transform", "translate(" + xOffset + "," + ((heightContext + me.config.marginContext.top + me.config.marginContext.bottom) * seriesPos) + ")");
            
                var style = 'stroke:' + series.color + ';';
                var chartTypeFocus = '', chartTypeContext = '';

                // For now, all anomalies are shown as red, but this could be changed to be a
                // configurable parameter that is passed in with the series, like series.color.
                var anomalyColor = 'red';

                // If type is bar AND the data isn't too long, render a bar plot
                if(series.type === 'bar' && series.data.length < me.width) {
                    var barheight = 0;

                    if(series.data.length < 60) {
                        style = 'stroke:#f1f1f1;';
                        barheight++;
                    }
                    
                    var anomalyStyle = style + 'fill: ' + anomalyColor + '; stroke: ' + anomalyColor + ';';
                    style += 'fill:' + series.color + ';';

                    contextContainer.selectAll(".bar")
                        .data(series.data)
                    .enter().append("rect")
                        .attr("class", function(d) {
                            return "bar " + d.date;
                        })
                        .attr("style", function(d) {
                            return d.anomaly ? anomalyStyle : style;
                        })
                        .attr("x", function(d) {
                            return me.xContext(d.date);
                        })
                        .attr("width", function(d) {
                            return me.xContext(d3.time[me.granularity].utc.offset(d.date, 1)) - me.xContext(d.date);
                        })
                        .attr("y", function(d) {
                            return yContext(Math.max(0, d.value));
                        })
                        .attr("height", function(d) {
                            var height = yContext(d.value) - yContext(0);
                            var offset = height / height || 0;
                            var calculatedHeight = Math.abs(height) + (offset * barheight);
                            return calculatedHeight;
                        });
                } else {
                    // If type is line, render a line plot
                    if(series.type === 'line') {
                        chartTypeContext = d3.svg.line()
                            .x(function(d) {
                                return me.xContext(d.date);
                            })
                            .y(function(d) {
                                return yContext(d.value);
                            });
                    } else {
                        // Otherwise, default to area, e.g. for bars whose data is too long
                        style += 'fill:' + series.color + ';';
                        chartTypeContext = d3.svg.area()
                            .x(function(d) {
                                return me.xContext(d.date);
                            })
                            .y0(function(d) {
                                return yContext(Math.min(0, d.value));
                            })
                            .y1(function(d) {
                                return yContext(Math.max(0, d.value));
                            });
                    }

                    contextContainer.append("path")
                        .datum(series.data)
                        .attr("class", series.type)
                        .attr("d", chartTypeContext)
                        .attr("style", style);

                    if(series.data.length < 80) {
                        var func = function(d) {
                            return me.xContext(d.date);
                        };
                        if(series.data.length === 1) {
                            func = width / 2;
                        }

                        contextContainer.selectAll("dot")
                            .data(series.data)
                        .enter().append("circle")
                            .attr("class", "dot")
                            .attr("style", 'fill:' + series.color + ';')
                            .attr("r", 3)
                            .attr("cx", func)
                            .attr("cy", function(d) {
                                return yContext(d.value);
                            });
                    } else {
                        // If a line graph was used and there are anomalies, put a circle on the
                        // anomalous points
                        var anomalies = series.data.filter(function(it) {
                            return it.anomaly === true;
                        });

                        contextContainer.selectAll("dot")
                            .data(anomalies)
                        .enter().append("circle")
                            .attr("class", "dot")
                            .attr("style", 'fill:' + anomalyColor + ';')
                            .attr("r", 3)
                            .attr("cx", function(d) {
                                return me.xContext(d.date);
                            })
                            .attr("cy", function(d) {
                                return yContext(d.value);
                            });
                    }
                }
            }

            focusContainer.append("line")
                .attr({
                    class: "mini-axis",
                    x1: 0,
                    x2: me.width - (xOffset * 2),
                    y1: yFocus(0),
                    y2: yFocus(0)
                });

            charts.push({
                name: series.name,
                color: series.color,
                yAxis: yAxis,
                index: seriesPos
            });

            seriesPos++;
        };

        var charts = [];
        // If set, render primary series first
        if(this.primarySeries) {
            createSeries(this.primarySeries);
        }
        // Render all series
        for(i = 0; i < values.length; i++) {
            if(this.primarySeries && values[i].name === this.primarySeries.name) {
                continue;
            }
            createSeries(values[i]);
        }

        var gBrush = context.append("g")
            .attr("class", "brush")
            .on('mousemove', function() {
                var mouseLocation = d3.mouse(this);
                var graph_x = me.xContext.invert(mouseLocation[0]);

                var bisect = d3.bisector(function(d) {
                    return d.date;
                }).right;
                var dataIndex = bisect(values[0].data, graph_x) - 1;
                if(dataIndex >= 0 && dataIndex < values[0].data.length) {
                    showTooltip(values[0].data[dataIndex], d3.event);
                    me.dataIndex = dataIndex;
                }
            })
            .on('mouseout', function() {
                hideTooltip();
                me.dataIndex = -1;
            });

        gBrush.append("rect")
            .attr("x", this.width + this.config.marginContext.right)
            .attr("y", -6)
            .attr("width", this.width)
            .attr("height", heightContext + 7)
            .attr("class", "mask mask-east");

        gBrush.append("rect")
            .attr("x", (0 - (this.width + this.config.marginContext.left)))
            .attr("y", -6)
            .attr("width", this.width)
            .attr("height", heightContext + 7)
            .attr("class", "mask mask-west");

        gBrush.call(this.brush);

        gBrush.selectAll("rect")
            .attr("y", -6)
            .attr("height", heightContext + 7);

        gBrush.selectAll(".e")
            .append("rect")
            .attr("y", -6)
            .attr("width", 1)
            .attr("height", heightContext + 6)
            .attr("class", "resize-divider");

        gBrush.selectAll(".w")
            .append("rect")
            .attr("x", -1)
            .attr("y", -6)
            .attr("width", 1)
            .attr("height", heightContext + 6)
            .attr("class", "resize-divider");

        gBrush.selectAll(".resize")
            .append("path")
            .attr("d", resizePath);

        for(i = 0; i < charts.length; i++) {
            var focus = me.svg.select(".focus-" + charts[i].name);

            focus.append("g")
                .attr("class", "y axis series-y")
                .attr("transform", "translate(0," + ((me.heightFocus + (this.config.marginFocus.top * 2) + this.config.marginFocus.bottom) * charts[i].index) + ")")
                .call(charts[i].yAxis);

            focus.append("text")
                .attr("class", "series-title")
                .attr("fill", charts[i].color)
                .attr("transform", "translate(0," + (((me.heightFocus + (this.config.marginFocus.top * 2) + this.config.marginFocus.bottom) * charts[i].index) - 5) + ")")
                .text(charts[i].name + " - Filtered");
        }

        if(this.primarySeries) {
            context.append("text")
                .attr("class", "series-title")
                .attr("fill", this.primarySeries.color)
                .attr("transform", "translate(0, 5)")
                .text(this.primarySeries.name);
        }
    };

    this.updatePrimarySeries = function(series) {
        this.primarySeries = series;
    };

    this.updateGranularity = function(granularity) {
        this.granularity = granularity;
    };

    this.redrawChart = function() {
        var extent = this.brush.extent();
        this.render(this.data);
        this.renderExtent(extent);
    };

    this.redrawOnResize = function() {
        var me = this;

        function drawChart() {
            me.redrawChart();
        }

        // Debounce is needed because browser resizes fire this resize even multiple times.
        // Cache the handler so we can remove it from the window on destroy.
        me.resizeHandler = _.debounce(drawChart, 10);
        $(window).resize(me.resizeHandler);
    };

    this.renderExtent = function(extent) {
        var brushElement = this.svg.select(".brush");
        brushElement.call(this.brush.extent(extent));
        this.updateMask.apply(brushElement[0][0]);
    };

    /*
     * Draws all the necessary components for the focus chart using only the data within the brushed area (if any)
     * @param {Object} series An object containing all the necessary information to draw the data on a graph
     * @param {String} series.color Hex color for the graph
     * @param {String} series.data An array of objects that consist of a date and value field
     * @param {String} series.name Name of the series
     * @param {String} series.type Type of graph to draw (bar or line)
     * @return {Object} An object consisting of y (the y scale of the graph) and yAxis (the y axis of the graph)
     * @method drawFocusChart
     */
    this.drawFocusChart = function(series) {
        var me = this;

        me.svg.select(".focus-" + series.name).select(".x.axis").call(me.xAxisFocus);
        
        var focus = me.svg.select(".focus-" + series.name + " ." + series.name);

        var y = d3.scale.linear().range([me.heightFocus, 0]);

        // Get only the data in the brushed area
        var dataShown = _.filter(series.data, function(obj) {
            return (me.xFocus.domain()[0] <= obj.date && obj.date < me.xFocus.domain()[1]);
        });

        // Use lowest value or 0 for Y-axis domain, whichever is less (e.g. if negative)
        var minY = d3.min(dataShown.map(function(d) {
            return d.value;
        }));
        minY = minY < 0 ? minY : 0;

        y.domain([minY, d3.max(dataShown.map(function(d) {
            return d.value;
        }))]);

        var yAxis = d3.svg.axis().scale(y).orient("right").ticks(2);

        focus.select(".y.axis.series-y").call(yAxis);

        var style = 'stroke:' + series.color + ';';
        
        // For now, all anomalies are shown as red, but this could be changed to be a
        // configurable parameter that is passed in with the series, like series.color.
        var anomalyColor = 'red';

        // If type is bar AND the data isn't too long, render a bar plot
        if(series.type === 'bar' && series.data.length < me.width) {
            var barheight = 0;

            if(series.data.length < 60) {
                style = 'stroke:#f1f1f1;';
                barheight++;
            }

            var anomalyStyle = style + 'fill: ' + anomalyColor + '; stroke: ' + anomalyColor + ';';
            style += 'fill:' + series.color + ';';

            focus.selectAll("rect.bar").remove();

            focus.selectAll("rect.bar")
                .data(dataShown)
            .enter().append("rect")
                .attr("class", function(d) {
                    return "bar " + d.date;
                })
                .attr("style", function(d) {
                    return d.anomaly ? anomalyStyle : style;
                })
                .attr("x", function(d) {
                    return me.xFocus(d.date);
                })
                .attr("width", function(d) {
                    return me.xFocus(d3.time[me.granularity].utc.offset(d.date, 1)) - me.xFocus(d.date);
                })
                .attr("y", function(d) {
                    return y(Math.max(0, d.value));
                })
                .attr("height", function(d) {
                    var height = y(d.value) - y(0);
                    var offset = height / height || 0;
                    var calculatedHeight = Math.abs(height) + (offset * barheight);
                    return calculatedHeight;
                });
        } else {
            var chartType = '';

            // If type is line, render a line plot
            if(series.type === 'line') {
                chartType = d3.svg.line()
                    .x(function(d) {
                        return me.xFocus(d.date);
                    })
                    .y(function(d) {
                        return y(d.value);
                    });
            } else {
                // Otherwise, default to area, e.g. for bars whose data is too long
                style += 'fill:' + series.color + ';';
                chartType = d3.svg.area()
                    .x(function(d) {
                        return me.xFocus(d.date);
                    })
                    .y0(function(d) {
                        return y(Math.min(0, d.value));
                    })
                    .y1(function(d) {
                        return y(Math.max(0, d.value));
                    });
            }

            focus.selectAll("path." + series.type).remove();

            focus.append("path")
                .datum(dataShown)
                .attr("class", series.type)
                .attr("d", chartType)
                .attr("style", style);

            if(series.data.length < 80) {
                var func = function(d) {
                    return me.xFocus(d.date);
                };
                if(series.data.length === 1) {
                    func = width / 2;
                }

                focus.selectAll("circle.dot").remove();

                focus.selectAll("circle.dot")
                    .data(dataShown)
                .enter().append("circle")
                    .attr("class", "dot")
                    .attr("style", 'fill:' + series.color + ';')
                    .attr("r", 3)
                    .attr("cx", func)
                    .attr("cy", function(d) {
                        return y(d.value);
                    });
            } else {
                // If a line graph was used and there are anomalies, put a circle on the
                // anomalous points
                var anomalies = dataShown.filter(function(it) {
                    return it.anomaly === true;
                });

                focus.selectAll("circle.dot").remove();

                focus.selectAll("circle.dot")
                    .data(anomalies)
                .enter().append("circle")
                    .attr("class", "dot")
                    .attr("style", 'fill:' + anomalyColor + ';')
                    .attr("r", 3)
                    .attr("cx", function(d) {
                        return me.xFocus(d.date);
                    })
                    .attr("cy", function(d) {
                        return y(d.value);
                    });
            }
        }

        return {y: y, yAxis: yAxis};
    }

    /**
     * Updates the x axis as well as redraws the focus chart
     * @method updateFocusChart
     * @private
     */
    var updateFocusChart = function() {
        var me = self;

        if(me.data.length && !me.data[0].data) {
            return;
        }

        me.xFocus.domain(me.brush.empty() ? me.xContext.domain() : me.brush.extent());
        me.xDomain = [me.xFocus.domain()[0], me.xFocus.domain()[1]];

        for(var i = 0; i < me.data.length; i++) {
            var series = me.data[i];

            var axis = me.drawFocusChart(series);
            var y = axis.y;

            var xOffset = me.approximateBarWidth / 2;
            if(series.type === 'bar') {
                xOffset = 0;
            }

            me.svg.selectAll("g." + series.name + " .mini-axis")
                .attr({
                    x1: 0,
                    x2: me.width - (xOffset * 2),
                    y1: y(0),
                    y2: y(0)
                });
        }
    };

    var showTooltip = function(item, mouseEvent) {
        var count = d3.format("0,000.00")(item.value);
        // Only show the part of the date that makes sense for the selected granularity
        var dateFormat = self.dateFormats[self.granularity];
        if(!dateFormat) {
            dateFormat = self.dateFormats.hour;
        }
        var date = d3.time.format.utc(dateFormat)(item.date);

        // Create the contents of the tooltip (#tooltip-container is reused among the various
        // visualizations)
        var html = '<div><strong>Date:</strong> ' + _.escape(date) + '</div>' +
            '<div><strong>Count:</strong> ' + count + '</div>';
        $("#tooltip-container").html(html);
        $("#tooltip-container").show();
        positionTooltip(d3.select('#tooltip-container'), mouseEvent);
        XDATA.userALE.log({
            activity: "show",
            action: "mouseover",
            elementId: "timeline",
            elementType: "tooltip",
            elementSub: "timeline",
            elementGroup: "chart_group",
            source: "user",
            tags: ["tooltip", "timeline"]
        });
    };

    var positionTooltip = function(tooltip, mouseEvent) {
        tooltip.style('top', mouseEvent.pageY + 'px')
            .style('left', mouseEvent.pageX + 'px');
    };

    var hideTooltip = function() {
        $("#tooltip-container").hide();
        XDATA.userALE.log({
            activity: "hide",
            action: "mouseout",
            elementId: "timeline",
            elementType: "tooltip",
            elementSub: "timeline",
            elementGroup: "chart_group",
            source: "user",
            tags: ["tooltip", "timeline"]
        });
    };

    // initialization
    return this.configure(configuration);
};

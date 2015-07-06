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
    this.brushHandler = undefined;
    this.hoverListener = undefined;
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
    this.x = [];
    this.y = [];
    this.highlights = [];

    // The old extent of the brush saved on brushstart.
    this.oldExtent = [];

    // The data index over which the user is currently hovering changed on mousemove and mouseout.
    this.hoverIndex = -1;

    var self = this; // for internal d3 functions

    /**
     * Initializes the internal attributes of the chart.  A configuration object can be provided to
     * override defaults.
     * @param {Object} configuration
     * @param {Number} configuration.height
     * @param {Object} configuration.margin Margin overrides for each side
     * @param {Number} configuration.margin.bottom
     * @param {Number} configuration.margin.left
     * @param {Number} configuration.margin.right
     * @param {Number} configuration.margin.top
     * @param {Number} configuration.width
     * @return charts.TimelineSelectorChart
     * @method configure
     */
    this.configure = function(configuration) {
        this.config = configuration || {};
        this.config.margin = this.config.margin || {
            top: 4,
            right: 15,
            bottom: 4,
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
                if(timeline.hoverIndex >= 0 && timeline.oldExtent[0]) {
                    var extent = timeline.brush.extent();
                    if(timeline.datesEqual(timeline.oldExtent[0], extent[0]) && timeline.datesEqual(timeline.oldExtent[1], extent[1])) {
                        var startDate = timeline.data[0].data[timeline.hoverIndex].date;
                        var endDate = timeline.data[0].data.length === timeline.hoverIndex + 1 ? timeline.xDomain[1] : timeline.data[0].data[timeline.hoverIndex + 1].date;
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
    };

    /**
     * Updates the positions of the east and west timeline masks for unselected areas.
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
                    d3.select(this).call(brush.extent(extent1));
                }
            }
        }

        // Update mask
        var brushElement = $(this);
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
    };

    /**
     * Selects the date range with the given start and end date by highlighting it in the chart.
     * @param {Date} startDate
     * @param {Date} endDate
     * @method selectDate
     */
    this.selectDate = function(startDate, endDate) {
        var startIndex = startDate < this.data[0].data[0].date ? 0 : -1;
        var endIndex = endDate > this.data[0].data[this.data[0].data.length - 1].date ? this.data[0].data.length - 1 : -1;

        var datesEqual = this.datesEqual;
        this.data[0].data.forEach(function(datum, index) {
            if(datum.date <= startDate || datesEqual(datum.date, startDate)) {
                startIndex = index;
            }
            if(datum.date <= endDate || datesEqual(datum.date, endDate)) {
                endIndex = index;
            }
        });

        if(startIndex < 0 || endIndex < 0) {
            this.deselectDate();
            return;
        }

        // If the start and end dates are the same, add one to the end index because it is exclusive.
        endIndex = startIndex === endIndex ? endIndex + 1 : endIndex;
        this.selectIndexedDates(startIndex, endIndex);
    };

    this.datesEqual = function(a, b) {
        return a.toDateString() === b.toDateString();
    };

    /**
     * Selects the date range with the given start and end index in the data by highlighting it in the chart.
     * @param {Number} startIndex
     * @param {Number} endIndex
     * @method selectIndexedDates
     */
    this.selectIndexedDates = function(startIndex, endIndex) {
        this.clearHighlights();

        for(var i = startIndex; i < endIndex; ++i) {
            var date = this.data[0].data[i].date;
            // TODO Create x, width, y, and height functions to combine the calculations for both the highlight bar and the other bars.
            var x = this.x(date);
            var width = this.x(d3.time[this.granularity].utc.offset(date, 1)) - x;
            var y = this.y(Math.max(0, this.data[0].data[i].value));
            var height = Math.abs(this.y(this.data[0].data[i].value) - this.y(0));
            this.highlights[i].attr("x", x - 1).attr("width", width + 2).attr("y", y - 1).attr("height", height + 2).style("visibility", "visible");
        }
    };

    /**
     * Deselects the date by removing the highlighting in the chart.
     * @method deselectDate
     */
    this.deselectDate = function() {
        this.clearHighlights();
    };

    /**
     * Removes the highlights from the chart.
     * @method clearHighlights
     */
    this.clearHighlights = function() {
        this.highlights.forEach(function(highlight) {
            highlight.style("visibility", "hidden");
        });
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
        var width = this.determineWidth(this.d3element) - this.config.margin.left - this.config.margin.right;
        // Depending on the granularity, the bars are not all the same width (months are different
        // lengths). But this is accurate enough to place tick marks and make other calculations.
        var approximateBarWidth = 0;

        var baseHeight = 130;
        $(this.d3element[0]).css("height", (baseHeight * values.length));
        var height = (this.determineHeight(this.d3element) - (this.config.margin.top) - this.config.margin.bottom);
        var chartHeight = baseHeight - this.config.margin.top - this.config.margin.bottom;

        var fullDataSet = [];
        if(values && values.length > 0) {
            this.data = values;
            // Get list of all data to calculate min/max and domain
            for(i = 0; i < values.length; i++) {
                fullDataSet = fullDataSet.concat(values[i].data);
                if(values[i].data && !approximateBarWidth) {
                    approximateBarWidth = (width / values[i].data.length);
                }
            }
        }

        // Setup the axes and their scales.
        this.x = d3.time.scale.utc().range([0, width]);

        // Save the brush as an instance variable to allow interaction on it by client code.
        this.brush = d3.svg.brush().x(this.x).on("brush", this.updateMask);

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

        //var heightRange = y.range()[0];
        function resizePath(d) {
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
        }

        var xMin = d3.min(fullDataSet.map(function(d) {
            return d.date;
        }));
        var xMax = d3.max(fullDataSet.map(function(d) {
            return d3.time[me.granularity].utc.offset(d.date, 1);
        }));

        this.xDomain = [xMin, xMax];
        this.x.domain(this.xDomain);

        var xAxis = d3.svg.axis().scale(this.x).orient("bottom");

        // We don't want the ticks to be too close together, so calculate the most ticks that
        // comfortably fit on the timeline
        var maximumNumberOfTicks = Math.round(width / 100);
        // We don't want to have more ticks than buckets (e.g., monthly buckets with daily ticks
        // look funny)
        var minimumTickRange = d3.time[me.granularity].utc.range;
        if(this.x.ticks(minimumTickRange).length < maximumNumberOfTicks) {
            // There's enough room to do one tick per bucket
            xAxis.ticks(minimumTickRange);
        } else {
            // One tick per bucket at this granularity is too many; let D3 figure out tick spacing.
            // Note that D3 may give us a few more ticks than we specify if it feels like it.
            xAxis.ticks(maximumNumberOfTicks);
        }

        // Clear the old contents by replacing innerhtml.
        d3.select(this.element).html('');

        // Append our chart graphics
        this.svg = d3.select(this.element)
            .attr("class", "timeline-selector-chart")
            .append("svg");

        this.svg.append("defs").append("clipPath")
            .attr("id", "clip")
            .append("rect")
            .attr("width", width)
            .attr("height", height);

        var context = this.svg.append("g")
            .attr("class", "context")
            .attr("transform", "translate(" + this.config.margin.left + "," + this.config.margin.top + ")");

        context.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + (height + 2) + ")")
            .call(xAxis);

        context.selectAll('.major text')
            .attr('transform', 'translate(' + (approximateBarWidth / 2) + ',0)');

        context.selectAll('.major line')
            .attr('transform', 'translate(' + (approximateBarWidth / 2) + ',0)');

        // Render a series
        var seriesPos = 0;
        var createSeries = function(series) {
            var xOffset = approximateBarWidth / 2;
            if(series.type === 'bar') {
                xOffset = 0;
            }

            var container = context.append("g")
                .attr("class", series.name)
                .attr("transform", "translate(" + xOffset + "," + ((chartHeight + me.config.margin.top + me.config.margin.bottom) * seriesPos) + ")");

            me.y = d3.scale.linear().range([chartHeight, 0]);
            var yAxis = d3.svg.axis().scale(me.y).orient("right").ticks(2);

            // Use lowest value or 0 for Y-axis domain, whichever is less (e.g. if negative)
            var minY = d3.min(series.data.map(function(d) {
                return d.value;
            }));
            minY = minY < 0 ? minY : 0;

            me.y.domain([minY, d3.max(series.data.map(function(d) {
                return d.value;
            }))]);

            var style = 'stroke:' + series.color + ';';
            var chartType = '';

            // For now, all anomalies are shown as red, but this could be changed to be a
            // configurable parameter that is passed in with the series, like series.color.
            var anomalyColor = 'red';

            // If type is bar AND the data isn't too long, render a bar plot
            if(series.type === 'bar' && series.data.length < width) {
                var barheight = 0;

                if(series.data.length < 60) {
                    style = 'stroke:#f1f1f1;';
                    barheight++;
                }

                var anomalyStyle = style + 'fill: ' + anomalyColor + '; stroke: ' + anomalyColor + ';';
                style += 'fill:' + series.color + ';';

                container.selectAll(".bar")
                    .data(series.data)
                .enter().append("rect")
                    .attr("class", "bar")
                    .attr("style", function(d) {
                        return d.anomaly ? anomalyStyle : style;
                    })
                    .attr("x", function(d) {
                        return me.x(d.date);
                    })
                    .attr("width", function(d) {
                        return me.x(d3.time[me.granularity].utc.offset(d.date, 1)) - me.x(d.date);
                    })
                    .attr("y", function(d) {
                        return me.y(Math.max(0, d.value));
                    })
                    .attr("height", function(d) {
                        var height = me.y(d.value) - me.y(0);
                        var offset = height / height || 0;
                        var calculatedHeight = Math.abs(height) + (offset * barheight);
                        return calculatedHeight;
                    });
            } else {
                // If type is line, render a line plot
                if(series.type === 'line') {
                    chartType = d3.svg.line()
                        .x(function(d) {
                            return me.x(d.date);
                        })
                        .y(function(d) {
                            return me.y(d.value);
                        });
                } else {
                    // Otherwise, default to area, e.g. for bars whose data is too long
                    style += 'fill:' + series.color + ';';
                    chartType = d3.svg.area()
                        .x(function(d) {
                            return me.x(d.date);
                        })
                        .y0(function(d) {
                            return me.y(Math.min(0, d.value));
                        })
                        .y1(function(d) {
                            return me.y(Math.max(0, d.value));
                        });
                }

                container.append("path")
                    .datum(series.data)
                    .attr("class", series.type)
                    .attr("d", chartType)
                    .attr("style", style);

                if(series.data.length < 80) {
                    var func = function(d) {
                        return me.x(d.date);
                    };
                    if(series.data.length === 1) {
                        func = width / 2;
                    }

                    container.selectAll("dot")
                        .data(series.data)
                    .enter().append("circle")
                        .attr("class", "dot")
                        .attr("style", 'fill:' + series.color + ';')
                        .attr("r", 3)
                        .attr("cx", func)
                        .attr("cy", function(d) {
                            return me.y(d.value);
                        });
                } else {
                    // If a line graph was used and there are anomalies, put a circle on the
                    // anomalous points
                    var anomalies = series.data.filter(function(it) {
                        return it.anomaly === true;
                    });
                    container.selectAll("dot")
                        .data(anomalies)
                    .enter().append("circle")
                        .attr("class", "dot")
                        .attr("style", 'fill:' + anomalyColor + ';')
                        .attr("r", 3)
                        .attr("cx", function(d) {
                            return me.x(d.date);
                        })
                        .attr("cy", function(d) {
                            return me.y(d.value);
                        });
                }
            }

            container.append("line")
                .attr({
                    class: "mini-axis",
                    x1: 0,
                    x2: width - (xOffset * 2),
                    y1: me.y(0),
                    y2: me.y(0)
                });

            // Append the highlight bars after the other bars so it is drawn on top.
            me.highlights = [];
            series.data.forEach(function(datum) {
                var highlight = container.append("rect")
                    .attr("class", "highlight")
                    .attr("x", 0).attr("width", 0)
                    .attr("y", -1).attr("height", chartHeight + 2)
                    .style("visibility", "hidden");
                me.highlights.push(highlight);
            });

            charts.push({
                name: series.name,
                color: series.color,
                yAxis: yAxis,
                container: container,
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
                var graph_x = me.x.invert(mouseLocation[0]);

                var bisect = d3.bisector(function(d) {
                    return d.date;
                }).right;
                var index = bisect(values[0].data, graph_x) - 1;
                if(index >= 0 && index < values[0].data.length) {
                    me.hoverIndex = index;
                    me.selectIndexedDates(index, index + 1);
                    showTooltip(values[0].data[index], d3.event);

                    if(me.hoverListener) {
                        var start = values[0].data[index].date;
                        var end = values[0].data[index].date;
                        if(me.granularity === "hour") {
                            end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + 1);
                        }
                        if(me.granularity === "day") {
                            end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
                        }
                        if(me.granularity === "month") {
                            end = new Date(start.getFullYear(), start.getMonth() + 2, 0);
                        }
                        if(me.granularity === "year") {
                            end = new Date(start.getFullYear() + 2, 0, 0);
                        }
                        me.hoverListener(values[0].data[index].date, end);
                    }
                }
            })
            .on('mouseout', function() {
                me.hoverIndex = -1;
                me.deselectDate();
                hideTooltip();

                if(me.hoverListener) {
                    me.hoverListener();
                }
            });

        gBrush.append("rect")
            .attr("x", width + this.config.margin.right)
            .attr("y", -6)
            .attr("width", width)
            .attr("height", height + 7)
            .attr("class", "mask mask-east");

        gBrush.append("rect")
            .attr("x", (0 - (width + this.config.margin.left)))
            .attr("y", -6)
            .attr("width", width)
            .attr("height", height + 7)
            .attr("class", "mask mask-west");

        gBrush.call(this.brush);

        gBrush.selectAll("rect")
            .attr("y", -6)
            .attr("height", height + 7);

        gBrush.selectAll(".e")
            .append("rect")
            .attr("y", -6)
            .attr("width", 1)
            .attr("height", height + 6)
            .attr("class", "resize-divider");

        gBrush.selectAll(".w")
            .append("rect")
            .attr("x", -1)
            .attr("y", -6)
            .attr("width", 1)
            .attr("height", height + 6)
            .attr("class", "resize-divider");

        gBrush.selectAll(".resize")
            .append("path")
            .attr("d", resizePath);

        for(i = 0; i < charts.length; i++) {
            context.append("g")
                .attr("class", "y axis series-y")
                .attr("transform", "translate(0," + ((chartHeight + this.config.margin.top + this.config.margin.bottom) * charts[i].index) + ")")
                .call(charts[i].yAxis);

            context.append("text")
                .attr("class", "series-title")
                .attr("fill", charts[i].color)
                .attr("transform", "translate(0," + (((chartHeight + this.config.margin.top + this.config.margin.bottom) * charts[i].index) - 5) + ")")
                .text(charts[i].name);
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
        tooltip.style('top', (mouseEvent.pageY - ($("#tooltip-container").outerHeight(true) / 2)) + 'px')
            .style('left', (mouseEvent.pageX + 10) + 'px');
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

    this.setHoverListener = function(hoverListener) {
        this.hoverListener = hoverListener;
    };

    // initialization
    return this.configure(configuration);
};

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

    this.element = element;
    this.config = {};
    this.d3element = d3.select(element);
    this.brushHandler = undefined;
    this.hoverListener = undefined;
    this.data = DEFAULT_DATA;
    this.primarySeries = false;
    this.granularity = 'day';
    this.dateFormats = {
        year: '%Y',
        month: '%b %Y',
        day: '%d %b %Y',
        hour: '%d %b %Y %H:%M'
    };
    this.TOOLTIP_ID = 'tooltip';
    this.xDomain = [];
    this.collapsed = true;

    // The highlight bars for each date for both the context and focus timelines.
    this.focusHighlights = [];
    this.contextHighlights = [];

    // The mapping of date to data index used in hover/highlighting behavior for both the context and focus timelines.
    this.focusDateToIndex = {};
    this.contextDateToIndex = {};

    // The old extent of the brush saved on brushstart.
    this.oldExtent = [];

    // The data index over which the user is currently hovering changed on mousemove and mouseout.
    this.hoverIndex = -1;

    this.DEFAULT_MARGIN = 15;
    this.DEFAULT_HEIGHT = 150;
    this.DEFAULT_WIDTH = 1000;

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
        this.config.marginFocus = configuration.marginFocus || {
            top: 0,
            right: this.DEFAULT_MARGIN,
            bottom: (this.collapsed ? this.determineHeight(this.d3element) : this.DEFAULT_HEIGHT),
            left: this.DEFAULT_MARGIN
        };
        this.config.marginContext = configuration.marginContext || {
            top: this.DEFAULT_MARGIN,
            right: this.DEFAULT_MARGIN,
            bottom: 0,
            left: this.DEFAULT_MARGIN
        };
        this.granularity = configuration.granularity || this.granularity;
        this.redrawOnResize();

        return this;
    };

    this.determineWidth = function(element) {
        if(this.config.width) {
            return this.config.width;
        } else if($(element[0]).width() !== 0) {
            return ($(element[0]).width());
        }
        return this.DEFAULT_WIDTH;
    };

    this.determineHeight = function(element) {
        if(this.config.height) {
            return this.config.height;
        } else if($(element[0]).height() !== 0) {
            return ($(element[0]).height());
        }
        return this.DEFAULT_HEIGHT;
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
                    self.svg.select(".brush").call(brush.extent(extent1));
                }
            }
        }

        // Update mask
        var brushElement = $(this);
        var xPos = brushElement.find('.extent').attr('x');
        var extentWidth = brushElement.find('.extent').attr('width');
        var width = parseInt(brushElement.find('.mask-west').attr('width').replace('px', ''), 10);

        if(parseFloat(xPos) + parseFloat(extentWidth) < 0 || parseFloat(xPos) > width) {
            xPos = 0;
            extentWidth = 0;
            width = 0;
        }

        if((extentWidth === "0" || extentWidth === 0) &&
            (brush.extent() && brush.extent().length >= 2 && (brush.extent()[1] - brush.extent()[0]) > 0)) {
            // If brush extent exists, but the width is too small, draw masks with a bigger width
            brushElement.find('.mask-west').attr('x', parseFloat(xPos) - width);
            brushElement.find('.mask-east').attr('x', parseFloat(xPos) + 1);
        } else if(extentWidth === "0" || extentWidth === 0 || extentWidth === undefined) {
            // If brush extent has been cleared, reset mask positions
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
                    top: this.DEFAULT_MARGIN,
                    right: this.DEFAULT_MARGIN,
                    bottom: 99,
                    left: this.DEFAULT_MARGIN
                },
                marginContext: {
                    top: (this.collapsed ? this.determineHeight(this.d3element) : this.DEFAULT_HEIGHT) - 65,
                    right: this.DEFAULT_MARGIN,
                    bottom: 0,
                    left: this.DEFAULT_MARGIN
                }
            });
        } else {
            this.configure({});
        }

        if(this.data.length && this.data[0].data) {
            this.redrawChart();
        }
    };

    /**
     * Show/hide all the charts if the focus is shown
     * @param {boolean} collapse Set to true to collapse all graphs. False otherwise.
     * @method collapse
     */
    this.collapse = function(collapse) {
        this.collapsed = collapse;

        // Set height to default when collapsed so height doesn't
        // stay at the uncollapsed height
        if(collapse) {
            $(this.d3element[0]).css("height", this.DEFAULT_HEIGHT);
        }

        // Resets configs and draws charts if focus shown
        if(this.config.marginFocus.top !== 0) {
            this.toggleFocus(true);
        }
    };

    /**
     * Selects the date range with the given start and end date by highlighting it in the chart.
     * @param {Date} startDate
     * @param {Date} endDate
     * @method selectDate
     */
    this.selectDate = function(startDate, endDate) {
        if(!this.data || !this.data.length || !this.data[0].data || !this.data[0].data.length) {
            return;
        }

        var dataLength = this.data[0].data.length;
        var startIndex = -1;
        var endIndex = -1;

        var datesEqual = this.datesEqual;
        this.data[0].data.forEach(function(datum, index) {
            if(datum.date <= startDate || datesEqual(datum.date, startDate)) {
                startIndex = index;
            }
            if(datum.date <= endDate || datesEqual(datum.date, endDate)) {
                endIndex = index;
            }
        });

        var dataStartDate = this.data[0].data[0].date;
        var dataEndDate = this.data[0].data[dataLength - 1].date;

        // Add a month/year to the end month/year for month/year granularity so it includes the whole end month/year and not just the first day of the end month/year.
        if(this.granularity === "month") {
            dataEndDate = new Date(dataEndDate.getFullYear(), dataEndDate.getMonth() + 1, dataEndDate.getDate(), dataEndDate.getHours());
        }
        if(this.granularity === "year") {
            dataEndDate = new Date(dataEndDate.getFullYear() + 1, dataEndDate.getMonth(), dataEndDate.getDate(), dataEndDate.getHours());
        }

        // If the start or end date is outside the date range of the data, set it to the of the start (inclusive) or end (exclusive) index of the data.
        startIndex = startDate <= dataStartDate ? 0 : startIndex;
        endIndex = endDate > dataEndDate ? dataLength : endIndex;

        if(startIndex < 0 || endIndex < 0 || endDate < dataStartDate || startDate > dataEndDate) {
            this.deselectDate();
            return;
        }

        // If the start and end dates are the same, add one to the end index because it is exclusive.
        endIndex = startIndex === endIndex ? endIndex + 1 : endIndex;
        this.selectIndexedDates(startIndex, endIndex);
    };

    this.datesEqual = function(a, b) {
        return a.toUTCString() === b.toUTCString();
    };

    /**
     * Shows the given highlight at the given date with the given value using the given xRange and yRange functions (xContext/yContext or xFocus/yFocus).
     * @param {Date} date
     * @param {Object} highlight
     * @param {Function} xRange
     * @param {Fucntion} yRange
     * @method showHighlight
     */
    this.showHighlight = function(date, value, highlight, xRange, yRange) {
        // TODO Create x, width, y, and height functions to combine the calculations for both the highlight bar and the other bars.
        var x = xRange(date);
        var width = xRange(d3.time[this.granularity].utc.offset(date, 1)) - x;
        var y = yRange(Math.max(0, value));
        var height = Math.abs(yRange(value) - yRange(0));
        highlight.attr("x", x - 1).attr("width", width + 2).attr("y", y - 1).attr("height", height + 2).style("visibility", "visible");
    };

    /**
     * Selects the date range with the given start and end index in the data by highlighting it in the chart.
     * @param {Number} startIndex
     * @param {Number} endIndex
     * @method selectIndexedDates
     */
    this.selectIndexedDates = function(startIndex, endIndex) {
        this.clearHighlights();
        var primaryData = _.find(this.data, {
            name: this.primarySeries.name
        });

        for(var i = startIndex; i < endIndex; ++i) {
            this.showHighlight(primaryData.data[i].date, primaryData.data[i].value, this.contextHighlights[i], this.xContext, this.yContext);

            var focusIndex = this.focusDateToIndex[primaryData.data[i].date.toUTCString()];
            if(focusIndex >= 0) {
                this.showHighlight(primaryData.data[i].date, primaryData.data[i].value, this.focusHighlights[focusIndex], this.xFocus, this.yFocus);
            }
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
        this.focusHighlights.forEach(function(highlight) {
            highlight.style("visibility", "hidden");
        });
        this.contextHighlights.forEach(function(highlight) {
            highlight.style("visibility", "hidden");
        });
    };

    /**
     * Returns the hover index in the given data using the given mouse event and xRange function (xContext or xFocus).
     * @param {Object} mouseEvent
     * @param {Object} value
     * @param {Function} xRange
     * @method findHoverIndexInData
     * @return {Number}
     */
    this.findHoverIndexInData = function(mouseEvent, value, xRange) {
        var mouseLocation = d3.mouse(mouseEvent);
        var graph_x = xRange.invert(mouseLocation[0]);
        var bisect = d3.bisector(function(d) {
            return d.date;
        }).right;
        return value ? bisect(value.data, graph_x) - 1 : -1;
    };

    /**
     * Performs behavior for hovering over the given datum at the given context timeline index.
     * @param {Object} datum
     * @param {Number} contextIndex
     * @method onHover
     */
    this.onHover = function(datum, contextIndex) {
        this.hoverIndex = contextIndex;
        this.selectIndexedDates(contextIndex, contextIndex + 1);
        showTooltip(datum, d3.event);

        if(this.hoverListener) {
            var date = datum.date;
            var start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
            var end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, date.getHours());

            if(this.granularity === "hour") {
                start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
                end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1);
            }
            // The years/months/hours start at index 0 and days start at index 1 but due to the timezone we want the last day of the previous month which is index 0.
            // Add an additional 1 to the dates for month/year granularity because they will start in the previous month/year due to the timezone.
            // Include hours to ensure the new start/end dates are in the same timezone as the original date.
            if(this.granularity === "month") {
                start = new Date(date.getFullYear(), date.getMonth() + 1, 0, date.getHours());
                end = new Date(date.getFullYear(), date.getMonth() + 2, 0, date.getHours());
            }
            if(this.granularity === "year") {
                start = new Date(date.getFullYear() + 1, 0, 0, date.getHours());
                end = new Date(date.getFullYear() + 2, 0, 0, date.getHours());
            }

            this.hoverListener(start, end);
        }
    };

    /**
     * Performs behavior for hovering onto all data.
     * @method onHoverStart
     */
    this.onHoverStart = function() {
        XDATA.userALE.log({
            activity: "show",
            action: "mouseover",
            elementId: "timeline",
            elementType: "tooltip",
            elementSub: "timeline",
            elementGroup: "chart_group",
            source: "user",
            tags: ["tooltip", "highlight", "timeline"]
        });
    };

    /**
     * Performs behavior for hovering off of all data.
     * @method onHoverEnd
     */
    this.onHoverEnd = function() {
        XDATA.userALE.log({
            activity: "hide",
            action: "mouseout",
            elementId: "timeline",
            elementType: "tooltip",
            elementSub: "timeline",
            elementGroup: "chart_group",
            source: "user",
            tags: ["tooltip", "highlight", "timeline"]
        });

        this.hoverIndex = -1;
        this.deselectDate();
        hideTooltip();

        if(this.hoverListener) {
            this.hoverListener();
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

        var svgHeight;
        var heightContext;

        if(this.collapsed) {
            svgHeight = this.determineHeight(this.d3element);
            $(this.d3element[0]).css("height", svgHeight);
            this.heightFocus = Math.max(0, svgHeight - this.config.marginFocus.top - this.config.marginFocus.bottom);
            heightContext = Math.max(0, svgHeight - this.config.marginContext.top - this.config.marginContext.bottom);
        } else {
            svgHeight = this.DEFAULT_HEIGHT * values.length;
            $(this.d3element[0]).css("height", svgHeight);
            this.heightFocus = Math.max(0, this.DEFAULT_HEIGHT - this.config.marginFocus.top - this.config.marginFocus.bottom);
            heightContext = Math.max(0, this.DEFAULT_HEIGHT - this.config.marginContext.top - this.config.marginContext.bottom);
        }

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

        this.xDomain = [xMin || new Date(), xMax || new Date()];
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
            if(me.config.marginFocus.top === 0) {
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
                    var index = me.findHoverIndexInData(this, series, me.xFocus);
                    if(index >= 0 && index < series.data.length) {
                        var contextIndex = me.contextDateToIndex[series.data[index].date.toUTCString()];
                        me.onHover(series.data[index], contextIndex);
                    }
                })
                .on('mouseover', function() {
                    me.onHoverStart();
                })
                .on('mouseout', function() {
                    me.onHoverEnd();
                });

            var axis = me.drawFocusChart(series);
            var y = axis.y;
            var yAxis = axis.yAxis;
            var yContext = d3.scale.linear().range([heightContext, 0]);
            yContext.domain(y.domain());

            if(me.primarySeries.name === series.name) {
                me.yContext = yContext;
            }

            var contextContainer;

            // Only had context timeline on first chart (for when there are multiple charts)
            if(series.name === me.primarySeries.name) {
                contextContainer = context.append("g")
                    .attr("class", series.name)
                    .attr("transform", "translate(" + xOffset + "," + ((heightContext + me.config.marginContext.top + me.config.marginContext.bottom) * seriesPos) + ")");

                var style = 'stroke:' + series.color + ';';
                var chartTypeContext = '';

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
                            func = me.width / 2;
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

                me.contextDateToIndex = {};
                series.data.forEach(function(datum, index) {
                    me.contextDateToIndex[datum.date.toUTCString()] = index;
                });

                // Append the highlight bars after the other bars so it is drawn on top.
                me.contextHighlights = [];
                series.data.forEach(function() {
                    var highlight = contextContainer.append("rect")
                        .attr("class", "highlight")
                        .attr("x", 0).attr("width", 0)
                        .attr("y", -1).attr("height", heightContext + 2)
                        .style("visibility", "hidden");
                    me.contextHighlights.push(highlight);
                });
            }

            focusContainer.append("line")
                .attr({
                    class: "mini-axis",
                    x1: 0,
                    x2: me.width - (xOffset * 2),
                    y1: y(0),
                    y2: y(0)
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
        if(this.primarySeries && this.primarySeries.data.length) {
            createSeries(this.primarySeries);
        }
        // Render all series
        for(i = 0; i < values.length; i++) {
            if(this.primarySeries && values[i].name === this.primarySeries.name) {
                continue;
            } else if(values[i].data.length) {
                createSeries(values[i]);
            }
        }

        var gBrush = context.append("g")
            .attr("class", "brush")
            .on('mousemove', function() {
                var series = _.find(values, {
                    name: me.primarySeries.name
                });
                var index = me.findHoverIndexInData(this, series, me.xContext);
                if(index >= 0 && index < series.data.length) {
                    me.onHover(series.data[index], index);
                }
            })
            .on('mouseover', function() {
                me.onHoverStart();
            })
            .on('mouseout', function() {
                me.onHoverEnd();
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

        var yFocus = d3.scale.linear().range([me.heightFocus, 0]);

        if(me.primarySeries.name === series.name) {
            me.yFocus = yFocus;
        }

        // Get only the data in the brushed area
        var dataShown = _.filter(series.data, function(obj) {
            if(me.granularity !== 'hour') {
                return (me.xFocus.domain()[0] <= obj.date && obj.date < me.xFocus.domain()[1]);
            }
            return (me.xFocus.domain()[0] <= obj.date && obj.date < me.xFocus.domain()[1]);
        });

        // Use lowest value or 0 for Y-axis domain, whichever is less (e.g. if negative)
        var minY = d3.min(dataShown.map(function(d) {
            return d.value;
        }));
        minY = minY < 0 ? minY : 0;

        // Use highest value for Y-axis domain, or 0 if there is no data
        var maxY = d3.max(dataShown.map(function(d) {
            return d.value;
        }));
        maxY = maxY ? maxY : 0;

        yFocus.domain([minY, maxY]);

        var yAxis = d3.svg.axis().scale(yFocus).orient("right").ticks(2);

        focus.select(".y.axis.series-y").call(yAxis);

        var style = 'stroke:' + series.color + ';';

        // For now, all anomalies are shown as red, but this could be changed to be a
        // configurable parameter that is passed in with the series, like series.color.
        var anomalyColor = 'red';

        focus.selectAll("rect.bar").remove();
        focus.selectAll("path." + series.type).remove();

        // If type is bar AND the data isn't too long, render a bar plot
        if(series.type === 'bar' && dataShown.length < me.width) {
            var barheight = 0;

            if(dataShown.length < 60) {
                style = 'stroke:#f1f1f1;';
                barheight++;
            }

            var anomalyStyle = style + 'fill: ' + anomalyColor + '; stroke: ' + anomalyColor + ';';
            style += 'fill:' + series.color + ';';

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
                    return yFocus(Math.max(0, d.value));
                })
                .attr("height", function(d) {
                    var height = yFocus(d.value) - yFocus(0);
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
                        return yFocus(d.value);
                    });
            } else {
                // Otherwise, default to area, e.g. for bars whose data is too long
                style += 'fill:' + series.color + ';';
                chartType = d3.svg.area()
                    .x(function(d) {
                        return me.xFocus(d.date);
                    })
                    .y0(function(d) {
                        return yFocus(Math.min(0, d.value));
                    })
                    .y1(function(d) {
                        return yFocus(Math.max(0, d.value));
                    });
            }

            focus.append("path")
                .datum(dataShown)
                .attr("class", series.type)
                .attr("d", chartType)
                .attr("style", style);

            if(dataShown.length < 80) {
                var func = function(d) {
                    return me.xFocus(d.date);
                };
                if(dataShown.length === 1) {
                    func = me.width / 2;
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
                        return yFocus(d.value);
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
                        return yFocus(d.value);
                    });
            }
        }

        me.focusDateToIndex = {};
        dataShown.forEach(function(datum, index) {
            me.focusDateToIndex[datum.date.toUTCString()] = index;
        });

        if(me.primarySeries.name === series.name) {
            // Append the highlight bars after the other bars so it is drawn on top.
            me.focusHighlights = [];
            dataShown.forEach(function() {
                var highlight = focus.append("rect")
                    .attr("class", "highlight")
                    .attr("x", 0).attr("width", 0)
                    .attr("y", -1).attr("height", me.heightFocus + 2)
                    .style("visibility", "hidden");
                me.focusHighlights.push(highlight);
            });
        }

        return {
            y: yFocus,
            yAxis: yAxis
        };
    };

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

        if(me.brush.extent() && me.brush.extent().length >= 2 && !_.isUndefined(me.brush.extent()[0]) && !_.isUndefined(me.brush.extent()[1])) {
            me.xFocus.domain(me.brush.extent());
        } else {
            me.xFocus.domain(me.xContext.domain());
        }

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

            me.svg.selectAll(".focus-" + series.name + " g.y.axis.series-y")
                .call(axis.yAxis);
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
    };

    var positionTooltip = function(tooltip, mouseEvent) {
        var attributeLeft = mouseEvent.pageX + 15;
        var tooltipWidth = $("#tooltip-container").outerWidth(true);
        var tooltipHeight = $("#tooltip-container").outerHeight(true);

        if((attributeLeft + tooltipWidth) > $("body").width()) {
            $("#tooltip-container").removeClass("east");
            $("#tooltip-container").addClass("west");
            tooltip.style('top', (mouseEvent.pageY - (tooltipHeight / 2)) + 'px')
                .style('left', (attributeLeft - tooltipWidth - 30) + 'px');
        } else {
            $("#tooltip-container").removeClass("west");
            $("#tooltip-container").addClass("east");
            tooltip.style('top', (mouseEvent.pageY - (tooltipHeight / 2)) + 'px')
                .style('left', attributeLeft + 'px');
        }
    };

    var hideTooltip = function() {
        $("#tooltip-container").hide();
    };

    this.setHoverListener = function(hoverListener) {
        this.hoverListener = hoverListener;
    };

    // initialization
    return this.configure(configuration || {});
};

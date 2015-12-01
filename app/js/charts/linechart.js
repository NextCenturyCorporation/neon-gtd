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
    this.highlight = undefined;

    this.granularity = opts.granularity;
    this.dateFormats = {
        day: '%e %B %Y',
        hour: '%e %B %Y %H:%M'
    };

    // The old extent of the brush saved on brushstart.
    this.oldExtent = [];

    this.hoverIndex = -1;
    this.hoverCircles = {};
    this.hoverListener = opts.hoverListener;

    this.x = [];
    this.y = [];
    this.xDomain = [];

    this.hiddenSeries = [];

    this.seriesToColors = opts.seriesToColors || {};
    this.colors = [];
    this.colorScale = d3.scale.ordinal().range(neonColors.LIST);

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
charts.LineChart.DEFAULT_HIGHLIGHT_WIDTH = 4;

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

charts.LineChart.prototype.setGranularity = function(granularity) {
    this.granularity = granularity;
};

charts.LineChart.prototype.showTrendlines = function(display) {
    if(display) {
        $(this.element[0]).find("[class*='trendline']").show();
    } else {
        $(this.element[0]).find("[class*='trendline']").hide();
    }
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
    var hidden = this.hiddenSeries.indexOf(seriesObject.series) >= 0 ? true : false;
    var index = -1;
    var color;

    if(this.seriesToColors[seriesObject.series]) {
        color = this.seriesToColors[seriesObject.series];
    } else if(Object.keys(this.seriesToColors).length) {
        color = this.seriesToColors[""] || neonColors.DEFAULT;
    } else {
        color = this.colorScale(seriesObject.series);
    }

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

/**
 * Selects the date range with the given start and end date by highlighting it in the chart.
 * @param {Date} startDate
 * @param {Date} endDate
 * @method selectDate
 */
charts.LineChart.prototype.selectDate = function(startDate, endDate) {
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

    if(this.granularity === 'day') {
        // Add a day to the end day so it includes the whole end day and not just the first hour of the end day.
        dataEndDate = new Date(dataEndDate.getFullYear(), dataEndDate.getMonth(), dataEndDate.getDate() + 1, dataEndDate.getHours());
    } else {
        // Add an hour to the end day so it includes the whole time
        dataEndDate = new Date(dataEndDate.getFullYear(), dataEndDate.getMonth(), dataEndDate.getDate(), dataEndDate.getHours() + 1);
    }

    // If the start or end date is outside the date range of the data, set it to the of the start (inclusive) or end (exclusive) index of the data.
    startIndex = startDate <= dataStartDate ? 0 : startIndex;
    endIndex = endDate >= dataEndDate ? dataLength : endIndex;

    if(startIndex < 0 || endIndex < 0 || endDate < dataStartDate || startDate > dataEndDate) {
        this.deselectDate();
        return;
    }

    // If the start and end dates are the same, add one to the end index because it is exclusive.
    endIndex = startIndex === endIndex ? endIndex + 1 : endIndex;
    this.selectIndexedDates(startIndex, endIndex);
};

charts.LineChart.prototype.datesEqual = function(a, b) {
    return a.toUTCString() === b.toUTCString();
};

/**
 * Selects the date range, if any values exist, with the given start and end index in the data by highlighting it in the chart.
 * @param {Number} startIndex
 * @param {Number} endIndex
 * @method selectIndexedDates
 * @return {Boolean} Return true if the date range was selected
 */
charts.LineChart.prototype.selectIndexedDates = function(startIndex, endIndex) {
    var me = this;
    var allUndefined = true;

    this.data.forEach(function(seriesObject) {
        if(me.hiddenSeries.indexOf(seriesObject.series) >= 0) {
            return;
        }

        for(var i = startIndex; i < endIndex; ++i) {
            if(!_.isUndefined(seriesObject.data[i].value)) {
                // Clear circles if haven't already
                if(allUndefined) {
                    me.clearHoverCircles();
                }

                allUndefined = false;

                var date = me.data[0].data[i].date;
                me.hoverCircles[seriesObject.series][i]
                    .attr("stroke-opacity", 1)
                    .attr("fill-opacity", 1)
                    .attr("cx", seriesObject.data.length > 1 ? me.x(date) : me.width / 2)
                    .attr("cy", me.y(seriesObject.data[i].value));
            }
        }
    });

    if(!allUndefined) {
        var startDate = me.data[0].data[startIndex].date;
        var endDate = me.data[0].data[endIndex - 1].date;
        var startDateX = this.data[0].data.length > 1 ? this.x(startDate) : this.width / 2;
        var endDateX = this.data[0].data.length > 1 ? this.x(endDate) : this.width / 2;

        // Use a single highlight rectangle for the whole selected date range.
        var highlightX = Math.max(0, startDateX - (charts.LineChart.DEFAULT_HIGHLIGHT_WIDTH / 2));
        var width = Math.min(this.width, (endDateX - startDateX) + charts.LineChart.DEFAULT_HIGHLIGHT_WIDTH);
        this.highlight.attr("x", highlightX).attr("width", width).style("visibility", "visible");

        return true;
    }

    return false;
};

/**
 * Shows the tooltip for the given date with the given index in the data.
 * @param {Number} index
 * @param {Date} date
 * @method showTooltip
 */
charts.LineChart.prototype.showTooltip = function(index, date) {
    var format = d3.time.format.utc(this.dateFormats[this.granularity]);
    var numFormat = d3.format("0,000.00");
    var html = '<span class="tooltip-date">' + format(date) + '</span>';

    for(var i = 0; i < this.data.length; ++i) {
        if(this.hiddenSeries.indexOf(this.data[i].series) >= 0) {
            continue;
        }

        if(!_.isUndefined(this.data[i].data[index].value)) {
            var color = this.calculateColor(this.data[i]);

            html += ('<span style="color: ' + color + '">' + this.data[i].series + ": " +
                numFormat(Math.round(this.data[i].data[index].value * 100) / 100) + '</span>');
        }
    }

    $("#tooltip-container").html(html);
    $("#tooltip-container").show();

    this.positionTooltip_(d3.select('#tooltip-container'), d3.event);
};

charts.LineChart.prototype.positionTooltip_ = function(tooltip, mouseEvent) {
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

/**
 * Deselects the date by removing the highlighting in the chart.
 * @method deselectDate
 */
charts.LineChart.prototype.deselectDate = function() {
    if(this.highlight) {
        this.highlight.style("visibility", "hidden");
    }
    this.clearHoverCircles();
};

/**
 * Removes the hover circles from the chart.
 * @method clearHoverCircles
 */
charts.LineChart.prototype.clearHoverCircles = function() {
    this.svg.selectAll("circle.dot-hover")
        .attr("stroke-opacity", 0)
        .attr("fill-opacity", 0);
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
    .range([25, (me.width - (me.margin.left + me.margin.right))], 0.25);

    me.xDomain = d3.extent(fullDataSet, function(d) {
        return d[me.xAttribute];
    });

    // If no data exists then the min and max of the domain will be undefined.
    if(me.xDomain[1] && me.granularity === 'day') {
        // Add one day to the end of the x-axis so users can hover over and filter on the end date.
        me.xDomain[1] = d3.time.day.utc.offset(me.xDomain[1], 1);
    } else if(me.xDomain[1] && me.granularity === 'hour') {
        // Add one hour to the end of the x-axis so users can hover over and filter on the end date.
        me.xDomain[1] = d3.time.hour.utc.offset(me.xDomain[1], 1);
    }
    me.x.domain(me.xDomain);

    var xAxis = d3.svg.axis()
        .scale(me.x)
        .orient("bottom")
        .ticks(Math.round(me.width / 100));

    me.highlight = me.svg.append("rect")
        .attr("class", "highlight")
        .attr("x", 0).attr("width", 0)
        .attr("y", 0).attr("height", me.height)
        .style("visibility", "hidden");

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

    me.hoverCircles = {};

    for(i = (opts.length - 1); i > -1; i--) {
        if(this.hiddenSeries.indexOf(opts[i].series) >= 0) {
            continue;
        }

        var cls = (opts[i].series ? " " + opts[i].series : "");
        var data = opts[i].data;

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

        var line = d3.svg.line()
        .x(function(d) {
            return me.x(d.date);
        })
        .y(function(d) {
            return me.y(d[me.yAttribute]);
        })
        .defined(function(d) {
            return !_.isUndefined(d[me.yAttribute]);
        });

        me.svg.append("path")
            .datum(data)
            .attr("class", "line" + cls)
            .attr("d", line)
            .attr("stroke", color);

        // Filter out data with undefined values
        var filteredData = _.filter(data, function(d) {
            return !_.isUndefined(d.value);
        });

        var func;
        if(data.length < 40) {
            func = function(d) {
                return me.x(d.date);
            };
            if(data.length === 1) {
                func = me.width / 2;
            }

            // Draw circles for all data containing a defined value
            me.svg.selectAll("dot")
                .data(filteredData)
            .enter().append("circle")
                .attr("class", "dot dot-empty")
                .attr("fill-opacity", 1)
                .attr("stroke-opacity", 1)
                .attr("stroke", color)
                .attr("r", 4)
                .attr("cx", func)
                .attr("cy", function(d) {
                    return me.y(d[me.yAttribute]);
                });
        } else {
            func = function(d) {
                return me.x(d.date);
            };

            var singlePoints = me.filterOutSinglePoints(data);

            // Place dots on points that aren't connected to a line segment
            me.svg.selectAll("dot")
                .data(singlePoints)
            .enter().append("circle")
                .attr("class", "dot")
                .attr("fill-opacity", 1)
                .attr("stroke-opacity", 1)
                .attr("stroke", color)
                .attr("fill", color)
                .attr("r", 2)
                .attr("cx", func)
                .attr("cy", function(d) {
                    return me.y(d[me.yAttribute]);
                });
        }

        me.hoverCircles[opts[i].series] = [];
        data.forEach(function() {
            var hoverCircle = me.svg.append("circle")
                .attr("class", "dot dot-hover")
                .attr("stroke", color)
                .attr("fill", color)
                .attr("stroke-opacity", 0)
                .attr("fill-opacity", 0)
                .attr("r", 4)
                .attr("cx", 0)
                .attr("cy", 0);
            me.hoverCircles[opts[i].series].push(hoverCircle);
        });

        // Calculate and create trendlines

        var xSeries = filteredData.map(function(datum) {
            return me.x(datum.date);
        });
        var ySeries = filteredData.map(function(datum) {
            return me.y(datum[me.yAttribute]);
        });

        if(xSeries.length && ySeries.length && xSeries.length === ySeries.length) {
            var trendLine = me.leastSquares(xSeries, ySeries);

            var x1 = 0;
            var y1 = trendLine[1];
            var x2 = me.x(me.xDomain[1]);
            var y2 = (trendLine[0] * x2) + trendLine[1];
            var trendData = [[x1, y1, x2, y2]];

            me.svg.selectAll(".trendline")
                .data(trendData)
            .enter().append("line")
                .attr("class", "trendline-" + opts[i].series)
                .attr("x1", function(d) {
                    return d[0];
                })
                .attr("y1", function(d) {
                    return d[1];
                })
                .attr("x2", function(d) {
                    return d[2];
                })
                .attr("y2", function(d) {
                    return d[3];
                })
                .attr("stroke", color)
                .attr("stroke-width", 4);
        }
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
            var index = 0;

            if(opts[0].data.length > 1) {
                var bisect = d3.bisector(function(d) {
                    return d[me.xAttribute];
                }).right;
                index = bisect(opts[0].data, graph_x);
                // Adjust for out of range mouse events; Typical during a resize and some orientations.
                index = (index < opts[0].data.length) ? Math.max(0, index - 1) : (opts[0].data.length - 1);
            }

            me.hoverIndex = index;

            var didSelect = me.selectIndexedDates(index, index + 1);

            if(didSelect) {
                me.showTooltip(index, opts[0].data[index][me.xAttribute]);

                if(me.hoverListener) {
                    var date = opts[0].data[index][me.xAttribute];
                    var start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
                    var end;
                    if(me.granularity === 'day') {
                        end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, date.getHours());
                    } else {
                        end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1);
                    }
                    me.hoverListener(start, end);
                }
            }
        }
    }).on("mouseover", function() {
        XDATA.userALE.log({
            activity: "show",
            action: "mouseover",
            elementId: "linechart",
            elementType: "tooltip",
            elementSub: "linechart",
            elementGroup: "chart_group",
            source: "user",
            tags: ["tooltip", "highlight", "linechart"]
        });
    }).on("mouseout", function() {
        me.hoverIndex = -1;
        me.deselectDate();
        $("#tooltip-container").hide();

        XDATA.userALE.log({
            activity: "hide",
            action: "mouseout",
            elementId: "linechart",
            elementType: "tooltip",
            elementSub: "linechart",
            elementGroup: "chart_group",
            source: "user",
            tags: ["tooltip", "highlight", "linechart"]
        });

        if(me.hoverListener) {
            me.hoverListener();
        }
    });
};

/**
 * Return items in data whose neighboring items have an undefined value
 * @param {Array} data
 * @method filterOutSinglePoints
 * @return {Array}
 */
charts.LineChart.prototype.filterOutSinglePoints = function(data) {
    var singlePointsData = [];

    // Check the first data element
    if(!_.isUndefined(data[0].value) && _.isUndefined(data[1].value)) {
        singlePointsData.push(data[0]);
    }

    for(var i = 1; i < data.length - 1; i++) {
        if(_.isUndefined(data[i - 1].value) && !_.isUndefined(data[i].value) && _.isUndefined(data[i + 1].value)) {
            singlePointsData.push(data[i]);
            i += 1;
        }
    }

    // Check the last data element
    if(_.isUndefined(data[data.length - 2].value) && !_.isUndefined(data[data.length - 1].value)) {
        singlePointsData.push(data[data.length - 1]);
    }

    return singlePointsData;
};

/**
 * Calculates the slope and intercept of the least squares line.
 * @param {Array} xSeries All the x values of the data-points trying to find the least squares value of
 * @param {Array} ySeries All the y values of the data-points trying to find the least squares value of
 * @method leastSquares
 * @return {Array} Contains the slope and intercept, respectively
 */
charts.LineChart.prototype.leastSquares = function(xSeries, ySeries) {
    var sumXSquared = _.reduce(xSeries.map(function(d) {
        return d * d;
    }), function(total, curr) {
        return total + curr;
    });
    var sumX = _.reduce(xSeries, function(total, curr) {
        return total + curr;
    });
    var sumXTimesY = _.reduce(xSeries.map(function(d, i) {
        return d * (ySeries[i]);
    }), function(total, curr) {
        return total + curr;
    });
    var sumY = _.reduce(ySeries, function(total, curr) {
        return total + curr;
    });

    var slope = ((sumXTimesY * xSeries.length) - (sumY * sumX)) / ((xSeries.length * sumXSquared) - (2 * sumX));
    var intercept = (sumXTimesY - (sumXSquared * slope)) / sumX;

    slope = isNaN(slope) ? 0 : slope;
    intercept = isNaN(intercept) ? 0 : intercept;

    return [slope, intercept];
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
        if(linechart.hoverIndex >= 0 && linechart.oldExtent[0]) {
            var extent = linechart.brush.extent();
            if(linechart.datesEqual(linechart.oldExtent[0], extent[0]) && linechart.datesEqual(linechart.oldExtent[1], extent[1])) {
                var startDate = linechart.data[0].data[linechart.hoverIndex].date;
                var endDate = linechart.data[0].data.length === linechart.hoverIndex + 1 ? linechart.xDomain[1] : linechart.data[0].data[linechart.hoverIndex + 1].date;
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
        var timeFunction = d3.time[this.granularity].utc;
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
    if(this.data && this.data.length && this.data[0].data && this.data[0].data.length) {
        this.drawLines(this.data);
        this.drawBrush();
        if(extent) {
            this.renderBrushExtent(extent);
        }
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

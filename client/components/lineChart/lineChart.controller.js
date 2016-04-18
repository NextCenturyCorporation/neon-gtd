'use strict';

/*
 * Copyright 2016 Next Century Corporation
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

/**
 * This visualization shows aggregated data in a line chart.
 * @namespace neonDemo.controllers
 * @class lineChartController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('lineChartController', ['$scope', '$filter', function($scope, $filter) {
    var COUNT_FIELD_NAME = 'value';
    $scope.active.HOUR = "hour";
    $scope.active.DAY = "day";

    $scope.extent = [];
    $scope.colorMappings = [];
    $scope.dateStringToDataIndex = {};
    $scope.seriesLimit = 10;
    $scope.data = {};

    $scope.active.legend = {
        show: false,
        layers: {}
    };

    $scope.active.granularity = $scope.bindings.granularity ? $scope.bindings.granularity.toLowerCase() : $scope.active.DAY;
    $scope.active.showTrendlines = false;

    $scope.functions.createMenuText = function() {
        if(!$scope.hideNoDataError) {
            return "No Data";
        }
        return "";
    };

    $scope.functions.showMenuText = function() {
        return !$scope.hideNoDataError;
    };

    $scope.functions.onResize = function(elementHeight, elementWidth, titleHeight) {
        var height = elementHeight - titleHeight - $scope.functions.getElement(".legend>.divider").outerHeight(true) - $scope.functions.getElement(".legend>.text").outerHeight(true);
        var width = elementWidth - $scope.functions.getElement(".filter-reset").outerWidth(true) - $scope.functions.getElement(".olControlZoom").outerWidth(true) - 25;
        var legendDetails = $scope.functions.getElement(".legend>.legend-details");
        legendDetails.css("max-height", height + "px");
        legendDetails.css("max-width", width + "px");

        if($scope.chart) {
            $scope.chart.draw();
            $scope.chart.showTrendlines($scope.active.showTrendlines);
        }
    };

    $scope.functions.onInit = function() {
        $scope.messenger.subscribe("date_selected", handleDateSelected);

        $scope.functions.getElement('.legend').on({
            "shown.bs.dropdown": function() {
                this.closable = false;
            },
            click: function() {
                this.closable = true;
            },
            "hide.bs.dropdown": function() {
                return this.closable;
            }
        });
    };

    $scope.changeGranularity = function() {
        $scope.chart.setGranularity($scope.active.granularity);
        $scope.functions.logChangeAndUpdate("granularity", $scope.active.granularity, "button");
    };

    $scope.toggleShowTrendlines = function() {
        XDATA.userALE.log({
            activity: "alter",
            action: "click",
            elementId: "linechart",
            elementType: "button",
            elementSub: "linechart-trendline-" + $scope.active.showTrendlines,
            elementGroup: "chart_group",
            source: "user",
            tags: ["linechart", "trendline", $scope.active.showTrendlines]
        });
        $scope.chart.showTrendlines($scope.active.showTrendlines);
    };

    /**
     * Event handler for date selected events issued over Neon's messaging channels.
     * @param {Object} message A Neon date selected message.
     * @method handleDateSelected
     * @private
     */
    var handleDateSelected = function(message) {
        if($scope.chart) {
            if(message.start && message.end) {
                $scope.chart.selectDate(message.start, message.end);
            } else {
                $scope.chart.deselectDate();
            }
        }
    };

    /**
     * Returns the external services date key for the chart brush extent.
     * @return {String}
     * @method getLinksPopupDateKey
     */
    $scope.getLinksPopupDateKey = function() {
        return $scope.extent.length >= 2 ? $scope.functions.getLinksPopupService().generateDateRangeKey($scope.extent[0].toUTCString(), $scope.extent[1].toUTCString()) : "";
    };

    $scope.functions.areDataFieldsValid = function(layers) {
        // The line chart will only query for data from one layer at a time.
        var layer = layers[0];

        return $scope.functions.isFieldValid(layer.dateField) && (layer.aggregationType !== "count" ? $scope.functions.isFieldValid(layer.aggregationField) : true);
    };

    $scope.functions.createNeonQueryWhereClause = function(layers) {
        // The line chart will only query for data from one layer at a time.
        var layer = layers[0];

        return neon.query.and(
            neon.query.where(layer.dateField.columnName, '>=', new Date("1970-01-01T00:00:00.000Z")),
            neon.query.where(layer.dateField.columnName, '<=', new Date("2025-01-01T00:00:00.000Z"))
        );
    };

    $scope.functions.addToQuery = function(query, layers) {
        // The line chart will only query for data from one layer at a time.
        var layer = layers[0];

        var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, layer.dateField.columnName, 'year');
        var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, layer.dateField.columnName, 'month');
        var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, layer.dateField.columnName, 'day');
        var groupByClause = [yearGroupClause, monthGroupClause, dayGroupClause];

        if($scope.extent.length >= 2) {
            var dayMillis = (1000 * 60 * 60 * 24);
            var diff = $scope.extent[1] - $scope.extent[0];

            if($scope.active.granularity === $scope.active.DAY && (diff / dayMillis) <= 1) {
                $scope.automaticHourSet = true;
                $scope.active.granularity = $scope.active.HOUR;
            } else if($scope.active.granularity === $scope.active.HOUR && (diff / dayMillis) > 1 && $scope.automaticHourSet) {
                $scope.automaticHourSet = false;
                $scope.active.granularity = $scope.active.DAY;
            }
        } else if($scope.automaticHourSet) {
            $scope.automaticHourSet = false;
            $scope.active.granularity = $scope.active.DAY;
        }

        if($scope.active.granularity === $scope.active.HOUR) {
            var hourGroupClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, layer.dateField.columnName, 'hour');
            groupByClause.push(hourGroupClause);
        }

        if($scope.functions.isFieldValid(layer.groupField)) {
            groupByClause.push(layer.groupField.columnName);
        }

        query.groupBy.apply(query, groupByClause);

        if(layer.aggregationType === "count") {
            query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
        }
        if(layer.aggregationType === "sum") {
            query.aggregate(neon.query.SUM, layer.aggregationField.columnName, COUNT_FIELD_NAME);
        }
        if(layer.aggregationType === "average") {
            query.aggregate(neon.query.AVG, layer.aggregationField.columnName, COUNT_FIELD_NAME);
        }
        if(layer.aggregationType === "min") {
            query.aggregate(neon.query.MIN, layer.aggregationField.columnName, COUNT_FIELD_NAME);
        }
        if(layer.aggregationType === "max") {
            query.aggregate(neon.query.MAX, layer.aggregationField.columnName, COUNT_FIELD_NAME);
        }

        query.aggregate(neon.query.MIN, layer.dateField.columnName, 'date').sortBy('date', neon.query.ASCENDING);

        if(!layer.filter && $scope.functions.isFilterSet()) {
            var filterClause = $scope.functions.createNeonFilterClause({
                    database: layer.database.name,
                    table: layer.table.name
                }, layer.dateField.columnName);

            query.ignoreFilters([$scope.functions.getFilterKey(layer, filterClause)]);
        }

        return query;
    };

    $scope.functions.removeFilterValues = function() {
        $scope.extent = [];
        $scope.functions.removeLinks($scope.visualizationId);
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 2) {
            $scope.extent = [new Date(neonFilter.filter.whereClause.whereClauses[0].rhs), new Date(neonFilter.filter.whereClause.whereClauses[1].rhs)];
            updateLinks();
        }
    };

    var updateLinks = function() {
        var linkData = {};
        linkData[neonMappings.DATE] = {};
        linkData[neonMappings.DATE][neonMappings.START_DATE] = $scope.extent[0].toISOString();
        linkData[neonMappings.DATE][neonMappings.END_DATE] = $scope.extent[1].toISOString();
        $scope.showLinksPopupButton = $scope.functions.createLinksForData(neonMappings.DATE, linkData, $scope.getLinksPopupDateKey());
    };

    $scope.functions.needToUpdateFilter = function(neonFilters) {
        if(!neonFilters.length || $scope.functions.getNumberOfFilterClauses(neonFilters[0]) !== 2) {
            return false;
        }

        // The start and end dates for each given neon filter must be the same.
        var start = neonFilters[0].filter.whereClause.whereClauses[0].rhs;
        var end = neonFilters[0].filter.whereClause.whereClauses[1].rhs;

        // If the dates in the neon filter are the same as the extent then we don't need to update the extent.
        var same = $scope.extent.length ? $scope.extent[0].getTime() === start.getTime() && $scope.extent[1].getTime() === end.getTime() : false;
        var answer = !same;

        neonFilters.forEach(function(neonFilter) {
            answer = answer && $scope.functions.getNumberOfFilterClauses(neonFilter) === 2 && start.getTime() === neonFilter.filter.whereClause.whereClauses[0].rhs.getTime() &&
                end.getTime() === neonFilter.filter.whereClause.whereClauses[1].rhs.getTime();
        });

        return answer;
    };

    $scope.functions.onUpdateFields = function(layer) {
        updateFields(layer, {});
    };

    var updateFields = function(layer, config) {
        layer.dateField = $scope.functions.findFieldObject(config.dateField, neonMappings.DATE, layer);
        layer.aggregationField = $scope.functions.findFieldObject(config.aggregationField, neonMappings.Y_AXIS, layer);
        layer.groupField = $scope.functions.findFieldObject(config.groupField, neonMappings.LINE_GROUPS, layer);
        $scope.validateLayerFields(layer);
    };

    $scope.functions.addToNewLayer = function(layer, config) {
        layer.id = uuid();
        layer.aggregationType = config.aggregationType || "count";
        updateFields(layer, config);
        return layer;
    };

    /**
     * Sets the validity of the given chart. If no chart is given, the new chart object is used.
     * @param {Object} [chart]
     * @param {Number} [index]
     * @method validateLayerFields
     */
    $scope.validateLayerFields = function(layer) {
        var fields = [];
        if(!$scope.functions.isFieldValid(layer.dateField)) {
            fields.push("Date");
        }
        if(layer.aggregationType !== "count" && !$scope.functions.isFieldValid(layer.aggregationField)) {
            fields.push("Aggregation Field");
        }
        layer.error = fields.length ? "Please choose fields:  " + fields.join(", ") : undefined;
    };

    /**
     * Shows/hides the legend
     * @method toggleLegend
     */
    $scope.toggleLegend = function() {
        $scope.active.legend.show = !$scope.active.legend.show;
    };

    /**
     * Shows/hides the legend for a single chart
     * @param {Number} index The index in the legend that contains the chart to show/hide
     * @method toggleLegendChart
     */
    $scope.toggleLegendChart = function(id) {
        $scope.active.legend.layers[id].show = !$scope.active.legend.layers[id].show;
    };

    /**
     * Compares the two given data points for a sort function based on their aggregation type.
     * @param {Array} a
     * @param {Array} b
     * @method compareSeriesData
     * @return {Integer}
     */
    var compareSeriesData = function(a, b) {
        if(a.aggregation === "count" || a.aggregation === "sum" || a.aggregation === "average") {
            if(a.total < b.total) {
                return 1;
            }
            if(a.total > b.total) {
                return -1;
            }
        }
        if(a.aggregation === "min") {
            if(a.min < b.min) {
                return -1;
            }
            if(a.min > b.min) {
                return 1;
            }
        }
        if(a.aggregation === "max") {
            if(a.max < b.max) {
                return 1;
            }
            if(a.max > b.max) {
                return -1;
            }
        }
        return 0;
    };

    /**
     * Creates and returns the "other series" representing the combined groups outside the "top 10" (the value of the seriesLimit) from the given data.
     * @param {Object} layer
     * @param {Array} data
     * @method createOtherSeriesData
     * @return {Object}
     */
    var createOtherSeriesData = function(layer, data) {
        var count = data.length - $scope.seriesLimit;
        var text = "";
        if(data.length) {
            text = data[0].series.split(":")[0] + ":";
        }
        var otherSeriesData = {
            series: text + count + " Others",
            total: 0,
            min: undefined,
            max: undefined,
            data: []
        };

        // For averages, do not include the combined values of groups outside the top 10 because adding averages together from multiple groups makes no sense.
        if(layer.aggregationType !== 'average') {
            for(var i = $scope.seriesLimit; i < data.length; i++) {
                otherSeriesData.total += data[i].total;
                otherSeriesData.min = _.isUndefined(otherSeriesData.min) ? data[i].min : Math.min(otherSeriesData.min, data[i].min);
                otherSeriesData.max = _.isUndefined(otherSeriesData.max) ? data[i].max : Math.max(otherSeriesData.max, data[i].max);
                for(var d = 0; d < data[i].data.length; d++) {
                    if(otherSeriesData.data[d]) {
                        if((layer.aggregationType === "count" || layer.aggregationType === "sum") && !_.isUndefined(data[i].data[d].value)) {
                            if(_.isUndefined(otherSeriesData.data[d].value)) {
                                otherSeriesData.data[d].value = data[i].data[d].value;
                            } else {
                                otherSeriesData.data[d].value += data[i].data[d].value;
                            }
                        }
                        if(layer.aggregationType === "min" && !_.isUndefined(data[i].data[d].value)) {
                            if(_.isUndefined(otherSeriesData.data[d].value)) {
                                otherSeriesData.data[d].value = data[i].data[d].value;
                            } else {
                                otherSeriesData.data[d].value = Math.min(otherSeriesData.data[d].value, data[i].data[d].value);
                            }
                        }
                        if(layer.aggregationType === "max" && !_.isUndefined(data[i].data[d].value)) {
                            if(_.isUndefined(otherSeriesData.data[d].value)) {
                                otherSeriesData.data[d].value = data[i].data[d].value;
                            } else {
                                otherSeriesData.data[d].value = Math.max(otherSeriesData.data[d].value, data[i].data[d].value);
                            }
                        }
                    } else {
                        otherSeriesData.data[d] = {
                            date: data[i].data[d].date,
                            value: data[i].data[d].value
                        };
                    }
                }
            }
        }

        return otherSeriesData;
    };

    /**
     * Creates the line series data for a given layer using the given data, and the min and max dates.
     * @param {Object} layer
     * @param {Object} data
     * @param {Date} minDate
     * @param {Date} maxDate
     * @method createLineSeriesData
     */
    var createLineSeriesData = function(layer, data, minDate, maxDate) {
        //this prevents an error in older mongo caused when the xAxis value is invalid as it is not
        //included as a key in the response
        for(var i = 0; i < data.length; i++) {
            if(typeof(data[i][layer.dateField.columnName]) === 'undefined') {
                data[i][layer.dateField.columnName] = null;
            }
        }

        var seriesData = [];
        var zeroedData = zeroPadData(layer, data, minDate, maxDate);

        for(var series in zeroedData) {
            if(Object.prototype.hasOwnProperty.call(zeroedData, series)) {
                seriesData.push(zeroedData[series]);
            }
        }

        seriesData.sort(compareSeriesData);

        // The "other series" is the line representing the combined groups outside the "top 10" (the value of the seriesLimit).
        var otherSeriesData = createOtherSeriesData(layer, seriesData);

        seriesData = seriesData.splice(0, $scope.seriesLimit);

        if(otherSeriesData.total > 0) {
            seriesData.push(otherSeriesData);
        }

        if(!layer.show) {
            seriesData.forEach(function(series) {
                series.hidden = true;
            });
        }

        XDATA.userALE.log({
            activity: "alter",
            action: "receive",
            elementId: "linechart",
            elementType: "canvas",
            elementSub: "linechart",
            elementGroup: "chart_group",
            source: "system",
            tags: ["receive", "linechart"]
        });

        return seriesData;
    };

    /**
     * Shows/hides the line associated with the given color mapping.
     * @param {Object} colorMapping
     * @method toggleSeries
     */
    $scope.toggleSeries = function(colorMapping) {
        var activity = $scope.chart.toggleSeries(colorMapping.series);
        colorMapping.hidden = (activity === "show") ? false : true;
        $scope.chart.showTrendlines($scope.active.showTrendlines);

        var layerId = colorMapping.series.split(":")[0];
        var allHidden = _.every($scope.colorMappings[layerId], 'hidden');

        var layer = _.find($scope.active.layers, {
            id: layerId
        });
        layer.show = !allHidden;

        XDATA.userALE.log({
            activity: activity,
            action: "click",
            elementId: "linechart",
            elementType: "canvas",
            elementSub: "linechart",
            elementGroup: "chart_group",
            source: "system",
            tags: ["render", "linechart", colorMapping.series]
        });
    };

    $scope.functions.onToggleShowLayer = function(layer) {
        var activity = $scope.chart.toggleSeriesGroup(layer.id, (layer.show ? 'show' : 'hide'));
        $scope.chart.showTrendlines($scope.active.trendlines);
        _.each($scope.colorMappings[layer.id], function(colorMapping) {
            colorMapping.hidden = !layer.show;
        });

        XDATA.userALE.log({
            activity: activity,
            action: "click",
            elementId: "linechart",
            elementType: "canvas",
            elementSub: "linechart",
            elementGroup: "chart_group",
            source: "system",
            tags: ["render", "linechart", layer.name]
        });
    };

    /**
     * Creates a series object to use when drawing the given layer. Creates dates in the object from minDate
     * to maxDate and sets all dates not in the given data to zero.
     * @param {Object} layer
     * @param {Array} data
     * @param {Date} minDate
     * @param {Date} maxDate
     * @return {Object}
     * @method zeroPadData
     * @private
     */
    var zeroPadData = function(layer, data, minDate, maxDate) {
        $scope.dateStringToDataIndex = {};

        var i = 0;
        var start = zeroOutDate(minDate);
        var end = zeroOutDate(maxDate);

        var numBuckets;
        var millis;

        if($scope.active.granularity === $scope.active.DAY) {
            millis = (1000 * 60 * 60 * 24);
            numBuckets = Math.ceil(Math.abs(end - start) / millis) + 1;
        } else {
            millis = (1000 * 60 * 60);
            numBuckets = Math.ceil(Math.abs(end - start) / millis) + 1;
        }

        var startTime = start.getTime();

        var resultData = {};

        var series = layer.aggregationField.columnName;
        var aggType;
        if(layer.aggregationType === 'count') {
            series = 'Count';
            aggType = 'count';
        }
        if(layer.aggregationType === 'average') {
            series = 'Average ' + layer.aggregationField.columnName;
            aggType = 'average';
        }
        if(layer.aggregationType === 'sum') {
            series = 'Sum ' + layer.aggregationField.columnName;
            aggType = 'sum';
        }
        if(layer.aggregationType === 'min') {
            series = 'Minimum ' + layer.aggregationField.columnName;
            aggType = 'min';
        }
        if(layer.aggregationType === 'max') {
            series = 'Maximum ' + layer.aggregationField.columnName;
            aggType = 'max';
        }

        // Add the visualization id to the beginning of the series name to decipher which chart
        // the data is coming from
        series = layer.id + ":" + series;

        // Scrape data for unique series
        for(i = 0; i < data.length; i++) {
            if($scope.functions.isFieldValid(layer.groupField)) {
                series = layer.id + ":" + (data[i][layer.groupField.columnName] !== '' ? data[i][layer.groupField.columnName] : 'Unknown');
            }

            if(!resultData[series]) {
                resultData[series] = {
                    series: series,
                    count: 0,
                    total: 0,
                    min: undefined,
                    max: undefined,
                    aggregation: aggType,
                    data: []
                };
            }
        }

        // Initialize our data buckets.
        for(i = 0; i < numBuckets; i++) {
            var bucketGraphDate = new Date(startTime + (millis * i));
            for(series in resultData) {
                if(Object.prototype.hasOwnProperty.call(resultData, series)) {
                    resultData[series].data.push({
                        date: bucketGraphDate,
                        value: undefined
                    });
                }
            }
        }

        // Populate series with data
        var indexDate;
        for(i = 0; i < data.length; i++) {
            indexDate = new Date(data[i].date);
            var dataIndex = Math.floor(Math.abs(indexDate - start) / millis);

            if(dataIndex >= 0 && dataIndex + 1 <= numBuckets) {
                if($scope.functions.isFieldValid(layer.groupField)) {
                    series = data[i][layer.groupField.columnName] !== '' ? data[i][layer.groupField.columnName] : 'Unknown';
                    series = layer.id + ":" + series;
                }

                data[i].value = _.isNumber(data[i].value) ? data[i].value : undefined;

                if(_.isUndefined(resultData[series].data[dataIndex].value)) {
                    resultData[series].data[dataIndex].value = data[i].value;
                } else if(!_.isUndefined(data[i].value)) {
                    resultData[series].data[dataIndex].value += data[i].value;
                }

                // Only calculate total, min, and max if the value is defined
                if(!_.isUndefined(data[i].value)) {
                    resultData[series].total += data[i].value;
                    resultData[series].min = _.isUndefined(resultData[series].min) ? data[i].value : Math.min(resultData[series].min, data[i].value);
                    resultData[series].max = _.isUndefined(resultData[series].max) ? data[i].value : Math.max(resultData[series].max, data[i].value);
                }

                // Save the mapping from date string to data index so we can find the data index using the chart brush extent while calculating aggregations for brushed line charts.
                $scope.dateStringToDataIndex[indexDate.toDateString()] = Math.floor(Math.abs(indexDate - start) / millis);
            }
        }

        return resultData;
    };

    /**
     * Tells other visualizations the given dates are highlighted.
     * @param {Date} startDate
     * @param {Date} endDate
     * @method onHover
     * @private
     */
    var onHover = function(startDate, endDate) {
        $scope.$apply(function() {
            $scope.functions.publish("date_selected", {
                start: startDate,
                end: endDate
            });
        });
    };

    /**
     * Returns the chart name associated with the given color mapping.
     * @param {Object} colorMapping
     * @return {String}
     * @method getTitleFromMapping
     */
    $scope.getTitleFromMapping = function(colorMapping) {
        return _.result(
            _.findWhere($scope.active.layers, {
                id: colorMapping.series.split(":")[0]
            }),
            "name"
        );
    };

    /**
     * Creates and draws a new line chart with the given data and color mappings.
     * @param {Array} data
     * @param {Object} colorMappings
     * @method drawLineChart
     */
    var drawLineChart = function(data, colorMappings) {
        var opts = {
            x: "date",
            y: "value",
            hoverListener: onHover,
            responsive: true,
            granularity: $scope.active.granularity,
            seriesToColors: colorMappings
        };

        // Destroy the old chart and rebuild it.
        if($scope.chart) {
            $scope.chart.destroy();
        }
        $scope.chart = new charts.LineChart($scope.functions.getElement()[0], ".line-chart", opts);
        data.forEach(function(item) {
            if(item.hidden) {
                $scope.chart.addHiddenSeries(item.series);
            }
            delete item.hidden;
        });
        $scope.chart.setBrushHandler(function(extent) {
            $scope.$apply(function() {
                $scope.extent = extent;
                updateLinks();
                $scope.functions.updateNeonFilter();
            });
        });
        $scope.chart.draw(data);
        $scope.chart.showTrendlines($scope.active.showTrendlines);
        $scope.colorMappings = $scope.chart.getColorMappings();
        $scope.active.legend.layers = {};
        _.each($scope.colorMappings, function(mappingArray, id) {
            $scope.active.legend.layers[id] = {
                show: true
            };
        });
        $scope.hideNoDataError = data && data.length;
    };

    /**
     * Sets the minutes, seconds and millis to 0. If the granularity of the date is day, then the hours are also zeroed
     * @param date
     * @returns {Date}
     */
    var zeroOutDate = function(date) {
        var zeroed = new Date(date);
        zeroed.setUTCMinutes(0);
        zeroed.setUTCSeconds(0);
        zeroed.setUTCMilliseconds(0);
        if($scope.active.granularity === $scope.active.DAY) {
            zeroed.setUTCHours(0);
        }
        return zeroed;
    };

    /**
     * Uses the given function to calculate the aggregated value of the given data between the start and end extent of the chart brush.
     * @param {Array} data
     * @param {Function} calculationFunction
     * @method calculateBrushedAggregationValue
     * @return {Number}
     */
    var calculateBrushedAggregationValue = function(data, calculationFunction) {
        if($scope.extent.length < 2) {
            return 0;
        }

        var start = $scope.dateStringToDataIndex[$scope.extent[0].toDateString()] || 0;
        var end = $scope.dateStringToDataIndex[$scope.extent[1].toDateString()] || data.length;
        var value = 0;
        for(var i = start; i < end; ++i) {
            if(!_.isUndefined(data[i].value)) {
                value = calculationFunction(data[i].value, value);
            }
        }
        return value;
    };

    /**
     * Returns the text to display in the legend containing the aggregated value for the given object.
     * @param {Number} id
     * @param {Object} colorMappingObject
     * @method getLegendItemAggregationText
     * @return {String}
     */
    $scope.getLegendItemAggregationText = function(id, colorMappingObject) {
        var index = _.findIndex($scope.active.layers, function(layer) {
            return layer.id === id;
        });
        var aggregationType = index >= 0 ? $scope.active.layers[index].aggregationType : undefined;
        var total = 0;
        var text = colorMappingObject.series.split(":").slice(1).join(":");
        if((aggregationType === "count" || aggregationType === "sum") && !_.isUndefined(colorMappingObject.total)) {
            total = colorMappingObject.total;
            if($scope.extent.length >= 2) {
                total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                    return indexValue + aggregationValue;
                });
            }
            text += " (" + $filter('number')(total) + ")";
        }
        if(aggregationType === "min" && !_.isUndefined(colorMappingObject.min)) {
            var min = colorMappingObject.min;
            if($scope.extent.length >= 2) {
                total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                    return Math.min(indexValue, aggregationValue);
                });
            }
            text += " (" + min + ")";
        }
        if(aggregationType === "max" && !_.isUndefined(colorMappingObject.max)) {
            var max = colorMappingObject.max;
            if($scope.extent.length >= 2) {
                total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                    return Math.max(indexValue, aggregationValue);
                });
            }
            text += " (" + max + ")";
        }
        return text;
    };

    $scope.functions.getFilterFields = function(layer) {
        return [layer.dateField];
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    $scope.functions.hideHeaders = function() {
        return false;
    };

    $scope.functions.isFilterSet = function() {
        return $scope.extent.length;
    };

    $scope.functions.createFilterTrayText = function(databaseName, tableName, fieldNames) {
        return databaseName + " - " + tableName + " - " + fieldNames[0] + " = " + getDateString($scope.extent[0]) + " to " + getDateString($scope.extent[1]);
    };

    /**
     * Returns the string version of the given date. Set includeTime to true if
     * the returning string should include the minutes.
     * @param {Date} date
     * @param {Boolean} includeTime
     * @return {String}
     * @method getDateString
     * @private
     */
    var getDateString = function(date, includeTime) {
        var dateString = (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
        if(includeTime) {
            dateString = dateString + " " + date.getHours() + ":" + (date.getMinutes() < 10 ? "0" : "") + date.getMinutes();
        }
        return dateString;
    };

    $scope.functions.updateData = function(data, layers) {
        if(!data) {
            drawLineChart([], {});
            return;
        }

        // The line chart will only query for data from one layer at a time.
        var layer = layers[0];

        $scope.data[layer.id] = data;
    };

    /**
     * Redraws all visible line charts using the data from the previous queries within the current chart brush extent.
     */
    $scope.functions.onDoneQueryAndUpdate = function() {
        var dateRange = getDateRange();
        var fullDateRange = getDateRange(true);

        // If the chart brush extent does not overlap with the date range of the data, just draw an empty chart.
        if(!_.keys($scope.data).length || $scope.extent[1] < fullDateRange.minDate || $scope.extent[0] > fullDateRange.maxDate) {
            drawLineChart([], {});
            return;
        }

        var seriesData = [];
        var colorMappings = {};

        // Get all series data and color mappings for each chart layer.
        $scope.active.layers.forEach(function(layer) {
            var updatedData = $scope.data[layer.id] || [];

            // Get only the data within the chart brush extent if filter is enabled.
            if(layer.filter && $scope.extent.length >= 2) {
                var indices = getIndicesForData(updatedData, $scope.extent[0], $scope.extent[1]);
                updatedData = updatedData.slice(indices.startIndex, indices.endIndex);
            }
            seriesData = seriesData.concat(createLineSeriesData(layer, updatedData, dateRange.minDate, dateRange.maxDate));

            // Get any color mappings set in the configuration file
            if($scope.functions.isFieldValid(layer.groupField)) {
                var colors = $scope.functions.getColorMaps(layer, layer.groupField.columnName);
                colors = _.transform(colors, function(result, value, key) {
                    result[layer.id + ":" + key] = value;
                });
                colorMappings = _.merge(colorMappings, colors);
            }
        });

        drawLineChart(seriesData, colorMappings);
    };

    /*
     * Finds the indices in the data that give the first and last data that will be shown
     * on the graph using any chart brush extents set.
     * @param {Object} data
     * @return {Object} Returns an object containing startIndex and endIndex.
     * @method getIndicesForData
     * @private
     */
    var getIndicesForData = function(data, minDate, maxDate) {
        var startIndex = 0;
        var endIndex = data.length;

        data.forEach(function(item, index) {
            var date = zeroOutDate(new Date(item.date));
            if(date < minDate) {
                startIndex = index + 1;
            }
            if(date < maxDate) {
                endIndex = index + 1;
            }
        });

        return {
            startIndex: startIndex,
            endIndex: endIndex
        };
    };

    /*
     * Finds the min and max dates within the chart brush extent for all charts.
     * @param {Boolean} ignoreFilter Set to true to find the min and max dates disregarding
     * any chart brush extents.
     * @return {Object} Returns an object contain minDate and maxDate.
     * @method getDateRange
     * @private
     */
    var getDateRange = function(ignoreFilter) {
        var minDate;
        var maxDate;

        if($scope.extent.length < 2 || ignoreFilter) {
            $scope.active.layers.forEach(function(layer) {
                var min;
                var max;

                if($scope.data[layer.id]) {
                    var range = d3.extent($scope.data[layer.id], function(d) {
                        return new Date(d.date);
                    });
                    min = range[0];
                    max = range[1];

                    if(min < minDate || !minDate) {
                        minDate = min;
                    }
                    if(max > maxDate || !maxDate) {
                        maxDate = max;
                    }
                }
            });
        } else {
            minDate = $scope.extent[0];
            maxDate = $scope.extent[1];
        }

        return {
            minDate: minDate || new Date(),
            maxDate: maxDate || new Date()
        };
    };

    /**
     * Removes the chart brush extent from this visualization and the dataset service.
     * @method removeFilter
     */
    $scope.removeFilter = function() {
        $scope.functions.removeNeonFilter();
    };

    /**
     * Creates and returns a filter on the given date field using the chart brush extent set by this visualization.
     * @param {Object} databaseAndTableName Contains the database and table name
     * @param {String} dateFieldName The name of the date field on which to filter
     * @method createFilterClauseForDate
     * @return {Object} A neon.query.Filter object or undefined if a filter clause could not be created
     */
    $scope.functions.createNeonFilterClause = function(databaseAndTableName, dateFieldName) {
        if(!$scope.functions.isFilterSet()) {
            return undefined;
        }

        var startFilterClause = neon.query.where(dateFieldName, ">=", $scope.extent[0]);
        var endFilterClause = neon.query.where(dateFieldName, "<", $scope.extent[1]);
        return neon.query.and.apply(this, [startFilterClause, endFilterClause]);
    };

    $scope.getFilterData = function() {
        return $scope.functions.isFilterSet() ? ["Date Filter"] : [];
    };

    $scope.createFilterDesc = function() {
        return "Date from " + $scope.extent[0].toUTCString() + " to " + $scope.extent[1].toUTCString();
    };

    $scope.functions.createExportDataObject = function(exportId, queryData) {
        var finalObject = {
            name: "Line_Chart",
            data: []
        };

        queryData.forEach(function(item) {
            if(item.layer.show) {
                var tempObject = {
                    query: item.query,
                    name: "linechart-" + item.layer.name + "-" + exportId,
                    fields: [],
                    ignoreFilters: item.query.ignoreFilters_,
                    selectionOnly: item.query.selectionOnly_,
                    ignoredFilterIds: item.query.ignoredFilterIds_,
                    type: "query"
                };
                tempObject.fields.push({
                    query: "year",
                    pretty: "Year"
                });
                tempObject.fields.push({
                    query: "month",
                    pretty: "Month"
                });
                tempObject.fields.push({
                    query: "day",
                    pretty: "Day"
                });
                if($scope.active.granularity === "hour") {
                    tempObject.fields.push({
                        query: "hour",
                        pretty: "Hour"
                    });
                }

                if(item.layer.aggregationType === "count") {
                    tempObject.fields.push({
                        query: "value",
                        pretty: "Count"
                    });
                } else if(item.layer.aggregationType === "sum") {
                    tempObject.fields.push({
                        query: "value",
                        pretty: "Sum of " + item.query.aggregates[0].field
                    });
                } else if(item.layer.aggregationType === "average") {
                    tempObject.fields.push({
                        query: "value",
                        pretty: "Average of " + item.query.aggregates[0].field
                    });
                } else if(item.layer.aggregationType === "min") {
                    tempObject.fields.push({
                        query: "value",
                        pretty: "Min of " + item.query.aggregates[0].field
                    });
                } else if(item.layer.aggregationType === "max") {
                    tempObject.fields.push({
                        query: "value",
                        pretty: "Max of " + item.query.aggregates[0].field
                    });
                }

                tempObject.fields.push({
                    query: item.query.aggregates[1].name,
                    pretty: item.query.aggregates[1].field
                });

                finalObject.data.push(tempObject);
            }
        });

        return finalObject;
    };

    $scope.functions.addToLayerBindings = function(bindings, layer) {
        bindings.aggregationType = layer.aggregationType;
        bindings.dateField = $scope.functions.isFieldValid(layer.dateField) ? layer.dateField.columnName : "";
        bindings.aggregationField = $scope.functions.isFieldValid(layer.aggregationField) ? layer.aggregationField.columnName : "";
        bindings.groupField = $scope.functions.isFieldValid(layer.groupField) ? layer.groupField.columnName : "";
        return bindings;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.granularity = $scope.active.granularity;
        return bindings;
    };
}]);

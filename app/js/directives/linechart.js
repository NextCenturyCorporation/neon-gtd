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

/**
 * This directive adds a linechart to the DOM and drives the visualization data from
 * whatever database and table are currently selected in neon.  This directive accomplishes that
 * by using getting a neon connection from a connection service and listening for
 * neon system events (e.g., data tables changed).  On these events, it requeries the active
 * connection for data and updates applies the change to its scope.  The contained
 * barchart will update as a result.
 * @namespace neonDemo.directives
 * @class linechart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('linechart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', '$timeout', '$filter',
function(connectionService, datasetService, errorNotificationService, filterService, $timeout, $filter) {
    var COUNT_FIELD_NAME = 'value';

    return {
        templateUrl: 'partials/directives/linechart.html',
        restrict: 'EA',
        scope: {
            bindDateField: '=',
            bindYAxisField: '=',
            bindCategoryField: '=',
            bindAggregationField: '=',
            bindTable: '=',
            bindDatabase: '=',
            colorMappings: '&',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('linechartDirective');

            $scope.element = $element;

            $scope.optionsMenuButtonText = function() {
                if($scope.noData) {
                    return "No Data";
                }
                if($scope.colorMappings.length >= $scope.seriesLimit) {
                    return "Top " + $scope.seriesLimit;
                }
                return "";
            };
            $scope.showOptionsMenuButtonText = function() {
                return $scope.noData || $scope.colorMappings.length >= $scope.seriesLimit;
            };

            $scope.databases = [];
            $scope.tables = [];
            $scope.totalType = 'count';
            $scope.fields = [];
            $scope.filterKeys = {};
            $scope.chart = undefined;
            $scope.brushExtent = [];
            $scope.colorMappings = [];
            $scope.dateStringToDataIndex = {};
            $scope.seriesLimit = 10;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.noData = true;

            $scope.options = {
                database: {},
                table: {},
                attrX: "",
                attrY: "",
                categoryField: "",
                aggregation: "count"
            };

            var updateChartSize = function() {
                if($scope.chart) {
                    var headerHeight = 0;
                    $element.find(".header-container").each(function() {
                        headerHeight += $(this).outerHeight(true);
                    });
                    $element.find('.linechart').height($element.height() - headerHeight);
                    // Redraw the line chart.
                    $scope.chart.draw();
                }
            };

            var initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.DATE_CHANGED, onDateChanged);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "linechart",
                        elementType: "canvas",
                        elementSub: "linechart",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["remove", "linechart"]
                    });
                    $element.off("resize", updateChartSize);
                    $scope.messenger.removeEvents();
                    if($scope.brushExtent.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(updateChartSize);

                // The size of the legend will change whenever the filter notification is added or removed so the chart may need to be resized and redrawn.
                $element.find(".legend").resize(updateChartSize);

                $scope.$watch('options.attrX', function(newValue) {
                    onFieldChange('attrX', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('options.attrY', function(newValue) {
                    onFieldChange('attrY', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('options.categoryField', function(newValue) {
                    onFieldChange('categoryField', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('options.aggregation', function(newValue) {
                    onFieldChange('aggregation', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData();
                    }
                });
            };

            var onFieldChange = function(field, newValue) {
                var source = "user";
                var action = "click";

                // Override the default action if a field changes while loading data during
                // intialization or a dataset change.
                if($scope.loadingData) {
                    source = "system";
                    action = "reset";
                }

                XDATA.userALE.log({
                    activity: "select",
                    action: action,
                    elementId: "linechart",
                    elementType: "combobox",
                    elementSub: "linechart-" + field,
                    elementGroup: "chart_group",
                    source: source,
                    tags: ["options", "linechart", newValue]
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["filter-change", "linechart"]
                });

                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    // If the filter changed event was triggered by a change in the global date filter, ignore the filter changed event.
                    // We don't need to re-query and we'll update the brush extent extent in response to the date changed event.
                    var whereClauses = message.addedFilter.whereClause ? message.addedFilter.whereClause.whereClauses : undefined;
                    if(whereClauses && whereClauses.length === 2 && whereClauses[0].lhs === $scope.options.attrX && whereClauses[1].lhs === $scope.options.attrX) {
                        return;
                    }
                    $scope.queryForData();
                }
            };

            /**
             * Event handler for date changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon date changed message.
             * @method onDateChanged
             * @private
             */
            var onDateChanged = function(message) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "receive",
                    elementId: "linechart-range",
                    elementType: "canvas",
                    elementSub: "date-range",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["linechart", "date-range", "filter-change"]
                });

                if($scope.options.database.name === message.databaseName && $scope.options.table.name === message.tableName && $scope.brushExtent !== message.brushExtent) {
                    renderBrushExtent(message.brushExtent);
                    $scope.queryForData();
                }
            };

            var renderBrushExtent = function(brushExtent) {
                $scope.brushExtent = brushExtent || [];
            };

            $scope.queryForData = function() {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "linechart"]
                });

                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.attrX || (!$scope.options.attrY && $scope.options.aggregation !== "count")) {
                    drawLineChart();
                    $scope.loadingData = false;
                    return;
                }

                var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, $scope.options.attrX, 'year');
                var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, $scope.options.attrX, 'month');
                var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, $scope.options.attrX, 'day');

                var groupByClause = [yearGroupClause, monthGroupClause, dayGroupClause];
                if($scope.options.categoryField) {
                    groupByClause.push($scope.options.categoryField);
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .where($scope.options.attrX, '!=', null);

                query.groupBy.apply(query, groupByClause);

                if($scope.options.aggregation === "count") {
                    query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "sum") {
                    query.aggregate(neon.query.SUM, $scope.options.attrY, COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "average") {
                    query.aggregate(neon.query.AVG, $scope.options.attrY, COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "min") {
                    query.aggregate(neon.query.MIN, $scope.options.attrY, COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "max") {
                    query.aggregate(neon.query.MAX, $scope.options.attrY, COUNT_FIELD_NAME);
                }

                query.aggregate(neon.query.MIN, $scope.options.attrX, 'date')
                    .sortBy('date', neon.query.ASCENDING);

                connection.executeQuery(query, handleQuerySuccess, handleQueryFailure);
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                        }
                    }
                }
                $scope.filterKeys = filterService.createFilterKeys("linechart", datasetService.getDatabaseAndTableNames(), datasetService.getDateFilterKeys());

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["date", "y_axis"]) || $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.options.attrX = $scope.bindDateField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "date") || "";
                $scope.options.attrY = $scope.bindYAxisField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "y_axis") || "";
                $scope.options.categoryField = $scope.bindCategoryField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "line_category") || "";
                $scope.options.aggregation = $scope.bindAggregationField || "count";
                $scope.fields = datasetService.getDatabaseFields($scope.options.database.name, $scope.options.table.name);
                $scope.fields.sort();

                var globalBrushExtent = datasetService.getDateBrushExtent($scope.options.database.name, $scope.options.table.name);
                if($scope.brushExtent !== globalBrushExtent) {
                    renderBrushExtent(globalBrushExtent);
                } else if($scope.brushExtent.length) {
                    $scope.removeBrush();
                }
                $scope.queryForData();
            };

            /**
             * Compares the two given data points for a sort function based on the current aggregation type.
             * @param {Array} a
             * @param {Array} b
             * @method compareData
             * @return {Integer}
             */
            var compareData = function(a, b) {
                if($scope.options.aggregation === "count" || $scope.options.aggregation === "sum" || $scope.options.aggregation === "average") {
                    if(a.total < b.total) {
                        return 1;
                    }
                    if(a.total > b.total) {
                        return -1;
                    }
                }
                if($scope.options.aggregation === "min") {
                    if(a.min < b.min) {
                        return -1;
                    }
                    if(a.min > b.min) {
                        return 1;
                    }
                }
                if($scope.options.aggregation === "max") {
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
             * @param {Array} data
             * @method createOtherSeries
             * @return {Object}
             */
            var createOtherSeries = function(data) {
                var count = data.length - $scope.seriesLimit;
                var otherSeries = {
                    series: count + " Others",
                    total: 0,
                    min: -1,
                    max: -1,
                    data: []
                };

                // For averages, do not include the combined values of groups outside the top 10 because adding averages together from multiple groups makes no sense.
                if($scope.options.aggregation !== 'average') {
                    for(var i = $scope.seriesLimit; i < data.length; i++) {
                        otherSeries.total += data[i].total;
                        otherSeries.min = otherSeries.min < 0 ? data[i].min : Math.min(otherSeries.min, data[i].min);
                        otherSeries.max = otherSeries.max < 0 ? data[i].max : Math.max(otherSeries.max, data[i].max);
                        for(var d = 0; d < data[i].data.length; d++) {
                            if(otherSeries.data[d]) {
                                if($scope.options.aggregation === "count" || $scope.options.aggregation === "sum") {
                                    otherSeries.data[d].value += data[i].data[d].value;
                                }
                                if($scope.options.aggregation === "min") {
                                    otherSeries.data[d].value = Math.min(otherSeries.data[d].value, data[i].data[d].value);
                                }
                                if($scope.options.aggregation === "max") {
                                    otherSeries.data[d].value = Math.max(otherSeries.data[d].value, data[i].data[d].value);
                                }
                            } else {
                                otherSeries.data[d] = {
                                    date: data[i].data[d].date,
                                    value: data[i].data[d].value
                                };
                            }
                        }
                    }
                }

                return otherSeries;
            };

            /**
             * Draws a new line chart with the given results from the successful query.
             * @param {Object} results
             * @method handleQuerySuccess
             */
            var handleQuerySuccess = function(results) {
                var minDate;
                var maxDate;

                //this prevents an error in older mongo caused when the xAxis value is invalid as it is not
                //included as a key in the response
                for(var i = 0; i < results.data.length; i++) {
                    if(typeof(results.data[i][$scope.options.attrX]) === 'undefined') {
                        results.data[i][$scope.options.attrX] = null;
                    }
                }

                if(results.data.length > 0) {
                    var range = d3.extent(results.data, function(d) {
                        return new Date(d.date);
                    });
                    minDate = range[0];
                    maxDate = range[1];
                } else {
                    minDate = new Date();
                    maxDate = new Date();
                }

                var data = [];
                var series = [];
                var zeroedData = zeroPadData(results.data, minDate, maxDate);

                for(series in zeroedData) {
                    if(Object.prototype.hasOwnProperty.call(zeroedData, series)) {
                        data.push(zeroedData[series]);
                    }
                }

                data.sort(compareData);

                // The "other series" is the line representing the combined groups outside the "top 10" (the value of the seriesLimit).
                var otherSeries = createOtherSeries(data);

                data = data.splice(0, $scope.seriesLimit);

                if(otherSeries.total > 0) {
                    data.push(otherSeries);
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

                $scope.$apply(function() {
                    drawLineChart(data);
                    $scope.loadingData = false;
                    // Use a timeout so we resize the chart after the legend renders (since the legend size affects the chart size).
                    $timeout(function() {
                        updateChartSize();
                    }, 100);
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "render",
                        elementId: "linechart",
                        elementType: "canvas",
                        elementSub: "linechart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["render", "linechart"]
                    });
                });
            };

            /**
             * Draws a blank line chart and displays the error in the given response from the failed query.
             * @param {Object} response
             * @method handleQueryFailure
             */
            var handleQueryFailure = function(response) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "failed",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["failed", "linechart"]
                });

                drawLineChart();
                $scope.loadingData = false;

                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                }
            };

            $scope.toggleSeries = function(series) {
                var activity = $scope.chart.toggleSeries(series);
                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["render", "linechart", series]
                });
            };

            var zeroPadData = function(data, minDate, maxDate) {
                $scope.dateStringToDataIndex = {};

                var i = 0;
                var start = zeroOutDate(minDate);
                var end = zeroOutDate(maxDate);

                var dayMillis = (1000 * 60 * 60 * 24);
                var numBuckets = Math.ceil(Math.abs(end - start) / dayMillis) + 1;

                var startTime = start.getTime();

                var resultData = {};

                var series = $scope.options.attrY;
                if($scope.options.aggregation === 'count') {
                    series = 'Count ' + $scope.options.attrY;
                }
                if($scope.options.aggregation === 'average') {
                    series = 'Average ' + $scope.options.attrY;
                }
                if($scope.options.aggregation === 'sum') {
                    series = 'Sum ' + $scope.options.attrY;
                }
                if($scope.options.aggregation === 'min') {
                    series = 'Minimum ' + $scope.options.attrY;
                }
                if($scope.options.aggregation === 'max') {
                    series = 'Maximum ' + $scope.options.attrY;
                }

                // Scrape data for unique series
                for(i = 0; i < data.length; i++) {
                    if($scope.options.categoryField) {
                        series = data[i][$scope.options.categoryField] !== '' ? data[i][$scope.options.categoryField] : 'Unknown';
                    }

                    if(!resultData[series]) {
                        resultData[series] = {
                            series: series,
                            count: 0,
                            total: 0,
                            min: -1,
                            max: -1,
                            data: []
                        };
                    }
                }

                // Initialize our data buckets.
                for(i = 0; i < numBuckets; i++) {
                    var bucketGraphDate = new Date(startTime + (dayMillis * i));
                    for(series in resultData) {
                        if(Object.prototype.hasOwnProperty.call(resultData, series)) {
                            resultData[series].data.push({
                                date: bucketGraphDate,
                                value: 0
                            });
                        }
                    }
                }

                // Populate series with data
                var indexDate;
                for(i = 0; i < data.length; i++) {
                    indexDate = new Date(data[i].date);

                    if($scope.options.categoryField) {
                        series = data[i][$scope.options.categoryField] !== '' ? data[i][$scope.options.categoryField] : 'Unknown';
                    }

                    // Set undefined values in the data to 0.
                    data[i].value = data[i].value ? data[i].value : 0;

                    resultData[series].data[Math.floor(Math.abs(indexDate - start) / dayMillis)].value = data[i].value;
                    resultData[series].total += data[i].value;
                    resultData[series].min = resultData[series].min < 0 ? data[i].value : Math.min(resultData[series].min, data[i].value);
                    resultData[series].max = resultData[series].max < 0 ? data[i].value : Math.max(resultData[series].max, data[i].value);

                    // Save the mapping from date string to data index so we can find the data index using the brush extent while calculating aggregations for brushed line charts.
                    $scope.dateStringToDataIndex[indexDate.toDateString()] = Math.floor(Math.abs(indexDate - start) / dayMillis);
                }

                return resultData;
            };

            /**
             * Creates and draws a new line chart with the given data, if any.
             * @param {Array} data
             * @method drawLineChart
             */
            var drawLineChart = function(data) {
                var opts = {
                    x: "date",
                    y: "value",
                    responsive: true
                };

                // Destroy the old chart and rebuild it.
                if($scope.chart) {
                    $scope.chart.destroy();
                }
                $scope.chart = new charts.LineChart($element[0], '.linechart', opts);
                $scope.chart.setBrushHandler(function(data) {
                    $scope.$apply(function() {
                        updateBrush(data);
                    });
                });
                $scope.chart.draw(data);
                $scope.colorMappings = $scope.chart.getColorMappings();
                $scope.noData = !data || !data.length;
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
                zeroed.setUTCHours(0);
                return zeroed;
            };

            /**
             * Uses the given function to calculate the aggregated value of the given data between the start and end extent of the brush.
             * @param {Array} data
             * @param {Function} calculationFunction
             * @method calculateBrushedAggregationValue
             * @return {Number}
             */
            var calculateBrushedAggregationValue = function(data, calculationFunction) {
                if($scope.brushExtent.length < 2) {
                    return 0;
                }

                var start = $scope.dateStringToDataIndex[$scope.brushExtent[0].toDateString()];
                var end = $scope.dateStringToDataIndex[$scope.brushExtent[1].toDateString()];
                var value = 0;
                for(var i = start; i < end; ++i) {
                    value = calculationFunction(data[i].value, value);
                }
                return value;
            };

            /**
             * Returns the text to display in the legend containing the aggregated value for the given object.
             * @param {Object} colorMappingObject
             * @method getLegendItemAggregationText
             * @return {String}
             */
            $scope.getLegendItemAggregationText = function(colorMappingObject) {
                var total = 0;
                if($scope.options.aggregation === "count" || $scope.options.aggregation === "sum") {
                    total = colorMappingObject.total;
                    if($scope.brushExtent.length >= 2) {
                        total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                            return indexValue + aggregationValue;
                        });
                    }
                    return "(" + $filter('number')(total) + ")";
                }
                if($scope.options.aggregation === "min") {
                    var min = colorMappingObject.min;
                    if($scope.brushExtent.length >= 2) {
                        total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                            return Math.min(indexValue, aggregationValue);
                        });
                    }
                    return "(" + min + ")";
                }
                if($scope.options.aggregation === "max") {
                    var max = colorMappingObject.max;
                    if($scope.brushExtent.length >= 2) {
                        total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                            return Math.max(indexValue, aggregationValue);
                        });
                    }
                    return "(" + max + ")";
                }
                return "";
            };

            /**
             * Updates the brush extent in this visualization's chart and the dataset service.
             * @param {Array} brushExtent
             * @method updateBrush
             */
            var updateBrush = function(brushExtent) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "linechart-range",
                    elementType: "canvas",
                    elementSub: "date-range",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "date-range"]
                });

                if(!brushExtent || brushExtent.length < 2 || brushExtent[0].getTime() === brushExtent[1].getTime()) {
                    $scope.removeBrush();
                    return;
                }

                renderBrushExtent(brushExtent);

                var globalBrushExtent = datasetService.getDateBrushExtent($scope.options.database.name, $scope.options.table.name);
                // We're comparing the date strings here because comparing the date objects doesn't seem to work.
                if(globalBrushExtent.length && $scope.brushExtent[0].toDateString() === globalBrushExtent[0].toDateString() && $scope.brushExtent[1].toDateString() === globalBrushExtent[1].toDateString()) {
                    return;
                }

                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.attrX]);
                datasetService.setDateBrushExtentForRelations(relations, $scope.brushExtent);
                filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForDate, $scope.queryForData);
            };

            /**
             * Removes the brush extent from this visualization's chart and the dataset service.
             * @method removeBrush
             */
            $scope.removeBrush = function() {
                XDATA.userALE.log({
                    activity: "deselect",
                    action: "click",
                    elementId: "linechart-clear-range",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "date-range"]
                });

                renderBrushExtent([]);
                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.attrX]);
                datasetService.removeDateBrushExtentForRelations(relations);
                filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
            };

            /**
             * Creates and returns a filter on the given date field using the brush extent set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} dateFieldName The name of the date field on which to filter
             * @method createFilterClauseForDate
             * @return {Object} A neon.query.Filter object or undefined if a filter clause could not be created
             */
            var createFilterClauseForDate = function(databaseAndTableName, dateFieldName) {
                if($scope.brushExtent.length < 2) {
                    return undefined;
                }

                var startFilterClause = neon.query.where(dateFieldName, ">=", $scope.brushExtent[0]);
                var endFilterClause = neon.query.where(dateFieldName, "<", $scope.brushExtent[1]);
                return neon.query.and.apply(this, [startFilterClause, endFilterClause]);
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);

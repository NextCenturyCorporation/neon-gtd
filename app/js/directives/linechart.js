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
.directive('linechart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService', '$timeout',
function(connectionService, datasetService, errorNotificationService, exportService, $timeout) {
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
                if($scope.colorMappings.length >= $scope.seriesLimit) {
                    return "Top " + $scope.seriesLimit;
                }
                return "";
            };
            $scope.showOptionsMenuButtonText = function() {
                return $scope.colorMappings.length >= $scope.seriesLimit;
            };

            $scope.databases = [];
            $scope.tables = [];
            $scope.totalType = 'count';
            $scope.fields = [];
            $scope.chart = undefined;
            $scope.colorMappings = [];
            $scope.seriesLimit = 10;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

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
                    $scope.chart.redraw();
                }
            };

            var initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.exportID = uuid();
                exportService.register($scope.exportID, $scope.makeLinechartExportObject);

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
                    exportService.unregister($scope.exportID);
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(updateChartSize);

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
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "linechart",
                    elementType: "combobox",
                    elementSub: "linechart-" + field,
                    elementGroup: "chart_group",
                    source: "user",
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
                    $scope.queryForData();
                }
            };

            var query = function(callback) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.attrX || (!$scope.options.attrY && $scope.options.aggregation !== "count")) {
                    drawChart();
                    $scope.loadingData = false;
                    return;
                }

                var query = $scope.buildQuery();

                connection.executeQuery(query, callback, function(response) {
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
                    drawChart();
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Builds a query for the line chart and returns it.
             * @method buildQuery
             * @return A ready-to-be-sent query for the line chart.
             */
            $scope.buildQuery = function() {
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

                return query;
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
                $scope.queryForData();
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

                query(function(results) {
                    var i;
                    var minDate;
                    var maxDate;
                    var range;

                    //this prevents an error in older mongo caused when the xAxis value is invalid as it is not
                    //included as a key in the response
                    for(i = 0; i < results.data.length; i++) {
                        if(typeof(results.data[i][$scope.options.attrX]) === 'undefined') {
                            results.data[i][$scope.options.attrX] = null;
                        }
                    }

                    if(results.data.length > 0) {
                        range = d3.extent(results.data, function(d) {
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
                    var zeroedData = zeroPadData(results, minDate, maxDate);

                    // Convert results to array
                    for(series in zeroedData) {
                        if(Object.prototype.hasOwnProperty.call(zeroedData, series)) {
                            data.push(zeroedData[series]);
                        }
                    }

                    data.sort(function(a, b) {
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
                    });

                    // Calculate Other series
                    var othersCount = data.length - $scope.seriesLimit;
                    var otherSeries = {
                        series: othersCount + " Others",
                        total: 0,
                        min: -1,
                        max: -1,
                        data: []
                    };

                    // For averages, do not include the combined values of groups outside the top 10 because adding averages together from multiple groups makes no sense.
                    if($scope.options.aggregation !== 'average') {
                        for(i = $scope.seriesLimit; i < data.length; i++) {
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

                    // Trim data to only top results
                    data = data.splice(0, $scope.seriesLimit);

                    // Add Other series
                    if(otherSeries.total > 0) {
                        data.push(otherSeries);
                    }

                    // Render chart and series lines
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
                        drawChart();
                        drawLine(data);
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
                });
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
                data = data.data;

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
                }

                return resultData;
            };

            var drawChart = function() {
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
                $scope.chart.drawChart();
            };

            var drawLine = function(data) {
                $scope.chart.drawLine(data);
                $scope.colorMappings = $scope.chart.getColorMappings();
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

            $scope.getLegendItemAggregationText = function(colorMappingObject) {
                if($scope.options.aggregation === "count" || $scope.options.aggregation === "sum") {
                    return "(" + colorMappingObject.total + ")";
                }
                if($scope.options.aggregation === "min") {
                    return "(" + colorMappingObject.min + ")";
                }
                if($scope.options.aggregation === "max") {
                    return "(" + colorMappingObject.max + ")";
                }
                return "";
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeLinechartExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "linechart-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "linechart", "export"]
                });
                var query = $scope.buildQuery();
                var finalObject = {
                    name: "Line_Chart",
                    data: [{
                        query: query,
                        name: "linechart",
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: "year",
                    pretty: "Year"
                });
                finalObject.data[0].fields.push({
                    query: "month",
                    pretty: "Month"
                });
                finalObject.data[0].fields.push({
                    query: "day",
                    pretty: "Day"
                });
                var aggr;
                if($scope.options.aggregation === "count") {
                    aggr = query.groupByClauses[3].field;
                    finalObject.data[0].fields.push({
                        query: aggr,
                        pretty: capitalizeFirstLetter(aggr)
                    });
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Count"
                    });
                } else if($scope.options.aggregation === "sum") {
                    aggr = query.groupByClauses[3].field;
                    finalObject.data[0].fields.push({
                        query: aggr,
                        pretty: capitalizeFirstLetter(aggr)
                    });
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Sum of " + query.aggregates[0].field
                    });
                } else if($scope.options.aggregation === "average") {
                    aggr = query.groupByClauses[3].field;
                    finalObject.data[0].fields.push({
                        query: aggr,
                        pretty: capitalizeFirstLetter(aggr)
                    });
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Average of " + query.aggregates[0].field
                    });
                } else if($scope.options.aggregation === "min") {
                    aggr = query.groupByClauses[3].field;
                    finalObject.data[0].fields.push({
                        query: aggr,
                        pretty: capitalizeFirstLetter(aggr)
                    });
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Min of " + query.aggregates[0].field
                    });
                } else if($scope.options.aggregation === "max") {
                    aggr = query.groupByClauses[3].field;
                    finalObject.data[0].fields.push({
                        query: aggr,
                        pretty: capitalizeFirstLetter(aggr)
                    });
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Max of " + query.aggregates[0].field
                    });
                }
                return finalObject;
            };

            /**
             * Helper function for makeBarchartExportObject that capitalizes the first letter of a string.
             * @param str {String} The string to capitalize the first letter of.
             * @return {String} The string given, but with its first letter capitalized.
             */
            var capitalizeFirstLetter = function(str) {
                var first = str[0].toUpperCase();
                return first + str.slice(1);
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);

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
.directive('linechart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'UtilityService',
function(connectionService, datasetService, errorNotificationService, utilityService) {
    var COUNT_FIELD_NAME = 'value';

    return {
        templateUrl: 'partials/directives/linechart.html',
        restrict: 'EA',
        scope: {
            bindDateField: '=',
            bindYAxisField: '=',
            bindCategoryField: '=',
            bindAggregationField: '=',
            colorMappings: '&'
        },
        link: function($scope, $element) {
            $element.addClass('linechartDirective');

            $scope.uniqueChartOptions = utilityService.createUniqueChartOptionsId($element);

            $scope.selectedDatabase = '';
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.totalType = 'count';
            $scope.fields = [];
            $scope.chart = undefined;
            $scope.colorMappings = [];
            $scope.attrX = '';
            $scope.attrY = '';
            $scope.categoryField = '';
            $scope.aggregation = 'count';
            $scope.seriesLimit = 10;
            $scope.errorMessage = undefined;

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
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

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
                    $scope.messenger.removeEvents();
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(function() {
                    updateChartSize();
                    utilityService.resizeOptionsPopover($element);
                });

                $scope.$watch('attrX', function(newValue) {
                    onFieldChange('attrX', newValue);
                    if($scope.selectedDatabase && $scope.selectedTable.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('attrY', function(newValue) {
                    onFieldChange('attrY', newValue);
                    if($scope.selectedDatabase && $scope.selectedTable.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('categoryField', function(newValue) {
                    onFieldChange('categoryField', newValue);
                    if($scope.selectedDatabase && $scope.selectedTable.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('aggregation', function(newValue) {
                    onFieldChange('aggregation', newValue);
                    if($scope.selectedDatabase && $scope.selectedTable.name) {
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
                if(message.addedFilter && message.addedFilter.databaseName === $scope.selectedDatabase && message.addedFilter.tableName === $scope.selectedTable.name) {
                    $scope.queryForData();
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["dataset-change", "linechart"]
                });
                $scope.displayActiveDataset(false);
            };

            var query = function(callback) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                if(!$scope.attrY && $scope.aggregation !== "count") {
                    drawChart();
                    return;
                }

                var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, $scope.attrX, 'year');
                var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, $scope.attrX, 'month');
                var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, $scope.attrX, 'day');

                var groupByClause = [yearGroupClause, monthGroupClause, dayGroupClause];
                if($scope.categoryField) {
                    groupByClause.push($scope.categoryField);
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.selectedDatabase, $scope.selectedTable.name)
                    .where($scope.attrX, '!=', null);

                query.groupBy.apply(query, groupByClause);

                if($scope.aggregation === "sum") {
                    query.aggregate(neon.query.SUM, $scope.attrY, COUNT_FIELD_NAME);
                } else if($scope.aggregation === "average") {
                    query.aggregate(neon.query.AVG, $scope.attrY, COUNT_FIELD_NAME);
                } else if($scope.aggregation === "count") {
                    query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
                }

                query.aggregate(neon.query.MIN, $scope.attrX, 'date')
                    .sortBy('date', neon.query.ASCENDING);

                var connection = connectionService.getActiveConnection();
                if(connection) {
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
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    });
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.selectedDatabase = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = datasetService.getFirstTableWithMappings(["date", "y_axis"]) || $scope.tables[0];

                if(initializing) {
                    $scope.updateFieldsAndQueryForData();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndQueryForData();
                    });
                }
            };

            $scope.updateFieldsAndQueryForData = function() {
                $scope.attrX = $scope.bindDateField || datasetService.getMapping($scope.selectedTable.name, "date") || "";
                $scope.attrY = $scope.bindYAxisField || datasetService.getMapping($scope.selectedTable.name, "y_axis") || "";
                $scope.categoryField = $scope.bindCategoryField || datasetService.getMapping($scope.selectedTable.name, "line_category") || "";
                $scope.aggregation = $scope.bindAggregationField || 'count';
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
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
                        if(typeof(results.data[i][$scope.attrX]) === 'undefined') {
                            results.data[i][$scope.attrX] = null;
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

                    // Sort by series total
                    data.sort(function(a, b) {
                        if(a.total < b.total) {
                            return 1;
                        }
                        if(a.total > b.total) {
                            return -1;
                        }
                        return 0;
                    });

                    // Calculate Other series
                    var otherTotal = 0;
                    var otherData = [];
                    if($scope.aggregation !== 'average') {
                        for(i = $scope.seriesLimit; i < data.length; i++) {
                            otherTotal += data[i].total;
                            for(var d = 0; d < data[i].data.length; d++) {
                                if(otherData[d]) {
                                    otherData[d].value += data[i].data[d].value;
                                } else {
                                    otherData[d] = {
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
                    if(otherTotal > 0) {
                        data.push({
                            series: "Other",
                            total: otherTotal,
                            data: otherData
                        });
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
                        updateChartSize();
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

                var series = 'Total';
                if($scope.aggregation === 'average') {
                    series = 'Average ' + $scope.attrY;
                } else if($scope.aggregation === 'sum') {
                    series = $scope.attrY;
                }

                // Scrape data for unique series
                for(i = 0; i < data.length; i++) {
                    if($scope.categoryField) {
                        series = data[i][$scope.categoryField] !== '' ? data[i][$scope.categoryField] : 'Unknown';
                    }

                    if(!resultData[series]) {
                        resultData[series] = {
                            series: series,
                            total: 0,
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

                    if($scope.categoryField) {
                        series = data[i][$scope.categoryField] !== '' ? data[i][$scope.categoryField] : 'Unknown';
                    }

                    resultData[series].data[Math.floor(Math.abs(indexDate - start) / dayMillis)].value = data[i].value;
                    resultData[series].total += data[i].value;
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

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);

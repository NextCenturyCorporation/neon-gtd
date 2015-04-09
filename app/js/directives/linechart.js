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
 * @class neonDemo.directives.linechart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('linechart', ['ConnectionService', 'ErrorNotificationService', function(connectionService, errorNotificationService) {
    var COUNT_FIELD_NAME = 'value';

    return {
        templateUrl: 'partials/directives/linechart.html',
        restrict: 'EA',
        scope: {
            colorMappings: '&',
            chartType: '='
        },
        link: function($scope, $element) {
            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $($element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            $element.addClass('linechartDirective');

            $scope.databaseName = '';
            $scope.tableName = '';
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
                    $element.find('.linechart').height($element.height() - $element.find('.legend').outerHeight(true));
                    $scope.chart.redraw();
                }
            };

            var initialize = function() {
                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(function() {
                        updateChartSize();
                    });

                $scope.$watch('attrY', function(newValue, oldValue) {
                    onFieldChange('attrY', newValue, oldValue);
                    if($scope.databaseName && $scope.tableName) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('categoryField', function(newValue, oldValue) {
                    onFieldChange('categoryField', newValue, oldValue);
                    if($scope.databaseName && $scope.tableName) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('aggregation', function(newValue, oldValue) {
                    onFieldChange('aggregation', newValue, oldValue);
                    if($scope.databaseName && $scope.tableName) {
                        $scope.queryForData();
                    }
                });
            };

            var onFieldChange = function(field, newVal, oldVal) {
                XDATA.activityLogger.logUserActivity('LineChart - user changed a field selection', 'define_axes',
                    XDATA.activityLogger.WF_CREATE,
                    {
                        field: field,
                        to: newVal,
                        from: oldVal
                    });
            };

            var onFiltersChanged = function() {
                XDATA.activityLogger.logSystemActivity('LineChart - received neon filter changed event');
                $scope.queryForData();
            };

            var onDatasetChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('LineChart - received neon dataset changed event');
                $scope.databaseName = message.database;
                $scope.tableName = message.table;

                // if there is no active connection, try to make one.
                connectionService.connectToDataset(message.datastore, message.hostname, message.database, message.table);
                $scope.displayActiveDataset();
            };

            var query = function(callback) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, $scope.attrX, 'year');
                var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, $scope.attrX, 'month');
                var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, $scope.attrX, 'day');

                var groupByClause = [yearGroupClause, monthGroupClause, dayGroupClause];
                if($scope.categoryField) {
                    groupByClause.push($scope.categoryField);
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.tableName)
                    .where($scope.attrX, '!=', null);

                query.groupBy.apply(query, groupByClause);

                if($scope.aggregation === 'sum') {
                    query.aggregate(neon.query.SUM, $scope.attrY, COUNT_FIELD_NAME);
                } else if($scope.aggregation === 'avg') {
                    query.aggregate(neon.query.AVG, $scope.attrY, COUNT_FIELD_NAME);
                } else {
                    query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
                }

                query.aggregate(neon.query.MIN, $scope.attrX, 'date')
                    .sortBy('date', neon.query.ASCENDING);

                connectionService.getActiveConnection().executeQuery(query, callback, function(response) {
                    XDATA.activityLogger.logSystemActivity('LineChart - query failed');
                    drawChart();
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                });
            };

            /**
             * Displays data for any currently active datasets.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function() {
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connectionService.loadMetadata(function() {
                        var info = connectionService.getActiveDataset();
                        $scope.databaseName = info.database;
                        $scope.tableName = info.table;
                        $scope.attrX = connectionService.getFieldMapping("date");
                        $scope.attrY = connectionService.getFieldMapping("y_axis");
                        $scope.categoryField = connectionService.getFieldMapping("line_category");
                        $scope.aggregation = 'count';
                        connection.getFieldNames($scope.databaseName, $scope.tableName, function(results) {
                            XDATA.activityLogger.logSystemActivity('LineChart - query for available fields');
                            $scope.$apply(function() {
                                $scope.fields = results;
                                XDATA.activityLogger.logSystemActivity('LineChart - received available fields');
                            });
                        });
                        $scope.queryForData();
                    });
                }
            };

            $scope.queryForData = function() {
                XDATA.activityLogger.logSystemActivity('LineChart - query for data');
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
                    if($scope.aggregation !== 'avg') {
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
                    XDATA.activityLogger.logSystemActivity('LineChart - query data received');
                    $scope.$apply(function() {
                        drawChart();
                        drawLine(data);
                        updateChartSize();
                        XDATA.activityLogger.logSystemActivity('LineChart - query data rendered');
                    });
                });
            };

            $scope.toggleSeries = function(series) {
                var activity = $scope.chart.toggleSeries(series);
                XDATA.activityLogger.logUserActivity('LineChart - user toggled series', activity,
                    XDATA.activityLogger.WF_CREATE,
                    {
                        plot: series
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
                if($scope.aggregation === 'avg') {
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
                $scope.displayActiveDataset();
            });
        }
    };
}]);

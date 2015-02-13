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
 * This directive adds a barchart to the DOM and drives the visualization data from
 * whatever database and table are currently selected in neon.  This directive accomplishes that
 * by using getting a neon connection from a connection service and listening for
 * neon system events (e.g., data tables changed).  On these events, it requeries the active
 * connection for data and updates applies the change to its scope.  The contained
 * barchart will update as a result.
 * @class neonDemo.directives.barchart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('barchart', ['ConnectionService', '$timeout', function(connectionService, $timeout) {
    return {
        templateUrl: 'partials/directives/barchart.html',
        restrict: 'EA',
        link: function($scope, $element) {
            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $($element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            $element.addClass('barchartDirective');

            $scope.database = '';
            $scope.tableName = '';
            $scope.barType = $scope.barType || 'count';
            $scope.fields = [];
            $scope.xAxisSelect = $scope.fields[0] ? $scope.fields[0] : '';
            $scope.initializing = false;
            $scope.chart = undefined;
            $scope.filterKey = "barchart-" + uuid();
            $scope.filterSet = undefined;

            var COUNT_FIELD_NAME = 'Count';

            var updateChartSize = function() {
                if($scope.chart) {
                    $element.find('.barchart').height($element.height() - $element.find('.legend').outerHeight(true));
                    $scope.chart.draw();
                }
            };

            var initialize = function() {
                drawBlankChart();

                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if ($scope.filterSet) {
                        $scope.messenger.removeFilter($scope.filterKey);
                    }
                });

                $scope.$watch('attrX', function() {
                    if(!$scope.initializing && $scope.databaseName && $scope.tableName) {
                        $scope.queryForData(true);
                    }
                });
                $scope.$watch('attrY', function() {
                    if(!$scope.initializing && $scope.databaseName && $scope.tableName) {
                        $scope.queryForData(true);
                    }
                });
                $scope.$watch('barType', function() {
                    if(!$scope.initializing && $scope.databaseName && $scope.tableName) {
                        $scope.queryForData(false);
                    }
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(function() {
                    updateChartSize();
                });
            };

            var onFiltersChanged = function() {
                XDATA.activityLogger.logSystemActivity('BarChart - received neon filter changed event');
                $scope.queryForData(false);
            };

            var onDatasetChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('BarChart - received neon dataset changed event');
                $scope.initializing = true;

                // if there is no active connection, try to make one.
                connectionService.connectToDataset(message.datastore, message.hostname, message.database, message.table);

                // Pull data.
                $timeout(function() {
                    $scope.displayActiveDataset();
                    $scope.initializing = false;
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
                        $scope.queryForData(true);
                    });
                }
            };

            $scope.queryForData = function(rebuildChart) {
                var xAxis = $scope.attrX || connectionService.getFieldMapping("bar_x_axis");
                var yAxis = $scope.attrY || connectionService.getFieldMapping("y_axis");

                if(xAxis === undefined || xAxis === "" || yAxis === undefined || yAxis === "") {
                    drawBlankChart();
                    return;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.tableName)
                    .where(xAxis, '!=', null)
                    .groupBy(xAxis);

                query.ignoreFilters([$scope.filterKey]);

                var queryType;
                if($scope.barType === 'count') {
                    queryType = neon.query.COUNT;
                } else if($scope.barType === 'sum') {
                    queryType = neon.query.SUM;
                } else if($scope.barType === 'avg') {
                    queryType = neon.query.AVG;
                }

                if(yAxis) {
                    query.aggregate(queryType, yAxis, COUNT_FIELD_NAME);
                } else {
                    query.aggregate(queryType, '*', COUNT_FIELD_NAME);
                }

                XDATA.activityLogger.logSystemActivity('BarChart - query for data');
                connectionService.getActiveConnection().executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        XDATA.activityLogger.logSystemActivity('BarChart - received query data');
                        doDrawChart(queryResults, rebuildChart);
                        XDATA.activityLogger.logSystemActivity('BarChart - rendered results');
                    });
                }, function() {
                    XDATA.activityLogger.logSystemActivity('BarChart - query failed');
                    drawBlankChart();
                });
            };

            var drawBlankChart = function() {
                doDrawChart({
                    data: []
                }, true);
            };

            var clickFilterHandler = function(filterValue) {
                var xAxis = $scope.attrX || connectionService.getFieldMapping("bar_x_axis");
                var connection = connectionService.getActiveConnection();
                if(xAxis !== undefined && xAxis !== "" && $scope.messenger && connection) {
                    var filterClause = neon.query.where(xAxis, '=', filterValue);
                    var filter = new neon.query.Filter().selectFrom($scope.databaseName, $scope.tableName).where(filterClause);

                    if(!$scope.filterSet) {
                        $scope.messenger.addFilter($scope.filterKey, filter, function() {
                            handleFilterSet(xAxis, filterValue);
                        });
                    } else {
                        $scope.messenger.replaceFilter($scope.filterKey, filter, function() {
                            handleFilterSet(xAxis, filterValue);
                        });
                    }
                }
            };

            var handleFilterSet = function(key, val) {
                $scope.filterSet = {
                    key: key,
                    value: val
                };
                //no need to requery because barchart ignores its own filter
            };

            var clearFilterSet = function() {
                $scope.filterSet = undefined;
            };

            $scope.clearFilterSet = function() {
                if($scope.messenger) {
                    $scope.messenger.removeFilter($scope.filterKey, function() {
                        $scope.chart.clearSelectedBar();
                        clearFilterSet();
                    });
                }
            };

            var doDrawChart = function(data, destroy) {
                var xAxis = $scope.attrX || connectionService.getFieldMapping("bar_x_axis");
                var yAxis = $scope.attrY || connectionService.getFieldMapping("y_axis");

                if(!yAxis) {
                    yAxis = COUNT_FIELD_NAME;
                } else {
                    yAxis = COUNT_FIELD_NAME;
                }

                var opts = {
                    data: data.data,
                    x: xAxis,
                    y: yAxis,
                    responsive: false,
                    clickHandler: clickFilterHandler
                };

                // Destroy the old chart and rebuild it.
                if($scope.chart && destroy) {
                    $scope.chart.destroy();
                    $scope.chart = new charts.BarChart($element[0], '.barchart', opts);
                } else if($scope.chart) {
                    $scope.chart.setOptsConfiguration(opts);
                } else {
                    $scope.chart = new charts.BarChart($element[0], '.barchart', opts);
                }
                updateChartSize();
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset();
            });
        }
    };
}]);

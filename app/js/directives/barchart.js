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
.directive('barchart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', '$timeout', function(connectionService, datasetService, errorNotificationService, $timeout) {
    return {
        templateUrl: 'partials/directives/barchart.html',
        restrict: 'EA',
        link: function($scope, $element) {
            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $($element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            $element.addClass('barchartDirective');

            $scope.databaseName = '';
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.barType = $scope.barType || 'count';
            $scope.fields = [];
            $scope.updatingChart = false;
            $scope.chart = undefined;
            $scope.filterKey = "barchart-" + uuid();
            $scope.filterSet = undefined;
            $scope.errorMessage = undefined;

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
                    if($scope.filterSet) {
                        $scope.messenger.removeFilter($scope.filterKey);
                    }
                });

                $scope.$watch('attrX', function() {
                    if(!$scope.updatingChart && $scope.databaseName && $scope.selectedTable.name) {
                        $scope.queryForData(true);
                    }
                });
                $scope.$watch('attrY', function() {
                    if(!$scope.updatingChart && $scope.databaseName && $scope.selectedTable.name) {
                        $scope.queryForData(true);
                    }
                });
                $scope.$watch('barType', function() {
                    if(!$scope.updatingChart && $scope.databaseName && $scope.selectedTable.name) {
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

            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('BarChart - received neon dataset changed event');

                $timeout(function() {
                    $scope.displayActiveDataset(false);
                    $scope.updatingChart = false;
                });
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

                $scope.updatingChart = true;

                connectionService.connectToDataset(datasetService.getDatastore(), datasetService.getHostname(), datasetService.getDatabase());

                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = $scope.tables[0];

                if(initializing) {
                    $scope.updateFieldsAndQueryForData();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndQueryForData();
                    });
                }
            };

            $scope.updateFieldsAndQueryForData = function() {
                $scope.attrX = datasetService.getMapping($scope.selectedTable.name, "bar_x_axis") || "";
                $scope.attrY = datasetService.getMapping($scope.selectedTable.name, "y_axis") || "";
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                if($scope.filterSet) {
                    $scope.clearFilterSet();
                }
                $scope.queryForData(true);
            };

            $scope.queryForData = function(rebuildChart) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var xAxis = $scope.attrX || datasetService.getMapping($scope.selectedTable.name, "bar_x_axis");
                var yAxis = $scope.attrY || datasetService.getMapping($scope.selectedTable.name, "y_axis");

                if(xAxis === undefined || xAxis === "" || yAxis === undefined || yAxis === "") {
                    drawBlankChart();
                    return;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name)
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
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, function(queryResults) {
                        $scope.$apply(function() {
                            XDATA.activityLogger.logSystemActivity('BarChart - received query data');
                            doDrawChart(queryResults, rebuildChart);
                            XDATA.activityLogger.logSystemActivity('BarChart - rendered results');
                        });
                    }, function(response) {
                        XDATA.activityLogger.logSystemActivity('BarChart - query failed');
                        drawBlankChart();
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    });
                }
            };

            var drawBlankChart = function() {
                doDrawChart({
                    data: []
                }, true);
            };

            var clickFilterHandler = function(filterValue) {
                var xAxis = $scope.attrX || datasetService.getMapping($scope.selectedTable.name, "bar_x_axis");
                var connection = connectionService.getActiveConnection();
                if(xAxis !== undefined && xAxis !== "" && $scope.messenger && connection) {
                    var filterClause = neon.query.where(xAxis, '=', filterValue);
                    var filter = new neon.query.Filter().selectFrom($scope.databaseName, $scope.selectedTable.name).where(filterClause);

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
                var xAxis = $scope.attrX || datasetService.getMapping($scope.selectedTable.name, "bar_x_axis");
                var yAxis = $scope.attrY || datasetService.getMapping($scope.selectedTable.name, "y_axis");

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
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);

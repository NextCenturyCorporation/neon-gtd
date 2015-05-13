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
 * @namespace neonDemo.directives
 * @class barchart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('barchart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', '$timeout', function(connectionService, datasetService, errorNotificationService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/barchart.html',
        restrict: 'EA',
        scope: {
            bindXAxisField: '=',
            bindYAxisField: '=',
            bindAggregationField: '=',
            bindTable: '='
        },
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
            $scope.barType = $scope.bindAggregationField || 'count';
            $scope.fields = [];
            $scope.updatingChart = false;
            $scope.chart = undefined;
            $scope.filterKeys = {};
            $scope.filterSet = undefined;
            $scope.errorMessage = undefined;

            var COUNT_FIELD_NAME = 'Count';

            var updateChartSize = function() {
                if($scope.chart) {
                    var headerHeight = 0;
                    $element.find(".header-container").each(function() {
                        headerHeight += $(this).outerHeight(true);
                    });
                    $element.find('.barchart').height($element.height() - headerHeight);
                    $scope.chart.draw();
                }
            };

            var initialize = function() {
                drawBlankChart();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
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

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('BarChart - received neon filter changed event');
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.selectedTable.name) {
                    $scope.queryForData(false);
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('BarChart - received neon-gtd dataset changed event');

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

                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = $scope.bindTable || datasetService.getFirstTableWithMappings(["bar_x_axis", "y_axis"]) || $scope.tables[0];
                $scope.filterKeys = filterService.createFilterKeys("barchart", $scope.tables);

                if(initializing) {
                    $scope.updateFieldsAndQueryForData();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndQueryForData();
                    });
                }
            };

            $scope.updateFieldsAndQueryForData = function() {
                $scope.attrX = $scope.bindXAxisField || datasetService.getMapping($scope.selectedTable.name, "bar_x_axis") || "";
                $scope.attrY = $scope.bindYAxisField || datasetService.getMapping($scope.selectedTable.name, "y_axis") || "";
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                $scope.fields.sort();
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

                if(!$scope.attrX) {
                    drawBlankChart();
                    return;
                }

                $scope.updatingChart = true;

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name)
                    .where($scope.attrX, '!=', null)
                    .groupBy($scope.attrX);

                query.ignoreFilters([$scope.filterKeys[$scope.selectedTable.name]]);

                var queryType;
                if($scope.barType === 'count') {
                    queryType = neon.query.COUNT;
                } else if($scope.barType === 'sum') {
                    queryType = neon.query.SUM;
                } else if($scope.barType === 'average') {
                    queryType = neon.query.AVG;
                }

                if(!$scope.attrY) {
                    query.aggregate(queryType, '*', COUNT_FIELD_NAME);
                } else {
                    query.aggregate(queryType, $scope.attrY, COUNT_FIELD_NAME);
                }

                XDATA.activityLogger.logSystemActivity('BarChart - query for data');
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, function(queryResults) {
                        $scope.$apply(function() {
                            XDATA.activityLogger.logSystemActivity('BarChart - received query data');
                            doDrawChart(queryResults, rebuildChart);
                            XDATA.activityLogger.logSystemActivity('BarChart - rendered results');
                            $scope.updatingChart = false;
                        });
                    }, function(response) {
                        XDATA.activityLogger.logSystemActivity('BarChart - query failed');
                        drawBlankChart();
                        $scope.updatingChart = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    });
                }
            };

            var drawBlankChart = function() {
                doDrawChart({
                    data: []
                }, true);
            };

            var clickFilterHandler = function(value) {
                if(!$scope.attrX) {
                    return;
                }

                var filterExists = $scope.filterSet ? true : false;
                handleFilterSet($scope.attrX, value);

                // Store the value for the filter to use during filter creation.
                $scope.filterValue = value;

                var connection = connectionService.getActiveConnection();
                if($scope.messenger && connection) {
                    var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.attrX]);
                    if(filterExists) {
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter);
                    } else {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter);
                    }
                }
            };

            /**
             * Creates and returns a filter using the given table and fields.
             * @param {String} The name of the table on which to filter
             * @param {Array} An array containing the name of the x-axis field as its first element
             * @method createFilter
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilter = function(tableName, fieldNames) {
                var xAxisName = fieldNames[0];
                var filterClause = neon.query.where(xAxisName, '=', $scope.filterValue);
                return new neon.query.Filter().selectFrom($scope.databaseName, tableName).where(filterClause);
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
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                        $scope.chart.clearSelectedBar();
                        clearFilterSet();
                    });
                }
            };

            var doDrawChart = function(data, destroy) {
                var opts = {
                    data: data.data,
                    x: $scope.attrX,
                    y: COUNT_FIELD_NAME,
                    responsive: false,
                    clickHandler: clickFilterHandler
                };

                if($scope.filterSet && $scope.filterSet.value) {
                    opts.selectedKey = $scope.filterSet.value;
                }

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

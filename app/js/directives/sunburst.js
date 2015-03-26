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
 * This directive adds a D3 sunburst chart to the DOM and drives the visualization data from
 * whatever database and table are currently selected in neon.  This directive accomplishes that
 * by getting a neon connection from a connection service and listening for
 * neon system events (e.g., data tables changed).  On these events, it requeries the active
 * connection for data and updates applies the change to its scope.  The contained
 * sunburst will update as a result.
 * @class neonDemo.directives.sunburst
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('sunburst', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', function(connectionService, datasetService, errorNotificationService) {
    return {
        templateUrl: 'partials/directives/sunburst.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, $element) {
            $element.addClass('sunburst-directive');

            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            $scope.arcValue = "count";
            $scope.valueField = null;
            $scope.selectedItem = null;
            $scope.groupFields = [];
            $scope.messenger = new neon.eventing.Messenger();
            $scope.database = '';
            $scope.tableName = '';
            $scope.fields = [""];
            $scope.chart = undefined;
            $scope.errorMessage = undefined;

            var chartOptions = $element.find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            var initialize = function() {
                $scope.chart = new charts.SunburstChart($element[0], '.sunburst-chart', {
                    height: "100%",
                    width: "100%"
                });
                $scope.chart.drawBlank();

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
                        $scope.updateChartSize();
                    });

                $scope.$watch('valueField', function(newValue, oldValue) {
                    if(newValue !== oldValue) {
                        $scope.queryForData();
                    }
                }, true);

                $scope.$watch('arcValue', function(newValue, oldValue) {
                    if(newValue !== oldValue) {
                        $scope.chart.displayPartition(newValue);
                    }
                });
            };

            var onFiltersChanged = function() {
                XDATA.activityLogger.logSystemActivity('SunburstChart - received neon filter changed event');
                $scope.queryForData();
            };

            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('SunburstChart - received neon dataset changed event');
                $scope.displayActiveDataset(false);
            };

            $scope.updateChartSize = function() {
                if($scope.chart) {
                    $element.find('.sunburst-chart').height($element.height() - $element.find('.sunburst-header').outerHeight(true));
                }
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            $scope.buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.databaseName, $scope.tableName);
                if($scope.groupFields.length > 0) {
                    query.groupBy.apply(query, $scope.groupFields);
                }

                //take based on selected count or total
                query.aggregate(neon.query.COUNT, '*', 'count');
                if($scope.valueField) {
                    query.aggregate(neon.query.SUM, $scope.valueField, $scope.valueField);
                }

                return query;
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                $scope.groupFields = [];
                $scope.valueField = null;
                $scope.arcValue = charts.SunburstChart.COUNT_PARTITION;

                if(!datasetService.hasDataset()) {
                    return;
                }

                connectionService.connectToDataset(datasetService.getDatastore(),
                        datasetService.getHostname(),
                        datasetService.getDatabase(),
                        datasetService.getTable());

                $scope.databaseName = datasetService.getDatabase();
                $scope.tableName = datasetService.getTable();

                if(initializing) {
                    $scope.updateFieldsAndQueryForData();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndQueryForData();
                    });
                }
            };

            $scope.updateFieldsAndQueryForData = function() {
                $scope.fields = datasetService.getDatabaseFields();
                $scope.queryForData();
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    var query = $scope.buildQuery();

                    XDATA.activityLogger.logSystemActivity('sunburst - query for data');
                    connection.executeQuery(query, function(queryResults) {
                        XDATA.activityLogger.logSystemActivity('sunburst - received data');
                        $scope.$apply(function() {
                            $scope.updateChartSize();
                            doDrawChart(buildDataTree(queryResults));
                            XDATA.activityLogger.logSystemActivity('sunburst - rendered data');
                        });
                    }, function(response) {
                        XDATA.activityLogger.logSystemActivity('sunburst - received error');
                        doDrawChart(buildDataTree({
                            data: []
                        }));
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    });
                }
            };

            var buildDataTree = function(data) {
                var nodes = {};
                var tree = {
                    name: $scope.tableName,
                    children: []
                };
                var leafObject;
                var nodeObject;
                var nodeKey;
                var nodeKeyString;

                var field;

                var i;
                data.data.forEach(function(doc) {
                    var parent = tree;
                    leafObject = {};
                    nodeKey = {};
                    for(i = 0; i < $scope.groupFields.length; i++) {
                        field = $scope.groupFields[i];

                        leafObject[field] = doc[field];
                        nodeKey[field] = doc[field];
                        nodeKey.name = field + ": " + doc[field];
                        nodeKeyString = JSON.stringify(nodeKey);

                        if(!nodes[nodeKeyString]) {
                            if(i !== $scope.groupFields.length - 1) {
                                nodeObject = {};
                                nodeObject.name = field + ": " + doc[field];
                                nodeObject.children = [];
                                parent.children.push(nodeObject);
                                parent = nodeObject;
                                nodes[nodeKeyString] = nodeObject;
                            } else {
                                leafObject.name = field + ": " + doc[field];
                                leafObject.count = doc.count;
                                leafObject.total = doc[$scope.valueField];
                                parent.children.push(leafObject);
                            }
                        } else {
                            parent = nodes[nodeKeyString];
                        }
                    }
                });

                return tree;
            };

            var doDrawChart = function(data) {
                $scope.chart.clearData();
                $scope.chart.drawData(data);
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });

            $scope.addGroup = function() {
                if($scope.groupFields.indexOf($scope.selectedItem) === -1 && $scope.selectedItem !== "") {
                    $scope.groupFields.push($scope.selectedItem);
                }
                $scope.selectedItem = "";
                $scope.queryForData();
            };

            $scope.dropGroup = function(groupField) {
                var index = $scope.groupFields.indexOf(groupField);
                if(index !== -1) {
                    $scope.groupFields.splice(index, 1);
                }
                $scope.queryForData();
            };
        }
    };
}]);

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
 * @namespace neonDemo.directives
 * @class sunburst
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('sunburst', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'UtilityService',
function(connectionService, datasetService, errorNotificationService, utilityService) {
    return {
        templateUrl: 'partials/directives/sunburst.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, $element) {
            $element.addClass('sunburst-directive');

            $scope.uniqueChartOptions = utilityService.createUniqueChartOptionsId($element);

            $scope.arcValue = "count";
            $scope.valueField = null;
            $scope.selectedItem = null;
            $scope.groupFields = [];
            $scope.messenger = new neon.eventing.Messenger();
            $scope.databaseName = '';
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.fields = [];
            $scope.chart = undefined;
            $scope.errorMessage = undefined;

            var initialize = function() {
                $scope.chart = new charts.SunburstChart($element[0], '.sunburst-chart', {
                    height: "100%",
                    width: "100%"
                });
                $scope.chart.drawBlank();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(function() {
                    $scope.updateChartSize();
                    utilityService.resizeOptionsPopover($element);
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

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('SunburstChart - received neon filter changed event');
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.selectedTable.name) {
                    $scope.queryForData();
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('SunburstChart - received neon-gtd dataset changed event');
                $scope.displayActiveDataset(false);
            };

            $scope.updateChartSize = function() {
                if($scope.chart) {
                    var headerHeight = 0;
                    $element.find(".header-container").each(function() {
                        headerHeight += $(this).outerHeight(true);
                    });
                    $element.find('.sunburst-chart').height($element.height() - headerHeight);
                }
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            $scope.buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.databaseName, $scope.selectedTable.name);
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
                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.groupFields = [];
                $scope.valueField = null;
                $scope.arcValue = charts.SunburstChart.COUNT_PARTITION;

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
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                $scope.fields.sort();
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
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    });
                }
            };

            var buildDataTree = function(data) {
                var nodes = {};
                var tree = {
                    name: $scope.selectedTable.name,
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

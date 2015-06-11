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
.directive('ganttChart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService',
function(connectionService, datasetService, errorNotificationService, filterService) {
    return {
        templateUrl: 'partials/directives/gantt-chart.html',
        restrict: 'EA',
        scope: {

        },
        link: function($scope, $element) {
            $element.addClass('gantt-chart');

            $scope.options = {
                database: {},
                table: {}
            };

            //query for data
            //build config

            var formatData = function(data) {
                var color = d3.scale.category20();
                var mainTask = {
                    name: "Events"
                };
                $scope.data = [mainTask];

                var row;
                var task;

                for(var i = 0; i < data.length; i++) {
                    task = {
                        parent: 'Events',
                        tasks: []
                    };
                    row = {
                        name: data[i].Headline,
                        from: data[i].Start,
                        to: data[i].End,
                        color: color(i)
                    };
                    task.tasks.push(row);
                    $scope.data.push(task);
                }
            };

            var initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "count-by",
                        elementType: "datagrid",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["remove", "count-by"]
                    });
                    $scope.messenger.removeEvents();
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });
            };

            var onFiltersChanged = function() {
                $scope.queryForData();
            };

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
                            break;
                        }
                    }
                }
                //$scope.filterKeys = filterService.createFilterKeys("gantt-chart", datasetService.getDatabaseAndTableNames());

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
                //$scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["bar_x_axis", "y_axis"]) || $scope.tables[0];
                $scope.options.table = {name: 'gantt'};
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
                /*$scope.options.attrX = $scope.bindXAxisField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "bar_x_axis") || "";
                $scope.options.attrY = $scope.bindYAxisField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "y_axis") || "";
                $scope.fields = datasetService.getDatabaseFields($scope.options.database.name, $scope.options.table.name);
                $scope.fields.sort();
                if($scope.filterSet) {
                    $scope.clearFilterSet();
                }*/
                $scope.queryForData();
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    $scope.loadingData = false;
                    return;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name);

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "gantt-chart",
                    elementType: "canvas",
                    elementSub: "gantt-chart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "gantt-chart"]
                });

                connection.executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "gantt-chart",
                            elementType: "canvas",
                            elementSub: "gantt-chart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "gantt-chart"]
                        });

                        formatData(queryResults.data);
                        $scope.loadingData = false;

                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "gantt-chart",
                            elementType: "canvas",
                            elementSub: "gantt-chart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["render", "gantt-chart"]
                        });
                    });
                }, function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "gantt-chart",
                        elementType: "canvas",
                        elementSub: "gantt-chart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["failed", "gantt-chart"]
                    });

                    formatData(queryResults.data);
                    $scope.loadingData = false;

                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);

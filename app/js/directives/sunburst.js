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
.directive('sunburst', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService',
function(connectionService, datasetService, errorNotificationService, exportService) {
    return {
        templateUrl: 'partials/directives/sunburst.html',
        restrict: 'EA',
        scope: {
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('sunburst-directive');

            $scope.element = $element;

            $scope.arcValue = "count";
            $scope.groupFields = [];
            $scope.messenger = new neon.eventing.Messenger();

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.chart = undefined;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.outstandingQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                selectedItem: "",
                valueField: ""
            };

            var initialize = function() {
                $scope.chart = new charts.SunburstChart($element[0], '.sunburst-chart', {
                    height: "100%",
                    width: "100%"
                });
                $scope.chart.drawBlank();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    $scope.queryForData();
                });

                $scope.exportID = exportService.register($scope.makeSunburstExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "sunburst",
                        elementType: "canvas",
                        elementSub: "sunburst",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["remove", "sunburst"]
                    });
                    $element.off("resize", updateChartSize);
                    $scope.messenger.removeEvents();
                    exportService.unregister($scope.exportID);
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(updateChartSize);

                $scope.$watch('options.valueField', function(newValue, oldValue) {
                    if(!$scope.loadingData && newValue !== oldValue) {
                        $scope.queryForData();
                    }
                }, true);

                $scope.$watch('arcValue', function(newValue, oldValue) {
                    if(!$scope.loadingData && newValue !== oldValue) {
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
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "sunburst",
                        elementType: "canvas",
                        elementSub: "sunburst",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "sunburst"]
                    });
                    $scope.queryForData();
                }
            };

            var updateChartSize = function() {
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
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name);
                if($scope.groupFields.length > 0) {
                    query.groupBy.apply(query, $scope.groupFields);
                }

                //take based on selected count or total
                query.aggregate(neon.query.COUNT, '*', 'count');
                if($scope.options.valueField.columnName) {
                    query.aggregate(neon.query.SUM, $scope.options.valueField.columnName, $scope.options.valueField.columnName);
                }

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

                $scope.groupFields = [];
                $scope.arcValue = charts.SunburstChart.COUNT_PARTITION;

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
                $scope.options.table = $scope.tables[0];
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
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);
                $scope.options.valueField = {
                    columnName: "",
                    prettyName: ""
                };
                $scope.queryForData();
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    doDrawChart(buildDataTree({
                        data: []
                    }));
                    $scope.loadingData = false;
                    return;
                }

                var query = $scope.buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "sunburst",
                    elementType: "canvas",
                    elementSub: "sunburst",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "sunburst"]
                });

                if($scope.outstandingQuery) {
                    $scope.outstandingQuery.abort();
                }

                $scope.outstandingQuery = connection.executeQuery(query);
                $scope.outstandingQuery.done(function() {
                    $scope.outstandingQuery = undefined;
                });
                $scope.outstandingQuery.done(function(queryResults) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "sunburst",
                        elementType: "canvas",
                        elementSub: "sunburst",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["receive", "sunburst"]
                    });
                    $scope.$apply(function() {
                        updateChartSize();
                        doDrawChart(buildDataTree(queryResults));
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "sunburst",
                            elementType: "canvas",
                            elementSub: "sunburst",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["render", "sunburst"]
                        });
                    });
                });
                $scope.outstandingQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "sunburst",
                            elementType: "canvas",
                            elementSub: "sunburst",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "sunburst"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "sunburst",
                            elementType: "canvas",
                            elementSub: "sunburst",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "sunburst"]
                        });
                        doDrawChart(buildDataTree({
                            data: []
                        }));
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            var buildDataTree = function(data) {
                var nodes = {};
                var tree = {
                    name: $scope.options.table.name,
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
                                leafObject.total = doc[$scope.options.valueField.columnName];
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

            $scope.addGroup = function() {
                if($scope.groupFields.indexOf($scope.options.selectedItem.columnName) === -1 && $scope.options.selectedItem.columnName !== "") {
                    $scope.groupFields.push($scope.options.selectedItem.columnName);
                }
                $scope.options.selectedItem = {};
                $scope.queryForData();
            };

            $scope.dropGroup = function(groupField) {
                var index = $scope.groupFields.indexOf(groupField);
                if(index !== -1) {
                    $scope.groupFields.splice(index, 1);
                }
                $scope.queryForData();
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeSunburstExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "sunburst-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "sunburst", "export"]
                });
                var query = $scope.buildQuery();
                query.limitClause = exportService.getLimitClause();
                // Sort results by each group field so the resulting file won't be ugly.
                var sortByArgs = [];
                $scope.groupFields.forEach(function(field) {
                    sortByArgs.push(field);
                    sortByArgs.push(neon.query.ASCENDING);
                });
                query.sortBy(sortByArgs);

                var finalObject = {
                    name: "Sunburst",
                    data: [{
                        query: query,
                        name: "sunburst-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                $scope.groupFields.forEach(function(field) {
                    finalObject.data[0].fields.push({
                        query: field,
                        pretty: capitalizeFirstLetter(field)
                    });
                });
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

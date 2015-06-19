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
 * This Angular JS directive adds a circular heat map to the DOM and drives the visualization data from
 * whatever database and table are currently selected in Neon.  This directive pulls the current
 * Neon connection from a connection service and listens for
 * neon system events (e.g., data tables changed) to determine when to update its visualization
 * by issuing a Neon query for aggregated time data.
 *
 * @example
 *    &lt;circular-heat-form&gt;&lt;/circular-heat-form&gt;<br>
 *    &lt;div circular-heat-form&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class circularHeatForm
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('circularHeatForm', ['ConnectionService', 'DatasetService', 'ErrorNotificationService',
function(connectionService, datasetService, errorNotificationService) {
    return {
        templateUrl: 'partials/directives/circularHeatForm.html',
        restrict: 'EA',
        scope: {
            bindDateField: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('circularheatform');

            $scope.element = $element;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.days = [];
            $scope.timeofday = [];
            $scope.maxDay = "";
            $scope.maxTime = "";
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

            $scope.options = {
                database: {},
                table: {},
                dateField: ""
            };

            var HOURS_IN_WEEK = 168;
            var HOURS_IN_DAY = 24;

            /**
             * Initializes the name of the date field used to query the current dataset
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "circularheatform",
                        elementType: "canvas",
                        elementSub: "circularheatform",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["remove", "circularheatform"]
                    });
                    $scope.messenger.removeEvents();
                });
            };

            /**
             * Initializes the arrays and variables used to track the most active day of the week and time of day.
             * @method initDayTimeArrays
             */
            $scope.initDayTimeArrays = function() {
                $scope.days = [{
                    name: "Sundays",
                    count: 0
                }, {
                    name: "Mondays",
                    count: 0
                }, {
                    name: "Tuesdays",
                    count: 0
                }, {
                    name: "Wednesdays",
                    count: 0
                }, {
                    name: "Thursdays",
                    count: 0
                }, {
                    name: "Fridays",
                    count: 0
                }, {
                    name: "Saturdays",
                    count: 0
                }];
                $scope.timeofday = [{
                    name: "mornings",
                    count: 0
                }, {
                    name: "afternoons",
                    count: 0
                }, {
                    name: "evenings",
                    count: 0
                }, {
                    name: "nights",
                    count: 0
                }];
                $scope.maxDay = "";
                $scope.maxTime = "";
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
                    elementId: "circularheatform",
                    elementType: "canvas",
                    elementSub: "circularheatform",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["filter-change", "circularheatform"]
                });
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    $scope.queryForChartData();
                }
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
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["date"]) || $scope.tables[0];
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
                $scope.fields = datasetService.getDatabaseFields($scope.options.database.name, $scope.options.table.name);
                $scope.fields.sort();
                $scope.options.dateField = $scope.bindDateField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "date") || "";
                $scope.queryForChartData();
            };

            /**
             * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
             * @method queryForChartData
             */
            $scope.queryForChartData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.dateField) {
                    $scope.updateChartData({
                        data: []
                    });
                    $scope.loadingData = false;
                    return;
                }

                //TODO: NEON-603 Add support for dayOfWeek to query API
                var groupByDayClause = new neon.query.GroupByFunctionClause('dayOfWeek', $scope.options.dateField, 'day');
                var groupByHourClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, $scope.options.dateField, 'hour');

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .groupBy(groupByDayClause, groupByHourClause)
                    .where($scope.options.dateField, '!=', null)
                    .aggregate(neon.query.COUNT, '*', 'count');

                // Issue the query and provide a success handler that will forcefully apply an update to the chart.
                // This is done since the callbacks from queries execute outside digest cycle for angular.
                // If updateChartData is called from within angular code or triggered by handler within angular,
                // then the apply is handled by angular.  Forcing apply inside updateChartData instead is error prone as it
                // may cause an apply within a digest cycle when triggered by an angular event.
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "circularheatform",
                    elementType: "canvas",
                    elementSub: "circularheatform",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["circularheatform"]
                });

                connection.executeQuery(query, function(queryResults) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "circularheatform",
                        elementType: "canvas",
                        elementSub: "circularheatform",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["circularheatform"]
                    });
                    $scope.$apply(function() {
                        $scope.updateChartData(queryResults);
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "circularheatform",
                            elementType: "canvas",
                            elementSub: "circularheatform",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["circularheatform"]
                        });
                    });
                }, function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "circularheatform",
                        elementType: "canvas",
                        elementSub: "circularheatform",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["circularheatform"]
                    });
                    $scope.updateChartData({
                        data: []
                    });
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Updates the data bound to the heat chart managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method updateChartData
             */
            $scope.updateChartData = function(queryResults) {
                $scope.data = $scope.createHeatChartData(queryResults);
            };

            /**
             * Creates a new data array used to populate our contained heat chart.  This function is used
             * as or by Neon query handlers.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method createHeatChartData
             */
            $scope.createHeatChartData = function(queryResults) {
                var rawData = queryResults.data;

                var data = [];

                for(var i = 0; i < HOURS_IN_WEEK; i++) {
                    data[i] = 0;
                }

                $scope.initDayTimeArrays();

                _.each(rawData, function(element) {
                    data[(element.day - 1) * HOURS_IN_DAY + element.hour] = element.count;

                    // Add count to total for this day of the week.
                    $scope.days[element.day - 1].count += element.count;

                    // Add count to total for this time of day.
                    if(element.hour >= 5 && element.hour < 12) {
                        $scope.timeofday[0].count += element.count;
                    } else if(element.hour >= 12 && element.hour < 17) {
                        $scope.timeofday[1].count += element.count;
                    } else if(element.hour >= 17 && element.hour < 21) {
                        $scope.timeofday[2].count += element.count;
                    } else {
                        $scope.timeofday[3].count += element.count;
                    }
                });

                // Find the day with the highest count.
                var maxCount = 0;
                _.each($scope.days, function(day) {
                    if(day.count > maxCount) {
                        maxCount = day.count;
                        $scope.maxDay = day.name;
                    }
                });

                // Find the time of day with the highest count.
                maxCount = 0;
                _.each($scope.timeofday, function(time) {
                    if(time.count > maxCount) {
                        maxCount = time.count;
                        $scope.maxTime = time.name;
                    }
                });

                return data;
            };

            $scope.updateDateField = function() {
                // TODO Logging
                if(!$scope.loadingData) {
                    $scope.queryForChartData();
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });

            var exportSuccess = function(queryResults) {
                /*XDATA.userALE.log({
                    activity: "",
                    action: "",
                    elementId: "",
                    elementType: "",
                    elementGroup: "",
                    source: "",
                    tags: ["", "", ""]
                });*/
                window.location.assign(queryResults.data);
            };

            var exportFail = function(response) {
                /*XDATA.userALE.log({
                    activity: "",
                    action: "",
                    elementId: "",
                    elementType: "",
                    elementGroup: "",
                    source: "",
                    tags: ["", "", ""]
                });*/
                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                }
            };

            $scope.requestExport = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "circularheatform-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "circularheatform", "export"]
                });
                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    //This is temporary. Come up with better code for if there isn't a connection.
                    return;
                }

                var data = makeCircularHeatFormExportObject();
                // TODO replace hardcoded 'xlsx' with some sort of option variable.
                connection.executeExport(data, exportSuccess, exportFail, "xlsx");
            };

            var makeCircularHeatFormExportObject = function() {
                var groupByDayClause = new neon.query.GroupByFunctionClause('dayOfWeek', $scope.options.dateField, 'day');
                var groupByHourClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, $scope.options.dateField, 'hour');
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .groupBy(groupByDayClause, groupByHourClause)
                    .where($scope.options.dateField, '!=', null)
                    .aggregate(neon.query.COUNT, '*', 'count');
                var finalObject = {
                    name: 'Ops_Clock',
                    data: [{
                        query: query,
                        name: 'circularHeatForm',
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                (finalObject.data[0]).fields.push({
                    query: 'day',
                    pretty: 'Day'
                });
                (finalObject.data[0]).fields.push({
                    query: 'hour',
                    pretty: 'Hour'
                });
                (finalObject.data[0]).fields.push({
                    query: 'count',
                    pretty: 'Count'
                });
                return finalObject;
            };
        }
    };
}]);

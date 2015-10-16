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
.directive('barchart', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService',
function(external, popups, connectionService, datasetService, errorNotificationService, filterService, exportService) {
    return {
        templateUrl: 'partials/directives/barchart.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindXAxisField: '=',
            bindYAxisField: '=',
            bindAggregationField: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?',
            limitCount: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('barchartDirective');

            $scope.element = $element;
            $scope.visualizationId = "barchart-" + uuid();

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.chart = undefined;
            $scope.filterKeys = {};
            $scope.filterSet = undefined;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.outstandingQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                attrX: "",
                attrY: "",
                barType: "count",
                limitCount: $scope.limitCount || 150
            };

            var COUNT_FIELD_NAME = 'Count';

            var updateChartSize = function() {
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true);
                $element.find(".title").css("maxWidth", titleWidth - 20);

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
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    $scope.queryForData(false);
                });

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        $scope.clearFilterSet();
                    }
                });

                $scope.exportID = exportService.register($scope.makeBarchartExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "barchart",
                        elementType: "canvas",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["remove", "barchart"]
                    });
                    popups.links.deleteData($scope.visualizationId);
                    $element.off("resize", updateChartSize);
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
                });

                $scope.$watch('options.attrX', function(newValue) {
                    onFieldChange('attrX', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData(true);
                    }
                });

                $scope.$watch('options.attrY', function(newValue) {
                    onFieldChange('attrY', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData(true);
                    }
                });

                $scope.$watch('options.barType', function(newValue) {
                    onFieldChange('aggregation', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData(false);
                    }
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(updateChartSize);
            };

            var onFieldChange = function(field, newValue) {
                var source = "user";
                var action = "click";

                // Override the default action if a field changes while loading data during
                // intialization or a dataset change.
                if($scope.loadingData) {
                    source = "system";
                    action = "reset";
                }

                XDATA.userALE.log({
                    activity: "select",
                    action: action,
                    elementId: "barchart",
                    elementType: "combobox",
                    elementSub: "barchart-" + field,
                    elementGroup: "chart_group",
                    source: source,
                    tags: ["options", "barchart", newValue]
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
                        elementId: "barchart",
                        elementType: "canvas",
                        elementSub: "barchart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "barchart"]
                    });
                    $scope.queryForData(false);
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
                            break;
                        }
                    }
                }
                $scope.filterKeys = filterService.createFilterKeys("barchart", datasetService.getDatabaseAndTableNames());

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
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, [neonMappings.BAR_GROUPS, neonMappings.Y_AXIS]) || $scope.tables[0];
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

                var attrX = $scope.bindXAxisField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.BAR_GROUPS) || "";
                $scope.options.attrX = _.find($scope.fields, function(field) {
                    return field.columnName === attrX;
                }) || datasetService.createBlankField();
                var attrY = $scope.bindYAxisField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.Y_AXIS) || "";
                $scope.options.attrY = _.find($scope.fields, function(field) {
                    return field.columnName === attrY;
                }) || datasetService.createBlankField();

                if($scope.filterSet) {
                    $scope.clearFilterSet();
                }
                $scope.queryForData(true);
            };

            $scope.buildQuery = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .where($scope.options.attrX.columnName, '!=', null)
                    .groupBy($scope.options.attrX.columnName);

                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                var queryType;
                if($scope.options.barType === 'count') {
                    queryType = neon.query.COUNT;
                } else if($scope.options.barType === 'sum') {
                    queryType = neon.query.SUM;
                } else if($scope.options.barType === 'average') {
                    queryType = neon.query.AVG;
                }

                if($scope.options.barType === "count") {
                    query.aggregate(queryType, '*', COUNT_FIELD_NAME);
                } else {
                    query.aggregate(queryType, $scope.options.attrY.columnName, COUNT_FIELD_NAME);
                }

                query.sortBy(COUNT_FIELD_NAME, neon.query.DESCENDING);
                query.limit($scope.options.limitCount);
                return query;
            };

            $scope.queryForData = function(rebuildChart) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !datasetService.isFieldValid($scope.options.attrX) || (!$scope.options.attrY.columnName && $scope.options.barType !== "count")) {
                    drawBlankChart();
                    $scope.loadingData = false;
                    return;
                }

                var query = $scope.buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "barchart",
                    elementType: "canvas",
                    elementSub: "barchart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "barchart"]
                });

                if($scope.outstandingQuery) {
                    $scope.outstandingQuery.abort();
                }

                $scope.outstandingQuery = connection.executeQuery(query);
                $scope.outstandingQuery.always(function() {
                    $scope.outstandingQuery = undefined;
                });
                $scope.outstandingQuery.done(function(queryResults) {
                    $scope.$apply(function() {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "barchart",
                            elementType: "canvas",
                            elementSub: "barchart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "barchart"]
                        });
                        $scope.results = {
                            count: queryResults.data.length
                        };
                        doDrawChart(queryResults, rebuildChart);
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "barchart",
                            elementType: "canvas",
                            elementSub: "barchart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["render", "barchart"]
                        });
                    });
                });
                $scope.outstandingQuery.fail(function(response) {
                    $scope.outstandingQuery = undefined;
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "barchart",
                            elementType: "canvas",
                            elementSub: "barchart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "barchart"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "barchart",
                            elementType: "canvas",
                            elementSub: "barchart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "barchart"]
                        });
                        drawBlankChart();
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            var drawBlankChart = function() {
                doDrawChart({
                    data: []
                }, true);
            };

            var clickFilterHandler = function(value) {
                if(!$scope.options.attrX.columnName) {
                    return;
                }

                var filterExists = $scope.filterSet ? true : false;
                handleFilterSet($scope.options.attrX.prettyName, value);

                // Store the value for the filter to use during filter creation.
                $scope.filterValue = value;

                var connection = connectionService.getActiveConnection();
                if($scope.messenger && connection) {
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.attrX.columnName]);
                    var filterNameObj = {
                        visName: "BarChart",
                        text: $scope.filterSet.key + " = " + $scope.filterSet.value
                    };
                    if(filterExists) {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "barchart",
                            elementType: "canvas",
                            elementSub: "barchart-bar",
                            elementGroup: "chart_group",
                            source: "user",
                            tags: ["filter", "barchart"]
                        });
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForXAxis, filterNameObj);
                    } else {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "barchart",
                            elementType: "canvas",
                            elementSub: "barchart-bar",
                            elementGroup: "chart_group",
                            source: "user",
                            tags: ["filter", "barchart"]
                        });
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForXAxis, filterNameObj);
                    }
                }
            };

            /**
             * Creates and returns a filter on the given x-axis field using the value set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} xAxisFieldName The name of the x-axis field on which to filter
             * @method createFilterClauseForXAxis
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForXAxis = function(databaseAndTableName, xAxisFieldName) {
                return neon.query.where(xAxisFieldName, '=', $scope.filterValue);
            };

            var handleFilterSet = function(key, val) {
                $scope.filterSet = {
                    key: key,
                    value: val
                };

                var mappings = datasetService.getMappings($scope.options.database.name, $scope.options.table.name);
                var chartLinks = {};
                chartLinks[val] = popups.links.createAllServiceLinkObjects(external.services, mappings, key, val);
                popups.links.setData($scope.visualizationId, chartLinks);

                //no need to requery because barchart ignores its own filter
            };

            var clearFilterSet = function() {
                $scope.filterSet = undefined;
                popups.links.deleteData($scope.visualizationId);
            };

            $scope.clearFilterSet = function() {
                if($scope.messenger) {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "click",
                        elementId: "barchart",
                        elementType: "button",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["filter", "barchart"]
                    });
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                        $scope.chart.clearSelectedBar();
                        clearFilterSet();
                    });
                }
            };

            var doDrawChart = function(data, destroy) {
                var opts = {
                    data: data.data,
                    x: $scope.options.attrX.columnName,
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

            $scope.getLegendText = function() {
                if($scope.options.barType === "average") {
                    return "Average " + $scope.options.attrY.prettyName + " vs. " + $scope.options.attrX.prettyName;
                }
                if($scope.options.barType === "sum") {
                    return "Sum " + $scope.options.attrY.prettyName + " vs. " + $scope.options.attrX.prettyName;
                }
                if($scope.options.barType === "count") {
                    return "Count of " + $scope.options.attrX.prettyName;
                }
                return "";
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeBarchartExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "barchart-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "barchart", "export"]
                });
                var query = $scope.buildQuery();
                query.limitClause = exportService.getLimitClause();
                query.ignoreFilters_ = exportService.getIgnoreFilters();
                query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
                var finalObject = {
                    name: "Bar_Chart",
                    data: [{
                        query: query,
                        name: "barchart-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: query.groupByClauses[0].field,
                    pretty: capitalizeFirstLetter(query.groupByClauses[0].field)
                });
                if($scope.options.barType === "average") {
                    finalObject.data[0].fields.push({
                        query: COUNT_FIELD_NAME,
                        pretty: "Average of " + query.aggregates[0].field
                    });
                }
                if($scope.options.barType === "sum") {
                    finalObject.data[0].fields.push({
                        query: COUNT_FIELD_NAME,
                        pretty: "Sum of " + query.aggregates[0].field
                    });
                }
                if($scope.options.barType === "count") {
                    finalObject.data[0].fields.push({
                        query: COUNT_FIELD_NAME,
                        pretty: "Count"
                    });
                }
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

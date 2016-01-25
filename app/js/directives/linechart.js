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
 * @namespace neonDemo.directives
 * @class linechart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('linechart', ['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService',
    'ExportService', 'LinksPopupService', '$timeout', '$filter',
function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, $timeout, $filter) {
    var COUNT_FIELD_NAME = 'value';

    return {
        templateUrl: 'partials/directives/linechart.html',
        restrict: 'EA',
        scope: {
            bindConfig: '=',
            bindGranularity: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            var HOUR = "hour";
            var DAY = "day";

            $element.addClass('linechartDirective');

            $scope.element = $element;
            $scope.visualizationId = "linechart-" + uuid();

            $scope.optionsMenuButtonText = function() {
                if($scope.noData) {
                    return "No Data";
                }
                return "";
            };

            $scope.showOptionsMenuButtonText = function() {
                return $scope.noData;
            };

            // Function on resize given to the options menu directive.
            $scope.resizeOptionsMenu = function() {
                var container = $element.find(".menu-container");
                // Make the height of the options menu match the height of the visualization below the header menu container.
                var height = $element.height() - container.outerHeight(true);
                // Make the width of the options menu match the width of the visualization.
                var width = $element.outerWidth(true);

                var popover = container.find(".popover-content");
                popover.css("height", height + "px");
                popover.css("width", width + "px");
            };

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.visualizationFilterKeys = {};
            $scope.filterKeys = {};
            $scope.dateFilterKeys = {};
            $scope.chart = undefined;
            $scope.brushExtent = [];
            $scope.colorMappings = [];
            $scope.dateStringToDataIndex = {};
            $scope.seriesLimit = 10;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.noData = true;
            $scope.data = {};
            $scope.queryOnChangeBrush = false;
            $scope.automaticHourSet = false;
            $scope.outstandingQuery = {};
            $scope.linksPopupButtonIsDisabled = true;

            $scope.legend = {
                display: false,
                charts: {}
            };

            $scope.options = {
                granularity: $scope.bindGranularity ? $scope.bindGranularity.toLowerCase() : DAY,
                trendlines: 'hide',
                charts: [],
                newChart: {
                    editing: false,
                    validFields: false,
                    validName: false,
                    active: true,
                    visible: true,
                    database: {},
                    table: {},
                    name: "",
                    attrX: {},
                    aggregation: "count",
                    attrY: {},
                    categoryField: {}
                }
            };

            var updateChartSize = function() {
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true);
                $element.find(".title").css("maxWidth", titleWidth - 80);
                resizeLegend();

                // Set the width of the title to the width of the visualization minus the width of the chart options button/text and padding.
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true) - 20;
                $element.find(".title").css("maxWidth", titleWidth);
                resizeLegend();

                if($scope.chart) {
                    var headerHeight = 0;
                    $element.find(".header-container").each(function() {
                        if(_.contains($(this).attr("class"), "legend-container")) {
                            headerHeight += $(this).find(".header-text").outerHeight(true);
                        } else {
                            headerHeight += $(this).outerHeight(true);
                        }
                    });
                    $element.find('.linechart').height($element.height() - headerHeight);

                    // Redraw the line chart.
                    $scope.chart.draw();
                    $scope.chart.showTrendlines(($scope.options.trendlines === 'show') ? true : false);
                }
            };

            var resizeLegend = function() {
                var container = $element.find(".legend-container");
                var containerCss = container.outerHeight(true) - container.height();

                var legend = container.find(".legend");
                var legendCss = legend.outerHeight(true) - legend.height();

                var divider = container.find(".legend>.divider");
                var dividerCss = divider.outerHeight(true);
                var header = container.find(".legend>.header-text");
                var headerCss = header.outerHeight(true);
                var height = $element.height() - containerCss - legendCss - dividerCss - headerCss - 20;

                var legendDetails = container.find(".legend-details");
                legendDetails.css("max-height", height + "px");
            };

            var initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    refreshCharts();
                });
                $scope.messenger.subscribe(datasetService.DATE_CHANGED_CHANNEL, onDateChanged);
                $scope.messenger.subscribe("date_selected", onDateSelected);

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(containsKey(ids)) {
                        $scope.removeBrush();
                    }
                });

                $scope.exportID = exportService.register($scope.makeLinechartExportObject);

                $element.find('.legend-container .legend').on({
                    "shown.bs.dropdown": function() {
                        this.closable = false;
                    },
                    click: function() {
                        this.closable = true;
                    },
                    "hide.bs.dropdown": function() {
                        return this.closable;
                    }
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "linechart",
                        elementType: "canvas",
                        elementSub: "linechart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["remove", "linechart"]
                    });
                    linksPopupService.deleteLinks($scope.visualizationId);
                    $element.off("resize", updateChartSize);
                    $element.find(".chart-options a").off("resize", updateChartSize);
                    $scope.messenger.unsubscribeAll();
                    exportService.unregister($scope.exportID);
                    if($scope.brushExtent.length) {
                        $scope.removeBrush();
                    }
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(updateChartSize);
                $element.find(".chart-options a").resize(updateChartSize);

                $scope.$watch('options.granularity', function(newVal, oldVal) {
                    if(!$scope.loadingData && newVal && newVal !== oldVal) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: ($scope.loadingData) ? "reset" : "click",
                            elementId: "linechart-" + newVal,
                            elementType: "button",
                            elementSub: "linechart-" + newVal,
                            elementGroup: "chart_group",
                            source: ($scope.loadingData) ? "system" : "user",
                            tags: ["linechart", "granularity", newVal]
                        });
                        $scope.chart.setGranularity(newVal);
                        refreshCharts();
                        $scope.queryOnChangeBrush = $scope.queryOnChangeBrush || ($scope.brushExtent.length > 0);
                    }
                });
                $scope.$watch('options.trendlines', function(newVal, oldVal) {
                    if(!$scope.loadingData && newVal && newVal !== oldVal) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: ($scope.loadingData) ? "reset" : "click",
                            elementId: "linechart",
                            elementType: "button",
                            elementSub: "linechart-trendline-" + newVal,
                            elementGroup: "chart_group",
                            source: ($scope.loadingData) ? "system" : "user",
                            tags: ["linechart", "trendline", newVal]
                        });
                        if(newVal === 'show') {
                            $scope.chart.showTrendlines(true);
                        } else {
                            $scope.chart.showTrendlines(false);
                        }
                    }
                });
            };

            /**
             * Returns whether the added or removed filter in the given message is a date filter on a linechart with the given x-axis/date field.
             * @param {Object} message
             * @param {Object} attrX
             * @method isDateFiltersChangedMessage
             * @return {Boolean}
             */
            var isDateFiltersChangedMessage = function(message, attrX) {
                var whereClauses;
                if(message.addedFilter.whereClause) {
                    whereClauses = message.addedFilter.whereClause.whereClauses;
                } else if(message.removedFilter.whereClause) {
                    whereClauses = message.removedFilter.whereClause.whereClauses;
                }
                if(whereClauses && whereClauses.length === 2 && whereClauses[0].lhs === attrX && whereClauses[1].lhs === attrX) {
                    return true;
                }
                return false;
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName && message.addedFilter.tableName) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "linechart",
                        elementType: "canvas",
                        elementSub: "linechart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "linechart"]
                    });
                    var queryData = false;
                    _.each($scope.options.charts, function(chart) {
                        if(chart.database === message.addedFilter.databaseName  && chart.table === message.addedFilter.tableName &&
                            !isDateFiltersChangedMessage(message, chart.attrXMapping) && chart.active) {
                            queryData = true;
                        }
                    });

                    if(queryData) {
                        refreshCharts();
                        $scope.queryOnChangeBrush = $scope.queryOnChangeBrush || $scope.brushExtent.length > 0;
                    }
                }
            };

            /**
             * Event handler for date changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon date changed message.
             * @method onDateChanged
             * @private
             */
            var onDateChanged = function(message) {
                if(message.databaseName && message.tableName && message.fieldNames.length) {
                    var queryData = false;
                    var chartsToUpdate = [];

                    _.each($scope.options.charts, function(chart) {
                        if(chart.database === message.databaseName && chart.table === message.tableName &&
                            datasetService.isFieldValid(chart.attrXField) && message.fieldNames.indexOf(chart.attrXMapping) >= 0 && chart.active) {
                            queryData = true;
                            chartsToUpdate.push(chart);
                        }
                    });

                    if(queryData && $scope.brushExtent.toString() !== message.brushExtent.toString()) {
                        renderBrushExtent(message.brushExtent);
                        if($scope.brushExtent.length >= 2) {
                            updateBrushRecursively(chartsToUpdate);
                        } else {
                            removeBrushRecursively(chartsToUpdate, true);
                        }
                    }
                }
            };

            /**
             * Returns whether any of the given ids are in the visualization's filter keys object.
             * @param {Array} ids
             * @return {Boolean}
             * @method containsKey
             * @private
             */
            var containsKey = function(ids) {
                return _.some($scope.filterKeys, function(tables) {
                    return _.some(tables, function(dateMappings) {
                        return _.some(dateMappings, function(filterKeyObj) {
                            return _.contains(ids, filterKeyObj.filterKey);
                        });
                    });
                });
            };

            /**
             * Queries all active charts and updates the graph.
             * @method refreshCharts
             * @private
             */
            var refreshCharts = function() {
                var validation = function(chart) {
                    return chart.active;
                };

                if($scope.options.charts.length) {
                    queryAllData(validation);
                } else {
                    updateLineChartForBrushExtent();
                }
            };

            /**
             * Queries all charts that pass the given validation function and updates the graph.
             * @param {Function} validation Validation function to determine if the chart should re-query its data.
             * @method queryAllData
             * @private
             */
            var queryAllData = function(validation) {
                var queriesCompleted = 0;
                _.each($scope.options.charts, function(chart) {
                    if(validation(chart)) {
                        if(!$scope.outstandingQuery[chart.id]) {
                            $scope.outstandingQuery[chart.id] = undefined;
                        }
                        queryForData(chart, function(results) {
                            $scope.data[chart.id] = results.data;
                            queriesCompleted++;

                            if(queriesCompleted === $scope.options.charts.length) {
                                updateLineChartForBrushExtent(true);
                            }
                        }, function(response) {
                            if(response.responseJSON) {
                                $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                            }

                            $scope.data[chart.id] = [];
                            queriesCompleted++;

                            if(queriesCompleted === $scope.options.charts.length) {
                                updateLineChartForBrushExtent(true);
                            }
                        });
                    } else {
                        queriesCompleted++;

                        if(queriesCompleted === $scope.options.charts.length) {
                            updateLineChartForBrushExtent(true);
                        }
                    }
                });
            };

            /**
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                if($scope.chart) {
                    if(message.start && message.end) {
                        $scope.chart.selectDate(message.start, message.end);
                    } else {
                        $scope.chart.deselectDate();
                    }
                }
            };

            /**
             * Sets the given brush extent, if any, and adds/removes any external services.
             * @param {Array} brushExtent
             * @method renderBrushExtent
             * @private
             */
            var renderBrushExtent = function(brushExtent) {
                $scope.brushExtent = brushExtent || [];
                if(!$scope.brushExtent.length) {
                    linksPopupService.deleteLinks($scope.visualizationId);
                } else if(external.services[neonMappings.DATE]) {
                    var dateLinks = [];
                    Object.keys(external.services[neonMappings.DATE].apps).forEach(function(app) {
                        var linkData = {};
                        linkData[neonMappings.DATE] = {};
                        linkData[neonMappings.DATE][neonMappings.START_DATE] = $scope.brushExtent[0].toISOString();
                        linkData[neonMappings.DATE][neonMappings.END_DATE] = $scope.brushExtent[1].toISOString();
                        dateLinks.push(linksPopupService.createServiceLinkObjectWithData(external.services[neonMappings.DATE], app, linkData));
                    });
                    var chartLinks = {};
                    chartLinks[$scope.getDateKeyForLinksPopupButton()] = dateLinks;
                    linksPopupService.setLinks($scope.visualizationId, chartLinks);
                    $scope.linksPopupButtonIsDisabled = !dateLinks.length;
                }
            };

            /**
             * Returns the external services date key for the brush extent.
             * @return {String}
             * @method getDateKeyForLinksPopupButton
             */
            $scope.getDateKeyForLinksPopupButton = function() {
                return $scope.brushExtent.length >= 2 ? linksPopupService.generateDateRangeKey($scope.brushExtent[0].toUTCString(), $scope.brushExtent[1].toUTCString()) : "";
            };

            /**
             * Queries for data on the given chart and executes any callback given when finished querying.
             * @param {Object} chart
             * @param {Function} successCallback
             * @param {Function} failureCallback
             * @method queryForData
             * @private
             */
            var queryForData = function(chart, successCallback, failureCallback) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "linechart"]
                });

                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !chart.attrXMapping || (!chart.attrYMapping && chart.aggregation !== "count")) {
                    if(successCallback) {
                        successCallback({
                            data: []
                        });
                    } else {
                        $scope.data[chart.id] = [];

                        updateLineChartForBrushExtent(true);
                    }
                    return;
                }

                var query = buildQuery(chart);

                if($scope.outstandingQuery[chart.id]) {
                    $scope.outstandingQuery[chart.id].abort();
                }

                $scope.outstandingQuery[chart.id] = connection.executeQuery(query);
                $scope.outstandingQuery[chart.id].always(function() {
                    $scope.outstandingQuery[chart.id] = undefined;
                });
                $scope.outstandingQuery[chart.id].done(function(results) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "linechart",
                        elementType: "canvas",
                        elementSub: "linechart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["receive", "linechart"]
                    });
                    if(successCallback) {
                        successCallback(results);
                    } else {
                        $scope.data[chart.id] = results.data;

                        updateLineChartForBrushExtent(true);
                    }

                    XDATA.userALE.log({
                        activity: "alter",
                        action: "render",
                        elementId: "linechart",
                        elementType: "canvas",
                        elementSub: "linechart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["render", "linechart"]
                    });
                });
                $scope.outstandingQuery[chart.id].fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "linechart",
                            elementType: "canvas",
                            elementSub: "linechart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "linechart"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "linechart",
                            elementType: "canvas",
                            elementSub: "linechart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "linechart"]
                        });

                        if(failureCallback) {
                            failureCallback(response);
                        } else {
                            if(response.responseJSON) {
                                $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                            }
                            drawLineChart([], {});
                        }
                    }
                });
            };

            /**
             * Builds a query for the given chart and returns it.
             * @param {Object} chart
             * @method buildQuery
             * @private
             * @return A ready-to-be-sent query for the line chart.
             */
            var buildQuery = function(chart) {
                var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, chart.attrXMapping, 'year');
                var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, chart.attrXMapping, 'month');
                var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, chart.attrXMapping, 'day');

                var groupByClause = [yearGroupClause, monthGroupClause, dayGroupClause];

                if($scope.options.granularity === HOUR) {
                    var hourGroupClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, chart.attrXMapping, 'hour');
                    groupByClause.push(hourGroupClause);
                }
                if(datasetService.isFieldValid(chart.categoryField)) {
                    groupByClause.push(chart.categoryField);
                }

                // Creating a query with a where clause to exclude bad/null dates
                var query = new neon.query.Query()
                    .selectFrom(chart.database, chart.table)
                    .where(neon.query.and(
                        neon.query.where(chart.attrXMapping, '>=', new Date("1970-01-01T00:00:00.000Z")),
                        neon.query.where(chart.attrXMapping, '<=', new Date("2025-01-01T00:00:00.000Z"))
                    ));

                query.groupBy.apply(query, groupByClause);

                if(chart.aggregation === "count") {
                    query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
                }
                if(chart.aggregation === "sum") {
                    query.aggregate(neon.query.SUM, chart.attrYMapping, COUNT_FIELD_NAME);
                }
                if(chart.aggregation === "average") {
                    query.aggregate(neon.query.AVG, chart.attrYMapping, COUNT_FIELD_NAME);
                }
                if(chart.aggregation === "min") {
                    query.aggregate(neon.query.MIN, chart.attrYMapping, COUNT_FIELD_NAME);
                }
                if(chart.aggregation === "max") {
                    query.aggregate(neon.query.MAX, chart.attrYMapping, COUNT_FIELD_NAME);
                }

                query.aggregate(neon.query.MIN, chart.attrXMapping, 'date')
                    .sortBy('date', neon.query.ASCENDING);

                if(!chart.active) {
                    query.ignoreFilters([$scope.filterKeys[chart.database][chart.table][chart.attrXMapping].filterKey]);
                }

                return query;
            };

            /**
             * Displays data for any currently active datasets.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function() {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.newChart.database = $scope.databases[0];
                $scope.options.charts = [];

                $scope.updateTables();

                cloneDatasetChartsConfig();

                var brushExtentFound = false;

                // Update the brush extent if any global date filters are found
                for(var i = 0; i < $scope.options.charts.length; i++) {
                    var globalBrushExtent = datasetService.getDateBrushExtent($scope.options.charts[i].database,
                        $scope.options.charts[i].table, $scope.options.charts[i].attrXMapping);

                    if(!$scope.brushExtent.length && globalBrushExtent.length && $scope.options.charts[i].active) {
                        brushExtentFound = true;
                        $scope.queryOnChangeBrush = true;
                        updateBrush(globalBrushExtent, true);
                        return;
                    }
                }

                if(!brushExtentFound) {
                    if($scope.options.charts.length) {
                        queryAllData(function(chart) {
                            return true;
                        });
                    } else {
                        updateLineChartForBrushExtent();
                    }
                }
            };

            /**
             * Retrieves the list of tables available and sets a default table for a new chart.
             * @method updateTables
             */
            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.newChart.database.name);
                $scope.options.newChart.table = datasetService.getFirstTableWithMappings($scope.options.newChart.database.name, [neonMappings.DATE, neonMappings.Y_AXIS]) || $scope.tables[0];
                $scope.updateFields();
            };

            /**
             * Updates the fields for the table set for the new chart.
             * @method updateFields
             */
            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.newChart.database.name, $scope.options.newChart.table.name);
                $scope.options.newChart.aggregation = $scope.bindAggregationField || "count";

                var attrX = datasetService.getMapping($scope.options.newChart.database.name, $scope.options.newChart.table.name, neonMappings.DATE) || "";
                $scope.options.newChart.attrX = _.find($scope.fields, function(field) {
                    return field.columnName === attrX;
                }) || datasetService.createBlankField();
                var attrY = datasetService.getMapping($scope.options.newChart.database.name, $scope.options.newChart.table.name, neonMappings.Y_AXIS) || "";
                $scope.options.newChart.attrY = _.find($scope.fields, function(field) {
                    return field.columnName === attrY;
                }) || datasetService.createBlankField();
                var categoryField = datasetService.getMapping($scope.options.newChart.database.name, $scope.options.newChart.table.name, neonMappings.LINE_GROUP) || "";
                $scope.options.newChart.categoryField = _.find($scope.fields, function(field) {
                    return field.columnName === categoryField;
                }) || datasetService.createBlankField();

                $scope.validateChart();
            };

            /**
             * Retreives any line charts specified in the dataset config that match the given bindConfig name.
             * @method cloneDatasetChartsConfig
             * @private
             */
            var cloneDatasetChartsConfig = function() {
                datasetService.getLineCharts($scope.bindConfig).forEach(function(chart) {
                    $scope.options.charts.push(setDefaultChartProperties(_.clone(chart)));
                });
            };

            /**
             * Sets all properties needed to create a line chart for the given chart object.
             * @param {Object} chart
             * @return {Array}
             * @method setDefaultChartProperties
             * @private
             */
            var setDefaultChartProperties = function(chart) {
                chart.name = (chart.name || chart.table).toUpperCase();
                chart.databasePrettyName = datasetService.getPrettyNameForDatabase(chart.database);
                chart.tablePrettyName = datasetService.getPrettyNameForTable(chart.database, chart.table);
                chart.fields = datasetService.getSortedFields(chart.database, chart.table);
                chart.attrXField = datasetService.findField(chart.fields, chart.xAxis);
                chart.attrXMapping = chart.xAxis;
                chart.aggregation = (chart.aggregation).toLowerCase();
                chart.attrYField = datasetService.findField(chart.fields, chart.yAxis);
                chart.attrYMapping = chart.yAxis;
                chart.categoryField = datasetService.findField(chart.fields, chart.category);
                chart.categoryMapping = chart.category;
                chart.active = chart.active;
                chart.visible = true;
                chart.id = uuid();

                if(chart.aggregation !== "sum" && chart.aggregation !== "average" &&
                    chart.aggregation !== "min" && chart.aggregation !== "max") {
                    chart.aggregation = "count";
                }

                setFilterKey(chart);

                $scope.validateChart(chart, -1);

                if(chart.validName && chart.validFields) {
                    chart.editing = false;
                    setActiveStatusForCharts(chart.database, chart.table, chart.attrXMapping, chart.active);
                } else {
                    chart.editing = true;
                }

                return chart;
            };

            /**
             * Updates the filter for the given chart, and any chart with the same database, table, and date values.
             * @param {Object} chart
             * @method updateFilteringOnChart
             */
            $scope.updateFilteringOnChart = function(chart) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "click",
                    elementId: "linechart-active-button",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "linechart", chart.name, "active", chart.active]
                });
                setActiveStatusForCharts(chart.database, chart.table, chart.attrXMapping, chart.active);
                resetAndQueryForData(chart);
            };

            /**
             * Deletes the given chart from the visualization.
             * @param {Object} chart
             * @method deleteChart
             */
            $scope.deleteChart = function(chart) {
                delete $scope.data[chart.id];
                var index = _.findIndex($scope.options.charts, function(element) {
                    return element.id === chart.id;
                });
                $scope.options.charts.splice(index, 1);

                if(!$scope.options.charts.length) {
                    removeBrushRecursively([chart], true);
                } else {
                    updateLineChartForBrushExtent();
                }
            };

            /**
             * Updates the field mappings in the given chart and returns the chart.
             * @param {Object} chart
             * @method updateChartFieldMappings
             * @return {Object}
             * @private
             */
            var updateChartFieldMappings = function(chart) {
                chart.attrXMapping = (chart.attrXField ? chart.attrXField.columnName : "");
                chart.attrYMapping = (chart.attrYField ? chart.attrYField.columnName : "");
                chart.categoryMapping = (chart.categoryField ? chart.categoryField.columnName : "");
                return chart;
            };

            /**
             * Updates the given chart
             * @param {Object} chart
             * @method updateChart
             */
            $scope.updateChart = function(chart) {
                chart.name = (chart.name || createChartTitle(chart)).toUpperCase();
                chart = updateChartFieldMappings(chart);
                chart.editing = false;
                resetAndQueryForData(chart);
            };

            /**
             * Adds a new line chart using the properties set in the options menu
             * @method addNewChart
             */
            $scope.addNewChart = function() {
                var chart = {
                    name: ($scope.options.newChart.name || createChartTitle($scope.options.newChart)).toUpperCase(),
                    database: $scope.options.newChart.database.name,
                    databasePrettyName: $scope.options.newChart.database.prettyName,
                    table: $scope.options.newChart.table.name,
                    tablePrettyName: $scope.options.newChart.table.prettyName,
                    fields: $scope.fields,
                    attrXField: $scope.options.newChart.attrX,
                    attrXMapping: ($scope.options.newChart.attrX ? $scope.options.newChart.attrX.columnName : ""),
                    aggregation: $scope.options.newChart.aggregation,
                    attrYField: $scope.options.newChart.attrY,
                    attrYMapping: ($scope.options.newChart.attrY ? $scope.options.newChart.attrY.columnName : ""),
                    categoryField: $scope.options.newChart.categoryField,
                    categoryMapping: ($scope.options.newChart.categoryField ? $scope.options.newChart.categoryField.columnName : ""),
                    active: $scope.options.newChart.active,
                    visible: $scope.options.newChart.visible,
                    validFields: true,
                    validName: true,
                    editing: false
                };

                chart.id = uuid();
                setActiveStatusForCharts(chart.database, chart.table, chart.attrXMapping, chart.active);
                $scope.options.charts.push(chart);
                resetAndQueryForData(chart);
                $scope.resetNewChart();
            };

            /**
             * Updates all charts with the given database, table, and x-attribute with the given active status.
             * @param {String} database
             * @param {String} table
             * @param {String} attrX
             * @param {Boolean} active
             * @method setActiveStatusForCharts
             * @private
             */
            var setActiveStatusForCharts = function(database, table, attrX, active) {
                _.each($scope.options.charts, function(chart) {
                    if(chart.database === database && chart.table === table && chart.attrXMapping === attrX) {
                        chart.active = active;
                    }
                });
            };

            /**
             * Resets the new line chart properties.
             * @method resetNewChart
             */
            $scope.resetNewChart = function() {
                $scope.databases = datasetService.getDatabases();
                $scope.options.newChart.editing = false;
                $scope.options.newChart.database = $scope.databases[0];
                $scope.options.newChart.name = "";
                $scope.options.newChart.aggregation = "count";
                $scope.options.newChart.visible = true;
                $scope.options.newChart.active = true;
                $scope.updateTables();
            };

            /**
             * Creates and returns a title for the given chart.
             * @param {Object} chart
             * @return {String}
             * @method createChartTitle
             * @private
             */
            var createChartTitle = function(chart) {
                return chart.table.name +
                    (chart.attrYMapping && chart.aggregation !== "count" ?
                        ' / ' + chart.attrYMapping : '');
            };

            /**
             * Returns whether the given chart's name matches the name of any other existing charts. If no chart and index
             * are given, the new chart object is used.
             * @param {Object} [chart]
             * @param {Number} [index]
             * @return {Boolean}
             * @method validateChartName
             * @private
             */
            var validateChartName = function(chart, index) {
                if(chart && index) {
                    return !($scope.options.charts.some(function(element, elementIndex) {
                        return element.name === (chart.name || createChartTitle(chart)).toUpperCase() && elementIndex !== index;
                    }));
                }
                return !($scope.options.charts.some(function(element) {
                    return element.name === ($scope.options.newChart.name || createChartTitle($scope.options.newChart)).toUpperCase();
                }));
            };

            /**
             * Returns whether the given chart has a y-attribute value when applicable. If no chart is given, the new chart object is used.
             * @param {Object} [chart]
             * @return {Boolean}
             * @method validateAttrY
             * @private
             */
            var validateAttrY = function(chart) {
                if(chart) {
                    return (chart.aggregation !== 'count' && !chart.attrYField.columnName) ? false : true;
                }
                return ($scope.options.newChart.aggregation !== 'count' && !$scope.options.newChart.attrY.columnName) ? false : true;
            };

            /**
             * Returns whether the given chart has an x-attribute value. If no chart is given, the new chart object is used.
             * @param {Object} [chart]
             * @return {Boolean}
             * @method validateAttrX
             * @private
             */
            var validateAttrX = function(chart) {
                if(chart) {
                    return (chart.attrXField.columnName) ? true : false;
                }
                return ($scope.options.newChart.attrX.columnName) ? true : false;
            };

            /**
             * Sets the validity of the given chart. If no chart is given, the new chart object is used.
             * @param {Object} [chart]
             * @param {Number} [index]
             * @method validateChart
             */

            $scope.validateChart = function(chart, index) {
                if(chart) {
                    chart.validFields = (validateAttrY(chart) && validateAttrX(chart) ? true : false);
                    chart.validName = validateChartName(chart, index);
                } else {
                    $scope.options.newChart.validFields = (validateAttrY() && validateAttrX() ? true : false);
                    $scope.options.newChart.validName = validateChartName();
                }
            };

            /**
             * Toggles the editing status of the new chart object and validates it.
             * @method clickAddNewChartButton
             */
            $scope.clickAddNewChartButton = function() {
                $scope.toggleEditing($scope.options.newChart);
                $scope.validateChart();
            };

            /**
             * Toggles editing on the given chart.
             * @param {Object} chart
             * @method toggleEditing
             */
            $scope.toggleEditing = function(chart) {
                chart.editing = !chart.editing;
            };

            /**
             * Shows/hides the legend
             * @method toggleLegend
             */
            $scope.toggleLegend = function() {
                $scope.legend.display = !$scope.legend.display;
            };

            /**
             * Shows/hides the legend for a single chart
             * @param {Number} index The index in the legend that contains the chart to show/hide
             * @method toggleLegendChart
             */
            $scope.toggleLegendChart = function(id) {
                $scope.legend.charts[id].display = !$scope.legend.charts[id].display;
            };

            /*
             * Adds a new filter key, if it doesn't exist already, for the given layer.
             * @method setFilterKey
             * @private
             */
            var setFilterKey = function(chart) {
                var filterServiceKeys = datasetService.getDateFilterKeys(chart.database, chart.table, chart.attrXMapping);
                var attrX = chart.attrXMapping;
                var relations = datasetService.getRelations(chart.database, chart.table, [attrX]);

                $scope.filterKeys = filterService.createFilterKeysForAttribute($scope.filterKeys, chart.database, chart.table, attrX, filterServiceKeys, relations);
            };

            /**
             * Resets the filter keys and requeries for all charts matching the given charts database, table, and date mappoing.
             * @param {Object} chart
             * @method resetAndQueryForData
             * @private
             */
            var resetAndQueryForData = function(chart) {
                setFilterKey(chart);

                var globalBrushExtent = datasetService.getDateBrushExtent(chart.database, chart.table, chart.attrXMapping);
                if(!$scope.brushExtent.length && globalBrushExtent.length && chart.active) {
                    $scope.queryOnChangeBrush = true;
                    updateBrush(globalBrushExtent, true);
                    return;
                }

                var validation = function(element) {
                    if(chart.database === element.database && chart.table === element.table && chart.attrXMapping === element.attrXMapping) {
                        element.active = chart.active;
                        return true;
                    }
                    return false;
                };

                queryAllData(validation);
            };

            /**
             * Compares the two given data points for a sort function based on their aggregation type.
             * @param {Array} a
             * @param {Array} b
             * @method compareSeriesData
             * @return {Integer}
             */
            var compareSeriesData = function(a, b) {
                if(a.aggregation === "count" || a.aggregation === "sum" || a.aggregation === "average") {
                    if(a.total < b.total) {
                        return 1;
                    }
                    if(a.total > b.total) {
                        return -1;
                    }
                }
                if(a.aggregation === "min") {
                    if(a.min < b.min) {
                        return -1;
                    }
                    if(a.min > b.min) {
                        return 1;
                    }
                }
                if(a.aggregation === "max") {
                    if(a.max < b.max) {
                        return 1;
                    }
                    if(a.max > b.max) {
                        return -1;
                    }
                }
                return 0;
            };

            /**
             * Creates and returns the "other series" representing the combined groups outside the "top 10" (the value of the seriesLimit) from the given data.
             * @param {Array} data
             * @method createOtherSeriesData
             * @return {Object}
             */
            var createOtherSeriesData = function(data) {
                var count = data.length - $scope.seriesLimit;
                var text = "";
                if(data.length) {
                    text = data[0].series.split(":")[0] + ":";
                }
                var otherSeriesData = {
                    series: text + count + " Others",
                    total: 0,
                    min: undefined,
                    max: undefined,
                    data: []
                };

                // For averages, do not include the combined values of groups outside the top 10 because adding averages together from multiple groups makes no sense.
                if($scope.options.aggregation !== 'average') {
                    for(var i = $scope.seriesLimit; i < data.length; i++) {
                        otherSeriesData.total += data[i].total;
                        otherSeriesData.min = _.isUndefined(otherSeriesData.min) ? data[i].min : Math.min(otherSeriesData.min, data[i].min);
                        otherSeriesData.max = _.isUndefined(otherSeriesData.max) ? data[i].max : Math.max(otherSeriesData.max, data[i].max);
                        for(var d = 0; d < data[i].data.length; d++) {
                            if(otherSeriesData.data[d]) {
                                if(($scope.options.aggregation === "count" || $scope.options.aggregation === "sum") && !_.isUndefined(data[i].data[d].value)) {
                                    if(_.isUndefined(otherSeriesData.data[d].value)) {
                                        otherSeriesData.data[d].value = data[i].data[d].value;
                                    } else {
                                        otherSeriesData.data[d].value += data[i].data[d].value;
                                    }
                                }
                                if($scope.options.aggregation === "min" && !_.isUndefined(data[i].data[d].value)) {
                                    if(_.isUndefined(otherSeriesData.data[d].value)) {
                                        otherSeriesData.data[d].value = data[i].data[d].value;
                                    } else {
                                        otherSeriesData.data[d].value = Math.min(otherSeriesData.data[d].value, data[i].data[d].value);
                                    }
                                }
                                if($scope.options.aggregation === "max" && !_.isUndefined(data[i].data[d].value)) {
                                    if(_.isUndefined(otherSeriesData.data[d].value)) {
                                        otherSeriesData.data[d].value = data[i].data[d].value;
                                    } else {
                                        otherSeriesData.data[d].value = Math.max(otherSeriesData.data[d].value, data[i].data[d].value);
                                    }
                                }
                            } else {
                                otherSeriesData.data[d] = {
                                    date: data[i].data[d].date,
                                    value: data[i].data[d].value
                                };
                            }
                        }
                    }
                }

                return otherSeriesData;
            };

            /**
             * Creates the line series data for a given chart using the given data, and the min and max dates.
             * @param {Object} chart
             * @param {Object} data
             * @param {Date} minDate
             * @param {Date} maxDate
             * @method createLineSeriesData
             */
            var createLineSeriesData = function(chart, data, minDate, maxDate) {
                //this prevents an error in older mongo caused when the xAxis value is invalid as it is not
                //included as a key in the response
                for(var i = 0; i < data.length; i++) {
                    if(typeof(data[i][chart.attrXMapping]) === 'undefined') {
                        data[i][chart.attrXMapping] = null;
                    }
                }

                var seriesData = [];
                var zeroedData = zeroPadData(chart, data, minDate, maxDate);

                for(var series in zeroedData) {
                    if(Object.prototype.hasOwnProperty.call(zeroedData, series)) {
                        seriesData.push(zeroedData[series]);
                    }
                }

                seriesData.sort(compareSeriesData);

                // The "other series" is the line representing the combined groups outside the "top 10" (the value of the seriesLimit).
                var otherSeriesData = createOtherSeriesData(seriesData);

                seriesData = seriesData.splice(0, $scope.seriesLimit);

                if(otherSeriesData.total > 0) {
                    seriesData.push(otherSeriesData);
                }

                if(!chart.visible) {
                    _.each(seriesData, function(series) {
                        series.hidden = true;
                    });
                }

                XDATA.userALE.log({
                    activity: "alter",
                    action: "receive",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["receive", "linechart"]
                });

                return seriesData;
            };

            /**
             * Shows/hides the line associated with the given color mapping.
             * @param {Object} colorMapping
             * @method toggleSeries
             */
            $scope.toggleSeries = function(colorMapping) {
                var activity = $scope.chart.toggleSeries(colorMapping.series);
                colorMapping.hidden = (activity === "show") ? false : true;
                $scope.chart.showTrendlines(($scope.options.trendlines === 'show') ? true : false);

                var chartId = colorMapping.series.split(":")[0];
                var allHidden = _.every($scope.colorMappings[chartId], 'hidden');

                var chart = _.find($scope.options.charts, {
                    id: chartId
                });
                chart.visible = !allHidden;

                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["render", "linechart", colorMapping.series]
                });
            };

            /**
             * Shows/hides the given chart.
             * @param {Object} chart
             * @method updateChartVisibility
             */
            $scope.updateChartVisibility = function(chart) {
                var activity = $scope.chart.toggleSeriesGroup(chart.id, (chart.visible ? 'show' : 'hide'));
                $scope.chart.showTrendlines(($scope.options.trendlines === 'show') ? true : false);
                _.each($scope.colorMappings[chart.id], function(colorMapping) {
                    colorMapping.hidden = !chart.visible;
                });
                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["render", "linechart", chart.name]
                });
            };

            /**
             * Creates a series object to use when drawing the given chart. Creates dates in the object from minDate
             * to maxDate and sets all dates not in the given data to zero.
             * @param {Object} chart
             * @param {Array} data
             * @param {Date} minDate
             * @param {Date} maxDate
             * @return {Object}
             * @method zeroPadData
             * @private
             */
            var zeroPadData = function(chart, data, minDate, maxDate) {
                $scope.dateStringToDataIndex = {};

                var i = 0;
                var start = zeroOutDate(minDate);
                var end = zeroOutDate(maxDate);

                var numBuckets;
                var millis;

                if($scope.options.granularity === DAY) {
                    millis = (1000 * 60 * 60 * 24);
                    numBuckets = Math.ceil(Math.abs(end - start) / millis) + 1;
                } else {
                    millis = (1000 * 60 * 60);
                    numBuckets = Math.ceil(Math.abs(end - start) / millis) + 1;
                }

                var startTime = start.getTime();

                var resultData = {};

                var series = chart.attrYMapping;
                var aggType;
                if(chart.aggregation === 'count') {
                    series = 'Count';
                    aggType = 'count';
                }
                if(chart.aggregation === 'average') {
                    series = 'Average ' + chart.attrYMapping;
                    aggType = 'average';
                }
                if(chart.aggregation === 'sum') {
                    series = 'Sum ' + chart.attrYMapping;
                    aggType = 'sum';
                }
                if(chart.aggregation === 'min') {
                    series = 'Minimum ' + chart.attrYMapping;
                    aggType = 'min';
                }
                if(chart.aggregation === 'max') {
                    series = 'Maximum ' + chart.attrYMapping;
                    aggType = 'max';
                }

                // Add the visualization id to the beginning of the series name to decipher which chart
                // the data is coming from
                series = chart.id + ":" + series;

                // Scrape data for unique series
                for(i = 0; i < data.length; i++) {
                    if(datasetService.isFieldValid(chart.categoryField)) {
                        series = chart.id + ":" + (data[i][chart.categoryMapping] !== '' ? data[i][chart.categoryMapping] : 'Unknown');
                    }

                    if(!resultData[series]) {
                        resultData[series] = {
                            series: series,
                            count: 0,
                            total: 0,
                            min: undefined,
                            max: undefined,
                            aggregation: aggType,
                            data: []
                        };
                    }
                }

                // Initialize our data buckets.
                for(i = 0; i < numBuckets; i++) {
                    var bucketGraphDate = new Date(startTime + (millis * i));
                    for(series in resultData) {
                        if(Object.prototype.hasOwnProperty.call(resultData, series)) {
                            resultData[series].data.push({
                                date: bucketGraphDate,
                                value: undefined
                            });
                        }
                    }
                }

                // Populate series with data
                var indexDate;
                for(i = 0; i < data.length; i++) {
                    indexDate = new Date(data[i].date);
                    var dataIndex = Math.floor(Math.abs(indexDate - start) / millis);

                    if(dataIndex >= 0 && dataIndex + 1 <= numBuckets) {
                        if(datasetService.isFieldValid(chart.categoryField)) {
                            series = data[i][chart.categoryMapping] !== '' ? data[i][chart.categoryMapping] : 'Unknown';
                            series = chart.id + ":" + series;
                        }

                        data[i].value = _.isNumber(data[i].value) ? data[i].value : undefined;

                        if(_.isUndefined(resultData[series].data[dataIndex].value)) {
                            resultData[series].data[dataIndex].value = data[i].value;
                        } else if(!_.isUndefined(data[i].value)) {
                            resultData[series].data[dataIndex].value += data[i].value;
                        }

                        // Only calculate total, min, and max if the value is defined
                        if(!_.isUndefined(data[i].value)) {
                            resultData[series].total += data[i].value;
                            resultData[series].min = _.isUndefined(resultData[series].min) ? data[i].value : Math.min(resultData[series].min, data[i].value);
                            resultData[series].max = _.isUndefined(resultData[series].max) ? data[i].value : Math.max(resultData[series].max, data[i].value);
                        }

                        // Save the mapping from date string to data index so we can find the data index using the brush extent while calculating aggregations for brushed line charts.
                        $scope.dateStringToDataIndex[indexDate.toDateString()] = Math.floor(Math.abs(indexDate - start) / millis);
                    }
                }

                return resultData;
            };

            /**
             * Tells other visualizations the given dates are highlighted.
             * @param {Date} startDate
             * @param {Date} endDate
             * @method onHover
             * @private
             */
            var onHover = function(startDate, endDate) {
                $scope.$apply(function() {
                    $scope.messenger.publish("date_selected", {
                        start: startDate,
                        end: endDate
                    });
                });
            };

            /**
             * Returns the chart name associated with the given color mapping.
             * @param {Object} colorMapping
             * @return {String}
             * @method getTitleFromMapping
             */
            $scope.getTitleFromMapping = function(colorMapping) {
                return _.result(
                    _.findWhere($scope.options.charts, {
                        id: colorMapping.series.split(":")[0]
                    }),
                    "name"
                );
            };

            /**
             * Creates and draws a new line chart with the given data and color mappings.
             * @param {Array} data
             * @param {Object} colorMappings
             * @method drawLineChart
             */
            var drawLineChart = function(data, colorMappings) {
                var opts = {
                    x: "date",
                    y: "value",
                    hoverListener: onHover,
                    responsive: true,
                    granularity: $scope.options.granularity,
                    seriesToColors: colorMappings
                };

                // Destroy the old chart and rebuild it.
                if($scope.chart) {
                    $scope.chart.destroy();
                }
                $scope.chart = new charts.LineChart($element[0], '.linechart', opts);
                _.each(data, function(datum) {
                    if(datum.hidden) {
                        $scope.chart.addHiddenSeries(datum.series);
                    }
                    delete datum.hidden;
                });
                $scope.chart.setBrushHandler(function(data) {
                    $scope.$apply(function() {
                        updateBrush(data);
                    });
                });
                $scope.chart.draw(data);
                $scope.chart.showTrendlines(($scope.options.trendlines === 'show') ? true : false);
                $scope.colorMappings = $scope.chart.getColorMappings();
                $scope.legend.charts = {};
                _.each($scope.colorMappings, function(mappingArray, id) {
                    $scope.legend.charts[id] = {
                        display: true
                    };
                });
                $scope.noData = !data || !data.length;
                $scope.loadingData = false;

                // Use a timeout so we resize the chart after the legend renders (since the legend size affects the chart size).
                $timeout(function() {
                    updateChartSize();
                }, 100);

                XDATA.userALE.log({
                    activity: "alter",
                    action: "render",
                    elementId: "linechart",
                    elementType: "canvas",
                    elementSub: "linechart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["render", "linechart"]
                });
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
                if($scope.options.granularity === DAY) {
                    zeroed.setUTCHours(0);
                }
                return zeroed;
            };

            /**
             * Uses the given function to calculate the aggregated value of the given data between the start and end extent of the brush.
             * @param {Array} data
             * @param {Function} calculationFunction
             * @method calculateBrushedAggregationValue
             * @return {Number}
             */
            var calculateBrushedAggregationValue = function(data, calculationFunction) {
                if($scope.brushExtent.length < 2) {
                    return 0;
                }

                var start = $scope.dateStringToDataIndex[$scope.brushExtent[0].toDateString()] || 0;
                var end = $scope.dateStringToDataIndex[$scope.brushExtent[1].toDateString()] || data.length;
                var value = 0;
                for(var i = start; i < end; ++i) {
                    if(!_.isUndefined(data[i].value)) {
                        value = calculationFunction(data[i].value, value);
                    }
                }
                return value;
            };

            /**
             * Returns the text to display in the legend containing the aggregated value for the given object.
             * @param {Object} colorMappingObject
             * @method getLegendItemAggregationText
             * @return {String}
             */
            $scope.getLegendItemAggregationText = function(colorMappingObject) {
                var total = 0;
                var text = colorMappingObject.series.split(":").slice(1).join(":");
                if(($scope.options.aggregation === "count" || $scope.options.aggregation === "sum") && !_.isUndefined(colorMappingObject.total)) {
                    total = colorMappingObject.total;
                    if($scope.brushExtent.length >= 2) {
                        total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                            return indexValue + aggregationValue;
                        });
                    }
                    text += " (" + $filter('number')(total) + ")";
                }
                if($scope.options.aggregation === "min" && !_.isUndefined(colorMappingObject.min)) {
                    var min = colorMappingObject.min;
                    if($scope.brushExtent.length >= 2) {
                        total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                            return Math.min(indexValue, aggregationValue);
                        });
                    }
                    text += " (" + min + ")";
                }
                if($scope.options.aggregation === "max" && !_.isUndefined(colorMappingObject.max)) {
                    var max = colorMappingObject.max;
                    if($scope.brushExtent.length >= 2) {
                        total = calculateBrushedAggregationValue(colorMappingObject.data, function(indexValue, aggregationValue) {
                            return Math.max(indexValue, aggregationValue);
                        });
                    }
                    text += " (" + max + ")";
                }
                return text;
            };

            /**
             * Updates the brush extent in this visualization's chart and the dataset service.
             * @param {Array} brushExtent
             * @param {Boolean} ignoreGlobalBrushExtent
             * @method updateBrush
             * @private
             */
            var updateBrush = function(brushExtent, ignoreGlobalBrushExtent) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "linechart-range",
                    elementType: "canvas",
                    elementSub: "date-range",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "date-range"]
                });

                if(!brushExtent || brushExtent.length < 2 || brushExtent[0].getTime() === brushExtent[1].getTime()) {
                    $scope.removeBrush();
                    return;
                }
                renderBrushExtent(brushExtent);
                var charts = [];
                _.each($scope.options.charts, function(chart) {
                    if(chart.active) {
                        charts.push(chart);
                    }
                });
                if(charts.length) {
                    updateBrushRecursively(charts, ignoreGlobalBrushExtent);
                } else {
                    updateLineChartForBrushExtent();
                }
            };

            /**
             * Recursively replaces the filters associated with the given charts.
             * @param {Array} charts
             * @param {Boolean} ignoreGlobalBrushExtent
             * @method updateBrushRecursively
             * @private
             */
            var updateBrushRecursively = function(charts, ignoreGlobalBrushExtent) {
                var chart = charts.shift();
                var origBrushExtent = angular.copy($scope.brushExtent);
                var globalBrushExtent = datasetService.getDateBrushExtent(chart.database, chart.table, chart.attrXMapping);
                // We're comparing the date strings here because comparing the date objects doesn't seem to work.
                if(globalBrushExtent.length && $scope.brushExtent[0].toDateString() === globalBrushExtent[0].toDateString() &&
                    $scope.brushExtent[1].toDateString() === globalBrushExtent[1].toDateString() && !ignoreGlobalBrushExtent) {
                    if(charts.length) {
                        updateBrushRecursively(charts, ignoreGlobalBrushExtent);
                    } else {
                        updateLineChartForBrushExtent();
                    }
                    return;
                }

                var filterKeys = createFilterKeyObj(chart);
                var relations = datasetService.getRelations(chart.database, chart.table, [chart.attrXMapping]);

                var filterNameObj = "LineChart - " +  getDateString($scope.brushExtent[0], false) + " to " + getDateString($scope.brushExtent[1], false);

                filterService.replaceFilters($scope.messenger, relations, filterKeys, createFilterClauseForDate, filterNameObj, function() {
                    datasetService.setDateBrushExtentForRelations(relations, $scope.brushExtent);
                    // Sometimes setDateBrushExtentForRelations() changes the brushExtent so we want to reset it back to
                    // the original if that happens.
                    if(origBrushExtent !== $scope.brushExtent) {
                        $scope.brushExtent = origBrushExtent;
                    }

                    if(charts.length) {
                        updateBrushRecursively(charts, ignoreGlobalBrushExtent);
                    } else {
                        updateLineChartForBrushExtent();
                    }
                });
            };

            /**
             * Creates a filter key object from the filter keys associated with the given chart.
             * @param {Object} chart
             * @return {Object}
             * @method createFilterKeyObj
             * @private
             */
            var createFilterKeyObj = function(chart) {
                var filterKey = {};
                filterKey[chart.database] = {};
                filterKey[chart.database][chart.table] = $scope.filterKeys[chart.database][chart.table][chart.attrXMapping].filterKey;

                return _.merge(filterKey, $scope.filterKeys[chart.database][chart.table][chart.attrXMapping].relations);
            };

            /**
             * Returns the string version of the given date. Set includeTime to true if
             * the returning string should include the minutes.
             * @param {Date} date
             * @param {Boolean} includeTime
             * @return {String}
             * @method getDateString
             * @private
             */
            var getDateString = function(date, includeTime) {
                var dateString = (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
                if(includeTime) {
                    dateString = dateString + " " + date.getHours() + ":" + (date.getMinutes() < 10 ? "0" : "") + date.getMinutes();
                }
                return dateString;
            };

            /**
             * Redraws all visible line charts using the data from the previous queries within the current brush extent.
             * @param {Boolean} reload
             * @method updateLineChartForBrushExtent
             * @private
             */
            var updateLineChartForBrushExtent = function(reload) {
                var allInactive = _.every($scope.options.charts, {
                    active: false
                });
                if(allInactive && $scope.brushExtent.length >= 2) {
                    renderBrushExtent([]);
                }

                if($scope.brushExtent.length >= 2) {
                    var dayMillis = (1000 * 60 * 60 * 24);
                    var diff = $scope.brushExtent[1] - $scope.brushExtent[0];

                    if($scope.options.granularity === DAY && (diff / dayMillis) <= 1) {
                        $scope.automaticHourSet = true;
                        $scope.options.granularity = HOUR;
                        return;
                    } else if($scope.options.granularity === HOUR && (diff / dayMillis) > 1 && $scope.automaticHourSet) {
                        $scope.automaticHourSet = false;
                        $scope.options.granularity = DAY;
                        return;
                    }
                } else if($scope.automaticHourSet) {
                    $scope.automaticHourSet = false;
                    $scope.options.granularity = DAY;
                    return;
                }

                // If the user changed a field or filter while the chart contained data filtered by date then the chart will need to query for new data since the saved data from
                // the previous query will be stale.  Otherwise use the data from the previous query and the current brush extent to redraw the chart.
                if($scope.queryOnChangeBrush) {
                    $scope.queryOnChangeBrush = false;
                    refreshCharts();
                    return;
                }

                var dateRange = getDateRange();
                var fullDateRange = getDateRange(true);

                // If the brush extent does not overlap with the date range of the data, just draw an empty chart.
                if(!_.keys($scope.data).length || $scope.brushExtent[1] < fullDateRange.minDate ||
                    $scope.brushExtent[0] > fullDateRange.maxDate) {
                    drawLineChart({
                        data: []
                    }, {});
                    return;
                }

                var seriesData = [];
                var colorMappings = {};

                // Get all series data and color mappings for each chart
                _.each($scope.options.charts, function(chart) {
                    var updatedData = $scope.data[chart.id];

                    // Get only the data within the brush extent if the chart is active
                    if(chart.active && $scope.brushExtent.length >= 2) {
                        var indices = getIndicesForData($scope.data[chart.id], $scope.brushExtent[0], $scope.brushExtent[1]);
                        updatedData = $scope.data[chart.id].slice(indices.startIndex, indices.endIndex);
                    }
                    seriesData = seriesData.concat(createLineSeriesData(chart, updatedData, dateRange.minDate, dateRange.maxDate));

                    // Get any color mappings set in the configuration file
                    if(datasetService.isFieldValid(chart.categoryField)) {
                        var colors = datasetService.getActiveDatasetColorMaps(chart.database, chart.table,
                            chart.categoryMapping);
                        colors = _.transform(colors, function(result, value, key) {
                            result[chart.id + ":" + key] = value;
                        });
                        colorMappings = _.merge(colorMappings, colors);
                    }
                });

                if(reload) {
                    $scope.$apply(function() {
                        drawLineChart(seriesData, colorMappings);
                    });
                } else {
                    drawLineChart(seriesData, colorMappings);
                }
            };

            /*
             * Finds the indices in the data that give the first and last data that will be shown
             * on the graph using any brush extents set.
             * @param {Object} data
             * @return {Object} Returns an object containing startIndex and endIndex.
             * @method getIndicesForData
             * @private
             */
            var getIndicesForData = function(data, minDate, maxDate) {
                var startIndex = 0;
                var endIndex = data.length;

                data.forEach(function(datum, index) {
                    var date = zeroOutDate(new Date(datum.date));
                    if(date < minDate) {
                        startIndex = index + 1;
                    }
                    if(date < maxDate) {
                        endIndex = index + 1;
                    }
                });

                return {
                    startIndex: startIndex,
                    endIndex: endIndex
                };
            };

            /*
             * Finds the min and max dates within the brush extent for all charts.
             * @param {Boolean} ignoreBrushExtent Set to true to find the min and max dates disregarding
             * any brush extents.
             * @return {Object} Returns an object contain minDate and maxDate.
             * @method getDateRange
             * @private
             */
            var getDateRange = function(ignoreBrushExtent) {
                var minDate;
                var maxDate;

                if($scope.brushExtent.length < 2 || ignoreBrushExtent) {
                    _.each($scope.options.charts, function(chart) {
                        var min;
                        var max;

                        var range = d3.extent($scope.data[chart.id], function(d) {
                            return new Date(d.date);
                        });
                        min = range[0];
                        max = range[1];

                        if(min < minDate || !minDate) {
                            minDate = min;
                        }
                        if(max > maxDate || !maxDate) {
                            maxDate = max;
                        }
                    });
                } else {
                    minDate = $scope.brushExtent[0];
                    maxDate = $scope.brushExtent[1];
                }

                return {
                    minDate: minDate || new Date(),
                    maxDate: maxDate || new Date()
                };
            };

            /**
             * Removes the brush extent from this visualization and the dataset service.
             * @method removeBrush
             */
            $scope.removeBrush = function() {
                XDATA.userALE.log({
                    activity: "deselect",
                    action: "click",
                    elementId: "linechart-clear-range",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "date-range"]
                });

                renderBrushExtent([]);
                removeBrushRecursively(angular.copy($scope.options.charts), true);
            };

            /**
             * Recursively removes the filters associated with the given charts.
             * @param {Array} charts
             * @method removeBrushRecursively
             * @private
             */
            var removeBrushRecursively = function(charts, queryWhenDone) {
                var chart = charts.shift();
                var filterKeys = createFilterKeyObj(chart);
                var relations = datasetService.getRelations(chart.database, chart.table, [chart.attrXMapping]);
                filterService.removeFilters($scope.messenger, filterKeys, function() {
                    datasetService.removeDateBrushExtentForRelations(relations);

                    if(charts.length) {
                        removeBrushRecursively(charts, queryWhenDone);
                    } else if(queryWhenDone) {
                        refreshCharts();
                    }
                });
            };

            /**
             * Creates and returns a filter on the given date field using the brush extent set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} dateFieldName The name of the date field on which to filter
             * @method createFilterClauseForDate
             * @return {Object} A neon.query.Filter object or undefined if a filter clause could not be created
             */
            var createFilterClauseForDate = function(databaseAndTableName, dateFieldName) {
                if($scope.brushExtent.length < 2) {
                    return undefined;
                }

                var startFilterClause = neon.query.where(dateFieldName, ">=", $scope.brushExtent[0]);
                var endFilterClause = neon.query.where(dateFieldName, "<", $scope.brushExtent[1]);
                return neon.query.and.apply(this, [startFilterClause, endFilterClause]);
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeLinechartExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "linechart-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "linechart", "export"]
                });

                var finalObject = {
                    name: "Line_Chart",
                    data: []
                };

                _.each($scope.options.charts, function(chart) {
                    if(chart.visible) {
                        var query = buildQuery(chart);
                        query.limitClause = exportService.getLimitClause();
                        query.ignoreFilters_ = exportService.getIgnoreFilters();
                        query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();

                        var tempObject = {
                            query: query,
                            name: "linechart-" + chart.name + "-" + $scope.exportID,
                            fields: [],
                            ignoreFilters: query.ignoreFilters_,
                            selectionOnly: query.selectionOnly_,
                            ignoredFilterIds: query.ignoredFilterIds_,
                            type: "query"
                        };
                        tempObject.fields.push({
                            query: "year",
                            pretty: "Year"
                        });
                        tempObject.fields.push({
                            query: "month",
                            pretty: "Month"
                        });
                        tempObject.fields.push({
                            query: "day",
                            pretty: "Day"
                        });
                        if($scope.options.granularity === "hour") {
                            tempObject.fields.push({
                                query: "hour",
                                pretty: "Hour"
                            });
                        }

                        if(chart.aggregation === "count") {
                            tempObject.fields.push({
                                query: "value",
                                pretty: "Count"
                            });
                        } else if(chart.aggregation === "sum") {
                            tempObject.fields.push({
                                query: "value",
                                pretty: "Sum of " + query.aggregates[0].field
                            });
                        } else if(chart.aggregation === "average") {
                            tempObject.fields.push({
                                query: "value",
                                pretty: "Average of " + query.aggregates[0].field
                            });
                        } else if(chart.aggregation === "min") {
                            tempObject.fields.push({
                                query: "value",
                                pretty: "Min of " + query.aggregates[0].field
                            });
                        } else if(chart.aggregation === "max") {
                            tempObject.fields.push({
                                query: "value",
                                pretty: "Max of " + query.aggregates[0].field
                            });
                        }
                        tempObject.fields.push({
                            query: query.aggregates[1].name,
                            pretty: query.aggregates[1].field
                        });

                        finalObject.data.push(tempObject);
                    }
                });

                return finalObject;
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                displayActiveDataset();
            });
        }
    };
}]);

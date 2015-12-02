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
    'ExportService', 'LinksPopupService', 'LineChartService', '$timeout', '$filter',
function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, lineChartService, $timeout, $filter) {
    var COUNT_FIELD_NAME = 'value';

    return {
        templateUrl: 'partials/directives/linechart.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindDateField: '=',
            bindYAxisField: '=',
            bindCategoryField: '=',
            bindAggregationField: '=',
            bindTable: '=',
            bindDatabase: '=',
            bindGranularity: '=',
            colorMappings: '&',
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
                if($scope.colorMappings.length >= $scope.seriesLimit) {
                    return "Top " + $scope.seriesLimit;
                }
                return "";
            };
            $scope.showOptionsMenuButtonText = function() {
                return $scope.noData || $scope.colorMappings.length >= $scope.seriesLimit;
            };

            $scope.databases = [];
            $scope.tables = [];
            $scope.totalType = 'count';
            $scope.fields = [];
            $scope.visualizationFilterKeys = {};
            $scope.filterKeys = {};
            $scope.chart = undefined;
            $scope.brushExtent = [];
            $scope.colorMappings = [];
            $scope.dateStringToDataIndex = {};
            $scope.seriesLimit = 10;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.noData = true;
            $scope.data = [];
            $scope.queryOnChangeBrush = false;
            $scope.automaticHourSet = false;
            $scope.outstandingQuery = undefined;
            $scope.linksPopupButtonIsDisabled = true;
            $scope.title = $scope.bindTitle ? $scope.bindTitle : '';

            $scope.options = {
                database: {},
                table: {},
                attrX: {},
                attrY: {},
                categoryField: {},
                aggregation: "count",
                granularity: $scope.bindGranularity ? $scope.bindGranularity.toLowerCase() : DAY,
                trendlines: 'hide',
                overlays: [],
                selectedChart: {},
                allCharts: [],
                chartsAddedTo: []
            };

            var updateChartSize = function() {
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true);
                $element.find(".title").css("maxWidth", titleWidth - 20);

                if($scope.chart) {
                    var headerHeight = 0;
                    $element.find(".header-container").each(function() {
                        headerHeight += $(this).outerHeight(true);
                    });
                    $element.find('.linechart').height($element.height() - headerHeight);

                    // Redraw the line chart.
                    $scope.chart.draw();
                    $scope.chart.showTrendlines(($scope.options.trendlines === 'show') ? true : false);
                }
            };

            var initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForData();
                });
                $scope.messenger.subscribe(datasetService.DATE_CHANGED_CHANNEL, onDateChanged);
                $scope.messenger.subscribe("date_selected", onDateSelected);

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        $scope.removeBrush();
                    }
                });

                $scope.messenger.subscribe(lineChartService.ADD_OVERLAY_CHANNEL, onAddOverlay);

                $scope.messenger.subscribe(lineChartService.REFRESH_OVERLAYS_CHANNEL, onRefreshOverlays);

                $scope.messenger.subscribe(lineChartService.REMOVE_OVERLAY_CHANNEL, onRemoveOverlay);

                $scope.exportID = exportService.register($scope.makeLinechartExportObject);

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
                    lineChartService.removeChart($scope.visualizationId);
                    $element.off("resize", updateChartSize);
                    $scope.messenger.removeEvents();
                    exportService.unregister($scope.exportID);
                    if($scope.brushExtent.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });

                // This resizes the chart when the div changes.  This rely's on jquery's resize plugin to fire
                // on the associated element and not just the window.
                $element.resize(updateChartSize);

                // The size of the legend will change whenever the filter notification is added or removed so the chart may need to be resized and redrawn.
                $element.find(".legend").resize(updateChartSize);

                $scope.$watch('options.attrX', function(newValue) {
                    onFieldChange('attrX', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        resetAndQueryForData();
                        $scope.queryOnChangeBrush = $scope.queryOnChangeBrush || ($scope.brushExtent.length > 0);
                    }
                });
                $scope.$watch('options.attrY', function(newValue) {
                    onFieldChange('attrY', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        resetAndQueryForData();
                        $scope.queryOnChangeBrush = $scope.queryOnChangeBrush || ($scope.brushExtent.length > 0);
                        updateTitle();
                    } else {
                        updateTitle();
                    }
                });
                $scope.$watch('options.categoryField', function(newValue) {
                    onFieldChange('categoryField', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        resetAndQueryForData();
                        $scope.queryOnChangeBrush = $scope.queryOnChangeBrush || ($scope.brushExtent.length > 0);
                    }
                });
                $scope.$watch('options.aggregation', function(newValue) {
                    onFieldChange('aggregation', newValue);
                    if(!$scope.loadingData && $scope.options.database.name && $scope.options.table.name) {
                        resetAndQueryForData();
                        $scope.queryOnChangeBrush = $scope.queryOnChangeBrush || ($scope.brushExtent.length > 0);
                    }
                });
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
                        queryForData();
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
                    elementId: "linechart",
                    elementType: "combobox",
                    elementSub: "linechart-" + field,
                    elementGroup: "chart_group",
                    source: source,
                    tags: ["options", "linechart", newValue]
                });
            };

            /**
             * Returns whether the added or removed filter in the given message is a date filter on this linechart's x-axis/date field.
             * @param {Object} message
             * @method isDateFiltersChangedMessage
             * @return {Boolean}
             */
            var isDateFiltersChangedMessage = function(message) {
                var whereClauses;
                if(message.addedFilter.whereClause) {
                    whereClauses = message.addedFilter.whereClause.whereClauses;
                } else if(message.removedFilter.whereClause) {
                    whereClauses = message.removedFilter.whereClause.whereClauses;
                }
                if(whereClauses && whereClauses.length === 2 && whereClauses[0].lhs === $scope.options.attrX.columnName && whereClauses[1].lhs === $scope.options.attrX.columnName) {
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
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    // If the filter changed event was triggered by a change in the global date filter, ignore the filter changed event.
                    // We don't need to re-query and we'll update the brush extent extent in response to the date changed event.
                    if(isDateFiltersChangedMessage(message)) {
                        return;
                    }

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

                    queryForData();
                    $scope.queryOnChangeBrush = $scope.queryOnChangeBrush || ($scope.brushExtent.length > 0);
                }
            };

            /**
             * Event handler for date changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon date changed message.
             * @method onDateChanged
             * @private
             */
            var onDateChanged = function(message) {
                if($scope.options.database.name === message.databaseName && $scope.options.table.name === message.tableName) {
                    if(datasetService.isFieldValid($scope.options.attrX) && message.fieldNames.indexOf($scope.options.attrX.columnName) >= 0 && $scope.brushExtent !== message.brushExtent) {
                        renderBrushExtent(message.brushExtent);
                        updateLineChartForBrushExtent();
                    }
                }
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
             * Event handler for add overlay events issued over Neon's messaging channels.
             * @param {Object} message A Neon add overlay message.
             * @method onAddOverlay
             * @private
             */
            var onAddOverlay = function(msg) {
                if(msg.overlayTargetId === $scope.visualizationId) {
                    var index = _.findIndex($scope.options.overlays, {
                        id: msg.overlaySourceId
                    });

                    if(index === -1) {
                        var overlayObj = lineChartService.getChart(msg.overlaySourceId);
                        overlayObj.data = msg.data;
                        $scope.options.overlays.push(overlayObj);
                    } else {
                        $scope.options.overlays[index].data = msg.data;
                    }

                    var indices = getIndicesForData();
                    createChart(indices.startIndex, indices.endIndex);
                }
            };

            /**
             * Event handler for refresh overlays events issued over Neon's messaging channels.
             * @param {Object} message A Neon refresh overlays message.
             * @method onRefreshOverlays
             * @private
             */
            var onRefreshOverlays = function(msg) {
                var msgIndex = _.findIndex(msg.overlayTargetsData, {
                    id: $scope.visualizationId
                });

                if(msgIndex >= 0) {
                    var optionsIndex = _.findIndex($scope.options.overlays, {
                        id: msg.overlaySourceId
                    });

                    $scope.options.overlays[optionsIndex].data =  msg.overlayTargetsData[msgIndex].data;
                }


                /* Update the chart once all overlays, with the same database/table as the current visualization,
                   have the same brush extent */

                var allOverlaysUpdated = _.every($scope.options.overlays, {
                    data: {
                        brushExtent: $scope.brushExtent
                    }
                });

                var filteredOverlays = _.find($scope.options.overlays, {
                    data: {
                        database: $scope.options.database.name,
                        table: $scope.options.table.name
                    }
                });

                if(!filteredOverlays) {
                    allOverlaysUpdated = true;
                }

                if(allOverlaysUpdated) {
                    var indices = getIndicesForData();
                    createChart(indices.startIndex, indices.endIndex);
                }
            };

            /**
             * Event handler for remove overlay events issued over Neon's messaging channels.
             * @param {Object} message A Neon remove overlay message.
             * @method onRemoveOverlay
             * @private
             */
            var onRemoveOverlay = function(msg) {
                if(msg.overlaySourceId === $scope.visualizationId || msg.overlaySourceId === msg.overlayTargetId) {
                    var index = _.findIndex($scope.options.chartsAddedTo, {
                        id: msg.overlayTargetId
                    });

                    if(index >= 0) {
                        $scope.options.chartsAddedTo.splice(index, 1);
                    }
                }

                if(msg.overlayTargetId === $scope.visualizationId || msg.overlaySourceId === msg.overlayTargetId) {
                    var index = _.findIndex($scope.options.overlays, {
                        id: msg.overlaySourceId
                    });

                    if(index >= 0) {
                        $scope.options.overlays.splice(index, 1);

                        var indices = getIndicesForData();
                        createChart(indices.startIndex, indices.endIndex);
                    }
                }
            };

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

            $scope.getDateKeyForLinksPopupButton = function() {
                return $scope.brushExtent.length >= 2 ? linksPopupService.generateDateRangeKey($scope.brushExtent[0].toUTCString(), $scope.brushExtent[1].toUTCString()) : "";
            };

            var queryForData = function() {
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

                if(!connection || !$scope.options.attrX.columnName || (!$scope.options.attrY.columnName && $scope.options.aggregation !== "count")) {
                    drawLineChart();
                    return;
                }

                var query = buildQuery();

                if($scope.outstandingQuery) {
                    $scope.outstandingQuery.abort();
                }

                $scope.outstandingQuery = connection.executeQuery(query);
                $scope.outstandingQuery.always(function() {
                    $scope.outstandingQuery = undefined;
                });
                $scope.outstandingQuery.done(handleQuerySuccess);
                $scope.outstandingQuery.fail(handleQueryFailure);
            };

            /**
             * Builds a query for the line chart and returns it.
             * @method buildQuery
             * @private
             * @return A ready-to-be-sent query for the line chart.
             */
            var buildQuery = function() {
                var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, $scope.options.attrX.columnName, 'year');
                var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, $scope.options.attrX.columnName, 'month');
                var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, $scope.options.attrX.columnName, 'day');
                var hourGroupClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, $scope.options.attrX.columnName, 'hour');

                var groupByClause = [yearGroupClause, monthGroupClause, dayGroupClause, hourGroupClause];

                if(datasetService.isFieldValid($scope.options.categoryField)) {
                    groupByClause.push($scope.options.categoryField.columnName);
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .where(neon.query.and(
                        neon.query.where($scope.options.attrX.columnName, '>=', new Date("1970-01-01T00:00:00.000Z")),
                        neon.query.where($scope.options.attrX.columnName, '<=', new Date("2025-01-01T00:00:00.000Z"))
                    ));

                query.groupBy.apply(query, groupByClause);

                if($scope.options.aggregation === "count") {
                    query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "sum") {
                    query.aggregate(neon.query.SUM, $scope.options.attrY.columnName, COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "average") {
                    query.aggregate(neon.query.AVG, $scope.options.attrY.columnName, COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "min") {
                    query.aggregate(neon.query.MIN, $scope.options.attrY.columnName, COUNT_FIELD_NAME);
                }
                if($scope.options.aggregation === "max") {
                    query.aggregate(neon.query.MAX, $scope.options.attrY.columnName, COUNT_FIELD_NAME);
                }

                query.aggregate(neon.query.MIN, $scope.options.attrX.columnName, 'date')
                    .sortBy('date', neon.query.ASCENDING);

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
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                        }
                    }
                }

                // Create the filter keys for this visualization for each database/table pair in the dataset.
                $scope.visualizationFilterKeys = filterService.createFilterKeys("linechart", datasetService.getDatabaseAndTableNames());
                // The filter keys will be set to the global date filter key for each database/table pair when available and the visualization filter key otherwise.
                $scope.filterKeys = $scope.visualizationFilterKeys;
                $scope.updateTables();
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, [neonMappings.DATE, neonMappings.Y_AXIS]) || $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }
                $scope.updateFields();
                updateTitle();
                $scope.refreshChartOptions();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);
                $scope.options.aggregation = $scope.bindAggregationField || "count";

                var attrX = $scope.bindDateField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.DATE) || "";
                $scope.options.attrX = _.find($scope.fields, function(field) {
                    return field.columnName === attrX;
                }) || datasetService.createBlankField();
                var attrY = $scope.bindYAxisField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.Y_AXIS) || "";
                $scope.options.attrY = _.find($scope.fields, function(field) {
                    return field.columnName === attrY;
                }) || datasetService.createBlankField();
                var categoryField = $scope.bindCategoryField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.LINE_GROUP) || "";
                $scope.options.categoryField = _.find($scope.fields, function(field) {
                    return field.columnName === categoryField;
                }) || datasetService.createBlankField();

                $scope.queryOnChangeBrush = false;
                resetAndQueryForData();
            };

            /*
             * Removes an overlay from the chart.
             * @param {Object} chart The overlay chart to remove
             * @method removeOverlay
             */
            $scope.removeOverlay = function(chart) {
                var index = _.findIndex($scope.options.overlays, {
                    id: chart.id
                });
                if(index >= 0) {
                    lineChartService.removeOverlay(chart.id, $scope.visualizationId);
                }
            };

            /*
             * Adds this chart as an overlay to the selected chart.
             * @method addOverlayTo
             */
            $scope.addOverlayTo = function() {
                if($scope.options.selectedChart && $scope.options.selectedChart.id !== $scope.visualizationId) {
                    var index = _.findIndex($scope.options.chartsAddedTo, {
                        id: $scope.options.selectedChart.id
                    });
                    if(index === -1) {
                        var lineData = {
                            attrX: $scope.options.attrX,
                            attrY: $scope.options.attrY,
                            categoryField: $scope.options.categoryField,
                            aggregation: $scope.options.aggregation,
                            brushExtent: $scope.brushExtent,
                            data: $scope.data,
                            database: $scope.options.database.name,
                            table: $scope.options.table.name
                        };
                        $scope.options.chartsAddedTo.push($scope.options.selectedChart);
                        lineChartService.addOverlay($scope.visualizationId, $scope.options.selectedChart.id, lineData);
                    }
                }
                $scope.options.selectedChart = {};
            };

            /*
             * Retrieves the list of charts available.
             * @method refreshChartOptions
             */
            $scope.refreshChartOptions = function() {
                $scope.options.allCharts = lineChartService.getAllCharts();
            };

            /*
             * Removes this chart from another chart that it has added as an overlay.
             * @param {Object} chart The chart that has this chart as an overlay.
             * @method removeOverlayFrom
             */
            $scope.removeOverlayFrom = function(chart) {
                var index = _.findIndex($scope.options.chartsAddedTo, {
                    id: chart.id
                });
                if(index >= 0) {
                    lineChartService.removeOverlay($scope.visualizationId, chart.id);
                }
            };

            /*
             * Refreshes the overlay data to the given chart.
             * @param {Object} chart The chart that has this chart as an overlay.
             * @method refreshOverlay
             */
            $scope.refreshOverlay = function(chart) {
                var lineData = {
                    attrX: $scope.options.attrX,
                    attrY: $scope.options.attrY,
                    categoryField: $scope.options.categoryField,
                    aggregation: $scope.options.aggregation,
                    brushExtent: $scope.brushExtent,
                    data: $scope.data,
                    database: $scope.options.database.name,
                    table: $scope.options.table.name
                };
                lineChartService.addOverlay($scope.visualizationId, chart.id, lineData);
            };

            /*
             * Refresh overlay data to all charts it has been added to.
             * @method refreshAllOverlays
             */
            $scope.refreshAllOverlays = function() {
                var allChartsData = [];
                var lineData = {
                    attrX: $scope.options.attrX,
                    attrY: $scope.options.attrY,
                    categoryField: $scope.options.categoryField,
                    aggregation: $scope.options.aggregation,
                    brushExtent: $scope.brushExtent,
                    data: $scope.data,
                    database: $scope.options.database.name,
                    table: $scope.options.table.name
                };

                _.each($scope.options.chartsAddedTo, function(chart) {
                    allChartsData.push({
                        id: chart.id,
                        data: lineData
                    });
                });

                lineChartService.refreshOverlays($scope.visualizationId, allChartsData);
            };

            var updateTitle = function() {
                if($scope.bindTitle) {
                    $scope.title = $scope.bindTitle;
                } else {
                    $scope.title = $scope.options.table.prettyName +
                        ($scope.options.attrY.prettyName ? ' / ' + $scope.options.attrY.prettyName : '');
                }
                lineChartService.setChart($scope.visualizationId, $scope.title);
            };

            var resetAndQueryForData = function() {
                var globalBrushExtent = datasetService.isFieldValid($scope.options.attrX) ? datasetService.getDateBrushExtent($scope.options.database.name, $scope.options.table.name, $scope.options.attrX.columnName) : [];
                if($scope.brushExtent !== globalBrushExtent) {
                    renderBrushExtent(globalBrushExtent);
                } else if($scope.brushExtent.length) {
                    $scope.removeBrush();
                }

                // Get the date filter keys for the current database/table/field and change the current filter keys as appropriate.
                if(datasetService.isFieldValid($scope.options.attrX)) {
                    var dateFilterKeys = datasetService.getDateFilterKeys($scope.options.database.name, $scope.options.table.name, $scope.options.attrX.columnName);
                    $scope.filterKeys = filterService.getFilterKeysFromCollections(datasetService.getDatabaseAndTableNames(), $scope.visualizationFilterKeys, dateFilterKeys);
                } else {
                    $scope.filterKeys = $scope.visualizationFilterKeys;
                }

                queryForData();
            };

            /**
             * Compares the two given data points for a sort function based on the current aggregation type.
             * @param {Array} a
             * @param {Array} b
             * @method compareSeriesData
             * @return {Integer}
             */
            var compareSeriesData = function(a, b) {
                if($scope.options.aggregation === "count" || $scope.options.aggregation === "sum" || $scope.options.aggregation === "average") {
                    if(a.total < b.total) {
                        return 1;
                    }
                    if(a.total > b.total) {
                        return -1;
                    }
                }
                if($scope.options.aggregation === "min") {
                    if(a.min < b.min) {
                        return -1;
                    }
                    if(a.min > b.min) {
                        return 1;
                    }
                }
                if($scope.options.aggregation === "max") {
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
             * Draws a new line chart with the given results from the successful query.
             * @param {Object} results
             * @method handleQuerySuccess
             */
            var handleQuerySuccess = function(results) {
                $scope.data = results.data;

                updateChart(true);
            };

            /**
             * Creates the line series data using the given data, and the min and max dates.
             * @param {Object} data
             * @param {Date} minDate
             * @param {Date} maxDate
             * @method createLineSeriesData
             */
            var createLineSeriesData = function(data, minDate, maxDate) {
                var theData = data;
                var attrX = $scope.options.attrX;

                // If data is from an overlay, use the attributes inside data
                if(!_.isArray(data)) {
                    theData = data.data;
                    attrX = data.attrX;
                }

                //this prevents an error in older mongo caused when the xAxis value is invalid as it is not
                //included as a key in the response
                for(var i = 0; i < $scope.data.length; i++) {
                    if(typeof($scope.data[i][$scope.options.attrX.columnName]) === 'undefined') {
                        $scope.data[i][$scope.options.attrX.columnName] = null;
                    }
                }

                var seriesData = [];
                var zeroedData = zeroPadData(data, minDate, maxDate);

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
             * Draws a blank line chart and displays the error in the given response from the failed query.
             * @param {Object} response
             * @method handleQueryFailure
             */
            var handleQueryFailure = function(response) {
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

                    drawLineChart();

                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                }
            };

            $scope.toggleSeries = function(colorMapping) {
                var activity = $scope.chart.toggleSeries(colorMapping.series);
                colorMapping.hidden = (activity === "show") ? false : true;
                $scope.chart.showTrendlines(($scope.options.trendlines === 'show') ? true : false);
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

            var zeroPadData = function(data, minDate, maxDate) {
                var attrX = $scope.options.attrX;
                var attrY = $scope.options.attrY;
                var categoryField = $scope.options.categoryField;
                var aggregation = $scope.options.aggregation;
                var theData = data;
                var isOverlay = false;
                var id = $scope.visualizationId;

                // If data is from an overlay, use the attributes inside data
                if(!_.isArray(data)) {
                    attrX = data.attrX;
                    attrY = data.attrY;
                    categoryField = data.categoryField;
                    aggregation = data.aggregation;
                    theData = data.data;
                    isOverlay = true;
                    id = data.id;
                }

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

                var series = attrY.prettyName;
                if(aggregation === 'count') {
                    series = 'Count';
                }
                if(aggregation === 'average') {
                    series = 'Average ' + attrY.prettyName;
                }
                if(aggregation === 'sum') {
                    series = 'Sum ' + attrY.prettyName;
                }
                if(aggregation === 'min') {
                    series = 'Minimum ' + attrY.prettyName;
                }
                if(aggregation === 'max') {
                    series = 'Maximum ' + attrY.prettyName;
                }

                // Add the visualization id to the beginning of the series name to decipher which chart
                // the data is coming from
                series = id + ":" + series;

                // Scrape data for unique series
                for(i = 0; i < theData.length; i++) {
                    if(datasetService.isFieldValid(categoryField)) {
                        series = id + ":" + (theData[i][categoryField.columnName] !== '' ? theData[i][categoryField.columnName] : 'Unknown');
                    }

                    if(!resultData[series]) {
                        resultData[series] = {
                            series: series,
                            count: 0,
                            total: 0,
                            min: undefined,
                            max: undefined,
                            data: [],
                            overlay: isOverlay,
                            overlayTitle: (isOverlay ? data.title : undefined)
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
                for(i = 0; i < theData.length; i++) {
                    indexDate = new Date(theData[i].date);
                    var dataIndex = Math.floor(Math.abs(indexDate - start) / millis);

                    if(dataIndex >= 0 && dataIndex + 1 <= numBuckets) {
                        if(datasetService.isFieldValid(categoryField)) {
                            series = theData[i][categoryField.columnName] !== '' ? theData[i][categoryField.columnName] : 'Unknown';
                            series = id + ":" + series;
                        }

                        theData[i].value = _.isNumber(theData[i].value) ? theData[i].value : undefined;

                        if(_.isUndefined(resultData[series].data[dataIndex].value)) {
                            resultData[series].data[dataIndex].value = theData[i].value;
                        } else if(!_.isUndefined(theData[i].value)) {
                            resultData[series].data[dataIndex].value += theData[i].value;
                        }

                        // Only calculate total, min, and max if the value is defined
                        if(!_.isUndefined(theData[i].value)) {
                            resultData[series].total += theData[i].value;
                            resultData[series].min = _.isUndefined(resultData[series].min) ? theData[i].value : Math.min(resultData[series].min, theData[i].value);
                            resultData[series].max = _.isUndefined(resultData[series].max) ? theData[i].value : Math.max(resultData[series].max, theData[i].value);
                        }

                        // Save the mapping from date string to data index so we can find the data index using the brush extent while calculating aggregations for brushed line charts.
                        $scope.dateStringToDataIndex[indexDate.toDateString()] = Math.floor(Math.abs(indexDate - start) / millis);
                    }
                }

                return resultData;
            };

            var onHover = function(startDate, endDate) {
                $scope.$apply(function() {
                    $scope.messenger.publish("date_selected", {
                        start: startDate,
                        end: endDate
                    });
                });
            };

            $scope.getTitleFromMapping = function(colorMapping) {
                return colorMapping.overlayTitle;
            };

            /**
             * Creates and draws a new line chart with the given data, if any.
             * @param {Array} data
             * @param {Object} overlayColorMappings Color mappings for any overlays
             * @method drawLineChart
             */
            var drawLineChart = function(data, overlayColorMappings) {
                var opts = {
                    x: "date",
                    y: "value",
                    hoverListener: onHover,
                    responsive: true,
                    granularity: $scope.options.granularity,
                    seriesToColors: datasetService.isFieldValid($scope.options.categoryField) ? datasetService.getActiveDatasetColorMaps($scope.options.database.name, $scope.options.table.name, $scope.options.categoryField.columnName) : {}
                };

                opts.seriesToColors = _.merge(opts.seriesToColors, overlayColorMappings);

                // Destroy the old chart and rebuild it.
                if($scope.chart) {
                    $scope.chart.destroy();
                }
                $scope.chart = new charts.LineChart($element[0], '.linechart', opts);
                $scope.chart.setBrushHandler(function(data) {
                    $scope.$apply(function() {
                        updateBrush(data);
                    });
                });
                $scope.chart.draw(data);
                $scope.chart.showTrendlines(($scope.options.trendlines === 'show') ? true : false);
                $scope.colorMappings = $scope.chart.getColorMappings();
                $scope.noData = !data || !data.length || !data[0].data || !data[0].data.length;
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
                var text = colorMappingObject.series.split(":")[1];
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
             * @method updateBrush
             */
            var updateBrush = function(brushExtent) {
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

                var globalBrushExtent = datasetService.getDateBrushExtent($scope.options.database.name, $scope.options.table.name, $scope.options.attrX.columnName);
                // We're comparing the date strings here because comparing the date objects doesn't seem to work.
                if(globalBrushExtent.length && $scope.brushExtent[0].toDateString() === globalBrushExtent[0].toDateString() && $scope.brushExtent[1].toDateString() === globalBrushExtent[1].toDateString()) {
                    return;
                }

                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.attrX.columnName]);

                var filterNameObj = {
                    visName: "LineChart",
                    text: getDateString($scope.brushExtent[0], false) + " to " + getDateString($scope.brushExtent[1], false)
                };

                filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForDate, filterNameObj, function() {
                    updateLineChartForBrushExtent();
                    datasetService.setDateBrushExtentForRelations(relations, $scope.brushExtent);
                });
            };

            var getDateString = function(date, includeTime) {
                var dateString = (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
                if(includeTime) {
                    dateString = dateString + " " + date.getHours() + ":" + (date.getMinutes() < 10 ? "0" : "") + date.getMinutes();
                }
                return dateString;
            };

            /**
             * Redraws the line chart using the data from the previous query within the current brush extent.
             * @method updateLineChartForBrushExtent
             */
            var updateLineChartForBrushExtent = function() {
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
                    queryForData();
                    // We need to query for new data until there is no date filter and we query for the whole dataset.
                    $scope.queryOnChangeBrush = $scope.brushExtent.length >= 2 ? true : false;
                    return;
                }

                var dateRange = getDateRange(true);

                // If the brush extent does not overlap with the date range of the data, just draw an empty chart.
                if(!$scope.data.length || $scope.brushExtent[1] < dateRange.minDate || $scope.brushExtent[0] > dateRange.maxDate) {
                    drawLineChart({
                        data: []
                    });
                    return;
                }

                updateChart();
            };

            var updateChart = function(newData) {
                var indices = getIndicesForData();

                if($scope.options.chartsAddedTo.length) {
                    $scope.refreshAllOverlays();
                }


                /* Update the chart once all overlays, with the same database/table as the current visualization,
                   have the same brush extent */

                var allOverlaysUpdated = _.every($scope.options.overlays, {
                    data: {
                        brushExtent: $scope.brushExtent
                    }
                });

                var filteredOverlays = _.find($scope.options.overlays, {
                    data: {
                        database: $scope.options.database.name,
                        table: $scope.options.table.name
                    }
                });

                if(!filteredOverlays) {
                    allOverlaysUpdated = true;
                }

                if(!$scope.options.overlays.length || allOverlaysUpdated) {
                    createChart(indices.startIndex, indices.endIndex, newData);
                }
            };

            var createChart = function(startIndex, endIndex, newData) {
                var seriesData = [];
                var overlayColorMappings = {};

                if($scope.data.length) {
                    var dateRange = getDateRange();
                    seriesData = createLineSeriesData($scope.data.slice(startIndex, endIndex), dateRange.minDate, dateRange.maxDate);

                    _.each($scope.options.overlays, function(overlay) {
                        var indices = getIndicesForData(overlay.data);
                        var overlayData = overlay.data;
                        overlayData.data = overlayData.data.slice(indices.startIndex, indices.endIndex);
                        overlayData.id = overlay.id;
                        overlayData.title = overlay.name;
                        var overlaySeriesData = createLineSeriesData(overlayData, dateRange.minDate, dateRange.maxDate);
                        // Get any color mappings used by the overlay
                        if(datasetService.isFieldValid(overlay.data.categoryField)) {
                            var colors = datasetService.getActiveDatasetColorMaps(overlay.data.database, overlay.data.table, overlay.data.categoryField.columnName);
                            colors = _.transform(colors, function(result, value, key) {
                                result[overlay.id + ":" + key] = value;
                            });
                            overlayColorMappings = _.merge(overlayColorMappings, colors);
                        }
                        seriesData = seriesData.concat(overlaySeriesData);
                    });
                }

                if(newData) {
                    $scope.$apply(function() {
                        drawLineChart(seriesData, overlayColorMappings);
                    });
                } else {
                    drawLineChart(seriesData, overlayColorMappings);
                }
            };

            /*
             * Finds the indices in the data that give the first and last data that will be shown
             * on the graph using any brush extents set.
             * @param {Object} [data] An overlay object to use as the data. Optional.
             * @return {Object} Returns an object containing startIndex and endIndex.
             * @method getIndicesForData
             * @private
             */
            var getIndicesForData = function(data) {
                var startIndex = 0;
                var endIndex = $scope.data.length;
                if(data) {
                    endIndex = data.data.length;
                    if(data.brushExtent.length >= 2) {
                        data.data.forEach(function(datum, index) {
                            var date = zeroOutDate(new Date(datum.date));
                            if(date < data.brushExtent[0]) {
                                startIndex = index + 1;
                            }
                            if(date < data.brushExtent[1]) {
                                endIndex = index + 1;
                            }
                        });
                    }
                } else {
                    if($scope.brushExtent.length >= 2) {
                        $scope.data.forEach(function(datum, index) {
                            var date = zeroOutDate(new Date(datum.date));
                            if(date < $scope.brushExtent[0]) {
                                startIndex = index + 1;
                            }
                            if(date < $scope.brushExtent[1]) {
                                endIndex = index + 1;
                            }
                        });
                    }
                }

                return {
                    startIndex: startIndex,
                    endIndex: endIndex
                };
            };

            /*
             * Finds the min and max dates using all data, including overlays, and the brush.
             * @param {Boolean} ignoreBrushExtent Set to true to find the min and max dates disregarding
             * any brushes set.
             * @return {Object} Returns an object contain minDate and maxDate.
             * @method getDateRange
             * @private
             */
            var getDateRange = function(ignoreBrushExtent) {
                var minDate;
                var maxDate;

                if($scope.brushExtent.length < 2 || ignoreBrushExtent) {
                    //this prevents an error in older mongo caused when the xAxis value is invalid as it is not
                    //included as a key in the response
                    for(var i = 0; i < $scope.data.length; i++) {
                        if(typeof($scope.data[i][$scope.options.attrX.columnName]) === 'undefined') {
                            $scope.data[i][$scope.options.attrX.columnName] = null;
                        }
                    }

                    if($scope.data.length > 0) {
                        var range = d3.extent($scope.data, function(d) {
                            return new Date(d.date);
                        });
                        minDate = range[0];
                        maxDate = range[1];
                    }

                    _.each($scope.options.overlays, function(overlay) {
                        //this prevents an error in older mongo caused when the xAxis value is invalid as it is not
                        //included as a key in the response
                        for(var i = 0; i < overlay.data.data.length; i++) {
                            if(typeof(overlay.data.data[i][overlay.data.attrX.columnName]) === 'undefined') {
                                overlay.data.data[i][overlay.data.attrX.columnName] = null;
                            }
                        }

                        if(overlay.data.data.length > 0) {
                            var range = d3.extent(overlay.data.data, function(d) {
                                return new Date(d.date);
                            });
                            var min = range[0];
                            var max = range[1];

                            if(min < minDate) {
                                minDate = min;
                            }
                            if(max > maxDate) {
                                maxDate = max;
                            }
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
             * Removes the brush extent from this visualization's chart and the dataset service.
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
                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.attrX.columnName]);
                filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                    updateLineChartForBrushExtent();
                    datasetService.removeDateBrushExtentForRelations(relations);
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
                var query = buildQuery();
                query.limitClause = exportService.getLimitClause();
                query.ignoreFilters_ = exportService.getIgnoreFilters();
                query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
                var finalObject = {
                    name: "Line_Chart",
                    data: [{
                        query: query,
                        name: "linechart-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: "year",
                    pretty: "Year"
                });
                finalObject.data[0].fields.push({
                    query: "month",
                    pretty: "Month"
                });
                finalObject.data[0].fields.push({
                    query: "day",
                    pretty: "Day"
                });
                finalObject.data[0].fields.push({
                    query: "hour",
                    pretty: "Hour"
                });
                if($scope.options.aggregation === "count") {
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Count"
                    });
                } else if($scope.options.aggregation === "sum") {
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Sum of " + query.aggregates[0].field
                    });
                } else if($scope.options.aggregation === "average") {
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Average of " + query.aggregates[0].field
                    });
                } else if($scope.options.aggregation === "min") {
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Min of " + query.aggregates[0].field
                    });
                } else if($scope.options.aggregation === "max") {
                    finalObject.data[0].fields.push({
                        query: "value",
                        pretty: "Max of " + query.aggregates[0].field
                    });
                }
                finalObject.data[0].fields.push({
                    query: query.aggregates[1].name,
                    pretty: query.aggregates[1].field
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

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

angular.module('neonDemo.directives')
.directive('countBy', ['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'LinksPopupService', '$filter',
function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, $filter) {
    return {
        templateUrl: 'partials/directives/countby.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindCountField: '=',
            bindAggregation: '=',
            bindAggregationField: '=',
            bindFilterField: '=',
            bindFilterValue: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?',
            limitCount: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('countByDirective');

            $scope.element = $element;

            $scope.optionsMenuButtonText = function() {
                if($scope.options.limitCount && $scope.count >= $scope.options.limitCount) {
                    return $scope.options.limitCount + " limit";
                }
                return "";
            };
            $scope.showOptionsMenuButtonText = function() {
                return $scope.count >= $scope.options.limitCount;
            };

            // Unique field name used for the SlickGrid column containing the URLs for the external apps.
            // This name should be one that is highly unlikely to be a column name in a real database.
            $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

            $scope.databases = [];
            $scope.tables = [];
            $scope.count = 0;
            $scope.fields = [];
            $scope.tableId = 'countby-' + uuid();
            $scope.filterKeys = {};
            $scope.filterSet = undefined;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.showTooMuchDataError = false;
            $scope.outstandingQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                field: {},
                aggregation: "",
                aggregationField: {},
                filterField: {},
                filterValue: "",
                limitCount: $scope.limitCount || 100
            };

            var $tableDiv = $element.find('.count-by-grid');
            $tableDiv.attr("id", $scope.tableId);

            /**
             * Updates the size of the title for this visualization.
             * @method updateTitleSize
             * @private
             */
            var updateTitleSize = function() {
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true);
                $element.find(".title").css("maxWidth", titleWidth - 20);
            };

            /**
             * Updates the size of the table to fill the available space in the directive's area.
             * @method updateSize
             * @private
             */
            var updateSize = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                // Subtract an additional 2 pixels from the table height to account for the its border.
                $('#' + $scope.tableId).height($element.height() - headerHeight - 2);

                updateTitleSize();

                if($scope.table) {
                    $scope.table.refreshLayout();
                }
            };

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             * @private
             */
            var initialize = function() {
                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForData();
                });

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        $scope.clearFilter();
                    }
                });

                $scope.exportID = exportService.register($scope.makeCountByExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "count-by",
                        elementType: "datagrid",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["remove", "count-by"]
                    });
                    linksPopupService.deleteLinks($scope.tableId);
                    $element.off("resize", updateSize);
                    $element.find(".chart-options").off("resize", updateTitleSize);
                    $scope.messenger.removeEvents();
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
                });

                $element.resize(updateSize);
                $element.find(".chart-options").resize(updateTitleSize);
            };

            var logOptionsMenuDropdownChange = function(element, value) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "count-by",
                    elementType: "combobox",
                    elementSub: element,
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "count-by", value]
                });
            };

            $scope.handleChangedDataField = function() {
                logOptionsMenuDropdownChange("count-field", $scope.options.field);
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            $scope.handleChangedAggregation = function() {
                logOptionsMenuDropdownChange("aggregation", $scope.options.aggregation);
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            $scope.handleChangedAggregationField = function() {
                logOptionsMenuDropdownChange("aggregation-field", $scope.options.aggregationField);
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            $scope.handleChangedUnsharedFilterField = function() {
                logOptionsMenuDropdownChange("filter-field", $scope.options.filterField);
                if(!$scope.loadingData && $scope.options.filterValue) {
                    $scope.options.filterValue = "";
                    queryForData();
                }
            };

            $scope.handleChangedUnsharedFilterValue = function() {
                logOptionsMenuDropdownChange("filter-value", $scope.options.filterValue);
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            $scope.handleRemovedUnsharedFilter = function() {
                logOptionsMenuDropdownChange("filter-value", $scope.options.filterValue);
                $scope.options.filterValue = "";
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            $scope.handleChangedLimit = function() {
                logOptionsMenuDropdownChange("limit", $scope.options.limitCount);
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            function createOptions(data) {
                var options = {
                    data: data.data,
                    columns: createColumns(data.data),
                    gridOptions: {
                        enableTextSelectionOnCells: true,
                        forceFitColumns: true,
                        enableColumnReorder: true,
                        forceSyncScrolling: true
                    }
                };

                return options;
            }

            var createAggregationColumnName = function() {
                if($scope.options.aggregation === "count") {
                    return "Count";
                }

                if($scope.options.aggregation === "min") {
                    return "Min " + $scope.options.aggregationField.prettyName;
                }

                if($scope.options.aggregation === "max") {
                    return "Max " + $scope.options.aggregationField.prettyName;
                }

                return "";
            };

            var createColumns = function(data) {
                // Since forceFitColumns is enabled, setting this width will force the columns to use as much
                // space as possible, which is necessary to keep the first column as small as possible.
                var tableWidth = $tableDiv.outerWidth();

                var columns = [{
                    name: $scope.options.field.prettyName,
                    field: $scope.options.field.columnName,
                    width: tableWidth
                }, {
                    name: createAggregationColumnName(),
                    field: $scope.options.aggregation === "count" ? "count" : $scope.options.aggregationField.columnName,
                    formatter: function(row, cell, value) {
                        return $filter('number')(value);
                    },
                    width: tableWidth
                }];

                if(external.active && data.length) {
                    var externalAppColumn = {
                        name: "",
                        field: $scope.EXTERNAL_APP_FIELD_NAME,
                        width: "15",
                        cssClass: "centered",
                        ignoreClicks: true
                    };
                    columns.splice(0, 0, externalAppColumn);
                }

                return columns;
            };

            /**
             * Saves the given field and value as the current filter.
             * @param {String} The filter field
             * @param {String} The filter value
             */
            var handleSetFilter = function(field, value) {
                $scope.filterSet = {
                    key: field,
                    value: value
                };
            };

            /**
             * Clears the current filter.
             */
            var clearFilter = function() {
                $scope.filterSet = undefined;
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
                        elementId: "count-by",
                        elementType: "canvas",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["filter-change", "count-by"]
                    });
                    queryForData();
                }
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
                            break;
                        }
                    }
                }
                $scope.filterKeys = filterService.createFilterKeys("countby", datasetService.getDatabaseAndTableNames());
                $scope.updateTables();
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, [neonMappings.AGGREGATE]) || $scope.tables[0];
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
                $scope.options.aggregation = $scope.bindAggregation || "count";

                var fieldName = $scope.bindCountField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.AGGREGATE) || "";
                $scope.options.field = _.find($scope.fields, function(field) {
                    return field.columnName === fieldName;
                }) || datasetService.createBlankField();
                var aggregationFieldName = $scope.bindAggregationField || "";
                $scope.options.aggregationField = _.find($scope.fields, function(field) {
                    return field.columnName === aggregationFieldName;
                }) || datasetService.createBlankField();
                var filterFieldName = $scope.bindFilterField || "";
                $scope.options.filterField = _.find($scope.fields, function(field) {
                    return field.columnName === filterFieldName;
                }) || datasetService.createBlankField();
                $scope.options.filterValue = $scope.bindFilterValue || "";

                if($scope.filterSet) {
                    $scope.clearFilter();
                }
                queryForData();
            };

            /**
             * Triggers a Neon query that pull the a number of records that match the current Neon connection
             * and filter set.  The query will be limited by the record number and sorted by the field
             * selected in this directive's form.  This directive includes support for a show-data directive attribute
             * that binds to a scope variable and controls table display.  If the bound variable evaulates to false,
             * no data table is generated.  queryForData will not issue a query until the directive thinks it needs to
             * poll for data and should show data.
             * Resets internal "need to query" state to false.
             * @method queryForData
             * @private
             */
            var queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.showTooMuchDataError = false;

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.field.columnName || ($scope.options.aggregation !== "count" && !$scope.options.aggregationField.columnName)) {
                    updateData({
                        data: []
                    });
                    $scope.loadingData = false;
                    return;
                }

                var query = buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "send",
                    elementId: "count-by",
                    elementType: "canvas",
                    elementSub: "count-by",
                    elementGroup: "table_group",
                    source: "system",
                    tags: ["query", "count-by"]
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
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["receive", "count-by"]
                        });
                        updateData(queryResults);
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["render", "count-by"]
                        });
                    });
                });
                $scope.outstandingQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["canceled", "count-by"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["failed", "count-by"]
                        });
                        updateData({
                            data: []
                        });
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                            if(response.responseJSON.error === errorNotificationService.TOO_MUCH_DATA_ERROR) {
                                $scope.$apply(function() {
                                    $scope.showTooMuchDataError = true;
                                });
                            }
                        }
                    }
                });
            };

            var stripIdField = function(dataObject) {
                var data = dataObject.data;

                var cleanData = [];
                for(var i = 0; i < data.length; i++) {
                    var row = {};
                    row[$scope.options.field.columnName] = data[i][$scope.options.field.columnName];
                    if($scope.options.aggregation === "count") {
                        row.count = data[i].count;
                    } else {
                        row[$scope.options.aggregationField.columnName] = data[i][$scope.options.aggregationField.columnName];
                    }
                    cleanData.push(row);
                }
                dataObject.data = cleanData;
                return dataObject;
            };

            /**
             * Creates and adds the external links to the given data and returns the data.
             * @param {Array} data
             * @method addExternalLinksToColumnData
             * @private
             * @return {Array}
             */
            var addExternalLinksToColumnData = function(data) {
                var tableLinks = {};
                var mappings = datasetService.getMappings($scope.options.database.name, $scope.options.table.name);

                data.forEach(function(row) {
                    var value = row[$scope.options.field.columnName];
                    var key = linksPopupService.generateKey($scope.options.field, value);
                    tableLinks[key] = linksPopupService.createAllServiceLinkObjects(external.services, mappings, $scope.options.field.columnName, value);
                    row[$scope.EXTERNAL_APP_FIELD_NAME] = tableLinks[key].length ? linksPopupService.createLinkHtml($scope.tableId, key, value) : linksPopupService.createDisabledLinkHtml(value);
                });

                // Set the link data for the links popup for this visualization.
                linksPopupService.setLinks($scope.tableId, tableLinks);

                return data;
            };

            /**
             * Saves the given field and value as the current filter for the
             * dashboard and this widget.
             * @param {String} The filter field
             * @param {String} The filter value
             * @method setFilter
             * @private
             */
            var setFilter = function(field, value) {
                var filterExists = $scope.filterSet ? true : false;
                handleSetFilter(field, value);

                // Store the value for the filter to use during filter creation.
                $scope.filterValue = value;

                var connection = connectionService.getActiveConnection();
                if($scope.messenger && connection) {
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [field]);
                    if(filterExists) {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "count-by",
                            elementType: "datagrid",
                            elementSub: "row",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["filter", "count-by"]
                        });
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForCount, {
                            visName: "Aggregation Table",
                            text: $scope.options.field.columnName + " = " + $scope.filterSet.value
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "count-by",
                            elementType: "datagrid",
                            elementSub: "row",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["filter", "count-by"]
                        });
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForCount, {
                            visName: "Aggregation Table",
                            text: $scope.options.field.columnName + " = " + $scope.filterSet.value
                        });
                    }
                }
            };

            /**
             * Creates and returns a filter on the given field using the value set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} fieldName The name of the field on which to filter
             * @method createFilterClauseForCount
             * @private
             * @return {Object} A neon.query.Filter object
             */
            var createFilterClauseForCount = function(databaseAndTableName, fieldName) {
                return neon.query.where(fieldName, '=', $scope.filterValue);
            };

            /**
             * Adds an onClick listener for selecting the rows in the table that
             * sets a filter on the data in the selected row.
             */
            var addOnClickListener = function() {
                $scope.table.addOnClickListener(function(columns, row) {
                    var columnIndex = external.active ? 1 : 0;
                    var field = columns[columnIndex].field;

                    // If the user clicks on the filtered row/cell, clear the filter.
                    if($scope.filterSet !== undefined) {
                        if($scope.filterSet.key === field && $scope.filterSet.value === row[field]) {
                            $scope.clearFilter();
                            return;
                        }
                    }

                    $tableDiv.addClass("filtered");
                    $scope.$apply(function() {
                        setFilter(field, row[field]);
                    });
                });
            };

            /**
             * Updates the data bound to the table managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method updateData
             * @private
             */
            var updateData = function(queryResults) {
                if(!($("#" + $scope.tableId).length)) {
                    return;
                }

                var cleanData = stripIdField(queryResults);

                // If the table is recreated while sorting is set, we must redo the sorting on the new table; else, sort the table by the aggregation field.
                var sortInfo = $scope.table ? $scope.table.sortInfo_ : {
                    name: createAggregationColumnName(),
                    field: $scope.options.aggregation === "count" ? "count" : $scope.options.aggregationField.columnName,
                    sortAsc: false
                };

                $scope.tableOptions = createOptions(cleanData);

                // Add the URLs for the external applications after the table options have been created because it already includes the column.
                if(external.active && cleanData.data.length) {
                    cleanData.data = addExternalLinksToColumnData(cleanData.data);
                }

                $scope.count = cleanData.data.length;
                $scope.table = new tables.Table("#" + $scope.tableId, $scope.tableOptions).draw();
                addOnClickListener();
                updateSize();

                $scope.table.sortColumnAndChangeGlyph(sortInfo);

                // If the table is recreated while a filter is set, we must re-select the filtered row/cells.
                if($scope.filterSet !== undefined) {
                    $scope.table.setActiveCellIfMatchExists($scope.filterSet.key, $scope.filterSet.value);
                }
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             * @private
             */
            var buildQuery = function() {
                var whereNotNull = neon.query.where($scope.options.field.columnName, "!=", null);
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name)
                    .groupBy($scope.options.field.columnName)
                    .where(whereNotNull);

                // The widget displays its own ignored rows with 0.5 opacity.
                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                if($scope.options.aggregation === "count") {
                    query.aggregate(neon.query.COUNT, '*', 'count');
                    query.sortBy('count', neon.query.DESCENDING);
                }
                if($scope.options.aggregation === "min") {
                    query.aggregate(neon.query.MIN, $scope.options.aggregationField.columnName, $scope.options.aggregationField.columnName);
                    query.sortBy($scope.options.aggregationField, neon.query.ASCENDING);
                }
                if($scope.options.aggregation === "max") {
                    query.aggregate(neon.query.MAX, $scope.options.aggregationField.columnName, $scope.options.aggregationField.columnName);
                    query.sortBy($scope.options.aggregationField, neon.query.DESCENDING);
                }

                if(datasetService.isFieldValid($scope.options.filterField) && $scope.options.filterValue) {
                    var operator = $.isNumeric($scope.options.filterValue) ? "=" : "contains";
                    query.where(neon.query.and(whereNotNull, neon.query.where($scope.options.filterField.columnName, operator, $scope.options.filterValue)));
                }

                if($scope.options.limitCount) {
                    query.limit($scope.options.limitCount);
                }

                return query;
            };

            /**
             * Removes the current filter from the dashboard and this widget.
             */
            $scope.clearFilter = function() {
                if($scope.messenger) {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "click",
                        elementId: "count-by",
                        elementType: "button",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["filter", "count-by"]
                    });
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                        $tableDiv.removeClass("filtered");
                        $scope.table.deselect();
                        clearFilter();
                    });
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeCountByExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "count-by-export",
                    elementType: "button",
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "count-by", "export"]
                });

                var capitalizeFirstLetter = function(str) {
                    var first = str[0].toUpperCase();
                    return first + str.slice(1);
                };

                var query = buildQuery();
                query.limitClause = exportService.getLimitClause();
                var finalObject = {
                    name: "Count_By",
                    data: [{
                        query: query,
                        name: "countBy-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: (query.groupByClauses[0]).field,
                    pretty: (query.groupByClauses[0]).field
                });
                var op = '';
                if($scope.options.aggregation === 'min') {
                    op = 'Min of ';
                } else if($scope.options.aggregation === 'max') {
                    op = 'Max of ';
                }
                finalObject.data[0].fields.push({
                    query: (query.aggregates[0]).name,
                    pretty: op + capitalizeFirstLetter((query.aggregates[0]).name)
                });
                return finalObject;
            };

            /**
             * Generates and returns the title for this visualization.
             * @method generateTitle
             * @return {String}
             */
            $scope.generateTitle = function() {
                var title = $scope.options.filterValue ? $scope.options.filterValue + " " : "";
                if($scope.bindTitle) {
                    return title + $scope.bindTitle;
                }
                return title + $scope.options.table.prettyName + ($scope.options.field.prettyName ? " / " + $scope.options.field.prettyName : "");
            };

            neon.ready(function() {
                initialize();
                displayActiveDataset();
            });
        }
    };
}]);

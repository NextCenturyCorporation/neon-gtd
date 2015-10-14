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
 * This Angular JS directive adds a data table to a page showing the records that match the current
 * filter set.
 *
 * @example
 *    &lt;query-results-table&gt;&lt;/query-results-table&gt;<br>
 *    &lt;div query-results-table&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class queryResultsTable
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('queryResultsTable', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService', '$compile', '$interval', '$timeout',
function(external, popups, connectionService, datasetService, errorNotificationService, exportService, $compile, $interval, $timeout) {
    return {
        templateUrl: 'partials/directives/queryResultsTable.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindTable: '=',
            bindDatabase: '=',
            bindIdField: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('query-results-directive');

            $scope.element = $element;

            // Unique field name used for the SlickGrid column containing the URLs for the external apps.
            // This name should be one that is highly unlikely to be a column name in a real database.
            $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

            var updateSize = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                var tableBufferY = $tableDiv.outerHeight(true) - $tableDiv.height();
                $tableDiv.height($element.height() - headerHeight - tableBufferY);

                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true);
                $element.find(".title").css("maxWidth", titleWidth - 20);

                if($scope.table) {
                    $scope.table.refreshLayout();
                }
            };

            $element.resize(updateSize);

            $scope.ASCENDING = neon.query.ASCENDING;
            $scope.DESCENDING = neon.query.DESCENDING;

            $scope.selectionEvent = "QUERY_RESULTS_SELECTION_EVENT";

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.deletedFieldsMap = {};
            $scope.totalRows = 0;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.outstandingDataQuery = undefined;
            $scope.outstandingTotalRowsQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                addField: {},
                sortByField: {},
                sortDirection: neon.query.ASCENDING,
                limit: 500
            };

            // Default our data table to be empty.  Generate a unique ID for it
            // and pass that to the tables.Table object.
            $scope.data = [];
            $scope.tableId = 'query-results-' + uuid();
            var $tableDiv = $element.find('.query-results-grid');
            $tableDiv.attr("id", $scope.tableId);

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                $scope.$watch('options.sortByField', function(newVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: ($scope.loadingData) ? "reset" : "click",
                        elementId: "datagrid-sort-by",
                        elementType: "combobox",
                        elementGroup: "table_group",
                        source: ($scope.loadingData) ? "system" : "user",
                        tags: ["options", "datagrid", "sort-by", newVal]
                    });
                });

                $scope.$watch('options.sortDirection', function(newVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: ($scope.loadingData) ? "reset" : "click",
                        elementId: "datagrid-sort-direction",
                        elementType: "radiobutton",
                        elementGroup: "table_group",
                        source: ($scope.loadingData) ? "system" : "user",
                        tags: ["options", "datagrid", "sort-direction", newVal]
                    });
                });

                $scope.$watch('options.limit', function(newVal) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: ($scope.loadingData) ? "reset" : "keydown",
                        elementId: "datagrid-limit",
                        elementType: "textbox",
                        elementGroup: "table_group",
                        source: ($scope.loadingData) ? "system" : "user",
                        tags: ["options", "datagrid", "limit", newVal]
                    });
                });

                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForData(false);
                });

                $scope.exportID = exportService.register($scope.makeQueryResultsTableExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "datagrid",
                        elementType: "canvas",
                        elementSub: "datagrid",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["remove", "datagrid"]
                    });
                    popups.links.deleteData($scope.tableId);
                    $element.off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    exportService.unregister($scope.exportID);
                });
            };

            $scope.createOptions = function(data, refreshColumns) {
                var _id = "_id";
                var has_id = true;

                _.each(data.data, function(element) {
                    if(!(_.has(element, _id))) {
                        has_id = false;
                    }
                });

                var options = {
                    data: data.data,
                    columns: createColumns(data.data, refreshColumns),
                    gridOptions: {
                        enableTextSelectionOnCells: true,
                        forceFitColumns: false,
                        enableColumnReorder: true,
                        forceSyncScrolling: true
                    }
                };

                var linkyConfig = datasetService.getLinkyConfig();

                if(linkyConfig.linkTo) {
                    options.linkyConfig = linkyConfig;
                }

                if(has_id) {
                    options.id = _id;
                }
                return options;
            };

            var createColumns = function(data, refreshColumns) {
                var knownColumns = [];

                if(refreshColumns || !$scope.table) {
                    // Add the fields in the order they are listed in the configuration file.
                    datasetService.getFields($scope.options.database.name, $scope.options.table.name).forEach(function(field) {
                        knownColumns.push({
                            columnName: field.columnName,
                            prettyName: field.prettyName
                        });
                    });
                } else {
                    // Add the fields in the order they are set in the existing data table.
                    $scope.table.getColumns().forEach(function(column) {
                        if(column.name) {
                            knownColumns.push({
                                columnName: column.field,
                                prettyName: column.name
                            });
                        }
                    });
                }

                var hiddenColumnNames = $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].map(function(deletedField) {
                    return deletedField.columnName;
                });
                var columns = tables.createColumns(knownColumns, data, hiddenColumnNames, [$scope.createDeleteColumnButton("")]);
                columns = tables.addLinkabilityToColumns(columns);

                if(external.active) {
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
                        elementId: "datagrid",
                        elementType: "datagrid",
                        elementSub: "datagrid",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "datagrid"]
                    });
                    queryForData(false);
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
                $scope.options.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                        }
                    }
                }

                if(!($scope.deletedFieldsMap[$scope.options.database.name])) {
                    $scope.deletedFieldsMap[$scope.options.database.name] = {};
                }

                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);
                $scope.options.addField = {
                    columnName: "",
                    prettyName: ""
                };

                if(!($scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name])) {
                    $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name] = [];
                    // The first time the data for a table is displayed, add the fields hidden in the configuration to the list of deleted fields for the table.
                    datasetService.getFields($scope.options.database.name, $scope.options.table.name).forEach(function(field) {
                        if(field.hide) {
                            $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].push({
                                columnName: field.columnName,
                                prettyName: field.prettyName
                            });
                        }
                    });
                }

                if($scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].length) {
                    // Remove previously deleted fields from the list of fields.
                    $scope.fields = $scope.fields.filter(function(field) {
                        return -1 === _.findIndex($scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name], function(deletedField) {
                            return deletedField.columnName === field.columnName;
                        });
                    });
                    $scope.options.addField = $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name][0];
                }

                var sortByField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "sort_by") || "";
                $scope.options.sortByField = _.find($scope.fields, function(field) {
                    return field.columnName === sortByField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };

                queryForData(true);
            };

            /**
             * Forces a data query regardless of the current need to query for data.
             * @method refreshData
             */
            $scope.refreshData = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "datagrid-refresh",
                    elementType: "button",
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "datagrid", "refresh"]
                });
                queryForData(false);
            };

            /**
             * Triggers a Neon query that pull the a number of records that match the current Neon connection
             * and filter set.  The query will be limited by the record number and sorted by the field
             * selected in this directive's form.  This directive includes support for a show-data directive attribute
             * that binds to a scope variable and controls table display.  If the bound variable evaulates to false,
             * no data table is generated.  queryForData will not issue a query until the directive thinks it needs to
             * poll for data and should show data.
             * Resets internal "need to query" state to false.
             * @param {Boolean} refreshColumns Whether the columns should be refreshed and thus the
             * column ordering reverted back to the original
             * @method queryForData
             */
            var queryForData = function(refreshColumns) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    $scope.updateData({
                        data: []
                    }, refreshColumns);
                    $scope.totalRows = 0;
                    $scope.loadingData = false;
                    return;
                }

                var query = $scope.buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "datagrid",
                    elementType: "datagrid",
                    elementSub: "data",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "datagrid"]
                });

                if($scope.outstandingDataQuery) {
                    $scope.outstandingDataQuery.abort();
                }

                $scope.outstandingDataQuery = connection.executeQuery(query);
                $scope.outstandingDataQuery.done(function() {
                    $scope.outstandingDataQuery = undefined;
                });
                $scope.outstandingDataQuery.done(function(queryResults) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "datagrid",
                        elementType: "datagrid",
                        elementSub: "data",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["receive", "datagrid"]
                    });
                    $scope.$apply(function() {
                        $scope.updateData(queryResults, refreshColumns);
                        queryForTotalRows(connection);
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "data",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["render", "datagrid"]
                        });
                    });
                });
                $scope.outstandingDataQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "data",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "datagrid"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "data",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "datagrid"]
                        });
                        $scope.updateData({
                            data: []
                        }, refreshColumns);
                        $scope.totalRows = 0;
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            /**
             * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
             * @method queryForTotalRows
             */
            var queryForTotalRows = function(connection) {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name)
                    .aggregate(neon.query.COUNT, '*', 'count');

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "datagrid",
                    elementType: "datagrid",
                    elementSub: "totals",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "datagrid"]
                });

                if($scope.outstandingTotalRowsQuery) {
                    $scope.outstandingTotalRowsQuery.abort();
                }

                $scope.outstandingTotalRowsQuery = connection.executeQuery(query);
                $scope.outstandingTotalRowsQuery.always(function() {
                    $scope.outstandingTotalRowsQuery = undefined;
                });
                $scope.outstandingTotalRowsQuery.done(function(queryResults) {
                    $scope.$apply(function() {
                        if(queryResults.data.length > 0) {
                            $scope.totalRows = queryResults.data[0].count;
                        } else {
                            $scope.totalRows = 0;
                        }
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "totals",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "datagrid"]
                        });
                    });
                });
                $scope.outstandingTotalRowsQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "totals",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "datagrid"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "totals",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "datagrid"]
                        });
                        $scope.totalRows = 0;
                        $scope.loadingData = false;
                    }
                });
            };

            /**
             * Adds an onClick listener for selecting a row in the table that
             * publishes the row to a channel
             */
            $scope.addOnClickListener = function() {
                $scope.table.addOnClickListener(function(columns, row) {
                    // Deselect the row if already selected
                    if($scope.selectedRowId !== undefined && $scope.selectedRowId === row._id) {
                        XDATA.userALE.log({
                            activity: "deselect",
                            action: "click",
                            elementId: "row",
                            elementType: "datagrid",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["datagrid", "row"]
                        });

                        $scope.clearSelection();
                        return;
                    }

                    $scope.$apply(function() {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "row",
                            elementType: "datagrid",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["datagrid", "row"]
                        });

                        $scope.messenger.publish($scope.selectionEvent, {
                            data: row,
                            database: $scope.options.database.name,
                            table: $scope.options.table.name
                        });
                        $tableDiv.addClass("row-selected");
                        $scope.selectedRowId = row._id;
                    });
                });
            };

            /**
             * Adds a sort listener in order to clear any row selection on column reorders
             */
            $scope.addSortListener = function() {
                $scope.table.registerSortListener(function() {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "click",
                        elementId: "row",
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["datagrid", "row"]
                    });

                    $scope.clearSelection();
                });
            };

            $scope.clearSelection = function() {
                $scope.messenger.publish($scope.selectionEvent, {});
                $scope.selectedRowId = undefined;
                $tableDiv.removeClass("row-selected");

                // Delay deselection or the row won't deselect
                $timeout(function() {
                    $scope.table.deselect();
                }, 100);
            };

            /**
             * Updates the data bound to the table managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @param {Boolean} refreshColumns Whether the columns should be refreshed and thus the
             * column ordering reverted back to the original
             * @method updateData
             */
            $scope.updateData = function(queryResults, refreshColumns) {
                if(!($("#" + $scope.tableId).length)) {
                    return;
                }

                $scope.tableOptions = $scope.createOptions(queryResults, refreshColumns);

                if(external.active) {
                    queryResults.data = addExternalLinksToColumnData(queryResults.data);
                }

                $scope.table = new tables.Table("#" + $scope.tableId, $scope.tableOptions).draw();

                /* Enable row selection
                 * Limitations:
                 *  - It is only guaranteed to work correctly if there is only one data table showing this collection
                 */
                if($scope.options.table.enableRowSelection) {
                    $(".query-results-grid .slick-row").addClass("selectable");
                    $scope.addOnClickListener();
                    $scope.clearSelection();
                    $scope.addSortListener();
                }

                $scope.table.refreshLayout();
                $scope.table.addOnColumnsReorderedListener($scope.createDeleteColumnButtons);
                $scope.createDeleteColumnButtons();
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
                    var field = $scope.bindIdField || "_id";
                    var id = row[field];
                    tableLinks[id] = popups.links.createAllServiceLinkObjects(external.services, mappings, field, id);
                    row[$scope.EXTERNAL_APP_FIELD_NAME] = tableLinks[id].length ? popups.links.createLinkHtml($scope.tableId, id, id) : popups.links.createDisabledLinkHtml(id);
                });

                // Set the link data for the links popup for this visualization.
                popups.links.setData($scope.tableId, tableLinks);

                return data;
            };

            $scope.createDeleteColumnButtons = function() {
                $element.find(".slick-header-column").each(function() {
                    var name = $(this).find(".slick-column-name").html();
                    // Check if the name is empty to ignore the external application link column.
                    if(name) {
                        $(this).append($compile($scope.createDeleteColumnButton(name))($scope));
                    }
                });
            };

            $scope.createDeleteColumnButton = function(name) {
                return "<span class=\"remove-column-button\" ng-click=\"deleteColumn('" + name + "'); $event.stopPropagation();\">&times;</span>";
            };

            $scope.deleteColumn = function(name) {
                if($scope.table.deleteColumn(name)) {
                    var indexToSplice = _.findIndex($scope.fields, function(field) {
                        return name === field.prettyName;
                    });
                    var deletedField = $scope.fields.splice(indexToSplice, 1)[0];
                    $scope.options.sortByField = $scope.options.sortByField === name ? $scope.fields[0] : $scope.options.sortByField;
                    $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].push(deletedField);
                    $scope.options.addField = deletedField;
                    $scope.createDeleteColumnButtons();

                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "column-" + name,
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "column", name]
                    });
                }
            };

            $scope.addColumn = function() {
                if($scope.table.addColumn($scope.options.addField.prettyName)) {
                    var indexToSplice = _.findIndex($scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name], function(deletedField) {
                        return deletedField.columnName === $scope.options.addField.columnName;
                    });
                    $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].splice(indexToSplice, 1);
                    $scope.fields.push($scope.options.addField);
                    $scope.options.addField = $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].length > 0 ? $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name][0] : {
                        columnName: "",
                        prettyName: ""
                    };
                    $scope.createDeleteColumnButtons();

                    XDATA.userALE.log({
                        activity: "add",
                        action: "click",
                        elementId: "column-" + $scope.options.addField.prettyName,
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "column", $scope.options.addField.prettyName]
                    });
                }
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            $scope.buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).limit($scope.options.limit);
                if($scope.options.sortByField && $scope.options.sortByField.columnName) {
                    query.sortBy($scope.options.sortByField.columnName, $scope.options.sortDirection);
                }
                return query;
            };

            $scope.handleAscButtonClick = function() {
                if($scope.options.sortDirection === $scope.ASCENDING) {
                    $scope.refreshData();
                }
            };

            $scope.handleDescButtonClick = function() {
                if($scope.options.sortDirection === $scope.DESCENDING) {
                    $scope.refreshData();
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeQueryResultsTableExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "datagrid-export",
                    elementType: "button",
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "datagrid", "export"]
                });
                var query = $scope.buildQuery();
                query.limitClause = exportService.getLimitClause();
                var finalObject = {
                    name: "Query_Results_Table",
                    data: [{
                        query: query,
                        name: "queryResultsTable-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                var addField = function(field) {
                    finalObject.data[0].fields.push({
                        query: field.columnName,
                        pretty: field.prettyName || field.columnName
                    });
                };
                datasetService.getFields($scope.options.database.name, $scope.options.table.name).forEach(addField);
                return finalObject;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);

'use strict';
/*
 * Copyright 2015 Next Century Corporation
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
.directive('queryResultsTable', ['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService', 'linkify', '$sce', '$timeout', 'LinksPopupService',
function(external, connectionService, datasetService, errorNotificationService, exportService, linkify, $sce, $timeout, linksPopupService) {
    return {
        templateUrl: 'partials/directives/queryResultsTable.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindTable: '=',
            bindDatabase: '=',
            bindIdField: '=',
            bindSortField: '=',
            bindSortDirection: '=',
            bindLimit: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('query-results-directive');

            $scope.element = $element;

            $scope.tableId = 'query-results-' + uuid();
            var tableDiv = $element.find('.results-table');
            tableDiv.attr("id", $scope.tableId);

            $scope.active = {
                database: {},
                table: {},
                sortByField: {}
            };

            neon.ready(function() {
                $scope.init();
            });
        },
        controller: function($scope) {
            // Unique field name used for the SlickGrid column containing the URLs for the external apps.
            // This name should be one that is highly unlikely to be a column name in a real database.
            $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

            $scope.ASCENDING = neon.query.ASCENDING;
            $scope.DESCENDING = neon.query.DESCENDING;

            $scope.hiddenColumns = [];

            var handleColumnVisibiltyChange = function(event) {
                if(event.column.visible && $scope.hiddenColumns[event.column.colId]) {
                    delete $scope.hiddenColumns[event.column.colId];
                    XDATA.userALE.log({
                        activity: "add",
                        action: "click",
                        elementId: "column-" + event.column.colId,
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "column", event.column.colId]
                    });
                } else {
                    $scope.hiddenColumns[event.column.colId] = true;
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "column-" + event.column.colId,
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "column", event.column.colId]
                    });
                }
            };

            $scope.gridOptions = {
                columnDefs: [],
                rowData: [],
                enableColResize: true,
                enableSorting: true,
                showToolPanel: false,
                toolPanelSuppressPivot: true,
                toolPanelSuppressValues: true,
                suppressRowClickSelection: true,
                onColumnVisible: handleColumnVisibiltyChange
            };

            $scope.optionsMenuButtonText = function() {
                return $scope.active.count + " of " + $scope.active.total + " records";
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            /**
             * Resizes the title of the data table.
             * @method resizeTitle
             * @private
             */
            var resizeTitle = function() {
                // Set the width of the title to the width of the visualization minus the width of the chart options button/text and padding.
                var titleWidth = $scope.element.width() - $scope.element.find(".chart-options").outerWidth(true) - 20;
                // Also subtract the width of the table options button.
                titleWidth -= ($scope.element.find(".edit-table-icon").outerWidth(true) + 10);
                $scope.element.find(".title").css("maxWidth", titleWidth);
            };

            /**
             * intitalize all fields and add a messenger then query for data
             * @method init
             */
            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, queryForData);
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.element.resize(resizeTitle);
                $scope.element.find(".chart-options a").resize(resizeTitle);

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
                    linksPopupService.deleteLinks($scope.tableId);
                    $scope.messenger.unsubscribeAll();
                    $scope.element.off("resize", resizeTitle);
                    $scope.element.find(".chart-options a").off("resize", resizeTitle);
                    exportService.unregister($scope.exportID);
                });

                $scope.active = {
                    total: 0,
                    sortDirection: $scope.bindSortDirection || $scope.ASCENDING,
                    limit: $scope.bindLimit || 5000,
                    count: 0
                };

                initializeDataset();
            };

            /**
             * Gets database and table from dataset service and sets up dataset related scope variables
             * @method initializeDataset
             * @private
             */
            var initializeDataset = function() {
                $scope.databases = datasetService.getDatabases();
                $scope.active.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.active.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                updateTables();
            };

            var updateTables = function() {
                $scope.tables = datasetService.getTables($scope.active.database.name);
                $scope.active.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.active.table = $scope.tables[i];
                            break;
                        }
                    }
                }

                updateFields();
            };

            var updateFields = function() {
                // Stops extra data queries that may be caused by event handlers triggered by setting the active fields.
                $scope.initializing = true;

                $scope.fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);
                $scope.fields.forEach(function(field) {
                    if(field.hide) {
                        $scope.hiddenColumns[field.columnName] = true;
                    }
                });

                var sortByFieldName = $scope.bindSortField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.SORT) || "";
                $scope.active.sortByField = _.find($scope.fields, function(field) {
                    return field.columnName === sortByFieldName;
                }) || ($scope.fields.length ? $scope.fields[0] : datasetService.createBlankField());

                queryForTotalRows();
                updateColumns();
            };

            /**
             * Triggers a Neon query that will fetch the total number of rows of data for display
             * @method queryForTotalRows
             * @private
             */
            var queryForTotalRows = function() {
                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    updateData([]);
                    return;
                }

                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name).aggregate(neon.query.COUNT, '*', 'count');

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
                            $scope.active.total = queryResults.data[0].count;
                        } else {
                            $scope.active.total = 0;
                        }
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
                        $scope.active.total = 0;
                    }
                });
            };

            /**
             * Queries for field names list and sets up table columns
             * @method updateColumns
             * @private
             */
            var updateColumns = function() {
                // Use the fields with the order in which they are defined in the Neon configuration file.
                var fields = datasetService.getFields($scope.active.database.name, $scope.active.table.name);

                var columnDefinitions = _.map(fields, function(field) {
                    var config = {
                        headerName: field.prettyName,
                        field: field.columnName,
                        suppressSizeToFit: true,
                        onCellClicked: handleRowClick,
                        cellRenderer: function(params) {
                            return neon.helpers.getNestedValue(params.data, params.colDef.field);
                        }
                    };

                    if(field.class) {
                        config.cellClass = field.class;
                    }

                    if($scope.hiddenColumns[field.columnName]) {
                        config.hide = true;
                    }

                    return config;
                });

                if(external.active) {
                    var externalAppColumn = {
                        headerName: "",
                        field: $scope.EXTERNAL_APP_FIELD_NAME,
                        suppressSizeToFit: true,
                        cellClass: 'centered',
                        width: 20
                    };

                    columnDefinitions = [externalAppColumn].concat(columnDefinitions);
                }

                $scope.gridOptions.api.setColumnDefs(columnDefinitions);
                $scope.gridOptions.api.sizeColumnsToFit();
                queryForData();
            };

            /**
             * onClick listener for selecting a cell in the table that publishes the row to a channel
             * @method handleRowClick
             * @private
             */
            var handleRowClick = function(cell) {
                if($scope.selectedRowId !== undefined && $scope.selectedRowId === cell.rowIndex) {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "click",
                        elementId: "row",
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["datagrid", "row"]
                    });

                    $scope.gridOptions.api.deselectIndex(cell.rowIndex);
                    return;
                } else {
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
                            data: $scope.gridOptions.rowData[cell.rowIndex],
                            database: $scope.active.database.name,
                            table: $scope.active.table.name
                        });

                        $scope.gridOptions.api.selectIndex(cell.rowIndex, false);
                        $scope.selectedRowId = cell.rowIndex;
                    });
                }
            };

            /**
             * Builds a query and calls to execute query if connection is available.
             * @method queryForData
             * @private
             */
            var queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    updateData([]);
                    return;
                }

                $scope.gridOptions.api.setRowData([]);

                var query = buildQuery();

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
                    updateData(queryResults.data);
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
                        updateData({
                            data: []
                        }, refreshColumns);
                        $scope.total = 0;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            /**
             * Escapes all values in the given data, recursively.
             * @method escapeDataRecursively
             * @private
             */
            var escapeDataRecursively = function(data) {
                if(_.isArray(data)) {
                    for(var i = 0; i < data.length; i++) {
                        data[i] = escapeDataRecursively(data[i]);
                    }
                } else if(_.keys(data).length) {
                    var keys = _.keys(data);
                    for(var i = 0; i < keys.length; i++) {
                        data[keys[i]] = escapeDataRecursively(data[keys[i]]);
                    }
                } else {
                    data = _.escape(data);
                }
                return data;
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             * @private
             */
            var buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name).limit($scope.active.limit);
                if(datasetService.isFieldValid($scope.active.sortByField)) {
                    query.sortBy($scope.active.sortByField.columnName, $scope.active.sortDirection);
                }
                return query;
            };

            var updateData = function(data) {
                data = escapeDataRecursively(data);

                if(external.active) {
                    data = addExternalLinksToColumnData(data);
                }

                $scope.active.count = data.length;
                $scope.initializing = false;
                $scope.gridOptions.api.setRowData(data);

                $timeout(function() {
                    linkifyRows(data);
                });
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
                var mappings = datasetService.getMappings($scope.active.database.name, $scope.active.table.name);

                data.forEach(function(row) {
                    var field = $scope.bindIdField || "_id";
                    var id = row[field];

                    tableLinks[id] = linksPopupService.createAllServiceLinkObjects(external.services, mappings, field, id);
                    row[$scope.EXTERNAL_APP_FIELD_NAME] = tableLinks[id].length ? linksPopupService.createLinkHtml($scope.tableId, id, id) : linksPopupService.createDisabledLinkHtml(id);
                });

                // Set the link data for the links popup for this visualization.
                linksPopupService.setLinks($scope.tableId, tableLinks);

                return data;
            };

            /**
             * Modifies string data values to include actual links for any portions resembling a twitter link using the linkify dependency
             * @method linkifyRows
             * @param data {Object Array} the array of data row objects
             * @return the modified data array
             * @private
             */
            var linkifyRows = function(data) {
                var linkedData = _.map(data, function(row) {
                    _.each(row, function(value, key) {
                        if(value && typeof value === 'string') {
                            row[key] = $sce.trustAsHtml(linkify.twitter(value));
                        }
                    });

                    return row;
                });

                $scope.gridOptions.api.setRowData(linkedData);
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.active.database.name && message.addedFilter.tableName === $scope.active.table.name) {
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
                    queryForData();
                }
            };

            /**
             * Opens or closes the ag-grid toolbox to allow for modifying table columns
             * @method toggleToolbox
             */
            $scope.toggleToolbox = function() {
                $scope.gridOptions.showToolPanel = !$scope.gridOptions.showToolPanel;
                $scope.gridOptions.api.showToolPanel($scope.gridOptions.showToolPanel);
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
                var query = buildQuery();
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
                datasetService.getFields($scope.active.database.name, $scope.active.table.name).forEach(addField);
                return finalObject;
            };

            var logChange = function(element, value, type) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "datagrid",
                    elementType: type || "combobox",
                    elementSub: element,
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "datagrid", value]
                });
            };

            $scope.handleDatabaseChange = function() {
                logChange("database", $scope.active.database.name);
                updateTables();
            };

            $scope.handleTableChange = function() {
                logChange("table", $scope.active.table.name);
                updateFields();
            };

            var handleSortChange = function() {
                var sort = {
                    colId: $scope.active.sortByField.columnName,
                    sort: $scope.active.sortDirection === $scope.ASCENDING ? "asc" : "desc"
                };

                $scope.gridOptions.api.setSortModel([sort]);

                if(!$scope.initializing) {
                    queryForData();
                }
            };

            $scope.handleSortByFieldChange = function() {
                logChange("sort-field", $scope.active.sortByField.name);
                handleSortChange();
            };

            $scope.handleSortDirectionChange = function() {
                logChange("sort-direction", $scope.active.sortDirection, "button");
                handleSortChange();
            };

            $scope.handleLimitChange = function() {
                logChange("limit", $scope.active.limit, "button");
                if(!$scope.initializing) {
                    queryForData();
                }
            };

            //TODO text selection on cells -- https://github.com/ceolter/ag-grid/issues/87
        }
    };
}]);

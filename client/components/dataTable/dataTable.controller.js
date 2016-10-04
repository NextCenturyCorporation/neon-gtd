'use strict';

/*
 * Copyright 2016 Next Century Corporation
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
 * This visualization shows all data in a table.
 * @namespace neonDemo.controllers
 * @class dataTableController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('dataTableController', ['$scope', 'linkify', '$sce', '$timeout', function($scope, linkify, $sce, $timeout) {
    // Unique field name used for the SlickGrid column containing the URLs for the external apps.
    // This name should be one that is highly unlikely to be a column name in a real database.
    var EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

    $scope.active.ASCENDING = neon.query.ASCENDING;
    $scope.active.DESCENDING = neon.query.DESCENDING;

    $scope.active.sortByField = {};
    $scope.active.sortDirection = $scope.bindings.sortDirection || $scope.active.ASCENDING;
    $scope.active.limit = $scope.bindings.limit || 100;

    $scope.active.gridOptions = {
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

    var hiddenFields = [];

    var handleColumnVisibiltyChange = function(event) {
        if(event.column.visible && hiddenFields[event.column.colId]) {
            delete hiddenFields[event.column.colId];
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
            hiddenFields[event.column.colId] = true;
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

    $scope.functions.createMenuText = function() {
        return ($scope.active.count && $scope.active.total) ? $scope.active.count + " of " + $scope.active.total + " Records" : "No Data";
    };

    $scope.functions.showMenuText = function() {
        return true;
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.fields.forEach(function(field) {
            if(field.hide) {
                hiddenFields[field.columnName] = true;
            }
        });

        $scope.active.sortByField = $scope.functions.findFieldObject("sortField", neonMappings.SORT);
    };

    $scope.functions.onChangeOption = function() {
        updateColumns();
    };

    /**
     * Queries for field names list and sets up table columns
     * @method updateColumns
     * @private
     */
    var updateColumns = function() {
        var OBJECT = "{...}";

        var getCellText = function(data, fields) {
            var values = data[fields[0]];

            if(_.isArray(values)) {
                return "[" + [].concat.apply([], values.map(function(item) {
                    if((_.isArray(item) || _.isObject(item)) && fields.length > 1) {
                        return getCellText(item, fields.slice(1));
                    }
                    return _.isArray(item) ? item.join(",") : (_.isObject(item) ? OBJECT : item);
                })).join(",") + "]";
            }

            if(_.isObject(values) && fields.length > 1 && typeof values[fields[1]] !== "undefined") {
                return getCellText(values, fields.slice(1));
            }

            return _.isObject($sce.valueOf(values)) ? OBJECT : ("" + values);
        };

        // Use the fields in the order they are defined in the Neon dashboard configuration (so we can't use sorted $scope.active.fields) for the order of the columns.
        var columnDefinitions = _.map($scope.functions.getUnsortedFields(), function(fieldObject) {
            var config = {
                field: fieldObject.columnName,
                headerName: fieldObject.prettyName,
                onCellClicked: handleRowClick,
                suppressSizeToFit: true,
                cellRenderer: function(params) {
                    return getCellText(params.data, params.colDef.field.split("."));
                }
            };

            if(fieldObject.class) {
                config.cellClass = fieldObject.class;
            }

            if(hiddenFields[fieldObject.columnName]) {
                config.hide = true;
            }

            return config;
        });

        if($scope.functions.areExternalServicesActive()) {
            var externalAppColumn = {
                headerName: "",
                field: EXTERNAL_APP_FIELD_NAME,
                suppressSizeToFit: true,
                cellClass: 'centered',
                width: 20
            };

            columnDefinitions = [externalAppColumn].concat(columnDefinitions);
        }

        $scope.active.gridOptions.api.setColumnDefs(columnDefinitions);
        $scope.active.gridOptions.api.sizeColumnsToFit();
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

            $scope.functions.publish("data_table_select", {});

            $scope.active.gridOptions.api.deselectIndex(cell.rowIndex);
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

                $scope.active.gridOptions.api.selectIndex(cell.rowIndex, false);
                $scope.selectedRowId = cell.rowIndex;

                $scope.functions.publish("data_table_select", {
                    data: $scope.active.gridOptions.api.getSelectedRows()[0],
                    database: $scope.active.database.name,
                    table: $scope.active.table.name
                });
            });
        }
    };

    $scope.functions.addToQuery = function(query) {
        query.limit($scope.active.limit);
        if($scope.functions.isFieldValid($scope.active.sortByField)) {
            query.sortBy($scope.active.sortByField.columnName, $scope.active.sortDirection);
        }
        return query;
    };

    $scope.functions.updateData = function(data) {
        var tableData = data || [];

        if($scope.functions.areExternalServicesActive()) {
            tableData = addExternalLinksToColumnData(tableData);
        }

        $scope.active.count = tableData.length;
        $scope.active.total = tableData.length;
        tableData = neon.helpers.escapeDataRecursively(tableData);
        $scope.active.gridOptions.api.setRowData(tableData);

        if(tableData.length) {
            // Query for the total number of rows in the data.
            $scope.functions.queryAndUpdate({
                addToQuery: function(query) {
                    query.aggregate(neon.query.COUNT, '*', 'count');
                    return query;
                },
                updateData: function(data) {
                    $scope.active.total = data && data.length ? data[0].count : 0;
                }
            });

            $timeout(function() {
                linkifyRows(tableData);
            });
        }
    };

    /**
     * Creates and adds the external links to the given data and returns the data.
     * @param {Array} data
     * @method addExternalLinksToColumnData
     * @private
     * @return {Array}
     */
    var addExternalLinksToColumnData = function(data) {
        var idFieldName = $scope.bindings.idField || "_id";
        var idField = _.find($scope.active.fields, function(field) {
            return field.columnName === idFieldName;
        });

        if(idField) {
            var buttons = $scope.functions.createLinkButtons(idField, data);
            data.forEach(function(row, index) {
                row[EXTERNAL_APP_FIELD_NAME] = buttons[index];
            });
        }

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
                    row[key] = linkify.twitter(value);
                }
            });

            return row;
        });

        $scope.active.gridOptions.api.setRowData(linkedData);
    };

    $scope.functions.onThemeChanged = function(theme) {
        $scope.active.themeType = theme.type;
        return true;
    };

    /**
     * Opens or closes the ag-grid tool panel to allow for modifying table columns
     * @method toggleToolPanel
     */
    $scope.toggleToolPanel = function() {
        // TODO Logging
        $scope.active.gridOptions.api.showToolPanel($scope.active.gridOptions.showToolPanel);
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        var finalObject = {
            name: "Query_Results_Table",
            data: [{
                query: query,
                name: "queryResultsTable-" + exportId,
                fields: [],
                ignoreFilters: query.ignoreFilters_,
                selectionOnly: query.selectionOnly_,
                ignoredFilterIds: query.ignoredFilterIds_,
                type: "query"
            }]
        };
        $scope.functions.getUnsortedFields().forEach(function(field) {
            finalObject.data[0].fields.push({
                query: field.columnName,
                pretty: field.prettyName || field.columnName
            });
        });
        return finalObject;
    };

    var updateSort = function() {
        var sort = {
            colId: $scope.active.sortByField.columnName,
            sort: $scope.active.sortDirection === $scope.active.ASCENDING ? "asc" : "desc"
        };

        $scope.active.gridOptions.api.setSortModel([sort]);
    };

    $scope.handleChangeSortField = function() {
        updateSort();
        $scope.functions.logChangeAndUpdate("sortField", $scope.active.sortByField.columnName);
    };

    $scope.handleChangeSortDirection = function() {
        updateSort();
        $scope.functions.logChangeAndUpdate("sortDirection", $scope.active.sortDirection, "button");
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.logChangeAndUpdate("limit", $scope.active.limit, "button");
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.idField = $scope.bindings.idField || undefined;
        bindings.sortField = $scope.functions.isFieldValid($scope.active.sortByField) ? $scope.active.sortByField.columnName : undefined;
        bindings.sortDirection = $scope.active.sortDirection;
        bindings.limit = $scope.active.limit;
        return bindings;
    };

    $scope.functions.onResize = function() {
        // Force the grid to update its size so that when we tell it to calculate the column
        // widths it is using an up-to-date width.
        $scope.active.gridOptions.api.doLayout();
        $scope.active.gridOptions.api.sizeColumnsToFit();
    };

    //TODO text selection on cells -- https://github.com/ceolter/ag-grid/issues/87
}]);

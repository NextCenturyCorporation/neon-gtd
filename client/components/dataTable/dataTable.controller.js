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

angular.module('neonDemo.directives').controller('dataTableController', ['$scope', 'external', 'linkify', '$sce', '$timeout', function($scope, external, linkify, $sce, $timeout) {
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
    var unsortedFields = [];

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

    $scope.functions.onUpdateFields = function(datasetService) {
        $scope.fields.forEach(function(field) {
            if(field.hide) {
                hiddenFields[field.columnName] = true;
            }
        });

        var sortByFieldName = $scope.bindings.sortField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.SORT) || "";
        $scope.active.sortByField = _.find($scope.fields, function(field) {
            return field.columnName === sortByFieldName;
        }) || ($scope.fields.length ? $scope.fields[0] : datasetService.createBlankField());

        // Save the fields in the order they are defined in the dashboard configuration (so we can't use sorted $scope.fields) for the order of the columns.
        unsortedFields = datasetService.getFields($scope.active.database.name, $scope.active.table.name);
    };

    $scope.functions.onChangeField = function() {
        updateColumns();
    };

    /**
     * Queries for field names list and sets up table columns
     * @method updateColumns
     * @private
     */
    var updateColumns = function() {
        var columnDefinitions = _.map(unsortedFields, function(field) {
            var config = {
                field: field.columnName,
                headerName: field.prettyName,
                onCellClicked: handleRowClick,
                suppressSizeToFit: true,
                cellRenderer: function(params) {
                    return neon.helpers.getNestedValue(params.data, params.colDef.field);
                }
            };

            if(field.class) {
                config.cellClass = field.class;
            }

            if(hiddenFields[field.columnName]) {
                config.hide = true;
            }

            return config;
        });

        if(external.active) {
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

                $scope.functions.publish("data_table_select", {
                    data: $scope.active.gridOptions.rowData[cell.rowIndex],
                    database: $scope.active.database.name,
                    table: $scope.active.table.name
                });

                $scope.active.gridOptions.api.selectIndex(cell.rowIndex, false);
                $scope.selectedRowId = cell.rowIndex;
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

    $scope.functions.updateData = function(data) {
        data = escapeDataRecursively(data);

        if(external.active) {
            data = addExternalLinksToColumnData(data);
        }

        $scope.active.count = data.length;
        $scope.active.gridOptions.api.setRowData(data);

        if(data.length) {
            // Query for the total number of rows in the data.
            $scope.functions.queryAndUpdate(function(query) {
                query.aggregate(neon.query.COUNT, '*', 'count');
                return query;
            }, $scope.functions.executeQuery, function(data) {
                $scope.active.total = data.length ? data[0].count : 0
            });

            $timeout(function() {
                linkifyRows(data);
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
        var idField = _.find($scope.fields, function(field) {
            return field.columnName === idFieldName;
        });

        if(idField) {
            var links = $scope.functions.createLinkButtons(idField, data);
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
                    row[key] = $sce.trustAsHtml(linkify.twitter(value));
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
     * @method handleToggleToolPanel
     */
    $scope.handleToggleToolPanel = function() {
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
        unsortedFields.forEach(function(field) {
            finalObject.data[0].fields.push({
                query: field.columnName,
                pretty: field.prettyName || field.columnName
            });
        });
        return finalObject;
    };

    var handleChangeSort = function() {
        var sort = {
            colId: $scope.active.sortByField.columnName,
            sort: $scope.active.sortDirection === $scope.active.ASCENDING ? "asc" : "desc"
        };

        $scope.active.gridOptions.api.setSortModel([sort]);
    };

    $scope.handleChangeSortField = function() {
        handleChangeSort();
        $scope.functions.handleChangeField("sortField", $scope.active.sortByField.name);
    };

    $scope.handleChangeSortDirection = function() {
        handleChangeSort();
        $scope.functions.handleChangeField("sortDirection", $scope.active.sortDirection, "button");
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.handleChangeField("limit", $scope.active.limit, "button");
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings["bind-id-field"] = $scope.bindings.idField ? "'" + $scope.bindings.idField + "'" : undefined;
        bindings["bind-sort-field"] = ($scope.active.sortByField && $scope.active.sortByField.columnName) ? "'" + $scope.active.sortByField.columnName + "'" : undefined;
        bindings["bind-sort-direction"] = $scope.active.sortDirection;
        bindings["bind-limit"] = $scope.active.limit;
        return bindings;
    };

    //TODO text selection on cells -- https://github.com/ceolter/ag-grid/issues/87
}]);

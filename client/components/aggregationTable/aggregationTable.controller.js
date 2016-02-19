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

angular.module('neonDemo.controllers').controller('aggregationTableController', ['$scope', '$timeout', 'external', function($scope, $timeout, external) {
    // Unique field name used for the SlickGrid column containing the URLs for the external apps.
    // This name should be one that is highly unlikely to be a column name in a real database.
    var EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

    $scope.active.aggregation = $scope.bindings.aggregation || "count";
    $scope.active.aggregationField = {};
    $scope.active.filter = undefined;
    $scope.active.groupField = {};
    $scope.active.limit = $scope.bindings.limit || 100;

    var handleRowClick = function(cell) {
        if($scope.active.gridOptions.api.getSelectedNodes()[0] && $scope.active.gridOptions.api.getSelectedNodes()[0].id === cell.rowIndex) {
            $scope.active.gridOptions.api.deselectIndex(cell.rowIndex);
        } else {
            $scope.active.gridOptions.api.selectIndex(cell.rowIndex, false);
        }

        onAddFilter(cell.node.data[$scope.active.groupField.columnName]);
        $scope.functions.replaceFilter();
    };

    $scope.active.gridOptions = {
        columnDefs: [],
        rowData: [],
        enableColResize: true,
        enableSorting: true,
        showToolPanel: false,
        toolPanelSuppressPivot: true,
        toolPanelSuppressValues: true,
        suppressRowClickSelection: true
    };

    $scope.functions.onUpdateFields = function(datasetService) {
        var groupFieldName = $scope.bindings.groupField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.AGGREGATE) || "";
        $scope.active.groupField = _.find($scope.fields, function(field) {
            return field.columnName === groupFieldName;
        }) || datasetService.createBlankField();
        var aggregationFieldName = $scope.bindings.aggregationField || "";
        $scope.active.aggregationField = _.find($scope.fields, function(field) {
            return field.columnName === aggregationFieldName;
        }) || datasetService.createBlankField();
    };

    $scope.functions.onChangeDataOption = function() {
        updateColumns();
    };

    var updateColumns = function() {
        var columnDefinitions = [];

        if(external.active) {
            var externalAppColumn = {
                field: EXTERNAL_APP_FIELD_NAME,
                headerName: "",
                suppressSizeToFit: false,
                cellClass: 'centered',
                width: 30
            };

            columnDefinitions.push(externalAppColumn);
        }

        columnDefinitions.push({
            headerName: $scope.active.groupField.prettyName,
            field: $scope.active.groupField.columnName,
            suppressSizeToFit: false,
            onCellClicked: handleRowClick
        });

        var columnName = $scope.active.aggregation;
        if($scope.active.aggregation !== 'count') {
            columnName += ' ' + $scope.active.aggregationField.prettyName;
        }

        columnDefinitions.push({
            headerName: columnName,
            field: $scope.active.aggregation,
            suppressSizeToFit: false,
            onCellClicked: handleRowClick
        });

        $scope.active.gridOptions.api.setColumnDefs(columnDefinitions);
        $scope.active.gridOptions.api.sizeColumnsToFit();
    };

    $scope.functions.hasValidDataFields = function(datasetService) {
        return datasetService.isFieldValid($scope.active.groupField) && ($scope.active.aggregation === "count" || datasetService.isFieldValid($scope.active.aggregationField));
    };

    $scope.functions.createNeonQueryClause = function() {
        return neon.query.where($scope.active.groupField.columnName, "!=", null);
    };

    $scope.functions.addToQuery = function(query, filterService) {
        if($scope.functions.isFilterSet()) {
            var filterClause = $scope.functions.createNeonFilterClause({
                database: $scope.active.database.name,
                table: $scope.active.table.name
            }, $scope.active.groupField.columnName);
            query.ignoreFilters([filterService.getFilterKey($scope.active.database.name, $scope.active.table.name, filterClause)]);
        }

        if($scope.active.aggregation === "count") {
            query.aggregate(neon.query.COUNT, '*', 'count');
            query.sortBy('count', neon.query.DESCENDING);
        }

        if($scope.active.aggregation === "min") {
            query.aggregate(neon.query.MIN, $scope.active.aggregationField.columnName, $scope.active.aggregation);
            query.sortBy($scope.active.aggregation, neon.query.ASCENDING);
        }

        if($scope.active.aggregation === "max") {
            query.aggregate(neon.query.MAX, $scope.active.aggregationField.columnName, $scope.active.aggregation);
            query.sortBy($scope.active.aggregation, neon.query.DESCENDING);
        }

        if($scope.active.limit) {
            query.limit($scope.active.limit);
        }

        return query.groupBy($scope.active.groupField.columnName);
    };

    $scope.functions.updateData = function(data) {
        if(external.active) {
            data = addExternalLinksToColumnData(data);
        }

        data = _.map(data, function(row) {
            delete row._id;
            return row;
        });

        $scope.active.showTooMuchDataError = false;
        $scope.active.dataLength = data.length;
        $scope.active.queryLimit = $scope.active.limit;
        $scope.active.gridOptions.api.setRowData(data);

        if($scope.functions.isFilterSet() && data.length) {
            selectRow($scope.active.filter);
        }
    };

    /**
     * Selects the row in the table containing the given value in the global group field.
     * @param {String} value
     * @method selectRow
     * @private
     */
    var selectRow = function(value) {
        var selected = _.findWhere($scope.active.gridOptions.api.getRenderedNodes(), function(node) {
            return node.data[$scope.active.groupField.columnName] === value;
        });
        if(selected) {
            $scope.active.gridOptions.api.selectNode(selected);
        }
    };

    $scope.functions.isFilterSet = function() {
        return $scope.active.filter;
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.groupField];
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        return neon.query.where(fieldName, "=", $scope.active.filter);
    };

    $scope.functions.createFilterTrayText = function() {
        return $scope.active.filter ? $scope.active.groupField.columnName + " = " + $scope.active.filter : "";
    };

    $scope.functions.updateFilterFromNeonFilterClause = function(filterService, neonFilter) {
        if(filterService.hasSingleClause(neonFilter)) {
            onAddFilter(neonFilter.filter.whereClause.rhs);
        }
    };

    var onAddFilter = function(value) {
        $scope.active.filter = value;
        selectRow(value);
    };

    $scope.functions.onRemoveFilter = function() {
        $scope.active.filter = undefined;
        $scope.active.gridOptions.api.deselectAll();
    };

    /**
     * Removes the filter set on the given value.
     * @param {String} value
     * @method removeFilter
     */
    $scope.removeFilter = function(value) {
        $scope.functions.removeFilter({
            field: $scope.active.groupField.columnName,
            value: value
        });
    };

    $scope.functions.onError = function(response, errorCodes) {
        if(response.responseJSON.error === errorCodes.TOO_MUCH_DATA_ERROR) {
            $scope.$apply(function() {
                $scope.active.showTooMuchDataError = true;
            });
        }
    };

    $scope.functions.onThemeChanged = function(theme) {
        $scope.active.themeType = theme.type;
        return true;
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        var finalObject = {
            name: "Aggregation_Table",
            data: [{
                query: query,
                name: "aggregationTable-" + exportId,
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
        if($scope.active.aggregation === 'min') {
            op = 'Min of ';
        } else if($scope.active.aggregation === 'max') {
            op = 'Max of ';
        }
        finalObject.data[0].fields.push({
            query: (query.aggregates[0]).name,
            pretty: op + (query.aggregates[0]).name
        });
        return finalObject;
    };

    /**
     * Creates and adds the external links to the given data and returns the data.
     * @param {Array} data
     * @method addExternalLinksToColumnData
     * @private
     * @return {Array}
     */
    var addExternalLinksToColumnData = function(data) {
        var buttons = $scope.functions.createLinkButtons($scope.active.groupField, data);
        data.forEach(function(row, index) {
            row[EXTERNAL_APP_FIELD_NAME] = buttons[index];
        });
        return data;
    };

    $scope.handleChangeGroupField = function() {
        $scope.functions.logChangeAndUpdateData("groupField", $scope.active.groupField.columnName);
    };

    $scope.handleChangeAggregation = function() {
        $scope.functions.logChangeAndUpdateData("aggregation", $scope.active.aggregation);
    };

    $scope.handleChangeAggregationField = function() {
        $scope.functions.logChangeAndUpdateData("aggregationField", $scope.active.aggregationField.columnName);
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.logChangeAndUpdateData("limit", $scope.active.limit, "button");
    };

    $scope.functions.createMenuText = function() {
        if($scope.active.showTooMuchDataError) {
            return "Error";
        }
        return ($scope.active.dataLength >= $scope.active.queryLimit ? "Limited to " : "") + ($scope.active.dataLength || "No") + " Groups";
    };

    $scope.functions.showMenuText = function() {
        return true;
    };

    $scope.getFilterData = function() {
        return $scope.active.filter ? [$scope.active.filter] : [];
    };

    $scope.createFilterDesc = function(value) {
        return $scope.active.groupField.columnName + " = " + value;
    };

    $scope.functions.hideHeaders = function() {
        return !$scope.functions.isFilterSet() && !$scope.active.showTooMuchDataError;
    };

    $scope.functions.addToBindings = function(bindings) {
        // TODO Update to use the new binding system.
        bindings["bind-aggregation"] = $scope.active.aggregation ? "'" + $scope.active.aggregation + "'" : undefined;
        var hasAggField = $scope.active.aggregation && $scope.active.aggregation !== 'count' && $scope.active.aggregationField && $scope.active.aggregationField.columnName;
        bindings["bind-aggregation-field"] = hasAggField ? "'" + $scope.active.aggregationField.columnName + "'" : undefined;
        bindings["bind-group-field"] = ($scope.active.groupField && $scope.active.groupField.columnName) ? "'" + $scope.active.groupField.columnName + "'" : undefined;
        bindings["bind-limit"] = $scope.active.limit;
        return bindings;
    };
}]);

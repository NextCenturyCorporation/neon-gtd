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
angular.module('neonDemo.controllers').controller('aggregationTableController', ['$scope', 'external', 'LinksPopupService', function($scope, external, linksPopupService) {
    $scope.active.aggregation = $scope.bindings.aggregation || "count";
    $scope.active.aggregationField = {};
    $scope.active.dataField = {};
    $scope.active.limit = $scope.bindings.limit || 500;

    // Unique field name used for the SlickGrid column containing the URLs for the external apps.
    // This name should be one that is highly unlikely to be a column name in a real database.
    $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

    var handleRowClick = function(cell) {
        if($scope.active.gridOptions.api.getSelectedNodes()[0] && $scope.active.gridOptions.api.getSelectedNodes()[0].id === cell.rowIndex) {
            $scope.active.gridOptions.api.deselectIndex(cell.rowIndex);
        } else {
            $scope.active.gridOptions.api.selectIndex(cell.rowIndex, false);
        }

        $scope.functions.addFilter({
            field: $scope.active.dataField.columnName,
            value: cell.node.data[$scope.active.dataField.columnName]
        });
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

    $scope.functions.onDestroy = function() {
        linksPopupService.deleteLinks($scope.visualizationId);
    };

    $scope.functions.onUpdateFields = function(datasetService) {
        var dataFieldName = $scope.bindings.groupField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.AGGREGATE) || "";
        $scope.active.dataField = _.find($scope.fields, function(field) {
            return field.columnName === dataFieldName;
        }) || datasetService.createBlankField();
        var aggregationFieldName = $scope.bindings.aggregationField || "";
        $scope.active.aggregationField = _.find($scope.fields, function(field) {
            return field.columnName === aggregationFieldName;
        }) || datasetService.createBlankField();
    };

    $scope.functions.onChangeField = function() {
        updateColumns();
    };

    var updateColumns = function() {
        var columnDefinitions = [];

        if(external.active) {
            var externalAppColumn = {
                headerName: "",
                field: $scope.EXTERNAL_APP_FIELD_NAME,
                suppressSizeToFit: false,
                cellClass: 'centered',
                width: 30
            };

            columnDefinitions.push(externalAppColumn);
        }

        columnDefinitions.push({
            headerName: $scope.active.dataField.prettyName,
            field: $scope.active.dataField.columnName,
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
        return datasetService.isFieldValid($scope.active.dataField) && ($scope.active.aggregation === "count" || datasetService.isFieldValid($scope.active.aggregationField));
    };

    $scope.functions.createQueryClause = function() {
        return neon.query.where($scope.active.dataField.columnName, "!=", null);
    };

    $scope.functions.addToQuery = function(query, filterService) {
        if($scope.filter) {
            var filterClause = $scope.functions.createNeonFilterClause({
                database: $scope.active.database.name,
                table: $scope.active.table.name
            }, $scope.active.dataField.columnName);
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

        return query.groupBy($scope.active.dataField.columnName);
    };

    $scope.functions.updateData = function(data) {
        if(external.active) {
            data = addExternalLinksToColumnData(data);
        }

        $scope.active.showTooMuchDataError = false;
        $scope.active.count = data.length;
        $scope.active.gridOptions.api.setRowData(stripIdField(data));

        if($scope.filter && data.length) {
            var selected = _.findWhere($scope.active.gridOptions.api.getRenderedNodes(), function(node) {
                return node.data[$scope.filter.field] === $scope.filter.value;
            });
            $scope.active.gridOptions.api.selectNode(selected);
        }
    };

    var stripIdField = function(data) {
        return _.map(data, function(row) {
            delete row._id;
            return row;
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

    $scope.functions.createExportDataObject = function(query) {
        var finalObject = {
            name: "Aggregation_Table",
            data: [{
                query: query,
                name: "aggregationTable-" + $scope.exportID,
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

    $scope.functions.getFilterableFields = function() {
        return [$scope.active.dataField];
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        return neon.query.where(fieldName, '=', $scope.filter.value);
    };

    $scope.functions.onRemoveFilter = function() {
        $scope.active.gridOptions.api.deselectAll();
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
            var value = row[$scope.active.dataField.columnName];
            var key = linksPopupService.generateKey($scope.active.dataField, value);
            tableLinks[key] = linksPopupService.createAllServiceLinkObjects(external.services, mappings, $scope.active.dataField.columnName, value);
            row[$scope.EXTERNAL_APP_FIELD_NAME] = tableLinks[key].length ? linksPopupService.createLinkHtml($scope.visualizationId, key, value) : linksPopupService.createDisabledLinkHtml(value);
        });

        // Set the link data for the links popup for this visualization.
        linksPopupService.setLinks($scope.visualizationId, tableLinks);

        return data;
    };

    $scope.handleChangeDataField = function() {
        $scope.functions.handleChangeField("data-field", $scope.active.dataField.columnName);
    };

    $scope.handleChangeAggregation = function() {
        $scope.functions.handleChangeField("aggregation", $scope.active.aggregation);
    };

    $scope.handleChangeAggregationField = function() {
        $scope.functions.handleChangeField("aggregation-field", $scope.active.aggregationField.columnName);
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.handleChangeField("limit", $scope.active.limit, "button");
    };

    $scope.functions.addToBindings = function(bindings) {
        // TODO Update to use the new binding system.
        bindings["bind-aggregation"] = $scope.active.aggregation ? "'" + $scope.active.aggregation + "'" : undefined;
        var hasAggField = $scope.active.aggregation && $scope.active.aggregation !== 'count' && $scope.active.aggregationField && $scope.active.aggregationField.columnName;
        bindings["bind-aggregation-field"] = hasAggField ? "'" + $scope.active.aggregationField.columnName + "'" : undefined;
        bindings["bind-group-field"] = ($scope.active.dataField && $scope.active.dataField.columnName) ? "'" + $scope.active.dataField.columnName + "'" : undefined;
        bindings["bind-limit"] = $scope.active.limitCount;
        return bindings;
    };
}]);

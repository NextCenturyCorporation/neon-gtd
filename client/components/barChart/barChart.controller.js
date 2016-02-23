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

angular.module('neonDemo.controllers').controller('barChartController', ['$scope', function($scope) {
    var COUNT_FIELD_NAME = 'Count';

    $scope.chart = undefined;

    $scope.active.aggregation = $scope.bindings.aggregation || "count";
    $scope.active.aggregationField = {};
    $scope.active.groupField = {};
    $scope.active.limit = $scope.bindings.limit || 100;

    $scope.functions.createMenuText = function() {
        if($scope.queryLimit > 0) {
            return "Limited to " + $scope.queryLimit + " Bars";
        }
        return "";
    };

    $scope.functions.showMenuText = function() {
        return $scope.queryLimit > 0;
    };

    $scope.functions.onResize = function() {
        if($scope.chart) {
            $scope.chart.draw();
        }
    };

    $scope.functions.onInit = function() {
        $scope.functions.updateData([]);
    };

    $scope.handleChangeAggregation = function() {
        $scope.functions.logChangeAndUpdateData("aggregation", $scope.active.aggregation);
    };

    $scope.handleChangeAggregationField = function() {
        $scope.functions.logChangeAndUpdateData("aggregationField", $scope.active.aggregationField.columnName);
    };

    $scope.handleChangeGroupField = function() {
        $scope.functions.logChangeAndUpdateData("groupField", $scope.active.groupField.columnName);
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.logChangeAndUpdateData("limit", $scope.active.limit);
    };

    $scope.functions.updateFilterFromNeonFilterClause = function(neonFilter) {
        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 1) {
            onAddFilter(neonFilter.filter.whereClause.rhs);
        }
    };

    /**
     * Performs additional behavior needed for this visualization to add a filter on the given value.
     * @param {String} value
     * @method onAddFilter
     */
    var onAddFilter = function(value) {
        $scope.filter = value;
        var links = $scope.functions.createLinks($scope.active.groupField, value);
        $scope.showLinksPopupButton = !!links.length;
    };

    $scope.functions.onRemoveFilter = function() {
        $scope.filter = undefined;
        $scope.chart.clearSelectedBar();
        $scope.functions.removeLinks();
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.groupField = $scope.functions.findFieldObject("groupField", neonMappings.BAR_GROUPS);
        $scope.active.aggregationField = $scope.functions.findFieldObject("groupField", neonMappings.BAR_GROUPS);
    };

    $scope.functions.createNeonQueryClause = function() {
        return neon.query.where($scope.active.groupField.columnName, '!=', null);
    };

    $scope.functions.addToQuery = function(query) {
        query.limit($scope.active.limit).groupBy($scope.active.groupField);

        if($scope.filter) {
            var filterClause = $scope.functions.createNeonFilterClause({
                database: $scope.active.database.name,
                table: $scope.active.table.name
            }, $scope.active.groupField.columnName);
            query.ignoreFilters([$scope.functions.getFilterKey(filterClause)]);
        }

        if($scope.active.aggregation === 'count') {
            query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
        } else if($scope.active.aggregation === 'sum') {
            query.aggregate(neon.query.SUM, $scope.active.aggregationField.columnName, COUNT_FIELD_NAME);
        } else if($scope.active.aggregation === 'average') {
            query.aggregate(neon.query.AVG, $scope.active.aggregationField.columnName, COUNT_FIELD_NAME);
        }

        query.sortBy(COUNT_FIELD_NAME, neon.query.DESCENDING);
        return query;
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        return neon.query.where(fieldName, '=', $scope.filter);
    };

    /**
     * Removes the filter on the given value from this visualization.
     * @param {String} value
     * @method removeFilter
     */
    $scope.removeFilter = function(value) {
        $scope.functions.removeFilter({
            field: $scope.active.groupField.columnName,
            value: value
        });
    };

    $scope.functions.updateData = function(data) {
        var opts = {
            data: data,
            x: $scope.active.groupField.columnName,
            y: COUNT_FIELD_NAME,
            responsive: false,
            selectedKey: $scope.filter,
            clickHandler: function(value) {
                onAddFilter(value);
                $scope.functions.replaceFilter();
            }
        };

        if($scope.chart) {
            $scope.chart.destroy();
        }

        $scope.chart = new charts.BarChart($scope.functions.getElement()[0], '.barchart', opts);
        $scope.chart.draw();

        // Save the limit for the most recent query to show in the options menu button text.
        // Don't use the current limit because that may be changed to a different number.
        $scope.queryLimit = data.length >= $scope.active.limit ? $scope.active.limit : 0;
    };

    /**
     * Creates and returns the text for the legend.
     * @method getLegendText
     * @return {String}
     */
    $scope.getLegendText = function() {
        if($scope.functions.isFieldValid($scope.active.groupField)) {
            if($scope.active.aggregation === "average" && $scope.functions.isFieldValid($scope.active.aggregationField)) {
                return "Average " + $scope.active.aggregationField.prettyName + " vs. " + $scope.active.groupField.prettyName;
            }
            if($scope.active.aggregation === "sum" && $scope.functions.isFieldValid($scope.active.aggregationField)) {
                return "Sum " + $scope.active.aggregationField.prettyName + " vs. " + $scope.active.groupField.prettyName;
            }
            if($scope.active.aggregation === "count") {
                return "Count of " + $scope.active.groupField.prettyName;
            }
        }
        return "";
    };

    $scope.functions.hasValidDataFields = function() {
        return $scope.functions.isFieldValid($scope.active.groupField);
    };

    $scope.functions.isFilterSet = function() {
        return $scope.filter;
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.groupField];
    };

    $scope.functions.createFilterTrayText = function() {
        return $scope.filter ? $scope.active.groupField.columnName + " = " + $scope.filter : "";
    };

    $scope.functions.hideHeaders = function() {
        return false;
    };

    $scope.getFilterData = function() {
        return $scope.filter ? [$scope.filter] : [];
    };

    $scope.createFilterDesc = function(value) {
        return $scope.active.groupField.columnName + " = " + value;
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        var capitalizeFirstLetter = function(str) {
            var first = str[0].toUpperCase();
            return first + str.slice(1);
        };
        var finalObject = {
            name: "Bar_Chart",
            data: [{
                query: query,
                name: "barchart-" + exportId,
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
        if($scope.active.aggregation === "average") {
            finalObject.data[0].fields.push({
                query: COUNT_FIELD_NAME,
                pretty: "Average of " + query.aggregates[0].field
            });
        }
        if($scope.active.aggregation === "sum") {
            finalObject.data[0].fields.push({
                query: COUNT_FIELD_NAME,
                pretty: "Sum of " + query.aggregates[0].field
            });
        }
        if($scope.active.aggregation === "count") {
            finalObject.data[0].fields.push({
                query: COUNT_FIELD_NAME,
                pretty: "Count"
            });
        }
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.aggregation = $scope.active.aggregation || undefined;
        bindings.groupField = $scope.functions.isFieldValid($scope.options.groupField) ? $scope.options.groupField.columnName : undefined;
        var hasAggField = $scope.active.aggregation && $scope.active.aggregation !== 'count' && $scope.functions.isFieldValid($scope.active.aggregationField);
        bindings.aggregationField = hasAggField ? $scope.active.aggregationField.columnName : undefined;
        bindings.limit = $scope.active.limit;
        return bindings;
    };

    /**
     * Generates and returns the links popup key for this visualization.
     * @method generateLinksPopupKey
     * @return {String}
     */
    $scope.generateLinksPopupKey = function(value) {
        return $scope.functions.getLinksPopupService().generateKey($scope.active.groupField, value);
    };
}]);

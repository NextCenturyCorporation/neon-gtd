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
 * This visualization shows aggregated data in a bar chart.
 * @namespace neonDemo.controllers
 * @class barChartController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('barChartController', ['$scope', function($scope) {
    var COUNT_FIELD_NAME = 'Count';

    $scope.chart = undefined;

    $scope.active.aggregation = $scope.bindings.aggregationType || "count";
    $scope.active.aggregationField = {};
    $scope.active.groupField = {};
    $scope.active.limit = $scope.bindings.limit || 100;
    $scope.active.aggregateArraysByElement = false;

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
        $scope.functions.logChangeAndUpdate("aggregation", $scope.active.aggregation);
    };

    $scope.handleChangeAggregationField = function() {
        $scope.functions.logChangeAndUpdate("aggregationField", $scope.active.aggregationField.columnName);
    };

    $scope.handleChangeGroupField = function() {
        $scope.functions.logChangeAndUpdate("groupField", $scope.active.groupField.columnName);
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.logChangeAndUpdate("limit", $scope.active.limit);
    };

    $scope.handleChangeAggregateArraysByElement = function() {
        $scope.functions.logChangeAndUpdate("aggregateArraysByElement", $scope.active.aggregateArraysByElement);
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 1) {
            $scope.filter = neonFilter.filter.whereClause.rhs;
            updateLinks();
        }
    };

    var updateLinks = function() {
        $scope.showLinksPopupButton = !!($scope.functions.createLinks($scope.active.groupField, $scope.filter).length);
    };

    $scope.functions.removeFilterValues = function() {
        $scope.filter = undefined;
        $scope.chart.clearSelectedBar();
        $scope.functions.removeLinks();
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.groupField = $scope.functions.findFieldObject("groupField", neonMappings.BAR_GROUPS);
        $scope.active.aggregationField = $scope.functions.findFieldObject("aggregationField", neonMappings.Y_AXIS);
    };

    $scope.functions.createNeonQueryWhereClause = function() {
        return neon.query.where($scope.active.groupField.columnName, '!=', null);
    };

    $scope.functions.addToQuery = function(query) {
        if($scope.filter) {
            var filterClause = $scope.functions.createNeonFilterClause({
                database: $scope.active.database.name,
                table: $scope.active.table.name
            }, $scope.active.groupField.columnName);
            query.ignoreFilters([$scope.functions.getFilterKey(filterClause)]);
        }

        if($scope.active.aggregation === 'count') {
            COUNT_FIELD_NAME = "Count";
            query.aggregate(neon.query.COUNT, '*', COUNT_FIELD_NAME);
        } else if($scope.active.aggregation === 'sum') {
            COUNT_FIELD_NAME = "Sum";
            query.aggregate(neon.query.SUM, $scope.active.aggregationField.columnName, COUNT_FIELD_NAME);
        } else if($scope.active.aggregation === 'average') {
            COUNT_FIELD_NAME = "Average";
            query.aggregate(neon.query.AVG, $scope.active.aggregationField.columnName, COUNT_FIELD_NAME);
        }

        if($scope.active.aggregateArraysByElement) {
            query.enableAggregateArraysByElement();
        }

        return query.limit($scope.active.limit).groupBy($scope.active.groupField).sortBy(COUNT_FIELD_NAME, neon.query.DESCENDING);
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        return neon.query.where(fieldName, '=', $scope.filter);
    };

    /**
     * Removes the filter on the given value from this visualization.
     * @param {String} value
     * @method removeFilter
     */
    $scope.removeFilter = function() {
        $scope.functions.removeNeonFilter();
    };

    $scope.functions.updateData = function(data) {
        var opts = {
            data: data || [],
            x: $scope.active.groupField.columnName,
            y: COUNT_FIELD_NAME,
            responsive: false,
            selectedKey: $scope.filter,
            clickHandler: function(value) {
                $scope.filter = value;
                updateLinks();
                $scope.functions.updateNeonFilter();
            }
        };

        if($scope.chart) {
            $scope.chart.destroy();
        }

        $scope.chart = new charts.BarChart($scope.functions.getElement()[0], '.barchart', opts);
        $scope.chart.draw();

        // Save the limit for the most recent query to show in the options menu button text.
        // Don't use the current limit because that may be changed to a different number.
        $scope.queryLimit = data && data.length >= $scope.active.limit ? $scope.active.limit : 0;
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

    $scope.functions.areDataFieldsValid = function() {
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
        bindings.aggregationType = $scope.active.aggregation || undefined;
        bindings.groupField = $scope.functions.isFieldValid($scope.active.groupField) ? $scope.active.groupField.columnName : undefined;
        var hasAggField = $scope.active.aggregation && $scope.active.aggregation !== 'count' && $scope.functions.isFieldValid($scope.active.aggregationField);
        bindings.aggregationField = hasAggField ? $scope.active.aggregationField.columnName : undefined;
        bindings.limit = $scope.active.limit;
        return bindings;
    };

    /**
     * Generates and returns the links popup key for this visualization.
     * @method getLinksPopupKey
     * @return {String}
     */
    $scope.getLinksPopupKey = function(value) {
        return $scope.functions.getLinksPopupService().generateKey($scope.active.groupField, value);
    };
}]);

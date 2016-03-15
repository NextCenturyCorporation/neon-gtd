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
 * The sample visualization displays the set of unique values from the selected data field and allows the user to create a filter on any value.
 * @namespace neonDemo.controllers
 * @class sampleController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('sampleController', ['$scope', function($scope) {
    // The current filter for this visualization.  Some visualizations may not use a filter and others may use multiple (this example only uses one).
    $scope.filter = undefined;

    // Often the visualization will want to save the data from its most recent query for ongoing interaction through its display.
    // Must be in the "active" object to be passed to the HTML templates.
    $scope.active.data = [];

    // Options available through the options menu for this visualization (the gear icon).
    // Must be in the "active" object to be passed to the options menu HTML template.
    $scope.active.dataField = {};

    // Functions defined on $scope.functions override default/stub implementations in the superclass directive.
    // See the Single Table Visualization API for documentation on all of the available functions.
    $scope.functions.isFilterSet = function() {
        return $scope.filter;
    };

    $scope.functions.areDataFieldsValid = function() {
        return $scope.functions.isFieldValid($scope.active.dataField);
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.dataField];
    };

    // The following two functions display text next to the options menu in the upper right corner of the visualization (the gear icon).
    $scope.functions.createMenuText = function() {
        return ($scope.active.data.length || "No") + ($scope.active.data.length === 1 ? " result " : " results");
    };

    $scope.functions.showMenuText = function() {
        return true;
    };

    // Called during filters-changed events for filters on this visualization's filter field ($scope.active.dataField).
    $scope.functions.updateFilterValues = function(neonFilter) {
        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 1) {
            $scope.filter = neonFilter.filter.whereClause.rhs;
        }
    };

    $scope.functions.removeFilterValues = function() {
        $scope.filter = undefined;
    };

    // Set the default data fields to use in this visualization.  Check if bindings were set in the dashboard configuration file.
    $scope.functions.onUpdateFields = function() {
        $scope.active.dataField = $scope.functions.findFieldObject("dataField");
    };

    // Create and return the default where clause for queries for  this visualization.
    $scope.functions.createNeonQueryWhereClause = function() {
        return neon.query.where($scope.active.dataField.columnName, "!=", null);
    };

    // Add to the given Neon query object to build the default data query for this visualization.
    $scope.functions.addToQuery = function(query) {
        // TODO Replace the follwing code with your own query properties.
        query.groupBy($scope.active.dataField);
        query.aggregate(neon.query.COUNT, '*', 'count');
        query.sortBy('count', neon.query.DESCENDING);

        if($scope.filter) {
            var filterClause = $scope.functions.createNeonFilterClause({
                    database: $scope.active.database.name,
                    table: $scope.active.table.name
                }, $scope.active.dataField.columnName);

            // Some visualizations will ignore their own filters and display unfiltered values differently than filtered values (like changing their color or font).
            query.ignoreFilters([$scope.functions.getFilterKey(filterClause)]);
        }

        return query;
    };

    // Update the display for this visualization with the given query response data or reset the visualization if the data is empty.
    $scope.functions.updateData = function(data) {
        // TODO Display the rows returned by the query (results.data) in the visualization.
        $scope.active.data = data || [];
    };

    $scope.addFilter = function(value) {
        // Save the filter for this visualization which will be shown in the display and used in the createNeonFilterClause function.
        $scope.filter = value;
        // Update the dashboard filter for this visualization with the value in $scope.filter through the createNeonFilterClause function.
        $scope.functions.updateNeonFilter();
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        // The field name may change depending on the related database/table but the value is always the one from the filter.
        return neon.query.where(fieldName, '=', $scope.filter);
    };

    $scope.functions.createFilterTrayText = function() {
        return $scope.active.dataField.columnName + " = " + $scope.filter;
    };

    $scope.removeFilter = function() {
        // Remove the dashboard filter for this visualization.
        $scope.functions.removeNeonFilter();
    };

    $scope.handleChangeDataField = function() {
        // Log the change of the data field option, query for new data, and update the visualization display.
        $scope.functions.logChangeAndUpdate("dataField", $scope.active.dataField.columnName);
    };

    // The following two functions display the active filter in the filter notification directive.
    $scope.getFilterData = function() {
        return $scope.filter ? [$scope.filter] : [];
    };

    $scope.createFilterDesc = function(value) {
        return $scope.active.dataField.columnName + " = " + value;
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        // Add all fields to be contained in the exported table.
        var fields = [{
            // The name matching the field in the database.
            query: $scope.active.dataField.columnName,
            // The name to display in the dashboard.
            pretty: $scope.active.dataField.prettyName
        }];

        var finalObject = {
            name: "Sample",
            data: [{
                query: query,
                name: "sample-" + exportId,
                fields: fields,
                ignoreFilters: query.ignoreFilters_,
                selectionOnly: query.selectionOnly_,
                ignoredFilterIds: query.ignoredFilterIds_,
                type: "query"
            }]
        };

        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.dataField = $scope.functions.isFieldValid($scope.active.dataField) ? $scope.active.dataField.columnName : undefined;
        return bindings;
    };
}]);

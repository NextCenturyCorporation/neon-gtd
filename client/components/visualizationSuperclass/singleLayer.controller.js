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

angular.module('neonDemo.controllers').controller('singleLayerController', ['$scope', '$controller', 'DatasetService', function($scope, $controller, datasetService) {
    $controller('visualizationSuperclassController', { $scope: $scope });

    // All needed properties will be defined in $scope.active.
    $scope.active.layers = undefined;

    // The data for all single layer visualizations will be filterable (needed for superclass functions).
    $scope.active.filterable = true;

    // Use the resize behavior defined in the options-menu directive.
    $scope.resizeOptionsMenu = undefined;

    // Always return true for single layer visualizations.
    $scope.functions.needToUpdateFilter = function() {
        return true;
    };

    // Save the original functions to call in their overwritten versions.
    var createLinks = $scope.functions.createLinks;
    var getColorMaps = $scope.functions.getColorMaps;
    var getFilterKey = $scope.functions.getFilterKey;
    var getMapping = $scope.functions.getMapping;
    var getUnsortedFields = $scope.functions.getUnsortedFields;

    /******************** SUBCLASS ABSTRACT FUNCTIONS ********************/

    /**
     * Creates and returns an object containing the data needed to export this visualization.
     * @method createExportDataObject
     * @param {String} exportId
     * @param {neon.query.Query} query
     * @return {Object}
     */
    $scope.functions.createExportDataObject = function() {
        return {};
    };

    /******************** SUBCLASS UTILITY FUNCTIONS ********************/

    $scope.functions.createLinks = function(field, value) {
        return createLinks($scope.active.database.name, $scope.active.table.name, field, value);
    };

    /**
     * Finds and returns the field object in the global list of fields that matches the binding or mapping with the given key.
     * Returns a blank field object if no such field exists.
     * @method findFieldObject
     * @param {String} bindingKey
     * @param {String} mappingKey
     * @return {Object}
     */
    $scope.functions.findFieldObject = function(bindingKey, mappingKey) {
        var find = function(name) {
            return _.find($scope.active.fields, function(field) {
                return field.columnName === name;
            });
        };

        var field;
        if(bindingKey) {
            field = find($scope.bindings[bindingKey]);
        }

        if(!field && mappingKey) {
            field = find($scope.functions.getMapping(mappingKey));
        }

        return field || datasetService.createBlankField();
    };

    /**
     * Returns the color maps for the field with the given name.
     * @method getColorMaps
     * @param {String} fieldName
     * @return {Object}
     */
    $scope.functions.getColorMaps = function(fieldName) {
        return getColorMaps($scope.active, fieldName);
    };

    /**
     * Returns the filter key for the given filter clause.
     * @method getFilterKey
     * @param {Object} filterClause
     * @return {String}
     */
    $scope.functions.getFilterKey = function(filterClause) {
        return getFilterKey($scope.active, filterClause);
    };

    /**
     * Returns the mapping for the given key or any empty string if no mapping exists.
     * @method getMapping
     * @param {String} key
     * @return {String}
     */
    $scope.functions.getMapping = function(key) {
        return getMapping($scope.active.database.name, $scope.active.table.name, key);
    };

    /**
     * Returns the list of unsorted fields (in the order they are defined in the dashboard configuration).
     * @method getUnsortedFields
     * @return {Array}
     */
    $scope.functions.getUnsortedFields = function() {
        return getUnsortedFields($scope.active);
    };

    /************************* SUPERCLASS FUNCTIONS *************************/

    $scope.initData = function() {
        updateDatabases();
    };

    /**
     * Gets the list of databases from the dataset service, sets the active database, table, and fields, and queries for new data.
     * @method updateDatabases
     * @private
     */
    var updateDatabases = function() {
        $scope.active.databases = datasetService.getDatabases();
        $scope.active.database = $scope.active.databases[0];
        if($scope.bindings.database) {
            $scope.active.databases.forEach(function(database) {
                if($scope.bindings.database === database.name) {
                    $scope.active.database = database;
                }
            });
        }

        updateTables();
    };

    /**
     * Gets the list of tables from the dataset service, sets the active table and fields, and queries for new data.
     * @method updateTables
     * @private
     */
    var updateTables = function() {
        $scope.active.tables = datasetService.getTables($scope.active.database.name);
        $scope.active.table = $scope.active.tables[0];
        if($scope.bindings.table) {
            $scope.active.tables.forEach(function(table) {
                if($scope.bindings.table === table.name) {
                    $scope.active.table = table;
                }
            });
        }

        updateFields();
    };

    /**
     * Gets the list of fields from the dataset service, sets the active fields, and queries for new data.
     * @method updateFields
     * @private
     */
    var updateFields = function() {
        // Sort the fields that are displayed in the dropdowns in the options menus alphabetically.
        $scope.active.fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);

        $scope.active.unsharedFilterField = $scope.functions.findFieldObject("unsharedFilterField");
        $scope.active.unsharedFilterValue = $scope.bindings.unsharedFilterValue || "";

        $scope.functions.onUpdateFields();
        $scope.functions.onChangeOption();
    };

    // Overwrite to return the active properties as the single data layer for this visualization.
    $scope.getDataLayers = function() {
        return [$scope.active];
    };

    // Overwrite to add the config for the single data layer as properties to the bindings object instead of in a config array.
    $scope.addLayerConfigToBindings = function(bindings) {
        var hasUnsharedFilter = $scope.functions.isFieldValid($scope.active.unsharedFilterField) && $scope.active.unsharedFilterValue;

        bindings.database = ($scope.active.database && $scope.active.database.name) ? $scope.active.database.name : undefined;
        bindings.unsharedFilterField = hasUnsharedFilter ? $scope.active.unsharedFilterField.columnName : undefined;
        bindings.unsharedFilterValue = hasUnsharedFilter ? $scope.active.unsharedFilterValue : undefined;
        bindings.table = ($scope.active.table && $scope.active.table.name) ? $scope.active.table.name : undefined;

        return bindings;
    };

    /************************* ANGULAR FUNCTIONS *************************/

    // Overwrite to include more information in the visualization title.
    $scope.createTitle = function(resetQueryTitle) {
        if(resetQueryTitle) {
            $scope.queryTitle = "";
        }
        if($scope.queryTitle) {
            return $scope.queryTitle;
        }
        var title = $scope.active.unsharedFilterValue ? $scope.active.unsharedFilterValue + " " : "";
        if($scope.bindings.title) {
            return title + $scope.bindings.title;
        }
        if(_.keys($scope.active).length) {
            return title + $scope.active.table.prettyName;
        }
        return title;
    };

    // Overwrite to create export data for only a single data layer.
    $scope.createExportData = function(buildQueryFunction) {
        var query = buildQueryFunction($scope.getDataLayers(), $scope.active.database.name, $scope.active.table.name);
        return $scope.functions.createExportDataObject($scope.exportId, $scope.addToExportQuery(query));
    };

    // Overwrite to define the needed behavior.
    $scope.handleChangeDatabase = function() {
        updateTables();
        $scope.functions.logChangeAndUpdate("database", $scope.active.database.name);
    };

    // Overwrite to define the needed behavior.
    $scope.handleChangeTable = function() {
        updateFields();
        $scope.functions.logChangeAndUpdate("table", $scope.active.table.name);
    };

    // Overwrite to define the needed behavior.
    $scope.handleChangeUnsharedFilterField = function() {
        $scope.active.unsharedFilterValue = "";
        $scope.logChange("unsharedFilterField", $scope.active.unsharedFilterField.columnName);
    };

    // Overwrite to define the needed behavior.
    $scope.handleChangeUnsharedFilterValue = function() {
        $scope.functions.logChangeAndUpdate("unsharedFilterValue", $scope.active.unsharedFilterValue);
    };

    // Overwrite to define the needed behavior.
    $scope.handleRemoveUnsharedFilter = function() {
        $scope.active.unsharedFilterValue = "";
        $scope.functions.logChangeAndUpdate("unsharedFilter", "", "button");
    };
}]);

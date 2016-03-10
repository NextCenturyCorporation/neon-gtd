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

angular.module('neonDemo.controllers').controller('visualizationSuperclassController',
['$scope', 'external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'LinksPopupService', 'ThemeService', 'TranslationService', 'VisualizationService',
function($scope, external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, themeService, translationService, visualizationService) {
    // Options for the implementation property.
    $scope.SINGLE_LAYER = "singleLayer";
    $scope.MULTIPLE_LAYER = "multipleLayer";

    $scope.logElementGroup = $scope.logElementGroup || "chart_group";
    $scope.logElementType = $scope.logElementType || "canvas";

    $scope.active = {
        layers: [],
        allowsTranslations: false,
        displayOverlapsHeaders: false,
        queryByTable: false,
    };

    $scope.functions = {};

    $scope.languages = {
        fromLanguageOptions: {},
        toLanguageOptions: {},
        chosenFromLanguage: "",
        chosenToLanguage: ""
    };

    var DEFAULT_LINKY_CONFIG = {
        hashtags: false,
        mentions: false,
        urls: true,
        linkTo: ""
    };

    var resizeListeners = [];

    /*************** SUBCLASS ABSTRACT FUNCTIONS ***************/

    /**
     * Adds properties to the given collection of bindings and returns the updated collection for this visualization.
     * @method addToBindings
     * @param {Object} bindings
     * @return {Object}
     */
    $scope.functions.addToBindings = function(bindings) {
        return bindings;
    };

    /**
     * Adds properties to the given collection of layer bindings using the given layer and returns the updated collection for this visualization.
     * @method addToLayerBindings
     * @param {Object} bindings
     * @param {Object} layer
     * @return {Object}
     */
    $scope.functions.addToLayerBindings = function(bindings, layer) {
        bindings.name = layer.name;
        return bindings;
    };

    /**
     * Adds properties to the given layer object specific to this visualization and returns the updated layer.
     * @method addToNewLayer
     * @param {Object} layer
     * @return {Object}
     */
    $scope.functions.addToNewLayer = function(layer) {
        return layer;
    };

    /**
     * Adds properties to the given Neon query and returns the updated query for the given layers.
     * @method addToQuery
     * @param {neon.query.Query} query
     * @param {Array} layers
     * @return {neon.query.Query}
     */
    $scope.functions.addToQuery = function(query) {
        return query;
    };

    /**
     * Returns whether the data fields in the given layers are valid in order to execute a query.
     * @method areDataFieldsValid
     * @param {Array} layers
     * @return {Boolean}
     */
    $scope.functions.areDataFieldsValid = function(layers) {
        return true;
    };

    /**
     * Creates and returns an object containing the data needed to export this visualization.
     * @method createExportDataObject
     * @param {String} exportId
     * @param {Array} queryData A list of objects containing {String} database, {String} table, and {neon.query.Query} query
     * @return {Object}
     */
    $scope.functions.createExportDataObject = function() {
        return {};
    };

    /**
     * Returns the description text for the global filter data object to show in the filter tray (usually containing the database, table, fields and filter value).
     * @method createFilterTrayText
     * @param {String} databaseName
     * @param {String} tableName
     * @param {Array} fieldNames
     * @return {String}
     */
    $scope.functions.createFilterTrayText = function() {
        return "";
    };

    /**
     * Creates and returns the text for the options menu button.
     * Called by the options-menu directive.
     * @method createMenuText
     * @return {String}
     */
    $scope.functions.createMenuText = function() {
        return "";
    };

    /**
     * Creates and returns the Neon where clause for a Neon filter on the given database, table, and fields using the filters set in this visualization.
     * Called by the Filter Service.
     * @method createNeonFilterClause
     * @param {Object} databaseAndTableName Contains {String} database and {String} table
     * @param {String} fieldName or {Array} fieldNames The name (or list of names) of the filter fields
     * @return {neon.query.WhereClause}
     */
    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        return neon.query.where(fieldName, "!=", null);
    };

    /**
     * Creates and returns the Neon where clause for queries for the given layers (or returns undefined).
     * @method createNeonQueryWhereClause
     * @param {Array} layers
     * @return {neon.query.WhereClause}
     */
    $scope.functions.createNeonQueryWhereClause = function() {
        return undefined;
    };

    /**
     * Executes the given query using the given connection.
     * @method executeQuery
     * @param {Object} connection
     * @param {neon.query.Query} query
     */
    $scope.functions.executeQuery = function(connection, query) {
        return connection.executeQuery(query);
    };

    /**
     * Returns the list of field objects on which filters for given layer are set.
     * @method getFilterFields
     * @param {Object} layer
     * @return {Array}
     */
    $scope.functions.getFilterFields = function() {
        return [];
    };

    /**
     * Returns whether a filter is set in this visualization.
     * @method isFilterSet
     * @return {Boolean}
     */
    $scope.functions.isFilterSet = function() {
        return false;
    };

    /**
     * Returns whether to hide the headers in the filter header container for this visualization.  The default implementation hides the headers if a filter is not set.
     * @method hideHeaders
     * @return {Boolean}
     */
    $scope.functions.hideHeaders = function() {
        return !$scope.functions.isFilterSet();
    };

    /**
     * Returns whether the filter displayed by this visualization needs to be updated based on the given list of Neon filters set in the dashboard.
     * @method needToUpdateFilter
     * @param {Array} of {neon.query.Filter} neonFilters
     * @return {Boolean}
     */
    $scope.functions.needToUpdateFilter = function() {
        return false;
    };

    /**
     * Handles any additional behavior for changing an option in this visualization.
     * @method onChangeOption
     */
    $scope.functions.onChangeOption = function() {
        // Do nothing by default.
    };

    /**
     * Handles any additional behavior for deleting the given layer from this visualization.
     * @method onDeleteLayer
     * @param {Object} layer
     */
    $scope.functions.onDeleteLayer = function(layer) {
        // Do nothing by default.
    };

    /**
     * Handles any additional behavior for destroying this visualization.
     * @method onDestroy
     */
    $scope.functions.onDestroy = function() {
        // Do nothing by default.
    };

    /**
     * Handles any additional behavior for responding to a query error.
     * @method onError
     * @param {Object} response The query response
     * @param {Object} errorCodes An object containing the error codes important to the Neon Dashboard
     */
    $scope.functions.onError = function() {
        // Do nothing by default.
    };

    /**
     * Handles any additional behavior for initializing this visualization.
     * @method onInit
     */
    $scope.functions.onInit = function() {
        // Do nothing by default.
    };

    /**
     * Handles any additional behavior for reordering the layers in this visualization.
     * @method onReorderLayers
     */
    $scope.functions.onReorderLayers = function() {
        // Do nothing by default.
    };

    /**
     * Handles any additional behavior for resizing this visualization.
     * @method onResize
     * @param {Number} elementHeight
     * @param {Number} elementWidth
     * @param {Number} titleHeight
     * @param {Number} headersHeight
     */
    $scope.functions.onResize = function() {
        // Do nothing by default.
    };

    /**
     * Handles any behavior for changing the theme of elements in this visualization to the given theme.
     * @method onThemeChanged
     * @param {Object} theme
     * @return {Boolean} Whether them theme of any elements in this visualization needed to be changed
     */
    $scope.functions.onThemeChanged = function() {
        return false;
    };

    /**
     * Handles any additional behavior for toggling the show setting for the given layer.
     * @method onToggleShowLayer
     * @param {Object} layer
     */
    $scope.functions.onToggleShowLayer = function(layer) {
        // Do nothing by default.
    };

    /**
     * Handles any additional behavior for updating the fields for the given layer.
     * @method onUpdateFields
     * @param {Object} layer
     */
    $scope.functions.onUpdateFields = function() {
        // Do nothing by default.
    };

    /**
     * Removes the filter displayed by this visualization.
     * @method removeFilterValues
     */
    $scope.functions.removeFilterValues = function() {
        // Do nothing by default.
    };

    /**
     * Removes all translations from this visualization.
     * @method removeTranslations
     */
    $scope.functions.removeTranslations = function() {
        // Do nothing by default.
    };

    /**
     * Returns whether this visualization should query for new data and update its display after changing its filter.
     * @method shouldQueryAfterFilter
     * @return {Boolean}
     */
    $scope.functions.shouldQueryAfterFilter = function() {
        return false;
    };

    /**
     * Returns whether to show the text for the options menu button.
     * Called by the options-menu directive.
     * @method showMenuText
     * @return {Boolean}
     */
    $scope.functions.showMenuText = function() {
        return false;
    };

    /**
     * Updates the data and display in this visualization for the given layers.  Clears the display if the data array is empty or reset is true.
     * @method updateData
     * @param {Array} data
     * @param {Array} layers
     * @param {Boolean} reset
     */
    $scope.functions.updateData = function() {
        // Do nothing by default.
    };

    /**
     * Updates the display in this visualization for the given layer after its options have been changed.
     * @method updateLayerDisplay
     * @param {Object} layer
     */
    $scope.functions.updateLayerDisplay = function(layer) {
        // Do nothing by default.
    };

    /**
     * Updates the filter displayed by this visualization on the fields with the given names using the where clause in the given Neon filter.
     * @method updateFilterValues
     * @param {neon.query.Filter} neonFilter
     * @param {Array} fieldNames
     */
    $scope.functions.updateFilterValues = function() {
        // Do nothing by default.
    };

    /**
     * Updates all translations in this visualization.
     * @method updateTranslations
     */
    $scope.functions.updateTranslations = function() {
        // Do nothing by default.
    };

    /*************** SUBCLASS UTILITY FUNCTIONS ***************/

    /**
     * Adds or replaces the Neon filter in the dashboard on all filterable layers based on the filter values set in this visualization.
     * @method updateNeonFilter
     * @param {Boolean} [queryAfterFilter] (Optional)
     */
    $scope.functions.updateNeonFilter = function(queryAfterFilter) {
        updateNeonFilter({
            queryAfterFilter: queryAfterFilter
        });
    };

    /**
     * Adds a resize listener to the given element in this visualization.
     * @method addResizeListener
     * @param {String} element
     */
    $scope.functions.addResizeListener = function(element) {
        $scope.element.find(element).resize(resize);
        resizeListeners.push(element);
    };

    /**
     * Creates a new data layer for this visualization using the dataset defaults and set in new & edit mode.
     * @method createLayer
     */
    $scope.functions.createLayer = function() {
        // TODO Logging
        var layer = createLayerFromConfig({});
        layer.edit = true;
        layer.new = true;
    };

    /**
     * Creates and returns the links for the given field object and item object.
     * @method createLinks
     * @param {Object} field Containing {String} columnName
     * @param {String} value
     * @return {Object} links
     */
    $scope.functions.createLinks = function(databaseName, tableName, field, value) {
        var mappings = datasetService.getMappings(databaseName, tableName);
        var links = linksPopupService.createAllServiceLinkObjects(external.services, mappings, field.columnName, value);
        var key = linksPopupService.generateKey(field, value);
        linksPopupService.addLinks($scope.visualizationId, linksPopupService.generateKey(field, value), links);
        return links;
    };

    /**
     * Creates and returns the link buttons for the given field object and data array.
     * @method createLinkButtons
     * @param {Object} field Containing {String} columnName
     * @param {Array} array A list of objects each containing a property matching the field name
     * @return {Array} buttons
     */
    $scope.functions.createLinkButtons = function(field, array) {
        var links = {};
        var buttons = [];

        array.forEach(function(element) {
            var value = element[field.columnName];
            var key = linksPopupService.generateKey(field, value);
            links[key] = linksPopupService.createAllServiceLinkObjects(external.services, mappings, field.columnName, value);
            buttons.push(links[key].length ? linksPopupService.createLinkHtml($scope.visualizationId, key, value) :
                linksPopupService.createDisabledLinkHtml(value));
        });

        linksPopupService.setLinks($scope.visualizationId, links);

        return buttons;
    };

    /**
     * Creates and returns the links for the given external service type, link key, and link data.
     * @method createLinksForData
     * @param {String} type
     * @param {String} key
     * @param {Object} data
     * @return {Object} links
     */
    $scope.functions.createLinksForData = function(type, key, data) {
        var links = [];
        Object.keys(external.services[type].apps).forEach(function(app) {
            links.push(linksPopupService.createServiceLinkObjectWithData(external.services[type], app, data));
        });
        linksPopupService.addLinks($scope.visualizationId, key, links);
        return links;
    };

    /**
     * Deletes the given layer, removing its filter and updating this visualization.
     * @method deleteLayer
     * @param {Object} layer
     * @param {Number} indexReversed The index of the layer in the list of layers (reversed).
     */
    $scope.functions.deleteLayer = function(layer, indexReversed) {
        // TODO Logging
        $scope.functions.onDeleteLayer(layer);
        $scope.active.layers.splice($scope.active.layers.length - 1 - indexReversed, 1);
        if(layer.filterable && $scope.functions.isFilterSet()) {
            removeNeonFilter({
                // Include the deleted layer in the options because it will not be found in the list of active layers.
                layers: [layer],
                database: layer.database.name,
                table: layer.table.name,
                queryAfterFilter: true
            });
        } else if($scope.active.layers.length) {
            runDefaultQueryAndUpdate();
        } else {
            $scope.functions.updateData([], [layer], true);
        }
    };

    /**
     * Finds and returns the field object in the fields in the given layer that matches the given field name or mapping with the given key.
     * Returns a blank field object if no such field exists.
     * @method findFieldObject
     * @param {String} fieldName
     * @param {String} mappingKey
     * @param {Object} layer
     * @return {Object}
     */
    $scope.functions.findFieldObject = function(fieldName, mappingKey, layer) {
        var find = function(name) {
            return _.find(layer.fields, function(field) {
                return field.columnName === name;
            });
        };

        var field;
        if(fieldName) {
            field = find(fieldName);
        }

        if(!field && mappingKey) {
            field = find($scope.functions.getMapping(layer.database.name, layer.table.name, mappingKey));
        }

        return field || datasetService.createBlankField();
    };

    /**
     * Returns the color maps for the database and table in the given layer and the field with the given names.
     * @method getColorMaps
     * @param {Object} layer
     * @param {String} tableName
     * @param {String} fieldName
     * @return {Object}
     */
    $scope.functions.getColorMaps = function(layer, fieldName) {
        return datasetService.getActiveDatasetColorMaps(layer.database.name, layer.table.name, fieldName);
    };

    /**
     * Returns the options for the active dataset.
     * @method getDatasetOptions
     * @return {Object}
     */
    $scope.functions.getDatasetOptions = function() {
        return datasetService.getActiveDatasetOptions();
    };

    /**
     * Returns the jQuery element in this visualization matching the given string, or the element for this visualization itself if no string is given.
     * @method getElement
     * @param {String} element
     * @return {Object}
     */
    $scope.functions.getElement = function(element) {
        return element ? $scope.element.find(element) : $scope.element;
    };

    /**
     * Returns the filter key for the database and table in the given layer and the given filter clause.
     * @method getFilterKey
     * @param {Object} layer
     * @param {Object} filterClause
     * @return {String}
     */
    $scope.functions.getFilterKey = function(layer, filterClause) {
        return filterService.getFilterKey(layer.database.name, layer.table.name, filterClause);
    };

    /**
     * Returns the config for the linky library.
     * @method getLinkyConfig
     * @return {Object}
     */
    $scope.functions.getLinkyConfig = function() {
        return datasetService.getLinkyConfig() || DEFAULT_LINKY_CONFIG;
    };

    /**
     * Returns the links popup service object.
     * @method getLinksPopupService
     * @return {Object}
     */
    $scope.functions.getLinksPopupService = function() {
        return linksPopupService;
    };

    /**
     * Returns the mapping for the database, table, and key with the given names or any empty string if no mapping exists.
     * @method getMapping
     * @param {String} databaseName
     * @param {String} tableName
     * @param {String} key
     * @return {String}
     */
    $scope.functions.getMapping = function(databaseName, tableName, key) {
        return datasetService.getMapping(databaseName, tableName, key);
    };

    /**
     * Returns whether the given Neon filter object is a single clause filter.
     * @method isSingleClauseFilter
     * @param {neon.query.Filter} filter
     * @return {Boolean}
     */
    $scope.functions.getNumberOfFilterClauses = function(neonFilter) {
        return filterService.hasSingleClause(neonFilter) ? 1 : filterService.getMultipleClausesLength(neonFilter);
    };

    /**
     * Returns the list of unsorted fields for the database and table in the given layer (in the order they are defined in the dashboard config).
     * @method getUnsortedFields
     * @param {Object} layer
     * @return {Array}
     */
    $scope.functions.getUnsortedFields = function(layer) {
        return datasetService.getFields(layer.database.name, layer.table.name);
    };

    /**
     * Returns whether the given field object is valid.
     * @method isFieldValid
     * @param {Object} fieldObject
     * @return {Boolean}
     */
    $scope.functions.isFieldValid = function(fieldObject) {
        return datasetService.isFieldValid(fieldObject);
    };

    /**
     * Logs a change of the given option to the given value using an element of the given type, runs a new query and updates the data in this visualization.
     * @method logChangeAndUpdate
     * @param {String} option
     * @param {String} value
     * @param {String} [type] (Optional)
     */
    $scope.functions.logChangeAndUpdate = function(option, value, type) {
        $scope.logChange(option, value, type);
        if(!$scope.initializing) {
            $scope.functions.onChangeOption();
            runDefaultQueryAndUpdate();
        }
    };

    /**
     * Publishes an event with the given type and data using the messenger for this visualization.
     * @method publish
     * @param {String} type
     * @param {Object} data
     */
    $scope.functions.publish = function(type, data) {
        $scope.messenger.publish(type, data);
    };

    /**
     * Builds and executes a query and updates the data for this visualization using the given options.
     * @method queryAndUpdate
     * @param {Object} options The collection of function arguments.
     * @param {String} [options.databaseName] (Optional) The name of a databse.  If not given, queries and updates all layers.
     * @param {String} [options.tableName] (Optional) The name of a table.  If not given, queries and updates all layers.
     * @param {Function} [options.addToQuery] (Optional) The function to help build the Neon query.  If not given, it uses $scope.functions.addToQuery.
     * @param {Function} [options.executeQuery] (Optional) The function to execute the Neon query.  If not given, it uses $scope.functions.executeQuery.
     * @param {Function} [options.updateData] (Optional) The function to update the data in this visualization.  If not given, it uses $scope.functions.updateData.
     */
    $scope.functions.queryAndUpdate = function(options) {
        findQueryAndUpdateData(options.database, options.table).forEach(function(item) {
            queryAndUpdate(item.layers, item.database, item.table, options.addToQuery || $scope.functions.addToQuery, options.executeQuery || $scope.functions.executeQuery,
                options.updateData || $scope.functions.updateData);
        });
    };

    /**
     * Removes the links for the given field object and value, or all links for this visualization if no field or value are given.
     * @method removeLinks
     * @param {Object} [field] (Optional)
     * @param {String} [value] (Optional)
     */
    $scope.functions.removeLinks = function(field, value) {
        if(datasetService.isFieldValid(field) && value) {
            linksPopupService.removeLinksForKey($scope.visualizationId, linksPopupService.generateKey(field, value));
        } else {
            linksPopupService.deleteLinks($scope.visualizationId);
        }
    };

    /**
     * Removes the Neon filter from the dashboard on all filterable layers in this visualization.
     * @method removeNeonFilter
     * @param {Boolean} [queryAfterFilter] (Optional)
     */
    $scope.functions.removeNeonFilter = function(queryAfterFilter) {
        removeNeonFilter({
            queryAfterFilter: queryAfterFilter
        });
    };

    /**
     * Moves the given layer to the given new index and reorders the other layers as needed.
     * @method reorderLayer
     * @param {Object} layer
     * @param {Number} newIndexReversed The new index of the layer in the list of layers (reversed).
     */
    $scope.functions.reorderLayer = function(layer, newIndexReversed) {
        var newIndex = $scope.active.layers.length - 1 - newIndexReversed;
        var oldIndex = $scope.active.layers.indexOf(layer);
        $scope.active.layers.splice(oldIndex, 1);
        $scope.active.layers.splice(newIndex, 0, layer);
        $scope.functions.onReorderLayers();
    };

    /**
     * Translates the given data for this visualization using the global to/from languages and the given success/failure callbacks.
     * @method runTranslation
     * @param {Array} data
     * @param {Function} [translationSuccessCallback] (Optional)
     * @param {Function} [translationFailureCallback] (Optional)
     */
    $scope.functions.runTranslation = function(data, translationSuccessCallback, translationFailureCallback) {
        if($scope.errorMessage) {
            errorNotificationService.hideErrorMessage($scope.errorMessage);
            $scope.errorMessage = undefined;
        }

        translationService.translate(data, $scope.languages.chosenToLanguage, function(response) {
            translationService.saveTranslationCache();
            if(translationSuccessCallback) {
                translationSuccessCallback(response.data.data.translations);
            }
        }, function(response) {
            if($scope.errorMessage) {
                errorNotificationService.hideErrorMessage($scope.errorMessage);
                $scope.errorMessage = undefined;
            }
            $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.message,  response.reason);
            if(translationFailureCallback) {
                translationFailureCallback(response.data.data.translations);
            }
        }, $scope.languages.chosenFromLanguage);
    };

    /**
     * Subscribes the messenger for this visualization to events with the given type using the given listener.
     * @method subscribe
     * @param {String} type
     * @param {Function} listener
     */
    $scope.functions.subscribe = function(type, listener) {
        $scope.messenger.subscribe(type, listener);
    };

    /**
     * Toggles editing on the given layer.
     * @method toggleEditLayer
     * @param {Object} layer
     */
    $scope.functions.toggleEditLayer = function(layer) {
        // TODO Logging
        layer.edit = true;
    };

    /**
     * Toggles filtering on the given layer.
     * @method toggleFilterLayer
     * @param {Object} layer
     */
    $scope.functions.toggleFilterLayer = function(layer) {
        // TODO Logging
        updateOtherLayers(layer);

        if(!layer.new) {
            if($scope.functions.isFilterSet()) {
                if(layer.filterable) {
                    updateNeonFilter({
                        database: layer.database.name,
                        table: layer.table.name,
                        queryAfterFilter: true
                    })
                } else {
                    removeNeonFilter({
                        database: layer.database.name,
                        table: layer.table.name,
                        queryAfterFilter: true
                    });
                }
            } else {
                checkNeonDashboardFilters({
                    doNotAutoQuery: true
                });
            }
        }
    };

    /**
     * Toggles showing the given layer.
     * @method toggleShowLayer
     * @param {Object} layer
     */
    $scope.functions.toggleShowLayer = function(layer) {
        // TODO Logging
        $scope.functions.onToggleShowLayer(layer);
    };

    /**
     * Gets the list of fields from the dataset service and sets the active fields for the given layer.
     * @method updateFields
     * @param {Object} layer
     * @private
     */
    $scope.functions.updateFields = function(layer) {
        if($scope.functions.isFilterSet()) {
            removeNeonFilter({
                database: layer.database.name,
                table: layer.table.name,
                fromSystem: true
            });
        }

        // Sort the fields that are displayed in the dropdowns in the options menus alphabetically.
        layer.fields = datasetService.getSortedFields(layer.database.name, layer.table.name);

        layer.unsharedFilterField = datasetService.createBlankField();
        layer.unsharedFilterValue = "";

        $scope.functions.onUpdateFields(layer);
    };

    /**
     * Updates the properties for the given layer, removes it from new & edit mode, updates its filter, queries for new data and updates this visualization.
     * @method updateLayer
     * @param {Object} layer
     */
    $scope.functions.updateLayer = function(layer) {
        // TODO Logging
        var isNew = layer.new;
        layer.edit = false;
        layer.new = false;

        updateOtherLayers(layer);
        $scope.functions.updateLayerDisplay(layer);

        // For new filterable layers, update the Neon filter for the dashboard or check for existing Neon dashboard filters.
        if(isNew && layer.filterable) {
            if($scope.functions.isFilterSet()) {
                updateNeonFilter({
                    database: layer.database.name,
                    table: layer.table.name,
                    queryAfterFilter: true
                });
            } else {
                checkNeonDashboardFilters({});
            }
        } else {
            runDefaultQueryAndUpdate(layer.database.name, layer.table.name);
        }
    };

    /**
     * Gets the list of tables from the dataset service and sets the active table and fields for the given layer.
     * @method updateTables
     * @param {Object} layer
     */
    $scope.functions.updateTables = function(layer) {
        layer.tables = datasetService.getTables(layer.database.name);
        layer.table = layer.tables[0];
        $scope.functions.updateFields(layer);
    };

    /**
     * Validates the name of the given layer, setting its error property if the name is not unique.
     * @method validateLayerName
     * @param {Object} layer
     * @param {Number} indexReversed The index of the layer in the list of layers (reversed).
     */
    $scope.functions.validateLayerName = function(layer, indexReversed) {
        validateLayerName(layer, $scope.active.layers.length - 1 - indexReversed);
    };

    /******************** SUPERCLASS FUNCTIONS ********************/

    /**
     * Initializes this visualization.
     * @method init
     */
    $scope.init = function() {
        // Stop extra data queries that may be caused by event handlers triggered by setting the active fields.
        $scope.initializing = true;

        $scope.messenger = new neon.eventing.Messenger();
        $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, runDefaultQueryAndUpdate);
        $scope.messenger.events({
            filtersChanged: handleFiltersChangedEvent
        });

        $scope.exportId = exportService.register($scope.makeExportObject);
        themeService.registerListener($scope.visualizationId, handleThemeChangedEvent);
        visualizationService.register($scope.stateId, getBindings);

        if($scope.active.allowsTranslations && translationService.hasKey()) {
            $scope.translationsOn = true;
            translationService.getSupportedLanguages(function(languages) {
                $scope.languages.fromLanguageOptions = languages;
                $scope.languages.toLanguageOptions = languages;
            }, function(response) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }
                $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.message,  response.reason);
            });
        }

        $scope.$on('$destroy', function() {
            XDATA.userALE.log({
                activity: "remove",
                action: "remove",
                elementId: $scope.type,
                elementType: $scope.logElementType,
                elementSub: $scope.type,
                elementGroup: $scope.logElementGroup,
                source: "system",
                tags: ["remove", $scope.type]
            });

            $scope.element.off("resize", resize);
            $scope.element.find(".filter-container").off("resize", resizeDisplay);
            $scope.element.find(".chart-options-button").off("resize", resizeTitle);
            $scope.messenger.unsubscribeAll();

            if($scope.functions.isFilterSet()) {
                removeNeonFilter({
                    fromSystem: true
                });
            }

            exportService.unregister($scope.exportId);
            linksPopupService.deleteLinks($scope.visualizationId);
            $scope.active.layers.forEach(function(layer) {
                linksPopupService.deleteLinks(createLayerLinksSource(layer));
            });
            themeService.unregisterListener($scope.visualizationId);
            visualizationService.unregister($scope.stateId);

            resizeListeners.forEach(function(element) {
                $scope.element.find(element).off("resize", resize);
            });

            $scope.functions.onDestroy();
        });

        $scope.element.resize(resize);
        $scope.element.find(".filter-container").resize(resizeDisplay);
        $scope.element.find(".chart-options-button").resize(resizeTitle);
        resize();

        $scope.outstandingDataQuery = {};
        datasetService.getDatabases().forEach(function(database) {
            $scope.outstandingDataQuery[database.name] = {};
        });

        $scope.functions.onInit();
        $scope.initData();

        if($scope.getDataLayers().length) {
            checkNeonDashboardFilters({});
        }

        $scope.initializing = false;
    };

    /**
     * Resizes the title and the display of this visualization.
     * @method resize
     * @private
     */
    var resize = function() {
        resizeTitle();
        resizeDisplay();
    };

    /**
     * Resizes the title of this visualization.
     * @method resizeTitle
     * @private
     */
    var resizeTitle = function() {
        // Set the width of the title to the width of this visualization minus the width of the options button/text and margin/padding.
        var titleWidth = $scope.element.width() - $scope.element.find(".chart-options").outerWidth(true) - 20;
        $scope.element.find(".title").css("maxWidth", Math.max(0, titleWidth));
    };

    /**
     * Resizes the display of this visualization.
     * @method resizeDisplay
     * @private
     */
    var resizeDisplay = function() {
        var titleHeight = $scope.element.find(".options-container").outerHeight(true);
        var headersHeight = $scope.active.displayOverlapsHeaders ? titleHeight : titleHeight + $scope.element.find(".filter-container").outerHeight(true);
        $("#" + $scope.visualizationId).height($scope.element.height() - headersHeight);
        $("#" + $scope.visualizationId).width($scope.element.width());
        $scope.functions.onResize($scope.element.height(), $scope.element.width(), titleHeight, headersHeight);
    };

    /**
     * Creates and returns the source for the links popup data for the given layer.
     * @method createLayerLinksSource
     * @param {Object} layer
     * @return {String}
     */
    var createLayerLinksSource = function(layer) {
        return $scope.visualizationId + "-" + layer.database.name + "-" + layer.table.name;
    };

    /**
     * Initializes the data in this visualization.
     * @method initData
     */
    $scope.initData = function() {
        ($scope.bindings.config || []).forEach(function(item) {
            var layer = createLayerFromConfig(item);
            updateOtherLayers(layer);
            $scope.functions.updateLayerDisplay(layer);
        });
    };

    /**
     * Creates a new data layer for this visualization using the given config and dataset defaults.
     * @method createLayerFromConfig
     * @param {Object} config
     * @private
     */
    var createLayerFromConfig = function(config) {
        var layer = {
            databases: datasetService.getDatabases(),
            filterable: true,
            show: true
        };

        layer.database = config.database ? datasetService.getDatabaseWithName(config.database) : layer.databases[0];
        layer.tables = datasetService.getTables(layer.database.name);
        layer.table = config.table ? datasetService.getTableWithName(layer.database.name, config.table) : layer.tables[0];

        if(layer.database && layer.database.name && layer.table && layer.table.name) {
            layer.name = (config.name || layer.table.name).toUpperCase();
            layer.fields = datasetService.getSortedFields(layer.database.name, layer.table.name);
            layer.unsharedFilterField = $scope.functions.findFieldObject(config.unsharedFilterField || "", "", layer);
            layer.unsharedFilterValue = config.unsharedFilterValue || "";
            $scope.active.layers.push($scope.functions.addToNewLayer(layer, config));
            validateLayerName(layer, $scope.active.layers.length - 1);
        }

        return layer;
    };

    /**
     * Validates the name of the given layer, setting its error property if the name is not unique.
     * @method validateLayerName
     * @param {Object} layer
     * @param {Number} index
     * @private
     */
    var validateLayerName = function(layer, index) {
        var invalid = $scope.active.layers.some(function(otherLayer, otherIndex) {
            return otherLayer.name === (layer.name || layer.table.name).toUpperCase() && otherIndex !== index;
        });
        layer.error = invalid ? "Please choose a unique layer name." : undefined;
    };

    /**
     * Returns the data layers in this visualization.
     * @method getDataLayers
     * @return {Array}
     */
    $scope.getDataLayers = function() {
        return $scope.active.layers;
    };

    /**
     * Checks for Neon filters for all filterable layers in this visualization.  Adds, replaces, or removes the filter displayed by this visualization if needed.
     * Queries for new data for the database and table with the given names (or all layers if a filter was changed or no names were given) and updates this visualization.
     * @method checkNeonDashboardFilters
     * @param {Object} options The collection of function arguments.
     * @param {String} [options.databaseName] (Optional)
     * @param {String} [options.tableName] (Optional)
     * @param {Boolean} [options.doNotAutoQuery] (Optional) If true, will only query for new data and update this visualization if a filter was changed
     * @private
     */
    var checkNeonDashboardFilters = function(options) {
        var neonFilters = [];
        var filterFields = [];

        // Check for Neon filters on all filterable database/table/field combinations in the layers.
        var data = findFilterData();
        data.forEach(function(item) {
            var neonFilter = filterService.getFilter(item.database, item.table, item.fields);
            if(neonFilter) {
                neonFilters.push(neonFilter);
                filterFields.push(item.fields);
            }
        });

        // If some of the filtered data in this visualization do not have any Neon filters set, remove the filter from this visualization if it is set.
        // Note for single layer visualizations that this will always be true if a filter is set in this visualization but not in the Neon dashboard.
        if((!neonFilters.length || neonFilters.length < data.length) && $scope.functions.isFilterSet()) {
            $scope.functions.removeFilterValues();
            runDefaultQueryAndUpdate();
            return;
        }

        // If all filtered data in this visualization have the same Neon filters that are compatible with this visualization, update the filter in this visualization.
        // Note for single layer visualizations that this will always be true if a filter is set in the Neon dashboard.
        if(neonFilters.length && neonFilters.length === data.length && $scope.functions.needToUpdateFilter(neonFilters)) {
            // Use the first element of the filter arrays because they should all be the same (or equivalent).
            $scope.functions.updateFilterValues(neonFilters[0], filterFields[0]);
            runDefaultQueryAndUpdate();
            return;
        }

        if(!options.doNotAutoQuery) {
            runDefaultQueryAndUpdate(options.databaseName, options.tableName);
        }
    };

    /**
     * Returns a list of objects each containing the {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers on which to filter.
     * @method findFilterData
     * @param {String} [databaseName] (Optional)
     * @param {String} [tableName] (Optional)
     * @param {Array} [layers] (Optional)
     * @param {Boolean} [ignoreFilter] (Optional)
     * @return {Array}
     * @private
     */
    var findFilterData = function(databaseName, tableName, layers, ignoreFilter) {
        var data = [];
        (layers || $scope.getDataLayers()).forEach(function(layer) {
            if(!layer.new && (layer.filterable || ignoreFilter) && ((databaseName && tableName) ? (databaseName === layer.database.name && tableName === layer.table.name) : true)) {
                var valid = $scope.functions.getFilterFields(layer).every(function(field) {
                    return datasetService.isFieldValid(field);
                });
                if(valid) {
                    // Check whether the database/table/filter fields for this layer already exist in the data.
                    var fields = getFilterFieldNames(layer);
                    var index = _.findIndex(data, {
                        database: layer.database.name,
                        table: layer.table.name,
                        fields: fields
                    });
                    if(index < 0) {
                        data.push({
                            database: layer.database.name,
                            table: layer.table.name,
                            fields: fields,
                            layers: [layer]
                        });
                    } else {
                        data[index].layers.push(layer);
                    }
                }
            }
        });
        return data;
    };

    /**
     * Returns the list of field names on which filters for the given layer are set.
     * @method getFilterFieldNames
     * @param {Object} layer
     * @return {Array}
     */
    var getFilterFieldNames = function(layer) {
        return $scope.functions.getFilterFields(layer).map(function(field) {
            return field.columnName;
        });
    };

    /**
     * Builds and executes the default data query for the databases and tables with the given names and updates the data for this visualization.
     * @method runDefaultQueryAndUpdate
     * @param {String} [databaseName] (Optional)
     * @param {String} [tableName] (Optional)
     * @private
     */
    var runDefaultQueryAndUpdate = function(databaseName, tableName) {
        // Save the title during the query so the title doesn't change immediately if the user changes the unshared filter.
        $scope.queryTitle = $scope.createTitle(true);

        // Resize the title and display after the error is hidden and the title is changed.
        resize();

        findQueryAndUpdateData(databaseName, tableName).forEach(function(item) {
            queryAndUpdate(item.layers, item.database, item.table, $scope.functions.addToQuery,  $scope.functions.executeQuery, $scope.functions.updateData);
        });
    };

    /**
     * Returns a list of objects each containing the {String} database, {String} table, and {Array} of {Object} layers on which to query and update.
     * @method findQueryAndUpdateData
     * @param {String} [databaseName] (Optional)
     * @param {String} [tableName] (Optional)
     * @return {Array}
     * @private
     */
    var findQueryAndUpdateData = function(databaseName, tableName) {
        var data = [];
        $scope.getDataLayers().forEach(function(layer) {
            if(!layer.new && ((databaseName && tableName) ? (layer.database.name === databaseName && layer.table.name === tableName) : true)) {
                // If queryByTable is enabled, add all layers with the same database and table to the same data item so their query and update happens together.
                if($scope.active.queryByTable) {
                    var index = _.findIndex(data, {
                        database: layer.database.name,
                        table: layer.table.name
                    });
                    if(index < 0) {
                        data.push({
                            database: layer.database.name,
                            table: layer.table.name,
                            layers: [layer]
                        });
                    } else {
                        data[index].layers.push(layer);
                    }
                } else {
                    // If queryByTable is not enabled, add each layer as its own data item so its query and update happens independently.
                    data.push({
                        database: layer.database.name,
                        table: layer.table.name,
                        layers: [layer]
                    });
                }
            }
        });
        return data;
    };

    /**
     * Builds and executes a query on the given layers for the database and table with the given names and updates the data for this visualization using the given functions.
     * @method queryAndUpdate
     * @param {Array} layers
     * @param {String} databaseName
     * @param {String} tableName
     * @param {Function} addToQueryFunction
     * @param {Function} executeQueryFunction
     * @param {Function} updateDataFunction
     * @private
     */
    var queryAndUpdate = function(layers, databaseName, tableName, addToQueryFunction, executeQueryFunction, updateDataFunction) {
        if($scope.errorMessage) {
            errorNotificationService.hideErrorMessage($scope.errorMessage);
            $scope.errorMessage = undefined;
        }

        // Mark each layer as querying for use in some visualizations.
        layers.forEach(function(layer) {
            layer.querying = true;
        });

        // Clear the display.
        updateDataFunction([], layers, true);

        var finishQueryingLayers = function() {
            // Reset the querying status of each layer.
            layers.forEach(function(layer) {
                layer.querying = false;
            });
        };

        var connection = connectionService.getActiveConnection();

        if(!connection || !$scope.functions.areDataFieldsValid(layers)) {
            finishQueryingLayers();
            return;
        }

        var query = buildQuery(layers, databaseName, tableName, addToQueryFunction);

        XDATA.userALE.log({
            activity: "alter",
            action: "send",
            elementId: $scope.type,
            elementType: $scope.logElementType,
            elementSub: $scope.type,
            elementGroup: $scope.logElementGroup,
            source: "system",
            tags: ["query", $scope.type]
        });

        // Cancel any previous data query currently running.
        if($scope.outstandingDataQuery[databaseName] && $scope.outstandingDataQuery[databaseName][tableName]) {
            $scope.outstandingDataQuery[databaseName][tableName].abort();
        }

        // Execute the data query, calling the function defined in "done" or "fail" as needed.
        $scope.outstandingDataQuery[databaseName][tableName] = executeQueryFunction(connection, query);

        $scope.outstandingDataQuery[databaseName][tableName].always(function() {
            $scope.outstandingDataQuery[databaseName][tableName] = undefined;
        });

        $scope.outstandingDataQuery[databaseName][tableName].done(function(response) {
            XDATA.userALE.log({
                activity: "alter",
                action: "receive",
                elementId: $scope.type,
                elementType: $scope.logElementType,
                elementSub: $scope.type,
                elementGroup: $scope.logElementGroup,
                source: "system",
                tags: ["receive", $scope.type]
            });

            finishQueryingLayers();

            $scope.$apply(function() {
                // The response for an array-counts query is an array and the response for other queries is an object containing a data array.
                updateDataFunction(response.data || response, layers);
            });

            XDATA.userALE.log({
                activity: "alter",
                action: "render",
                elementId: $scope.type,
                elementType: $scope.logElementType,
                elementSub: $scope.type,
                elementGroup: $scope.logElementGroup,
                source: "system",
                tags: ["render", $scope.type]
            });
        });

        $scope.outstandingDataQuery[databaseName][tableName].fail(function(response) {
            finishQueryingLayers();

            if(response.status === 0) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "canceled",
                    elementId: $scope.type,
                    elementType: $scope.logElementType,
                    elementSub: $scope.type,
                    elementGroup: $scope.logElementGroup,
                    source: "system",
                    tags: ["canceled", $scope.type]
                });
            } else {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "failed",
                    elementId: $scope.type,
                    elementType: $scope.logElementType,
                    elementSub: $scope.type,
                    elementGroup: $scope.logElementGroup,
                    source: "system",
                    tags: ["failed", $scope.type]
                });

                $scope.$apply(function() {
                    updateDataFunction([], layers, true);
                });

                // See if the error response contains a Neon notification to show through the Error Notification Service.
                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.responseJSON.error, response.responseJSON.stackTrace);
                }

                // TODO Create an ERROR_CODES object in the Error Notification Service
                $scope.functions.onError(response, {
                    TOO_MUCH_DATA_ERROR: errorNotificationService.TOO_MUCH_DATA_ERROR
                });
            }
        });
    };

    /**
     * Builds and returns the Neon query object for the given layers using the database and table with the given names.
     * @method buildQuery
     * @param {Array} layers
     * @param {String} databaseName
     * @param {String} tableName
     * @param {Function} [addToQueryFunction] (Optional)
     * @return {neon.query.Query}
     * @private
     */
    var buildQuery = function(layers, databaseName, tableName, addToQueryFunction) {
        var query = new neon.query.Query().selectFrom(databaseName, tableName);
        var whereClause = $scope.functions.createNeonQueryWhereClause(layers);

        var unsharedFilterField;
        var unsharedFilterValue;
        layers.forEach(function(layer) {
            if(datasetService.isFieldValid(layer.unsharedFilterField) && layer.unsharedFilterValue) {
                // The unshared filter will be the same for all layers with the same database and table.
                unsharedFilterField = layer.unsharedFilterField;
                unsharedFilterValue = layer.unsharedFilterValue;
            }
        });

        if(unsharedFilterField && unsharedFilterValue) {
            var operator = "contains";
            if($.isNumeric(unsharedFilterValue)) {
                operator = "=";
                unsharedFilterValue = parseFloat(unsharedFilterValue);
            }
            var unsharedFilterWhereClause = neon.query.where(unsharedFilterField.columnName, operator, unsharedFilterValue);
            whereClause = whereClause ? neon.query.and(whereClause, unsharedFilterWhereClause) : unsharedFilterWhereClause;
        }

        if(whereClause) {
            query.where(whereClause);
        }

        return addToQueryFunction ? addToQueryFunction(query, layers) : $scope.functions.addToQuery(query, layers);
    };

    /**
     * Event handler for theme changed events issued over Neon's messaging channels.
     * @method handleThemeChangedEvent
     * @param {Object} theme The new Neon Dashboard theme
     * @private
     */
    var handleThemeChangedEvent = function(theme) {
        if($scope.functions.onThemeChanged(theme)) {
            XDATA.userALE.log({
                activity: "alter",
                action: "receive",
                elementId: $scope.type,
                elementType: $scope.logElementType,
                elementSub: $scope.type,
                elementGroup: $scope.logElementGroup,
                source: "system",
                tags: ["theme-changed", $scope.type]
            });
        }
    };

    /**
     * Event handler for filters changed events issued over Neon's messaging channels.
     * @method handleFiltersChangedEvent
     * @param {Object} message A Neon filters changed message
     * @private
     */
    var handleFiltersChangedEvent = function(message) {
        // All valid filters changed events will contain an addedFilter including replace and remove filter events.
        if(message.addedFilter && message.addedFilter.databaseName && message.addedFilter.tableName) {
            XDATA.userALE.log({
                activity: "alter",
                action: "query",
                elementId: $scope.type,
                elementType: $scope.logElementType,
                elementSub: $scope.type,
                elementGroup: $scope.logElementGroup,
                source: "system",
                tags: ["filters-changed", $scope.type]
            });

            checkNeonDashboardFilters({
                databaseName: message.addedFilter.databaseName,
                tableName: message.addedFilter.tableName
            });
        }
    };

    /**
     * Creates and returns an object that contains all the bindings needed to recreate the state of this visualization.
     * @method getBindings
     * @return {Object}
     * @private
     */
    var getBindings = function() {
        var bindings = {
            title: $scope.createTitle()
        };

        return $scope.functions.addToBindings($scope.addLayerConfigToBindings(bindings));
    };

    /**
     * Adds properties to the given collection of bindings using the data in the active layers and returns the updated collection for this visualization.
     * @param {Object} bindings
     * @method addLayerConfigToBindings
     * @return {Object}
     */
    $scope.addLayerConfigToBindings = function(bindings) {
        bindings.config = [];

        $scope.active.layers.forEach(function(layer) {
            if(!layer.new) {
                var hasUnsharedFilter = datasetService.isFieldValid(layer.unsharedFilterField) && layer.unsharedFilterValue;

                var layerBindings = {
                    database: (layer.database && layer.database.name) ? layer.database.name : undefined,
                    unsharedFilterField: hasUnsharedFilter ? layer.unsharedFilterField.columnName : undefined,
                    unsharedFilterValue: hasUnsharedFilter ? layer.unsharedFilterValue : undefined,
                    table: (layer.table && layer.table.name) ? layer.table.name : undefined,
                };

                bindings.config.push($scope.functions.addToLayerBindings(layerBindings, layer));
            }
        });

        return bindings;
    };

    /******************** FILTERING FUNCTIONS ********************/

    /**
     * Adds or replaces the Neon filter in the dashboard on filterable layers based on the filter values set in this visualization.
     * @method updateNeonFilter
     * @param {Object} options The collection of function arguments.
     * @param {String} [options.databaseName] (Optional) The name of a databse.  If not given, adds a filter on all layers.
     * @param {String} [options.tableName] (Optional) The name of a table.  If not given, adds a filter on all layers.
     * @param {Boolean} [options.queryAfterFilter] (Optional) Whether to run a query and update the data for this visualization after adding the last filter.
     * @private
     */
    var updateNeonFilter = function(options) {
        addFiltersForData(findFilterData(options.database, options.table), 0, options.queryAfterFilter);
    };

    /**
     * Adds or replaces the Neon filter for the database, table, and fields in the given list of data at the given index and at each index that follows.
     * @method addFiltersForData
     * @param {Array} data Contains {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers
     * @param {Number} index
     * @param {Boolean} [queryAfterFilter] (Optional)
     * @private
     */
    var addFiltersForData = function(data, index, queryAfterFilter) {
        if(!data.length || index >= data.length) {
            if($scope.functions.shouldQueryAfterFilter() || queryAfterFilter) {
                data.forEach(function(item) {
                    runDefaultQueryAndUpdate(item.database, item.table);
                });
            }

            return;
        }

        var item = data[index];
        filterService.addFilter($scope.messenger, item.database, item.table, item.fields, $scope.functions.createNeonFilterClause, {
            visName: $scope.name,
            text: $scope.functions.createFilterTrayText(item.database, item.table, item.fields)
        }, function() {
            XDATA.userALE.log({
                activity: "select",
                action: "click",
                elementId: $scope.type,
                elementType: $scope.logElementType,
                elementSub: $scope.type,
                elementGroup: $scope.logElementGroup,
                source: "user",
                tags: ["filter", $scope.type]
            });
            addFiltersForData(data, ++index, queryAfterFilter);
        });
    };

    /**
     * Removes the Neon filter from the dashboard on filterable layers in this visualization.
     * @method removeNeonFilter
     * @param {Object} options The collection of function arguments.
     * @param {Array} [options.layers] (Optional) The layers from which to remove the filter.  If not given, uses active.layers.
     * @param {String} [options.databaseName] (Optional) The name of a databse.  If not given, removes the filter from all layers.
     * @param {String} [options.tableName] (Optional) The name of a table.  If not given, removes the filter from all layers.
     * @param {Boolean} [options.queryAfterFilter] (Optional) Whether to run a query and update the data for this visualization after removing the last filter.
     * @param {Boolean} [options.fromSystem] (Optional) Whether removing filters was triggered by a system event.
     * @private
     */
    var removeNeonFilter = function(options) {
        removeFiltersForData(findFilterData(options.database, options.table, options.layers, true), 0, options.queryAfterFilter, options.fromSystem);
    };

    /**
     * Removes the Neon filter for the database, table, and fields in the given list of data at the given index and at each index that follows.
     * @method removeFiltersForData
     * @param {Array} data Contains {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers
     * @param {Number} index
     * @param {Boolean} queryAfterFilter (Optional)
     * @param {Boolean} fromSystem (Optional)
     * @private
     */
    var removeFiltersForData = function(data, index, queryAfterFilter, fromSystem) {
        if(!data.length || index >= data.length) {
            var unfiltered = $scope.getDataLayers().every(function(layer) {
                return !layer.filterable;
            });

            if(unfiltered) {
                $scope.functions.removeFilterValues();
            }

            if($scope.functions.shouldQueryAfterFilter() || queryAfterFilter) {
                data.forEach(function(item) {
                    runDefaultQueryAndUpdate(item.database, item.table);
                });
            }

            return;
        }

        var item = data[index];
        filterService.removeFilter(item.database, item.table, item.fields, function() {
            if(!fromSystem) {
                XDATA.userALE.log({
                    activity: "deselect",
                    action: "click",
                    elementId: $scope.type,
                    elementType: "button",
                    elementSub: $scope.type,
                    elementGroup: $scope.logElementGroup,
                    source: "user",
                    tags: ["filter", $scope.type]
                });
            }
            removeFiltersForData(data, ++index, queryAfterFilter, fromSystem);
        });
    };

    /******************** ANGULAR FUNCTIONS ********************/

    /**
     * Generates and returns the title for this visualization.
     * @method createTitle
     * @param {Boolean} resetQueryTitle
     * @return {String}
     */
    $scope.createTitle = function(resetQueryTitle) {
        if(resetQueryTitle) {
            $scope.queryTitle = "";
        }
        if($scope.queryTitle) {
            return $scope.queryTitle;
        }
        return $scope.bindings.title || $scope.name;
    };

    /**
     * Creates and returns the object containing the export data for this visualization.
     * Called by the options-menu directive.
     * @method getExportData
     * @return {Object}
     */
    $scope.getExportData = function() {
        XDATA.userALE.log({
            activity: "perform",
            action: "click",
            elementId: $scope.type,
            elementType: "button",
            elementSub: "export",
            elementGroup: $scope.logElementGroup,
            source: "user",
            tags: ["options", $scope.type, "export"]
        });


        return $scope.createExportData(buildQuery, exportService);
    };

    /**
     * Creates and returns the object containing the export data for this visualization using the given buildQuery function.
     * @method createExportData
     * @param {Function} buildQueryFunction
     * @param {Object} exportService
     * @return {Object}
     */
    $scope.createExportData = function(buildQueryFunction) {
        var queryData = [];
        $scope.active.layers.forEach(function(layer) {
            if(!layer.new) {
                var index = _.findIndex(queryData, {
                    database: layer.database.name,
                    table: layer.table.name
                });
                if(index < 0) {
                    var query = buildQueryFunction([layer], layer.database.name, layer.table.name);
                    queryData.push({
                        layer: layer,
                        query: $scope.addToExportQuery(query)
                    });
                }
            }
        });

        return $scope.functions.createExportDataObject($scope.exportId, queryData);
    };

    /**
     * Adds properties for exporting data to the given query and returns the updated query.
     * @method addToExportQuery
     * @param {neon.query.Query} query
     * @return {neon.query.Query}
     */
    $scope.addToExportQuery = function(query) {
        query.limitClause = exportService.getLimitClause();
        query.ignoreFilters_ = exportService.getIgnoreFilters();
        query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
        return query;
    };

    /**
     * Resizes the options menu for this visualization.
     * Called by the options-menu directive.
     * @method resizeOptionsMenu
     */
    $scope.resizeOptionsMenu = function() {
        var container = $scope.element.find(".options-container");
        // Make the height of the options menu match the height of the display below the menu container and popover arrow.
        var height = $scope.element.height() - container.outerHeight(true) - 10;
        // Make the width of the options menu match the width of the display.
        var width = $scope.element.width();

        var popover = container.find(".popover .popover-content");
        popover.css("height", height + "px");
        popover.css("width", width + "px");
    };

    /**
     * Logs the change for the given option, value, and element type.
     * @method logChange
     * @param {String} option
     * @param {String} value
     * @param {String} [type=combobox] (Optional)
     * @private
     */
    $scope.logChange = function(option, value, type) {
        XDATA.userALE.log({
            activity: "select",
            action: "click",
            elementId: $scope.type + "Options",
            elementType: type || "combobox",
            elementSub: option,
            elementGroup: $scope.logElementGroup,
            source: "user",
            tags: ["options", $scope.type, value]
        });
    };

    /**
     * Updates the 'from' language on translation and translates if 'Show Translation' is checked
     * @method handleChangeFromLanguage
     * @param {String} language The 'from' translation language to change to
     */
    $scope.handleChangeFromLanguage = function(language) {
        $scope.logChange("sourceLanguage", language);
        $scope.languages.chosenFromLanguage = language;

        if($scope.active.showTranslations) {
            $scope.functions.updateTranslations();
        }
    };

    /**
     * Updates the 'to' language on translation and translates if 'Show Translation' is checked
     * @method handleChangeToLanguage
     * @param {String} language The 'to' translation language to change to
     */
    $scope.handleChangeToLanguage = function(language) {
        $scope.logChange("targetLanguage", language);
        $scope.languages.chosenToLanguage = language;

        if($scope.active.showTranslations) {
            $scope.functions.updateTranslations();
        }
    };

    /**
     * Translates all text back to its original form if checked is false, or to the specified 'to' language if checked is true.
     * @method handleToggleTranslation
     * @param {Boolean} checked Whether 'Show Translation' is checked or unchecked
     * @param {String} fromLang The 'from' language to use for translation
     * @param {String} toLang The 'to' language to use for translation
     */
    $scope.handleToggleTranslations = function(checked, fromLang, toLang) {
        $scope.logChange("showTranslations", checked);
        $scope.active.showTranslations = checked;

        if(checked) {
            $scope.languages.chosenFromLanguage = fromLang;
            $scope.languages.chosenToLanguage = toLang;
            $scope.functions.updateTranslations();
        } else {
            $scope.functions.removeTranslations();
        }
    };

    /**
     * Handles changing the database for a visualization with a single data layer.
     * @method handleChangeDatabase
     */
    $scope.handleChangeDatabase = function() {
        // Behavior is defined in the single layer controller.
    };

    /**
     * Handles changing the table for a visualization with a single data layer.
     * @method handleChangeTable
     */
    $scope.handleChangeTable = function() {
        // Behavior is defined in the single layer controller.
    };

    /**
     * Handles changing the unshared filter field for a visualization with a single data layer.
     * @method handleChangeUnsharedFilterField
     */
    $scope.handleChangeUnsharedFilterField = function() {
        // Behavior is defined in the single layer controller.
    };

    /**
     * Handles changing the unshared filter value for a visualization with a single data layer.
     * @method handleChangeUnsharedFilterValue
     */
    $scope.handleChangeUnsharedFilterValue = function() {
        // Behavior is defined in the single layer controller.
    };

    /**
     * Handles removing the unshared filter for a visualization with a single data layer.
     * @method handleRemoveUnsharedFilter
     */
    $scope.handleRemoveUnsharedFilter = function() {
        // Behavior is defined in the single layer controller.
    };

    /**
     * Updates the properties as needed for other layers that have the same database and table as the given layer.
     * @method updateOtherLayers
     * @param {Object} layer
     * @private
     */
    var updateOtherLayers = function(layer) {
        $scope.active.layers.forEach(function(other) {
            // Layers with the same database/table must all have the same unshared filter and filter setting.
            if(other.database.name === layer.database.name && other.table.name === layer.table.name) {
                other.unsharedFilterField = $scope.functions.findFieldObject(layer.unsharedFilterField.columnName, "", other);
                other.unsharedFilterValue = layer.unsharedFilterValue;
                other.filterable = layer.filterable;
            };
        });

    };
}]);

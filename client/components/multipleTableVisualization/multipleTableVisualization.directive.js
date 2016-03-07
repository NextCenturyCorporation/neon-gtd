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

angular.module('neonDemo.directives').directive('multipleTableVisualization',
['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'LinksPopupService', 'ThemeService', 'TranslationService', 'VisualizationService',
function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, themeService, translationService, visualizationService) {
    return {
        templateUrl: 'components/multipleTableVisualization/multipleTableVisualization.html',
        restrict: 'EA',
        scope: {
            bindings: '=',
            logElementGroup: '@?',
            logElementType: '@?',
            name: '@',
            stateId: '@',
            type: '@',
            visualizationId: '@'
        },

        compile: function($element, $attrs) {
            // Must add angular attributes, controllers, and templates here before angular compiles the HTML for this directive.
            $element.find(".visualization").attr("visualization-id", $attrs.visualizationId);
            $element.find(".visualization").attr("ng-controller", $attrs.type + "Controller");
            $element.find(".visualization-display").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Display.html'");
            $element.find(".visualization-headers").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Headers.html'");
            $element.find(".visualization-options").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Options.html'");

            // Returns the angular directive link function.
            return function($scope, $element) {
                $scope.element = $element;
            }
        },

        controller: ["$scope", function($scope) {
            $scope.logElementGroup = $scope.logElementGroup || "chart_group";
            $scope.logElementType = $scope.logElementType || "canvas";

            $scope.active = {
                layers: [],
                queryByTable: false,
                displayOverlapsHeaders: false
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

            /**
             * Returns the jQuery element in this visualization matching the given string, or the element for this visualization itself if no string is given.
             * @param {String} element
             * @method getElement
             * @return {Object}
             */
            $scope.functions.getElement = function(element) {
                return element ? $scope.element.find(element) : $scope.element;
            };

            /**
             * Subscribes the messenger for this visualization to events with the given type using the given listener.
             * @param {String} type
             * @param {Function} listener
             * @method subscribe
             */
            $scope.functions.subscribe = function(type, listener) {
                $scope.messenger.subscribe(type, listener);
            };

            /**
             * Publishes an event with the given type and data using the messenger for this visualization.
             * @param {String} type
             * @param {Object} data
             * @method publish
             */
            $scope.functions.publish = function(type, data) {
                $scope.messenger.publish(type, data);
            };

            /**
             * Initializes this visualization.
             * @method init
             */
            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, runDefaultQueryAndUpdate);
                $scope.messenger.events({
                    filtersChanged: handleFiltersChangedEvent
                });

                $scope.exportId = exportService.register($scope.makeExportObject);
                themeService.registerListener($scope.visualizationId, handleThemeChangedEvent);
                visualizationService.register($scope.stateId, getBindings);

                if($scope.functions.allowTranslation() && translationService.hasKey()) {
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

                ($scope.bindings.config || []).forEach(function(item) {
                    var layer = $scope.createLayer(item);
                    updateOtherLayers(layer);
                    $scope.functions.onUpdateLayer(layer);
                });

                if($scope.active.layers.length) {
                    var updated = checkDashboardFilters();
                    if(!updated) {
                        runDefaultQueryAndUpdate();
                    }
                }
            };

            /**
             * Creates and returns the source for the links popup data for the given layer.
             * @param {Object} layer
             * @method createLayerLinksSource
             * @return {String}
             */
            var createLayerLinksSource = function(layer) {
                return $scope.visualizationId + "-" + layer.database.name + "-" + layer.table.name;
            };

            /**
             * Returns whether this visualization allows translation of its data.
             * @method allowTranslation
             * @return {Boolean}
             */
            $scope.functions.allowTranslation = function() {
                return false;
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
                var height = $scope.element.height() - $scope.element.find(".options-container").outerHeight(true);
                if(!$scope.active.displayOverlapsHeaders) {
                    height -= $scope.element.find(".filter-container").outerHeight(true);
                }
                $("#" + $scope.visualizationId).height(height);
                $("#" + $scope.visualizationId).width($scope.element.width());

                $scope.functions.onResize($scope.element.height(), $scope.element.width(), 25);
            };

            /**
             * Resizes the options menu for this visualization.
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
             * Returns whether a filter is set in this visualization.
             * @method isFilterSet
             * @return {Boolean}
             */
            $scope.functions.isFilterSet = function() {
                return false;
            };

            /**
             * Handles any additional behavior for destroying this visualization.
             * @method onDestroy
             */
            $scope.functions.onDestroy = function() {
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
             * Handles any additional behavior for resizing this visualization.
             * @param {Number} elementHeight
             * @param {Number} elementWidth
             * @param {Number} headersHeight
             * @method onResize
             */
            $scope.functions.onResize = function() {
                // Do nothing by default.
            };

            /**
             * Adds a resize listener to the given element in this visualization.
             * @param {String} element
             * @method addResizeListener
             */
            $scope.functions.addResizeListener = function(element) {
                $scope.element.find(element).resize(resize);
                resizeListeners.push(element);
            };

            /**
             * Gets the list of databases from the dataset service and sets the active database, table, and fields for the given layer.
             * @param {Object} layer
             * @method updateDatabases
             */
            $scope.updateDatabases = function(layer) {
                layer.databases = datasetService.getDatabases();
                layer.database = layer.databases[0];
                $scope.updateTables(layer);
            };

            /**
             * Gets the list of tables from the dataset service and sets the active table and fields for the given layer.
             * @param {Object} layer
             * @method updateTables
             */
            $scope.updateTables = function(layer) {
                layer.tables = datasetService.getTables(layer.database.name);
                layer.table = layer.tables[0];
                $scope.updateFields(layer);
            };

            /**
             * Gets the list of fields from the dataset service and sets the active fields for the given layer.
             * @param {Object} layer
             * @method updateFields
             * @private
             */
            $scope.updateFields = function(layer) {
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
             * Handles any additional behavior for updating the fields for the given layer.
             * @param {Object} layer
             * @method onUpdateFields
             */
            $scope.functions.onUpdateFields = function() {
                // Do nothing by default.
            };

            /**
             * Builds and executes the default data query for the databases and tables with the given names and updates the data for this visualization.
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @method runDefaultQueryAndUpdate
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
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @method findQueryAndUpdateData
             * @return {Array}
             * @private
             */
            var findQueryAndUpdateData = function(databaseName, tableName) {
                var data = [];
                $scope.active.layers.forEach(function(layer) {
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
             * Builds and returns the Neon query object for the given layers using the database and table with the given names.
             * @param {Array} layers
             * @param {String} databaseName
             * @param {String} tableName
             * @param {Function} addToQuery (Optional)
             * @method buildQuery
             * @return {neon.query.Query}
             * @private
             */
            var buildQuery = function(layers, databaseName, tableName, addToQuery) {
                var query = new neon.query.Query().selectFrom(databaseName, tableName);
                var whereClause = $scope.functions.createNeonQueryClause(layers);

                var unsharedFilterField;
                var unsharedFilterValue;
                $scope.active.layers.forEach(function(layer) {
                    if(!layer.new && layer.database.name === databaseName && layer.table.name === tableName && datasetService.isFieldValid(layer.unsharedFilterField) && layer.unsharedFilterValue) {
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

                return addToQuery ? addToQuery(query, layers) : $scope.functions.addToQuery(query, layers);
            };

            /**
             * Creates and returns the Neon where clause for queries for the given layers (or returns undefined).
             * @param {Array} layers
             * @method createNeonQueryClause
             * @return {neon.query.WhereClause}
             */
            $scope.functions.createNeonQueryClause = function() {
                return undefined;
            };

            /**
             * Adds to the given Neon query and returns the updated query for the given layers.
             * @param {neon.query.Query} query
             * @param {Array} layers
             * @method addToQuery
             * @return {neon.query.Query}
             */
            $scope.functions.addToQuery = function(query) {
                return query;
            };

            /**
             * Executes the given query using the given connection.
             * @param {Object} connection
             * @param {neon.query.Query} query
             * @method executeQuery
             */
            $scope.functions.executeQuery = function(connection, query) {
                return connection.executeQuery(query);
            };

            /**
             * Updates the data and display for the given layers in this visualization.  Clears the display if the data array is empty or reset is true.
             * @param {Array} data
             * @param {Array} layers
             * @param {Boolean} reset
             * @method updateData
             */
            $scope.functions.updateData = function() {
                // Do nothing by default.
            };

            /**
             * Builds and executes a query and updates the data for this visualization using the given options.
             * @param {Object} options A collection of the following options:
             *        {String} databaseName (Optional) The name of a databse.  If not given, queries and updates all layers.
             *        {String} tableName (Optional) The name of a table.  If not given, queries and updates all layers.
             *        {Function} addToQuery (Optional) The function to help build the Neon query.  If not given, it uses $scope.functions.addToQuery.
             *        {Function} executeQuery (Optional) The function to execute the Neon query.  If not given, it uses $scope.functions.executeQuery.
             *        {Function} updateData (Optional) The function to update the data in this visualization.  If not given, it uses $scope.functions.updateData.
             * @method queryAndUpdate
             */
            $scope.functions.queryAndUpdate = function(options) {
                findQueryAndUpdateData(options.database, options.table).forEach(function(item) {
                    queryAndUpdate(item.layers, item.database, item.table, options.addToQuery || $scope.functions.addToQuery, options.executeQuery || $scope.functions.executeQuery,
                        options.updateData || $scope.functions.updateData);
                });
            };

            /**
             * Builds and executes a query on the given layers for the database and table with the given names and updates the data for this visualization using the given functions.
             * @param {Array} layers
             * @param {String} databaseName
             * @param {String} tableName
             * @param {Function} addToQuery
             * @param {Function} executeQuery
             * @param {Function} updateData
             * @method queryAndUpdate
             * @private
             */
            var queryAndUpdate = function(layers, databaseName, tableName, addToQuery, executeQuery, updateData) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                // Mark each layer as querying for use in some visualizations.
                layers.forEach(function(layer) {
                    layer.querying = true;
                });

                // Clear the display.
                updateData([], layers, true);

                var finishQueryingLayers = function() {
                    // Reset the querying status of each layer.
                    layers.forEach(function(layer) {
                        layer.querying = false;
                    });
                };

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.functions.haveValidDataFields(layers)) {
                    finishQueryingLayers();
                    return;
                }

                var query = buildQuery(layers, databaseName, tableName, addToQuery);

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
                $scope.outstandingDataQuery[databaseName][tableName] = executeQuery(connection, query);

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
                        updateData(response.data || response, layers);
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
                            updateData([], layers, true);
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
             * Returns whether the given layers have valid data fields in order to execute a query.
             * @param {Array} layers
             * @method haveValidDataFields
             * @return {Boolean}
             */
            $scope.functions.haveValidDataFields = function(layers) {
                return true;
            };

            /**
             * Handles any additional behavior for responding to a query error.
             * @param {Object} response The query response
             * @param {Object} errorCodes An object containing the error codes important to the Neon Dashboard
             * @method onError
             */
            $scope.functions.onError = function() {
                // Do nothing by default.
            };

            /**
             * Generates and returns the title for this visualization.
             * @param {Boolean} resetQueryTitle
             * @method createTitle
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
             * Event handler for theme changed events issued over Neon's messaging channels.
             * @param {Object} theme The new Neon Dashboard theme
             * @method handleThemeChangedEvent
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
             * Handles any behavior for changing the theme of elements in this visualization to the given theme.
             * @param {Object} theme
             * @method onThemeChanged
             * @return {Boolean} Whether them theme of any elements in this visualization needed to be changed
             */
            $scope.functions.onThemeChanged = function() {
                return false;
            };

            /**
             * Event handler for filters changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filters changed message
             * @method handleFiltersChangedEvent
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

                    var updated = checkDashboardFilters();
                    if(!updated) {
                        runDefaultQueryAndUpdate(message.addedFilter.databaseName, message.addedFilter.tableName);
                    }
                }
            };

            /**
             * Checks for dashboard filters for all filterable layers in this visualization.  Adds, replaces, or removes the filter displayed by this visualization if needed.
             * Queries and updates the data for the layers in this visualization if needed and returns whether a query was run.
             * @method checkDashboardFilters
             * @return {Boolean}
             * @private
             */
            var checkDashboardFilters = function() {
                var neonFilters = [];
                var filterFields = [];

                // Check for dashboard filters on all filterable database/table/field combinations in active layers.
                var data = findFilterData();
                data.forEach(function(item) {
                    var neonFilter = filterService.getFilter(item.database, item.table, item.fields);
                    if(neonFilter) {
                        neonFilters.push(neonFilter);
                        filterFields.push(item.fields);
                    }
                });

                // If no dashboard filters are set on the filtered data in this visualization yet its own filter is set, remove the filter.
                if((!neonFilters.length || neonFilters.length < data.length) && $scope.functions.isFilterSet()) {
                    $scope.functions.onRemoveFilter();
                    runDefaultQueryAndUpdate();
                    return true;
                }

                // If all filtered data in this visualization have the same dashboard filters that are compatible with this visualization, update the filter.
                if(neonFilters.length && neonFilters.length === data.length && $scope.functions.needToUpdateFilter(neonFilters)) {
                    $scope.functions.updateFilter(neonFilters[0], filterFields[0]);
                    $scope.functions.onAddFilter();
                    runDefaultQueryAndUpdate();
                    return true;
                }

                return false;
            };

            /**
             * Returns a list of objects each containing the {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers on which to filter.
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @method findFilterData
             * @return {Array}
             * @private
             */
            var findFilterData = function(databaseName, tableName, layers, ignoreFilter) {
                var data = [];
                (layers || $scope.active.layers).forEach(function(layer) {
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
             * Returns the list of field objects on which filters for given layer are set.
             * @param {Object} layer
             * @method getFilterFields
             * @return {Array}
             */
            $scope.functions.getFilterFields = function() {
                return [];
            };

            /**
             * Returns the list of field names on which filters for the given layer are set.
             * @param {Object} layer
             * @method getFilterFieldNames
             * @return {Array}
             */
            var getFilterFieldNames = function(layer) {
                return $scope.functions.getFilterFields(layer).map(function(field) {
                    return field.columnName;
                });
            };

            /**
             * Handles any behavior after adding a filter.
             * @method onAddFilter
             */
            $scope.functions.onAddFilter = function() {
                // Do nothing by default.
            };

            /**
             * Handles any behavior after removing a filter.
             * @method onRemoveFilter
             */
            $scope.functions.onRemoveFilter = function() {
                // Do nothing by default.
            };

            /**
             * Returns whether the filter displayed by this visualization needs to be updated based on the given list of Neon filters set in the dashboard.
             * @param {Array} of {neon.query.Filter} neonFilters
             * @method needToUpdateFilter
             * @return {Boolean}
             */
            $scope.functions.needToUpdateFilter = function() {
                return false;
            };

            /**
             * Updates the filter displayed by this visualization on the fields with the given names using the where clause in the given Neon filter.
             * @param {neon.query.Filter} neonFilter
             * @param {Array} fieldNames
             * @method updateFilter
             */
            $scope.functions.updateFilter = function() {
                // Do nothing by default.
            };

            /**
             * Adds or replaces the Neon filter in the dashboard on all filterable layers in this visualization.
             * @method addNeonFilter
             */
            $scope.functions.addNeonFilter = function() {
                addNeonFilter({});
            };

            /**
             * Adds or replaces the Neon filter in the dashboard on filterable layers in this visualization.
             * @param {Object} options A collection of the following options:
             *        {String} databaseName (Optional) The name of a databse.  If not given, adds a filter on all layers.
             *        {String} tableName (Optional) The name of a table.  If not given, adds a filter on all layers.
             *        {Boolean} queryAfterFilter (Optional) Whether to run a query and update the data for this visualization after adding the last filter.
             * @method addNeonFilter
             * @private
             */
            var addNeonFilter = function(options) {
                addFiltersForData(findFilterData(options.database, options.table), 0, options.queryAfterFilter);
            };

            /**
             * Adds or replaces the filter for the database, table, and fields in the given list of data at the given index and at each index that follows.
             * @param {Array} data Contains {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers
             * @param {Number} index
             * @param {Boolean} queryAfterFilter (Optional)
             * @method addFiltersForData
             * @private
             */
            var addFiltersForData = function(data, index, queryAfterFilter) {
                if(!data.length || index >= data.length) {
                    $scope.functions.onAddFilter();

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
             * Creates and returns the Neon where clause for a Neon filter on the given database, table, and fields using the filters set in this visualization.
             * Called by the Filter Service.
             * @param {Object} databaseAndTableName Contains {String} database and {String} table
             * @param {String} fieldName or {Array} fieldNames The name (or list of names) of the filter fields
             * @method createNeonFilterClause
             * @return {neon.query.WhereClause}
             */
            $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
                return neon.query.where(fieldName, "!=", null);
            };

            /**
             * Returns the description text for the global filter data object to show in the filter tray.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {Array} fieldNames
             * @method createFilterTrayText
             * @return {String}
             */
            $scope.functions.createFilterTrayText = function() {
                return "";
            };

            /**
             * Returns whether this visualization should query for new data and updates its display after changing its filter.
             * @method shouldQueryAfterFilter
             * @return {Boolean}
             */
            $scope.functions.shouldQueryAfterFilter = function() {
                return false;
            };

            /**
             * Removes the Neon filter from the dashboard on all filterable layers in this visualization.
             * @method removeNeonFilter
             */
            $scope.functions.removeNeonFilter = function() {
                removeNeonFilter({});
            };

            /**
             * Removes the Neon filter from the dashboard on filterable layers in this visualization.
             * @param {Object} options A collection of the following options:
             *        {Array} layers (Optional) The layers from which to remove the filter.  If not given, uses active.layers.
             *        {String} databaseName (Optional) The name of a databse.  If not given, removes the filter from all layers.
             *        {String} tableName (Optional) The name of a table.  If not given, removes the filter from all layers.
             *        {Boolean} queryAfterFilter (Optional) Whether to run a query and update the data for this visualization after removing the last filter.
             *        {Boolean} fromSystem (Optional) Whether removing filters was triggered by a system event.
             * @method removeNeonFilter
             * @private
             */
            var removeNeonFilter = function(options) {
                removeFiltersForData(findFilterData(options.database, options.table, options.layers, true), 0, options.queryAfterFilter, options.fromSystem);
            };

            /**
             * Removes the filter for the database, table, and fields in the given list of data at the given index and at each index that follows.
             * @param {Array} data Contains {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers
             * @param {Number} index
             * @param {Boolean} queryAfterFilter (Optional)
             * @param {Boolean} fromSystem (Optional)
             * @method removeFiltersForData
             * @private
             */
            var removeFiltersForData = function(data, index, queryAfterFilter, fromSystem) {
                if(!data.length || index >= data.length) {
                    var unfiltered = $scope.active.layers.every(function(layer) {
                        return !layer.filterable;
                    });

                    if(unfiltered) {
                        $scope.functions.onRemoveFilter();
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

            /**
             * Creates and returns an object that contains all the bindings needed to recreate this visualization's state.
             * @return {Object}
             * @method getBindings
             * @private
             */
            var getBindings = function() {
                var bindings = {
                    config: [],
                    title: $scope.createTitle()
                };

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

                return $scope.functions.addToBindings(bindings);
            };

            /**
             * Adds to the given list of layer bindings using the given layer and returns the updated list for this visualization.
             * @param {Object} bindings
             * @param {Object} layer
             * @method addToLayerBindings
             * @return {Object}
             */
            $scope.functions.addToLayerBindings = function(bindings, layer) {
                bindings.name = layer.name;
                return bindings;
            };

            /**
             * Adds to the given list of bindings and returns the updated list for this visualization.
             * @param {Object} bindings
             * @method addToBindings
             * @return {Object}
             */
            $scope.functions.addToBindings = function(bindings) {
                return bindings;
            };

            /**
             * Logs the change for the given option, value, and element type.
             * @param {String} option
             * @param {String} value
             * @param {String} type (Optional) [Default:  combobox]
             * @method logChange
             * @private
             */
            var logChange = function(option, value, type) {
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
             * Utility function for logging a change of the given option to the given value using an element of the given type, running a new query and updating the data.
             * @param {String} option
             * @param {String} value
             * @param {String} type (Optional) [Default:  combobox]
             * @method logChangeAndUpdateData
             */
            $scope.functions.logChangeAndUpdateData = function(option, value, type) {
                logChange(option, value, type);
                if(!$scope.initializing) {
                    runDefaultQueryAndUpdate();
                }
            };


            /**
             * Updates the 'from' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'from' translation language to change to
             * @method handleChangeFromLanguage
             */
            $scope.handleChangeFromLanguage = function(language) {
                logChange("sourceLanguage", language);
                $scope.languages.chosenFromLanguage = language;

                if($scope.active.showTranslations) {
                    $scope.functions.updateTranslations();
                }
            };

            /**
             * Updates the 'to' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'to' translation language to change to
             * @method handleChangeToLanguage
             */
            $scope.handleChangeToLanguage = function(language) {
                logChange("targetLanguage", language);
                $scope.languages.chosenToLanguage = language;

                if($scope.active.showTranslations) {
                    $scope.functions.updateTranslations();
                }
            };

            /**
             * Translates all text back to its original form if checked is false, or to the specified 'to' language if checked is true.
             * @param {Boolean} checked Whether 'Show Translation' is checked or unchecked
             * @param {String} fromLang The 'from' language to use for translation
             * @param {String} toLang The 'to' language to use for translation
             * @method handleToggleTranslation
             */
            $scope.handleToggleTranslations = function(checked, fromLang, toLang) {
                logChange("showTranslations", checked);
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
             * Updates all translations in this visualization.
             * @method updateTranslations
             */
            $scope.functions.updateTranslations = function() {
                // Do nothing by default.
            };

            /**
             * Translates the given data for this visualization using the global to/from languages and the given success/failure callbacks.
             * @param {Array} data
             * @param {Function} translationSuccessCallback (Optional)
             * @param {Function} translationFailureCallback (Optional)
             * @method runTranslation
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
             * Removes all translations from this visualization.
             * @method removeTranslations
             */
            $scope.functions.removeTranslations = function() {
                // Do nothing by default.
            };

            /**
             * Creates and returns the links for the given field object and item object.
             * @param {Object} field Containing {String} columnName
             * @param {String} value
             * @method createLinks
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
             * Creates and returns the links for the given external service type, link key, and link data.
             * @param {String} type
             * @param {String} key
             * @param {Object} data
             * @method createLinksForData
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
             * Creates and returns the link buttons for the given field object and data array.
             * @param {Object} field Containing {String} columnName
             * @param {Array} array A list of objects each containing a property matching the field name
             * @method createLinkButtons
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
             * Removes the links for the given field object and value, or all links for this visualization if no field or value are given.
             * @param {Object} field (Optional)
             * @param {String} value (Optional)
             * @method removeLinks
             */
            $scope.functions.removeLinks = function(field, value) {
                if(datasetService.isFieldValid(field) && value) {
                    linksPopupService.removeLinksForKey($scope.visualizationId, linksPopupService.generateKey(field, value));
                } else {
                    linksPopupService.deleteLinks($scope.visualizationId);
                }
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
             * Returns the configuration for the linky library.
             * @method getLinkyConfig
             * @return {Object}
             */
            $scope.functions.getLinkyConfig = function() {
                return datasetService.getLinkyConfig() || DEFAULT_LINKY_CONFIG;
            };

            /**
             * Finds and returns the field object in the fields in the given layer that matches the given field name, binding with the given key, or mapping with the given key.
             * Returns a blank field object if no such field exists.
             * @param {Object} layer
             * @param {String} fieldName
             * @param {String} bindingKey
             * @param {String} mappingKey
             * @method findFieldObject
             * @return {Object}
             */
            $scope.functions.findFieldObject = function(layer, fieldName, bindingKey, mappingKey) {
                var find = function(name) {
                    return _.find(layer.fields, function(field) {
                        return field.columnName === name;
                    });
                };

                var field;
                if(fieldName) {
                    field = find(fieldName);
                }

                if(!field && bindingKey) {
                    field = find($scope.bindings[bindingKey]);
                }

                if(!field && mappingKey) {
                    field = find($scope.functions.getMapping(layer.database.name, layer.table.name, mappingKey));
                }

                return field || datasetService.createBlankField();
            };

            /**
             * Returns whether the given field object is valid.
             * @param {Object} fieldObject
             * @method isFieldValid
             * @return {Boolean}
             */
            $scope.functions.isFieldValid = function(fieldObject) {
                return datasetService.isFieldValid(fieldObject);
            };

            /**
             * Returns the mapping for the given database, table, and key or any empty string if no mapping exists.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {String} key
             * @method getMapping
             * @return {String}
             */
            $scope.functions.getMapping = function(databaseName, tableName, key) {
                return datasetService.getMapping(databaseName, tableName, key);
            };

            /**
             * Returns the list of unsorted fields (in the order they are defined in the dashboard configuration).
             * @method getUnsortedFields
             * @return {Array}
             */
            $scope.functions.getUnsortedFields = function(databaseName, tableName) {
                return datasetService.getFields(databaseName, tableName);
            };

            /**
             * Returns the color maps for the given field object.
             * @param {Object} field
             * @method getColorMaps
             * @return {Object}
             */
            $scope.functions.getColorMaps = function(database, table, field) {
                return datasetService.getActiveDatasetColorMaps(database.name, table.name, field.columnName);
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
             * Returns the filter key for the database and table in the given layer and the given filter clause.
             * @param {Object} layer
             * @param {Object} filterClause
             * @method getFilterKey
             * @return {String}
             */
            $scope.functions.getFilterKey = function(layer, filterClause) {
                return filterService.getFilterKey(layer.database.name, layer.table.name, filterClause);
            };

            /**
             * Returns whether the given Neon filter object is a single clause filter.
             * @param {neon.query.Filter} filter
             * @method isSingleClauseFilter
             * @return {Boolean}
             */
            $scope.functions.getNumberOfFilterClauses = function(neonFilter) {
                return filterService.hasSingleClause(neonFilter) ? 1 : filterService.getMultipleClausesLength(neonFilter);
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
             * Returns whether to show the text for the options menu button.
             * Called by the options-menu directive.
             * @method showMenuText
             * @return {Boolean}
             */
            $scope.functions.showMenuText = function() {
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
             * Called by the options-menu directive.  Wrapper for createExportObject.
             * @method makeExportObject
             * @return {Object}
             */
            $scope.makeExportObject = function() {
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

                var queryData = [];
                $scope.active.layers.forEach(function(layer) {
                    if(!layer.new) {
                        var index = _.findIndex(queryData, {
                            database: layer.database.name,
                            table: layer.table.name
                        });
                        if(index < 0) {
                            var query = buildQuery([layer], layer.database.name, layer.table.name);
                            query.limitClause = exportService.getLimitClause();
                            query.ignoreFilters_ = exportService.getIgnoreFilters();
                            query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
                            queryData.push({
                                layer: layer,
                                query: query
                            });
                        }
                    }
                });

                return $scope.functions.createExportDataObject($scope.exportId, queryData);
            };

            /**
             * Creates and returns an object containing the data needed to export this visualization.
             * @param {String} exportId
             * @param {Array) queryData A list of objects containing {String} database, {String} table, and {neon.query.Query} query
             * @method createExportDataObject
             * @return {Object}
             */
            $scope.functions.createExportDataObject = function() {
                return {};
            };

            /**
             * Creates a new data layer for this visualization using the given configuration data and dataset defaults.
             * If the configuration data is not given, the new data layer is created in new & edit mode.
             * @param {Object} config (Optional)
             * @method createLayer
             */
            $scope.createLayer = function(config) {
                var layer = {
                    databases: datasetService.getDatabases(),
                    filterable: true,
                    show: true
                };

                // Layers are either created during initialization (with a config) or by the user through a button click (without a config).
                if(!config) {
                    // TODO Logging
                    layer.edit = true;
                    layer.new = true;
                }

                layer.database = (config && config.database) ? datasetService.getDatabaseWithName(config.database) : layer.databases[0];
                layer.tables = datasetService.getTables(layer.database.name);
                layer.table = (config && config.table) ? datasetService.getTableWithName(layer.database.name, config.table) : layer.tables[0];

                if(layer.database && layer.database.name && layer.table && layer.table.name) {
                    layer.name = ((config ? config.name : layer.table.name) || layer.table.name).toUpperCase();
                    layer.fields = datasetService.getSortedFields(layer.database.name, layer.table.name);
                    layer.unsharedFilterField = $scope.functions.findFieldObject(layer, config ? config.unsharedFilterField : "");
                    layer.unsharedFilterValue = config ? config.unsharedFilterValue : "";
                    $scope.active.layers.push($scope.functions.addToNewLayer(layer, config || {}));
                    $scope.validateLayerName(layer, 0);
                }

                return layer;
            };

            /**
             * Adds properties to the given layer object specific to this visualization and returns the updated layer.
             * @param {Object} layer
             * @method addToNewLayer
             * @return {Object}
             */
            $scope.functions.addToNewLayer = function(layer) {
                return layer;
            };

            /**
             * Toggles editing on the given layer.
             * @param {Object} layer
             * @method toggleEditLayer
             */
            $scope.toggleEditLayer = function(layer) {
                // TODO Logging
                layer.edit = true;
            };

            /**
             * Updates the properties for the given layer, removes it from new & edit mode, updates its filter, queries for new data and updates this visualization.
             * @param {Object} layer
             * @method updateLayer
             */
            $scope.updateLayer = function(layer) {
                // TODO Logging
                var isNew = layer.new;
                var updated = false;
                layer.edit = false;
                layer.new = false;

                updateOtherLayers(layer);
                $scope.functions.onUpdateLayer(layer);

                // For new filterable layers, add a neon filter to the dashboard or check for dashboard filters.
                if(isNew && layer.filterable) {
                    if($scope.functions.isFilterSet()) {
                        $scope.functions.addNeonFilter({
                            database: layer.database.name,
                            table: layer.table.name,
                            queryAfterFilter: true
                        });
                        return;
                    }

                    updated = checkDashboardFilters();
                }

                if(!updated) {
                    runDefaultQueryAndUpdate(layer.database.name, layer.table.name);
                }
            };

            /**
             * Updates the properties as needed for other layers that have the same database and table as the given layer.
             * @param {Object} layer
             * @method updateOtherLayers
             * @private
             */
            var updateOtherLayers = function(layer) {
                $scope.active.layers.forEach(function(other) {
                    // Layers with the same database/table must all have the same unshared filter and filter setting.
                    if(other.database.name === layer.database.name && other.table.name === layer.table.name) {
                        other.unsharedFilterField = $scope.functions.findFieldObject(other, layer.unsharedFilterField.columnName);
                        other.unsharedFilterValue = layer.unsharedFilterValue;
                        other.filterable = layer.filterable;
                    };
                });

            };

            /**
             * Handles any additional behavior for updating the given layer like updating properties specific to this visualization.
             * @param {Object} layer
             * @method onUpdateLayer
             */
            $scope.functions.onUpdateLayer = function(layer) {
                // Do nothing by default.
            };

            /**
             * Deletes the given layer, removing its filter and updating this visualization.
             * @param {Object} layer
             * @param {Number} indexReversed The index of the layer in the list of layers (reversed).
             * @method deleteLayer
             */
            $scope.deleteLayer = function(layer, indexReversed) {
                // TODO Logging
                $scope.functions.onDeleteLayer(layer);
                $scope.active.layers.splice($scope.active.layers.length - 1 - indexReversed, 1);
                if(layer.filterable && $scope.functions.isFilterSet()) {
                    removeNeonFilter({
                        // Include the deleted layer in the options because it will not be found in the list of active layers.
                        layers: [layer],
                        database: layer.database.name,
                        table: layer.table.name
                    });
                }
            };

            /**
             * Handles any additional behavior for deleting the given layer from this visualization.
             * @param {Object} layer
             * @method onDeleteLayer
             */
            $scope.functions.onDeleteLayer = function(layer) {
                // Do nothing by default.
            };

            /**
             * Moves the given layer to the given new index and reorders the other layers as needed.
             * @param {Object} layer
             * @param {Number} newIndexReversed The new index of the layer in the list of layers (reversed).
             * @method reorderLayer
             */
            $scope.reorderLayer = function(layer, newIndexReversed) {
                var newIndex = $scope.active.layers.length - 1 - newIndexReversed;
                var oldIndex = $scope.active.layers.indexOf(layer);
                $scope.active.layers.splice(oldIndex, 1);
                $scope.active.layers.splice(newIndex, 0, layer);
                $scope.functions.onReorderLayers();
            };

            /**
             * Handles any additional behavior for reordering the layers in this visualization.
             * @method onReorderLayers
             */
            $scope.functions.onReorderLayers = function() {
                // Do nothing by default.
            };

            /**
             * Toggles showing the given layer.
             * @param {Object} layer
             * @method toggleShowLayer
             */
            $scope.toggleShowLayer = function(layer) {
                // TODO Logging
                $scope.functions.onToggleShowLayer(layer);
            };

            /**
             * Handles any additional behavior for toggling the show setting for the given layer.
             * @param {Object} layer
             * @method onToggleShowLayer
             */
            $scope.functions.onToggleShowLayer = function(layer) {
                // Do nothing by default.
            };

            /**
             * Toggles filtering on the given layer.
             * @param {Object} layer
             * @method toggleFilterLayer
             */
            $scope.toggleFilterLayer = function(layer) {
                // TODO Logging
                updateOtherLayers(layer);

                if(!layer.new) {
                    if($scope.functions.isFilterSet()) {
                        if(layer.filterable) {
                            $scope.functions.addNeonFilter({
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
                        checkDashboardFiltersAndQueryIfNeeded();
                    }
                }
            };

            /**
             * Validates the name of the given layer, setting its error property if the name is not unique.
             * @param {Object} layer
             * @param {Number} indexReversed The index of the layer in the list of layers (reversed).
             * @method validateLayerName
             */
            $scope.validateLayerName = function(layer, indexReversed) {
                var index = $scope.active.layers.length - 1 - indexReversed;
                var invalid = $scope.active.layers.some(function(otherLayer, otherIndex) {
                    return otherLayer.name === (layer.name || layer.table.name).toUpperCase() && otherIndex !== index;
                });
                layer.error = invalid ? "Please choose a unique layer name." : undefined;
            };

            /**
             * Initializes this visualization.
             * @method init
             */
            $scope.functions.init = function() {
                neon.ready(function() {
                    $scope.init();
                });
            };
        }]
    };
}]);

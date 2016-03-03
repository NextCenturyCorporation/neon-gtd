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
                layers: []
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
                        $scope.functions.removeFilter(null, null, false, true);
                    }

                    exportService.unregister($scope.exportId);
                    linksPopupService.deleteLinks($scope.visualizationId);
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
                    updateFilter();
                    runDefaultQueryAndUpdate();
                }
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
                $("#" + $scope.visualizationId).height($scope.element.height() - $scope.element.find(".options-container").outerHeight(true));
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
             * Gets the list of databases from the dataset service, sets the active database, table, and fields for the given layer, and queries for new data.
             * @param {Object} layer
             * @method updateDatabases
             */
            $scope.updateDatabases = function(layer) {
                layer.databases = datasetService.getDatabases();
                layer.database = layer.databases[0];
                $scope.updateTables(layer);
            };

            /**
             * Gets the list of tables from the dataset service, sets the active table and fields for the given layer, and queries for new data.
             * @param {Object} layer
             * @method updateTables
             */
            $scope.updateTables = function(layer) {
                layer.tables = datasetService.getTables(layer.database.name);
                layer.table = layer.tables[0];
                $scope.updateFields(layer);
            };

            /**
             * Gets the list of fields from the dataset service, sets the active fields for the given layer, and queries for new data.
             * @param {Object} layer
             * @method updateFields
             * @private
             */
            $scope.updateFields = function(layer) {
                if($scope.functions.isFilterSet(layer)) {
                    $scope.functions.removeFilter(layer.database.name, layer.table.name, false, true);
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
             * @param {Array} databaseAndTableNames (Optional) A list of objects containing {String} database and {String} table
             * @method runDefaultQueryAndUpdate
             * @private
             */
            var runDefaultQueryAndUpdate = function(databaseAndTableNames) {
                // Save the title during the query so the title doesn't change immediately if the user changes the unshared filter.
                $scope.queryTitle = $scope.createTitle(true);

                // Resize the title and display after the error is hidden and the title is changed.
                resize();

                var list = databaseAndTableNames || getDatabaseAndTableNamesToQuery();
                list.forEach(function(item) {
                    queryAndUpdate(item.database, item.table, $scope.functions.addToQuery, $scope.functions.executeQuery, $scope.functions.updateData);
                });
            };

            /**
             * Returns a list of objects each containing the {String} database and {String} table on which to query.
             * @method getDatabaseAndTableNamesToQuery
             * @return {Array}
             * @private
             */
            var getDatabaseAndTableNamesToQuery = function() {
                var databaseAndTableNames = [];
                $scope.active.layers.forEach(function(layer) {
                    if(!layer.new) {
                        var index = _.findIndex(databaseAndTableNames, {
                            database: layer.database.name,
                            table: layer.table.name
                        });
                        if(index < 0) {
                            databaseAndTableNames.push({
                                database: layer.database.name,
                                table: layer.table.name
                            });
                        }
                    }
                });
                return databaseAndTableNames;
            };

            /**
             * Builds and returns the Neon query object for the database and table with the given names.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {Function} addToQuery (Optional)
             * @method buildQuery
             * @return {neon.query.Query}
             * @private
             */
            var buildQuery = function(databaseName, tableName, addToQuery) {
                var query = new neon.query.Query().selectFrom(databaseName, tableName);
                var whereClause = $scope.functions.createNeonQueryClause(databaseName, tableName);

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

                return addToQuery ? addToQuery(query, databaseName, tableName) : $scope.functions.addToQuery(query, databaseName, tableName);
            };

            /**
             * Creates and returns the Neon where clause for queries for this visualization (or undefined).
             * @param {String} databaseName
             * @param {String} tableName
             * @method createNeonQueryClause
             * @return {neon.query.WhereClause}
             */
            $scope.functions.createNeonQueryClause = function() {
                return undefined;
            };

            /**
             * Adds to the given Neon query and returns the updated query for the database and table with the given names.
             * @param {neon.query.Query} query
             * @param {String} databaseName
             * @param {String} tableName
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
             * Updates the data and display for the database and table with the given names in this visualization.  Clears the display if the data array is empty or reset is true.
             * @param {Array} data
             * @param {String} databaseName
             * @param {String} tableName
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
                if(options.database && options.table) {
                    queryAndUpdate(options.database, options.table, options.addToQuery || $scope.functions.addToQuery, options.executeQuery || $scope.functions.executeQuery,
                            options.updateData || $scope.functions.updateData);
                    return;
                }

                getDatabaseAndTableNamesToQuery().forEach(function(item) {
                    queryAndUpdate(item.database, item.table, options.addToQuery || $scope.functions.addToQuery, options.executeQuery || $scope.functions.executeQuery,
                        options.updateData || $scope.functions.updateData);
                });
            };

            /**
             * Builds and executes a query on the database and table with the given names and updates the data for this visualization using the given functions.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {Function} addToQuery
             * @param {Function} executeQuery
             * @param {Function} updateData
             * @method queryAndUpdate
             * @private
             */
            var queryAndUpdate = function(databaseName, tableName, addToQuery, executeQuery, updateData) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var hasLayer = $scope.active.layers.some(function(layer) {
                    return !layer.new && layer.database.name === databaseName && layer.table.name === tableName;
                });

                if(!hasLayer) {
                    return;
                }

                // Clear the display.
                updateData([], databaseName, tableName, true);

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.functions.hasValidDataFields()) {
                    return;
                }

                var query = buildQuery(databaseName, tableName, addToQuery);

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

                if($scope.outstandingDataQuery[databaseName] && $scope.outstandingDataQuery[databaseName][tableName]) {
                    $scope.outstandingDataQuery[databaseName][tableName].abort();
                }

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

                    $scope.$apply(function() {
                        // The response for an array-counts query is an array and the response for other queries is an object containing a data array.
                        updateData(response.data || response, databaseName, tableName);
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
                            updateData([], databaseName, tableName, true);
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
             * Returns whether this visualization has valid data fields in order to execute a query.
             * @method hasValidDataFields
             * @return {Boolean}
             */
            $scope.functions.hasValidDataFields = function() {
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
                var title = $scope.active.unsharedFilterValue ? $scope.active.unsharedFilterValue + " " : "";
                if($scope.bindings.title) {
                    return title + $scope.bindings.title;
                }
                return title + $scope.name;
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

                    updateFilter(message.addedFilter.databaseName, message.addedFilter.tableName);
                    runDefaultQueryAndUpdate([{
                        database: message.addedFilter.databaseName,
                        table: message.addedFilter.tableName
                    }]);
                }
            };

            /*
             * Updates the filter for the database and table with the given names (or all databases and tables if no names were given) by
             * finding any matching filters set by other visualizations through the filter service.
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @method updateFilter
             * @private
             */
            var updateFilter = function(databaseName, tableName) {
                findDataToFilter(databaseName, tableName).forEach(function(item) {
                    var neonFilter = filterService.getFilter(item.database, item.table, item.fields);
                    if(!neonFilter && $scope.functions.isFilterSet()) {
                        item.layers.forEach(function(layer) {
                            layer.filter = false;
                            layer.filtered = false;
                        });
                        $scope.functions.onRemoveFilter();
                    }
                    if(neonFilter) {
                        item.layers.forEach(function(layer) {
                            layer.filter = true;
                            layer.filtered = true;
                        });
                        $scope.functions.updateFilterFromNeonFilterClause(neonFilter, item.fields);
                    }
                });
            };

            /**
             * Returns a list of objects each containing the {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers on which to filter.
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @method findDataToFilter
             * @return {Array}
             * @private
             */
            var findDataToFilter = function(databaseName, tableName) {
                var dataToFilter = [];
                $scope.active.layers.forEach(function(layer) {
                    if(!layer.new && (layer.filter || layer.filtered)) {
                        var valid = $scope.functions.getFilterFields(layer).every(function(field) {
                            return datasetService.isFieldValid(field);
                        });
                        if(valid && ((databaseName && tableName) ? (databaseName === layer.database.name && tableName === layer.table.name) : true)) {
                            // Check whether the database/table/filter fields for this layer already exist in the data.
                            var fields = getFilterFieldNames(layer);
                            var index = _.findIndex(dataToFilter, {
                                database: layer.database.name,
                                table: layer.table.name,
                                fields: fields
                            });
                            if(index < 0) {
                                dataToFilter.push({
                                    database: layer.database.name,
                                    table: layer.table.name,
                                    fields: fields,
                                    layers: [layer]
                                });
                            } else {
                                dataToFilter[index].layers.push(layer);
                            }
                        }
                    }
                });
                return dataToFilter;
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
             * Handles any behavior after removing the filter.
             * @method onRemoveFilter
             */
            $scope.functions.onRemoveFilter = function() {
                // Do nothing by default.
            };

            /**
             * Updates the filter for the fields with the given names using the where clause in the given Neon filter.
             * @param {neon.query.Filter} neonFilter
             * @param {Array} fieldNames
             * @method updateFilterFromNeonFilterClause
             */
            $scope.functions.updateFilterFromNeonFilterClause = function() {
                // Do nothing by default.
            };

            /**
             * Replaces the global filter for the layers matching the given database and table names (or all layers if no names are given) with a new filter for this visualization
             * and updates the dashboard.
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @param {Boolean} shouldQueryAndUpdate (Optional)
             * @method replaceFilter
             */
            $scope.functions.replaceFilter = function(databaseName, tableName, shouldQueryAndUpdate) {
                $scope.functions.addFilter(databaseName, tableName, shouldQueryAndUpdate);
            };

            /**
             * Adds or replaces the global filter for the layers matching the given database and table names (or all layers if no names are given) with the filter for this
             * visualization and updates the dashboard.
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @param {Boolean} shouldQueryAndUpdate (Optional)
             * @method addFilter
             */
            $scope.functions.addFilter = function(databaseName, tableName, shouldQueryAndUpdate) {
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

                var dataToFilter = findDataToFilter(databaseName, tableName);
                if(dataToFilter.length) {
                    addFiltersForData(dataToFilter, 0);
                }
            };

            /**
             * Adds or replaces the filter for the database, table, and fields in the given list of data at the given index and at each index that follows.
             * @param {Array} dataToFilter Contains {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers
             * @param {Number} index
             * @param {Boolean} shouldQueryAndUpdate (Optional)
             * @method addFiltersForData
             * @private
             */
            var addFiltersForData = function(dataToFilter, index, shouldQueryAndUpdate) {
                var item = dataToFilter[index];
                // Will add or replace the filter as appropriate.
                filterService.addFilter($scope.messenger, item.database, item.table, item.fields, $scope.functions.createNeonFilterClause, {
                    visName: $scope.name,
                    text: $scope.functions.createFilterTrayText(item.database, item.table, item.fields)
                }, function() {
                    item.layers.forEach(function(layer) {
                        layer.filtered = true;
                    });
                    if(++index < dataToFilter.length) {
                        addFiltersForData(dataToFilter, index);
                    } else if($scope.functions.shouldQueryAfterFilter() || shouldQueryAndUpdate) {
                        runDefaultQueryAndUpdate(dataToFilter);
                    }
                });
            };

            /**
             * Creates and returns the Neon where clause for a Neon filter on the given database, table, and fields using the filters set in this visualization.
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
             * Removes the global filter for the layers matching the given database and table names (or all layers if no names are given) from this visualization and updates the dashboard.
             * @param {String} databaseName (Optional)
             * @param {String} tableName (Optional)
             * @param {Boolean} shouldQueryAndUpdate (Optional)
             * @param {Boolean} fromSystem (Optional)
             * @method removeFilter
             */
            $scope.functions.removeFilter = function(databaseName, tableName, shouldQueryAndUpdate, fromSystem) {
                var dataToFilter = findDataToFilter(databaseName, tableName);
                if(dataToFilter.length) {
                    removeFiltersForData(dataToFilter, 0, shouldQueryAndUpdate, fromSystem);
                }
            };

            /**
             * Removes the filter for the database, table, and fields in the given list of data at the given index and at each index that follows.
             * @param {Array} dataToFilter Contains {String} database, {String} table, {Array} of {String} fields, and {Array} of {Object} layers
             * @param {Number} index
             * @param {Boolean} shouldQueryAndUpdate (Optional)
             * @param {Boolean} fromSystem (Optional)
             * @method removeFiltersForData
             * @private
             */
            var removeFiltersForData = function(dataToFilter, index, shouldQueryAndUpdate, fromSystem) {
                var item = dataToFilter[index];
                filterService.removeFilter(item.database, item.table, item.fields, function() {
                    item.layers.forEach(function(layer) {
                        layer.filtered = false;
                    });
                    $scope.functions.onRemoveFilter();

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

                    if(++index < dataToFilter.length) {
                        removeFiltersForData(dataToFilter, index, shouldQueryAndUpdate, fromSystem);
                    } else if($scope.functions.shouldQueryAfterFilter() || shouldQueryAndUpdate) {
                        runDefaultQueryAndUpdate(dataToFilter);
                    }
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
                var name = fieldName || (bindingKey ? $scope.bindings[bindingKey] : null) || (mappingKey ? $scope.functions.getMapping(layer.database.name, layer.table.name, mappingKey) : null) || "";
                return _.find(layer.fields, function(field) {
                    return field.columnName === name;
                }) || datasetService.createBlankField();
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
             * Returns the filter key for the given filter clause.
             * @param {Object} filterClause
             * @method getFilterKey
             * @return {String}
             */
            $scope.functions.getFilterKey = function(filterClause, layer) {
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
                            var query = buildQuery(layer.database.name, layer.table.name);
                            query.limitClause = exportService.getLimitClause();
                            query.ignoreFilters_ = exportService.getIgnoreFilters();
                            query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
                            queryData.push({
                                database: layer.database.name,
                                table: layer.table.name,
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
                    filter: true,
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
                    layer.name = (config ? config.name : layer.table.name || layer.table.name).toUpperCase();
                    layer.fields = datasetService.getSortedFields(layer.database.name, layer.table.name);
                    layer.unsharedFilterField = $scope.functions.findFieldObject(layer, config ? config.unsharedFilterField : "");
                    layer.unsharedFilterValue = config ? config.unsharedFilterValue : "";
                    $scope.active.layers.push($scope.functions.addToLayer(layer, config || {}));
                    $scope.validateLayerName(layer, 0);
                }

                return layer;
            };

            /**
             * Adds properties to the given layer object specific to this visualization and returns the updated layer.
             * @param {Object} layer
             * @method addToLayer
             * @return {Object}
             */
            $scope.functions.addToLayer = function(layer) {
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
                var wasNew = layer.new;
                layer.edit = false;
                layer.new = false;

                updateOtherLayers(layer);
                $scope.functions.onUpdateLayer(layer);

                if(wasNew && layer.filter && $scope.functions.isFilterSet()) {
                    // Add a filter on the layer and query for new data.
                    $scope.functions.replaceFilter(layer.database.name, layer.table.name, true)
                } else {
                    updateFilter(layer.database.name, layer.table.name);
                    runDefaultQueryAndUpdate([{
                        database: layer.database.name,
                        table: layer.table.name
                    }]);
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
                        other.filter = layer.filter;
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
                $scope.active.layers.splice($scope.active.layers.length - 1 - indexReversed, 1);
                $scope.functions.onDeleteLayer(layer);
                $scope.functions.removeFilter(layer.database.name, layer.table.name);
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

                if(!layer.new && $scope.functions.isFilterSet()) {
                    if(layer.filter) {
                        $scope.functions.replaceFilter(layer.database.name, layer.table.name, true)
                    } else {
                        $scope.functions.removeFilter(layer.database.name, layer.table.name, true);
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
